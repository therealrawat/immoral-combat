import * as THREE from 'three';
import { CharacterId, DifficultyLevel, FighterState } from '../types/game';

export type CpuPoseState = 'POSE' | 'LOUNGE' | 'DANCE' | 'CHAMP_POSE';

export interface CpuFrameContext {
  cpuId: CharacterId;
  playerId: CharacterId;
  cpuPos: THREE.Vector3;
  playerPos: THREE.Vector3;
  cpuState: FighterState;
  playerState: FighterState;
  isPaused: boolean;
  canCpuRun: boolean;
  availablePoseStates: CpuPoseState[];
  difficulty?: DifficultyLevel;
  isSignatureReady?: boolean;
  cpuHpPercent?: number;
  signatureCount?: number;
  onSetMoveInput: (x: number, z: number) => void;
  onTriggerPose: (poseState: CpuPoseState) => void;
  onTriggerAttack: (move: 'punch' | 'kick') => void;
  onTriggerSignature?: (variantIndex: 0 | 1) => void;
}

export interface DifficultyProfile {
  label: string;
  damageMultiplier: number;
  decisionPauseMinMs: number;
  decisionPauseMaxMs: number;
  postBusyPauseMinMs: number;
  postBusyPauseMaxMs: number;
  attackCooldownMinMs: number;
  attackCooldownMaxMs: number;
  comboChainChance: number;
  playerActionReactionScale: number;
  inRangeAttackChance: number;
  midRangeApproachChance: number;
  farRangeApproachChance: number;
  evadeWhenPlayerSwingsChance: number;
  poseChance: number;
  kickRatio: number;
  speedScaleBase: number;
  signatureUseChance: number;
  signatureReactionMinMs: number;
  signatureReactionMaxMs: number;
}

export const DIFFICULTY_PROFILES: Record<DifficultyLevel, DifficultyProfile> = {
  easy: {
    label: 'EASY',
    damageMultiplier: 0.78,
    decisionPauseMinMs: 220,
    decisionPauseMaxMs: 420,
    postBusyPauseMinMs: 260,
    postBusyPauseMaxMs: 460,
    attackCooldownMinMs: 1100,
    attackCooldownMaxMs: 1750,
    comboChainChance: 0.14,
    playerActionReactionScale: 0.45,
    inRangeAttackChance: 0.65,
    midRangeApproachChance: 0.68,
    farRangeApproachChance: 0.9,
    evadeWhenPlayerSwingsChance: 0.1,
    poseChance: 0.08,
    kickRatio: 0.34,
    speedScaleBase: 0.84,
    signatureUseChance: 0.55,
    signatureReactionMinMs: 1000,
    signatureReactionMaxMs: 1900,
  },
  medium: {
    label: 'MEDIUM',
    damageMultiplier: 1.0,
    decisionPauseMinMs: 65,
    decisionPauseMaxMs: 165,
    postBusyPauseMinMs: 110,
    postBusyPauseMaxMs: 240,
    attackCooldownMinMs: 520,
    attackCooldownMaxMs: 920,
    comboChainChance: 0.4,
    playerActionReactionScale: 0.22,
    inRangeAttackChance: 0.84,
    midRangeApproachChance: 0.84,
    farRangeApproachChance: 0.96,
    evadeWhenPlayerSwingsChance: 0.24,
    poseChance: 0.03,
    kickRatio: 0.44,
    speedScaleBase: 1.02,
    signatureUseChance: 0.84,
    signatureReactionMinMs: 360,
    signatureReactionMaxMs: 780,
  },
  hard: {
    label: 'HARD',
    damageMultiplier: 1.24,
    decisionPauseMinMs: 15,
    decisionPauseMaxMs: 70,
    postBusyPauseMinMs: 35,
    postBusyPauseMaxMs: 105,
    attackCooldownMinMs: 240,
    attackCooldownMaxMs: 480,
    comboChainChance: 0.62,
    playerActionReactionScale: 0.0,
    inRangeAttackChance: 0.94,
    midRangeApproachChance: 0.94,
    farRangeApproachChance: 0.99,
    evadeWhenPlayerSwingsChance: 0.4,
    poseChance: 0.01,
    kickRatio: 0.52,
    speedScaleBase: 1.15,
    signatureUseChance: 0.96,
    signatureReactionMinMs: 90,
    signatureReactionMaxMs: 260,
  },
};

