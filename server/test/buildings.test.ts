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
  floorElevationM,
  stairPromptFor,
  surfaceElevationM,
  surfaceHitAt,
  cutWallIds,
  floorVisibility,
  mansardRoofVisible,
  terraceRoofVisible,
  wallIsExterior,
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
import { containerSignature, selectionExists } from '../../client/src/ui/lootState.js';

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
  assert.ok(Math.abs((wall.to - wall.from) * TILE_SIZE_M - 19.2) < 1e-9);
  const intervals = solidIntervals(wall, [door]);
  assert.equal(intervals.length, 2);
  assert.ok(Math.abs(intervals[0].startM) < 1e-9);
  assert.ok(Math.abs(intervals[0].endM - 10.4) < 1e-9);
  assert.ok(Math.abs(intervals[1].startM - 11.6) < 1e-9);
  assert.ok(Math.abs(intervals[1].endM - 19.2) < 1e-9);
  const center = openingCenter(wall, door);
  assert.ok(Math.abs(center.x - 34.8125) < 0.1 || Math.abs(center.x - 35.0) < 0.5);
  assert.equal(center.y, 37.0);
});

test('rooms are connected masks, do not overlap, and attach to openings', () => {
  const world = new World('test-rooms');
  const floor = floorOf(world);
  const west = floor.rooms.find((room) => room.id === 'room:test:0:west')!;
  const east = floor.rooms.find((room) => room.id === 'room:test:0:east')!;
  const westGeometry = buildRoomGeometry(west);
  const eastGeometry = buildRoomGeometry(east);
  assert.equal(westGeometry.cells.length, 45);
  assert.equal(eastGeometry.cells.length, 36);
  assert.equal(roomsOverlap(westGeometry, eastGeometry), false);
  assert.equal(world.roomContains('room:test:0:west', 31.5, 33.0), true);
  assert.equal(world.roomContains('room:test:0:east', 38.0, 33.0), true);
  assert.equal(world.roomContains('room:test:0:west', 38.0, 33.0), false);
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
  const baseSupport = supportPoint(worldFootprintParts(base, wardrobe));
  assert.ok(baseSupport.x > baseAabb.minX && baseSupport.x < baseAabb.maxX, 'support X must be the footprint centre, not a corner');
  assert.equal(baseSupport.y, baseAabb.maxY, 'support Y must be the front footprint edge');
  assert.ok(supportPoint(worldFootprintParts(rotated, wardrobe)).y > baseSupport.y);
});

test('closed doors block movement, open doors allow passage', () => {
  const world = new World('test-door-collision');
  const start = { x: 34.8, y: 36.2 };
  const closedGrid = world.getCollisionGrid(0);
  const blocked = moveCircle(closedGrid, start.x, start.y, 0, 1.6, PLAYER_RADIUS);
  assert.ok(blocked.y < 37.0, `closed door should stop movement, ended at ${blocked.y}`);
  world.setDoorOpen('o:test:0:door', true);
  const openGrid = world.getCollisionGrid(0);
  const passed = moveCircle(openGrid, start.x, start.y, 0, 1.6, PLAYER_RADIUS);
  assert.ok(passed.y > 37.0, `open door should allow passage, ended at ${passed.y}`);
});

