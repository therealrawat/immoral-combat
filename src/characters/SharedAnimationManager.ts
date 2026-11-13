import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetLoadingManager, createManagedGLTFLoader } from '../core/AssetLoadingManager';
import { ASSET_CDN } from '../config/cdn';
import {
  extractSkeletonRestProfile,
  retargetClipToCharacter,
  RetargetClipOptions,
  SkeletonRestProfile,
  stripGLBVisualChunks,
} from './AnimationRetargeter';
import { getCharacterAvatarUrls, getSharedAnimationUrl } from './ModelAssetRegistry';

const LOOPING_ANIMATION_PATTERN = /^(?:idle(?:[-_]\w+)?|run|walk|stance|dance|sprint|patrol|loop)$/i;

export interface LoadedSourceAnimation {
  key: string;
  url: string;
  clip: THREE.AnimationClip;
  sourceRoot: THREE.Object3D | null;
  sourceProfile: SkeletonRestProfile | null;
}

export interface SharedAnimationManagerOptions {
  charactersBasePath?: string;
  animationsBasePath?: string;
  defaultIdleAnimation?: string;
  defaultFadeDuration?: number;
  loadingManager?: THREE.LoadingManager;
}

export interface LoadCharacterOptions {
  targetWorldHeight?: number;
  groundToFloor?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  idleAnimation?: string;
  defaultFadeDuration?: number;
}

export interface PlayAnimationOptions {
  fadeDuration?: number;
  loop?: boolean;
  repetitions?: number;
  timeScale?: number;
  clampWhenFinished?: boolean;
  restartIfSame?: boolean;
  returnToIdle?: string | false;
  url?: string;
  retarget?: Omit<
    RetargetClipOptions,
    'targetProfile' | 'targetRoot' | 'sourceProfile' | 'sourceRoot' | 'clipName'
  >;
  onFinished?: (animationName: string) => void;
}

interface RegisteredCharacterAction {
  action: THREE.AnimationAction;
  clip: THREE.AnimationClip;
  loop: boolean;
  repetitions: number;
  timeScale: number;
  clampWhenFinished: boolean;
  returnToIdle: string | false;
  onFinished?: (animationName: string) => void;
}

function isUrlOrPath(value: string): boolean {
  return (
    value.includes('/') ||
    value.includes('\\') ||
    value.startsWith('blob:') ||
    value.startsWith('data:') ||
    /\.glb(?:$|\?)/i.test(value)
  );
}

function isLoopingByDefault(animationName: string): boolean {
  const stem = animationName
    .split('/')
    .pop()!
    .replace(/\.glb(?:$|\?.*)?$/i, '');
  return LOOPING_ANIMATION_PATTERN.test(stem);
}

/**
 * Active rigged character instance managed by {@link SharedAnimationManager}.
 * Owns an isolated `SkeletonUtils.clone` scene + `THREE.AnimationMixer` and provides
 * `character.play('kick')` with automatic crossfading and idle return.
 */
export class RetargetedCharacter {
  public readonly id: string;
  public readonly scene: THREE.Group;
  public readonly mixer: THREE.AnimationMixer;
  public readonly skeletonProfile: SkeletonRestProfile;

  private readonly manager: SharedAnimationManager;
  private readonly actions = new Map<string, RegisteredCharacterAction>();
  private readonly pendingLoads = new Map<string, Promise<RegisteredCharacterAction | null>>();

  private idleAnimation: string;
  private defaultFadeDuration: number;
  private currentAnimation: string | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private playToken = 0;
  private disposed = false;

  constructor(
    id: string,
    scene: THREE.Group,
    manager: SharedAnimationManager,
    options: { idleAnimation?: string; defaultFadeDuration?: number } = {}
  ) {
    this.id = id;
    this.scene = scene;
    this.manager = manager;
    this.skeletonProfile = extractSkeletonRestProfile(scene);
    this.mixer = new THREE.AnimationMixer(scene);
    this.idleAnimation = options.idleAnimation ?? 'idle';
    this.defaultFadeDuration = options.defaultFadeDuration ?? 0.16;

    this.mixer.addEventListener('finished', this.handleMixerFinished);
  }

  public getCurrentAnimation(): string | null {
    return this.currentAnimation;
  }

  public hasAnimation(animationName: string): boolean {
    return this.actions.has(animationName);
  }

