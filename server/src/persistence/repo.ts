import type pg from 'pg';
import { randomBytes } from 'node:crypto';
import { ITEMS } from '@ashfall/shared';
import { config } from '../config.js';
import { pool, query, withTransaction } from './db.js';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_admin?: boolean;
  is_banned?: boolean;
  banned_at?: string | null;
  ban_reason?: string | null;
  registered_with_invite?: string | null;
  created_at?: string;
}

export interface CharacterRow {
  id: number;
  user_id: number;
  name: string;
  x: number;
  y: number;
  floor: number;
  aim: number;
  hp: number;
  stamina: number;
  hunger: number;
  thirst: number;
  status: 'alive' | 'dead';
  dead_until: string | null;
  xp: number;
  kills: number;
  deaths: number;
}

export interface ItemRow {
  id: string;
  key: string;
  qty: number;
  durability: number;
  equipped: boolean;
}

export interface GroundRow {
  id: string;
  key: string;
  qty: number;
  x: number;
  y: number;
  floor: number;
  durability: number;
}

export interface ContainerRow {
  id: string;
  type: string;
  x: number;
  y: number;
  floor: number;
  building_id: string | null;
  room_id: string | null;
  object_id: string | null;
  generated: boolean;
  opened: boolean;
}

export interface ZombieRow {
  id: string;
  chunk_x: number;
  chunk_y: number;
  type: number;
  x: number;
  y: number;
  aim: number;
  hp: number;
  state: string;
  alive: boolean;
}

export async function createUser(username: string, passwordHash: string): Promise<{ id: number }> {
  const res = await query<{ id: number }>(
    'INSERT INTO users(username, username_lc, password_hash) VALUES ($1, lower($1), $2) RETURNING id',
    [username, passwordHash],
  );
  return res.rows[0];
}

export async function getUserByUsername(username: string): Promise<UserRow | null> {
  const res = await query<UserRow>('SELECT * FROM users WHERE username_lc = lower($1)', [username]);
  return res.rows[0] ?? null;
}

export async function createSession(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
  await query('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    tokenHash,
    userId,
    expiresAt,
  ]);
}

export async function getSession(tokenHash: string): Promise<{ userId: number; username: string; isBanned: boolean; isAdmin: boolean; expiresAt: Date } | null> {
  const res = await query<{ user_id: number; username: string; is_banned: boolean; is_admin: boolean; expires_at: Date }>(
    `SELECT s.user_id, u.username, coalesce(u.is_banned, false) AS is_banned, coalesce(u.is_admin, false) AS is_admin, s.expires_at FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  const row = res.rows[0];
  return row ? { userId: row.user_id, username: row.username, isBanned: row.is_banned, isAdmin: row.is_admin, expiresAt: row.expires_at } : null;
}

export async function cleanupSessions(): Promise<void> {
  await query('DELETE FROM sessions WHERE expires_at <= now()');
}

export async function getOrCreateCharacter(
  userId: number,
  name: string,
  spawn: { x: number; y: number },
): Promise<CharacterRow> {
  const existing = await query<CharacterRow>('SELECT * FROM characters WHERE user_id = $1', [userId]);
  if (existing.rows[0]) return existing.rows[0];
  return withTransaction(async (client) => {
    const created = await client.query<CharacterRow>(
      `INSERT INTO characters(user_id, name, x, y)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [userId, name, spawn.x, spawn.y],
    );
    if (!created.rows[0]) {
      const again = await client.query<CharacterRow>('SELECT * FROM characters WHERE user_id = $1', [userId]);
      return again.rows[0];
    }
    const starter: Array<[string, number, boolean]> = config.testCombatBuffs
      ? [
          ['spiked_bat', 1, true],
          ['bandage', 4, false],
          ['water_bottle', 2, false],
          ['canned_food', 3, false],
          ['pistol', 1, false],
          ['ammo_9mm', 36, false],
        ]
      : [
          ['bat', 1, true],
          ['bandage', 2, false],
          ['water_bottle', 1, false],
          ['canned_food', 2, false],
          ['pistol', 1, false],
          ['ammo_9mm', 12, false],
        ];
    for (const [key, qty, equip] of starter) {
      await addStacked(client, 'character_items', 'character_id', created.rows[0].id, key, qty, 1);
      if (equip) {
        await client.query("UPDATE character_items SET equipped = true WHERE character_id = $1 AND item_key = $2", [
          created.rows[0].id,
          key,
        ]);
      }
    }
    return created.rows[0];
  });
}

