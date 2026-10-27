import {
  CHUNK_TILES,
  CONTAINER_LABELS,
  ITEMS,
  LOOT_TABLES,
  OBJECT_TEMPLATES,
  PLAYER_RADIUS,
  ROAD_CENTERS,
  ROAD_HALF,
  SAFE_ZONE_RADIUS,
  TILE,
  WORLD_CHUNKS,
  WORLD_TILES,
  buildFloorCollision,
  buildRoomGeometry,
  circleHits,
  createGrid,
  encodeRLE,
  type BuildingSpec,
  type CollisionGrid,
  type ContainerInfo,
  type DoorState,
  type FloorSpec,
  type ObjectInstance,
  type ObjectState,
  type OpeningStateSnapshot,
  type PropDef,
  type RoomGeometry,
  type RoomSpec,
  type TileRect,
  type WallRun,
  type WindowState,
  type ChunkData,
} from '@ashfall/shared';
import type { StairSpec } from '@ashfall/shared';
import {
  TEST_BUILDING,
  TEST_BUILDING_ID,
  TEST_BUILDING_SEED,
  TEST_OBJECTS,
  TEST_OPENING_STATES,
  TEST_SPAWN,
  createInitialObjectStates,
} from './buildings/testBuilding.js';

export interface Door {
  id: string;
  x: number;
  y: number;
  cx?: number;
  cy?: number;
  floor: number;
  open: boolean;
  locked: boolean;
  hp: number;
  facing: 'south' | 'east' | 'north' | 'west';
}

export interface Container {
  id: string;
  type: string;
  x: number;
  y: number;
  floor: number;
  buildingId: string;
  roomId: string;
  objectId: string;
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
  floor: number;
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

function noise(seed: string, x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + hashSeed(seed) * 0.0001) * 43758.5453;
  return h - Math.floor(h);
}

function isRoadCoord(v: number): boolean {
  return ROAD_CENTERS.some((c) => Math.abs(v - c) <= ROAD_HALF);
}

function roadDistance(v: number): number {
  let best = 999;
  for (const c of ROAD_CENTERS) best = Math.min(best, Math.abs(v - c) - ROAD_HALF);
  return best;
}

function rectCells(rect: TileRect): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) out.push({ x, y });
  }
  return out;
}

function floorElevation(floor: FloorSpec): number {
  return floor.elevationM;
}

export class World {
  readonly seed: string;
  readonly tiles = new Uint8Array(WORLD_TILES * WORLD_TILES);
  readonly walls = new Uint8Array(WORLD_TILES * WORLD_TILES);
  readonly buildings: BuildingSpec[] = [];
  readonly objects: ObjectInstance[] = [];
  readonly props: Prop[] = [];
  readonly containers = new Map<string, Container>();
  readonly doors = new Map<string, Door>();
  readonly windows = new Map<string, WindowState>();
  readonly objectStates = new Map<string, ObjectState>();
  readonly spawn = { ...TEST_SPAWN };
  readonly collision = new Uint8Array(WORLD_TILES * WORLD_TILES);
  private readonly collisionGrids = new Map<number, CollisionGrid>();
  private readonly roomGeometry = new Map<string, RoomGeometry>();
  private readonly buildingById = new Map<string, BuildingSpec>();
  private readonly objectById = new Map<string, ObjectInstance>();
  private readonly doorsByFloor = new Map<number, Door[]>();
  private readonly stairsByFloor = new Map<number, StairSpec[]>();

  constructor(seed: string) {
    this.seed = seed;
    this.generateGround();
    this.buildings.push(TEST_BUILDING);
    this.buildingById.set(TEST_BUILDING.id, TEST_BUILDING);
    for (const object of TEST_OBJECTS) {
      this.objects.push(object);
      this.objectById.set(object.id, object);
    }
    for (const state of createInitialObjectStates()) this.objectStates.set(state.objectId, state);

    for (const floor of TEST_BUILDING.floors) {
      this.stairsByFloor.set(floor.level, floor.stairs);
      for (const room of floor.rooms) {
        this.roomGeometry.set(room.id, buildRoomGeometry(room));
      }
      for (const opening of floor.openings) {
        if (opening.kind === 'door') {
          const run = floor.wallRuns.find((candidate) => candidate.id === opening.wallRunId)!;
          const center = openingCenter(run, opening);
          const door: Door = {
            id: opening.id,
            x: Math.floor(center.x),
            y: Math.floor(center.y),
            cx: center.x,
            cy: center.y,
            floor: floor.level,
            open: findDoorState(opening.id)?.open ?? false,
            locked: findDoorState(opening.id)?.locked ?? false,
            hp: findDoorState(opening.id)?.hp ?? 100,
            facing: run.axis === 'h' ? 'south' : 'east',
          };
          this.doors.set(door.id, door);
          const list = this.doorsByFloor.get(floor.level) ?? [];
          list.push(door);
          this.doorsByFloor.set(floor.level, list);
        }
        if (opening.kind === 'window') {
          const state = TEST_OPENING_STATES.windows.find((candidate) => candidate.openingId === opening.id);
          if (state) this.windows.set(state.openingId, state);
        }
      }
    }

    this.createContainers();
    this.rebuildCollision();
  }