  public setIdleAnimation(animationName: string): void {
    this.idleAnimation = animationName;
  }

  /** Preloads & retargets a list of shared animations for zero-latency synchronous playback. */
  public async preload(animationNames: readonly string[]): Promise<void> {
    await Promise.all(
      animationNames.map((name) => this.ensureBoundAnimation(name, undefined, {}))
    );
  }

  /**
   * Binds a preloaded or procedural `AnimationClip` directly onto this character's mixer
   * using Mixamo/Avaturn skeleton retargeting.
   */
  public bindClip(
    animationName: string,
    sourceClip: THREE.AnimationClip,
    sourceRoot?: THREE.Object3D | null,
    options: PlayAnimationOptions = {},
    sourceProfile?: SkeletonRestProfile | null
  ): THREE.AnimationAction {
    const existing = this.actions.get(animationName);
    if (existing) {
      existing.action.stop();
      this.mixer.uncacheAction(existing.clip);
    }

    const retargetedClip = retargetClipToCharacter(sourceClip, {
      targetProfile: this.skeletonProfile,
      sourceProfile: sourceProfile ?? null,
      sourceRoot: sourceRoot ?? null,
      clipName: `${this.id}_${animationName}`,
      ...(options.retarget ?? {}),
    });

    const loop = options.loop ?? isLoopingByDefault(animationName);
    const repetitions = options.repetitions ?? (loop ? Infinity : 1);
    const timeScale = options.timeScale ?? 1;
    const clampWhenFinished = options.clampWhenFinished ?? false;
    const returnToIdle =
      options.returnToIdle !== undefined ? options.returnToIdle : loop ? false : this.idleAnimation;

    const action = this.mixer.clipAction(retargetedClip);
    action.setLoop(loop || repetitions > 1 ? THREE.LoopRepeat : THREE.LoopOnce, repetitions);
    action.clampWhenFinished = clampWhenFinished;
    action.setEffectiveTimeScale(timeScale);

    this.actions.set(animationName, {
      action,
      clip: retargetedClip,
      loop,
      repetitions,
      timeScale,
      clampWhenFinished,
      returnToIdle,
      onFinished: options.onFinished,
    });

    return action;
  }

  /**
   * Loads (if not cached yet), retargets, and smoothly crossfades into the named shared animation.
   * One-shot actions (e.g. `'kick'`) automatically crossfade back into `idle` upon completion.
   */
  public async play(
    animationNameOrUrl: string,
    options: PlayAnimationOptions = {}
  ): Promise<THREE.AnimationAction | null> {
    if (this.disposed) return null;

    const token = ++this.playToken;
    const entry = await this.ensureBoundAnimation(animationNameOrUrl, options.url, options);
    if (this.disposed || token !== this.playToken || !entry) {
      return null;
    }

    return this.activateEntry(animationNameOrUrl, entry, options);
  }

  /**
   * Synchronously crossfades into an already-bound / preloaded animation without awaiting I/O.
   */
  public playSync(
    animationName: string,
    options: PlayAnimationOptions = {}
  ): THREE.AnimationAction | null {
    if (this.disposed) return null;
    const entry = this.actions.get(animationName);
    if (!entry) return null;
    this.playToken += 1;
    return this.activateEntry(animationName, entry, options);
  }

  public stop(fadeOutDuration = 0.15): void {
    if (this.disposed) return;
    this.playToken += 1;
    if (this.currentAction) {
      if (fadeOutDuration > 0) {
        this.currentAction.fadeOut(fadeOutDuration);
      } else {
        this.currentAction.stop();
      }
    }
    this.currentAction = null;
    this.currentAnimation = null;
  }

