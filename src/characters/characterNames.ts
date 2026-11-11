/**
 * Single Source of Truth for Fighter IDs & In-Game Display Names.
 *
 * Developers: To rename any character across the entire game (Character Select
 * ribbons, roster cards, HUD health bars, PLAY/VS switcher pills, dialogue
 * quips, action buttons, and K.O. banners), change its string value in
 * `CHARACTER_NAMES` below.
 */

export const CHARACTER_IDS = ['chinu', 'priyanshu', 'modiji', 'trump', 'putin'] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export type SelectRosterSlotId = CharacterId | 'random';

/** Display order of tiles in the Tekken Character Select bottom grid. */
export const SELECT_ROSTER_ORDER: readonly SelectRosterSlotId[] = [
  'chinu',
  'priyanshu',
  'random',
  'modiji',
  'trump',
  'putin',
];

/**
 * Editable display names keyed by immutable internal asset/character ID.
 */
export const CHARACTER_NAMES: Record<CharacterId, string> = {
  chinu: 'Chinu',
  priyanshu: 'Priyanshu',
  modiji: 'Modiji',
  trump: 'Pope Grump',
  putin: 'царь Путин',
};

export function isCharacterId(value: string): value is CharacterId {
  return (CHARACTER_IDS as readonly string[]).includes(value);
}

export function getCharacterDisplayName(id: CharacterId): string {
  return CHARACTER_NAMES[id];
}

export function getCharacterUpperName(id: CharacterId): string {
  return CHARACTER_NAMES[id].toUpperCase();
}

/**
 * Picks a deterministic non-mirror opponent when switching fighters onto a slot
 * that already holds the same character.
 */
export function getFallbackOpponent(excludedId: CharacterId): CharacterId {
  return excludedId === 'priyanshu' ? 'modiji' : 'priyanshu';
}

