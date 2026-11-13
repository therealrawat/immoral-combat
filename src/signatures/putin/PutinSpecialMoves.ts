import gsap from 'gsap';
import * as THREE from 'three';
import { BaseSpecialMoves, triggerMixerAction } from '../specialMoveUtils';

const TABLE_WIDTH = 0.92;
const TABLE_HEIGHT = 0.78;
const TABLE_UNIT_DEPTH = 0.24;
const TABLE_TARGET_SCALE_Z = 20;
const TABLE_FULL_LENGTH = TABLE_UNIT_DEPTH * TABLE_TARGET_SCALE_Z;
const TABLE_STRIKE_DURATION_SECONDS = 0.3;
const TABLE_HOLD_SECONDS = 2;
const TABLE_FADE_DURATION_SECONDS = 0.45;
const TABLE_KNOCKBACK_DURATION_SECONDS = 0.34;
const TABLE_HIT_DAMAGE = 30;

const DOLL_RADIUS = 0.11;
const DOLL_LENGTH = 0.18;
const DOLL_BASE_HALF_HEIGHT = DOLL_RADIUS + DOLL_LENGTH * 0.5;
const DOLL_THROW_DURATION_SECONDS = 0.5;
const DOLL_THROW_ARC_HEIGHT = 1.35;
const DOLL_BOUNCE_COUNT = 3;
const DOLL_BOUNCE_DURATIONS = [0.28, 0.25, 0.22] as const;
const DOLL_BOUNCE_ARCS = [0.92, 0.64, 0.42] as const;
const DOLL_BOUNCE_ADVANCE_RATIOS = [0.52, 0.78, 1.0] as const;
const DOLL_EXPLOSION_HIT_RADII = [1.65, 1.45, 1.3, 1.2] as const;
const DOLL_EXPLOSION_DAMAGES = [10, 9, 8, 12] as const;
const DOLL_EXPLOSION_SPHERE_SCALES = [3.6, 3.0, 2.5, 2.9] as const;

export interface MatryoshkaExplosionEvent {
  step: number;
  impactPos: THREE.Vector3;
  dollScale: number;
  opponentHit: boolean;
  distance: number;
  pushDir: THREE.Vector3;
  damage: number;
}

export interface PutinSpecialMovesOptions {
  /** AnimationMixer belonging to Putin's 3D rig (optional when driving via callbacks). */
  mixer?: THREE.AnimationMixer;
  /** Heavy stomp or aggressive pointing AnimationAction (or clip name) for "The Long Table". */
  stompAction?: THREE.AnimationAction | string;
  /** Throwing AnimationAction (or clip name) for "Matryoshka Munition". */
  throwAction?: THREE.AnimationAction | string;
  /** AnimationMixer belonging to the opponent's 3D rig. */
  opponentMixer?: THREE.AnimationMixer;
  /** Opponent hit/flinch AnimationAction (or clip name). */
  opponentHitAction?: THREE.AnimationAction | string;
  /** Optional model sub-root carrying yaw rotation (used when character root stays axis-aligned). */
  facingTarget?: THREE.Object3D;
  /** Optional opponent model sub-root carrying yaw rotation. */
  opponentFacingTarget?: THREE.Object3D;
  /** Optional custom bone names searched before normalized Mixamo traversal. */
  rightHandBoneNames?: readonly string[];
  onTriggerStompAnimation?: () => void;
  onTriggerThrowAnimation?: () => void;
  onTriggerLiftingAnimation?: () => void;
  onTriggerStabbingAnimation?: () => void;
  onTriggerSaluteAnimation?: () => void;
  onKnifeSpawn?: (knifeGroup: THREE.Group) => void;
  onKnifeStabImpact?: (impactPos: THREE.Vector3, damage: number) => void;
  onOpponentGroanAndDie?: () => void;
  onSaluteStart?: () => void;
  onTriggerOpponentHit?: (heavy: boolean, pushDir: THREE.Vector3) => void;
  getCharacterPosition?: () => THREE.Vector3;
  setCharacterPosition?: (x: number, z: number) => void;
  getOpponentPosition?: () => THREE.Vector3;
  setOpponentPosition?: (x: number, z: number) => void;
  clampTargetPosition?: (pos: THREE.Vector3) => THREE.Vector3;
  onTableSpawn?: (spawnPos: THREE.Vector3, forward: THREE.Vector3) => void;
  onTableHit?: (
    impactPos: THREE.Vector3,
    pushDir: THREE.Vector3,
    knockbackEdge: THREE.Vector3,
    damage: number
  ) => void;
  onTableStrikeResolved?: (opponentHit: boolean) => void;
  onMatryoshkaThrow?: (spawnPos: THREE.Vector3) => void;
  onMatryoshkaExplosion?: (event: MatryoshkaExplosionEvent) => void;
}

function createSleekTableTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, '#e2e8f0');
  grad.addColorStop(0.12, '#ffffff');
  grad.addColorStop(0.5, '#f8fafc');
  grad.addColorStop(0.88, '#ffffff');
  grad.addColorStop(1, '#e2e8f0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle gold Kremlin trim lines running along the sleek white surface
  ctx.fillStyle = '#eab308';
  ctx.fillRect(14, 0, 5, canvas.height);
  ctx.fillRect(canvas.width - 19, 0, 5, canvas.height);
  ctx.fillRect(14, 10, canvas.width - 28, 6);
  ctx.fillRect(14, canvas.height - 16, canvas.width - 28, 6);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMatryoshkaTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Classic brightly painted Matryoshka doll stripes + gold floral medallions
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 44, 256, 20);
  ctx.fillRect(0, 184, 256, 22);

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(0, 64, 256, 120);

  ctx.fillStyle = '#fde047';
  for (let x = 32; x < 256; x += 64) {
    ctx.beginPath();
    ctx.arc(x, 124, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.arc(x, 124, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Modular Three.js + GSAP controller for Putin's two signature moves:
 * 1. Battering Ram / Knockback — `"The Long Table"` (`THREE.BoxGeometry` at Putin's feet,
 *    Z-scale tween 0 -> 20 over 0.3s, intersection check + massive knockback to table edge, fade after 2s).
 * 2. Chained Projectile — `"Matryoshka Munition"` (`THREE.CapsuleGeometry` nesting doll bomb thrown
 *    from the hand in 0.5s, chaining 3 size-halving bounces and orange sphere explosions via GSAP `onComplete`).
 */
export class PutinSpecialMoves extends BaseSpecialMoves {
  private readonly options: PutinSpecialMovesOptions;

  constructor(
    character: THREE.Object3D,
    opponent: THREE.Object3D,
    scene: THREE.Scene,
    options: PutinSpecialMovesOptions = {}
  ) {
    super(character, opponent, scene);
    this.options = options;
  }

  /**
   * Resolves Putin's right hand bone across Mixamo, Blender, or Avaturn skeletons.
   */
  public findRightHandBone(): THREE.Object3D | null {
    return this.resolveCharacterRightHand(this.options.rightHandBoneNames);
  }

  /**
   * Primary Ability — Lethal Knife Strike: `"KGB Cold Blade"`
   * 1. Putin bends down and picks up a tactical combat knife (Lifting.glb).
   * 2. Knife appears in right hand at t = 1.15s with metallic unsheathe shimmer.
   * 3. Putin advances into point-blank distance (0.68m) and plunges the blade deep into opponent's torso (Stabbing.glb).
   * 4. Opponent suffers freeze-frame impact, groans, and collapses into DEAD/FALL_BACK.
   * 5. Putin sheathes the blade, snaps to attention, and formally salutes (Salute.glb).
   */
  public executeKgbKnife(): Promise<void> {
    if (this.disposed) return Promise.resolve();

    const charPos = this.options.getCharacterPosition
      ? this.options.getCharacterPosition()
      : this.getCharacterWorldPos();
    const oppPos = this.getOpponentWorldPos(this.options.getOpponentPosition);
    const forward = this.computeHorizontalDirection(
      charPos,
      oppPos,
      this.options.facingTarget ?? this.character
    );
    this.faceDirectionXZ(forward, this.options.facingTarget, 0.12);
    if (this.options.opponentFacingTarget) {
      this.faceDirectionXZ(forward.clone().negate(), this.options.opponentFacingTarget, 0.12);
    }

    // Phase 1: Trigger Lifting animation
    this.options.onTriggerLiftingAnimation?.();

    return new Promise<void>((resolve) => {
      const unregisterResolve = this.registerCleanup(resolve);
      let knifeWrapper: THREE.Group | null = null;

      // At t = 1.15s into Lifting, Putin reaches down to floor/boot; knife attaches to right hand!
      const liftTween = gsap.delayedCall(1.15, () => {
        if (this.disposed) return;
        const handBone = this.findRightHandBone();
        knifeWrapper = this.createCombatKnifeGroup();
        const attachParent = handBone ?? this.character;
        if (!handBone) {
          knifeWrapper.position.set(0.18, 0.95, 0.22);
        }
        this.addTransientObject(knifeWrapper, attachParent);
        this.options.onKnifeSpawn?.(knifeWrapper);
      });
      this.trackTween(liftTween);

      // Point-blank combat distance: 0.68m between character centers ensures
      // the knife blade physically plunges deep into the opponent's torso.
      const STAB_DISTANCE = 0.68;
      const targetX = oppPos.x - forward.x * STAB_DISTANCE;
      const targetZ = oppPos.z - forward.z * STAB_DISTANCE;
      const targetSpot = new THREE.Vector3(targetX, charPos.y, targetZ);
      const clampedSpot = this.options.clampTargetPosition
        ? this.options.clampTargetPosition(targetSpot)
        : targetSpot;

      // In case arena boundary forced Putin inward, adjust opponent so they maintain 0.68m
      const sep = Math.hypot(oppPos.x - clampedSpot.x, oppPos.z - clampedSpot.z);
      if (sep > 0.74) {
        const adjustedOppX = clampedSpot.x + forward.x * STAB_DISTANCE;
        const adjustedOppZ = clampedSpot.z + forward.z * STAB_DISTANCE;
        const clampedOpp = this.options.clampTargetPosition
          ? this.options.clampTargetPosition(new THREE.Vector3(adjustedOppX, oppPos.y, adjustedOppZ))
          : new THREE.Vector3(adjustedOppX, oppPos.y, adjustedOppZ);
        this.options.setOpponentPosition?.(clampedOpp.x, clampedOpp.z);
      }

      // Between t = 1.45s and t = 1.90s (as Putin rises upright holding the blade),
      // Putin swiftly glides forward to close the distance directly to the opponent!
      const glide = { x: charPos.x, z: charPos.z };
      const approachDelayTween = gsap.delayedCall(1.45, () => {
        if (this.disposed) return;
        const lunge = gsap.to(glide, {
          x: clampedSpot.x,
          z: clampedSpot.z,
          duration: 0.45,
          ease: 'power2.out',
          onUpdate: () => {
            if (this.disposed) return;
            this.options.setCharacterPosition?.(glide.x, glide.z);
            this.character.position.set(glide.x, this.character.position.y, glide.z);
          },
          onComplete: () => {
            this.untrackTween(lunge);
            this.options.setCharacterPosition?.(clampedSpot.x, clampedSpot.z);
            this.character.position.set(clampedSpot.x, this.character.position.y, clampedSpot.z);
          },
        });
        this.trackTween(lunge);
      });
      this.trackTween(approachDelayTween);

      // At t = 1.95s, Putin is right in the opponent's face (0.68m) and triggers Stabbing!
      const stabTransitionTween = gsap.delayedCall(1.95, () => {
        if (this.disposed) return;
        this.faceDirectionXZ(forward, this.options.facingTarget, 0.08);
        if (this.options.opponentFacingTarget) {
          this.faceDirectionXZ(forward.clone().negate(), this.options.opponentFacingTarget, 0.08);
        }
        this.options.onTriggerStabbingAnimation?.();
      });
      this.trackTween(stabTransitionTween);

      // In Stabbing.glb, the forward thrust connects at t = 1.15s (total t = 1.95 + 1.15 = 3.10s)
      const hitTween = gsap.delayedCall(3.10, () => {
        if (this.disposed) return;
        const impactOppPos = this.getOpponentWorldPos(this.options.getOpponentPosition);
        const hitPoint = impactOppPos.clone().setY(1.35);
        this.options.onKnifeStabImpact?.(hitPoint, 40);
        this.triggerOpponentHit(true, forward);
      });
      this.trackTween(hitTween);

      // At t = 3.70s: opponent groans and collapses into DEAD; Putin salutes!
      const saluteTween = gsap.delayedCall(3.70, () => {
        if (this.disposed) return;
        this.options.onOpponentGroanAndDie?.();

        // Smoothly fade/sheathe knife before saluting
        if (knifeWrapper) {
          const fadeTween = gsap.to(knifeWrapper.scale, {
            x: 0,
            y: 0,
            z: 0,
            duration: 0.22,
            ease: 'power2.in',
            onComplete: () => {
              if (knifeWrapper) {
                this.destroyTransientObject(knifeWrapper);
                knifeWrapper = null;
              }
            },
          });
          this.trackTween(fadeTween);
        }

        // Trigger Salute animation!
        this.options.onTriggerSaluteAnimation?.();
        this.options.onSaluteStart?.();
      });
      this.trackTween(saluteTween);

      // At t = 6.40s: Salute finishes cleanly
      const finishTween = gsap.delayedCall(6.40, () => {
        this.untrackTween(finishTween);
        unregisterResolve();
        resolve();
      });
      this.trackTween(finishTween);
    });
  }

  /**
   * Legacy Ability 1 — Battering Ram / Knockback: `"The Long Table"`
   */
  public executeTheLongTable(): Promise<void> {
    if (this.disposed) return Promise.resolve();

    const charPos = this.getCharacterWorldPos();
    const oppPos = this.getOpponentWorldPos(this.options.getOpponentPosition);
    const forward = this.computeHorizontalDirection(
      charPos,
      oppPos,
      this.options.facingTarget ?? this.character
    );
    this.faceDirectionXZ(forward, this.options.facingTarget);
    this.triggerStompAnimation();

    const tableMesh = this.createLongTableMesh();
    tableMesh.position.set(charPos.x, charPos.y, charPos.z);
    tableMesh.lookAt(charPos.x + forward.x, charPos.y, charPos.z + forward.z);
    tableMesh.scale.set(1, 1, 0);
    this.addTransientObject(tableMesh);
    this.options.onTableSpawn?.(charPos.clone(), forward.clone());

    const tableRight = new THREE.Vector3(-forward.z, 0, forward.x);
    const edgeTarget = charPos.clone().addScaledVector(forward, TABLE_FULL_LENGTH);
    const clampedEdge = this.options.clampTargetPosition
      ? this.options.clampTargetPosition(edgeTarget)
      : edgeTarget;

    return new Promise<void>((resolve) => {
      const unregisterResolve = this.registerCleanup(resolve);
      let hitTriggered = false;
      let strikeResolvedNotified = false;
      const notifyStrikeResolved = () => {
        if (strikeResolvedNotified || this.disposed) return;
        strikeResolvedNotified = true;
        this.options.onTableStrikeResolved?.(hitTriggered);
      };

      const checkIntersectionAndKnockback = () => {
        if (hitTriggered || this.disposed) return;

        const currentLength = TABLE_UNIT_DEPTH * tableMesh.scale.z;
        if (currentLength <= 0.05) return;

        const currentOpp = this.getOpponentWorldPos(this.options.getOpponentPosition);
        const rel = currentOpp.clone().sub(charPos);
        const along = rel.dot(forward);
        const lateral = Math.abs(rel.dot(tableRight));
        const withinFootprint =
          along >= -0.15 && along <= currentLength + 0.45 && lateral <= TABLE_WIDTH * 0.5 + 0.5;

        let boxesIntersect = false;
        const tableBox = new THREE.Box3().setFromObject(tableMesh).expandByScalar(0.18);
        const oppBox = new THREE.Box3().setFromObject(this.opponent);
        if (!oppBox.isEmpty()) {
          boxesIntersect = tableBox.intersectsBox(oppBox);
        }

        if (!withinFootprint && !boxesIntersect) return;

        hitTriggered = true;
        const oppY = this.opponent.position.y;
        const knockTween = gsap.to(this.opponent.position, {
          x: clampedEdge.x,
          y: oppY,
          z: clampedEdge.z,
          duration: TABLE_KNOCKBACK_DURATION_SECONDS,
          ease: 'power3.out',
          onUpdate: () => {
            this.options.setOpponentPosition?.(this.opponent.position.x, this.opponent.position.z);
          },
          onComplete: () => {
            this.untrackTween(knockTween);
          },
        });
        this.trackTween(knockTween);

        this.triggerOpponentHit(true, forward);
        this.options.onTableHit?.(
          currentOpp.clone(),
          forward.clone(),
          clampedEdge.clone(),
          TABLE_HIT_DAMAGE
        );
      };

      const tableMaterial = tableMesh.material as THREE.MeshStandardMaterial;
      const timeline = gsap.timeline({
        onComplete: () => {
          this.untrackTween(timeline);
          notifyStrikeResolved();
          this.destroyTransientObject(tableMesh);
          unregisterResolve();
          resolve();
        },
      });
      this.trackTween(timeline);

      timeline
        .to(tableMesh.scale, {
          z: TABLE_TARGET_SCALE_Z,
          duration: TABLE_STRIKE_DURATION_SECONDS,
          ease: 'power3.out',
          onUpdate: () => {
            tableMesh.updateMatrixWorld(true);
            checkIntersectionAndKnockback();
          },
          onComplete: () => {
            tableMesh.updateMatrixWorld(true);
            checkIntersectionAndKnockback();
            notifyStrikeResolved();
          },
        })
        .to(tableMaterial, {
          opacity: 0,
          duration: TABLE_FADE_DURATION_SECONDS,
          delay: TABLE_HOLD_SECONDS,
          ease: 'power2.in',
          onStart: () => {
            tableMaterial.depthWrite = false;
          },
        });
    });
  }

  /**
   * Ability 2 — Chained Projectile: `"Matryoshka Munition"` (Nesting Doll Bomb)
   */
  public executeMatryoshkaMunition(): Promise<void> {
    if (this.disposed) return Promise.resolve();

    const charPos = this.getCharacterWorldPos();
    const initialOppPos = this.getOpponentWorldPos(this.options.getOpponentPosition);
    const forward = this.computeHorizontalDirection(
      charPos,
      initialOppPos,
      this.options.facingTarget ?? this.character
    );
    this.faceDirectionXZ(forward, this.options.facingTarget);
    this.triggerThrowAnimation();

    this.character.updateMatrixWorld(true);
    const handBone = this.findRightHandBone();
    const spawnPos = handBone
      ? handBone.getWorldPosition(new THREE.Vector3())
      : charPos.clone().add(new THREE.Vector3(forward.x * 0.45, 1.4, forward.z * 0.45));

    const dollMesh = this.createMatryoshkaMesh();
    dollMesh.position.copy(spawnPos);
    dollMesh.scale.setScalar(1);
    this.addTransientObject(dollMesh);
    this.options.onMatryoshkaThrow?.(spawnPos.clone());

    const distToOpp = Math.hypot(initialOppPos.x - charPos.x, initialOppPos.z - charPos.z);
    const leadOffset = distToOpp > 1.3 ? 0.8 : Math.min(0.4, distToOpp * 0.35);
    const landing0 = this.clampFloorSpot(
      new THREE.Vector3(
        initialOppPos.x - forward.x * leadOffset,
        DOLL_BASE_HALF_HEIGHT,
        initialOppPos.z - forward.z * leadOffset
      )
    );

    return new Promise<void>((resolve) => {
      const unregisterResolve = this.registerCleanup(resolve);
      let pendingExplosions = 0;
      let chainFinished = false;

      const tryResolve = () => {
        if (chainFinished && pendingExplosions <= 0) {
          unregisterResolve();
          resolve();
        }
      };

      const spawnExplosionAndCheckHit = (
        step: number,
        impactPos: THREE.Vector3,
        dollScale: number
      ) => {
        if (this.disposed) return;

        const currentOpp = this.getOpponentWorldPos(this.options.getOpponentPosition);
        const distance = Math.hypot(currentOpp.x - impactPos.x, currentOpp.z - impactPos.z);
        const hitRadius =
          DOLL_EXPLOSION_HIT_RADII[Math.min(step, DOLL_EXPLOSION_HIT_RADII.length - 1)];
        const opponentHit = distance <= hitRadius;
        const pushDir = this.computeHorizontalDirection(impactPos, currentOpp);
        const damage = DOLL_EXPLOSION_DAMAGES[Math.min(step, DOLL_EXPLOSION_DAMAGES.length - 1)];

        if (opponentHit) {
          this.triggerOpponentHit(step === DOLL_BOUNCE_COUNT, pushDir);
        }
        this.options.onMatryoshkaExplosion?.({
          step,
          impactPos: impactPos.clone(),
          dollScale,
          opponentHit,
          distance,
          pushDir,
          damage: opponentHit ? damage : 0,
        });

        const blastGeo = new THREE.SphereGeometry(0.28, 18, 14);
        const blastMat = new THREE.MeshBasicMaterial({
          color: 0xff7a00,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        });
        const blastSphere = new THREE.Mesh(blastGeo, blastMat);
        blastSphere.name = `MatryoshkaExplosion_${step}`;
        blastSphere.position.copy(impactPos);
        blastSphere.scale.setScalar(0.35);
        this.addTransientObject(blastSphere);

        pendingExplosions += 1;
        const targetSphereScale =
          DOLL_EXPLOSION_SPHERE_SCALES[Math.min(step, DOLL_EXPLOSION_SPHERE_SCALES.length - 1)];

        const blastScaleTween = gsap.to(blastSphere.scale, {
          x: targetSphereScale,
          y: targetSphereScale,
          z: targetSphereScale,
          duration: 0.28,
          ease: 'power2.out',
          onComplete: () => this.untrackTween(blastScaleTween),
        });
        this.trackTween(blastScaleTween);

        const blastFadeTween = gsap.to(blastMat, {
          opacity: 0,
          duration: 0.28,
          ease: 'power2.out',
          onComplete: () => {
            blastScaleTween.kill();
            this.untrackTween(blastScaleTween);
            this.untrackTween(blastFadeTween);
            this.destroyTransientObject(blastSphere);
            pendingExplosions -= 1;
            tryResolve();
          },
        });
        this.trackTween(blastFadeTween);
      };

      const runArcTween = (
        fromPos: THREE.Vector3,
        toPos: THREE.Vector3,
        duration: number,
        arcHeight: number,
        onArrive: () => void
      ) => {
        const moveTween = gsap.to(dollMesh.position, {
          x: toPos.x,
          y: toPos.y,
          z: toPos.z,
          duration,
          ease: 'none',
          onUpdate: () => {
            const p = moveTween.progress();
            const linearY = THREE.MathUtils.lerp(fromPos.y, toPos.y, p);
            dollMesh.position.y = linearY + arcHeight * 4 * p * (1 - p);
            dollMesh.rotation.x += 0.22;
            dollMesh.rotation.z += 0.14;
          },
          onComplete: () => {
            this.untrackTween(moveTween);
            dollMesh.position.copy(toPos);
            onArrive();
          },
        });
        this.trackTween(moveTween);
      };

      const handleImpactStep = (bounceIndex: number, scaleAtImpact: number, landedAt: THREE.Vector3) => {
        spawnExplosionAndCheckHit(bounceIndex, landedAt, scaleAtImpact);

        if (this.disposed || bounceIndex >= DOLL_BOUNCE_COUNT) {
          this.destroyTransientObject(dollMesh);
          chainFinished = true;
          tryResolve();
          return;
        }

        // Instantly halve the capsule's scale and bounce closer to the opponent (3 chained bounces total)
        const nextScale = scaleAtImpact * 0.5;
        dollMesh.scale.setScalar(nextScale);

        const nextOpp = this.getOpponentWorldPos(this.options.getOpponentPosition);
        const advanceRatio = DOLL_BOUNCE_ADVANCE_RATIOS[bounceIndex];
        const nextFloorPos = this.clampFloorSpot(
          new THREE.Vector3(
            THREE.MathUtils.lerp(landedAt.x, nextOpp.x, advanceRatio),
            DOLL_BASE_HALF_HEIGHT * nextScale,
            THREE.MathUtils.lerp(landedAt.z, nextOpp.z, advanceRatio)
          )
        );
        nextFloorPos.y = DOLL_BASE_HALF_HEIGHT * nextScale;

        runArcTween(
          landedAt,
          nextFloorPos,
          DOLL_BOUNCE_DURATIONS[bounceIndex],
          DOLL_BOUNCE_ARCS[bounceIndex],
          () => handleImpactStep(bounceIndex + 1, nextScale, nextFloorPos)
        );
      };

      runArcTween(spawnPos, landing0, DOLL_THROW_DURATION_SECONDS, DOLL_THROW_ARC_HEIGHT, () =>
        handleImpactStep(0, 1.0, landing0)
      );
    });
  }

  private clampFloorSpot(pos: THREE.Vector3): THREE.Vector3 {
    if (!this.options.clampTargetPosition) return pos;
    const clamped = this.options.clampTargetPosition(pos.clone());
    clamped.y = pos.y;
    return clamped;
  }

  private triggerStompAnimation(): void {
    if (this.options.onTriggerStompAnimation) {
      this.options.onTriggerStompAnimation();
      return;
    }
    triggerMixerAction(this.options.mixer, this.options.stompAction);
  }

  private triggerThrowAnimation(): void {
    if (this.options.onTriggerThrowAnimation) {
      this.options.onTriggerThrowAnimation();
      return;
    }
    triggerMixerAction(this.options.mixer, this.options.throwAction);
  }

  private triggerOpponentHit(heavy: boolean, pushDir: THREE.Vector3): void {
    if (this.options.onTriggerOpponentHit) {
      this.options.onTriggerOpponentHit(heavy, pushDir);
      return;
    }
    triggerMixerAction(this.options.opponentMixer, this.options.opponentHitAction);
  }

  private createLongTableMesh(): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(TABLE_WIDTH, TABLE_HEIGHT, TABLE_UNIT_DEPTH);
    geometry.translate(0, TABLE_HEIGHT * 0.5, TABLE_UNIT_DEPTH * 0.5);
    const texture = createSleekTableTexture();
    const material = new THREE.MeshStandardMaterial({
      color: texture ? 0xffffff : 0xf8fafc,
      map: texture ?? null,
      roughness: 0.22,
      metalness: 0.12,
      transparent: true,
      opacity: 1,
    });
    const tableMesh = new THREE.Mesh(geometry, material);
    tableMesh.name = 'PutinLongTable';
    tableMesh.castShadow = true;
    tableMesh.receiveShadow = true;
    return tableMesh;
  }

  private createMatryoshkaMesh(): THREE.Mesh {
    const geometry = new THREE.CapsuleGeometry(DOLL_RADIUS, DOLL_LENGTH, 8, 16);
    const texture = createMatryoshkaTexture();
    const material = new THREE.MeshStandardMaterial({
      color: texture ? 0xffffff : 0xe11d48,
      map: texture ?? null,
      roughness: 0.36,
      metalness: 0.14,
      emissive: new THREE.Color(0x7f1d1d),
      emissiveIntensity: 0.25,
    });
    const dollMesh = new THREE.Mesh(geometry, material);
    dollMesh.name = 'MatryoshkaDollBomb';
    dollMesh.castShadow = true;
    dollMesh.receiveShadow = true;
    return dollMesh;
  }

  private createCombatKnifeGroup(): THREE.Group {
    const knifeWrapper = new THREE.Group();
    knifeWrapper.name = 'PutinCombatKnifeWrapper';

    const knife = new THREE.Group();
    knife.name = 'PutinCombatKnife';

    // 1. Blade: Combat clip-point / bowie blade oriented along +Y
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.016, 0);
    bladeShape.lineTo(-0.016, 0.19); // cutting edge
    bladeShape.quadraticCurveTo(-0.012, 0.24, 0, 0.28); // curved belly sweep to needle tip
    bladeShape.lineTo(0.016, 0.18); // clip-point spine bevel
    bladeShape.lineTo(0.016, 0); // straight spine
    bladeShape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.006,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.002,
      bevelThickness: 0.002,
    };
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, extrudeSettings);
    bladeGeo.center();
    bladeGeo.translate(0, 0.14, 0);

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.12,
      metalness: 0.95,
      envMapIntensity: 1.5,
    });
    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    bladeMesh.name = 'KnifeBlade';
    bladeMesh.castShadow = true;
    knife.add(bladeMesh);

    // 2. Fuller / Blood Groove: recessed darkened steel strip along blade spine
    const fullerGeo = new THREE.BoxGeometry(0.006, 0.15, 0.009);
    const fullerMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.45,
      metalness: 0.85,
    });
    const fullerMesh = new THREE.Mesh(fullerGeo, fullerMat);
    fullerMesh.name = 'KnifeFuller';
    fullerMesh.position.set(0.007, 0.11, 0);
    knife.add(fullerMesh);

    // 3. Crossguard: gunmetal titanium tactical guard separating blade and handle
    const guardGeo = new THREE.BoxGeometry(0.075, 0.014, 0.02);
    const guardMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.32,
      metalness: 0.88,
    });
    const guardMesh = new THREE.Mesh(guardGeo, guardMat);
    guardMesh.name = 'KnifeGuard';
    guardMesh.position.set(0, 0, 0);
    guardMesh.castShadow = true;
    knife.add(guardMesh);

    // 4. Handle / Grip: Ergonomic tactical ribbed grip extending down along -Y
    const handleLen = 0.13;
    const handleGeo = new THREE.CylinderGeometry(0.013, 0.014, handleLen, 16);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.78,
      metalness: 0.2,
    });
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.name = 'KnifeHandle';
    handleMesh.position.set(0, -handleLen * 0.5, 0);
    handleMesh.castShadow = true;
    knife.add(handleMesh);

    // 4b. Grip ribs: rubberized tactical rings for grip definition
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.1,
    });
    for (let i = 0; i < 4; i++) {
      const ribGeo = new THREE.TorusGeometry(0.014, 0.002, 8, 16);
      ribGeo.rotateX(Math.PI * 0.5);
      const ribMesh = new THREE.Mesh(ribGeo, ribMat);
      ribMesh.position.set(0, -0.024 - i * 0.024, 0);
      knife.add(ribMesh);
    }

    // 5. Pommel / Buttcap: Solid steel pommel
    const pommelGeo = new THREE.CylinderGeometry(0.015, 0.013, 0.018, 16);
    const pommelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
      metalness: 0.85,
    });
    const pommelMesh = new THREE.Mesh(pommelGeo, pommelMat);
    pommelMesh.name = 'KnifePommel';
    pommelMesh.position.set(0, -handleLen - 0.009, 0);
    knife.add(pommelMesh);

    // 5b. Red Star badge on buttcap
    const starGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.004, 5);
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: new THREE.Color(0x991b1b),
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.6,
    });
    const starMesh = new THREE.Mesh(starGeo, starMat);
    starMesh.position.set(0, -handleLen - 0.018, 0);
    knife.add(starMesh);

    // 6. Blade glint point light
    const glintLight = new THREE.PointLight(0xe0f2fe, 0.8, 0.6);
    glintLight.position.set(0, 0.28, 0.01);
    knife.add(glintLight);

    // In Mixamo RightHand space:
    // Placed in palm with blade pointing along +Y (knuckles forward)
    knife.scale.setScalar(0.95);
    knife.position.set(0.01, 0.04, 0.02);
    knife.rotation.set(0, 0, 0);
    knifeWrapper.add(knife);

    return knifeWrapper;
  }
}
