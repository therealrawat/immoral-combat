import { matryoshkaMunitionSignature } from './matryoshkaMunition';
import { PutinSpecialMoves } from './PutinSpecialMoves';
import { theLongTableSignature } from './theLongTable';
import type { SignatureMoveDefinition } from '../types';

export { PutinSpecialMoves, matryoshkaMunitionSignature, theLongTableSignature };
export type { MatryoshkaExplosionEvent, PutinSpecialMovesOptions } from './PutinSpecialMoves';

export const putinSignatures: readonly SignatureMoveDefinition[] = [
  theLongTableSignature,
  matryoshkaMunitionSignature,
];

