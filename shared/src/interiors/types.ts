import type { TileRect, Vec2 } from '../geometry/units.js';
import type { FloorIndex, RoomKind } from '../buildings/types.js';

export type ObjectCategory =
  | 'large_furniture'
  | 'small_furniture'
  | 'appliance'
  | 'wall_object'
  | 'decor'
  | 'container'
  | 'light';

export type MountType = 'floor' | 'wall' | 'ceiling';

export interface FootprintPart {
  shape: 'aabb' | 'circle';
  offsetM: Vec2;
  widthM?: number;
  depthM?: number;
  radiusM?: number;
}

export interface ObjectVisual {
  key: string;
  variants: string[];
  mirrorable: boolean;
  rotationSafe: boolean;
  cutawayVariant?: string;
}

export interface ObjectBehavior {
  type: 'container' | 'toggle' | 'light' | 'destructible';
  containerType?: string;
  maxSlots?: number;
  lootTable?: string;
  stateKey?: 'open' | 'on';
  radiusM?: number;
  hp?: number;
}

export interface ObjectTemplate {
  id: string;
  name: string;
  category: ObjectCategory;
  mount: MountType;
  sizeM: { width: number; depth: number; height: number };
  footprint: FootprintPart[];
  anchor: { x: number; y: number; z: number };
  visual: ObjectVisual;
  placement: {
    allowedRoomKinds: RoomKind[];
    wallAffinity?: 'none' | 'back' | 'left' | 'right' | 'any';
    clearanceM: number;
    priority: number;
    allowUnderWindow?: boolean;
    blocksPath: boolean;
    blocksSight?: boolean;
    blocksProjectiles?: boolean;
  };
  behaviors?: ObjectBehavior[];
  destructible?: { hp: number; collisionWhenDestroyed: 'none' | 'reduced' };
}

export type ObjectPlacement =
  | { mount: 'floor'; x: number; y: number; rotation: 0 | 90 | 180 | 270 }
  | { mount: 'wall'; wallRunId: string; offsetM: number; heightM: number; rotation: 0 | 90 | 180 | 270 }
  | { mount: 'ceiling'; x: number; y: number; heightM: number };

export interface ObjectInstance {
  id: string;
  templateId: string;
  buildingId: string;
  level: FloorIndex;
  roomId: string;
  placement: ObjectPlacement;
  variant: number;
  containerId?: string;
}

export interface ObjectState {
  objectId: string;
  open: boolean;
  broken: boolean;
  destroyed: boolean;
  hp: number;
  on: boolean;
  revision: number;
}

export interface FurnitureSlot {
  id: string;
  templateIds: string[];
  required: boolean;
  anchor: 'wall' | 'corner' | 'center' | 'nearWindow' | 'nearDoor' | 'free';
  orientation?: 'intoRoom' | 'parallelWall' | 'free';
  clearanceM: number;
  priority: number;
  groupId?: string;
}

export interface CompositionSpec {
  id: string;
  roomKinds: RoomKind[];
  minAreaM2: number;
  maxAreaM2?: number;
  fill: 'sparse' | 'normal' | 'dense';
  slots: FurnitureSlot[];
}

export interface RoomLayout {
  roomId: string;
  compositionId: string;
  objects: ObjectInstance[];
  reservedZones: TileRect[];
}

export interface InteriorLayout {
  buildingId: string;
  level: FloorIndex;
  rooms: RoomLayout[];
}
