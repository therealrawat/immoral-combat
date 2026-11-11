import { buildTheWallSignature } from './buildTheWall';
import { TrumpSpecialMoves } from './TrumpSpecialMoves';
import { youreFiredSignature } from './youreFired';
import type { SignatureMoveDefinition } from '../types';

export { TrumpSpecialMoves, buildTheWallSignature, youreFiredSignature };
export type { TrumpSpecialMovesOptions } from './TrumpSpecialMoves';

export const trumpSignatures: readonly SignatureMoveDefinition[] = [
  youreFiredSignature,
  buildTheWallSignature,
];
