import { chaiBreakSignature } from './chaiBreak';
import { laserEyesSignature } from './laserEyes';
import { ModijiSpecialMoves } from './ModijiSpecialMoves';
import { mitronSonicBoomSignature } from './mitronSonicBoom';
import type { SignatureMoveDefinition } from '../types';

export {
  ModijiSpecialMoves,
  chaiBreakSignature,
  laserEyesSignature,
  mitronSonicBoomSignature,
};
export type { ModijiSpecialMovesOptions } from './ModijiSpecialMoves';

export const modijiSignatures: readonly SignatureMoveDefinition[] = [
  mitronSonicBoomSignature,
  chaiBreakSignature,
];

