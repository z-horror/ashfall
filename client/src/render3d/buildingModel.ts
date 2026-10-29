export type MaterialKey = 'brick' | 'brickWeathered' | 'plaster' | 'wood' | 'concrete' | 'tar' | 'metal';

export interface RectM {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Vec3M {
  x: number;
  y: number;
  z: number;
}

export interface LevelModel {
  id: string;
  index: number;
  kind: 'basement' | 'ground' | 'upper' | 'mansard' | 'roof';
  elevation: number;
  clearHeight: number;
  floorThickness: number;
}

export interface PlinthModel {
  rect: RectM;
  heightM: number;
  thicknessM: number;
  material: MaterialKey;
}

export interface OpeningModel {
  /** Coordinates along the wall axis (world x for h-walls, world y for v-walls). */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  kind: 'door' | 'window' | 'arch';
  hinge?: 'left' | 'right';
  open?: boolean;
}

export interface SlabModel {
  id: string;
  levelId: string;
  kind: 'floor' | 'ceiling' | 'roof' | 'terrace' | 'basement';
  rect: RectM;
  zBottom: number;
  zTop: number;
  material: MaterialKey;
  holes?: RectM[];
}

export interface WallModel {
  id: string;
  levelId: string;
  axis: 'h' | 'v';
  fixedM: number;
  fromM: number;
  toM: number;
  zBottom: number;
  zTop: number;
  thicknessM: number;
  exterior: boolean;
  material: MaterialKey;
  openings?: OpeningModel[];
}

export interface StairModel {
  id: string;
  levelId: string;
  hole: RectM;
  fromZ: number;
  toZ: number;
  widthM: number;
  riseM: number;
  treadM: number;
  steps: number;
  direction: 'up' | 'down';
}

export interface FixtureModel {
  id: string;
  levelId: string;
  kind: 'ac' | 'vent' | 'tank' | 'hatch';
  xM: number;
  yM: number;
  zM: number;
  widthM: number;
  depthM: number;
  heightM: number;
  /** Rotation around world Z in radians. 0 means the front faces +Y (south). */
  yaw?: number;
}

export type SurfaceRef =
  | { kind: 'wall'; id: string; side: 'front' | 'back' }
  | { kind: 'slab'; id: string }
  | { kind: 'plinth'; side: 'north' | 'south' | 'east' | 'west' };

export type DecalTexture = 'ivy' | 'brickDamage' | 'puddle' | 'tarPatch';

export interface DecalModel {
  id: string;
  host: SurfaceRef;
  /** Along the surface: world x for h-walls/slabs, world y for v-walls/slabs. */
  u0: number;
  u1: number;
  /** Vertical coordinate for walls/plinth; second horizontal axis for slabs. */
  v0: number;
  v1: number;
  texture: DecalTexture;
  opacity?: number;
  offsetM?: number;
}

export interface PipeModel {
  id: string;
  host: SurfaceRef;
  points: Vec3M[];
  radiusM: number;
  material: MaterialKey;
}

export type PropKind = 'pallet' | 'crate' | 'trash' | 'weeds';

export interface PropModel {
  id: string;
  kind: PropKind;
  xM: number;
  yM: number;
  zM: number;
  yaw?: number;
  scale?: number;
}

export interface BuildingModel {
  id: string;
  footprint: RectM;
  levels: LevelModel[];
  plinth: PlinthModel;
  slabs: SlabModel[];
  walls: WallModel[];
  stairs: StairModel[];
  fixtures: FixtureModel[];
  decals: DecalModel[];
  pipes: PipeModel[];
  props: PropModel[];
}

const TILE = 1.6;
const ORIGIN_X = 28;
const ORIGIN_Y = 28;

const mx = (tileX: number): number => (tileX - ORIGIN_X) * TILE;
const my = (tileY: number): number => (tileY - ORIGIN_Y) * TILE;

/**
 * Metric seed of the actual TEST_BUILDING. The numbers are deliberately taken
 * from the same tile coordinates as server/src/game/buildings/testBuilding.ts,
 * so the PoC can be compared with the current renderer without touching it.
 */
export function createTestBuildingModel(): BuildingModel {
  const footprint = { x: 0, y: 0, w: mx(40), h: my(37) };
  const southWall = my(37);
  const mansardSouth = my(33);
  const eastWall = footprint.w;

  return {
    id: 'b:v3:test:28:28',
    footprint,
    levels: [
      { id: 'basement', index: -1, kind: 'basement', elevation: -3, clearHeight: 3, floorThickness: 0.4 },
      { id: 'ground', index: 0, kind: 'ground', elevation: 0, clearHeight: 2.8, floorThickness: 0.4 },
      { id: 'mansard', index: 1, kind: 'mansard', elevation: 2.8, clearHeight: 2.6, floorThickness: 0.4 },
      { id: 'roof', index: 2, kind: 'roof', elevation: 5.4, clearHeight: 0.4, floorThickness: 0 },
    ],
    plinth: {
      rect: footprint,
      heightM: 0.45,
      thicknessM: 0.16,
      material: 'concrete',
    },
    slabs: [
      {
        id: 'basement:floor',
        levelId: 'basement',
        kind: 'basement',
        rect: { x: 0, y: 0, w: footprint.w, h: footprint.h },
        zBottom: -3.4,
        zTop: -3.0,
        material: 'concrete',
      },
      {
        id: 'ground:floor',
        levelId: 'ground',
        kind: 'floor',
        rect: { x: 0, y: 0, w: footprint.w, h: footprint.h },
        zBottom: -0.4,
        zTop: 0,
        material: 'wood',
        holes: [{ x: mx(37), y: my(29), w: TILE, h: my(32) - my(29) }],
      },
      {
        id: 'mansard:floor',
        levelId: 'mansard',
        kind: 'floor',
        rect: { x: 0, y: 0, w: footprint.w, h: mansardSouth },
        zBottom: 2.4,
        zTop: 2.8,
        material: 'wood',
        holes: [{ x: mx(34), y: my(29), w: TILE, h: my(32) - my(29) }],
      },
      {
        id: 'terrace:slab',
        levelId: 'mansard',
        kind: 'terrace',
        rect: { x: 0, y: mansardSouth, w: footprint.w, h: footprint.h - mansardSouth },
        zBottom: 2.8,
        zTop: 3.05,
        material: 'tar',
      },
      {
        id: 'mansard:roof',
        levelId: 'roof',
        kind: 'roof',
        rect: { x: 0, y: 0, w: footprint.w, h: mansardSouth },
        zBottom: 5.4,
        zTop: 5.55,
        material: 'tar',
      },
    ],
    walls: [
      { id: 'bf:north', levelId: 'basement', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: -3, zTop: 0, thicknessM: 0.25, exterior: true, material: 'concrete' },
      { id: 'bf:south', levelId: 'basement', axis: 'h', fixedM: southWall, fromM: 0, toM: footprint.w, zBottom: -3, zTop: 0, thicknessM: 0.25, exterior: true, material: 'concrete' },
      { id: 'bf:west', levelId: 'basement', axis: 'v', fixedM: 0, fromM: 0, toM: southWall, zBottom: -3, zTop: 0, thicknessM: 0.25, exterior: true, material: 'concrete' },
      { id: 'bf:east', levelId: 'basement', axis: 'v', fixedM: eastWall, fromM: 0, toM: southWall, zBottom: -3, zTop: 0, thicknessM: 0.25, exterior: true, material: 'concrete' },
      { id: 'gf:north', levelId: 'ground', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: 0, zTop: 2.8, thicknessM: 0.2, exterior: true, material: 'brick' },
      {
        id: 'gf:south',
        levelId: 'ground',
        axis: 'h',
        fixedM: southWall,
        fromM: 0,
        toM: footprint.w,
        zBottom: 0,
        zTop: 2.8,
        thicknessM: 0.2,
        exterior: true,
        material: 'brick',
        openings: [
          { x0: mx(34.5), x1: mx(35.5), z0: 0, z1: 2.1, kind: 'door', hinge: 'right' },
          { x0: mx(30), x1: mx(31), z0: 0.9, z1: 2.1, kind: 'window' },
          { x0: mx(37.5), x1: mx(38.5), z0: 0.9, z1: 2.1, kind: 'window' },
        ],
      },
      { id: 'gf:west', levelId: 'ground', axis: 'v', fixedM: 0, fromM: 0, toM: southWall, zBottom: 0, zTop: 2.8, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'gf:east', levelId: 'ground', axis: 'v', fixedM: eastWall, fromM: 0, toM: southWall, zBottom: 0, zTop: 2.8, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'gf:partWest', levelId: 'ground', axis: 'v', fixedM: mx(33), fromM: 0, toM: southWall, zBottom: 0, zTop: 2.8, thicknessM: 0.15, exterior: false, material: 'plaster' },
      { id: 'gf:partEast', levelId: 'ground', axis: 'v', fixedM: mx(36), fromM: 0, toM: southWall, zBottom: 0, zTop: 2.8, thicknessM: 0.15, exterior: false, material: 'plaster' },

      { id: 'mf:north', levelId: 'mansard', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: 2.8, zTop: 5.4, thicknessM: 0.2, exterior: true, material: 'brick' },
      {
        id: 'mf:south',
        levelId: 'mansard',
        axis: 'h',
        fixedM: mansardSouth,
        fromM: 0,
        toM: footprint.w,
        zBottom: 2.8,
        zTop: 5.4,
        thicknessM: 0.2,
        exterior: true,
        material: 'brick',
        openings: [
          { x0: mx(34.5), x1: mx(35.5), z0: 2.8, z1: 4.9, kind: 'door', hinge: 'right' },
          { x0: mx(30), x1: mx(31), z0: 3.7, z1: 4.9, kind: 'window' },
          { x0: mx(37.5), x1: mx(38.5), z0: 3.7, z1: 4.9, kind: 'window' },
        ],
      },
      { id: 'mf:west', levelId: 'mansard', axis: 'v', fixedM: 0, fromM: 0, toM: mansardSouth, zBottom: 2.8, zTop: 5.4, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'mf:east', levelId: 'mansard', axis: 'v', fixedM: eastWall, fromM: 0, toM: mansardSouth, zBottom: 2.8, zTop: 5.4, thicknessM: 0.2, exterior: true, material: 'brick' },

      // Recessed upper roof: the parapet continues above the roof surface and
      // hides the slab edge, so the roof does not sit on the walls like a layer.
      { id: 'rf:parapet:north', levelId: 'roof', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: 5.4, zTop: 5.9, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'rf:parapet:south', levelId: 'roof', axis: 'h', fixedM: mansardSouth, fromM: 0, toM: footprint.w, zBottom: 5.4, zTop: 5.9, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'rf:parapet:west', levelId: 'roof', axis: 'v', fixedM: 0, fromM: 0, toM: mansardSouth, zBottom: 5.4, zTop: 5.9, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'rf:parapet:east', levelId: 'roof', axis: 'v', fixedM: eastWall, fromM: 0, toM: mansardSouth, zBottom: 5.4, zTop: 5.9, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'rf:cap:north', levelId: 'roof', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: 5.9, zTop: 5.96, thicknessM: 0.24, exterior: true, material: 'concrete' },
      { id: 'rf:cap:south', levelId: 'roof', axis: 'h', fixedM: mansardSouth, fromM: 0, toM: footprint.w, zBottom: 5.9, zTop: 5.96, thicknessM: 0.24, exterior: true, material: 'concrete' },
      { id: 'rf:cap:west', levelId: 'roof', axis: 'v', fixedM: 0, fromM: 0, toM: mansardSouth, zBottom: 5.9, zTop: 5.96, thicknessM: 0.24, exterior: true, material: 'concrete' },
      { id: 'rf:cap:east', levelId: 'roof', axis: 'v', fixedM: eastWall, fromM: 0, toM: mansardSouth, zBottom: 5.9, zTop: 5.96, thicknessM: 0.24, exterior: true, material: 'concrete' },

      // The lower roof terrace is recessed behind the same kind of parapet.
      { id: 'tf:parapet:south', levelId: 'mansard', axis: 'h', fixedM: southWall, fromM: 0, toM: footprint.w, zBottom: 2.8, zTop: 3.35, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'tf:parapet:west', levelId: 'mansard', axis: 'v', fixedM: 0, fromM: mansardSouth + 0.105, toM: southWall, zBottom: 2.8, zTop: 3.35, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'tf:parapet:east', levelId: 'mansard', axis: 'v', fixedM: eastWall, fromM: mansardSouth + 0.105, toM: southWall, zBottom: 2.8, zTop: 3.35, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'tf:cap:south', levelId: 'mansard', axis: 'h', fixedM: southWall, fromM: 0, toM: footprint.w, zBottom: 3.35, zTop: 3.41, thicknessM: 0.24, exterior: true, material: 'concrete' },
      { id: 'tf:cap:west', levelId: 'mansard', axis: 'v', fixedM: 0, fromM: mansardSouth + 0.105, toM: southWall, zBottom: 3.35, zTop: 3.41, thicknessM: 0.24, exterior: true, material: 'concrete' },
      { id: 'tf:cap:east', levelId: 'mansard', axis: 'v', fixedM: eastWall, fromM: mansardSouth + 0.105, toM: southWall, zBottom: 3.35, zTop: 3.41, thicknessM: 0.24, exterior: true, material: 'concrete' },
    ],
    stairs: [
      {
        id: 'stair:basement',
        levelId: 'ground',
        hole: { x: mx(37), y: my(29), w: TILE, h: my(32) - my(29) },
        fromZ: 0,
        toZ: -3,
        widthM: 1.0,
        riseM: 0.2,
        treadM: 0.28,
        steps: 15,
        direction: 'down',
      },
      {
        id: 'stair:mansard',
        levelId: 'ground',
        hole: { x: mx(34), y: my(29), w: TILE, h: my(32) - my(29) },
        fromZ: 0,
        toZ: 2.8,
        widthM: 1.0,
        riseM: 0.2,
        treadM: 0.28,
        steps: 14,
        direction: 'up',
      },
    ],
    fixtures: [
      { id: 'fixture:ac', levelId: 'mansard', kind: 'ac', xM: mx(38), yM: my(35), zM: 3.05, widthM: 1.0, depthM: 0.9, heightM: 0.9, yaw: 0 },
      { id: 'fixture:hatch', levelId: 'roof', kind: 'hatch', xM: mx(37), yM: my(30), zM: 5.77, widthM: 1.0, depthM: 1.0, heightM: 0.25 },
    ],
    decals: [
      {
        id: 'decal:ivy-east',
        host: { kind: 'wall', id: 'gf:east', side: 'front' },
        u0: 3.0,
        u1: 7.4,
        v0: 0.25,
        v1: 2.7,
        texture: 'ivy',
        offsetM: 0.016,
      },
      {
        id: 'decal:brick-damage',
        host: { kind: 'wall', id: 'gf:south', side: 'front' },
        u0: 5.4,
        u1: 7.6,
        v0: 0.45,
        v1: 1.9,
        texture: 'brickDamage',
        offsetM: 0.014,
      },
      {
        id: 'decal:terrace-puddle',
        host: { kind: 'slab', id: 'terrace:slab' },
        u0: 4.5,
        u1: 8.0,
        v0: 9.2,
        v1: 12.0,
        texture: 'puddle',
        offsetM: 0.006,
      },
      {
        id: 'decal:roof-tar',
        host: { kind: 'slab', id: 'mansard:roof' },
        u0: 2.5,
        u1: 9.0,
        v0: 1.2,
        v1: 6.4,
        texture: 'tarPatch',
        offsetM: 0.006,
      },
    ],
    pipes: [
      {
        id: 'pipe:downspout-east',
        host: { kind: 'wall', id: 'gf:east', side: 'front' },
        points: [
          { x: eastWall + 0.16, y: 2.4, z: 5.72 },
          { x: eastWall + 0.16, y: 2.4, z: 0.34 },
          { x: eastWall + 0.34, y: 2.4, z: 0.12 },
        ],
        radiusM: 0.055,
        material: 'metal',
      },
    ],
    props: [
      { id: 'prop:pallet', kind: 'pallet', xM: 4.6, yM: 16.6, zM: 0, yaw: 0.25 },
      { id: 'prop:crate', kind: 'crate', xM: 7.0, yM: 16.2, zM: 0, yaw: -0.2 },
      { id: 'prop:trash', kind: 'trash', xM: 15.6, yM: 16.0, zM: 0, yaw: 0.5 },
      { id: 'prop:weeds-a', kind: 'weeds', xM: 1.8, yM: 15.6, zM: 0, yaw: 0.2 },
      { id: 'prop:weeds-b', kind: 'weeds', xM: 18.2, yM: 15.8, zM: 0, yaw: 1.1 },
    ],
  };
}

/**
 * Second, deliberately different building: three storeys above ground, a flat
 * roof with a parapet, a different plinth and its own interior partitions.
 * This exists to prove that the renderer is model-driven, not hardcoded to the
 * test manor.
 */
export function createVariantBuildingModel(): BuildingModel {
  const footprint = { x: 0, y: 0, w: 10 * TILE, h: 8 * TILE };
  const south = footprint.h;
  const east = footprint.w;
  const upper1Z = 3.0;
  const upper2Z = 6.0;
  const roofZ = 8.7;

  return {
    id: 'b:v3:variant:3-storey',
    footprint,
    levels: [
      { id: 'ground', index: 0, kind: 'ground', elevation: 0, clearHeight: 2.8, floorThickness: 0.3 },
      { id: 'upper1', index: 1, kind: 'upper', elevation: upper1Z, clearHeight: 2.7, floorThickness: 0.3 },
      { id: 'upper2', index: 2, kind: 'upper', elevation: upper2Z, clearHeight: 2.7, floorThickness: 0.3 },
      { id: 'roof', index: 3, kind: 'roof', elevation: roofZ, clearHeight: 0.3, floorThickness: 0 },
    ],
    plinth: {
      rect: footprint,
      heightM: 0.5,
      thicknessM: 0.18,
      material: 'concrete',
    },
    slabs: [
      { id: 'ground:floor', levelId: 'ground', kind: 'floor', rect: { x: 0, y: 0, w: footprint.w, h: footprint.h }, zBottom: -0.3, zTop: 0, material: 'wood' },
      {
        id: 'upper1:floor',
        levelId: 'upper1',
        kind: 'floor',
        rect: { x: 0, y: 0, w: footprint.w, h: footprint.h },
        zBottom: 2.7,
        zTop: 3.0,
        material: 'wood',
        holes: [{ x: 4.0, y: 2.0, w: 1.2, h: 5.0 }],
      },
      {
        id: 'upper2:floor',
        levelId: 'upper2',
        kind: 'floor',
        rect: { x: 0, y: 0, w: footprint.w, h: footprint.h },
        zBottom: 5.7,
        zTop: 6.0,
        material: 'wood',
        holes: [{ x: 10.8, y: 2.0, w: 1.2, h: 5.0 }],
      },
      { id: 'roof:slab', levelId: 'roof', kind: 'roof', rect: { x: 0, y: 0, w: footprint.w, h: footprint.h }, zBottom: roofZ, zTop: roofZ + 0.25, material: 'tar' },
    ],
    walls: [
      {
        id: 'ground:south',
        levelId: 'ground',
        axis: 'h',
        fixedM: south,
        fromM: 0,
        toM: footprint.w,
        zBottom: 0,
        zTop: 2.8,
        thicknessM: 0.2,
        exterior: true,
        material: 'brick',
        openings: [
          { x0: 6.0, x1: 7.2, z0: 0, z1: 2.1, kind: 'door', hinge: 'left' },
          { x0: 2.0, x1: 3.2, z0: 0.9, z1: 2.1, kind: 'window' },
          { x0: 12.0, x1: 13.2, z0: 0.9, z1: 2.1, kind: 'window' },
        ],
      },
      { id: 'ground:north', levelId: 'ground', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: 0, zTop: 2.8, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'ground:west', levelId: 'ground', axis: 'v', fixedM: 0, fromM: 0, toM: south, zBottom: 0, zTop: 2.8, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'ground:east', levelId: 'ground', axis: 'v', fixedM: east, fromM: 0, toM: south, zBottom: 0, zTop: 2.8, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'ground:partition', levelId: 'ground', axis: 'v', fixedM: 8.0, fromM: 0, toM: south, zBottom: 0, zTop: 2.8, thicknessM: 0.15, exterior: false, material: 'plaster' },

      {
        id: 'upper1:south',
        levelId: 'upper1',
        axis: 'h',
        fixedM: south,
        fromM: 0,
        toM: footprint.w,
        zBottom: upper1Z,
        zTop: upper1Z + 2.7,
        thicknessM: 0.2,
        exterior: true,
        material: 'brick',
        openings: [
          { x0: 2.0, x1: 3.2, z0: upper1Z + 0.9, z1: upper1Z + 2.1, kind: 'window' },
          { x0: 11.0, x1: 12.2, z0: upper1Z + 0.9, z1: upper1Z + 2.1, kind: 'window' },
        ],
      },
      { id: 'upper1:north', levelId: 'upper1', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: upper1Z, zTop: upper1Z + 2.7, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'upper1:west', levelId: 'upper1', axis: 'v', fixedM: 0, fromM: 0, toM: south, zBottom: upper1Z, zTop: upper1Z + 2.7, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'upper1:east', levelId: 'upper1', axis: 'v', fixedM: east, fromM: 0, toM: south, zBottom: upper1Z, zTop: upper1Z + 2.7, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'upper1:partition', levelId: 'upper1', axis: 'h', fixedM: 9.0, fromM: 0, toM: footprint.w, zBottom: upper1Z, zTop: upper1Z + 2.7, thicknessM: 0.15, exterior: false, material: 'plaster' },

      {
        id: 'upper2:south',
        levelId: 'upper2',
        axis: 'h',
        fixedM: south,
        fromM: 0,
        toM: footprint.w,
        zBottom: upper2Z,
        zTop: upper2Z + 2.7,
        thicknessM: 0.2,
        exterior: true,
        material: 'brick',
        openings: [
          { x0: 3.0, x1: 4.2, z0: upper2Z + 0.9, z1: upper2Z + 2.1, kind: 'window' },
          { x0: 10.0, x1: 11.2, z0: upper2Z + 0.9, z1: upper2Z + 2.1, kind: 'window' },
        ],
      },
      { id: 'upper2:north', levelId: 'upper2', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: upper2Z, zTop: upper2Z + 2.7, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'upper2:west', levelId: 'upper2', axis: 'v', fixedM: 0, fromM: 0, toM: south, zBottom: upper2Z, zTop: upper2Z + 2.7, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'upper2:east', levelId: 'upper2', axis: 'v', fixedM: east, fromM: 0, toM: south, zBottom: upper2Z, zTop: upper2Z + 2.7, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'upper2:partition', levelId: 'upper2', axis: 'v', fixedM: 8.0, fromM: 0, toM: south, zBottom: upper2Z, zTop: upper2Z + 2.7, thicknessM: 0.15, exterior: false, material: 'plaster' },

      { id: 'roof:parapet-n', levelId: 'roof', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: roofZ, zTop: roofZ + 0.7, thicknessM: 0.2, exterior: true, material: 'concrete' },
      { id: 'roof:parapet-s', levelId: 'roof', axis: 'h', fixedM: south, fromM: 0, toM: footprint.w, zBottom: roofZ, zTop: roofZ + 0.7, thicknessM: 0.2, exterior: true, material: 'concrete' },
      { id: 'roof:parapet-w', levelId: 'roof', axis: 'v', fixedM: 0, fromM: 0, toM: south, zBottom: roofZ, zTop: roofZ + 0.7, thicknessM: 0.2, exterior: true, material: 'concrete' },
      { id: 'roof:parapet-e', levelId: 'roof', axis: 'v', fixedM: east, fromM: 0, toM: south, zBottom: roofZ, zTop: roofZ + 0.7, thicknessM: 0.2, exterior: true, material: 'concrete' },
      { id: 'roof:cap-n', levelId: 'roof', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: roofZ + 0.7, zTop: roofZ + 0.76, thicknessM: 0.24, exterior: true, material: 'concrete' },
      { id: 'roof:cap-s', levelId: 'roof', axis: 'h', fixedM: south, fromM: 0, toM: footprint.w, zBottom: roofZ + 0.7, zTop: roofZ + 0.76, thicknessM: 0.24, exterior: true, material: 'concrete' },
      { id: 'roof:cap-w', levelId: 'roof', axis: 'v', fixedM: 0, fromM: 0, toM: south, zBottom: roofZ + 0.7, zTop: roofZ + 0.76, thicknessM: 0.24, exterior: true, material: 'concrete' },
      { id: 'roof:cap-e', levelId: 'roof', axis: 'v', fixedM: east, fromM: 0, toM: south, zBottom: roofZ + 0.7, zTop: roofZ + 0.76, thicknessM: 0.24, exterior: true, material: 'concrete' },
    ],
    stairs: [
      {
        id: 'stair:upper1',
        levelId: 'ground',
        hole: { x: 4.0, y: 2.0, w: 1.2, h: 5.0 },
        fromZ: 0,
        toZ: upper1Z,
        widthM: 1.0,
        riseM: 0.2,
        treadM: 0.28,
        steps: 15,
        direction: 'up',
      },
      {
        id: 'stair:upper2',
        levelId: 'upper1',
        hole: { x: 10.8, y: 2.0, w: 1.2, h: 5.0 },
        fromZ: upper1Z,
        toZ: upper2Z,
        widthM: 1.0,
        riseM: 0.2,
        treadM: 0.28,
        steps: 15,
        direction: 'up',
      },
    ],
    fixtures: [
      { id: 'fixture:roof-ac', levelId: 'roof', kind: 'ac', xM: 12.0, yM: 4.0, zM: roofZ + 0.25, widthM: 1.0, depthM: 0.9, heightM: 0.9, yaw: 0.35 },
    ],
    decals: [
      {
        id: 'decal:variant-ivy',
        host: { kind: 'wall', id: 'ground:east', side: 'front' },
        u0: 2.0,
        u1: 6.5,
        v0: 0.3,
        v1: 2.6,
        texture: 'ivy',
        offsetM: 0.016,
      },
      {
        id: 'decal:variant-damage',
        host: { kind: 'wall', id: 'ground:south', side: 'front' },
        u0: 9.0,
        u1: 11.2,
        v0: 0.5,
        v1: 1.9,
        texture: 'brickDamage',
        offsetM: 0.014,
      },
      {
        id: 'decal:variant-puddle',
        host: { kind: 'slab', id: 'roof:slab' },
        u0: 4.5,
        u1: 8.0,
        v0: 2.0,
        v1: 4.2,
        texture: 'puddle',
        offsetM: 0.006,
      },
    ],
    pipes: [
      {
        id: 'pipe:variant-east',
        host: { kind: 'wall', id: 'ground:east', side: 'front' },
        points: [
          { x: east + 0.16, y: 2.2, z: roofZ },
          { x: east + 0.16, y: 2.2, z: 0.4 },
          { x: east + 0.34, y: 2.2, z: 0.16 },
        ],
        radiusM: 0.05,
        material: 'metal',
      },
    ],
    props: [
      { id: 'prop:variant-pallet', kind: 'pallet', xM: 2.0, yM: 14.4, zM: 0, yaw: 0.4 },
      { id: 'prop:variant-crate', kind: 'crate', xM: 5.0, yM: 14.1, zM: 0, yaw: -0.3 },
      { id: 'prop:variant-trash', kind: 'trash', xM: 13.0, yM: 14.2, zM: 0, yaw: 0.2 },
      { id: 'prop:variant-weeds-a', kind: 'weeds', xM: 1.0, yM: 13.6, zM: 0, yaw: 0.8 },
      { id: 'prop:variant-weeds-b', kind: 'weeds', xM: 15.0, yM: 13.8, zM: 0, yaw: 2.1 },
    ],
  };
}
