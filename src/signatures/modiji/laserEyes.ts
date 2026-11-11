import gsap from 'gsap';
import * as THREE from 'three';
import { CharacterFactory } from '../../characters/CharacterFactory';
import type { CharacterId } from '../../types/game';
import {
  CINEMATIC_FREEZE_TIME_SCALE,
  launchKnockdownAndRecover,
  prepareSignatureCinematic,
} from '../sharedHelpers';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';

const MODIJI_LASER_QUIPS = [
  'MITRON!! WITNESS LASER EYES!! 👁️🔥',
  'THERMAL LASER VISION — FULL POWER!! 🔥⚡',
  'NOBODY DODGES THE GAZE!! 😎🔥',
] as const;

export const laserEyesSignature: SignatureMoveDefinition = {
  ownerId: 'modiji',
  meta: {
    id: 'laser-eyes',
    name: 'Laser Eyes',
    buttonLabel: 'LASER EYES!',
    buttonSub: 'Burn Opponent 🔥',
    description: 'Charges twin plasma eyes and scorches the opponent with continuous crimson beams.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
    if (targetId === 'chinu') {
      ctx.triggerBossCounter(attackerId, 'chinu');
      return;
    }

    const attackerRig = ctx.getRig(attackerId);
    const targetRig = ctx.getRig(targetId);
    const attackerAnim = ctx.getAnim(attackerId);
    const targetAnim = ctx.getAnim(targetId);
    if (!attackerRig || !targetRig || !attackerAnim || !targetAnim) return;

    const prep = prepareSignatureCinematic(ctx, attackerId, targetId, {
      kinematicHoldDurationSec: 1.55,
    });
    if (!prep) return;

    ctx.scheduleUnscaled(() => {
      const mPos =
        ctx.physics.getBodyPosition(attackerId)?.clone() ?? attackerRig.root.position.clone();
      const tPos =
        ctx.physics.getBodyPosition(targetId)?.clone() ?? targetRig.root.position.clone();
      const delta = tPos.clone().sub(mPos).setY(0);
      const dist = delta.length() || 1;
      const dir = delta.clone().divideScalar(dist);

      let goalTargetX = tPos.x;
      let goalTargetZ = tPos.z;
      if (dist < 1.85 || dist > 2.9) {
        const desiredDist = THREE.MathUtils.clamp(dist, 2.05, 2.55);
        goalTargetX = THREE.MathUtils.clamp(mPos.x + dir.x * desiredDist, -2.1, 2.1);
        goalTargetZ = THREE.MathUtils.clamp(mPos.z + dir.z * desiredDist, -2.1, 2.1);
      }

      const aimDx = goalTargetX - mPos.x;
      const aimDz = goalTargetZ - mPos.z;
      const attackerYaw = Math.atan2(aimDx, aimDz);
      const targetYaw = Math.atan2(-aimDx, -aimDz);

      gsap.to(attackerRig.modelRoot.rotation, { y: attackerYaw, duration: 0.22, ease: 'power2.out' });
      gsap.to(targetRig.modelRoot.rotation, { y: targetYaw, duration: 0.22, ease: 'power2.out' });

      const slide = { x: tPos.x, z: tPos.z };
      gsap.to(slide, {
        x: goalTargetX,
        z: goalTargetZ,
        duration: 0.24,
        ease: 'power2.out',
        onUpdate: () => {
          ctx.physics.setBodyPositionXZ(targetId, slide.x, slide.z);
        },
      });

      // Phase 1: Power Stare + Immediate Red Eye Charge
      attackerAnim.transitionTo('LASER_EYES', 0.08, true);
      ctx.sound.playLaserCharge();
      const quipIdx = ctx.nextQuipIndex();
      ctx.setQuip(
        ctx.getDisplayName(attackerId),
        MODIJI_LASER_QUIPS[quipIdx % MODIJI_LASER_QUIPS.length]
      );

      const eyeMid = mPos
        .clone()
        .lerp(new THREE.Vector3(goalTargetX, 0, goalTargetZ), 0.45)
        .setY(1.68);
      ctx.sceneManager.triggerDramaticZoom(eyeMid, 0.45);

      const immediateOrigins = CharacterFactory.getEyeOriginsWorld(attackerRig);
      ctx.effects.spawnLaserEyeCharge(immediateOrigins.left, immediateOrigins.right);

      ctx.scheduleUnscaled(() => {
        const origins = CharacterFactory.getEyeOriginsWorld(attackerRig);
        ctx.effects.spawnLaserEyeCharge(origins.left, origins.right);
      }, 140);

      // Phase 2: Continuous Twin Crimson Laser Beams + Scorch Ticks
      ctx.scheduleUnscaled(() => {
        ctx.sound.playLaserBeam(0.84);
        ctx.effects.spawnLaserEyeBeam(
          () => CharacterFactory.getEyeOriginsWorld(attackerRig),
          () => targetRig.root.position.clone().setY(1.42),
          0.84
        );
        ctx.sceneManager.triggerShake(0.16, 0.82);
      }, 380);

      ctx.scheduleUnscaled(() => {
        const hitPos = targetRig.root.position.clone().setY(1.42);
        targetAnim.transitionTo('HIT', 0.04, true);
        ctx.flashTintFeedback(targetRig, 0xff4500, 0.88, 0.28);
        ctx.wobbleHeadOnImpact(targetRig);
        ctx.effects.spawnLaserBurnImpact(hitPos, 14, 'SEAR!', false);
        ctx.applyDamageToFighter(targetId, attackerId, 14, true);
      }, 450);

      ctx.scheduleUnscaled(() => {
        const hitPos = targetRig.root.position.clone().setY(1.46);
        targetAnim.transitionTo('HIT', 0.04, true);
        ctx.flashTintFeedback(targetRig, 0xff2200, 0.94, 0.28);
        ctx.wobbleHeadOnImpact(targetRig);
        ctx.effects.spawnLaserBurnImpact(hitPos, 16, 'BURN!!', false);
        ctx.applyDamageToFighter(targetId, attackerId, 16, true);
      }, 770);

      // Phase 3: Thermal Blast Finisher + Hit-Stop
      ctx.scheduleUnscaled(() => {
        ctx.setTimeScale(CINEMATIC_FREEZE_TIME_SCALE);
        const finishPos = targetRig.root.position.clone().setY(1.42);
        ctx.sound.playLaserBurnExplosion();
        ctx.effects.spawnLaserBurnImpact(finishPos, 24, 'FRIED! 🔥', true);
        ctx.flashTintFeedback(targetRig, 0xff3b00, 1.0, 0.45);
        ctx.sceneManager.triggerDramaticZoom(finishPos, 0.36);
        ctx.sceneManager.triggerShake(0.32, 0.36);

        ctx.recordHitQuip(targetId);
        ctx.applyDamageToFighter(targetId, attackerId, 24, true);

        ctx.scheduleUnscaled(() => {
          launchKnockdownAndRecover(ctx, targetId, attackerId, targetRig, -8.4, {
            starHeight: 1.6,
            releaseKinematicHoldOnFinish: true,
            cpuCooldownMs: 1350,
            beforeKnockdown: () => attackerAnim.transitionTo('IDLE', 0.14, true),
          });
        }, 360);
      }, 1160);
    }, prep.startDelayMs);
  },
};

