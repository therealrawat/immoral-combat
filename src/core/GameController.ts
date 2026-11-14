import * as THREE from 'three';
import gsap from 'gsap';
import { SoundManager } from '../audio/SoundManager';
import { AnimationController } from '../characters/AnimationController';
import {
  CHARACTER_IDS,
  getCharacterDisplayName,
  getFallbackOpponent,
} from '../characters/characterNames';
import { canSelectCharacter, getDefaultMatchup } from '../characters/chinuAccess';
import { CharacterFactory, LoadedNativeGLBClips } from '../characters/CharacterFactory';
import { createHumanoidGLBClips } from '../characters/GLBClipsBuilder';
import { getAvailableStageIds } from '../characters/ModelAssetRegistry';
import { CpuAiController, CpuPoseState } from '../combat/CpuAiController';
import { PhysicsCombatSystem } from '../combat/PhysicsCombatSystem';
import { EffectsManager } from '../effects/EffectsManager';
import {
  CharacterId,
  DifficultyLevel,
  FighterRig,
  FighterState,
  SelectIdleVariant,
  CombatAttackType,
} from '../types/game';
import {
  CINEMATIC_FREEZE_TIME_SCALE,
  disposeCachedCyberpunkLaptop,
  executeCharacterSignature,
  getCharacterSignatures,
  preloadCyberpunkLaptop,
  SignatureMoveContext,
} from '../signatures';
import { sharedAnimationManager } from '../characters/SharedAnimationManager';
import { CharacterSelectStage } from '../ui/CharacterSelectStage';
import { UIManager } from '../ui/UIManager';
import { StageManager, getStageDisplayName } from './ArenaBuilder';
import {
  disposeAssetLoadingHub,
  preloadDracoDecoder,
  subscribeAssetProgress,
} from './AssetLoadingManager';
import { FighterParticipantConfig, GameManager, PlayerSlot } from './GameManager';
import { SceneManager } from './SceneManager';

const FIGHTER_MAX_HP = 150;
const PUNCH_DAMAGE = 15;
const DIRECT_KICK_DAMAGE = 22;
const CPU_PUNCH_DAMAGE = 10;
const CPU_KICK_DAMAGE = 14;
const COUNTER_KICK_DAMAGE = 25;
const OPPONENT_STRIKE_DAMAGE = 16;
const FREEZE_TIME_SCALE = CINEMATIC_FREEZE_TIME_SCALE;
const FREEZE_DURATION_MS = 440;

const FIGHTER_META: Record<
  CharacterId,
  { displayName: string; defaultTag: string; isBossInfinite: boolean }
> = {
  chinu: {
    displayName: getCharacterDisplayName('chinu'),
    defaultTag: 'REAL BOSS',
    isBossInfinite: true,
  },
  priyanshu: {
    displayName: getCharacterDisplayName('priyanshu'),
    defaultTag: 'TARGET',
    isBossInfinite: false,
  },
  modiji: {
    displayName: getCharacterDisplayName('modiji'),
    defaultTag: 'LASER TITAN',
    isBossInfinite: false,
  },
  trump: {
    displayName: getCharacterDisplayName('trump'),
    defaultTag: 'PONTIFF',
    isBossInfinite: false,
  },
  putin: {
    displayName: getCharacterDisplayName('putin'),
    defaultTag: 'STRATEGIST',
    isBossInfinite: false,
  },
  amitabh: {
    displayName: getCharacterDisplayName('amitabh'),
    defaultTag: 'SHAHENSHAH',
    isBossInfinite: false,
  },
};

const PRIYANSHU_HIT_QUIPS = [
  'Ow! Watch the glasses!',
  'Okay okay, my bad!!',
  'Why am I always the target?!',
  'Wait—time out!!',
  () => `Tell ${getCharacterDisplayName('chinu')} I surrender!`,
  'Not the face!',
] as const;

const MODIJI_HIT_QUIPS = [
  'Whoa—watch the spectacles!! 👓',
  'Mitrooon—not the kurta!! 😅',
  'My Laser Eyes are warming up!! 🔥',
  'Temporary tactical retreat!! 😵',
  'That was uncalled for!! ⚡',
] as const;

const TRUMP_HIT_QUIPS = [
  'My golden robe!! Watch it!! 👑',
  'Fake punch! Huge miss!! 😤',
  'Nobody hits the Pontiff like that!! ⚡',
  'Tremendous foul!! Time out!! 🥊',
] as const;

const PUTIN_HIT_QUIPS = [
  'Tactical pause!! Do not test patience!! ♟️',
  'Longer table required immediately!! 🪑',
  'My sambo guard slipped!! ⚡',
  'Matryoshka counter is armed!! 🪆',
] as const;

const AMITABH_HIT_QUIPS = [
  'Hain? Yeh kya kiya aapne?! 🤨',
  'Yeh 25 saal ka gussa hai!! 💥',
  'Don ko hilaana mushkil hi nahi, namumkin hai! 😎',
  'Vijay Dinanath Chauhan kabhi peechhe nahi hatta! 🔥',
] as const;

const HIT_QUIP_MAP: Record<CharacterId, readonly (string | (() => string))[]> = {
  chinu: ['Real Boss feels nothing! 👑'],
  priyanshu: PRIYANSHU_HIT_QUIPS,
  modiji: MODIJI_HIT_QUIPS,
  trump: TRUMP_HIT_QUIPS,
  putin: PUTIN_HIT_QUIPS,
  amitabh: AMITABH_HIT_QUIPS,
};

const MODIJI_STRIKE_QUIPS = [
  'Precision strike incoming!! ⚡',
  'Mitron, duck this!! 🥊',
  'Superpower uppercut!! 💥',
] as const;

const TRUMP_STRIKE_QUIPS = [
  'Huge golden strike!! Tremendous!! 🥊🔥',
  'The best combo—everybody says so!! ⚡',
  'Pontiff power punch!! Believe me!! 💥',
] as const;

const PUTIN_STRIKE_QUIPS = [
  'Calculated Sambo strike!! ♟️💥',
  'Sit at the end of the table!! 🪑⚡',
  'Precision Kremlin counter!! 🥊',
] as const;

const AMITABH_STRIKE_QUIPS = [
  'Rishte mein toh hum tumhare baap lagte hain! 👑',
  'Hum jahan khade hote hain, line wahin se shuru hoti hai! ⚡',
  'Shahenshah ka vaar!! 🥊💥',
] as const;

const STRIKE_QUIP_MAP: Record<CharacterId, readonly string[]> = {
  chinu: ['Watch yourself around the Real Boss! 👑'],
  priyanshu: ['Gotcha cleanly!! 🥊', 'Fast hands!! ⚡', 'Incoming challenger hit!! 💥'],
  modiji: MODIJI_STRIKE_QUIPS,
  trump: TRUMP_STRIKE_QUIPS,
  putin: PUTIN_STRIKE_QUIPS,
  amitabh: AMITABH_STRIKE_QUIPS,
};

const PRIYANSHU_BOSS_QUIPS = [
  'Okay, you ARE the real boss!',
  'Instant regret!!',
  'Lesson learned, ma’am!',
] as const;

const PRIYANSHU_KISS_QUIPS = [
  'Worth every single punch!! 💖',
  'Mwah!! Best boss ever!',
  'o yeah mommy 💕',
] as const;

function resolveQuipText(entry: string | (() => string)): string {
  return typeof entry === 'function' ? entry() : entry;
}

/**
 * Central orchestrator connecting SceneManager, SoundManager, AnimationControllers,
 * PhysicsCombatSystem, EffectsManager, and UIManager.
 */
export class GameController {
  private readonly sceneManager: SceneManager;
  private readonly sound: SoundManager;
  private readonly stageManager: StageManager;
  private readonly physics: PhysicsCombatSystem;
  private readonly cpuAi = new CpuAiController();
  private readonly effects: EffectsManager;
  private readonly selectStage: CharacterSelectStage;
  private readonly ui: UIManager;

  private readonly rigs = new Map<CharacterId, FighterRig>();
  private readonly anims = new Map<CharacterId, AnimationController>();
  private readonly fighterHp = new Map<CharacterId, number>(
    CHARACTER_IDS.map((id) => [id, FIGHTER_MAX_HP])
  );
  private readonly aggressionHits = new Map<CharacterId, number[]>();
  private readonly blockingFighters = new Set<CharacterId>();

  private readonly availableStageIds = getAvailableStageIds();
  private activeStageId = this.availableStageIds[0] ?? 'stage-1';
  private difficulty: DifficultyLevel = 'medium';
  private readonly initialDefaults = getDefaultMatchup();
  private selectedCharacter: CharacterId = this.initialDefaults.player;
  private opponentCharacter: CharacterId = this.initialDefaults.opponent;
  private leftFighterId: CharacterId = this.initialDefaults.player;
  private rightFighterId: CharacterId = this.initialDefaults.opponent;

  private comboHits = 0;
  private stressReliefPercent = 0;
  private targetQuip = '';
  private targetQuipSpeaker = FIGHTER_META[this.initialDefaults.opponent].displayName;
  private lastPlayerQuipAt = 0;
  private quipIndex = 0;
  private isCinematicActive = false;
  private pendingPriyanshuLounge = false;
  private pendingChinuEntry = false;
  private chinuEntryTween?: gsap.core.Tween;
  private disposed = false;
  private gameTimeScale = 1;
  private koSlowMoActive = false;
  private pendingMatchRestartAfterModalClose = false;
  private animFrameId = 0;
  private lastTimestamp = 0;

  private readonly gameManager: GameManager;
  private activeTimeouts: number[] = [];
  private readonly transientDisposables = new Set<{
    dispose(): void;
    update?: (deltaSec: number) => void;
  }>();
  private koRecoveryTimeoutId: number | null = null;
  private cachedSignatureCtx?: SignatureMoveContext;
  private readonly loadedCombatCharacters = new Set<CharacterId>();
  private readonly combatLoadPromises = new Map<CharacterId, Promise<void>>();
  private readonly baseSwapPromises = new Map<CharacterId, Promise<THREE.Group | null>>();
  private matchLoadToken = 0;
  private unsubscribeAssetProgress?: () => void;
  private maxInitialProgressPct = 10;
  private maxMatchProgressPct = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.sceneManager = new SceneManager(canvas);
    this.sound = new SoundManager();
    this.stageManager = new StageManager(this.sceneManager);
    preloadDracoDecoder();

    this.unsubscribeAssetProgress = subscribeAssetProgress((snapshot) => {
      if (this.disposed || !snapshot.active) return;
      if (this.ui.isMatchLoaderOpen()) {
        this.maxMatchProgressPct = Math.max(
          this.maxMatchProgressPct,
          Math.min(99, snapshot.percent)
        );
        this.ui.setMatchLoaderState(
          true,
          this.maxMatchProgressPct,
          `Loading ${snapshot.category}: ${snapshot.percent}%`
        );
      } else if (this.ui.isInitialLoaderOpen()) {
        const mapped = Math.min(94, Math.round(12 + snapshot.percent * 0.8));
        this.maxInitialProgressPct = Math.max(this.maxInitialProgressPct, mapped);
        this.ui.setInitialLoaderProgress(
          this.maxInitialProgressPct,
          `Loading ${snapshot.category}: ${snapshot.percent}%`
        );
      }
    });

    this.selectStage = new CharacterSelectStage(
      canvas.clientWidth || window.innerWidth,
      canvas.clientHeight || window.innerHeight,
      {
        onSideLoadingChange: (side, loading, charId) => {
          const label = loading
            ? `LOADING ${FIGHTER_META[charId].displayName.toUpperCase()}...`
            : undefined;
          this.ui.setSelectSideLoading(side, loading, label);
        },
        onPortraitReady: (charId, url) => {
          if (!this.disposed) {
            this.ui.setFighterPortraits({ [charId]: url });
          }
        },
      }
    );
    this.sceneManager.setOnResize((w, h) => this.selectStage.resize(w, h));

    this.physics = new PhysicsCombatSystem();
    this.effects = new EffectsManager(this.sceneManager.scene);

    for (const id of CHARACTER_IDS) {
      const isLeft = id === this.leftFighterId;
      const isRight = id === this.rightFighterId;
      this.registerCombatRig(id, isLeft || isRight, isLeft ? 1 : -1);
    }

    this.physics.setActivePair(this.leftFighterId, this.rightFighterId, false);

    this.ui = new UIManager(canvas, {
      onPrimaryAction: () => this.handlePrimaryAction(),
      onKickAction: () => this.handleKickAction(),
      onJumpAction: () => this.handleJumpAction(),
      onCrouchAction: (crouching) => this.handleCrouchAction(crouching),
      onBlockAction: (isBlocking) => this.handleBlockAction(isBlocking),
      onSignatureAction: () => this.handleSignatureAction(),
      onSecondarySignatureAction: () => this.handleSecondarySignatureAction(),
      onCounterAction: () => this.handleCounterAction(),
      onBossPoseAction: () => this.triggerPoseAction(),
      onLoungePoseAction: () => this.triggerSecondaryPoseAction(),
      onChampPoseAction: () => this.triggerChinuChampPoseAction(),
      onRingEntryAction: () => this.triggerRingEntryAction(false),
      onSelectCharacter: (char) => this.selectCharacter(char),
      onSelectOpponent: (opp) => this.selectOpponent(opp),
      onSelectMatchup: (player, opp) => this.setMatchup(player, opp),
      onSelectStage: (stageId) => this.setStage(stageId),
      onSelectDifficulty: (level) => this.setDifficulty(level),
      onControlsGuideToggled: (open) => {
        if (open) {
          this.sound.playBookOpen();
          this.gameManager.pause();
        } else {
          this.sound.playBookClose();
          if (!this.ui.isModalOpen()) {
            this.gameManager.resume();
          }
        }
      },
      onPreviewSelectFighter: (side, char, variant: SelectIdleVariant, animate = true) => {
        void this.sound.playPlayerSlot(side === 'p1' ? 'player1' : 'player2');
        void this.selectStage.setFighter(side, char, variant, animate);
      },
      onSelectModalOpened: () => {
        this.matchLoadToken++;
        this.ui.setMatchLoaderState(false);
        this.sound.playClick();
        this.sound.playCharacterSelect();
        this.gameManager.pause();
      },
      onSelectModalClosed: () => {
        const shouldStartFresh =
          this.pendingMatchRestartAfterModalClose ||
          this.gameManager.getState() === 'INIT' ||
          this.gameManager.getState() === 'MATCH_OVER';
        this.pendingMatchRestartAfterModalClose = false;
        void this.prepareMatchAndStart(shouldStartFresh);
      },
      onPauseToggled: (paused) => {
        if (paused) {
          this.sound.playClick();
          this.gameManager.pause();
        } else {
          this.sound.playClick();
          if (!this.ui.isModalOpen() && !this.ui.isControlsGuideOpen()) {
            this.gameManager.resume();
          }
        }
      },
      onQuitToSelect: () => {
        this.pendingMatchRestartAfterModalClose = true;
        this.sound.playClick();
        this.gameManager.hideAnnouncement(true);
        this.sceneManager.resetCamera(true);
        this.gameManager.pause();
        this.ui.setModalOpen(true);
      },
      onRematch: () => {
        this.sound.playClick();
        this.gameManager.hideAnnouncement(true);
        this.sceneManager.resetCamera(true);
        void this.stageManager.applyRandomSkybox(this.activeStageId);
        this.gameManager.startMatch();
      },
      onHealPriyanshu: () => this.handleHealAction(),
      onToggleMute: () => {
        this.sound.toggleMute();
        this.syncHUD();
      },
      onMoveInput: (x, z) => {
        if (this.gameManager.isControlsLocked()) {
          this.physics.setMoveInput(this.selectedCharacter, 0, 0);
          return;
        }
        this.physics.setMoveInput(this.selectedCharacter, x, z);
      },
      onCanvasPointerDown: (clientX, clientY) => this.handleCanvasClick(clientX, clientY),
      onUserGesture: () => this.sound.unlock(),
    });

