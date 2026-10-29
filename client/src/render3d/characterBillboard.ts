import * as THREE from 'three';

const COLS = 12;
const ROWS = 8;
const WALK = [1, 2, 3, 4, 5];
const ATTACK = [6, 7, 8];
const DEATH = [9, 10, 11];

export type CharacterMode = 'idle' | 'walk' | 'attack' | 'death';

export interface CharacterOptions {
  x: number;
  y: number;
  z: number;
  direction?: number;
  mode?: CharacterMode;
  scale?: number;
}

/**
 * Depth-tested billboard for the existing sprite-sheet art. This deliberately
 * keeps the current 2D animation model: frames are selected by UV offset and
 * the sprite always faces the orthographic camera.
 */
export class CharacterBillboard {
  readonly sprite: THREE.Sprite;
  readonly shadow: THREE.Mesh;
  private texture: THREE.Texture;
  private direction: number;
  private mode: CharacterMode;
  private frame = 0;
  private timer = 0;
  private dead = false;

  constructor(scene: THREE.Scene, sheet: THREE.Texture, options: CharacterOptions) {
    this.direction = options.direction ?? 2;
    this.mode = options.mode ?? 'walk';

    this.texture = sheet.clone();
    this.texture.needsUpdate = true;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.repeat.set(1 / COLS, 1 / ROWS);
    this.texture.offset.set(0, 1 - (this.direction + 1) / ROWS);

    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.08,
      depthTest: true,
      depthWrite: true,
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.center.set(0.5, 0.03);
    const scale = options.scale ?? 1;
    this.sprite.scale.set(1.15 * scale, 1.65 * scale, 1);
    this.sprite.position.set(options.x, options.y, options.z + 0.02);
    scene.add(this.sprite);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42 * scale, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(options.x, options.y, options.z + 0.012);
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);

    this.setFrame(this.mode === 'idle' ? 0 : WALK[0]);
  }

  setMode(mode: CharacterMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.timer = 0;
    this.frame = 0;
    if (mode === 'death') this.dead = false;
    this.setFrame(mode === 'idle' ? 0 : mode === 'walk' ? WALK[0] : mode === 'attack' ? ATTACK[0] : DEATH[0]);
  }

  setDirection(direction: number): void {
    this.direction = ((direction % ROWS) + ROWS) % ROWS;
    this.texture.offset.y = 1 - (this.direction + 1) / ROWS;
  }

  setVisible(visible: boolean): void {
    this.sprite.visible = visible;
    this.shadow.visible = visible;
  }

  update(dt: number): void {
    if (this.mode === 'idle' || (this.mode === 'death' && this.dead)) return;
    this.timer += dt;
    const fps = this.mode === 'walk' ? 9 : this.mode === 'attack' ? 12 : 8;
    if (this.timer < 1 / fps) return;
    this.timer = 0;
    this.frame++;
    const frames = this.mode === 'walk' ? WALK : this.mode === 'attack' ? ATTACK : DEATH;
    if (this.frame >= frames.length) {
      if (this.mode === 'death') {
        this.dead = true;
        this.frame = frames.length - 1;
      } else {
        this.frame = 0;
      }
    }
    this.setFrame(frames[this.frame]);
  }

  private setFrame(col: number): void {
    this.texture.offset.x = col / COLS;
  }

  dispose(): void {
    this.sprite.material.map?.dispose();
    this.sprite.material.dispose();
    this.sprite.removeFromParent();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.shadow.removeFromParent();
  }
}
