import type { CharacterId } from '../../types/game';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';
import { runPutinSpecialAbility } from './adapter';

export const matryoshkaMunitionSignature: SignatureMoveDefinition = {
  ownerId: 'putin',
  meta: {
    id: 'matryoshka-munition',
    name: 'Matryoshka Munition',
    buttonLabel: 'MATRYOSHKA!',
    buttonSub: 'Doll Cluster 🪆',
    description:
      'Hurls a painted Matryoshka bomb that bounces 3 times toward the opponent, halving in size with every explosion.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
    runPutinSpecialAbility(ctx, attackerId, targetId, 'matryoshkaMunition');
  },
};

