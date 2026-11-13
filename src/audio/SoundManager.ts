/**
 * Synthesizes comical arcade fighting sound effects using the Web Audio API
 * and plays authentic voice lines & SFX hosted on Cloudflare R2 CDN.
 */

import { ASSET_CDN } from '../config/cdn';

const SOUND_FILENAMES: readonly string[] = [
  '1', '10', '2', '3', '4', '5', '6', '7', '8', '9',
  'arcade_mode', 'battle_mode', 'begin',
  'beltHandle1', 'beltHandle2',
  'bookClose', 'bookFlip1', 'bookFlip2', 'bookFlip3', 'bookOpen',
  'bookPlace1', 'bookPlace2', 'bookPlace3',
  'championship_mode', 'choose_your_character', 'chop',
  'cloth1', 'cloth2', 'cloth3', 'cloth4', 'clothBelt', 'clothBelt2',
  'combo', 'combo_breaker',
  'creak1', 'creak2', 'creak3',
  'deathmatch',
  'doorClose_1', 'doorClose_2', 'doorClose_3', 'doorClose_4',
  'doorOpen_1', 'doorOpen_2',
  'drawKnife1', 'drawKnife2', 'drawKnife3',
  'dropLeather',
  'fight', 'final_round', 'flawless_victory',
  'footstep00', 'footstep01', 'footstep02', 'footstep03', 'footstep04',
  'footstep05', 'footstep06', 'footstep07', 'footstep08', 'footstep09',
  'game_over',
  'handleCoins', 'handleCoins2', 'handleSmallLeather', 'handleSmallLeather2',
  "it's_a_tie",
  'kill_her', 'kill_him', 'kill_it',
  'knifeSlice', 'knifeSlice2',
  'loser',
  'metalClick', 'metalLatch', 'metalPot1', 'metalPot2', 'metalPot3',
  'multi_kill',
  'player_1', 'player_2',
  'prepare_yourself',
  'ready',
  'round_1', 'round_2', 'round_3', 'round_4', 'round_5',
  'story_mode', 'sudden_death', 'survival_mode',
  'tie', 'tie_breaker', 'time',
  'winner', 'you_lose', 'you_win',
];

function buildSoundUrlMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const stem of SOUND_FILENAMES) {
    const url = `${ASSET_CDN}/sound/${stem}.ogg`;
    const lowerStem = stem.toLowerCase();

    map.set(stem, url);
    map.set(lowerStem, url);
    map.set(`${lowerStem}.ogg`, url);

    const noPunct = lowerStem.replace(/[^a-z0-9]/g, '');
    const kebab = lowerStem.replace(/[_'\s]+/g, '-');
    const snake = lowerStem.replace(/[-'\s]+/g, '_');
    map.set(noPunct, url);
    map.set(kebab, url);
    map.set(snake, url);
  }

  // Common aliases
  const aliasEntries: Array<[string, string]> = [
    ['tie', "it's_a_tie"],
    ['draw', "it's_a_tie"],
    ['its_a_tie', "it's_a_tie"],
    ['its-a-tie', "it's_a_tie"],
    ['itsatie', "it's_a_tie"],
    ['youwin', 'you_win'],
    ['you-win', 'you_win'],
    ['youlose', 'you_lose'],
    ['you-lose', 'you_lose'],
    ['round1', 'round_1'],
    ['round-1', 'round_1'],
    ['round2', 'round_2'],
    ['round-2', 'round_2'],
    ['round3', 'round_3'],
    ['round-3', 'round_3'],
    ['round4', 'round_4'],
    ['round-4', 'round_4'],
    ['round5', 'round_5'],
    ['round-5', 'round_5'],
    ['finalround', 'final_round'],
    ['final-round', 'final_round'],
    ['combobreaker', 'combo_breaker'],
    ['combo-breaker', 'combo_breaker'],
    ['flawlessvictory', 'flawless_victory'],
    ['flawless-victory', 'flawless_victory'],
    ['gameover', 'game_over'],
    ['game-over', 'game_over'],
    ['drawknife', 'drawKnife1'],
    ['draw-knife', 'drawKnife1'],
    ['knifeslice', 'knifeSlice'],
    ['knife-slice', 'knifeSlice'],
    ['knife_slice', 'knifeSlice'],
    ['chooseyourcharacter', 'choose_your_character'],
    ['choose-your-character', 'choose_your_character'],
  ];

  for (const [alias, targetKey] of aliasEntries) {
    const targetUrl = map.get(targetKey) ?? map.get(targetKey.toLowerCase());
    if (targetUrl && !map.has(alias)) {
      map.set(alias, targetUrl);
    }
  }

  return map;
}

export class SoundManager {
  private static readonly soundUrls: Map<string, string> = buildSoundUrlMap();

  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private masterGainNode: GainNode | null = null;
  private voiceGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private currentVoiceSource: AudioBufferSourceNode | null = null;

  private readonly bufferCache = new Map<string, AudioBuffer>();
  private readonly pendingLoads = new Map<string, Promise<AudioBuffer | null>>();
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGainNode && this.ctx) {
      this.masterGainNode.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playClick();
    }
    return this.muted;
  }

  /**
   * Unlocks Web Audio on the first user gesture (click/keydown) and pre-warms essential voices.
   */
  public unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        void this.preloadEssentialSounds();
      });
    } else if (ctx) {
      void this.preloadEssentialSounds();
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);

      this.masterGainNode = this.ctx.createGain();
      this.masterGainNode.gain.setValueAtTime(this.muted ? 0 : 1, this.ctx.currentTime);
      this.masterGainNode.connect(this.ctx.destination);

      this.voiceGainNode = this.ctx.createGain();
      this.voiceGainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.voiceGainNode.connect(this.masterGainNode);

      this.sfxGainNode = this.ctx.createGain();
      this.sfxGainNode.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGainNode.connect(this.masterGainNode);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private normalizeKey(name: string): string {
    let s = name.trim().toLowerCase();
    if (s.endsWith('.ogg')) {
      s = s.slice(0, -4);
    }
    const lastSlash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    if (lastSlash >= 0) {
      s = s.slice(lastSlash + 1);
    }
    return s;
  }

  /**
   * Fetches and decodes an audio buffer for a given sound asset name.
   */
  public async loadSound(name: string): Promise<AudioBuffer | null> {
    const key = this.normalizeKey(name);
    if (this.bufferCache.has(key)) {
      return this.bufferCache.get(key)!;
    }
    const pending = this.pendingLoads.get(key);
    if (pending) {
      return pending;
    }

    const url = SoundManager.soundUrls.get(key) ?? SoundManager.soundUrls.get(name);
    if (!url) {
      console.warn(`[SoundManager] Unknown sound asset: "${name}" (key: "${key}")`);
      return null;
    }

    const p = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const ctx = this.ensureContext();
        if (!ctx) return null;
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        this.bufferCache.set(key, audioBuf);
        return audioBuf;
      } catch (err) {
        console.warn(`[SoundManager] Failed to load/decode "${name}" from ${url}:`, err);
        return null;
      } finally {
        this.pendingLoads.delete(key);
      }
    })();

    this.pendingLoads.set(key, p);
    return p;
  }

  /** Preloads core fight announcers & essential effects. */
  public async preloadEssentialSounds(): Promise<void> {
    const essentials = [
      'round_1',
      'round_2',
      'round_3',
      'round_4',
      'round_5',
      'final_round',
      'ready',
      'fight',
      'begin',
      'you_win',
      'you_lose',
      'game_over',
      'flawless_victory',
      'winner',
      'loser',
      "it's_a_tie",
      'time',
      'combo',
      'combo_breaker',
      'choose_your_character',
      'player_1',
      'player_2',
      'prepare_yourself',
      'drawKnife1',
      'drawKnife2',
      'knifeSlice',
      'knifeSlice2',
      'chop',
      'metalPot1',
      'metalPot2',
      'footstep01',
      'footstep02',
      'bookOpen',
      'bookClose',
    ];
    await Promise.allSettled(essentials.map((name) => this.loadSound(name)));
  }

  /**
   * Plays a voice announcement (e.g. "Round 1", "You Win!", "Fight!").
   * By default interrupts any currently active announcer voice line to avoid garbled speech.
   */
  public async playVoice(
    name: string,
    options: {
      volume?: number;
      interruptPrevious?: boolean;
      playbackRate?: number;
      onEnded?: () => void;
    } = {}
  ): Promise<number> {
    if (this.muted) return 0;
    const ctx = this.ensureContext();
    if (!ctx) return 0;

    const {
      volume = 1.0,
      interruptPrevious = true,
      playbackRate = 1.0,
      onEnded,
    } = options;

    if (interruptPrevious && this.currentVoiceSource) {
      try {
        this.currentVoiceSource.stop();
        this.currentVoiceSource.disconnect();
      } catch {
        // already stopped
      }
      this.currentVoiceSource = null;
    }

    const key = this.normalizeKey(name);
    let buffer = this.bufferCache.get(key);
    if (!buffer) {
      buffer = (await this.loadSound(name)) ?? undefined;
    }
    if (!buffer || this.muted) return 0;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    if (this.voiceGainNode) {
      gain.connect(this.voiceGainNode);
    } else {
      gain.connect(this.masterGainNode ?? ctx.destination);
    }

    if (interruptPrevious) {
      this.currentVoiceSource = source;
    }

    source.onended = () => {
      if (this.currentVoiceSource === source) {
        this.currentVoiceSource = null;
      }
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // cleanup
      }
      onEnded?.();
    };

    source.start();
    return buffer.duration / playbackRate;
  }

  /**
   * Plays an interactive SFX clip from the sound library (knife, pot clank, cloth, footsteps, etc.).
   */
  public async playSfx(
    name: string,
    options: {
      volume?: number;
      playbackRate?: number;
      detune?: number;
      onEnded?: () => void;
    } = {}
  ): Promise<number> {
    if (this.muted) return 0;
    const ctx = this.ensureContext();
    if (!ctx) return 0;

    const { volume = 1.0, playbackRate = 1.0, detune = 0, onEnded } = options;

    const key = this.normalizeKey(name);
    let buffer = this.bufferCache.get(key);
    if (!buffer) {
      buffer = (await this.loadSound(name)) ?? undefined;
    }
    if (!buffer || this.muted) return 0;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    if (detune !== 0 && 'detune' in source) {
      source.detune.value = detune;
    }

    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    if (this.sfxGainNode) {
      gain.connect(this.sfxGainNode);
    } else {
      gain.connect(this.masterGainNode ?? ctx.destination);
    }

    source.onended = () => {
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // cleanup
      }
      onEnded?.();
    };

    source.start();
    return buffer.duration / playbackRate;
  }

  public playRoundVoice(roundNum: number, isFinalRound = false): Promise<number> {
    if (isFinalRound) {
      return this.playVoice('final_round');
    }
    const clamped = Math.max(1, Math.min(5, roundNum));
    return this.playVoice(`round_${clamped}`);
  }

  public playReadyVoice(): Promise<number> {
    return this.playVoice('ready');
  }

  public playFightVoice(): Promise<number> {
    return this.playVoice('fight');
  }

  public playMatchEndVoice(p1Won: boolean, isDraw = false, isFlawless = false): void {
    if (isDraw) {
      void this.playVoice("it's_a_tie");
      return;
    }
    if (p1Won) {
      if (isFlawless) {
        void this.playVoice('flawless_victory').then((dur) => {
          setTimeout(() => {
            void this.playVoice('you_win');
          }, Math.max(1000, (dur || 1.1) * 1000 * 0.95));
        });
      } else {
        void this.playVoice('you_win');
      }
    } else {
      void this.playVoice('you_lose').then((dur) => {
        setTimeout(() => {
          void this.playVoice('game_over');
        }, Math.max(1150, (dur || 1.25) * 1000 * 0.9));
      });
    }
  }

  public playTimeOverVoice(): void {
    void this.playVoice('time');
  }

  public playCountdown(secondsRemaining: number): void {
    if (secondsRemaining >= 1 && secondsRemaining <= 10) {
      void this.playVoice(String(secondsRemaining), { volume: 0.85, interruptPrevious: false });
    }
  }

  public playComboBreaker(): void {
    void this.playVoice('combo_breaker', { volume: 1.15, interruptPrevious: false });
  }

  public playComboVoice(): void {
    void this.playVoice('combo', { volume: 1.0, interruptPrevious: false });
  }

  public playCharacterSelect(): void {
    void this.playVoice('choose_your_character', { volume: 1.0 });
  }

  public playPlayerSlot(slot: 'player1' | 'player2'): void {
    void this.playVoice(slot === 'player1' ? 'player_1' : 'player_2', { volume: 0.9 });
  }

  public playKnifeDraw(): void {
    const variants = ['drawKnife1', 'drawKnife2', 'drawKnife3'];
    const chosen = variants[Math.floor(Math.random() * variants.length)];
    void this.playSfx(chosen, { volume: 1.0 });
  }

  public playKnifeSlice(): void {
    const variants = ['knifeSlice', 'knifeSlice2'];
    const chosen = variants[Math.floor(Math.random() * variants.length)];
    void this.playSfx(chosen, { volume: 1.15 });
  }

  public playChop(): void {
    void this.playSfx('chop', { volume: 1.0 });
  }

  public playMetalClang(): void {
    const variants = ['metalPot1', 'metalPot2', 'metalPot3', 'metalClick'];
    const chosen = variants[Math.floor(Math.random() * variants.length)];
    void this.playSfx(chosen, { volume: 0.9 });
  }

  public playBookOpen(): void {
    void this.playSfx('bookOpen', { volume: 0.75 });
  }

  public playBookClose(): void {
    void this.playSfx('bookClose', { volume: 0.75 });
  }

  public playFootstep(): void {
    const idx = Math.floor(Math.random() * 10);
    const name = `footstep0${idx}`;
    void this.playSfx(name, { volume: 0.35, detune: (Math.random() - 0.5) * 120 });
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.45);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private canPlay(): AudioContext | null {
    if (this.muted) return null;
    return this.ensureContext();
  }

  private withActiveContext(callback: (ctx: AudioContext) => void): void {
    const ctx = this.canPlay();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        if (!this.muted) {
          callback(ctx);
        }
      });
      return;
    }
    callback(ctx);
  }

  public playClick(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(860, now + 0.06);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playWhoosh(pitchMultiplier = 1): void {
    const ctx = this.canPlay();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.4;
    filter.frequency.setValueAtTime(420 * pitchMultiplier, now);
    filter.frequency.exponentialRampToValueAtTime(1600 * pitchMultiplier, now + 0.11);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.15);
  }

  public playPunchHit(comboHits = 1): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;
    const comboPitch = Math.min(1.35, 1 + (comboHits % 8) * 0.035);

    // Low body thud
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(165 * comboPitch, now);
    thud.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    thudGain.gain.setValueAtTime(0.45, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.17);

    // Crisp comic slap transient
    if (this.noiseBuffer) {
      const slap = ctx.createBufferSource();
      slap.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(950, now);
      const slapGain = ctx.createGain();
      slapGain.gain.setValueAtTime(0.28, now);
      slapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      slap.connect(filter);
      filter.connect(slapGain);
      slapGain.connect(ctx.destination);
      slap.start(now);
      slap.stop(now + 0.09);
    }

    // Playful cartoon "oof / squeak" wobble
    const squeak = ctx.createOscillator();
    const squeakGain = ctx.createGain();
    squeak.type = 'triangle';
    squeak.frequency.setValueAtTime(420 * comboPitch, now + 0.02);
    squeak.frequency.exponentialRampToValueAtTime(210, now + 0.15);
    squeakGain.gain.setValueAtTime(0.12, now + 0.02);
    squeakGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    squeak.connect(squeakGain);
    squeakGain.connect(ctx.destination);
    squeak.start(now + 0.02);
    squeak.stop(now + 0.17);
  }

  public playCounterWindup(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.21);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playBossKickImpact(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Massive sub boom
    const boom = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(210, now);
    boom.frequency.exponentialRampToValueAtTime(34, now + 0.34);
    boomGain.gain.setValueAtTime(0.6, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    boom.connect(boomGain);
    boomGain.connect(ctx.destination);
    boom.start(now);
    boom.stop(now + 0.39);

    // Impact crack noise
    if (this.noiseBuffer) {
      const crack = ctx.createBufferSource();
      crack.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.42, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      crack.connect(filter);
      filter.connect(crackGain);
      crackGain.connect(ctx.destination);
      crack.start(now);
      crack.stop(now + 0.17);
    }

    // Dramatic comical boss brass chord stinger (C5 - E5 - G5)
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const stinger = ctx.createOscillator();
      const stingerGain = ctx.createGain();
      stinger.type = 'sawtooth';
      stinger.frequency.setValueAtTime(freq, now + 0.04 + idx * 0.025);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, now);

      stingerGain.gain.setValueAtTime(0.085, now + 0.04 + idx * 0.025);
      stingerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      stinger.connect(lp);
      lp.connect(stingerGain);
      stingerGain.connect(ctx.destination);
      stinger.start(now + 0.04 + idx * 0.025);
      stinger.stop(now + 0.46);
    });
  }

  /** Solid metallic forearm shield block sound effect with crisp deflection clank & low punch thud. */
  public playBlockImpact(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Solid low thud
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(160, now);
    thud.frequency.exponentialRampToValueAtTime(55, now + 0.12);
    thudGain.gain.setValueAtTime(0.45, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.16);

    // 2. High-frequency metallic shield deflection clank
    const clank = ctx.createOscillator();
    const clankGain = ctx.createGain();
    clank.type = 'square';
    clank.frequency.setValueAtTime(980, now);
    clank.frequency.exponentialRampToValueAtTime(320, now + 0.08);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, now);
    bp.Q.setValueAtTime(3.5, now);

    clankGain.gain.setValueAtTime(0.22, now);
    clankGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    clank.connect(bp);
    bp.connect(clankGain);
    clankGain.connect(ctx.destination);
    clank.start(now);
    clank.stop(now + 0.11);
  }

  public playMatSlamAndDizzy(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Mat thud
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(115, now + 0.18);
    thud.frequency.exponentialRampToValueAtTime(36, now + 0.38);
    thudGain.gain.setValueAtTime(0.36, now + 0.18);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(now + 0.18);
    thud.stop(now + 0.41);

    // Cartoon dizzy star chimes
    const notes = [1046.5, 880, 987.77, 783.99];
    notes.forEach((freq, idx) => {
      const start = now + 0.34 + idx * 0.11;
      const chime = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(freq, start);
      chimeGain.gain.setValueAtTime(0.09, start);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      chime.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chime.start(start);
      chime.stop(start + 0.15);
    });
  }

  public playRopeBoing(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.2);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  public playKOBell(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;
    [0, 0.18, 0.36].forEach((offset) => {
      const t = now + offset;
      const bell = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      bell.type = 'sine';
      bell.frequency.setValueAtTime(1180, t);
      harmonic.type = 'sine';
      harmonic.frequency.setValueAtTime(2368, t);

      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      bell.connect(gain);
      harmonic.connect(gain);
      gain.connect(ctx.destination);
      bell.start(t);
      harmonic.start(t);
      bell.stop(t + 0.3);
      harmonic.stop(t + 0.3);
    });
  }

  public playLaserCharge(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;
    const hum = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const gain = ctx.createGain();

    hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(160, now);
    hum.frequency.exponentialRampToValueAtTime(920, now + 0.36);

    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(320, now);
    harmonic.frequency.exponentialRampToValueAtTime(1840, now + 0.36);

    gain.gain.setValueAtTime(0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.32);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    hum.connect(gain);
    harmonic.connect(gain);
    gain.connect(ctx.destination);
    hum.start(now);
    harmonic.start(now);
    hum.stop(now + 0.43);
    harmonic.stop(now + 0.43);
  }

  public playLaserBeam(durationSec = 0.78): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;
    const beamOsc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    beamOsc.type = 'sawtooth';
    beamOsc.frequency.setValueAtTime(640, now);
    beamOsc.frequency.exponentialRampToValueAtTime(420, now + durationSec);

    subOsc.type = 'square';
    subOsc.frequency.setValueAtTime(155, now);
    subOsc.frequency.exponentialRampToValueAtTime(110, now + durationSec);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(28, now);
    lfoGain.gain.setValueAtTime(48, now);
    lfo.connect(lfoGain);
    lfoGain.connect(beamOsc.frequency);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.setValueAtTime(0.18, now + Math.max(0.1, durationSec - 0.14));
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    beamOsc.connect(gain);
    subOsc.connect(gain);
    gain.connect(ctx.destination);

    beamOsc.start(now);
    subOsc.start(now);
    lfo.start(now);
    beamOsc.stop(now + durationSec + 0.02);
    subOsc.stop(now + durationSec + 0.02);
    lfo.stop(now + durationSec + 0.02);
  }

  public playLaserBurnExplosion(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;
    const boom = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boom.type = 'triangle';
    boom.frequency.setValueAtTime(210, now);
    boom.frequency.exponentialRampToValueAtTime(42, now + 0.34);
    boomGain.gain.setValueAtTime(0.32, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    boom.connect(boomGain);
    boomGain.connect(ctx.destination);
    boom.start(now);
    boom.stop(now + 0.37);

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1650, now);
      filter.frequency.exponentialRampToValueAtTime(480, now + 0.35);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.28, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.37);
    }
  }

  public playHeal(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  public playSignatureCharge(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;
    const sweep = ctx.createOscillator();
    const gain = ctx.createGain();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(180, now);
    sweep.frequency.exponentialRampToValueAtTime(980, now + 0.28);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);

    gain.gain.setValueAtTime(0.02, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    sweep.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    sweep.start(now);
    sweep.stop(now + 0.31);
  }

  public playSignatureImpact(): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Super slam bass drop
    const boom = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(260, now);
    boom.frequency.exponentialRampToValueAtTime(28, now + 0.45);
    boomGain.gain.setValueAtTime(0.65, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    boom.connect(boomGain);
    boomGain.connect(ctx.destination);
    boom.start(now);
    boom.stop(now + 0.49);

    if (this.noiseBuffer) {
      const blast = ctx.createBufferSource();
      blast.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1500, now);
      const blastGain = ctx.createGain();
      blastGain.gain.setValueAtTime(0.45, now);
      blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      blast.connect(bp);
      bp.connect(blastGain);
      blastGain.connect(ctx.destination);
      blast.start(now);
      blast.stop(now + 0.25);
    }

    // Triumphant power chord (C5 - G5 - C6)
    [523.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + 0.03 * idx);
      g.gain.setValueAtTime(0.11, now + 0.03 * idx);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + 0.03 * idx);
      osc.stop(now + 0.56);
    });
  }

  /** Sleek metallic hinge click + cyberpunk terminal boot chime when Priyanshu opens his laptop. */
  public playCyberLaptopOpen(): void {
    const ctx = this.canPlay();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (this.noiseBuffer) {
      const click = ctx.createBufferSource();
      click.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2400, now);
      bp.Q.setValueAtTime(2.5, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      click.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      click.start(now);
      click.stop(now + 0.065);
    }

    [440, 659.25, 987.77].forEach((freq, idx) => {
      const t = now + 0.06 + idx * 0.065;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.085, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  /** Tactile mechanical switch keystroke + faint terminal chirp while typing on the laptop. */
  public playKeyboardKeystroke(pitchScale = 1): void {
    const ctx = this.canPlay();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (this.noiseBuffer) {
      const snap = ctx.createBufferSource();
      snap.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(3200 * pitchScale, now);
      bp.Q.setValueAtTime(3.2, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
      snap.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      snap.start(now);
      snap.stop(now + 0.035);
    }

    const blip = ctx.createOscillator();
    const bg = ctx.createGain();
    blip.type = 'square';
    blip.frequency.setValueAtTime(760 * pitchScale, now);
    bg.gain.setValueAtTime(0.025, now);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
    blip.connect(bg);
    bg.connect(ctx.destination);
    blip.start(now);
    blip.stop(now + 0.03);
  }

  /** Deep execute breach + hissing aerosol poison cloud burst engulfing the opponent. */
  public playPoisonFogRelease(): void {
    const ctx = this.canPlay();
    if (!ctx) return;
    const now = ctx.currentTime;

    const drop = ctx.createOscillator();
    const dg = ctx.createGain();
    drop.type = 'sawtooth';
    drop.frequency.setValueAtTime(520, now);
    drop.frequency.exponentialRampToValueAtTime(74, now + 0.35);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, now);
    lp.frequency.exponentialRampToValueAtTime(280, now + 0.36);
    dg.gain.setValueAtTime(0.24, now);
    dg.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    drop.connect(lp);
    lp.connect(dg);
    dg.connect(ctx.destination);
    drop.start(now);
    drop.stop(now + 0.4);

    if (this.noiseBuffer) {
      const hiss = ctx.createBufferSource();
      hiss.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1150, now);
      bp.frequency.exponentialRampToValueAtTime(420, now + 0.85);
      bp.Q.setValueAtTime(1.1, now);
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.02, now);
      hg.gain.linearRampToValueAtTime(0.32, now + 0.12);
      hg.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      hiss.connect(bp);
      bp.connect(hg);
      hg.connect(ctx.destination);
      hiss.start(now);
      hiss.stop(now + 0.92);
    }
  }

  public playSpankSlap(isFinale = false): void {
    const ctx = this.canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Sharp open-palm contact crack (crisp high-mid snap + air cup)
    if (this.noiseBuffer) {
      const crack = ctx.createBufferSource();
      crack.buffer = this.noiseBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.15;
      bp.frequency.setValueAtTime(isFinale ? 2450 : 2850, now);
      bp.frequency.exponentialRampToValueAtTime(980, now + (isFinale ? 0.085 : 0.055));

      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(isFinale ? 0.72 : 0.56, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + (isFinale ? 0.11 : 0.068));

      crack.connect(bp);
      bp.connect(crackGain);
      crackGain.connect(ctx.destination);
      crack.start(now);
      crack.stop(now + 0.12);

      // Subtle sharp leather/skin sting tail
      const sting = ctx.createBufferSource();
      sting.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(3400, now);
      const stingGain = ctx.createGain();
      stingGain.gain.setValueAtTime(isFinale ? 0.34 : 0.24, now);
      stingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
      sting.connect(hp);
      hp.connect(stingGain);
      stingGain.connect(ctx.destination);
      sting.start(now);
      sting.stop(now + 0.048);
    }

    // 2. Heavy cupped-palm body thump
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(isFinale ? 230 : 250, now);
    thump.frequency.exponentialRampToValueAtTime(isFinale ? 52 : 76, now + (isFinale ? 0.12 : 0.075));
    thumpGain.gain.setValueAtTime(isFinale ? 0.58 : 0.42, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + (isFinale ? 0.14 : 0.085));
    thump.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    thump.start(now);
    thump.stop(now + 0.15);

    // 3. Punchy slap resonance impact transient
    const snap = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(isFinale ? 740 : 880, now);
    snap.frequency.exponentialRampToValueAtTime(160, now + 0.045);
    snapGain.gain.setValueAtTime(isFinale ? 0.28 : 0.18, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    snap.connect(snapGain);
    snapGain.connect(ctx.destination);
    snap.start(now);
    snap.stop(now + 0.055);
  }

  public playKissMwah(): void {
    this.withActiveContext((ctx) => {
      const now = ctx.currentTime;

      // 1. Soft warm breath intake & tender lip touch
      if (this.noiseBuffer) {
        const touchNoise = ctx.createBufferSource();
        touchNoise.buffer = this.noiseBuffer;

        const lp = ctx.createBiquadFilter();
        lp.type = 'bandpass';
        lp.Q.value = 1.8;
        lp.frequency.setValueAtTime(1400, now);
        lp.frequency.exponentialRampToValueAtTime(680, now + 0.08);

        const touchGain = ctx.createGain();
        touchGain.gain.setValueAtTime(0.01, now);
        touchGain.gain.linearRampToValueAtTime(0.18, now + 0.025);
        touchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        touchNoise.connect(lp);
        lp.connect(touchGain);
        touchGain.connect(ctx.destination);
        touchNoise.start(now);
        touchNoise.stop(now + 0.095);
      }

      // Warm subtle lip-parting sine pop (no harsh plastic click)
      const lipPop = ctx.createOscillator();
      const lipPopGain = ctx.createGain();
      lipPop.type = 'sine';
      lipPop.frequency.setValueAtTime(520, now + 0.02);
      lipPop.frequency.exponentialRampToValueAtTime(240, now + 0.09);
      lipPopGain.gain.setValueAtTime(0.01, now + 0.02);
      lipPopGain.gain.linearRampToValueAtTime(0.24, now + 0.04);
      lipPopGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      lipPop.connect(lipPopGain);
      lipPopGain.connect(ctx.destination);
      lipPop.start(now + 0.02);
      lipPop.stop(now + 0.12);

      // 2. Soft intimate heartbeat warmth underneath
      [0.05, 0.23].forEach((offset, idx) => {
        const beat = ctx.createOscillator();
        const beatGain = ctx.createGain();
        beat.type = 'sine';
        beat.frequency.setValueAtTime(idx === 0 ? 96 : 82, now + offset);
        beat.frequency.exponentialRampToValueAtTime(48, now + offset + 0.14);
        beatGain.gain.setValueAtTime(idx === 0 ? 0.18 : 0.13, now + offset);
        beatGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
        beat.connect(beatGain);
        beatGain.connect(ctx.destination);
        beat.start(now + offset);
        beat.stop(now + offset + 0.16);
      });

      // 3. Gentle warm breath exhale
      if (this.noiseBuffer) {
        const breath = ctx.createBufferSource();
        breath.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 2.6;
        bp.frequency.setValueAtTime(620, now + 0.05);
        bp.frequency.exponentialRampToValueAtTime(980, now + 0.18);
        const breathGain = ctx.createGain();
        breathGain.gain.setValueAtTime(0.11, now + 0.05);
        breathGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        breath.connect(bp);
        bp.connect(breathGain);
        breathGain.connect(ctx.destination);
        breath.start(now + 0.05);
        breath.stop(now + 0.25);
      }

      // 4. Tender major-9th celesta shimmer
      [523.25, 659.25, 783.99, 987.77, 1174.66].forEach((freq, idx) => {
        const t = now + 0.14 + idx * 0.085;
        const chime = ctx.createOscillator();
        const gain = ctx.createGain();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.005, t);
        gain.gain.linearRampToValueAtTime(0.09, t + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        chime.connect(gain);
        gain.connect(ctx.destination);
        chime.start(t);
        chime.stop(t + 0.46);
      });
    });
  }
}

