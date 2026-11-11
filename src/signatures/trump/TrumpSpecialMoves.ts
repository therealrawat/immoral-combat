import gsap from 'gsap';
import * as THREE from 'three';
import { BaseSpecialMoves, triggerMixerAction } from '../specialMoveUtils';

const WALL_WIDTH = 2.7;
const WALL_HEIGHT = 1.9;
const WALL_DEPTH = 0.68;
const WALL_SPAWN_HEIGHT = 10;
const WALL_FORWARD_OFFSET = 1.35;
const WALL_HOLD_SECONDS = 3;
const PROJECTILE_FLIGHT_SECONDS = 0.5;
const KNOCKBACK_DISTANCE = 1.95;

export interface TrumpSpecialMovesOptions {
  /** AnimationMixer belonging to Trump's 3D rig (optional when driving via callback). */
  mixer?: THREE.AnimationMixer;
  /** Pointing/casting AnimationAction (or clip name) triggered by "You're Fired!". */
  castAction?: THREE.AnimationAction | string;
  /** Commanding/defensive idle AnimationAction (or clip name) triggered by "Build the Wall". */
  defensiveAction?: THREE.AnimationAction | string;
  /** AnimationMixer belonging to the opponent's 3D rig. */
  opponentMixer?: THREE.AnimationMixer;
  /** Opponent hit AnimationAction (or clip name) triggered on projectile or wall impact. */
  opponentHitAction?: THREE.AnimationAction | string;
  /** Optional model sub-root carrying yaw rotation (used when character root stays axis-aligned). */
  facingTarget?: THREE.Object3D;
  /** Optional custom bone names searched before normalized Mixamo traversal. */
  rightHandBoneNames?: readonly string[];
  onTriggerCastAnimation?: () => void;
  onTriggerDefensiveAnimation?: () => void;
  onTriggerOpponentHit?: (heavy: boolean, pushDir: THREE.Vector3) => void;
  getOpponentPosition?: () => THREE.Vector3;
  setOpponentPosition?: (x: number, z: number) => void;
  onProjectileSpawn?: (spawnPos: THREE.Vector3) => void;
  onProjectileImpact?: (impactPos: THREE.Vector3, hitDir: THREE.Vector3, damage: number) => void;
  onWallSpawn?: (spawnPos: THREE.Vector3) => void;
  onWallLandImpact?: (
    wallPos: THREE.Vector3,
    opponentHit: boolean,
    pushDir: THREE.Vector3,
    damage: number
  ) => void;
}

function createTextSprite(text: string): THREE.Sprite | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(153, 27, 27, 0.92)';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(14, 18, canvas.width - 28, canvas.height - 36, 26);
  ctx.fill();
  ctx.stroke();

  ctx.font = '900 54px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 9;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2 + 2);

  const grad = ctx.createLinearGradient(0, 28, 0, canvas.height - 28);
  grad.addColorStop(0, '#fef08a');
  grad.addColorStop(0.55, '#facc15');
  grad.addColorStop(1, '#f97316');
  ctx.fillStyle = grad;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(1.25, 0.36, 1);
  return sprite;
}

function createBrickWallTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rows = 8;
  const cols = 4;
  const mortar = 5;
  const brickW = canvas.width / cols;
  const brickH = canvas.height / rows;
  const palette = ['#b93829', '#c2410c', '#9a3412', '#a83324', '#c94a38'];

  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 1 ? brickW * 0.5 : 0;
    for (let col = -1; col <= cols; col++) {
      const x = col * brickW + offset + mortar * 0.5;
      const y = row * brickH + mortar * 0.5;
      ctx.fillStyle = palette[(row * 5 + col + 8) % palette.length];
      ctx.fillRect(x, y, brickW - mortar, brickH - mortar);

      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, brickW - mortar, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x, y + brickH - mortar - 4, brickW - mortar, 4);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1.5);
  return texture;
}

/**
 * Modular Three.js + GSAP controller for Trump's two signature moves:
 * 1. `"You're Fired!"` Finger Point (ranged skeletal-hand projectile over 0.5s)
 * 2. `"Build the Wall"` (overhead brick BoxGeometry drop from Y=+10 to Y=0 with bounce & 3s hold)
 */
export class TrumpSpecialMoves extends BaseSpecialMoves {
  private readonly options: TrumpSpecialMovesOptions;

