import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface InstantiatedCharacter {
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  handSlot: THREE.Object3D | null;
  baseScale: number;
  materials: THREE.Material[];
  weaponMeshes: Map<string, THREE.Object3D>;
}

const WEAPON_NODE_NAMES = [
  'Axe',
  'Guitar',
  'Knife',
  'Pistol',
  'Rifle',
  'Shotgun',
  'SMG',
  'Spear',
  'WoodenBat_Barbed',
  'WoodenBat_Saw',
];

function sanitizeClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const cloned = clip.clone();
  for (const track of cloned.tracks) {
    const lower = track.name.toLowerCase();
    const isRoot = lower.includes('root.position') || lower.includes('characterarmature.position');
    const isHips = lower.includes('hips.position') || lower.includes('body.position');

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

function createPistolShootClip(idleGunClip: THREE.AnimationClip): THREE.AnimationClip {
  const duration = 0.28;
  const tracks: THREE.KeyframeTrack[] = [];

  for (const track of idleGunClip.tracks) {
    const lower = track.name.toLowerCase();
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const isForearm = lower.includes('lowerarm.l') || lower.includes('lowerarm_l');
      const isUpperArm = lower.includes('upperarm.l') || lower.includes('upperarm_l');
      const isTorso = lower.includes('torso');

      const times = [0, 0.08, duration];
      const q0 = new THREE.Quaternion(
        track.values[0] ?? 0,
        track.values[1] ?? 0,
        track.values[2] ?? 0,
        track.values[3] ?? 1,
      );

      const qKick = q0.clone();
      if (isForearm) {
        const kickRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.32);
        qKick.multiply(kickRot);
      } else if (isUpperArm) {
        const kickRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.18);
        qKick.multiply(kickRot);
      } else if (isTorso) {
        const kickRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.04);
        qKick.multiply(kickRot);
      }

      const values = [
        q0.x, q0.y, q0.z, q0.w,
        qKick.x, qKick.y, qKick.z, qKick.w,
        q0.x, q0.y, q0.z, q0.w,
      ];
      tracks.push(new THREE.QuaternionKeyframeTrack(track.name, times, values));
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      const times = [0, duration];
      const values = [
        track.values[0] ?? 0, track.values[1] ?? 0, track.values[2] ?? 0,
        track.values[0] ?? 0, track.values[1] ?? 0, track.values[2] ?? 0,
      ];
      tracks.push(new THREE.VectorKeyframeTrack(track.name, times, values));
    }
  }

  return new THREE.AnimationClip('attack_pistol', duration, tracks);
}

export class CharacterModelLoader {
  private survivorTemplates: THREE.Group[] = [];
  private survivorClips: Array<Map<string, THREE.AnimationClip>> = [];
  private zombieTemplates: THREE.Group[] = [];
  private zombieClips: Array<Map<string, THREE.AnimationClip>> = [];

  private loadPromise: Promise<void> | null = null;
  private isLoaded = false;

  get ready(): boolean {
    return this.isLoaded;
  }

  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const loader = new GLTFLoader();

      const survivorFiles = [
        '/assets/characters/quaternius/Characters_Lis.gltf',
        '/assets/characters/quaternius/Characters_Matt.gltf',
        '/assets/characters/quaternius/Characters_Sam.gltf',
        '/assets/characters/quaternius/Characters_Shaun.gltf',
      ];

      const zombieFiles = [
        '/assets/characters/quaternius/Zombie_Basic.gltf',
        '/assets/characters/quaternius/Zombie_Arm.gltf',
        '/assets/characters/quaternius/Zombie_Chubby.gltf',
        '/assets/characters/quaternius/Zombie_Ribcage.gltf',
      ];

      const [survivorGltfs, zombieGltfs] = await Promise.all([
        Promise.all(survivorFiles.map((url) => loader.loadAsync(url))),
        Promise.all(zombieFiles.map((url) => loader.loadAsync(url))),
      ]);

