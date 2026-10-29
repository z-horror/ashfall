export type MaterialKey = 'brick' | 'brickWeathered' | 'plaster' | 'wood' | 'concrete' | 'tar' | 'metal';

export interface RectM {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OpeningModel {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  kind: 'door' | 'window';
}

export interface SlabModel {
  id: string;
  kind: 'floor' | 'ceiling' | 'roof' | 'terrace' | 'basement';
  rect: RectM;
  zBottom: number;
  zTop: number;
  material: MaterialKey;
  holes?: RectM[];
}

export interface WallModel {
  id: string;
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
  kind: 'ac' | 'vent' | 'tank' | 'hatch';
  xM: number;
  yM: number;
  zM: number;
  widthM: number;
  depthM: number;
  heightM: number;
}

export interface BuildingModel {
  id: string;
  footprint: RectM;
  slabs: SlabModel[];
  walls: WallModel[];
  stairs: StairModel[];
  fixtures: FixtureModel[];
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

  return {
    id: 'b:v3:test:28:28',
    footprint,
    slabs: [
      {
        id: 'basement:floor',
        kind: 'basement',
        rect: { x: 0, y: 0, w: footprint.w, h: footprint.h },
        zBottom: -3.4,
        zTop: -3.0,
        material: 'concrete',
      },
      {
        id: 'ground:floor',
        kind: 'floor',
        rect: { x: 0, y: 0, w: footprint.w, h: footprint.h },
        zBottom: -0.4,
        zTop: 0,
        material: 'wood',
        holes: [{ x: mx(37), y: my(29), w: TILE, h: my(32) - my(29) }],
      },
      {
        id: 'mansard:floor',
        kind: 'floor',
        rect: { x: 0, y: 0, w: footprint.w, h: mansardSouth },
        zBottom: 2.4,
        zTop: 2.8,
        material: 'wood',
        holes: [{ x: mx(34), y: my(29), w: TILE, h: my(32) - my(29) }],
      },
      {
        id: 'terrace:slab',
        kind: 'terrace',
        rect: { x: 0, y: mansardSouth, w: footprint.w, h: footprint.h - mansardSouth },
        zBottom: 2.8,
        zTop: 3.05,
        material: 'tar',
      },
      {
        id: 'mansard:roof',
        kind: 'roof',
        rect: { x: 0, y: 0, w: footprint.w, h: mansardSouth },
        zBottom: 5.4,
        zTop: 5.8,
        material: 'tar',
      },
    ],
    walls: [
      { id: 'bf:north', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: -3, zTop: 0, thicknessM: 0.25, exterior: true, material: 'concrete' },
      { id: 'bf:south', axis: 'h', fixedM: southWall, fromM: 0, toM: footprint.w, zBottom: -3, zTop: 0, thicknessM: 0.25, exterior: true, material: 'concrete' },
      { id: 'bf:west', axis: 'v', fixedM: 0, fromM: 0, toM: southWall, zBottom: -3, zTop: 0, thicknessM: 0.25, exterior: true, material: 'concrete' },
      { id: 'bf:east', axis: 'v', fixedM: footprint.w, fromM: 0, toM: southWall, zBottom: -3, zTop: 0, thicknessM: 0.25, exterior: true, material: 'concrete' },
      { id: 'gf:north', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: 0, zTop: 2.8, thicknessM: 0.2, exterior: true, material: 'brick' },
      {
        id: 'gf:south',
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
          { x0: mx(34.5), x1: mx(35.5), z0: 0, z1: 2.1, kind: 'door' },
          { x0: mx(30), x1: mx(31), z0: 0.9, z1: 2.1, kind: 'window' },
          { x0: mx(37.5), x1: mx(38.5), z0: 0.9, z1: 2.1, kind: 'window' },
        ],
      },
      { id: 'gf:west', axis: 'v', fixedM: 0, fromM: 0, toM: southWall, zBottom: 0, zTop: 2.8, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'gf:east', axis: 'v', fixedM: footprint.w, fromM: 0, toM: southWall, zBottom: 0, zTop: 2.8, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'gf:partWest', axis: 'v', fixedM: mx(33), fromM: 0, toM: southWall, zBottom: 0, zTop: 2.8, thicknessM: 0.15, exterior: false, material: 'plaster' },
      { id: 'gf:partEast', axis: 'v', fixedM: mx(36), fromM: 0, toM: southWall, zBottom: 0, zTop: 2.8, thicknessM: 0.15, exterior: false, material: 'plaster' },

      { id: 'mf:north', axis: 'h', fixedM: 0, fromM: 0, toM: footprint.w, zBottom: 2.8, zTop: 5.4, thicknessM: 0.2, exterior: true, material: 'brick' },
      {
        id: 'mf:south',
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
          { x0: mx(34.5), x1: mx(35.5), z0: 2.8, z1: 4.9, kind: 'door' },
          { x0: mx(30), x1: mx(31), z0: 3.7, z1: 4.9, kind: 'window' },
          { x0: mx(37.5), x1: mx(38.5), z0: 3.7, z1: 4.9, kind: 'window' },
        ],
      },
      { id: 'mf:west', axis: 'v', fixedM: 0, fromM: 0, toM: mansardSouth, zBottom: 2.8, zTop: 5.4, thicknessM: 0.2, exterior: true, material: 'brick' },
      { id: 'mf:east', axis: 'v', fixedM: footprint.w, fromM: 0, toM: mansardSouth, zBottom: 2.8, zTop: 5.4, thicknessM: 0.2, exterior: true, material: 'brick' },
    ],
    stairs: [
      {
        id: 'stair:basement',
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
      { id: 'fixture:ac', kind: 'ac', xM: mx(38), yM: my(35), zM: 3.05, widthM: 1.0, depthM: 0.9, heightM: 0.9 },
      { id: 'fixture:hatch', kind: 'hatch', xM: mx(37), yM: my(30), zM: 5.8, widthM: 1.0, depthM: 1.0, heightM: 0.25 },
    ],
  };
}
