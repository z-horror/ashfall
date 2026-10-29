import * as THREE from 'three';
import type { CharacterClips } from './characterModelLoader.js';

export type CharacterState = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'death';

export interface StateMachineInputs {
  isDead: boolean;
  isDying: boolean;
  isHit: boolean;
  isAttacking: boolean;
  isMoving: boolean;
  isSprinting: boolean;
}

export class CharacterStateMachine {
  private currentState: CharacterState = 'idle';
  private currentAction: THREE.AnimationAction | null = null;
  private actions = new Map<CharacterState, THREE.AnimationAction>();
  private lockedUntil = 0;
  private isZombie: boolean;

  constructor(mixer: THREE.AnimationMixer, clips: CharacterClips, isZombie = false) {
    this.isZombie = isZombie;

    // Idle
    const idleAction = mixer.clipAction(clips.idle);
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    this.actions.set('idle', idleAction);

    // Walk
    const walkAction = mixer.clipAction(clips.walk);
    walkAction.setLoop(THREE.LoopRepeat, Infinity);
    walkAction.timeScale = 1.0;
    this.actions.set('walk', walkAction);

    // Run
    const runAction = mixer.clipAction(clips.run);
    runAction.setLoop(THREE.LoopRepeat, Infinity);
    runAction.timeScale = 1.1;
    this.actions.set('run', runAction);

    // Attack
    const attackClip = isZombie ? clips.zombieAttack : clips.attack;
    const attackAction = mixer.clipAction(attackClip);
    attackAction.setLoop(THREE.LoopOnce, 1);
    attackAction.clampWhenFinished = false;
    attackAction.timeScale = isZombie ? 1.6 : 2.5; // snappy swing
    this.actions.set('attack', attackAction);

    // Hit flinch
    const hitAction = mixer.clipAction(clips.hit);
    hitAction.setLoop(THREE.LoopOnce, 1);
    hitAction.clampWhenFinished = false;
    hitAction.timeScale = 2.4;
    this.actions.set('hit', hitAction);

    // Death
    const deathClip = isZombie ? clips.zombieDeath : clips.death;
    const deathAction = mixer.clipAction(deathClip);
    deathAction.setLoop(THREE.LoopOnce, 1);
    deathAction.clampWhenFinished = true;
    deathAction.timeScale = 1.15;
    this.actions.set('death', deathAction);

    // Start with idle
    idleAction.play();
    this.currentAction = idleAction;
    this.currentState = 'idle';
  }

  get state(): CharacterState {
    return this.currentState;
  }

  update(now: number, inputs: StateMachineInputs): void {
    // 1. Death has absolute priority and is permanent
    if (inputs.isDead || inputs.isDying) {
      if (this.currentState !== 'death') {
        this.transitionTo('death', 0.12);
      }
      return;
    }

    // 2. If locked in attack or hit, allow action to play out
    if (now < this.lockedUntil && (this.currentState === 'attack' || this.currentState === 'hit')) {
      return;
    }

    // 3. Attack trigger
    if (inputs.isAttacking && this.currentState !== 'attack') {
      this.lockedUntil = now + (this.isZombie ? 520 : 380);
      this.transitionTo('attack', 0.08);
      return;
    }

    // 4. Hit flinch trigger
    if (inputs.isHit && this.currentState !== 'hit' && this.currentState !== 'attack') {
      this.lockedUntil = now + 240;
      this.transitionTo('hit', 0.06);
      return;
    }

    // 5. Locomotion
    if (inputs.isMoving) {
      if (inputs.isSprinting && !this.isZombie) {
        this.transitionTo('run', 0.15);
      } else {
        this.transitionTo('walk', 0.15);
      }
    } else {
      this.transitionTo('idle', 0.18);
    }
  }

  private transitionTo(nextState: CharacterState, fadeDuration: number): void {
    if (this.currentState === nextState && this.currentAction?.isRunning()) return;

    const nextAction = this.actions.get(nextState);
    if (!nextAction) return;

    if (this.currentAction && this.currentAction !== nextAction) {
      this.currentAction.fadeOut(fadeDuration);
    }

    nextAction.reset().fadeIn(fadeDuration).play();
    this.currentAction = nextAction;
    this.currentState = nextState;
  }
}
