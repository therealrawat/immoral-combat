import gsap from 'gsap';
import * as THREE from 'three';
import { BaseSpecialMoves, triggerMixerAction } from '../specialMoveUtils';

const SONIC_BOOM_DURATION_SECONDS = 0.6;
const SONIC_BOOM_TARGET_SCALE = 15;
const DEFAULT_SONIC_BOOM_RADIUS = 15;
const STUN_DURATION_SECONDS = 2;

const DRINK_DURATION_SECONDS = 1.5;
const CHAI_BUFF_DURATION_SECONDS = 5;
const CHAI_HEAL_FRACTION = 0.2;
const CHAI_GLOW_COLOR = 0xff7a00;
const CHAI_GLOW_INTENSITY = 0.95;

type EmissiveMaterial = THREE.Material & {
  emissive: THREE.Color;
  emissiveIntensity?: number;
};

export interface ModijiSpecialMovesOptions {
  /** AnimationMixer belonging to Modiji's 3D rig (optional when driving via callbacks). */
  mixer?: THREE.AnimationMixer;
  /** Commanding / public speaking AnimationAction (or clip name) for "Mitron!" Sonic Boom. */
  speakingAction?: THREE.AnimationAction | string;
  /** Drinking AnimationAction (or clip name) for "Chai Break". */
  drinkAction?: THREE.AnimationAction | string;
  /** AnimationMixer belonging to the opponent's 3D rig. */
  opponentMixer?: THREE.AnimationMixer;
  /** Opponent Stunned/Dizzy AnimationAction (or clip name) triggered when caught in Sonic Boom. */
  opponentStunAction?: THREE.AnimationAction | string;
  /** Optional model sub-root carrying yaw rotation (used when root stays axis-aligned). */
  facingTarget?: THREE.Object3D;
  /** Optional blast radius threshold for Sonic Boom hit detection (defaults to 15). */
  blastRadius?: number;
  /** Optional custom bone names searched before normalized Mixamo traversal. */
  rightHandBoneNames?: readonly string[];
  onTriggerSpeakingAnimation?: () => void;
  onTriggerDrinkAnimation?: () => void;
  onTriggerOpponentStun?: (durationSec: number) => void;
  setOpponentMovementPaused?: (paused: boolean) => void;
  getOpponentPosition?: () => THREE.Vector3;
  onSonicBoomSpawn?: (origin: THREE.Vector3) => void;
  onSonicBoomImpact?: (
    origin: THREE.Vector3,
    opponentHit: boolean,
    distance: number,
    damage: number
  ) => void;
  /** Optional standalone health callbacks (used to compute/apply the +20% HP restore). */
  getHealth?: () => number;
  getMaxHealth?: () => number;
  setHealth?: (nextHp: number) => void;
  /** Optional UI DOM nodes updated directly when restoring 20% health standalone. */
  healthBarElement?: HTMLElement | null;
  healthTextElement?: HTMLElement | null;
  onChaiBreakStart?: (cupBone: THREE.Object3D | null) => void;
  onHeal?: (restoredAmount: number, nextHp: number, maxHp: number) => void;
}

/**
 * Modular Three.js + GSAP controller for Modiji's two signature moves:
 * 1. AoE Attack — The `"Mitron!"` Sonic Boom (orange expanding sphere scale 1->15 over 0.6s,
 *    opponent Stunned/Dizzy + 2s movement pause within blast radius).
 * 2. Buff/Heal — The `"Chai Break"` (cup CylinderGeometry attached to right hand bone for 1.5s,
 *    saffron emissive glow for 5s, and instant +20% UI health restoration).
 */
export class ModijiSpecialMoves extends BaseSpecialMoves {
  private readonly options: ModijiSpecialMovesOptions;
  private restoreActiveGlow?: () => void;
  private restoreActiveStun?: () => void;

  constructor(
    character: THREE.Object3D,
    opponent: THREE.Object3D,
    scene: THREE.Scene,
    options: ModijiSpecialMovesOptions = {}
  ) {
    super(character, opponent, scene);
    this.options = options;
  }

  /**
   * Resolves the right hand bone on Mixamo, Blender, or Avaturn skeletons (`mixamorigRightHand` / `RightHand`).
   */
  public findRightHandBone(): THREE.Object3D | null {
    return this.resolveCharacterRightHand(this.options.rightHandBoneNames);
  }

