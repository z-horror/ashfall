import Phaser from 'phaser';
import {
  ITEMS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_SPRINT,
  PICKUP_RANGE,
  TILE,
  chunkOf,
  moveCircle,
  type ContainerView,
  type EventView,
  type GroundItemSnapshot,
  type InventoryView,
  type PlayerSnapshot,
  type SelfSnapshot,
  type ServerMessage,
  type ZombieSnapshot,
} from '@ashfall/shared';
import type { NetClient } from '../net/connection.js';
import type { HUD } from '../ui/hud.js';
import { Minimap } from '../ui/minimap.js';
import type { AudioEngine } from '../audio.js';
import { ClientWorld } from '../world/clientWorld.js';
import { ChunkView, type BuildingVisual } from '../world/chunkView.js';
import { CharacterView, ItemSprite, weaponName } from '../world/entityView.js';
import { aimFromScreenDelta, iso } from './iso.js';
import { ENV_ATLAS, artImage, artSetTexture, buildEnvironmentArt } from '../art/textures.js';
import { buildCharacterAssets, corpseFor } from '../art/characters.js';
import { hashString } from '../art/util.js';

interface SceneDeps {
  net: NetClient;
  hud: HUD;
  audio: AudioEngine;
}

type Keys = Set<string>;

export class GameScene extends Phaser.Scene {
  private net: NetClient;
  private hud: HUD;
  private audio: AudioEngine;
  private world = new ClientWorld();
  private minimap: Minimap | null = null;

  private chunks = new Map<string, ChunkView>();
  private buildingVisuals = new Map<string, BuildingVisual>();
  private selfView: CharacterView | null = null;
  private playerViews = new Map<number, CharacterView>();
  private zombieViews = new Map<string, CharacterView>();
  private itemSprites = new Map<string, ItemSprite>();

  private selfId = 0;
  private selfName = '';
  private selfSnapshot: SelfSnapshot | null = null;
  private seed = '';
  private predicted = { x: 48.5, y: 48.5 };
  private aim = 0;
  private keys: Keys = new Set();
  private pointerDown = false;
  private pendingInputs: Array<{ seq: number; mx: number; my: number; speed: number; dt: number }> = [];
  private lastInputSent = 0;
  private lastAttackSent = 0;
  private lastFootstep = 0;
  private lastPrompt = 0;
  private lastMinimap = 0;
  private lastAttackInterval = 520;
  private equippedKey: string | null = null;
  private currentBuilding: string | null = null;
  private openContainerId: string | null = null;
  private lastContainerCheck = 0;
  private deathCause = '';
  private dust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private light: Phaser.GameObjects.Image | null = null;
  private aimWorld = { x: 0, y: 0 };
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private booted = false;
  private buildingFade = new Map<string, boolean>();
  private lastOnline = 0;
  private spawnPoint = { x: 48.5, y: 48.5 };
  private safeZoneDrawn = false;

