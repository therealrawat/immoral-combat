import type { CharacterId } from '../../types/game';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';
import { runPutinSpecialAbility } from './adapter';

export const kgbKnifeSignature: SignatureMoveDefinition = {
  ownerId: 'putin',
  meta: {
    id: 'kgb-knife',
    name: 'KGB Cold Blade',
    buttonLabel: 'KGB STAB!',
    buttonSub: 'Cold Steel 🗡️',
    description:
      'Putin draws a combat knife from his boot, lunges forward for a lethal stab, and crisply salutes as the opponent collapses.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
    runPutinSpecialAbility(ctx, attackerId, targetId, 'kgbKnife');
  },
};

