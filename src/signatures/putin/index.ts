import { kgbKnifeSignature } from './kgbKnife';
import { matryoshkaMunitionSignature } from './matryoshkaMunition';
import { PutinSpecialMoves } from './PutinSpecialMoves';
import { theLongTableSignature } from './theLongTable';
import type { SignatureMoveDefinition } from '../types';

export {
  PutinSpecialMoves,
  kgbKnifeSignature,
  theLongTableSignature,
  matryoshkaMunitionSignature,
};
export type { MatryoshkaExplosionEvent, PutinSpecialMovesOptions } from './PutinSpecialMoves';

export const putinSignatures: readonly SignatureMoveDefinition[] = [
  kgbKnifeSignature,
  matryoshkaMunitionSignature,
];
