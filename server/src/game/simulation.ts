import {
  AOI_RADIUS,
  CRAFT_RECIPES,
  INVENTORY_SLOTS,
  INVENTORY_WEIGHT,
  ITEMS,
  PICKUP_RANGE,
  PLAYER_MAX_HP,
  PLAYER_MAX_STAMINA,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_SPRINT,
  PLAYER_HUNGER_DRAIN,
  PLAYER_THIRST_DRAIN,
  RESPAWN_TIME_MS,
  SAFE_ZONE_RADIUS,
  SPRINT_STAMINA_DRAIN,
  STAMINA_REGEN,
  ZOMBIE_AGGRO_RANGE,
  ZOMBIE_LOSE_RANGE,
  ZOMBIE_TYPES,
  WORLD_GEOMETRY_VERSION,
  INTERIOR_VERSION,
  canCarry,
  chunkOf,
  inAttackArc,
  moveCircle,
  hasFloorSight,
  OBJECT_TEMPLATES,
  totalWeight,
  type StackLike,
  type ChunkData,
  type ContainerView,
  type EventView,
  type InventoryView,
  type ItemView,
  type ServerMessage,
  type ZombieSnapshot,
} from '@ashfall/shared';
import type { ClientMessage } from '@ashfall/shared/protocol';
import { config } from '../config.js';
import * as repo from '../persistence/repo.js';
import type { World } from './world.js';

export interface Conn {
  send(msg: ServerMessage): void;
  close(code?: number, reason?: string): void;
}

interface SimPlayer {
  id: number;
  userId: number;
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
  deadUntil: number | null;
  input: { mx: number; my: number; sprint: boolean; seq: number };
  lastAck: number;
  inventory: repo.ItemRow[];
  equippedId: string | null;
  openContainerId: string | null;
  conn: Conn | null;
  offlineAt: number | null;
  lastAttackAt: number;
  lastDamageAt: number;
  lastSeq: Map<string, number>;
  sentChunks: Set<string>;
  chunkX: number;
  chunkY: number;
  lastSubCheck: number;
  lastChatAt: number;
  lastStairAt: number;
  godmode?: boolean;
  craftingLock?: boolean;
}

interface SimZombie {
  id: string;
  type: number;
  x: number;
  y: number;
  floor: number;
  aim: number;
  hp: number;
  maxHp: number;
  state: 'idle' | 'wander' | 'chase' | 'attack';
  chunkX: number;
  chunkY: number;
  targetId: number | null;
  lastSeen: number;
  attackAt: number;
  wanderAt: number;
  wanderAngle: number;
  heardX: number | null;
  heardY: number | null;
  heardUntil: number;
  moving: boolean;
  actionAt: number;
  lastLosAt: number;
  hasLos: boolean;
}

interface GroundItem {
  id: string;
  key: string;
  qty: number;
  x: number;
  y: number;
  floor: number;
  durability: number;
}