  public update(deltaSeconds: number): void {
    if (!this.disposed) {
      this.mixer.update(deltaSeconds);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.removeEventListener('finished', this.handleMixerFinished);
    this.mixer.stopAllAction();
    for (const entry of this.actions.values()) {
      this.mixer.uncacheAction(entry.clip);
    }
    this.actions.clear();
    this.pendingLoads.clear();
    this.mixer.uncacheRoot(this.scene);
    this.manager.unregisterCharacter(this);
  }

  private activateEntry(
    animationName: string,
    entry: RegisteredCharacterAction,
    options: PlayAnimationOptions
  ): THREE.AnimationAction {
    const fadeDuration = options.fadeDuration ?? this.defaultFadeDuration;
    const restartIfSame = options.restartIfSame ?? !entry.loop;

    if (options.timeScale !== undefined) {
      entry.timeScale = options.timeScale;
    }
    if (options.returnToIdle !== undefined) {
      entry.returnToIdle = options.returnToIdle;
    }
    if (options.onFinished !== undefined) {
      entry.onFinished = options.onFinished;
    }

    const nextAction = entry.action;
    if (this.currentAction === nextAction && this.currentAnimation === animationName && !restartIfSame) {
      return nextAction;
    }

    const prevAction = this.currentAction;

    nextAction.enabled = true;
    nextAction.setEffectiveTimeScale(entry.timeScale);
    nextAction.setEffectiveWeight(1);
    nextAction.reset();
    nextAction.play();

    if (prevAction && prevAction !== nextAction) {
      prevAction.enabled = true;
      prevAction.crossFadeTo(nextAction, fadeDuration, false);
    } else if (fadeDuration > 0 && !prevAction) {
      nextAction.fadeIn(fadeDuration);
    }

    this.currentAction = nextAction;
    this.currentAnimation = animationName;
    return nextAction;
  }

  private async ensureBoundAnimation(
    animationNameOrUrl: string,
    explicitUrl: string | undefined,
    options: PlayAnimationOptions
  ): Promise<RegisteredCharacterAction | null> {
    const existing = this.actions.get(animationNameOrUrl);
    if (existing) return existing;

    let pending = this.pendingLoads.get(animationNameOrUrl);
    if (!pending) {
      pending = (async () => {
        const loaded = await this.manager.loadAnimation(animationNameOrUrl, explicitUrl);
        if (!loaded || this.disposed) return null;
        this.bindClip(animationNameOrUrl, loaded.clip, loaded.sourceRoot, options, loaded.sourceProfile);
        return this.actions.get(animationNameOrUrl) ?? null;
      })();
      this.pendingLoads.set(animationNameOrUrl, pending);
    }

    try {
      return await pending;
    } finally {
      this.pendingLoads.delete(animationNameOrUrl);
    }
  }

  private readonly handleMixerFinished = (event: { action: THREE.AnimationAction }): void => {
    if (this.disposed || event.action !== this.currentAction || !this.currentAnimation) return;

    const finishedName = this.currentAnimation;
    const entry = this.actions.get(finishedName);
    if (!entry) return;

    entry.onFinished?.(finishedName);

    const idleTarget = entry.returnToIdle;
    if (idleTarget && idleTarget !== finishedName && this.actions.has(idleTarget)) {
      this.playSync(idleTarget, { fadeDuration: this.defaultFadeDuration, restartIfSame: false });
    }
  };
}

/**
 * Central manager for shared Mixamo/Avaturn animations:
 * - Downloads and caches T-pose character meshes (`SkeletonUtils.clone` per instance).
 * - Downloads and parses skinless shared animation GLBs once globally.
 * - Retargets animations per character skeleton (`Hips` height + bone rest orientations).
 * - Exposes a single `manager.update(deltaSeconds)` render-loop hook.
 */
export class SharedAnimationManager {
  private readonly loader: GLTFLoader;
  private readonly charactersBasePath: string;
  private readonly animationsBasePath: string;
  private readonly defaultIdleAnimation: string;
  private readonly defaultFadeDuration: number;

  private readonly characterTemplateCache = new Map<string, Promise<THREE.Group | null>>();
  private readonly animationCache = new Map<string, Promise<LoadedSourceAnimation | null>>();
  private readonly activeCharacters = new Set<RetargetedCharacter>();

  constructor(options: SharedAnimationManagerOptions = {}) {
    this.loader = createManagedGLTFLoader(options.loadingManager ?? assetLoadingManager);
    this.charactersBasePath = (options.charactersBasePath ?? `${ASSET_CDN}/models/characters`).replace(/\/+$/, '');
    this.animationsBasePath = (options.animationsBasePath ?? `${ASSET_CDN}/models/animations`).replace(/\/+$/, '');
    this.defaultIdleAnimation = options.defaultIdleAnimation ?? 'idle';
    this.defaultFadeDuration = options.defaultFadeDuration ?? 0.16;
  }

