import { CharacterId, FighterState, SelectIdleVariant } from '../types/game';

export interface NativeGLBClipSpec {
  state: FighterState;
  url: string;
  clipName: string;
  speed: number;
  repeatCount?: number;
  yawOffsetRad?: number;
  hipsYOffset?: number;
  holdDurationSec?: number;
  stripHorizontalRootMotion?: boolean;
}

interface ConventionMoveRule {
  state: FighterState;
  clipSuffix: string;
  moveKeys: readonly string[];
  defaultSpeed: number;
  stripHorizontalRootMotion?: boolean;
}

const MODEL_GLOB_URLS = import.meta.glob<string>('../../models/*/*.glb', {
  query: '?url',
  import: 'default',
  eager: true,
});

interface SplitModelRegistry {
  sharedCharacters: Map<string, string>;
  sharedAnimations: Map<string, string>;
  stages: Map<string, string>;
  objects: Map<string, string>;
  legacyByCharacter: Map<string, Record<string, string>>;
}

/**
 * Indexes both refactored shared-animation GLBs:
 *   - `models/characters/<character>.glb` (T-pose base meshes)
 *   - `models/animations/<move>.glb` (central skinless animations)
 *   - `models/stages/<stage>.glb` (3D battle arenas)
 *   - `models/objects/<object>.glb` (interactive signature/stage props)
 * as well as legacy baked `models/<character>/<character>-<move>.glb` files.
 */
function buildModelAssetRegistry(): SplitModelRegistry {
  const sharedCharacters = new Map<string, string>();
  const sharedAnimations = new Map<string, string>();
  const stages = new Map<string, string>();
  const objects = new Map<string, string>();
  const legacyByCharacter = new Map<string, Record<string, string>>();

  for (const [rawPath, url] of Object.entries(MODEL_GLOB_URLS)) {
    const normalized = rawPath.replace(/\\/g, '/');
    const match = /models\/([^/]+)\/([^/]+)\.glb$/i.exec(normalized);
    if (!match) continue;

    const folderKey = match[1].toLowerCase();
    const fileStem = match[2].toLowerCase();

    if (folderKey === 'characters') {
      sharedCharacters.set(fileStem, url);
      continue;
    }

    if (folderKey === 'animations') {
      sharedAnimations.set(fileStem, url);
      const strippedSuffix = fileStem.replace(/-animation$/, '');
      if (strippedSuffix !== fileStem) {
        sharedAnimations.set(strippedSuffix, url);
      }
      continue;
    }

    if (folderKey === 'stages') {
      stages.set(fileStem, url);
      continue;
    }

    if (folderKey === 'objects') {
      objects.set(fileStem, url);
      continue;
    }

    const prefix = `${folderKey}-`;
    const moveKey = fileStem.startsWith(prefix) ? fileStem.slice(prefix.length) : fileStem;
    const existing = legacyByCharacter.get(folderKey) ?? {};
    existing[moveKey] = url;
    if (fileStem.endsWith('-avatar') || fileStem === 'avatar') {
      existing['avatar'] = url;
    }
    if (fileStem.endsWith('-body') || fileStem === 'body') {
      existing['body'] = url;
    }
    legacyByCharacter.set(folderKey, existing);
    if (folderKey === 'amitabh') {
      const alias = legacyByCharacter.get('amitji') ?? {};
      alias[moveKey] = url;
      if (existing['avatar']) alias['avatar'] = existing['avatar'];
      if (existing['body']) alias['body'] = existing['body'];
      legacyByCharacter.set('amitji', alias);
    }
  }

  return { sharedCharacters, sharedAnimations, stages, objects, legacyByCharacter };
}

const ASSET_REGISTRY = buildModelAssetRegistry();

