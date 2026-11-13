import * as THREE from 'three';
import { ARENA_HALF_WIDTH } from '../../core/ArenaBuilder';
import type { CharacterId } from '../../types/game';
import {
  CINEMATIC_FREEZE_TIME_SCALE,
  launchKnockdownAndRecover,
  prepareSignatureCinematic,
} from '../sharedHelpers';
import type { SignatureMoveContext } from '../types';
import { PutinSpecialMoves } from './PutinSpecialMoves';

export type PutinAbilityKind = 'kgbKnife' | 'theLongTable' | 'matryoshkaMunition';

const ARENA_CLAMP = ARENA_HALF_WIDTH - 0.56;

function clampArenaPoint(pos: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    THREE.MathUtils.clamp(pos.x, -ARENA_CLAMP, ARENA_CLAMP),
    pos.y,
    THREE.MathUtils.clamp(pos.z, -ARENA_CLAMP, ARENA_CLAMP)
  );
}

function getOpponentGroanQuip(targetId: CharacterId): string {
  switch (targetId) {
    case 'priyanshu':
      return 'Aaarghh...!! Not like this...!! 💀';
    case 'modiji':
      return 'He Ram...!! 🩸';
    case 'trump':
      return 'Fake news... that hurt bigly...!! 😫';
    case 'amitabh':
      return 'Hai Ram... yeh kya kiya...!! 💀';
    case 'chinu':
      return 'Urkkk...!! 💔';
    default:
      return 'Urrrghh... bloody hell...!! 🩸';
  }
}

/**
 * In-game orchestrator wiring `PutinSpecialMoves` (Three.js + GSAP) into
 * `AnimationController`, `PhysicsCombatSystem`, `EffectsManager`, and `SoundManager`.
 */
