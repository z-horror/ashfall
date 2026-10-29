import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface CharacterClips {
  idle: THREE.AnimationClip;
  walk: THREE.AnimationClip;
  run: THREE.AnimationClip;
  attack: THREE.AnimationClip;
  hit: THREE.AnimationClip;
  death: THREE.AnimationClip;
  zombieAttack: THREE.AnimationClip;
  zombieDeath: THREE.AnimationClip;
}

export interface InstantiatedCharacter {
  rootGroup: THREE.Group;
  modelScene: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  rightHandSocket: THREE.Object3D | null;
  skinnedMeshes: THREE.SkinnedMesh[];
  clips: CharacterClips;
}

/**
 * Normalizes external animation clips to match the Mixamo Armature coordinate space:
 * 1. Scales position tracks from meters (< 10) to armature units (* 100)
 * 2. Locks horizontal drift on Hips so the animation stays strictly in-place
 */
function normalizeExternalClip(clip: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const cloned = clip.clone();
  cloned.name = name;
  for (const track of cloned.tracks) {
    if (track.name.endsWith('.position')) {
      const isMeters = Math.abs(track.values[1]) < 10;
      if (isMeters) {
        for (let i = 0; i < track.values.length; i++) {
          track.values[i] *= 100;
        }
      }
      if (track.name.includes('Hips')) {
        const initX = track.values[0];
        const initZ = track.values[2];
        for (let i = 0; i < track.values.length; i += 3) {
          track.values[i + 0] = initX;
          track.values[i + 2] = initZ;
        }
      }
    }
  }
  return cloned;
}

const PLAYER_SURVIVOR_PALETTES = [
  // 0: Khaki canvas field jacket + dark tactical harness & combat boots
  { surface: 0xc4af88, joints: 0x24282e, roughness: 0.68, metalness: 0.04 },
  // 1: Terracotta rust bomber jacket + charcoal gear
  { surface: 0xba5236, joints: 0x1f2124, roughness: 0.70, metalness: 0.04 },
  // 2: Sage military fatigue coat + tan utility webbing
  { surface: 0x829472, joints: 0x342e24, roughness: 0.72, metalness: 0.04 },
  // 3: Weathered rugged denim + warm brown leather trim
  { surface: 0x5a7698, joints: 0x6e4e30, roughness: 0.74, metalness: 0.06 },
];

const ZOMBIE_PALETTES = [
  // 0: Common walker - pale sickly rotting lime flesh + shredded dark grime rags
  { surface: 0x8fa878, joints: 0x2e3528, roughness: 0.92, metalness: 0.02 },
  // 1: Ashen infected - pale bluish-grey decaying skin + dried coagulated blood rags
  { surface: 0x869490, joints: 0x442622, roughness: 0.90, metalness: 0.02 },
  // 2: Heavy brute - dark peat necrotic hide + blackened rusted iron scrap
  { surface: 0x5c6a50, joints: 0x222422, roughness: 0.85, metalness: 0.12 },
];

export class CharacterModelLoader {
  private static instance: CharacterModelLoader | null = null;
  private baseScene: THREE.Group | null = null;
  private clips: CharacterClips | null = null;
  private loadPromise: Promise<void> | null = null;

  static getInstance(): CharacterModelLoader {
    if (!CharacterModelLoader.instance) {
      CharacterModelLoader.instance = new CharacterModelLoader();
    }
    return CharacterModelLoader.instance;
  }

  get isReady(): boolean {
    return this.baseScene !== null && this.clips !== null;
  }

