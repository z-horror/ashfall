import * as THREE from 'three';
import { TILE_SIZE_M } from '@ashfall/shared';
import type { CharacterView } from '../world/entityView.js';
import { CharacterStateMachine } from './characterStateMachine.js';
import type { InstantiatedCharacter } from './characterModelLoader.js';
import { createWeaponMesh } from './weaponMeshBuilder.js';

const TILE = TILE_SIZE_M;

export class Character3D {
  readonly rootGroup = new THREE.Group();
  readonly shadowMesh: THREE.Mesh;
  private readonly modelGroup: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly stateMachine: CharacterStateMachine;
  private readonly handSlot: THREE.Object3D | null = null;
  private readonly materials: THREE.Material[];
  private readonly defaultColors: number[] = [];
  private currentWeaponKey: string | null = null;
  private currentWeaponMesh: THREE.Object3D | null = null;
  private readonly baseScale: number;
  private isHitActive = false;

  constructor(instance: InstantiatedCharacter, shadowTexture: THREE.Texture) {
    this.modelGroup = instance.model;
    this.mixer = instance.mixer;
    this.handSlot = instance.handSlot;
    this.baseScale = instance.baseScale;
    this.materials = instance.materials;
    this.stateMachine = new CharacterStateMachine(this.mixer, instance.clips);

    for (const mat of this.materials) {
      if ('color' in mat && mat.color instanceof THREE.Color) {
        this.defaultColors.push(mat.color.getHex());
      } else {
        this.defaultColors.push(0xffffff);
      }
    }

    // Transform from GLTF Y-up to Ashfall World Z-up
    this.modelGroup.rotation.x = Math.PI / 2;
    this.modelGroup.scale.set(this.baseScale, this.baseScale, this.baseScale);
    this.rootGroup.add(this.modelGroup);

    // Contact shadow mesh at ground level
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.renderOrder = 1;
  }

  update(dt: number, view: CharacterView): void {
    // 1. World position: 1 tile = 1 meter
    const feetX = view.x * TILE;
    const feetY = view.y * TILE;
    const feetZ = view.elevationMeters;

    this.rootGroup.position.set(feetX, feetY, feetZ);

    // 2. Continuous rotation according to aim without discrete 8-direction snapping
    // At aim = -PI/2 (North), character forward aligns with -Y
    this.rootGroup.rotation.z = view.currentAim + Math.PI / 2;

    // 3. Contact shadow directly under character feet
    const shadowScale = this.baseScale * 0.78;
    this.shadowMesh.scale.set(shadowScale, shadowScale, 1);
    this.shadowMesh.position.set(feetX, feetY, Math.max(0.01, feetZ + 0.012));

    // 4. Weapon socket synchronization
    const weaponKey = view.currentWeapon;
    if (weaponKey !== this.currentWeaponKey) {
      this.updateWeapon(weaponKey);
    }
    if (this.currentWeaponMesh) {
      this.currentWeaponMesh.visible = !view.isDead;
    }

    // 5. Hit flash effect
    if (view.isHit && !this.isHitActive) {
      this.isHitActive = true;
      this.applyHitFlash(true);
    } else if (!view.isHit && this.isHitActive) {
      this.isHitActive = false;
      this.applyHitFlash(false);
    }

    // 6. Animation state machine & mixer update
    this.stateMachine.update({
      isDead: view.isDead,
      isDying: view.isDying,
      isHit: view.isHit,
      isAttacking: view.isAttacking,
      isMoving: view.isMoving,
      isSprinting: view.isSprinting,
    });

    this.mixer.update(dt);

    // 7. Hide character model completely when dead after animation
    if (view.isDead) {
      this.rootGroup.visible = false;
      this.shadowMesh.visible = false;
    } else {
      this.rootGroup.visible = true;
      this.shadowMesh.visible = true;
    }
  }

  private updateWeapon(key: string | null): void {
    this.currentWeaponKey = key;
    if (this.currentWeaponMesh && this.handSlot) {
      this.handSlot.remove(this.currentWeaponMesh);
      this.currentWeaponMesh = null;
    }

    if (key && this.handSlot) {
      const mesh = createWeaponMesh(key);
      if (mesh) {
        this.currentWeaponMesh = mesh;
        this.handSlot.add(mesh);
      }
    }
  }

  private applyHitFlash(active: boolean): void {
    this.materials.forEach((mat, idx) => {
      if ('color' in mat && mat.color instanceof THREE.Color) {
        if (active) {
          mat.color.setHex(0xff7a63);
        } else {
          mat.color.setHex(this.defaultColors[idx] ?? 0xffffff);
        }
      }
    });
  }

  destroy(scene3d: THREE.Scene): void {
    scene3d.remove(this.rootGroup);
    scene3d.remove(this.shadowMesh);

    this.mixer.stopAllAction();

    this.shadowMesh.geometry.dispose();
    if (Array.isArray(this.shadowMesh.material)) {
      this.shadowMesh.material.forEach((m) => m.dispose());
    } else {
      this.shadowMesh.material.dispose();
    }

    for (const mat of this.materials) {
      mat.dispose();
    }
  }
}
