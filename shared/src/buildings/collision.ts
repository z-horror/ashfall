import { COLLISION_SCALE, TILE_SIZE_M, metersToTiles, type TileRect } from '../geometry/units.js';
import { createGrid, type CollisionGrid } from '../physics.js';
import { WORLD_TILES } from '../constants.js';
import { solidIntervals } from './geometry.js';
import type { DoorState, FloorSpec, OpeningStateSnapshot, StairSpec, WallRun, WindowState } from './types.js';
import type { ObjectInstance, ObjectState, ObjectTemplate } from '../interiors/types.js';
import { isAabb, worldFootprintParts, type WorldFootprint } from '../interiors/footprint.js';

function blockAabb(grid: CollisionGrid, minX: number, minY: number, maxX: number, maxY: number): void {
  const scale = grid.scale ?? COLLISION_SCALE;
  const sx0 = Math.max(0, Math.floor(minX * scale));
  const sy0 = Math.max(0, Math.floor(minY * scale));
  const sx1 = Math.min(grid.w - 1, Math.ceil(maxX * scale) - 1);
  const sy1 = Math.min(grid.h - 1, Math.ceil(maxY * scale) - 1);
  for (let sy = sy0; sy <= sy1; sy++) {
    for (let sx = sx0; sx <= sx1; sx++) grid.cells[sy * grid.w + sx] = 1;
  }
}


function blockAabbCenters(grid: CollisionGrid, minX: number, minY: number, maxX: number, maxY: number): void {
  const scale = grid.scale ?? COLLISION_SCALE;
  const sx0 = Math.max(0, Math.ceil(minX * scale - 0.5 - 1e-9));
  const sy0 = Math.max(0, Math.ceil(minY * scale - 0.5 - 1e-9));
  const sx1 = Math.min(grid.w - 1, Math.floor(maxX * scale - 0.5 + 1e-9));
  const sy1 = Math.min(grid.h - 1, Math.floor(maxY * scale - 0.5 + 1e-9));
  for (let sy = sy0; sy <= sy1; sy++) {
    for (let sx = sx0; sx <= sx1; sx++) grid.cells[sy * grid.w + sx] = 1;
  }
}