const STANDARD_CONVENTION_RULES: readonly ConventionMoveRule[] = [
  { state: 'IDLE', clipSuffix: 'Idle', moveKeys: ['idle-1', 'idle'], defaultSpeed: 1.0 },
  { state: 'RUN', clipSuffix: 'Run', moveKeys: ['run'], defaultSpeed: 1.35 },
  {
    state: 'ENTRY',
    clipSuffix: 'Entry',
    moveKeys: ['entry'],
    defaultSpeed: 1.25,
    stripHorizontalRootMotion: true,
  },
  { state: 'PUNCH', clipSuffix: 'Punch', moveKeys: ['punch'], defaultSpeed: 2.35 },
  { state: 'KICK', clipSuffix: 'Kick', moveKeys: ['kick'], defaultSpeed: 2.1 },
  {
    state: 'MUAY_THAI',
    clipSuffix: 'MuayThai',
    moveKeys: ['kick-punch-mix', 'kick-punch', 'puch-kick-mix', 'muay-thai'],
    defaultSpeed: 1.7,
  },
  {
    state: 'POSE',
    clipSuffix: 'Pose',
    moveKeys: ['cheer-1', 'pushups', 'pose'],
    defaultSpeed: 1.35,
  },
  {
    state: 'DANCE',
    clipSuffix: 'Dance',
    moveKeys: ['cheer-2', 'dance'],
    defaultSpeed: 1.3,
  },
  {
    state: 'LASER_EYES',
    clipSuffix: 'LaserEyes',
    moveKeys: ['laser-eyes', 'signature'],
    defaultSpeed: 1.0,
  },
  {
    state: 'DEAD',
    clipSuffix: 'Dead',
    moveKeys: ['dead-animation', 'dead', 'death', 'ko'],
    defaultSpeed: 1.0,
  },
];

const CHARACTER_SPEC_OVERRIDES: Partial<
  Record<CharacterId, Partial<Record<FighterState, Partial<Omit<NativeGLBClipSpec, 'state' | 'url'>>>>>
> = {
  chinu: {
    IDLE: { yawOffsetRad: 0.45 },
    CHAMP_POSE: { clipName: 'ChinuNativeChampPose', speed: 1.0, holdDurationSec: 2.2 },
    DANCE: { clipName: 'ChinuNativeBoxerDance', speed: 1.45, stripHorizontalRootMotion: false },
    POSE: { speed: 1.45, stripHorizontalRootMotion: false },
  },
  priyanshu: {
    IDLE: { yawOffsetRad: 0.55 },
    LOUNGE: {
      clipName: 'PriyanshuNativeLoungePose',
      speed: 1.0,
      hipsYOffset: 0.075,
      holdDurationSec: 2.35,
    },
    PUNCH: { speed: 2.4 },
    KICK: { speed: 2.2 },
    MUAY_THAI: { clipName: 'PriyanshuNativeKickPunch', speed: 2.35 },
    POSE: { clipName: 'PriyanshuNativePushups', speed: 1.45, repeatCount: 2 },
  },
  modiji: {
    IDLE: { speed: 1.0 },
    KICK: { speed: 2.05 },
    MUAY_THAI: { speed: 1.75 },
    POSE: { clipName: 'ModijiNativeAerial', speed: 1.25, stripHorizontalRootMotion: true },
    DANCE: { clipName: 'ModijiNativeCheer', speed: 1.3, stripHorizontalRootMotion: true },
  },
  trump: {
    IDLE: { speed: 1.0 },
    KICK: { speed: 2.0 },
    MUAY_THAI: { speed: 1.75 },
    POSE: { clipName: 'TrumpNativeAngryClean', speed: 1.35, stripHorizontalRootMotion: true },
    DANCE: { clipName: 'TrumpNativeArmFlex', speed: 1.3, stripHorizontalRootMotion: true },
  },
  putin: {
    IDLE: { yawOffsetRad: 0.48, speed: 1.0 },
    KICK: { speed: 2.05 },
    MUAY_THAI: { speed: 1.75 },
    POSE: {
      clipName: 'PutinNativeCheer',
      yawOffsetRad: 0.52,
      speed: 1.3,
      stripHorizontalRootMotion: true,
    },
    DANCE: { speed: 1.3, stripHorizontalRootMotion: true },
    CHAMP_POSE: { clipName: 'PutinNativeChampPose', speed: 1.0, holdDurationSec: 2.2 },
  },
};