export async function loadCharacter(userId: number): Promise<CharacterRow | null> {
  const res = await query<CharacterRow>('SELECT * FROM characters WHERE user_id = $1', [userId]);
  return res.rows[0] ?? null;
}

export async function saveCharacter(c: {
  id: number;
  x: number;
  y: number;
  floor?: number;
  aim: number;
  hp: number;
  stamina: number;
  hunger: number;
  thirst: number;
  status: 'alive' | 'dead';
  deadUntil: number | null;
}): Promise<void> {
  await query(
    `UPDATE characters SET x=$2, y=$3, aim=$4, hp=$5, stamina=$6, hunger=$7, thirst=$8,
       status=$9, dead_until=$10, floor=$11, updated_at=now() WHERE id=$1`,
    [
      c.id,
      c.x,
      c.y,
      c.aim,
      c.hp,
      c.stamina,
      c.hunger,
      c.thirst,
      c.status,
      c.deadUntil ? new Date(c.deadUntil) : null,
      c.floor ?? 0,
    ],
  );
}

export async function loadCharacterItems(characterId: number): Promise<ItemRow[]> {
  const res = await query<{ id: string; item_key: string; qty: number; durability: number; equipped: boolean }>(
    'SELECT id, item_key, qty, durability, equipped FROM character_items WHERE character_id = $1 ORDER BY created_at',
    [characterId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    key: r.item_key,
    qty: r.qty,
    durability: r.durability,
    equipped: r.equipped,
  }));
}

async function addStacked(
  client: pg.PoolClient,
  table: 'character_items' | 'container_items',
  ownerColumn: 'character_id' | 'container_id',
  ownerId: string | number,
  key: string,
  qty: number,
  durability: number,
): Promise<void> {
  const def = ITEMS[key];
  if (!def) throw new Error(`unknown item ${key}`);
  let remaining = qty;
  const existing = await client.query<{ id: string; qty: number }>(
    `SELECT id, qty FROM ${table} WHERE ${ownerColumn} = $1 AND item_key = $2
     ${table === 'character_items' ? 'AND equipped = false' : ''} ORDER BY id FOR UPDATE`,
    [ownerId, key],
  );
  for (const row of existing.rows) {
    if (remaining <= 0) break;
    const room = def.stack - row.qty;
    if (room <= 0) continue;
    const add = Math.min(room, remaining);
    await client.query(`UPDATE ${table} SET qty = qty + $2 WHERE id = $1`, [row.id, add]);
    remaining -= add;
  }
  while (remaining > 0) {
    const chunk = Math.min(remaining, def.stack);
    if (table === 'character_items') {
      await client.query(
        'INSERT INTO character_items(character_id, item_key, qty, durability) VALUES ($1,$2,$3,$4)',
        [ownerId, key, chunk, durability],
      );
    } else {
      await client.query(
        'INSERT INTO container_items(container_id, item_key, qty, durability) VALUES ($1,$2,$3,$4)',
        [ownerId, key, chunk, durability],
      );
    }
    remaining -= chunk;
  }
}

export async function addCharacterItem(
  client: pg.PoolClient,
  characterId: number,
  key: string,
  qty: number,
  durability = 1,
): Promise<void> {
  await addStacked(client, 'character_items', 'character_id', characterId, key, qty, durability);
}

