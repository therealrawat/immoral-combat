import type { CharacterId } from '../../types/game';
import type { SignatureMoveContext, SignatureMoveDefinition } from '../types';
import { runTrumpSpecialAbility } from './adapter';

export const buildTheWallSignature: SignatureMoveDefinition = {
  ownerId: 'trump',
  meta: {
    id: 'build-the-wall',
    name: 'Build the Wall',
    buttonLabel: 'BUILD THE WALL!',
    buttonSub: 'Brick Smash 🧱',
    description:
      'Drops a giant brick wall from the sky with heavy bounce impact, blasting back opponents in the zone.',
  },
  execute(ctx: SignatureMoveContext, attackerId: CharacterId, targetId: CharacterId): void {
    runTrumpSpecialAbility(ctx, attackerId, targetId, 'buildTheWall');
  },
};

