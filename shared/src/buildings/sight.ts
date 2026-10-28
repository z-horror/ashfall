import { metersToTiles } from '../geometry/units.js';
import { inAttackArc } from '../physics.js';
import { solidIntervals } from './geometry.js';
import type { DoorState, FloorSpec, OpeningStateSnapshot, WallRun, WindowState } from './types.js';
import type { ObjectInstance, ObjectState, ObjectTemplate } from '../interiors/types.js';
import { isAabb, segmentIntersectsAabb, segmentIntersectsFootprint, worldFootprintParts, type WorldAabb } from '../interiors/footprint.js';

export type SightMode = 'sight' | 'shot';

function findDoor(states: OpeningStateSnapshot, id: string): DoorState | undefined {
  return states.doors.find((door) => door.openingId === id);
}

function findWindow(states: OpeningStateSnapshot, id: string): WindowState | undefined {
  return states.windows.find((window) => window.openingId === id);
}

function doorBlocksSight(state: DoorState | undefined): boolean {
  return !state || !state.open || state.locked;
}

function windowBlocksSight(state: WindowState | undefined, mode: SightMode): boolean {
  if (!state) return true;
  if (state.boarded) return true;
  if (state.broken) return false;
  return mode === 'sight' || mode === 'shot';
}

function wallAabb(run: WallRun, startM: number, endM: number): WorldAabb {
  const x0 = run.axis === 'h' ? run.from + metersToTiles(startM) : run.fixed;
  const x1 = run.axis === 'h' ? run.from + metersToTiles(endM) : run.fixed;
  const y0 = run.axis === 'h' ? run.fixed : run.from + metersToTiles(startM);
  const y1 = run.axis === 'h' ? run.fixed : run.from + metersToTiles(endM);
  const half = metersToTiles(run.thicknessM) / 2;
  return { minX: x0 - half, minY: y0 - half, maxX: x1 + half, maxY: y1 + half };
}

export function hasFloorSight(
  floor: FloorSpec,
  openingStates: OpeningStateSnapshot,
  from: { x: number; y: number },
  to: { x: number; y: number },
  mode: SightMode,
  objects: ObjectInstance[],
  templates: Record<string, ObjectTemplate>,
  objectStates: Record<string, ObjectState> = {},
  ignoreOpeningId?: string,
  ignoreObjectId?: string,
): boolean {
  for (const run of floor.wallRuns) {
    const openings = floor.openings.filter((opening) => opening.wallRunId === run.id);
    for (const interval of solidIntervals(run, openings)) {
      if (segmentIntersectsAabb(from.x, from.y, to.x, to.y, wallAabb(run, interval.startM, interval.endM))) return false;
    }
    for (const opening of openings) {
      if (opening.id === ignoreOpeningId) continue;
      if (opening.kind === 'arch') continue;
      const blocks =
        opening.kind === 'door'
          ? doorBlocksSight(findDoor(openingStates, opening.id))
          : windowBlocksSight(findWindow(openingStates, opening.id), mode);
      if (blocks && segmentIntersectsAabb(from.x, from.y, to.x, to.y, wallAabb(run, opening.startM, opening.startM + opening.widthM))) {
        return false;
      }
    }
  }

  for (const object of objects) {
    if (object.id === ignoreObjectId) continue;
    if (object.level !== floor.level) continue;
    const state = objectStates[object.id];
    if (state?.destroyed) continue;
    const template = templates[object.templateId];
    if (!template) continue;
    const blocks = mode === 'sight' ? template.placement.blocksSight === true : template.placement.blocksProjectiles === true;
    if (!blocks) continue;
    if (segmentIntersectsFootprint(from.x, from.y, to.x, to.y, worldFootprintParts(object, template))) return false;
  }
  return true;
}

export function canAttackAcrossFloor(
  floor: FloorSpec,
  openingStates: OpeningStateSnapshot,
  from: { x: number; y: number; floor: number; aim: number },
  to: { x: number; y: number; floor: number },
  range: number,
  arc: number,
  objects: ObjectInstance[],
  templates: Record<string, ObjectTemplate>,
  objectStates: Record<string, ObjectState> = {},
): boolean {
  if (from.floor !== to.floor || from.floor !== floor.level) return false;
  if (!inAttackArc(from.x, from.y, from.aim, to.x, to.y, range, arc)) return false;
  return hasFloorSight(floor, openingStates, from, to, 'shot', objects, templates, objectStates);
}

export function furnitureBlocksSight(template: ObjectTemplate, mode: SightMode): boolean {
  return mode === 'sight' ? template.placement.blocksSight === true : template.placement.blocksProjectiles === true;
}

export function isAabbObject(part: ReturnType<typeof worldFootprintParts>[number]): part is WorldAabb {
  return isAabb(part);
}