function blockRect(grid: CollisionGrid, rect: TileRect): void {
  blockAabb(grid, rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
}

function setAabb(
  grid: CollisionGrid,
  cells: Uint8Array,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  value: 0 | 1,
): void {
  const scale = grid.scale ?? COLLISION_SCALE;
  const sx0 = Math.max(0, Math.floor(minX * scale));
  const sy0 = Math.max(0, Math.floor(minY * scale));
  const sx1 = Math.min(grid.w - 1, Math.ceil(maxX * scale) - 1);
  const sy1 = Math.min(grid.h - 1, Math.ceil(maxY * scale) - 1);
  for (let sy = sy0; sy <= sy1; sy++) {
    for (let sx = sx0; sx <= sx1; sx++) cells[sy * grid.w + sx] = value;
  }
}

function setRect(grid: CollisionGrid, cells: Uint8Array, rect: TileRect, value: 0 | 1): void {
  setAabb(grid, cells, rect.x, rect.y, rect.x + rect.w, rect.y + rect.h, value);
}

function landingsForFloor(floor: FloorSpec, stairs: readonly StairSpec[]): TileRect[] {
  const landings: TileRect[] = [];
  for (const stair of stairs) {
    if (stair.fromLevel === floor.level) landings.push(stair.entry);
    else if (stair.toLevel === floor.level) landings.push(stair.exit);
  }
  return landings;
}

function applySupportMask(
  grid: CollisionGrid,
  floor: FloorSpec,
  stairs: readonly StairSpec[],
): void {
  const landings = landingsForFloor(floor, stairs);
  const holes = [...(floor.floor.holes ?? [])];
  for (const stair of stairs) {
    if (stair.fromLevel === floor.level) holes.push(stair.hole);
  }

  // Floor 0 is the ground layer: outside the building footprint is supported
  // by the world. Its declared stair holes still have to be closed, otherwise
  // the player can walk across a stairwell, while the landing remains usable.
  if (floor.level === 0) {
    for (const hole of holes) blockRect(grid, hole);
    for (const landing of landings) setRect(grid, grid.cells, landing, 0);
    return;
  }

  // Upper and basement floors are finite surfaces. Block everything that is
  // neither a floor cell, an explicitly declared walkable surface (terrace),
  // nor a stair landing. This is a support mask, not a generic "outside" ban.
  const supported = new Uint8Array(grid.w * grid.h);
  for (const cell of floor.floor.cells) setRect(grid, supported, cell, 1);
  for (const cell of floor.walkable ?? []) setRect(grid, supported, cell, 1);
  for (const hole of holes) setRect(grid, supported, hole, 0);
  for (const landing of landings) setRect(grid, supported, landing, 1);

  for (let i = 0; i < supported.length; i++) {
    if (!supported[i]) grid.cells[i] = 1;
  }
}

function blockInterval(grid: CollisionGrid, run: WallRun, startM: number, endM: number): void {
  if (endM <= startM) return;
  const x0 = run.axis === 'h' ? run.from + metersToTiles(startM) : run.fixed;
  const x1 = run.axis === 'h' ? run.from + metersToTiles(endM) : run.fixed;
  const y0 = run.axis === 'h' ? run.fixed : run.from + metersToTiles(startM);
  const y1 = run.axis === 'h' ? run.fixed : run.from + metersToTiles(endM);
  const half = metersToTiles(run.thicknessM) / 2;
  if (run.axis === 'h') blockAabbCenters(grid, x0, y0 - half, x1, y1 + half);
  else blockAabbCenters(grid, x0 - half, y0, x1 + half, y1);
}

function blockFootprint(grid: CollisionGrid, footprint: WorldFootprint): void {
  if (isAabb(footprint)) blockAabb(grid, footprint.minX, footprint.minY, footprint.maxX, footprint.maxY);
  else blockAabb(grid, footprint.x - footprint.r, footprint.y - footprint.r, footprint.x + footprint.r, footprint.y + footprint.r);
}

function findDoor(states: OpeningStateSnapshot, id: string): DoorState | undefined {
  return states.doors.find((door) => door.openingId === id);
}

function findWindow(states: OpeningStateSnapshot, id: string): WindowState | undefined {
  return states.windows.find((window) => window.openingId === id);
}

export function doorBlocksMovement(state: DoorState | undefined): boolean {
  return !state || !state.open || state.locked;
}

export function windowBlocksMovement(_state: WindowState | undefined): boolean {
  // Windows keep their frame/sill: they are never walk-through in this slice.
  return true;
}

export function buildFloorCollision(
  floor: FloorSpec,
  openingStates: OpeningStateSnapshot,
  objects: ObjectInstance[],
  templates: Record<string, ObjectTemplate>,
  objectStates: Record<string, ObjectState> = {},
  stairs: readonly StairSpec[] = floor.stairs,
): CollisionGrid {
  const grid = createGrid(WORLD_TILES, WORLD_TILES, COLLISION_SCALE);
  applySupportMask(grid, floor, stairs);
  for (const run of floor.wallRuns) {
    const openings = floor.openings.filter((opening) => opening.wallRunId === run.id);
    for (const interval of solidIntervals(run, openings)) blockInterval(grid, run, interval.startM, interval.endM);
    for (const opening of openings) {
      if (opening.kind === 'arch') continue;
      if (opening.kind === 'door') {
        if (doorBlocksMovement(findDoor(openingStates, opening.id))) {
          blockInterval(grid, run, opening.startM, opening.startM + opening.widthM);
        }
      } else if (windowBlocksMovement(findWindow(openingStates, opening.id))) {
        blockInterval(grid, run, opening.startM, opening.startM + opening.widthM);
      }
    }
  }

  for (const object of objects) {
    if (object.level !== floor.level) continue;
    const state = objectStates[object.id];
    if (state?.destroyed) continue;
    const template = templates[object.templateId];
    if (!template || !template.placement.blocksPath) continue;
    for (const part of worldFootprintParts(object, template)) blockFootprint(grid, part);
  }
  return grid;
}

export function tileRectIndex(rect: TileRect, grid: CollisionGrid, scale = COLLISION_SCALE): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const sx0 = Math.max(0, Math.floor(rect.x * scale));
  const sy0 = Math.max(0, Math.floor(rect.y * scale));
  const sx1 = Math.min(grid.w - 1, Math.ceil((rect.x + rect.w) * scale) - 1);
  const sy1 = Math.min(grid.h - 1, Math.ceil((rect.y + rect.h) * scale) - 1);
  for (let sy = sy0; sy <= sy1; sy++) {
    for (let sx = sx0; sx <= sx1; sx++) out.push([sx, sy]);
  }
  return out;
}

export const TILE_METERS = TILE_SIZE_M;
