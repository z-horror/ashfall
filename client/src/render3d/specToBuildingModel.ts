import {
  TILE_SIZE_M,
  type BuildingSpec,
  type FloorSpec,
  type RoofFixtureSpec,
  type RoofSpec,
  type StairSpec,
  type TileRect,
  type WallMaterial,
  type WallRun,
} from '@ashfall/shared';
import type {
  BuildingModel,
  DecalModel,
  FixtureModel,
  LevelModel,
  MaterialKey,
  OpeningModel,
  PipeModel,
  PlinthModel,
  PropModel,
  RectM,
  SlabModel,
  StairModel,
  WallModel,
} from './buildingModel.js';

export interface ConvertedBuilding {
  model: BuildingModel;
  worldPosition: { x: number; y: number };
}

const TILE = TILE_SIZE_M;

const levelId = (level: number): string => `level:${level}`;

function tileRectToMeters(rect: TileRect, origin: { x: number; y: number }): RectM {
  return {
    x: (rect.x - origin.x) * TILE,
    y: (rect.y - origin.y) * TILE,
    w: rect.w * TILE,
    h: rect.h * TILE,
  };
}

function mapWallMaterial(material: WallMaterial): MaterialKey {
  switch (material) {
    case 'brick':
      return 'brick';
    case 'concrete':
      return 'concrete';
    case 'industrial':
      return 'brickWeathered';
    case 'interior':
      return 'plaster';
  }
}

function mapSurfaceMaterial(material: string): MaterialKey {
  if (material === 'wood' || material === 'carpet') return 'wood';
  if (material === 'concrete' || material === 'tile') return 'concrete';
  if (material === 'tar' || material === 'roof') return 'tar';
  return 'concrete';
}

function collectCells(building: BuildingSpec): TileRect[] {
  const cells: TileRect[] = [];
  for (const floor of building.floors) {
    cells.push(...floor.floor.cells);
    for (const walkable of floor.walkable ?? []) cells.push(walkable);
  }
  if (building.roof) cells.push(...building.roof.cells);
  return cells;
}

