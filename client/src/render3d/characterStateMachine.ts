import * as THREE from 'three';

export type CharacterStateName = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'death';

export interface CharacterStateInputs {
  isDead: boolean;
  isDying: boolean;
  isHit: boolean;
  isAttacking: boolean;
  isMoving: boolean;
  isSprinting: boolean;
}

export class CharacterStateMachine {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<CharacterStateName, THREE.AnimationAction>();
  private currentState: CharacterStateName = 'idle';
  private wasAttacking = false;
  private wasHit = false;

  constructor(mixer: THREE.AnimationMixer, clips: Map<CharacterStateName, THREE.AnimationClip>) {
    this.mixer = mixer;

    for (const [name, clip] of clips) {
      const action = this.mixer.clipAction(clip);
      if (name === 'death') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else if (name === 'attack') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else if (name === 'hit') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      this.actions.set(name, action);
    }

    const initial = this.actions.get('idle');
    if (initial) {
      initial.play();
    }
  }

  get state(): CharacterStateName {
    return this.currentState;
  }

  update(inputs: CharacterStateInputs): void {
    const isAttackingJustStarted = inputs.isAttacking && !this.wasAttacking;
    const isHitJustStarted = inputs.isHit && !this.wasHit;
    this.wasAttacking = inputs.isAttacking;
    this.wasHit = inputs.isHit;

    // Terminal state handling: once dead, stay dead unless revived
    if (this.currentState === 'death') {
      if (!inputs.isDead && !inputs.isDying) {
        // Character revived
        this.transitionTo('idle', 0.2);
      }
      return;
    }

    let desiredState: CharacterStateName;
    if (inputs.isDead || inputs.isDying) {
      desiredState = 'death';
    } else if (inputs.isHit) {
      desiredState = 'hit';
    } else if (inputs.isAttacking) {
      desiredState = 'attack';
    } else if (inputs.isMoving && inputs.isSprinting) {
      desiredState = 'run';
    } else if (inputs.isMoving) {
      desiredState = 'walk';
    } else {
      desiredState = 'idle';
    }

    // Retrigger one-shots if requested again
    if (desiredState === 'attack' && (isAttackingJustStarted || this.currentState !== 'attack')) {
      this.playAction('attack', 0.08, true);
      this.currentState = 'attack';
      return;
    }

    if (desiredState === 'hit' && (isHitJustStarted || this.currentState !== 'hit')) {
      this.playAction('hit', 0.06, true);
      this.currentState = 'hit';
      return;
    }

    if (this.currentState !== desiredState) {
      const fadeDuration = desiredState === 'death' ? 0.1 : 0.15;
      this.transitionTo(desiredState, fadeDuration);
    }
  }

  private transitionTo(nextState: CharacterStateName, fadeDuration: number): void {
    const prevAction = this.actions.get(this.currentState);
    const nextAction = this.actions.get(nextState);

    if (!nextAction) return;

    if (prevAction && prevAction !== nextAction) {
      prevAction.fadeOut(fadeDuration);
    }

    nextAction.reset().fadeIn(fadeDuration).play();
    this.currentState = nextState;
  }

  private playAction(name: CharacterStateName, fadeDuration: number, restart = false): void {
    const action = this.actions.get(name);
    if (!action) return;

    if (this.currentState !== name) {
      const prevAction = this.actions.get(this.currentState);
      if (prevAction) {
        prevAction.fadeOut(fadeDuration);
      }
    }

    if (restart) {
      action.reset();
    }
    action.fadeIn(fadeDuration).play();
    this.currentState = name;
  }
}
