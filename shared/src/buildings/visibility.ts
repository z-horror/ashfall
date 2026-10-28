import { sideOfWall } from './geometry.js';
import type { FloorSpec, FloorIndex, WallRun } from './types.js';

export interface FloorVisibility {
  visible: boolean;
  surface: boolean;
  walls: boolean;
  doors: boolean;
  windows: boolean;
  furniture: boolean;
  stairs: boolean;
}

/**
 * One visibility policy for every floor. The renderer must not invent its own
 * per-floor exceptions: it applies this matrix, then only chooses exterior wall
 * runs where the lower floor is used as an exterior shell.
 */
export function floorVisibility(level: FloorIndex, activeFloor: FloorIndex, inside: boolean): FloorVisibility {
  const active = level === activeFloor;
  const basement = level === -1;
  const envelope =
    active ||
    (level === 0 && activeFloor > 0) ||
    (level === 1 && activeFloor === 0 && !inside);
  const lowerSurface =
    (level === 1 && activeFloor === 0 && !inside);

  return {
    visible: envelope || lowerSurface,
    surface: active || lowerSurface,
    walls: envelope,
    doors: envelope,
    windows: envelope,
    furniture: active && (inside || basement),
    stairs: (active && (inside || basement)) || (level === 0 && activeFloor === 1 && inside),
  };
}

export function mansardRoofVisible(activeFloor: FloorIndex, inside: boolean): boolean {
  return activeFloor >= 0 && !inside;
}

export function terraceRoofVisible(activeFloor: FloorIndex, inside: boolean): boolean {
  return activeFloor >= 0 && (activeFloor > 0 || !inside);
}

export function foundationVisible(activeFloor: FloorIndex): boolean {
  return activeFloor >= 0;
}

/** Walls between the camera and the player are cut open for the current floor. */
export function cutWallIds(floor: FloorSpec, x: number, y: number): Set<string> {
  const camera = { x: x + 1000, y: y + 1000 };
  const cut = new Set<string>();
  for (const run of floor.wallRuns) {
    // Only walls the camera is on the opposite side of can occlude the player.
    // Compare signs, not raw distances: the camera probe is deliberately far
    // away, so comparing values would cut every wall in the building.
    const cameraSide = Math.sign(sideOfWall(run, camera));
    const playerSide = Math.sign(sideOfWall(run, { x, y }));
    if (cameraSide !== playerSide) cut.add(run.id);
  }
  return cut;
}

/** Used by diagnostics/tests when a wall id is needed without rendering. */
export function wallIsExterior(run: WallRun, floor: FloorSpec): boolean {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const cell of floor.floor.cells) {
    minX = Math.min(minX, cell.x);
    maxX = Math.max(maxX, cell.x + cell.w);
    minY = Math.min(minY, cell.y);
    maxY = Math.max(maxY, cell.y + cell.h);
  }
  if (!Number.isFinite(minX)) return false;
  return run.axis === 'h'
    ? run.fixed <= minY + 1e-6 || run.fixed >= maxY - 1e-6
    : run.fixed <= minX + 1e-6 || run.fixed >= maxX - 1e-6;
}