  /**
   * Resolves character mesh URLs in priority order: explicit URL/path -> `models/characters/<id>.glb`
   * (via Vite index) -> legacy `<id>-avatar.glb` -> `${charactersBasePath}/<id>.glb`.
   */
  public resolveCharacterUrls(characterIdOrUrl: string): string[] {
    if (isUrlOrPath(characterIdOrUrl)) {
      return [characterIdOrUrl];
    }
    const indexed = getCharacterAvatarUrls(characterIdOrUrl);
    const conventionUrl = `${this.charactersBasePath}/${characterIdOrUrl.toLowerCase()}.glb`;
    return indexed.includes(conventionUrl) ? indexed : [...indexed, conventionUrl];
  }

  /**
   * Resolves shared animation URLs in priority order: explicit URL/path -> central `models/animations/<name>.glb`
   * (via Vite index) -> `${animationsBasePath}/<name>.glb`.
   */
  public resolveAnimationUrl(animationNameOrUrl: string): string {
    if (isUrlOrPath(animationNameOrUrl)) {
      return animationNameOrUrl;
    }
    const indexed = getSharedAnimationUrl(animationNameOrUrl);
    if (indexed) return indexed;
    return `${this.animationsBasePath}/${animationNameOrUrl.toLowerCase()}.glb`;
  }

  /**
   * Loads (and caches) a base character mesh template, returns a fresh `RetargetedCharacter`
   * wrapper with an isolated clone + `AnimationMixer`, and registers it for `manager.update(dt)`.
   */
  public async loadCharacter(
    characterIdOrUrl: string,
    options: LoadCharacterOptions = {}
  ): Promise<RetargetedCharacter> {
    const candidateUrls = this.resolveCharacterUrls(characterIdOrUrl);
    const cacheKey = candidateUrls.join('|');

    let pendingTemplate = this.characterTemplateCache.get(cacheKey);
    if (!pendingTemplate) {
      pendingTemplate = this.fetchCharacterTemplate(candidateUrls);
      this.characterTemplateCache.set(cacheKey, pendingTemplate);
    }

    const template = await pendingTemplate;
    if (!template) {
      throw new Error(`Failed loading base character model for "${characterIdOrUrl}".`);
    }

    const clonedScene = SkeletonUtils.clone(template) as THREE.Group;
    this.prepareCharacterScene(clonedScene, options);

    const charId = characterIdOrUrl
      .split('/')
      .pop()!
      .replace(/\.glb(?:$|\?.*)?$/i, '');

    const instance = new RetargetedCharacter(charId, clonedScene, this, {
      idleAnimation: options.idleAnimation ?? this.defaultIdleAnimation,
      defaultFadeDuration: options.defaultFadeDuration ?? this.defaultFadeDuration,
    });
    this.activeCharacters.add(instance);
    return instance;
  }

  /**
   * Loads and globally caches a shared (typically skinless) animation GLB and extracts its
   * `AnimationClip` + optional source skeleton rest profile.
   */
  public async loadAnimation(
    animationNameOrUrl: string,
    explicitUrl?: string
  ): Promise<LoadedSourceAnimation | null> {
    const resolvedUrl = explicitUrl ?? this.resolveAnimationUrl(animationNameOrUrl);

    let pending = this.animationCache.get(resolvedUrl);
    if (!pending) {
      pending = this.fetchSourceAnimation(animationNameOrUrl, resolvedUrl);
      this.animationCache.set(resolvedUrl, pending);
    }

    return pending;
  }

  /** Preloads multiple shared animations in parallel into the global clip cache. */
  public async preloadAnimations(
    entries: readonly string[] | Record<string, string>
  ): Promise<void> {
    const tasks = Array.isArray(entries)
      ? entries.map((nameOrUrl) => this.loadAnimation(nameOrUrl))
      : Object.entries(entries).map(([name, url]) => this.loadAnimation(name, url));
    await Promise.all(tasks);
  }

  /**
   * Convenience helper to retarget a shared animation GLB directly onto any standalone `THREE.Object3D` rig.
   */
  public async retargetAnimationForCharacter(
    targetRoot: THREE.Object3D,
    animationNameOrUrl: string,
    options: Omit<
      RetargetClipOptions,
      'targetProfile' | 'targetRoot' | 'sourceProfile' | 'sourceRoot'
    > & { explicitUrl?: string } = {}
  ): Promise<THREE.AnimationClip | null> {
    const loaded = await this.loadAnimation(animationNameOrUrl, options.explicitUrl);
    if (!loaded) return null;

    return retargetClipToCharacter(loaded.clip, {
      targetRoot,
      sourceProfile: loaded.sourceProfile,
      sourceRoot: loaded.sourceRoot,
      ...options,
    });
  }

