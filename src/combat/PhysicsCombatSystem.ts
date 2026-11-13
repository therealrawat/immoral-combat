import * as THREE from 'three';
import { CharacterId, CombatHitEvent, FighterPhysicsBody, FighterRig, CombatAttackType } from '../types/game';
import { RING_HALF_WIDTH } from '../core/ArenaBuilder';

const RING_CLAMP_LIMIT = RING_HALF_WIDTH - 0.52;
const GROUND_FRICTION = 7.6;
const MOVE_SPEED = 1.35;
const RUN_SPEED = 1.85;

export type RopeBounceHandler = (id: CharacterId, impactPos: THREE.Vector3) => void;

/**
 * Handles 3D ring steering, directional impulses, AI spacing, dynamic facing,
 * rope-bounce collisions, and Box3/sphere strike detection.
 */
export class PhysicsCombatSystem {
  private readonly bodies = new Map<CharacterId, FighterPhysicsBody>();
  private readonly rigs = new Map<CharacterId, FighterRig>();
  private readonly lastBounceAt = new Map<CharacterId, number>();
  private readonly tempVecA = new THREE.Vector3();
  private readonly tempVecB = new THREE.Vector3();
  private readonly tempVecForward = new THREE.Vector3();
  private readonly tempSphere = new THREE.Sphere();
  private onRopeBounce?: RopeBounceHandler;
  private kinematicHold = false;
  private kinematicMinSeparation = 0.52;
  private activePair: [CharacterId, CharacterId] = ['chinu', 'priyanshu'];

  public setActivePair(
    leftId: CharacterId,
    rightId: CharacterId,
    resetPositions = false
  ): void {
    this.activePair = [leftId, rightId];
    for (const body of this.bodies.values()) {
      body.moveInput.set(0, 0);
      body.velocity.set(0, 0, 0);
    }

    if (!resetPositions) return;

    const place = (id: CharacterId, x: number, facingSign: 1 | -1) => {
      const body = this.bodies.get(id);
      const rig = this.rigs.get(id);
      if (body) {
        body.position.set(x, 0, 0);
        body.velocity.set(0, 0, 0);
        body.moveInput.set(0, 0);
        body.knockedDown = false;
        body.movementPaused = false;
      }
      if (rig) {
        rig.root.position.set(x, 0, 0);
        rig.modelRoot.rotation.y = facingSign * (Math.PI / 2);
      }
    };

    place(leftId, -1.15, 1);
    place(rightId, 1.15, -1);
  }

  public setKinematicHold(hold: boolean, minSeparation = 0.52): void {
    this.kinematicHold = hold;
    this.kinematicMinSeparation = hold ? minSeparation : 0.52;
  }

  public getBodyPosition(id: CharacterId): THREE.Vector3 | null {
    return this.bodies.get(id)?.position ?? null;
  }

  public getBody(id: CharacterId): FighterPhysicsBody | null {
    return this.bodies.get(id) ?? null;
  }

  public getMoveInput(id: CharacterId): THREE.Vector2 | null {
    return this.bodies.get(id)?.moveInput ?? null;
  }

  public isKnockedDown(id: CharacterId): boolean {
    return Boolean(this.bodies.get(id)?.knockedDown);
  }

  public isMovementPaused(id: CharacterId): boolean {
    return Boolean(this.bodies.get(id)?.movementPaused);
  }

  public isJumping(id: CharacterId): boolean {
    const body = this.bodies.get(id);
    return Boolean(body && (body.isJumping || body.position.y > 0.05));
  }

  public isCrouching(id: CharacterId): boolean {
    return Boolean(this.bodies.get(id)?.isCrouching);
  }

  public triggerJump(id: CharacterId, impulse = 5.4): boolean {
    const body = this.bodies.get(id);
    if (!body || body.knockedDown || body.movementPaused || body.position.y > 0.05) {
      return false;
    }
    body.velocity.y = impulse;
    body.isJumping = true;
    body.isCrouching = false;
    return true;
  }

  public setCrouching(id: CharacterId, crouching: boolean): void {
    const body = this.bodies.get(id);
    if (!body || body.knockedDown || body.movementPaused) return;
    if (body.isJumping || body.position.y > 0.05) {
      body.isCrouching = false;
      return;
    }
    body.isCrouching = crouching;
  }