type CpuMode = 'IDLE' | 'MOVE';
type MoveIntent = 'APPROACH' | 'CIRCLE' | 'EVADE';

const STRIKE_TRIGGER_RANGE = 1.92;
const PREFERRED_MIN_RANGE = 1.12;
const PREFERRED_MAX_RANGE = 2.05;
const ROPE_AVOID_THRESHOLD = 1.78;

const PLAYER_NON_INTERRUPT_STATES = new Set<FighterState>([
  'POSE',
  'LOUNGE',
  'DANCE',
  'CHAMP_POSE',
  'ENTRY',
  'SIGNATURE',
  'MUAY_THAI',
  'KISS',
  'BLUSH',
  'SPANKED',
  'ATTEMPT_ATTACK',
  'FALL_BACK',
  'DEAD',
  'GET_UP',
]);

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Autonomous fighter brain scaled cleanly across Easy / Medium / Hard difficulty tiers,
 * with range-aware footwork, combo pressure, and tactical Signature Move execution.
 * Preserves the narrative exception in Chinu vs Priyanshu where Priyanshu never initiates attacks.
 */
export class CpuAiController {
  private difficulty: DifficultyLevel = 'medium';
  private mode: CpuMode = 'IDLE';
  private moveIntent: MoveIntent = 'CIRCLE';
  private strafeSign: 1 | -1 = 1;
  private speedScale = 1.0;
  private moveEndAt = 0;
  private nextDecisionAt = 0;
  private nextAttackAllowedAt = 0;
  private nextSignatureCheckAt = 0;
  private wasBusyInAction = false;
  private lastPoseState: CpuPoseState | null = null;

  public static canCpuAttack(cpuId: CharacterId, playerId: CharacterId): boolean {
    // Priyanshu can never initiate attacks against Chinu.
    return !(cpuId === 'priyanshu' && playerId === 'chinu');
  }

  public setDifficulty(level: DifficultyLevel): void {
    this.difficulty = level;
  }

  public getDifficulty(): DifficultyLevel {
    return this.difficulty;
  }

  public getDamageMultiplier(level: DifficultyLevel = this.difficulty): number {
    return DIFFICULTY_PROFILES[level].damageMultiplier;
  }

  public reset(nowMs: number, graceDelayMs = 1100): void {
    this.mode = 'IDLE';
    this.wasBusyInAction = false;
    this.lastPoseState = null;
    this.nextDecisionAt = nowMs + graceDelayMs;
    this.nextAttackAllowedAt = nowMs + graceDelayMs + 220;
    this.nextSignatureCheckAt = nowMs + graceDelayMs + 300;
  }

  public onCpuInterrupted(nowMs: number, stunMs = 650): void {
    this.mode = 'IDLE';
    const profile = DIFFICULTY_PROFILES[this.difficulty];
    const scaledStun = Math.max(180, stunMs * (0.45 + profile.playerActionReactionScale));
    this.nextDecisionAt = Math.max(this.nextDecisionAt, nowMs + scaledStun);
    this.nextAttackAllowedAt = Math.max(this.nextAttackAllowedAt, nowMs + scaledStun + 160);
  }

  public onPlayerAction(nowMs: number, reactionBeatMs = 750): void {
    const profile = DIFFICULTY_PROFILES[this.difficulty];
    if (profile.playerActionReactionScale <= 0) return;
    const delay = reactionBeatMs * profile.playerActionReactionScale;
    this.nextAttackAllowedAt = Math.max(this.nextAttackAllowedAt, nowMs + delay);
  }

