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
  type WallRun,
} from '@ashfall/shared';

export const TEST_BUILDING_SEED = 'ashfall-buildings-v2';
export const TEST_BUILDING_ID = 'b:v3:test:28:28';
export const TEST_SPAWN = { x: 31.5, y: 42.0 };
export const TEST_BUILDING_ORIGIN = { x: 28, y: 28 };

const BUILDING_BOUNDS = { x: 28, y: 28, w: 12, h: 10 };
const FLOOR_CELLS = [{ ...BUILDING_BOUNDS }];
const STAIR_HOLE = { x: 37, y: 30, w: 1, h: 3 };

function wallRuns(level: number, heightM: number, withPartition: boolean): WallRun[] {
  const runs: WallRun[] = [
    { id: `w:test:${level}:north`, level, axis: 'h', fixed: 28, from: 28, to: 40, material: 'brick', thicknessM: 0.2, heightM },
    { id: `w:test:${level}:south`, level, axis: 'h', fixed: 38, from: 28, to: 40, material: 'brick', thicknessM: 0.2, heightM },
    { id: `w:test:${level}:west`, level, axis: 'v', fixed: 28, from: 28, to: 38, material: 'brick', thicknessM: 0.2, heightM },
    { id: `w:test:${level}:east`, level, axis: 'v', fixed: 40, from: 28, to: 38, material: 'brick', thicknessM: 0.2, heightM },
  ];
  if (withPartition) {
    runs.push({
      id: `w:test:${level}:partition`,
      level,
      axis: 'v',
      fixed: 34,
      from: 28,
      to: 38,
      material: 'interior',
      thicknessM: 0.15,
      heightM,
    });
  }
  return runs;
}

function rooms(level: number, basement: boolean): RoomSpec[] {
  if (basement) {
    return [
      {
        id: `room:test:${level}:storage`,
        level,
        kind: 'storage',
        rects: FLOOR_CELLS,
        reservedZones: [STAIR_HOLE, { x: 37, y: 33, w: 1, h: 1 }],
      },
    ];
  }
  return [
    {
      id: `room:test:${level}:west`,
      level,
      kind: 'bedroom',
      rects: [{ x: 28, y: 28, w: 6, h: 10 }],
      reservedZones: [{ x: 31, y: 37, w: 1, h: 1 }],
    },
    {
      id: `room:test:${level}:east`,
      level,
      kind: 'kitchen',
      rects: [{ x: 34, y: 28, w: 6, h: 10 }],
      reservedZones: [STAIR_HOLE, { x: 37, y: 29, w: 1, h: 1 }, { x: 37, y: 33, w: 1, h: 1 }],
    },
  ];
}

const stair: StairSpec = {
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

const groundFloor: FloorSpec = {
  level: 0,
  elevationM: 0,
  clearHeightM: 2.8,
  floor: { cells: FLOOR_CELLS, material: 'wood', thicknessM: 0.4, holes: [STAIR_HOLE] },
  rooms: rooms(0, false),
  wallRuns: wallRuns(0, 2.8, true),
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
      id: 'o:test:0:arch',
      wallRunId: 'w:test:0:partition',
      kind: 'arch',
      startM: 6.7,
      widthM: 1.0,
      sillM: 0,
      heightM: 2.1,
    },
  ],
  stairs: [stair],
};

const basementFloor: FloorSpec = {
  level: -1,
  elevationM: -3.0,
  clearHeightM: 2.6,
  floor: { cells: FLOOR_CELLS, material: 'concrete', thicknessM: 0.4 },
  rooms: rooms(-1, true),
  wallRuns: wallRuns(-1, 2.6, false),
  openings: [],
  stairs: [],
};

export const TEST_BUILDING: BuildingSpec = {
  id: TEST_BUILDING_ID,
  templateId: 'test-apartment',
  origin: TEST_BUILDING_ORIGIN,
  floors: [basementFloor, groundFloor],
  roof: { cells: FLOOR_CELLS, material: 'roof', thicknessM: 0.4, parapetM: 0.5 },
};

function floorObject(
  id: string,
  templateId: string,
  level: number,
  roomId: string,
  placement: Extract<ObjectPlacement, { mount: 'floor' }>,
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
  floorObject('obj:test:0:west:bed:0', 'bed_double', 0, 'room:test:0:west', { mount: 'floor', x: 30.5, y: 28.775, rotation: 0 }, false),
  floorObject('obj:test:0:west:nightstand:0', 'nightstand', 0, 'room:test:0:west', { mount: 'floor', x: 29.5, y: 28.6, rotation: 0 }, false),
  floorObject('obj:test:0:west:wardrobe:0', 'wardrobe', 0, 'room:test:0:west', { mount: 'floor', x: 28.45, y: 34.0, rotation: 90 }, true),
  floorObject('obj:test:0:west:rug:0', 'rug', 0, 'room:test:0:west', { mount: 'floor', x: 30.5, y: 30.5, rotation: 0 }, false),
  wallObject('obj:test:0:west:picture:0', 'picture', 0, 'room:test:0:west', 'w:test:0:north', 4.0, 1.5),

  floorObject('obj:test:0:east:counter:0', 'counter', 0, 'room:test:0:east', { mount: 'floor', x: 35.5, y: 28.4, rotation: 0 }, false),
  floorObject('obj:test:0:east:counter:1', 'counter', 0, 'room:test:0:east', { mount: 'floor', x: 37.0, y: 28.4, rotation: 0 }, false),
  floorObject('obj:test:0:east:fridge:0', 'fridge', 0, 'room:test:0:east', { mount: 'floor', x: 39.1, y: 29.0, rotation: 0 }, true),
  floorObject('obj:test:0:east:table:0', 'table', 0, 'room:test:0:east', { mount: 'floor', x: 36.5, y: 34.8, rotation: 0 }, false),
  floorObject('obj:test:0:east:chair:0', 'chair', 0, 'room:test:0:east', { mount: 'floor', x: 36.5, y: 35.85, rotation: 0 }, false),
  wallObject('obj:test:0:east:clock:0', 'clock', 0, 'room:test:0:east', 'w:test:0:north', 15.2, 1.8),

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
];

export const TEST_OPENING_STATES: OpeningStateSnapshot = {
  doors: [{ openingId: 'o:test:0:door', open: false, locked: false, hp: 100, revision: 0 }],
  windows: [{ openingId: 'o:test:0:window', broken: false, boarded: false, hp: 100, revision: 0 }],
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