  public setLocomotionState(
    id: CharacterId,
    isRunning: boolean,
    customYaw: number | null = null
  ): void {
    const body = this.bodies.get(id);
    if (!body) return;
    body.isRunning = isRunning;
    body.customYaw = customYaw;
  }

  public setBodyPositionXZ(id: CharacterId, x: number, z: number): void {
    const body = this.bodies.get(id);
    if (!body) return;
    body.position.x = THREE.MathUtils.clamp(x, -RING_CLAMP_LIMIT, RING_CLAMP_LIMIT);
    body.position.z = THREE.MathUtils.clamp(z, -RING_CLAMP_LIMIT, RING_CLAMP_LIMIT);
    body.velocity.set(0, 0, 0);
  }

  public setOnRopeBounce(handler: RopeBounceHandler): void {
    this.onRopeBounce = handler;
  }

  public registerFighter(rig: FighterRig): void {
    this.rigs.set(rig.id, rig);
    this.bodies.set(rig.id, {
      id: rig.id,
      position: rig.root.position.clone(),
      velocity: new THREE.Vector3(),
      moveInput: new THREE.Vector2(),
      radius: 0.45,
      knockedDown: false,
    });
  }

  public setMoveInput(id: CharacterId, x: number, z: number): void {
    const body = this.bodies.get(id);
    if (!body) return;
    body.moveInput.set(x, z);
    if (body.moveInput.lengthSq() > 1) {
      body.moveInput.normalize();
    }
  }

  public setKnockedDown(id: CharacterId, knockedDown: boolean): void {
    const body = this.bodies.get(id);
    if (body) {
      body.knockedDown = knockedDown;
    }
  }

  public setMovementPaused(id: CharacterId, paused: boolean): void {
    const body = this.bodies.get(id);
    if (body) {
      body.movementPaused = paused;
      if (paused) {
        body.moveInput.set(0, 0);
      }
    }
  }

  public applyImpulse(id: CharacterId, impulseX: number, impulseZ = 0): void {
    const body = this.bodies.get(id);
    if (!body) return;
    body.velocity.x += impulseX;
    body.velocity.z += impulseZ;
  }

  /**
   * Launches an impulse toward (positive) or away from (negative) the opponent in 3D XZ space.
   */
  public applyDirectionalImpulse(
    id: CharacterId,
    targetId: CharacterId,
    magnitude: number,
    lateralJitter = 0
  ): void {
    const body = this.bodies.get(id);
    const target = this.bodies.get(targetId);
    if (!body || !target) return;

    const dir = this.tempVecA.subVectors(target.position, body.position);
    dir.y = 0;
    if (dir.lengthSq() < 0.0001) {
      dir.set(id === this.activePair[0] ? 1 : -1, 0, 0);
    } else {
      dir.normalize();
    }

    body.velocity.x += dir.x * magnitude - dir.z * lateralJitter;
    body.velocity.z += dir.z * magnitude + dir.x * lateralJitter;
  }

