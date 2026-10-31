import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterStateName } from './characterStateMachine.js';

export interface InstantiatedCharacter {
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Map<CharacterStateName, THREE.AnimationClip>;
  handSlot: THREE.Object3D | null;
  baseScale: number;
  materials: THREE.Material[];
}

function sanitizeClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const cloned = clip.clone();
  for (const track of cloned.tracks) {
    const isRoot = track.name === 'root.position' || track.name.endsWith('/root.position') || track.name.endsWith('.root.position');
    const isHips = track.name === 'hips.position' || track.name.endsWith('/hips.position') || track.name.endsWith('.hips.position');

    if (isRoot) {
      const values = track.values;
      for (let i = 0; i < values.length; i += 3) {
        values[i] = 0;
        values[i + 1] = 0;
        values[i + 2] = 0;
      }
    } else if (isHips) {
      const values = track.values;
      for (let i = 0; i < values.length; i += 3) {
        values[i] = 0;
        // Keep vertical bounce (Y)
        values[i + 2] = 0;
      }
    }
  }
  return cloned;
}

function cloneZombieMaterial(orig: THREE.Material, tintHex: number): THREE.Material {
  const cloned = orig.clone();
  if ('color' in cloned && cloned.color instanceof THREE.Color) {
    cloned.color.setHex(tintHex);
  }
  if ('roughness' in cloned && typeof cloned.roughness === 'number') {
    cloned.roughness = 0.88;
  }
  return cloned;
}

export class CharacterModelLoader {
  private baseModel: THREE.Group | null = null;
  private clips = new Map<CharacterStateName, THREE.AnimationClip>();
  private loadPromise: Promise<void> | null = null;
  private isLoaded = false;

  get ready(): boolean {
    return this.isLoaded;
  }

  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const loader = new GLTFLoader();

      const [charGltf, genGltf, moveGltf, combatGltf] = await Promise.all([
        loader.loadAsync('/assets/characters/kaykit/character.glb'),
        loader.loadAsync('/assets/characters/kaykit/animations_general.glb'),
        loader.loadAsync('/assets/characters/kaykit/animations_movement.glb'),
        loader.loadAsync('/assets/characters/kaykit/animations_combat.glb'),
      ]);

      this.baseModel = charGltf.scene;

      const clipMap: Record<CharacterStateName, { gltf: typeof genGltf; name: string }> = {
        idle: { gltf: genGltf, name: 'Idle_A' },
        hit: { gltf: genGltf, name: 'Hit_A' },
        death: { gltf: genGltf, name: 'Death_A' },
        walk: { gltf: moveGltf, name: 'Walking_A' },
        run: { gltf: moveGltf, name: 'Running_A' },
        attack: { gltf: combatGltf, name: 'Melee_1H_Attack_Slice_Horizontal' },
      };

      for (const [stateName, spec] of Object.entries(clipMap) as Array<[CharacterStateName, { gltf: typeof genGltf; name: string }]>) {
        const found = spec.gltf.animations.find((a) => a.name === spec.name) ?? spec.gltf.animations[0];
        if (found) {
          const sanitized = sanitizeClip(found);
          sanitized.name = stateName;
          this.clips.set(stateName, sanitized);
        }
      }

      this.isLoaded = true;
    })();

    return this.loadPromise;
  }

  instantiate(kind: 'player' | 'zombie', zombieType = 0): InstantiatedCharacter | null {
    if (!this.baseModel || !this.isLoaded) return null;

    const cloned = SkeletonUtils.clone(this.baseModel) as THREE.Group;
    cloned.matrixAutoUpdate = true;

    // Humanoid scale: 1 tile = 1m. Rogue model height is ~2.18m.
    // 0.825 gives ~1.8m height, fitting cleanly through 2m door openings.
    const isBrute = kind === 'zombie' && zombieType === 2;
    const baseScale = isBrute ? 0.825 * 1.12 : 0.825;

    const materials: THREE.Material[] = [];

    if (kind === 'zombie') {
      const zombieTints: Record<number, number> = {
        0: 0x6e8260, // Regular zombie: sickly muted olive/green
        1: 0x7d6a52, // Fast runner: muddy brownish tone
        2: 0x556350, // Brute: heavy dark decayed greenish-grey
      };
      const tint = zombieTints[zombieType] ?? 0x6e8260;

      cloned.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => {
              const mat = cloneZombieMaterial(m, tint);
              materials.push(mat);
              return mat;
            });
          } else if (mesh.material) {
            mesh.material = cloneZombieMaterial(mesh.material, tint);
            materials.push(mesh.material);
          }
        }
      });
    } else {
      // Player: clone materials to allow independent flash/tint without affecting other instances
      cloned.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => {
              const mat = m.clone();
              materials.push(mat);
              return mat;
            });
          } else if (mesh.material) {
            mesh.material = mesh.material.clone();
            materials.push(mesh.material);
          }
        }
      });
    }

    // Locate weapon socket bone in the humanoid rig
    // Note: GLTFLoader normalizes node names by removing dots (handslot.r -> handslotr)
    const handSlot =
      (cloned.getObjectByName('handslotr') as THREE.Object3D | undefined) ??
      (cloned.getObjectByName('handslot.r') as THREE.Object3D | undefined) ??
      (cloned.getObjectByName('handr') as THREE.Object3D | undefined) ??
      null;

    const mixer = new THREE.AnimationMixer(cloned);

    return {
      model: cloned,
      mixer,
      clips: this.clips,
      handSlot,
      baseScale,
      materials,
    };
  }
}
