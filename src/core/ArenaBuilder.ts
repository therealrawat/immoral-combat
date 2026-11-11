import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getStageModelUrl } from '../characters/ModelAssetRegistry';
import { disposeObject3D } from '../signatures/specialMoveUtils';
import type { SceneManager } from './SceneManager';

export const ARENA_HALF_WIDTH = 3.35;
/** Alias preserved for combat boundary physics (`PhysicsCombatSystem`). */
export const RING_HALF_WIDTH = ARENA_HALF_WIDTH;

export interface StagePreset {
  displayName: string;
  scale?: number;
  anchorXZ?: readonly [number, number];
  bgHex: number;
  fogHex: number;
  fogNear: number;
  fogFar: number;
}

const DEFAULT_STAGE_ATMOSPHERE = {
  bgHex: 0x9be2ff,
  fogHex: 0x9be2ff,
  fogNear: 22,
  fogFar: 52,
} as const;

const STAGE_PRESETS: Record<string, StagePreset> = {
  'stage-1': {
    displayName: 'Cyber Arena',
    scale: 32,
    anchorXZ: [0, 0],
    bgHex: 0x090d16,
    fogHex: 0x090d16,
    fogNear: 20,
    fogFar: 56,
  },
  'stage-2': {
    displayName: 'Dojo Courtyard',
    scale: 1.0,
    anchorXZ: [6.5, 2.0],
    ...DEFAULT_STAGE_ATMOSPHERE,
  },
  'stage-3': {
    displayName: 'Tournament Stage',
    scale: 42,
    anchorXZ: [0, 0],
    bgHex: 0x7dd3fc,
    fogHex: 0xb9e6fe,
    fogNear: 24,
    fogFar: 60,
  },
};

const FLOOR_PROBE_XZ: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-1.15, 0],
  [1.15, 0],
  [0, -1.15],
  [0, 1.15],
];

/** Returns preset visual & spatial calibration for a stage ID, with sensible defaults. */
export function getStagePreset(stageId: string): StagePreset {
  const key = stageId.toLowerCase();
  const preset = STAGE_PRESETS[key];
  if (preset) return preset;

  return {
    displayName: getStageDisplayName(key),
    ...DEFAULT_STAGE_ATMOSPHERE,
  };
}

/** Formats a stage asset stem (`stage-1`, `dojo-night`) into a readable HUD label. */
export function getStageDisplayName(stageId: string): string {
  const key = stageId.toLowerCase();
  const preset = STAGE_PRESETS[key];
  if (preset) return preset.displayName;

  return key
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Scales, centers onto the playable arena origin, configures shadow flags,
 * and raycast-grounds a loaded GLB stage root so fighters stand cleanly at `y = 0`.
 */
export function applyStageTransformAndGround(
  root: THREE.Object3D,
  stageId: string
): StagePreset {
  const preset = getStagePreset(stageId);

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
  });

  root.position.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);

  const rawBox = new THREE.Box3().setFromObject(root);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawHorizSpan = Math.max(rawSize.x, rawSize.z);
  const scale =
    preset.scale ?? (rawHorizSpan > 0.001 && rawHorizSpan < 4 ? 28 / rawHorizSpan : 1);

  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  if (preset.anchorXZ) {
    root.position.set(-preset.anchorXZ[0] * scale, 0, -preset.anchorXZ[1] * scale);
  } else {
    const scaledBox = new THREE.Box3().setFromObject(root);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    root.position.set(-scaledCenter.x, 0, -scaledCenter.z);
  }
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxFloorY = box.min.y + Math.max(1.5, size.y * 0.35);
  const rayOriginY = box.max.y + 5;
  const downDir = new THREE.Vector3(0, -1, 0);
  const raycaster = new THREE.Raycaster();
  const sampledFloorHeights: number[] = [];

  for (const [x, z] of FLOOR_PROBE_XZ) {
    raycaster.set(new THREE.Vector3(x, rayOriginY, z), downDir);
    const hits = raycaster.intersectObject(root, true);
    let highestWalkableY = -Infinity;
    for (const hit of hits) {
      if (hit.point.y <= maxFloorY && hit.point.y > highestWalkableY) {
        highestWalkableY = hit.point.y;
      }
    }
    if (Number.isFinite(highestWalkableY)) {
      sampledFloorHeights.push(highestWalkableY);
    }
  }

  if (sampledFloorHeights.length > 0) {
    sampledFloorHeights.sort((a, b) => a - b);
    const medianY = sampledFloorHeights[Math.floor(sampledFloorHeights.length / 2)];
    root.position.y -= medianY;
  } else if (Number.isFinite(box.min.y)) {
    root.position.y -= box.min.y;
  }
  root.updateMatrixWorld(true);

  return preset;
}

