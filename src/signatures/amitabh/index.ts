import { agneepathBlastSignature } from './agneepathBlast';
import { shahenshahIronFistSignature } from './shahenshahIronFist';
import type { SignatureMoveDefinition } from '../types';

export { agneepathBlastSignature, shahenshahIronFistSignature };

export const amitabhSignatures: readonly SignatureMoveDefinition[] = [
  shahenshahIronFistSignature,
  agneepathBlastSignature,
];
