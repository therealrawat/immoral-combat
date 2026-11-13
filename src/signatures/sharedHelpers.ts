import type { CharacterId, FighterRig, FighterState } from '../types/game';
import type { SignatureMoveContext } from './types';

export const CINEMATIC_FREEZE_TIME_SCALE = 0.03;

export interface PreparedSignatureCinematic {
  startDelayMs: number;
}

/**
 * Shared prologue for cinematic signature moves: halts active movement,
 * clears KO recovery/entry locks, and stands up a knocked-down target if needed.
 */
export function prepareSignatureCinematic(
  ctx: SignatureMoveContext,
  attackerId: CharacterId,
  targetId: CharacterId,
  options?: {
    kinematicHoldDurationSec?: number;
    calmTargetStates?: boolean;
  }
): PreparedSignatureCinematic | null {
  if (ctx.isCinematicActive()) return null;

  const targetAnim = ctx.getAnim(targetId);
  if (!ctx.getAnim(attackerId) || !targetAnim || !ctx.getRig(targetId)) {
    return null;
  }

  ctx.clearKOTimeout();
  ctx.cancelChinuEntry();
  if (attackerId === 'chinu') {
    ctx.resetPriyanshuAdmire();
  }

  ctx.setCinematicActive(true);
  ctx.physics.setMoveInput(attackerId, 0, 0);
  ctx.physics.setMoveInput(targetId, 0, 0);
  ctx.physics.setLocomotionState(attackerId, false, null);
  ctx.physics.setLocomotionState(targetId, false, null);

  if (options?.kinematicHoldDurationSec) {
    ctx.physics.setKinematicHold(true, options.kinematicHoldDurationSec);
  }

  if (
    options?.calmTargetStates &&
    (targetAnim.getState() === 'LOUNGE' ||
      targetAnim.getState() === 'RUN' ||
      targetAnim.getState() === 'ADMIRE')
  ) {
    targetAnim.transitionTo('IDLE', 0.08, true);
  }

  ctx.sound.playClick();
  ctx.syncHUD();

  const needsStandUp =
    targetAnim.getState() === 'FALL_BACK' || targetAnim.getState() === 'DEAD';
  if (needsStandUp) {
    ctx.physics.setKnockedDown(targetId, false);
    targetAnim.transitionTo('GET_UP', 0.08, true);
  }

  return { startDelayMs: needsStandUp ? 480 : 0 };
}

/**
 * Shared knockdown + dizzy stars + timed get-up recovery epilogue after a finisher hit.
 */
export function launchKnockdownAndRecover(
  ctx: SignatureMoveContext,
  defenderId: CharacterId,
  attackerId: CharacterId,
  defenderRig: FighterRig,
  impulseStrength: number,
  options?: {
    starHeight?: number;
    releaseKinematicHoldOnFinish?: boolean;
    cpuCooldownMs?: number;
    beforeKnockdown?: () => void;
    knockdownState?: FighterState;
  }
): void {
  const defenderAnim = ctx.getAnim(defenderId);
  if (!defenderAnim) {
    ctx.setCinematicActive(false);
    return;
  }

  ctx.setTimeScale(1);
  options?.beforeKnockdown?.();
  ctx.physics.setKnockedDown(defenderId, true);
  const isDeadlyStrike = ctx.getFighterHp(defenderId) <= 0;
  const fallState: FighterState =
    isDeadlyStrike && defenderAnim.hasState('DEAD')
      ? 'DEAD'
      : options?.knockdownState && defenderAnim.hasState(options.knockdownState)
        ? options.knockdownState
        : 'FALL_BACK';
  if (defenderAnim.getState() !== fallState || !options?.knockdownState) {
    defenderAnim.transitionTo(fallState, 0.04, true);
  }
  ctx.physics.applyDirectionalImpulse(defenderId, attackerId, impulseStrength);
  ctx.effects.spawnDizzyStars(defenderRig.headAnchor, options?.starHeight ?? 1.55);
  ctx.sound.playMatSlamAndDizzy();

  ctx.scheduleUnscaled(() => {
    const isKOd = ctx.getFighterHp(defenderId) <= 0;
    if (!isKOd) {
      defenderAnim.transitionTo('GET_UP', 0.1, true);
    }

    ctx.scheduleUnscaled(() => {
      if (!isKOd) {
        ctx.physics.setKnockedDown(defenderId, false);
      }
      if (options?.releaseKinematicHoldOnFinish) {
        ctx.physics.setKinematicHold(false);
      }
      ctx.setCinematicActive(false);
      if (options?.cpuCooldownMs) {
        ctx.cpuAi.onCpuInterrupted(performance.now(), options.cpuCooldownMs);
      }
      ctx.syncHUD();
    }, 520);
  }, 1450);
}