/**
 * Loads, grounds, switches, and disposes GLB fighting stages in `SceneManager.scene`.
 */
export class StageManager {
  private readonly loader = new GLTFLoader();
  private currentStageRoot: THREE.Object3D | null = null;
  private shadowCatcher: THREE.Mesh | null = null;
  private activeStageId = '';
  private loadedStageId = '';
  private inFlightLoads = new Map<string, Promise<void>>();
  private loadToken = 0;
  private disposed = false;

  constructor(private readonly sceneManager: SceneManager) {
    const shadowGeom = new THREE.CircleGeometry(ARENA_HALF_WIDTH + 2.5, 48);
    shadowGeom.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.28 });
    this.shadowCatcher = new THREE.Mesh(shadowGeom, shadowMat);
    this.shadowCatcher.position.y = -0.004;
    this.shadowCatcher.receiveShadow = true;
    this.sceneManager.scene.add(this.shadowCatcher);
  }

  public getActiveStageId(): string {
    return this.activeStageId;
  }

  public isStageLoaded(stageId: string): boolean {
    return !this.disposed && this.loadedStageId === stageId.toLowerCase() && this.currentStageRoot !== null;
  }

  public async loadStage(
    stageId: string,
    onProgress?: (ratio: number) => void
  ): Promise<void> {
    if (this.disposed) return;

    const normalizedId = stageId.toLowerCase();
    const url = getStageModelUrl(normalizedId);
    if (!url) {
      console.warn(`[StageManager] Unknown stage "${stageId}" (not found in models/stages).`);
      return;
    }

    if (this.isStageLoaded(normalizedId)) {
      this.activeStageId = normalizedId;
      onProgress?.(1);
      return;
    }

    this.activeStageId = normalizedId;
    const existing = this.inFlightLoads.get(normalizedId);
    if (existing) {
      await existing;
      if (this.isStageLoaded(normalizedId)) {
        onProgress?.(1);
      }
      return;
    }

    const token = ++this.loadToken;
    const runLoad = async (): Promise<void> => {
      try {
        onProgress?.(0.05);
        const gltf = await this.loader.loadAsync(url, (evt) => {
          if (this.disposed || token !== this.loadToken) return;
          if (evt.lengthComputable && evt.total > 0) {
            onProgress?.(Math.min(0.98, evt.loaded / evt.total));
          }
        });
        if (this.disposed || token !== this.loadToken) {
          disposeObject3D(gltf.scene);
          return;
        }

        this.clearShadowCatcher();
        this.clearCurrentStage();

        const preset = applyStageTransformAndGround(gltf.scene, normalizedId);
        this.sceneManager.setAtmosphere(
          preset.bgHex,
          preset.fogHex,
          preset.fogNear,
          preset.fogFar
        );
        this.sceneManager.scene.add(gltf.scene);
        this.currentStageRoot = gltf.scene;
        this.loadedStageId = normalizedId;
        onProgress?.(1);
      } catch (error) {
        console.warn(`[StageManager] Failed to load stage "${stageId}":`, error);
      } finally {
        if (this.inFlightLoads.get(normalizedId) === task) {
          this.inFlightLoads.delete(normalizedId);
        }
      }
    };
    const task = runLoad();

    this.inFlightLoads.set(normalizedId, task);
    await task;
  }

  private clearShadowCatcher(): void {
    if (!this.shadowCatcher) return;
    this.shadowCatcher.removeFromParent();
    disposeObject3D(this.shadowCatcher);
    this.shadowCatcher = null;
  }

  private clearCurrentStage(): void {
    this.loadedStageId = '';
    if (!this.currentStageRoot) return;
    this.currentStageRoot.removeFromParent();
    disposeObject3D(this.currentStageRoot);
    this.currentStageRoot = null;
  }

  public dispose(): void {
    this.disposed = true;
    this.loadToken++;
    this.inFlightLoads.clear();
    this.clearShadowCatcher();
    this.clearCurrentStage();
  }
}
