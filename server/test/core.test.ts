import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRAFT_RECIPES,
  ITEMS,
  LOOT_TABLES,
  PLAYER_RADIUS,
  TILE,
  canCarry,
  decodeRLE,
  encodeRLE,
  inAttackArc,
  moveCircle,
  type CollisionGrid,
} from '@ashfall/shared';
import { World } from '../src/game/world.js';

function gridWithWall(): CollisionGrid {
  const grid: CollisionGrid = { w: 16, h: 16, cells: new Uint8Array(16 * 16) };
  for (let y = 0; y < 16; y++) grid.cells[y * 16 + 8] = 1;
  return grid;
}

test('RLE roundtrip preserves data', () => {
  const values = new Uint8Array(1024);
  for (let i = 0; i < values.length; i++) values[i] = i % 7 === 0 ? 3 : i % 3;
  const encoded = encodeRLE(values);
  const decoded = decodeRLE(encoded, values.length);
  assert.deepEqual([...decoded], [...values]);
});

test('RLE handles empty input', () => {
  assert.equal(encodeRLE([]), '');
  assert.equal(decodeRLE('', 4).length, 4);
});

test('movement is blocked by walls', () => {
  const grid = gridWithWall();
  const result = moveCircle(grid, 6.5, 6.5, 3, 0, PLAYER_RADIUS);
  assert.ok(result.x < 8, 'player must not pass through the wall');
  assert.ok(result.x > 6.5, 'player should move toward the wall');
});

test('movement slides along a wall', () => {
  const grid = gridWithWall();
  const result = moveCircle(grid, 7.6, 6.5, 1, 1, PLAYER_RADIUS);
  assert.ok(result.x < 8, 'x must remain on the near side of the wall');
  assert.ok(result.y > 6.5, 'y should still advance');
});

test('attack arc rejects targets behind the attacker', () => {
  assert.equal(inAttackArc(5, 5, 0, 6.2, 5, 2), true);
  assert.equal(inAttackArc(5, 5, 0, 4, 5, 2), false);
  assert.equal(inAttackArc(5, 5, 0, 8.5, 5, 2), false);
});

test('inventory weight limits are enforced', () => {
  const heavy = [{ key: 'axe', qty: 8 }];
  assert.equal(canCarry(heavy, 'bandage', 1), false);
  assert.equal(canCarry([{ key: 'bandage', qty: 5 }], 'water_bottle', 1), true);
});

test('all loot table entries point at known items', () => {
  for (const [kind, rows] of Object.entries(LOOT_TABLES)) {
    for (const [key, min, max] of rows) {
      assert.ok(ITEMS[key], `${kind} references unknown item ${key}`);
      assert.ok(min > 0 && max >= min, `${kind}/${key} has invalid quantity range`);
    }
  }
});

test('world generation is deterministic and spawn is clear', () => {
  const a = new World('test-seed');
  const b = new World('test-seed');
  assert.equal(a.buildings.length, b.buildings.length);
  assert.equal(a.props.length, b.props.length);
  assert.deepEqual([...a.tiles.slice(0, 512)], [...b.tiles.slice(0, 512)]);
  assert.ok(a.buildings.length > 10);
  const sx = Math.floor(a.spawn.x);
  const sy = Math.floor(a.spawn.y);
  assert.equal(a.tiles[sy * 128 + sx], TILE.ASPHALT);
  assert.equal(a.collision[sy * 128 + sx], 0);
});

test('chunk payload is decodable and contains the spawn chunk', () => {
  const world = new World('test-seed');
  const chunk = world.chunkData(1, 1);
  assert.equal(chunk.cx, 1);
  assert.equal(chunk.cy, 1);
  assert.equal(decodeRLE(chunk.tiles, 1024).length, 1024);
  assert.equal(decodeRLE(chunk.walls, 1024).length, 1024);
  assert.ok(chunk.buildings.length > 0);
});

test('a different seed produces a different city', () => {
  const a = new World('seed-a');
  const b = new World('seed-b');
  const aNames = a.buildings.map((x) => x.name).join('|');
  const bNames = b.buildings.map((x) => x.name).join('|');
  assert.notEqual(aNames, bNames);
});

test('craft recipes have valid items and positive ingredient counts', () => {
  assert.ok(CRAFT_RECIPES.length > 0);
  for (const recipe of CRAFT_RECIPES) {
    assert.ok(ITEMS[recipe.resultKey], `Recipe ${recipe.id} produces unknown item ${recipe.resultKey}`);
    assert.ok(recipe.resultQty > 0, `Recipe ${recipe.id} resultQty must be > 0`);
    assert.ok(recipe.ingredients.length > 0, `Recipe ${recipe.id} has no ingredients`);
    for (const ing of recipe.ingredients) {
      assert.ok(ITEMS[ing.key], `Ingredient ${ing.key} in ${recipe.id} is unknown`);
      assert.ok(ing.qty > 0, `Ingredient ${ing.key} quantity must be > 0`);
    }
  }
});

test('all building doors have passable interior thresholds', () => {
  const world = new World('test-doors');
  assert.ok(world.doors.size > 0);
  for (const door of world.doors.values()) {
    const idx = world.idx(door.x, door.y);
    assert.equal(world.walls[idx], 0, `Doorway tile (${door.x}, ${door.y}) must not have a wall`);
  }
});
