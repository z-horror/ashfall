export const TILE_SIZE_M = 1.6;
export const PX_PER_METER = 40;
export const HALF_W = 32;
export const HALF_H = 16;
export const COLLISION_SCALE = 16;
export const EPS = 1e-9;

export interface Vec2 {
  x: number;
  y: number;
}

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function tileToMeters(tiles: number): number {
  return tiles * TILE_SIZE_M;
}

export function metersToTiles(meters: number): number {
  return meters / TILE_SIZE_M;
}

export function cellCenter(ix: number, iy: number): Vec2 {
  return { x: ix + 0.5, y: iy + 0.5 };
}

export function rectCenter(rect: TileRect): Vec2 {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function pointInRect(x: number, y: number, rect: TileRect): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

export function rectContainsPoint(rect: TileRect, p: Vec2): boolean {
  return pointInRect(p.x, p.y, rect);
}

export function pointInCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
  return Math.hypot(x - cx, y - cy) <= r;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
