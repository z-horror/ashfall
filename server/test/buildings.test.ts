import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OBJECT_TEMPLATES,
  PLAYER_RADIUS,
  TILE_SIZE_M,
  buildFloorCollision,
  buildRoomGeometry,
  canAttackAcrossFloor,
  circleHits,
  hasFloorSight,
  moveCircle,
  openingCenter,
  roomsOverlap,
  sceneToWorld,
  solidIntervals,
  supportPoint,
  worldFootprintParts,
  isAabb,
  type WorldAabb,
  worldToScreen,
  type ObjectInstance,
} from '@ashfall/shared';
import { World } from '../src/game/world.js';
import { Simulation } from '../src/game/simulation.js';
import { waitForDatabase } from '../src/persistence/db.js';
import { ClientWorld } from '../../client/src/world/clientWorld.js';

function floorOf(world: World) {
  const floor = world.getFloor(0);
  assert.ok(floor);
  return floor;
}

test('coordinate projection round-trips with elevation', () => {
  for (const point of [
    { x: 0, y: 0, z: 0 },
    { x: 31.5, y: 38.0, z: 0 },
    { x: 37.5, y: 33.5, z: -3.0 },
    { x: 12.25, y: 9.75, z: 2.8 },
  ]) {
    const screen = worldToScreen(point.x, point.y, point.z);
    const back = sceneToWorld(screen.x, screen.y, point.z);
    assert.ok(Math.abs(back.x - point.x) < 1e-9);
    assert.ok(Math.abs(back.y - point.y) < 1e-9);
  }
  const top = worldToScreen(37.5, 30.5, 0);
  const bottom = worldToScreen(37.5, 33.5, -3);
  assert.notEqual(top.x, bottom.x, 'stair endpoints differ horizontally in isometric projection');
  assert.notEqual(top.y, bottom.y, 'stair endpoints differ vertically in isometric projection');
});

test('door interval is measured from the wall-run start in meters', () => {
  const world = new World('test-door-math');
  const floor = floorOf(world);
  const wall = floor.wallRuns.find((run) => run.id === 'w:test:0:south')!;
  const door = floor.openings.find((opening) => opening.id === 'o:test:0:door')!;
  assert.equal(wall.axis, 'h');
  assert.ok(Math.abs((wall.to - wall.from) * TILE_SIZE_M - 8.0) < 1e-9);
  const intervals = solidIntervals(wall, [door]);
  assert.equal(intervals.length, 2);
  assert.ok(Math.abs(intervals[0].startM) < 1e-9);
  assert.ok(Math.abs(intervals[0].endM - 5.1) < 1e-9);
  assert.ok(Math.abs(intervals[1].startM - 6.1) < 1e-9);
  assert.ok(Math.abs(intervals[1].endM - 8.0) < 1e-9);
  const center = openingCenter(wall, door);
  assert.equal(center.x, 31.5);
  assert.equal(center.y, 38.0);
});

test('rooms are connected masks, do not overlap, and attach to openings', () => {
  const world = new World('test-rooms');
  const floor = floorOf(world);
  const west = floor.rooms.find((room) => room.id === 'room:test:0:west')!;
  const east = floor.rooms.find((room) => room.id === 'room:test:0:east')!;
  const westGeometry = buildRoomGeometry(west);
  const eastGeometry = buildRoomGeometry(east);
  assert.equal(westGeometry.cells.length, 50);
  assert.equal(eastGeometry.cells.length, 50);
  assert.equal(roomsOverlap(westGeometry, eastGeometry), false);
  assert.equal(world.roomContains('room:test:0:west', 31.5, 35.0), true);
  assert.equal(world.roomContains('room:test:0:east', 36.5, 35.0), true);
  assert.equal(world.roomContains('room:test:0:west', 36.5, 35.0), false);
});

