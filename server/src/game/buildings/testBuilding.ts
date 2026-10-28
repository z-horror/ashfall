import {
  OBJECT_TEMPLATES,
  TILE_SIZE_M,
  type BuildingSpec,
  type FloorSpec,
  type ObjectInstance,
  type ObjectPlacement,
  type ObjectState,
  type OpeningStateSnapshot,
  type RoomSpec,
  type StairSpec,
  type WallMaterial,
  type WallRun,
} from '@ashfall/shared';

export const TEST_BUILDING_SEED = 'ashfall-buildings-v3-manor';
export const TEST_BUILDING_ID = 'b:v3:test:28:28';
export const TEST_SPAWN = { x: 35.0, y: 41.0 };
export const TEST_BUILDING_ORIGIN = { x: 28, y: 28 };

// Full solid rectangular Manor / Mansion footprint: 12 tiles wide (28..40), 9 tiles deep (28..37)
const MANOR_BOUNDS = { x: 28, y: 28, w: 12, h: 9 };
const BASEMENT_CELLS = [{ ...MANOR_BOUNDS }];
const GROUND_CELLS = [{ ...MANOR_BOUNDS }];

// Mansard / 2nd Floor occupies North section (28..40, 28..33)
// Leaving South section (28..40, 33..37) as an open front rooftop terrace!
const MANSARD_CELLS = [{ x: 28, y: 28, w: 12, h: 5 }];

// Stair holes
const STAIR_HOLE_BASEMENT = { x: 37, y: 29, w: 1, h: 3 }; // In East wing (Kitchen)
const STAIR_HOLE_MANSARD = { x: 34, y: 29, w: 1, h: 3 };  // In Central Foyer