  constructor(deps: SceneDeps) {
    super({ key: 'GameScene' });
    this.net = deps.net;
    this.hud = deps.hud;
    this.audio = deps.audio;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  get ready(): Promise<void> {
    return this.readyPromise;
  }

  preload(): void {
    // Pre-rendered Fallout 2 CRPG isometric sprites
    this.load.image('prop_car_h_0', 'assets/cars/car_highwayman.png');
    this.load.image('prop_car_h_1', 'assets/cars/car_highwayman.png');
    this.load.image('prop_car_h_2', 'assets/cars/car_highwayman.png');
    this.load.image('prop_car_h_3', 'assets/cars/car_highwayman.png');

    this.load.image('prop_car_v_0', 'assets/cars/car_highwayman_v.png');
    this.load.image('prop_car_v_1', 'assets/cars/car_highwayman_v.png');
    this.load.image('prop_car_v_2', 'assets/cars/car_highwayman_v.png');
    this.load.image('prop_car_v_3', 'assets/cars/car_highwayman_v.png');

    this.load.image('prop_dumpster', 'assets/props/prop_dumpster.png');
    this.load.image('prop_crate', 'assets/props/prop_crate.png');
    this.load.image('prop_med', 'assets/props/prop_med.png');
    this.load.image('prop_barrel', 'assets/props/prop_barrel.png');

    this.load.image('prop_tree_0', 'assets/props/prop_tree_0.png');
    this.load.image('prop_tree_1', 'assets/props/prop_tree_1.png');
    this.load.image('prop_tree_2', 'assets/props/prop_tree_2.png');

    this.load.image('sign_pharmacy', 'assets/signs/sign_pharmacy.png');
    this.load.image('sign_market', 'assets/signs/sign_market.png');
    this.load.image('sign_cafe', 'assets/signs/sign_cafe.png');
    this.load.image('sign_gun', 'assets/signs/sign_gun.png');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0d0b');
    this.cameras.main.setZoom(1.34);

    console.time('[ashfall] environment art');
    buildEnvironmentArt(this);
    console.timeEnd('[ashfall] environment art');
    console.time('[ashfall] character art');
    buildCharacterAssets(this);
    console.timeEnd('[ashfall] character art');

    this.minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement);

    this.dust = this.add.particles(0, 0, ENV_ATLAS, {
      frame: 'fx_dust',
      x: { min: -900, max: 900 },
      y: { min: -620, max: 620 },
      lifespan: { min: 4500, max: 9000 },
      speedX: { min: -7, max: 7 },
      speedY: { min: -11, max: 3 },
      scale: { start: 0.18, end: 1.15 },
      alpha: { start: 0, end: 0.2, ease: 'Sine.easeInOut' },
      frequency: 70,
      quantity: 1,
      blendMode: Phaser.BlendModes.ADD,
    });
    this.dust.setDepth(80_000);

    this.light = artImage(this, 0, 0, 'fx_light')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.085)
      .setScale(1.7)
      .setDepth(85_000);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      if (this.hud.blocksInput) return;
      this.audio.ensure();
      this.pointerDown = true;
      this.doAttack();
    });
    this.input.on('pointerup', () => {
      this.pointerDown = false;
    });
    this.input.on('gameout', () => {
      this.pointerDown = false;
    });

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onBlur);
    });

    this.booted = true;
    this.readyResolve();
  }

  private onBlur = (): void => {
    this.keys.clear();
    this.pointerDown = false;
  };

  private onKeyDown = (ev: KeyboardEvent): void => {
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (ev.code === 'Escape') {
      if (this.hud.isDevPanelOpen) {
        this.hud.closeDevPanel();
        return;
      }
      if (this.hud.isSettingsOpen) {
        this.hud.closeSettings();
        return;
      }
      if (this.hud.isChatOpen) {
        this.hud.closeChat();
        return;
      }
      if (this.hud.isInventoryOpen) {
        this.hud.closeInventory(true);
        this.audio.inventory(false);
        return;
      }
      this.hud.toggleSettings();
      return;
    }
    if ((ev.code === 'F1' || ev.code === 'Backquote') && !ev.repeat) {
      this.hud.toggleDevPanel();
      return;
    }
    if (ev.code === 'KeyI' && !ev.repeat) {
      this.hud.toggleInventory();
      this.audio.inventory(this.hud.isInventoryOpen);
      this.keys.clear();
      return;
    }
    if (ev.code === 'KeyC' && !ev.repeat) {
      this.hud.openCrafting();
      this.audio.inventory(this.hud.isInventoryOpen);
      this.keys.clear();
      return;
    }
    if (ev.code === 'KeyT' && !ev.repeat) {
      if (!this.hud.isInventoryOpen) {
        this.hud.openChat();
        this.keys.clear();
      }
      return;
    }
    if (this.hud.blocksInput) return;
    if (ev.code === 'KeyE' && !ev.repeat) {
      this.interact();
      return;
    }
    if (/^Digit[1-5]$/.test(ev.code) && !ev.repeat) {
      this.hud.quickUse(Number(ev.code.slice(5)) - 1);
      return;
    }
    this.keys.add(ev.code);
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) {
      ev.preventDefault();
    }
    this.audio.ensure();
  };

  private onKeyUp = (ev: KeyboardEvent): void => {
    this.keys.delete(ev.code);
    if (!this.movingInput() && this.selfSnapshot?.status === 'alive' && !this.hud.blocksInput) {
      this.net.sendInput(0, 0, this.aim, false);
    }
  };

  private interact(): void {
    if (!this.selfSnapshot || this.selfSnapshot.status !== 'alive' || this.hud.blocksInput) return;
    const { x, y } = this.predicted;
    const door = this.world.nearestDoor(x, y, 2.2);
    if (door) {
      this.net.action({ t: 'interact' });
      return;
    }
    const container = this.world.nearestContainer(x, y, 1.95);
    if (container) {
      const cBuilding = this.world.buildingAt(container.x + 0.5, container.y + 0.5)?.id ?? null;
      if (cBuilding === this.currentBuilding) {
        this.net.action({ t: 'open_container', id: container.id });
        return;
      }
    }
    const item = this.nearestItem();
    if (item) {
      this.net.action({ t: 'pickup', id: item.id });
      return;
    }
    this.net.action({ t: 'interact' });
  }

  private nearestItem(): GroundItemSnapshot | null {
    let best: GroundItemSnapshot | null = null;
    let bestD = PICKUP_RANGE;
    for (const it of this.itemSprites.keys()) {
      const snap = this.currentItems.get(it);
      if (!snap) continue;
      const itBuilding = this.world.buildingAt(snap.x, snap.y)?.id ?? null;
      if (itBuilding !== this.currentBuilding) continue;
      const d = Math.hypot(snap.x - this.predicted.x, snap.y - this.predicted.y);
      if (d < bestD) {
        bestD = d;
        best = snap;
      }
    }
    return best;
  }

  private currentItems = new Map<string, GroundItemSnapshot>();

  private computeAim(): number {
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const p = iso(this.predicted.x, this.predicted.y);
    return aimFromScreenDelta(worldPoint.x - p.x, worldPoint.y - (p.y - 30));
  }

  private doAttack(): void {
    const now = performance.now();
    if (now - this.lastAttackSent < this.lastAttackInterval) return;
    if (!this.selfSnapshot || this.selfSnapshot.status !== 'alive' || this.hud.blocksInput) return;
    this.lastAttackSent = now;
    this.attackAim = this.computeAim();
    const isGun = this.equippedKey === 'pistol';
    if (isGun) {
      const hasAmmo = this.hud.hasAmmoFor('pistol');
      if (!hasAmmo) {
        this.audio.empty();
        this.hud.setPrompt('НЕТ ПАТРОНОВ');
        this.time.delayedCall(1200, () => {
          if (this.hud) this.hud.setPrompt(null);
        });
        return;
      }
    }
    this.net.action({ t: 'attack', aim: this.attackAim });
    this.hud.flashAttack();
    this.selfView?.playAttack();
    if (isGun) {
      this.audio.shot(1);
      this.spawnTracer(this.predicted.x, this.predicted.y, this.attackAim, 14);
    } else {
      this.audio.swing(1);
      this.spawnSwingArc(this.predicted.x, this.predicted.y, this.attackAim);
    }
  }

  private attackAim = 0;

  private ensureSelfView(s: {
    id: number;
    x: number;
    y: number;
    aim: number;
    hp: number;
    maxHp: number;
    name: string;
  }): void {
    if (this.selfView) return;
    this.selfView = new CharacterView(this, {
      id: s.id,
      kind: 'player',
      x: s.x,
      y: s.y,
      aim: s.aim,
      hp: s.hp,
      maxHp: s.maxHp,
      name: s.name,
    });
    this.selfView.setLocal(true);
    this.cameras.main.startFollow(this.selfView.sprite, false, 0.24, 0.24);
    this.cameras.main.roundPixels = false;
    this.cameras.main.setFollowOffset(0, 24);
    this.cameras.main.setZoom(1.34);
  }

  private applyWelcome(msg: Extract<ServerMessage, { t: 'welcome' }>): void {
    if (this.seed && this.seed !== msg.seed) {
      this.clearWorld();
    }
    this.seed = msg.seed;
    this.spawnPoint = { x: msg.spawn.x, y: msg.spawn.y };
    if (!this.safeZoneDrawn) {
      this.safeZoneDrawn = true;
      this.drawSafeZone();
    }
    this.selfId = msg.id;
    this.selfName = msg.name;
    this.hud.setName(msg.name);
    this.hud.setVisible(true);
    document.dispatchEvent(new Event('ashfall:loaded'));
    if (!this.selfView) {
      this.predicted = { x: msg.x, y: msg.y };
      this.aim = msg.aim;
      this.ensureSelfView({
        id: msg.id,
        x: msg.x,
        y: msg.y,
        aim: msg.aim,
        hp: msg.hp,
        maxHp: 100,
        name: msg.name,
      });
      const p = iso(msg.x, msg.y);
      this.cameras.main.centerOn(p.x, p.y);
    } else if (Math.hypot(this.predicted.x - msg.x, this.predicted.y - msg.y) > 3) {
      this.predicted = { x: msg.x, y: msg.y };
    }
    this.hud.addLog(`Вы в районе Грейуотер. Смерть здесь — навсегда.`, 'normal');
    this.hud.addLog('Безопасная зона у перекрёстка: зомби не атакуют.', 'good');
  }

  private drawSafeZone(): void {
    const p = iso(this.spawnPoint.x, this.spawnPoint.y);
    const g = this.add.graphics().setDepth(-900_000);
    g.lineStyle(2, 0xd0bc85, 0.13);
    g.strokeEllipse(p.x, p.y + 4, 634, 316);
    g.lineStyle(1, 0xd0bc85, 0.1);
    g.strokeEllipse(p.x, p.y + 4, 590, 294);
    g.fillStyle(0xd0bc85, 0.025);
    g.fillEllipse(p.x, p.y + 4, 620, 310);
    const label = this.add
      .text(p.x, p.y + 150, 'БЕЗОПАСНАЯ ЗОНА', {
        fontFamily: '"Consolas", monospace',
        fontSize: '11px',
        color: '#b7a77b',
        stroke: '#0a0c0a',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setAlpha(0.35)
      .setDepth(-899_999);
    this.time.addEvent({
      delay: 11000,
      loop: true,
      callback: () => {
        this.tweens.add({ targets: label, alpha: 0.14, duration: 2600, yoyo: true });
      },
    });
  }

  private clearWorld(): void {
    for (const [key, view] of this.chunks) {
      view.destroy();
      this.chunks.delete(key);
    }
    this.buildingVisuals.clear();
    this.buildingFade.clear();
    for (const v of this.playerViews.values()) v.destroy();
    this.playerViews.clear();
    for (const v of this.zombieViews.values()) v.destroy();
    this.zombieViews.clear();
    for (const i of this.itemSprites.values()) i.destroy();
    this.itemSprites.clear();
    this.world.chunks.clear();
    this.world.doors.clear();
    this.world.buildings.clear();
    this.world.containers.clear();
  }

  handleServerMessage(msg: ServerMessage): void {
    if (!this.booted) return;
    switch (msg.t) {
      case 'welcome':
        this.applyWelcome(msg);
        break;
      case 'chunk':
        this.applyChunk(msg.chunk);
        break;
      case 'chunk_unload':
        this.unloadChunk(msg.cx, msg.cy);
        break;
      case 'snapshot':
        this.applySnapshot(msg);
        break;
      case 'inventory':
        this.applyInventory(msg.inv, msg.container ?? null);
        break;
      case 'notice':
        this.hud.addLog(msg.text);
        this.hud.toast(msg.text, 2200);
        break;
      case 'error':
        this.hud.toast(msg.message, 3200);
        break;
      case 'pong':
        break;
      default:
        break;
    }
  }

  private applyChunk(chunk: import('@ashfall/shared').ChunkData): void {
    const key = `${chunk.cx},${chunk.cy}`;
    const t0 = performance.now();
    const existing = this.chunks.get(key);
    if (existing) {
      existing.destroy();
      this.chunks.delete(key);
    }
    this.world.loadChunk(chunk);
    const view = new ChunkView(this, this.world, chunk, this.buildingVisuals);
    this.chunks.set(key, view);
    this.minimap?.addChunk(chunk);
    console.log(`[ashfall] chunk ${key} built in ${(performance.now() - t0).toFixed(0)}ms`);
    if (this.currentBuilding) {
      const visual = this.buildingVisuals.get(this.currentBuilding);
      if (visual) this.setBuildingFade(visual, true, false);
    }
  }

  private unloadChunk(cx: number, cy: number): void {
    const key = `${cx},${cy}`;
    const view = this.chunks.get(key);
    if (view) {
      view.destroy();
      this.chunks.delete(key);
    }
    this.world.unloadChunk(cx, cy);
  }

  private applyInventory(inv: InventoryView, container: ContainerView | null): void {
    if (container) {
      this.openContainerId = container.id;
      if (!this.hud.isInventoryOpen) this.hud.openInventory();
    } else {
      this.openContainerId = null;
    }
    this.hud.setInventory(inv, container);
    const equipped = inv.items.find((i) => i.equipped);
    this.equippedKey = equipped?.key ?? null;
    const def = this.equippedKey ? ITEMS[this.equippedKey] : null;
    this.lastAttackInterval = Math.max(220, Math.round((def?.cooldown ?? 0.52) * 1000));
    this.hud.setPrompt(null);
  }

  private applySnapshot(msg: Extract<ServerMessage, { t: 'snapshot' }>): void {
    const prevStatus = this.selfSnapshot?.status;
    this.selfSnapshot = msg.self;
    this.lastOnline = msg.online;

    if (msg.self.status === 'alive') {
      if (prevStatus === 'dead' || !this.selfView) {
        this.predicted = { x: msg.self.x, y: msg.self.y };
        this.pendingInputs = [];
        this.selfView?.revive();
      } else {
        const ack = msg.self.ack ?? 0;
        this.pendingInputs = this.pendingInputs.filter((i) => i.seq > ack);

        let rx = msg.self.x;
        let ry = msg.self.y;
        for (const inp of this.pendingInputs) {
          const res = moveCircle(
            { w: 128, h: 128, cells: this.world.collision },
            rx,
            ry,
            inp.mx * inp.speed * inp.dt,
            inp.my * inp.speed * inp.dt,
            PLAYER_RADIUS,
          );
          rx = Phaser.Math.Clamp(res.x, 0.4, 127.6);
          ry = Phaser.Math.Clamp(res.y, 0.4, 127.6);
        }

        const err = Math.hypot(rx - this.predicted.x, ry - this.predicted.y);
        if (err > 0.8) {
          this.predicted = { x: rx, y: ry };
        } else if (err > 0.04) {
          const blend = this.movingInput() ? 0.15 : 0.35;
          this.predicted.x += (rx - this.predicted.x) * blend;
          this.predicted.y += (ry - this.predicted.y) * blend;
        }
      }
      this.ensureSelfView({
        id: msg.self.id,
        x: this.predicted.x,
        y: this.predicted.y,
        aim: msg.self.aim,
        hp: msg.self.hp,
        maxHp: msg.self.maxHp,
        name: this.selfName,
      });
      this.selfView?.revive();
    }
    if (msg.self.status === 'dead' && this.selfView) {
      this.selfView.setDead();
    }

    const seenPlayers = new Set<number>();
    for (const p of msg.players) {
      seenPlayers.add(p.id);
      let view = this.playerViews.get(p.id);
      if (!view) {
        view = new CharacterView(this, {
          id: p.id,
          kind: 'player',
          x: p.x,
          y: p.y,
          aim: p.aim,
          hp: p.hp,
          maxHp: p.maxHp,
          name: p.name,
        });
        this.playerViews.set(p.id, view);
      }
      view.applyPlayer(p);
    }
    for (const [id, view] of [...this.playerViews]) {
      if (!seenPlayers.has(id)) {
        view.destroy();
        this.playerViews.delete(id);
      }
    }

    const seenZombies = new Set<string>();
    for (const z of msg.zombies) {
      seenZombies.add(z.id);
      let view = this.zombieViews.get(z.id);
      if (!view) {
        view = new CharacterView(this, {
          id: z.id,
          kind: 'zombie',
          type: z.type,
          x: z.x,
          y: z.y,
          aim: z.aim,
          hp: z.hp,
          maxHp: z.maxHp,
        });
        this.zombieViews.set(z.id, view);
      }
      view.applyZombie(z);
    }
    for (const [id, view] of [...this.zombieViews]) {
      if (!seenZombies.has(id)) {
        view.destroy();
        this.zombieViews.delete(id);
      }
    }

    const seenItems = new Set<string>();
    for (const it of msg.items) {
      seenItems.add(it.id);
      this.currentItems.set(it.id, it);
      let sprite = this.itemSprites.get(it.id);
      if (!sprite) {
        sprite = new ItemSprite(this, it.id, it.key, it.x, it.y);
        this.itemSprites.set(it.id, sprite);
      }
      sprite.setPosition(it.x, it.y);
    }
    for (const [id, sprite] of [...this.itemSprites]) {
      if (!seenItems.has(id)) {
        sprite.destroy();
        this.itemSprites.delete(id);
        this.currentItems.delete(id);
      }
    }

    for (const ev of msg.events) this.handleEvent(ev);

    this.hud.updateSelf(msg.self, msg.online);

    if (!this.hud.isInventoryOpen) {
      this.updatePrompt();
    } else {
      this.hud.setPrompt(null);
    }
  }

  private movingInput(): boolean {
    const k = this.keys;
    return (
      k.has('KeyW') ||
      k.has('KeyA') ||
      k.has('KeyS') ||
      k.has('KeyD') ||
      k.has('ArrowUp') ||
      k.has('ArrowDown') ||
      k.has('ArrowLeft') ||
      k.has('ArrowRight')
    );
  }

  private handleEvent(ev: EventView): void {
    const type = ev.t;
    const x = typeof ev.x === 'number' ? ev.x : 0;
    const y = typeof ev.y === 'number' ? ev.y : 0;
    const dist = Math.hypot(x - this.predicted.x, y - this.predicted.y);
    const vol = Math.max(0.08, Math.min(1, 1 - dist / 34));
    switch (type) {
      case 'hit': {
        const targetId = ev.targetId as number | string;
        const view = this.playerViews.get(targetId as number) ?? this.zombieViews.get(String(targetId)) ?? (targetId === this.selfId ? this.selfView : null);
        view?.flashHit();
        this.spawnDamageText(x, y, `-${Math.round(Number(ev.damage) || 0)}`, targetId === this.selfId ? '#e07964' : '#ddd3b6');
        this.spawnBlood(x, y);
        this.audio.hit(vol);
        if (targetId === this.selfId) {
          this.hud.flashHurt();
          this.cameras.main.shake(90, 0.0035);
          this.audio.hurt(1);
        }
        break;
      }
      case 'swing': {
        const playerId = ev.playerId as number;
        if (playerId !== this.selfId) {
          this.playerViews.get(playerId)?.playAttack();
          this.audio.swing(vol);
        }
        this.spawnSwingArc(x, y, Number(ev.aim) || 0);
        break;
      }
      case 'shot': {
        const playerId = ev.playerId as number;
        if (playerId !== this.selfId) {
          this.playerViews.get(playerId)?.playAttack();
          this.audio.shot(vol);
        }
        this.spawnTracer(x, y, Number(ev.aim) || 0, 14);
        break;
      }
      case 'blood':
        this.spawnBlood(x, y);
        break;
      case 'death': {
        const kind = ev.kind as string;
        const id = ev.id as number | string;
        if (kind === 'zombie') {
          const z = this.zombieViews.get(String(id));
          if (z) {
            this.spawnCorpse('zombie', Number(ev.type) || 0, String(id), x, y);
            z.destroy();
            this.zombieViews.delete(String(id));
          }
        } else if (kind === 'player') {
          const name = String(ev.name ?? 'Выживший');
          if (id === this.selfId) {
            this.deathCause = ev.byName ? `Убит: ${String(ev.byName)}` : `Причина: ${String(ev.source ?? 'заражение')}`;
            this.hud.setDeathCause(this.deathCause);
            this.audio.death();
            this.selfView?.setDead();
          } else {
            this.hud.addLog(`${name} погиб.`, 'bad');
            const view = this.playerViews.get(id as number);
            view?.setDead();
          }
          this.spawnCorpse('player', hashString(String(id)) % 4, String(id), x, y);
          if (dist < 24) this.audio.hurt(vol);
        }
        break;
      }
      case 'respawn': {
        if (ev.id === this.selfId) {
          this.predicted = { x, y };
          this.hud.addLog('Вы снова дышите. Инвентарь потерян.', 'bad');
        }
        break;
      }
      case 'zombie_attack': {
        const zid = String(ev.id);
        this.zombieViews.get(zid)?.playAttack();
        if (ev.targetId === this.selfId) {
          this.audio.hurt(1);
          this.cameras.main.shake(100, 0.004);
          this.hud.flashHurt();
        } else if (dist < 22) {
          this.audio.hit(vol * 0.5);
        }
        break;
      }
      case 'growl': {
        if (dist < 26) this.audio.growl(vol);
        break;
      }
      case 'door': {
        const id = String(ev.id);
        const open = !!ev.open;
        this.world.setDoor(id, open);
        for (const view of this.chunks.values()) view.updateDoor(id, open);
        if (!open) {
          const door = this.world.doors.get(id);
          if (door) {
            const minX = door.x - PLAYER_RADIUS;
            const maxX = door.x + 1 + PLAYER_RADIUS;
            const minY = door.y - PLAYER_RADIUS;
            const maxY = door.y + 1 + PLAYER_RADIUS;
            if (this.predicted.x >= minX && this.predicted.x <= maxX && this.predicted.y >= minY && this.predicted.y <= maxY) {
              const building = this.world.buildingAt(door.x + 0.5, door.y + 0.5);
              const isEast = door.facing === 'east' || (building ? door.x === building.x + building.w - 1 : false);
              if (isEast) {
                this.predicted.x = this.predicted.x < door.x + 0.5 ? door.x - 0.45 : door.x + 1.45;
              } else {
                this.predicted.y = this.predicted.y < door.y + 0.5 ? door.y - 0.45 : door.y + 1.45;
              }
              this.pendingInputs = [];
            }
          }
        }
        if (dist < 16) this.audio.door(open, vol);
        break;
      }
      case 'pickup': {
        if (ev.playerId === this.selfId) {
          const name = ITEMS[String(ev.itemKey)]?.name ?? String(ev.itemKey);
          this.hud.addLog(`Подобрано: ${name}.`, 'good');
          this.audio.pickup();
        }
        break;
      }
      case 'drop': {
        break;
      }
      case 'use': {
        if (ev.playerId === this.selfId) this.audio.consume();
        break;
      }
      case 'equip': {
        if (ev.playerId === this.selfId) {
          this.hud.addLog(`В руках: ${weaponName(String(ev.itemKey))}.`);
          this.audio.equip();
        }
        break;
      }
      case 'prop_hit': {
        this.spawnDust(x, y);
        break;
      }
      case 'prop_destroyed': {
        for (const view of this.chunks.values()) view.removeProp(String(ev.id));
        this.spawnDebris(x, y);
        if (dist < 18) this.audio.hit(vol);
        break;
      }
      case 'loot_drop': {
        break;
      }
      case 'chat': {
        this.hud.addChat(String(ev.name ?? '?'), String(ev.text ?? ''));
        break;
      }
      case 'notice': {
        const text = String(ev.text ?? '');
        if (text) this.hud.addLog(text);
        break;
      }
      default:
        break;
    }
    if (type === 'death' && dist < 10) this.audio.death();
  }

  update(time: number, delta: number): void {
    if (!this.booted) return;
    const dt = Math.min(0.05, delta / 1000);
    const now = time;

    for (const v of this.playerViews.values()) v.update(dt, now);
    for (const v of this.zombieViews.values()) v.update(dt, now);
    for (const i of this.itemSprites.values()) i.update(now);

    if (!this.selfSnapshot || !this.selfView) return;

    const alive = this.selfSnapshot.status === 'alive';
    const blocked = this.hud.blocksInput;
    let mx = 0;
    let my = 0;
    if (alive && !blocked) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    this.aim = this.computeAim();
    const sprintKey = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const sprint = alive && sprintKey && this.selfSnapshot.stamina > 3 && (mx !== 0 || my !== 0);

    if (alive) {
      const speed = sprint ? PLAYER_SPRINT : PLAYER_SPEED;
      const res = moveCircle(
        { w: 128, h: 128, cells: this.world.collision },
        this.predicted.x,
        this.predicted.y,
        mx * speed * dt,
        my * speed * dt,
        PLAYER_RADIUS,
      );
      this.predicted.x = Phaser.Math.Clamp(res.x, 0.4, 127.6);
      this.predicted.y = Phaser.Math.Clamp(res.y, 0.4, 127.6);
      this.selfView.setPredicted(this.predicted.x, this.predicted.y, this.aim, mx !== 0 || my !== 0, sprint, mx, my);
      this.selfView.update(dt, now);
      if ((mx !== 0 || my !== 0) && now - this.lastFootstep > (sprint ? 290 : 430)) {
        this.lastFootstep = now;
        const tx = Math.floor(this.predicted.x);
        const ty = Math.floor(this.predicted.y);
        const tileId = this.world.tileAt(tx, ty);
        let surface: 'asphalt' | 'wood' | 'grass' | 'dirt' | 'concrete' | 'interior' = 'asphalt';
        if (this.currentBuilding || tileId === TILE.WOOD_FLOOR) surface = 'wood';
        else if (tileId === TILE.TILE_FLOOR) surface = 'interior';
        else if (tileId === TILE.GRASS) surface = 'grass';
        else if (tileId === TILE.DIRT || tileId === TILE.RUBBLE) surface = 'dirt';
        else if (tileId === TILE.CONCRETE || tileId === TILE.SIDEWALK) surface = 'concrete';
        else surface = 'asphalt';
        this.audio.footstep(surface, 0.7);
      }
    }

    if (now - this.lastInputSent > 50) {
      const inputDt = this.lastInputSent > 0 ? Math.min((now - this.lastInputSent) / 1000, 0.1) : 0.05;
      this.lastInputSent = now;
      const effectiveMx = blocked ? 0 : mx;
      const effectiveMy = blocked ? 0 : my;
      const effectiveSprint = sprint && !blocked;
      const seq = this.net.sendInput(effectiveMx, effectiveMy, this.aim, effectiveSprint);
      if (alive && (effectiveMx !== 0 || effectiveMy !== 0)) {
        const speed = effectiveSprint ? PLAYER_SPRINT : PLAYER_SPEED;
        this.pendingInputs.push({ seq, mx: effectiveMx, my: effectiveMy, speed, dt: inputDt });
        if (this.pendingInputs.length > 60) this.pendingInputs.shift();
      }
    }
    if (this.pointerDown && alive && !blocked) this.doAttack();

    const bInside = this.getInsideBuilding(this.predicted.x, this.predicted.y);
    const insideId = bInside?.id ?? null;
    if (insideId !== this.currentBuilding) {
      if (this.currentBuilding) {
        const old = this.buildingVisuals.get(this.currentBuilding);
        if (old) this.setBuildingFade(old, false);
      }
      this.currentBuilding = insideId;
      if (insideId) {
        const vis = this.buildingVisuals.get(insideId);
        if (vis) this.setBuildingFade(vis, true);
      }
    }

    if (this.light) {
      const p = iso(this.predicted.x, this.predicted.y);
      this.light.setPosition(p.x, p.y - 10);
      this.light.setAlpha(0.07 + Math.sin(now / 900) * 0.015);
    }

    if (now - this.lastPrompt > 180) {
      this.lastPrompt = now;
      if (!this.hud.isInventoryOpen && alive) this.updatePrompt();
      else this.hud.setPrompt(null);
      if (this.openContainerId && now - this.lastContainerCheck > 600) {
        this.lastContainerCheck = now;
        if (!this.world.containerNear(this.openContainerId, this.predicted.x, this.predicted.y, 2.6)) {
          this.net.action({ t: 'close_container' });
          this.openContainerId = null;
          this.hud.setContainer(null);
        }
      }
    }

    if (now - this.lastMinimap > 220) {
      this.lastMinimap = now;
      this.minimap?.render(
        { x: this.predicted.x, y: this.predicted.y, aim: this.aim },
        [...this.playerViews.values()].map((v) => ({
          id: Number(v.id),
          name: v.name,
          x: v.x,
          y: v.y,
          aim: v.aim,
          hp: 100,
          maxHp: 100,
          stamina: 100,
          status: 'alive',
          moving: false,
          sprinting: false,
          weapon: null,
        })),
        [...this.zombieViews.values()].map((v) => ({
          id: String(v.id),
          type: v.type,
          x: v.x,
          y: v.y,
          aim: v.aim,
          hp: 100,
          maxHp: 100,
          state: 'idle',
          moving: false,
        })),
        [...this.currentItems.values()],
      );
    }

    this.hud.updateSelf(this.selfSnapshot, this.lastOnline);
    this.hud.updateTelemetry(
      this.predicted.x,
      this.predicted.y,
      this.currentBuilding,
      Math.round(this.game.loop.actualFps),
      this.zombieViews.size,
      this.playerViews.size,
    );
  }

  private updatePrompt(): void {
    if (!this.selfSnapshot || this.selfSnapshot.status !== 'alive' || this.hud.blocksInput) {
      this.hud.setPrompt(null);
      return;
    }
    const x = this.predicted.x;
    const y = this.predicted.y;
    const door = this.world.nearestDoor(x, y, 2.2);
    if (door) {
      const open = this.world.doorOpen.get(door.id) ?? door.open;
      this.hud.setPrompt(`<b>E</b>${open ? 'Закрыть дверь' : 'Открыть дверь'}`);
      return;
    }
    const container = this.world.nearestContainer(x, y, 1.95);
    if (container) {
      const cBuilding = this.world.buildingAt(container.x + 0.5, container.y + 0.5)?.id ?? null;
      if (cBuilding === this.currentBuilding) {
        this.hud.setPrompt(`<b>E</b>Обыскать: ${container.label}`);
        return;
      }
    }
    const item = this.nearestItem();
    if (item) {
      this.hud.setPrompt(`<b>E</b>Подобрать: ${ITEMS[item.key]?.name ?? item.key}`);
      return;
    }
    this.hud.setPrompt(null);
  }

  private getInsideBuilding(px: number, py: number): import('@ashfall/shared').BuildingDef | null {
    const b = this.world.buildingAt(px, py);
    if (!b) return null;
    // Strictly inside the interior room (inside perimeter walls):
    if (px > b.x + 0.2 && px < b.x + b.w - 1.2 && py > b.y + 0.2 && py < b.y + b.h - 1.2) {
      return b;
    }
    // If standing on the doorway tile: only inside if door is open AND player has crossed towards room interior!
    const d = this.world.nearestDoor(px, py, 1.0);
    if (d && this.world.doorOpen.get(d.id)) {
      const isInsideThreshold = d.facing === 'east' ? px < d.x + 0.45 : py < d.y + 0.45;
      if (isInsideThreshold) return b;
    }
    return null;
  }

  private setBuildingFade(visual: BuildingVisual, inside: boolean, animate = true): void {
    if (this.buildingFade.get(visual.id) === inside) return;
    this.buildingFade.set(visual.id, inside);
    const roofAlpha = inside ? 0 : 1;
    const signAlpha = inside ? 0 : 1;

    if (animate && visual.roofs.length) {
      this.tweens.killTweensOf(visual.roofs);
      this.tweens.add({ targets: visual.roofs, alpha: roofAlpha, duration: 160, ease: 'Sine.easeOut' });
    } else {
      for (const r of visual.roofs) r.setAlpha(roofAlpha);
    }

    // Classic Cutaway (Вариант Б): front walls switch to 18px waist-height cutaway textures at 100% alpha!
    if (visual.frontWalls?.length) {
      for (const w of visual.frontWalls) {
        if (w.getData('isSign')) {
          if (animate) {
            this.tweens.killTweensOf(w);
            this.tweens.add({ targets: w, alpha: signAlpha, duration: 140, ease: 'Sine.easeOut' });
          } else {
            w.setAlpha(signAlpha);
          }
          continue;
        }
        const targetKey = inside ? w.getData('cutKey') : w.getData('fullKey');
        if (targetKey) {
          artSetTexture(w, targetKey);
        }
        w.setAlpha(1.0);
      }
    }

    if (visual.backWalls?.length) {
      for (const w of visual.backWalls) w.setAlpha(1.0);
    }

    // Cutaway doors
    if (visual.doors?.length) {
      for (const d of visual.doors) {
        const doorId = d.getData('doorId');
        const facing = d.getData('facing') ?? 'south';
        const open = doorId ? (this.world.doorOpen.get(doorId) ?? false) : false;
        const targetKey = `door_${facing}_${open ? 'open' : 'closed'}`;
        artSetTexture(d, targetKey);
        d.setAlpha(1.0);
      }
    }
  }

  private spawnDamageText(wx: number, wy: number, text: string, color: string): void {
    const p = iso(wx, wy);
    const txt = this.add
      .text(p.x + (Math.random() - 0.5) * 14, p.y - 58, text, {
        fontFamily: '"Consolas", monospace',
        fontSize: '13px',
        color,
        stroke: '#090b09',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(70_000);
    this.tweens.add({ targets: txt, y: txt.y - 30, alpha: 0, duration: 850, ease: 'Cubic.easeOut', onComplete: () => txt.destroy() });
  }

  private spawnBlood(wx: number, wy: number): void {
    if (Math.random() < 0.5) return;
    const p = iso(wx + (Math.random() - 0.5) * 0.4, wy + (Math.random() - 0.5) * 0.4);
    const key = `prop_blood_${Math.floor(Math.random() * 4)}`;
    const img = artImage(this, p.x, p.y + 4, key)
      .setOrigin(0.5, 0.54)
      .setAlpha(0.7)
      .setDepth(wx + wy - 0.55)
      .setScale(0.7 + Math.random() * 0.5)
      .setRotation(Math.random() * Math.PI * 2);
    this.time.delayedCall(20_000, () => {
      if (img.active) {
        this.tweens.add({ targets: img, alpha: 0, duration: 3000, onComplete: () => img.destroy() });
      }
    });
  }

  private spawnCorpse(kind: 'player' | 'zombie', typeOrVariant: number, id: string, wx: number, wy: number): void {
    const key = corpseFor(kind, typeOrVariant, id);
    const p = iso(wx, wy);
    const img = artImage(this, p.x, p.y + 4, key)
      .setOrigin(0.5, 0.6)
      .setDepth(wx + wy + 0.2)
      .setRotation((Math.random() - 0.5) * 0.3)
      .setAlpha(0.95);
    this.time.delayedCall(110_000, () => {
      if (img.active) this.tweens.add({ targets: img, alpha: 0, duration: 5000, onComplete: () => img.destroy() });
    });
  }

  private spawnSwingArc(wx: number, wy: number, aim: number): void {
    const p = iso(wx, wy);
    const screenAngle = Math.atan2(
      (Math.cos(aim) + Math.sin(aim)) * 16,
      (Math.cos(aim) - Math.sin(aim)) * 32,
    );
    const g = this.add.graphics().setDepth(wx + wy + 2.2);
    g.lineStyle(2, 0xd9cba8, 0.55);
    g.beginPath();
    g.arc(p.x, p.y - 26, 34, screenAngle - 0.75, screenAngle + 0.75);
    g.strokePath();
    g.lineStyle(5, 0xd9cba8, 0.08);
    g.beginPath();
    g.arc(p.x, p.y - 26, 34, screenAngle - 0.75, screenAngle + 0.75);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 180, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }

  private spawnTracer(wx: number, wy: number, aim: number, range: number): void {
    const start = iso(wx, wy);
    const end = iso(wx + Math.cos(aim) * range, wy + Math.sin(aim) * range);
    const g = this.add.graphics().setDepth(wx + wy + 4);
    g.lineStyle(1.4, 0xffe4a6, 0.8);
    g.lineBetween(start.x, start.y - 30, end.x, end.y - 30);
    g.lineStyle(5, 0xffc66e, 0.08);
    g.lineBetween(start.x, start.y - 30, end.x, end.y - 30);
    this.time.delayedCall(70, () => g.destroy());
    const flash = artImage(this, start.x + Math.cos(aim) * 18, start.y - 30 + Math.sin(aim) * 10, 'fx_light')
      .setScale(0.14)
      .setAlpha(0.75)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(wx + wy + 3);
    this.tweens.add({ targets: flash, alpha: 0, scale: 0.25, duration: 110, onComplete: () => flash.destroy() });
  }

  private spawnDust(wx: number, wy: number): void {
    const p = iso(wx, wy);
    const img = artImage(this, p.x, p.y - 20, 'fx_dust').setScale(1.5).setAlpha(0.5).setDepth(wx + wy + 1);
    this.tweens.add({ targets: img, y: img.y - 24, alpha: 0, scale: 2.4, duration: 420, onComplete: () => img.destroy() });
  }

  private spawnDebris(wx: number, wy: number): void {
    const p = iso(wx, wy);
    const img = artImage(this, p.x, p.y, 'prop_debris').setOrigin(0.5, 0.7).setDepth(wx + wy - 0.5).setAlpha(0.8);
    this.tweens.add({ targets: img, alpha: 0, delay: 6000, duration: 4000, onComplete: () => img.destroy() });
    this.spawnDust(wx, wy);
  }
}
