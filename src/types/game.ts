import * as THREE from 'three';
import type { CharacterId, SelectRosterSlotId } from '../characters/characterNames';

export type { CharacterId, SelectRosterSlotId };

export type SelectIdleVariant = 'idle-1' | 'idle-2';

export type FighterState =
  | 'IDLE'
  | 'RUN'
  | 'ADMIRE'
  | 'PUNCH'
  | 'KICK'
  | 'SIGNATURE'
  | 'MUAY_THAI'
  | 'POSE'
  | 'LOUNGE'
  | 'DANCE'
  | 'CHAMP_POSE'
  | 'ENTRY'
  | 'SPANKED'
  | 'KISS'
  | 'BLUSH'
  | 'LASER_EYES'
  | 'HIT'
  | 'HIT_HEAD'
  | 'HIT_STOMACH'
  | 'HIT_BIG'
  | 'HIT_LEGS'
  | 'HIT_CAR'
  | 'BLOCK'
  | 'ATTEMPT_ATTACK'
  | 'FALL_BACK'
  | 'DEAD'
  | 'GET_UP'
  | 'LIFTING'
  | 'STABBING'
  | 'SALUTE';

export type CharacterBoneName =
  | 'Hips'
  | 'Torso'
  | 'Head'
  | 'ArmL'
  | 'ArmR'
  | 'LegL'
  | 'LegR';

export interface FighterRig {
  id: CharacterId;
  displayName: string;
  root: THREE.Group;
  modelRoot: THREE.Group;
  bones: Record<CharacterBoneName, THREE.Group>;
  hurtboxMesh: THREE.Mesh;
  hurtbox: THREE.Box3;
  fistAnchor: THREE.Object3D;
  footAnchor: THREE.Object3D;
  headAnchor: THREE.Object3D;
  leftEyeAnchor: THREE.Object3D;
  rightEyeAnchor: THREE.Object3D;
  headVisualGroup?: THREE.Group;
  homePosition: THREE.Vector3;
  facingDirection: 1 | -1;
  bodyMeshes: THREE.Mesh[];
}

export interface FighterPhysicsBody {
  id: CharacterId;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  moveInput: THREE.Vector2;
  radius: number;
  knockedDown: boolean;
  movementPaused?: boolean;
  isRunning?: boolean;
  customYaw?: number | null;
}

export interface CombatHitEvent {
  attacker: CharacterId;
  defender: CharacterId;
  move: 'punch' | 'kick';
  damage: number;
  impactPoint: THREE.Vector3;
}

export interface FighterHUDInfo {
  id: CharacterId;
  displayName: string;
  roleTag: string;
  isBossInfinite: boolean;
  hp: number;
  maxHp: number;
}

export interface GameHUDState {
  selectedCharacter: CharacterId;
  opponentCharacter: CharacterId;
  leftFighter: FighterHUDInfo;
  rightFighter: FighterHUDInfo;
  comboHits: number;
  stressReliefPercent: number;
  targetQuip: string;
  targetQuipSpeaker: string;
  isMuted: boolean;
  isCounterSequenceActive: boolean;
  isModalOpen: boolean;
  difficulty?: DifficultyLevel;
  matchState?: 'INIT' | 'INTRO' | 'FIGHTING' | 'ROUND_END' | 'MATCH_OVER';
  controlsLocked?: boolean;
  playerSignatureCharge?: number;
  isSignatureReady?: boolean;
  activeStageId?: string;
  availableStageIds?: readonly string[];
}

export type DifficultyLevel = 'easy' | 'medium' | 'hard';
