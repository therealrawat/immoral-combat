import gsap from 'gsap';
import * as THREE from 'three';
import type { CharacterId } from '../../types/game';
import { launchKnockdownAndRecover, prepareSignatureCinematic } from '../sharedHelpers';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';

const SIGNATURE_SLAP_1_DAMAGE = 10;
const SIGNATURE_SLAP_2_DAMAGE = 10;
const SIGNATURE_SLAP_3_DAMAGE = 25;

export const bossSpankSignature: SignatureMoveDefinition = {
  ownerId: 'chinu',
  meta: {
    id: 'boss-spank',
    name: 'Boss Spank',
    buttonLabel: 'SIGNATURE!',
    buttonSub: 'Boss Spank 👋',
    description: 'Steps behind the opponent, bends them over, and delivers 3 whipping open-palm slaps.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
    const chinuRig = ctx.getRig(attackerId);
    const chinuAnim = ctx.getAnim(attackerId);
    const targetRig = ctx.getRig(targetId);
    const targetAnim = ctx.getAnim(targetId);
    if (!chinuRig || !chinuAnim || !targetRig || !targetAnim) return;

    const prep = prepareSignatureCinematic(ctx, attackerId, targetId, { calmTargetStates: true });
    if (!prep) return;

    ctx.scheduleUnscaled(() => {
      const chinuPos =
        ctx.physics.getBodyPosition(attackerId)?.clone() ?? new THREE.Vector3(-1, 0, 0);
      const targetPos =
        ctx.physics.getBodyPosition(targetId)?.clone() ?? new THREE.Vector3(1, 0, 0);

      targetPos.x = THREE.MathUtils.clamp(targetPos.x, -2.1, 2.1);
      targetPos.z = THREE.MathUtils.clamp(targetPos.z, -2.1, 2.1);
      ctx.physics.setBodyPositionXZ(targetId, targetPos.x, targetPos.z);

      const dirToChinu = chinuPos.clone().sub(targetPos);
      dirToChinu.y = 0;
      if (dirToChinu.lengthSq() < 0.001) {
        dirToChinu.set(-1, 0, 0);
      } else {
        dirToChinu.normalize();
      }

      const spankDist = 0.56;
      const sideDir = new THREE.Vector3(-dirToChinu.z, 0, dirToChinu.x);
      if (sideDir.lengthSq() < 0.001) {
        sideDir.set(0, 0, 1);
      } else {
        sideDir.normalize();
        if (sideDir.z < 0) sideDir.negate();
      }

      // Stagger Chinu toward back-diagonal so camera sees clear open-palm swings & hip contact
      const spankSpotX = THREE.MathUtils.clamp(
        targetPos.x + dirToChinu.x * spankDist - sideDir.x * 0.22,
        -2.25,
        2.25
      );
      const spankSpotZ = THREE.MathUtils.clamp(
        targetPos.z + dirToChinu.z * spankDist - sideDir.z * 0.22,
        -2.25,
        2.25
      );
      const chinuSpankYaw = Math.atan2(targetPos.x - spankSpotX, targetPos.z - spankSpotZ);
      const targetBentYaw =
        Math.atan2(-dirToChinu.x, -dirToChinu.z) + (dirToChinu.x < 0 ? 0.16 : -0.16);

      const spankCenter = new THREE.Vector3(
        (spankSpotX + targetPos.x) * 0.5,
        1.45,
        (spankSpotZ + targetPos.z) * 0.5
      );

      ctx.cpuAi.onCpuInterrupted(performance.now(), 3200);
      ctx.physics.setKinematicHold(true, 0.44);
      chinuRig.modelRoot.rotation.y = Math.atan2(-dirToChinu.x, -dirToChinu.z);
      targetRig.modelRoot.rotation.y = targetBentYaw;
      chinuAnim.transitionTo('RUN', 0.05);
      ctx.sceneManager.triggerSpankCloseUp(spankCenter, dirToChinu, 1.05);

      const glideState = { x: chinuPos.x, z: chinuPos.z };
      gsap.to(glideState, {
        x: spankSpotX,
        z: spankSpotZ,
        duration: 0.25,
        ease: 'power2.out',
        onUpdate: () => {
          ctx.physics.setBodyPositionXZ(attackerId, glideState.x, glideState.z);
        },
        onComplete: () => {
          chinuRig.modelRoot.rotation.y = chinuSpankYaw;
          targetRig.modelRoot.rotation.y = targetBentYaw;

          chinuAnim.transitionTo('SIGNATURE', 0.05, true);
          targetAnim.transitionTo('SPANKED', 0.06, true);

          const spankPoint = targetPos
            .clone()
            .add(new THREE.Vector3(dirToChinu.x * 0.22, 1.04, dirToChinu.z * 0.22));
          const targetName = ctx.getDisplayName(targetId);

          // Slap 1 (240ms)
          ctx.scheduleUnscaled(() => {
            ctx.sound.playSpankSlap(false);
            ctx.effects.spawnSpankImpact(spankPoint, 1, SIGNATURE_SLAP_1_DAMAGE, dirToChinu);
            ctx.spawnBloodImpact?.(targetId, attackerId, spankPoint, SIGNATURE_SLAP_1_DAMAGE);
            ctx.flashTintFeedback(targetRig, 0xff3b7f, 0.55, 0.18);
            ctx.wobbleHeadOnImpact(targetRig);
            ctx.sceneManager.triggerShake(0.14, 0.16);
            ctx.setQuip(targetName, 'HEY!! WATCH IT!! 😳');
            ctx.applyDamageToFighter(targetId, attackerId, SIGNATURE_SLAP_1_DAMAGE, true);
          }, 240);

          // Slap 2 (460ms)
          ctx.scheduleUnscaled(() => {
            ctx.sound.playSpankSlap(false);
            ctx.effects.spawnSpankImpact(spankPoint, 2, SIGNATURE_SLAP_2_DAMAGE, dirToChinu);
            ctx.spawnBloodImpact?.(targetId, attackerId, spankPoint, SIGNATURE_SLAP_2_DAMAGE, 0.25);
            ctx.flashTintFeedback(targetRig, 0xff3b7f, 0.68, 0.18);
            ctx.wobbleHeadOnImpact(targetRig);
            ctx.sceneManager.triggerShake(0.18, 0.18);
            ctx.setQuip(targetName, 'OWW!! STOP THAT!! 😭');
            ctx.applyDamageToFighter(targetId, attackerId, SIGNATURE_SLAP_2_DAMAGE, true);
          }, 460);

          // Slap 3 Finisher (720ms) -> Hit-Stop + Launch
          ctx.scheduleUnscaled(() => {
            ctx.setTimeScale(0.06);
            ctx.sound.playSpankSlap(true);
            ctx.effects.spawnSpankImpact(spankPoint, 3, SIGNATURE_SLAP_3_DAMAGE, dirToChinu);
            ctx.spawnBloodImpact?.(targetId, attackerId, spankPoint, SIGNATURE_SLAP_3_DAMAGE, 0.85);
            ctx.flashTintFeedback(targetRig, 0xff1e56, 0.92, 0.45);
            ctx.wobbleHeadOnImpact(targetRig);
            ctx.sceneManager.triggerShake(0.32, 0.34);

            ctx.setQuip(targetName, 'OWW!! MERCY!! 🔥😭');
            ctx.applyDamageToFighter(targetId, attackerId, SIGNATURE_SLAP_3_DAMAGE, true);

            ctx.scheduleUnscaled(() => {
              launchKnockdownAndRecover(ctx, targetId, attackerId, targetRig, -8.6, {
                starHeight: 1.55,
                cpuCooldownMs: 900,
                beforeKnockdown: () => {
                  ctx.physics.setKinematicHold(false);
                  targetRig.modelRoot.rotation.y = Math.atan2(dirToChinu.x, dirToChinu.z);
                },
              });
            }, 310);
          }, 720);
        },
      });
    }, prep.startDelayMs);
  },
};

