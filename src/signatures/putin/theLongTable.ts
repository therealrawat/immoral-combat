import type { CharacterId } from '../../types/game';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';
import { runPutinSpecialAbility } from './adapter';

export const theLongTableSignature: SignatureMoveDefinition = {
  ownerId: 'putin',
  meta: {
    id: 'the-long-table',
    name: 'The Long Table',
    buttonLabel: 'LONG TABLE!',
    buttonSub: '20x Ram 🪑',
    description:
      'Summons an absurdly long sleek white table from his feet, blasting opponents cleanly to the far end.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
    runPutinSpecialAbility(ctx, attackerId, targetId, 'theLongTable');
  },
};