function wallRunsFloor0(): WallRun[] {
  const mat: WallMaterial = 'brick';
  const hM = 2.8;
  return [
    // Exterior perimeter of the Manor
    { id: 'w:test:0:north', level: 0, axis: 'h', fixed: 28, from: 28, to: 40, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:0:west', level: 0, axis: 'v', fixed: 28, from: 28, to: 37, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:0:east', level: 0, axis: 'v', fixed: 40, from: 28, to: 37, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:0:south', level: 0, axis: 'h', fixed: 37, from: 28, to: 40, material: mat, thicknessM: 0.2, heightM: hM },

    // Interior dividing partition walls: ALWAYS 'interior' material, NEVER exterior brick!
    // Partition 1: separates West Bedroom (28..34) from Central Foyer (34..36)
    { id: 'w:test:0:part_west', level: 0, axis: 'v', fixed: 33, from: 28, to: 37, material: 'interior', thicknessM: 0.15, heightM: hM },
    // Partition 2: separates Central Foyer (34..36) from East Kitchen/Dining (36..40)
    { id: 'w:test:0:part_east', level: 0, axis: 'v', fixed: 36, from: 28, to: 37, material: 'interior', thicknessM: 0.15, heightM: hM },
  ];
}

function wallRunsBasement(): WallRun[] {
  const mat: WallMaterial = 'concrete';
  const hM = 2.6;
  return [
    { id: 'w:test:-1:north', level: -1, axis: 'h', fixed: 28, from: 28, to: 40, material: mat, thicknessM: 0.25, heightM: hM },
    { id: 'w:test:-1:south', level: -1, axis: 'h', fixed: 37, from: 28, to: 40, material: mat, thicknessM: 0.25, heightM: hM },
    { id: 'w:test:-1:west', level: -1, axis: 'v', fixed: 28, from: 28, to: 37, material: mat, thicknessM: 0.25, heightM: hM },
    { id: 'w:test:-1:east', level: -1, axis: 'v', fixed: 40, from: 28, to: 37, material: mat, thicknessM: 0.25, heightM: hM },
  ];
}

function wallRunsMansard(): WallRun[] {
  const mat: WallMaterial = 'brick';
  const hM = 2.6;
  return [
    { id: 'w:test:1:north', level: 1, axis: 'h', fixed: 28, from: 28, to: 40, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:1:west', level: 1, axis: 'v', fixed: 28, from: 28, to: 33, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:1:east', level: 1, axis: 'v', fixed: 40, from: 28, to: 33, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:1:south', level: 1, axis: 'h', fixed: 33, from: 28, to: 40, material: mat, thicknessM: 0.2, heightM: hM },
  ];
}

function roomsFloor0(): RoomSpec[] {
  return [
    {
      id: 'room:test:0:west',
      level: 0,
      kind: 'bedroom',
      rects: [{ x: 28, y: 28, w: 5, h: 9 }],
      reservedZones: [{ x: 31, y: 36, w: 1, h: 1 }],
    },
    {
      id: 'room:test:0:foyer',
      level: 0,
      kind: 'living',
      rects: [{ x: 33, y: 28, w: 3, h: 9 }],
      reservedZones: [STAIR_HOLE_MANSARD, { x: 34, y: 32, w: 1, h: 1 }, { x: 35, y: 36, w: 1, h: 1 }],
    },
    {
      id: 'room:test:0:east',
      level: 0,
      kind: 'kitchen',
      rects: [{ x: 36, y: 28, w: 4, h: 9 }],
      reservedZones: [STAIR_HOLE_BASEMENT, { x: 37, y: 29, w: 1, h: 1 }, { x: 37, y: 33, w: 1, h: 1 }],
    },
  ];
}

const stairBasement: StairSpec = {
  id: 's:test:0:-1',
  fromLevel: 0,
  toLevel: -1,
  entry: { x: 37, y: 29, w: 1, h: 1 },
  exit: { x: 37, y: 33, w: 1, h: 1 },
  hole: STAIR_HOLE_BASEMENT,
  direction: 'down',
  widthM: 1.0,
  riseM: 0.2,
  treadM: 0.28,
  steps: 15,
};

const stairMansard: StairSpec = {
  id: 's:test:0:1',
  fromLevel: 0,
  toLevel: 1,
  entry: { x: 34, y: 32, w: 1, h: 1 },
  exit: { x: 34, y: 29, w: 1, h: 1 },
  hole: STAIR_HOLE_MANSARD,
  direction: 'up',
  widthM: 1.0,
  riseM: 0.2,
  treadM: 0.28,
  steps: 14,
};

const groundFloor: FloorSpec = {
  level: 0,
  elevationM: 0,
  clearHeightM: 2.8,
  floor: {
    cells: GROUND_CELLS,
    material: 'wood',
    thicknessM: 0.4,
    holes: [STAIR_HOLE_BASEMENT, STAIR_HOLE_MANSARD],
  },
  rooms: roomsFloor0(),
  wallRuns: wallRunsFloor0(),
  openings: [
    // Single Main Front Entrance Door on South Facade at x = 34.5..35.5 (startM = 6.4m along 28..40)
    // 34.5 - 28.0 = 6.5 tiles = 10.4m
    {
      id: 'o:test:0:door',
      wallRunId: 'w:test:0:south',
      kind: 'door',
      startM: 10.4,
      widthM: 1.2,
      sillM: 0,
      heightM: 2.1,
    },
    // Front Bedroom Window on South Facade (x = 30..31, offset = 2.0 tiles = 3.2m)
    {
      id: 'o:test:0:window_bed',
      wallRunId: 'w:test:0:south',
      kind: 'window',
      startM: 3.2,
      widthM: 1.2,
      sillM: 0.9,
      heightM: 1.2,
    },
    // Front Dining Window on South Facade (x = 37.5..38.5, offset = 9.5 tiles = 15.2m)
    {
      id: 'o:test:0:window_dining',
      wallRunId: 'w:test:0:south',
      kind: 'window',
      startM: 15.2,
      widthM: 1.2,
      sillM: 0.9,
      heightM: 1.2,
    },
    // Side Window on East Facade (Kitchen, y = 32..33, offset = 4.0 tiles = 6.4m)
    {
      id: 'o:test:0:window_east',
      wallRunId: 'w:test:0:east',
      kind: 'window',
      startM: 6.4,
      widthM: 1.2,
      sillM: 0.9,
      heightM: 1.2,
    },
    // Side Window on West Facade (Bedroom, y = 32..33, offset = 4.0 tiles = 6.4m)
    {
      id: 'o:test:0:window_west',
      wallRunId: 'w:test:0:west',
      kind: 'window',
      startM: 6.4,
      widthM: 1.2,
      sillM: 0.9,
      heightM: 1.2,
    },
    // Interior Partition Archway: Bedroom <-> Foyer (y = 33..34, offset = 5.0 tiles = 8.0m)
    {
      id: 'o:test:0:arch_west',
      wallRunId: 'w:test:0:part_west',
      kind: 'arch',
      startM: 8.0,
      widthM: 1.2,
      sillM: 0,
      heightM: 2.2,
    },
    // Interior Partition Archway: Foyer <-> Kitchen (y = 33..34, offset = 5.0 tiles = 8.0m)
    {
      id: 'o:test:0:arch_east',
      wallRunId: 'w:test:0:part_east',
      kind: 'arch',
      startM: 8.0,
      widthM: 1.2,
      sillM: 0,
      heightM: 2.2,
    },
  ],
  stairs: [stairBasement, stairMansard],
};

const basementFloor: FloorSpec = {
  level: -1,
  elevationM: -3.0,
  clearHeightM: 2.6,
  floor: { cells: BASEMENT_CELLS, material: 'concrete', thicknessM: 0.4 },
  rooms: [
    {
      id: 'room:test:-1:storage',
      level: -1,
      kind: 'storage',
      rects: BASEMENT_CELLS,
      reservedZones: [STAIR_HOLE_BASEMENT, { x: 37, y: 33, w: 1, h: 1 }],
    },
  ],
  wallRuns: wallRunsBasement(),
  openings: [],
  stairs: [],
};

const mansardFloor: FloorSpec = {
  level: 1,
  elevationM: 2.8,
  clearHeightM: 2.6,
  floor: { cells: MANSARD_CELLS, material: 'wood', thicknessM: 0.4, holes: [STAIR_HOLE_MANSARD] },
  // Open roof terrace south of the mansard (the lower roof slab is walkable).
  walkable: [{ x: 28, y: 33, w: 12, h: 4, elevationM: 3.05, thicknessM: 0.25 }],
  rooms: [
    {
      id: 'room:test:1:mansard',
      level: 1,
      kind: 'office',
      rects: MANSARD_CELLS,
      reservedZones: [STAIR_HOLE_MANSARD],
    },
  ],
  wallRuns: wallRunsMansard(),
  openings: [
    // Terrace Door opening onto front roof terrace: x = 34.5..35.5 (startM = 10.4m)
    {
      id: 'o:test:1:door_terrace',
      wallRunId: 'w:test:1:south',
      kind: 'door',
      startM: 10.4,
      widthM: 1.2,
      sillM: 0,
      heightM: 2.1,
    },
    // Terrace Window (West): x = 30..31 (startM = 3.2m)
    {
      id: 'o:test:1:window_terrace_w',
      wallRunId: 'w:test:1:south',
      kind: 'window',
      startM: 3.2,
      widthM: 1.2,
      sillM: 0.9,
      heightM: 1.2,
    },
    // Terrace Window (East): x = 37.5..38.5 (startM = 15.2m)
    {
      id: 'o:test:1:window_terrace_e',
      wallRunId: 'w:test:1:south',
      kind: 'window',
      startM: 15.2,
      widthM: 1.2,
      sillM: 0.9,
      heightM: 1.2,
    },
  ],
  stairs: [],
};

export const TEST_BUILDING: BuildingSpec = {
  id: TEST_BUILDING_ID,
  templateId: 'test-manor',
  origin: TEST_BUILDING_ORIGIN,
  floors: [basementFloor, groundFloor, mansardFloor],
  roof: { cells: MANSARD_CELLS, material: 'roof', thicknessM: 0.4, parapetM: 0.5 },
  fixtures: [
    {
      id: 'fixture:test:roof:ac',
      level: 1,
      x: 38.0,
      y: 35.0,
      elevationM: 3.05,
      textureKey: 'prop_ac',
      widthPx: 64,
      heightPx: 54,
    },
  ],
};

function floorObject(
  id: string,
  templateId: string,
  level: number,
  roomId: string,
  placement: ObjectPlacement,
  container: boolean,
): ObjectInstance {
  return {
    id,
    templateId,
    buildingId: TEST_BUILDING_ID,
    level,
    roomId,
    placement,
    variant: 0,
    containerId: container ? `c:${id}` : undefined,
  };
}

function wallObject(
  id: string,
  templateId: string,
  level: number,
  roomId: string,
  wallRunId: string,
  offsetM: number,
  heightM: number,
): ObjectInstance {
  return {
    id,
    templateId,
    buildingId: TEST_BUILDING_ID,
    level,
    roomId,
    placement: { mount: 'wall', wallRunId, offsetM, heightM, rotation: 0 },
    variant: 0,
  };
}

export const TEST_OBJECTS: ObjectInstance[] = [
  // Master Bedroom (West wing: 28..34, 28..37)
  // Wardrobe flat against North wall
  floorObject('obj:test:0:west:wardrobe:0', 'wardrobe', 0, 'room:test:0:west', { mount: 'floor', x: 29.5, y: 28.45, rotation: 0 }, true),
  floorObject('obj:test:0:west:bed:0', 'bed_double', 0, 'room:test:0:west', { mount: 'floor', x: 32.0, y: 28.8, rotation: 0 }, false),
  floorObject('obj:test:0:west:nightstand:0', 'nightstand', 0, 'room:test:0:west', { mount: 'floor', x: 32.6, y: 28.6, rotation: 0 }, false),
  floorObject('obj:test:0:west:rug:0', 'rug', 0, 'room:test:0:west', { mount: 'floor', x: 31.0, y: 31.5, rotation: 0 }, false),
  wallObject('obj:test:0:west:picture:0', 'picture', 0, 'room:test:0:west', 'w:test:0:north', 3.0, 1.5),

  // Kitchen & Dining (East wing: 36..40, 28..37)
  floorObject('obj:test:0:east:counter:0', 'counter', 0, 'room:test:0:east', { mount: 'floor', x: 38.5, y: 28.4, rotation: 0 }, false),
  floorObject('obj:test:0:east:fridge:0', 'fridge', 0, 'room:test:0:east', { mount: 'floor', x: 39.3, y: 29.0, rotation: 0 }, true),
  floorObject('obj:test:0:east:table:0', 'table', 0, 'room:test:0:east', { mount: 'floor', x: 38.0, y: 34.5, rotation: 0 }, false),
  floorObject('obj:test:0:east:chair:0', 'chair', 0, 'room:test:0:east', { mount: 'floor', x: 38.0, y: 35.5, rotation: 0 }, false),
  wallObject('obj:test:0:east:clock:0', 'clock', 0, 'room:test:0:east', 'w:test:0:north', 10.5, 1.8),

  // Basement (Level -1) Concrete Storage Bunker (28..40, 28..37)
  floorObject('obj:test:-1:storage:shelf:0', 'shelf', -1, 'room:test:-1:storage', { mount: 'floor', x: 28.35, y: 31.5, rotation: 90 }, true),
  floorObject('obj:test:-1:storage:crate:0', 'crate', -1, 'room:test:-1:storage', { mount: 'floor', x: 32.0, y: 31.5, rotation: 0 }, true),
  floorObject('obj:test:-1:storage:utility:0', 'utility_box', -1, 'room:test:-1:storage', { mount: 'floor', x: 30.0, y: 34.5, rotation: 0 }, false),
  {
    id: 'obj:test:-1:storage:light:0',
    templateId: 'ceiling_light',
    buildingId: TEST_BUILDING_ID,
    level: -1,
    roomId: 'room:test:-1:storage',
    placement: { mount: 'ceiling', x: 34, y: 32.5, heightM: 2.4 },
    variant: 0,
  },

  // Mansard / 2nd Floor (Level 1)
  floorObject('obj:test:1:mansard:table:0', 'table', 1, 'room:test:1:mansard', { mount: 'floor', x: 30.5, y: 29.5, rotation: 0 }, false),
  floorObject('obj:test:1:mansard:chair:0', 'chair', 1, 'room:test:1:mansard', { mount: 'floor', x: 30.5, y: 30.3, rotation: 0 }, false),
  floorObject('obj:test:1:mansard:crate:0', 'crate', 1, 'room:test:1:mansard', { mount: 'floor', x: 37.0, y: 29.5, rotation: 0 }, true),
];

export const TEST_OPENING_STATES: OpeningStateSnapshot = {
  doors: [
    { openingId: 'o:test:0:door', open: false, locked: false, hp: 100, revision: 0 },
    { openingId: 'o:test:1:door_terrace', open: false, locked: false, hp: 100, revision: 0 },
  ],
  windows: [
    { openingId: 'o:test:0:window_bed', broken: false, boarded: false, hp: 100, revision: 0 },
    { openingId: 'o:test:0:window_dining', broken: false, boarded: false, hp: 100, revision: 0 },
    { openingId: 'o:test:0:window_east', broken: false, boarded: false, hp: 100, revision: 0 },
    { openingId: 'o:test:0:window_west', broken: false, boarded: false, hp: 100, revision: 0 },
    { openingId: 'o:test:1:window_terrace_w', broken: false, boarded: false, hp: 100, revision: 0 },
    { openingId: 'o:test:1:window_terrace_e', broken: false, boarded: false, hp: 100, revision: 0 },
  ],
};

export function createInitialObjectStates(): ObjectState[] {
  return TEST_OBJECTS.map((object) => {
    const template = OBJECT_TEMPLATES[object.templateId];
    return {
      objectId: object.id,
      open: false,
      broken: false,
      destroyed: false,
      hp: template?.destructible?.hp ?? 100,
      on: false,
      revision: 0,
    };
  });
}

export function createTestBuilding(): { building: BuildingSpec; objects: ObjectInstance[]; openingStates: OpeningStateSnapshot; objectStates: ObjectState[] } {
  return {
    building: TEST_BUILDING,
    objects: TEST_OBJECTS,
    openingStates: TEST_OPENING_STATES,
    objectStates: createInitialObjectStates(),
  };
}

export function wallRunCenter(run: WallRun): { x: number; y: number } {
  return run.axis === 'h'
    ? { x: (run.from + run.to) / 2, y: run.fixed }
    : { x: run.fixed, y: (run.from + run.to) / 2 };
}

export function openingOffsetMeters(run: WallRun, startM: number): number {
  return startM / TILE_SIZE_M;
}
