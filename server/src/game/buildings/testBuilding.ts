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

export const TEST_BUILDING_SEED = 'ashfall-buildings-v2';
export const TEST_BUILDING_ID = 'b:v3:test:28:28';
export const TEST_SPAWN = { x: 31.5, y: 42.0 };
export const TEST_BUILDING_ORIGIN = { x: 28, y: 28 };

// Basement is a full rectangular underground foundation bunker
const BASEMENT_BOUNDS = { x: 28, y: 28, w: 12, h: 10 };
const BASEMENT_CELLS = [{ ...BASEMENT_BOUNDS }];
const STAIR_HOLE = { x: 37, y: 30, w: 1, h: 3 };

// Ground Floor is П-shaped (U-shaped):
// West wing (28..33, 28..38), North connector (33..35, 28..32), East wing (35..40, 28..38)
// Courtyard (33..35, 32..38) is open outside
const GROUND_CELLS = [
  { x: 28, y: 28, w: 5, h: 10 }, // West wing
  { x: 33, y: 28, w: 2, h: 4 },  // North corridor connector
  { x: 35, y: 28, w: 5, h: 10 }, // East wing
];

// Floor 1 (Mansard / 2nd Floor): Smaller footprint covering North half (28..40, 28..33)
// Leaving South half (33..38) as an open roof terrace!
const MANSARD_CELLS = [
  { x: 28, y: 28, w: 12, h: 5 },
];

function wallRunsFloor0(): WallRun[] {
  const mat: WallMaterial = 'brick';
  const hM = 2.8;
  return [
    // Exterior perimeter of the П-shape
    { id: 'w:test:0:north', level: 0, axis: 'h', fixed: 28, from: 28, to: 40, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:0:west', level: 0, axis: 'v', fixed: 28, from: 28, to: 38, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:0:east', level: 0, axis: 'v', fixed: 40, from: 28, to: 38, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:0:south', level: 0, axis: 'h', fixed: 38, from: 28, to: 33, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:0:south_east', level: 0, axis: 'h', fixed: 38, from: 35, to: 40, material: mat, thicknessM: 0.2, heightM: hM },
    // Courtyard inner walls
    { id: 'w:test:0:court_west', level: 0, axis: 'v', fixed: 33, from: 32, to: 38, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:0:court_east', level: 0, axis: 'v', fixed: 35, from: 32, to: 38, material: mat, thicknessM: 0.2, heightM: hM },
    { id: 'w:test:0:court_north', level: 0, axis: 'h', fixed: 32, from: 33, to: 35, material: mat, thicknessM: 0.2, heightM: hM },
    // Interior partitions
    { id: 'w:test:0:partition', level: 0, axis: 'v', fixed: 33, from: 28, to: 32, material: 'interior', thicknessM: 0.15, heightM: hM },
    { id: 'w:test:0:partition_east', level: 0, axis: 'v', fixed: 35, from: 28, to: 32, material: 'interior', thicknessM: 0.15, heightM: hM },
  ];
}

function wallRunsBasement(): WallRun[] {
  const mat: WallMaterial = 'concrete';
  const hM = 2.6;
  return [
    { id: 'w:test:-1:north', level: -1, axis: 'h', fixed: 28, from: 28, to: 40, material: mat, thicknessM: 0.25, heightM: hM },
    { id: 'w:test:-1:south', level: -1, axis: 'h', fixed: 38, from: 28, to: 40, material: mat, thicknessM: 0.25, heightM: hM },
    { id: 'w:test:-1:west', level: -1, axis: 'v', fixed: 28, from: 28, to: 38, material: mat, thicknessM: 0.25, heightM: hM },
    { id: 'w:test:-1:east', level: -1, axis: 'v', fixed: 40, from: 28, to: 38, material: mat, thicknessM: 0.25, heightM: hM },
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
      rects: [{ x: 28, y: 28, w: 5, h: 10 }],
      reservedZones: [{ x: 31, y: 37, w: 1, h: 1 }],
    },
    {
      id: 'room:test:0:hall',
      level: 0,
      kind: 'living',
      rects: [{ x: 33, y: 28, w: 2, h: 4 }],
      reservedZones: [],
    },
    {
      id: 'room:test:0:east',
      level: 0,
      kind: 'kitchen',
      rects: [{ x: 35, y: 28, w: 5, h: 10 }],
      reservedZones: [STAIR_HOLE, { x: 37, y: 29, w: 1, h: 1 }, { x: 37, y: 33, w: 1, h: 1 }],
    },
  ];
}

