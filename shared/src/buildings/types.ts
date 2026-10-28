import type { TileRect, Vec2 } from '../geometry/units.js';

export type FloorIndex = number;
export type WallMaterial = 'brick' | 'concrete' | 'industrial' | 'interior';
export type OpeningKind = 'door' | 'window' | 'arch';

export interface WallRun {
  id: string;
  level: FloorIndex;
  axis: 'h' | 'v';
  fixed: number;
  from: number;
  to: number;
  material: WallMaterial;
  thicknessM: number;
  heightM: number;
}

export interface OpeningSpec {
  id: string;
  wallRunId: string;
  kind: OpeningKind;
  startM: number;
  widthM: number;
  sillM: number;
  heightM: number;
}

export interface SurfaceSpec {
  cells: TileRect[];
  material: string;
  thicknessM: number;
  holes?: TileRect[];
}

export interface RoofSpec {
  cells: TileRect[];
  material: string;
  thicknessM: number;
  parapetM: number;
}

export interface StairSpec {
  id: string;
  fromLevel: FloorIndex;
  toLevel: FloorIndex;
  entry: TileRect;
  exit: TileRect;
  hole: TileRect;
  direction: 'up' | 'down';
  widthM: number;
  riseM: number;
  treadM: number;
  steps: number;
}

export type RoomKind =
  | 'bedroom'
  | 'living'
  | 'kitchen'
  | 'bathroom'
  | 'corridor'
  | 'office'
  | 'shop'
  | 'warehouse'
  | 'storage'
  | 'utility'
  | 'empty';

export interface RoomSpec {
  id: string;
  level: FloorIndex;
  kind: RoomKind;
  rects: TileRect[];
  holes?: TileRect[];
  reservedZones: TileRect[];
  compositionIds?: string[];
  tags?: string[];
}

export interface RoomGeometry {
  roomId: string;
  level: FloorIndex;
  bounds: TileRect;
  mask: Uint8Array;
  cells: Vec2[];
  accessPoints: RoomAccessPoint[];
}

export interface RoomAccessPoint {
  kind: 'door' | 'arch' | 'stair';
  id: string;
  x: number;
  y: number;
  targetLevel?: FloorIndex;
}

export interface FloorSpec {
  level: FloorIndex;
  elevationM: number;
  clearHeightM: number;
  floor: SurfaceSpec;
  /**
   * Extra walkable surfaces outside floor.cells, e.g. an open roof terrace.
   * They are supported by this floor and bounded by its collision mask.
   */
  walkable?: TileRect[];
  rooms: RoomSpec[];
  wallRuns: WallRun[];
  openings: OpeningSpec[];
  stairs: StairSpec[];
}

export interface BuildingSpec {
  id: string;
  templateId: string;
  origin: Vec2;
  floors: FloorSpec[];
  roof?: RoofSpec;
}

export interface DoorState {
  openingId: string;
  open: boolean;
  locked: boolean;
  hp: number;
  revision: number;
}

export interface WindowState {
  openingId: string;
  broken: boolean;
  boarded: boolean;
  hp: number;
  revision: number;
}

export interface OpeningStateSnapshot {
  doors: DoorState[];
  windows: WindowState[];
}
