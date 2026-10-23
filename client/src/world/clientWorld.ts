import {
  WORLD_TILES,
  decodeRLE,
  type BuildingDef,
  type ChunkData,
  type DoorDef,
} from '@ashfall/shared';

export interface LoadedChunk {
  data: ChunkData;
  tiles: Uint8Array;
  walls: Uint8Array;
}

export interface ContainerInfo {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
}

export class ClientWorld {
  readonly chunks = new Map<string, LoadedChunk>();
  readonly doors = new Map<string, DoorDef>();
  readonly doorOpen = new Map<string, boolean>();
  readonly buildings = new Map<string, BuildingDef>();
  readonly containers = new Map<string, ContainerInfo>();
  readonly collision = new Uint8Array(WORLD_TILES * WORLD_TILES);

  constructor() {
    this.collision.fill(1);
  }

  key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  loadChunk(data: ChunkData): void {
    const tiles = decodeRLE(data.tiles, 32 * 32);
    const walls = decodeRLE(data.walls, 32 * 32);
    this.chunks.set(this.key(data.cx, data.cy), { data, tiles, walls });
    for (const b of data.buildings) {
      if (!this.buildings.has(b.id)) this.buildings.set(b.id, b);
    }
    for (const d of data.doors) {
      this.doors.set(d.id, d);
      if (!this.doorOpen.has(d.id)) this.doorOpen.set(d.id, d.open);
    }
    for (const c of data.containers) {
      this.containers.set(c.id, { id: c.id, type: c.type, label: c.label, x: c.x, y: c.y });
    }
    this.rebuildCollision();
  }

  unloadChunk(cx: number, cy: number): void {
    const key = this.key(cx, cy);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    this.chunks.delete(key);
    for (const d of chunk.data.doors) this.doors.delete(d.id);
    for (const c of chunk.data.containers) this.containers.delete(c.id);
    this.rebuildCollision();
  }

  setDoor(id: string, open: boolean): void {
    const door = this.doors.get(id);
    if (door) door.open = open;
    this.doorOpen.set(id, open);
    this.rebuildCollision();
  }

  hasChunkAt(x: number, y: number): boolean {
    const cx = Math.floor(x / 32);
    const cy = Math.floor(y / 32);
    return this.chunks.has(this.key(cx, cy));
  }

  tileAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return 0;
    const chunk = this.chunks.get(this.key(Math.floor(tx / 32), Math.floor(ty / 32)));
    if (!chunk) return 0;
    return chunk.tiles[(ty % 32) * 32 + (tx % 32)] ?? 0;
  }

  wallAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return 0;
    const chunk = this.chunks.get(this.key(Math.floor(tx / 32), Math.floor(ty / 32)));
    if (!chunk) return 0;
    return chunk.walls[(ty % 32) * 32 + (tx % 32)] ?? 0;
  }

  buildingAt(x: number, y: number): BuildingDef | null {
    for (const b of this.buildings.values()) {
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b;
    }
    return null;
  }

  nearestDoor(x: number, y: number, range: number): DoorDef | null {
    let best: DoorDef | null = null;
    let bestD = range;
    for (const d of this.doors.values()) {
      const dist = Math.hypot(d.x + 0.5 - x, d.y + 0.5 - y);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  nearestContainer(x: number, y: number, range: number): ContainerInfo | null {
    let best: ContainerInfo | null = null;
    let bestD = range;
    for (const c of this.containers.values()) {
      const dist = Math.hypot(c.x + 0.5 - x, c.y + 0.5 - y);
      if (dist < bestD) {
        bestD = dist;
        best = c;
      }
    }
    return best;
  }

  containerNear(id: string, x: number, y: number, range: number): boolean {
    const c = this.containers.get(id);
    if (!c) return true;
    return Math.hypot(c.x + 0.5 - x, c.y + 0.5 - y) <= range;
  }

  rebuildCollision(): void {
    this.collision.fill(0);
    for (let i = 0; i < this.collision.length; i++) {
      if (this.wallAt(i % WORLD_TILES, Math.floor(i / WORLD_TILES)) !== 0) this.collision[i] = 1;
    }
    for (const chunk of this.chunks.values()) {
      const x0 = chunk.data.cx * 32;
      const y0 = chunk.data.cy * 32;
      for (const p of chunk.data.props) {
        if (!p.blocking) continue;
        for (let y = p.y; y < p.y + p.h; y++) {
          for (let x = p.x; x < p.x + p.w; x++) {
            if (x < 0 || y < 0 || x >= WORLD_TILES || y >= WORLD_TILES) continue;
            this.collision[y * WORLD_TILES + x] = 1;
          }
        }
      }
      for (const d of chunk.data.doors) {
        const open = this.doorOpen.get(d.id) ?? d.open;
        if (!open) this.collision[d.y * WORLD_TILES + d.x] = 1;
      }
    }
    // Borders and unknown space are blocked for local prediction.
    for (let x = 0; x < WORLD_TILES; x++) {
      this.collision[x] = 1;
      this.collision[(WORLD_TILES - 1) * WORLD_TILES + x] = 1;
    }
    for (let y = 0; y < WORLD_TILES; y++) {
      this.collision[y * WORLD_TILES] = 1;
      this.collision[y * WORLD_TILES + WORLD_TILES - 1] = 1;
    }
  }

  allBuildings(): BuildingDef[] {
    return [...this.buildings.values()];
  }
}
