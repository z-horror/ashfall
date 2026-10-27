import { HALF_H, HALF_W, PX_PER_METER, type Vec2 } from './units.js';

export function worldToScreen(x: number, y: number, zM = 0): Vec2 {
  return {
    x: (x - y) * HALF_W,
    y: (x + y) * HALF_H - zM * PX_PER_METER,
  };
}

export function sceneToWorld(sx: number, sy: number, zM = 0): Vec2 {
  const vertical = sy + zM * PX_PER_METER;
  return {
    x: vertical / (HALF_H * 2) + sx / (HALF_W * 2),
    y: vertical / (HALF_H * 2) - sx / (HALF_W * 2),
  };
}

export function rotateLocal(p: Vec2, rotation: 0 | 90 | 180 | 270): Vec2 {
  switch (rotation) {
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
    default:
      return { x: p.x, y: p.y };
  }
}
