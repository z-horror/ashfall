export interface Vec2 {
  x: number;
  y: number;
}

export interface BuildingDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style: number;
  name: string;
  roof: boolean;
  doorTiles: Array<{ x: number; y: number }>;
}

export interface PropDef {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  variant: number;
  blocking: boolean;
  destructible: boolean;
  hp: number;
  maxHp: number;
  containerId?: string;
}

export interface DoorDef {
  id: string;
  x: number;
  y: number;
  open: boolean;
  locked: boolean;
  hp: number;
}

export interface ChunkData {
  cx: number;
  cy: number;
  tiles: string;
  walls: string;
  buildings: BuildingDef[];
  props: PropDef[];
  doors: DoorDef[];
  /** Container positions, ids and types (loot contents stay server-side). */
  containers: Array<{ id: string; type: string; x: number; y: number; label: string }>;
}

export interface PlayerSnapshot {
  id: number;
  name: string;
  x: number;
  y: number;
  aim: number;
  hp: number;
  maxHp: number;
  stamina: number;
  status: 'alive' | 'dead';
  moving: boolean;
  sprinting: boolean;
  weapon: string | null;
  action?: string;
  actionAt?: number;
  tag?: string;
}

export interface ZombieSnapshot {
  id: string;
  type: number;
  x: number;
  y: number;
  aim: number;
  hp: number;
  maxHp: number;
  state: 'idle' | 'wander' | 'chase' | 'attack';
  moving: boolean;
  actionAt?: number;
}

export interface GroundItemSnapshot {
  id: string;
  key: string;
  qty: number;
  x: number;
  y: number;
}

export interface SelfSnapshot {
  id: number;
  x: number;
  y: number;
  aim: number;
  hp: number;
  maxHp: number;
  stamina: number;
  hunger: number;
  thirst: number;
  status: 'alive' | 'dead';
  respawnIn?: number;
  ack: number;
  weapon: string | null;
  equipped: string | null;
  weight: number;
  maxWeight: number;
  slotCount: number;
  xp?: number;
}

export interface ItemView {
  id: string;
  key: string;
  qty: number;
  equipped: boolean;
  durability: number;
}

export interface InventoryView {
  items: ItemView[];
  weight: number;
  maxWeight: number;
  slots: number;
  equipped: string | null;
}

export interface ContainerView {
  id: string;
  label: string;
  type: string;
  items: ItemView[];
  maxSlots: number;
}

export interface EventView {
  t: string;
  x?: number;
  y?: number;
  [k: string]: unknown;
}

export type ServerMessage =
  | { t: 'welcome'; v: number; id: number; name: string; spawn: Vec2; seed: string; time: number; characterId: number; x: number; y: number; aim: number; hp: number; stamina: number; hunger: number; thirst: number; status: 'alive' | 'dead' }
  | { t: 'chunk'; chunk: ChunkData }
  | { t: 'chunk_unload'; cx: number; cy: number }
  | {
      t: 'snapshot';
      tick: number;
      time: number;
      self: SelfSnapshot;
      players: PlayerSnapshot[];
      zombies: ZombieSnapshot[];
      items: GroundItemSnapshot[];
      events: EventView[];
      online: number;
    }
  | { t: 'inventory'; inv: InventoryView; container?: ContainerView | null }
  | { t: 'error'; code: string; message: string }
  | { t: 'pong'; ts: number }
  | { t: 'notice'; text: string };
