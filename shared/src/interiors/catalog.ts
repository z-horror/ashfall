import type { ObjectTemplate } from './types.js';

function floorBox(
  id: string,
  name: string,
  category: ObjectTemplate['category'],
  width: number,
  depth: number,
  height: number,
  visualKey: string,
  extra: Partial<ObjectTemplate> = {},
): ObjectTemplate {
  return {
    id,
    name,
    category,
    mount: 'floor',
    sizeM: { width, depth, height },
    footprint: [{ shape: 'aabb', offsetM: { x: 0, y: 0 }, widthM: width, depthM: depth }],
    anchor: { x: 0.5, y: 1, z: 0 },
    visual: { key: visualKey, variants: [visualKey], mirrorable: false, rotationSafe: true },
    placement: {
      allowedRoomKinds: ['bedroom', 'living', 'kitchen', 'office', 'shop', 'warehouse', 'storage', 'utility'],
      clearanceM: 0.05,
      priority: 10,
      blocksPath: true,
      blocksSight: false,
      blocksProjectiles: false,
    },
    ...extra,
  };
}

export const OBJECT_TEMPLATES: Record<string, ObjectTemplate> = {
  bed_double: floorBox('bed_double', 'Двуспальная кровать', 'large_furniture', 1.4, 2.0, 0.6, 'bed_double', {
    visual: { key: 'bed_double', variants: ['bed_double'], mirrorable: true, rotationSafe: true },
    placement: { allowedRoomKinds: ['bedroom', 'living'], wallAffinity: 'any', clearanceM: 0.05, priority: 20, blocksPath: true, blocksSight: false, blocksProjectiles: false },
  }),
  bed_single: floorBox('bed_single', 'Односпальная кровать', 'large_furniture', 0.9, 2.0, 0.6, 'bed_single', {
    placement: { allowedRoomKinds: ['bedroom'], wallAffinity: 'any', clearanceM: 0.05, priority: 20, blocksPath: true, blocksSight: false, blocksProjectiles: false },
  }),
  nightstand: floorBox('nightstand', 'Тумбочка', 'small_furniture', 0.5, 0.45, 0.55, 'nightstand', {
    placement: { allowedRoomKinds: ['bedroom', 'living'], wallAffinity: 'any', clearanceM: 0.03, priority: 30, blocksPath: true, blocksSight: false, blocksProjectiles: false },
  }),
  wardrobe: floorBox('wardrobe', 'Шкаф', 'large_furniture', 1.2, 0.6, 2.1, 'wardrobe', {
    placement: { allowedRoomKinds: ['bedroom', 'living', 'corridor', 'office'], wallAffinity: 'any', clearanceM: 0.05, priority: 22, blocksPath: true, blocksSight: true, blocksProjectiles: true },
    behaviors: [
      { type: 'container', containerType: 'shelf', maxSlots: 16, lootTable: 'shelf' },
      { type: 'toggle', stateKey: 'open' },
    ],
  }),
  table: floorBox('table', 'Стол', 'large_furniture', 1.2, 0.8, 0.75, 'table', {
    placement: { allowedRoomKinds: ['kitchen', 'living', 'office', 'shop'], clearanceM: 0.4, priority: 25, blocksPath: true, blocksSight: false, blocksProjectiles: false },
  }),
  chair: floorBox('chair', 'Стул', 'small_furniture', 0.45, 0.45, 0.9, 'chair', {
    placement: { allowedRoomKinds: ['kitchen', 'living', 'office', 'shop'], clearanceM: 0.2, priority: 40, blocksPath: true, blocksSight: false, blocksProjectiles: false },
  }),
  fridge: floorBox('fridge', 'Холодильник', 'appliance', 0.7, 0.7, 1.8, 'fridge', {
    placement: { allowedRoomKinds: ['kitchen', 'living', 'storage'], wallAffinity: 'any', clearanceM: 0.08, priority: 18, blocksPath: true, blocksSight: true, blocksProjectiles: true },
    behaviors: [
      { type: 'container', containerType: 'fridge', maxSlots: 10, lootTable: 'fridge' },
      { type: 'toggle', stateKey: 'open' },
    ],
  }),
  counter: floorBox('counter', 'Кухонная стойка', 'large_furniture', 1.2, 0.6, 0.9, 'counter', {
    placement: { allowedRoomKinds: ['kitchen', 'shop', 'office'], wallAffinity: 'any', clearanceM: 0.05, priority: 24, blocksPath: true, blocksSight: true, blocksProjectiles: true },
  }),
  shelf: floorBox('shelf', 'Стеллаж', 'large_furniture', 1.0, 0.35, 1.8, 'shelf', {
    placement: { allowedRoomKinds: ['storage', 'utility', 'warehouse', 'shop', 'office'], wallAffinity: 'any', clearanceM: 0.04, priority: 20, blocksPath: true, blocksSight: true, blocksProjectiles: true },
    behaviors: [{ type: 'container', containerType: 'shelf', maxSlots: 16, lootTable: 'shelf' }],
  }),
  crate: floorBox('crate', 'Ящик', 'container', 0.6, 0.6, 0.6, 'crate', {
    placement: { allowedRoomKinds: ['storage', 'utility', 'warehouse', 'kitchen', 'shop'], clearanceM: 0.1, priority: 35, blocksPath: true, blocksSight: false, blocksProjectiles: false },
    behaviors: [{ type: 'container', containerType: 'crate', maxSlots: 12, lootTable: 'crate' }],
    destructible: { hp: 40, collisionWhenDestroyed: 'none' },
  }),
  utility_box: floorBox('utility_box', 'Технический шкаф', 'appliance', 0.8, 0.5, 1.4, 'utility_box', {
    placement: { allowedRoomKinds: ['utility', 'storage', 'warehouse'], wallAffinity: 'any', clearanceM: 0.08, priority: 25, blocksPath: true, blocksSight: true, blocksProjectiles: true },
  }),
  rug: {
    id: 'rug',
    name: 'Ковёр',
    category: 'decor',
    mount: 'floor',
    sizeM: { width: 2.0, depth: 1.4, height: 0.01 },
    footprint: [],
    anchor: { x: 0.5, y: 1, z: 0 },
    visual: { key: 'rug', variants: ['rug'], mirrorable: true, rotationSafe: true },
    placement: { allowedRoomKinds: ['bedroom', 'living', 'office'], clearanceM: 0, priority: 90, blocksPath: false, blocksSight: false, blocksProjectiles: false },
  },
  picture: {
    id: 'picture',
    name: 'Картина',
    category: 'wall_object',
    mount: 'wall',
    sizeM: { width: 0.6, depth: 0.05, height: 0.45 },
    footprint: [],
    anchor: { x: 0.5, y: 1, z: 1.5 },
    visual: { key: 'picture', variants: ['picture'], mirrorable: true, rotationSafe: false, cutawayVariant: 'picture_cut' },
    placement: { allowedRoomKinds: ['bedroom', 'living', 'office', 'corridor'], wallAffinity: 'any', clearanceM: 0.02, priority: 80, blocksPath: false, blocksSight: false, blocksProjectiles: false },
  },
  clock: {
    id: 'clock',
    name: 'Часы',
    category: 'wall_object',
    mount: 'wall',
    sizeM: { width: 0.3, depth: 0.05, height: 0.3 },
    footprint: [],
    anchor: { x: 0.5, y: 1, z: 1.7 },
    visual: { key: 'clock', variants: ['clock'], mirrorable: false, rotationSafe: false, cutawayVariant: 'clock_cut' },
    placement: { allowedRoomKinds: ['kitchen', 'living', 'office', 'shop'], wallAffinity: 'any', clearanceM: 0.02, priority: 80, blocksPath: false, blocksSight: false, blocksProjectiles: false },
  },
  ceiling_light: {
    id: 'ceiling_light',
    name: 'Потолочный светильник',
    category: 'light',
    mount: 'ceiling',
    sizeM: { width: 0.3, depth: 0.3, height: 0.2 },
    footprint: [],
    anchor: { x: 0.5, y: 0.5, z: 0 },
    visual: { key: 'ceiling_light', variants: ['ceiling_light'], mirrorable: false, rotationSafe: true },
    placement: { allowedRoomKinds: ['bedroom', 'living', 'kitchen', 'corridor', 'storage', 'utility', 'office', 'shop', 'warehouse'], clearanceM: 0, priority: 95, blocksPath: false, blocksSight: false, blocksProjectiles: false },
    behaviors: [
      { type: 'toggle', stateKey: 'on' },
      { type: 'light', radiusM: 5 },
    ],
  },
};