function boundsOf(cells: TileRect[], fallback: { x: number; y: number }): { x: number; y: number; w: number; h: number } {
  if (cells.length === 0) return { x: fallback.x, y: fallback.y, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x + cell.w);
    maxY = Math.max(maxY, cell.y + cell.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - 1e-4 && b0 < a1 - 1e-4;
}

function addWall(
  model: BuildingModel,
  run: WallRun,
  floor: FloorSpec,
  origin: { x: number; y: number },
  openings: OpeningModel[],
): void {
  const axisOrigin = run.axis === 'h' ? origin.x : origin.y;
  model.walls.push({
    id: run.id,
    levelId: levelId(run.level),
    axis: run.axis,
    fixedM: (run.fixed - axisOrigin) * TILE,
    fromM: (run.from - axisOrigin) * TILE,
    toM: (run.to - axisOrigin) * TILE,
    zBottom: floor.elevationM,
    zTop: floor.elevationM + run.heightM,
    thicknessM: run.thicknessM,
    exterior: run.material !== 'interior',
    material: mapWallMaterial(run.material),
    openings,
  });
}

function addParapet(
  model: BuildingModel,
  id: string,
  level: string,
  axis: 'h' | 'v',
  fixedM: number,
  fromM: number,
  toM: number,
  zBottom: number,
  zTop: number,
): void {
  const parapet = Math.max(0.3, zTop - zBottom);
  model.walls.push({
    id: `${id}:parapet`,
    levelId: level,
    axis,
    fixedM,
    fromM,
    toM,
    zBottom,
    zTop: zBottom + parapet,
    thicknessM: 0.2,
    exterior: true,
    material: 'brick',
  });
  model.walls.push({
    id: `${id}:cap`,
    levelId: level,
    axis,
    fixedM,
    fromM,
    toM,
    zBottom: zBottom + parapet,
    zTop: zBottom + parapet + 0.06,
    thicknessM: 0.24,
    exterior: true,
    material: 'concrete',
  });
}

function addPerimeterParapet(
  model: BuildingModel,
  id: string,
  level: string,
  rect: RectM,
  zBottom: number,
  zTop: number,
): void {
  addParapet(model, `${id}:north`, level, 'h', rect.y, rect.x, rect.x + rect.w, zBottom, zTop);
  addParapet(model, `${id}:south`, level, 'h', rect.y + rect.h, rect.x, rect.x + rect.w, zBottom, zTop);
  addParapet(model, `${id}:west`, level, 'v', rect.x, rect.y, rect.y + rect.h, zBottom, zTop);
  addParapet(model, `${id}:east`, level, 'v', rect.x + rect.w, rect.y, rect.y + rect.h, zBottom, zTop);
}

function addWalkableParapet(
  model: BuildingModel,
  floor: FloorSpec,
  region: RectM,
  origin: { x: number; y: number },
  index: number,
): void {
  const floorRects = floor.floor.cells.map((cell) => tileRectToMeters(cell, origin));
  const touchesNorth = floorRects.some((rect) => Math.abs(rect.y + rect.h - region.y) < 1e-3 && overlaps(rect.x, rect.x + rect.w, region.x, region.x + region.w));
  const touchesSouth = floorRects.some((rect) => Math.abs(rect.y - (region.y + region.h)) < 1e-3 && overlaps(rect.x, rect.x + rect.w, region.x, region.x + region.w));
  const touchesWest = floorRects.some((rect) => Math.abs(rect.x + rect.w - region.x) < 1e-3 && overlaps(rect.y, rect.y + rect.h, region.y, region.y + region.h));
  const touchesEast = floorRects.some((rect) => Math.abs(rect.x - (region.x + region.w)) < 1e-3 && overlaps(rect.y, rect.y + rect.h, region.y, region.y + region.h));
  const zBottom = floor.elevationM;
  const zTop = Math.max(floor.elevationM + 0.35, (floor.walkable?.[index]?.elevationM ?? floor.elevationM) + 0.3);
  const id = `terrace:${floor.level}:${index}`;
  if (!touchesNorth) addParapet(model, `${id}:north`, levelId(floor.level), 'h', region.y, region.x, region.x + region.w, zBottom, zTop);
  if (!touchesSouth) addParapet(model, `${id}:south`, levelId(floor.level), 'h', region.y + region.h, region.x, region.x + region.w, zBottom, zTop);
  if (!touchesWest) addParapet(model, `${id}:west`, levelId(floor.level), 'v', region.x, region.y, region.y + region.h, zBottom, zTop);
  if (!touchesEast) addParapet(model, `${id}:east`, levelId(floor.level), 'v', region.x + region.w, region.y, region.y + region.h, zBottom, zTop);
}

function fixtureKind(fixture: RoofFixtureSpec): FixtureModel['kind'] {
  const key = fixture.textureKey.toLowerCase();
  if (key.includes('ac')) return 'ac';
  if (key.includes('tank')) return 'tank';
  if (key.includes('hatch')) return 'hatch';
  return 'vent';
}

function largestGap(wall: WallModel, minLength: number): { u0: number; u1: number } | null {
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.x0 - b.x0);
  const gaps: Array<{ u0: number; u1: number }> = [];
  let cursor = wall.fromM;
  for (const opening of openings) {
    if (opening.x0 - cursor >= minLength) gaps.push({ u0: cursor, u1: opening.x0 });
    cursor = Math.max(cursor, opening.x1);
  }
  if (wall.toM - cursor >= minLength) gaps.push({ u0: cursor, u1: wall.toM });
  gaps.sort((a, b) => (b.u1 - b.u0) - (a.u1 - a.u0));
  return gaps[0] ?? null;
}

