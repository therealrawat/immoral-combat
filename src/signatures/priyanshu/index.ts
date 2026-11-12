import { poisonHackSignature } from './poisonHack';
import type { SignatureMoveDefinition } from '../types';

export { poisonHackSignature };
export {
  CyberpunkPoisonSpecialMove,
  disposeCachedCyberpunkLaptop,
  preloadCyberpunkLaptop,
} from './CyberpunkPoisonSpecialMove';

export const priyanshuSignatures: readonly SignatureMoveDefinition[] = [poisonHackSignature];
