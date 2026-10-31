import * as THREE from 'three';

export type CharacterStateName = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'death';

export interface CharacterStateInputs {
  isDead: boolean;
  isDying: boolean;
  isHit: boolean;
  isAttacking: boolean;
  isMoving: boolean;
  isSprinting: boolean;
  weapon: string | null;
}

export class CharacterStateMachine {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentState: CharacterStateName = 'idle';
  private currentActionName = '';
  private wasAttacking = false;
  private wasHit = false;
  private oneShotRemaining = 0;

  constructor(mixer: THREE.AnimationMixer, clips: Map<string, THREE.AnimationClip>) {
    this.mixer = mixer;

    for (const [name, clip] of clips) {
      const action = this.mixer.clipAction(clip);
      if (name === 'death') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else if (name.startsWith('attack') || name === 'hit') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        if (name === 'attack_melee') {
          action.timeScale = 2.2;
        } else if (name === 'attack_pistol') {
          action.timeScale = 1.0;
        } else if (name === 'hit') {
          action.timeScale = 1.8;
        }
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      this.actions.set(name, action);
    }

    const initial = this.actions.get('idle');
    if (initial) {
      initial.play();
      this.currentActionName = 'idle';
    }
  }

  get state(): CharacterStateName {
    return this.currentState;
  }

  get activeAction(): string {
    return this.currentActionName;
  }

  update(dt: number, inputs: CharacterStateInputs): void {
    const isAttackingJustStarted = inputs.isAttacking && !this.wasAttacking;
    const isHitJustStarted = inputs.isHit && !this.wasHit;

    // 1. Terminal state: Death
    if (this.currentState === 'death') {
      if (!inputs.isDead && !inputs.isDying) {
        // Revived
        this.currentState = 'idle';
        this.transitionTo('idle', 0.2);
      }
      this.wasAttacking = inputs.isAttacking;
      this.wasHit = inputs.isHit;
      return;
    }

    if (inputs.isDead || inputs.isDying) {
      this.currentState = 'death';
      this.oneShotRemaining = 0;
      this.playAction('death', 0.1, true);
      this.wasAttacking = inputs.isAttacking;
      this.wasHit = inputs.isHit;
      return;
    }

    // 2. Decrement one-shot timer if active
    if (this.oneShotRemaining > 0) {
      this.oneShotRemaining -= dt;

      // Allow hit reaction to interrupt an attack
      if (isHitJustStarted) {
        this.currentState = 'hit';
        this.playOneShot('hit', 0.06);
        this.wasAttacking = inputs.isAttacking;
        this.wasHit = inputs.isHit;
        return;
      }

      // Allow a fresh attack input to retrigger attack
      if (isAttackingJustStarted && this.currentState === 'attack') {
        const attackActionName = inputs.weapon === 'pistol' && this.actions.has('attack_pistol')
          ? 'attack_pistol'
          : 'attack_melee';
        this.currentState = 'attack';
        this.playOneShot(attackActionName, 0.06);
        this.wasAttacking = inputs.isAttacking;
        this.wasHit = inputs.isHit;
        return;
      }

      // While one-shot is active, do not cut off!
      this.wasAttacking = inputs.isAttacking;
      this.wasHit = inputs.isHit;
      return;
    }

    // 3. Trigger new one-shot if requested
    if (inputs.isHit || isHitJustStarted) {
      this.currentState = 'hit';
      this.playOneShot('hit', 0.06);
      this.wasAttacking = inputs.isAttacking;
      this.wasHit = inputs.isHit;
      return;
    }

    if (inputs.isAttacking || isAttackingJustStarted) {
      const attackActionName = inputs.weapon === 'pistol' && this.actions.has('attack_pistol')
        ? 'attack_pistol'
        : 'attack_melee';
      this.currentState = 'attack';
      this.playOneShot(attackActionName, 0.08);
      this.wasAttacking = inputs.isAttacking;
      this.wasHit = inputs.isHit;
      return;
    }

    // 4. Locomotion states: run, walk, idle
    const isGun = inputs.weapon === 'pistol';
    let targetAction: string;
    let nextState: CharacterStateName;

    if (inputs.isMoving && inputs.isSprinting) {
      nextState = 'run';
      targetAction = isGun && this.actions.has('run_gun') ? 'run_gun' : 'run';
    } else if (inputs.isMoving) {
      nextState = 'walk';
      targetAction = isGun && this.actions.has('walk_gun') ? 'walk_gun' : 'walk';
    } else {
      nextState = 'idle';
      targetAction = isGun && this.actions.has('idle_gun') ? 'idle_gun' : 'idle';
    }

    if (!this.actions.has(targetAction)) {
      if (nextState === 'run' && this.actions.has('walk')) targetAction = 'walk';
      else if (this.actions.has('idle')) targetAction = 'idle';
    }

    if (this.currentActionName !== targetAction || this.currentState !== nextState) {
      this.transitionTo(targetAction, 0.15);
      this.currentState = nextState;
    }

    this.wasAttacking = inputs.isAttacking;
    this.wasHit = inputs.isHit;
  }

  private playOneShot(actionName: string, fadeDuration: number): void {
    const action = this.actions.get(actionName) ?? this.actions.get('attack_melee') ?? this.actions.get('idle');
    if (!action) return;

    if (this.currentActionName && this.currentActionName !== actionName) {
      const prev = this.actions.get(this.currentActionName);
      if (prev) prev.fadeOut(fadeDuration);
    }

    action.reset();
    action.fadeIn(fadeDuration).play();
    this.currentActionName = actionName;

    const clipDuration = action.getClip().duration;
    const timeScale = action.timeScale || 1;
    this.oneShotRemaining = clipDuration / timeScale;
  }

  private transitionTo(nextActionName: string, fadeDuration: number): void {
    const prevAction = this.actions.get(this.currentActionName);
    const nextAction = this.actions.get(nextActionName);

    if (!nextAction) return;

    if (prevAction && prevAction !== nextAction) {
      prevAction.fadeOut(fadeDuration);
    }

    nextAction.reset().fadeIn(fadeDuration).play();
    this.currentActionName = nextActionName;
  }

  private playAction(actionName: string, fadeDuration: number, restart = false): void {
    const action = this.actions.get(actionName);
    if (!action) return;

    if (this.currentActionName && this.currentActionName !== actionName) {
      const prev = this.actions.get(this.currentActionName);
      if (prev) prev.fadeOut(fadeDuration);
    }

    if (restart) {
      action.reset();
    }
    action.fadeIn(fadeDuration).play();
    this.currentActionName = actionName;
  }
}