export async function addContainerItem(
  client: pg.PoolClient,
  containerId: string,
  key: string,
  qty: number,
  durability = 1,
): Promise<void> {
  await addStacked(client, 'container_items', 'container_id', containerId, key, qty, durability);
}

export async function takeCharacterItem(
  client: pg.PoolClient,
  characterId: number,
  itemId: string,
  qty: number,
): Promise<{ key: string; qty: number; durability: number } | null> {
  const res = await client.query<{ item_key: string; qty: number; durability: number }>(
    'SELECT item_key, qty, durability FROM character_items WHERE id = $1 AND character_id = $2 FOR UPDATE',
    [itemId, characterId],
  );
  const row = res.rows[0];
  if (!row) return null;
  const take = Math.min(qty, row.qty);
  if (take >= row.qty) await client.query('DELETE FROM character_items WHERE id = $1', [itemId]);
  else await client.query('UPDATE character_items SET qty = qty - $2 WHERE id = $1', [itemId, take]);
  return { key: row.item_key, qty: take, durability: row.durability };
}

export async function takeContainerItem(
  client: pg.PoolClient,
  containerId: string,
  itemId: string,
  qty: number,
): Promise<{ key: string; qty: number; durability: number } | null> {
  const res = await client.query<{ item_key: string; qty: number; durability: number }>(
    'SELECT item_key, qty, durability FROM container_items WHERE id = $1 AND container_id = $2 FOR UPDATE',
    [itemId, containerId],
  );
  const row = res.rows[0];
  if (!row) return null;
  const take = Math.min(qty, row.qty);
  if (take >= row.qty) await client.query('DELETE FROM container_items WHERE id = $1', [itemId]);
  else await client.query('UPDATE container_items SET qty = qty - $2 WHERE id = $1', [itemId, take]);
  return { key: row.item_key, qty: take, durability: row.durability };
}

export async function setEquipped(characterId: number, itemId: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const res = await client.query('SELECT id, item_key FROM character_items WHERE id = $1 AND character_id = $2 FOR UPDATE', [
      itemId,
      characterId,
    ]);
    if (!res.rows[0]) return false;
    await client.query('UPDATE character_items SET equipped = false WHERE character_id = $1', [characterId]);
    await client.query('UPDATE character_items SET equipped = true WHERE id = $1', [itemId]);
    return true;
  });
}

export async function unequipAll(characterId: number): Promise<void> {
  await query('UPDATE character_items SET equipped = false WHERE character_id = $1', [characterId]);
}

export async function loadGroundItems(): Promise<GroundRow[]> {
  const res = await query<{ id: string; item_key: string; qty: number; x: number; y: number; floor: number; durability: number }>(
    'SELECT id, item_key, qty, x, y, floor, durability FROM ground_items',
  );
  return res.rows.map((r) => ({ id: r.id, key: r.item_key, qty: r.qty, x: r.x, y: r.y, floor: r.floor ?? 0, durability: r.durability }));
}

export async function insertGroundItem(
  client: pg.PoolClient,
  key: string,
  qty: number,
  x: number,
  y: number,
  durability: number,
  droppedBy: number | null,
  floor = 0,
): Promise<GroundRow> {
  const res = await client.query<{ id: string }>(
    'INSERT INTO ground_items(item_key, qty, x, y, durability, dropped_by, floor) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [key, qty, x, y, durability, droppedBy, floor],
  );
  return { id: res.rows[0].id, key, qty, x, y, floor, durability };
}

export async function deleteGroundItem(client: pg.PoolClient, id: string): Promise<GroundRow | null> {
  const res = await client.query<{ id: string; item_key: string; qty: number; x: number; y: number; floor: number; durability: number }>(
    'DELETE FROM ground_items WHERE id = $1 RETURNING id, item_key, qty, x, y, floor, durability',
    [id],
  );
  const row = res.rows[0];
  return row ? { id: row.id, key: row.item_key, qty: row.qty, x: row.x, y: row.y, floor: row.floor ?? 0, durability: row.durability } : null;
}

