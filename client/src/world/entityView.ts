import Phaser from 'phaser';
import { ITEMS, PX_PER_METER, ZOMBIE_TYPES, type PlayerSnapshot, type ZombieSnapshot } from '@ashfall/shared';
import { screenDirectionFromAngle, directionFromDelta, iso } from '../game/iso.js';
import { CHARACTER_ATLAS, initialFrame, playerSheetFor, zombieSheetFor } from '../art/characters.js';
import { hashString } from '../art/util.js';
import { artImage } from '../art/textures.js';

const FLOOR_BAND = 10_000;

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
  weaponSprite?: Phaser.GameObjects.Image;
  readonly label?: Phaser.GameObjects.Text;
  readonly hpBg: Phaser.GameObjects.Rectangle;
  readonly hpFill: Phaser.GameObjects.Rectangle;
  readonly type: number;
  readonly name: string;
  private scene: Phaser.Scene;
  private sheet: string;
  private weaponKey: string | null = null;
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
  private facingDir = 2;
  private floor = 0;
  private elevationM = 0;
  private moveDir: number | null = null;
  private outline?: Phaser.GameObjects.Sprite;
  private outlineVisible = false;

  constructor(
    scene: Phaser.Scene,
    opts: {
      id: number | string;
      kind: 'player' | 'zombie';
      x: number;
      y: number;
      floor?: number;
      elevationM?: number;
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
    this.floor = opts.floor ?? 0;
    this.elevationM = opts.elevationM ?? 0;
    this.tx = opts.x;
    this.ty = opts.y;
    this.aim = opts.aim;
    this.taim = opts.aim;
    this.hp = opts.hp;
    this.maxHp = opts.maxHp;
    this.facingDir = screenDirectionFromAngle(opts.aim);

    if (opts.kind === 'player') {
      const variant = hashString(String(opts.id)) % 4;
      this.sheet = playerSheetFor(variant);
    } else {
      this.sheet = zombieSheetFor(this.type, String(opts.id));
    }

    const p = iso(this.x, this.y);
    this.shadow = artImage(scene, p.x, p.y + 2, 'fx_shadow').setAlpha(0.66);
    this.shadow.setScale(opts.kind === 'zombie' && this.type === 2 ? 0.8 : 0.62);
    this.sprite = scene.add.sprite(p.x, p.y, CHARACTER_ATLAS, initialFrame(this.sheet, this.facingDir));
    this.sprite.setOrigin(0.5, 0.932);
    if (this.type === 2) this.sprite.setScale(1.12);
    this.hpBg = scene.add.rectangle(p.x, p.y - 72, 32, 4, 0x0a0c0a, 0.75).setOrigin(0.5, 0.5);
    this.hpFill = scene.add.rectangle(p.x - 15, p.y - 72, 30, 2, 0x9d3328, 0.95).setOrigin(0, 0.5);
    this.hpBg.setVisible(false);
    this.hpFill.setVisible(false);

    if (opts.kind === 'player') {
      if (scene.textures.exists('weapon_bat')) {
        this.weaponSprite = scene.add.image(p.x, p.y, 'weapon_bat').setOrigin(0.2, 0.5).setVisible(false);
      }
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

  setFloor(floor: number, elevationM?: number): void {
    this.floor = floor;
    if (elevationM !== undefined) this.elevationM = elevationM;
  }

  setElevation(elevationM: number): void {
    this.elevationM = elevationM;
  }

  setLocal(local: boolean): void {
    this.local = local;
    if (local && this.kind === 'player' && !this.outline) {
      // A high-depth copy of the character used as a through-wall outline.
      // It is only shown while the player is hidden behind a building.
      this.outline = this.scene.add.sprite(
        this.sprite.x,
        this.sprite.y,
        CHARACTER_ATLAS,
        this.sprite.frame.name,
      ).setOrigin(0.5, 0.932).setDepth(85_000).setVisible(false);
      if (this.outline.preFX) {
        this.outline.preFX.addGlow(0xffd27a, 5, 0, true, 0.1);
      } else {
        this.outline.setTint(0xffd27a).setAlpha(0.4);
      }
    }
  }

  setOutlineVisible(visible: boolean): void {
    this.outlineVisible = visible;
  }

  setWeapon(key: string | null): void {
    this.weaponKey = key;
    if (this.kind !== 'player') return;
    if (!this.weaponSprite && this.scene && key && this.scene.textures.exists(`weapon_${key}`)) {
      const p = iso(this.x, this.y);
      const floorY = p.y - this.elevationM * PX_PER_METER;
      this.weaponSprite = this.scene.add.image(p.x, floorY, `weapon_${key}`).setOrigin(0.2, 0.5).setVisible(!this.dead);
    }
    if (this.weaponSprite) {
      if (key && this.scene.textures.exists(`weapon_${key}`)) {
        this.weaponSprite.setTexture(`weapon_${key}`);
        this.weaponSprite.setVisible(!this.dead);
      } else {
        this.weaponSprite.setVisible(false);
      }
    }
  }

  applyPlayer(s: PlayerSnapshot): void {
    const dx = s.x - this.tx;
    const dy = s.y - this.ty;
    if (s.moving && Math.hypot(dx, dy) > 0.005) {
      this.moveDir = directionFromDelta(dx, dy);
      this.facingDir = this.moveDir;
    } else if (!s.moving) {
      this.moveDir = null;
    }
    this.tx = s.x;
    this.ty = s.y;
    this.taim = s.aim;
    this.hp = s.hp;
    this.maxHp = s.maxHp;
    this.moving = s.moving;
    this.sprinting = s.sprinting;
    this.setWeapon(s.weapon);
    if (s.actionAt && s.actionAt !== this.lastActionAt) {
      this.lastActionAt = s.actionAt;
      this.playAttack();
    }
    if (s.status === 'dead' && !this.dead) this.setDead();
    else if (s.status === 'alive' && this.dead) this.revive();
  }

  applyZombie(s: ZombieSnapshot): void {
    const dx = s.x - this.tx;
    const dy = s.y - this.ty;
    if (s.moving && Math.hypot(dx, dy) > 0.005) {
      this.moveDir = directionFromDelta(dx, dy);
      this.facingDir = this.moveDir;
    } else if (s.state === 'attack' || s.state === 'chase') {
      this.facingDir = screenDirectionFromAngle(s.aim);
      this.moveDir = null;
    } else {
      this.moveDir = null;
      this.facingDir = screenDirectionFromAngle(s.aim);
    }
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

  setPredicted(x: number, y: number, aim: number, moving: boolean, sprinting: boolean, mx = 0, my = 0): void {
    this.x = x;
    this.y = y;
    this.aim = aim;
    this.tx = x;
    this.ty = y;
    this.taim = aim;
    this.moving = moving;
    this.sprinting = sprinting;
    if (moving && (mx !== 0 || my !== 0)) {
      this.moveDir = directionFromDelta(mx, my);
      this.facingDir = this.moveDir;
    } else {
      this.moveDir = null;
      this.facingDir = screenDirectionFromAngle(aim);
    }
  }

  private dying = false;

  playDeath(onComplete?: () => void): void {
    if (this.dead || this.dying) {
      onComplete?.();
      return;
    }
    this.dying = true;
    this.hpBg.setVisible(false);
    this.hpFill.setVisible(false);
    this.label?.setVisible(false);
    this.weaponSprite?.setVisible(false);

    const dir = this.facingDir;
    const key = `${this.sheet}-death-${dir}`;
    this.sprite.play(key, true);
    this.lastAnim = key;

    let completed = false;
    const done = () => {
      if (completed) return;
      completed = true;
      this.dying = false;
      this.setDead();
      onComplete?.();
    };

    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, done);
    this.scene.time.delayedCall(560, done);
  }

  setDead(): void {
    this.dead = true;
    this.dying = false;
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    this.weaponSprite?.setVisible(false);
    this.label?.setVisible(false);
    this.hpBg.setVisible(false);
    this.hpFill.setVisible(false);
    this.outline?.setVisible(false);
  }

  revive(): void {
    this.dead = false;
    this.dying = false;
    this.sprite.setVisible(true);
    this.shadow.setVisible(true);
    this.label?.setVisible(true);
    if (this.weaponKey && this.weaponSprite) {
      this.weaponSprite.setVisible(true);
    }
  }

  playAttack(): void {
    if (this.dead) return;
    this.attackUntil = this.scene.time.now + 330;
    const dir = screenDirectionFromAngle(this.aim);
    this.facingDir = dir;
    const key = `${this.sheet}-attack-${dir}`;
    this.sprite.play(key, true);
    this.lastAnim = key;
  }

  flashHit(): void {
    this.sprite.setTint(0xff7a63);
    const baseScale = this.type === 2 ? 1.12 : 1.0;
    this.sprite.setScale(baseScale * 0.94, baseScale * 1.06);
    this.scene.time.delayedCall(110, () => {
      if (this.sprite.active) {
        this.sprite.clearTint();
        this.sprite.setScale(baseScale, baseScale);
      }
    });
  }

  update(dt: number, now: number): void {
    if (this.dead || this.dying) return;
    if (!this.local) {
      const k = 1 - Math.exp(-dt * 20);
      const dx = this.tx - this.x;
      const dy = this.ty - this.y;
      if (Math.hypot(dx, dy) > 2.5) {
        this.x = this.tx;
        this.y = this.ty;
      } else {
        this.x += dx * k;
        this.y += dy * k;
      }
      this.aim = lerpAngle(this.aim, this.taim, k);
    }

    const p = iso(this.x, this.y);
    const floorY = p.y - this.elevationM * PX_PER_METER;
    this.sprite.setPosition(p.x, floorY);
    this.shadow.setPosition(p.x, floorY + 2);
    this.hpBg.setPosition(p.x, floorY - (this.kind === 'player' ? 72 : 64));
    this.hpFill.setPosition(p.x - 15, floorY - (this.kind === 'player' ? 72 : 64));
    this.label?.setPosition(p.x, floorY - 82);

    const depth = this.floor * FLOOR_BAND + this.x + this.y;
    this.shadow.setDepth(depth + 0.4);
    this.sprite.setDepth(depth + 0.48);
    this.hpBg.setDepth(depth + 1.15);
    this.hpFill.setDepth(depth + 1.16);
    this.label?.setDepth(depth + 1.2);

    if (this.outline) {
      const sprite = this.sprite;
      this.outline.setTexture(sprite.texture.key, sprite.frame.name);
      this.outline.setPosition(sprite.x, sprite.y);
      this.outline.setScale(sprite.scaleX, sprite.scaleY);
      this.outline.setFlipX(sprite.flipX);
      this.outline.setFlipY(sprite.flipY);
      this.outline.setVisible(this.outlineVisible && sprite.visible && !this.dead);
    }

    const showBar = this.hp < this.maxHp - 0.5;
    this.hpBg.setVisible(showBar);
    this.hpFill.setVisible(showBar);
    if (showBar) {
      const pct = Math.max(0, Math.min(1, this.hp / Math.max(1, this.maxHp)));
      this.hpFill.width = 30 * pct;
      this.hpFill.setFillStyle(this.kind === 'player' ? 0x8c9d72 : 0x9d3328, 0.95);
    }

    const attacking = now < this.attackUntil;
    let dir: number;
    if (attacking) {
      dir = screenDirectionFromAngle(this.aim);
      this.facingDir = dir;
    } else if (this.moving && this.moveDir !== null) {
      dir = this.moveDir;
      this.facingDir = dir;
    } else {
      dir = screenDirectionFromAngle(this.aim);
      this.facingDir = dir;
    }

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
      this.sprite.anims.timeScale = this.sprinting ? 1.5 : this.kind === 'zombie' ? 0.95 : 1;
    }

    if (this.weaponSprite && this.weaponKey) {
      if (this.dead || this.dying) {
        this.weaponSprite.setVisible(false);
      } else {
        this.weaponSprite.setVisible(true);
        const HAND_OFFSETS: Array<{ x: number; y: number; behind: boolean; angle: number }> = [
          { x: 9, y: -28, behind: false, angle: 15 },
          { x: 10, y: -26, behind: false, angle: 30 },
          { x: 7, y: -24, behind: false, angle: 45 },
          { x: -7, y: -24, behind: false, angle: -45 },
          { x: -9, y: -26, behind: false, angle: -60 },
          { x: -9, y: -28, behind: true, angle: -75 },
          { x: -6, y: -30, behind: true, angle: -90 },
          { x: 7, y: -30, behind: true, angle: 0 },
        ];

        const h = HAND_OFFSETS[dir] ?? HAND_OFFSETS[2];
        let wx = p.x + h.x;
        let wy = floorY + h.y;
        let wAngle = h.angle;
        let wDepth = depth + (h.behind ? 0.46 : 0.52);

        if (attacking) {
          const progress = Math.max(0, Math.min(1, 1 - (this.attackUntil - now) / 330));
          const screenAim = Math.atan2(
            (Math.cos(this.aim) + Math.sin(this.aim)) * 16,
            (Math.cos(this.aim) - Math.sin(this.aim)) * 32,
          );
          const screenDeg = Phaser.Math.RadToDeg(screenAim);

          if (this.weaponKey === 'pistol') {
            // Gun recoil: sharp kick up and back in first 35%, then smooth recovery
            const kick = progress < 0.35
              ? (progress / 0.35)
              : Math.max(0, 1 - (progress - 0.35) / 0.65);
            wAngle = screenDeg - kick * 28;
            const reach = 14 - kick * 6;
            wx = p.x + Math.cos(screenAim) * reach;
            wy = floorY - 28 + Math.sin(screenAim) * reach - kick * 4;
            wDepth = depth + 0.54;
          } else {
            // Melee swing: sweeping arc across the target
            const swingArc = (progress - 0.5) * 85;
            wAngle = screenDeg + swingArc;
            const reach = 12 + Math.sin(progress * Math.PI) * 10;
            wx = p.x + Math.cos(screenAim) * reach;
            wy = floorY - 28 + Math.sin(screenAim) * reach;
            wDepth = depth + 0.54;
          }
        }

        this.weaponSprite.setPosition(wx, wy);
        this.weaponSprite.setAngle(wAngle);
        this.weaponSprite.setDepth(wDepth);
      }
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.weaponSprite?.destroy();
    this.label?.destroy();
    this.hpBg.destroy();
    this.hpFill.destroy();
    this.outline?.destroy();
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
  private floor = 0;

  constructor(scene: Phaser.Scene, id: string, key: string, x: number, y: number, floor = 0) {
    this.scene = scene;
    this.id = id;
    this.x = x;
    this.y = y;
    this.key = key;
    this.floor = floor;
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

  setFloor(floor: number): void {
    this.floor = floor;
  }

  setVisible(visible: boolean): void {
    this.icon.setVisible(visible);
    this.glow.setVisible(visible);
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
