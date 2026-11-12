import type { CharacterId } from '../../types/game';
import {
  CINEMATIC_FREEZE_TIME_SCALE,
  launchKnockdownAndRecover,
  prepareSignatureCinematic,
} from '../sharedHelpers';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';

export const agneepathBlastSignature: SignatureMoveDefinition = {
  ownerId: 'amitabh',
  meta: {
    id: 'agneepath-blast',
    name: 'Agneepath Blast',
    buttonLabel: 'AGNEEPATH!',
    buttonSub: 'Vijay Blast 🔥',
    description: 'Chants Vijay Dinanath Chauhan and delivers a fiery shockwave strike.',
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
      kinematicHoldDurationSec: 1.6,
    });
    if (!prep) return;

    ctx.scheduleUnscaled(() => {
      ctx.setQuip(attackerRig.displayName, 'Vijay Dinanath Chauhan, poora naam! 🔥💥', true);

      attackerAnim.transitionTo('POSE', 0.08, true);
      ctx.sound.playCounterWindup();
      ctx.flashTintFeedback(attackerRig, 0xf97316, 0.9, 0.35);
      ctx.effects.spawnBossFlexSparkle(attackerRig.root.position.clone().setY(1.5));
      ctx.sceneManager.triggerDramaticZoom(attackerRig.root.position.clone().setY(1.5), 0.4);

      ctx.scheduleUnscaled(() => {
        attackerAnim.transitionTo('KICK', 0.04, true);
        ctx.sound.playWhoosh(1.3);
        ctx.physics.applyDirectionalImpulse(attackerId, targetId, 4.0);

        ctx.scheduleUnscaled(() => {
          ctx.setTimeScale(CINEMATIC_FREEZE_TIME_SCALE);
          const impactPos = targetRig.root.position.clone().setY(1.42);

          ctx.sound.playBossKickImpact();
          ctx.effects.spawnKickOverrideImpact(impactPos, 40);
          ctx.flashTintFeedback(targetRig, 0xf97316, 0.9, 0.35);
          ctx.sceneManager.triggerDramaticZoom(impactPos, 0.36);
          ctx.sceneManager.triggerShake(0.3, 0.3);

          ctx.applyDamageToFighter(targetId, attackerId, 40, true);

          launchKnockdownAndRecover(ctx, targetId, attackerId, targetRig, -8.0, {
            starHeight: 1.55,
            releaseKinematicHoldOnFinish: true,
            cpuCooldownMs: 1200,
          });
        }, 160);
      }, 380);
    }, prep.startDelayMs);
  },
};
