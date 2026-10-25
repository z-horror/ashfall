import {
  CHUNK_TILES,
  CONTAINER_LABELS,
  ITEMS,
  LOOT_TABLES,
  TILE,
  WALL,
  ROAD_CENTERS,
  ROAD_HALF,
  SAFE_ZONE_RADIUS,
  WORLD_CHUNKS,
  WORLD_TILES,
  ZOMBIE_TYPES,
  tileIndex,
  type BuildingDef,
  type ChunkData,
  type DoorDef,
  type PropDef,
} from '@ashfall/shared';
import { encodeRLE } from '@ashfall/shared';

export interface Door {
  id: string;
  x: number;
  y: number;
  open: boolean;
  locked: boolean;
  hp: number;
  facing: 'south' | 'east';
}

export interface Container {
  id: string;
  type: string;
  x: number;
  y: number;
  label: string;
  maxSlots: number;
}

export interface Prop extends PropDef {
  destroyed: boolean;
}

export interface ZombieSpawn {
  id: string;
  type: number;
  x: number;
  y: number;
  hp: number;
}

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class Rng {
  private state: number;
  constructor(seed: number | string) {
    this.state = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const names = {
  apartment: ['Жилой дом «Северный»', 'Дом на Набережной', 'Квартал 7', 'Общежитие №4', 'Дом специалистов', 'Сталинка на Садовой'],
  shop: ['Гастроном', 'Продукты 24', 'Аптека', 'Хозтовары', 'Охота и Оружие', 'Кафе «Заря»', 'Рыболов', 'Универмаг'],
  industrial: ['Складской комплекс', 'Автобаза №3', 'Гаражный кооператив', 'Хладокомбинат', 'Мехмастерские', 'Грузовой терминал'],
  house: ['Частный сектор', 'Дом лесника', 'Усадьба', 'Дача Ковалёва', 'Старый дом'],
};

export class World {
  readonly seed: string;
  readonly tiles = new Uint8Array(WORLD_TILES * WORLD_TILES);
  readonly walls = new Uint8Array(WORLD_TILES * WORLD_TILES);
  readonly buildings: BuildingDef[] = [];
  readonly props: Prop[] = [];
  readonly containers = new Map<string, Container>();
  readonly doors = new Map<string, Door>();
  readonly doorAt = new Map<number, string>();
  readonly spawn = { x: 48.5, y: 48.5 };
  readonly collision = new Uint8Array(WORLD_TILES * WORLD_TILES);
  private readonly baseCollision = new Uint8Array(WORLD_TILES * WORLD_TILES);
  private readonly buildingOcc = new Uint8Array(WORLD_TILES * WORLD_TILES);
  private readonly propOcc = new Uint8Array(WORLD_TILES * WORLD_TILES);
  private readonly clearTiles = new Set<number>();
  private readonly propGrid = new Map<number, Prop[]>();
  private readonly buildingGrid = new Map<number, BuildingDef[]>();
  private propCounter = 0;
  private readonly rng: Rng;

  constructor(seed: string) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.generate();
    this.baseCollision.set(this.collision);
  }

  idx(x: number, y: number): number {
    return tileIndex(x, y);
  }

  buildingAt(x: number, y: number): BuildingDef | null {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    if (!this.inside(fx, fy) || !this.buildingOcc[this.idx(fx, fy)]) return null;
    for (const b of this.buildings) {
      if (fx >= b.x && fx < b.x + b.w && fy >= b.y && fy < b.y + b.h) return b;
    }
    return null;
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < WORLD_TILES && y < WORLD_TILES;
  }

  private isRoadCoord(v: number): boolean {
    return ROAD_CENTERS.some((c) => Math.abs(v - c) <= ROAD_HALF);
  }

  private roadDistance(v: number): number {
    let best = 999;
    for (const c of ROAD_CENTERS) {
      const d = Math.abs(v - c) - ROAD_HALF;
      if (d < best) best = d;
    }
    return best;
  }

  private noise(x: number, y: number): number {
    const h = Math.sin(x * 127.1 + y * 311.7 + hashSeed(this.seed) * 0.0001) * 43758.5453;
    return h - Math.floor(h);
  }

  generate(): void {
    const rng = this.rng;

    for (let y = 0; y < WORLD_TILES; y++) {
      for (let x = 0; x < WORLD_TILES; x++) {
        const road = this.isRoadCoord(x) || this.isRoadCoord(y);
        const nearRoad = this.roadDistance(x) <= 2 || this.roadDistance(y) <= 2;
        let t: number;
        if (road) t = TILE.ASPHALT;
        else if (nearRoad) t = TILE.SIDEWALK;
        else {
          const n = this.noise(x, y);
          t = n < 0.46 ? TILE.GRASS : n < 0.8 ? TILE.DIRT : TILE.CONCRETE;
        }
        this.tiles[this.idx(x, y)] = t;
      }
    }

    // Crosswalk stripes are visual; the client derives them from road adjacency.

    const bands: number[] = [];
    let start = 0;
    for (const c of ROAD_CENTERS) {
      bands.push(start, c - ROAD_HALF - 1);
      start = c + ROAD_HALF + 1;
    }
    bands.push(start, WORLD_TILES - 1);

    const blocks: Rect[] = [];
    for (let i = 0; i < bands.length; i += 2) {
      const x0 = bands[i];
      const x1 = bands[i + 1];
      for (let j = 0; j < bands.length; j += 2) {
        const y0 = bands[j];
        const y1 = bands[j + 1];
        if (x1 - x0 >= 7 && y1 - y0 >= 7) blocks.push({ x0, y0, x1, y1 });
      }
    }

    for (const block of blocks) {
      const sidewalk = 2;
      const lot: Rect = {
        x0: block.x0 + sidewalk,
        y0: block.y0 + sidewalk,
        x1: block.x1 - sidewalk,
        y1: block.y1 - sidewalk,
      };
      if (lot.x1 - lot.x0 < 6 || lot.y1 - lot.y0 < 6) continue;

      const lotRoll = rng.next();
      const lotTile = lotRoll < 0.5 ? TILE.CONCRETE : lotRoll < 0.82 ? TILE.GRASS : TILE.DIRT;
      for (let y = lot.y0; y <= lot.y1; y++) {
        for (let x = lot.x0; x <= lot.x1; x++) {
          this.tiles[this.idx(x, y)] = lotTile;
        }
      }

      const lots: Rect[] = [lot];
      const lw = lot.x1 - lot.x0;
      const lh = lot.y1 - lot.y0;
      if (lw >= 17 && lh >= 17 && rng.chance(0.55)) {
        // Service alley splits the block in two.
        const vertical = rng.chance(0.5);
        if (vertical) {
          const ax = lot.x0 + Math.floor(lw / 2) - 1;
          for (let y = lot.y0; y <= lot.y1; y++) {
            for (let x = ax; x <= ax + 2; x++) this.tiles[this.idx(x, y)] = TILE.ASPHALT;
          }
          lots.length = 0;
          lots.push({ ...lot, x1: ax - 2 }, { ...lot, x0: ax + 4 });
        } else {
          const ay = lot.y0 + Math.floor(lh / 2) - 1;
          for (let x = lot.x0; x <= lot.x1; x++) {
            for (let y = ay; y <= ay + 2; y++) this.tiles[this.idx(x, y)] = TILE.ASPHALT;
          }
          lots.length = 0;
          lots.push({ ...lot, y1: ay - 2 }, { ...lot, y0: ay + 4 });
        }
      }

      for (const sub of lots) {
        this.buildLot(sub);
      }
    }

    this.placeStreetDetails();
    this.placeScatteredDebris();
    this.rebuildCollision();
  }

  private buildLot(lot: Rect): void {
    const rng = this.rng;
    const lw = lot.x1 - lot.x0 + 1;
    const lh = lot.y1 - lot.y0 + 1;
    if (lw < 7 || lh < 6) return;

    if (rng.chance(0.1) || lw < 7 || lh < 6) {
      this.makeVacantLot(lot);
      return;
    }

    const roll = rng.next();
    let placed = 0;
    if (roll < 0.34) {
      const w = Math.min(lw - 3, rng.int(8, 15));
      const h = Math.min(lh - 4, rng.int(6, 10));
      const bx = lot.x0 + 1 + rng.int(0, Math.max(0, lw - w - 2));
      const by = lot.y0 + 1 + rng.int(0, Math.max(0, lh - h - 3));
      placed += this.addBuilding(bx, by, w, h);
      if (lh - h >= 10 && rng.chance(0.5)) {
        const sw = Math.min(6, lw - 3);
        placed += this.addBuilding(lot.x1 - sw - 1, lot.y1 - 5, sw, 4);
      }
    } else if (roll < 0.7) {
      const gap = 2;
      const w1 = Math.floor((lw - 3 - gap) / 2);
      const w2 = lw - 3 - gap - w1;
      const h = Math.min(lh - 4, rng.int(7, 11));
      const by = lot.y0 + 1 + rng.int(0, Math.max(0, lh - h - 3));
      if (w1 >= 6 && w2 >= 6) {
        placed += this.addBuilding(lot.x0 + 1, by, w1, h);
        placed += this.addBuilding(lot.x0 + 1 + w1 + gap, by, w2, h);
        if (lh - h >= 9 && rng.chance(0.45)) {
          placed += this.addBuilding(lot.x0 + 1 + rng.int(0, Math.max(0, lw - 6)), lot.y1 - 5, 5, 4);
        }
      } else {
        placed += this.addBuilding(lot.x0 + 1, lot.y0 + 1, Math.min(lw - 2, 10), Math.min(lh - 3, 8));
      }
    } else {
      const mainW = Math.min(lw - 3, rng.int(9, 13));
      const mainH = Math.min(lh - 4, rng.int(6, 9));
      placed += this.addBuilding(lot.x0 + 1, lot.y0 + 1, mainW, mainH);
      if (lw - mainW >= 9 && lh >= 11) {
        placed += this.addBuilding(lot.x1 - 6, lot.y1 - 6, 5, 5);
      }
    }

    if (placed === 0 && lw >= 6 && lh >= 5) {
      placed += this.addBuilding(lot.x0 + 1, lot.y0 + 1, Math.min(lw - 2, 6), Math.min(lh - 3, 5));
    }
    if (placed === 0) this.makeVacantLot(lot);
    else if (rng.chance(0.25)) this.addParkedCars(lot);
  }

  private makeVacantLot(lot: Rect): void {
    const rng = this.rng;
    const n = rng.int(2, 6);
    for (let i = 0; i < n; i++) {
      const x = rng.int(lot.x0 + 1, lot.x1 - 1);
      const y = rng.int(lot.y0 + 1, lot.y1 - 1);
      if (rng.chance(0.6)) this.placeExterior('tree', x, y, 1, 1, { variant: rng.int(0, 2), blocking: true });
      else this.placeExterior('bush', x, y, 1, 1, { variant: rng.int(0, 2), blocking: true });
    }
    // Broken fence around part of the lot
    for (let x = lot.x0; x <= lot.x1; x++) {
      if (rng.chance(0.55) && !this.clearTiles.has(this.idx(x, lot.y0))) {
        this.placeExterior('fence', x, lot.y0, 1, 1, { variant: 0, blocking: true });
      }
      if (rng.chance(0.55) && !this.clearTiles.has(this.idx(x, lot.y1))) {
        this.placeExterior('fence', x, lot.y1, 1, 1, { variant: 0, blocking: true });
      }
    }
    for (let y = lot.y0; y <= lot.y1; y++) {
      if (rng.chance(0.45)) this.placeExterior('fence', lot.x0, y, 1, 1, { variant: 1, blocking: true });
      if (rng.chance(0.45)) this.placeExterior('fence', lot.x1, y, 1, 1, { variant: 1, blocking: true });
    }
  }

  private addParkedCars(lot: Rect): void {
    const rng = this.rng;
    for (let attempt = 0; attempt < 30; attempt++) {
      const horizontal = rng.chance(0.5);
      const w = horizontal ? 2 : 1;
      const h = horizontal ? 1 : 2;
      const x = rng.int(lot.x0 + 2, lot.x1 - w - 1);
      const y = rng.int(lot.y0 + 2, lot.y1 - h - 1);
      if (this.canPlaceCar(x, y, horizontal, false)) {
        this.addCar(x, y, horizontal, true);
        break; // Only 1 car per lot max
      }
    }
  }

  private canPlaceCar(x: number, y: number, horizontal: boolean, allowRoad: boolean): boolean {
    const w = horizontal ? 2 : 1;
    const h = horizontal ? 1 : 2;
    // Check clearance buffer: 2 tiles in all directions so large visual sprite (208px) never collides
    const margin = 2;
    for (let yy = y - margin; yy < y + h + margin; yy++) {
      for (let xx = x - margin; xx < x + w + margin; xx++) {
        if (!this.inside(xx, yy)) return false;
        const i = this.idx(xx, yy);
        if (this.buildingOcc[i]) return false;
        if (this.propOcc[i]) return false;
        if (this.clearTiles.has(i)) return false;
        if (this.walls[i] !== WALL.NONE) return false;
      }
    }
    // Check footprint ground type
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const i = this.idx(xx, yy);
        if (this.tiles[i] === TILE.ASPHALT && !allowRoad) return false;
        if (this.tiles[i] !== TILE.ASPHALT && allowRoad) return false;
      }
    }
    // Keep cars well away from doors (at least 4 tiles)
    for (const d of this.doors.values()) {
      if (Math.hypot(d.x - x, d.y - y) < 4.5) return false;
    }
    return true;
  }

  private canPlaceRect(x: number, y: number, w: number, h: number, allowRoad: boolean, ignoreBuildings = false): boolean {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (!this.inside(xx, yy)) return false;
        const i = this.idx(xx, yy);
        if (!ignoreBuildings && this.buildingOcc[i]) return false;
        if (this.propOcc[i]) return false;
        if (this.clearTiles.has(i)) return false;
        if ((this.tiles[i] === TILE.ASPHALT || this.walls[i] !== WALL.NONE) && !allowRoad) return false;
      }
    }
    return true;
  }

  private addBuilding(bx: number, by: number, w: number, h: number): number {
    const rng = this.rng;
    if (w < 5 || h < 4) return 0;
    if (bx < 1 || by < 1 || bx + w >= WORLD_TILES - 1 || by + h >= WORLD_TILES - 1) return 0;
    for (let y = by - 1; y <= by + h; y++) {
      for (let x = bx - 1; x <= bx + w; x++) {
        if (this.inside(x, y) && this.buildingOcc[this.idx(x, y)]) return 0;
      }
    }
    const frontSpace = by + h + 1 < WORLD_TILES - 1 && this.inside(bx + Math.floor(w / 2), by + h + 1);
    if (!frontSpace) return 0;

    const style = rng.chance(0.3)
      ? 2
      : rng.chance(0.4)
        ? 0
        : rng.chance(0.5)
          ? 1
          : 3;
    const pool = style === 0 ? names.apartment : style === 1 ? names.shop : style === 2 ? names.industrial : names.house;
    const name = rng.pick(pool);
    const wallMat = style === 2 ? WALL.INDUSTRIAL : style === 1 ? WALL.CONCRETE : WALL.BRICK;
    const floor = style === 1 ? TILE.TILE_FLOOR : style === 2 ? TILE.CONCRETE : TILE.WOOD_FLOOR;

    const id = `b:${bx}:${by}:${this.buildings.length}`;
    for (let y = by; y < by + h; y++) {
      for (let x = bx; x < bx + w; x++) {
        this.buildingOcc[this.idx(x, y)] = 1;
        const isExteriorFoundation = x === bx || y === by;
        if (!isExteriorFoundation) {
          this.tiles[this.idx(x, y)] = floor;
        }
      }
    }

    const doorCandidatesSouth: Array<[number, number]> = [];
    for (let x = bx + 1; x < bx + w - 1; x++) doorCandidatesSouth.push([x, by + h - 1]);
    const doorCandidatesEast: Array<[number, number]> = [];
    for (let y = by + 1; y < by + h - 1; y++) doorCandidatesEast.push([bx + w - 1, y]);

    const doorTiles: Array<{ x: number; y: number }> = [];
    const chooseDoor = (cands: Array<[number, number]>, front: (x: number, y: number) => [number, number]) => {
      const middle = Math.floor(cands.length / 2);
      const ordered = [...cands.slice(middle), ...cands.slice(0, middle)];
      for (const [x, y] of ordered) {
        const [fx, fy] = front(x, y);
        if (!this.inside(fx, fy)) continue;
        const fi = this.idx(fx, fy);
        if (this.buildingOcc[fi] || this.propOcc[fi] || this.walls[fi] !== WALL.NONE) continue;
        return { x, y, fx, fy };
      }
      return null;
    };

    const trySouth = () => {
      const d = chooseDoor(doorCandidatesSouth, (x, y) => [x, y + 1]);
      return d ? { ...d, facing: 'south' as const } : null;
    };
    const tryEast = () => {
      const d = chooseDoor(doorCandidatesEast, (x, y) => [x + 1, y]);
      return d ? { ...d, facing: 'east' as const } : null;
    };

    const useSouth = rng.chance(0.65);
    const chosen = useSouth ? (trySouth() ?? tryEast()) : (tryEast() ?? trySouth());

    for (let y = by; y < by + h; y++) {
      for (let x = bx; x < bx + w; x++) {
        const perimeter = x === bx || y === by || x === bx + w - 1 || y === by + h - 1;
        if (perimeter) this.walls[this.idx(x, y)] = wallMat;
      }
    }

    if (chosen) {
      this.walls[this.idx(chosen.x, chosen.y)] = WALL.NONE;
      this.tiles[this.idx(chosen.x, chosen.y)] = floor;
      doorTiles.push({ x: chosen.x, y: chosen.y });
      const doorId = `d:${chosen.x}:${chosen.y}`;
      this.doors.set(doorId, {
        id: doorId,
        x: chosen.x,
        y: chosen.y,
        open: false,
        locked: false,
        hp: 100,
        facing: chosen.facing,
      });
      this.doorAt.set(this.idx(chosen.x, chosen.y), doorId);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const cx = chosen.x + dx;
          const cy = chosen.y + dy;
          if (this.inside(cx, cy)) this.clearTiles.add(this.idx(cx, cy));
        }
      }
    }

    // Interior partition with a doorway.
    if (w >= 11 && h >= 7 && rng.chance(0.6)) {
      const px = bx + Math.floor(w / 2);
      const gapY = by + 2 + rng.int(0, Math.max(0, h - 4));
      for (let y = by + 1; y < by + h - 1; y++) {
        if (y !== gapY) this.walls[this.idx(px, y)] = WALL.INTERIOR;
      }
    }

    const def: BuildingDef = { id, x: bx, y: by, w, h, style, name, roof: true, doorTiles };
    this.buildings.push(def);
    for (let y = by; y < by + h; y++) {
      for (let x = bx; x < bx + w; x++) {
        const i = this.idx(x, y);
        const list = this.buildingGrid.get(i);
        if (list) list.push(def);
        else this.buildingGrid.set(i, [def]);
      }
    }

    this.furnishBuilding(def, chosen);
    return 1;
  }

  private furnishBuilding(b: BuildingDef, door: { x: number; y: number; fx: number; fy: number } | null): void {
    const rng = this.rng;
    const style = b.style;
    const interior = (x: number, y: number) =>
      x > b.x && x < b.x + b.w - 1 && y > b.y && y < b.y + b.h - 1 && this.walls[this.idx(x, y)] === WALL.NONE;

    const placeContainer = (type: string, x: number, y: number) => {
      if (!interior(x, y)) return;
      if (this.propOcc[this.idx(x, y)]) return;
      if (door && (x === door.x || y === door.y)) return;
      const id = `c:${x}:${y}`;
      const label = CONTAINER_LABELS[type] ?? 'Контейнер';
      const maxSlots = type === 'shelf' ? 16 : type === 'crate' ? 12 : 10;
      this.containers.set(id, { id, type, x, y, label, maxSlots });
      this.placeInterior(type, x, y, { containerId: id, blocking: true, variant: rng.int(0, 2) });
    };
    const placeItem = (type: string, x: number, y: number, blocking = true) => {
      if (!interior(x, y)) return;
      if (this.propOcc[this.idx(x, y)]) return;
      if (door && (x === door.x || y === door.y)) return;
      this.placeInterior(type, x, y, { blocking, variant: rng.int(0, 2) });
    };

    if (style === 0 || style === 3) {
      placeContainer('shelf', b.x + 2, b.y + 1);
      placeContainer('fridge', b.x + 4, b.y + 1);
      if (rng.chance(0.7)) placeContainer('med', b.x + b.w - 2, b.y + 1);
      placeItem('bed', b.x + 1, b.y + b.h - 3);
      placeItem('sofa', b.x + b.w - 2, b.y + b.h - 3);
      if (rng.chance(0.55)) placeItem('table', b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2));
      if (rng.chance(0.4)) placeContainer('crate', b.x + b.w - 3, b.y + 2);
    } else if (style === 1) {
      placeContainer('shelf', b.x + 1, b.y + 1);
      placeContainer('shelf', b.x + 3, b.y + 1);
      placeContainer('fridge', b.x + 5, b.y + 1);
      if (b.w > 9) placeContainer('med', b.x + b.w - 2, b.y + 1);
      placeItem('counter', b.x + 2, b.y + b.h - 3, true);
      placeItem('counter', b.x + 3, b.y + b.h - 3, true);
      if (rng.chance(0.6)) placeContainer('crate', b.x + b.w - 3, b.y + b.h - 3);
    } else {
      placeContainer('crate', b.x + 1, b.y + 1);
      placeContainer('crate', b.x + 3, b.y + 1);
      placeContainer('toolbox', b.x + b.w - 2, b.y + 1);
      placeContainer('shelf', b.x + 1, b.y + b.h - 3);
      if (rng.chance(0.6)) placeItem('barrel', b.x + b.w - 2, b.y + b.h - 3);
      if (rng.chance(0.5)) placeItem('crate', b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2) + 1, true);
    }
  }

  private placeInterior(type: string, x: number, y: number, opts: { containerId?: string; blocking: boolean; variant: number }): void {
    for (let attempt = 0; attempt < 8; attempt++) {
      const px = x + (attempt === 0 ? 0 : this.rng.int(-1, 1));
      const py = y + (attempt === 0 ? 0 : this.rng.int(-1, 1));
      const i = this.idx(px, py);
      if (!this.inside(px, py) || this.propOcc[i] || this.buildingOcc[i] === 0) continue;
      if (this.walls[i] !== WALL.NONE) continue;
      if (this.clearTiles.has(i)) continue;
      this.addProp(type, px, py, 1, 1, {
        variant: opts.variant,
        blocking: opts.blocking,
        containerId: opts.containerId,
      });
      return;
    }
  }

  private placeExterior(
    type: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { variant?: number; blocking?: boolean; containerId?: string; destructible?: boolean; hp?: number; allowRoad?: boolean } = {},
  ): Prop | null {
    const allowRoad = opts.allowRoad ?? false;
    if (!this.canPlaceRect(x, y, w, h, allowRoad)) return null;
    return this.addProp(type, x, y, w, h, {
      variant: opts.variant ?? 0,
      blocking: opts.blocking ?? false,
      containerId: opts.containerId,
      destructible: opts.destructible,
      hp: opts.hp,
    });
  }

  private addProp(
    type: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { variant: number; blocking: boolean; containerId?: string; destructible?: boolean; hp?: number },
  ): Prop {
    const id = `p:${type}:${x}:${y}:${this.propCounter++}`;
    const destructible = opts.destructible ?? ['crate', 'barrel', 'fence', 'trash'].includes(type);
    const hp = opts.hp ?? (destructible ? (type === 'fence' ? 60 : 40) : 100);
    const prop: Prop = {
      id,
      type,
      x,
      y,
      w,
      h,
      variant: opts.variant,
      blocking: opts.blocking,
      destructible,
      hp,
      maxHp: hp,
      containerId: opts.containerId,
      destroyed: false,
    };
    this.props.push(prop);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const i = this.idx(xx, yy);
        this.propOcc[i] = 1;
        const list = this.propGrid.get(i);
        if (list) list.push(prop);
        else this.propGrid.set(i, [prop]);
      }
    }
    return prop;
  }

  private addCar(x: number, y: number, horizontal: boolean, parked: boolean): void {
    const rng = this.rng;
    const w = horizontal ? 2 : 1;
    const h = horizontal ? 1 : 2;
    const id = `c:car:${x}:${y}:${this.propCounter}`;
    const variant = rng.int(0, 3);
    this.containers.set(id, { id, type: 'car', x, y, label: CONTAINER_LABELS.car, maxSlots: 8 });
    this.addProp('car', x, y, w, h, {
      variant: variant + (horizontal ? 0 : 4),
      blocking: true,
      containerId: id,
      destructible: true,
      hp: 120,
    });
    // Reserve margin around car in propOcc so lamps, trees, crates never spawn inside/overlapping it
    for (let yy = Math.max(0, y - 1); yy <= Math.min(WORLD_TILES - 1, y + h); yy++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(WORLD_TILES - 1, x + w); xx++) {
        this.propOcc[this.idx(xx, yy)] = 1;
      }
    }
    if (parked && rng.chance(0.3)) {
      const px = horizontal ? x : x + 0.5;
      const py = horizontal ? y + 0.5 : y;
      this.addProp('debris', Math.floor(px), Math.floor(py), 1, 1, { variant: rng.int(0, 2), blocking: false });
    }
  }

  private placeStreetDetails(): void {
    const rng = this.rng;

    // Abandoned cars on the roads (rare, sparse wrecks).
    for (let lane = 0; lane < ROAD_CENTERS.length; lane++) {
      for (let along = 12; along < WORLD_TILES - 12; along += 24) {
        if (rng.chance(0.18)) {
          const c = ROAD_CENTERS[lane];
          const horizontal = rng.chance(0.5);
          const offset = rng.chance(0.5) ? -2 : 2;
          if (horizontal) {
            const y = c + offset;
            const x = along + rng.int(-2, 2);
            if (!this.isRoadCoord(y) || this.isRoadCoord(x)) continue;
            if (Math.abs(x - this.spawn.x) < 8 && Math.abs(y - this.spawn.y) < 8) continue;
            if (this.canPlaceCar(x, y, true, true)) this.addCar(x, y, true, false);
          } else {
            const x = c + offset;
            const y = along + rng.int(-2, 2);
            if (!this.isRoadCoord(x) || this.isRoadCoord(y)) continue;
            if (Math.abs(x - this.spawn.x) < 8 && Math.abs(y - this.spawn.y) < 8) continue;
            if (this.canPlaceCar(x, y, false, true)) this.addCar(x, y, false, false);
          }
        }
      }
    }

    // Lamps on sidewalks.
    for (let y = 2; y < WORLD_TILES - 2; y++) {
      for (let x = 2; x < WORLD_TILES - 2; x++) {
        const i = this.idx(x, y);
        if (this.tiles[i] !== TILE.SIDEWALK) continue;
        if (this.buildingOcc[i] || this.propOcc[i] || this.clearTiles.has(i)) continue;
        const nearBuilding = this.nearBuilding(x, y, 2);
        if (!nearBuilding && rng.chance(0.012)) {
          this.placeExterior('lamp', x, y, 1, 1, { variant: rng.int(0, 1), blocking: true });
        }
      }
    }

    // Trees on natural grass and dirt (parks, yards, wastelands). Never on concrete sidewalks!
    for (let y = 2; y < WORLD_TILES - 2; y++) {
      for (let x = 2; x < WORLD_TILES - 2; x++) {
        const i = this.idx(x, y);
        if (this.tiles[i] !== TILE.GRASS && this.tiles[i] !== TILE.DIRT) continue;
        if (this.buildingOcc[i] || this.propOcc[i] || this.clearTiles.has(i)) continue;
        const nearBuilding = this.nearBuilding(x, y, 2);
        if (!nearBuilding && rng.chance(0.024)) {
          this.placeExterior('tree', x, y, 1, 1, { variant: rng.int(0, 2), blocking: true });
        }
      }
    }

    // Dumpsters, crates and barrels around the buildings.
    for (const b of this.buildings) {
      const spots: Array<[number, number]> = [
        [b.x - 1, b.y + Math.floor(b.h / 2)],
        [b.x + b.w, b.y + Math.floor(b.h / 2)],
        [b.x + Math.floor(b.w / 2), b.y - 1],
      ];
      for (const [x, y] of spots) {
        if (!this.inside(x, y) || !rng.chance(0.42)) continue;
        const type = rng.chance(0.55) ? 'dumpster' : rng.chance(0.5) ? 'crate' : 'barrel';
        if (type === 'dumpster') {
          const id = `c:dump:${x}:${y}`;
          if (this.containers.has(id)) continue;
          this.containers.set(id, { id, type: 'dumpster', x, y, label: CONTAINER_LABELS.dumpster, maxSlots: 14 });
          this.placeExterior('dumpster', x, y, 1, 1, { containerId: id, blocking: true, variant: rng.int(0, 2) });
        } else {
          this.placeExterior(type, x, y, 1, 1, { blocking: true, variant: rng.int(0, 2), destructible: true });
        }
      }
      // interior clutter is already placed; add some blood outside
      if (rng.chance(0.35)) {
        const bx = b.x + rng.int(0, b.w - 1);
        const by = b.y + b.h + 1;
        this.placeExterior('blood', bx, by, 1, 1, { blocking: false, variant: rng.int(0, 3) });
      }
    }

    // Bushes in yards.
    for (let i = 0; i < 260; i++) {
      const x = rng.int(2, WORLD_TILES - 3);
      const y = rng.int(2, WORLD_TILES - 3);
      if (this.tiles[this.idx(x, y)] !== TILE.GRASS) continue;
      if (this.buildingOcc[this.idx(x, y)]) continue;
      this.placeExterior('bush', x, y, 1, 1, { variant: rng.int(0, 2), blocking: true });
    }
  }

  private placeScatteredDebris(): void {
    const rng = this.rng;
    for (let i = 0; i < 420; i++) {
      const x = rng.int(1, WORLD_TILES - 2);
      const y = rng.int(1, WORLD_TILES - 2);
      const i2 = this.idx(x, y);
      if (this.buildingOcc[i2] || this.propOcc[i2] || this.walls[i2] !== WALL.NONE) continue;
      const tile = this.tiles[i2];
      if (tile !== TILE.ASPHALT && tile !== TILE.SIDEWALK && tile !== TILE.DIRT) continue;
      const type = rng.chance(0.42) ? 'trash' : rng.chance(0.5) ? 'debris' : 'blood';
      this.addProp(type, x, y, 1, 1, { variant: rng.int(0, 3), blocking: false, destructible: type === 'trash' });
    }
  }

  private nearBuilding(x: number, y: number, radius: number): boolean {
    for (let yy = y - radius; yy <= y + radius; yy++) {
      for (let xx = x - radius; xx <= x + radius; xx++) {
        if (this.inside(xx, yy) && this.buildingOcc[this.idx(xx, yy)]) return true;
      }
    }
    return false;
  }

  private rebuildCollision(): void {
    this.collision.fill(0);
    for (let i = 0; i < this.walls.length; i++) {
      if (this.walls[i] !== WALL.NONE) this.collision[i] = 1;
    }
    for (const p of this.props) {
      if (!p.blocking || p.destroyed) continue;
      for (let y = p.y; y < p.y + p.h; y++) {
        for (let x = p.x; x < p.x + p.w; x++) {
          if (this.inside(x, y)) this.collision[this.idx(x, y)] = 1;
        }
      }
    }
    for (const door of this.doors.values()) {
      if (!door.open) this.collision[this.idx(door.x, door.y)] = 1;
    }
    this.baseCollision.set(this.collision);
  }

  applyPersistedState(
    doors: Map<string, { open: boolean; locked: boolean; hp: number }>,
    props: Map<string, { hp: number; destroyed: boolean }>,
  ): void {
    for (const [id, state] of doors) {
      const door = this.doors.get(id);
      if (!door) continue;
      door.open = state.open;
      door.locked = state.locked;
      door.hp = state.hp;
      this.collision[this.idx(door.x, door.y)] = door.open ? 0 : 1;
    }
    for (const [id, state] of props) {
      const prop = this.props.find((p) => p.id === id);
      if (!prop) continue;
      prop.hp = state.hp;
      if (state.destroyed && !prop.destroyed) this.destroyProp(prop, false);
    }
  }

  setDoorOpen(id: string, open: boolean): Door | null {
    const door = this.doors.get(id);
    if (!door || door.locked) return null;
    door.open = open;
    this.collision[this.idx(door.x, door.y)] = open ? 0 : 1;
    return door;
  }

  nearestDoor(x: number, y: number, range: number): Door | null {
    let best: Door | null = null;
    let bestD = range;
    for (const door of this.doors.values()) {
      const d = Math.hypot(door.x + 0.5 - x, door.y + 0.5 - y);
      if (d < bestD) {
        best = door;
        bestD = d;
      }
    }
    return best;
  }

  nearestContainer(x: number, y: number, range: number): Container | null {
    let best: Container | null = null;
    let bestD = range;
    for (const c of this.containers.values()) {
      const d = Math.hypot(c.x + 0.5 - x, c.y + 0.5 - y);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  nearContainer(id: string, x: number, y: number, range: number): Container | null {
    const c = this.containers.get(id);
    if (!c) return null;
    return Math.hypot(c.x + 0.5 - x, c.y + 0.5 - y) <= range ? c : null;
  }

  propAt(x: number, y: number): Prop | null {
    if (!this.inside(Math.floor(x), Math.floor(y))) return null;
    const list = this.propGrid.get(this.idx(Math.floor(x), Math.floor(y)));
    return list?.find((p) => !p.destroyed) ?? null;
  }

  propsInArc(
    x: number,
    y: number,
    aim: number,
    range: number,
    arc: number,
  ): Prop[] {
    const out: Prop[] = [];
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    for (const p of this.props) {
      if (!p.destructible || p.destroyed) continue;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const dx = cx - x;
      const dy = cy - y;
      const d = Math.hypot(dx, dy);
      if (d > range + 0.6) continue;
      if (d > 0.2) {
        const dot = (dx * cos + dy * sin) / d;
        if (Math.acos(Math.min(1, Math.max(-1, dot))) > arc / 2) continue;
      }
      out.push(p);
    }
    return out;
  }

  destroyProp(prop: Prop, persist = true): void {
    if (prop.destroyed) return;
    prop.destroyed = true;
    prop.hp = 0;
    for (let y = prop.y; y < prop.y + prop.h; y++) {
      for (let x = prop.x; x < prop.x + prop.w; x++) {
        if (this.inside(x, y)) this.collision[this.idx(x, y)] = 0;
      }
    }
    if (persist) {
      // persistence handled by simulation via savePropState
    }
  }

  isWalkable(x: number, y: number): boolean {
    if (!this.inside(Math.floor(x), Math.floor(y))) return false;
    return this.collision[this.idx(Math.floor(x), Math.floor(y))] === 0;
  }

  chunkData(cx: number, cy: number): ChunkData {
    const x0 = cx * CHUNK_TILES;
    const y0 = cy * CHUNK_TILES;
    const tileArr = new Uint8Array(CHUNK_TILES * CHUNK_TILES);
    const wallArr = new Uint8Array(CHUNK_TILES * CHUNK_TILES);
    for (let y = 0; y < CHUNK_TILES; y++) {
      for (let x = 0; x < CHUNK_TILES; x++) {
        tileArr[y * CHUNK_TILES + x] = this.tiles[this.idx(x0 + x, y0 + y)];
        wallArr[y * CHUNK_TILES + x] = this.walls[this.idx(x0 + x, y0 + y)];
      }
    }
    const buildings = this.buildings.filter(
      (b) => b.x < x0 + CHUNK_TILES && b.x + b.w > x0 && b.y < y0 + CHUNK_TILES && b.y + b.h > y0,
    );
    const props = this.props.filter(
      (p) =>
        !p.destroyed &&
        p.x >= x0 &&
        p.x < x0 + CHUNK_TILES &&
        p.y >= y0 &&
        p.y < y0 + CHUNK_TILES,
    );
    const doors: DoorDef[] = [];
    for (const d of this.doors.values()) {
      if (d.x >= x0 && d.x < x0 + CHUNK_TILES && d.y >= y0 && d.y < y0 + CHUNK_TILES) {
        doors.push({ id: d.id, x: d.x, y: d.y, open: d.open, locked: d.locked, hp: d.hp, facing: d.facing });
      }
    }
    const containers: ChunkData['containers'] = [];
    for (const c of this.containers.values()) {
      if (c.x >= x0 && c.x < x0 + CHUNK_TILES && c.y >= y0 && c.y < y0 + CHUNK_TILES) {
        containers.push({ id: c.id, type: c.type, x: c.x, y: c.y, label: c.label });
      }
    }
    return {
      cx,
      cy,
      tiles: encodeRLE(tileArr),
      walls: encodeRLE(wallArr),
      buildings: buildings.map((b) => ({ ...b })),
      props: props.map((p) => ({
        id: p.id,
        type: p.type,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        variant: p.variant,
        blocking: p.blocking,
        destructible: p.destructible,
        hp: p.hp,
        maxHp: p.maxHp,
        containerId: p.containerId,
      })),
      doors,
      containers,
    };
  }

  containerAtTile(x: number, y: number): Container | null {
    for (const c of this.containers.values()) {
      if (c.x === x && c.y === y) return c;
    }
    return null;
  }

  initialZombies(cx: number, cy: number): ZombieSpawn[] {
    const rng = new Rng(`${this.seed}:zombies:${cx}:${cy}`);
    const count = 5 + rng.int(0, 6);
    const out: ZombieSpawn[] = [];
    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 70; attempt++) {
        const x = cx * CHUNK_TILES + rng.float(1.5, CHUNK_TILES - 1.5);
        const y = cy * CHUNK_TILES + rng.float(1.5, CHUNK_TILES - 1.5);
        if (Math.hypot(x - this.spawn.x, y - this.spawn.y) < SAFE_ZONE_RADIUS + 5) continue;
        if (!this.isWalkable(x, y)) continue;
        const roll = rng.next();
        const type = roll < 0.68 ? 0 : roll < 0.92 ? 1 : 2;
        const def = ZOMBIE_TYPES[type];
        out.push({ id: `z:${cx}:${cy}:${i}`, type, x, y, hp: def.hp });
        placed = true;
        break;
      }
      if (!placed) continue;
    }
    return out;
  }

  rollContainerLoot(container: Container): Array<{ key: string; qty: number }> {
    const rng = new Rng(`${this.seed}:loot:${container.id}`);
    const table = LOOT_TABLES[container.type] ?? LOOT_TABLES.crate;
    const rolls = rng.int(1, 3) + (container.type === 'shelf' ? 1 : 0);
    const out: Array<{ key: string; qty: number }> = [];
    for (let i = 0; i < rolls; i++) {
      const total = table.reduce((s, e) => s + e[3], 0);
      let roll = rng.float(0, total);
      let picked: [string, number, number, number] = table[0];
      for (const entry of table) {
        roll -= entry[3];
        if (roll <= 0) {
          picked = entry;
          break;
        }
      }
      const qty = rng.int(picked[1], picked[2]);
      if (ITEMS[picked[0]]) out.push({ key: picked[0], qty });
    }
    return out;
  }

  chunkCoords(): Array<[number, number]> {
    const arr: Array<[number, number]> = [];
    for (let cy = 0; cy < WORLD_CHUNKS; cy++) for (let cx = 0; cx < WORLD_CHUNKS; cx++) arr.push([cx, cy]);
    return arr;
  }
}
