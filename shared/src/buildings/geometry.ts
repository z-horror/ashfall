import { metersToTiles, tileToMeters, type Vec2 } from '../geometry/units.js';
import type { OpeningSpec, WallRun } from './types.js';

export interface IntervalM {
  startM: number;
  endM: number;
}

export function runStart(run: WallRun): Vec2 {
  return run.axis === 'h' ? { x: run.from, y: run.fixed } : { x: run.fixed, y: run.from };
}

export function runEnd(run: WallRun): Vec2 {
  return run.axis === 'h' ? { x: run.to, y: run.fixed } : { x: run.fixed, y: run.to };
}

export function runLengthM(run: WallRun): number {
  return tileToMeters(run.to - run.from);
}

export function runPointAtM(run: WallRun, distanceM: number): Vec2 {
  const start = runStart(run);
  const tiles = metersToTiles(distanceM);
  return run.axis === 'h' ? { x: start.x + tiles, y: start.y } : { x: start.x, y: start.y + tiles };
}

export function openingCenter(run: WallRun, opening: OpeningSpec): Vec2 {
  return runPointAtM(run, opening.startM + opening.widthM / 2);
}

export function validateOpening(run: WallRun, opening: OpeningSpec): string | null {
  const length = runLengthM(run);
  if (!Number.isFinite(opening.startM) || !Number.isFinite(opening.widthM)) return 'non-finite opening';
  if (opening.widthM <= 0) return 'opening width must be positive';
  if (opening.startM < 0) return 'opening starts before wall run';
  if (opening.startM + opening.widthM > length + 1e-6) return 'opening exceeds wall run';
  if (opening.sillM < 0) return 'negative sill';
  if (opening.sillM + opening.heightM > run.heightM + 1e-6) return 'opening exceeds wall height';
  return null;
}

export function solidIntervals(run: WallRun, openings: OpeningSpec[]): IntervalM[] {
  const length = runLengthM(run);
  const sorted = openings
    .filter((opening) => opening.wallRunId === run.id)
    .map((opening) => ({
      start: Math.max(0, opening.startM),
      end: Math.min(length, opening.startM + opening.widthM),
    }))
    .sort((a, b) => a.start - b.start);

  const out: IntervalM[] = [];
  let cursor = 0;
  for (const interval of sorted) {
    if (interval.end <= interval.start) continue;
    if (interval.start > cursor + 1e-9) out.push({ startM: cursor, endM: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < length - 1e-9) out.push({ startM: cursor, endM: length });
  return out;
}

export function openingsOverlap(a: OpeningSpec, b: OpeningSpec): boolean {
  if (a.wallRunId !== b.wallRunId) return false;
  const a0 = a.startM;
  const a1 = a.startM + a.widthM;
  const b0 = b.startM;
  const b1 = b.startM + b.widthM;
  return Math.min(a1, b1) - Math.max(a0, b0) > 1e-6;
}

/**
 * Positive side is the left side of the run direction; 0 means on the line.
 */
export function sideOfWall(run: WallRun, point: Vec2): number {
  const start = runStart(run);
  if (run.axis === 'h') return point.y - start.y;
  return start.x - point.x;
}
