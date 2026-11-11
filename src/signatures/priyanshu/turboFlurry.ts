import type { CharacterId } from '../../types/game';
import { executeThreeHitFinisher } from '../sharedHelpers';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';

export const turboFlurrySignature: SignatureMoveDefinition = {
  ownerId: 'priyanshu',
  meta: {
    id: 'turbo-flurry',
    name: 'Turbo Flurry',
    buttonLabel: 'SIGNATURE!',
    buttonSub: 'Turbo Flurry ⚡',
    description: 'Rapid 3-hit jab, cross, and flying drop-kick finisher.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
    executeThreeHitFinisher(ctx, attackerId, targetId, {
      hit1Damage: 12,
      hit1Label: 'POW!',
      hit2Damage: 12,
      hit2Label: 'BAM!!',
      finisherDamage: 24,
      finisherFlashHex: 0xffd426,
    });
  },
};

