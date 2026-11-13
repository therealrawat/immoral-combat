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
  trimStartSec?: number;
  stripHorizontalRootMotion?: boolean;
}

interface ConventionMoveRule {
  state: FighterState;
  clipSuffix: string;
  moveKeys: readonly string[];
  defaultSpeed: number;
  stripHorizontalRootMotion?: boolean;
  trimStartSec?: number;
}

const MODEL_GLOB_URLS = import.meta.glob<string>('../../models/**/*.glb', {
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
 *   - `models/characters/<character>-avatar.glb` / `<character>-body.glb` (Avaturn/Mixamo base meshes)
 *   - `models/animations/<category>/<move>.glb` (central shared Mixamo animations across categories)
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
    const relMatch = /models\/(.+)\.glb$/i.exec(normalized);
    if (!relMatch) continue;

    const fullRelPath = relMatch[1];
    const parts = fullRelPath.split('/');
    const topFolder = parts[0].toLowerCase();
    const fileStem = parts[parts.length - 1];
    const fileStemLower = fileStem.toLowerCase();

    if (topFolder === 'characters') {
      sharedCharacters.set(fileStemLower, url);
      const stripped = fileStemLower.replace(/-(avatar|body)$/, '');
      if (fileStemLower.endsWith('-avatar') || !sharedCharacters.has(stripped)) {
        sharedCharacters.set(stripped, url);
      }
      if (stripped === 'amitji') {
        if (fileStemLower.endsWith('-avatar')) sharedCharacters.set('amitabh-avatar', url);
        if (fileStemLower.endsWith('-body')) sharedCharacters.set('amitabh-body', url);
        sharedCharacters.set('amitabh', sharedCharacters.get('amitji-avatar') || url);
      }
      const existing = legacyByCharacter.get(stripped) ?? {};
      if (fileStemLower.endsWith('-avatar')) existing['avatar'] = url;
      if (fileStemLower.endsWith('-body')) existing['body'] = url;
      existing[fileStemLower] = url;
      legacyByCharacter.set(stripped, existing);
      if (stripped === 'amitji') {
        legacyByCharacter.set('amitabh', existing);
      }
      continue;
    }

    if (topFolder === 'animations') {
      const kebab = fileStemLower.replace(/[\s_]+/g, '-');
      const compact = fileStemLower.replace(/[^a-z0-9]+/g, '');
      const relSub = parts.slice(1).join('/').toLowerCase();
      const relSubKebab = relSub.replace(/[\s_]+/g, '-');

      const aliases = [fileStemLower, kebab, compact, relSub, relSubKebab];
      if (kebab.endsWith('-animation')) {
        const stripped = kebab.replace(/-animation$/, '');
        aliases.push(stripped);
        if (stripped === 'dead') aliases.push('death', 'ko');
      }

      for (const alias of aliases) {
        if (!sharedAnimations.has(alias)) {
          sharedAnimations.set(alias, url);
        }
      }
      continue;
    }

    if (topFolder === 'stages') {
      stages.set(fileStemLower, url);
      continue;
    }

    if (topFolder === 'objects') {
      objects.set(fileStemLower, url);
      continue;
    }

    // Legacy per-character folder fallback (e.g. models/<char>/<char>-<move>.glb)
    const prefix = `${topFolder}-`;
    const moveKey = fileStemLower.startsWith(prefix)
      ? fileStemLower.slice(prefix.length)
      : fileStemLower;
    const existing = legacyByCharacter.get(topFolder) ?? {};
    existing[moveKey] = url;
    if (fileStemLower.endsWith('-avatar') || fileStemLower === 'avatar') {
      existing['avatar'] = url;
    }
    if (fileStemLower.endsWith('-body') || fileStemLower === 'body') {
      existing['body'] = url;
    }
    legacyByCharacter.set(topFolder, existing);
    if (topFolder === 'amitabh') {
      const alias = legacyByCharacter.get('amitji') ?? {};
      alias[moveKey] = url;
      if (existing['avatar']) alias['avatar'] = existing['avatar'];
      if (existing['body']) alias['body'] = existing['body'];
      legacyByCharacter.set('amitji', alias);
    }
  }

  // Register high-level semantic aliases if not already set
  const aliasDefaults: [string, string[]][] = [
    ['idle', ['warrior-idle', 'breathing-idle', 'neutral-idle']],
    ['idle-1', ['warrior-idle', 'breathing-idle', 'neutral-idle']],
    ['idle-2', ['breathing-idle', 'happy-idle', 'neutral-idle', 'warrior-idle']],
    ['punch', ['punching', 'hook-punch', 'quad-punch', 'elbow-punching']],
    ['kick', ['kicking', 'mma-kick', 'flying-kick']],
    ['run', ['running', 'run-to-rolling']],
    ['running', ['running', 'run-to-rolling']],
    ['walk', ['fight-walking', 'walking', 'female-walking']],
    ['entry', ['praying', 'salute', 'quick-formal-bow', 'waving', 'victory']],
    ['pose', ['victory', 'rallying', 'cheering', 'clapping']],
    ['dance', ['trump-dance', 'excited', 'cheering']],
    ['muay-thai', ['mix-kick-punch', 'quad-punch', 'mma-kick', 'elbow-punching', 'flying-kick']],
    ['kick-punch-mix', ['mix-kick-punch']],
    ['mix-kick-punch', ['mix-kick-punch']],
    ['hit', ['hit-to-body', 'stomach-hit', 'rib-hit', 'head-hit', 'big-hit-to-head']],
    ['block', ['body-block']],
    ['dead', ['dead-animation', 'dead', 'death', 'ko']],
    ['kiss', ['kiss', 'kiss-1']],
  ];

  for (const [semanticKey, candidateKeys] of aliasDefaults) {
    if (!sharedAnimations.has(semanticKey)) {
      for (const cand of candidateKeys) {
        const found = sharedAnimations.get(cand);
        if (found) {
          sharedAnimations.set(semanticKey, found);
          break;
        }
      }
    }
  }

  return { sharedCharacters, sharedAnimations, stages, objects, legacyByCharacter };
}