  constructor(
    character: THREE.Object3D,
    opponent: THREE.Object3D,
    scene: THREE.Scene,
    options: TrumpSpecialMovesOptions = {}
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
   * Ability 1 — Ranged Attack: `"You're Fired!"` Finger Point
   */
  public executeYoureFired(): Promise<void> {
    if (this.disposed) return Promise.resolve();

    const charPos = this.getCharacterWorldPos();
    const oppPos = this.getOpponentWorldPos(this.options.getOpponentPosition);
    const toOpponent = oppPos.clone().sub(charPos).setY(0);
    if (toOpponent.lengthSq() < 0.0001) {
      toOpponent.set(0, 0, 1);
    } else {
      toOpponent.normalize();
    }

    this.faceDirection(toOpponent);
    this.triggerCastAnimation();

    this.character.updateMatrixWorld(true);
    const handBone = this.findRightHandBone();
    const spawnPos = handBone
      ? handBone.getWorldPosition(new THREE.Vector3())
      : charPos.clone().add(new THREE.Vector3(toOpponent.x * 0.45, 1.38, toOpponent.z * 0.45));

    const projectile = this.createYoureFiredProjectile();
    projectile.position.copy(spawnPos);
    this.addTransientObject(projectile);
    this.options.onProjectileSpawn?.(spawnPos.clone());

    const targetPos = oppPos.clone().add(new THREE.Vector3(0, 1.28, 0));

    return new Promise<void>((resolve) => {
      const spinTween = gsap.to(projectile.rotation, {
        y: Math.PI * 3,
        duration: PROJECTILE_FLIGHT_SECONDS,
        ease: 'none',
      });
      this.trackTween(spinTween);

      const moveTween = gsap.to(projectile.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: PROJECTILE_FLIGHT_SECONDS,
        ease: 'power2.in',
        onComplete: () => {
          spinTween.kill();
          this.untrackTween(spinTween);
          this.untrackTween(moveTween);
          this.destroyTransientObject(projectile);

          if (!this.disposed) {
            this.triggerOpponentHit(false, toOpponent);
            this.options.onProjectileImpact?.(targetPos.clone(), toOpponent.clone(), 28);
          }
          resolve();
        },
      });
      this.trackTween(moveTween);
    });
  }

  /**
   * Ability 2 — Defensive/Smash: `"Build the Wall"`
   */
  public executeBuildTheWall(): Promise<void> {
    if (this.disposed) return Promise.resolve();

    const charPos = this.getCharacterWorldPos();
    const oppPos = this.getOpponentWorldPos(this.options.getOpponentPosition);
    const forward = oppPos.clone().sub(charPos).setY(0);
    if (forward.lengthSq() < 0.0001) {
      this.getFacingTarget().getWorldDirection(forward).setY(0);
    }
    if (forward.lengthSq() < 0.0001) {
      forward.set(0, 0, 1);
    } else {
      forward.normalize();
    }

    this.faceDirection(forward);
    this.triggerDefensiveAnimation();

    const wallX = charPos.x + forward.x * WALL_FORWARD_OFFSET;
    const wallZ = charPos.z + forward.z * WALL_FORWARD_OFFSET;
    const wallYaw = Math.atan2(forward.x, forward.z);

    const wallGroup = this.createBrickWall();
    wallGroup.position.set(wallX, WALL_SPAWN_HEIGHT, wallZ);
    wallGroup.rotation.y = wallYaw;
    this.addTransientObject(wallGroup);
    this.options.onWallSpawn?.(new THREE.Vector3(wallX, WALL_SPAWN_HEIGHT, wallZ));

    return new Promise<void>((resolve) => {
      let impactHandled = false;
      const handleFirstGroundImpact = () => {
        if (impactHandled || this.disposed) return;
        impactHandled = true;

        const currentOpp = this.getOpponentWorldPos(this.options.getOpponentPosition);
        const inDropZone = this.isPointInsideWallDropZone(
          currentOpp.x,
          currentOpp.z,
          wallX,
          wallZ,
          wallYaw
        );

        const pushDir = currentOpp
          .clone()
          .sub(new THREE.Vector3(wallX, 0, wallZ))
          .setY(0);
        if (pushDir.lengthSq() < 0.0001) {
          pushDir.copy(forward);
        } else {
          pushDir.normalize();
        }

        if (inDropZone) {
          const oppY = this.opponent.position.y;
          const knockbackState = { x: currentOpp.x, z: currentOpp.z };
          const knockTween = gsap.to(knockbackState, {
            x: currentOpp.x + pushDir.x * KNOCKBACK_DISTANCE,
            z: currentOpp.z + pushDir.z * KNOCKBACK_DISTANCE,
            duration: 0.38,
            ease: 'power3.out',
            onUpdate: () => {
              this.opponent.position.set(knockbackState.x, oppY, knockbackState.z);
              this.options.setOpponentPosition?.(knockbackState.x, knockbackState.z);
            },
            onComplete: () => {
              this.untrackTween(knockTween);
            },
          });
          this.trackTween(knockTween);
          this.triggerOpponentHit(true, pushDir);
        }

        this.options.onWallLandImpact?.(
          new THREE.Vector3(wallX, 0, wallZ),
          inDropZone,
          pushDir,
          inDropZone ? 32 : 0
        );
      };

      const timeline = gsap.timeline({
        onComplete: () => {
          this.untrackTween(timeline);
          this.destroyTransientObject(wallGroup);
          resolve();
        },
      });
      this.trackTween(timeline);

      timeline
        .to(wallGroup.position, {
          y: 0,
          duration: 0.65,
          ease: 'bounce.out',
          onUpdate: () => {
            if (!impactHandled && wallGroup.position.y <= 0.15) {
              handleFirstGroundImpact();
            }
          },
          onComplete: handleFirstGroundImpact,
        })
        .to(wallGroup.position, {
          y: -(WALL_HEIGHT + 0.45),
          duration: 0.65,
          delay: WALL_HOLD_SECONDS,
          ease: 'power2.in',
        });
    });
  }