export function runPutinSpecialAbility(
  ctx: SignatureMoveContext,
  attackerId: CharacterId,
  targetId: CharacterId,
  ability: PutinAbilityKind
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

  const prep = prepareSignatureCinematic(ctx, attackerId, targetId, {
    kinematicHoldDurationSec: 7.5,
  });
  if (!prep) return;

  // Allow close point-blank knife proximity without physics cylinder push-back
  ctx.physics.setKinematicHold(true, 0.38);

  ctx.scheduleUnscaled(() => {
    let tableHitHandled = false;

    const putinMoves = new PutinSpecialMoves(
      attackerRig.root,
      targetRig.root,
      ctx.sceneManager.scene,
      {
        mixer: attackerAnim.getMixer(),
        stompAction:
          attackerAnim.getAction('KICK') ??
          attackerAnim.getAction('POSE') ??
          attackerAnim.getAction('PUNCH'),
        throwAction: attackerAnim.getAction('PUNCH') ?? attackerAnim.getAction('POSE'),
        opponentMixer: targetAnim.getMixer(),
        opponentHitAction: targetAnim.getAction('HIT'),
        facingTarget: attackerRig.modelRoot,
        opponentFacingTarget: targetRig.modelRoot,
        getCharacterPosition: () =>
          ctx.physics.getBodyPosition(attackerId) ?? attackerRig.root.position,
        setCharacterPosition: (x, z) => {
          ctx.physics.setBodyPositionXZ(attackerId, x, z);
        },
        getOpponentPosition: () =>
          ctx.physics.getBodyPosition(targetId) ?? targetRig.root.position,
        setOpponentPosition: (x, z) => {
          ctx.physics.setBodyPositionXZ(targetId, x, z);
        },
        clampTargetPosition: clampArenaPoint,

        // KGB Cold Blade Callbacks
        onTriggerLiftingAnimation: () => {
          attackerAnim.transitionTo('LIFTING', 0.08, true);
          ctx.sound.playSignatureCharge();
          ctx.setQuip(ctx.getDisplayName(attackerId), 'No diplomacy today... 🗡️');
        },
        onKnifeSpawn: () => {
          ctx.sound.playWhoosh(1.35);
          const handBone = putinMoves.findRightHandBone();
          const spawnPos = handBone
            ? handBone.getWorldPosition(new THREE.Vector3())
            : attackerRig.root.position.clone().add(new THREE.Vector3(0, 0.9, 0.3));
          ctx.effects.spawnSignatureAura(spawnPos);
        },
        onTriggerStabbingAnimation: () => {
          attackerAnim.transitionTo('STABBING', 0.06, true);
          ctx.sound.playWhoosh(1.0);
        },
        onKnifeStabImpact: (impactPos, damage) => {
          targetAnim.transitionTo('HIT', 0.04, true);
          ctx.setTimeScale(CINEMATIC_FREEZE_TIME_SCALE);
          ctx.sound.playSignatureImpact();
          const hitPoint = impactPos.clone().setY(1.35);
          ctx.effects.spawnPunchImpact(hitPoint, damage, 'KGB CRITICAL STAB! 🗡️💥');
          ctx.spawnBloodImpact?.(targetId, attackerId, hitPoint, damage, 1.0);
          ctx.flashTintFeedback(targetRig, 0xff1133, 0.95, 0.4);
          ctx.wobbleHeadOnImpact(targetRig);
          ctx.sceneManager.triggerDramaticZoom(hitPoint, 0.45);
          ctx.sceneManager.triggerShake(0.38, 0.35);
          ctx.recordHitQuip(targetId);
          ctx.applyDamageToFighter(targetId, attackerId, damage, true);
          ctx.setQuip(ctx.getDisplayName(targetId), getOpponentGroanQuip(targetId));
        },
        onOpponentGroanAndDie: () => {
          ctx.setTimeScale(1.0);
          const isDead = ctx.getFighterHp(targetId) <= 0;
          const fallState = isDead && targetAnim.hasState('DEAD') ? 'DEAD' : 'FALL_BACK';
          targetAnim.transitionTo(fallState, 0.04, true);
          ctx.physics.setKnockedDown(targetId, true);
          ctx.physics.applyDirectionalImpulse(targetId, attackerId, -4.8);
          ctx.effects.spawnDizzyStars(targetRig.headAnchor, 1.55);
          ctx.sound.playMatSlamAndDizzy();
        },
        onTriggerSaluteAnimation: () => {
          attackerAnim.transitionTo('SALUTE', 0.08, true);
        },
        onSaluteStart: () => {
          ctx.sound.playSignatureCharge();
          ctx.setQuip(ctx.getDisplayName(attackerId), 'Mission accomplished. До свидания. 🎖️');
        },

        // Legacy / Other Move Callbacks
        onTriggerStompAnimation: () => {
          attackerAnim.transitionTo(
            attackerAnim.hasState('KICK') ? 'KICK' : 'POSE',
            0.06,
            true
          );
        },
        onTriggerThrowAnimation: () => {
          attackerAnim.transitionTo(
            attackerAnim.hasState('PUNCH') ? 'PUNCH' : 'POSE',
            0.06,
            true
          );
        },
        onTriggerOpponentHit: (heavy) => {
          if (heavy) {
            targetAnim.transitionTo('HIT_CAR', 0.04, true);
          } else {
            targetAnim.transitionTo('HIT', 0.04, true);
          }
        },
        onTableSpawn: (spawnPos) => {
          ctx.sound.playSignatureCharge();
          ctx.effects.spawnSignatureAura(spawnPos.clone().setY(0.12));
          ctx.setQuip(ctx.getDisplayName(attackerId), 'BEHOLD... THE LONG TABLE!! 🪑⚡');
        },
        onTableHit: (impactPos, pushDir, _edgePos, damage) => {
          tableHitHandled = true;
          targetAnim.transitionTo('HIT_CAR', 0.04, true);
          ctx.setTimeScale(CINEMATIC_FREEZE_TIME_SCALE);
          ctx.sound.playSignatureImpact();
          const hitPoint = impactPos.clone().setY(1.42);
          ctx.effects.spawnPunchImpact(hitPoint, damage, 'DIPLOMACY SLAM! 🪑');
          ctx.spawnBloodImpact?.(targetId, attackerId, hitPoint, damage, 0.85);
          ctx.flashTintFeedback(targetRig, 0xf8fafc, 0.95, 0.36);
          ctx.wobbleHeadOnImpact(targetRig);
          ctx.sceneManager.triggerDramaticZoom(hitPoint, 0.34);
          ctx.sceneManager.triggerShake(0.3, 0.32);
          ctx.recordHitQuip(targetId);
          ctx.applyDamageToFighter(targetId, attackerId, damage, true);

          ctx.scheduleUnscaled(() => {
            ctx.physics.applyImpulse(targetId, pushDir.x * 3.2, pushDir.z * 3.2);
            launchKnockdownAndRecover(ctx, targetId, attackerId, targetRig, -5.8, {
              starHeight: 1.55,
              cpuCooldownMs: 1100,
              knockdownState: 'HIT_CAR',
            });
          }, 260);
        },
        onTableStrikeResolved: (opponentHit) => {
          if (!opponentHit && !tableHitHandled) {
            ctx.scheduleUnscaled(() => {
              ctx.setCinematicActive(false);
              ctx.syncHUD();
            }, 320);
          }
        },
        onMatryoshkaThrow: (spawnPos) => {
          ctx.sound.playWhoosh(1.1);
          ctx.effects.spawnSignatureAura(spawnPos.clone().setY(0.25));
          ctx.setQuip(ctx.getDisplayName(attackerId), 'MATRYOSHKA MUNITION!! 🪆🔥');
        },
        onMatryoshkaExplosion: (event) => {
          ctx.sound.playSignatureImpact();
          ctx.sceneManager.triggerShake(event.step === 3 ? 0.28 : 0.16, 0.22);

          if (!event.opponentHit) return;

          const hitPos = targetRig.root.position.clone().setY(1.3);
          const label = event.step === 3 ? 'NESTING KO! 💥' : 'DOLL POP! 🪆';
          ctx.effects.spawnPunchImpact(hitPos, event.damage, label);
          ctx.spawnBloodImpact?.(
            targetId,
            attackerId,
            hitPos,
            event.damage,
            event.step === 3 ? 0.75 : 0.35
          );
          ctx.flashTintFeedback(targetRig, 0xff7a00, 0.85, 0.24);
          ctx.wobbleHeadOnImpact(targetRig);
          ctx.physics.applyImpulse(targetId, event.pushDir.x * 2.4, event.pushDir.z * 2.4);
          ctx.recordHitQuip(targetId);
          ctx.applyDamageToFighter(targetId, attackerId, event.damage, true);

          if (event.step === 3) {
            ctx.sceneManager.triggerDramaticZoom(hitPos, 0.26);
          }
        },
      }
    );

    ctx.registerTransientDisposable?.(putinMoves);

    const runPromise =
      ability === 'matryoshkaMunition'
        ? putinMoves.executeMatryoshkaMunition()
        : putinMoves.executeKgbKnife();

    void runPromise.then(() => {
      if ((ability === 'kgbKnife' || ability === 'theLongTable') && ctx.isCinematicActive()) {
        ctx.physics.setKinematicHold(false);
        const isKOd = ctx.getFighterHp(targetId) <= 0;
        if (!isKOd) {
          targetAnim.transitionTo('GET_UP', 0.1, true);
          ctx.scheduleUnscaled(() => {
            ctx.physics.setKnockedDown(targetId, false);
            ctx.setCinematicActive(false);
            ctx.cpuAi.onCpuInterrupted(performance.now(), 850);
            ctx.syncHUD();
          }, 520);
        } else {
          // Keep opponent down in DEAD state and restore cinematic
          ctx.setCinematicActive(false);
          ctx.syncHUD();
        }
      } else if (ability === 'matryoshkaMunition' && ctx.isCinematicActive()) {
        ctx.physics.setKinematicHold(false);
        if (ctx.getFighterHp(targetId) <= 0) {
          launchKnockdownAndRecover(ctx, targetId, attackerId, targetRig, -5.4, {
            starHeight: 1.55,
          });
        } else {
          ctx.setCinematicActive(false);
          ctx.cpuAi.onCpuInterrupted(performance.now(), 750);
          ctx.syncHUD();
        }
      }
      putinMoves.dispose();
    });
  }, prep.startDelayMs);
}