/** Resolves a character's base mesh URL from `models/characters/<id>.glb` if indexed by Vite. */
export function getSharedCharacterUrl(characterId: string): string | undefined {
  return ASSET_REGISTRY.sharedCharacters.get(characterId.toLowerCase());
}

/** Resolves a central shared animation URL from `models/animations/<move>.glb` if indexed by Vite. */
export function getSharedAnimationUrl(moveKey: string): string | undefined {
  return ASSET_REGISTRY.sharedAnimations.get(moveKey.toLowerCase());
}

/** Returns all central shared animations discovered in `models/animations/*.glb`. */
export function getAllSharedAnimationUrls(): Record<string, string> {
  return Object.fromEntries(ASSET_REGISTRY.sharedAnimations.entries());
}

/** Returns all sorted stage IDs discovered in `models/stages/*.glb` (e.g. `stage-1`, `stage-2`). */
export function getAvailableStageIds(): string[] {
  return [...ASSET_REGISTRY.stages.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

/** Resolves a stage GLB URL from `models/stages/<stageId>.glb` if indexed by Vite. */
export function getStageModelUrl(stageId: string): string | undefined {
  return ASSET_REGISTRY.stages.get(stageId.toLowerCase());
}

/** Resolves a prop/object GLB URL from `models/objects/<objectKey>.glb` if indexed by Vite. */
export function getObjectModelUrl(objectKey: string): string | undefined {
  return ASSET_REGISTRY.objects.get(objectKey.toLowerCase());
}

/** Returns all legacy `<character>-<move>.glb` move URLs keyed by canonical `<move>`. */
export function getCharacterMoveMap(characterId: string): Record<string, string> {
  return ASSET_REGISTRY.legacyByCharacter.get(characterId.toLowerCase()) ?? {};
}

/** Resolves candidate base model URLs in priority order (`models/characters/<id>.glb`, `avatar`, `animation`, `body`). */
export function getCharacterAvatarUrls(characterId: string): string[] {
  const sharedUrl = getSharedCharacterUrl(characterId);
  const moves = getCharacterMoveMap(characterId);
  const candidates = [sharedUrl, moves.avatar, moves.animation, moves.body];
  return candidates.filter((url): url is string => Boolean(url));
}

/**
 * Resolves a move URL prioritizing central `models/animations/<move>.glb` files
 * before falling back to legacy per-character `<character>-<move>.glb`.
 */
const SHARED_DONOR_CHARACTERS: readonly CharacterId[] = ['modiji', 'chinu', 'priyanshu'];

function resolveMoveUrl(
  characterId: string,
  moveKeys: readonly string[],
  allowDonorFallback = true
): { url: string; isSharedCentral: boolean } | undefined {
  for (const moveKey of moveKeys) {
    const shared = getSharedAnimationUrl(moveKey);
    if (shared) {
      return { url: shared, isSharedCentral: true };
    }
  }
  const legacyMoves = getCharacterMoveMap(characterId);
  for (const moveKey of moveKeys) {
    if (legacyMoves[moveKey]) {
      return { url: legacyMoves[moveKey], isSharedCentral: false };
    }
  }
  if (allowDonorFallback) {
    for (const donorId of SHARED_DONOR_CHARACTERS) {
      if (donorId === characterId) continue;
      const donorMoves = getCharacterMoveMap(donorId);
      for (const moveKey of moveKeys) {
        if (donorMoves[moveKey]) {
          return { url: donorMoves[moveKey], isSharedCentral: true };
        }
      }
    }
  }
  return undefined;
}

/** Resolves the GLB URL for a fighter's `idle-1` or `idle-2` showcase animation. */
export function getCharacterIdleUrl(
  characterId: CharacterId,
  variant: SelectIdleVariant
): string | undefined {
  const keys = variant === 'idle-1' ? ['idle-1', 'idle'] : ['idle-2'];
  return resolveMoveUrl(characterId, keys, variant === 'idle-1')?.url;
}

/** Returns which idle variants (`idle-1`, `idle-2`) exist for a character. */
export function getAvailableCharacterIdles(characterId: CharacterId): SelectIdleVariant[] {
  const variants: SelectIdleVariant[] = [];
  if (resolveMoveUrl(characterId, ['idle-1', 'idle'], true)) variants.push('idle-1');
  if (resolveMoveUrl(characterId, ['idle-2'], false)) variants.push('idle-2');
  return variants;
}

/**
 * Builds native GLB animation clip specs automatically from central `models/animations/<move>.glb`
 * (or legacy `models/<name>/<name>-<move>.glb`) files plus character-specific timing adjustments.
 */
export function buildConventionNativeClipSpecs(id: CharacterId): NativeGLBClipSpec[] {
  const moves = getCharacterMoveMap(id);
  const overrides = CHARACTER_SPEC_OVERRIDES[id] ?? {};
  const labelPrefix = `${id.charAt(0).toUpperCase()}${id.slice(1)}Native`;
  const specs: NativeGLBClipSpec[] = [];

  for (const rule of STANDARD_CONVENTION_RULES) {
    const resolved = resolveMoveUrl(id, rule.moveKeys);
    if (!resolved) continue;

    const custom = overrides[rule.state] ?? {};
    specs.push({
      state: rule.state,
      url: resolved.url,
      clipName: custom.clipName ?? `${labelPrefix}${rule.clipSuffix}`,
      speed: custom.speed ?? rule.defaultSpeed,
      repeatCount: custom.repeatCount,
      // Legacy baked idle clips have character-specific facing offsets; central shared clips don't
      yawOffsetRad: resolved.isSharedCentral ? undefined : custom.yawOffsetRad,
      hipsYOffset: resolved.isSharedCentral ? undefined : custom.hipsYOffset,
      holdDurationSec: custom.holdDurationSec,
      stripHorizontalRootMotion: custom.stripHorizontalRootMotion ?? rule.stripHorizontalRootMotion,
    });
  }

  const secondaryIdle = resolveMoveUrl(id, ['idle-2'], false);
  if (secondaryIdle) {
    const idle2State: FighterState = id === 'priyanshu' ? 'LOUNGE' : 'CHAMP_POSE';
    const custom = overrides[idle2State] ?? {};
    specs.push({
      state: idle2State,
      url: secondaryIdle.url,
      clipName:
        custom.clipName ?? `${labelPrefix}${idle2State === 'LOUNGE' ? 'LoungePose' : 'ChampPose'}`,
      speed: custom.speed ?? 1.0,
      repeatCount: custom.repeatCount,
      yawOffsetRad: secondaryIdle.isSharedCentral ? undefined : custom.yawOffsetRad,
      hipsYOffset: secondaryIdle.isSharedCentral ? undefined : custom.hipsYOffset,
      holdDurationSec: custom.holdDurationSec,
      stripHorizontalRootMotion: custom.stripHorizontalRootMotion,
    });
  }

  const priIdle = resolveMoveUrl(id, ['idle-1', 'idle']) ?? (moves['idle-1'] ? { url: moves['idle-1'], isSharedCentral: false } : undefined);
  const priPunch = resolveMoveUrl(id, ['punch']);
  if (id === 'priyanshu') {
    if (priIdle) {
      specs.push({
        state: 'ADMIRE',
        url: priIdle.url,
        clipName: 'PriyanshuNativeAdmirePose',
        speed: 1.15,
        yawOffsetRad: priIdle.isSharedCentral ? undefined : 0.55,
      });
    }
    if (priPunch) {
      specs.push({
        state: 'ATTEMPT_ATTACK',
        url: priPunch.url,
        clipName: 'PriyanshuNativeAttemptAttack',
        speed: 2.1,
      });
    }
  }

  return specs;
}