  async load(): Promise<void> {
    if (this.isReady) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const loader = new GLTFLoader();
      const basePath = '/assets/characters/model3d';

      // Load base model (which includes native high-fidelity 201-track idle, walk, and run)
      // and external combat animations
      const [baseGltf, attackGltf, hitGltf, deathGltf, zAttackGltf, zDeathGltf] = await Promise.all([
        loader.loadAsync(`${basePath}/xbot.glb`),
        loader.loadAsync(`${basePath}/attack_slash.glb`),
        loader.loadAsync(`${basePath}/hit.glb`),
        loader.loadAsync(`${basePath}/death.glb`),
        loader.loadAsync(`${basePath}/zombie_attack.glb`),
        loader.loadAsync(`${basePath}/zombie_death.glb`),
      ]);

      this.baseScene = baseGltf.scene;

      // Extract built-in animations with complete 201-track skeletal fidelity
      const nativeIdle = baseGltf.animations.find((a) => a.name === 'idle') ?? baseGltf.animations[0];
      const nativeWalk = baseGltf.animations.find((a) => a.name === 'walk') ?? baseGltf.animations[1];
      const nativeRun = baseGltf.animations.find((a) => a.name === 'run') ?? baseGltf.animations[2];

      const idleClip = nativeIdle.clone();
      idleClip.name = 'idle';

      const walkClip = nativeWalk.clone();
      walkClip.name = 'walk';

      const runClip = nativeRun.clone();
      runClip.name = 'run';

      // Normalize external clips to match the armature coordinate space and scale
      const attackClip = normalizeExternalClip(attackGltf.animations[0], 'attack');
      const hitClip = normalizeExternalClip(hitGltf.animations[0], 'hit');
      const deathClip = normalizeExternalClip(deathGltf.animations[0], 'death');
      const zAttackClip = normalizeExternalClip(zAttackGltf.animations[0], 'zombie_attack');
      const zDeathClip = normalizeExternalClip(zDeathGltf.animations[0], 'zombie_death');

      this.clips = {
        idle: idleClip,
        walk: walkClip,
        run: runClip,
        attack: attackClip,
        hit: hitClip,
        death: deathClip,
        zombieAttack: zAttackClip,
        zombieDeath: zDeathClip,
      };
    })();

    return this.loadPromise;
  }

  instantiate(kind: 'player' | 'zombie', variant: number): InstantiatedCharacter {
    if (!this.baseScene || !this.clips) {
      throw new Error('CharacterModelLoader: cannot instantiate before load() completes');
    }

    const modelScene = SkeletonUtils.clone(this.baseScene);
    const rightHandSocket = modelScene.getObjectByName('mixamorigRightHand') ?? null;
    const skinnedMeshes: THREE.SkinnedMesh[] = [];

    const palette =
      kind === 'player'
        ? PLAYER_SURVIVOR_PALETTES[Math.abs(variant) % PLAYER_SURVIVOR_PALETTES.length]
        : ZOMBIE_PALETTES[Math.abs(variant) % ZOMBIE_PALETTES.length];

    modelScene.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = obj as THREE.SkinnedMesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        skinnedMeshes.push(mesh);

        // Clone material so instances have independent color and transparency
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => m.clone());
          } else {
            mesh.material = (mesh.material as THREE.Material).clone();
          }
        }

        const isJoints = mesh.name.toLowerCase().includes('joint');
        const color = isJoints ? palette.joints : palette.surface;
        const roughness = palette.roughness;
        const metalness = isJoints ? palette.metalness * 2.5 : palette.metalness;

        if (mesh.material && !Array.isArray(mesh.material)) {
          const std = mesh.material as THREE.MeshStandardMaterial;
          if (std.color) std.color.setHex(color);
          if (std.roughness !== undefined) std.roughness = roughness;
          if (std.metalness !== undefined) std.metalness = Math.min(0.9, metalness);
        }
      }
    });

    if (kind === 'zombie' && variant === 2) {
      // Brute zombie scale
      modelScene.scale.set(1.15, 1.15, 1.15);
    }

    // Three.js humanoid models are Y-up.
    // The world coordinate system in Ashfall is Z-up (Z = elevation meters).
    // Rotating the wrapper around X by +PI/2 converts local Y-up to world Z-up.
    const rootGroup = new THREE.Group();
    rootGroup.name = `character:${kind}:${variant}`;

    const wrapper = new THREE.Group();
    wrapper.name = 'rotation_wrapper';
    wrapper.rotation.x = Math.PI / 2;
    wrapper.add(modelScene);
    rootGroup.add(wrapper);

    const mixer = new THREE.AnimationMixer(modelScene);

    return {
      rootGroup,
      modelScene,
      mixer,
      rightHandSocket,
      skinnedMeshes,
      clips: this.clips,
    };
  }
}