  public update(nowMs: number, ctx: CpuFrameContext): void {
    if (ctx.difficulty && ctx.difficulty !== this.difficulty) {
      this.difficulty = ctx.difficulty;
    }
    const profile = DIFFICULTY_PROFILES[this.difficulty];

    const stopMoving = (): void => {
      this.mode = 'IDLE';
      ctx.onSetMoveInput(0, 0);
    };

    if (ctx.isPaused) {
      stopMoving();
      this.wasBusyInAction = false;
      return;
    }

    const inLocomotion = ctx.cpuState === 'IDLE' || ctx.cpuState === 'RUN';
    if (!inLocomotion) {
      stopMoving();
      this.wasBusyInAction = true;
      return;
    }

    if (this.wasBusyInAction) {
      this.wasBusyInAction = false;
      this.nextDecisionAt = Math.max(
        this.nextDecisionAt,
        nowMs + randomBetween(profile.postBusyPauseMinMs, profile.postBusyPauseMaxMs)
      );
      stopMoving();
      return;
    }

    const dx = ctx.playerPos.x - ctx.cpuPos.x;
    const dz = ctx.playerPos.z - ctx.cpuPos.z;
    const dist = Math.hypot(dx, dz);
    const allowAttack =
      CpuAiController.canCpuAttack(ctx.cpuId, ctx.playerId) &&
      !PLAYER_NON_INTERRUPT_STATES.has(ctx.playerState);

    if (
      ctx.isSignatureReady &&
      nowMs >= this.nextSignatureCheckAt &&
      !PLAYER_NON_INTERRUPT_STATES.has(ctx.playerState) &&
      this.tryLaunchSignature(nowMs, dist, allowAttack, profile, ctx)
    ) {
      stopMoving();
      return;
    }

    if (this.mode === 'MOVE') {
      if (
        allowAttack &&
        (this.moveIntent === 'APPROACH' || this.moveIntent === 'CIRCLE') &&
        dist <= STRIKE_TRIGGER_RANGE &&
        nowMs >= this.nextAttackAllowedAt
      ) {
        stopMoving();
        this.launchAttack(nowMs, profile, ctx);
        return;
      }

      if (nowMs < this.moveEndAt && ctx.canCpuRun) {
        const [vx, vz] = this.computeSteeringVector(ctx.cpuPos, dx, dz, dist);
        ctx.onSetMoveInput(vx, vz);
        return;
      }

      stopMoving();
      this.nextDecisionAt =
        nowMs + randomBetween(profile.decisionPauseMinMs, profile.decisionPauseMaxMs);
      return;
    }

    ctx.onSetMoveInput(0, 0);
    if (nowMs < this.nextDecisionAt) {
      return;
    }

    this.chooseNextAction(nowMs, dist, allowAttack, profile, ctx);
  }

  private tryLaunchSignature(
    nowMs: number,
    dist: number,
    allowAttack: boolean,
    profile: DifficultyProfile,
    ctx: CpuFrameContext
  ): boolean {
    if (!ctx.isSignatureReady || !ctx.onTriggerSignature) return false;

    const variant = this.chooseSignatureVariant(dist, allowAttack, ctx);
    if (variant === null) return false;

    this.nextSignatureCheckAt =
      nowMs + randomBetween(profile.signatureReactionMinMs, profile.signatureReactionMaxMs);

    if (Math.random() > profile.signatureUseChance) {
      return false;
    }

    this.mode = 'IDLE';
    this.nextAttackAllowedAt = nowMs + randomBetween(900, 1400);
    this.nextDecisionAt = nowMs + randomBetween(650, 1050);
    ctx.onTriggerSignature(variant);
    return true;
  }