    this.gameManager = new GameManager({
      player1: this.buildParticipantConfig(this.leftFighterId, 'player1'),
      player2: this.buildParticipantConfig(this.rightFighterId, 'player2'),
      hud: GameManager.resolveHUDFromDocument(),
      passiveSignaturePerSecond: 4,
      callbacks: {
        onControlsLockChange: () => {
          this.physics.setMoveInput(this.selectedCharacter, 0, 0);
          this.physics.setMoveInput(this.opponentCharacter, 0, 0);
          this.syncHUD();
        },
        onHealthChange: (slot, hp) => {
          const fighterId = this.getFighterForSlot(slot);
          this.fighterHp.set(fighterId, Math.round(hp));
          this.syncHUD();
        },
        onSignatureChargeChange: (slot, _charge, isReady) => {
          this.ui.setTouchSignatureReady(slot, isReady);
          this.syncHUD();
        },
        onSlowMoChange: (active) => {
          this.koSlowMoActive = active;
        },
        onRoundStart: (roundNum) => {
          this.triggerPreFightGreetingSequence(roundNum);
        },
        onAnnouncementPhase: (phase, title) => {
          if (phase === 'round') {
            const isFinal = title.toUpperCase().includes('FINAL');
            const roundMatch = /(\d+)/.exec(title);
            const roundNum = roundMatch ? parseInt(roundMatch[1], 10) : 1;
            void this.sound.playRoundVoice(roundNum, isFinal);
          } else if (phase === 'ready') {
            void this.sound.playReadyVoice();
          } else if (phase === 'fight') {
            void this.sound.playFightVoice();
          } else if (phase === 'time-over') {
            this.sound.playTimeOverVoice();
          }
        },
        onTimerTick: (secondsRemaining) => {
          if (secondsRemaining <= 10 && secondsRemaining >= 1) {
            this.sound.playCountdown(secondsRemaining);
          }
        },
        onRoundEnd: (result) => {
          if (result.reason === 'ko') {
            this.sound.playKOBell();
            if (result.winner !== 'draw') {
              const winnerSlot = result.winner;
              const defeatedSlot: PlayerSlot =
                result.defeated ?? (winnerSlot === 'player1' ? 'player2' : 'player1');
              const winnerId = this.getFighterForSlot(winnerSlot);
              const defeatedId = this.getFighterForSlot(defeatedSlot);
              const winnerRig = this.rigs.get(winnerId);
              const defeatedRig = this.rigs.get(defeatedId);
              const winnerAnim = this.anims.get(winnerId);

              // Cinematic KO camera zoom sequence:
              // 1. Zoom in on defeated player as they hit the canvas in slow-motion
              // 2. Pan and heroic close-up on the celebrating winner
              const isMatchOver =
                (result.wins[result.winner] ?? 0) >= this.gameManager.getRoundsToWin();
              if (defeatedRig && winnerRig) {
                const defPos = defeatedRig.root.position.clone();
                const winPos = winnerRig.root.position.clone();
                this.isCinematicActive = true;
                this.sceneManager.triggerKOCinematicSequence(
                  defPos,
                  winPos,
                  () => {
                    this.isCinematicActive = false;
                  },
                  isMatchOver
                );
              }

              if (winnerAnim && !this.physics.isKnockedDown(winnerId)) {
                const cheerState: FighterState | null = winnerAnim.hasState('POSE')
                  ? 'POSE'
                  : winnerAnim.hasState('DANCE')
                    ? 'DANCE'
                    : winnerAnim.hasState('CHAMP_POSE')
                      ? 'CHAMP_POSE'
                      : null;
                if (cheerState) {
                  this.scheduleUnscaled(() => {
                    const gameState = this.gameManager.getState();
                    if (gameState === 'ROUND_END' || gameState === 'MATCH_OVER') {
                      winnerAnim.transitionTo(cheerState, 0.15, true);
                    }
                  }, 1500);
                }
              }
            }
          } else {
            this.sound.playClick();
          }
        },
        onRoundReset: () => {
          this.isCinematicActive = false;
          this.clearTransientDisposables();
          this.aggressionHits.clear();
          this.effects.clearBloodDecals();
          this.physics.setActivePair(this.leftFighterId, this.rightFighterId, true);
          const leftRig = this.rigs.get(this.leftFighterId);
          const rightRig = this.rigs.get(this.rightFighterId);
          if (leftRig && rightRig) {
            this.sceneManager.setupGreetingCamera(leftRig.root.position, rightRig.root.position);
          }
          this.physics.setKnockedDown(this.leftFighterId, false);
          this.physics.setKnockedDown(this.rightFighterId, false);
          this.physics.setMovementPaused(this.leftFighterId, false);
          this.physics.setMovementPaused(this.rightFighterId, false);
          this.fighterHp.set(this.leftFighterId, FIGHTER_MAX_HP);
          this.fighterHp.set(this.rightFighterId, FIGHTER_MAX_HP);
          this.anims.get(this.leftFighterId)?.transitionTo('IDLE', 0.08, true);
          this.anims.get(this.rightFighterId)?.transitionTo('IDLE', 0.08, true);
          this.cpuAi.reset(performance.now(), 3200);
          this.syncHUD();
        },
        onMatchOver: (winner) => {
          this.isCinematicActive = false;
          this.physics.setMoveInput(this.leftFighterId, 0, 0);
          this.physics.setMoveInput(this.rightFighterId, 0, 0);
          this.syncHUD();
          if (winner === 'draw') {
            this.sound.playMatchEndVoice(false, true);
          } else {
            const p1Won = winner === 'player1';
            const isFlawless =
              p1Won && (this.fighterHp.get(this.leftFighterId) ?? 0) >= FIGHTER_MAX_HP;
            this.sound.playMatchEndVoice(p1Won, false, isFlawless);
          }
        },
      },
    });