const FISTS = { damage: 8, range: 1.15, cooldown: 520 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function hasSight(
  world: import('./world.js').World,
  from: { x: number; y: number; floor: number },
  to: { x: number; y: number; floor: number },
  mode: 'sight' | 'shot',
): boolean {
  if (from.floor !== to.floor) return false;
  const floor = world.getFloor(from.floor);
  if (!floor) return false;
  return hasFloorSight(
    floor,
    world.getOpeningStates(),
    from,
    to,
    mode,
    world.objects,
    OBJECT_TEMPLATES,
    world.getObjectStateRecord(),
  );
}

function itemView(row: repo.ItemRow): ItemView {
  return { id: row.id, key: row.key, qty: row.qty, equipped: row.equipped, durability: row.durability };
}

export class Simulation {
  readonly world: World;
  readonly players = new Map<number, SimPlayer>();
  readonly zombies = new Map<string, SimZombie>();
  readonly ground = new Map<string, GroundItem>();
  private events: EventView[] = [];
  private timer: NodeJS.Timeout | null = null;
  private snapTimer: NodeJS.Timeout | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private started = false;

  constructor(world: World) {
    this.world = world;
  }

  async init(): Promise<void> {
    const knownSeed = await repo.getMeta<string>('world_seed');
    if (knownSeed && knownSeed !== this.world.seed) {
      throw new Error(
        `WORLD_SEED mismatch: database contains "${knownSeed}", config has "${this.world.seed}". ` +
          'Use the same seed or wipe the database for a new world.',
      );
    }
    if (!knownSeed) await repo.setMeta('world_seed', this.world.seed);

    const knownGeometry = await repo.getMeta<number>('world_geometry_version');
    if (knownSeed && !knownGeometry) {
      throw new Error(
        'legacy world has no world_geometry_version. Recreate the world explicitly; automatic reset is disabled.',
      );
    }
    if (knownGeometry && knownGeometry !== WORLD_GEOMETRY_VERSION) {
      throw new Error(
        `world_geometry_version mismatch: database has ${knownGeometry}, code expects ${WORLD_GEOMETRY_VERSION}. ` +
          'Recreate the world explicitly; automatic reset is disabled.',
      );
    }
    if (!knownGeometry) await repo.setMeta('world_geometry_version', WORLD_GEOMETRY_VERSION);
    const knownInterior = await repo.getMeta<number>('interior_version');
    if (knownInterior && knownInterior !== INTERIOR_VERSION) {
      throw new Error(
        `interior_version mismatch: database has ${knownInterior}, code expects ${INTERIOR_VERSION}. ` +
          'Recreate the world explicitly; automatic reset is disabled.',
      );
    }
    if (!knownInterior) await repo.setMeta('interior_version', INTERIOR_VERSION);

    const [doorStates, propStates, windowStates, objectStates] = await Promise.all([
      repo.loadDoorStates(),
      repo.loadPropStates(),
      repo.loadWindowStates(),
      repo.loadObjectStates(),
    ]);
    this.world.applyPersistedState(doorStates, propStates, windowStates, objectStates);

    for (const g of await repo.loadGroundItems()) {
      this.ground.set(g.id, { ...g });
    }

    const rows = await repo.loadZombies();
    const seenChunks = new Set<string>();
    for (const row of rows) {
      seenChunks.add(`${row.chunk_x},${row.chunk_y}`);
      if (!row.alive) continue;
      const def = ZOMBIE_TYPES[clamp(row.type, 0, 2)];
      this.zombies.set(row.id, {
        id: row.id,
        type: row.type,
        x: row.x,
        y: row.y,
        floor: (row as unknown as { floor?: number }).floor ?? 0,
        aim: row.aim,
        hp: row.hp,
        maxHp: def.hp,
        state: (row.state as SimZombie['state']) || 'idle',
        chunkX: row.chunk_x,
        chunkY: row.chunk_y,
        targetId: null,
        lastSeen: 0,
        attackAt: 0,
        wanderAt: 0,
        wanderAngle: Math.random() * Math.PI * 2,
        heardX: null,
        heardY: null,
        heardUntil: 0,
        moving: false,
        actionAt: 0,
        lastLosAt: 0,
        hasLos: false,
      });
    }

    for (const [cx, cy] of this.world.chunkCoords()) {
      if (seenChunks.has(`${cx},${cy}`)) continue;
      for (const spawn of this.world.initialZombies(cx, cy)) {
        const def = ZOMBIE_TYPES[spawn.type];
        const z: SimZombie = {
          id: spawn.id,
          type: spawn.type,
          x: spawn.x,
          y: spawn.y,
          floor: spawn.floor ?? 0,
          aim: Math.random() * Math.PI * 2,
          hp: spawn.hp,
          maxHp: def.hp,
          state: 'idle',
          chunkX: cx,
          chunkY: cy,
          targetId: null,
          lastSeen: 0,
          attackAt: 0,
          wanderAt: 0,
          wanderAngle: Math.random() * Math.PI * 2,
          heardX: null,
          heardY: null,
          heardUntil: 0,
          moving: false,
          actionAt: 0,
          lastLosAt: 0,
          hasLos: false,
        };
        this.zombies.set(z.id, z);
        await repo.upsertZombie({
          id: z.id,
          chunkX: cx,
          chunkY: cy,
          type: z.type,
          x: z.x,
          y: z.y,
          floor: z.floor,
          aim: z.aim,
          hp: z.hp,
          state: z.state,
          alive: true,
        });
      }
    }

    await repo.cleanupSessions();
    console.log(
      `[sim] world "${this.world.seed}" ready: ${this.world.buildings.length} buildings, ` +
        `${this.world.props.length} props, ${this.world.containers.size} containers, ${this.zombies.size} zombies`,
    );
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const tickMs = 1000 / config.tickHz;
    this.timer = setInterval(() => this.tick(1 / config.tickHz), tickMs);
    this.snapTimer = setInterval(() => this.broadcastSnapshots(), 1000 / config.snapshotHz);
    this.saveTimer = setInterval(() => void this.saveAll(), config.saveIntervalMs);
  }

  async shutdown(): Promise<void> {
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    if (this.snapTimer) clearInterval(this.snapTimer);
    if (this.saveTimer) clearInterval(this.saveTimer);
    await this.saveAll(true);
  }

  private send(p: SimPlayer, msg: ServerMessage): void {
    try {
      p.conn?.send(msg);
    } catch {
      /* socket may be closing */
    }
  }

  private emit(event: EventView): void {
    this.events.push(event);
    if (this.events.length > 250) this.events.shift();
  }

  private notice(p: SimPlayer, text: string): void {
    this.send(p, { t: 'notice', text });
  }

  async join(userId: number, name: string, conn: Conn): Promise<number | null> {
    let character = await repo.loadCharacter(userId);
    if (!character) {
      character = await repo.getOrCreateCharacter(userId, name, this.world.spawn);
    }
    const existing = this.players.get(character.id);
    if (existing) {
      if (existing.conn && existing.conn !== conn) {
        try {
          existing.conn.close(4009, 'logged in elsewhere');
        } catch {}
      }
      existing.conn = conn;
      existing.offlineAt = null;
      existing.input = { mx: 0, my: 0, sprint: false, seq: 0 };
      if (existing.status === 'dead' && existing.deadUntil && existing.deadUntil <= Date.now()) {
        await this.applyRespawn(existing);
      } else if (existing.status === 'alive' && existing.inventory.length === 0 && config.testCombatBuffs) {
        await this.grantTestKit(existing);
      }
      this.sendWelcome(existing);
      await this.sendInventory(existing);
      existing.sentChunks.clear();
      this.updateSubscriptions(existing, true);
      this.emit({ t: 'notice', text: `${existing.name} вернулся в район.` });
      return existing.id;
    }

    const now = Date.now();
    let status: 'alive' | 'dead' = character.status === 'dead' ? 'dead' : 'alive';
    let deadUntil = character.dead_until ? new Date(character.dead_until).getTime() : null;
    if (status === 'dead' && (!deadUntil || deadUntil <= now)) {
      status = 'alive';
      deadUntil = null;
    }

    let x = character.x;
    let y = character.y;
    if (status === 'alive' && !this.world.isWalkable(x, y, character.floor ?? 0)) {
      x = this.world.spawn.x;
      y = this.world.spawn.y;
    }
    if (status === 'dead') {
      x = character.x;
      y = character.y;
    }

    let inventory = status === 'alive' ? await repo.loadCharacterItems(character.id) : [];
    if (status === 'alive' && inventory.length === 0 && config.testCombatBuffs) {
      await repo.withTransaction(async (client) => {
        await repo.addCharacterItem(client, character.id, 'spiked_bat', 1, 1);
        await repo.addCharacterItem(client, character.id, 'bandage', 4, 1);
        await repo.addCharacterItem(client, character.id, 'water_bottle', 2, 1);
        await repo.addCharacterItem(client, character.id, 'canned_food', 3, 1);
        await repo.addCharacterItem(client, character.id, 'pistol', 1, 1);
        await repo.addCharacterItem(client, character.id, 'ammo_9mm', 36, 1);
        await client.query("UPDATE character_items SET equipped = true WHERE character_id = $1 AND item_key = 'spiked_bat'", [character.id]);
      });
      inventory = await repo.loadCharacterItems(character.id);
    }
    const p: SimPlayer = {
      id: character.id,
      userId,
      name: character.name,
      x,
      y,
      floor: character.floor ?? 0,
      aim: character.aim,
      hp: status === 'alive' ? (config.testCombatBuffs ? Math.max(character.hp, 150) : Math.max(1, character.hp)) : 0,
      stamina: character.stamina,
      hunger: character.hunger,
      thirst: character.thirst,
      status,
      deadUntil,
      input: { mx: 0, my: 0, sprint: false, seq: 0 },
      lastAck: 0,
      inventory,
      equippedId: inventory.find((i) => i.equipped)?.id ?? null,
      openContainerId: null,
      conn,
      offlineAt: null,
      lastAttackAt: 0,
      lastDamageAt: 0,
      lastSeq: new Map(),
      sentChunks: new Set(),
      chunkX: -1,
      chunkY: -1,
      lastSubCheck: 0,
      lastChatAt: 0,
      lastStairAt: 0,
    };
    this.players.set(p.id, p);
    this.sendWelcome(p);
    await this.sendInventory(p);
    this.updateSubscriptions(p, true);
    this.emit({ t: 'notice', text: `${p.name} вошёл в район.` });
    console.log(`[sim] ${p.name} joined at ${p.x.toFixed(1)},${p.y.toFixed(1)} (${this.players.size} online)`);
    return p.id;
  }

  disconnect(playerId: number): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.conn = null;
    p.offlineAt = Date.now();
    p.input = { mx: 0, my: 0, sprint: false, seq: 0 };
    p.openContainerId = null;
  }

  kickUser(userId: number, reason = 'Аккаунт заблокирован'): boolean {
    let found = false;
    for (const p of this.players.values()) {
      if (p.userId === userId) {
        if (p.conn) {
          p.conn.send({ t: 'error', code: 'BANNED', message: reason });
          p.conn.close(4003, 'banned');
          p.conn = null;
        }
        p.offlineAt = Date.now();
        p.input = { mx: 0, my: 0, sprint: false, seq: 0 };
        p.openContainerId = null;
        found = true;
      }
    }
    return found;
  }

  private sendWelcome(p: SimPlayer): void {
    this.send(p, {
      t: 'welcome',
      v: 1,
      id: p.id,
      name: p.name,
      spawn: this.world.spawn,
      seed: this.world.seed,
      time: Date.now(),
      characterId: p.id,
      x: p.x,
      y: p.y,
      floor: p.floor,
      aim: p.aim,
      hp: p.hp,
      stamina: p.stamina,
      hunger: p.hunger,
      thirst: p.thirst,
      status: p.status,
    });
  }

  private inventoryView(p: SimPlayer): InventoryView {
    return {
      items: p.inventory.map(itemView),
      weight: totalWeight(p.inventory),
      maxWeight: INVENTORY_WEIGHT,
      slots: INVENTORY_SLOTS,
      equipped: p.equippedId ? (p.inventory.find((i) => i.id === p.equippedId)?.key ?? null) : null,
    };
  }

  private async sendInventory(p: SimPlayer): Promise<void> {
    let container: ContainerView | null = null;
    if (p.openContainerId) container = await this.containerView(p.openContainerId);
    this.send(p, { t: 'inventory', inv: this.inventoryView(p), container });
  }

  private async containerView(id: string): Promise<ContainerView | null> {
    const c = this.world.containers.get(id);
    if (!c) return null;
    try {
      const rows = await repo.loadContainerItems(id);
      return { id, label: c.label, type: c.type, items: rows.map(itemView), maxSlots: c.maxSlots };
    } catch {
      return null;
    }
  }

  private async refreshInventory(p: SimPlayer, sendToClient = true): Promise<void> {
    p.inventory = await repo.loadCharacterItems(p.id);
    p.equippedId = p.inventory.find((i) => i.equipped)?.id ?? null;
    if (!sendToClient) return;
    const container = p.openContainerId ? await this.containerView(p.openContainerId) : null;
    this.send(p, { t: 'inventory', inv: this.inventoryView(p), container });
  }

  private chunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private updateSubscriptions(p: SimPlayer, force = false): void {
    if (!p.conn) return;
    const [cx, cy] = chunkOf(p.x, p.y);
    if (!force && cx === p.chunkX && cy === p.chunkY && Date.now() - p.lastSubCheck < 900) return;
    p.chunkX = cx;
    p.chunkY = cy;
    p.lastSubCheck = Date.now();
    const r = config.chunkRadius;
    const wanted = new Set<string>();
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= 4 || ny >= 4) continue;
        const key = this.chunkKey(nx, ny);
        wanted.add(key);
        if (!p.sentChunks.has(key)) {
          const chunk: ChunkData = this.world.chunkData(nx, ny);
          this.send(p, { t: 'chunk', chunk });
          p.sentChunks.add(key);
          void repo.touchChunk(nx, ny, this.world.seed, WORLD_GEOMETRY_VERSION);
        }
      }
    }
    for (const key of [...p.sentChunks]) {
      if (wanted.has(key)) continue;
      const [ux, uy] = key.split(',').map(Number);
      if (Math.abs(ux - cx) > r + 1 || Math.abs(uy - cy) > r + 1) {
        this.send(p, { t: 'chunk_unload', cx: ux, cy: uy });
        p.sentChunks.delete(key);
      }
    }
  }

  handleMessage(playerId: number, msg: ClientMessage): void {
    const p = this.players.get(playerId);
    if (!p || !p.conn) return;
    switch (msg.t) {
      case 'input':
        this.handleInput(p, msg);
        break;
      case 'attack':
        void this.handleAttack(p, msg.seq, msg.aim);
        break;
      case 'interact':
        if (this.dedupe(p, 'interact', msg.seq)) void this.handleInteract(p);
        break;
      case 'use_stairs':
        if (this.dedupe(p, 'stairs', msg.seq)) void this.handleUseStairs(p, msg.id);
        break;
      case 'open_container':
        if (this.dedupe(p, 'open', msg.seq)) void this.handleOpenContainer(p, msg.id);
        break;
      case 'close_container':
        if (this.dedupe(p, 'close', msg.seq)) {
          p.openContainerId = null;
          void this.sendInventory(p);
        }
        break;
      case 'pickup':
        if (this.dedupe(p, 'pickup', msg.seq)) void this.handlePickup(p, msg.id);
        break;
      case 'drop':
        if (this.dedupe(p, 'drop', msg.seq)) void this.handleDrop(p, msg.id, msg.qty);
        break;
      case 'transfer':
        if (this.dedupe(p, 'transfer', msg.seq)) void this.handleTransfer(p, msg.id, msg.qty, msg.dir);
        break;
      case 'use':
        if (this.dedupe(p, 'use', msg.seq)) void this.handleUse(p, msg.id);
        break;
      case 'equip':
        if (this.dedupe(p, 'equip', msg.seq)) void this.handleEquip(p, msg.id);
        break;
      case 'craft':
        if (this.dedupe(p, 'craft', msg.seq)) void this.handleCraft(p, msg.recipeId);
        break;
      case 'dev_action':
        if (this.dedupe(p, 'dev_action', msg.seq)) void this.handleDevAction(p, msg.action, msg.args);
        break;
      case 'respawn':
        if (this.dedupe(p, 'respawn', msg.seq)) void this.handleRespawn(p);
        break;
      case 'chat':
        void this.handleChat(p, msg.text);
        break;
      case 'ping':
        this.send(p, { t: 'pong', ts: msg.ts });
        break;
      default:
        break;
    }
  }

  private dedupe(p: SimPlayer, action: string, seq: number): boolean {
    const last = p.lastSeq.get(action) ?? -1;
    if (seq <= last) return false;
    p.lastSeq.set(action, seq);
    return true;
  }

  private handleInput(p: SimPlayer, msg: { mx: number; my: number; aim: number; sprint: boolean; seq: number }): void {
    if (msg.seq > p.lastAck) p.lastAck = msg.seq;
    if (p.status !== 'alive') {
      p.input = { mx: 0, my: 0, sprint: false, seq: msg.seq };
      return;
    }
    let mx = msg.mx;
    let my = msg.my;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    p.input = { mx, my, sprint: msg.sprint, seq: msg.seq };
    p.aim = msg.aim;
  }

  private tick(dt: number): void {
    const now = Date.now();
    this.tickCount++;

    for (const [id, p] of [...this.players.entries()]) {
      if (p.offlineAt && now - p.offlineAt > config.disconnectGraceMs) {
        void this.savePlayer(p);
        this.players.delete(id);
        this.emit({ t: 'notice', text: `${p.name} покинул район.` });
        continue;
      }
      if (p.status === 'dead') {
        if (p.deadUntil && now >= p.deadUntil && p.conn) void this.applyRespawn(p);
        continue;
      }
      this.tickPlayer(p, dt, now);
    }

    this.tickZombies(dt, now);
  }

  private tickPlayer(p: SimPlayer, dt: number, now: number): void {
    const online = !!p.conn;
    if (online) {
      const { mx, my, sprint } = p.input;
      const moving = Math.hypot(mx, my) > 0.01;
      const canSprint = sprint && moving && p.stamina > 2;
      const speed = canSprint ? PLAYER_SPRINT : PLAYER_SPEED;
      if (moving) {
        const res = moveCircle(
          this.world.getCollisionGrid(p.floor),
          p.x,
          p.y,
          mx * speed * dt,
          my * speed * dt,
          PLAYER_RADIUS,
        );
        p.x = clamp(res.x, 0.4, 127.6);
        p.y = clamp(res.y, 0.4, 127.6);
      }
      if (canSprint) p.stamina = Math.max(0, p.stamina - SPRINT_STAMINA_DRAIN * dt);
      else p.stamina = Math.min(PLAYER_MAX_STAMINA, p.stamina + STAMINA_REGEN * dt);
      this.updateSubscriptions(p);
    }

    p.hunger = Math.max(0, p.hunger - PLAYER_HUNGER_DRAIN * dt);
    p.thirst = Math.max(0, p.thirst - PLAYER_THIRST_DRAIN * dt);
    if (p.hunger <= 0) {
      p.hp -= 0.45 * dt;
      p.lastDamageAt = now;
    }
    if (p.thirst <= 0) {
      p.hp -= 0.65 * dt;
      p.lastDamageAt = now;
    }
    if (p.hunger > 35 && p.thirst > 35 && now - p.lastDamageAt > 6000 && p.hp < this.playerMaxHp) {
      p.hp = Math.min(this.playerMaxHp, p.hp + 0.9 * dt);
    }
    if (p.hp <= 0 && p.status === 'alive') {
      void this.killPlayer(p, null, 'environment');
    }
  }

  private tickZombies(dt: number, now: number): void {
    const online = [...this.players.values()].filter((p) => p.conn && p.status === 'alive');
    if (online.length === 0) return;
    const targetable = online.filter(
      (p) => Math.hypot(p.x - this.world.spawn.x, p.y - this.world.spawn.y) > SAFE_ZONE_RADIUS,
    );
    for (const z of this.zombies.values()) {
      let nearest: SimPlayer | null = null;
      let nearestDist = Infinity;
      for (const p of targetable) {
        if (p.floor !== z.floor) continue;
        const d = distance(z.x, z.y, p.x, p.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = p;
        }
      }
      const active = nearestDist <= 48;
      if (!active) {
        z.moving = false;
        continue;
      }
      const def = ZOMBIE_TYPES[clamp(z.type, 0, 2)];
      const spawnDist = Math.hypot(z.x - this.world.spawn.x, z.y - this.world.spawn.y);
      if (spawnDist < SAFE_ZONE_RADIUS + 1) {
        const away = Math.atan2(z.y - this.world.spawn.y, z.x - this.world.spawn.x) + (Math.random() - 0.5) * 0.4;
        const res = moveCircle(
          this.world.getCollisionGrid(z.floor),
          z.x,
          z.y,
          Math.cos(away) * def.speed * dt,
          Math.sin(away) * def.speed * dt,
          0.3,
        );
        z.x = res.x;
        z.y = res.y;
        z.state = 'wander';
        z.moving = true;
        z.aim = away;
        continue;
      }
      let target: SimPlayer | null = null;
      if (nearest && nearestDist <= ZOMBIE_AGGRO_RANGE) {
        if (now - z.lastLosAt > 350) {
          z.hasLos = hasSight(this.world, z, nearest, 'sight');
          z.lastLosAt = now;
        }
        if (z.hasLos) target = nearest;
      }
      if (target) {
        z.targetId = target.id;
        z.lastSeen = now;
        z.state = nearestDist < 1.05 ? 'attack' : 'chase';
      } else if (z.targetId && now - z.lastSeen < 7000) {
        target = this.players.get(z.targetId) ?? null;
        if (target && (target.status !== 'alive' || distance(z.x, z.y, target.x, target.y) > ZOMBIE_LOSE_RANGE)) {
          target = null;
          z.targetId = null;
        }
        z.state = target ? 'chase' : 'wander';
      } else {
        z.state = z.heardUntil > now ? 'chase' : 'wander';
        if (z.heardUntil <= now) {
          z.heardX = null;
          z.heardY = null;
        }
      }

      let moveX = 0;
      let moveY = 0;
      let speed: number = def.speed;
      if (z.state === 'chase' || z.state === 'attack') {
        let tx = target?.x;
        let ty = target?.y;
        if (tx === undefined || ty === undefined) {
          tx = z.heardX ?? undefined;
          ty = z.heardY ?? undefined;
        }
        if (tx !== undefined && ty !== undefined) {
          const d = distance(z.x, z.y, tx, ty);
          z.aim = Math.atan2(ty - z.y, tx - z.x);
          if (d > 0.9) {
            moveX = (tx - z.x) / d;
            moveY = (ty - z.y) / d;
            speed = def.chase;
            z.state = 'chase';
          }
        }
      } else {
        if (now > z.wanderAt) {
          z.wanderAt = now + 1800 + Math.random() * 3200;
          z.wanderAngle = Math.random() * Math.PI * 2;
          if (Math.random() < 0.35) z.state = 'idle';
        }
        if (z.state === 'wander') {
          moveX = Math.cos(z.wanderAngle) * 0.55;
          moveY = Math.sin(z.wanderAngle) * 0.55;
          z.aim = z.wanderAngle;
        }
      }

      z.moving = moveX !== 0 || moveY !== 0;
      if (z.moving) {
        const res = moveCircle(
          this.world.getCollisionGrid(z.floor),
          z.x,
          z.y,
          moveX * speed * dt,
          moveY * speed * dt,
          0.3,
        );
        const moved = Math.hypot(res.x - z.x, res.y - z.y);
        if (moved < 0.001) {
          z.wanderAngle += Math.PI / 2 + Math.random();
          z.wanderAt = 0;
        }
        z.x = res.x;
        z.y = res.y;
      }

      if (
        z.state === 'attack' &&
        target &&
        nearestDist < 1.2 &&
        hasSight(this.world, z, target, 'sight') &&
        Math.hypot(target.x - this.world.spawn.x, target.y - this.world.spawn.y) > SAFE_ZONE_RADIUS &&
        now - z.attackAt > def.cooldown * 1000
      ) {
        z.attackAt = now;
        z.actionAt = now;
        const dmg = Math.round(def.damage * (0.8 + Math.random() * 0.45));
        this.damagePlayer(target, dmg, z.type === 2 ? 'brute' : 'zombie');
        this.emit({ t: 'zombie_attack', id: z.id, x: z.x, y: z.y, targetId: target.id });
        if (Math.random() < 0.15) {
          this.emit({ t: 'growl', id: z.id, x: z.x, y: z.y });
        }
        if (target.hp <= 0 && target.status === 'alive') {
          void this.killPlayer(target, null, 'zombie');
        }
      }
    }
  }

  private damagePlayer(p: SimPlayer, amount: number, source: string): void {
    if (p.status !== 'alive' || p.godmode) return;
    p.hp -= amount;
    p.lastDamageAt = Date.now();
    this.emit({ t: 'hit', targetId: p.id, x: p.x, y: p.y, damage: Math.round(amount), source });
    if (p.hp <= 0) {
      p.hp = 0;
      void this.killPlayer(p, null, source);
    }
  }

  private noise(x: number, y: number, radius: number, now: number): void {
    for (const z of this.zombies.values()) {
      if (distance(x, y, z.x, z.y) <= radius) {
        z.heardX = x + (Math.random() - 0.5) * 3;
        z.heardY = y + (Math.random() - 0.5) * 3;
        z.heardUntil = now + 9000;
        if (z.state !== 'attack') z.state = 'chase';
      }
    }
  }

  private getWeapon(p: SimPlayer): { key: string | null; damage: number; range: number; cooldown: number; ammo?: string; noise?: number } {
    const row = p.inventory.find((i) => i.equipped && ITEMS[i.key]?.kind === 'weapon');
    if (!row) return { key: null, ...FISTS };
    const def = ITEMS[row.key];
    return {
      key: row.key,
      damage: def.damage ?? FISTS.damage,
      range: def.range ?? FISTS.range,
      cooldown: (def.cooldown ?? 0.5) * 1000,
      ammo: def.ammo,
      noise: def.noise,
    };
  }

  private async handleAttack(p: SimPlayer, seq: number, aim?: number): Promise<void> {
    if (!this.dedupe(p, 'attack', seq)) return;
    if (p.status !== 'alive' || !p.conn) return;
    const now = Date.now();
    const weapon = this.getWeapon(p);
    if (now - p.lastAttackAt < weapon.cooldown) return;
    if (typeof aim === 'number' && Number.isFinite(aim)) p.aim = aim;
    p.lastAttackAt = now;

    if (weapon.ammo) {
      const ammo = p.inventory.find((i) => i.key === weapon.ammo && i.qty > 0);
      if (!ammo) {
        this.notice(p, 'Нет патронов.');
        p.lastAttackAt = now - weapon.cooldown + 300;
        return;
      }
      try {
        await repo.withTransaction(async (client) => {
          const taken = await repo.takeCharacterItem(client, p.id, ammo.id, 1);
          if (!taken) throw new Error('ammo gone');
        });
        await this.refreshInventory(p, true);
      } catch {
        this.notice(p, 'Не удалось зарядить оружие.');
        return;
      }
      this.emit({ t: 'shot', playerId: p.id, x: p.x, y: p.y, aim: p.aim, weapon: weapon.key });
      this.noise(p.x, p.y, weapon.noise ?? 14, now);
    } else {
      this.emit({ t: 'swing', playerId: p.id, x: p.x, y: p.y, aim: p.aim, weapon: weapon.key });
    }

    let bestPlayer: SimPlayer | null = null;
    let bestDist = Infinity;
    for (const other of this.players.values()) {
      if (other.id === p.id || other.status !== 'alive' || other.floor !== p.floor) continue;
      if (!inAttackArc(p.x, p.y, p.aim, other.x, other.y, weapon.range)) continue;
      if (!hasSight(this.world, p, other, 'shot')) continue;
      const d = distance(p.x, p.y, other.x, other.y);
      if (d < bestDist) {
        bestDist = d;
        bestPlayer = other;
      }
    }
    let bestZombie: SimZombie | null = null;
    let bestZDist = Infinity;
    for (const z of this.zombies.values()) {
      if (z.floor !== p.floor) continue;
      if (!inAttackArc(p.x, p.y, p.aim, z.x, z.y, weapon.range)) continue;
      if (!hasSight(this.world, p, z, 'shot')) continue;
      const d = distance(p.x, p.y, z.x, z.y);
      if (d < bestZDist) {
        bestZDist = d;
        bestZombie = z;
      }
    }

    const damage = weapon.damage * (0.85 + Math.random() * 0.3);
    if (bestPlayer && bestDist <= bestZDist) {
      const dmg = Math.round(damage);
      bestPlayer.hp -= dmg;
      bestPlayer.lastDamageAt = now;
      this.emit({
        t: 'hit',
        targetId: bestPlayer.id,
        x: bestPlayer.x,
        y: bestPlayer.y,
        damage: dmg,
        source: weapon.key ?? 'fists',
        by: p.id,
      });
      this.emit({ t: 'blood', x: bestPlayer.x, y: bestPlayer.y });
      if (bestPlayer.hp <= 0) {
        bestPlayer.hp = 0;
        void repo.incrementKills(p.id);
        await this.killPlayer(bestPlayer, p, weapon.key ?? 'fists');
      }
      return;
    }
    if (bestZombie) {
      const dmg = Math.round(damage);
      bestZombie.hp -= dmg;
      this.emit({
        t: 'hit',
        targetId: bestZombie.id,
        x: bestZombie.x,
        y: bestZombie.y,
        damage: dmg,
        source: weapon.key ?? 'fists',
        by: p.id,
      });
      this.emit({ t: 'blood', x: bestZombie.x, y: bestZombie.y });
      if (bestZombie.hp <= 0) await this.killZombie(bestZombie, p);
      return;
    }

    const props = this.world.propsInArc(p.x, p.y, p.aim, weapon.range, Math.PI * 0.6);
    const prop = props[0];
    if (prop) {
      prop.hp -= damage;
      this.emit({ t: 'prop_hit', id: prop.id, x: prop.x + 0.5, y: prop.y + 0.5, hp: Math.max(0, prop.hp) });
      if (prop.hp <= 0) {
        this.world.destroyProp(prop);
        void repo.savePropState(prop.id, prop.type, prop.x, prop.y, 0, true);
        this.emit({ t: 'prop_destroyed', id: prop.id, type: prop.type, x: prop.x + 0.5, y: prop.y + 0.5 });
        if (prop.type === 'crate' || prop.type === 'barrel') {
          await this.dropLoot(prop.x + 0.5, prop.y + 0.5, prop.type === 'crate' ? 'scrap' : 'cloth', 1, 0);
        }
      } else {
        void repo.savePropState(prop.id, prop.type, prop.x, prop.y, prop.hp, false);
      }
    }
  }

  private async killZombie(z: SimZombie, by: SimPlayer): Promise<void> {
    if (!this.zombies.has(z.id)) return;
    this.zombies.delete(z.id);
    this.emit({ t: 'death', id: z.id, kind: 'zombie', type: z.type, x: z.x, y: z.y, by: by.id, byName: by.name });
    void repo.markZombieDead(z.id);
    by.stamina = Math.min(PLAYER_MAX_STAMINA, by.stamina + 4);
    if (Math.random() < 0.38) {
      const roll = Math.random();
      const key = roll < 0.32 ? 'bandage' : roll < 0.55 ? 'scrap' : roll < 0.72 ? 'cloth' : roll < 0.86 ? 'ammo_9mm' : 'canned_food';
      const qty = key === 'ammo_9mm' ? 2 + Math.floor(Math.random() * 5) : 1;
      await this.dropLoot(z.x, z.y, key, qty, z.floor);
    }
  }

  private async killPlayer(p: SimPlayer, killer: SimPlayer | null, source: string): Promise<void> {
    if (p.status === 'dead') return;
    p.status = 'dead';
    p.hp = 0;
    p.deadUntil = Date.now() + RESPAWN_TIME_MS;
    p.inventory = [];
    p.equippedId = null;
    p.openContainerId = null;
    p.input = { mx: 0, my: 0, sprint: false, seq: 0 };
    this.emit({
      t: 'death',
      id: p.id,
      kind: 'player',
      name: p.name,
      x: p.x,
      y: p.y,
      by: killer?.id ?? null,
      byName: killer?.name ?? 'заражение',
      source,
    });
    try {
      const dropped = await repo.dropAllCharacterItems(p.id, p.x, p.y, p.floor);
      for (const d of dropped) {
        this.ground.set(d.id, {
          id: d.id,
          key: d.key,
          qty: d.qty,
          x: d.x,
          y: d.y,
          floor: p.floor,
          durability: d.durability,
        });
      }
      await repo.saveCharacter({
        id: p.id,
        x: p.x,
        y: p.y,
        floor: p.floor,
        aim: p.aim,
        hp: 0,
        stamina: p.stamina,
        hunger: p.hunger,
        thirst: p.thirst,
        status: 'dead',
        deadUntil: p.deadUntil,
      });
    } catch (err) {
      console.error('[sim] death persistence failed', err);
    }
    await this.sendInventory(p);
  }

  private get playerMaxHp(): number {
    return config.testCombatBuffs ? 150 : PLAYER_MAX_HP;
  }

  private async applyRespawn(p: SimPlayer): Promise<void> {
    p.status = 'alive';
    p.hp = this.playerMaxHp;
    p.stamina = PLAYER_MAX_STAMINA;
    p.hunger = Math.max(60, p.hunger);
    p.thirst = Math.max(55, p.thirst);
    p.deadUntil = null;
    p.floor = 0;
    p.x = this.world.spawn.x + (Math.random() - 0.5) * 1.5;
    p.y = this.world.spawn.y + (Math.random() - 0.5) * 1.5;
    p.aim = 0;
    p.inventory = [];
    p.equippedId = null;
    p.openContainerId = null;
    p.lastDamageAt = Date.now();
    if (config.testCombatBuffs) {
      await this.grantTestKit(p);
    }
    this.emit({ t: 'respawn', id: p.id, x: p.x, y: p.y });
    try {
      await repo.saveCharacter({
        id: p.id,
        x: p.x,
        y: p.y,
        floor: p.floor,
        aim: p.aim,
        hp: p.hp,
        stamina: p.stamina,
        hunger: p.hunger,
        thirst: p.thirst,
        status: 'alive',
        deadUntil: null,
      });
    } catch (err) {
      console.error('[sim] respawn save failed', err);
    }
    await this.sendInventory(p);
    this.notice(p, config.testCombatBuffs ? 'Вы возродились на безопасном перекрёстке с боевым снаряжением.' : 'Вы очнулись на пересечении Грей-стрит. Инвентарь потерян.');
  }

  private async grantTestKit(p: SimPlayer): Promise<void> {
    try {
      await repo.withTransaction(async (client) => {
        await repo.addCharacterItem(client, p.id, 'spiked_bat', 1, 1);
        await repo.addCharacterItem(client, p.id, 'bandage', 4, 1);
        await repo.addCharacterItem(client, p.id, 'water_bottle', 2, 1);
        await repo.addCharacterItem(client, p.id, 'canned_food', 3, 1);
        await repo.addCharacterItem(client, p.id, 'pistol', 1, 1);
        await repo.addCharacterItem(client, p.id, 'ammo_9mm', 36, 1);
        await client.query('UPDATE character_items SET equipped = false WHERE character_id = $1', [p.id]);
        await client.query("UPDATE character_items SET equipped = true WHERE character_id = $1 AND item_key = 'spiked_bat'", [p.id]);
      });
      await this.refreshInventory(p, true);
      this.emit({ t: 'equip', playerId: p.id, itemKey: 'spiked_bat' });
    } catch (err) {
      console.error('[sim] grantTestKit failed', err);
    }
  }

  public isPlayerAdmin(p: SimPlayer): boolean {
    if (config.allowDevActions) return true;
    if (config.adminUsers.length > 0 && config.adminUsers.includes(p.name.toLowerCase())) return true;
    return false;
  }

  private async handleCraft(p: SimPlayer, recipeId: string): Promise<void> {
    if (p.status !== 'alive') return;
    const recipe = CRAFT_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) {
      this.notice(p, 'Неизвестный рецепт крафта.');
      return;
    }
    if (p.craftingLock) {
      this.notice(p, 'Создание предмета уже выполняется.');
      return;
    }
    p.craftingLock = true;

    try {
      const ok = await repo.withTransaction(async (client) => {
        const res = await client.query<{ id: string; key: string; qty: number; durability: number; equipped: boolean }>(
          'SELECT id, item_key as key, qty, durability, equipped FROM character_items WHERE character_id = $1 FOR UPDATE',
          [p.id],
        );
        const dbItems = res.rows;

        for (const ing of recipe.ingredients) {
          const count = dbItems
            .filter((i) => i.key === ing.key)
            .reduce((sum, i) => sum + i.qty, 0);
          if (count < ing.qty) {
            throw new Error(`NOT_ENOUGH_INGREDIENTS:${ing.name}:${ing.qty}`);
          }
        }

        const simulated: StackLike[] = dbItems.map((i) => ({ key: i.key, qty: i.qty }));
        for (const ing of recipe.ingredients) {
          let needed = ing.qty;
          for (let idx = 0; idx < simulated.length; idx++) {
            if (needed <= 0) break;
            if (simulated[idx].key === ing.key) {
              const take = Math.min(simulated[idx].qty, needed);
              simulated[idx].qty -= take;
              needed -= take;
            }
          }
        }
        const afterDeduction = simulated.filter((s) => s.qty > 0);
        if (!canCarry(afterDeduction, recipe.resultKey, recipe.resultQty)) {
          throw new Error('INVENTORY_FULL_FOR_RESULT');
        }

        for (const ing of recipe.ingredients) {
          let needed = ing.qty;
          const matching = dbItems.filter((i) => i.key === ing.key);
          for (const item of matching) {
            if (needed <= 0) break;
            const take = Math.min(item.qty, needed);
            const taken = await repo.takeCharacterItem(client, p.id, item.id, take);
            if (!taken) throw new Error('FAILED_TO_TAKE_INGREDIENT');
            needed -= take;
          }
        }

        await repo.addCharacterItem(client, p.id, recipe.resultKey, recipe.resultQty, 1);
        return true;
      });

      if (ok) {
        await this.refreshInventory(p, true);
        this.notice(p, `Изготовлено: ${recipe.name} (x${recipe.resultQty}).`);
        this.emit({ t: 'use', playerId: p.id, itemKey: recipe.resultKey, x: p.x, y: p.y });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('NOT_ENOUGH_INGREDIENTS:')) {
        const [, name, qty] = msg.split(':');
        this.notice(p, `Недостаточно ингредиентов для "${recipe.name}": требуется ${name} x${qty}.`);
      } else if (msg === 'INVENTORY_FULL_FOR_RESULT') {
        this.notice(p, 'Недостаточно места или перегруз в инвентаре для получения результата.');
      } else {
        console.error('[sim] craft failed', err);
        this.notice(p, 'Ошибка при создании предмета.');
      }
      await this.refreshInventory(p, true);
    } finally {
      p.craftingLock = false;
    }
  }

  private async handleDevAction(p: SimPlayer, action: string, _args?: Record<string, unknown>): Promise<void> {
    if (!this.isPlayerAdmin(p)) {
      this.notice(p, 'Действие запрещено: требуются права администратора или режим разработки.');
      return;
    }
    switch (action) {
      case 'heal':
        p.hp = this.playerMaxHp;
        p.stamina = PLAYER_MAX_STAMINA;
        p.hunger = 100;
        p.thirst = 100;
        this.notice(p, `Здоровье и показатели восстановлены (${this.playerMaxHp} HP).`);
        break;
      case 'kit':
        p.hp = this.playerMaxHp;
        p.stamina = PLAYER_MAX_STAMINA;
        p.hunger = 100;
        p.thirst = 100;
        await this.grantTestKit(p);
        this.notice(p, 'Выдан боевой комплект: бита с шипами, пистолет, патроны 9мм, бинты.');
        break;
      case 'godmode':
        p.godmode = !p.godmode;
        this.notice(p, `Режим бога (неуязвимость): ${p.godmode ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}.`);
        break;
      case 'teleport_spawn':
        p.x = this.world.spawn.x;
        p.y = this.world.spawn.y;
        this.notice(p, 'Телепортирован в безопасную зону.');
        break;
      case 'teleport':
        if (_args && typeof _args.x === 'number' && typeof _args.y === 'number') {
          p.x = _args.x;
          p.y = _args.y;
          if (typeof _args.floor === 'number') p.floor = _args.floor;
          this.notice(p, `Телепортирован в (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), floor ${p.floor}.`);
        }
        break;
      default:
        this.notice(p, `Неизвестное действие разработчика: ${action}`);
        break;
    }
  }

  public resolveDoorClose(door: { id: string; x: number; y: number; floor?: number; facing?: 'south' | 'east' | 'north' | 'west' }): void {
    const minX = door.x - PLAYER_RADIUS;
    const maxX = door.x + 1 + PLAYER_RADIUS;
    const minY = door.y - PLAYER_RADIUS;
    const maxY = door.y + 1 + PLAYER_RADIUS;

    for (const p of this.players.values()) {
      if (p.status !== 'alive') continue;
      if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
        this.displaceFromDoor(p, door, door.floor ?? 0);
      }
    }

    for (const z of this.zombies.values()) {
      if (z.hp <= 0) continue;
      if (z.x >= minX && z.x <= maxX && z.y >= minY && z.y <= maxY) {
        this.displaceFromDoor(z, door, door.floor ?? z.floor);
      }
    }
  }

  private displaceFromDoor(entity: { x: number; y: number }, door: { x: number; y: number; floor?: number; facing?: 'south' | 'east' | 'north' | 'west' }, floor: number): void {
    const facing = door.facing ?? (door.x % 2 === 0 ? 'south' : 'east');
    let t1: { x: number; y: number };
    let t2: { x: number; y: number };

    if (facing === 'south') {
      const interior = { x: door.x + 0.5, y: door.y - 0.45 };
      const exterior = { x: door.x + 0.5, y: door.y + 1.45 };
      if (entity.y < door.y + 0.5) {
        t1 = interior;
        t2 = exterior;
      } else {
        t1 = exterior;
        t2 = interior;
      }
    } else {
      const interior = { x: door.x - 0.45, y: door.y + 0.5 };
      const exterior = { x: door.x + 1.45, y: door.y + 0.5 };
      if (entity.x < door.x + 0.5) {
        t1 = interior;
        t2 = exterior;
      } else {
        t1 = exterior;
        t2 = interior;
      }
    }

    if (this.world.isWalkable(t1.x, t1.y, floor)) {
      entity.x = t1.x;
      entity.y = t1.y;
    } else if (this.world.isWalkable(t2.x, t2.y, floor)) {
      entity.x = t2.x;
      entity.y = t2.y;
    } else {
      if (facing === 'south' || facing === 'north') {
        entity.y = entity.y < door.y + 0.5 ? door.y - 0.45 : door.y + 1.45;
      } else {
        entity.x = entity.x < door.x + 0.5 ? door.x - 0.45 : door.x + 1.45;
      }
    }
  }

  private async handleUseStairs(p: SimPlayer, stairId: string): Promise<void> {
    if (p.status !== 'alive') return;
    const now = Date.now();
    if (now - p.lastStairAt < 700) return;
    const stair = this.world.nearestStair(p.x, p.y, p.floor);
    if (!stair || stair.id !== stairId) {
      this.notice(p, 'Лестница недоступна.');
      return;
    }
    if (!this.world.getFloor(stair.toLevel)) {
      this.notice(p, 'Целевой этаж недоступен.');
      return;
    }
    const exitX = stair.exit.x + stair.exit.w / 2;
    const exitY = stair.exit.y + stair.exit.h / 2;
    if (!this.world.isWalkable(exitX, exitY, stair.toLevel)) {
      this.notice(p, 'Выход с лестницы заблокирован.');
      return;
    }
    p.lastStairAt = now;
    p.floor = stair.toLevel;
    p.x = exitX;
    p.y = exitY;
    p.input = { mx: 0, my: 0, sprint: false, seq: 0 };
    p.openContainerId = null;
    await repo.saveCharacter({
      id: p.id,
      x: p.x,
      y: p.y,
      floor: p.floor,
      aim: p.aim,
      hp: p.hp,
      stamina: p.stamina,
      hunger: p.hunger,
      thirst: p.thirst,
      status: p.status,
      deadUntil: p.deadUntil,
    });
    this.emit({ t: 'stair', id: stair.id, fromLevel: stair.fromLevel, toLevel: stair.toLevel, x: p.x, y: p.y, floor: p.floor });
  }

  private async handleRespawn(p: SimPlayer): Promise<void> {
    if (p.status === 'dead' && p.deadUntil && Date.now() >= p.deadUntil) {
      await this.applyRespawn(p);
    }
  }

  private async handleInteract(p: SimPlayer): Promise<void> {
    if (p.status !== 'alive') return;
    const door = this.world.nearestDoor(p.x, p.y, 2.3, p.floor);
    if (door) {
      if (!hasSight(this.world, p, { x: door.cx ?? door.x + 0.5, y: door.cy ?? door.y + 0.5, floor: door.floor }, 'sight')) {
        this.notice(p, 'Дверь за препятствием.');
        return;
      }
      const open = !door.open;
      const updated = this.world.setDoorOpen(door.id, open);
      if (updated) {
        if (!open) {
          this.resolveDoorClose(door);
        }
        this.emit({ t: 'door', id: door.id, x: door.cx ?? door.x + 0.5, y: door.cy ?? door.y + 0.5, floor: door.floor, open });
        void repo.saveDoorState(door.id, door.x, door.y, open, door.locked, door.hp, door.floor);
      }
      return;
    }
    const container = this.world.nearestContainer(p.x, p.y, 1.7, p.floor);
    if (container) {
      await this.handleOpenContainer(p, container.id);
      return;
    }
    this.notice(p, 'Рядом нечего использовать.');
  }

  private async handleOpenContainer(p: SimPlayer, id: string): Promise<void> {
    if (p.status !== 'alive') return;
    const spot = this.world.containers.get(id);
    if (!spot || spot.floor !== p.floor) return;
    if (distance(p.x, p.y, spot.x, spot.y) > 2.1) {
      this.notice(p, 'Слишком далеко.');
      return;
    }
    const playerRoom = this.world.roomAt(p.x, p.y, p.floor);
    if (!playerRoom || playerRoom.id !== spot.roomId) {
      this.notice(p, 'Контейнер в другом помещении.');
      return;
    }
    if (!hasSight(this.world, p, { x: spot.x, y: spot.y, floor: spot.floor }, 'sight')) {
      this.notice(p, 'Контейнер за препятствием.');
      return;
    }
    try {
      await repo.withTransaction(async (client) => {
        const row = await repo.ensureContainer(client, id, spot.type, spot.x, spot.y, spot.floor, spot.buildingId, spot.roomId, spot.objectId);
        if (!row.generated) {
          for (const item of this.world.rollContainerLoot(spot)) {
            await repo.addContainerItem(client, id, item.key, item.qty);
          }
          await repo.setContainerGenerated(client, id);
        }
      });
      p.openContainerId = id;
      const updated = this.world.setObjectState(spot.objectId, { open: true });
      if (updated) {
        this.emit({ t: 'object_state', objectId: spot.objectId, floor: spot.floor, open: true, broken: updated.broken, destroyed: updated.destroyed, hp: updated.hp, on: updated.on });
        void repo.saveObjectState(spot.objectId, spot.floor, updated);
      }
      await this.sendInventory(p);
    } catch (err) {
      console.error('[sim] open container failed', err);
      this.notice(p, 'Не удалось открыть контейнер.');
    }
  }

  private async handlePickup(p: SimPlayer, id: string): Promise<void> {
    if (p.status !== 'alive') return;
    const item = this.ground.get(id);
    if (!item) return;
    if (item.floor !== p.floor) return;
    if (distance(p.x, p.y, item.x, item.y) > PICKUP_RANGE + 0.4) {
      this.notice(p, 'Предмет слишком далеко.');
      return;
    }
    const playerRoom = this.world.roomAt(p.x, p.y, p.floor);
    const itemRoom = this.world.roomAt(item.x, item.y, p.floor);
    if ((playerRoom?.id ?? null) !== (itemRoom?.id ?? null)) {
      this.notice(p, 'Нельзя достать сквозь стену.');
      return;
    }
    if (!hasSight(this.world, p, { x: item.x, y: item.y, floor: item.floor }, 'sight')) {
      this.notice(p, 'Предмет за препятствием.');
      return;
    }
    if (!canCarry(p.inventory, item.key, item.qty)) {
      this.notice(p, 'Недостаточно места или слишком тяжело.');
      return;
    }
    try {
      const removed = await repo.withTransaction(async (client) => {
        const row = await repo.deleteGroundItem(client, id);
        if (!row) return null;
        await repo.addCharacterItem(client, p.id, row.key, row.qty, row.durability);
        return row;
      });
      if (!removed) {
        this.ground.delete(id);
        return;
      }
      this.ground.delete(id);
      await this.refreshInventory(p, true);
      this.emit({ t: 'pickup', playerId: p.id, itemKey: removed.key, x: p.x, y: p.y });
    } catch (err) {
      console.error('[sim] pickup failed', err);
      this.notice(p, 'Не удалось подобрать предмет.');
    }
  }

  private async handleDrop(p: SimPlayer, itemId: string, qty: number): Promise<void> {
    if (p.status !== 'alive') return;
    const item = p.inventory.find((i) => i.id === itemId);
    if (!item) return;
    const amount = Math.min(qty, item.qty);
    if (item.equipped) {
      this.notice(p, 'Сначала снимите оружие.');
      return;
    }
    try {
      const dropped = await repo.withTransaction(async (client) => {
        const taken = await repo.takeCharacterItem(client, p.id, itemId, amount);
        if (!taken) return null;
        const row = await repo.insertGroundItem(
          client,
          taken.key,
          taken.qty,
          p.x + (Math.random() - 0.5) * 0.5,
          p.y + (Math.random() - 0.5) * 0.5,
          taken.durability,
          p.id,
          p.floor,
        );
        return row;
      });
      if (!dropped) return;
      this.ground.set(dropped.id, {
        id: dropped.id,
        key: dropped.key,
        qty: dropped.qty,
        x: dropped.x,
        y: dropped.y,
        floor: p.floor,
        durability: dropped.durability,
      });
      await this.refreshInventory(p, true);
      this.emit({ t: 'drop', playerId: p.id, itemKey: dropped.key, x: dropped.x, y: dropped.y, floor: p.floor });
    } catch (err) {
      console.error('[sim] drop failed', err);
      this.notice(p, 'Не удалось выбросить предмет.');
    }
  }

  private async handleTransfer(p: SimPlayer, itemId: string, qty: number, dir: 'take' | 'put'): Promise<void> {
    if (p.status !== 'alive') return;
    if (!p.openContainerId) return;
    const container = this.world.containers.get(p.openContainerId);
    if (!container) return;
    if (distance(p.x, p.y, container.x + 0.5, container.y + 0.5) > 2.2) {
      p.openContainerId = null;
      await this.sendInventory(p);
      return;
    }
    try {
      if (dir === 'take') {
        const rows = await repo.loadContainerItems(container.id);
        const target = rows.find((r) => r.id === itemId);
        if (!target) return;
        const amount = Math.min(qty, target.qty);
        if (!canCarry(p.inventory, target.key, amount)) {
          this.notice(p, 'Недостаточно места или слишком тяжело.');
          return;
        }
        const ok = await repo.withTransaction(async (client) => {
          const taken = await repo.takeContainerItem(client, container.id, itemId, amount);
          if (!taken) return false;
          await repo.addCharacterItem(client, p.id, taken.key, taken.qty, taken.durability);
          return true;
        });
        if (!ok) return;
      } else {
        const item = p.inventory.find((i) => i.id === itemId);
        if (!item) return;
        const amount = Math.min(qty, item.qty);
        const containerRows = await repo.loadContainerItems(container.id);
        if (!canCarry(containerRows, item.key, amount, container.maxSlots, Infinity)) {
          this.notice(p, 'В контейнере нет места.');
          return;
        }
        const ok = await repo.withTransaction(async (client) => {
          const taken = await repo.takeCharacterItem(client, p.id, itemId, amount);
          if (!taken) return false;
          await repo.addContainerItem(client, container.id, taken.key, taken.qty, taken.durability);
          return true;
        });
        if (!ok) return;
      }
      await this.refreshInventory(p, true);
    } catch (err) {
      console.error('[sim] transfer failed', err);
      this.notice(p, 'Не удалось переместить предмет.');
    }
  }

  private async handleUse(p: SimPlayer, itemId: string): Promise<void> {
    if (p.status !== 'alive') return;
    const item = p.inventory.find((i) => i.id === itemId);
    if (!item) return;
    const def = ITEMS[item.key];
    if (!def || !['food', 'drink', 'med'].includes(def.kind)) return;
    try {
      const ok = await repo.withTransaction(async (client) => {
        const taken = await repo.takeCharacterItem(client, p.id, itemId, 1);
        return !!taken;
      });
      if (!ok) return;
      if (def.heal) p.hp = Math.min(this.playerMaxHp, p.hp + def.heal);
      if (def.hunger) p.hunger = Math.min(100, p.hunger + def.hunger);
      if (def.thirst) p.thirst = Math.min(100, p.thirst + def.thirst);
      this.emit({ t: 'use', playerId: p.id, itemKey: item.key, x: p.x, y: p.y });
      await this.refreshInventory(p, true);
    } catch (err) {
      console.error('[sim] use failed', err);
    }
  }

  private async handleEquip(p: SimPlayer, itemId: string): Promise<void> {
    if (p.status !== 'alive') return;
    const item = p.inventory.find((i) => i.id === itemId);
    if (!item || ITEMS[item.key]?.kind !== 'weapon') return;
    try {
      if (item.equipped) {
        await repo.unequipAll(p.id);
        await this.refreshInventory(p, true);
        this.emit({ t: 'equip', playerId: p.id, itemKey: null });
        return;
      }
      const ok = await repo.setEquipped(p.id, itemId);
      if (!ok) return;
      await this.refreshInventory(p, true);
      this.emit({ t: 'equip', playerId: p.id, itemKey: item.key });
    } catch (err) {
      console.error('[sim] equip failed', err);
    }
  }

  private async handleChat(p: SimPlayer, text: string): Promise<void> {
    const now = Date.now();
    if (now - p.lastChatAt < 700) return;
    p.lastChatAt = now;
    const clean = text.replace(/[\u0000-\u001f]/g, '').slice(0, 140).trim();
    if (!clean) return;

    if (clean.startsWith('/')) {
      const parts = clean.slice(1).toLowerCase().split(/\s+/);
      const cmd = parts[0];
      const devCommands = ['heal', 'kit', 'buff', 'god', 'godmode', 'spawn', 'teleport_spawn'];
      if (devCommands.includes(cmd)) {
        if (!this.isPlayerAdmin(p)) {
          this.notice(p, 'Команда запрещена: требуются права администратора или режим разработки.');
          return;
        }
        if (cmd === 'heal') {
          p.hp = this.playerMaxHp;
          p.stamina = PLAYER_MAX_STAMINA;
          p.hunger = 100;
          p.thirst = 100;
          this.notice(p, `Здоровье и показатели восстановлены (${this.playerMaxHp} HP).`);
          return;
        }
        if (cmd === 'kit' || cmd === 'buff') {
          p.hp = this.playerMaxHp;
          p.stamina = PLAYER_MAX_STAMINA;
          p.hunger = 100;
          p.thirst = 100;
          await this.grantTestKit(p);
          this.notice(p, 'Выдан боевой комплект (/kit).');
          return;
        }
        if (cmd === 'god' || cmd === 'godmode') {
          p.godmode = !p.godmode;
          this.notice(p, `Режим бога (неуязвимость): ${p.godmode ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}.`);
          return;
        }
        if (cmd === 'spawn' || cmd === 'teleport_spawn') {
          p.x = this.world.spawn.x;
          p.y = this.world.spawn.y;
          this.notice(p, 'Телепортирован в безопасную зону.');
          return;
        }
      }
      if (cmd === 'help') {
        this.notice(p, 'Доступные команды: /heal, /kit, /buff, /god, /spawn');
        return;
      }
      this.notice(p, `Неизвестная команда /${cmd}. Используйте /help`);
      return;
    }

    this.emit({ t: 'chat', name: p.name, playerId: p.id, text: clean });
  }

  private async dropLoot(x: number, y: number, key: string, qty: number, floor = 0): Promise<void> {
    try {
      const row = await repo.withTransaction((client) =>
        repo.insertGroundItem(client, key, qty, x, y, 1, null, floor),
      );
      this.ground.set(row.id, { id: row.id, key, qty, x, y, floor, durability: 1 });
      this.emit({ t: 'loot_drop', x, y, floor, itemKey: key });
    } catch (err) {
      console.error('[sim] drop loot failed', err);
    }
  }

  broadcastSnapshots(): void {
    const now = Date.now();
    const events = this.events.splice(0, this.events.length);
    for (const p of this.players.values()) {
      if (!p.conn) continue;
      const players = [...this.players.values()]
        .filter((o) => o.id !== p.id && o.conn && o.floor === p.floor && distance(p.x, p.y, o.x, o.y) <= AOI_RADIUS)
        .map((o) => ({
          id: o.id,
          name: o.name,
          x: o.x,
          y: o.y,
          floor: o.floor,
          aim: o.aim,
          hp: Math.max(0, Math.round(o.hp)),
          maxHp: this.playerMaxHp,
          stamina: Math.round(o.stamina),
          status: o.status,
          moving: Math.hypot(o.input.mx, o.input.my) > 0.01,
          sprinting: o.input.sprint,
          weapon: o.inventory.find((i) => i.equipped && ITEMS[i.key]?.kind === 'weapon')?.key ?? null,
          actionAt: o.lastAttackAt,
        }));
      const zombies: ZombieSnapshot[] = [];
      for (const z of this.zombies.values()) {
        if (z.floor !== p.floor || distance(p.x, p.y, z.x, z.y) > AOI_RADIUS) continue;
        zombies.push({
          id: z.id,
          type: z.type,
          x: z.x,
          y: z.y,
          floor: z.floor,
          aim: z.aim,
          hp: Math.max(0, Math.round(z.hp)),
          maxHp: z.maxHp,
          state: z.state,
          moving: z.moving,
          actionAt: z.actionAt || undefined,
        });
      }
      const items = [];
      for (const g of this.ground.values()) {
        if (g.floor !== p.floor || distance(p.x, p.y, g.x, g.y) > AOI_RADIUS) continue;
        items.push({ id: g.id, key: g.key, qty: g.qty, x: g.x, y: g.y, floor: g.floor });
      }
      const localEvents = events.filter((e) => {
        if (typeof e.x !== 'number' || typeof e.y !== 'number') return true;
        return distance(p.x, p.y, e.x, e.y) <= AOI_RADIUS + 12;
      });
      const weapon = p.inventory.find((i) => i.equipped && ITEMS[i.key]?.kind === 'weapon');
      this.send(p, {
        t: 'snapshot',
        tick: this.tickCount,
        time: now,
        online: [...this.players.values()].filter((x) => x.conn).length,
        self: {
          id: p.id,
          x: p.x,
          y: p.y,
          floor: p.floor,
          aim: p.aim,
          hp: Math.max(0, p.hp),
          maxHp: this.playerMaxHp,
          stamina: p.stamina,
          hunger: p.hunger,
          thirst: p.thirst,
          status: p.status,
          respawnIn: p.deadUntil ? Math.max(0, p.deadUntil - now) : undefined,
          ack: p.lastAck,
          weapon: weapon?.key ?? null,
          equipped: p.equippedId ? (p.inventory.find((i) => i.id === p.equippedId)?.key ?? null) : null,
          weight: totalWeight(p.inventory),
          maxWeight: INVENTORY_WEIGHT,
          slotCount: p.inventory.length,
        },
        players,
        zombies,
        items,
        events: localEvents.slice(-60),
      });
      this.updateSubscriptions(p);
    }
  }

  async saveAll(shuttingDown = false): Promise<void> {
    for (const p of this.players.values()) {
      await this.savePlayer(p);
    }
    const now = Date.now();
    for (const z of this.zombies.values()) {
      try {
        await repo.upsertZombie({
          id: z.id,
          chunkX: z.chunkX,
          chunkY: z.chunkY,
          type: z.type,
          x: z.x,
          y: z.y,
          floor: z.floor,
          aim: z.aim,
          hp: z.hp,
          state: z.state,
          alive: true,
        });
      } catch {
        /* retry next cycle */
      }
    }
    if (!shuttingDown) console.log(`[sim] saved ${this.players.size} players, ${this.zombies.size} zombies at ${new Date(now).toISOString()}`);
  }

  private async savePlayer(p: SimPlayer): Promise<void> {
    try {
      await repo.saveCharacter({
        id: p.id,
        x: p.x,
        y: p.y,
        floor: p.floor,
        aim: p.aim,
        hp: p.hp,
        stamina: p.stamina,
        hunger: p.hunger,
        thirst: p.thirst,
        status: p.status,
        deadUntil: p.deadUntil,
      });
    } catch (err) {
      console.error(`[sim] save failed for ${p.name}`, err);
    }
  }

  stats(): { online: number; zombies: number; players: number; groundItems: number } {
    return {
      online: [...this.players.values()].filter((p) => p.conn).length,
      zombies: this.zombies.size,
      players: this.players.size,
      groundItems: this.ground.size,
    };
  }
}