test('walls and windows participate in line of sight', () => {
  const world = new World('test-sight');
  const floor = floorOf(world);
  const objects = world.objects;
  const templates = OBJECT_TEMPLATES;
  const states = world.getObjectStateRecord();
  assert.equal(
    hasFloorSight(floor, world.getOpeningStates(), { x: 32.0, y: 36.5 }, { x: 32.0, y: 38.0 }, 'sight', objects, templates, states),
    false,
    'solid south wall must block sight',
  );
  world.setWindowState('o:test:0:window_east', { broken: false, boarded: false });
  assert.equal(
    hasFloorSight(floor, world.getOpeningStates(), { x: 39.5, y: 32.5 }, { x: 40.5, y: 32.5 }, 'sight', objects, templates, states),
    false,
    'intact window must block sight',
  );
  world.setWindowState('o:test:0:window_east', { broken: true });
  assert.equal(
    hasFloorSight(floor, world.getOpeningStates(), { x: 39.5, y: 32.5 }, { x: 40.5, y: 32.5 }, 'sight', objects, templates, states),
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

function reachable(
  grid: ReturnType<World['getCollisionGrid']>,
  from: { x: number; y: number },
  to: { x: number; y: number },
  step = 0.0625,
): boolean {
  if (circleHits(grid, from.x, from.y, PLAYER_RADIUS) || circleHits(grid, to.x, to.y, PLAYER_RADIUS)) return false;
  const q: Array<{ x: number; y: number }> = [from];
  const seen = new Set<string>([`${Math.round(from.x / step)},${Math.round(from.y / step)}`]);
  while (q.length) {
    const p = q.shift()!;
    if (Math.hypot(p.x - to.x, p.y - to.y) < step * 0.5) return true;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = p.x + dx * step;
        const y = p.y + dy * step;
        const key = `${Math.round(x / step)},${Math.round(y / step)}`;
        if (x < 0 || y < 0 || x >= 128 || y >= 128 || seen.has(key)) continue;
        if (circleHits(grid, x, y, PLAYER_RADIUS)) continue;
        seen.add(key);
        q.push({ x, y });
      }
    }
  }
  return false;
}

test('floor support mask keeps the terrace and blocks its edges', () => {
  const world = new World('test-support-mask');
  assert.equal(world.isWalkable(35.5, 30.5, 1), true, 'mansard interior must stay walkable');
  assert.equal(world.isWalkable(35.5, 35.5, 1), true, 'terrace surface must be walkable');
  assert.equal(world.isWalkable(40.5, 35.5, 1), false, 'east edge of terrace must be blocked');
  assert.equal(world.isWalkable(35.5, 37.5, 1), false, 'south edge of terrace must be blocked');
  assert.equal(world.isWalkable(34.5, 30.5, 1), false, 'stairwell hole must be blocked');
  assert.equal(world.isWalkable(34.5, 29.5, 1), true, 'upper stair landing must be usable');
  assert.equal(world.isWalkable(35.5, 41.0, 0), true, 'ground outside the manor is still walkable');
  assert.equal(world.isWalkable(37.5, 30.5, 0), false, 'lower stairwell hole must be blocked');
  assert.equal(world.isWalkable(37.5, 29.5, 0), true, 'basement stair entry must be usable');
});

test('player-sized routes remain open around furniture and through arches', () => {
  const world = new World('test-routes');
  world.setDoorOpen('o:test:1:door_terrace', true);
  assert.equal(
    circleHits(world.getCollisionGrid(0), 32.9, 28.6, PLAYER_RADIUS),
    true,
    'nightstand/partition gap is narrower than the player and must stay blocked',
  );
  assert.equal(reachable(world.getCollisionGrid(0), { x: 31, y: 33 }, { x: 38, y: 33 }), true, 'bedroom to kitchen');
  assert.equal(reachable(world.getCollisionGrid(0), { x: 31, y: 33 }, { x: 37.5, y: 29.5 }), true, 'bedroom to basement stair');
  assert.equal(reachable(world.getCollisionGrid(0), { x: 31, y: 33 }, { x: 34.5, y: 32.5 }), true, 'bedroom to mansard stair');
  const archWest = moveCircle(world.getCollisionGrid(0), 33.0, 33.32, 2.0, 0, PLAYER_RADIUS);
  assert.ok(archWest.x > 34.5, 'player-sized movement must pass the west partition arch');
  const archEast = moveCircle(world.getCollisionGrid(0), 35.0, 33.32, 2.0, 0, PLAYER_RADIUS);
  assert.ok(archEast.x > 36.5, 'player-sized movement must pass the east partition arch');
  assert.equal(reachable(world.getCollisionGrid(1), { x: 32, y: 31 }, { x: 35.5, y: 35.5 }), true, 'mansard to terrace');
  assert.equal(reachable(world.getCollisionGrid(1), { x: 32, y: 31 }, { x: 35.5, y: 37.5 }), false, 'terrace edge is not walkable');
});

test('floor elevation comes from FloorSpec data, including the basement and mansard', () => {
  const world = new World('test-floor-elevation');
  const floors = world.buildings.flatMap((building) => building.floors);
  assert.equal(floorElevationM(floors, 0), 0);
  assert.equal(floorElevationM(floors, -1), -3.0);
  assert.equal(floorElevationM(floors, 1), 2.8);
});

test('walkable surfaces resolve terrace height and building context', () => {
  const world = new World('test-surfaces');
  assert.equal(surfaceElevationM(world.getFloor(1) ? [world.getFloor(1)!] : [], 1, 32, 30), 2.8);
  assert.equal(world.surfaceElevationAt(32, 30, 1), 2.8);
  assert.equal(world.surfaceElevationAt(35.5, 35.5, 1), 3.05);
  assert.equal(surfaceHitAt([world.getFloor(1)!], 1, 35.5, 35.5)?.kind, 'walkable');
  assert.equal(world.buildingAt(35.5, 35.5, 1)?.id, 'b:v3:test:28:28');
  assert.equal(world.roomAt(35.5, 35.5, 1), null);
  assert.equal(world.buildingAt(41, 35, 1), null);
});

test('floor visibility matrix is consistent for all supported levels', () => {
  const groundInside = floorVisibility(0, 0, true);
  assert.deepEqual(
    { surface: groundInside.surface, walls: groundInside.walls, furniture: groundInside.furniture, stairs: groundInside.stairs },
    { surface: true, walls: true, furniture: true, stairs: true },
  );
  const groundUnderMansard = floorVisibility(0, 1, true);
  assert.equal(groundUnderMansard.surface, false);
  assert.equal(groundUnderMansard.walls, true);
  assert.equal(groundUnderMansard.furniture, false);
  const terraceFromGround = floorVisibility(1, 0, false);
  assert.equal(terraceFromGround.surface, true);
  assert.equal(terraceFromGround.walls, true);
  assert.equal(terraceFromGround.furniture, false);
  assert.equal(floorVisibility(1, 0, true).visible, false);
  assert.equal(floorVisibility(-1, -1, true).visible, true);
  assert.equal(mansardRoofVisible(0, true), false);
  assert.equal(mansardRoofVisible(0, false), true);
  assert.equal(terraceRoofVisible(1, true), true);
  assert.equal(terraceRoofVisible(0, true), false);
});

test('cutaway and exterior wall helpers use geometry, not test ids', () => {
  const world = new World('test-visibility');
  const ground = world.getFloor(0)!;
  const cut = cutWallIds(ground, 31, 33);
  assert.ok(cut.has('w:test:0:south'));
  assert.ok(cut.has('w:test:0:east'));
  assert.equal(wallIsExterior(ground.wallRuns.find((run) => run.id === 'w:test:0:south')!, ground), true);
  assert.equal(wallIsExterior(ground.wallRuns.find((run) => run.id === 'w:test:0:part_west')!, ground), false);
});

test('stair geometry and prompt target the real destination floor', () => {
  const world = new World('test-stair-model');
  const ground = world.getFloor(0)!;
  const wallX = ground.wallRuns.find((run) => run.id === 'w:test:0:part_west')!;
  const mansard = ground.stairs.find((stair) => stair.id === 's:test:0:1')!;
  assert.equal(wallX.fixed, 33);
  assert.equal(mansard.hole.x >= wallX.fixed + wallX.thicknessM / 2, true, 'stairwell must not cut the partition');
  assert.equal(stairPromptFor(0, -1), 'Спуститься в подвал');
  assert.equal(stairPromptFor(0, 1), 'Подняться на мансарду');
  assert.equal(stairPromptFor(1, 0), 'Спуститься на первый этаж');
  assert.equal(stairPromptFor(-1, 0), 'Подняться на первый этаж');
});

test('loot selection survives stable ground snapshots', () => {
  const ground = {
    id: '__ground__',
    label: 'Земля',
    type: 'ground',
    maxSlots: 12,
    items: [{ id: 'g1', key: 'bandage', qty: 1, name: 'Бинт', weight: 0.1, equipped: false, kind: 'med' as const, durability: 100 }],
  };
  const inv = { items: [], weight: 0, maxWeight: 26, slots: 24, equipped: null };
  assert.equal(containerSignature(ground), containerSignature({ ...ground, items: [...ground.items] }));
  assert.equal(selectionExists('g1', inv, ground), true);
  assert.equal(selectionExists('g1', inv, { ...ground, items: [] }), false);
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


function makeStairPlayer(x: number, y: number, floor: number) {
  return {
    id: 999,
    userId: 999,
    name: 'StairTester',
    x,
    y,
    floor,
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
}

test('server stair transition changes floor only through an explicit stair interaction', async () => {
  await waitForDatabase();
  const world = new World('test-stairs');
  const sim = new Simulation(world);
  await sim.init();
  const player = makeStairPlayer(37.5, 29.5, 0);
  sim.players.set(999, player);
  sim.handleMessage(999, { t: 'use_stairs', seq: 1, id: 's:test:0:-1' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(player.floor, -1);
  assert.ok(Math.abs(player.x - 37.5) < 1e-9);
  assert.ok(Math.abs(player.y - 33.5) < 1e-9);
});



test('stairs can be traversed in both directions on every floor', async () => {
  await waitForDatabase();
  const world = new World('test-stairs');
  const sim = new Simulation(world);
  await sim.init();
  const player = makeStairPlayer(34.5, 32.5, 0);
  sim.players.set(999, player);

  sim.handleMessage(999, { t: 'use_stairs', seq: 1, id: 's:test:0:1' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(player.floor, 1, 'mansard ascent must reach floor 1');
  assert.ok(Math.abs(player.x - 34.5) < 1e-9);
  assert.ok(Math.abs(player.y - 29.5) < 1e-9);

  player.lastStairAt = 0;
  sim.handleMessage(999, { t: 'use_stairs', seq: 2, id: 's:test:0:1' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(player.floor, 0, 'return from mansard must reach floor 0');
  assert.ok(Math.abs(player.x - 34.5) < 1e-9);
  assert.ok(Math.abs(player.y - 32.5) < 1e-9);

  player.x = 37.5;
  player.y = 29.5;
  player.lastStairAt = 0;
  sim.handleMessage(999, { t: 'use_stairs', seq: 3, id: 's:test:0:-1' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(player.floor, -1, 'basement descent must reach floor -1');

  player.lastStairAt = 0;
  sim.handleMessage(999, { t: 'use_stairs', seq: 4, id: 's:test:0:-1' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(player.floor, 0, 'return from basement must reach floor 0');
  assert.ok(Math.abs(player.x - 37.5) < 1e-9);
  assert.ok(Math.abs(player.y - 29.5) < 1e-9);
});

test('server and client build identical per-floor collision from the same chunk data', () => {
  const world = new World('test-parity');
  const client = new ClientWorld();
  for (let cy = 0; cy <= 1; cy++) {
    for (let cx = 0; cx <= 1; cx++) client.loadChunk(world.chunkData(cx, cy));
  }
  for (const floor of [0, -1, 1]) {
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