test('furniture footprint rotation changes AABB and support point', () => {
  const wardrobe = OBJECT_TEMPLATES.wardrobe;
  const base: ObjectInstance = {
    id: 'obj:test:rotation',
    templateId: 'wardrobe',
    buildingId: 'b:test',
    level: 0,
    roomId: 'room:test:0:west',
    placement: { mount: 'floor', x: 28.45, y: 34, rotation: 0 },
    variant: 0,
  };
  const rotated: ObjectInstance = {
    ...base,
    placement: { mount: 'floor', x: 28.45, y: 34, rotation: 90 },
  };
  const aabbOf = (parts: ReturnType<typeof worldFootprintParts>): WorldAabb => {
    const boxes = parts.filter(isAabb);
    return {
      minX: Math.min(...boxes.map((box) => box.minX)),
      minY: Math.min(...boxes.map((box) => box.minY)),
      maxX: Math.max(...boxes.map((box) => box.maxX)),
      maxY: Math.max(...boxes.map((box) => box.maxY)),
    };
  };
  const baseAabb = aabbOf(worldFootprintParts(base, wardrobe));
  const rotatedAabb = aabbOf(worldFootprintParts(rotated, wardrobe));
  assert.ok(baseAabb.maxX - baseAabb.minX > rotatedAabb.maxX - rotatedAabb.minX);
  assert.ok(rotatedAabb.maxY - rotatedAabb.minY > baseAabb.maxY - baseAabb.minY);
  assert.ok(supportPoint(worldFootprintParts(rotated, wardrobe)).y > supportPoint(worldFootprintParts(base, wardrobe)).y);
});

test('closed doors block movement, open doors allow passage', () => {
  const world = new World('test-door-collision');
  const start = { x: 31.5, y: 37.2 };
  const closedGrid = world.getCollisionGrid(0);
  const blocked = moveCircle(closedGrid, start.x, start.y, 0, 1.6, PLAYER_RADIUS);
  assert.ok(blocked.y < 38, `closed door should stop movement, ended at ${blocked.y}`);
  world.setDoorOpen('o:test:0:door', true);
  const openGrid = world.getCollisionGrid(0);
  const passed = moveCircle(openGrid, start.x, start.y, 0, 1.6, PLAYER_RADIUS);
  assert.ok(passed.y > 38, `open door should allow passage, ended at ${passed.y}`);
});

test('walls and windows participate in line of sight', () => {
  const world = new World('test-sight');
  const floor = floorOf(world);
  const objects = world.objects;
  const templates = OBJECT_TEMPLATES;
  const states = world.getObjectStateRecord();
  assert.equal(
    hasFloorSight(floor, world.getOpeningStates(), { x: 36.5, y: 36.8 }, { x: 36.5, y: 39.2 }, 'sight', objects, templates, states),
    false,
    'solid south wall must block sight',
  );
  world.setWindowState('o:test:0:window', { broken: false, boarded: false });
  assert.equal(
    hasFloorSight(floor, world.getOpeningStates(), { x: 39.0, y: 31.5 }, { x: 41.0, y: 31.5 }, 'sight', objects, templates, states),
    false,
    'intact window must block sight',
  );
  world.setWindowState('o:test:0:window', { broken: true });
  assert.equal(
    hasFloorSight(floor, world.getOpeningStates(), { x: 39.0, y: 31.5 }, { x: 41.0, y: 31.5 }, 'sight', objects, templates, states),
    true,
    'broken window must pass sight',
  );
});

test('melee attacks cannot cross a solid wall or floor', () => {
  const world = new World('test-attack');
  const floor = floorOf(world);
  const args = [
    floor,
    world.getOpeningStates(),
    { x: 36.5, y: 36.8, floor: 0, aim: Math.PI / 2 },
    { x: 36.5, y: 39.2, floor: 0 },
    3,
    Math.PI,
    world.objects,
    OBJECT_TEMPLATES,
    world.getObjectStateRecord(),
  ] as const;
  assert.equal(canAttackAcrossFloor(...args), false, 'melee through south wall must be rejected');
  assert.equal(
    canAttackAcrossFloor(floor, world.getOpeningStates(), { x: 36.5, y: 36.8, floor: 0, aim: -Math.PI / 2 }, { x: 36.5, y: 35.0, floor: 0 }, 3, Math.PI, world.objects, OBJECT_TEMPLATES, world.getObjectStateRecord()),
    true,
    'melee in the same room must be possible',
  );
  assert.equal(
    canAttackAcrossFloor(floor, world.getOpeningStates(), { x: 36.5, y: 36.8, floor: 0, aim: Math.PI / 2 }, { x: 36.5, y: 35.0, floor: -1 }, 3, Math.PI, world.objects, OBJECT_TEMPLATES, world.getObjectStateRecord()),
    false,
    'cross-floor attack must be rejected',
  );
});

test('furniture has collision and basement stair exit is usable', () => {
  const world = new World('test-furniture');
  const grid = world.getCollisionGrid(0);
  assert.equal(circleHits(grid, 39.1, 29.0, PLAYER_RADIUS), true, 'fridge must block movement');
  assert.ok(world.nearestStair(37.5, 29.5, 0));
  assert.ok(world.getFloor(-1));
  assert.equal(world.isWalkable(37.5, 33.5, -1), true, 'basement stair exit must be clear');
});