  private generateGround(): void {
    for (let y = 0; y < WORLD_TILES; y++) {
      for (let x = 0; x < WORLD_TILES; x++) {
        const road = isRoadCoord(x) || isRoadCoord(y);
        const nearRoad = roadDistance(x) <= 2 || roadDistance(y) <= 2;
        const n = noise(this.seed, x, y);
        this.tiles[y * WORLD_TILES + x] = road
          ? TILE.ASPHALT
          : nearRoad
            ? TILE.SIDEWALK
            : n < 0.5
              ? TILE.GRASS
              : n < 0.8
                ? TILE.DIRT
                : TILE.CONCRETE;
      }
    }
  }

  private createContainers(): void {
    for (const object of this.objects) {
      if (!object.containerId) continue;
      const template = OBJECT_TEMPLATES[object.templateId];
      const behavior = template?.behaviors?.find((entry) => entry.type === 'container');
      if (!behavior || object.placement.mount !== 'floor') continue;
      const { x, y } = object.placement;
      this.containers.set(object.containerId, {
        id: object.containerId,
        type: behavior.containerType ?? 'crate',
        x,
        y,
        floor: object.level,
        buildingId: object.buildingId,
        roomId: object.roomId,
        objectId: object.id,
        label: CONTAINER_LABELS[behavior.containerType ?? ''] ?? template?.name ?? 'Контейнер',
        maxSlots: behavior.maxSlots ?? 10,
      });
    }
  }

  idx(x: number, y: number): number {
    return y * WORLD_TILES + x;
  }

  get collisionGrid(): CollisionGrid {
    return this.getCollisionGrid(0);
  }

  getCollisionGrid(level: number): CollisionGrid {
    return this.collisionGrids.get(level) ?? createGrid(WORLD_TILES, WORLD_TILES, 8);
  }

  getFloor(level: number): FloorSpec | undefined {
    return this.buildings.flatMap((building) => building.floors).find((floor) => floor.level === level);
  }

  getRooms(level: number): RoomSpec[] {
    return this.buildings.flatMap((building) => building.floors).find((floor) => floor.level === level)?.rooms ?? [];
  }

  getRoomGeometry(roomId: string): RoomGeometry | undefined {
    return this.roomGeometry.get(roomId);
  }

  buildingAt(x: number, y: number, level = 0): BuildingSpec | null {
    for (const building of this.buildings) {
      const floor = building.floors.find((candidate) => candidate.level === level);
      if (!floor) continue;
      for (const room of floor.rooms) {
        if (this.roomGeometry.get(room.id) && this.roomContains(room.id, x, y)) return building;
      }
    }
    return null;
  }

  roomAt(x: number, y: number, level = 0): RoomSpec | null {
    for (const building of this.buildings) {
      const floor = building.floors.find((candidate) => candidate.level === level);
      if (!floor) continue;
      for (const room of floor.rooms) if (this.roomContains(room.id, x, y)) return room;
    }
    return null;
  }

  roomContains(roomId: string, x: number, y: number): boolean {
    const geometry = this.roomGeometry.get(roomId);
    if (!geometry) return false;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const lx = ix - geometry.bounds.x;
    const ly = iy - geometry.bounds.y;
    if (lx < 0 || ly < 0 || lx >= geometry.bounds.w || ly >= geometry.bounds.h) return false;
    return geometry.mask[ly * geometry.bounds.w + lx] === 1;
  }

  isWalkable(x: number, y: number, level = 0): boolean {
    if (x < 0 || y < 0 || x >= WORLD_TILES || y >= WORLD_TILES) return false;
    return !circleHits(this.getCollisionGrid(level), x, y, PLAYER_RADIUS);
  }

