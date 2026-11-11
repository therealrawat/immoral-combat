import * as THREE from 'three';
import gsap from 'gsap';

export type GameState = 'INIT' | 'INTRO' | 'FIGHTING' | 'ROUND_END' | 'MATCH_OVER';
export type PlayerSlot = 'player1' | 'player2';
export type AnnouncementVariant = 'round' | 'fight' | 'ko' | 'time-over' | 'win';

export interface FighterParticipantConfig {
  id?: string;
  name: string;
  mesh?: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  fallAction?: THREE.AnimationAction;
  idleAction?: THREE.AnimationAction;
  onPlayFall?: () => void;
  onPlayIdle?: () => void;
  onResetPosition?: () => void;
  onSignatureMove?: (opponent: FighterParticipantConfig) => void;
  homePosition?: THREE.Vector3;
  homeRotationY?: number;
  maxHealth?: number;
  invulnerable?: boolean;
}

export interface HUDPlayerElements {
  healthBar?: HTMLElement | null;
  healthTrail?: HTMLElement | null;
  healthText?: HTMLElement | null;
  roundIndicators?: Array<HTMLElement | null>;
  signatureMeter?: HTMLElement | null;
  signatureFill?: HTMLElement | null;
  signaturePrompt?: HTMLElement | null;
  signaturePercentText?: HTMLElement | null;
}

export interface GameHUDElements {
  timer?: HTMLElement | null;
  announcementContainer?: HTMLElement | null;
  announcementTitle?: HTMLElement | null;
  announcementSub?: HTMLElement | null;
  rematchButton?: HTMLElement | null;
  player1?: HUDPlayerElements;
  player2?: HUDPlayerElements;
}

export interface RoundEndResult {
  roundNumber: number;
  winner: PlayerSlot | 'draw';
  reason: 'ko' | 'time_over';
  wins: Record<PlayerSlot, number>;
}

export interface GameManagerCallbacks {
  onStateChange?: (nextState: GameState, prevState: GameState) => void;
  onControlsLockChange?: (locked: boolean) => void;
  onTimerTick?: (secondsRemaining: number) => void;
  onHealthChange?: (player: PlayerSlot, hp: number, maxHp: number) => void;
  onSignatureChargeChange?: (player: PlayerSlot, charge: number, isReady: boolean) => void;
  onRoundStart?: (roundNumber: number) => void;
  onRoundEnd?: (result: RoundEndResult) => void;
  onMatchOver?: (winner: PlayerSlot | 'draw', wins: Record<PlayerSlot, number>) => void;
  onRoundReset?: (roundNumber: number) => void;
  onSlowMoChange?: (active: boolean) => void;
  onAnnouncementPhase?: (phase: AnnouncementVariant, title: string, subtitle: string) => void;
}

export interface GameManagerOptions {
  player1: FighterParticipantConfig;
  player2: FighterParticipantConfig;
  hud?: GameHUDElements | null;
  callbacks?: GameManagerCallbacks;
  roundDurationSeconds?: number;
  roundsToWin?: number;
  damageToSignatureGain?: number;
  passiveSignaturePerSecond?: number;
  introDurationSeconds?: number;
  koResetDelayMs?: number;
  slowMoDurationMs?: number;
  slowMoFps?: number;
  normalFps?: number;
}

interface FighterRuntimeState {
  slot: PlayerSlot;
  config: FighterParticipantConfig;
  health: number;
  maxHealth: number;
  roundWins: number;
  signatureCharge: number;
  homePosition: THREE.Vector3;
  homeRotationY: number;
  signaturePulseTween?: gsap.core.Tween;
  signatureFillTween?: gsap.core.Tween;
  healthTween?: gsap.core.Tween;
  trailTween?: gsap.core.Tween;
}