const ASSET_REGISTRY = buildModelAssetRegistry();

const STANDARD_CONVENTION_RULES: readonly ConventionMoveRule[] = [
  {
    state: 'IDLE',
    clipSuffix: 'Idle',
    moveKeys: ['warrior-idle', 'breathing-idle', 'neutral-idle', 'happy-idle', 'idle-1', 'idle'],
    defaultSpeed: 1.0,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'RUN',
    clipSuffix: 'Run',
    moveKeys: ['running', 'run', 'run-to-rolling'],
    defaultSpeed: 0.95,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'ENTRY',
    clipSuffix: 'Entry',
    moveKeys: [
      'praying',
      'salute',
      'quick-formal-bow',
      'quick-informal-bow',
      'waving',
      'victory',
      'cheering',
      'entry',
    ],
    defaultSpeed: 1.25,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'PUNCH',
    clipSuffix: 'Punch',
    moveKeys: ['punching', 'hook-punch', 'quad-punch', 'elbow-punching', 'punch'],
    defaultSpeed: 2.35,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'KICK',
    clipSuffix: 'Kick',
    moveKeys: ['kicking', 'mma-kick', 'flying-kick', 'kick-to-the-groin', 'kick'],
    defaultSpeed: 2.1,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'MUAY_THAI',
    clipSuffix: 'MuayThai',
    moveKeys: [
      'mix-kick-punch',
      'kick-punch-mix',
      'quad-punch',
      'mma-kick',
      'elbow-punching',
      'flying-kick',
      'muay-thai',
    ],
    defaultSpeed: 2.1,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'POSE',
    clipSuffix: 'Pose',
    moveKeys: ['victory', 'rallying', 'cheering', 'clapping', 'excited', 'cheer-1', 'pose'],
    defaultSpeed: 1.25,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'DANCE',
    clipSuffix: 'Dance',
    moveKeys: ['trump-dance', 'excited', 'cheering', 'victory', 'cheer-2', 'dance'],
    defaultSpeed: 1.25,
    stripHorizontalRootMotion: true,
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
    stripHorizontalRootMotion: true,
  },
  {
    state: 'KISS',
    clipSuffix: 'Kiss',
    moveKeys: ['kiss', 'kiss-1'],
    defaultSpeed: 1.0,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'HIT',
    clipSuffix: 'HitBody',
    moveKeys: ['hit-to-body', 'stomach-hit', 'rib-hit', 'head-hit', 'hit'],
    defaultSpeed: 2.1,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'HIT_HEAD',
    clipSuffix: 'HitHead',
    moveKeys: ['head-hit', 'big-hit-to-head', 'hit-to-body'],
    defaultSpeed: 2.2,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'HIT_STOMACH',
    clipSuffix: 'HitStomach',
    moveKeys: ['stomach-hit', 'rib-hit', 'hit-to-body'],
    defaultSpeed: 2.1,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'HIT_BIG',
    clipSuffix: 'HitBig',
    moveKeys: ['big-hit-to-head', 'hit-by-car', 'head-hit'],
    defaultSpeed: 1.85,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'HIT_LEGS',
    clipSuffix: 'HitLegs',
    moveKeys: ['hit-on-legs', 'stomach-hit'],
    defaultSpeed: 3.2,
    stripHorizontalRootMotion: true,
  },
  {
    state: 'HIT_CAR',
    clipSuffix: 'HitCar',
    moveKeys: ['hit-by-car', 'big-hit-to-head'],
    defaultSpeed: 1.85,
    stripHorizontalRootMotion: true,
    trimStartSec: 2.65,
  },
  {
    state: 'BLOCK',
    clipSuffix: 'Block',
    moveKeys: ['body-block', 'block'],
    defaultSpeed: 2.6,
    stripHorizontalRootMotion: true,
  },
];

