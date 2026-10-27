import {
  OBJECT_TEMPLATES,
  WORLD_TILES,
  buildFloorCollision,
  buildRoomGeometry,
  decodeRLE,
  openingCenter,
  createGrid,
  type BuildingSpec,
  type ChunkData,
  type CollisionGrid,
  type ContainerInfo,
  type DoorState,
  type FloorSpec,
  type ObjectInstance,
  type ObjectState,
  type OpeningStateSnapshot,
  type RoomGeometry,
  type RoomSpec,
  type WindowState,
} from '@ashfall/shared';

export interface LoadedChunk {
  data: ChunkData;
  tiles: Uint8Array;
}

export interface ClientDoor {
  id: string;
  x: number;
  y: number;
  floor: number;
  open: boolean;
  locked: boolean;
  hp: number;
  facing: 'south' | 'east' | 'north' | 'west';
}

export class ClientWorld {
  readonly chunks = new Map<string, LoadedChunk>();
  readonly doors = new Map<string, ClientDoor>();
  readonly doorOpen = new Map<string, boolean>();
  readonly windows = new Map<string, WindowState>();
  readonly buildings = new Map<string, BuildingSpec>();
  readonly objects = new Map<string, ObjectInstance>();
  readonly objectStates = new Map<string, ObjectState>();
  readonly containers = new Map<string, ContainerInfo>();
  readonly rooms = new Map<string, RoomGeometry>();
  private readonly collisionGrids = new Map<number, CollisionGrid>();

  constructor() {
    this.collisionGrids.set(0, createGrid(WORLD_TILES, WORLD_TILES, 8));
  }

  key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  get collisionGrid(): CollisionGrid {
    return this.getCollisionGrid(0);
  }

  getCollisionGrid(level: number): CollisionGrid {
    return this.collisionGrids.get(level) ?? createGrid(WORLD_TILES, WORLD_TILES, 8);
  }

  loadChunk(data: ChunkData): void {
    const tiles = decodeRLE(data.tiles, 32 * 32);
    this.chunks.set(this.key(data.cx, data.cy), { data, tiles });
    this.rebuildFromChunks();
  }

  unloadChunk(cx: number, cy: number): void {
    this.chunks.delete(this.key(cx, cy));
    this.rebuildFromChunks();
  }

  private rebuildFromChunks(): void {
    this.buildings.clear();
    this.objects.clear();
    this.objectStates.clear();
    this.containers.clear();
    this.rooms.clear();
    this.doors.clear();
    this.windows.clear();
    const openingStates = new Map<string, OpeningStateSnapshot>();

    for (const chunk of this.chunks.values()) {
      for (const building of chunk.data.buildings) this.buildings.set(building.id, building);
      for (const object of chunk.data.objects) this.objects.set(object.id, object);
      for (const state of chunk.data.objectStates) this.objectStates.set(state.objectId, state);
      for (const container of chunk.data.containers) this.containers.set(container.id, container);
      for (const states of chunk.data.openingStates) {
        for (const door of states.doors) {
          const current = openingStates.get(door.openingId);
          const doors = current ? current.doors.filter((entry) => entry.openingId !== door.openingId) : [];
          const windows = current?.windows ?? [];
          openingStates.set(door.openingId, { doors: [...doors, door], windows });
        }
        for (const window of states.windows) {
          const current = openingStates.get(window.openingId);
          const doors = current?.doors ?? [];
          const windows = current ? current.windows.filter((entry) => entry.openingId !== window.openingId) : [];
          openingStates.set(window.openingId, { doors, windows: [...windows, window] });
        }
      }
    }

    for (const building of this.buildings.values()) {
      for (const floor of building.floors) {
        for (const room of floor.rooms) {
          try {
            this.rooms.set(room.id, buildRoomGeometry(room));
          } catch {
            /* invalid rooms are rejected by the server */
          }
        }
        for (const opening of floor.openings) {
          if (opening.kind === 'window') {
            const state = [...openingStates.values()].flatMap((entry) => entry.windows).find((entry) => entry.openingId === opening.id);
            if (state) this.windows.set(state.openingId, state);
          }
        }
      }
    }

    this.rebuildDoors(openingStates);
    this.rebuildCollision(this.openingSnapshot());
  }

  private rebuildDoors(openingStates: Map<string, OpeningStateSnapshot>): void {
    for (const building of this.buildings.values()) {
      for (const floor of building.floors) {
        for (const opening of floor.openings) {
          if (opening.kind !== 'door') continue;
          const wall = floor.wallRuns.find((run) => run.id === opening.wallRunId);
          if (!wall) continue;
          const center = openingCenter(wall, opening);
          const state = [...openingStates.values()].flatMap((entry) => entry.doors).find((entry) => entry.openingId === opening.id);
          const door: ClientDoor = {
            id: opening.id,
            x: Math.floor(center.x),
            y: Math.floor(center.y),
            floor: floor.level,
            open: state?.open ?? false,
            locked: state?.locked ?? false,
            hp: state?.hp ?? 100,
            facing: wall.axis === 'h' ? 'south' : 'east',
          };
          this.doors.set(door.id, door);
          this.doorOpen.set(door.id, door.open);
        }
      }
    }
  }

