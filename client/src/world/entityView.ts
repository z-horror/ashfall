import Phaser from 'phaser';
import { ITEMS, ZOMBIE_TYPES, type PlayerSnapshot, type ZombieSnapshot } from '@ashfall/shared';
import { screenDirectionFromAngle, iso } from '../game/iso.js';
import { CHARACTER_ATLAS, initialFrame, playerSheetFor, zombieSheetFor } from '../art/characters.js';
import { hashString } from '../art/util.js';
import { artImage } from '../art/textures.js';

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class CharacterView {
  readonly id: number | string;
  readonly kind: 'player' | 'zombie';
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  readonly label?: Phaser.GameObjects.Text;
  readonly hpBg: Phaser.GameObjects.Rectangle;
  readonly hpFill: Phaser.GameObjects.Rectangle;
  readonly type: number;
  readonly name: string;
  private scene: Phaser.Scene;
  private sheet: string;
  x: number;
  y: number;
  aim: number;
  private tx: number;
  private ty: number;
  private taim: number;
  private hp = 100;
  private maxHp = 100;
  private moving = false;
  private sprinting = false;
  private dead = false;
  private attackUntil = 0;
  private lastActionAt = 0;
  private lastAnim = '';
  private local = false;

  constructor(
    scene: Phaser.Scene,
    opts: {
      id: number | string;
      kind: 'player' | 'zombie';
      x: number;
      y: number;
      aim: number;
      hp: number;
      maxHp: number;
      name?: string;
      type?: number;
    },
  ) {
    this.scene = scene;
    this.id = opts.id;
    this.kind = opts.kind;
    this.type = opts.type ?? 0;
    this.name = opts.name ?? '';
    this.x = opts.x;
    this.y = opts.y;
    this.tx = opts.x;
    this.ty = opts.y;
    this.aim = opts.aim;
    this.taim = opts.aim;
    this.hp = opts.hp;
    this.maxHp = opts.maxHp;

    if (opts.kind === 'player') {
      const variant = hashString(String(opts.id)) % 4;
      this.sheet = playerSheetFor(variant);
    } else {
      this.sheet = zombieSheetFor(this.type, String(opts.id));
    }

    const p = iso(this.x, this.y);
    this.shadow = artImage(scene, p.x, p.y + 2, 'fx_shadow').setAlpha(0.66);
    this.shadow.setScale(opts.kind === 'zombie' && this.type === 2 ? 0.8 : 0.62);
    this.sprite = scene.add.sprite(p.x, p.y, CHARACTER_ATLAS, initialFrame(this.sheet));
    this.sprite.setOrigin(0.5, 0.932);
    if (this.type === 2) this.sprite.setScale(1.12);
    this.hpBg = scene.add.rectangle(p.x, p.y - 72, 32, 4, 0x0a0c0a, 0.75).setOrigin(0.5, 0.5);
    this.hpFill = scene.add.rectangle(p.x - 15, p.y - 72, 30, 2, 0x9d3328, 0.95).setOrigin(0, 0.5);
    this.hpBg.setVisible(false);
    this.hpFill.setVisible(false);
    if (opts.kind === 'player') {
      this.label = scene.add
        .text(p.x, p.y - 82, this.name, {
          fontFamily: '"Consolas", "SFMono-Regular", monospace',
          fontSize: '10px',
          color: '#d6d0bd',
          stroke: '#070908',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1);
    }
  }

  get isDead(): boolean {
    return this.dead;
  }

  setLocal(local: boolean): void {
    this.local = local;
  }

  applyPlayer(s: PlayerSnapshot): void {
    this.tx = s.x;
    this.ty = s.y;
    this.taim = s.aim;
    this.hp = s.hp;
    this.maxHp = s.maxHp;
    this.moving = s.moving;
    this.sprinting = s.sprinting;
    if (s.actionAt && s.actionAt !== this.lastActionAt) {
      this.lastActionAt = s.actionAt;
      this.playAttack();
    }
    if (s.status === 'dead' && !this.dead) this.setDead();
    else if (s.status === 'alive' && this.dead) this.revive();
  }

  applyZombie(s: ZombieSnapshot): void {
    this.tx = s.x;
    this.ty = s.y;
    this.taim = s.aim;
    this.hp = s.hp;
    this.maxHp = s.maxHp;
    this.moving = s.moving && s.state !== 'attack';
    if (s.actionAt && s.actionAt !== this.lastActionAt) {
      this.lastActionAt = s.actionAt;
      this.playAttack();
    }
  }

  setPredicted(x: number, y: number, aim: number, moving: boolean, sprinting: boolean): void {
    this.x = x;
    this.y = y;
    this.aim = aim;
    this.tx = x;
    this.ty = y;
    this.taim = aim;
    this.moving = moving;
    this.sprinting = sprinting;
  }

  setDead(): void {
    this.dead = true;
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    this.label?.setVisible(false);
    this.hpBg.setVisible(false);
    this.hpFill.setVisible(false);
  }

  revive(): void {
    this.dead = false;
    this.sprite.setVisible(true);
    this.shadow.setVisible(true);
    this.label?.setVisible(true);
  }

  playAttack(): void {
    if (this.dead) return;
    this.attackUntil = this.scene.time.now + 330;
    const dir = screenDirectionFromAngle(this.aim);
    const key = `${this.sheet}-attack-${dir}`;
    this.sprite.play(key, true);
    this.lastAnim = key;
  }

  flashHit(): void {
    this.sprite.setTint(0xff7a63);
    this.scene.time.delayedCall(120, () => {
      if (this.sprite.active) this.sprite.clearTint();
    });
  }

  update(dt: number, now: number): void {
    if (this.dead) return;
    if (!this.local) {
      const k = 1 - Math.exp(-dt * 16);
      const dx = this.tx - this.x;
      const dy = this.ty - this.y;
      if (Math.hypot(dx, dy) > 2.2) {
        this.x = this.tx;
        this.y = this.ty;
      } else {
        this.x += dx * k;
        this.y += dy * k;
      }
      this.aim = lerpAngle(this.aim, this.taim, k);
    }

    const p = iso(this.x, this.y);
    this.sprite.setPosition(p.x, p.y);
    this.shadow.setPosition(p.x, p.y + 2);
    this.hpBg.setPosition(p.x, p.y - (this.kind === 'player' ? 72 : 64));
    this.hpFill.setPosition(p.x - 15, p.y - (this.kind === 'player' ? 72 : 64));
    this.label?.setPosition(p.x, p.y - 82);

    const depth = this.x + this.y;
    this.shadow.setDepth(depth + 0.4);
    this.sprite.setDepth(depth + 0.48);
    this.hpBg.setDepth(depth + 1.15);
    this.hpFill.setDepth(depth + 1.16);
    this.label?.setDepth(depth + 1.2);

    const showBar = this.hp < this.maxHp - 0.5;
    this.hpBg.setVisible(showBar);
    this.hpFill.setVisible(showBar);
    if (showBar) {
      const pct = Math.max(0, Math.min(1, this.hp / Math.max(1, this.maxHp)));
      this.hpFill.width = 30 * pct;
      this.hpFill.setFillStyle(this.kind === 'player' ? 0x8c9d72 : 0x9d3328, 0.95);
    }

    const dir = screenDirectionFromAngle(this.aim);
    const attacking = now < this.attackUntil;
    let key: string;
    if (attacking) {
      key = `${this.sheet}-attack-${dir}`;
    } else if (this.moving) {
      key = `${this.sheet}-walk-${dir}`;
    } else {
      key = `${this.sheet}-idle-${dir}`;
    }
    if (key !== this.lastAnim) {
      this.sprite.play(key, true);
      this.lastAnim = key;
    }
    if (this.moving && !attacking) {
      this.sprite.anims.timeScale = this.sprinting ? 1.5 : this.kind === 'zombie' ? 0.9 : 1;
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.label?.destroy();
    this.hpBg.destroy();
    this.hpFill.destroy();
  }
}

export class ItemSprite {
  readonly id: string;
  private scene: Phaser.Scene;
  private icon: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private x: number;
  private y: number;
  private phase: number;
  private key: string;

  constructor(scene: Phaser.Scene, id: string, key: string, x: number, y: number) {
    this.scene = scene;
    this.id = id;
    this.x = x;
    this.y = y;
    this.key = key;
    this.phase = (hashString(id) % 100) / 100;
    const p = iso(x, y);
    this.glow = artImage(scene, p.x, p.y, 'item_glow').setAlpha(0.5).setDepth(x + y + 0.18);
    this.glow.setScale(0.6);
    this.icon = artImage(scene, p.x, p.y - 7, `icon_${key}`).setScale(0.5).setDepth(x + y + 0.36);
    this.icon.setAlpha(0.95);
  }

  get itemKey(): string {
    return this.key;
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  update(now: number): void {
    const p = iso(this.x, this.y);
    const bob = Math.sin(now / 620 + this.phase * 6.28) * 1.4;
    this.icon.setPosition(p.x, p.y - 7 + bob);
    this.glow.setPosition(p.x, p.y);
    this.glow.setAlpha(0.35 + Math.sin(now / 700 + this.phase * 6.28) * 0.14);
    const d = this.x + this.y;
    this.icon.setDepth(d + 0.36);
    this.glow.setDepth(d + 0.18);
  }

  destroy(): void {
    this.icon.destroy();
    this.glow.destroy();
  }
}

export function weaponName(key: string | null): string {
  if (!key) return 'кулаки';
  return ITEMS[key]?.name ?? key;
}

export function zombieTypeName(type: number): string {
  return ZOMBIE_TYPES[type]?.name ?? 'заражённый';
}
