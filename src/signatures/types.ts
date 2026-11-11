import type * as THREE from 'three';
import type { SoundManager } from '../audio/SoundManager';
import type { AnimationController } from '../characters/AnimationController';
import type { CpuAiController } from '../combat/CpuAiController';
import type { PhysicsCombatSystem } from '../combat/PhysicsCombatSystem';
import type { SceneManager } from '../core/SceneManager';
import type { EffectsManager } from '../effects/EffectsManager';
import type { CharacterId, FighterRig } from '../types/game';

export interface SignatureMoveMetadata {
  readonly id: string;
  readonly name: string;
  readonly buttonLabel: string;
  readonly buttonSub: string;
  readonly description: string;
}

export interface SignatureMoveContext {
  readonly physics: PhysicsCombatSystem;
  readonly sound: SoundManager;
  readonly effects: EffectsManager;
  readonly sceneManager: SceneManager;
  readonly cpuAi: CpuAiController;
  getRig(id: CharacterId): FighterRig | undefined;
  getAnim(id: CharacterId): AnimationController | undefined;
  getDisplayName(id: CharacterId): string;
  getFighterHp(id: CharacterId): number;
  getComboHits(): number;
  nextQuipIndex(): number;
  setQuip(speaker: string, text: string, fromPlayerAction?: boolean): void;
  recordHitQuip(defenderId: CharacterId): void;
  isCinematicActive(): boolean;
  setCinematicActive(active: boolean): void;
  setTimeScale(scale: number): void;
  clearKOTimeout(): void;
  cancelChinuEntry(): void;
  resetPriyanshuAdmire(): void;
  applyDamageToFighter(
    defenderId: CharacterId,
    attackerId: CharacterId,
    damage: number,
    fromCinematic: boolean,
    countCombo?: boolean
  ): void;
  resetFighterHPState(id: CharacterId): void;
  flashTintFeedback(
    rig: FighterRig,
    hexColor: number,
    intensity: number,
    duration: number
  ): void;
  wobbleHeadOnImpact(rig: FighterRig): void;
  scheduleUnscaled(callback: () => void, delayMs: number): void;
  syncHUD(): void;
  interruptFighterAi?(targetId: CharacterId, durationMs: number): void;
  triggerBossCounter(challengerId: CharacterId, bossId: CharacterId): void;
  restoreFighterHpPercent?(
    id: CharacterId,
    percent: number
  ): { restored: number; nextHp: number; maxHp: number };
  registerTransientDisposable?(item: { dispose(): void }): void;
  spawnBloodImpact?(
    defenderId: CharacterId,
    attackerId: CharacterId,
    impactPoint: THREE.Vector3,
    damage: number,
    intensityBoost?: number
  ): void;
}

export interface SignatureMoveDefinition {
  readonly ownerId: CharacterId;
  readonly meta: SignatureMoveMetadata;
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void;
}