      // Process survivors
      for (const gltf of survivorGltfs) {
        this.survivorTemplates.push(gltf.scene);
        const clips = new Map<string, THREE.AnimationClip>();

        const animMap: Record<string, string> = {
          idle: 'Idle',
          idle_gun: 'Idle_Gun',
          walk: 'Walk',
          walk_gun: 'Walk_Gun',
          run: 'Run',
          run_gun: 'Run_Gun',
          attack_melee: 'Slash',
          hit: 'HitReact',
          death: 'Death',
        };

        for (const [key, origName] of Object.entries(animMap)) {
          const found = gltf.animations.find((a) => a.name === origName);
          if (found) {
            const sanitized = sanitizeClip(found);
            sanitized.name = key;
            clips.set(key, sanitized);
          }
        }

        const idleGun = clips.get('idle_gun') ?? clips.get('idle');
        if (idleGun) {
          const pistolShot = createPistolShootClip(idleGun);
          clips.set('attack_pistol', pistolShot);
        }

        this.survivorClips.push(clips);
      }

      // Process zombies
      for (const gltf of zombieGltfs) {
        this.zombieTemplates.push(gltf.scene);
        const clips = new Map<string, THREE.AnimationClip>();

        const animMap: Record<string, string> = {
          idle: 'Idle',
          walk: 'Walk',
          run: 'Run',
          attack_melee: 'Punch',
          hit: 'HitReact',
          death: 'Death',
        };

        for (const [key, origName] of Object.entries(animMap)) {
          let found = gltf.animations.find((a) => a.name === origName);
          if (!found) {
            if (key === 'attack_melee') {
              found = gltf.animations.find((a) => a.name === 'Run_Attack' || a.name === 'Idle_Attack') ?? gltf.animations[0];
            } else if (key === 'run') {
              found = gltf.animations.find((a) => a.name === 'Run_Arms') ?? gltf.animations[0];
            } else {
              found = gltf.animations[0];
            }
          }
          if (found) {
            const sanitized = sanitizeClip(found);
            sanitized.name = key;
            clips.set(key, sanitized);
          }
        }

        this.zombieClips.push(clips);
      }

      this.isLoaded = true;
    })();

    return this.loadPromise;
  }

  instantiate(kind: 'player' | 'zombie', variant = 0, zombieType = 0): InstantiatedCharacter | null {
    if (!this.isLoaded) return null;

    let template: THREE.Group | undefined;
    let clips: Map<string, THREE.AnimationClip> | undefined;
    let baseScale: number;

    if (kind === 'player') {
      const idx = Math.abs(variant) % Math.max(1, this.survivorTemplates.length);
      template = this.survivorTemplates[idx];
      clips = this.survivorClips[idx];
      baseScale = 1.05; // ~1.8m height in world units
    } else {
      const idx = Math.min(this.zombieTemplates.length - 1, Math.max(0, zombieType));
      template = this.zombieTemplates[idx];
      clips = this.zombieClips[idx];
      const scaleMap: Record<number, number> = {
        0: 1.15, // Walker
        1: 1.10, // Runner
        2: 1.18, // Brute
        3: 1.10, // Crawler
      };
      baseScale = scaleMap[zombieType] ?? 1.15;
    }

    if (!template || !clips) return null;

    const cloned = SkeletonUtils.clone(template) as THREE.Group;
    cloned.matrixAutoUpdate = true;

    const materials: THREE.Material[] = [];
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

    const weaponMeshes = new Map<string, THREE.Object3D>();
    if (kind === 'player') {
      for (const name of WEAPON_NODE_NAMES) {
        const node = cloned.getObjectByName(name);
        if (node) {
          node.visible = false;
          weaponMeshes.set(name, node);
        }
      }
    }

    const handSlot =
      (cloned.getObjectByName('Middle1.L') as THREE.Object3D | undefined) ??
      (cloned.getObjectByName('Middle1L') as THREE.Object3D | undefined) ??
      (cloned.getObjectByName('handslot.r') as THREE.Object3D | undefined) ??
      null;

    const mixer = new THREE.AnimationMixer(cloned);

    return {
      model: cloned,
      mixer,
      clips,
      handSlot,
      baseScale,
      materials,
      weaponMeshes,
    };
  }
}