function addAtmosphere(model: BuildingModel, roofElevation: number): void {
  const groundWalls = model.walls.filter((wall) => wall.levelId === 'level:0' && wall.exterior && !wall.id.includes('parapet') && !wall.id.includes('cap'));
  const walls = groundWalls.length > 0 ? groundWalls : model.walls.filter((wall) => wall.exterior && !wall.id.includes('parapet') && !wall.id.includes('cap'));
  const eastWall = walls.find((wall) => wall.axis === 'v' && wall.fixedM >= model.footprint.w / 2)
    ?? walls.find((wall) => wall.axis === 'v');
  const southWall = walls.find((wall) => wall.axis === 'h' && wall.fixedM >= model.footprint.h / 2)
    ?? walls.find((wall) => wall.axis === 'h');

  const ivyGap = eastWall ? largestGap(eastWall, 3.5) : null;
  if (eastWall && ivyGap) {
    model.decals.push({
      id: 'atmo:ivy',
      host: { kind: 'wall', id: eastWall.id, side: 'front' },
      u0: ivyGap.u0 + 0.45,
      u1: Math.min(ivyGap.u1 - 0.45, ivyGap.u0 + 4.4),
      v0: eastWall.zBottom + 0.3,
      v1: Math.min(eastWall.zTop - 0.2, eastWall.zBottom + 2.7),
      texture: 'ivy',
      frame: 0,
      offsetM: 0.016,
    });
  }

  const damageGap = southWall ? largestGap(southWall, 3.0) : null;
  if (southWall && damageGap) {
    model.decals.push({
      id: 'atmo:damage',
      host: { kind: 'wall', id: southWall.id, side: 'front' },
      u0: damageGap.u0 + 0.4,
      u1: Math.min(damageGap.u1 - 0.4, damageGap.u0 + 2.0),
      v0: southWall.zBottom + 0.5,
      v1: Math.min(southWall.zTop - 0.2, southWall.zBottom + 1.85),
      texture: 'brickDamage',
      frame: 0,
      offsetM: 0.014,
    });
  }

  const terrace = model.slabs.find((slab) => slab.kind === 'terrace');
  if (terrace) {
    model.decals.push({
      id: 'atmo:puddle',
      host: { kind: 'slab', id: terrace.id },
      u0: terrace.rect.x + terrace.rect.w * 0.28,
      u1: terrace.rect.x + terrace.rect.w * 0.28 + 2.6,
      v0: terrace.rect.y + terrace.rect.h * 0.32,
      v1: terrace.rect.y + terrace.rect.h * 0.32 + 2.2,
      texture: 'puddle',
      frame: 0,
      offsetM: 0.006,
    });
  }

  const roof = model.slabs.find((slab) => slab.kind === 'roof');
  if (roof) {
    model.decals.push({
      id: 'atmo:tar',
      host: { kind: 'slab', id: roof.id },
      u0: roof.rect.x + roof.rect.w * 0.15,
      u1: roof.rect.x + roof.rect.w * 0.15 + Math.min(5.5, roof.rect.w * 0.55),
      v0: roof.rect.y + roof.rect.h * 0.2,
      v1: roof.rect.y + roof.rect.h * 0.2 + Math.min(4.5, roof.rect.h * 0.55),
      texture: 'tarPatch',
      frame: 0,
      offsetM: 0.006,
    });
  }

  if (eastWall) {
    const x = eastWall.fixedM + eastWall.thicknessM / 2 + 0.16;
    const y = eastWall.fromM + 1.0;
    model.pipes.push({
      id: 'atmo:downspout',
      host: { kind: 'wall', id: eastWall.id, side: 'front' },
      points: [
        { x, y, z: Math.max(eastWall.zTop, roofElevation) },
        { x, y, z: 0.36 },
        { x: x + 0.18, y, z: 0.14 },
      ],
      radiusM: 0.055,
      material: 'metal',
    });
  }

  const southY = model.footprint.y + model.footprint.h + 1.6;
  const maxX = model.footprint.x + model.footprint.w;
  model.props.push(
    { id: 'atmo:pallet', kind: 'pallet', xM: model.footprint.x + Math.min(4, model.footprint.w * 0.22), yM: southY, zM: 0, yaw: 0.22 },
    { id: 'atmo:crate', kind: 'crate', xM: model.footprint.x + Math.min(7, model.footprint.w * 0.38), yM: southY - 0.4, zM: 0, yaw: -0.18 },
    { id: 'atmo:trash', kind: 'trash', xM: Math.max(model.footprint.x + 2, maxX - 3.5), yM: southY - 0.3, zM: 0, yaw: 0.45 },
    { id: 'atmo:weeds-a', kind: 'weeds', xM: model.footprint.x + 1.4, yM: southY - 0.9, zM: 0, yaw: 0.7 },
    { id: 'atmo:weeds-b', kind: 'weeds', xM: maxX - 1.2, yM: southY - 0.8, zM: 0, yaw: 1.9 },
  );
}

