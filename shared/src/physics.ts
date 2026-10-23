import { PLAYER_RADIUS, WORLD_TILES } from './constants.js';

/**
 * Collision grid shared by server and client. 1 = blocked.
 * The client reconstructs it from chunk data and applies door state, so its
 * prediction matches the authoritative simulation closely.
 */
export interface CollisionGrid {
  w: number;
  h: number;
  cells: Uint8Array;
}

export function createGrid(w = WORLD_TILES, h = WORLD_TILES): CollisionGrid {
  return { w, h, cells: new Uint8Array(w * h) };
}

export function isBlocked(grid: CollisionGrid, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return true;
  return grid.cells[ty * grid.w + tx] === 1;
}

export function circleHits(grid: CollisionGrid, x: number, y: number, r = PLAYER_RADIUS): boolean {
  if (isBlocked(grid, x - r, y - r)) return true;
  if (isBlocked(grid, x + r, y - r)) return true;
  if (isBlocked(grid, x - r, y + r)) return true;
  if (isBlocked(grid, x + r, y + r)) return true;
  return false;
}

/**
 * Axis-separated movement with substepping. Returns the resolved position.
 * Deterministic and cheap: used both for prediction and server simulation.
 */
export function moveCircle(
  grid: CollisionGrid,
  x: number,
  y: number,
  dx: number,
  dy: number,
  r = PLAYER_RADIUS,
): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.12));
  const sx = dx / steps;
  const sy = dy / steps;
  let px = x;
  let py = y;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0 && !circleHits(grid, px + sx, py, r)) px += sx;
    else if (sx !== 0) {
      // tiny nudge toward the free side keeps movement along walls smooth
      const n = 0.02 * Math.sign(sx);
      if (!circleHits(grid, px, py + n, r * 0.9)) py += n;
      else if (!circleHits(grid, px, py - n, r * 0.9)) py -= n;
    }
    if (sy !== 0 && !circleHits(grid, px, py + sy, r)) py += sy;
    else if (sy !== 0) {
      const n = 0.02 * Math.sign(sy);
      if (!circleHits(grid, px + n, py, r * 0.9)) px += n;
      else if (!circleHits(grid, px - n, py, r * 0.9)) px -= n;
    }
  }
  return { x: px, y: py };
}

/** Bresenham-ish line of sight against walls. */
export function hasLineOfSight(
  grid: CollisionGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / 0.22);
  if (steps <= 1) return true;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isBlocked(grid, x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** True if target lies inside a cone starting at (ax, ay) pointing at `aim`. */
export function inAttackArc(
  ax: number,
  ay: number,
  aim: number,
  tx: number,
  ty: number,
  range: number,
  arc = Math.PI * 0.62,
): boolean {
  const d = Math.hypot(tx - ax, ty - ay);
  if (d > range) return false;
  if (d < 0.001) return true;
  const angle = Math.atan2(ty - ay, tx - ax);
  return Math.abs(normalizeAngle(angle - aim)) <= arc / 2;
}
