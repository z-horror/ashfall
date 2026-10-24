import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ITEMS,
  PLAYER_RADIUS,
  canCarry,
  createGrid,
  moveCircle,
  type CollisionGrid,
  type StackLike,
} from '@ashfall/shared';
import { World } from '../src/game/world.js';
import { Simulation, type Conn } from '../src/game/simulation.js';
import { config } from '../src/config.js';
import { pool, waitForDatabase } from '../src/persistence/db.js';
import * as repo from '../src/persistence/repo.js';

function makeMockPlayer(id: number, name: string, x = 20, y = 20) {
  const dummyConn: Conn = {
    send: (_msg) => {},
    close: () => {},
  };
  return {
    id,
    userId: id,
    name,
    x,
    y,
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
    conn: dummyConn,
    offlineAt: null,
    lastAttackAt: 0,
    lastDamageAt: 0,
    lastSeq: new Map(),
    sentChunks: new Set<string>(),
    chunkX: 0,
    chunkY: 0,
    lastSubCheck: 0,
    lastChatAt: 0,
  };
}

// -------------------------------------------------------------
// 1. Запрет тестовых действий обычному игроку
// -------------------------------------------------------------
test('P0: regular players cannot execute dev actions, admins can', async () => {
  const world = new World('test-admin-sec');
  const sim = new Simulation(world);

  const regular = makeMockPlayer(1001, 'RegularPlayer');
  sim.players.set(regular.id, regular);

  // By default, allowDevActions is false and adminUsers is empty
  config.allowDevActions = false;
  config.adminUsers = ['superadmin'];

  assert.equal(sim.isPlayerAdmin(regular), false, 'Regular player must not be admin');

  // Attempt dev_action on regular player
  const notices: string[] = [];
  regular.conn!.send = (msg) => {
    if (msg.t === 'notice') notices.push(msg.text);
  };

  // Trigger dev action via handleDevAction (accessing via packet simulation)
  sim.handleMessage(regular.id, { t: 'dev_action', seq: 1, action: 'kit' });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(regular.inventory.length, 0, 'Regular player must not be granted combat kit');
  assert.ok(
    notices.some((n) => n.includes('запрещено')),
    'Server must send forbidden notice to regular player',
  );

  // Admin player
  const admin = makeMockPlayer(1002, 'SuperAdmin');
  sim.players.set(admin.id, admin);
  assert.equal(sim.isPlayerAdmin(admin), true, 'SuperAdmin must have admin privileges');
});

// -------------------------------------------------------------
// 2. Закрытие двери на персонаже (безопасное вытеснение)
// -------------------------------------------------------------
test('P0: closing door on character safely displaces player outside doorway', () => {
  const world = new World('test-door-displace');
  const sim = new Simulation(world);

  // South door at (12, 14)
  const southDoor = { id: 'd:12:14', x: 12, y: 14, open: true, locked: false, hp: 100, facing: 'south' as const };
  world.doors.set(southDoor.id, southDoor);

  const playerSouth = makeMockPlayer(2001, 'StuckPlayerSouth', 12.5, 14.5);
  sim.players.set(playerSouth.id, playerSouth);

  // Close the south door
  sim.resolveDoorClose(southDoor);

  // Player must be displaced away from [12, 13] x [14, 15]
  const inDoorX = playerSouth.x >= southDoor.x && playerSouth.x <= southDoor.x + 1;
  const inDoorY = playerSouth.y >= southDoor.y && playerSouth.y <= southDoor.y + 1;
  assert.equal(
    inDoorX && inDoorY,
    false,
    `Player must not remain inside south door cell: got (${playerSouth.x}, ${playerSouth.y})`,
  );
  // Distance from door cell edges must be at least PLAYER_RADIUS
  const circleIntersects =
    playerSouth.x + PLAYER_RADIUS > southDoor.x &&
    playerSouth.x - PLAYER_RADIUS < southDoor.x + 1 &&
    playerSouth.y + PLAYER_RADIUS > southDoor.y &&
    playerSouth.y - PLAYER_RADIUS < southDoor.y + 1;
  assert.equal(circleIntersects, false, 'Player bounding circle must not intersect closed door tile');

  // East door at (20, 18)
  const eastDoor = { id: 'd:20:18', x: 20, y: 18, open: true, locked: false, hp: 100, facing: 'east' as const };
  world.doors.set(eastDoor.id, eastDoor);

  const playerEast = makeMockPlayer(2002, 'StuckPlayerEast', 20.5, 18.5);
  sim.players.set(playerEast.id, playerEast);

  // Close the east door
  sim.resolveDoorClose(eastDoor);

  const inEastX = playerEast.x >= eastDoor.x && playerEast.x <= eastDoor.x + 1;
  const inEastY = playerEast.y >= eastDoor.y && playerEast.y <= eastDoor.y + 1;
  assert.equal(
    inEastX && inEastY,
    false,
    `Player must not remain inside east door cell: got (${playerEast.x}, ${playerEast.y})`,
  );
  const eastCircleIntersects =
    playerEast.x + PLAYER_RADIUS > eastDoor.x &&
    playerEast.x - PLAYER_RADIUS < eastDoor.x + 1 &&
    playerEast.y + PLAYER_RADIUS > eastDoor.y &&
    playerEast.y - PLAYER_RADIUS < eastDoor.y + 1;
  assert.equal(eastCircleIntersects, false, 'Player bounding circle must not intersect closed east door tile');
});