  /**
   * Ability 1 — AoE Attack: The `"Mitron!"` Sonic Boom
   * Expands a translucent bright orange SphereGeometry (scale 1 -> 15, opacity 0.8 -> 0 over 0.6s),
   * stuns opponents within the blast radius and pauses their movement logic for 2 seconds.
   */
  public executeMitronSonicBoom(): Promise<void> {
    if (this.disposed) return Promise.resolve();

    const origin = this.getCharacterWorldPos();
    const oppPos = this.getOpponentWorldPos(this.options.getOpponentPosition);
    this.faceTowards(origin, oppPos);
    this.triggerSpeakingAnimation();

    const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0xff7a00,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const sonicSphere = new THREE.Mesh(sphereGeo, sphereMat);
    sonicSphere.position.copy(origin);
    sonicSphere.scale.setScalar(1);
    this.addTransientObject(sonicSphere);
    this.options.onSonicBoomSpawn?.(origin.clone());

    const blastRadius = this.options.blastRadius ?? DEFAULT_SONIC_BOOM_RADIUS;
    const distance = origin.distanceTo(oppPos);
    const withinRadius = distance <= blastRadius;

    if (withinRadius) {
      this.applyOpponentSonicStun();
    }
    this.options.onSonicBoomImpact?.(origin.clone(), withinRadius, distance, withinRadius ? 22 : 0);

    return new Promise<void>((resolve) => {
      const scaleTween = gsap.to(sonicSphere.scale, {
        x: SONIC_BOOM_TARGET_SCALE,
        y: SONIC_BOOM_TARGET_SCALE,
        z: SONIC_BOOM_TARGET_SCALE,
        duration: SONIC_BOOM_DURATION_SECONDS,
        ease: 'power2.out',
        onComplete: () => {
          this.untrackTween(scaleTween);
        },
      });
      this.trackTween(scaleTween);

      const opacityTween = gsap.to(sphereMat, {
        opacity: 0,
        duration: SONIC_BOOM_DURATION_SECONDS,
        ease: 'power2.out',
        onComplete: () => {
          scaleTween.kill();
          this.untrackTween(scaleTween);
          this.untrackTween(opacityTween);
          this.destroyTransientObject(sonicSphere);
          resolve();
        },
      });
      this.trackTween(opacityTween);
    });
  }

  /**
   * Ability 2 — Buff/Heal: The `"Chai Break"`
   * Attaches a small brown CylinderGeometry cup to the right hand bone for 1.5s,
   * tweens Modiji's emissive material to saffron/orange for 5s, and restores 20% health immediately.
   */
  public executeChaiBreak(): Promise<void> {
    if (this.disposed) return Promise.resolve();

    this.triggerDrinkAnimation();

    // Collect character materials before attaching the transient cup so the cup itself isn't included.
    const emissiveMaterials = this.collectCharacterEmissiveMaterials();
    const cupMesh = this.createChaiCupMesh();
    const handBone = this.findRightHandBone();
    const attachParent = handBone ?? this.character;
    if (handBone) {
      cupMesh.position.set(0, 0.04, 0.05);
      cupMesh.rotation.x = Math.PI * 0.18;
    } else {
      cupMesh.position.set(0.24, 1.42, 0.25);
    }
    this.addTransientObject(cupMesh, attachParent);
    this.options.onChaiBreakStart?.(handBone);

    this.restoreTwentyPercentHealth();
    const buffPromise = this.applySaffronBuffGlow(emissiveMaterials);

    const cupRemovalPromise = new Promise<void>((resolveCup) => {
      const cupTimer = gsap.delayedCall(DRINK_DURATION_SECONDS, () => {
        this.untrackTween(cupTimer);
        this.destroyTransientObject(cupMesh);
        resolveCup();
      });
      this.trackTween(cupTimer);
    });

    return Promise.all([cupRemovalPromise, buffPromise]).then(() => undefined);
  }

  private getFacingTarget(): THREE.Object3D {
    return this.options.facingTarget ?? this.character;
  }

  private faceTowards(fromPos: THREE.Vector3, targetPos: THREE.Vector3): void {
    const dir = targetPos.clone().sub(fromPos).setY(0);
    if (dir.lengthSq() < 0.0001) return;
    const facing = this.getFacingTarget();
    const rotTween = gsap.to(facing.rotation, {
      y: Math.atan2(dir.x, dir.z),
      duration: 0.16,
      ease: 'power2.out',
      onComplete: () => {
        this.untrackTween(rotTween);
      },
    });
    this.trackTween(rotTween);
  }

  private triggerSpeakingAnimation(): void {
    if (this.options.onTriggerSpeakingAnimation) {
      this.options.onTriggerSpeakingAnimation();
      return;
    }
    triggerMixerAction(this.options.mixer, this.options.speakingAction);
  }

  private triggerDrinkAnimation(): void {
    if (this.options.onTriggerDrinkAnimation) {
      this.options.onTriggerDrinkAnimation();
      return;
    }
    triggerMixerAction(this.options.mixer, this.options.drinkAction);
  }

  private applyOpponentSonicStun(): void {
    this.restoreActiveStun?.();

    if (this.options.onTriggerOpponentStun) {
      this.options.onTriggerOpponentStun(STUN_DURATION_SECONDS);
    } else {
      triggerMixerAction(this.options.opponentMixer, this.options.opponentStunAction);
    }

    this.opponent.userData.movementPaused = true;
    this.options.setOpponentMovementPaused?.(true);

    let cleared = false;
    const restore = () => {
      if (cleared) return;
      cleared = true;
      this.opponent.userData.movementPaused = false;
      this.options.setOpponentMovementPaused?.(false);
      this.restoreActiveStun = undefined;
    };

    const unregister = this.registerCleanup(restore);
    this.restoreActiveStun = () => {
      unregister();
      restore();
    };

    const stunTimer = gsap.delayedCall(STUN_DURATION_SECONDS, () => {
      this.untrackTween(stunTimer);
      unregister();
      restore();
    });
    this.trackTween(stunTimer);
  }