  private rebuildCollision(): void {
    this.collision.fill(0);
    for (const floor of this.buildings.flatMap((building) => building.floors)) {
      const grid = buildFloorCollision(floor, this.getOpeningStates(), this.objects, OBJECT_TEMPLATES, this.getObjectStateRecord());
      this.collisionGrids.set(floor.level, grid);
      if (floor.level === 0) {
        for (let y = 0; y < WORLD_TILES; y++) {
          for (let x = 0; x < WORLD_TILES; x++) {
            if (!circleHits(grid, x + 0.5, y + 0.5, PLAYER_RADIUS)) this.collision[y * WORLD_TILES + x] = 0;
            else this.collision[y * WORLD_TILES + x] = 1;
          }
        }
      }
    }
    for (const door of this.doors.values()) this.collision[this.idx(door.x, door.y)] = door.open && !door.locked ? 0 : 1;
  }

  getObjectStateRecord(): Record<string, ObjectState> {
    return Object.fromEntries(this.objectStates);
  }

  getOpeningStates(): OpeningStateSnapshot {
    return {
      doors: [...this.doors.values()].map((door) => ({
        openingId: door.id,
        open: door.open,
        locked: door.locked,
        hp: door.hp,
        revision: 0,
      })),
      windows: [...this.windows.values()],
    };
  }

  applyPersistedState(
    doors: Map<string, { open: boolean; locked: boolean; hp: number }>,
    _props: Map<string, { hp: number; destroyed: boolean }>,
    windows?: Map<string, { broken: boolean; boarded: boolean; hp: number }>,
    objects?: Map<string, { open: boolean; broken: boolean; destroyed: boolean; hp: number; on: boolean }>,
  ): void {
    for (const [id, state] of doors) {
      const door = this.doors.get(id);
      if (!door) continue;
      door.open = state.locked ? false : state.open;
      door.locked = state.locked;
      door.hp = state.hp;
    }
    if (windows) {
      for (const [id, state] of windows) {
        const window = this.windows.get(id);
        if (!window) continue;
        window.broken = state.broken;
        window.boarded = state.boarded;
        window.hp = state.hp;
      }
    }
    if (objects) {
      for (const [id, state] of objects) {
        const current = this.objectStates.get(id);
        if (!current) continue;
        Object.assign(current, state);
      }
    }
    this.rebuildCollision();
  }

  setDoorOpen(id: string, open: boolean): Door | null {
    const door = this.doors.get(id);
    if (!door || door.locked) return null;
    door.open = open;
    this.rebuildCollision();
    return door;
  }

  setWindowState(id: string, state: Partial<WindowState>): WindowState | null {
    const window = this.windows.get(id);
    if (!window) return null;
    Object.assign(window, state, { revision: window.revision + 1 });
    this.rebuildCollision();
    return window;
  }

  setObjectState(id: string, state: Partial<ObjectState>): ObjectState | null {
    const current = this.objectStates.get(id);
    if (!current) return null;
    Object.assign(current, state, { revision: current.revision + 1 });
    this.rebuildCollision();
    return current;
  }

  getObject(id: string): ObjectInstance | undefined {
    return this.objectById.get(id);
  }

  nearestDoor(x: number, y: number, range: number, level = 0): Door | null {
    let best: Door | null = null;
    let bestD = range;
    for (const door of this.doorsByFloor.get(level) ?? []) {
      const d = Math.hypot((door.cx ?? door.x + 0.5) - x, (door.cy ?? door.y + 0.5) - y);
      if (d < bestD) {
        best = door;
        bestD = d;
      }
    }
    return best;
  }

  nearestContainer(x: number, y: number, range: number, level = 0): Container | null {
    let best: Container | null = null;
    let bestD = range;
    for (const container of this.containers.values()) {
      if (container.floor !== level) continue;
      const d = Math.hypot(container.x - x, container.y - y);
      if (d < bestD) {
        best = container;
        bestD = d;
      }
    }
    return best;
  }

  nearContainer(id: string, x: number, y: number, range: number): Container | null {
    const container = this.containers.get(id);
    if (!container) return null;
    return Math.hypot(container.x - x, container.y - y) <= range ? container : null;
  }

  nearestStair(x: number, y: number, level = 0): StairSpec | null {
    for (const stair of this.stairsByFloor.get(level) ?? []) {
      if (
        x >= stair.entry.x &&
        x < stair.entry.x + stair.entry.w &&
        y >= stair.entry.y &&
        y < stair.entry.y + stair.entry.h
      ) {
        return stair;
      }
    }
    return null;
  }

  propAt(_x: number, _y: number): Prop | null {
    return null;
  }

  propsInArc(_x: number, _y: number, _aim: number, _range: number, _arc: number): Prop[] {
    return [];
  }

  destroyProp(_prop: Prop, _persist = true): void {}

