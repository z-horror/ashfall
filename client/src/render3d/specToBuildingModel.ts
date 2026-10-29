import {
  TILE_SIZE_M,
  type BuildingSpec,
  type FloorSpec,
  type ObjectInstance,
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
  PropKind,
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
  const fixedOrigin = run.axis === 'h' ? origin.y : origin.x;
  const spanOrigin = run.axis === 'h' ? origin.x : origin.y;
  model.walls.push({
    id: run.id,
    levelId: levelId(run.level),
    axis: run.axis,
    fixedM: (run.fixed - fixedOrigin) * TILE,
    fromM: (run.from - spanOrigin) * TILE,
    toM: (run.to - spanOrigin) * TILE,
    zBottom: floor.elevationM,
    zTop: floor.elevationM + run.heightM,
    thicknessM: run.thicknessM,
    exterior: run.material !== 'interior',
    material: mapWallMaterial(run.material),
    openings,
  });

  if (floor.level === 0 && run.material !== 'interior') {
    // Exterior concrete foundation plinth course (0.28m height, 2cm projection)
    model.walls.push({
      id: `${run.id}:base`,
      levelId: levelId(run.level),
      axis: run.axis,
      fixedM: (run.fixed - fixedOrigin) * TILE,
      fromM: (run.from - spanOrigin) * TILE,
      toM: (run.to - spanOrigin) * TILE,
      zBottom: floor.elevationM,
      zTop: floor.elevationM + 0.28,
      thicknessM: run.thicknessM + 0.04,
      exterior: true,
      material: 'concrete',
      openings: openings.filter((o) => o.kind === 'door'),
    });
  }
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
  const groundWalls = model.walls.filter((wall) => wall.levelId === 'level:0' && wall.exterior && !wall.id.includes('parapet') && !wall.id.includes('cap') && !wall.id.includes('base'));
  const walls = groundWalls.length > 0 ? groundWalls : model.walls.filter((wall) => wall.exterior && !wall.id.includes('parapet') && !wall.id.includes('cap'));
  const eastWall = walls.find((wall) => wall.axis === 'v' && wall.fixedM >= model.footprint.w / 2)
    ?? walls.find((wall) => wall.axis === 'v');
  const southWall = walls.find((wall) => wall.axis === 'h' && wall.fixedM >= model.footprint.h / 2)
    ?? walls.find((wall) => wall.axis === 'h');
  const terrace = model.slabs.find((slab) => slab.kind === 'terrace');
  const mansardWall = model.walls.find((wall) => wall.levelId === 'level:1' && wall.axis === 'h' && wall.fixedM <= model.footprint.h * 0.7 && !wall.id.includes('parapet') && !wall.id.includes('cap'));
  const topZ = terrace ? terrace.zTop + 0.38 : (southWall ? southWall.zTop : 3.2);

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

  if (southWall) {
    // Ivy on south wall corner next to downspout
    model.decals.push({
      id: 'atmo:ivy-south-corner',
      host: { kind: 'wall', id: southWall.id, side: 'front' },
      u0: Math.max(0, model.footprint.w - 1.9),
      u1: model.footprint.w - 0.1,
      v0: southWall.zBottom + 0.2,
      v1: Math.min(southWall.zTop - 0.1, southWall.zBottom + 2.7),
      texture: 'ivy',
      frame: 1,
      offsetM: 0.016,
    });
  }

  if (mansardWall) {
    model.decals.push({
      id: 'atmo:ivy-mansard',
      host: { kind: 'wall', id: mansardWall.id, side: 'front' },
      u0: Math.max(0, model.footprint.w - 1.9),
      u1: model.footprint.w - 0.2,
      v0: mansardWall.zBottom + 0.1,
      v1: Math.min(roofElevation - 0.1, mansardWall.zBottom + 2.4),
      texture: 'ivy',
      frame: 2,
      offsetM: 0.016,
    });
  }

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

    // Leaning pallet against the mansard wall on the terrace
    model.props.push({
      id: 'terrace:pallet-lean',
      levelId: 'level:1',
      kind: 'pallet',
      xM: terrace.rect.x + terrace.rect.w * 0.36,
      yM: terrace.rect.y + 0.18,
      zM: terrace.zTop,
      yaw: 0.05,
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

  if (southWall) {
    const yFront = southWall.fixedM + southWall.thicknessM / 2 + 0.06;
    // Downspout on the south-east corner (runs terrace parapet to ground)
    const xEast = model.footprint.w - 0.22;
    model.pipes.push({
      id: 'atmo:downspout',
      host: { kind: 'wall', id: southWall.id, side: 'front' },
      points: [
        { x: xEast, y: yFront, z: topZ },
        { x: xEast, y: yFront, z: 0.32 },
        { x: xEast, y: yFront + 0.14, z: 0.10 },
      ],
      radiusM: 0.055,
      material: 'metal',
    });

    // Downspout on the south-west corner (runs terrace parapet to ground)
    const xWest = model.footprint.x + 0.22;
    model.pipes.push({
      id: 'atmo:downspout-west',
      host: { kind: 'wall', id: southWall.id, side: 'front' },
      points: [
        { x: xWest, y: yFront, z: topZ },
        { x: xWest, y: yFront, z: 0.32 },
        { x: xWest, y: yFront + 0.14, z: 0.10 },
      ],
      radiusM: 0.055,
      material: 'metal',
    });
  }

  if (mansardWall && terrace) {
    const xMansard = model.footprint.w - 0.22;
    const yMansard = mansardWall.fixedM + mansardWall.thicknessM / 2 + 0.06;
    model.pipes.push({
      id: 'atmo:downspout-mansard',
      host: { kind: 'wall', id: mansardWall.id, side: 'front' },
      points: [
        { x: xMansard, y: yMansard, z: roofElevation },
        { x: xMansard, y: yMansard, z: terrace.zTop + 0.15 },
        { x: xMansard, y: yMansard + 0.12, z: terrace.zTop + 0.04 },
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

export function specToBuildingModel(building: BuildingSpec, objects?: ObjectInstance[]): ConvertedBuilding {
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
      const spanOrigin = run.axis === 'h' ? origin.x : origin.y;
      const openings = floor.openings
        .filter((opening) => opening.wallRunId === run.id)
        .map<OpeningModel>((opening) => {
          const start = (run.from - spanOrigin) * TILE + opening.startM;
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

  for (const obj of objects ?? []) {
    if (obj.placement.mount !== 'floor') continue;
    const floor = floors.find((f) => f.level === obj.level);
    const zBase = floor ? floor.elevationM : 0;
    const xM = (obj.placement.x - origin.x) * TILE;
    const yM = (obj.placement.y - origin.y) * TILE;
    const zM = zBase;
    const yaw = (obj.placement.rotation * Math.PI) / 180;

    let kind: PropKind | null = null;
    if (obj.templateId === 'bed_double' || obj.templateId === 'bed_single') kind = 'bed';
    else if (obj.templateId === 'wardrobe') kind = 'wardrobe';
    else if (obj.templateId === 'nightstand') kind = 'nightstand';
    else if (obj.templateId === 'counter') kind = 'counter';
    else if (obj.templateId === 'fridge') kind = 'fridge';
    else if (obj.templateId === 'table') kind = 'table';
    else if (obj.templateId === 'chair') kind = 'chair';
    else if (obj.templateId === 'shelf') kind = 'shelf';
    else if (obj.templateId === 'crate') kind = 'crate';
    else if (obj.templateId === 'utility_box') kind = 'utility_box';
    else if (obj.templateId === 'rug') kind = 'rug';

    if (kind) {
      model.props.push({
        id: obj.id,
        kind,
        xM,
        yM,
        zM,
        yaw,
        levelId: levelId(obj.level),
      });
    }
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