// -------------------------------------------------------------
// 3. Двери разных ориентаций
// -------------------------------------------------------------
test('P0: all generated doors have explicit supported facings (south or east)', () => {
  const world = new World('test-door-facings');
  assert.ok(world.doors.size > 0, 'World must generate doors');

  for (const door of world.doors.values()) {
    assert.ok(
      door.facing === 'south' || door.facing === 'east',
      `Door ${door.id} has invalid facing: ${door.facing}`,
    );

    const b = world.buildingAt(door.x + 0.5, door.y + 0.5);
    if (b) {
      // Must NOT be on the back walls (North y=by or West x=bx)
      assert.notEqual(door.x, b.x, `Door ${door.id} must not be on the west back wall`);
      assert.notEqual(door.y, b.y, `Door ${door.id} must not be on the north back wall`);

      if (door.facing === 'south') {
        assert.equal(door.y, b.y + b.h - 1, `South door ${door.id} must be on south wall of building`);
      } else if (door.facing === 'east') {
        assert.equal(door.x, b.x + b.w - 1, `East door ${door.id} must be on east wall of building`);
      }
    }
  }
});

// -------------------------------------------------------------
// 4. Перемещение через дверной проём
// -------------------------------------------------------------
test('P0: movement cleanly passes through an open 1-tile doorway and blocks when closed', () => {
  const grid: CollisionGrid = createGrid(16, 16);
  // Horizontal wall along y = 6, with doorway at x = 8
  for (let x = 0; x < 16; x++) {
    if (x !== 8) grid.cells[6 * 16 + x] = 1;
  }

  // Open doorway: move from (8.5, 4.0) southwards to y = 8.5
  const passSouth = moveCircle(grid, 8.5, 4.0, 0, 4.5, PLAYER_RADIUS);
  assert.ok(
    passSouth.y > 7.0,
    `Player must pass through open doorway at x=8: ended at y=${passSouth.y}`,
  );

  // Return back through doorway northwards
  const passNorth = moveCircle(grid, 8.5, 8.0, 0, -4.0, PLAYER_RADIUS);
  assert.ok(
    passNorth.y < 5.0,
    `Player must pass back through open doorway: ended at y=${passNorth.y}`,
  );

  // Close the door (cell at (8, 6) becomes solid)
  grid.cells[6 * 16 + 8] = 1;

  // Attempt to pass through closed door
  const blocked = moveCircle(grid, 8.5, 4.0, 0, 4.5, PLAYER_RADIUS);
  assert.ok(
    blocked.y < 6.0,
    `Player must be stopped before closed door: stopped at y=${blocked.y}`,
  );
});