export interface ThreeHitFinisherConfig {
  hit1Damage: number;
  hit1Label: string;
  hit2Damage: number;
  hit2Label: string;
  finisherDamage: number;
  finisherFlashHex: number;
  finisherCalloutQuip?: string;
}

/**
 * Parameterized 3-hit arcade combo signature helper (Jab -> Cross -> Heavy Finisher Kick).
 * Used cleanly across fighters with custom labels, damage, flash FX, and voice quips.
 */
export function executeThreeHitFinisher(
  ctx: SignatureMoveContext,
  attackerId: CharacterId,
  defenderId: CharacterId,
  cfg: ThreeHitFinisherConfig
): void {
  if (defenderId === 'chinu' && attackerId !== 'chinu') {
    ctx.triggerBossCounter(attackerId, 'chinu');
    return;
  }

  const attackerAnim = ctx.getAnim(attackerId);
  const defenderAnim = ctx.getAnim(defenderId);
  const defenderRig = ctx.getRig(defenderId);
  if (!attackerAnim || !defenderAnim || !defenderRig) return;

  const prep = prepareSignatureCinematic(ctx, attackerId, defenderId);
  if (!prep) return;

  ctx.scheduleUnscaled(() => {
    ctx.physics.applyDirectionalImpulse(attackerId, defenderId, 4.2);

    if (cfg.finisherCalloutQuip) {
      ctx.setQuip(ctx.getDisplayName(attackerId), cfg.finisherCalloutQuip);
    }

    // Hit 1: Quick Jab
    ctx.sound.playWhoosh(1.1);
    attackerAnim.transitionTo('PUNCH', 0.04, true);

    ctx.scheduleUnscaled(() => {
      const hit1Pos = defenderRig.root.position.clone().setY(1.52);
      defenderAnim.transitionTo('HIT_HEAD', 0.04, true);
      ctx.sound.playPunchHit(ctx.getComboHits() + 1);
      ctx.effects.spawnPunchImpact(hit1Pos, cfg.hit1Damage, cfg.hit1Label);
      ctx.spawnBloodImpact?.(defenderId, attackerId, hit1Pos, cfg.hit1Damage);
      ctx.flashTintFeedback(defenderRig, 0xffffff, 0.65, 0.16);
      ctx.sceneManager.triggerShake(0.12, 0.16);
      ctx.applyDamageToFighter(defenderId, attackerId, cfg.hit1Damage, true);
    }, 150);

    // Hit 2: Follow-up Cross
    ctx.scheduleUnscaled(() => {
      ctx.sound.playWhoosh(1.18);
      attackerAnim.transitionTo('PUNCH', 0.04, true);
      ctx.physics.applyDirectionalImpulse(attackerId, defenderId, 2.5);
    }, 360);

    ctx.scheduleUnscaled(() => {
      const hit2Pos = defenderRig.root.position.clone().setY(1.48);
      defenderAnim.transitionTo('HIT_STOMACH', 0.04, true);
      ctx.sound.playPunchHit(ctx.getComboHits() + 2);
      ctx.effects.spawnPunchImpact(hit2Pos, cfg.hit2Damage, cfg.hit2Label);
      ctx.spawnBloodImpact?.(defenderId, attackerId, hit2Pos, cfg.hit2Damage, 0.25);
      ctx.flashTintFeedback(defenderRig, 0xffffff, 0.75, 0.18);
      ctx.sceneManager.triggerShake(0.15, 0.18);
      ctx.applyDamageToFighter(defenderId, attackerId, cfg.hit2Damage, true);
    }, 500);

    // Hit 3: Finisher Kick + Hit-Stop
    ctx.scheduleUnscaled(() => {
      ctx.sound.playWhoosh(0.8);
      attackerAnim.transitionTo('KICK', 0.04, true);
    }, 720);

    ctx.scheduleUnscaled(() => {
      ctx.setTimeScale(CINEMATIC_FREEZE_TIME_SCALE);
      const finishPos = defenderRig.root.position.clone().setY(1.42);
      ctx.effects.spawnKickOverrideImpact(finishPos, cfg.finisherDamage);
      ctx.spawnBloodImpact?.(defenderId, attackerId, finishPos, cfg.finisherDamage, 0.75);
      ctx.sound.playBossKickImpact();
      ctx.flashTintFeedback(defenderRig, cfg.finisherFlashHex, 0.9, 0.4);
      ctx.sceneManager.triggerDramaticZoom(finishPos, 0.36);
      ctx.sceneManager.triggerShake(0.28, 0.32);

      ctx.recordHitQuip(defenderId);
      ctx.applyDamageToFighter(defenderId, attackerId, cfg.finisherDamage, true);

      ctx.scheduleUnscaled(() => {
        launchKnockdownAndRecover(ctx, defenderId, attackerId, defenderRig, -7.8, {
          starHeight: 1.55,
        });
      }, 360);
    }, 910);
  }, prep.startDelayMs);
}

