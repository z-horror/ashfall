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
  private readonly weaponMeshes: Map<string, THREE.Object3D>;
  private customWeaponMesh: THREE.Object3D | null = null;
  private currentWeaponKey: string | null = null;
  private readonly baseScale: number;
  private isHitActive = false;

  constructor(instance: InstantiatedCharacter, shadowTexture: THREE.Texture) {
    this.modelGroup = instance.model;
    this.mixer = instance.mixer;
    this.handSlot = instance.handSlot;
    this.baseScale = instance.baseScale;
    this.materials = instance.materials;
    this.weaponMeshes = instance.weaponMeshes;
    this.stateMachine = new CharacterStateMachine(this.mixer, instance.clips);

    for (const mat of this.materials) {
      if ('color' in mat && mat.color instanceof THREE.Color) {
        this.defaultColors.push(mat.color.getHex());
      } else {
        this.defaultColors.push(0xffffff);
      }
    }

    // Transform from GLTF coordinates (Y-up, -Z forward) to Ashfall World (Z-up, -Y North, +X East)
    this.modelGroup.rotation.set(Math.PI / 2, Math.PI, 0);
    this.modelGroup.scale.set(this.baseScale, this.baseScale, this.baseScale);
    this.rootGroup.add(this.modelGroup);

    // Contact shadow mesh at ground level without gap or z-fighting
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

    // 2. Orientation & No Moonwalk:
    // When moving and not attacking, face the movement direction.
    // When attacking or stationary, face aim direction.
    if (view.isAttacking) {
      this.rootGroup.rotation.z = view.currentAim + Math.PI / 2;
    } else if (view.isMoving && view.movementAngle !== null) {
      this.rootGroup.rotation.z = view.movementAngle + Math.PI / 2;
    } else {
      this.rootGroup.rotation.z = view.currentAim + Math.PI / 2;
    }

    // 3. Contact shadow directly under character feet (snug to floor)
    const shadowScale = this.baseScale * 0.76;
    this.shadowMesh.scale.set(shadowScale, shadowScale, 1);
    this.shadowMesh.position.set(feetX, feetY, Math.max(0.005, feetZ + 0.008));

    // 4. Weapon synchronization
    const weaponKey = view.currentWeapon;
    if (weaponKey !== this.currentWeaponKey) {
      this.updateWeapon(weaponKey);
    }
    const showWeapons = !view.isDead && !view.isDying;
    if (!showWeapons) {
      for (const mesh of this.weaponMeshes.values()) {
        mesh.visible = false;
      }
      if (this.customWeaponMesh) {
        this.customWeaponMesh.visible = false;
      }
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
    this.stateMachine.update(dt, {
      isDead: view.isDead,
      isDying: view.isDying,
      isHit: view.isHit,
      isAttacking: view.isAttacking,
      isMoving: view.isMoving,
      isSprinting: view.isSprinting,
      weapon: weaponKey,
    });

    this.mixer.update(dt);

    // 7. Hide character model completely when dead
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

    // Hide all built-in weapon meshes
    for (const mesh of this.weaponMeshes.values()) {
      mesh.visible = false;
    }

    // Remove any custom attached weapon mesh from handSlot
    if (this.customWeaponMesh && this.handSlot) {
      this.handSlot.remove(this.customWeaponMesh);
      this.customWeaponMesh = null;
    }

    if (!key) return;

    // Check for built-in weapon mesh in Quaternius rig
    let builtInName: string | null = null;
    if (key === 'pistol') {
      builtInName = 'Pistol';
    } else if (key === 'knife') {
      builtInName = 'Knife';
    } else if (key === 'axe') {
      builtInName = 'Axe';
    } else if (key === 'bat') {
      builtInName = 'WoodenBat_Saw';
    } else if (key === 'spiked_bat') {
      builtInName = 'WoodenBat_Barbed';
    }

    if (builtInName) {
      const mesh = this.weaponMeshes.get(builtInName);
      if (mesh) {
        mesh.visible = true;
        if (builtInName === 'Pistol') {
          // Ensure pistol is nicely scaled, unobstructed and prominent in hand
          mesh.scale.set(1.18, 1.18, 1.18);
        }
        return;
      }
    }

    // Fallback or custom weapon mesh (e.g. crowbar)
    if (this.handSlot) {
      const mesh = createWeaponMesh(key);
      if (mesh) {
        this.customWeaponMesh = mesh;
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