// -------------------------------------------------------------
// 5. Вместимость инвентаря с неполными стеками
// -------------------------------------------------------------
test('P0: canCarry properly calculates capacity with partial stacks and slot overflows', () => {
  // Max slots = 4 for clear testing, maxWeight = 50
  const maxSlots = 4;
  const maxWeight = 50;

  // Case 1: Inventory is completely full (4/4 slots), but has stack of 11 bandages (stack limit = 12)
  const fullInvWithPartialStack: StackLike[] = [
    { key: 'pistol', qty: 1 },
    { key: 'axe', qty: 1 },
    { key: 'water_bottle', qty: 1 },
    { key: 'bandage', qty: 11 }, // Space for 1 more
  ];

  // Adding 1 bandage fits into the existing stack without needing a new slot
  assert.equal(
    canCarry(fullInvWithPartialStack, 'bandage', 1, maxSlots, maxWeight),
    true,
    '1 bandage must fit into existing partial stack (11+1=12)',
  );

  // Adding 2 bandages requires 1 new slot (11+1=12 in existing stack, 1 leftover), but 0 free slots exist!
  assert.equal(
    canCarry(fullInvWithPartialStack, 'bandage', 2, maxSlots, maxWeight),
    false,
    '2 bandages must fail because overflow needs a free slot and inventory is full',
  );

  // Case 2: Inventory has 1 free slot (3/4 slots), stack of 11 bandages
  const threeSlots: StackLike[] = [
    { key: 'pistol', qty: 1 },
    { key: 'axe', qty: 1 },
    { key: 'bandage', qty: 11 },
  ];

  // Adding 2 bandages: 1 into existing stack, 1 into the 1 free slot -> fits!
  assert.equal(
    canCarry(threeSlots, 'bandage', 2, maxSlots, maxWeight),
    true,
    '2 bandages must fit when 1 free slot is available for the overflow',
  );

  // Adding 15 bandages: 1 into existing stack, 14 leftover requires 2 new slots (ceil(14/12) = 2), but only 1 free slot!
  assert.equal(
    canCarry(threeSlots, 'bandage', 15, maxSlots, maxWeight),
    false,
    '15 bandages must fail because 2 slots are needed for overflow, but only 1 is free',
  );

  // Case 3: Weight limit exceeded
  const heavyInv: StackLike[] = [{ key: 'axe', qty: 7 }]; // 7 * 3.4kg = 23.8kg
  assert.equal(
    canCarry(heavyInv, 'axe', 1, 16, 26),
    false,
    'Adding items exceeding max weight (26kg) must return false',
  );
});

// -------------------------------------------------------------
// 6. Крафт при нехватке места
// -------------------------------------------------------------
test('P0: craft capacity check rejects crafting when result does not fit', () => {
  // Create simulated inventory where all 16 slots are full of single-item tools
  // Plus 1 slot of scrap metal with 10 units (spiked_bat takes 3, leaves 7, so slot is NOT freed)
  const fullInventory: StackLike[] = [
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'crowbar', qty: 1 },
    { key: 'bat', qty: 1 }, // Consumed
    { key: 'scrap', qty: 10 }, // 3 consumed, 7 remain
  ];

  // Recipe spiked_bat consumes 1 bat (frees 1 slot) and 3 scrap (leaves 7 scrap, no slot freed).
  // Net free slots = 1. Spiked bat fits!
  // BUT if bat was NOT in inventory or if all 16 slots are occupied by items where none is fully consumed:
  const noSlotFreeInventory: StackLike[] = [
    ...fullInventory.slice(0, 14),
    { key: 'scrap', qty: 10 }, // Leaves 7
    { key: 'scrap', qty: 10 }, // Leaves 10
  ];
  // If player tries to craft an item requiring a new slot:
  const fitsNoSlot = canCarry(noSlotFreeInventory, 'spiked_bat', 1);
  assert.equal(fitsNoSlot, false, 'Crafting spiked_bat must fail because no free slots exist for the result');

  // Weight capacity check: player has 1 free slot, but adding heavy item exceeds INVENTORY_WEIGHT (26kg)
  const heavyInventory: StackLike[] = [
    { key: 'axe', qty: 7 }, // 7 * 3.4 = 23.8kg
  ];
  const fitsWeight = canCarry(heavyInventory, 'axe', 1); // 23.8 + 3.4 = 27.2kg > 26kg
  assert.equal(fitsWeight, false, 'Crafting item that exceeds max weight must fail');
});

