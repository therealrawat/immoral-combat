import type { CharacterId } from '../../types/game';
import {
  CINEMATIC_FREEZE_TIME_SCALE,
  launchKnockdownAndRecover,
  prepareSignatureCinematic,
} from '../sharedHelpers';
import type { SignatureMoveContext } from '../types';
import { TrumpSpecialMoves } from './TrumpSpecialMoves';

export type TrumpAbilityKind = 'youreFired' | 'buildTheWall';

/**
 * Shared in-game orchestrator binding `TrumpSpecialMoves` (Three.js + GSAP) to
 * `AnimationController`, `PhysicsCombatSystem`, `EffectsManager`, and `SoundManager`.
 */
export function runTrumpSpecialAbility(
  ctx: SignatureMoveContext,
  attackerId: CharacterId,
  targetId: CharacterId,
  ability: TrumpAbilityKind
): void {
  if (targetId === 'chinu' && attackerId !== 'chinu') {
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
    const trumpMoves = new TrumpSpecialMoves(
      attackerRig.root,
      targetRig.root,
      ctx.sceneManager.scene,
      {
        mixer: attackerAnim.getMixer(),
        castAction: attackerAnim.getAction('POSE') ?? attackerAnim.getAction('PUNCH'),
        defensiveAction: attackerAnim.getAction('DANCE') ?? attackerAnim.getAction('IDLE'),
        opponentMixer: targetAnim.getMixer(),
        opponentHitAction: targetAnim.getAction('HIT'),
        facingTarget: attackerRig.modelRoot,
        getOpponentPosition: () =>
          ctx.physics.getBodyPosition(targetId) ?? targetRig.root.position,
        setOpponentPosition: (x, z) => {
          ctx.physics.setBodyPositionXZ(targetId, x, z);
        },
        onTriggerCastAnimation: () => {
          attackerAnim.transitionTo(attackerAnim.hasState('POSE') ? 'POSE' : 'PUNCH', 0.06, true);
        },
        onTriggerDefensiveAnimation: () => {
          attackerAnim.transitionTo(
            attackerAnim.hasState('DANCE') ? 'DANCE' : 'IDLE',
            0.08,
            true
          );
        },
        onTriggerOpponentHit: (heavy) => {
          if (!heavy) {
            targetAnim.transitionTo('HIT', 0.04, true);
          }
        },
        onProjectileSpawn: (spawnPos) => {
          ctx.sound.playSignatureCharge();
          ctx.effects.spawnSignatureAura(spawnPos.clone().setY(0.15));
          ctx.setQuip(ctx.getDisplayName(attackerId), "YOU'RE FIRED!! 👉🔥");
        },
        onProjectileImpact: (impactPos, hitDir, damage) => {
          ctx.sound.playSignatureImpact();
          ctx.effects.spawnPunchImpact(impactPos, damage, 'FIRED! 🔥');
          ctx.spawnBloodImpact?.(targetId, attackerId, impactPos, damage, 0.65);
          ctx.flashTintFeedback(targetRig, 0xff6b00, 0.9, 0.32);
          ctx.wobbleHeadOnImpact(targetRig);
          ctx.sceneManager.triggerDramaticZoom(impactPos, 0.28);
          ctx.sceneManager.triggerShake(0.24, 0.28);
          ctx.physics.applyImpulse(targetId, hitDir.x * 5.4, hitDir.z * 5.4);
          ctx.recordHitQuip(targetId);
          ctx.applyDamageToFighter(targetId, attackerId, damage, true);

          if (ctx.getFighterHp(targetId) <= 0) {
            ctx.setTimeScale(CINEMATIC_FREEZE_TIME_SCALE);
            ctx.scheduleUnscaled(() => {
              launchKnockdownAndRecover(ctx, targetId, attackerId, targetRig, -7.2, {
                starHeight: 1.55,
              });
            }, 260);
          } else {
            ctx.scheduleUnscaled(() => {
              ctx.setCinematicActive(false);
              ctx.cpuAi.onCpuInterrupted(performance.now(), 750);
              ctx.syncHUD();
            }, 340);
          }
        },
        onWallSpawn: () => {
          ctx.sound.playWhoosh(0.75);
          ctx.setQuip(ctx.getDisplayName(attackerId), 'BUILD THE WALL!! 🧱👑');
        },
        onWallLandImpact: (wallPos, opponentHit, pushDir, damage) => {
          ctx.sound.playSignatureImpact();
          ctx.effects.spawnSignatureAura(wallPos);
          ctx.sceneManager.triggerShake(0.3, 0.32);

          if (!opponentHit) {
            ctx.scheduleUnscaled(() => {
              ctx.setCinematicActive(false);
              ctx.syncHUD();
            }, 420);
            return;
          }

          ctx.setTimeScale(CINEMATIC_FREEZE_TIME_SCALE);
          const impactPoint = targetRig.root.position.clone().setY(1.4);
          ctx.effects.spawnPunchImpact(impactPoint, damage, 'WALL SLAM! 🧱');
          ctx.spawnBloodImpact?.(targetId, attackerId, impactPoint, damage, 0.85);
          ctx.flashTintFeedback(targetRig, 0xfacc15, 0.95, 0.36);
          ctx.wobbleHeadOnImpact(targetRig);
          ctx.sceneManager.triggerDramaticZoom(impactPoint, 0.34);
          ctx.recordHitQuip(targetId);
          ctx.applyDamageToFighter(targetId, attackerId, damage, true);

          ctx.scheduleUnscaled(() => {
            ctx.physics.applyImpulse(targetId, pushDir.x * 3.5, pushDir.z * 3.5);
            launchKnockdownAndRecover(ctx, targetId, attackerId, targetRig, -6.5, {
              starHeight: 1.55,
              cpuCooldownMs: 1100,
            });
          }, 260);
        },
      }
    );

    ctx.registerTransientDisposable?.(trumpMoves);

    const runPromise =
      ability === 'youreFired'
        ? trumpMoves.executeYoureFired()
        : trumpMoves.executeBuildTheWall();

    void runPromise.then(() => {
      trumpMoves.dispose();
    });
  }, prep.startDelayMs);
}