const CHARACTER_SPEC_OVERRIDES: Partial<
  Record<
    CharacterId,
    Partial<
      Record<
        FighterState,
        Partial<Omit<NativeGLBClipSpec, 'state' | 'url'>> & { moveKeys?: readonly string[] }
      >
    >
  >
> = {
  chinu: {
    ENTRY: { moveKeys: ['rallying', 'victory'], clipName: 'ChinuNativeVictoryEntry', speed: 1.2 },
    IDLE: { moveKeys: ['warrior-idle', 'idle-1'] },
    PUNCH: { moveKeys: ['elbow-punching', 'punching'], clipName: 'ChinuNativeElbowPunch', speed: 2.35 },
    KICK: { moveKeys: ['mma-kick', 'kicking'], clipName: 'ChinuNativeMmaKick', speed: 2.1 },
    MUAY_THAI: { moveKeys: ['mix-kick-punch', 'quad-punch'], clipName: 'ChinuNativeMuayThai', speed: 2.15 },
    KISS: { moveKeys: ['kiss', 'kiss-1'], clipName: 'ChinuNativeKiss', speed: 1.0 },
    CHAMP_POSE: { moveKeys: ['breathing-idle'], clipName: 'ChinuNativeChampPose', speed: 1.0, holdDurationSec: 2.5 },
    DANCE: { moveKeys: ['cheering', 'excited'], clipName: 'ChinuNativeCheering', speed: 1.25, stripHorizontalRootMotion: true },
    POSE: { moveKeys: ['victory'], clipName: 'ChinuNativeChampVictory', speed: 1.25, stripHorizontalRootMotion: true },
  },
  priyanshu: {
    ENTRY: { moveKeys: ['quick-formal-bow', 'waving'], clipName: 'PriyanshuNativeBowEntry', speed: 1.25 },
    IDLE: { moveKeys: ['warrior-idle'] },
    LOUNGE: {
      moveKeys: ['warrior-idle', 'breathing-idle'],
      clipName: 'PriyanshuNativeLoungePose',
      speed: 1.0,
      holdDurationSec: 2.35,
    },
    PUNCH: { moveKeys: ['punching', 'hook-punch'], speed: 2.4 },
    KICK: { moveKeys: ['flying-kick', 'kicking'], clipName: 'PriyanshuNativeFlyingKick', speed: 2.2 },
    MUAY_THAI: { moveKeys: ['mix-kick-punch', 'quad-punch'], clipName: 'PriyanshuNativeMuayThai', speed: 2.2 },
    POSE: { moveKeys: ['excited'], clipName: 'PriyanshuNativeExcitedVictory', speed: 1.35, stripHorizontalRootMotion: true },
    DANCE: { moveKeys: ['victory', 'clapping'], clipName: 'PriyanshuNativeVictoryDance', speed: 1.25, stripHorizontalRootMotion: true },
  },
  modiji: {
    ENTRY: { moveKeys: ['praying'], clipName: 'ModijiNativePrayingEntry', speed: 1.25 },
    IDLE: { moveKeys: ['breathing-idle'] },
    PUNCH: { moveKeys: ['punching'], speed: 2.35 },
    KICK: { moveKeys: ['mma-kick', 'kicking'], speed: 2.1 },
    MUAY_THAI: { moveKeys: ['mix-kick-punch', 'quad-punch'], clipName: 'ModijiNativeMuayThai', speed: 2.1 },
    POSE: { moveKeys: ['praying'], clipName: 'ModijiNativeNamasteVictory', speed: 1.05, holdDurationSec: 2.8, stripHorizontalRootMotion: true },
    DANCE: { moveKeys: ['clapping'], clipName: 'ModijiNativeClappingDance', speed: 1.2, stripHorizontalRootMotion: true },
  },
  trump: {
    ENTRY: { moveKeys: ['waving', 'rallying'], clipName: 'TrumpNativeWavingEntry', speed: 1.25 },
    IDLE: { moveKeys: ['warrior-idle'] },
    PUNCH: { moveKeys: ['hook-punch', 'punching'], clipName: 'TrumpNativeHookPunch', speed: 2.35 },
    KICK: { moveKeys: ['kicking'], speed: 2.0 },
    MUAY_THAI: { moveKeys: ['mix-kick-punch', 'quad-punch'], clipName: 'TrumpNativeMuayThai', speed: 2.1 },
    POSE: { moveKeys: ['trump-dance'], clipName: 'TrumpNativeYmcaVictory', speed: 1.25, stripHorizontalRootMotion: true },
    DANCE: { moveKeys: ['rallying'], clipName: 'TrumpNativeRallyDance', speed: 1.25, stripHorizontalRootMotion: true },
  },
  putin: {
    ENTRY: { moveKeys: ['salute'], clipName: 'PutinNativeSaluteEntry', speed: 1.2 },
    IDLE: { moveKeys: ['neutral-idle'] },
    PUNCH: { moveKeys: ['punching'], speed: 2.35 },
    KICK: { moveKeys: ['flying-kick', 'mma-kick'], clipName: 'PutinNativeFlyingKick', speed: 2.15 },
    MUAY_THAI: { moveKeys: ['mix-kick-punch', 'mma-kick', 'quad-punch'], clipName: 'PutinNativeMuayThai', speed: 2.1 },
    POSE: {
      moveKeys: ['salute'],
      clipName: 'PutinNativeSaluteVictory',
      speed: 1.15,
      holdDurationSec: 2.6,
      stripHorizontalRootMotion: true,
    },
    DANCE: { moveKeys: ['clapping'], clipName: 'PutinNativeClappingDance', speed: 1.2, stripHorizontalRootMotion: true },
    CHAMP_POSE: { moveKeys: ['neutral-idle', 'breathing-idle'], clipName: 'PutinNativeChampPose', speed: 1.0, holdDurationSec: 2.2 },
  },
  amitabh: {
    ENTRY: { moveKeys: ['quick-informal-bow', 'waving'], clipName: 'AmitabhNativeBowEntry', speed: 1.2 },
    IDLE: { moveKeys: ['breathing-idle'] },
    PUNCH: { moveKeys: ['hook-punch', 'punching'], clipName: 'AmitabhNativeHookPunch', speed: 2.35 },
    KICK: { moveKeys: ['kicking'], speed: 2.05 },
    MUAY_THAI: { moveKeys: ['mix-kick-punch', 'quad-punch'], clipName: 'AmitabhNativeMuayThai', speed: 2.1 },
    POSE: { moveKeys: ['waving'], clipName: 'AmitabhNativeShahenshahWave', speed: 1.15, holdDurationSec: 2.6, stripHorizontalRootMotion: true },
    DANCE: { moveKeys: ['quick-informal-bow'], clipName: 'AmitabhNativeBowDance', speed: 1.2, stripHorizontalRootMotion: true },
  },
};

