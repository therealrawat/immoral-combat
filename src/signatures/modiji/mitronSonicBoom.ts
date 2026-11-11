import type { CharacterId } from '../../types/game';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';
import { runModijiSpecialAbility } from './adapter';

export const mitronSonicBoomSignature: SignatureMoveDefinition = {
  ownerId: 'modiji',
  meta: {
    id: 'mitron-sonic-boom',
    name: 'Mitron! Sonic Boom',
    buttonLabel: 'MITRON! BOOM!',
    buttonSub: 'Sonic AoE 🔊',
    description:
      'Unleashes an expanding orange sonic wave that stuns and freezes nearby opponents for 2 seconds.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
    runModijiSpecialAbility(ctx, attackerId, targetId, 'mitronSonicBoom');
  },
};