  /** Advances every active managed character's `THREE.AnimationMixer` by `deltaSeconds`. */
  public update(deltaSeconds: number): void {
    for (const character of this.activeCharacters) {
      character.update(deltaSeconds);
    }
  }

  public getActiveCharacters(): readonly RetargetedCharacter[] {
    return Array.from(this.activeCharacters);
  }

  public unregisterCharacter(character: RetargetedCharacter): void {
    this.activeCharacters.delete(character);
  }

  public disposeCharacter(character: RetargetedCharacter): void {
    character.dispose();
    this.activeCharacters.delete(character);
  }

  public clearCaches(): void {
    this.characterTemplateCache.clear();
    this.animationCache.clear();
  }

  public dispose(): void {
    for (const character of Array.from(this.activeCharacters)) {
      character.dispose();
    }
    this.activeCharacters.clear();
    this.clearCaches();
  }

  private async fetchCharacterTemplate(candidateUrls: string[]): Promise<THREE.Group | null> {
    for (const url of candidateUrls) {
      try {
        const gltf = await this.loader.loadAsync(url);
        return gltf.scene;
      } catch (err) {
        console.warn(`SharedAnimationManager: failed loading character "${url}":`, err);
      }
    }
    return null;
  }

  private async fetchSourceAnimation(
    key: string,
    url: string
  ): Promise<LoadedSourceAnimation | null> {
    try {
      let gltf: { animations: THREE.AnimationClip[]; scene?: THREE.Group };
      if (typeof fetch === 'function') {
          this.loader.manager.itemStart(url);
          try {
            const res = await fetch(url);
            if (res.ok) {
              const ab = await res.arrayBuffer();
              const stripped = stripGLBVisualChunks(ab);
              gltf = await this.loader.parseAsync(stripped ?? ab, '');
            } else {
              this.loader.manager.itemError(url);
              gltf = await this.loader.loadAsync(url);
            }
          } finally {
            this.loader.manager.itemEnd(url);
          }
        } else {
          gltf = await this.loader.loadAsync(url);
        }

        const clip = gltf.animations[0];
        if (!clip) {
          console.warn(`SharedAnimationManager: no animations found in "${url}".`);
          return null;
        }

        const sourceRoot = gltf.scene ?? null;
        const sourceProfile = sourceRoot ? extractSkeletonRestProfile(sourceRoot) : null;

        return {
          key,
          url,
          clip,
          sourceRoot,
          sourceProfile,
        };
      } catch (err) {
        console.warn(`SharedAnimationManager: failed loading animation "${url}":`, err);
        return null;
      }
    }

  private prepareCharacterScene(scene: THREE.Group, options: LoadCharacterOptions): void {
    const castShadow = options.castShadow ?? true;
    const receiveShadow = options.receiveShadow ?? true;

    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        mesh.frustumCulled = false;
      }
    });

    if (options.targetWorldHeight !== undefined || options.groundToFloor) {
      scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(scene);
      const rawHeight = bounds.max.y - bounds.min.y;
      if (options.targetWorldHeight !== undefined && Number.isFinite(rawHeight) && rawHeight > 0.2) {
        scene.scale.setScalar(options.targetWorldHeight / rawHeight);
      }
      if (options.groundToFloor && Number.isFinite(bounds.min.y)) {
        scene.position.y = -bounds.min.y * scene.scale.y + 0.004;
      }
    }
  }
}

/**
 * Shared singleton manager usable across game controllers, stage previews, and scene hooks.
 */
export const sharedAnimationManager = new SharedAnimationManager();

/**
 * Hook-style factory encapsulating character setup + shared animation loading + render updates.
 */
export function createSharedAnimationController(options: SharedAnimationManagerOptions = {}) {
  const manager = new SharedAnimationManager(options);

  return {
    manager,
    loadCharacter: (idOrUrl: string, charOptions?: LoadCharacterOptions) =>
      manager.loadCharacter(idOrUrl, charOptions),
    preload: (entries: readonly string[] | Record<string, string>) =>
      manager.preloadAnimations(entries),
    update: (deltaSeconds: number) => manager.update(deltaSeconds),
    dispose: () => manager.dispose(),
  };
}

