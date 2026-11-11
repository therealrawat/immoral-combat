import gsap from 'gsap';
import chinuFaceUrl from '../../chinu.jpeg';
import priyanshuFaceUrl from '../../priyanshu.jpeg';
import {
  MODIJI_PORTRAIT_DATA_URL,
  PUTIN_PORTRAIT_DATA_URL,
  TRUMP_PORTRAIT_DATA_URL,
} from '../characters/CharacterFactory';
import {
  CHARACTER_IDS,
  SELECT_ROSTER_ORDER,
  getCharacterDisplayName,
  getCharacterUpperName,
  getFallbackOpponent,
} from '../characters/characterNames';
import {
  canSelectCharacter,
  getDefaultMatchup,
  isChinuUnlocked,
  isSacredCharacter,
  tryUnlockChinu,
} from '../characters/chinuAccess';
import { getAvailableCharacterIdles, getAvailableStageIds } from '../characters/ModelAssetRegistry';
import { getStageDisplayName } from '../core/ArenaBuilder';
import {
  CharacterId,
  DifficultyLevel,
  FighterHUDInfo,
  GameHUDState,
  SelectIdleVariant,
  SelectRosterSlotId,
} from '../types/game';

const PORTRAIT_MAP: Record<CharacterId, string> = {
  chinu: chinuFaceUrl,
  priyanshu: priyanshuFaceUrl,
  modiji: MODIJI_PORTRAIT_DATA_URL,
  trump: TRUMP_PORTRAIT_DATA_URL,
  putin: PUTIN_PORTRAIT_DATA_URL,
};

type RosterSlotId = SelectRosterSlotId;
const ROSTER_ORDER = SELECT_ROSTER_ORDER;

const SELECT_FIGHTER_STATIC_META: Record<
  CharacterId,
  { epithet: string; metaText: string }
> = {
  chinu: {
    epithet: 'Unstoppable Real Boss',
    metaText: 'REAL BOSS • ∞ HP',
  },
  priyanshu: {
    epithet: 'Spirited Challenger',
    metaText: 'CHALLENGER • 100 HP',
  },
  modiji: {
    epithet: 'Vishwaguru',
    metaText: 'VISHWAGURU • 100 HP',
  },
  trump: {
    epithet: 'Supreme Pontiff of Pain',
    metaText: 'PONTIFF • 100 HP',
  },
  putin: {
    epithet: 'Iron Kremlin Strategist',
    metaText: 'STRATEGIST • 100 HP',
  },
};

interface FighterHUDSlotElements {
  card: HTMLElement;
  avatar: HTMLElement;
  avatarImg: HTMLImageElement;
  name: HTMLElement;
  tag: HTMLElement;
  badge: HTMLElement;
  track: HTMLElement;
  trail: HTMLElement;
  fill: HTMLElement;
  healthText: HTMLElement;
}

export interface UIActionHandlers {
  onPrimaryAction: () => void;
  onKickAction: () => void;
  onSignatureAction: () => void;
  onSecondarySignatureAction?: () => void;
  onCounterAction: () => void;
  onMuayThaiAction: () => void;
  onBossPoseAction: () => void;
  onLoungePoseAction: () => void;
  onChampPoseAction: () => void;
  onRingEntryAction: () => void;
  onSelectCharacter: (character: CharacterId) => void;
  onSelectOpponent: (opponent: CharacterId) => void;
  onSelectMatchup: (player: CharacterId, opponent: CharacterId) => void;
  onSelectStage?: (stageId: string) => void;
  onSelectDifficulty?: (difficulty: DifficultyLevel) => void;
  onControlsGuideToggled?: (open: boolean) => void;
  onPreviewSelectFighter: (
    side: 'p1' | 'cpu',
    character: CharacterId,
    variant: SelectIdleVariant,
    animateEntrance?: boolean
  ) => void;
  onSelectModalOpened?: () => void;
  onSelectModalClosed?: () => void;
  onRematch?: () => void;
  onHealPriyanshu: () => void;
  onToggleMute: () => void;
  onMoveInput: (x: number, z: number) => void;
  onCanvasPointerDown: (clientX: number, clientY: number) => void;
  onUserGesture: () => void;
}

/**
 * Pure HTML/CSS overlay & input controller separated cleanly from WebGL / physics code.
 */
export class UIManager {
  private readonly handlers: UIActionHandlers;
  private readonly canvas: HTMLCanvasElement;

  private readonly leftSlot: FighterHUDSlotElements = {
    card: document.getElementById('hud-left')!,
    avatar: document.getElementById('hud-left-avatar')!,
    avatarImg: document.getElementById('hud-left-avatar-img') as HTMLImageElement,
    name: document.getElementById('hud-left-name')!,
    tag: document.getElementById('hud-left-tag')!,
    badge: document.getElementById('badge-active-left')!,
    track: document.getElementById('hud-left-track')!,
    trail: document.getElementById('hud-left-trail')!,
    fill: document.getElementById('hud-left-fill')!,
    healthText: document.getElementById('hud-left-health-text')!,
  };

  private readonly rightSlot: FighterHUDSlotElements = {
    card: document.getElementById('hud-right')!,
    avatar: document.getElementById('hud-right-avatar')!,
    avatarImg: document.getElementById('hud-right-avatar-img') as HTMLImageElement,
    name: document.getElementById('hud-right-name')!,
    tag: document.getElementById('hud-right-tag')!,
    badge: document.getElementById('badge-active-right')!,
    track: document.getElementById('hud-right-track')!,
    trail: document.getElementById('hud-right-trail')!,
    fill: document.getElementById('hud-right-fill')!,
    healthText: document.getElementById('hud-right-health-text')!,
  };

  private readonly quipBubble = document.getElementById('quip-bubble')!;
  private readonly damageVignette = document.getElementById('damage-vignette');
  private readonly selectRosterGrid = document.getElementById('select-roster-grid')!;

  private readonly availableStageIds: readonly string[];
  private activeStageId = '';
  private activeDifficulty: DifficultyLevel = 'medium';