export interface DroppedRow {
  id: string;
  key: string;
  qty: number;
  x: number;
  y: number;
  durability: number;
}

export async function dropAllCharacterItems(characterId: number, x: number, y: number, floor = 0): Promise<DroppedRow[]> {
  return withTransaction(async (client) => {
    const res = await client.query<{ id: string; item_key: string; qty: number; durability: number }>(
      'SELECT id, item_key, qty, durability FROM character_items WHERE character_id = $1 FOR UPDATE',
      [characterId],
    );
    const out: DroppedRow[] = [];
    for (const row of res.rows) {
      const ox = x + (Math.random() - 0.5) * 0.7;
      const oy = y + (Math.random() - 0.5) * 0.7;
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO ground_items(item_key, qty, x, y, durability, dropped_by, floor) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [row.item_key, row.qty, ox, oy, row.durability, characterId, floor],
      );
      out.push({
        id: inserted.rows[0].id,
        key: row.item_key,
        qty: row.qty,
        x: ox,
        y: oy,
        durability: row.durability,
      });
    }
    await client.query('DELETE FROM character_items WHERE character_id = $1', [characterId]);
    await client.query('UPDATE characters SET deaths = deaths + 1, status = $2, updated_at = now() WHERE id = $1', [
      characterId,
      'dead',
    ]);
    return out;
  });
}

export async function ensureContainer(
  client: pg.PoolClient,
  id: string,
  type: string,
  x: number,
  y: number,
  floor = 0,
  buildingId: string | null = null,
  roomId: string | null = null,
  objectId: string | null = null,
): Promise<ContainerRow> {
  await client.query(
    `INSERT INTO world_containers(id, container_type, x, y, floor, building_id, room_id, object_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO NOTHING`,
    [id, type, Math.floor(x), Math.floor(y), floor, buildingId, roomId, objectId],
  );
  const res = await client.query<{
    id: string; container_type: string; x: number; y: number; floor: number;
    building_id: string | null; room_id: string | null; object_id: string | null;
    generated: boolean; opened: boolean;
  }>(
    'SELECT id, container_type, x, y, floor, building_id, room_id, object_id, generated, opened FROM world_containers WHERE id = $1 FOR UPDATE',
    [id],
  );
  const r = res.rows[0];
  return {
    id: r.id,
    type: r.container_type,
    x: r.x,
    y: r.y,
    floor: r.floor ?? 0,
    building_id: r.building_id,
    room_id: r.room_id,
    object_id: r.object_id,
    generated: r.generated,
    opened: r.opened,
  };
}

export async function setContainerGenerated(client: pg.PoolClient, id: string): Promise<void> {
  await client.query('UPDATE world_containers SET generated = true, opened = true, updated_at = now() WHERE id = $1', [id]);
}

export async function loadContainerItems(containerId: string): Promise<ItemRow[]> {
  const res = await query<{ id: string; item_key: string; qty: number; durability: number }>(
    'SELECT id, item_key, qty, durability FROM container_items WHERE container_id = $1 ORDER BY id',
    [containerId],
  );
  return res.rows.map((r) => ({ id: r.id, key: r.item_key, qty: r.qty, durability: r.durability, equipped: false }));
}

export async function loadDoorStates(): Promise<Map<string, { open: boolean; locked: boolean; hp: number; floor: number }>> {
  const res = await query<{ id: string; is_open: boolean; locked: boolean; hp: number; floor: number }>(
    'SELECT id, is_open, locked, hp, floor FROM world_doors',
  );
  const map = new Map<string, { open: boolean; locked: boolean; hp: number; floor: number }>();
  for (const r of res.rows) map.set(r.id, { open: r.is_open, locked: r.locked, hp: r.hp, floor: r.floor ?? 0 });
  return map;
}