  private collectCharacterEmissiveMaterials(): EmissiveMaterial[] {
    const unique = new Set<EmissiveMaterial>();
    this.character.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || mesh.visible === false) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const candidate = mat as Partial<EmissiveMaterial> | undefined;
        if (candidate?.emissive instanceof THREE.Color) {
          unique.add(candidate as EmissiveMaterial);
        }
      }
    });
    return [...unique];
  }

  private applySaffronBuffGlow(materials: EmissiveMaterial[]): Promise<void> {
    this.restoreActiveGlow?.();

    if (materials.length === 0) {
      return new Promise<void>((resolve) => {
        const waitTimer = gsap.delayedCall(CHAI_BUFF_DURATION_SECONDS, () => {
          this.untrackTween(waitTimer);
          resolve();
        });
        this.trackTween(waitTimer);
      });
    }

    const savedStates = materials.map((mat) => ({
      mat,
      emissive: mat.emissive.clone(),
      emissiveIntensity: mat.emissiveIntensity ?? 1,
    }));

    const glowColor = new THREE.Color(CHAI_GLOW_COLOR);
    let restored = false;

    const restoreSavedEmissive = () => {
      if (restored) return;
      restored = true;
      for (const state of savedStates) {
        state.mat.emissive.copy(state.emissive);
        if (typeof state.mat.emissiveIntensity === 'number') {
          state.mat.emissiveIntensity = state.emissiveIntensity;
        }
      }
      this.restoreActiveGlow = undefined;
    };

    const unregister = this.registerCleanup(restoreSavedEmissive);
    this.restoreActiveGlow = () => {
      unregister();
      restoreSavedEmissive();
    };

    return new Promise<void>((resolve) => {
      let remaining = savedStates.length;

      for (const state of savedStates) {
        const inColorTween = gsap.to(state.mat.emissive, {
          r: glowColor.r,
          g: glowColor.g,
          b: glowColor.b,
          duration: 0.28,
          ease: 'power2.out',
          onComplete: () => this.untrackTween(inColorTween),
        });
        this.trackTween(inColorTween);

        const outColorTween = gsap.to(state.mat.emissive, {
          r: state.emissive.r,
          g: state.emissive.g,
          b: state.emissive.b,
          duration: 0.42,
          delay: CHAI_BUFF_DURATION_SECONDS,
          ease: 'power2.inOut',
          onComplete: () => {
            this.untrackTween(outColorTween);
            remaining -= 1;
            if (remaining <= 0) {
              unregister();
              restoreSavedEmissive();
              resolve();
            }
          },
        });
        this.trackTween(outColorTween);

        if (typeof state.mat.emissiveIntensity === 'number') {
          const inIntensityTween = gsap.to(state.mat, {
            emissiveIntensity: CHAI_GLOW_INTENSITY,
            duration: 0.28,
            ease: 'power2.out',
            onComplete: () => this.untrackTween(inIntensityTween),
          });
          this.trackTween(inIntensityTween);

          const outIntensityTween = gsap.to(state.mat, {
            emissiveIntensity: state.emissiveIntensity,
            duration: 0.42,
            delay: CHAI_BUFF_DURATION_SECONDS,
            ease: 'power2.inOut',
            onComplete: () => this.untrackTween(outIntensityTween),
          });
          this.trackTween(outIntensityTween);
        }
      }
    });
  }

  private restoreTwentyPercentHealth(): void {
    const maxHp = Math.max(1, this.options.getMaxHealth?.() ?? 100);
    const currentHp =
      this.options.getHealth?.() ??
      (typeof this.character.userData.health === 'number' ? this.character.userData.health : maxHp);
    const healDelta = Math.round(maxHp * CHAI_HEAL_FRACTION);
    const nextHp = Math.min(maxHp, currentHp + healDelta);
    const actualRestored = Math.max(0, nextHp - currentHp);

    if (this.options.setHealth) {
      this.options.setHealth(nextHp);
    } else {
      this.character.userData.health = nextHp;
    }

    const percent = Math.max(0, Math.min(100, (nextHp / maxHp) * 100));
    if (this.options.healthBarElement) {
      this.options.healthBarElement.style.width = `${percent}%`;
    }
    if (this.options.healthTextElement) {
      this.options.healthTextElement.textContent = `${nextHp} / ${maxHp} HP`;
    }

    this.options.onHeal?.(actualRestored, nextHp, maxHp);
  }

  private createChaiCupMesh(): THREE.Mesh {
    const cupGeo = new THREE.CylinderGeometry(0.052, 0.036, 0.11, 16);
    const cupMat = new THREE.MeshStandardMaterial({
      color: 0x7c3f1d,
      roughness: 0.65,
      metalness: 0.05,
    });
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.name = 'ChaiCupProp';
    cup.castShadow = true;
    return cup;
  }
}