// -------------------------------------------------------------
// 7. Два конкурентных запроса на крафт & Откат транзакции
// -------------------------------------------------------------
test('P0: database transaction atomically manages craft ingredients and rolls back on error', async () => {
  await waitForDatabase();

  const user = await repo.createUser(`test_crafter_${Date.now()}`, 'hashpass123');
  const char = await repo.getOrCreateCharacter(user.id, `Char_${Date.now()}`, { x: 48, y: 48 });

  // Clear any starter items
  await pool.query('DELETE FROM character_items WHERE character_id = $1', [char.id]);

  // Give player exactly 2 cloth (cloth). Recipe "bandage" requires 2 cloth.
  await repo.withTransaction(async (client) => {
    await repo.addCharacterItem(client, char.id, 'cloth', 2, 1);
  });

  const itemsBefore = await repo.loadCharacterItems(char.id);
  assert.equal(itemsBefore.length, 1);
  assert.equal(itemsBefore[0].qty, 2);

  // Request 1: successful craft of bandage
  const success1 = await repo.withTransaction(async (client) => {
    const res = await client.query<{ id: string; item_key: string; qty: number }>(
      'SELECT id, item_key, qty FROM character_items WHERE character_id = $1 FOR UPDATE',
      [char.id],
    );
    const dbItems = res.rows;
    const totalCloth = dbItems.filter((i) => i.item_key === 'cloth').reduce((s, i) => s + i.qty, 0);
    if (totalCloth < 2) throw new Error('NOT_ENOUGH_INGREDIENTS');

    // Deduct 2 cloth
    let needed = 2;
    for (const it of dbItems.filter((i) => i.item_key === 'cloth')) {
      if (needed <= 0) break;
      const take = Math.min(it.qty, needed);
      await repo.takeCharacterItem(client, char.id, it.id, take);
      needed -= take;
    }

    // Add 1 bandage
    await repo.addCharacterItem(client, char.id, 'bandage', 1, 1);
    return true;
  });
  assert.equal(success1, true);

  // Request 2 (concurrent or immediate follow-up): tries to craft second bandage with same initial assumption
  let failedAsExpected = false;
  try {
    await repo.withTransaction(async (client) => {
      const res = await client.query<{ id: string; item_key: string; qty: number }>(
        'SELECT id, item_key, qty FROM character_items WHERE character_id = $1 FOR UPDATE',
        [char.id],
      );
      const totalCloth = res.rows.filter((i) => i.item_key === 'cloth').reduce((s, i) => s + i.qty, 0);
      if (totalCloth < 2) throw new Error('NOT_ENOUGH_INGREDIENTS');
      await repo.addCharacterItem(client, char.id, 'bandage', 1, 1);
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_ENOUGH_INGREDIENTS') {
      failedAsExpected = true;
    }
  }
  assert.equal(failedAsExpected, true, 'Second craft request must fail due to insufficient ingredients');

  // Verify DB state: exactly 1 bandage, 0 cloth
  const itemsAfter = await repo.loadCharacterItems(char.id);
  assert.equal(itemsAfter.length, 1);
  assert.equal(itemsAfter[0].key, 'bandage');
  assert.equal(itemsAfter[0].qty, 1);

  // 8. Откат транзакции при ошибке (rollback test)
  let rollbackHappened = false;
  try {
    await repo.withTransaction(async (client) => {
      // Deduct the bandage
      await repo.takeCharacterItem(client, char.id, itemsAfter[0].id, 1);
      // Simulate synthetic error during transaction
      throw new Error('SYNTHETIC_CRAFT_ERROR');
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'SYNTHETIC_CRAFT_ERROR') {
      rollbackHappened = true;
    }
  }
  assert.equal(rollbackHappened, true);

  // Verify that rollback preserved the bandage in DB without partial loss
  const itemsAfterRollback = await repo.loadCharacterItems(char.id);
  assert.equal(itemsAfterRollback.length, 1);
  assert.equal(itemsAfterRollback[0].key, 'bandage');
  assert.equal(itemsAfterRollback[0].qty, 1);

  // Cleanup test user
  await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
  await pool.end();
});