const DEFAULT_ROUND_DURATION = 99;
const DEFAULT_ROUNDS_TO_WIN = 2;
const DEFAULT_SIGNATURE_GAIN_ON_DAMAGE = 10;
const DEFAULT_INTRO_DURATION_SEC = 3;
const DEFAULT_KO_RESET_DELAY_MS = 4000;
const DEFAULT_SLOW_MO_DURATION_MS = 1400;
const DEFAULT_SLOW_MO_FPS = 15;
const DEFAULT_NORMAL_FPS = 240;
const SIGNATURE_PROMPT_TEXT = 'Press F for Signature Move';

/**
 * Decoupled Best-of-3 fighting game loop, state machine, timer,
 * GSAP health/K.O. controller, and Signature Meter manager.
 */
export class GameManager {
  private readonly hud: GameHUDElements;
  private readonly callbacks: GameManagerCallbacks;

  private readonly roundDurationSeconds: number;
  private readonly roundsToWin: number;
  private readonly damageToSignatureGain: number;
  private readonly passiveSignaturePerSecond: number;
  private readonly introDurationSeconds: number;
  private readonly koResetDelayMs: number;
  private readonly slowMoDurationMs: number;
  private readonly slowMoFps: number;
  private readonly normalFps: number;

  private readonly players: Record<PlayerSlot, FighterRuntimeState>;

  private state: GameState = 'INIT';
  private controlsLocked = true;
  private paused = false;
  private slowMoActive = false;
  private roundNumber = 1;
  private timeRemaining: number;
  private disposed = false;

  private timerIntervalId: ReturnType<typeof setInterval> | null = null;
  private slowMoTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private postRoundTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private introTimeline?: gsap.core.Timeline;
  private announcementTween?: gsap.core.Timeline | gsap.core.Tween;

  constructor(options: GameManagerOptions) {
    this.hud = options.hud ?? {};
    this.callbacks = options.callbacks ?? {};

    this.roundDurationSeconds = Math.max(1, options.roundDurationSeconds ?? DEFAULT_ROUND_DURATION);
    this.roundsToWin = Math.max(1, options.roundsToWin ?? DEFAULT_ROUNDS_TO_WIN);
    this.damageToSignatureGain = Math.max(
      0,
      options.damageToSignatureGain ?? DEFAULT_SIGNATURE_GAIN_ON_DAMAGE
    );
    this.passiveSignaturePerSecond = Math.max(0, options.passiveSignaturePerSecond ?? 0);
    this.introDurationSeconds = Math.max(0.1, options.introDurationSeconds ?? DEFAULT_INTRO_DURATION_SEC);
    this.koResetDelayMs = Math.max(0, options.koResetDelayMs ?? DEFAULT_KO_RESET_DELAY_MS);
    this.slowMoDurationMs = Math.max(0, options.slowMoDurationMs ?? DEFAULT_SLOW_MO_DURATION_MS);
    this.slowMoFps = Math.max(1, options.slowMoFps ?? DEFAULT_SLOW_MO_FPS);
    this.normalFps = Math.max(24, options.normalFps ?? DEFAULT_NORMAL_FPS);
    this.timeRemaining = this.roundDurationSeconds;

    this.players = {
      player1: this.createFighterRuntime('player1', options.player1),
      player2: this.createFighterRuntime('player2', options.player2),
    };

    this.syncAllHUDImmediate();
  }

  /**
   * Resolves the standard Tekken HUD elements from the browser document.
   */
  public static resolveHUDFromDocument(doc: Document = document): GameHUDElements {
    const queryIndicators = (selector: string): HTMLElement[] =>
      Array.from(doc.querySelectorAll<HTMLElement>(selector));

    return {
      timer: doc.getElementById('hud-timer'),
      announcementContainer: doc.getElementById('match-announcement'),
      announcementTitle: doc.getElementById('match-announcement-title'),
      announcementSub: doc.getElementById('match-announcement-sub'),
      rematchButton: doc.getElementById('btn-match-rematch'),
      player1: {
        healthBar: doc.getElementById('hud-left-fill'),
        healthTrail: doc.getElementById('hud-left-trail'),
        healthText: doc.getElementById('hud-left-health-text'),
        roundIndicators: queryIndicators('#hud-left-rounds .round-pip'),
        signatureMeter: doc.getElementById('hud-p1-signature-box'),
        signatureFill: doc.getElementById('hud-p1-signature-fill'),
        signaturePrompt: doc.getElementById('hud-p1-signature-prompt'),
        signaturePercentText: doc.getElementById('hud-p1-signature-percent'),
      },
      player2: {
        healthBar: doc.getElementById('hud-right-fill'),
        healthTrail: doc.getElementById('hud-right-trail'),
        healthText: doc.getElementById('hud-right-health-text'),
        roundIndicators: queryIndicators('#hud-right-rounds .round-pip'),
        signatureMeter: doc.getElementById('hud-p2-signature-box'),
        signatureFill: doc.getElementById('hud-p2-signature-fill'),
        signaturePrompt: doc.getElementById('hud-p2-signature-prompt'),
        signaturePercentText: doc.getElementById('hud-p2-signature-percent'),
      },
    };
  }