export function specToBuildingModel(building: BuildingSpec): ConvertedBuilding {
  const cells = collectCells(building);
  const origin = boundsOf(cells, building.origin);
  const footprint = {
    x: 0,
    y: 0,
    w: origin.w * TILE,
    h: origin.h * TILE,
  };

  const floors = [...building.floors].sort((a, b) => a.level - b.level);
  const maxLevel = floors.reduce((max, floor) => Math.max(max, floor.level), 0);
  const roofElevation = floors.reduce((max, floor) => Math.max(max, floor.elevationM + floor.clearHeightM), 0);

  const levels: LevelModel[] = floors.map((floor) => ({
    id: levelId(floor.level),
    index: floor.level,
    kind: floor.level < 0 ? 'basement' : floor.level === 0 ? 'ground' : 'upper',
    elevation: floor.elevationM,
    clearHeight: floor.clearHeightM,
    floorThickness: floor.floor.thicknessM,
  }));
  if (building.roof) {
    levels.push({
      id: 'roof',
      index: maxLevel + 1,
      kind: 'roof',
      elevation: roofElevation,
      clearHeight: 0.3,
      floorThickness: 0,
    });
  }

  const plinth: PlinthModel = {
    rect: footprint,
    heightM: 0.5,
    thicknessM: 0.18,
    material: 'concrete',
  };

  const model: BuildingModel = {
    id: building.id,
    footprint,
    levels,
    plinth,
    slabs: [],
    walls: [],
    stairs: [],
    fixtures: [],
    decals: [] as DecalModel[],
    pipes: [] as PipeModel[],
    props: [] as PropModel[],
  };

  for (const floor of floors) {
    const floorId = levelId(floor.level);
    const holes = (floor.floor.holes ?? []).map((hole) => tileRectToMeters(hole, origin));
    for (let index = 0; index < floor.floor.cells.length; index++) {
      const rect = tileRectToMeters(floor.floor.cells[index], origin);
      const slab: SlabModel = {
        id: `floor:${floor.level}:${index}`,
        levelId: floorId,
        kind: floor.level < 0 ? 'basement' : 'floor',
        rect,
        zBottom: floor.elevationM - floor.floor.thicknessM,
        zTop: floor.elevationM,
        material: mapSurfaceMaterial(floor.floor.material),
        holes,
      };
      model.slabs.push(slab);
    }

    for (let index = 0; index < (floor.walkable ?? []).length; index++) {
      const walkable = floor.walkable![index];
      const region = tileRectToMeters(walkable, origin);
      const slab: SlabModel = {
        id: `terrace:${floor.level}:${index}`,
        levelId: floorId,
        kind: 'terrace',
        rect: region,
        zBottom: walkable.elevationM - (walkable.thicknessM ?? 0.25),
        zTop: walkable.elevationM,
        material: 'tar',
      };
      model.slabs.push(slab);
      addWalkableParapet(model, floor, region, origin, index);
    }

    for (const run of floor.wallRuns) {
      const axisOrigin = run.axis === 'h' ? origin.x : run.axis === 'v' ? origin.y : origin.x;
      const openings = floor.openings
        .filter((opening) => opening.wallRunId === run.id)
        .map<OpeningModel>((opening) => {
          const start = (run.from - axisOrigin) * TILE + opening.startM;
          return {
            x0: start,
            x1: start + opening.widthM,
            z0: floor.elevationM + opening.sillM,
            z1: floor.elevationM + opening.sillM + opening.heightM,
            kind: opening.kind,
            hinge: 'right',
          };
        });
      addWall(model, run, floor, origin, openings);
    }

    for (const stair of floor.stairs) {
      if (model.stairs.some((candidate) => candidate.id === stair.id)) continue;
      const fromFloor = floors.find((candidate) => candidate.level === stair.fromLevel);
      const toFloor = floors.find((candidate) => candidate.level === stair.toLevel);
      const fromZ = fromFloor?.elevationM ?? floor.elevationM;
      const toZ = toFloor?.elevationM ?? fromZ;
      const converted: StairModel = {
        id: stair.id,
        levelId: levelId(stair.fromLevel),
        fromLevelId: levelId(stair.fromLevel),
        toLevelId: levelId(stair.toLevel),
        hole: tileRectToMeters(stair.hole, origin),
        fromZ,
        toZ,
        widthM: stair.widthM,
        riseM: stair.riseM,
        treadM: stair.treadM,
        steps: stair.steps,
        direction: stair.direction,
      };
      model.stairs.push(converted);
    }
  }

  if (building.roof) {
    const roof: RoofSpec = building.roof;
    const roofRects = roof.cells.map((cell) => tileRectToMeters(cell, origin));
    for (let index = 0; index < roofRects.length; index++) {
      const rect = roofRects[index];
      model.slabs.push({
        id: `roof:${index}`,
        levelId: 'roof',
        kind: 'roof',
        rect,
        zBottom: roofElevation,
        zTop: roofElevation + Math.min(roof.thicknessM, 0.2),
        material: 'tar',
      });
    }
    const bounds = boundsOf(roof.cells, origin);
    const roofRect = tileRectToMeters(bounds, origin);
    const parapet = Math.max(0.35, roof.parapetM ?? 0.4);
    addPerimeterParapet(model, 'roof', 'roof', roofRect, roofElevation, roofElevation + parapet);
  }

  for (const fixture of building.fixtures ?? []) {
    model.fixtures.push({
      id: fixture.id,
      levelId: levelId(fixture.level),
      kind: fixtureKind(fixture),
      xM: (fixture.x - origin.x) * TILE,
      yM: (fixture.y - origin.y) * TILE,
      zM: fixture.elevationM,
      widthM: fixture.widthM ?? 1.0,
      depthM: fixture.depthM ?? 0.9,
      heightM: fixtureKind(fixture) === 'ac' ? 0.9 : 0.45,
      yaw: 0,
    });
  }

  addAtmosphere(model, roofElevation);

  return {
    model,
    worldPosition: {
      x: origin.x * TILE,
      y: origin.y * TILE,
    },
  };
}