/** Character-specific idle animation preferences for character select showcase stances (`idle-1` and `idle-2`). */
export const CHARACTER_IDLE_VARIANTS: Record<
  CharacterId,
  Record<SelectIdleVariant, readonly string[]>
> = {
  chinu: {
    'idle-1': ['warrior-idle'],
    'idle-2': ['breathing-idle'],
  },
  priyanshu: {
    'idle-1': ['breathing-idle'],
    'idle-2': ['warrior-idle'],
  },
  modiji: {
    'idle-1': ['breathing-idle'],
    'idle-2': ['neutral-idle'],
  },
  trump: {
    'idle-1': ['warrior-idle'],
    'idle-2': ['neutral-idle'],
  },
  putin: {
    'idle-1': ['neutral-idle'],
    'idle-2': ['warrior-idle'],
  },
  amitabh: {
    'idle-1': ['breathing-idle'],
    'idle-2': ['warrior-idle'],
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
  const customKeys = CHARACTER_IDLE_VARIANTS[characterId]?.[variant];
  if (customKeys) {
    const resolvedCustom = resolveMoveUrl(characterId, customKeys, false);
    if (resolvedCustom) return resolvedCustom.url;
  }
  const keys = variant === 'idle-1' ? ['idle-1', 'idle'] : ['idle-2'];
  return resolveMoveUrl(characterId, keys, variant === 'idle-1')?.url;
}

/** Returns which idle variants (`idle-1`, `idle-2`) exist for a character. */
export function getAvailableCharacterIdles(characterId: CharacterId): SelectIdleVariant[] {
  const variants: SelectIdleVariant[] = [];
  if (getCharacterIdleUrl(characterId, 'idle-1')) variants.push('idle-1');
  if (getCharacterIdleUrl(characterId, 'idle-2')) variants.push('idle-2');
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
    const custom = overrides[rule.state] ?? {};
    const candidateKeys =
      custom.moveKeys && custom.moveKeys.length > 0 ? custom.moveKeys : rule.moveKeys;
    const resolved = resolveMoveUrl(id, candidateKeys);
    if (!resolved) continue;

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
      trimStartSec: custom.trimStartSec ?? rule.trimStartSec,
      stripHorizontalRootMotion: custom.stripHorizontalRootMotion ?? rule.stripHorizontalRootMotion,
    });
  }

  const idle2Keys = CHARACTER_IDLE_VARIANTS[id]?.['idle-2'] ?? ['idle-2'];
  const secondaryIdle = resolveMoveUrl(id, idle2Keys, false);
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