  private chooseSignatureVariant(
    dist: number,
    allowAttack: boolean,
    ctx: CpuFrameContext
  ): 0 | 1 | null {
    const count = ctx.signatureCount ?? 1;
    const hpPercent = ctx.cpuHpPercent ?? 1;

    if (ctx.cpuId === 'modiji') {
      if (count >= 2 && hpPercent <= 0.72 && (hpPercent <= 0.45 || Math.random() < 0.75)) {
        return 1; // Chai Break (+20% heal buff)
      }
      if (allowAttack && dist <= 4.8) {
        return 0; // Mitron! Sonic Boom AoE
      }
      return count >= 2 && hpPercent < 0.9 ? 1 : null;
    }

    if (!allowAttack) return null;

    if (ctx.cpuId === 'trump') {
      if (count >= 2 && dist <= 2.35 && Math.random() < 0.58) {
        return 1; // Build the Wall (close/mid slam)
      }
      return dist <= 5.8 ? 0 : null; // You're Fired! (ranged fireball)
    }

    if (ctx.cpuId === 'putin') {
      if (count >= 2 && dist >= 1.9 && Math.random() < 0.55) {
        return 1; // Matryoshka Munition (bouncing cluster bomb)
      }
      return dist <= 4.5 ? 0 : count >= 2 ? 1 : null; // The Long Table
    }

    return dist <= 3.6 ? 0 : null;
  }

  private chooseNextAction(
    nowMs: number,
    dist: number,
    allowAttack: boolean,
    profile: DifficultyProfile,
    ctx: CpuFrameContext
  ): void {
    const canPose = ctx.availablePoseStates.length > 0;
    const roll = Math.random();
    const playerSwinging = ctx.playerState === 'PUNCH' || ctx.playerState === 'KICK';

    if (
      ctx.canCpuRun &&
      playerSwinging &&
      dist <= STRIKE_TRIGGER_RANGE + 0.35 &&
      Math.random() < profile.evadeWhenPlayerSwingsChance
    ) {
      this.startMove('EVADE', randomBetween(240, 420), profile.speedScaleBase * 1.08, nowMs);
      return;
    }

    if (allowAttack && nowMs >= this.nextAttackAllowedAt) {
      if (dist > STRIKE_TRIGGER_RANGE + 0.08 && ctx.canCpuRun) {
        const approachDuration = Math.min(900, Math.max(320, dist * 290));
        this.startMove('APPROACH', approachDuration, profile.speedScaleBase, nowMs);
        return;
      }

      if (dist <= STRIKE_TRIGGER_RANGE && roll < profile.inRangeAttackChance) {
        this.launchAttack(nowMs, profile, ctx);
        return;
      }

      if (ctx.canCpuRun) {
        const intent: MoveIntent = dist < PREFERRED_MIN_RANGE ? 'EVADE' : 'CIRCLE';
        this.startMove(intent, randomBetween(320, 620), profile.speedScaleBase * 0.92, nowMs);
        return;
      }
    }

    if (ctx.canCpuRun) {
      const shouldApproach =
        ctx.isSignatureReady && allowAttack
          ? true
          : dist > PREFERRED_MAX_RANGE
            ? Math.random() < profile.farRangeApproachChance
            : dist > STRIKE_TRIGGER_RANGE
              ? Math.random() < profile.midRangeApproachChance
              : false;

      if (shouldApproach) {
        const speed =
          ctx.cpuId === 'priyanshu' && ctx.playerId === 'chinu' ? 0.88 : profile.speedScaleBase;
        this.startMove('APPROACH', randomBetween(420, 820), speed, nowMs);
        return;
      }

      if (canPose && Math.random() < profile.poseChance) {
        this.triggerVarietyPose(nowMs, ctx);
        return;
      }

      const intent: MoveIntent = dist < PREFERRED_MIN_RANGE ? 'EVADE' : 'CIRCLE';
      const footworkSpeed =
        ctx.cpuId === 'priyanshu' && ctx.playerId === 'chinu'
          ? 0.82
          : profile.speedScaleBase * 0.9;
      this.startMove(intent, randomBetween(360, 720), footworkSpeed, nowMs);
      return;
    }

    if (canPose && roll < profile.poseChance * 3) {
      this.triggerVarietyPose(nowMs, ctx);
      return;
    }

    this.nextDecisionAt =
      nowMs + randomBetween(profile.decisionPauseMinMs, profile.decisionPauseMaxMs);
  }

