export const HALF_W = 32;
export const HALF_H = 16;

export interface Point {
  x: number;
  y: number;
}

export function iso(x: number, y: number): Point {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}

export function screenToWorld(sx: number, sy: number): Point {
  return { x: sy / 32 + sx / 64, y: sy / 32 - sx / 64 };
}

/** Converts a screen-space delta (pixels) into a logical grid delta. */
export function screenDeltaToWorld(dsx: number, dsy: number): Point {
  return { x: dsy / 32 + dsx / 64, y: dsy / 32 - dsx / 64 };
}

/** 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE (screen-space). */
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
