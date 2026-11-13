import * as THREE from 'three';
import type { SceneManager } from './SceneManager';
import { ASSET_CDN } from '../config/cdn';

export interface SkyboxPreset {
  id: string;
  displayName: string;
  url: string;
  fogHex: number;
  fogNear: number;
  fogFar: number;
}

const SKYBOX_STEMS: readonly string[] = [
  'skybox-alien',
  'skybox-day',
  'skybox-morning',
  'skybox-night',
  'skybox-space-band',
  'skybox-space-dark',
  'skybox-space-day',
  'skybox-space-galaxy',
  'skybox-space-nebula',
  'skybox-space',
];

const DEFAULT_SKYBOX_CONFIG: Record<
  string,
  { displayName: string; fogHex: number; fogNear: number; fogFar: number }
> = {
  'skybox-alien': {
    displayName: 'Alien Twilight',
    fogHex: 0x221338,
    fogNear: 45,
    fogFar: 140,
  },
  'skybox-day': {
    displayName: 'Bright Daylight',
    fogHex: 0x8ec8f2,
    fogNear: 50,
    fogFar: 150,
  },
  'skybox-morning': {
    displayName: 'Golden Dawn',
    fogHex: 0xf6ad7b,
    fogNear: 48,
    fogFar: 145,
  },
  'skybox-night': {
    displayName: 'Starry Night',
    fogHex: 0x090e1f,
    fogNear: 45,
    fogFar: 140,
  },
  'skybox-space-band': {
    displayName: 'Milky Way Galaxy',
    fogHex: 0x0a0c1a,
    fogNear: 45,
    fogFar: 140,
  },
  'skybox-space-dark': {
    displayName: 'Deep Cosmic Void',
    fogHex: 0x060812,
    fogNear: 45,
    fogFar: 140,
  },
  'skybox-space-day': {
    displayName: 'Celestial Day',
    fogHex: 0x162c4a,
    fogNear: 48,
    fogFar: 145,
  },
  'skybox-space-galaxy': {
    displayName: 'Spiral Galaxy',
    fogHex: 0x120c26,
    fogNear: 45,
    fogFar: 140,
  },
  'skybox-space-nebula': {
    displayName: 'Interstellar Nebula',
    fogHex: 0x191030,
    fogNear: 45,
    fogFar: 140,
  },
  'skybox-space': {
    displayName: 'Deep Starfield',
    fogHex: 0x050711,
    fogNear: 45,
    fogFar: 140,
  },
};

function buildSkyboxPresets(): Map<string, SkyboxPreset> {
  const presets = new Map<string, SkyboxPreset>();

  for (const stem of SKYBOX_STEMS) {
    const config = DEFAULT_SKYBOX_CONFIG[stem] ?? {
      displayName: stem
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' '),
      fogHex: 0x0c1020,
      fogNear: 45,
      fogFar: 140,
    };

    presets.set(stem, {
      id: stem,
      displayName: config.displayName,
      url: `${ASSET_CDN}/models/sky/${stem}.png`,
      fogHex: config.fogHex,
      fogNear: config.fogNear,
      fogFar: config.fogFar,
    });
  }

  return presets;
}

/**
 * Manages 360° equirectangular skybox textures from `models/sky/`,
 * caching decoded WebGL textures and applying them randomly or on demand
 * behind open fighting stages.
 */
export class SkyboxManager {
  private static readonly presets: Map<string, SkyboxPreset> = buildSkyboxPresets();

  private readonly loader = new THREE.TextureLoader();
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly inFlightLoads = new Map<string, Promise<THREE.Texture>>();
  private activeSkyboxId: string | null = null;
  private lastRandomIndex = -1;

  public getAvailableSkyboxIds(): string[] {
    return Array.from(SkyboxManager.presets.keys());
  }

  public getAvailablePresets(): SkyboxPreset[] {
    return Array.from(SkyboxManager.presets.values());
  }

  public getActiveSkyboxId(): string | null {
    return this.activeSkyboxId;
  }

  public getActivePreset(): SkyboxPreset | null {
    return this.activeSkyboxId ? SkyboxManager.presets.get(this.activeSkyboxId) ?? null : null;
  }

  /**
   * Asynchronously loads and caches an equirectangular sky texture.
   */
  public async loadSkybox(id: string): Promise<THREE.Texture | null> {
    const preset = SkyboxManager.presets.get(id.toLowerCase());
    if (!preset) {
      console.warn(`[SkyboxManager] Unknown skybox id: "${id}"`);
      return null;
    }

    if (this.textureCache.has(preset.id)) {
      return this.textureCache.get(preset.id)!;
    }

    const inFlight = this.inFlightLoads.get(preset.id);
    if (inFlight) {
      return inFlight;
    }

    const task = new Promise<THREE.Texture>((resolve, reject) => {
      this.loader.load(
        preset.url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.generateMipmaps = true;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          this.textureCache.set(preset.id, texture);
          this.inFlightLoads.delete(preset.id);
          resolve(texture);
        },
        undefined,
        (err) => {
          this.inFlightLoads.delete(preset.id);
          console.warn(`[SkyboxManager] Failed to load skybox texture from "${preset.url}":`, err);
          reject(err);
        }
      );
    });

    this.inFlightLoads.set(preset.id, task);
    return task;
  }

  /**
   * Applies a specific skybox by ID to the scene background.
   */
  public async applySkybox(
    id: string,
    sceneManager: SceneManager
  ): Promise<SkyboxPreset | null> {
    const preset = SkyboxManager.presets.get(id.toLowerCase());
    if (!preset) return null;

    try {
      const texture = await this.loadSkybox(preset.id);
      if (!texture) return null;

      sceneManager.setSkyboxTexture(texture, preset.fogHex, preset.fogNear, preset.fogFar);
      this.activeSkyboxId = preset.id;
      return preset;
    } catch (err) {
      console.warn(`[SkyboxManager] Could not apply skybox "${id}":`, err);
      return null;
    }
  }

  /**
   * Selects and applies a random skybox texture behind the current stage,
   * avoiding immediate repetition when possible.
   */
  public async applyRandomSkybox(
    sceneManager: SceneManager,
    options?: { stageId?: string; avoidRepeat?: boolean }
  ): Promise<SkyboxPreset | null> {
    const list = Array.from(SkyboxManager.presets.values());
    if (list.length === 0) return null;

    let index = Math.floor(Math.random() * list.length);
    if (options?.avoidRepeat !== false && list.length > 1 && index === this.lastRandomIndex) {
      index = (index + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
    }
    this.lastRandomIndex = index;

    const chosen = list[index];
    return this.applySkybox(chosen.id, sceneManager);
  }

  /**
   * Disposes all cached WebGL textures.
   */
  public dispose(): void {
    this.inFlightLoads.clear();
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
  }
}

