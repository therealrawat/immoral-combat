import type { CharacterId } from '../../types/game';
import {
  CINEMATIC_FREEZE_TIME_SCALE,
  launchKnockdownAndRecover,
  prepareSignatureCinematic,
} from '../sharedHelpers';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';

const SHAHENSHAH_QUIPS = [
  'Rishte mein toh hum tumhare baap lagte hain, naam hai Shahenshah! 👑',
  'Don ko pakadna mushkil hi nahi, namumkin hai! 😎',
  'Hum jahan khade hote hain, line wahin se shuru hoti hai! ⚡',
] as const;

let shahenshahQuipIdx = 0;

export const shahenshahIronFistSignature: SignatureMoveDefinition = {
  ownerId: 'amitabh',
  meta: {
    id: 'shahenshah-iron-fist',
    name: 'Shahenshah Iron Fist',
    buttonLabel: 'SHAHENSHAH!',
    buttonSub: 'Iron Gauntlet 👑',
    description: 'Strikes an iconic Shahenshah pose and unleashes an iron-clad shockwave punch across the arena.',
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
      kinematicHoldDurationSec: 1.8,
    });
    if (!prep) return;

    ctx.scheduleUnscaled(() => {
      const quip = SHAHENSHAH_QUIPS[shahenshahQuipIdx % SHAHENSHAH_QUIPS.length];
      shahenshahQuipIdx++;
      ctx.setQuip(attackerRig.displayName, quip, true);

      // 1. Dramatic windup pose with golden aura & sparks
      attackerAnim.transitionTo('POSE', 0.08, true);
      ctx.sound.playCounterWindup();
      ctx.flashTintFeedback(attackerRig, 0xffd700, 0.9, 0.4);

      const fistPos = attackerRig.fistAnchor.position.clone();
      ctx.effects.spawnBossFlexSparkle(fistPos.clone().setY(1.6));
      ctx.sceneManager.triggerDramaticZoom(attackerRig.root.position.clone().setY(1.6), 0.45);
      ctx.sceneManager.triggerShake(0.12, 0.18);

      // 2. Dash forward and deliver devastating iron punch
      ctx.scheduleUnscaled(() => {
        attackerAnim.transitionTo('PUNCH', 0.04, true);
        ctx.sound.playWhoosh(1.2);
        ctx.physics.applyDirectionalImpulse(attackerId, targetId, 4.2);

        // 3. Impact with cinematic freeze
        ctx.scheduleUnscaled(() => {
          ctx.setTimeScale(CINEMATIC_FREEZE_TIME_SCALE);
          const impactPos = targetRig.root.position.clone().setY(1.48);

          ctx.sound.playBossKickImpact();
          ctx.effects.spawnKickOverrideImpact(impactPos, 45);
          ctx.flashTintFeedback(targetRig, 0xffffff, 0.95, 0.35);
          ctx.sceneManager.triggerDramaticZoom(impactPos, 0.38);
          ctx.sceneManager.triggerShake(0.35, 0.35);

          ctx.applyDamageToFighter(targetId, attackerId, 45, true);

          // 4. Knockdown & recover epilogue
          launchKnockdownAndRecover(ctx, targetId, attackerId, targetRig, -8.6, {
            starHeight: 1.6,
            releaseKinematicHoldOnFinish: true,
            cpuCooldownMs: 1400,
          });
        }, 160);
      }, 420);
    }, prep.startDelayMs);
  },
};