  private createFighterRuntime(
    slot: PlayerSlot,
    config: FighterParticipantConfig
  ): FighterRuntimeState {
    const maxHealth = Math.max(1, config.maxHealth ?? 100);
    const defaultX = slot === 'player1' ? -1.15 : 1.15;
    const defaultYaw = slot === 'player1' ? Math.PI / 2 : -Math.PI / 2;

    return {
      slot,
      config,
      health: maxHealth,
      maxHealth,
      roundWins: 0,
      signatureCharge: 0,
      homePosition: (config.homePosition ?? config.mesh?.position.clone() ?? new THREE.Vector3(defaultX, 0, 0)).clone(),
      homeRotationY: config.homeRotationY ?? config.mesh?.rotation.y ?? defaultYaw,
    };
  }

  public getState(): GameState {
    return this.state;
  }

  public isControlsLocked(): boolean {
    return this.controlsLocked || this.state !== 'FIGHTING';
  }

  public isFighting(): boolean {
    return this.state === 'FIGHTING';
  }

  public isPausedState(): boolean {
    return this.paused;
  }

  public isSlowMoActive(): boolean {
    return this.slowMoActive;
  }

  public getRoundNumber(): number {
    return this.roundNumber;
  }

  public getTimeRemaining(): number {
    return this.timeRemaining;
  }

  public getHealth(player: PlayerSlot): number {
    return this.players[player].health;
  }

  public getMaxHealth(player: PlayerSlot): number {
    return this.players[player].maxHealth;
  }

  public getRoundWins(player: PlayerSlot): number {
    return this.players[player].roundWins;
  }

  public getSignatureCharge(player: PlayerSlot): number {
    return this.players[player].signatureCharge;
  }

  public isSignatureReady(player: PlayerSlot): boolean {
    return this.players[player].signatureCharge >= 100;
  }

  /**
   * Swaps fighter descriptors cleanly when changing matchup characters.
   */
  public setParticipants(
    player1: FighterParticipantConfig,
    player2: FighterParticipantConfig
  ): void {
    const p1Wins = this.players.player1.roundWins;
    const p2Wins = this.players.player2.roundWins;
    const next1 = this.createFighterRuntime('player1', player1);
    const next2 = this.createFighterRuntime('player2', player2);
    next1.roundWins = p1Wins;
    next2.roundWins = p2Wins;

    this.killSlotTweens(this.players.player1);
    this.killSlotTweens(this.players.player2);

    this.players.player1 = next1;
    this.players.player2 = next2;
    this.syncAllHUDImmediate();
  }

  /**
   * Starts (or restarts) a Best-of-3 match from Round 1.
   */
  public startMatch(): void {
    if (this.disposed) return;

    this.clearAsyncSequences();
    this.paused = false;
    this.roundNumber = 1;

    for (const slot of ['player1', 'player2'] as const) {
      const runtime = this.players[slot];
      runtime.roundWins = 0;
      runtime.health = runtime.maxHealth;
      this.setSignatureChargeInternal(slot, 0, true);
      this.updateRoundIndicatorsUI(slot);
    }

    this.refillHealth(undefined, 0.25);
    this.resetFighterPositionsAndPoses();
    this.startRound(1);
  }

