import type { CharacterId } from '../../types/game';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';
import { runModijiSpecialAbility } from './adapter';

export const chaiBreakSignature: SignatureMoveDefinition = {
  ownerId: 'modiji',
  meta: {
    id: 'chai-break',
    name: 'Chai Break',
    buttonLabel: 'CHAI BREAK!',
    buttonSub: 'Saffron Heal ☕',
    description:
      'Sips a warm cup of chai from his right hand, glowing saffron for 5 seconds and restoring 20% HP.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
    runModijiSpecialAbility(ctx, attackerId, targetId, 'chaiBreak');
  },
};

