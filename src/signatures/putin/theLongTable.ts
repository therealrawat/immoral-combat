import type { SignatureMoveDefinition } from '../types';
import { kgbKnifeSignature } from './kgbKnife';

/**
 * Legacy export for backwards compatibility: "The Long Table" is replaced
 * by Putin's new signature move "KGB Cold Blade" (Knife Lift -> Stab -> Opponent Death -> Salute).
 */
export const theLongTableSignature: SignatureMoveDefinition = kgbKnifeSignature;
