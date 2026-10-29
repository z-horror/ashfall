import * as THREE from 'three';
import { TILE_SIZE_M } from '@ashfall/shared';
import type { CharacterView } from '../world/entityView.js';
import { CharacterModelLoader, type InstantiatedCharacter } from './characterModelLoader.js';
import { CharacterStateMachine } from './characterStateMachine.js';
import { buildWeaponMesh } from './weaponMeshBuilder.js';
import { makeContactShadowTexture } from './assets3d.js';

const TILE = TILE_SIZE_M;

export class Character3D {
  readonly id: string;
  readonly kind: 'player' | 'zombie';
  readonly rootGroup: THREE.Group;
  private model: InstantiatedCharacter;
  private stateMachine: CharacterStateMachine;
  private shadow: THREE.Mesh;
  private weapons = new Map<string, THREE.Group>();
  private activeWeaponKey: string | null = null;
  private currentAimAngle = 0;
  private disposed = false;

  constructor(scene: THREE.Scene, id: string, kind: 'player' | 'zombie', variant: number) {
    this.id = id;
    this.kind = kind;

    const loader = CharacterModelLoader.getInstance();
    this.model = loader.instantiate(kind, variant);
    this.rootGroup = this.model.rootGroup;
    scene.add(this.rootGroup);

    this.stateMachine = new CharacterStateMachine(this.model.mixer, this.model.clips, kind === 'zombie');

    // Create contact shadow plane directly under feet
    const shadowGeom = new THREE.PlaneGeometry(0.85, 0.85);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: makeContactShadowTexture(),
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.shadow = new THREE.Mesh(shadowGeom, shadowMat);
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);

    // Socket weapons onto right hand bone (scaled by 100 to counteract Armature 0.01 scale)
    if (this.model.rightHandSocket && kind === 'player') {
      const weaponTypes = ['bat', 'spiked_bat', 'pistol', 'knife', 'axe', 'crowbar'];
      for (const wType of weaponTypes) {
        const mesh = buildWeaponMesh(wType);
        mesh.scale.set(100, 100, 100);
        mesh.visible = wType === 'bat'; // default visible weapon
        this.model.rightHandSocket.add(mesh);
        this.weapons.set(wType, mesh);
      }
      this.activeWeaponKey = 'bat';
    }
  }

  update(dt: number, now: number, view: CharacterView): void {
    if (this.disposed) return;

    // 1. Advance animation mixer
    this.model.mixer.update(dt);

    // 2. Position root group and contact shadow in world meters
    const xM = view.x * TILE;
    const yM = view.y * TILE;
    const zM = view.elevationMeters;

    this.rootGroup.position.set(xM, yM, zM);
    this.shadow.position.set(xM, yM, Math.max(0.01, zM + 0.012));

    // 3. Aim rotation around Z axis
    // In Ashfall isometric coordinate space:
    // With wrapper.rotation.x = PI/2, aimAngle=0 (+X) aligns with rotation.z = PI/2
    const targetAim = view.aimAngle;
    let diff = targetAim - this.currentAimAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const rotSpeed = 18; // snappy rotational tracking
    this.currentAimAngle += diff * Math.min(1, dt * rotSpeed);
    this.rootGroup.rotation.z = this.currentAimAngle + Math.PI / 2;

    // 4. Weapon visibility
    const rawWeapon = view.currentWeapon;
    const weaponKey = rawWeapon ? rawWeapon.replace(/^weapon_/, '') : 'bat';
    if (this.activeWeaponKey !== weaponKey) {
      this.activeWeaponKey = weaponKey;
      for (const [key, mesh] of this.weapons) {
        mesh.visible = key === weaponKey;
      }
    }

    // 5. Update state machine
    this.stateMachine.update(now, {
      isDead: view.isDead,
      isDying: view.isDying,
      isHit: view.isHit,
      isAttacking: view.isAttacking,
      isMoving: view.isMoving,
      isSprinting: view.isSprinting,
    });

    // 6. Alpha and visibility (for cutaway opacity when under roofs/walls)
    const alpha = view.spriteAlpha;
    const isVisible = alpha > 0.05;
    this.rootGroup.visible = isVisible;
    this.shadow.visible = isVisible && !view.isDead;

    for (const mesh of this.model.skinnedMeshes) {
      if (mesh.material && !Array.isArray(mesh.material)) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.transparent = alpha < 0.99;
        mat.opacity = alpha;
      }
    }
  }

  destroy(scene: THREE.Scene): void {
    if (this.disposed) return;
    this.disposed = true;

    scene.remove(this.rootGroup);
    scene.remove(this.shadow);

    this.shadow.geometry.dispose();
    if (Array.isArray(this.shadow.material)) {
      this.shadow.material.forEach((m) => m.dispose());
    } else {
      this.shadow.material.dispose();
    }

    this.model.mixer.stopAllAction();
    this.model.mixer.uncacheRoot(this.model.modelScene);

    // Dispose cloned materials on skinned meshes
    for (const mesh of this.model.skinnedMeshes) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else if (mesh.material) {
        mesh.material.dispose();
      }
    }
  }
}