  containerAtTile(_x: number, _y: number): Container | null {
    return null;
  }

  chunkData(cx: number, cy: number): ChunkData {
    const x0 = cx * CHUNK_TILES;
    const y0 = cy * CHUNK_TILES;
    const tileArr = new Uint8Array(CHUNK_TILES * CHUNK_TILES);
    for (let y = 0; y < CHUNK_TILES; y++) {
      for (let x = 0; x < CHUNK_TILES; x++) tileArr[y * CHUNK_TILES + x] = this.tiles[this.idx(x0 + x, y0 + y)];
    }
    const buildings = this.buildings.filter(
      (building) =>
        building.floors.some((floor) =>
          floor.rooms.some((room) =>
            room.rects.some(
              (rect) =>
                rect.x < x0 + CHUNK_TILES &&
                rect.x + rect.w > x0 &&
                rect.y < y0 + CHUNK_TILES &&
                rect.y + rect.h > y0,
            ),
          ),
        ),
    );
    const buildingIds = new Set(buildings.map((building) => building.id));
    const objects = this.objects.filter((object) => buildingIds.has(object.buildingId));
    const objectIds = new Set(objects.map((object) => object.id));
    const containers: ContainerInfo[] = [...this.containers.values()]
      .filter((container) => buildingIds.has(container.buildingId))
      .map((container) => ({ ...container }));
    const openingStates = buildings.map((building) => this.getOpeningStatesForBuilding(building));
    return {
      cx,
      cy,
      tiles: encodeRLE(tileArr),
      buildings,
      objects,
      objectStates: this.objects.filter((object) => objectIds.has(object.id)).map((object) => this.objectStates.get(object.id)!).filter(Boolean),
      openingStates,
      props: this.props.filter((prop) => prop.x >= x0 && prop.x < x0 + CHUNK_TILES && prop.y >= y0 && prop.y < y0 + CHUNK_TILES),
      containers,
    };
  }

  private getOpeningStatesForBuilding(building: BuildingSpec): OpeningStateSnapshot {
    const ids = new Set(building.floors.flatMap((floor) => floor.openings.map((opening) => opening.id)));
    return {
      doors: [...this.doors.values()]
        .filter((door) => ids.has(door.id))
        .map((door) => ({ openingId: door.id, open: door.open, locked: door.locked, hp: door.hp, revision: 0 })),
      windows: [...this.windows.values()].filter((window) => ids.has(window.openingId)),
    };
  }

  initialZombies(cx: number, cy: number): ZombieSpawn[] {
    const out: ZombieSpawn[] = [];
    const count = 4;
    for (let i = 0; i < count; i++) {
      const x = cx * CHUNK_TILES + 6 + i * 5;
      const y = cy * CHUNK_TILES + 20 + (i % 2) * 4;
      if (Math.hypot(x - this.spawn.x, y - this.spawn.y) < SAFE_ZONE_RADIUS + 4) continue;
      if (!this.isWalkable(x, y, 0)) continue;
      out.push({ id: `z:${cx}:${cy}:${i}`, type: i % 3, x, y, floor: 0, hp: [58, 44, 115][i % 3] });
    }
    return out;
  }

  rollContainerLoot(container: Container): Array<{ key: string; qty: number }> {
    const table = LOOT_TABLES[container.type] ?? LOOT_TABLES.crate;
    return table
      .filter(([key]) => Boolean(ITEMS[key]))
      .slice(0, 2)
      .map(([key, min, max]) => ({ key, qty: min + Math.floor(Math.random() * (max - min + 1)) }));
  }

  chunkCoords(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let cy = 0; cy < WORLD_CHUNKS; cy++) for (let cx = 0; cx < WORLD_CHUNKS; cx++) out.push([cx, cy]);
    return out;
  }
}

function findDoorState(id: string): DoorState | undefined {
  return TEST_OPENING_STATES.doors.find((door) => door.openingId === id);
}

function openingCenter(run: WallRun, opening: { startM: number; widthM: number }): { x: number; y: number } {
  const distance = (opening.startM + opening.widthM / 2) / 1.6;
  return run.axis === 'h' ? { x: run.from + distance, y: run.fixed } : { x: run.fixed, y: run.from + distance };
}

// Kept for callers that still use the old helper.
export function isTestWorldSeed(seed: string): boolean {
  return seed === TEST_BUILDING_SEED;
}

export { TEST_BUILDING_ID, TEST_BUILDING_SEED };

// Avoid unused import warning for locals used by older tooling.
void rectCells;
void floorElevation;
void TEST_BUILDING_ID;