  private startMove(
    intent: MoveIntent,
    durationMs: number,
    speedScale: number,
    nowMs: number
  ): void {
    this.mode = 'MOVE';
    this.moveIntent = intent;
    this.speedScale = speedScale;
    this.strafeSign = Math.random() < 0.5 ? 1 : -1;
    this.moveEndAt = nowMs + durationMs;
  }

  private launchAttack(
    nowMs: number,
    profile: DifficultyProfile,
    ctx: CpuFrameContext
  ): void {
    if (!CpuAiController.canCpuAttack(ctx.cpuId, ctx.playerId)) return;

    const move: 'punch' | 'kick' = Math.random() < profile.kickRatio ? 'kick' : 'punch';
    const chainCombo = Math.random() < profile.comboChainChance;
    const cooldownMs = chainCombo
      ? randomBetween(profile.attackCooldownMinMs * 0.55, profile.attackCooldownMinMs * 0.9)
      : randomBetween(profile.attackCooldownMinMs, profile.attackCooldownMaxMs);

    this.mode = 'IDLE';
    this.nextAttackAllowedAt = nowMs + cooldownMs;
    this.nextDecisionAt =
      nowMs +
      (chainCombo
        ? randomBetween(profile.decisionPauseMinMs, profile.decisionPauseMaxMs + 80)
        : randomBetween(profile.postBusyPauseMinMs, profile.postBusyPauseMaxMs));
    ctx.onTriggerAttack(move);
  }

  private triggerVarietyPose(nowMs: number, ctx: CpuFrameContext): void {
    const pool = ctx.availablePoseStates;
    if (pool.length === 0) return;

    const candidates =
      pool.length > 1 ? pool.filter((p) => p !== this.lastPoseState) : pool;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastPoseState = chosen;
    this.mode = 'IDLE';
    this.nextDecisionAt = nowMs + randomBetween(1100, 1750);
    ctx.onTriggerPose(chosen);
  }

  private computeSteeringVector(
    cpuPos: THREE.Vector3,
    dx: number,
    dz: number,
    dist: number
  ): [number, number] {
    const safeDist = dist > 0.001 ? dist : 1;
    const rx = dist > 0.001 ? dx / safeDist : 1;
    const rz = dist > 0.001 ? dz / safeDist : 0;

    // Perpendicular tangent for circling around the player
    const tx = -rz * this.strafeSign;
    const tz = rx * this.strafeSign;

    let radialWeight = 0.2;
    let tangentWeight = 0.92;

    if (this.moveIntent === 'APPROACH') {
      radialWeight = 0.92;
      tangentWeight = 0.25;
    } else if (this.moveIntent === 'EVADE' || dist < PREFERRED_MIN_RANGE) {
      radialWeight = -0.68;
      tangentWeight = 0.85;
    } else if (dist > PREFERRED_MAX_RANGE) {
      radialWeight = 0.78;
      tangentWeight = 0.45;
    }

    let vx = rx * radialWeight + tx * tangentWeight;
    let vz = rz * radialWeight + tz * tangentWeight;

    // Gentle arena containment pull so CPU curves smoothly inside boundaries
    if (Math.abs(cpuPos.x) > ROPE_AVOID_THRESHOLD) {
      vx += -Math.sign(cpuPos.x) * 0.95;
    }
    if (Math.abs(cpuPos.z) > ROPE_AVOID_THRESHOLD) {
      vz += -Math.sign(cpuPos.z) * 0.95;
    }

    const len = Math.hypot(vx, vz);
    if (len < 0.001) return [0, 0];
    return [(vx / len) * this.speedScale, (vz / len) * this.speedScale];
  }
}