    this.cpuAi.reset(performance.now(), 1350);
    this.syncHUD();
    void this.runInitialSetupLoader();
  }

  private async runInitialSetupLoader(): Promise<void> {
    const leftName = FIGHTER_META[this.selectedCharacter].displayName;
    const rightName = FIGHTER_META[this.opponentCharacter].displayName;
    this.ui.setInitialLoaderProgress(
      10,
      `Preparing UI & initial arena setup (${leftName} vs ${rightName})...`
    );

    const fontDoc =
      typeof document !== 'undefined'
        ? (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
        : undefined;
    if (fontDoc?.ready) {
      await Promise.race([
        fontDoc.ready.catch(() => undefined),
        new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 450);
          this.activeTimeouts.push(timer);
        }),
      ]);
    }
    if (this.disposed) return;

    const totalRoster = CHARACTER_IDS.length;
    const completedIds = new Set<CharacterId>();
    const bumpRosterProgress = (id: CharacterId) => {
      if (this.disposed || completedIds.has(id)) return;
      completedIds.add(id);
      const count = completedIds.size;
      const pct = Math.round(22 + (count / totalRoster) * 70);
      this.ui.setInitialLoaderProgress(
        pct,
        `Preloading fighter avatars (${count}/${totalRoster}) — ${FIGHTER_META[id].displayName}...`
      );
    };

    this.ui.setInitialLoaderProgress(
      22,
      `Preloading roster avatars (0/${totalRoster}) & showcase models...`
    );

    const [, , allPortraits] = await Promise.all([
      this.selectStage
        .setFighter('p1', this.selectedCharacter, 'idle-1', false)
        .finally(() => bumpRosterProgress(this.selectedCharacter)),
      this.selectStage
        .setFighter('cpu', this.opponentCharacter, 'idle-1', false)
        .finally(() => bumpRosterProgress(this.opponentCharacter)),
      this.selectStage.generateFighterPortraits(CHARACTER_IDS, {
        includeIdlePose: false,
        onProgress: (id, url) => {
          if (url && !this.disposed) {
            this.ui.setFighterPortraits({ [id]: url });
          }
          bumpRosterProgress(id);
        },
      }),
    ]);

    if (this.disposed) return;
    this.ui.setFighterPortraits(allPortraits);
    this.ui.setInitialLoaderProgress(95, 'Finalizing fighter avatar thumbnails...');
    await this.ui.waitForRosterPortraitsReady(350);

    if (this.disposed) return;
    this.ui.setInitialLoaderProgress(100, 'Fighter avatars & showcase ready!');
    this.ui.hideInitialLoader();
  }

  private registerCombatRig(id: CharacterId, visible: boolean, facing: 1 | -1): void {
    const rig = CharacterFactory.createFighter(
      id,
      new THREE.Vector3(facing === 1 ? -1.15 : 1.15, 0, 0),
      facing
    );
    rig.root.visible = visible;
    this.rigs.set(id, rig);
    if (visible) {
      this.sceneManager.scene.add(rig.root);
    }
    this.physics.registerFighter(rig);

    const anim = new AnimationController(rig, (finishedState) => {
      const isHitVariant =
        finishedState === 'HIT' ||
        finishedState === 'HIT_HEAD' ||
        finishedState === 'HIT_STOMACH' ||
        finishedState === 'HIT_RIB' ||
        finishedState === 'HIT_BIG' ||
        finishedState === 'HIT_LEGS' ||
        finishedState === 'HIT_GROIN' ||
        finishedState === 'HIT_CAR' ||
        finishedState === 'BLOCK';

      if (isHitVariant || finishedState === 'BLUSH' || finishedState === 'GET_UP') {
        this.physics.setKnockedDown(rig.id, false);
      }
      if (
        finishedState === 'POSE' ||
        finishedState === 'LOUNGE' ||
        finishedState === 'DANCE' ||
        finishedState === 'CHAMP_POSE' ||
        finishedState === 'ENTRY' ||
        isHitVariant
      ) {
        this.physics.setLocomotionState(rig.id, false, null);
      }
      if (
        rig.id === 'chinu' &&
        (finishedState === 'POSE' || finishedState === 'DANCE' || finishedState === 'CHAMP_POSE')
      ) {
        this.resetPriyanshuAdmire();
      }
      if (
        finishedState.startsWith('PUNCH') ||
        finishedState.startsWith('KICK') ||
        finishedState === 'JUMP' ||
        finishedState === 'SIGNATURE' ||
        finishedState === 'POSE' ||
        finishedState === 'LOUNGE' ||
        finishedState === 'DANCE' ||
        finishedState === 'CHAMP_POSE' ||
        finishedState === 'ENTRY' ||
        finishedState === 'KISS' ||
        isHitVariant ||
        finishedState === 'BLUSH' ||
        finishedState === 'GET_UP' ||
        finishedState === 'LIFTING' ||
        finishedState === 'STABBING' ||
        finishedState === 'SALUTE'
      ) {
        if (this.blockingFighters.has(rig.id)) {
          anim.transitionTo('BLOCK', 0.14);
        } else if (this.physics.isCrouching(rig.id)) {
          anim.transitionTo('CROUCH', 0.14);
        } else {
          anim.transitionTo('IDLE', 0.22);
        }
      }
    });
    this.anims.set(id, anim);
  }

  private releaseInactiveFighterResources(activeIds: Set<CharacterId>): void {
    for (const id of CHARACTER_IDS) {
      if (activeIds.has(id)) continue;
      if (!this.loadedCombatCharacters.has(id) && !this.baseSwapPromises.has(id)) continue;

      const oldAnim = this.anims.get(id);
      oldAnim?.dispose();
      this.anims.delete(id);

      const oldRig = this.rigs.get(id);
      if (oldRig) {
        CharacterFactory.disposeRig(oldRig);
        this.rigs.delete(id);
      }
      CharacterFactory.disposeCharacterTemplate(id);
      this.loadedCombatCharacters.delete(id);
      this.baseSwapPromises.delete(id);

      this.registerCombatRig(id, false, -1);
    }
  }

  private syncSceneRigsVisibility(leftId: CharacterId, rightId: CharacterId): void {
    for (const [id, rig] of this.rigs.entries()) {
      const isActive = id === leftId || id === rightId;
      rig.root.visible = isActive;
      if (isActive && rig.root.parent !== this.sceneManager.scene) {
        this.sceneManager.scene.add(rig.root);
      } else if (!isActive && rig.root.parent === this.sceneManager.scene) {
        rig.root.removeFromParent();
      }
    }
  }

  private async ensureCharacterCombatLoaded(
    id: CharacterId,
    onProgress?: (ratio: number) => void
  ): Promise<void> {
    if (this.disposed) return;
    if (this.loadedCombatCharacters.has(id)) {
      onProgress?.(1);
      return;
    }

    const existing = this.combatLoadPromises.get(id);
    if (existing) {
      await existing;
      onProgress?.(1);
      return;
    }

    const task = (async () => {
      try {
        onProgress?.(0.08);
        const targetScene = await this.initCharacterBaseGLB(id);
        if (this.disposed) return;
        onProgress?.(0.35);

        await Promise.all([
          this.initCharacterNativeClips(id, targetScene, (completed, total) => {
            onProgress?.(0.35 + 0.65 * (completed / Math.max(total, 1)));
          }),
          id === 'priyanshu' ? preloadCyberpunkLaptop() : Promise.resolve(),
        ]);
        if (!this.disposed) {
          this.loadedCombatCharacters.add(id);
          onProgress?.(1);
        }
      } finally {
        this.combatLoadPromises.delete(id);
      }
    })();

    this.combatLoadPromises.set(id, task);
    await task;
  }

  private async ensureMatchResourcesLoaded(
    leftId: CharacterId,
    rightId: CharacterId,
    stageId: string
  ): Promise<boolean> {
    const token = ++this.matchLoadToken;
    const needLeft = !this.loadedCombatCharacters.has(leftId);
    const needRight = !this.loadedCombatCharacters.has(rightId);
    const needStage = !this.stageManager.isStageLoaded(stageId);

    if (!needLeft && !needRight && !needStage) {
      return !this.disposed;
    }

    const p1Name = FIGHTER_META[this.selectedCharacter].displayName;
    const p2Name = FIGHTER_META[this.opponentCharacter].displayName;
    const stageLabel = getStageDisplayName(stageId);
    const missingNames: string[] = [];
    if (needLeft) missingNames.push(FIGHTER_META[leftId].displayName);
    if (needRight) missingNames.push(FIGHTER_META[rightId].displayName);
    if (needStage) missingNames.push(stageLabel);

    this.gameManager.pause();
    this.maxMatchProgressPct = 8;
    this.ui.setMatchLoaderState(
      true,
      8,
      `Loading ${needStage && !needLeft && !needRight ? 'Stage Data' : 'Character Data'}: 8%`,
      `${p1Name} vs ${p2Name} • ${stageLabel}`
    );

    const weights = {
      left: needLeft ? 1 : 0,
      right: needRight ? 1 : 0,
      stage: needStage ? 1.2 : 0,
    };
    const totalWeight = Math.max(0.1, weights.left + weights.right + weights.stage);
    const progress = {
      left: needLeft ? 0 : 1,
      right: needRight ? 0 : 1,
      stage: needStage ? 0 : 1,
    };

    const updateBar = (category: 'Character Data' | 'Stage Data', labelName: string) => {
      if (this.disposed || token !== this.matchLoadToken) return;
      const done =
        progress.left * weights.left +
        progress.right * weights.right +
        progress.stage * weights.stage;
      const pct = Math.min(99, Math.max(8, Math.round(8 + (done / totalWeight) * 90)));
      this.maxMatchProgressPct = Math.max(this.maxMatchProgressPct, pct);
      this.ui.setMatchLoaderState(
        true,
        this.maxMatchProgressPct,
        `Loading ${category}: ${this.maxMatchProgressPct}% (${labelName})`
      );
    };

    const tasks: Promise<void>[] = [];
    if (needLeft) {
      tasks.push(
        this.ensureCharacterCombatLoaded(leftId, (r) => {
          progress.left = r;
          updateBar('Character Data', FIGHTER_META[leftId].displayName);
        })
      );
    }
    if (needRight) {
      tasks.push(
        this.ensureCharacterCombatLoaded(rightId, (r) => {
          progress.right = r;
          updateBar('Character Data', FIGHTER_META[rightId].displayName);
        })
      );
    }
    if (needStage) {
      tasks.push(
        this.stageManager.loadStage(stageId, (r) => {
          progress.stage = r;
          updateBar('Stage Data', stageLabel);
        })
      );
    }

    try {
      await Promise.all(tasks);
      if (this.disposed || token !== this.matchLoadToken) {
        return false;
      }
      this.ui.setMatchLoaderState(true, 100, `${stageLabel} & fighters ready!`);
      return true;
    } finally {
      if (!this.disposed && token === this.matchLoadToken) {
        this.ui.setMatchLoaderState(false, 100);
      }
    }
  }

  private async prepareMatchAndStart(startNewMatch: boolean): Promise<void> {
    const leftId = this.leftFighterId;
    const rightId = this.rightFighterId;
    const stageId = this.activeStageId;
    this.syncSceneRigsVisibility(leftId, rightId);

    const ready = await this.ensureMatchResourcesLoaded(leftId, rightId, stageId);
    if (!ready || this.disposed || this.ui.isModalOpen()) return;
    if (
      this.leftFighterId !== leftId ||
      this.rightFighterId !== rightId ||
      this.activeStageId !== stageId
    ) {
      return;
    }

    if (startNewMatch) {
      await this.stageManager.applyRandomSkybox(stageId);
      this.anims.get(leftId)?.transitionTo('IDLE', 0, true);
      this.anims.get(rightId)?.transitionTo('IDLE', 0, true);
      for (let i = 0; i < 6; i++) {
        this.anims.get(leftId)?.update(0.016);
        this.anims.get(rightId)?.update(0.016);
      }
      const leftRig = this.rigs.get(leftId);
      const rightRig = this.rigs.get(rightId);
      if (leftRig && rightRig) {
        this.sceneManager.setupGreetingCamera(leftRig.root.position, rightRig.root.position);
      }
      this.gameManager.startMatch();
      if (this.selectedCharacter === 'chinu' && this.anims.get('chinu')?.hasState('ENTRY')) {
        this.cpuAi.reset(performance.now(), 1650);
        this.triggerChinuEntryAction(true);
      }
    } else {
      this.gameManager.resume();
    }
  }

  private async prepareStageSwitchWithLoader(stageId: string): Promise<void> {
    const ready = await this.ensureMatchResourcesLoaded(
      this.leftFighterId,
      this.rightFighterId,
      stageId
    );
    if (!ready || this.disposed || this.ui.isModalOpen()) return;
    if (this.gameManager.isPausedState()) {
      this.gameManager.resume();
    }
  }

  private async initCharacterBaseGLB(id: CharacterId): Promise<THREE.Group | null> {
    const cachedSwap = this.baseSwapPromises.get(id);
    if (cachedSwap) {
      return cachedSwap;
    }

    const swapTask = (async (): Promise<THREE.Group | null> => {
      const scene = await CharacterFactory.loadCharacterGLBModel(id);
      if (!scene || this.disposed) return null;

      const rig = this.rigs.get(id);
      const anim = this.anims.get(id);
      if (!rig || !anim) return scene;

      const baseClips = createHumanoidGLBClips(scene);
      const applySwap = (): void => {
        if (this.disposed) return;
        if (this.isCinematicActive) {
          this.scheduleUnscaled(applySwap, 120);
          return;
        }

        const activeState = anim.getState();
        CharacterFactory.swapWithGLBModel(rig, scene);
        anim.swapRigClips(baseClips, activeState);
      };

      applySwap();
      return scene;
    })();

    this.baseSwapPromises.set(id, swapTask);
    return swapTask;
  }

  private async initCharacterNativeClips(
    id: CharacterId,
    targetRoot?: THREE.Object3D | null,
    onProgress?: (completed: number, total: number) => void
  ): Promise<void> {
    const anim = this.anims.get(id);
    if (!anim) {
      onProgress?.(1, 1);
      return;
    }

    const applyBatch = (batch: LoadedNativeGLBClips): void => {
      if (this.disposed) return;
      if (this.isCinematicActive) {
        this.scheduleUnscaled(() => applyBatch(batch), 120);
        return;
      }
      anim.registerClips(batch.clips, batch.clipSpeeds, batch.clipRepetitions);
      if (
        id === 'priyanshu' &&
        this.pendingPriyanshuLounge &&
        anim.hasState('LOUNGE') &&
        this.selectedCharacter === 'priyanshu'
      ) {
        this.pendingPriyanshuLounge = false;
        this.triggerLoungePoseAction();
      }
      if (
        id === 'chinu' &&
        this.pendingChinuEntry &&
        anim.hasState('ENTRY') &&
        this.selectedCharacter === 'chinu'
      ) {
        this.pendingChinuEntry = false;
        this.triggerChinuEntryAction(false);
      }
    };

    await CharacterFactory.loadNativeGLBClips(id, applyBatch, targetRoot, onProgress);
  }

  public start(): void {
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  private readonly loop = (now: number): void => {
    this.animFrameId = requestAnimationFrame(this.loop);

    const rawDelta = Math.min((now - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = now;

    if (this.ui.isInitialLoaderOpen() || this.ui.isMatchLoaderOpen()) {
      return;
    }

    if (this.ui.isModalOpen()) {
      this.selectStage.update(rawDelta);
      this.sceneManager.renderCustomScene(this.selectStage.scene, this.selectStage.camera);
      return;
    }

    if (this.ui.isPauseMenuOpen()) {
      this.sceneManager.render();
      return;
    }

    const effectiveTimeScale = this.koSlowMoActive
      ? Math.min(this.gameTimeScale, 0.25)
      : this.gameTimeScale;
    const scaledDelta = rawDelta * effectiveTimeScale;

    this.updateCpuAi();
    this.updateLocomotionAnimations();
    this.anims.get(this.leftFighterId)?.update(scaledDelta);
    this.anims.get(this.rightFighterId)?.update(scaledDelta);
    for (const item of this.transientDisposables) {
      item.update?.(rawDelta);
    }
    this.physics.step(scaledDelta, this.selectedCharacter);

    this.sceneManager.render();
  };

  private getSlotForFighter(id: CharacterId): PlayerSlot {
    return id === this.leftFighterId ? 'player1' : 'player2';
  }

  private getFighterForSlot(slot: PlayerSlot): CharacterId {
    return slot === 'player1' ? this.leftFighterId : this.rightFighterId;
  }

  private buildParticipantConfig(id: CharacterId, slot: PlayerSlot): FighterParticipantConfig {
    const rig = this.rigs.get(id);
    const homeX = slot === 'player1' ? -1.15 : 1.15;
    const homeYaw = slot === 'player1' ? Math.PI / 2 : -Math.PI / 2;

    return {
      id,
      name: FIGHTER_META[id].displayName,
      mesh: rig?.root,
      maxHealth: FIGHTER_MAX_HP,
      invulnerable: FIGHTER_META[id].isBossInfinite,
      homePosition: new THREE.Vector3(homeX, 0, 0),
      homeRotationY: homeYaw,
      onPlayKO: () => {
        const anim = this.anims.get(id);
        const oppId = this.getFighterForSlot(slot === 'player1' ? 'player2' : 'player1');
        const isCrouch = this.physics.isCrouching(id);
        const koState: FighterState =
          isCrouch && anim?.hasState('CROUCH_DEATH')
            ? 'CROUCH_DEATH'
            : anim?.hasState('DEAD')
              ? 'DEAD'
              : 'FALL_BACK';
        if (anim) {
          this.physics.setKnockedDown(id, true);
          this.physics.setMoveInput(id, 0, 0);
          this.physics.setLocomotionState(id, false, null);
          this.physics.setMovementPaused(id, true);
          anim.transitionTo(koState, 0.08, true);
          this.physics.applyDirectionalImpulse(id, oppId, -3.8);
          if (rig) {
            this.effects.spawnDizzyStars(rig.headAnchor, 2.2);
          }
          this.sound.playMatSlamAndDizzy();
        }
      },
      onPlayFall: () => {
        const anim = this.anims.get(id);
        const oppId = this.getFighterForSlot(slot === 'player1' ? 'player2' : 'player1');
        const isCrouch = this.physics.isCrouching(id);
        const fallState: FighterState =
          isCrouch && anim?.hasState('CROUCH_DEATH')
            ? 'CROUCH_DEATH'
            : anim?.hasState('DEAD')
              ? 'DEAD'
              : 'FALL_BACK';
        if (anim && anim.getState() !== fallState) {
          this.physics.setKnockedDown(id, true);
          this.physics.setMoveInput(id, 0, 0);
          this.physics.setLocomotionState(id, false, null);
          this.physics.setMovementPaused(id, true);
          anim.transitionTo(fallState, 0.05, true);
          this.physics.applyDirectionalImpulse(id, oppId, -5.5);
          if (rig) {
            this.effects.spawnDizzyStars(rig.headAnchor, 1.7);
          }
          this.sound.playMatSlamAndDizzy();
        }
      },
      onPlayIdle: () => {
        this.physics.setKnockedDown(id, false);
        this.physics.setMovementPaused(id, false);
        this.physics.setMoveInput(id, 0, 0);
        this.physics.setLocomotionState(id, false, null);
        this.anims.get(id)?.transitionTo('IDLE', 0.08, true);
      },
      onResetPosition: () => {
        this.physics.setBodyPositionXZ(id, homeX, 0);
        if (rig) {
          rig.modelRoot.rotation.y = homeYaw;
        }
      },
      onSignatureMove: (opponent) => {
        const oppId =
          (opponent.id as CharacterId | undefined) ??
          (id === this.selectedCharacter ? this.opponentCharacter : this.selectedCharacter);
        executeCharacterSignature(this.getSignatureContext(), id, oppId);
      },
    };
  }

  private updateCpuAi(): void {
    const cpuId = this.opponentCharacter;
    const playerId = this.selectedCharacter;
    const cpuAnim = this.anims.get(cpuId);
    const playerAnim = this.anims.get(playerId);
    const cpuPos = this.physics.getBodyPosition(cpuId);
    const playerPos = this.physics.getBodyPosition(playerId);
    if (!cpuAnim || !playerAnim || !cpuPos || !playerPos) return;

    const candidatePoses: CpuPoseState[] = ['POSE', 'LOUNGE', 'DANCE', 'CHAMP_POSE'];
    const availablePoseStates = candidatePoses.filter((state) => cpuAnim.hasState(state));
    const cpuSlot = this.getSlotForFighter(cpuId);
    const cpuSignatures = getCharacterSignatures(cpuId);
    const cpuHpPercent = (this.fighterHp.get(cpuId) ?? FIGHTER_MAX_HP) / FIGHTER_MAX_HP;

    this.cpuAi.update(performance.now(), {
      cpuId,
      playerId,
      cpuPos,
      playerPos,
      cpuState: cpuAnim.getState(),
      playerState: playerAnim.getState(),
      isPaused:
        this.disposed ||
        this.isCinematicActive ||
        this.gameManager.isControlsLocked() ||
        this.gameManager.isPausedState() ||
        this.ui.isModalOpen() ||
        this.ui.isControlsGuideOpen() ||
        this.koRecoveryTimeoutId !== null ||
        this.physics.isKnockedDown(cpuId) ||
        this.physics.isMovementPaused(cpuId) ||
        this.physics.isKnockedDown(playerId),
      canCpuRun: cpuAnim.hasState('RUN') && !this.physics.isMovementPaused(cpuId),
      availablePoseStates,
      difficulty: this.difficulty,
      isSignatureReady: this.gameManager.isSignatureReady(cpuSlot),
      cpuHpPercent,
      signatureCount: cpuSignatures.length,
      onSetMoveInput: (x, z) => this.physics.setMoveInput(cpuId, x, z),
      onTriggerPose: (poseState) => this.triggerCpuPose(cpuId, poseState),
      onTriggerAttack: (move) => this.triggerCpuAttack(cpuId, playerId, move),
      onTriggerSignature: (variantIndex) =>
        this.triggerCpuSignature(cpuId, playerId, variantIndex),
    });
  }

  private triggerCpuSignature(
    attackerId: CharacterId,
    defenderId: CharacterId,
    variantIndex: 0 | 1
  ): void {
    if (this.isCinematicActive || this.disposed || this.gameManager.isControlsLocked()) return;
    if (
      variantIndex === 0 &&
      !CpuAiController.canCpuAttack(attackerId, defenderId)
    ) {
      return;
    }

    const cpuSlot = this.getSlotForFighter(attackerId);
    if (!this.gameManager.isSignatureReady(cpuSlot)) return;

    const catalog = getCharacterSignatures(attackerId);
    const chosen = catalog[variantIndex] ?? catalog[0];
    if (!chosen) return;

    if (variantIndex === 0) {
      this.gameManager.triggerSignature(cpuSlot);
      return;
    }

    if (!this.gameManager.consumeSignatureCharge(cpuSlot)) return;
    executeCharacterSignature(this.getSignatureContext(), attackerId, defenderId, chosen.meta.id);
  }

  private updateLocomotionAnimations(): void {
    for (const id of [this.leftFighterId, this.rightFighterId]) {
      const anim = this.anims.get(id);
      if (!anim) continue;

      const currentState = anim.getState();
      const isJumping = this.physics.isJumping(id);
      const isCrouching = this.physics.isCrouching(id);

      // Recover to IDLE / CROUCH when landing from vertical jump
      if (!isJumping && currentState === 'JUMP') {
        anim.transitionTo(isCrouching ? 'CROUCH' : 'IDLE', 0.16);
      }

      if (isCrouching && !isJumping && (currentState === 'IDLE' || currentState === 'RUN')) {
        this.physics.setLocomotionState(id, false, null);
        anim.transitionTo('CROUCH', 0.14);
        continue;
      } else if (!isCrouching && currentState === 'CROUCH') {
        anim.transitionTo('IDLE', 0.16);
      }

      const moveInput = this.physics.getMoveInput(id);
      const isMoving = Boolean(
        !this.isCinematicActive &&
        !this.gameManager.isControlsLocked() &&
        !this.physics.isKnockedDown(id) &&
        !this.physics.isMovementPaused(id) &&
        !isCrouching &&
        moveInput &&
        moveInput.lengthSq() > 0.001
      );
      const canStartRun =
        !isCrouching &&
        !isJumping &&
        (currentState === 'IDLE' ||
          currentState === 'RUN' ||
          (id === this.selectedCharacter &&
            (currentState === 'ADMIRE' || currentState === 'ENTRY')));

      if (isMoving && moveInput && anim.hasState('RUN') && canStartRun) {
        if (id === 'chinu' && currentState === 'ENTRY') {
          this.cancelChinuEntry();
        }
        const moveYaw = Math.atan2(moveInput.x, moveInput.y);
        this.physics.setLocomotionState(id, true, moveYaw);
        anim.transitionTo('RUN', 0.20);
      } else if (!isMoving && currentState === 'RUN') {
        this.physics.setLocomotionState(id, false, null);
        anim.transitionTo('IDLE', 0.22);
      }
    }
  }

  private scheduleUnscaled(callback: () => void, delayMs: number): void {
    const id = window.setTimeout(callback, delayMs);
    this.activeTimeouts.push(id);
  }

  private clearTransientDisposables(): void {
    for (const item of this.transientDisposables) {
      item.dispose();
    }
    this.transientDisposables.clear();
  }

  public setMatchup(requestedPlayer: CharacterId, requestedOpponent: CharacterId): void {
    const player: CharacterId = canSelectCharacter(requestedPlayer)
      ? requestedPlayer
      : 'priyanshu';
    let nextOpponent: CharacterId = canSelectCharacter(requestedOpponent)
      ? requestedOpponent
      : getFallbackOpponent(player);
    if (nextOpponent === player) {
      nextOpponent = getFallbackOpponent(player);
    }

    this.pendingPriyanshuLounge = false;
    this.pendingChinuEntry = false;
    this.cancelChinuEntry();
    this.clearTransientDisposables();
    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }
    this.ui.showKOBanner(false);
    this.physics.setMoveInput(this.selectedCharacter, 0, 0);

    const prevPairSet = new Set([this.leftFighterId, this.rightFighterId]);
    const pairChanged = !prevPairSet.has(player) || !prevPairSet.has(nextOpponent);

    let newLeft: CharacterId;
    let newRight: CharacterId;
    if (player === 'chinu' || nextOpponent === 'chinu') {
      newLeft = 'chinu';
      newRight = player === 'chinu' ? nextOpponent : player;
    } else if (!pairChanged) {
      newLeft = this.leftFighterId;
      newRight = this.rightFighterId;
    } else {
      newLeft = player;
      newRight = nextOpponent;
    }

    this.selectedCharacter = player;
    this.opponentCharacter = nextOpponent;
    this.leftFighterId = newLeft;
    this.rightFighterId = newRight;

    if (pairChanged) {
      this.releaseInactiveFighterResources(new Set([newLeft, newRight]));
    }
    this.syncSceneRigsVisibility(newLeft, newRight);
    for (const [id] of this.rigs.entries()) {
      this.physics.setMoveInput(id, 0, 0);
      this.physics.setLocomotionState(id, false, null);
      this.physics.setMovementPaused(id, false);
      if (pairChanged) {
        this.physics.setKnockedDown(id, false);
        this.anims.get(id)?.transitionTo('IDLE', 0.05, true);
        if (!FIGHTER_META[id].isBossInfinite) {
          this.fighterHp.set(id, FIGHTER_MAX_HP);
        }
      }
    }

    if (pairChanged) {
      this.aggressionHits.clear();
      this.effects.clearBloodDecals();
    }
    this.physics.setActivePair(newLeft, newRight, pairChanged);
    this.gameManager.setParticipants(
      this.buildParticipantConfig(newLeft, 'player1'),
      this.buildParticipantConfig(newRight, 'player2')
    );

    this.sound.playClick();
    this.syncHUD();

    const hasAutoEntry = player === 'chinu' && this.anims.get('chinu')?.hasState('ENTRY');
    this.cpuAi.reset(performance.now(), hasAutoEntry ? 1650 : 1350);

    if (this.ui.isModalOpen()) {
      this.pendingMatchRestartAfterModalClose = true;
    } else {
      void this.prepareMatchAndStart(true);
    }
  }

  public selectCharacter(character: CharacterId): void {
    if (this.isCinematicActive || !canSelectCharacter(character)) return;
    if (character === this.selectedCharacter) {
      this.sound.playClick();
      return;
    }
    const nextOpp =
      character === this.opponentCharacter ? this.selectedCharacter : this.opponentCharacter;
    this.setMatchup(character, nextOpp);
  }

  public selectOpponent(opponent: CharacterId): void {
    if (this.isCinematicActive || !canSelectCharacter(opponent)) return;
    if (opponent === this.opponentCharacter) {
      this.sound.playClick();
      return;
    }
    const nextPlayer =
      opponent === this.selectedCharacter ? this.opponentCharacter : this.selectedCharacter;
    this.setMatchup(nextPlayer, opponent);
  }

  private handleCanvasClick(clientX: number, clientY: number): void {
    if (this.gameManager.isControlsLocked()) return;
    const leftRig = this.rigs.get(this.leftFighterId);
    const rightRig = this.rigs.get(this.rightFighterId);
    const activeRigs = [leftRig, rightRig].filter((r): r is FighterRig => Boolean(r));

    const hit = this.sceneManager.pickFighterAt(clientX, clientY, activeRigs);
    if (!hit) return;

    if (hit.rig.id === this.opponentCharacter) {
      if (this.opponentCharacter === 'chinu') {
        this.triggerAction2Counter(this.selectedCharacter, 'chinu');
      } else {
        const attackType = this.resolveCombatAttackType(
          this.selectedCharacter,
          this.opponentCharacter,
          'punch'
        );
        this.triggerStandardAttack(this.selectedCharacter, this.opponentCharacter, attackType, hit.point);
      }
    } else if (hit.rig.id === this.selectedCharacter) {
      this.triggerPoseAction(hit.point);
    }
  }

  private handleJumpAction(): void {
    if (this.gameManager.isControlsLocked() || this.isCinematicActive) return;
    const jumped = this.physics.triggerJump(this.selectedCharacter);
    if (jumped) {
      const anim = this.anims.get(this.selectedCharacter);
      anim?.transitionTo('JUMP', 0.12, true);
    }
  }

  private handleCrouchAction(crouching: boolean): void {
    if (this.gameManager.isControlsLocked() || this.isCinematicActive) return;
    const wasCrouching = this.physics.isCrouching(this.selectedCharacter);
    this.physics.setCrouching(this.selectedCharacter, crouching);
    if (crouching && !wasCrouching) {
      const anim = this.anims.get(this.selectedCharacter);
      anim?.transitionTo('CROUCH', 0.14, false);
    } else if (!crouching && wasCrouching) {
      const anim = this.anims.get(this.selectedCharacter);
      if (anim?.getState() === 'CROUCH') {
        anim.transitionTo('IDLE', 0.16);
      }
    }
  }

  private resolveCombatAttackType(
    attackerId: CharacterId,
    defenderId: CharacterId,
    baseKind: 'punch' | 'kick'
  ): CombatAttackType {
    const isJumping = this.physics.isJumping(attackerId);
    const isCrouching = this.physics.isCrouching(attackerId);
    const input = this.physics.getMoveInput(attackerId);

    if (baseKind === 'kick') {
      if (isJumping) return 'kick_flying';
      if (isCrouching) return 'kick_low';

      const actorPos = this.physics.getBodyPosition(attackerId);
      const defenderPos = this.physics.getBodyPosition(defenderId);

      if (input && actorPos && defenderPos && Math.abs(input.x) > 0.25) {
        const toOpponentX = Math.sign(defenderPos.x - actorPos.x);
        const isForward = Math.sign(input.x) === toOpponentX;
        return isForward ? 'kick_mma' : 'kick_back';
      }
      return 'kick';
    } else {
      if (isJumping) return 'punch_hook';
      if (isCrouching) return 'punch_elbow';

      const actorPos = this.physics.getBodyPosition(attackerId);
      const defenderPos = this.physics.getBodyPosition(defenderId);

      if (input && actorPos && defenderPos && Math.abs(input.x) > 0.25) {
        const toOpponentX = Math.sign(defenderPos.x - actorPos.x);
        const isForward = Math.sign(input.x) === toOpponentX;
        return isForward ? 'punch_hook' : 'punch_combo';
      }
      return 'punch';
    }
  }

  private handlePrimaryAction(): void {
    if (this.gameManager.isControlsLocked()) return;
    if (this.opponentCharacter === 'chinu') {
      this.triggerAction2Counter(this.selectedCharacter, 'chinu');
      return;
    }
    const attackType = this.resolveCombatAttackType(
      this.selectedCharacter,
      this.opponentCharacter,
      'punch'
    );
    this.triggerStandardAttack(this.selectedCharacter, this.opponentCharacter, attackType);
  }

  private handleKickAction(): void {
    if (this.gameManager.isControlsLocked()) return;
    if (this.opponentCharacter === 'chinu') {
      this.triggerAction2Counter(this.selectedCharacter, 'chinu');
      return;
    }
    const attackType = this.resolveCombatAttackType(
      this.selectedCharacter,
      this.opponentCharacter,
      'kick'
    );
    this.triggerStandardAttack(this.selectedCharacter, this.opponentCharacter, attackType);
  }

  private handleSignatureAction(): void {
    if (this.gameManager.isControlsLocked()) return;
    if (this.opponentCharacter === 'chinu') {
      this.triggerAction2Counter(this.selectedCharacter, 'chinu');
      return;
    }
    const humanSlot = this.getSlotForFighter(this.selectedCharacter);
    if (!this.gameManager.triggerSignature(humanSlot)) {
      this.setQuip(
        FIGHTER_META[this.selectedCharacter].displayName,
        `Signature at ${this.gameManager.getSignatureCharge(humanSlot)}% — reach 100% first! ⚡`
      );
      this.syncHUD();
    }
  }

  private handleSecondarySignatureAction(): void {
    if (this.gameManager.isControlsLocked()) return;
    if (this.opponentCharacter === 'chinu') {
      this.triggerAction2Counter(this.selectedCharacter, 'chinu');
      return;
    }
    const secondary = getCharacterSignatures(this.selectedCharacter)[1];
    if (!secondary) return;
    const humanSlot = this.getSlotForFighter(this.selectedCharacter);
    if (!this.gameManager.consumeSignatureCharge(humanSlot)) {
      this.setQuip(
        FIGHTER_META[this.selectedCharacter].displayName,
        `Signature at ${this.gameManager.getSignatureCharge(humanSlot)}% — reach 100% first! ⚡`
      );
      this.syncHUD();
      return;
    }
    executeCharacterSignature(
      this.getSignatureContext(),
      this.selectedCharacter,
      this.opponentCharacter,
      secondary.meta.id
    );
  }

  private getSignatureContext(): SignatureMoveContext {
    if (this.cachedSignatureCtx) return this.cachedSignatureCtx;
    this.cachedSignatureCtx = {
      physics: this.physics,
      sound: this.sound,
      effects: this.effects,
      sceneManager: this.sceneManager,
      cpuAi: this.cpuAi,
      getRig: (id) => this.rigs.get(id),
      getAnim: (id) => this.anims.get(id),
      getDisplayName: (id) => FIGHTER_META[id].displayName,
      getFighterHp: (id) => this.fighterHp.get(id) ?? 0,
      getComboHits: () => this.comboHits,
      nextQuipIndex: () => {
        const current = this.quipIndex;
        this.quipIndex += 1;
        return current;
      },
      setQuip: (speaker, text, fromPlayerAction) =>
        this.setQuip(speaker, text, fromPlayerAction),
      recordHitQuip: (defenderId) => this.recordHitQuip(defenderId),
      isCinematicActive: () => this.isCinematicActive,
      setCinematicActive: (active) => {
        this.isCinematicActive = active;
      },
      setTimeScale: (scale) => {
        this.gameTimeScale = scale;
      },
      clearKOTimeout: () => {
        if (this.koRecoveryTimeoutId !== null) {
          clearTimeout(this.koRecoveryTimeoutId);
          this.koRecoveryTimeoutId = null;
        }
      },
      cancelChinuEntry: () => this.cancelChinuEntry(),
      resetPriyanshuAdmire: () => this.resetPriyanshuAdmire(),
      applyDamageToFighter: (defenderId, attackerId, damage, fromCinematic, countCombo) =>
        this.applyDamageToFighter(defenderId, attackerId, damage, fromCinematic, countCombo),
      resetFighterHPState: (id) => this.resetFighterHPState(id),
      flashTintFeedback: (rig, hexColor, intensity, duration) =>
        this.flashTintFeedback(rig, hexColor, intensity, duration),
      wobbleHeadOnImpact: (rig) => this.wobbleHeadOnImpact(rig),
      scheduleUnscaled: (cb, delayMs) => this.scheduleUnscaled(cb, delayMs),
      syncHUD: () => this.syncHUD(),
      interruptFighterAi: (targetId, durationMs) => {
        if (targetId === this.opponentCharacter) {
          this.cpuAi.onCpuInterrupted(performance.now(), durationMs);
        }
      },
      triggerBossCounter: (challengerId, bossId) =>
        this.triggerAction2Counter(challengerId, bossId),
      restoreFighterHpPercent: (id, percent) => this.restoreFighterHpPercent(id, percent),
      registerTransientDisposable: (item) => {
        this.transientDisposables.add(item);
      },
      spawnBloodImpact: (defenderId, attackerId, impactPoint, damage, intensityBoost) =>
        this.maybeSpawnCombatBlood(defenderId, attackerId, impactPoint, damage, intensityBoost),
    };
    return this.cachedSignatureCtx;
  }

  private handleCounterAction(): void {
    if (this.gameManager.isControlsLocked()) return;
    this.sound.playComboBreaker();
    if (this.selectedCharacter === 'chinu' || this.opponentCharacter === 'chinu') {
      const challenger =
        this.opponentCharacter === 'chinu' ? this.selectedCharacter : this.opponentCharacter;
      this.triggerAction2Counter(challenger, 'chinu');
      return;
    }
    this.triggerOpponentStrikeBack(this.opponentCharacter, this.selectedCharacter);
  }

  private isFighterDownOrDead(state?: FighterState): boolean {
    return (
      state === 'FALL_BACK' ||
      state === 'DEAD' ||
      state === 'CROUCH_DEATH' ||
      state === 'GET_UP'
    );
  }

  private handleBlockAction(isPressed: boolean): void {
    if (this.isCinematicActive || this.gameManager.isControlsLocked()) return;
    const player = this.selectedCharacter;
    const anim = this.anims.get(player);
    if (!anim) return;

    const state = anim.getState();
    if (this.isFighterDownOrDead(state)) return;

    if (isPressed) {
      this.blockingFighters.add(player);
      this.physics.setMoveInput(player, 0, 0);
      this.physics.setLocomotionState(player, false, null);
      if (state !== 'BLOCK') {
        anim.transitionTo('BLOCK', 0.05, true);
      }
    } else {
      this.blockingFighters.delete(player);
      if (anim.getState() === 'BLOCK') {
        anim.transitionTo('IDLE', 0.08);
      }
    }
  }

  public isFighterBlocking(id: CharacterId): boolean {
    return this.blockingFighters.has(id) || this.anims.get(id)?.getState() === 'BLOCK';
  }

  private handleHealAction(): void {
    const isChinuPriyanshu =
      (this.leftFighterId === 'chinu' && this.rightFighterId === 'priyanshu') ||
      (this.leftFighterId === 'priyanshu' && this.rightFighterId === 'chinu');
    if (isChinuPriyanshu) {
      this.triggerKissHealSequence();
    } else {
      this.triggerMatchHealReset();
    }
  }

  private getStrikeImpactDelayMs(attackerId: CharacterId, isKick: boolean): number {
    if (attackerId === 'chinu') return isKick ? 380 : 260;
    if (attackerId === 'priyanshu') return isKick ? 320 : 250;
    if (attackerId === 'modiji') return isKick ? 330 : 280;
    if (attackerId === 'trump') return isKick ? 330 : 260;
    if (attackerId === 'putin') return isKick ? 330 : 260;
    if (attackerId === 'amitabh') return isKick ? 330 : 260;
    return isKick ? 190 : 150;
  }

  private setQuip(speaker: string, text: string, fromPlayerAction = true): void {
    this.targetQuipSpeaker = speaker;
    this.targetQuip = text;
    if (fromPlayerAction) {
      this.lastPlayerQuipAt = performance.now();
    }
  }

  private canShowCpuQuip(): boolean {
    return performance.now() - this.lastPlayerQuipAt > 2800;
  }

  private maybeSpawnCombatBlood(
    defenderId: CharacterId,
    attackerId: CharacterId,
    impactPoint: THREE.Vector3,
    damage: number,
    intensityBoost = 0
  ): void {
    if (FIGHTER_META[defenderId].isBossInfinite) return;

    const now = performance.now();
    const windowMs = 3400;
    const prior = this.aggressionHits.get(defenderId) ?? [];
    const recent = prior.filter((t) => now - t <= windowMs);
    recent.push(now);
    this.aggressionHits.set(defenderId, recent);

    const recentCount = recent.length;
    if (recentCount < 2 && damage < 18 && intensityBoost <= 0) {
      return;
    }

    const currentHp = this.fighterHp.get(defenderId) ?? FIGHTER_MAX_HP;
    const missingHpRatio = Math.max(0, 1 - currentHp / FIGHTER_MAX_HP);
    const intensity = THREE.MathUtils.clamp(
      (recentCount - 1) * 0.55 + damage / 18 + missingHpRatio * 0.6 + intensityBoost,
      0.55,
      2.5
    );

    const attackerPos =
      this.physics.getBodyPosition(attackerId) ?? this.rigs.get(attackerId)?.root.position;
    const defenderPos =
      this.physics.getBodyPosition(defenderId) ?? this.rigs.get(defenderId)?.root.position;
    const sprayDir =
      attackerPos && defenderPos
        ? new THREE.Vector3(defenderPos.x - attackerPos.x, 0, defenderPos.z - attackerPos.z)
        : new THREE.Vector3(1, 0, 0);
    if (sprayDir.lengthSq() < 0.0001) {
      sprayDir.set(1, 0, 0);
    } else {
      sprayDir.normalize();
    }

    this.effects.spawnBloodSplatter(impactPoint, sprayDir, intensity);
    if (defenderId === this.selectedCharacter && intensity >= 1.15) {
      this.ui.flashBloodVignette(intensity);
    }
  }

  private applyNonBossStrikeHit(
    defenderId: CharacterId,
    attackerId: CharacterId,
    defenderRig: FighterRig,
    defenderAnim: AnimationController,
    impactPoint: THREE.Vector3,
    damage: number,
    opts: {
      knockback: number;
      jitter: number;
      label?: string;
      comboNote: number;
      shakeIntensity: number;
      shakeDuration: number;
      hitType?: 'head' | 'stomach' | 'rib' | 'body' | 'big' | 'legs' | 'groin' | 'car';
    }
  ): void {
    this.physics.setLocomotionState(defenderId, false, null);
    const targetHitState: FighterState =
      opts.hitType === 'car'
        ? 'HIT_CAR'
        : opts.hitType === 'groin'
          ? 'HIT_GROIN'
          : opts.hitType === 'head'
            ? 'HIT_HEAD'
            : opts.hitType === 'stomach'
              ? 'HIT_STOMACH'
              : opts.hitType === 'rib'
                ? 'HIT_RIB'
                : opts.hitType === 'big'
                  ? 'HIT_BIG'
                  : opts.hitType === 'legs'
                    ? 'HIT_LEGS'
                    : 'HIT';
    defenderAnim.transitionTo(targetHitState, 0.04, true);
    this.physics.applyDirectionalImpulse(
      defenderId,
      attackerId,
      opts.knockback,
      (Math.random() - 0.5) * opts.jitter
    );
    this.flashTintFeedback(defenderRig, 0xffffff, 0.72, 0.22);
    this.wobbleHeadOnImpact(defenderRig);
    this.effects.spawnPunchImpact(impactPoint, damage, opts.label);
    this.maybeSpawnCombatBlood(defenderId, attackerId, impactPoint, damage);
    this.sound.playPunchHit(opts.comboNote);
    if (opts.hitType === 'groin') {
      this.sound.playMetalClang();
    }
    this.sceneManager.triggerShake(opts.shakeIntensity, opts.shakeDuration);
  }

  private applyBlockedStrikeHit(
    defenderId: CharacterId,
    attackerId: CharacterId,
    defenderRig: FighterRig,
    defenderAnim: AnimationController,
    impactPoint: THREE.Vector3,
    originalDamage: number,
    opts: {
      knockback: number;
    }
  ): void {
    const chipDamage = Math.max(1, Math.round(originalDamage * 0.15));
    this.physics.setLocomotionState(defenderId, false, null);
    defenderAnim.transitionTo('BLOCK', 0.04, true);
    this.physics.applyDirectionalImpulse(defenderId, attackerId, opts.knockback);
    this.flashTintFeedback(defenderRig, 0x38bdf8, 0.75, 0.2);
    this.effects.spawnBlockImpact(impactPoint, chipDamage);
    this.sound.playBlockImpact();
    this.sceneManager.triggerShake(0.08, 0.12);
    this.applyDamageToFighter(defenderId, attackerId, chipDamage, false);
  }

  /**
   * Standard or Directional Punch/Kick attack from attacker to non-boss defender.
   */
  public triggerStandardAttack(
    attackerId: CharacterId,
    defenderId: CharacterId,
    move: CombatAttackType | 'punch' | 'kick',
    clickedPoint?: THREE.Vector3
  ): void {
    if (this.isCinematicActive || this.gameManager.isControlsLocked()) return;
    if (attackerId === 'priyanshu' && defenderId === 'chinu') {
      this.triggerAction2Counter('priyanshu', 'chinu');
      return;
    }

    const attackerAnim = this.anims.get(attackerId);
    const defenderAnim = this.anims.get(defenderId);
    const defenderRig = this.rigs.get(defenderId);
    if (!attackerAnim || !defenderAnim || !defenderRig) return;

    const defenderState = defenderAnim.getState();
    if (this.isFighterDownOrDead(defenderState)) {
      return;
    }

    const isKick = move.startsWith('kick');
    const attackAnimState: FighterState =
      move === 'punch_hook'
        ? 'PUNCH_HOOK'
        : move === 'punch_elbow'
          ? 'PUNCH_ELBOW'
          : move === 'punch_combo'
            ? 'PUNCH_COMBO'
            : move === 'kick_mma'
              ? 'KICK_MMA'
              : move === 'kick_back'
                ? 'KICK_BACK'
                : move === 'kick_low'
                  ? 'KICK_LOW'
                  : move === 'kick_flying'
                    ? 'KICK_FLYING'
                    : isKick
                      ? 'KICK'
                      : 'PUNCH';

    let damage = PUNCH_DAMAGE;
    if (move === 'kick_flying') damage = 26;
    else if (move === 'kick_mma') damage = 24;
    else if (move === 'kick_back') damage = 22;
    else if (move === 'kick_low') damage = 18;
    else if (isKick) damage = DIRECT_KICK_DAMAGE;
    else if (move === 'punch_hook') damage = 18;
    else if (move === 'punch_combo') damage = 22;
    else if (move === 'punch_elbow') damage = 19;

    const forwardImpulse =
      move === 'kick_flying'
        ? 3.6
        : move === 'kick_mma'
          ? 3.1
          : move === 'kick_back'
            ? 2.6
            : move === 'kick_low'
              ? 2.2
              : isKick
                ? 2.9
                : move === 'punch_hook'
                  ? 2.7
                  : move === 'punch_combo'
                    ? 2.3
                    : move === 'punch_elbow'
                      ? 2.5
                      : 2.4;

    this.cancelChinuEntry();
    if (attackerId === 'chinu') {
      this.resetPriyanshuAdmire();
    }
    if (attackerId === this.selectedCharacter) {
      this.cpuAi.onPlayerAction(performance.now(), 950);
    }
    this.physics.setMoveInput(attackerId, 0, 0);
    this.physics.setLocomotionState(attackerId, false, null);
    this.sound.playWhoosh(isKick ? 0.85 : 1.05);
    attackerAnim.transitionTo(attackAnimState, 0.05, true);
    this.physics.applyDirectionalImpulse(attackerId, defenderId, forwardImpulse);

    const impactDelayMs = this.getStrikeImpactDelayMs(attackerId, isKick);

    this.scheduleUnscaled(() => {
      if (this.isCinematicActive || this.disposed || this.gameManager.isControlsLocked()) return;

      const currentState = defenderAnim.getState();
      if (this.isFighterDownOrDead(currentState)) return;

      const hit = this.physics.resolveStrike(attackerId, defenderId, move, damage);
      if (!hit) {
        // Strike whiffed cleanly - defender was out of reach or attacker facing away
        return;
      }
      const impactPoint = clickedPoint ?? hit.impactPoint;

      if (defenderId === this.opponentCharacter) {
        this.cpuAi.onCpuInterrupted(performance.now(), 750);
      }

      const isBlocked =
        this.isFighterBlocking(defenderId) ||
        (defenderId === this.opponentCharacter && this.cpuAi.shouldCpuBlock(this.difficulty));

      if (isBlocked) {
        this.applyBlockedStrikeHit(defenderId, attackerId, defenderRig, defenderAnim, impactPoint, damage, {
          knockback: isKick ? -3.2 : -2.0,
        });
        return;
      }

      let hitType: 'head' | 'stomach' | 'rib' | 'body' | 'big' | 'legs' | 'groin' | 'car' = 'head';
      let label: string | undefined = undefined;

      if (move === 'kick_flying') {
        hitType = 'big';
        label = 'FLYING KICK!';
      } else if (move === 'kick_mma') {
        hitType = 'big';
        label = 'ROUNDHOUSE!';
      } else if (move === 'kick_back') {
        hitType = 'stomach';
        label = 'SPIN KICK!';
      } else if (move === 'kick_low') {
        hitType = 'groin';
        label = 'GROIN KICK!';
      } else if (isKick) {
        hitType = 'stomach';
        label = 'SMACK!';
      } else if (move === 'punch_hook') {
        hitType = 'head';
        label = 'HOOK!';
      } else if (move === 'punch_combo') {
        hitType = 'big';
        label = 'FLURRY!';
      } else if (move === 'punch_elbow') {
        hitType = 'rib';
        label = 'ELBOW!';
      } else {
        hitType = 'head';
      }

      this.applyNonBossStrikeHit(defenderId, attackerId, defenderRig, defenderAnim, impactPoint, damage, {
        knockback: isKick ? -6.6 : -4.4,
        jitter: isKick ? 1.8 : 1.4,
        label,
        comboNote: this.comboHits + (isKick ? 3 : 1),
        shakeIntensity: isKick ? 0.22 : 0.15,
        shakeDuration: isKick ? 0.28 : 0.2,
        hitType,
      });

      this.recordHitQuip(defenderId);
      this.applyDamageToFighter(defenderId, attackerId, damage, false);
    }, impactDelayMs);
  }

  private triggerCpuAttack(
    attackerId: CharacterId,
    defenderId: CharacterId,
    move: 'punch' | 'kick'
  ): void {
    if (
      this.isCinematicActive ||
      this.gameManager.isControlsLocked() ||
      !CpuAiController.canCpuAttack(attackerId, defenderId)
    ) {
      return;
    }

    const attackerAnim = this.anims.get(attackerId);
    const defenderAnim = this.anims.get(defenderId);
    const defenderRig = this.rigs.get(defenderId);
    if (!attackerAnim || !defenderAnim || !defenderRig) return;

    const defenderState = defenderAnim.getState();
    if (this.isFighterDownOrDead(defenderState)) return;

    const attackType = this.resolveCombatAttackType(attackerId, defenderId, move);
    const isKick = attackType.startsWith('kick');
    const attackAnimState: FighterState =
      attackType === 'punch_hook'
        ? 'PUNCH_HOOK'
        : attackType === 'punch_elbow'
          ? 'PUNCH_ELBOW'
          : attackType === 'punch_combo'
            ? 'PUNCH_COMBO'
            : attackType === 'kick_mma'
              ? 'KICK_MMA'
              : attackType === 'kick_back'
                ? 'KICK_BACK'
                : attackType === 'kick_low'
                  ? 'KICK_LOW'
                  : attackType === 'kick_flying'
                    ? 'KICK_FLYING'
                    : isKick
                      ? 'KICK'
                      : 'PUNCH';

    const baseDamage = isKick ? CPU_KICK_DAMAGE : CPU_PUNCH_DAMAGE;
    const damage = Math.max(
      4,
      Math.round(baseDamage * this.cpuAi.getDamageMultiplier(this.difficulty))
    );

    this.physics.setMoveInput(attackerId, 0, 0);
    this.physics.setLocomotionState(attackerId, false, null);
    this.sound.playWhoosh(isKick ? 0.9 : 1.08);
    attackerAnim.transitionTo(attackAnimState, 0.06, true);
    this.physics.applyDirectionalImpulse(attackerId, defenderId, isKick ? 2.5 : 2.1);

    const impactDelayMs = this.getStrikeImpactDelayMs(attackerId, isKick);

    this.scheduleUnscaled(() => {
      if (
        this.isCinematicActive ||
        this.disposed ||
        this.gameManager.isControlsLocked() ||
        attackerId !== this.opponentCharacter ||
        defenderId !== this.selectedCharacter
      ) {
        return;
      }

      const currentState = defenderAnim.getState();
      if (this.isFighterDownOrDead(currentState)) return;

      const hit = this.physics.resolveStrike(attackerId, defenderId, attackType, damage);
      if (!hit) return;

      if (FIGHTER_META[defenderId].isBossInfinite) {
        // Real Boss armor shrugs off CPU strikes without damage or hit-stun
        this.gameManager.addSignatureCharge(this.getSlotForFighter(defenderId), 10);
        this.flashTintFeedback(defenderRig, 0xffd426, 0.5, 0.2);
        this.effects.spawnPunchImpact(hit.impactPoint, 0, 'UNBREAKABLE! 👑');
        this.sound.playPunchHit(1);
        if (this.canShowCpuQuip()) {
          this.setQuip(
            FIGHTER_META[attackerId].displayName,
            attackerId === 'modiji' ? 'My spectacles!! Pure steel Boss!! 😵' : 'Zero effect on the Boss!',
            false
          );
          this.syncHUD();
        }
        return;
      }

      const isBlocked = this.isFighterBlocking(defenderId);
      if (isBlocked) {
        this.applyBlockedStrikeHit(defenderId, attackerId, defenderRig, defenderAnim, hit.impactPoint, damage, {
          knockback: isKick ? -2.6 : -1.8,
        });
        return;
      }

      let hitType: 'head' | 'stomach' | 'rib' | 'body' | 'big' | 'legs' | 'groin' | 'car' = 'head';
      let label: string | undefined = undefined;

      if (attackType === 'kick_flying') {
        hitType = 'big';
        label = 'FLYING KICK!';
      } else if (attackType === 'kick_mma') {
        hitType = 'big';
        label = 'ROUNDHOUSE!';
      } else if (attackType === 'kick_back') {
        hitType = 'stomach';
        label = 'SPIN KICK!';
      } else if (attackType === 'kick_low') {
        hitType = 'groin';
        label = 'GROIN KICK!';
      } else if (isKick) {
        hitType = 'stomach';
        label = 'POW!';
      } else if (attackType === 'punch_hook') {
        hitType = 'head';
        label = 'HOOK!';
      } else if (attackType === 'punch_combo') {
        hitType = 'big';
        label = 'FLURRY!';
      } else if (attackType === 'punch_elbow') {
        hitType = 'rib';
        label = 'ELBOW!';
      } else {
        hitType = 'head';
      }

      this.applyNonBossStrikeHit(defenderId, attackerId, defenderRig, defenderAnim, hit.impactPoint, damage, {
        knockback: isKick ? -5.2 : -3.8,
        jitter: 1.1,
        label,
        comboNote: isKick ? 3 : 1,
        shakeIntensity: isKick ? 0.16 : 0.11,
        shakeDuration: 0.18,
        hitType,
      });

      if (this.canShowCpuQuip()) {
        const speaker = FIGHTER_META[attackerId].displayName;
        const pool = STRIKE_QUIP_MAP[attackerId];
        const quip = pool[this.quipIndex % pool.length];
        this.quipIndex += 1;
        this.setQuip(speaker, quip, false);
      }

      this.applyDamageToFighter(defenderId, attackerId, damage, false, false);
    }, impactDelayMs);
  }

  private cancelChinuEntry(): void {
    if (this.chinuEntryTween) {
      this.chinuEntryTween.kill();
      this.chinuEntryTween = undefined;
    }
  }

  private resetPriyanshuAdmire(): void {
    const priyanshuAnim = this.anims.get('priyanshu');
    if (priyanshuAnim?.getState() === 'ADMIRE') {
      this.physics.setLocomotionState('priyanshu', false, null);
      priyanshuAnim.transitionTo('IDLE', 0.14);
    }
  }

  private triggerPriyanshuAdmireOnChinuPose(): void {
    if (this.leftFighterId !== 'priyanshu' && this.rightFighterId !== 'priyanshu') return;
    const priyanshuAnim = this.anims.get('priyanshu');
    if (!priyanshuAnim) return;
    if (this.selectedCharacter === 'priyanshu' && priyanshuAnim.getState() !== 'IDLE') {
      return;
    }
    if (this.opponentCharacter === 'priyanshu') {
      this.cpuAi.onCpuInterrupted(performance.now(), 600);
    }
    // Priyanshu specifically drops into calm admiring idle (priyanshu-idle-1.glb) when Chinu poses
    this.physics.setKnockedDown('priyanshu', false);
    this.physics.setMoveInput('priyanshu', 0, 0);
    this.physics.setLocomotionState('priyanshu', false, null);
    priyanshuAnim.transitionTo('ADMIRE', 0.14, true);
  }

  private getPoseVisualMeta(
    fighterId: CharacterId,
    state: CpuPoseState
  ): { customYaw: number | null; sparkleY: number } {
    if (state === 'DANCE') return { customYaw: -0.1, sparkleY: 1.65 };
    if (state === 'CHAMP_POSE') return { customYaw: 0.25, sparkleY: 1.75 };
    if (state === 'LOUNGE') return { customYaw: 0.18, sparkleY: 0.55 };
    return { customYaw: null, sparkleY: fighterId === 'priyanshu' ? 0.65 : 1.55 };
  }

  private triggerCpuPose(cpuId: CharacterId, state: CpuPoseState): void {
    if (this.isCinematicActive || this.disposed || cpuId !== this.opponentCharacter) return;

    const cpuRig = this.rigs.get(cpuId);
    const cpuAnim = this.anims.get(cpuId);
    if (!cpuRig || !cpuAnim || !cpuAnim.hasState(state)) return;

    const meta = this.getPoseVisualMeta(cpuId, state);
    this.physics.setKnockedDown(cpuId, false);
    this.physics.setMoveInput(cpuId, 0, 0);
    this.physics.setLocomotionState(cpuId, false, meta.customYaw);
    cpuAnim.transitionTo(state, 0.12, true);

    if (cpuId === 'chinu') {
      this.triggerPriyanshuAdmireOnChinuPose();
    }

    this.effects.spawnBossFlexSparkle(cpuRig.root.position.clone().setY(meta.sparkleY));

    if (this.canShowCpuQuip()) {
      const speaker = FIGHTER_META[cpuId].displayName;
      let quip = 'Staying sharp in the ring! 💪';
      if (cpuId === 'priyanshu') {
        quip =
          state === 'LOUNGE'
            ? 'Just lounging like your Ring Champ! 😎🛋️'
            : '200 pushups daily—never skipping! 💪🔥';
      } else if (cpuId === 'chinu') {
        quip =
          state === 'DANCE'
            ? 'Boss cardio footwork! 💃🥊'
            : state === 'CHAMP_POSE'
              ? 'Born to reign this ring! 🏆👑'
              : 'Just chilling like the Real Boss 😎✨';
      } else if (cpuId === 'modiji') {
        quip =
          state === 'DANCE'
            ? 'Victory cheer for the crowd!! 🙌✨'
            : 'Aerial flip style!! 🤸🔥';
      } else if (cpuId === 'trump') {
        quip =
          state === 'DANCE'
            ? 'Tremendous flex!! Look at those biceps!! 💪🔥'
            : 'Nobody taunts better than me!! 😤👑';
      } else if (cpuId === 'putin') {
        quip =
          state === 'DANCE'
            ? 'Sambo rhythm ready!! 🥊♟️'
            : 'Checkmate begins with posture!! 🫡🔥';
      } else if (cpuId === 'amitabh') {
        quip =
          state === 'DANCE'
            ? 'Shahenshah ka swag!! 👑✨'
            : 'Hum jahan khade hote hain, line wahin se shuru hoti hai! ⚡';
      }
      this.setQuip(speaker, quip, false);
      this.syncHUD();
    }
  }

  private triggerChinuShowboatPose(
    state: 'POSE' | 'DANCE' | 'CHAMP_POSE',
    customYaw: number | null,
    sparkleHeight: number,
    quipText: string,
    sparklePoint?: THREE.Vector3
  ): void {
    if (this.isCinematicActive || this.selectedCharacter !== 'chinu') return;

    const chinuRig = this.rigs.get('chinu');
    const chinuAnim = this.anims.get('chinu');
    if (!chinuRig || !chinuAnim || !chinuAnim.hasState(state)) return;

    this.cancelChinuEntry();
    this.physics.setKnockedDown('chinu', false);
    this.physics.setMoveInput('chinu', 0, 0);
    this.physics.setLocomotionState('chinu', false, customYaw);
    this.sound.playClick();
    chinuAnim.transitionTo(state, 0.1, true);

    this.triggerPriyanshuAdmireOnChinuPose();

    this.effects.spawnBossFlexSparkle(
      sparklePoint ?? chinuRig.root.position.clone().setY(sparkleHeight)
    );
    this.setQuip(FIGHTER_META.chinu.displayName, quipText);
    this.syncHUD();
  }

  /**
   * Native GLB pose/flex emote (`chinu-cheer-1.glb`, `priyanshu-pushups.glb`, `modiji-cheer-1.glb`, or `trump-cheer-1.glb`).
   */
  public triggerPoseAction(sparklePoint?: THREE.Vector3): void {
    if (this.isCinematicActive || this.gameManager.isControlsLocked()) return;

    if (this.selectedCharacter === 'chinu') {
      this.triggerChinuShowboatPose(
        'POSE',
        null,
        1.55,
        'Just chilling like the real boss 😎✨',
        sparklePoint
      );
      return;
    }

    const activeRig = this.rigs.get(this.selectedCharacter);
    const activeAnim = this.anims.get(this.selectedCharacter);
    if (!activeRig || !activeAnim || !activeAnim.hasState('POSE')) return;

    this.physics.setKnockedDown(this.selectedCharacter, false);
    this.physics.setMoveInput(this.selectedCharacter, 0, 0);
    this.physics.setLocomotionState(this.selectedCharacter, false, null);
    this.sound.playClick();
    activeAnim.transitionTo('POSE', 0.08, true);

    const poseConfig: Record<
      Exclude<CharacterId, 'chinu'>,
      { sparkleY: number; quip: string }
    > = {
      modiji: { sparkleY: 1.65, quip: 'Wait for the aerial flip!! 🤸🔥' },
      trump: { sparkleY: 1.65, quip: 'Nobody strikes a pose better than me!! 😤👑' },
      putin: { sparkleY: 1.65, quip: 'Strategic victory cheer!! ♟️🔥' },
      priyanshu: { sparkleY: 0.65, quip: '200 pushups daily! 💪🔥' },
      amitabh: { sparkleY: 1.8, quip: 'Rishte mein toh hum tumhare baap lagte hain!! 👑🔥' },
    };
    const cfg = poseConfig[this.selectedCharacter];
    this.effects.spawnBossFlexSparkle(
      sparklePoint ?? activeRig.root.position.clone().setY(cfg.sparkleY)
    );
    this.setQuip(FIGHTER_META[this.selectedCharacter].displayName, cfg.quip);
    this.syncHUD();
  }

  private triggerShowcaseDance(
    fighterId: 'modiji' | 'trump' | 'putin' | 'amitabh',
    customYaw: number,
    quipText: string,
    sparklePoint?: THREE.Vector3
  ): void {
    const rig = this.rigs.get(fighterId);
    const anim = this.anims.get(fighterId);
    if (!rig || !anim || !anim.hasState('DANCE')) return;

    this.physics.setKnockedDown(fighterId, false);
    this.physics.setMoveInput(fighterId, 0, 0);
    this.physics.setLocomotionState(fighterId, false, customYaw);
    this.sound.playClick();
    anim.transitionTo('DANCE', 0.1, true);
    this.effects.spawnBossFlexSparkle(sparklePoint ?? rig.root.position.clone().setY(1.65));
    this.setQuip(FIGHTER_META[fighterId].displayName, quipText);
    this.syncHUD();
  }

  /**
   * Secondary pose shortcut (`KeyL`): Priyanshu Lounge Pose, Chinu Boxer Dance,
   * Modiji Victory Cheer, or Pope Grump Arm Flex.
   */
  public triggerSecondaryPoseAction(sparklePoint?: THREE.Vector3): void {
    if (this.isCinematicActive || this.gameManager.isControlsLocked()) return;
    if (this.selectedCharacter === 'chinu') {
      this.triggerChinuShowboatPose(
        'DANCE',
        -0.1,
        1.65,
        'Float like a butterfly, sting like the Boss! 💃🥊',
        sparklePoint
      );
      return;
    }
    if (this.selectedCharacter === 'modiji') {
      this.triggerShowcaseDance(
        'modiji',
        0.15,
        'Thank you, thank you, Mitron!! 🙌🔥',
        sparklePoint
      );
      return;
    }
    if (this.selectedCharacter === 'trump') {
      this.triggerShowcaseDance(
        'trump',
        0.12,
        'Tremendous guns!! Best flex in history!! 💪👑',
        sparklePoint
      );
      return;
    }
    if (this.selectedCharacter === 'putin') {
      this.triggerShowcaseDance(
        'putin',
        0.14,
        'Calculated Sambo stance!! 🫡🔥',
        sparklePoint
      );
      return;
    }
    if (this.selectedCharacter === 'amitabh') {
      this.triggerShowcaseDance(
        'amitabh',
        0.1,
        'Shahenshah ka swag!! 👑✨',
        sparklePoint
      );
      return;
    }
    this.triggerLoungePoseAction(sparklePoint);
  }

  /**
   * Chinu's Champion Fist-Pump Stance (`chinu-idle-2.glb`, KeyV).
   */
  public triggerChinuChampPoseAction(sparklePoint?: THREE.Vector3): void {
    this.triggerChinuShowboatPose(
      'CHAMP_POSE',
      0.25,
      1.75,
      'Born to reign this ring! 🏆👑',
      sparklePoint
    );
  }

  public triggerRingEntryAction(fromStartCorner = false): void {
    if (this.isCinematicActive || (!fromStartCorner && this.gameManager.isControlsLocked())) return;

    const actorId = this.selectedCharacter;
    const actorRig = this.rigs.get(actorId);
    const actorAnim = this.anims.get(actorId);
    if (!actorRig || !actorAnim) return;
    if (!actorAnim.hasState('ENTRY')) {
      if (actorId === 'chinu' && !fromStartCorner) {
        this.pendingChinuEntry = true;
      }
      return;
    }

    if (actorId === 'chinu') {
      this.pendingChinuEntry = false;
    }
    this.cancelChinuEntry();
    this.physics.setKnockedDown(actorId, false);
    this.physics.setMoveInput(actorId, 0, 0);
    this.physics.setLocomotionState(actorId, false, null);

    let startX = -2.05;
    let startZ = 0;
    let targetX = -1.15;
    let targetZ = 0;

    if (!fromStartCorner) {
      const actorPos = this.physics.getBodyPosition(actorId);
      const oppPos = this.physics.getBodyPosition(this.opponentCharacter);
      if (actorPos && oppPos) {
        startX = actorPos.x;
        startZ = actorPos.z;
        const delta = oppPos.clone().sub(actorPos).setY(0);
        const dist = delta.length();
        const stride = THREE.MathUtils.clamp(dist - 0.85, 0, 1.15);
        if (dist > 0.001 && stride > 0) {
          delta.normalize();
          targetX = THREE.MathUtils.clamp(startX + delta.x * stride, -2.15, 2.15);
          targetZ = THREE.MathUtils.clamp(startZ + delta.z * stride, -2.15, 2.15);
        } else {
          targetX = startX;
          targetZ = startZ;
        }
      }
    } else {
      this.physics.setBodyPositionXZ(actorId, startX, startZ);
    }

    this.sound.playWhoosh(0.95);
    actorAnim.transitionTo('ENTRY', 0.08, true);

    const glide = { x: startX, z: startZ };
    this.chinuEntryTween = gsap.to(glide, {
      x: targetX,
      z: targetZ,
      duration: 0.95,
      ease: 'power2.out',
      onUpdate: () => {
        if (!this.isCinematicActive && !this.disposed) {
          this.physics.setBodyPositionXZ(actorId, glide.x, glide.z);
        }
      },
      onComplete: () => {
        this.chinuEntryTween = undefined;
      },
    });

    this.effects.spawnBossFlexSparkle(
      actorRig.root.position.clone().set(targetX, 1.15, targetZ)
    );
    const entryQuips: Record<CharacterId, string> = {
      chinu: 'Here comes the Real Boss!! 🐆🔥',
      modiji: 'Laser Titan has landed!! ⚡🔥',
      trump: `${FIGHTER_META.trump.displayName} blesses the ring!! 👑🔥`,
      putin: `${FIGHTER_META.putin.displayName} enters with a 20m table!! 🪑🔥`,
      priyanshu: `${FIGHTER_META.priyanshu.displayName} drops into the ring!! 🔥`,
      amitabh: `${FIGHTER_META.amitabh.displayName} steps in: Hum jahan khade hote hain, line wahin se shuru hoti hai! 👑🔥`,
    };
    this.setQuip(FIGHTER_META[actorId].displayName, entryQuips[actorId]);
    this.syncHUD();
  }

  /**
   * Pre-Fight Greeting Sequence:
   * Both fighters face each other at match start and perform a respectful martial arts bow:
   * - Combo 1: Formal - Formal Bow (both fighters formal bow)
   * - Combo 2: Formal - Informal Bow (challenger formal bow vs opponent informal bow)
   * - Combo 3: Informal - Formal Bow (challenger informal bow vs opponent formal bow)
   * - Combo 4: Informal - Informal Bow (both fighters informal bow)
   * Note: Strictly bows facing each other; no handshakes.
   */
  public triggerPreFightGreetingSequence(roundNumber: number): void {
    if (this.disposed) return;
    const leftId = this.leftFighterId;
    const rightId = this.rightFighterId;
    const leftAnim = this.anims.get(leftId);
    const rightAnim = this.anims.get(rightId);
    const leftRig = this.rigs.get(leftId);
    const rightRig = this.rigs.get(rightId);

    if (!leftAnim || !rightAnim || !leftRig || !rightRig) return;

    // Keep rig.root rotation strictly at identity (0, 0, 0)
    leftRig.root.rotation.set(0, 0, 0);
    rightRig.root.rotation.set(0, 0, 0);

    // Left fighter at -X faces +X (Math.PI / 2); Right fighter at +X faces -X (-Math.PI / 2)
    leftRig.modelRoot.rotation.set(0, Math.PI / 2, 0);
    rightRig.modelRoot.rotation.set(0, -Math.PI / 2, 0);

    // Lock facing during greeting in physics system so characters don't drift or fight
    this.physics.setLocomotionState(leftId, false, Math.PI / 2);
    this.physics.setLocomotionState(rightId, false, -Math.PI / 2);

    // Respectful bow combos strictly (formal-formal, formal-informal, informal-formal, informal-informal)
    const comboPool: ReadonlyArray<[FighterState, FighterState]> = [
      ['BOW_FORMAL', 'BOW_FORMAL'],
      ['BOW_FORMAL', 'BOW_INFORMAL'],
      ['BOW_INFORMAL', 'BOW_FORMAL'],
      ['BOW_INFORMAL', 'BOW_INFORMAL'],
    ];
    const comboIndex = Math.abs(roundNumber + leftId.charCodeAt(0) + rightId.charCodeAt(0)) % comboPool.length;
    const [desiredLeft, desiredRight] = comboPool[comboIndex];

    const leftGreet: FighterState = leftAnim.hasState(desiredLeft)
      ? desiredLeft
      : leftAnim.hasState('BOW_FORMAL')
        ? 'BOW_FORMAL'
        : leftAnim.hasState('BOW_INFORMAL')
          ? 'BOW_INFORMAL'
          : 'IDLE';

    const rightGreet: FighterState = rightAnim.hasState(desiredRight)
      ? desiredRight
      : rightAnim.hasState('BOW_FORMAL')
        ? 'BOW_FORMAL'
        : rightAnim.hasState('BOW_INFORMAL')
          ? 'BOW_INFORMAL'
          : 'IDLE';

    // Camera starts framed in medium two-shot covering both bowing fighters, then zooms out as FIGHT! is called
    this.sceneManager.triggerGreetingCinematic(leftRig.root.position, rightRig.root.position, 1.85, 0.95);

    // Play greeting bow animations
    leftAnim.transitionTo(leftGreet, 0.18, true);
    rightAnim.transitionTo(rightGreet, 0.18, true);

    // Smoothly transition back to combat IDLE and unlock yaw as FIGHT! announcement begins
    this.scheduleUnscaled(() => {
      // Release custom yaw locks so dynamic combat facing resumes
      this.physics.setLocomotionState(leftId, false, null);
      this.physics.setLocomotionState(rightId, false, null);

      const state = this.gameManager.getState();
      if (state === 'INTRO' || state === 'FIGHTING') {
        leftAnim.transitionTo('IDLE', 0.22, true);
        rightAnim.transitionTo('IDLE', 0.22, true);
      }
    }, 2050);
  }

  /**
   * Chinu's crouched prowl Ring Entry stride (`chinu-entry.glb`, KeyE or character switch).
   */
  public triggerChinuEntryAction(fromStartCorner = false): void {
    if (this.selectedCharacter !== 'chinu') return;
    this.triggerRingEntryAction(fromStartCorner);
  }

  /**
   * Priyanshu's dramatic floor lounge pose (`priyanshu-idle-2.glb`).
   */
  public triggerLoungePoseAction(sparklePoint?: THREE.Vector3): void {
    if (this.isCinematicActive || this.selectedCharacter !== 'priyanshu') return;

    const priyanshuRig = this.rigs.get('priyanshu');
    const priyanshuAnim = this.anims.get('priyanshu');
    if (!priyanshuRig || !priyanshuAnim) return;
    if (!priyanshuAnim.hasState('LOUNGE')) {
      this.pendingPriyanshuLounge = true;
      return;
    }

    this.pendingPriyanshuLounge = false;
    this.physics.setKnockedDown('priyanshu', false);
    this.physics.setMoveInput('priyanshu', 0, 0);
    // Angle face/chest toward front camera so the side-recline lounge reads cleanly
    this.physics.setLocomotionState('priyanshu', false, 0.18);
    this.sound.playClick();
    priyanshuAnim.transitionTo('LOUNGE', 0.16, true);

    this.effects.spawnBossFlexSparkle(
      sparklePoint ?? priyanshuRig.root.position.clone().setY(0.55)
    );
    this.setQuip(FIGHTER_META.priyanshu.displayName, 'Paint me like your Ring Champ! 😉🛋️');
    this.syncHUD();
  }

  public triggerChinuBossPose(sparklePoint?: THREE.Vector3): void {
    if (this.selectedCharacter === 'chinu') {
      this.triggerPoseAction(sparklePoint);
    }
  }

  /**
   * Directional Flurry Combo shortcut.
   */
  public triggerMuayThaiAction(): void {
    if (this.isCinematicActive || this.gameManager.isControlsLocked()) return;
    this.triggerStandardAttack(this.selectedCharacter, this.opponentCharacter, 'punch_combo');
  }

  public triggerChinuMuayThaiCombo(): void {
    if (this.isCinematicActive || this.gameManager.isControlsLocked()) return;
    this.triggerStandardAttack(this.selectedCharacter, this.opponentCharacter, 'kick_mma');
  }

  /**
   * Comical AI strike back for non-Chinu matchups (e.g., Priyanshu vs Modiji).
   */
  public triggerOpponentStrikeBack(attackerId: CharacterId, defenderId: CharacterId): void {
    if (this.isCinematicActive) return;

    const attackerAnim = this.anims.get(attackerId);
    const defenderAnim = this.anims.get(defenderId);
    const defenderRig = this.rigs.get(defenderId);
    if (!attackerAnim || !defenderAnim || !defenderRig) return;

    const defenderState = defenderAnim.getState();
    if (this.isFighterDownOrDead(defenderState)) return;

    this.sound.playCounterWindup();
    attackerAnim.transitionTo('KICK', 0.05, true);
    this.physics.applyDirectionalImpulse(attackerId, defenderId, 3.1);

    this.scheduleUnscaled(() => {
      if (this.isCinematicActive) return;
      const hit = this.physics.resolveStrike(attackerId, defenderId, 'kick', OPPONENT_STRIKE_DAMAGE);
      if (!hit) {
        return;
      }
      const impactPoint = hit.impactPoint;

      const isBlocked = this.isFighterBlocking(defenderId);
      if (isBlocked) {
        this.applyBlockedStrikeHit(defenderId, attackerId, defenderRig, defenderAnim, impactPoint, OPPONENT_STRIKE_DAMAGE, {
          knockback: -2.4,
        });
        return;
      }

      defenderAnim.transitionTo('HIT_STOMACH', 0.04, true);
      this.physics.applyDirectionalImpulse(defenderId, attackerId, -5.2);
      this.flashTintFeedback(defenderRig, 0xffd426, 0.8, 0.24);
      this.wobbleHeadOnImpact(defenderRig);
      this.effects.spawnPunchImpact(impactPoint, OPPONENT_STRIKE_DAMAGE, 'SMITE!');
      this.maybeSpawnCombatBlood(defenderId, attackerId, impactPoint, OPPONENT_STRIKE_DAMAGE);
      this.sound.playBossKickImpact();
      this.sceneManager.triggerShake(0.18, 0.24);

      const attackerQuipList = STRIKE_QUIP_MAP[attackerId];
      this.setQuip(
        FIGHTER_META[attackerId].displayName,
        attackerQuipList[this.quipIndex % attackerQuipList.length]
      );
      this.quipIndex += 1;

      this.applyDamageToFighter(defenderId, attackerId, OPPONENT_STRIKE_DAMAGE, false);
    }, 200);
  }

  /**
   * Action 1 alias preserved for Chinu punching Priyanshu/opponent.
   */
  public triggerAction1Punch(clickedPoint?: THREE.Vector3): void {
    this.triggerStandardAttack('chinu', this.opponentCharacter === 'chinu' ? 'priyanshu' : this.opponentCharacter, 'punch', clickedPoint);
  }

  /**
   * Direct Boss Kick alias.
   */
  public triggerDirectBossKick(): void {
    this.triggerStandardAttack('chinu', this.opponentCharacter === 'chinu' ? 'priyanshu' : this.opponentCharacter, 'kick');
  }

  /**
   * Priyanshu Toxic Hack Signature Move (delegated to `src/signatures/priyanshu/`).
   */
  public triggerTurboComboSignature(attackerId: CharacterId, defenderId: CharacterId): void {
    executeCharacterSignature(this.getSignatureContext(), attackerId, defenderId);
  }

  /**
   * Modiji's Laser Eyes Signature Move (delegated to `src/signatures/modiji/`).
   */
  public triggerModijiLaserSignature(targetId: CharacterId): void {
    executeCharacterSignature(this.getSignatureContext(), 'modiji', targetId);
  }

  /**
   * Chinu's Boss Spank Signature Move (delegated to `src/signatures/chinu/`).
   */
  public triggerSignatureMove(targetId: CharacterId = 'priyanshu'): void {
    executeCharacterSignature(this.getSignatureContext(), 'chinu', targetId);
  }

  /**
   * Action 2: Challenger attempts an attack -> Chinu instantly overrides with Kick ->
   * Slight action freeze + Massive comical Toast ("You can't mess with the real boss.") ->
   * Challenger falls back onto the ring mat.
   */
  public triggerAction2Counter(
    challengerId: CharacterId = 'priyanshu',
    bossId: CharacterId = 'chinu'
  ): void {
    if (this.isCinematicActive) return;

    const challengerRig = this.rigs.get(challengerId);
    const challengerAnim = this.anims.get(challengerId);
    const bossRig = this.rigs.get(bossId);
    const bossAnim = this.anims.get(bossId);
    if (!challengerRig || !challengerAnim || !bossRig || !bossAnim) return;

    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }

    this.cancelChinuEntry();
    if (bossId === 'chinu') {
      this.resetPriyanshuAdmire();
    }
    this.isCinematicActive = true;
    this.physics.setMoveInput(challengerId, 0, 0);
    this.physics.setMoveInput(bossId, 0, 0);
    this.physics.setLocomotionState(challengerId, false, null);
    this.physics.setLocomotionState(bossId, false, null);
    this.physics.setKnockedDown(challengerId, false);
    this.syncHUD();

    // 1. Challenger initiates cocky wind-up attack
    this.sound.playCounterWindup();
    challengerAnim.transitionTo('ATTEMPT_ATTACK', 0.05, true);
    this.physics.applyDirectionalImpulse(challengerId, bossId, 2.5);

    // 2. Mid-swing, Chinu instantly overrides with a devastating Kick!
    const kickStartMs = bossId === 'chinu' ? 120 : 230;
    const kickImpactMs = bossId === 'chinu' ? 490 : 420;

    this.scheduleUnscaled(() => {
      this.sound.playWhoosh(0.8);
      bossAnim.transitionTo('KICK', 0.04, true);
      this.physics.applyDirectionalImpulse(bossId, challengerId, 2.7);
    }, kickStartMs);

    // 3. Peak kick impact -> Hit-Stop Freeze + Massive Boss Toast!
    this.scheduleUnscaled(() => {
      const hit = this.physics.resolveStrike(bossId, challengerId, 'kick', COUNTER_KICK_DAMAGE);
      const impactPoint = hit
        ? hit.impactPoint
        : bossRig.root.position.clone().lerp(challengerRig.root.position, 0.5).setY(1.45);

      this.gameTimeScale = FREEZE_TIME_SCALE;

      this.flashTintFeedback(challengerRig, 0xffffff, 0.75, 0.22);
      this.wobbleHeadOnImpact(challengerRig);
      this.effects.spawnKickOverrideImpact(impactPoint, COUNTER_KICK_DAMAGE);
      this.maybeSpawnCombatBlood(challengerId, bossId, impactPoint, COUNTER_KICK_DAMAGE, 0.5);
      this.sound.playBossKickImpact();
      this.sceneManager.triggerDramaticZoom(impactPoint, FREEZE_DURATION_MS / 1000);
      this.sceneManager.triggerShake(0.26, 0.34);

      this.setQuip(
        FIGHTER_META[challengerId].displayName,
        PRIYANSHU_BOSS_QUIPS[this.quipIndex % PRIYANSHU_BOSS_QUIPS.length]
      );
      this.quipIndex += 1;

      this.ui.showBossToast("You can't mess with the real boss.");
      this.applyDamageToFighter(challengerId, bossId, COUNTER_KICK_DAMAGE, true);

      // 4. Resume full speed & launch challenger onto back
      this.scheduleUnscaled(() => {
        this.gameTimeScale = 1;
        this.physics.setKnockedDown(challengerId, true);
        const isDeadlyStrike = (this.fighterHp.get(challengerId) ?? 0) <= 0;
        const isCrouch = this.physics.isCrouching(challengerId);
        const fallState = isDeadlyStrike
          ? isCrouch && challengerAnim.hasState('CROUCH_DEATH')
            ? 'CROUCH_DEATH'
            : challengerAnim.hasState('DEAD')
              ? 'DEAD'
              : 'FALL_BACK'
          : 'FALL_BACK';
        challengerAnim.transitionTo(fallState, 0.04, true);
        this.physics.applyDirectionalImpulse(challengerId, bossId, -7.6);
        this.effects.spawnDizzyStars(challengerRig.headAnchor, 1.55);
        this.sound.playMatSlamAndDizzy();

        // 5. Challenger groggily gets back up (unless KO'd into round end)
        this.scheduleUnscaled(() => {
          const isKOd =
            (this.fighterHp.get(challengerId) ?? 0) <= 0 ||
            this.gameManager.getState() !== 'FIGHTING';
          if (!isKOd) {
            challengerAnim.transitionTo('GET_UP', 0.1, true);
          }

          this.scheduleUnscaled(() => {
            if (!isKOd) {
              this.physics.setKnockedDown(challengerId, false);
            }
            this.isCinematicActive = false;
            this.syncHUD();
          }, 520);
        }, 1450);
      }, FREEZE_DURATION_MS);
    }, kickImpactMs);
  }

  /**
   * Clicking "Heal Priyanshu 💕": Chinu glides right up to Priyanshu and kisses him
   * with 3D floating hearts, "MWAH!" burst, rosy blush, and full HP restoration!
   */
  public triggerKissHealSequence(): void {
    if (this.isCinematicActive || this.gameManager.isControlsLocked()) return;

    const chinuRig = this.rigs.get('chinu');
    const chinuAnim = this.anims.get('chinu');
    const priyanshuRig = this.rigs.get('priyanshu');
    const priyanshuAnim = this.anims.get('priyanshu');
    if (!chinuRig || !chinuAnim || !priyanshuRig || !priyanshuAnim) return;

    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }

    this.cancelChinuEntry();
    this.isCinematicActive = true;
    this.physics.setMoveInput('chinu', 0, 0);
    this.physics.setMoveInput('priyanshu', 0, 0);
    this.physics.setLocomotionState('chinu', false, null);
    this.physics.setLocomotionState('priyanshu', false, null);
    if (
      priyanshuAnim.getState() === 'LOUNGE' ||
      priyanshuAnim.getState() === 'RUN' ||
      priyanshuAnim.getState() === 'ADMIRE'
    ) {
      priyanshuAnim.transitionTo('IDLE', 0.08, true);
    }
    this.sound.playClick();
    this.syncHUD();

    const chinuNeedsStandUp =
      chinuAnim.getState() === 'FALL_BACK' ||
      chinuAnim.getState() === 'DEAD' ||
      chinuAnim.getState() === 'CROUCH_DEATH';
    if (chinuNeedsStandUp) {
      this.physics.setKnockedDown('chinu', false);
      chinuAnim.transitionTo('GET_UP', 0.08, true);
    }

    const priyanshuNeedsStandUp =
      priyanshuAnim.getState() === 'FALL_BACK' ||
      priyanshuAnim.getState() === 'DEAD' ||
      priyanshuAnim.getState() === 'CROUCH_DEATH';
    if (priyanshuNeedsStandUp) {
      this.physics.setKnockedDown('priyanshu', false);
      priyanshuAnim.transitionTo('GET_UP', 0.08, true);
    }

    const startDelay = chinuNeedsStandUp || priyanshuNeedsStandUp ? 520 : 0;

    this.scheduleUnscaled(() => {
      const chinuPos = this.physics.getBodyPosition('chinu')?.clone() ?? new THREE.Vector3(-1, 0, 0);
      const priyanshuPos =
        this.physics.getBodyPosition('priyanshu')?.clone() ?? new THREE.Vector3(1, 0, 0);

      const dirToChinu = chinuPos.clone().sub(priyanshuPos);
      dirToChinu.y = 0;
      if (dirToChinu.lengthSq() < 0.001) {
        dirToChinu.set(-1, 0, 0);
      } else {
        dirToChinu.normalize();
      }

      // 0.32m ensures when both lean forward into the embrace, their lips touch directly!
      const kissDist = 0.32;
      const kissSpotX = priyanshuPos.x + dirToChinu.x * kissDist;
      const kissSpotZ = priyanshuPos.z + dirToChinu.z * kissDist;
      const returnSpotX = priyanshuPos.x + dirToChinu.x * 2.05;
      const returnSpotZ = priyanshuPos.z + dirToChinu.z * 2.05;

      const kissCenter = new THREE.Vector3(
        (kissSpotX + priyanshuPos.x) * 0.5,
        1.52,
        (kissSpotZ + priyanshuPos.z) * 0.5
      );

      const priyanshuYaw = Math.atan2(dirToChinu.x, dirToChinu.z);
      const chinuYaw = Math.atan2(-dirToChinu.x, -dirToChinu.z);

      this.cpuAi.onCpuInterrupted(performance.now(), 4500);
      this.physics.setKinematicHold(true, 0.15);
      this.physics.setLocomotionState('chinu', false, chinuYaw);
      this.physics.setLocomotionState('priyanshu', false, priyanshuYaw);
      chinuRig.modelRoot.rotation.y = chinuYaw;
      priyanshuRig.modelRoot.rotation.y = priyanshuYaw;

      chinuAnim.transitionTo('RUN', 0.06);
      this.sceneManager.triggerRomanticCloseUp(kissCenter, dirToChinu, 3.2);

      const glideState = { x: chinuPos.x, z: chinuPos.z };
      gsap.to(glideState, {
        x: kissSpotX,
        z: kissSpotZ,
        duration: 0.45,
        ease: 'power2.out',
        onUpdate: () => {
          this.physics.setBodyPositionXZ('chinu', glideState.x, glideState.z);
        },
        onComplete: () => {
          this.physics.setBodyPositionXZ('chinu', kissSpotX, kissSpotZ);
          chinuRig.modelRoot.rotation.y = chinuYaw;
          priyanshuRig.modelRoot.rotation.y = priyanshuYaw;

          // Start synchronized kiss animations simultaneously
          chinuAnim.transitionTo('KISS', 0.12, true);
          priyanshuAnim.transitionTo('BLUSH', 0.12, true);

          // Peak kiss impact at 1850ms: Chinu on tiptoes, Priyanshu leaning down, lips meeting
          this.scheduleUnscaled(() => {
            const midpoint = chinuRig.root.position
              .clone()
              .lerp(priyanshuRig.root.position, 0.5)
              .setY(1.52);

            this.sound.playKissMwah();
            this.effects.spawnKissHealEffects(midpoint);
            this.flashTintFeedback(priyanshuRig, 0xff5e99, 0.65, 1.2);
            this.flashTintFeedback(chinuRig, 0xff87b2, 0.5, 0.9);

            this.setQuip(
              FIGHTER_META.priyanshu.displayName,
              PRIYANSHU_KISS_QUIPS[this.quipIndex % PRIYANSHU_KISS_QUIPS.length]
            );
            this.quipIndex += 1;
            this.resetFighterHPState('priyanshu');
          }, 1850);

          // Embrace gently releases around 3200ms -> Chinu steps back to fighting stance
          this.scheduleUnscaled(() => {
            const stepBack = { x: kissSpotX, z: kissSpotZ };
            gsap.to(stepBack, {
              x: returnSpotX,
              z: returnSpotZ,
              duration: 0.55,
              ease: 'power2.inOut',
              onUpdate: () => {
                this.physics.setBodyPositionXZ('chinu', stepBack.x, stepBack.z);
              },
              onComplete: () => {
                this.physics.setLocomotionState('chinu', false, null);
                this.physics.setLocomotionState('priyanshu', false, null);
                this.physics.setKinematicHold(false);
                this.isCinematicActive = false;
                this.cpuAi.onCpuInterrupted(performance.now(), 1200);
                this.syncHUD();
              },
            });
          }, 3200);
        },
      });
    }, startDelay);
  }

  /**
   * Non-Chinu Heal / Rematch restore for active finite fighters (e.g., Priyanshu vs Modiji).
   */
  public triggerMatchHealReset(): void {
    if (this.isCinematicActive || this.gameManager.isControlsLocked()) return;

    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }

    this.sound.playKissMwah();
    this.gameManager.refillHealth(undefined, 0.35);
    this.aggressionHits.clear();
    this.effects.clearBloodDecals();
    for (const id of [this.leftFighterId, this.rightFighterId]) {
      const rig = this.rigs.get(id);
      const anim = this.anims.get(id);
      if (!FIGHTER_META[id].isBossInfinite) {
        this.fighterHp.set(id, FIGHTER_MAX_HP);
      }
      if (rig) {
        this.effects.spawnBossFlexSparkle(rig.root.position.clone().setY(1.5));
        this.flashTintFeedback(rig, 0x34d399, 0.45, 0.7);
      }
      if (
        anim &&
        (anim.getState() === 'FALL_BACK' ||
          anim.getState() === 'DEAD' ||
          anim.getState() === 'CROUCH_DEATH')
      ) {
        this.physics.setKnockedDown(id, false);
        anim.transitionTo('GET_UP', 0.08, true);
      }
    }

    this.ui.showKOBanner(false);
    this.syncHUD();
  }

  private recordHitQuip(defenderId: CharacterId): void {
    const quips = HIT_QUIP_MAP[defenderId];
    this.setQuip(
      FIGHTER_META[defenderId].displayName,
      resolveQuipText(quips[this.quipIndex % quips.length])
    );
    this.quipIndex += 1;
  }

  private applyDamageToFighter(
    defenderId: CharacterId,
    _attackerId: CharacterId,
    damage: number,
    _fromCinematic: boolean,
    countCombo = true
  ): void {
    if (FIGHTER_META[defenderId].isBossInfinite) return;
    if (this.gameManager.getState() !== 'FIGHTING') return;

    const prevHp = this.fighterHp.get(defenderId) ?? FIGHTER_MAX_HP;
    if (prevHp <= 0) return;

    if (countCombo) {
      this.comboHits += 1;
      if (this.comboHits === 4 || this.comboHits === 8) {
        this.sound.playComboVoice();
      }
      this.stressReliefPercent = Math.min(
        100,
        this.stressReliefPercent + Math.round(damage * 0.65)
      );
    }

    const nextHp = this.gameManager.applyDamage(this.getSlotForFighter(defenderId), damage);
    this.fighterHp.set(defenderId, Math.round(nextHp));
    this.syncHUD();
  }

  private resetFighterHPState(id: CharacterId): void {
    const state = this.gameManager.getState();
    if (state === 'ROUND_END' || state === 'MATCH_OVER') {
      return;
    }
    if (!FIGHTER_META[id].isBossInfinite) {
      this.fighterHp.set(id, FIGHTER_MAX_HP);
      this.aggressionHits.delete(id);
      this.gameManager.refillHealth(this.getSlotForFighter(id), 0.35);
    }
    this.ui.showKOBanner(false);
    this.syncHUD();
  }

  private restoreFighterHpPercent(
    id: CharacterId,
    percent: number
  ): { restored: number; nextHp: number; maxHp: number } {
    if (FIGHTER_META[id].isBossInfinite) {
      return { restored: 0, nextHp: FIGHTER_MAX_HP, maxHp: FIGHTER_MAX_HP };
    }
    const current = this.fighterHp.get(id) ?? FIGHTER_MAX_HP;
    const delta = Math.round(FIGHTER_MAX_HP * THREE.MathUtils.clamp(percent, 0, 1));
    const nextHp = this.gameManager.healPlayer(this.getSlotForFighter(id), delta);
    this.fighterHp.set(id, Math.round(nextHp));
    if (nextHp > current) {
      this.aggressionHits.delete(id);
    }
    this.syncHUD();
    return {
      restored: Math.round(nextHp - current),
      nextHp: Math.round(nextHp),
      maxHp: FIGHTER_MAX_HP,
    };
  }

  private wobbleHeadOnImpact(rig: FighterRig): void {
    const head = rig.headVisualGroup;
    if (!head) return;
    gsap.killTweensOf(head.rotation);
    gsap.killTweensOf(head.scale);
    gsap.fromTo(
      head.rotation,
      { z: (Math.random() > 0.5 ? 1 : -1) * 0.28 },
      { z: 0, duration: 0.55, ease: 'elastic.out(1.2, 0.35)' }
    );
    gsap.fromTo(
      head.scale,
      { x: 1.18, y: 0.84, z: 1.12 },
      { x: 1, y: 1, z: 1, duration: 0.45, ease: 'elastic.out(1.2, 0.4)' }
    );
  }

  private flashTintFeedback(
    rig: FighterRig,
    hexColor: number,
    intensity: number,
    duration: number
  ): void {
    const materials = new Set(
      rig.bodyMeshes.map((mesh) => mesh.material as THREE.MeshStandardMaterial)
    );

    for (const mat of materials) {
      if (!mat.emissive) continue;
      gsap.killTweensOf(mat);
      mat.emissive.setHex(hexColor);
      mat.emissiveIntensity = intensity;
      gsap.to(mat, {
        emissiveIntensity: 0,
        duration,
        ease: 'power2.out',
        onComplete: () => {
          mat.emissive.setHex(0x000000);
        },
      });
    }
  }

  private buildFighterHUDInfo(id: CharacterId) {
    const meta = FIGHTER_META[id];
    const roleTag = meta.isBossInfinite
      ? 'REAL BOSS'
      : id === this.selectedCharacter
        ? 'CHALLENGER'
        : meta.defaultTag;
    return {
      id,
      displayName: meta.displayName,
      roleTag,
      isBossInfinite: meta.isBossInfinite,
      hp: this.fighterHp.get(id) ?? FIGHTER_MAX_HP,
      maxHp: FIGHTER_MAX_HP,
    };
  }

  /** Sets CPU AI difficulty tier (`easy`, `medium`, `hard`). */
  public setDifficulty(level: DifficultyLevel): void {
    if (level === this.difficulty) return;
    this.difficulty = level;
    this.cpuAi.setDifficulty(level);
    this.sound.playClick();
    this.syncHUD();
  }

  /** Switches the active 3D stage GLB in the fight arena (defers download while Select screen is open). */
  public setStage(stageId: string): void {
    const normalized = stageId.toLowerCase();
    if (normalized === this.activeStageId) return;
    this.activeStageId = normalized;
    this.sound.playClick();
    if (!this.ui.isModalOpen()) {
      void this.prepareStageSwitchWithLoader(normalized);
    }
    this.syncHUD();
  }

  private syncHUD(): void {
    if (!this.gameManager) return;
    const humanSlot = this.getSlotForFighter(this.selectedCharacter);
    this.ui.renderState({
      selectedCharacter: this.selectedCharacter,
      opponentCharacter: this.opponentCharacter,
      leftFighter: this.buildFighterHUDInfo(this.leftFighterId),
      rightFighter: this.buildFighterHUDInfo(this.rightFighterId),
      comboHits: this.comboHits,
      stressReliefPercent: this.stressReliefPercent,
      targetQuip: this.targetQuip,
      targetQuipSpeaker: this.targetQuipSpeaker,
      isMuted: this.sound.isMuted(),
      isCounterSequenceActive: this.isCinematicActive,
      isModalOpen: this.ui.isModalOpen(),
      difficulty: this.difficulty,
      matchState: this.gameManager.getState(),
      controlsLocked: this.gameManager.isControlsLocked(),
      playerSignatureCharge: this.gameManager.getSignatureCharge(humanSlot),
      isSignatureReady: this.gameManager.isSignatureReady(humanSlot),
      activeStageId: this.activeStageId,
      availableStageIds: this.availableStageIds,
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.matchLoadToken++;
    this.unsubscribeAssetProgress?.();
    this.unsubscribeAssetProgress = undefined;
    this.ui.setMatchLoaderState(false);
    this.ui.hideInitialLoader();
    this.gameManager.dispose();
    this.cancelChinuEntry();
    this.clearTransientDisposables();
    cancelAnimationFrame(this.animFrameId);
    for (const id of this.activeTimeouts) {
      clearTimeout(id);
    }
    for (const anim of this.anims.values()) {
      anim.dispose();
    }
    this.anims.clear();
    for (const rig of this.rigs.values()) {
      CharacterFactory.disposeRig(rig, true);
    }
    this.rigs.clear();
    CharacterFactory.disposeAllCachedModels();
    disposeCachedCyberpunkLaptop();
    sharedAnimationManager.dispose();
    disposeAssetLoadingHub();
    this.stageManager.dispose();
    this.selectStage.dispose();
    this.ui.dispose();
    this.effects.dispose();
    this.sceneManager.dispose();
  }
}