  public step(deltaSeconds: number, _playerControlledId: CharacterId = 'chinu'): void {
    if (deltaSeconds <= 0) return;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const [leftId, rightId] = this.activePair;
    const leftBody = this.bodies.get(leftId);
    const rightBody = this.bodies.get(rightId);

    for (const id of this.activePair) {
      const body = this.bodies.get(id);
      const rig = this.rigs.get(id);
      if (!body || !rig) continue;

      // Fighter steering (WASD / Arrows for player, autonomous CpuAiController for opponent)
      if (!body.knockedDown && !body.movementPaused && body.moveInput.lengthSq() > 0.001) {
        const speed = body.isRunning ? RUN_SPEED : MOVE_SPEED;
        body.position.x += body.moveInput.x * speed * deltaSeconds;
        body.position.z += body.moveInput.y * speed * deltaSeconds;
      }

      // Apply knockback / lunge velocity
      body.position.addScaledVector(body.velocity, deltaSeconds);

      // Gravity & Jumping physics arc
      const GRAVITY = 16.0;
      if (body.position.y > 0 || (body.velocity.y && Math.abs(body.velocity.y) > 0.001)) {
        body.velocity.y -= GRAVITY * deltaSeconds;
        body.position.y += body.velocity.y * deltaSeconds;
        if (body.position.y <= 0) {
          body.position.y = 0;
          body.velocity.y = 0;
          body.isJumping = false;
        } else {
          body.isJumping = true;
        }
      } else {
        body.position.y = 0;
        body.isJumping = false;
      }

      // Ground horizontal damping
      const damping = Math.exp(-GROUND_FRICTION * deltaSeconds);
      body.velocity.x *= damping;
      body.velocity.z *= damping;

      // Elastic rope boundary checks & bounce feedback
      let bounced = false;
      const impactPos = new THREE.Vector3();

      if (body.position.x < -RING_CLAMP_LIMIT) {
        bounced = Math.abs(body.velocity.x) > 2.2;
        body.position.x = -RING_CLAMP_LIMIT;
        body.velocity.x = Math.abs(body.velocity.x) * 0.55;
        impactPos.set(-RING_HALF_WIDTH + 0.15, 0.9, body.position.z);
      } else if (body.position.x > RING_CLAMP_LIMIT) {
        bounced = Math.abs(body.velocity.x) > 2.2;
        body.position.x = RING_CLAMP_LIMIT;
        body.velocity.x = -Math.abs(body.velocity.x) * 0.55;
        impactPos.set(RING_HALF_WIDTH - 0.15, 0.9, body.position.z);
      }

      if (body.position.z < -RING_CLAMP_LIMIT) {
        bounced = bounced || Math.abs(body.velocity.z) > 2.2;
        body.position.z = -RING_CLAMP_LIMIT;
        body.velocity.z = Math.abs(body.velocity.z) * 0.55;
        impactPos.set(body.position.x, 0.9, -RING_HALF_WIDTH + 0.15);
      } else if (body.position.z > RING_CLAMP_LIMIT) {
        bounced = bounced || Math.abs(body.velocity.z) > 2.2;
        body.position.z = RING_CLAMP_LIMIT;
        body.velocity.z = -Math.abs(body.velocity.z) * 0.55;
        impactPos.set(body.position.x, 0.9, RING_HALF_WIDTH - 0.15);
      }

      if (bounced) {
        const last = this.lastBounceAt.get(id) ?? 0;
        if (nowMs - last > 300) {
          this.lastBounceAt.set(id, nowMs);
          this.onRopeBounce?.(id, impactPos);
        }
      }

      rig.root.position.copy(body.position);
    }

    // Separate overlapping fighters cleanly in XZ plane
    if (leftBody && rightBody) {
      const minSeparation = this.kinematicHold
        ? this.kinematicMinSeparation
        : leftBody.radius + rightBody.radius;
      const dx = rightBody.position.x - leftBody.position.x;
      const dz = rightBody.position.z - leftBody.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < minSeparation * minSeparation) {
        const dist = Math.sqrt(distSq) || 0.001;
        const nx = dx / dist;
        const nz = dz / dist;
        const push = (minSeparation - dist) * 0.5;
        leftBody.position.x -= nx * push;
        leftBody.position.z -= nz * push;
        rightBody.position.x += nx * push;
        rightBody.position.z += nz * push;
      }

      // Smoothly rotate upright fighters to face each other when not in a scripted hold
      if (!this.kinematicHold) {
        const leftRig = this.rigs.get(leftId);
        const rightRig = this.rigs.get(rightId);
        if (leftRig && rightRig) {
          const yawLeft = Math.atan2(
            rightBody.position.x - leftBody.position.x,
            rightBody.position.z - leftBody.position.z
          );
          const yawRight = Math.atan2(
            leftBody.position.x - rightBody.position.x,
            leftBody.position.z - rightBody.position.z
          );

          if (!leftBody.knockedDown) {
            leftRig.modelRoot.rotation.y = this.lerpAngle(
              leftRig.modelRoot.rotation.y,
              leftBody.customYaw ?? yawLeft,
              Math.min(1, 14 * deltaSeconds)
            );
          }
          if (!rightBody.knockedDown) {
            rightRig.modelRoot.rotation.y = this.lerpAngle(
              rightRig.modelRoot.rotation.y,
              rightBody.customYaw ?? yawRight,
              Math.min(1, 14 * deltaSeconds)
            );
          }
        }
      }
    }

