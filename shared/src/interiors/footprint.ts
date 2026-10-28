import { metersToTiles, type Vec2 } from '../geometry/units.js';
import { rotateLocal } from '../geometry/projection.js';
import type { FootprintPart, ObjectInstance, ObjectTemplate } from './types.js';

export interface WorldAabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface WorldCircle {
  x: number;
  y: number;
  r: number;
}

export type WorldFootprint = WorldAabb | WorldCircle;

export function isAabb(part: WorldFootprint): part is WorldAabb {
  return 'minX' in part;
}

export function rotateFootprintPart(part: FootprintPart, rotation: 0 | 90 | 180 | 270): FootprintPart {
  const offsetM = rotateLocal(part.offsetM, rotation);
  if (part.shape === 'circle') return { ...part, offsetM };
  const swap = rotation === 90 || rotation === 270;
  return {
    ...part,
    offsetM,
    widthM: swap ? (part.depthM ?? 0) : (part.widthM ?? 0),
    depthM: swap ? (part.widthM ?? 0) : (part.depthM ?? 0),
  };
}

export function worldFootprintParts(object: ObjectInstance, template: ObjectTemplate): WorldFootprint[] {
  if (object.placement.mount !== 'floor') return [];
  const origin = { x: object.placement.x, y: object.placement.y };
  const rotation = object.placement.rotation;
  const out: WorldFootprint[] = [];
  for (const part of template.footprint) {
    const rotated = rotateFootprintPart(part, rotation);
    const center = { x: origin.x + metersToTiles(rotated.offsetM.x), y: origin.y + metersToTiles(rotated.offsetM.y) };
    if (rotated.shape === 'circle') {
      out.push({ x: center.x, y: center.y, r: metersToTiles(rotated.radiusM ?? 0) });
    } else {
      const halfW = metersToTiles(rotated.widthM ?? 0) / 2;
      const halfD = metersToTiles(rotated.depthM ?? 0) / 2;
      out.push({ minX: center.x - halfW, minY: center.y - halfD, maxX: center.x + halfW, maxY: center.y + halfD });
    }
  }
  return out;
}

export function footprintAabb(parts: WorldFootprint[]): WorldAabb {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const part of parts) {
    if (isAabb(part)) {
      minX = Math.min(minX, part.minX);
      minY = Math.min(minY, part.minY);
      maxX = Math.max(maxX, part.maxX);
      maxY = Math.max(maxY, part.maxY);
    } else {
      minX = Math.min(minX, part.x - part.r);
      minY = Math.min(minY, part.y - part.r);
      maxX = Math.max(maxX, part.x + part.r);
      maxY = Math.max(maxY, part.y + part.r);
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Visual ground contact point in world space: the centre of the front
 * (south-facing) edge of the footprint. This is the one point used by the
 * sprite anchor, contact shadow and support tests.
 */
export function supportPoint(parts: WorldFootprint[]): Vec2 {
  if (parts.length === 0) return { x: 0, y: 0 };
  const box = footprintAabb(parts);
  return { x: (box.minX + box.maxX) / 2, y: box.maxY };
}

export function aabbOverlap(a: WorldAabb, b: WorldAabb): boolean {
  return Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 1e-9 && Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 1e-9;
}

export function aabbContainsPoint(a: WorldAabb, x: number, y: number): boolean {
  return x >= a.minX && x <= a.maxX && y >= a.minY && y <= a.maxY;
}

export function segmentIntersectsAabb(x0: number, y0: number, x1: number, y1: number, a: WorldAabb): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tMin = 0;
  let tMax = 1;
  for (const [p, q] of [
    [-dx, x0 - a.minX],
    [dx, a.maxX - x0],
    [-dy, y0 - a.minY],
    [dy, a.maxY - y0],
  ] as const) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) tMin = Math.max(tMin, t);
    else tMax = Math.min(tMax, t);
    if (tMin > tMax) return false;
  }
  return true;
}

export function segmentIntersectsCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  circle: WorldCircle,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(x0 - circle.x, y0 - circle.y) <= circle.r;
  const t = Math.max(0, Math.min(1, ((circle.x - x0) * dx + (circle.y - y0) * dy) / len2));
  const px = x0 + dx * t;
  const py = y0 + dy * t;
  return Math.hypot(px - circle.x, py - circle.y) <= circle.r;
}

export function segmentIntersectsFootprint(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  parts: WorldFootprint[],
): boolean {
  for (const part of parts) {
    if (isAabb(part) ? segmentIntersectsAabb(x0, y0, x1, y1, part) : segmentIntersectsCircle(x0, y0, x1, y1, part)) {
      return true;
    }
  }
  return false;
}