export async function saveDoorState(id: string, x: number, y: number, open: boolean, locked: boolean, hp: number, floor = 0): Promise<void> {
  await query(
    `INSERT INTO world_doors(id, x, y, is_open, locked, hp, floor) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET is_open=$4, locked=$5, hp=$6, floor=$7, updated_at=now()`,
    [id, x, y, open, locked, hp, floor],
  );
}

export async function loadPropStates(): Promise<Map<string, { hp: number; destroyed: boolean }>> {
  const res = await query<{ id: string; hp: number; destroyed: boolean }>('SELECT id, hp, destroyed FROM world_props');
  const map = new Map<string, { hp: number; destroyed: boolean }>();
  for (const r of res.rows) map.set(r.id, { hp: r.hp, destroyed: r.destroyed });
  return map;
}

export async function savePropState(
  id: string,
  type: string,
  x: number,
  y: number,
  hp: number,
  destroyed: boolean,
): Promise<void> {
  await query(
    `INSERT INTO world_props(id, prop_type, x, y, hp, destroyed) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET hp=$5, destroyed=$6, updated_at=now()`,
    [id, type, x, y, hp, destroyed],
  );
}

export async function loadZombies(): Promise<ZombieRow[]> {
  const res = await query<{
    id: string;
    chunk_x: number;
    chunk_y: number;
    type: number;
    x: number;
    y: number;
    aim: number;
    hp: number;
    state: string;
    alive: boolean;
    floor: number;
  }>('SELECT id, chunk_x, chunk_y, type, x, y, aim, hp, state, alive, floor FROM world_zombies');
  return res.rows;
}

export async function upsertZombie(z: {
  id: string;
  chunkX: number;
  chunkY: number;
  type: number;
  x: number;
  y: number;
  floor?: number;
  aim: number;
  hp: number;
  state: string;
  alive: boolean;
}): Promise<void> {
  await query(
    `INSERT INTO world_zombies(id, chunk_x, chunk_y, type, x, y, aim, hp, state, alive, floor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET x=$5, y=$6, aim=$7, hp=$8, state=$9, alive=$10, floor=$11, updated_at=now()`,
    [z.id, z.chunkX, z.chunkY, z.type, z.x, z.y, z.aim, z.hp, z.state, z.alive, z.floor ?? 0],
  );
}

export async function markZombieDead(id: string): Promise<void> {
  await query('UPDATE world_zombies SET alive = false, updated_at = now() WHERE id = $1', [id]);
}

export async function touchChunk(cx: number, cy: number, seed: string, version = 1): Promise<void> {
  await query(
    `INSERT INTO world_chunks(cx, cy, seed, version) VALUES ($1,$2,$3,$4)
     ON CONFLICT (cx, cy) DO UPDATE SET last_seen = now(), version=$4`,
    [cx, cy, seed, version],
  );
}

