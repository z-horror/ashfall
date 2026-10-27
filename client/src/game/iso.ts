import { HALF_H, HALF_W, sceneToWorld, worldToScreen, type Vec2 } from '@ashfall/shared';

export { HALF_H, HALF_W };

export interface Point {
  x: number;
  y: number;
}

export function iso(x: number, y: number, zM = 0): Point {
  return worldToScreen(x, y, zM);
}

export function screenToWorld(sx: number, sy: number, zM = 0): Point {
  return sceneToWorld(sx, sy, zM);
}

export function screenDeltaToWorld(dsx: number, dsy: number): Point {
  return { x: dsy / 32 + dsx / 64, y: dsy / 32 - dsx / 64 };
}

export function directionFromDelta(dx: number, dy: number): number {
  const sx = (dx - dy) * HALF_W;
  const sy = (dx + dy) * HALF_H;
  let a = Math.atan2(sy, sx);
  if (a < 0) a += Math.PI * 2;
  return Math.round(a / (Math.PI / 4)) % 8;
}

export function screenDirectionFromAngle(aim: number): number {
  return directionFromDelta(Math.cos(aim), Math.sin(aim));
}

export function aimFromScreenDelta(dx: number, dy: number): number {
  const world = screenDeltaToWorld(dx, dy);
  return Math.atan2(world.y, world.x);
}

export type { Vec2 };