  private openingSnapshot(): OpeningStateSnapshot {
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

  private rebuildCollision(openingStates = this.openingSnapshot()): void {
    this.collisionGrids.clear();
    const stateRecord = Object.fromEntries(this.objectStates);
    for (const building of this.buildings.values()) {
      for (const floor of building.floors) {
        const objects = [...this.objects.values()].filter((object) => object.buildingId === building.id && object.level === floor.level);
        this.collisionGrids.set(floor.level, buildFloorCollision(floor, openingStates, objects, OBJECT_TEMPLATES, stateRecord));
      }
    }
  }

  setDoor(id: string, open: boolean): void {
    const door = this.doors.get(id);
    if (!door || door.locked) return;
    door.open = open;
    this.doorOpen.set(id, open);
    this.rebuildCollision();
  }

  setWindowState(id: string, state: Partial<WindowState>): void {
    const window = this.windows.get(id);
    if (!window) return;
    Object.assign(window, state);
    this.rebuildCollision();
  }

  setObjectState(id: string, state: Partial<ObjectState>): void {
    const current = this.objectStates.get(id);
    if (!current) return;
    Object.assign(current, state);
    this.rebuildCollision();
  }

  getFloor(level: number): FloorSpec | undefined {
    for (const building of this.buildings.values()) {
      const floor = building.floors.find((candidate) => candidate.level === level);
      if (floor) return floor;
    }
    return undefined;
  }

  roomAt(x: number, y: number, level = 0): RoomSpec | null {
    for (const building of this.buildings.values()) {
      const floor = building.floors.find((candidate) => candidate.level === level);
      if (!floor) continue;
      for (const room of floor.rooms) {
        const geometry = this.rooms.get(room.id);
        if (!geometry) continue;
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const lx = ix - geometry.bounds.x;
        const ly = iy - geometry.bounds.y;
        if (lx >= 0 && ly >= 0 && lx < geometry.bounds.w && ly < geometry.bounds.h && geometry.mask[ly * geometry.bounds.w + lx]) return room;
      }
    }
    return null;
  }

  buildingAt(x: number, y: number, level = 0): BuildingSpec | null {
    for (const building of this.buildings.values()) {
      const floor = building.floors.find((candidate) => candidate.level === level);
      if (!floor) continue;
      for (const room of floor.rooms) {
        const geometry = this.rooms.get(room.id);
        if (!geometry) continue;
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const lx = ix - geometry.bounds.x;
        const ly = iy - geometry.bounds.y;
        if (lx >= 0 && ly >= 0 && lx < geometry.bounds.w && ly < geometry.bounds.h && geometry.mask[ly * geometry.bounds.w + lx]) return building;
      }
    }
    return null;
  }

  nearestDoor(x: number, y: number, range: number, level = 0): ClientDoor | null {
    let best: ClientDoor | null = null;
    let bestD = range;
    for (const door of this.doors.values()) {
      if (door.floor !== level) continue;
      const d = Math.hypot(door.x + 0.5 - x, door.y + 0.5 - y);
      if (d < bestD) {
        bestD = d;
        best = door;
      }
    }
    return best;
  }

  nearestContainer(x: number, y: number, range: number, level = 0): ContainerInfo | null {
    let best: ContainerInfo | null = null;
    let bestD = range;
    for (const container of this.containers.values()) {
      if (container.floor !== level) continue;
      const d = Math.hypot(container.x - x, container.y - y);
      if (d < bestD) {
        bestD = d;
        best = container;
      }
    }
    return best;
  }

  containerNear(id: string, x: number, y: number, range: number): boolean {
    const container = this.containers.get(id);
    if (!container) return true;
    return Math.hypot(container.x - x, container.y - y) <= range;
  }

  nearestStair(x: number, y: number, level = 0) {
    for (const building of this.buildings.values()) {
      for (const floor of building.floors) {
        if (floor.level !== level) continue;
        for (const stair of floor.stairs) {
          if (x >= stair.entry.x && x < stair.entry.x + stair.entry.w && y >= stair.entry.y && y < stair.entry.y + stair.entry.h) return stair;
        }
      }
    }
    return null;
  }

  tileAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return 0;
    const chunk = this.chunks.get(this.key(Math.floor(tx / 32), Math.floor(ty / 32)));
    if (!chunk) return 0;
    return chunk.tiles[(ty % 32) * 32 + (tx % 32)] ?? 0;
  }

  allBuildings(): BuildingSpec[] {
    return [...this.buildings.values()];
  }
}