test('test building objects are inside rooms and do not overlap', () => {
  const world = new World('test-interior');
  const floorObjects = world.objects.filter((object) => object.level === 0 && object.placement.mount === 'floor');
  for (const object of floorObjects) {
    const template = OBJECT_TEMPLATES[object.templateId];
    assert.ok(template);
    for (const part of worldFootprintParts(object, template)) {
      if (!('minX' in part)) continue;
      for (const [x, y] of [
        [part.minX, part.minY],
        [part.maxX, part.minY],
        [part.minX, part.maxY],
        [part.maxX, part.maxY],
      ]) {
        assert.equal(world.roomContains(object.roomId, x, y), true, `${object.id} exceeds room ${object.roomId}`);
      }
    }
  }
  for (let i = 0; i < floorObjects.length; i++) {
    for (let j = i + 1; j < floorObjects.length; j++) {
      const a = floorObjects[i];
      const b = floorObjects[j];
      const ta = OBJECT_TEMPLATES[a.templateId];
      const tb = OBJECT_TEMPLATES[b.templateId];
      if (!ta || !tb) continue;
      const aa = worldFootprintParts(a, ta).filter((part) => 'minX' in part);
      const bb = worldFootprintParts(b, tb).filter((part) => 'minX' in part);
      for (const p of aa) {
        if (!('minX' in p)) continue;
        for (const q of bb) {
          if (!('minX' in q)) continue;
          const overlap = Math.min(p.maxX, q.maxX) - Math.max(p.minX, q.minX) > 1e-6 && Math.min(p.maxY, q.maxY) - Math.max(p.minY, q.minY) > 1e-6;
          assert.equal(overlap, false, `${a.id} overlaps ${b.id}`);
        }
      }
    }
  }
});

test('test building geometry is deterministic', () => {
  const a = new World('same-seed');
  const b = new World('same-seed');
  assert.deepEqual(
    a.objects.map((object) => [object.id, object.templateId, object.placement]),
    b.objects.map((object) => [object.id, object.templateId, object.placement]),
  );
  assert.deepEqual(a.getOpeningStates(), b.getOpeningStates());
});


test('server stair transition changes floor only through an explicit stair interaction', async () => {
  await waitForDatabase();
  const world = new World('test-stairs');
  const sim = new Simulation(world);
  await sim.init();
  const player = {
    id: 999,
    userId: 999,
    name: 'StairTester',
    x: 37.5,
    y: 29.5,
    floor: 0,
    aim: 0,
    hp: 100,
    stamina: 100,
    hunger: 100,
    thirst: 100,
    status: 'alive' as const,
    deadUntil: null,
    input: { mx: 0, my: 0, sprint: false, seq: 0 },
    lastAck: 0,
    inventory: [],
    equippedId: null,
    openContainerId: null,
    conn: { send: () => {}, close: () => {} },
    offlineAt: null,
    lastAttackAt: 0,
    lastDamageAt: 0,
    lastSeq: new Map<string, number>(),
    sentChunks: new Set<string>(),
    chunkX: -1,
    chunkY: -1,
    lastSubCheck: 0,
    lastChatAt: 0,
    lastStairAt: 0,
  };
  sim.players.set(999, player);
  sim.handleMessage(999, { t: 'use_stairs', seq: 1, id: 's:test:0:-1' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(player.floor, -1);
  assert.ok(Math.abs(player.x - 37.5) < 1e-9);
  assert.ok(Math.abs(player.y - 33.5) < 1e-9);
});


test('server and client build identical per-floor collision from the same chunk data', () => {
  const world = new World('test-parity');
  const client = new ClientWorld();
  for (let cy = 0; cy <= 1; cy++) {
    for (let cx = 0; cx <= 1; cx++) client.loadChunk(world.chunkData(cx, cy));
  }
  for (const floor of [0, -1]) {
    const serverGrid = world.getCollisionGrid(floor);
    const clientGrid = client.getCollisionGrid(floor);
    assert.equal(serverGrid.cells.length, clientGrid.cells.length);
    for (let i = 0; i < serverGrid.cells.length; i++) {
      if (serverGrid.cells[i] !== clientGrid.cells[i]) {
        const scale = serverGrid.scale ?? 16;
        const sx = i % serverGrid.w;
        const sy = Math.floor(i / serverGrid.w);
        assert.fail(`collision parity mismatch on floor ${floor} at subcell ${sx},${sy} (${sx / scale},${sy / scale})`);
      }
    }
  }
});
