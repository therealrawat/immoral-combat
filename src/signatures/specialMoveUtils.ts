import * as THREE from 'three';
import gsap from 'gsap';
import { normalizeMixamoBoneName } from '../characters/AnimationRetargeter';
import { disposeObject3D } from '../utils/disposeThree';

export { disposeObject3D };

export const DEFAULT_HAND_BONE_NAMES = [
  'mixamorigRightHand',
  'mixamorig:RightHand',
  'RightHand',
  'RightHandIndex1',
  'ArmR',
] as const;

/**
 * Resolves a character's right hand bone across Mixamo, Blender, or Avaturn skeletons.
 */
export function resolveRightHandBone(
  character: THREE.Object3D,
  customBoneNames?: readonly string[]
): THREE.Object3D | null {
  const candidates = [...(customBoneNames ?? []), ...DEFAULT_HAND_BONE_NAMES];
  for (const boneName of candidates) {
    const exact = character.getObjectByName(boneName);
    if (exact) return exact;
  }

  let resolved: THREE.Object3D | null = null;
  character.traverse((node) => {
    if (resolved || !node.name) return;
    if (normalizeMixamoBoneName(node.name) === 'RightHand') {
      resolved = node;
    }
  });
  return resolved;
}

/**
 * Plays a clip or pre-bound AnimationAction safely on an AnimationMixer.
 */
export function triggerMixerAction(
  mixer: THREE.AnimationMixer | undefined,
  actionOrName: THREE.AnimationAction | string | undefined,
  fadeInSeconds = 0.08
): void {
  if (!actionOrName) return;

  let action: THREE.AnimationAction | undefined;
  if (typeof actionOrName === 'string') {
    if (!mixer) return;
    const root = mixer.getRoot() as THREE.Object3D & { animations?: THREE.AnimationClip[] };
    const clip = THREE.AnimationClip.findByName(root.animations ?? [], actionOrName);
    if (!clip) return;
    action = mixer.clipAction(clip);
  } else {
    action = actionOrName;
  }

  action.reset();
  action.setEffectiveWeight(1);
  action.fadeIn(fadeInSeconds).play();
}

/**
 * Shared Three.js + GSAP lifecycle base class for character special move modules.
 * Centralizes bone lookup, world position helpers, tween tracking, cleanup callbacks,
 * and leak-free GPU disposal of transient meshes, sprites, and bone-attached props.
 */
export abstract class BaseSpecialMoves {
  protected readonly character: THREE.Object3D;
  protected readonly opponent: THREE.Object3D;
  protected readonly scene: THREE.Scene;

  private readonly activeTweens = new Set<gsap.core.Tween | gsap.core.Timeline>();
  private readonly activeObjects = new Set<THREE.Object3D>();
  private readonly cleanupCallbacks = new Set<() => void>();
  protected disposed = false;

  constructor(character: THREE.Object3D, opponent: THREE.Object3D, scene: THREE.Scene) {
    this.character = character;
    this.opponent = opponent;
    this.scene = scene;
  }

  protected resolveCharacterRightHand(customBoneNames?: readonly string[]): THREE.Object3D | null {
    return resolveRightHandBone(this.character, customBoneNames);
  }

  protected getCharacterWorldPos(): THREE.Vector3 {
    this.character.updateMatrixWorld(true);
    return this.character.getWorldPosition(new THREE.Vector3());
  }

  protected getOpponentWorldPos(overrideFn?: () => THREE.Vector3): THREE.Vector3 {
    if (overrideFn) {
      return overrideFn().clone();
    }
    this.opponent.updateMatrixWorld(true);
    return this.opponent.getWorldPosition(new THREE.Vector3());
  }

  protected computeHorizontalDirection(
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    facingFallbackTarget?: THREE.Object3D
  ): THREE.Vector3 {
    const dir = toPos.clone().sub(fromPos).setY(0);
    if (dir.lengthSq() >= 0.0001) {
      return dir.normalize();
    }
    if (facingFallbackTarget) {
      facingFallbackTarget.getWorldDirection(dir).setY(0);
      if (dir.lengthSq() >= 0.0001) {
        return dir.normalize();
      }
    }
    return new THREE.Vector3(0, 0, 1);
  }

  protected faceDirectionXZ(
    dirXZ: THREE.Vector3,
    facingTarget?: THREE.Object3D,
    durationSeconds = 0.18
  ): void {
    const target = facingTarget ?? this.character;
    const rotTween = gsap.to(target.rotation, {
      y: Math.atan2(dirXZ.x, dirXZ.z),
      duration: durationSeconds,
      ease: 'power2.out',
      onComplete: () => {
        this.untrackTween(rotTween);
      },
    });
    this.trackTween(rotTween);
  }

  protected addTransientObject(obj: THREE.Object3D, parent: THREE.Object3D = this.scene): void {
    this.activeObjects.add(obj);
    parent.add(obj);
  }

  protected destroyTransientObject(obj: THREE.Object3D): void {
    obj.parent?.remove(obj);
    disposeObject3D(obj);
    this.activeObjects.delete(obj);
  }

  protected trackTween(tween: gsap.core.Tween | gsap.core.Timeline): void {
    this.activeTweens.add(tween);
  }

  protected untrackTween(tween: gsap.core.Tween | gsap.core.Timeline): void {
    this.activeTweens.delete(tween);
  }

  protected registerCleanup(fn: () => void): () => void {
    this.cleanupCallbacks.add(fn);
    return () => {
      this.cleanupCallbacks.delete(fn);
    };
  }

  /**
   * Cancels all active GSAP tweens, restores registered transient states,
   * and detaches + disposes every temporary 3D object without leaking memory.
   */
  public dispose(): void {
    this.disposed = true;
    for (const tween of this.activeTweens) {
      tween.kill();
    }
    this.activeTweens.clear();

    for (const cleanup of [...this.cleanupCallbacks]) {
      cleanup();
    }
    this.cleanupCallbacks.clear();

    for (const obj of this.activeObjects) {
      obj.parent?.remove(obj);
      disposeObject3D(obj);
    }
    this.activeObjects.clear();
  }
}