const stairBasement: StairSpec = {
  id: 's:test:0:-1',
  fromLevel: 0,
  toLevel: -1,
  entry: { x: 37, y: 29, w: 1, h: 1 },
  exit: { x: 37, y: 33, w: 1, h: 1 },
  hole: STAIR_HOLE,
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
  entry: { x: 33, y: 31, w: 1, h: 1 },
  exit: { x: 33, y: 29, w: 1, h: 1 },
  hole: { x: 33, y: 28, w: 1, h: 3 },
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
  floor: { cells: GROUND_CELLS, material: 'wood', thicknessM: 0.4, holes: [STAIR_HOLE, { x: 33, y: 28, w: 1, h: 3 }] },
  rooms: roomsFloor0(),
  wallRuns: wallRunsFloor0(),
  openings: [
    {
      id: 'o:test:0:door',
      wallRunId: 'w:test:0:south',
      kind: 'door',
      startM: 5.1,
      widthM: 1.0,
      sillM: 0,
      heightM: 2.1,
    },
    {
      id: 'o:test:0:window',
      wallRunId: 'w:test:0:east',
      kind: 'window',
      startM: 5.1,
      widthM: 1.0,
      sillM: 0.9,
      heightM: 1.2,
    },
    {
      id: 'o:test:0:window_front',
      wallRunId: 'w:test:0:south_east',
      kind: 'window',
      startM: 2.0,
      widthM: 1.2,
      sillM: 0.9,
      heightM: 1.2,
    },
    {
      id: 'o:test:0:arch',
      wallRunId: 'w:test:0:partition',
      kind: 'arch',
      startM: 2.5,
      widthM: 1.0,
      sillM: 0,
      heightM: 2.1,
    },
    {
      id: 'o:test:0:arch_east',
      wallRunId: 'w:test:0:partition_east',
      kind: 'arch',
      startM: 2.5,
      widthM: 1.0,
      sillM: 0,
      heightM: 2.1,
    },
    {
      id: 'o:test:0:door_court',
      wallRunId: 'w:test:0:court_north',
      kind: 'door',
      startM: 1.1,
      widthM: 1.0,
      sillM: 0,
      heightM: 2.1,
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
      reservedZones: [STAIR_HOLE, { x: 37, y: 33, w: 1, h: 1 }],
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
  floor: { cells: MANSARD_CELLS, material: 'wood', thicknessM: 0.4, holes: [{ x: 33, y: 28, w: 1, h: 3 }] },
  rooms: [
    {
      id: 'room:test:1:mansard',
      level: 1,
      kind: 'office',
      rects: MANSARD_CELLS,
      reservedZones: [{ x: 33, y: 28, w: 1, h: 3 }],
    },
  ],
  wallRuns: wallRunsMansard(),
  openings: [
    {
      id: 'o:test:1:door_terrace',
      wallRunId: 'w:test:1:south',
      kind: 'door',
      startM: 4.8,
      widthM: 1.0,
      sillM: 0,
      heightM: 2.1,
    },
    {
      id: 'o:test:1:window_terrace',
      wallRunId: 'w:test:1:south',
      kind: 'window',
      startM: 12.0,
      widthM: 1.2,
      sillM: 0.9,
      heightM: 1.2,
    },
  ],
  stairs: [],
};

export const TEST_BUILDING: BuildingSpec = {
  id: TEST_BUILDING_ID,
  templateId: 'test-apartment',
  origin: TEST_BUILDING_ORIGIN,
  floors: [basementFloor, groundFloor, mansardFloor],
  roof: { cells: MANSARD_CELLS, material: 'roof', thicknessM: 0.4, parapetM: 0.5 },
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
  // Bedroom (West wing): Wardrobe is placed FLAT against North wall
  floorObject('obj:test:0:west:bed:0', 'bed_double', 0, 'room:test:0:west', { mount: 'floor', x: 30.5, y: 28.775, rotation: 0 }, false),
  floorObject('obj:test:0:west:nightstand:0', 'nightstand', 0, 'room:test:0:west', { mount: 'floor', x: 28.9, y: 28.6, rotation: 0 }, false),
  floorObject('obj:test:0:west:wardrobe:0', 'wardrobe', 0, 'room:test:0:west', { mount: 'floor', x: 32.0, y: 28.45, rotation: 0 }, true),
  floorObject('obj:test:0:west:rug:0', 'rug', 0, 'room:test:0:west', { mount: 'floor', x: 30.5, y: 31.5, rotation: 0 }, false),
  wallObject('obj:test:0:west:picture:0', 'picture', 0, 'room:test:0:west', 'w:test:0:north', 3.0, 1.5),

  // Kitchen / Living (East wing)
  floorObject('obj:test:0:east:counter:0', 'counter', 0, 'room:test:0:east', { mount: 'floor', x: 36.5, y: 28.4, rotation: 0 }, false),
  floorObject('obj:test:0:east:counter:1', 'counter', 0, 'room:test:0:east', { mount: 'floor', x: 38.0, y: 28.4, rotation: 0 }, false),
  floorObject('obj:test:0:east:fridge:0', 'fridge', 0, 'room:test:0:east', { mount: 'floor', x: 39.2, y: 29.0, rotation: 0 }, true),
  floorObject('obj:test:0:east:table:0', 'table', 0, 'room:test:0:east', { mount: 'floor', x: 37.0, y: 34.8, rotation: 0 }, false),
  floorObject('obj:test:0:east:chair:0', 'chair', 0, 'room:test:0:east', { mount: 'floor', x: 37.0, y: 35.85, rotation: 0 }, false),
  wallObject('obj:test:0:east:clock:0', 'clock', 0, 'room:test:0:east', 'w:test:0:north', 14.5, 1.8),

  // Basement (Level -1) Concrete Storage Bunker
  floorObject('obj:test:-1:storage:shelf:0', 'shelf', -1, 'room:test:-1:storage', { mount: 'floor', x: 28.325, y: 31.5, rotation: 90 }, true),
  floorObject('obj:test:-1:storage:crate:0', 'crate', -1, 'room:test:-1:storage', { mount: 'floor', x: 32.0, y: 31.5, rotation: 0 }, true),
  floorObject('obj:test:-1:storage:utility:0', 'utility_box', -1, 'room:test:-1:storage', { mount: 'floor', x: 30.0, y: 34.5, rotation: 0 }, false),
  {
    id: 'obj:test:-1:storage:light:0',
    templateId: 'ceiling_light',
    buildingId: TEST_BUILDING_ID,
    level: -1,
    roomId: 'room:test:-1:storage',
    placement: { mount: 'ceiling', x: 32, y: 31.5, heightM: 2.4 },
    variant: 0,
  },

  // Mansard (Level 1)
  floorObject('obj:test:1:mansard:table:0', 'table', 1, 'room:test:1:mansard', { mount: 'floor', x: 30.5, y: 29.5, rotation: 0 }, false),
  floorObject('obj:test:1:mansard:chair:0', 'chair', 1, 'room:test:1:mansard', { mount: 'floor', x: 30.5, y: 30.3, rotation: 0 }, false),
  floorObject('obj:test:1:mansard:crate:0', 'crate', 1, 'room:test:1:mansard', { mount: 'floor', x: 37.0, y: 29.0, rotation: 0 }, true),
];

export const TEST_OPENING_STATES: OpeningStateSnapshot = {
  doors: [
    { openingId: 'o:test:0:door', open: false, locked: false, hp: 100, revision: 0 },
    { openingId: 'o:test:0:door_court', open: false, locked: false, hp: 100, revision: 0 },
    { openingId: 'o:test:1:door_terrace', open: false, locked: false, hp: 100, revision: 0 },
  ],
  windows: [
    { openingId: 'o:test:0:window', broken: false, boarded: false, hp: 100, revision: 0 },
    { openingId: 'o:test:0:window_front', broken: false, boarded: false, hp: 100, revision: 0 },
    { openingId: 'o:test:1:window_terrace', broken: false, boarded: false, hp: 100, revision: 0 },
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
