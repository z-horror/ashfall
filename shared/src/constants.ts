export const PROTOCOL_VERSION = 1;

export const ROAD_CENTERS = [16, 48, 80, 112] as const;
export const ROAD_HALF = 3;

export const WORLD_TILES = 128;
export const CHUNK_TILES = 32;
export const WORLD_CHUNKS = WORLD_TILES / CHUNK_TILES;
export const TILE_W = 64;
export const TILE_H = 32;

export const TICK_HZ = 20;
export const SNAPSHOT_HZ = 12;
export const AOI_RADIUS = 28;
export const CHUNK_RADIUS = 1;

export const PLAYER_SPEED = 3.15;
export const PLAYER_SPRINT = 4.9;
export const PLAYER_RADIUS = 0.27;
export const PLAYER_MAX_HP = 100;
export const PLAYER_MAX_STAMINA = 100;
export const PLAYER_HUNGER_DRAIN = 0.011;
export const PLAYER_THIRST_DRAIN = 0.018;
export const SPRINT_STAMINA_DRAIN = 17;
export const STAMINA_REGEN = 12;
export const RESPAWN_TIME_MS = 9000;
export const SAFE_ZONE_RADIUS = 7;
export const INVENTORY_WEIGHT = 26;
export const INVENTORY_SLOTS = 24;
export const INTERACT_RANGE = 1.45;
export const PICKUP_RANGE = 1.5;
export const MAX_MESSAGE_BYTES = 16384;
export const MAX_MESSAGES_PER_SEC = 90;
export const MAX_CHAT_LEN = 140;

export const ZOMBIE_AGGRO_RANGE = 13;
export const ZOMBIE_LOSE_RANGE = 22;

export type ItemKind = 'weapon' | 'food' | 'drink' | 'med' | 'ammo' | 'misc';

export interface ItemDef {
  key: string;
  name: string;
  kind: ItemKind;
  weight: number;
  stack: number;
  color: string;
  icon: 'bat' | 'knife' | 'crowbar' | 'axe' | 'pistol' | 'can' | 'bottle' | 'bandage' | 'ammo' | 'scrap' | 'cloth' | 'pill';
  desc: string;
  damage?: number;
  range?: number;
  cooldown?: number;
  ammo?: string;
  noise?: number;
  heal?: number;
  hunger?: number;
  thirst?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  spiked_bat: {
    key: 'spiked_bat', name: 'Усиленная бита', kind: 'weapon', weight: 1.8, stack: 1, color: '#d46532', icon: 'bat',
    desc: 'Бита с арматурными шипами. Высокий урон для боевых тестов.', damage: 65, range: 1.95, cooldown: 0.52,
  },
  bat: {
    key: 'bat', name: 'Бейсбольная бита', kind: 'weapon', weight: 1.6, stack: 1, color: '#b48a56', icon: 'bat',
    desc: 'Тяжёлая деревянная бита. Медленно, но больно.', damage: 27, range: 1.75, cooldown: 0.72,
  },
  knife: {
    key: 'knife', name: 'Кухонный нож', kind: 'weapon', weight: 0.5, stack: 1, color: '#b9c2c4', icon: 'knife',
    desc: 'Быстрый и тихий. Держитесь близко.', damage: 15, range: 1.2, cooldown: 0.38,
  },
  crowbar: {
    key: 'crowbar', name: 'Лом', kind: 'weapon', weight: 2.1, stack: 1, color: '#9b3b2f', icon: 'crowbar',
    desc: 'Надёжный инструмент выжившего.', damage: 22, range: 1.6, cooldown: 0.58,
  },
  axe: {
    key: 'axe', name: 'Пожарный топор', kind: 'weapon', weight: 3.4, stack: 1, color: '#b7442f', icon: 'axe',
    desc: 'Тяжёлый, но сносит всё на пути.', damage: 42, range: 1.7, cooldown: 1.15,
  },
  pistol: {
    key: 'pistol', name: 'Пистолет 9мм', kind: 'weapon', weight: 1.1, stack: 1, color: '#5b6166', icon: 'pistol',
    desc: 'Громко. Привлекает зомби со всей округи.', damage: 36, range: 14, cooldown: 0.42, ammo: 'ammo_9mm', noise: 24,
  },
  ammo_9mm: {
    key: 'ammo_9mm', name: 'Патроны 9мм', kind: 'ammo', weight: 0.012, stack: 60, color: '#c9a24a', icon: 'ammo',
    desc: 'Двенадцать патронов в коробке.',
  },
  canned_food: {
    key: 'canned_food', name: 'Консервы', kind: 'food', weight: 0.4, stack: 12, color: '#9a6b3f', icon: 'can',
    desc: 'Срок годности давно истёк. Всё ещё съедобно.', hunger: 32,
  },
  water_bottle: {
    key: 'water_bottle', name: 'Бутылка воды', kind: 'drink', weight: 0.55, stack: 8, color: '#5d8fa6', icon: 'bottle',
    desc: 'Мутная, но живительная.', thirst: 40,
  },
  bandage: {
    key: 'bandage', name: 'Бинт', kind: 'med', weight: 0.1, stack: 12, color: '#d8d2c2', icon: 'bandage',
    desc: 'Останавливает кровь и немного лечит.', heal: 24,
  },
  painkillers: {
    key: 'painkillers', name: 'Обезболивающее', kind: 'med', weight: 0.08, stack: 10, color: '#c9c2b0', icon: 'pill',
    desc: 'Притупляет боль. Восстанавливает немного здоровья.', heal: 10,
  },
  scrap: {
    key: 'scrap', name: 'Металлолом', kind: 'misc', weight: 0.6, stack: 40, color: '#7d8588', icon: 'scrap',
    desc: 'Пригодится для баррикад и ремонта.',
  },
  cloth: {
    key: 'cloth', name: 'Ткань', kind: 'misc', weight: 0.15, stack: 40, color: '#a9a08d', icon: 'cloth',
    desc: 'Полоски ткани. Основа для бинтов.',
  },
};