  private getFacingTarget(): THREE.Object3D {
    return this.options.facingTarget ?? this.character;
  }

  private faceDirection(dirXZ: THREE.Vector3): void {
    const facing = this.getFacingTarget();
    const targetYaw = Math.atan2(dirXZ.x, dirXZ.z);
    const rotTween = gsap.to(facing.rotation, {
      y: targetYaw,
      duration: 0.18,
      ease: 'power2.out',
      onComplete: () => {
        this.untrackTween(rotTween);
      },
    });
    this.trackTween(rotTween);
  }

  private triggerCastAnimation(): void {
    if (this.options.onTriggerCastAnimation) {
      this.options.onTriggerCastAnimation();
      return;
    }
    triggerMixerAction(this.options.mixer, this.options.castAction);
  }

  private triggerDefensiveAnimation(): void {
    if (this.options.onTriggerDefensiveAnimation) {
      this.options.onTriggerDefensiveAnimation();
      return;
    }
    triggerMixerAction(this.options.mixer, this.options.defensiveAction);
  }

  private triggerOpponentHit(heavy: boolean, pushDir: THREE.Vector3): void {
    if (this.options.onTriggerOpponentHit) {
      this.options.onTriggerOpponentHit(heavy, pushDir);
      return;
    }
    triggerMixerAction(this.options.opponentMixer, this.options.opponentHitAction);
  }

  private createYoureFiredProjectile(): THREE.Group {
    const group = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xff6b00,
        emissive: 0xff2a00,
        emissiveIntensity: 2.0,
        roughness: 0.2,
      })
    );
    group.add(core);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(halo);

    const labelSprite = createTextSprite("YOU'RE FIRED!");
    if (labelSprite) {
      labelSprite.position.set(0, 0.38, 0);
      group.add(labelSprite);
    }

    return group;
  }

  private createBrickWall(): THREE.Group {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(WALL_WIDTH, WALL_HEIGHT, WALL_DEPTH);
    const texture = createBrickWallTexture();
    const material = new THREE.MeshStandardMaterial({
      color: texture ? 0xffffff : 0xb93829,
      map: texture ?? null,
      roughness: 0.85,
      metalness: 0.08,
    });
    const wallMesh = new THREE.Mesh(geometry, material);
    wallMesh.position.set(0, WALL_HEIGHT / 2, 0);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh);
    return group;
  }

  private isPointInsideWallDropZone(
    px: number,
    pz: number,
    wallX: number,
    wallZ: number,
    wallYaw: number
  ): boolean {
    const dx = px - wallX;
    const dz = pz - wallZ;
    const cos = Math.cos(wallYaw);
    const sin = Math.sin(wallYaw);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    return (
      Math.abs(localX) <= WALL_WIDTH * 0.5 + 0.55 &&
      Math.abs(localZ) <= WALL_DEPTH * 0.5 + 0.75
    );
  }
}