export async function logEvent(kind: string, payload: unknown): Promise<void> {
  try {
    await query('INSERT INTO world_events(kind, payload) VALUES ($1, $2)', [kind, JSON.stringify(payload)]);
  } catch (err) {
    console.error('[db] failed to log event', (err as Error).message);
  }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await query(
    `INSERT INTO world_meta(key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, JSON.stringify(value)],
  );
}

export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  const res = await pool.query<{ value: T }>('SELECT value FROM world_meta WHERE key = $1', [key]);
  return res.rows[0]?.value ?? null;
}

export async function incrementKills(characterId: number): Promise<void> {
  await query('UPDATE characters SET kills = kills + 1 WHERE id = $1', [characterId]);
}

export async function countCharacters(): Promise<number> {
  const res = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM characters');
  return Number(res.rows[0]?.n ?? 0);
}


export async function deleteUser(userId: number): Promise<void> {
  await query('DELETE FROM users WHERE id = $1', [userId]);
}

export async function validateAndConsumeInvite(
  code: string,
  userId: number,
  ip: string,
): Promise<{ ok: boolean; reason?: string }> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return { ok: false, reason: 'Инвайт-код не указан' };

  return await withTransaction(async (client) => {
    const res = await client.query<{
      id: number;
      max_uses: number;
      uses_count: number;
      status: string;
      expires_at: Date | null;
    }>(
      `SELECT id, max_uses, uses_count, status, expires_at 
       FROM invite_codes 
       WHERE upper(code) = upper($1) 
       FOR UPDATE`,
      [cleanCode],
    );
    const row = res.rows[0];
    if (!row) {
      return { ok: false, reason: 'Инвайт-код не найден' };
    }
    if (row.status !== 'active') {
      return { ok: false, reason: `Инвайт-код недействителен (статус: ${row.status})` };
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      await client.query(`UPDATE invite_codes SET status = 'expired' WHERE id = $1`, [row.id]);
      return { ok: false, reason: 'Срок действия инвайт-кода истёк' };
    }
    if (row.max_uses > 0 && row.uses_count >= row.max_uses) {
      await client.query(`UPDATE invite_codes SET status = 'used' WHERE id = $1`, [row.id]);
      return { ok: false, reason: 'Лимит использований инвайт-кода исчерпан' };
    }

    const nextUses = row.uses_count + 1;
    const nextStatus = row.max_uses > 0 && nextUses >= row.max_uses ? 'used' : 'active';
    await client.query(
      `UPDATE invite_codes SET uses_count = $1, status = $2 WHERE id = $3`,
      [nextUses, nextStatus, row.id],
    );
    await client.query(
      `INSERT INTO invite_uses(invite_id, user_id, ip_address) VALUES ($1, $2, $3)`,
      [row.id, userId, ip],
    );
    await client.query(
      `UPDATE users SET registered_with_invite = $1 WHERE id = $2`,
      [cleanCode, userId],
    );
    return { ok: true };
  });
}

export async function createInviteCode(
  createdBy: number | null = null,
  note = '',
  maxUses = 1,
  expiresDays = 30,
): Promise<{ id: number; code: string; note: string | null; max_uses: number; expires_at: Date }> {
  const rand = randomBytes(4).toString('hex').toUpperCase();
  const code = `ASH-${rand.slice(0, 4)}-${rand.slice(4, 8)}`;
  const expiresAt = new Date(Date.now() + Math.max(1, expiresDays) * 86400_000);
  const res = await query<{ id: number; code: string; note: string | null; max_uses: number; expires_at: Date }>(
    `INSERT INTO invite_codes(code, created_by, max_uses, note, expires_at, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id, code, note, max_uses, expires_at`,
    [code, createdBy, Math.max(0, maxUses), note.trim() || null, expiresAt],
  );
  return res.rows[0];
}

export async function revokeInviteCode(code: string): Promise<boolean> {
  const res = await query(
    `UPDATE invite_codes SET status = 'revoked', revoked_at = now() WHERE upper(code) = upper($1) AND status = 'active'`,
    [code.trim()],
  );
  return (res.rowCount ?? 0) > 0;
}

export interface AdminInviteRow {
  id: number;
  code: string;
  note: string | null;
  max_uses: number;
  uses_count: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
  uses: Array<{ username: string; used_at: string; ip_address: string | null }>;
}

export async function listInviteCodes(): Promise<AdminInviteRow[]> {
  const invites = await query<{
    id: number;
    code: string;
    note: string | null;
    max_uses: number;
    uses_count: number;
    status: string;
    expires_at: string | null;
    created_at: string;
    revoked_at: string | null;
  }>(`SELECT id, code, note, max_uses, uses_count, status, expires_at, created_at, revoked_at 
      FROM invite_codes 
      ORDER BY id DESC`);

  const usesRes = await query<{
    invite_id: number;
    username: string;
    used_at: string;
    ip_address: string | null;
  }>(`SELECT iu.invite_id, u.username, iu.used_at, iu.ip_address 
      FROM invite_uses iu 
      JOIN users u ON u.id = iu.user_id 
      ORDER BY iu.used_at DESC`);

  const usesByInvite = new Map<number, Array<{ username: string; used_at: string; ip_address: string | null }>>();
  for (const u of usesRes.rows) {
    let arr = usesByInvite.get(u.invite_id);
    if (!arr) {
      arr = [];
      usesByInvite.set(u.invite_id, arr);
    }
    arr.push({ username: u.username, used_at: u.used_at, ip_address: u.ip_address });
  }

  return invites.rows.map((inv) => ({
    ...inv,
    uses: usesByInvite.get(inv.id) ?? [],
  }));
}

export interface AdminUserRow {
  id: number;
  username: string;
  is_admin: boolean;
  is_banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  registered_with_invite: string | null;
  created_at: string;
  character_name: string | null;
  character_hp: number | null;
  character_status: string | null;
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const res = await query<AdminUserRow>(`
    SELECT u.id, u.username, coalesce(u.is_admin, false) AS is_admin, 
           coalesce(u.is_banned, false) AS is_banned, u.banned_at, u.ban_reason, 
           u.registered_with_invite, u.created_at,
           c.name AS character_name, c.hp AS character_hp, c.status AS character_status
    FROM users u
    LEFT JOIN characters c ON c.user_id = u.id
    ORDER BY u.id DESC
  `);
  return res.rows;
}

export async function setUserBan(userId: number, banned: boolean, reason = ''): Promise<boolean> {
  const res = await query(
    `UPDATE users SET is_banned = $1, banned_at = (CASE WHEN $1 THEN now() ELSE NULL END), ban_reason = (CASE WHEN $1 THEN $2 ELSE NULL END) WHERE id = $3`,
    [banned, reason.trim() || null, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

export { withTransaction };

export async function loadWindowStates(): Promise<Map<string, { broken: boolean; boarded: boolean; hp: number }>> {
  const res = await query<{ id: string; broken: boolean; boarded: boolean; hp: number }>(
    'SELECT id, broken, boarded, hp FROM world_windows',
  );
  const map = new Map<string, { broken: boolean; boarded: boolean; hp: number }>();
  for (const row of res.rows) map.set(row.id, { broken: row.broken, boarded: row.boarded, hp: row.hp });
  return map;
}

export async function saveWindowState(id: string, broken: boolean, boarded: boolean, hp: number, floor = 0): Promise<void> {
  await query(
    `INSERT INTO world_windows(id, broken, boarded, hp, floor) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET broken=$2, boarded=$3, hp=$4, floor=$5, revision=world_windows.revision+1, updated_at=now()`,
    [id, broken, boarded, hp, floor],
  );
}

export async function loadObjectStates(): Promise<Map<string, { open: boolean; broken: boolean; destroyed: boolean; hp: number; on: boolean }>> {
  const res = await query<{ id: string; is_open: boolean; broken: boolean; destroyed: boolean; hp: number; is_on: boolean }>(
    'SELECT id, is_open, broken, destroyed, hp, is_on FROM world_objects',
  );
  const map = new Map<string, { open: boolean; broken: boolean; destroyed: boolean; hp: number; on: boolean }>();
  for (const row of res.rows) {
    map.set(row.id, { open: row.is_open, broken: row.broken, destroyed: row.destroyed, hp: row.hp, on: row.is_on });
  }
  return map;
}

export async function saveObjectState(
  id: string,
  floor: number,
  state: { open: boolean; broken: boolean; destroyed: boolean; hp: number; on: boolean },
): Promise<void> {
  await query(
    `INSERT INTO world_objects(id, floor, is_open, broken, destroyed, hp, is_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET floor=$2, is_open=$3, broken=$4, destroyed=$5, hp=$6, is_on=$7,
       revision=world_objects.revision+1, updated_at=now()`,
    [id, floor, state.open, state.broken, state.destroyed, state.hp, state.on],
  );
}