  /**
   * Pauses the countdown interval (e.g. while a modal overlay is open).
   */
  public pause(): void {
    if (this.paused || this.disposed) return;
    this.paused = true;
    this.stopTimer();
  }

  /**
   * Resumes countdown interval if currently inside FIGHTING state.
   */
  public resume(): void {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    if (this.state === 'FIGHTING') {
      this.startTimer();
    }
  }

  /**
   * Applies damage to a player, smooth-tweens the HUD bar, builds +10%
   * Signature charge, and checks for 0 HP K.O.
   */
  public applyDamage(player: PlayerSlot, amount: number): number {
    const runtime = this.players[player];
    if (this.disposed || this.state !== 'FIGHTING' || amount <= 0) {
      return runtime.health;
    }

    if (runtime.config.invulnerable) {
      return runtime.health;
    }

    const prevHp = runtime.health;
    const nextHp = Math.max(0, prevHp - amount);
    runtime.health = nextHp;

    this.tweenHealthBar(player, 0.28);
    this.callbacks.onHealthChange?.(player, nextHp, runtime.maxHealth);

    if (this.damageToSignatureGain > 0) {
      this.addSignatureCharge(player, this.damageToSignatureGain);
    }

    if (prevHp > 0 && nextHp <= 0) {
      this.handleKO(player);
    }

    return nextHp;
  }

  /**
   * Restores HP mid-round (e.g. buff/heal specials like Chai Break) with GSAP bar tween.
   */
  public healPlayer(player: PlayerSlot, amount: number): number {
    const runtime = this.players[player];
    if (this.disposed || amount <= 0 || runtime.config.invulnerable) {
      return runtime.health;
    }

    const nextHp = Math.min(runtime.maxHealth, runtime.health + amount);
    runtime.health = nextHp;
    this.tweenHealthBar(player, 0.35);
    this.callbacks.onHealthChange?.(player, nextHp, runtime.maxHealth);
    return nextHp;
  }

  /**
   * Refills one or both fighters to 100% HP and tweens their health bars cleanly.
   */
  public refillHealth(player?: PlayerSlot, duration = 0.45): void {
    const targets: PlayerSlot[] = player ? [player] : ['player1', 'player2'];
    for (const slot of targets) {
      const runtime = this.players[slot];
      runtime.health = runtime.maxHealth;
      this.tweenHealthBar(slot, duration);
      this.callbacks.onHealthChange?.(slot, runtime.health, runtime.maxHealth);
    }
  }

  /**
   * Adds (or sets when using consume) charge to a player's Signature/Rage meter.
   */
  public addSignatureCharge(player: PlayerSlot, delta: number): number {
    if (this.disposed || delta <= 0) {
      return this.players[player].signatureCharge;
    }
    const next = Math.min(100, this.players[player].signatureCharge + delta);
    this.setSignatureChargeInternal(player, next, false);
    return next;
  }

  /**
   * Triggers a player's Signature Move if FIGHTING and meter is full (100),
   * then resets their Signature Meter back to 0.
   */
  public triggerSignature(player: PlayerSlot): boolean {
    if (this.disposed || this.state !== 'FIGHTING' || this.controlsLocked) {
      return false;
    }
    if (!this.isSignatureReady(player)) {
      return false;
    }

    const opponentSlot: PlayerSlot = player === 'player1' ? 'player2' : 'player1';
    this.setSignatureChargeInternal(player, 0, true);
    this.players[player].config.onSignatureMove?.(this.players[opponentSlot].config);
    return true;
  }

  /**
   * Consumes a full Signature Meter cleanly without invoking onSignatureMove
   * (for callers firing custom/secondary signature moves directly).
   */
  public consumeSignatureCharge(player: PlayerSlot): boolean {
    if (this.disposed || this.state !== 'FIGHTING' || this.controlsLocked) {
      return false;
    }
    if (!this.isSignatureReady(player)) {
      return false;
    }
    this.setSignatureChargeInternal(player, 0, true);
    return true;
  }