  private readonly btnSoundToggle = document.getElementById('btn-sound-toggle')!;
  private readonly btnOpenSelect = document.getElementById('btn-open-select')!;
  private readonly btnHealFighters = document.getElementById('btn-heal-fighters');
  private readonly btnControlsGuide = document.getElementById('btn-controls-guide');
  private readonly controlsGuideBackdrop = document.getElementById('controls-guide-backdrop');
  private readonly btnCloseControlsGuide = document.getElementById('btn-close-controls-guide');
  private readonly sacredUnlockBackdrop = document.getElementById('sacred-unlock-backdrop');
  private readonly sacredUnlockCard = document.querySelector<HTMLElement>('.sacred-unlock-card');
  private readonly sacredUnlockForm = document.getElementById('sacred-unlock-form') as HTMLFormElement | null;
  private readonly sacredUnlockInput = document.getElementById('sacred-unlock-input') as HTMLInputElement | null;
  private readonly sacredUnlockToggle = document.getElementById('sacred-unlock-toggle') as HTMLButtonElement | null;
  private readonly sacredUnlockCancel = document.getElementById('sacred-unlock-cancel') as HTMLButtonElement | null;
  private readonly sacredUnlockError = document.getElementById('sacred-unlock-error');
  private readonly selectDifficultyPills = document.getElementById('select-difficulty-pills');
  private readonly selectStagePills = document.getElementById('select-stage-pills');
  private readonly selectCtrlGuide = document.getElementById('select-ctrl-guide');

  private readonly uiOverlay = document.getElementById('ui-overlay')!;
  private readonly charModalBackdrop = document.getElementById('char-modal-backdrop')!;
  private readonly selectStageP1 = document.getElementById('select-stage-p1')!;
  private readonly selectStageCpu = document.getElementById('select-stage-cpu')!;
  private readonly selectP1Epithet = document.getElementById('select-p1-epithet')!;
  private readonly selectP1Name = document.getElementById('select-p1-name')!;
  private readonly selectCpuEpithet = document.getElementById('select-cpu-epithet')!;
  private readonly selectCpuName = document.getElementById('select-cpu-name')!;
  private readonly selectP1Idle1 = document.getElementById('select-p1-idle-1') as HTMLButtonElement;
  private readonly selectP1Idle2 = document.getElementById('select-p1-idle-2') as HTMLButtonElement;
  private readonly selectCpuIdle1 = document.getElementById('select-cpu-idle-1') as HTMLButtonElement;
  private readonly selectCpuIdle2 = document.getElementById('select-cpu-idle-2') as HTMLButtonElement;
  private readonly selectTabP1 = document.getElementById('select-tab-p1')!;
  private readonly selectTabCpu = document.getElementById('select-tab-cpu')!;
  private readonly selectP1Meta = document.getElementById('select-p1-meta')!;
  private readonly selectCpuMeta = document.getElementById('select-cpu-meta')!;
  private readonly selectPromptText = document.getElementById('select-prompt-text')!;
  private readonly selectStanceLabel = document.getElementById('select-stance-label')!;
  private readonly selectCtrlConfirm = document.getElementById('select-ctrl-confirm')!;
  private readonly selectCtrlStance = document.getElementById('select-ctrl-stance')!;
  private readonly selectCtrlBack = document.getElementById('select-ctrl-back')!;
  private readonly selectCtrlStage = document.getElementById('select-ctrl-stage');
  private readonly selectStageLabel = document.getElementById('select-stage-label');
  private readonly selectCtrlFight = document.getElementById('select-ctrl-fight')!;
  private readonly selectP1Loading = document.getElementById('select-p1-loading');
  private readonly selectP1LoadingText = document.getElementById('select-p1-loading-text');
  private readonly selectCpuLoading = document.getElementById('select-cpu-loading');
  private readonly selectCpuLoadingText = document.getElementById('select-cpu-loading-text');

  private readonly initialLoader = document.getElementById('initial-loader');
  private readonly initialLoaderTitle = document.getElementById('initial-loader-title');
  private readonly initialLoaderStatus = document.getElementById('initial-loader-status');
  private readonly initialLoaderFill = document.getElementById('initial-loader-fill');
  private readonly initialLoaderPercent = document.getElementById('initial-loader-percent');

  private readonly matchLoader = document.getElementById('match-loader');
  private readonly matchLoaderTitle = document.getElementById('match-loader-title');
  private readonly matchLoaderStatus = document.getElementById('match-loader-status');
  private readonly matchLoaderFill = document.getElementById('match-loader-fill');
  private readonly matchLoaderPercent = document.getElementById('match-loader-percent');

  private readonly rosterTiles = {} as Record<RosterSlotId, HTMLButtonElement>;
  private readonly rosterImages = {} as Record<CharacterId, HTMLImageElement>;
  private readonly rosterP1Badges = {} as Record<RosterSlotId, HTMLElement>;
  private readonly rosterCpuBadges = {} as Record<RosterSlotId, HTMLElement>;
  private rosterSacredLockBadge?: HTMLElement;

  private readonly bossToastBackdrop = document.getElementById('boss-toast-backdrop')!;
  private readonly bossToast = document.getElementById('boss-toast')!;
  private readonly koBanner = document.getElementById('ko-banner')!;
  private readonly koTitle = document.getElementById('ko-title')!;
  private readonly koSub = document.getElementById('ko-sub')!;
  private readonly btnMatchRematch = document.getElementById('btn-match-rematch') as HTMLButtonElement | null;
  private readonly p1SignatureLabel = document.getElementById('hud-p1-signature-label');
  private readonly p2SignatureLabel = document.getElementById('hud-p2-signature-label');

  private readonly pressedKeys = new Set<string>();
  private toastTimeline?: gsap.core.Timeline;
  private quipHideTimer?: number;
  private hoverPreviewTimer?: number;
  private lastQuip = '';
  private movementLocked = false;
  private pendingUnlockSlot: 'p1' | 'cpu' | null = null;

  private readonly initialDefaults = getDefaultMatchup();
  private selectActiveSlot: 'p1' | 'cpu' = 'p1';
  private selectP1: CharacterId = this.initialDefaults.player;
  private selectCpu: CharacterId = this.initialDefaults.opponent;
  private selectP1Idle: SelectIdleVariant = 'idle-1';
  private selectCpuIdle: SelectIdleVariant = 'idle-1';
  private selectCursorSlot: RosterSlotId = this.initialDefaults.player;
  private lastKnownPlayer: CharacterId = this.initialDefaults.player;
  private lastKnownOpponent: CharacterId = this.initialDefaults.opponent;

