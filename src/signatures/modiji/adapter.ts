import type { CharacterId } from '../../types/game';
import { prepareSignatureCinematic } from '../sharedHelpers';
import type { SignatureMoveContext } from '../types';
import { ModijiSpecialMoves } from './ModijiSpecialMoves';

export type ModijiAbilityKind = 'mitronSonicBoom' | 'chaiBreak';

/**
 * In-game orchestrator connecting `ModijiSpecialMoves` (Three.js + GSAP) to
 * `AnimationController`, `PhysicsCombatSystem`, `EffectsManager`, `SoundManager`,
 * and HUD health synchronization.
 */
export function runModijiSpecialAbility(
  ctx: SignatureMoveContext,
  attackerId: CharacterId,
  targetId: CharacterId,
  ability: ModijiAbilityKind
): void {
  if (ability === 'mitronSonicBoom' && targetId === 'chinu' && attackerId !== 'chinu') {
    ctx.triggerBossCounter(attackerId, 'chinu');
    return;
  }

  const attackerRig = ctx.getRig(attackerId);
  const attackerAnim = ctx.getAnim(attackerId);
  const targetRig = ctx.getRig(targetId);
  const targetAnim = ctx.getAnim(targetId);
  if (!attackerRig || !attackerAnim || !targetRig || !targetAnim) return;

  const prep = prepareSignatureCinematic(ctx, attackerId, targetId);
  if (!prep) return;

  ctx.scheduleUnscaled(() => {
    const modijiMoves = new ModijiSpecialMoves(
      attackerRig.root,
      targetRig.root,
      ctx.sceneManager.scene,
      {
        mixer: attackerAnim.getMixer(),
        speakingAction: attackerAnim.getAction('ENTRY') ?? attackerAnim.getAction('POSE'),
        drinkAction:
          attackerAnim.getAction('POSE') ??
          attackerAnim.getAction('DANCE') ??
          attackerAnim.getAction('IDLE'),
        opponentMixer: targetAnim.getMixer(),
        opponentStunAction: targetAnim.getAction('HIT'),
        facingTarget: attackerRig.modelRoot,
        getOpponentPosition: () =>
          ctx.physics.getBodyPosition(targetId) ?? targetRig.root.position,
        onTriggerSpeakingAnimation: () => {
          const speakState = attackerAnim.hasState('ENTRY') ? 'ENTRY' : 'POSE';
          attackerAnim.transitionTo(speakState, 0.08, true);
        },
        onTriggerDrinkAnimation: () => {
          const drinkState = attackerAnim.hasState('POSE')
            ? 'POSE'
            : attackerAnim.hasState('DANCE')
              ? 'DANCE'
              : 'IDLE';
          attackerAnim.transitionTo(drinkState, 0.08, true);
        },
        onTriggerOpponentStun: (durationSec) => {
          targetAnim.transitionTo('HIT', 0.05, true);
          ctx.effects.spawnDizzyStars(targetRig.headAnchor, durationSec);
        },
        setOpponentMovementPaused: (paused) => {
          ctx.physics.setMovementPaused?.(targetId, paused);
          if (paused) {
            if (ctx.interruptFighterAi) {
              ctx.interruptFighterAi(targetId, 2000);
            } else {
              ctx.cpuAi.onCpuInterrupted(performance.now(), 2000);
            }
          }
        },
        onSonicBoomSpawn: (origin) => {
          ctx.sound.playSignatureCharge();
          ctx.effects.spawnSignatureAura(origin);
          ctx.setQuip(ctx.getDisplayName(attackerId), 'MITRON!! SONIC BOOM!! 🔊🔥');
          ctx.sceneManager.triggerShake(0.24, 0.45);
        },
        onSonicBoomImpact: (_origin, opponentHit, _dist, damage) => {
          if (opponentHit) {
            ctx.sound.playSignatureImpact();
            const hitPos = targetRig.root.position.clone().setY(1.42);
            ctx.effects.spawnPunchImpact(hitPos, damage, 'MITRON!! 🔊');
            ctx.spawnBloodImpact?.(targetId, attackerId, hitPos, damage, 0.65);
            ctx.flashTintFeedback(targetRig, 0xff7a00, 0.9, 0.35);
            ctx.wobbleHeadOnImpact(targetRig);
            ctx.sceneManager.triggerDramaticZoom(hitPos, 0.28);
            ctx.recordHitQuip(targetId);
            ctx.applyDamageToFighter(targetId, attackerId, damage, true);
          }
          ctx.scheduleUnscaled(() => {
            ctx.setCinematicActive(false);
            ctx.syncHUD();
          }, 620);
        },
        getHealth: () => ctx.getFighterHp(attackerId),
        setHealth: () => {
          // Applied through restoreFighterHpPercent below so UI + clamps stay unified.
        },
        onChaiBreakStart: () => {
          ctx.sound.playHeal();
          ctx.setQuip(ctx.getDisplayName(attackerId), 'CHAI BREAK!! +20% ENERGY ☕✨');
          const healPos = attackerRig.root.position.clone().setY(1.65);
          const result = ctx.restoreFighterHpPercent?.(attackerId, 0.2);
          ctx.effects.spawnHealBurst?.(healPos, result?.restored ?? 20, 'CHAI BUFF! ☕');
          ctx.syncHUD();
          ctx.scheduleUnscaled(() => {
            ctx.setCinematicActive(false);
            ctx.syncHUD();
          }, 900);
        },
      }
    );

    ctx.registerTransientDisposable?.(modijiMoves);

    const runPromise =
      ability === 'mitronSonicBoom'
        ? modijiMoves.executeMitronSonicBoom()
        : modijiMoves.executeChaiBreak();

    void runPromise.then(() => {
      modijiMoves.dispose();
    });
  }, prep.startDelayMs);
}