  /**
   * Immediately triggers TIME OVER (exposed cleanly for timer expiry or verification).
   */
  public forceTimeOver(): void {
    if (this.state !== 'FIGHTING' || this.disposed) return;
    this.timeRemaining = 0;
    this.updateTimerUI();
    this.handleTimeOver();
  }

  /**
   * Releases all timers, intervals, GSAP tweens, and restores normal ticker FPS.
   */
  public dispose(): void {
    this.disposed = true;
    this.clearAsyncSequences();
    this.killSlotTweens(this.players.player1);
    this.killSlotTweens(this.players.player2);
  }

  private startRound(roundNum: number): void {
    if (this.disposed) return;

    this.stopTimer();
    this.introTimeline?.kill();
    this.introTimeline = undefined;

    this.roundNumber = roundNum;
    this.timeRemaining = this.roundDurationSeconds;
    this.updateTimerUI();

    this.setState('INTRO');
    this.setControlsLocked(true);
    this.callbacks.onRoundStart?.(roundNum);

    const roundHoldSec = this.introDurationSeconds * (1.85 / 3);
    const fightSwitchTimeSec = this.introDurationSeconds * (1.9 / 3);
    const timelineProxy = { progress: 0 };

    this.showAnnouncement(
      `ROUND ${roundNum}`,
      `${this.players.player1.config.name.toUpperCase()}  VS  ${this.players.player2.config.name.toUpperCase()}`,
      'round'
    );

    const tl = gsap.timeline({
      onComplete: () => {
        if (this.disposed) return;
        this.hideAnnouncement();
        this.setState('FIGHTING');
        this.setControlsLocked(false);
        if (!this.paused) {
          this.startTimer();
        }
      },
    });

    tl.to(timelineProxy, {
      progress: 0.62,
      duration: roundHoldSec,
      ease: 'none',
    });

    tl.call(() => {
      if (this.disposed) return;
      this.showAnnouncement('FIGHT!', 'UNLEASH YOUR FURY', 'fight');
    }, undefined, fightSwitchTimeSec);

    tl.to(timelineProxy, {
      progress: 1,
      duration: Math.max(0.05, this.introDurationSeconds - fightSwitchTimeSec),
      ease: 'none',
    }, fightSwitchTimeSec);

    this.introTimeline = tl;
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerIntervalId = setInterval(() => {
      if (this.disposed || this.paused || this.state !== 'FIGHTING') return;

      this.timeRemaining = Math.max(0, this.timeRemaining - 1);
      this.updateTimerUI();
      this.callbacks.onTimerTick?.(this.timeRemaining);

      if (this.passiveSignaturePerSecond > 0) {
        this.addSignatureCharge('player1', this.passiveSignaturePerSecond);
        this.addSignatureCharge('player2', this.passiveSignaturePerSecond);
      }

      if (this.timeRemaining <= 0) {
        this.handleTimeOver();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
  }

  private handleKO(defeatedPlayer: PlayerSlot): void {
    if (this.state !== 'FIGHTING' || this.disposed) return;

    this.stopTimer();
    this.setState('ROUND_END');
    this.setControlsLocked(true);

    this.activateKoSlowMo();
    this.showAnnouncement('K.O.', `${this.players[defeatedPlayer].config.name.toUpperCase()} IS DOWN!`, 'ko');
    this.playDefeatedFallAnimation(this.players[defeatedPlayer]);

    const winner: PlayerSlot = defeatedPlayer === 'player1' ? 'player2' : 'player1';
    this.recordRoundVictory(winner, 'ko');
  }

  private handleTimeOver(): void {
    if (this.state !== 'FIGHTING' || this.disposed) return;

    this.stopTimer();
    this.setState('ROUND_END');
    this.setControlsLocked(true);

    const p1Ratio = this.players.player1.health / this.players.player1.maxHealth;
    const p2Ratio = this.players.player2.health / this.players.player2.maxHealth;

    let winner: PlayerSlot | 'draw';
    if (Math.abs(p1Ratio - p2Ratio) < 0.0001) {
      winner = 'draw';
    } else {
      winner = p1Ratio > p2Ratio ? 'player1' : 'player2';
    }

    const subtitle =
      winner === 'draw'
        ? 'DRAW ROUND — RUN IT BACK!'
        : `${this.players[winner].config.name.toUpperCase()} WINS BY HEALTH ADVANTAGE!`;
    this.showAnnouncement('TIME OVER', subtitle, 'time-over');

    this.recordRoundVictory(winner, 'time_over');
  }

  private recordRoundVictory(winner: PlayerSlot | 'draw', reason: 'ko' | 'time_over'): void {
    if (winner !== 'draw') {
      this.players[winner].roundWins += 1;
      this.updateRoundIndicatorsUI(winner, true);
    }

    const wins: Record<PlayerSlot, number> = {
      player1: this.players.player1.roundWins,
      player2: this.players.player2.roundWins,
    };

    this.callbacks.onRoundEnd?.({
      roundNumber: this.roundNumber,
      winner,
      reason,
      wins,
    });

    if (this.postRoundTimeoutId !== null) {
      clearTimeout(this.postRoundTimeoutId);
      this.postRoundTimeoutId = null;
    }

    this.postRoundTimeoutId = setTimeout(() => {
      this.postRoundTimeoutId = null;
      if (this.disposed) return;

      this.restoreNormalFps();

      if (winner !== 'draw' && wins[winner] >= this.roundsToWin) {
        this.finishMatch(winner, wins);
        return;
      }

      this.resetFighterPositionsAndPoses();
      this.refillHealth(undefined, 0.4);
      const nextRound = winner === 'draw' ? this.roundNumber : this.roundNumber + 1;
      this.callbacks.onRoundReset?.(nextRound);
      this.startRound(nextRound);
    }, this.koResetDelayMs);
  }

  private finishMatch(winner: PlayerSlot, wins: Record<PlayerSlot, number>): void {
    this.stopTimer();
    this.setState('MATCH_OVER');
    this.setControlsLocked(true);

    const slotLabel = winner === 'player1' ? 'PLAYER 1 WINS' : 'PLAYER 2 WINS';
    const fighterName = this.players[winner].config.name.toUpperCase();
    this.showAnnouncement(slotLabel, `${fighterName} TAKES THE MATCH (${wins.player1} - ${wins.player2})`, 'win');
    this.hud.rematchButton?.classList.remove('hidden');
    this.callbacks.onMatchOver?.(winner, wins);
  }

  private activateKoSlowMo(): void {
    if (this.slowMoTimeoutId !== null) {
      clearTimeout(this.slowMoTimeoutId);
      this.slowMoTimeoutId = null;
    }

    this.slowMoActive = true;
    gsap.ticker.fps(this.slowMoFps);
    this.callbacks.onSlowMoChange?.(true);

    this.slowMoTimeoutId = setTimeout(() => {
      this.slowMoTimeoutId = null;
      this.restoreNormalFps();
    }, this.slowMoDurationMs);
  }

  private restoreNormalFps(): void {
    if (this.slowMoTimeoutId !== null) {
      clearTimeout(this.slowMoTimeoutId);
      this.slowMoTimeoutId = null;
    }
    gsap.ticker.fps(this.normalFps);
    if (this.slowMoActive) {
      this.slowMoActive = false;
      this.callbacks.onSlowMoChange?.(false);
    }
  }

  private playDefeatedFallAnimation(runtime: FighterRuntimeState): void {
    runtime.config.onPlayFall?.();

    const { fallAction, idleAction } = runtime.config;
    if (fallAction) {
      idleAction?.fadeOut(0.08);
      fallAction.reset();
      fallAction.setLoop(THREE.LoopOnce, 1);
      fallAction.clampWhenFinished = true;
      fallAction.fadeIn(0.06).play();
    }
  }

  private resetFighterPositionsAndPoses(): void {
    for (const slot of ['player1', 'player2'] as const) {
      const runtime = this.players[slot];
      const { config } = runtime;

      if (config.onResetPosition) {
        config.onResetPosition();
      } else if (config.mesh) {
        gsap.killTweensOf(config.mesh.position);
        config.mesh.position.copy(runtime.homePosition);
        config.mesh.rotation.y = runtime.homeRotationY;
      }

      if (config.onPlayIdle) {
        config.onPlayIdle();
      } else if (config.idleAction) {
        config.fallAction?.fadeOut(0.1);
        config.idleAction.reset();
        config.idleAction.fadeIn(0.1).play();
      }
    }
  }

  private setState(nextState: GameState): void {
    const prev = this.state;
    if (prev === nextState) return;
    this.state = nextState;
    this.callbacks.onStateChange?.(nextState, prev);
  }

  private setControlsLocked(locked: boolean): void {
    this.controlsLocked = locked;
    this.callbacks.onControlsLockChange?.(locked);
  }

  private tweenHealthBar(player: PlayerSlot, duration: number): void {
    const runtime = this.players[player];
    const hpEl = this.hud[player];
    const hpPercent = Math.max(0, Math.min(100, (runtime.health / runtime.maxHealth) * 100));
    const widthValue = `${hpPercent}%`;

    if (hpEl?.healthText) {
      hpEl.healthText.textContent = runtime.config.invulnerable
        ? '∞ / ∞ UNBREAKABLE'
        : `${Math.round(runtime.health)} / ${runtime.maxHealth} HP`;
    }

    if (hpEl?.healthBar) {
      runtime.healthTween?.kill();
      hpEl.healthBar.dataset.targetWidth = widthValue;
      hpEl.healthBar.classList.toggle(
        'health-bar-fill--low',
        !runtime.config.invulnerable && hpPercent <= 30
      );

      if (duration <= 0) {
        hpEl.healthBar.style.width = widthValue;
      } else {
        runtime.healthTween = gsap.to(hpEl.healthBar, {
          width: widthValue,
          duration,
          ease: 'power2.out',
        });
      }
    }

    if (hpEl?.healthTrail) {
      runtime.trailTween?.kill();
      if (duration <= 0) {
        hpEl.healthTrail.style.width = widthValue;
      } else {
        runtime.trailTween = gsap.to(hpEl.healthTrail, {
          width: widthValue,
          duration: duration + 0.35,
          delay: 0.14,
          ease: 'power2.out',
        });
      }
    }
  }

  private setSignatureChargeInternal(
    player: PlayerSlot,
    nextValue: number,
    immediate: boolean,
    notifyCallback = true
  ): void {
    const runtime = this.players[player];
    const clamped = Math.max(0, Math.min(100, Math.round(nextValue)));
    const wasReady = runtime.signatureCharge >= 100;
    const isReady = clamped >= 100;
    runtime.signatureCharge = clamped;

    const hudPlayer = this.hud[player];
    const widthValue = `${clamped}%`;

    if (hudPlayer?.signatureFill) {
      runtime.signatureFillTween?.kill();
      if (immediate) {
        hudPlayer.signatureFill.style.width = widthValue;
      } else {
        runtime.signatureFillTween = gsap.to(hudPlayer.signatureFill, {
          width: widthValue,
          duration: 0.25,
          ease: 'power2.out',
        });
      }
    }

    if (hudPlayer?.signaturePercentText) {
      hudPlayer.signaturePercentText.textContent = isReady ? 'MAX!' : `${clamped}%`;
    }

    if (hudPlayer?.signaturePrompt) {
      if (isReady) {
        hudPlayer.signaturePrompt.textContent = SIGNATURE_PROMPT_TEXT;
        hudPlayer.signaturePrompt.classList.remove('hidden');
      } else {
        hudPlayer.signaturePrompt.classList.add('hidden');
      }
    }

    if (hudPlayer?.signatureMeter) {
      hudPlayer.signatureMeter.classList.toggle('signature-meter--ready', isReady);
      if (isReady && !wasReady) {
        runtime.signaturePulseTween?.kill();
        runtime.signaturePulseTween = gsap.to(hudPlayer.signatureMeter, {
          scale: 1.06,
          duration: 0.45,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      } else if (!isReady) {
        runtime.signaturePulseTween?.kill();
        runtime.signaturePulseTween = undefined;
        gsap.set(hudPlayer.signatureMeter, { scale: 1 });
      }
    }

    if (notifyCallback) {
      this.callbacks.onSignatureChargeChange?.(player, clamped, isReady);
    }
  }

  private updateRoundIndicatorsUI(player: PlayerSlot, popLatest = false): void {
    const wins = this.players[player].roundWins;
    const indicators = this.hud[player]?.roundIndicators;
    if (!indicators) return;

    indicators.forEach((pip, index) => {
      if (!pip) return;
      const earned = index < wins;
      pip.classList.toggle('round-pip--won', earned);
      if (popLatest && earned && index === wins - 1) {
        gsap.fromTo(
          pip,
          { scale: 1.7 },
          { scale: 1, duration: 0.35, ease: 'back.out(2)' }
        );
      }
    });
  }

  private updateTimerUI(): void {
    if (!this.hud.timer) return;
    this.hud.timer.textContent = String(Math.max(0, Math.ceil(this.timeRemaining))).padStart(2, '0');
    this.hud.timer.classList.toggle('hud-timer--danger', this.timeRemaining <= 15);
  }

  private showAnnouncement(
    title: string,
    subtitle: string,
    variant: AnnouncementVariant
  ): void {
    this.callbacks.onAnnouncementPhase?.(variant, title, subtitle);

    const container = this.hud.announcementContainer;
    if (!container) return;

    if (this.hud.announcementTitle) {
      this.hud.announcementTitle.textContent = title;
    }
    if (this.hud.announcementSub) {
      this.hud.announcementSub.textContent = subtitle;
    }

    container.className = `match-announcement match-announcement--${variant}`;
    if (variant !== 'win') {
      this.hud.rematchButton?.classList.add('hidden');
    }

    gsap.killTweensOf(container);
    this.announcementTween = gsap.fromTo(
      container,
      { scale: variant === 'ko' ? 2.1 : 1.5, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: variant === 'ko' ? 0.34 : 0.28,
        ease: variant === 'ko' ? 'power4.out' : 'back.out(1.7)',
      }
    );
  }

  private hideAnnouncement(): void {
    const container = this.hud.announcementContainer;
    if (!container) return;

    gsap.killTweensOf(container);
    this.announcementTween = gsap.to(container, {
      opacity: 0,
      scale: 0.92,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: () => {
        container.classList.add('hidden');
        this.hud.rematchButton?.classList.add('hidden');
      },
    });
  }

  private syncAllHUDImmediate(notifyCallbacks = false): void {
    this.updateTimerUI();
    for (const slot of ['player1', 'player2'] as const) {
      this.tweenHealthBar(slot, 0);
      this.updateRoundIndicatorsUI(slot);
      this.setSignatureChargeInternal(
        slot,
        this.players[slot].signatureCharge,
        true,
        notifyCallbacks
      );
    }
    this.hud.rematchButton?.classList.add('hidden');
  }

  private killSlotTweens(runtime: FighterRuntimeState): void {
    runtime.signaturePulseTween?.kill();
    runtime.signaturePulseTween = undefined;
    runtime.signatureFillTween?.kill();
    runtime.signatureFillTween = undefined;
    runtime.healthTween?.kill();
    runtime.healthTween = undefined;
    runtime.trailTween?.kill();
    runtime.trailTween = undefined;
  }

  private clearAsyncSequences(): void {
    this.stopTimer();

    if (this.slowMoTimeoutId !== null) {
      clearTimeout(this.slowMoTimeoutId);
      this.slowMoTimeoutId = null;
    }
    if (this.postRoundTimeoutId !== null) {
      clearTimeout(this.postRoundTimeoutId);
      this.postRoundTimeoutId = null;
    }

    this.introTimeline?.kill();
    this.introTimeline = undefined;

    if (this.announcementTween) {
      this.announcementTween.kill();
      this.announcementTween = undefined;
    }

    this.restoreNormalFps();
  }
}