    // Sync world matrices & hurtboxes
    for (const id of this.activePair) {
      const body = this.bodies.get(id);
      const rig = this.rigs.get(id);
      if (!body || !rig) continue;
      rig.root.position.copy(body.position);
      rig.root.updateMatrixWorld(true);
      rig.hurtbox.setFromObject(rig.hurtboxMesh);
      if (body.isCrouching) {
        // Lower upper hurtbox boundary so high strikes whiff or glance
        rig.hurtbox.max.y = THREE.MathUtils.lerp(rig.hurtbox.max.y, rig.hurtbox.min.y + 1.1, 0.6);
      }
    }
  }

  private lerpAngle(current: number, target: number, t: number): number {
    let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * t;
  }

  /** Realistic strike reach limits in ring units (punch ~1.65m, kick ~1.95m). */
  public static readonly PUNCH_MAX_RANGE = 1.65;
  public static readonly KICK_MAX_RANGE = 1.95;

  /**
   * Evaluates strike reach, facing orientation, and hurtbox intersection, returning hit event if within range.
   */
  public resolveStrike(
    attackerId: CharacterId,
    defenderId: CharacterId,
    move: CombatAttackType | 'punch' | 'kick',
    damage: number
  ): CombatHitEvent | null {
    const attacker = this.rigs.get(attackerId);
    const defender = this.rigs.get(defenderId);
    if (!attacker || !defender) return null;

    attacker.root.updateMatrixWorld(true);
    defender.root.updateMatrixWorld(true);

    const isKick = move.startsWith('kick');
    const dist = attacker.root.position.distanceTo(defender.root.position);
    let maxRange = isKick ? PhysicsCombatSystem.KICK_MAX_RANGE : PhysicsCombatSystem.PUNCH_MAX_RANGE;

    if (move === 'kick_flying') {
      maxRange = 2.25;
    } else if (move === 'kick_mma' || move === 'kick_back') {
      maxRange = 2.05;
    } else if (move === 'kick_low') {
      maxRange = 1.85;
    } else if (move === 'punch_elbow') {
      maxRange = 1.45;
    } else if (move === 'punch_hook' || move === 'punch_combo') {
      maxRange = 1.72;
    }

    if (dist > maxRange) {
      return null;
    }

    // Directional facing check: Attacker must be facing generally towards the opponent (in front cone)
    const dx = defender.root.position.x - attacker.root.position.x;
    const dz = defender.root.position.z - attacker.root.position.z;
    const planarDist = Math.hypot(dx, dz);
    if (planarDist > 0.05) {
      attacker.modelRoot.getWorldDirection(this.tempVecForward);
      const dot = (this.tempVecForward.x * dx + this.tempVecForward.z * dz) / planarDist;
      // If dot < 0.1, opponent is behind or perpendicular to the attacker
      if (dot < 0.1) {
        return null;
      }
    }

    defender.hurtbox.setFromObject(defender.hurtboxMesh);
    const defenderBody = this.bodies.get(defenderId);
    if (defenderBody?.isCrouching) {
      defender.hurtbox.max.y = THREE.MathUtils.lerp(
        defender.hurtbox.max.y,
        defender.hurtbox.min.y + 1.1,
        0.6
      );
    }

    const strikeAnchor = isKick ? attacker.footAnchor : attacker.fistAnchor;
    strikeAnchor.getWorldPosition(this.tempVecA);

    this.tempSphere.set(this.tempVecA, isKick ? 0.95 : 0.8);
    const intersects = defender.hurtbox.intersectsSphere(this.tempSphere);
    const closeQuarters = dist <= maxRange * 0.88;

    if (!intersects && !closeQuarters) {
      return null;
    }

    defender.hurtbox.getCenter(this.tempVecB);
    const impactPoint = this.tempVecA.clone().lerp(this.tempVecB, 0.35);

    // Differentiated impact height based on specific attack trajectory
    if (move === 'kick_flying') {
      impactPoint.y = 1.75;
    } else if (move === 'punch_hook') {
      impactPoint.y = 1.65;
    } else if (move === 'punch_combo') {
      impactPoint.y = 1.55;
    } else if (move === 'punch_elbow') {
      impactPoint.y = 1.30;
    } else if (move === 'kick_low') {
      impactPoint.y = 0.82;
    } else if (move === 'kick_mma' || move === 'kick_back') {
      impactPoint.y = 1.50;
    } else if (isKick) {
      impactPoint.y = 1.40;
    } else {
      impactPoint.y = 1.50;
    }

    return {
      attacker: attackerId,
      defender: defenderId,
      move,
      damage,
      impactPoint,
    };
  }
}