export const LOOT_TABLES: Record<string, Array<[string, number, number, number]>> = {
  shelf: [
    ['canned_food', 1, 3, 42],
    ['water_bottle', 1, 2, 26],
    ['bandage', 1, 2, 18],
    ['painkillers', 1, 1, 8],
    ['cloth', 1, 4, 20],
  ],
  fridge: [
    ['water_bottle', 1, 3, 55],
    ['canned_food', 1, 2, 30],
    ['painkillers', 1, 1, 8],
  ],
  dumpster: [
    ['scrap', 1, 4, 34],
    ['cloth', 1, 5, 32],
    ['canned_food', 1, 1, 10],
    ['water_bottle', 1, 1, 14],
  ],
  crate: [
    ['scrap', 1, 3, 35],
    ['cloth', 2, 5, 25],
    ['ammo_9mm', 4, 10, 18],
    ['bandage', 1, 2, 20],
  ],
  car: [
    ['scrap', 1, 3, 30],
    ['cloth', 1, 3, 25],
    ['ammo_9mm', 3, 8, 12],
    ['pistol', 1, 1, 3],
    ['water_bottle', 1, 1, 18],
  ],
  med: [
    ['bandage', 2, 4, 50],
    ['painkillers', 1, 2, 40],
    ['water_bottle', 1, 1, 10],
  ],
  toolbox: [
    ['crowbar', 1, 1, 14],
    ['axe', 1, 1, 8],
    ['knife', 1, 1, 22],
    ['scrap', 2, 5, 35],
    ['ammo_9mm', 3, 6, 12],
  ],
};

export const CONTAINER_LABELS: Record<string, string> = {
  shelf: 'Стеллаж',
  fridge: 'Холодильник',
  dumpster: 'Мусорный контейнер',
  crate: 'Ящик',
  car: 'Багажник',
  med: 'Медицинский шкаф',
  toolbox: 'Инструментальный ящик',
};

export const ZOMBIE_TYPES = [
  { key: 'walker', name: 'Ходок', hp: 58, speed: 1.25, chase: 1.85, damage: 9, cooldown: 1.35, color: 0, scale: 1 },
  { key: 'runner', name: 'Бегун', hp: 44, speed: 1.6, chase: 3.15, damage: 7, cooldown: 1.0, color: 1, scale: 0.94 },
  { key: 'brute', name: 'Громила', hp: 115, speed: 1.0, chase: 1.5, damage: 17, cooldown: 1.6, color: 2, scale: 1.16 },
] as const;

export const TILE = {
  ASPHALT: 0,
  SIDEWALK: 1,
  GRASS: 2,
  DIRT: 3,
  WOOD_FLOOR: 4,
  TILE_FLOOR: 5,
  CONCRETE: 6,
  RUBBLE: 7,
} as const;

export const WALL = {
  NONE: 0,
  BRICK: 1,
  CONCRETE: 2,
  INDUSTRIAL: 3,
  INTERIOR: 4,
} as const;

export function tileIndex(x: number, y: number): number {
  return y * WORLD_TILES + x;
}

export function inWorld(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < WORLD_TILES && y < WORLD_TILES;
}

export function chunkOf(x: number, y: number): [number, number] {
  return [Math.floor(x / CHUNK_TILES), Math.floor(y / CHUNK_TILES)];
}
