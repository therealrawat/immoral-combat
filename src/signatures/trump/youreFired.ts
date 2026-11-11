import type { CharacterId } from '../../types/game';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';
import { runTrumpSpecialAbility } from './adapter';

export const youreFiredSignature: SignatureMoveDefinition = {
  ownerId: 'trump',
  meta: {
    id: 'youre-fired',
    name: "You're Fired!",
    buttonLabel: "YOU'RE FIRED!",
    buttonSub: 'Finger Point 🔥',
    description:
      'Points from the right hand bone and launches a glowing fiery decree orb toward the opponent.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
    runTrumpSpecialAbility(ctx, attackerId, targetId, 'youreFired');
  },
};

