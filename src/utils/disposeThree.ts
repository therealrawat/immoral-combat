import * as THREE from 'three';

export interface DisposeObject3DOptions {
  disposeGeometries?: boolean;
  disposeMaterials?: boolean;
  disposeTextures?: boolean;
  disposeSkeletons?: boolean;
}

/**
 * Safely disposes Three.js GPU resources (`BufferGeometry`, `Material`, `Texture` maps,
 * and `SkinnedMesh.skeleton` bone matrix textures) across an `Object3D` subtree.
 */
export function disposeObject3D(
  root: THREE.Object3D,
  options: DisposeObject3DOptions = {}
): void {
  const {
    disposeGeometries = true,
    disposeMaterials = true,
    disposeTextures = true,
    disposeSkeletons = true,
  } = options;

  const disposedGeos = new Set<THREE.BufferGeometry>();
  const disposedMats = new Set<THREE.Material>();
  const disposedTexs = new Set<THREE.Texture>();
  const disposedSkeletons = new Set<THREE.Skeleton>();

  root.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (disposeSkeletons && skinned.isSkinnedMesh && skinned.skeleton) {
      if (!disposedSkeletons.has(skinned.skeleton)) {
        disposedSkeletons.add(skinned.skeleton);
        skinned.skeleton.dispose();
      }
    }

    const renderable = obj as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };

    if (disposeGeometries && renderable.geometry && !disposedGeos.has(renderable.geometry)) {
      disposedGeos.add(renderable.geometry);
      renderable.geometry.dispose();
    }

    if (!disposeMaterials || !renderable.material) return;

    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];

    for (const mat of materials) {
      if (!mat || disposedMats.has(mat)) continue;
      disposedMats.add(mat);

      if (disposeTextures) {
        for (const value of Object.values(mat as unknown as Record<string, unknown>)) {
          const maybeTex = value as { isTexture?: boolean; dispose?: () => void } | null;
          if (
            maybeTex &&
            typeof maybeTex === 'object' &&
            maybeTex.isTexture &&
            typeof maybeTex.dispose === 'function' &&
            !disposedTexs.has(maybeTex as THREE.Texture)
          ) {
            disposedTexs.add(maybeTex as THREE.Texture);
            maybeTex.dispose();
          }
        }
      }

      mat.dispose();
    }
  });
}