  constructor(canvas: HTMLCanvasElement, handlers: UIActionHandlers) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.availableStageIds = getAvailableStageIds();
    this.activeStageId = this.availableStageIds[0] ?? 'stage-1';
    this.selectCtrlStage?.classList.toggle('hidden', this.availableStageIds.length <= 1);
    this.buildRosterGrid();
    this.buildStagePills();
    this.populateAvatars();
    this.bindEvents();
    this.renderSelectScreen();
  }

  private buildStagePills(): void {
    if (!this.selectStagePills) return;
    this.selectStagePills.replaceChildren();
    for (const stageId of this.availableStageIds) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'select-setup-pill';
      btn.dataset.stageId = stageId;
      btn.textContent = getStageDisplayName(stageId).toUpperCase();
      btn.addEventListener('click', () => {
        this.handlers.onUserGesture();
        btn.blur();
        this.selectStageById(stageId);
      });
      this.selectStagePills.appendChild(btn);
    }
  }

  private buildRosterGrid(): void {
    this.selectRosterGrid.replaceChildren();
    ROSTER_ORDER.forEach((slotId) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = slotId === 'random' ? 'roster-tile roster-tile--random' : 'roster-tile';
      tile.id = `roster-tile-${slotId}`;
      tile.dataset.rosterId = slotId;

      const p1Badge = document.createElement('span');
      p1Badge.className = 'roster-cursor roster-cursor--p1 hidden';
      p1Badge.id = `roster-badge-p1-${slotId}`;
      p1Badge.textContent = 'P1';

      const cpuBadge = document.createElement('span');
      cpuBadge.className = 'roster-cursor roster-cursor--cpu hidden';
      cpuBadge.id = `roster-badge-cpu-${slotId}`;
      cpuBadge.textContent = 'CPU';

      tile.append(p1Badge, cpuBadge);

      if (slotId === 'random') {
        const q = document.createElement('div');
        q.className = 'roster-random-q';
        q.textContent = '?';
        const label = document.createElement('span');
        label.className = 'roster-label';
        label.textContent = 'RANDOM';
        tile.append(q, label);
      } else {
        const img = document.createElement('img');
        img.className = 'roster-portrait';
        img.id = `roster-img-${slotId}`;
        img.alt = getCharacterDisplayName(slotId);
        const label = document.createElement('span');
        label.className = 'roster-label';
        label.textContent = getCharacterUpperName(slotId);
        tile.append(img, label);
        if (isSacredCharacter(slotId)) {
          const lockBadge = document.createElement('span');
          lockBadge.className = 'roster-sacred-lock hidden';
          lockBadge.id = `roster-lock-${slotId}`;
          lockBadge.textContent = '🔒 LOCKED';
          tile.appendChild(lockBadge);
          this.rosterSacredLockBadge = lockBadge;
        }
        this.rosterImages[slotId] = img;
      }

      this.selectRosterGrid.appendChild(tile);
      this.rosterTiles[slotId] = tile;
      this.rosterP1Badges[slotId] = p1Badge;
      this.rosterCpuBadges[slotId] = cpuBadge;
    });
  }

  private populateAvatars(): void {
    CHARACTER_IDS.forEach((id) => {
      this.rosterImages[id].src = PORTRAIT_MAP[id];
    });

    this.leftSlot.avatarImg.src = PORTRAIT_MAP[this.selectP1];
    this.leftSlot.name.textContent = getCharacterUpperName(this.selectP1);
    this.rightSlot.avatarImg.src = PORTRAIT_MAP[this.selectCpu];
    this.rightSlot.name.textContent = getCharacterUpperName(this.selectCpu);
  }

  public setFighterPortraits(portraits: Partial<Record<CharacterId, string>>): void {
    CHARACTER_IDS.forEach((id) => {
      const url = portraits[id];
      if (url) {
        this.rosterImages[id].src = url;
      }
    });
  }

  private bindEvents(): void {
    const unlockAndBlur = (el?: HTMLElement) => {
      this.handlers.onUserGesture();
      el?.blur();
    };

    this.bindSelectScreenEvents();

    this.btnSoundToggle.addEventListener('click', () => {
      unlockAndBlur(this.btnSoundToggle);
      this.handlers.onToggleMute();
    });

    this.btnOpenSelect.addEventListener('click', () => {
      unlockAndBlur(this.btnOpenSelect);
      this.setModalOpen(true);
    });

    this.btnHealFighters?.addEventListener('click', () => {
      if (this.btnHealFighters) unlockAndBlur(this.btnHealFighters);
      this.handlers.onHealPriyanshu();
    });

    this.btnControlsGuide?.addEventListener('click', () => {
      if (this.btnControlsGuide) unlockAndBlur(this.btnControlsGuide);
      this.toggleControlsGuide();
    });

    this.selectCtrlGuide?.addEventListener('click', () => {
      unlockAndBlur(this.selectCtrlGuide as HTMLElement);
      this.toggleControlsGuide();
    });

    this.btnCloseControlsGuide?.addEventListener('click', () => {
      if (this.btnCloseControlsGuide) unlockAndBlur(this.btnCloseControlsGuide);
      this.setControlsGuideOpen(false);
    });

    this.controlsGuideBackdrop?.addEventListener('click', (event) => {
      if (event.target === this.controlsGuideBackdrop) {
        this.setControlsGuideOpen(false);
      }
    });

    this.sacredUnlockForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handlers.onUserGesture();
      this.handleSacredUnlockSubmit();
    });

    this.sacredUnlockCancel?.addEventListener('click', () => {
      if (this.sacredUnlockCancel) unlockAndBlur(this.sacredUnlockCancel);
      this.closeSacredUnlockModal();
    });

    this.sacredUnlockBackdrop?.addEventListener('click', (event) => {
      if (event.target === this.sacredUnlockBackdrop) {
        this.closeSacredUnlockModal();
      }
    });

    this.sacredUnlockToggle?.addEventListener('click', () => {
      if (!this.sacredUnlockInput || !this.sacredUnlockToggle) return;
      const showing = this.sacredUnlockInput.type === 'text';
      this.sacredUnlockInput.type = showing ? 'password' : 'text';
      this.sacredUnlockToggle.textContent = showing ? 'SHOW' : 'HIDE';
      this.sacredUnlockInput.focus();
    });

    this.sacredUnlockInput?.addEventListener('input', () => {
      this.sacredUnlockError?.classList.add('hidden');
    });

    this.btnMatchRematch?.addEventListener('click', () => {
      if (this.btnMatchRematch) unlockAndBlur(this.btnMatchRematch);
      this.handlers.onRematch?.();
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      this.handlers.onUserGesture();
      this.handlers.onCanvasPointerDown(event.clientX, event.clientY);
    });

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  private bindSelectScreenEvents(): void {
    const unlockAndBlur = (el?: HTMLElement) => {
      this.handlers.onUserGesture();
      el?.blur();
    };

    this.selectStageP1.addEventListener('click', () => {
      unlockAndBlur(this.selectStageP1);
      this.setActiveSelectSlot('p1');
    });

    this.selectStageCpu.addEventListener('click', () => {
      unlockAndBlur(this.selectStageCpu);
      this.setActiveSelectSlot('cpu');
    });

    this.selectTabP1.addEventListener('click', () => {
      unlockAndBlur(this.selectTabP1);
      this.setActiveSelectSlot('p1');
    });

    this.selectTabCpu.addEventListener('click', () => {
      unlockAndBlur(this.selectTabCpu);
      this.setActiveSelectSlot('cpu');
    });

    this.selectP1Idle1.addEventListener('click', () => {
      unlockAndBlur(this.selectP1Idle1);
      this.setSideIdleVariant('p1', 'idle-1');
    });

    this.selectP1Idle2.addEventListener('click', () => {
      unlockAndBlur(this.selectP1Idle2);
      this.setSideIdleVariant('p1', 'idle-2');
    });

    this.selectCpuIdle1.addEventListener('click', () => {
      unlockAndBlur(this.selectCpuIdle1);
      this.setSideIdleVariant('cpu', 'idle-1');
    });

    this.selectCpuIdle2.addEventListener('click', () => {
      unlockAndBlur(this.selectCpuIdle2);
      this.setSideIdleVariant('cpu', 'idle-2');
    });

    ROSTER_ORDER.forEach((slotId) => {
      const tile = this.rosterTiles[slotId];
      tile.addEventListener('pointerenter', () => {
        this.previewRosterCursor(slotId, true);
      });
      tile.addEventListener('pointerleave', () => {
        this.cancelPendingHoverPreview();
      });
      tile.addEventListener('click', () => {
        unlockAndBlur(tile);
        this.cancelPendingHoverPreview();
        this.confirmRosterSlot(slotId);
      });
    });

    this.selectCtrlConfirm.addEventListener('click', () => {
      unlockAndBlur(this.selectCtrlConfirm as HTMLElement);
      this.confirmRosterSlot(this.selectCursorSlot);
    });

    this.selectCtrlStance.addEventListener('click', () => {
      unlockAndBlur(this.selectCtrlStance as HTMLElement);
      this.toggleActiveSideStance();
    });

    this.selectCtrlBack.addEventListener('click', () => {
      unlockAndBlur(this.selectCtrlBack as HTMLElement);
      this.handleSelectBack();
    });

    this.selectCtrlStage?.addEventListener('click', () => {
      unlockAndBlur(this.selectCtrlStage as HTMLElement);
      this.cycleStageSelection();
    });

    this.selectDifficultyPills
      ?.querySelectorAll<HTMLButtonElement>('[data-difficulty]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          unlockAndBlur(btn);
          const level = btn.dataset.difficulty as DifficultyLevel | undefined;
          if (level) {
            this.selectDifficulty(level);
          }
        });
      });

    this.selectCtrlFight.addEventListener('click', () => {
      unlockAndBlur(this.selectCtrlFight as HTMLElement);
      this.launchSelectedMatchup();
    });
  }

  private selectStageById(stageId: string): void {
    const normalized = stageId.toLowerCase();
    if (!this.availableStageIds.includes(normalized) || normalized === this.activeStageId) return;
    this.activeStageId = normalized;
    this.handlers.onSelectStage?.(normalized);
    this.renderSelectScreen();
  }

  private selectDifficulty(level: DifficultyLevel): void {
    if (level === this.activeDifficulty) return;
    this.activeDifficulty = level;
    this.handlers.onSelectDifficulty?.(level);
    this.renderSelectScreen();
  }

  private cycleStageSelection(): void {
    if (this.availableStageIds.length <= 1) return;
    const idx = this.availableStageIds.indexOf(this.activeStageId);
    const nextStage = this.availableStageIds[(idx + 1) % this.availableStageIds.length];
    this.selectStageById(nextStage);
  }

  private setActiveSelectSlot(slot: 'p1' | 'cpu'): void {
    this.selectActiveSlot = slot;
    this.selectCursorSlot = slot === 'p1' ? this.selectP1 : this.selectCpu;
    this.renderSelectScreen();
  }

  private setSideIdleVariant(side: 'p1' | 'cpu', variant: SelectIdleVariant): void {
    const charId = side === 'p1' ? this.selectP1 : this.selectCpu;
    const available = getAvailableCharacterIdles(charId);
    const effective = available.includes(variant) ? variant : 'idle-1';
    if (side === 'p1') {
      this.selectP1Idle = effective;
    } else {
      this.selectCpuIdle = effective;
    }
    this.handlers.onPreviewSelectFighter(side, charId, effective, true);
    this.renderSelectScreen();
  }

  private toggleActiveSideStance(): void {
    const activeChar = this.selectActiveSlot === 'p1' ? this.selectP1 : this.selectCpu;
    const activeAvailable = getAvailableCharacterIdles(activeChar);
    if (activeAvailable.length > 1) {
      const curr = this.selectActiveSlot === 'p1' ? this.selectP1Idle : this.selectCpuIdle;
      this.setSideIdleVariant(this.selectActiveSlot, curr === 'idle-1' ? 'idle-2' : 'idle-1');
      return;
    }

    const otherSide: 'p1' | 'cpu' = this.selectActiveSlot === 'p1' ? 'cpu' : 'p1';
    const otherChar = otherSide === 'p1' ? this.selectP1 : this.selectCpu;
    if (getAvailableCharacterIdles(otherChar).length > 1) {
      const curr = otherSide === 'p1' ? this.selectP1Idle : this.selectCpuIdle;
      this.setSideIdleVariant(otherSide, curr === 'idle-1' ? 'idle-2' : 'idle-1');
    }
  }

  public isUnlockModalOpen(): boolean {
    return Boolean(
      this.sacredUnlockBackdrop && !this.sacredUnlockBackdrop.classList.contains('hidden')
    );
  }

  private openSacredUnlockModal(slot: 'p1' | 'cpu'): void {
    if (!this.sacredUnlockBackdrop) return;
    this.pendingUnlockSlot = slot;
    this.pressedKeys.clear();
    this.handlers.onMoveInput(0, 0);
    this.sacredUnlockError?.classList.add('hidden');
    if (this.sacredUnlockInput) {
      this.sacredUnlockInput.type = 'password';
      this.sacredUnlockInput.value = '';
    }
    if (this.sacredUnlockToggle) {
      this.sacredUnlockToggle.textContent = 'SHOW';
    }
    this.sacredUnlockBackdrop.classList.remove('hidden');
    this.sacredUnlockInput?.focus();
  }

  private closeSacredUnlockModal(): void {
    this.pendingUnlockSlot = null;
    this.sacredUnlockError?.classList.add('hidden');
    if (this.sacredUnlockInput) {
      this.sacredUnlockInput.value = '';
      this.sacredUnlockInput.type = 'password';
      this.sacredUnlockInput.blur();
    }
    if (this.sacredUnlockToggle) {
      this.sacredUnlockToggle.textContent = 'SHOW';
    }
    this.sacredUnlockBackdrop?.classList.add('hidden');
  }

  private handleSacredUnlockSubmit(): void {
    const raw = this.sacredUnlockInput?.value ?? '';
    if (!tryUnlockChinu(raw)) {
      this.sacredUnlockError?.classList.remove('hidden');
      if (this.sacredUnlockCard) {
        gsap.killTweensOf(this.sacredUnlockCard);
        gsap.fromTo(
          this.sacredUnlockCard,
          { x: -10 },
          { x: 0, duration: 0.36, ease: 'elastic.out(1.2, 0.35)' }
        );
      }
      this.sacredUnlockInput?.focus();
      return;
    }

    const targetSlot = this.pendingUnlockSlot ?? this.selectActiveSlot;
    this.closeSacredUnlockModal();
    this.selectActiveSlot = targetSlot;
    this.confirmRosterSlot('chinu');
    this.selectPromptText.textContent = 'SACRED CHINU UNLOCKED! 👑';
  }

  public getActiveStageId(): string {
    return this.activeStageId;
  }

  public isInitialLoaderOpen(): boolean {
    return Boolean(this.initialLoader && !this.initialLoader.classList.contains('hidden'));
  }

  public isMatchLoaderOpen(): boolean {
    return Boolean(this.matchLoader && !this.matchLoader.classList.contains('hidden'));
  }

  public setInitialLoaderProgress(percent: number, status?: string, title?: string): void {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (this.initialLoaderFill) {
      this.initialLoaderFill.style.width = `${clamped}%`;
    }
    if (this.initialLoaderPercent) {
      this.initialLoaderPercent.textContent = `${clamped}%`;
    }
    if (status && this.initialLoaderStatus) {
      this.initialLoaderStatus.textContent = status;
    }
    if (title && this.initialLoaderTitle) {
      this.initialLoaderTitle.textContent = title;
    }
  }

  public hideInitialLoader(): void {
    if (!this.initialLoader) return;
    this.initialLoader.classList.add('hidden');
    this.initialLoader.setAttribute('aria-hidden', 'true');
  }

  public setMatchLoaderState(
    visible: boolean,
    percent = 0,
    status?: string,
    title?: string
  ): void {
    if (!this.matchLoader) return;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    this.matchLoader.classList.toggle('hidden', !visible);
    this.matchLoader.setAttribute('aria-hidden', String(!visible));
    if (this.matchLoaderFill) {
      this.matchLoaderFill.style.width = `${clamped}%`;
    }
    if (this.matchLoaderPercent) {
      this.matchLoaderPercent.textContent = `${clamped}%`;
    }
    if (status && this.matchLoaderStatus) {
      this.matchLoaderStatus.textContent = status;
    }
    if (title && this.matchLoaderTitle) {
      this.matchLoaderTitle.textContent = title;
    }
  }

  public setSelectSideLoading(
    side: 'p1' | 'cpu',
    loading: boolean,
    label?: string
  ): void {
    const badge = side === 'p1' ? this.selectP1Loading : this.selectCpuLoading;
    const text = side === 'p1' ? this.selectP1LoadingText : this.selectCpuLoadingText;
    if (!badge) return;
    badge.classList.toggle('hidden', !loading);
    if (label && text) {
      text.textContent = label;
    }
  }

  private cancelPendingHoverPreview(): void {
    if (this.hoverPreviewTimer) {
      clearTimeout(this.hoverPreviewTimer);
      this.hoverPreviewTimer = undefined;
    }
  }

  private previewRosterCursor(slotId: RosterSlotId, debounce3D = false): void {
    if (this.selectCursorSlot === slotId) return;
    this.selectCursorSlot = slotId;
    this.cancelPendingHoverPreview();

    if (!debounce3D) {
      this.applyCursorFighterPreview(slotId);
      this.renderSelectScreen();
      return;
    }

    // Immediate highlight cursor feedback; wait 120ms dwell before downloading 3D GLB showcase assets.
    this.renderSelectScreen();
    this.hoverPreviewTimer = window.setTimeout(() => {
      this.hoverPreviewTimer = undefined;
      if (!this.isModalOpen() || this.selectCursorSlot !== slotId) return;
      this.applyCursorFighterPreview(slotId);
      this.renderSelectScreen();
    }, 120);
  }

  private applyCursorFighterPreview(slotId: RosterSlotId): void {
    if (slotId !== 'random' && canSelectCharacter(slotId)) {
      if (this.selectActiveSlot === 'p1') {
        if (this.selectP1 !== slotId) {
          this.selectP1 = slotId;
          if (!getAvailableCharacterIdles(this.selectP1).includes(this.selectP1Idle)) {
            this.selectP1Idle = 'idle-1';
          }
          if (this.selectCpu === this.selectP1) {
            this.selectCpu = getFallbackOpponent(this.selectP1);
            if (!getAvailableCharacterIdles(this.selectCpu).includes(this.selectCpuIdle)) {
              this.selectCpuIdle = 'idle-1';
            }
            this.handlers.onPreviewSelectFighter('cpu', this.selectCpu, this.selectCpuIdle, false);
          }
          this.handlers.onPreviewSelectFighter('p1', this.selectP1, this.selectP1Idle, true);
        }
      } else if (slotId !== this.selectP1 && this.selectCpu !== slotId) {
        this.selectCpu = slotId;
        if (!getAvailableCharacterIdles(this.selectCpu).includes(this.selectCpuIdle)) {
          this.selectCpuIdle = 'idle-1';
        }
        this.handlers.onPreviewSelectFighter('cpu', this.selectCpu, this.selectCpuIdle, true);
      }
    }
  }

  private pickRandomCharacter(exclude?: CharacterId): CharacterId {
    const unlockedIds = CHARACTER_IDS.filter((id) => canSelectCharacter(id));
    const pool = exclude ? unlockedIds.filter((id) => id !== exclude) : unlockedIds;
    return pool[Math.floor(Math.random() * pool.length)] ?? 'priyanshu';
  }

  private confirmRosterSlot(slotId: RosterSlotId): void {
    if (slotId !== 'random' && !canSelectCharacter(slotId)) {
      this.openSacredUnlockModal(this.selectActiveSlot);
      return;
    }

    const chosen: CharacterId =
      slotId === 'random'
        ? this.pickRandomCharacter(this.selectActiveSlot === 'cpu' ? this.selectP1 : undefined)
        : slotId;

    if (!canSelectCharacter(chosen)) {
      this.openSacredUnlockModal(this.selectActiveSlot);
      return;
    }

    if (this.selectActiveSlot === 'p1') {
      this.selectP1 = chosen;
      if (!getAvailableCharacterIdles(this.selectP1).includes(this.selectP1Idle)) {
        this.selectP1Idle = 'idle-1';
      }
      if (this.selectCpu === this.selectP1) {
        this.selectCpu = getFallbackOpponent(this.selectP1);
        if (!getAvailableCharacterIdles(this.selectCpu).includes(this.selectCpuIdle)) {
          this.selectCpuIdle = 'idle-1';
        }
        this.handlers.onPreviewSelectFighter('cpu', this.selectCpu, this.selectCpuIdle, false);
      }
      this.handlers.onPreviewSelectFighter('p1', this.selectP1, this.selectP1Idle, true);
      this.selectActiveSlot = 'cpu';
      this.selectCursorSlot = this.selectCpu;
      this.renderSelectScreen();
      return;
    }

    if (chosen === this.selectP1) {
      this.selectPromptText.textContent = 'PICK A DIFFERENT OPPONENT!';
      gsap.fromTo(
        this.selectPromptText,
        { scale: 1.08 },
        { scale: 1, duration: 0.25, ease: 'back.out(2)' }
      );
      return;
    }

    this.selectCpu = chosen;
    if (!getAvailableCharacterIdles(this.selectCpu).includes(this.selectCpuIdle)) {
      this.selectCpuIdle = 'idle-1';
    }
    this.launchSelectedMatchup();
  }

  private handleSelectBack(): void {
    if (this.selectActiveSlot === 'cpu') {
      this.setActiveSelectSlot('p1');
      return;
    }
    this.setModalOpen(false);
  }

  private launchSelectedMatchup(): void {
    if (!canSelectCharacter(this.selectP1)) {
      this.openSacredUnlockModal('p1');
      return;
    }
    if (!canSelectCharacter(this.selectCpu)) {
      this.openSacredUnlockModal('cpu');
      return;
    }
    this.handlers.onSelectMatchup(this.selectP1, this.selectCpu);
    this.setModalOpen(false);
  }

  private renderSelectScreen(): void {
    const chinuUnlocked = isChinuUnlocked();
    const p1Meta = SELECT_FIGHTER_STATIC_META[this.selectP1];
    const cpuMeta = SELECT_FIGHTER_STATIC_META[this.selectCpu];

    this.selectP1Epithet.textContent = p1Meta.epithet;
    this.selectP1Name.textContent = getCharacterUpperName(this.selectP1);
    this.selectP1Meta.textContent = p1Meta.metaText;

    this.selectCpuEpithet.textContent = cpuMeta.epithet;
    this.selectCpuName.textContent = getCharacterUpperName(this.selectCpu);
    this.selectCpuMeta.textContent = cpuMeta.metaText;

    this.selectTabP1.classList.toggle('select-slot-plate--active', this.selectActiveSlot === 'p1');
    this.selectTabCpu.classList.toggle('select-slot-plate--active', this.selectActiveSlot === 'cpu');

    if (this.selectCursorSlot === 'chinu' && !chinuUnlocked) {
      this.selectPromptText.textContent = 'CHINU IS SACRED — CLICK / ENTER SECRET KEY 🔒';
    } else {
      this.selectPromptText.textContent =
        this.selectActiveSlot === 'p1' ? 'CHOOSE YOUR FIGHTER' : 'CHOOSE YOUR OPPONENT';
    }

    const p1HasIdle2 = getAvailableCharacterIdles(this.selectP1).includes('idle-2');
    const cpuHasIdle2 = getAvailableCharacterIdles(this.selectCpu).includes('idle-2');
    this.selectP1Idle2.disabled = !p1HasIdle2;
    this.selectCpuIdle2.disabled = !cpuHasIdle2;

    this.selectP1Idle1.classList.toggle('stance-pill--active', this.selectP1Idle === 'idle-1');
    this.selectP1Idle2.classList.toggle('stance-pill--active', this.selectP1Idle === 'idle-2');
    this.selectCpuIdle1.classList.toggle('stance-pill--active', this.selectCpuIdle === 'idle-1');
    this.selectCpuIdle2.classList.toggle('stance-pill--active', this.selectCpuIdle === 'idle-2');

    const activeVariant = this.selectActiveSlot === 'p1' ? this.selectP1Idle : this.selectCpuIdle;
    this.selectStanceLabel.textContent = `STANCE: ${activeVariant.toUpperCase().replace('-', ' ')}`;
    if (this.selectStageLabel) {
      this.selectStageLabel.textContent = `STAGE: ${getStageDisplayName(this.activeStageId).toUpperCase()}`;
    }
    this.syncSetupPills();

    const p1CursorSlot: RosterSlotId =
      this.selectActiveSlot === 'p1' && this.selectCursorSlot === 'random' ? 'random' : this.selectP1;
    const cpuCursorSlot: RosterSlotId =
      this.selectActiveSlot === 'cpu' && this.selectCursorSlot === 'random'
        ? 'random'
        : this.selectCpu;

    ROSTER_ORDER.forEach((slotId) => {
      const tile = this.rosterTiles[slotId];
      const isP1 = slotId === p1CursorSlot;
      const isCpu = slotId === cpuCursorSlot;
      const isLockedSacred = slotId === 'chinu' && !chinuUnlocked;
      const isFocusedSacred = slotId === 'chinu' && this.selectCursorSlot === 'chinu';
      tile.classList.toggle('roster-tile--p1', isP1 || (isLockedSacred && isFocusedSacred && this.selectActiveSlot === 'p1'));
      tile.classList.toggle('roster-tile--cpu', isCpu || (isLockedSacred && isFocusedSacred && this.selectActiveSlot === 'cpu'));
      tile.classList.toggle('roster-tile--sacred-locked', isLockedSacred);
      tile.classList.toggle(
        'roster-tile--locked-other',
        this.selectActiveSlot === 'cpu' && slotId === this.selectP1
      );
      this.rosterP1Badges[slotId].classList.toggle('hidden', !isP1);
      this.rosterCpuBadges[slotId].classList.toggle('hidden', !isCpu);
    });
    this.rosterSacredLockBadge?.classList.toggle('hidden', chinuUnlocked);
  }

  private syncSetupPills(): void {
    this.selectDifficultyPills
      ?.querySelectorAll<HTMLButtonElement>('[data-difficulty]')
      .forEach((btn) => {
        const isActive = btn.dataset.difficulty === this.activeDifficulty;
        btn.classList.toggle('select-setup-pill--active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });

    this.selectStagePills
      ?.querySelectorAll<HTMLButtonElement>('[data-stage-id]')
      .forEach((btn) => {
        const isActive = btn.dataset.stageId === this.activeStageId;
        btn.classList.toggle('select-setup-pill--active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
  }

  private handleSelectKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;

    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      event.preventDefault();
      const idx = ROSTER_ORDER.indexOf(this.selectCursorSlot);
      const next = ROSTER_ORDER[(idx - 1 + ROSTER_ORDER.length) % ROSTER_ORDER.length];
      this.previewRosterCursor(next);
      return;
    }

    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault();
      const idx = ROSTER_ORDER.indexOf(this.selectCursorSlot);
      const next = ROSTER_ORDER[(idx + 1) % ROSTER_ORDER.length];
      this.previewRosterCursor(next);
      return;
    }

    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      this.confirmRosterSlot(this.selectCursorSlot);
      return;
    }

    if (event.code === 'KeyQ') {
      event.preventDefault();
      this.toggleActiveSideStance();
      return;
    }

    if (event.code === 'Tab') {
      event.preventDefault();
      this.setActiveSelectSlot(this.selectActiveSlot === 'p1' ? 'cpu' : 'p1');
      return;
    }

    if (event.code === 'KeyT') {
      event.preventDefault();
      this.cycleStageSelection();
      return;
    }

    if (event.code === 'KeyF') {
      event.preventDefault();
      this.launchSelectedMatchup();
      return;
    }

    if (event.code === 'Escape') {
      event.preventDefault();
      this.handleSelectBack();
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.handlers.onUserGesture();

    if (this.isInitialLoaderOpen() || this.isMatchLoaderOpen()) {
      return;
    }

    if (this.isUnlockModalOpen()) {
      if (event.code === 'Escape') {
        event.preventDefault();
        this.closeSacredUnlockModal();
      }
      return;
    }

    const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
      return;
    }

    if ((event.code === 'KeyH' || event.code === 'F1') && !event.repeat) {
      event.preventDefault();
      this.toggleControlsGuide();
      return;
    }

    if (this.isControlsGuideOpen()) {
      if (event.code === 'Escape') {
        event.preventDefault();
        this.setControlsGuideOpen(false);
      }
      return;
    }

    if (this.isModalOpen()) {
      this.handleSelectKeyDown(event);
      return;
    }

    if (this.isMovementCode(event.code)) {
      this.pressedKeys.add(event.code);
      this.emitMovementVector();
      return;
    }

    if (event.repeat) return;

    if (
      event.code === 'KeyR' &&
      this.btnMatchRematch &&
      !this.btnMatchRematch.classList.contains('hidden')
    ) {
      event.preventDefault();
      this.handlers.onRematch?.();
      return;
    }

    const keyActionMap: Record<string, () => void> = {
      Space: () => this.handlers.onPrimaryAction(),
      KeyK: () => this.handlers.onKickAction(),
      KeyF: () => this.handlers.onSignatureAction(),
      KeyG: () => this.handlers.onSecondarySignatureAction?.(),
      KeyC: () => this.handlers.onCounterAction(),
      KeyM: () => this.handlers.onMuayThaiAction(),
      KeyP: () => this.handlers.onBossPoseAction(),
      KeyL: () => this.handlers.onLoungePoseAction(),
      KeyV: () => this.handlers.onChampPoseAction(),
      KeyE: () => this.handlers.onRingEntryAction(),
      KeyU: () => this.handlers.onHealPriyanshu(),
    };

    const actionHandler = keyActionMap[event.code];
    if (actionHandler) {
      if (event.code === 'Space') {
        event.preventDefault();
      }
      actionHandler();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (this.isModalOpen()) return;
    if (this.isMovementCode(event.code)) {
      this.pressedKeys.delete(event.code);
      this.emitMovementVector();
    }
  };

  private readonly handleWindowBlur = (): void => {
    this.pressedKeys.clear();
    this.handlers.onMoveInput(0, 0);
  };

  private isMovementCode(code: string): boolean {
    return (
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    );
  }

  private emitMovementVector(): void {
    if (this.movementLocked) {
      this.handlers.onMoveInput(0, 0);
      return;
    }
    const left = this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft') ? 1 : 0;
    const right = this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight') ? 1 : 0;
    const up = this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp') ? 1 : 0;
    const down = this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown') ? 1 : 0;
    this.handlers.onMoveInput(right - left, down - up);
  }

  public isControlsGuideOpen(): boolean {
    return Boolean(
      this.controlsGuideBackdrop && !this.controlsGuideBackdrop.classList.contains('hidden')
    );
  }

  public setControlsGuideOpen(open: boolean): void {
    if (!this.controlsGuideBackdrop) return;
    const wasOpen = this.isControlsGuideOpen();
    this.controlsGuideBackdrop.classList.toggle('hidden', !open);
    if (open) {
      this.pressedKeys.clear();
      this.handlers.onMoveInput(0, 0);
    }
    if (wasOpen !== open) {
      this.handlers.onControlsGuideToggled?.(open);
    }
  }

  public toggleControlsGuide(): void {
    this.setControlsGuideOpen(!this.isControlsGuideOpen());
  }

  public setModalOpen(open: boolean): void {
    this.setControlsGuideOpen(false);
    this.closeSacredUnlockModal();
    const wasOpen = this.isModalOpen();
    this.charModalBackdrop.classList.toggle('hidden', !open);
    this.uiOverlay.classList.toggle('ui-overlay--select-open', open);
    this.pressedKeys.clear();
    this.handlers.onMoveInput(0, 0);

    if (open) {
      const defaults = getDefaultMatchup();
      this.selectP1 = canSelectCharacter(this.lastKnownPlayer)
        ? this.lastKnownPlayer
        : defaults.player;
      this.selectCpu = canSelectCharacter(this.lastKnownOpponent)
        ? this.lastKnownOpponent
        : getFallbackOpponent(this.selectP1);
      if (this.selectCpu === this.selectP1) {
        this.selectCpu = getFallbackOpponent(this.selectP1);
      }
      this.selectActiveSlot = 'p1';
      this.selectCursorSlot = this.selectP1;
      if (!getAvailableCharacterIdles(this.selectP1).includes(this.selectP1Idle)) {
        this.selectP1Idle = 'idle-1';
      }
      if (!getAvailableCharacterIdles(this.selectCpu).includes(this.selectCpuIdle)) {
        this.selectCpuIdle = 'idle-1';
      }
      this.renderSelectScreen();
      this.handlers.onPreviewSelectFighter('p1', this.selectP1, this.selectP1Idle, false);
      this.handlers.onPreviewSelectFighter('cpu', this.selectCpu, this.selectCpuIdle, false);
      this.handlers.onSelectModalOpened?.();
    } else if (wasOpen) {
      this.handlers.onSelectModalClosed?.();
    }
  }

  public isModalOpen(): boolean {
    return !this.charModalBackdrop.classList.contains('hidden');
  }

  private renderFighterSlot(
    slot: FighterHUDSlotElements,
    fighter: FighterHUDInfo,
    isPlayer: boolean,
    gsapDrivesWidth = false
  ): void {
    slot.card.classList.toggle('fighter-hud--is-player', isPlayer);
    slot.badge.classList.toggle('hidden', !isPlayer);

    slot.name.textContent = fighter.displayName.toUpperCase();
    slot.tag.textContent = fighter.roleTag;
    slot.tag.classList.toggle('fighter-tag--boss', fighter.isBossInfinite);
    slot.tag.classList.toggle('fighter-tag--target', !fighter.isBossInfinite);

    slot.avatar.className = `fighter-avatar fighter-avatar--${fighter.id}`;
    slot.avatarImg.src = PORTRAIT_MAP[fighter.id];
    slot.avatarImg.alt = fighter.displayName;

    slot.track.classList.toggle('health-bar-track--infinite', fighter.isBossInfinite);
    slot.healthText.classList.toggle('health-value--infinite', fighter.isBossInfinite);

    if (fighter.isBossInfinite) {
      slot.trail.style.width = '100%';
      slot.fill.style.width = '100%';
      slot.fill.className = 'health-bar-fill health-bar-fill--infinite';
      slot.healthText.textContent = '∞ / ∞ UNBREAKABLE';
    } else {
      const hpPercent = Math.max(0, Math.min(100, (fighter.hp / fighter.maxHp) * 100));
      if (!gsapDrivesWidth) {
        slot.trail.style.width = `${hpPercent}%`;
        slot.fill.style.width = `${hpPercent}%`;
      }
      slot.fill.className = `health-bar-fill health-bar-fill--priyanshu${hpPercent <= 30 ? ' health-bar-fill--low' : ''}`;
      slot.healthText.textContent = `${Math.round(fighter.hp)} / ${fighter.maxHp} HP`;
    }
  }

  public renderState(state: GameHUDState): void {
    this.lastKnownPlayer = state.selectedCharacter;
    this.lastKnownOpponent = state.opponentCharacter;
    this.movementLocked = Boolean(state.controlsLocked);

    const gsapDrivesWidth = Boolean(state.matchState && state.matchState !== 'INIT');
    this.renderFighterSlot(
      this.leftSlot,
      state.leftFighter,
      state.selectedCharacter === state.leftFighter.id,
      gsapDrivesWidth
    );
    this.renderFighterSlot(
      this.rightSlot,
      state.rightFighter,
      state.selectedCharacter === state.rightFighter.id,
      gsapDrivesWidth
    );

    if (this.p1SignatureLabel) {
      this.p1SignatureLabel.textContent = `${state.leftFighter.displayName.toUpperCase()} SIGNATURE`;
    }
    if (this.p2SignatureLabel) {
      this.p2SignatureLabel.textContent = `${state.rightFighter.displayName.toUpperCase()} SIGNATURE`;
    }

    if (state.difficulty) {
      this.activeDifficulty = state.difficulty;
    }

    if (state.activeStageId) {
      this.activeStageId = state.activeStageId;
      if (this.selectStageLabel) {
        this.selectStageLabel.textContent = `STAGE: ${getStageDisplayName(this.activeStageId).toUpperCase()}`;
      }
    }

    if (state.difficulty || state.activeStageId) {
      this.syncSetupPills();
    }

    this.btnSoundToggle.textContent = state.isMuted ? '🔇 MUTED' : '🔊 SFX ON';

    if (state.targetQuip && state.targetQuip !== this.lastQuip) {
      this.lastQuip = state.targetQuip;
      this.showQuip(state.targetQuipSpeaker, state.targetQuip);
    }
  }

  private showQuip(speaker: string, text: string): void {
    this.quipBubble.textContent = `${speaker}: "${text}"`;
    this.quipBubble.classList.remove('hidden');
    gsap.killTweensOf(this.quipBubble);
    gsap.fromTo(
      this.quipBubble,
      { scale: 0.75, opacity: 0, y: -6 },
      { scale: 1, opacity: 1, y: 0, duration: 0.2, ease: 'back.out(2)' }
    );

    if (this.quipHideTimer) clearTimeout(this.quipHideTimer);
    this.quipHideTimer = window.setTimeout(() => {
      gsap.to(this.quipBubble, {
        opacity: 0,
        duration: 0.25,
        onComplete: () => this.quipBubble.classList.add('hidden'),
      });
    }, 1800);
  }

  public showBossToast(message = "You can't mess with the real boss."): void {
    const textEl = this.bossToast.querySelector('.boss-toast-text');
    if (textEl) {
      textEl.textContent = message;
    }

    this.toastTimeline?.kill();
    this.bossToastBackdrop.classList.remove('hidden');

    gsap.set(this.bossToast, { scale: 0.35, rotation: -12, opacity: 0, y: 24 });
    gsap.set(this.bossToastBackdrop, { opacity: 0 });

    this.toastTimeline = gsap.timeline({
      onComplete: () => {
        this.bossToastBackdrop.classList.add('hidden');
      },
    });

    this.toastTimeline
      .to(this.bossToastBackdrop, { opacity: 1, duration: 0.12, ease: 'power1.out' })
      .to(
        this.bossToast,
        {
          scale: 1,
          rotation: -2,
          opacity: 1,
          y: 0,
          duration: 0.34,
          ease: 'elastic.out(1.15, 0.55)',
        },
        0
      )
      .to(this.bossToast, {
        scale: 1.04,
        rotation: 1.5,
        duration: 0.18,
        yoyo: true,
        repeat: 1,
        ease: 'sine.inOut',
        delay: 0.45,
      })
      .to([this.bossToast, this.bossToastBackdrop], {
        opacity: 0,
        scale: 0.85,
        duration: 0.28,
        delay: 0.38,
        ease: 'power2.in',
      });
  }

  public showKOBanner(show: boolean, titleText?: string, subText?: string): void {
    if (titleText) {
      this.koTitle.textContent = titleText;
    }
    if (subText) {
      this.koSub.textContent = subText;
    }
    this.koBanner.classList.toggle('hidden', !show);
  }

  public flashBloodVignette(intensity = 1): void {
    const el = this.damageVignette;
    if (!el) return;
    const peakOpacity = Math.min(0.88, Math.max(0.28, 0.24 + intensity * 0.26));
    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { opacity: peakOpacity },
      { opacity: 0, duration: 0.68, ease: 'power2.out' }
    );
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    if (this.quipHideTimer) clearTimeout(this.quipHideTimer);
    this.cancelPendingHoverPreview();
    this.toastTimeline?.kill();
  }
}
