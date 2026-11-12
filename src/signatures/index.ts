import type { CharacterId } from '../types/game';
import { chinuSignatures } from './chinu';
import { modijiSignatures } from './modiji';
import { priyanshuSignatures } from './priyanshu';
import { putinSignatures } from './putin';
import { trumpSignatures } from './trump';
import type { SignatureMoveContext, SignatureMoveDefinition } from './types';

export type {
  SignatureMoveContext,
  SignatureMoveDefinition,
  SignatureMoveMetadata,
} from './types';
export { CINEMATIC_FREEZE_TIME_SCALE } from './sharedHelpers';
export { CyberpunkPoisonSpecialMove, preloadCyberpunkLaptop } from './priyanshu';
export { ModijiSpecialMoves } from './modiji';
export type { ModijiSpecialMovesOptions } from './modiji';
export { PutinSpecialMoves } from './putin';
export type { MatryoshkaExplosionEvent, PutinSpecialMovesOptions } from './putin';
export { TrumpSpecialMoves } from './trump';
export type { TrumpSpecialMovesOptions } from './trump';

/**
 * Per-character signature move registry backed by each character's folder under `src/signatures/<id>/`.
 */
export const CHARACTER_SIGNATURES: Record<CharacterId, readonly SignatureMoveDefinition[]> = {
  chinu: chinuSignatures,
  priyanshu: priyanshuSignatures,
  modiji: modijiSignatures,
  trump: trumpSignatures,
  putin: putinSignatures,
};

export function getCharacterSignatures(characterId: CharacterId): readonly SignatureMoveDefinition[] {
  return CHARACTER_SIGNATURES[characterId];
}

export function getPrimarySignature(characterId: CharacterId): SignatureMoveDefinition {
  return CHARACTER_SIGNATURES[characterId][0];
}

/**
 * Executes a character's signature move (primary signature when `moveId` is omitted).
 */
export function executeCharacterSignature(
  ctx: SignatureMoveContext,
  attackerId: CharacterId,
  targetId: CharacterId,
  moveId?: string
): void {
  const catalog = CHARACTER_SIGNATURES[attackerId];
  const chosen = moveId
    ? catalog.find((entry) => entry.meta.id === moveId) ?? catalog[0]
    : catalog[0];
  chosen.execute(ctx, attackerId, targetId);
}

