import { COLLISION_SCALE, TILE_SIZE_M, metersToTiles, type TileRect } from '../geometry/units.js';
import { createGrid, type CollisionGrid } from '../physics.js';
import { WORLD_TILES } from '../constants.js';
import { solidIntervals } from './geometry.js';
import type { DoorState, FloorSpec, OpeningStateSnapshot, WallRun, WindowState } from './types.js';
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
): CollisionGrid {
  const grid = createGrid(WORLD_TILES, WORLD_TILES, COLLISION_SCALE);
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

  for (const stair of floor.stairs) blockRect(grid, stair.hole);

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
