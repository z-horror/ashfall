import { cellCenter, pointInRect, type TileRect, type Vec2 } from '../geometry/units.js';
import { openingCenter } from './geometry.js';
import type {
  FloorSpec,
  OpeningSpec,
  RoomAccessPoint,
  RoomGeometry,
  RoomSpec,
  WallRun,
} from './types.js';

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function roomCellSet(room: RoomSpec): Set<string> {
  const cells = new Set<string>();
  for (const rect of room.rects) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (!pointInRect(x + 0.5, y + 0.5, rect)) continue;
        cells.add(cellKey(x, y));
      }
    }
  }
  for (const hole of room.holes ?? []) {
    for (let y = hole.y; y < hole.y + hole.h; y++) {
      for (let x = hole.x; x < hole.x + hole.w; x++) cells.delete(cellKey(x, y));
    }
  }
  return cells;
}

export function buildRoomGeometry(room: RoomSpec): RoomGeometry {
  const set = roomCellSet(room);
  if (set.size === 0) throw new Error(`room ${room.id} has no cells`);

  const points = [...set].map((key) => key.split(',').map(Number) as [number, number]);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const bounds: TileRect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  const mask = new Uint8Array(bounds.w * bounds.h);

  for (const [x, y] of points) {
    mask[(y - bounds.y) * bounds.w + (x - bounds.x)] = 1;
  }

  const start = points[0];
  const queue: Array<[number, number]> = [start];
  const visited = new Set<string>([cellKey(start[0], start[1])]);
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const key = cellKey(x + dx, y + dy);
      if (!set.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push([x + dx, y + dy]);
    }
  }
  if (visited.size !== set.size) throw new Error(`room ${room.id} mask is not 4-connected`);

  return {
    roomId: room.id,
    level: room.level,
    bounds,
    mask,
    cells: points.map(([x, y]) => cellCenter(x, y)),
    accessPoints: [],
  };
}

export function roomContains(geometry: RoomGeometry, point: Vec2): boolean {
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  const lx = x - geometry.bounds.x;
  const ly = y - geometry.bounds.y;
  if (lx < 0 || ly < 0 || lx >= geometry.bounds.w || ly >= geometry.bounds.h) return false;
  return geometry.mask[ly * geometry.bounds.w + lx] === 1;
}

export function roomsOverlap(a: RoomGeometry, b: RoomGeometry): boolean {
  if (a.level !== b.level) return false;
  const minX = Math.max(a.bounds.x, b.bounds.x);
  const minY = Math.max(a.bounds.y, b.bounds.y);
  const maxX = Math.min(a.bounds.x + a.bounds.w, b.bounds.x + b.bounds.w);
  const maxY = Math.min(a.bounds.y + a.bounds.h, b.bounds.y + b.bounds.h);
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const ax = x - a.bounds.x;
      const ay = y - a.bounds.y;
      const bx = x - b.bounds.x;
      const by = y - b.bounds.y;
      if (a.mask[ay * a.bounds.w + ax] && b.mask[by * b.bounds.w + bx]) return true;
    }
  }
  return false;
}

function wallById(floor: FloorSpec, id: string): WallRun | undefined {
  return floor.wallRuns.find((run) => run.id === id);
}

function accessForOpening(floor: FloorSpec, opening: OpeningSpec, room: RoomGeometry): RoomAccessPoint | null {
  const wall = wallById(floor, opening.wallRunId);
  if (!wall) return null;
  const center = openingCenter(wall, opening);
  const floorCell = { x: Math.floor(center.x), y: Math.floor(center.y) };
  const alternatives =
    wall.axis === 'h'
      ? [
          { x: floorCell.x, y: floorCell.y - 1 },
          { x: floorCell.x, y: floorCell.y + 1 },
        ]
      : [
          { x: floorCell.x - 1, y: floorCell.y },
          { x: floorCell.x + 1, y: floorCell.y },
        ];
  const cell = [floorCell, ...alternatives].find((candidate) =>
    roomContains(room, { x: candidate.x + 0.5, y: candidate.y + 0.5 }),
  );
  if (!cell) return null;
  return { kind: opening.kind === 'door' ? 'door' : 'arch', id: opening.id, x: center.x, y: center.y };
}

export function attachFloorAccess(floor: FloorSpec, room: RoomGeometry): RoomGeometry {
  const accessPoints: RoomAccessPoint[] = [];
  for (const opening of floor.openings) {
    const access = accessForOpening(floor, opening, room);
    if (access) accessPoints.push(access);
  }
  for (const stair of floor.stairs) {
    if (roomContains(room, { x: stair.entry.x + stair.entry.w / 2, y: stair.entry.y + stair.entry.h / 2 })) {
      accessPoints.push({
        kind: 'stair',
        id: stair.id,
        x: stair.entry.x + stair.entry.w / 2,
        y: stair.entry.y + stair.entry.h / 2,
        targetLevel: stair.toLevel,
      });
    }
  }
  return { ...room, accessPoints };
}
