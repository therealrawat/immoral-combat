import type { CharacterId } from '../../types/game';
import { prepareSignatureCinematic } from '../sharedHelpers';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';
import { CyberpunkPoisonSpecialMove, pickCyberHackQuip } from './CyberpunkPoisonSpecialMove';

/**
 * Priyanshu Signature (`F`): opens his Cyberpunk Laptop, types a kernel exploit,
 * and engulfs the opponent in swirling poison fog that deals toxic damage ticks.
 */
export const poisonHackSignature: SignatureMoveDefinition = {
  ownerId: 'priyanshu',
  meta: {
    id: 'poison-hack',
    name: 'Toxic Hack',
    buttonLabel: 'TOXIC HACK!',
    buttonSub: 'Cyber Poison 💻',
    description:
      'Opens his cyberpunk laptop, rapidly types a breach exploit, and engulfs the opponent in poison fog.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
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
      calmTargetStates: true,
    });
    if (!prep) return;

    ctx.scheduleUnscaled(() => {
      attackerAnim.transitionTo('IDLE', 0.08, true);

      const move = new CyberpunkPoisonSpecialMove(
        attackerRig.root,
        targetRig.root,
        ctx.sceneManager.scene,
        {
          facingTarget: attackerRig.modelRoot,
          getOpponentPosition: () =>
            ctx.physics.getBodyPosition(targetId) ?? targetRig.root.position,
          onLaptopOpen: () => {
            ctx.sound.playCyberLaptopOpen();
            ctx.setQuip(ctx.getDisplayName(attackerId), pickCyberHackQuip(ctx.nextQuipIndex()));
          },
          onKeystroke: (pitchScale) => {
            ctx.sound.playKeyboardKeystroke(pitchScale);
          },
          onFogRelease: () => {
            ctx.sound.playPoisonFogRelease();
            ctx.sceneManager.triggerShake(0.18, 0.28);
            ctx.sceneManager.triggerDramaticZoom(targetRig.root.position.clone().setY(1.2), 0.32);
            if (ctx.interruptFighterAi) {
              ctx.interruptFighterAi(targetId, 1650);
            } else {
              ctx.cpuAi.onCpuInterrupted(performance.now(), 1650);
            }
          },
          onTriggerOpponentStagger: () => {
            targetAnim.transitionTo('HIT', 0.05, true);
            ctx.wobbleHeadOnImpact(targetRig);
          },
          setOpponentMovementPaused: (paused) => {
            ctx.physics.setMovementPaused?.(targetId, paused);
          },
          onPoisonTick: (tickIndex, damage, word, oppPos) => {
            const hitPos = oppPos.clone().setY(1.42);
            ctx.sound.playPunchHit(ctx.getComboHits() + tickIndex + 1);
            ctx.effects.spawnPunchImpact(hitPos, damage, word);
            ctx.flashTintFeedback(targetRig, 0x22c55e, 0.88, 0.34);
            if (tickIndex === 2) {
              ctx.recordHitQuip(targetId);
            }
            ctx.applyDamageToFighter(targetId, attackerId, damage, true);
          },
          onComplete: () => {
            ctx.setCinematicActive(false);
            ctx.syncHUD();
          },
        }
      );

      ctx.registerTransientDisposable?.(move);
      void move.execute().finally(() => {
        move.dispose();
        ctx.setCinematicActive(false);
        ctx.syncHUD();
      });
    }, prep.startDelayMs);
  },
};

