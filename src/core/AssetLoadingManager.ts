import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type AssetLoadCategory =
  | 'Character Data'
  | 'Stage Data'
  | 'Signature Prop'
  | '3D Assets';

export interface AssetLoadSnapshot {
  active: boolean;
  loaded: number;
  total: number;
  percent: number;
  category: AssetLoadCategory;
  currentUrl: string;
  formattedStatus: string;
}

type AssetProgressListener = (snapshot: AssetLoadSnapshot) => void;

const DRACO_DECODER_PATH = '/draco/';

function classifyAssetUrl(url: string): AssetLoadCategory {
  const lower = url.toLowerCase();
  if (lower.includes('/stages/') || lower.includes('stage-')) {
    return 'Stage Data';
  }
  if (lower.includes('/objects/') || lower.includes('cyberpunk_laptop')) {
    return 'Signature Prop';
  }
  if (
    lower.includes('/models/') ||
    lower.includes('/characters/') ||
    lower.includes('/animations/') ||
    lower.endsWith('.glb')
  ) {
    return 'Character Data';
  }
  return '3D Assets';
}

function isInternalDecoderAsset(url: string): boolean {
  return url.includes('/draco/') || url.startsWith('blob:');
}

/**
 * Centralized Three.js LoadingManager + DRACOLoader hub powering every GLB/GLTF load
 * so UI overlays stay synchronized with real download progress instead of showing empty canvases.
 */
class AssetLoadingHub {
  public readonly manager: THREE.LoadingManager;
  private dracoLoader: DRACOLoader | null = null;
  private readonly listeners = new Set<AssetProgressListener>();

  private active = false;
  private loaded = 0;
  private total = 0;
  private currentUrl = '';
  private currentCategory: AssetLoadCategory = 'Character Data';
  private byteFractions = new Map<string, number>();

  constructor() {
    this.manager = new THREE.LoadingManager();

    this.manager.onStart = (url, itemsLoaded, itemsTotal) => {
      if (isInternalDecoderAsset(url)) return;
      this.active = true;
      this.loaded = itemsLoaded;
      this.total = Math.max(itemsTotal, 1);
      this.currentUrl = url;
      this.currentCategory = classifyAssetUrl(url);
      this.emit();
    };

    this.manager.onProgress = (url, itemsLoaded, itemsTotal) => {
      if (isInternalDecoderAsset(url)) return;
      this.byteFractions.delete(url);
      this.active = itemsLoaded < itemsTotal;
      this.loaded = itemsLoaded;
      this.total = Math.max(itemsTotal, 1);
      this.currentUrl = url;
      this.currentCategory = classifyAssetUrl(url);
      this.emit();
    };

    this.manager.onLoad = () => {
      this.byteFractions.clear();
      this.active = false;
      this.loaded = this.total;
      this.emit();
    };

    this.manager.onError = (url) => {
      this.byteFractions.delete(url);
      console.warn(`[AssetLoadingManager] Failed loading resource: ${url}`);
    };
  }

  /**
   * Lazily initializes a shared DRACOLoader configured to serve WebAssembly/JS decoders locally
   * from `/draco/` in browser environments.
   */
  public getDracoLoader(): DRACOLoader | null {
    if (typeof Worker === 'undefined') {
      return null;
    }
    if (!this.dracoLoader) {
      this.dracoLoader = new DRACOLoader(this.manager);
      this.dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    }
    return this.dracoLoader;
  }

  public preloadDraco(): void {
    this.getDracoLoader()?.preload();
  }

  public createGLTFLoader(customManager?: THREE.LoadingManager): GLTFLoader {
    const loader = new GLTFLoader(customManager ?? this.manager);
    const draco = this.getDracoLoader();
    if (draco) {
      loader.setDRACOLoader(draco);
    }
    return loader;
  }

  /**
   * Reports smooth XHR byte progress for individual large GLBs (such as multi-megabyte stages)
   * between item completion callbacks from `THREE.LoadingManager`.
   */
  public reportFileByteProgress(url: string, ratio: number): void {
    if (!url || isInternalDecoderAsset(url)) return;
    const clamped = Math.max(0, Math.min(0.99, ratio));
    this.byteFractions.set(url, clamped);
    this.active = true;
    this.currentUrl = url;
    this.currentCategory = classifyAssetUrl(url);
    this.emit();
  }

  public getSnapshot(): AssetLoadSnapshot {
    const total = Math.max(this.total, this.byteFractions.size, 1);
    let partial = 0;
    for (const frac of this.byteFractions.values()) {
      partial += frac;
    }
    const effectiveDone = this.active
      ? Math.min(total, this.loaded + partial)
      : total;
    const percent = this.total === 0 && !this.active
      ? 100
      : Math.max(0, Math.min(100, Math.round((effectiveDone / total) * 100)));

    return {
      active: this.active,
      loaded: this.loaded,
      total: this.total,
      percent,
      category: this.currentCategory,
      currentUrl: this.currentUrl,
      formattedStatus: `Loading ${this.currentCategory}: ${percent}%`,
    };
  }

  public subscribe(listener: AssetProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.dracoLoader?.dispose();
    this.dracoLoader = null;
    this.byteFractions.clear();
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

const hub = new AssetLoadingHub();

/** Shared centralized `THREE.LoadingManager` wired across all 3D GLTF/GLB loaders. */
export const assetLoadingManager = hub.manager;

/** Creates a `GLTFLoader` backed by the centralized `LoadingManager` and `DRACOLoader`. */
export function createManagedGLTFLoader(customManager?: THREE.LoadingManager): GLTFLoader {
  return hub.createGLTFLoader(customManager);
}

/** Pre-warms the local WebAssembly/JS `DRACOLoader` decoder in browser environments. */
export function preloadDracoDecoder(): void {
  hub.preloadDraco();
}

/** Feeds XHR download byte progress for an in-flight GLB into the centralized progress snapshot. */
export function reportAssetByteProgress(url: string, ratio: number): void {
  hub.reportFileByteProgress(url, ratio);
}

/** Returns current centralized asset loading status & percentage (`Loading Character Data: 85%`). */
export function getAssetLoadSnapshot(): AssetLoadSnapshot {
  return hub.getSnapshot();
}

/** Subscribes a UI listener to centralized `THREE.LoadingManager` progress updates. */
export function subscribeAssetProgress(listener: AssetProgressListener): () => void {
  return hub.subscribe(listener);
}

/** Releases the shared DRACOLoader worker pool on full application teardown. */
export function disposeAssetLoadingHub(): void {
  hub.dispose();
}

