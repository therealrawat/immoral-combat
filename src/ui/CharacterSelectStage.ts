import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTER_IDS } from '../characters/characterNames';
import { getDefaultMatchup } from '../characters/chinuAccess';
import gsap from 'gsap';
import { retargetClipToCharacter } from '../characters/AnimationRetargeter';
import { CharacterFactory } from '../characters/CharacterFactory';
import {
  getAvailableCharacterIdles,
  getCharacterIdleUrl,
  getSharedAnimationUrl,
} from '../characters/ModelAssetRegistry';
import { sharedAnimationManager } from '../characters/SharedAnimationManager';
import { CharacterId, SelectIdleVariant } from '../types/game';

export type SelectSide = 'p1' | 'cpu';

export interface CharacterSelectStageOptions {
  onSideLoadingChange?: (side: SelectSide, loading: boolean, characterId: CharacterId) => void;
  onPortraitReady?: (characterId: CharacterId, url: string) => void;
}

interface ShowcaseVariantTuning {
  clipYawOffset: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

interface CharacterShowcaseConfig {
  scaleMultiplier: number;
  variants: Record<SelectIdleVariant, ShowcaseVariantTuning>;
}

const SHOWCASE_CONFIGS: Record<CharacterId, CharacterShowcaseConfig> = {
  chinu: {
    scaleMultiplier: 1.05,
    variants: {
      'idle-1': { clipYawOffset: 0.38, offsetX: 0, offsetY: 0, offsetZ: 0 },
      'idle-2': { clipYawOffset: 0.2, offsetX: 0, offsetY: 0, offsetZ: 0 },
    },
  },
  priyanshu: {
    scaleMultiplier: 1.0,
    variants: {
      'idle-1': { clipYawOffset: 0.55, offsetX: 0, offsetY: 0, offsetZ: 0 },
      'idle-2': { clipYawOffset: 0.42, offsetX: -0.42, offsetY: 1.18, offsetZ: 0.28 },
    },
  },
  modiji: {
    scaleMultiplier: 1.0,
    variants: {
      'idle-1': { clipYawOffset: 0.0, offsetX: 0, offsetY: 0, offsetZ: 0 },
      'idle-2': { clipYawOffset: 0.0, offsetX: 0, offsetY: 0, offsetZ: 0 },
    },
  },
  trump: {
    scaleMultiplier: 1.0,
    variants: {
      'idle-1': { clipYawOffset: 0.0, offsetX: 0, offsetY: 0, offsetZ: 0 },
      'idle-2': { clipYawOffset: 0.0, offsetX: 0, offsetY: 0, offsetZ: 0 },
    },
  },
  putin: {
    scaleMultiplier: 1.0,
    variants: {
      'idle-1': { clipYawOffset: 0.45, offsetX: 0, offsetY: 0, offsetZ: 0 },
      'idle-2': { clipYawOffset: 0.0, offsetX: 0, offsetY: 0, offsetZ: 0 },
    },
  },
};

interface ShowcaseSlot {
  side: SelectSide;
  baseX: number;
  inwardYaw: number;
  container: THREE.Group;
  characterId: CharacterId;
  variant: SelectIdleVariant;
  mixer: THREE.AnimationMixer | null;
  action: THREE.AnimationAction | null;
  loadToken: number;
  isStaticFloat: boolean;
  elapsed: number;
  baseOffsetY: number;
}

function createRadialGlowTexture(
  innerColor: string,
  midColor: string,
  outerColor: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(256, 256, 12, 256, 256, 250);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.45, midColor);
  grad.addColorStop(1, outerColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSpotlightConeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  grad.addColorStop(0.35, 'rgba(226, 238, 255, 0.24)');
  grad.addColorStop(0.8, 'rgba(180, 210, 255, 0.06)');
  grad.addColorStop(1, 'rgba(180, 210, 255, 0)');

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(222, 0);
  ctx.lineTo(290, 0);
  ctx.lineTo(492, 512);
  ctx.lineTo(20, 512);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Feather horizontal edges smoothly
  const sideMask = ctx.createLinearGradient(0, 0, 512, 0);
  sideMask.addColorStop(0, 'rgba(0, 0, 0, 0)');
  sideMask.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
  sideMask.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = sideMask;
  ctx.fillRect(0, 0, 512, 512);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawImmoralCombatLogoCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;

  // Dramatic soft emblem backing glow behind lettering (edges fade out cleanly)
  const backGlow = ctx.createRadialGradient(cx, 384, 40, cx, 384, 920);
  backGlow.addColorStop(0, 'rgba(185, 28, 28, 0.34)');
  backGlow.addColorStop(0.42, 'rgba(234, 88, 12, 0.18)');
  backGlow.addColorStop(0.75, 'rgba(15, 23, 42, 0.08)');
  backGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = backGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Diagonal katana slash accents across background
  ctx.save();
  ctx.translate(cx, 384);
  ctx.rotate(-0.08);
  const slashGrad = ctx.createLinearGradient(-920, 0, 920, 0);
  slashGrad.addColorStop(0, 'rgba(250, 204, 21, 0)');
  slashGrad.addColorStop(0.25, 'rgba(250, 204, 21, 0.28)');
  slashGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.72)');
  slashGrad.addColorStop(0.75, 'rgba(239, 68, 68, 0.35)');
  slashGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = slashGrad;
  ctx.fillRect(-920, -6, 1840, 12);
  ctx.restore();

  // Top spaced showcase kicker
  ctx.save();
  ctx.font = '800 34px "Teko", "Barlow Condensed", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(253, 230, 138, 0.9)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 14;
  ctx.fillText('★   SUPREME 1V1 ARENA SHOWDOWN   ★', cx, 102);
  ctx.restore();

  // Line 1: IMMORAL (Slanted fiery championship metallic gold)
  ctx.save();
  ctx.translate(cx, 272);
  ctx.transform(1, 0, -0.14, 1, 0, 0);
  ctx.font = '900 226px "Teko", "Bangers", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  // Deep volumetric extruded drop shadow
  ctx.fillStyle = 'rgba(24, 6, 10, 0.92)';
  ctx.fillText('IMMORAL', 10, 14);

  ctx.lineWidth = 22;
  ctx.strokeStyle = '#090d16';
  ctx.shadowColor = 'rgba(249, 115, 22, 0.85)';
  ctx.shadowBlur = 34;
  ctx.strokeText('IMMORAL', 0, 0);

  const goldGrad = ctx.createLinearGradient(0, -110, 0, 110);
  goldGrad.addColorStop(0, '#fffbeb');
  goldGrad.addColorStop(0.32, '#fde047');
  goldGrad.addColorStop(0.68, '#f59e0b');
  goldGrad.addColorStop(1, '#b45309');
  ctx.fillStyle = goldGrad;
  ctx.shadowBlur = 0;
  ctx.fillText('IMMORAL', 0, 0);

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
  ctx.strokeText('IMMORAL', 0, -2);
  ctx.restore();

  // Line 2: COMBAT (Heavy brushed chrome-to-crimson molten steel)
  ctx.save();
  ctx.translate(cx + 12, 488);
  ctx.transform(1, 0, -0.14, 1, 0, 0);
  ctx.font = '900 238px "Teko", "Bangers", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  ctx.fillStyle = 'rgba(20, 4, 8, 0.95)';
  ctx.fillText('COMBAT', 10, 14);

  ctx.lineWidth = 24;
  ctx.strokeStyle = '#090d16';
  ctx.shadowColor = 'rgba(225, 29, 72, 0.92)';
  ctx.shadowBlur = 38;
  ctx.strokeText('COMBAT', 0, 0);

  const steelGrad = ctx.createLinearGradient(0, -115, 0, 115);
  steelGrad.addColorStop(0, '#ffffff');
  steelGrad.addColorStop(0.4, '#e2e8f0');
  steelGrad.addColorStop(0.65, '#f87171');
  steelGrad.addColorStop(1, '#991b1b');
  ctx.fillStyle = steelGrad;
  ctx.shadowBlur = 0;
  ctx.fillText('COMBAT', 0, 0);

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(254, 226, 226, 0.55)';
  ctx.strokeText('COMBAT', 0, -2);
  ctx.restore();
}

function createImmoralCombatLogoTexture(): { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 768;
  drawImmoralCombatLogoCanvas(canvas);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, tex };
}

/**
 * Tekken-style 3D Character Select showcase stage featuring dramatic left/right
 * red & blue lighting, overhead center spotlight, floating arena bokeh, and live
 * GLB fighters rendered with their `idle-1` / `idle-2` animations.
 */
export class CharacterSelectStage {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;

  private readonly baseCameraPos = new THREE.Vector3(0, 1.56, 4.18);
  private readonly baseLookAt = new THREE.Vector3(0, 1.44, 0);
  private readonly targetParallax = new THREE.Vector2();
  private readonly smoothParallax = new THREE.Vector2();
  private readonly disposableTextures: THREE.Texture[] = [];
  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];

  private readonly bokehPoints: THREE.Points;
  private readonly bokehSpeeds: Float32Array;
  private readonly leftRimLight: THREE.SpotLight;
  private readonly rightRimLight: THREE.SpotLight;
  private backdropLogoMesh?: THREE.Mesh;
  private backdropLogoTime = 0;

  private readonly slots: Record<SelectSide, ShowcaseSlot>;
  private readonly options: CharacterSelectStageOptions;
  private readonly loadedSelectKeys = new Set<string>();
  private readonly capturedPortraits = new Map<CharacterId, string>();
  private portraitRenderer: THREE.WebGLRenderer | null = null;
  private portraitScene: THREE.Scene | null = null;
  private portraitCamera: THREE.PerspectiveCamera | null = null;
  private disposed = false;

  constructor(width: number, height: number, options: CharacterSelectStageOptions = {}) {
    this.options = options;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070e);
    this.scene.fog = new THREE.FogExp2(0x05070e, 0.055);

    this.camera = new THREE.PerspectiveCamera(34, Math.max(width, 1) / Math.max(height, 1), 0.1, 40);
    this.resize(width, height);

    const { leftRimLight, rightRimLight } = this.setupLighting();
    this.leftRimLight = leftRimLight;
    this.rightRimLight = rightRimLight;

    this.setupStageBackdrops();
    const { points, speeds } = this.createBokehParticles();
    this.bokehPoints = points;
    this.bokehSpeeds = speeds;
    this.scene.add(this.bokehPoints);

    const p1Group = new THREE.Group();
    const cpuGroup = new THREE.Group();
    this.scene.add(p1Group, cpuGroup);

    const defaults = getDefaultMatchup();
    this.slots = {
      p1: {
        side: 'p1',
        baseX: -0.94,
        inwardYaw: 0.16,
        container: p1Group,
        characterId: defaults.player,
        variant: 'idle-1',
        mixer: null,
        action: null,
        loadToken: 0,
        isStaticFloat: false,
        elapsed: 0,
        baseOffsetY: 0,
      },
      cpu: {
        side: 'cpu',
        baseX: 0.94,
        inwardYaw: -0.16,
        container: cpuGroup,
        characterId: defaults.opponent,
        variant: 'idle-1',
        mixer: null,
        action: null,
        loadToken: 0,
        isStaticFloat: false,
        elapsed: 0,
        baseOffsetY: 0,
      },
    };

    window.addEventListener('pointermove', this.handlePointerMove);
  }

  private setupLighting(): { leftRimLight: THREE.SpotLight; rightRimLight: THREE.SpotLight } {
    const ambient = new THREE.AmbientLight(0xdbeafe, 0.65);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xf8fafc, 0x1e1b4b, 0.8);
    hemi.position.set(0, 6, 0);
    this.scene.add(hemi);

    // Crisp frontal studio key light so faces, eyes, and clothing read clearly
    const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.85);
    keyLight.position.set(0.35, 3.1, 5.2);
    this.scene.add(keyLight);

    const softFill = new THREE.DirectionalLight(0xe2e8f0, 0.55);
    softFill.position.set(-0.5, 1.8, 4.0);
    this.scene.add(softFill);

    // Overhead center rim/hair light
    const topSpot = new THREE.SpotLight(0xffffff, 14, 10, Math.PI / 3.4, 0.78, 1.1);
    topSpot.position.set(0, 3.9, -1.35);
    topSpot.target.position.set(0, 1.75, 0);
    this.scene.add(topSpot, topSpot.target);

    // Player 1 (Left) Crimson-Red Rim + Glow
    const leftRimLight = new THREE.SpotLight(0xff2355, 22, 9, Math.PI / 3, 0.72, 1.2);
    leftRimLight.position.set(-3.1, 2.75, -1.1);
    leftRimLight.target.position.set(-0.92, 1.7, 0);
    this.scene.add(leftRimLight, leftRimLight.target);

    const leftFill = new THREE.PointLight(0xff3366, 3.8, 5.2);
    leftFill.position.set(-2.35, 1.75, 0.75);
    this.scene.add(leftFill);

    // Opponent (Right) Electric-Blue Rim + Glow
    const rightRimLight = new THREE.SpotLight(0x2589ff, 22, 9, Math.PI / 3, 0.72, 1.2);
    rightRimLight.position.set(3.1, 2.75, -1.1);
    rightRimLight.target.position.set(0.92, 1.7, 0);
    this.scene.add(rightRimLight, rightRimLight.target);

    const rightFill = new THREE.PointLight(0x38bdf8, 3.8, 5.2);
    rightFill.position.set(2.35, 1.75, 0.75);
    this.scene.add(rightFill);

    return { leftRimLight, rightRimLight };
  }

  private setupStageBackdrops(): void {
    const addBackdropPlane = (
      texture: THREE.CanvasTexture,
      w: number,
      h: number,
      x: number,
      y: number,
      z: number,
      opacity = 1
    ) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.disposableTextures.push(texture);
      this.disposableGeometries.push(geo);
      this.disposableMaterials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
    };

    // Left crimson aura behind P1
    addBackdropPlane(
      createRadialGlowTexture(
        'rgba(255, 58, 92, 0.56)',
        'rgba(220, 38, 38, 0.24)',
        'rgba(220, 38, 38, 0)'
      ),
      4.4,
      4.2,
      -1.75,
      1.68,
      -1.95
    );

    // Right electric-blue aura behind Opponent
    addBackdropPlane(
      createRadialGlowTexture(
        'rgba(56, 189, 248, 0.56)',
        'rgba(37, 99, 235, 0.25)',
        'rgba(37, 99, 235, 0)'
      ),
      4.4,
      4.2,
      1.75,
      1.68,
      -1.95
    );

    // Overhead central spotlight shaft
    addBackdropPlane(createSpotlightConeTexture(), 4.2, 4.4, 0, 1.88, -1.75, 0.82);

    // Soft bright top-center flare source
    addBackdropPlane(
      createRadialGlowTexture(
        'rgba(255, 255, 255, 0.75)',
        'rgba(203, 213, 225, 0.2)',
        'rgba(203, 213, 225, 0)'
      ),
      2.6,
      1.8,
      0,
      3.15,
      -1.85,
      0.85
    );

    // Monumental "IMMORAL COMBAT" arcade marquee rendered in 3D depth cleanly behind avatars (z = -1.52)
    const { canvas: logoCanvas, tex: logoTex } = createImmoralCombatLogoTexture();
    const logoGeo = new THREE.PlaneGeometry(5.25, 1.97);
    const logoMat = new THREE.MeshBasicMaterial({
      map: logoTex,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.disposableTextures.push(logoTex);
    this.disposableGeometries.push(logoGeo);
    this.disposableMaterials.push(logoMat);
    const logoMesh = new THREE.Mesh(logoGeo, logoMat);
    logoMesh.position.set(0, 1.94, -1.52);
    logoMesh.renderOrder = 2;
    this.backdropLogoMesh = logoMesh;
    this.scene.add(logoMesh);

    // Re-draw once web fonts finish loading so Teko/Bangers replace initial system fallback
    const fontSet = (globalThis.document as Document & { fonts?: FontFaceSet })?.fonts;
    fontSet?.ready?.then(() => {
      if (this.disposed) return;
      drawImmoralCombatLogoCanvas(logoCanvas);
      logoTex.needsUpdate = true;
    });
  }

  private createBokehParticles(): {
    points: THREE.Points;
    speeds: Float32Array;
  } {
    const count = 64;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const speeds = new Float32Array(count);

    const colorTmp = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const x = (Math.random() - 0.5) * 6.4;
      const y = 0.5 + Math.random() * 2.6;
      const z = -0.6 - Math.random() * 2.1;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      speeds[i] = 0.08 + Math.random() * 0.14;

      if (x < -0.75) {
        colorTmp.setHex(Math.random() > 0.4 ? 0xff7aa8 : 0xfef3c7);
      } else if (x > 0.75) {
        colorTmp.setHex(Math.random() > 0.4 ? 0x7dd3fc : 0xe0f2fe);
      } else {
        colorTmp.setHex(0xfef9c3);
      }
      colors[i * 3] = colorTmp.r;
      colors[i * 3 + 1] = colorTmp.g;
      colors[i * 3 + 2] = colorTmp.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const spriteTex = createRadialGlowTexture(
      'rgba(255, 255, 255, 1)',
      'rgba(255, 255, 255, 0.42)',
      'rgba(255, 255, 255, 0)'
    );
    const mat = new THREE.PointsMaterial({
      size: 0.11,
      map: spriteTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.disposableGeometries.push(geo);
    this.disposableTextures.push(spriteTex);
    this.disposableMaterials.push(mat);

    return { points: new THREE.Points(geo, mat), speeds };
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const nx = (event.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
    const ny = (event.clientY / Math.max(window.innerHeight, 1)) * 2 - 1;
    this.targetParallax.set(nx * 0.14, -ny * 0.07);
  };

  public resize(width: number, height: number): void {
    const aspect = Math.max(width, 1) / Math.max(height, 1);
    this.camera.aspect = aspect;
    // Widen distance slightly on narrow viewports so both fighters remain fully framed
    const narrowBoost = aspect < 1.38 ? 1.38 / Math.max(aspect, 0.72) : 1;
    this.baseCameraPos.set(0, 1.56, 4.18 * narrowBoost);
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(this.baseLookAt);
    this.camera.updateProjectionMatrix();
  }

  public isCharacterPreviewLoaded(
    characterId: CharacterId,
    requestedVariant: SelectIdleVariant = 'idle-1'
  ): boolean {
    const available = getAvailableCharacterIdles(characterId);
    const effectiveVariant: SelectIdleVariant = available.includes(requestedVariant)
      ? requestedVariant
      : 'idle-1';
    return this.loadedSelectKeys.has(`${characterId}:${effectiveVariant}`);
  }

  /**
   * Updates one side (`p1` or `cpu`) to display the chosen fighter using their
   * `idle-1` or `idle-2` GLB animation/pose.
   */
  public async setFighter(
    side: SelectSide,
    characterId: CharacterId,
    requestedVariant: SelectIdleVariant = 'idle-1',
    animateEntrance = true
  ): Promise<void> {
    if (this.disposed) return;
    const slot = this.slots[side];
    const available = getAvailableCharacterIdles(characterId);
    const effectiveVariant: SelectIdleVariant = available.includes(requestedVariant)
      ? requestedVariant
      : 'idle-1';

    slot.characterId = characterId;
    slot.variant = effectiveVariant;
    const token = ++slot.loadToken;
    const cacheKey = `${characterId}:${effectiveVariant}`;
    const alreadyCached = this.loadedSelectKeys.has(cacheKey);

    // Show immediate procedural fallback while GLB streams if slot has no model yet
    if (slot.container.children.length === 0) {
      this.mountProceduralFallback(slot, characterId);
    }

    if (!alreadyCached) {
      this.options.onSideLoadingChange?.(side, true, characterId);
    }

    let glbScene: THREE.Group | null = null;
    let idleClip: THREE.AnimationClip | null = null;
    try {
      const loaded = await this.loadShowcaseModelAndIdle(
        characterId,
        effectiveVariant,
        `${characterId}_select_${effectiveVariant}`
      );
      glbScene = loaded.scene;
      idleClip = loaded.clip;
    } finally {
      if (!this.disposed && slot.loadToken === token) {
        this.options.onSideLoadingChange?.(side, false, characterId);
      }
    }

    if (this.disposed || slot.loadToken !== token) return;
    if (!glbScene) return;

    this.loadedSelectKeys.add(cacheKey);
    const config = SHOWCASE_CONFIGS[characterId];
    const tuning = config.variants[effectiveVariant];

    if (this.options.onPortraitReady && !this.capturedPortraits.has(characterId)) {
      const portraitUrl = this.capturePortraitFromLoaded(characterId, glbScene, idleClip);
      if (portraitUrl) {
        this.options.onPortraitReady(characterId, portraitUrl);
      }
    }

    this.clearSlot(slot);

    const wrapper = new THREE.Group();
    wrapper.scale.setScalar(config.scaleMultiplier);
    wrapper.add(glbScene);
    slot.container.add(wrapper);

    slot.baseOffsetY = tuning.offsetY;
    slot.container.position.set(slot.baseX + tuning.offsetX, tuning.offsetY, tuning.offsetZ);
    slot.container.rotation.set(0, slot.inwardYaw, 0);

    if (idleClip) {
      const mixer = new THREE.AnimationMixer(glbScene);
      const action = mixer.clipAction(idleClip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      // Start slightly offset on right slot so idle breathing isn't mirror-synchronized
      mixer.update(side === 'cpu' ? 0.65 : 0.12);
      slot.mixer = mixer;
      slot.action = action;
      slot.isStaticFloat = idleClip.duration < 0.15;
    } else {
      slot.isStaticFloat = true;
    }

    if (animateEntrance) {
      const slideFromX = slot.baseX + tuning.offsetX + (side === 'p1' ? -0.34 : 0.34);
      gsap.killTweensOf(slot.container.position);
      gsap.fromTo(
        slot.container.position,
        { x: slideFromX },
        { x: slot.baseX + tuning.offsetX, duration: 0.28, ease: 'power3.out' }
      );

      const rim = side === 'p1' ? this.leftRimLight : this.rightRimLight;
      gsap.killTweensOf(rim);
      gsap.fromTo(rim, { intensity: 40 }, { intensity: 22, duration: 0.45, ease: 'power2.out' });
    }
  }

  private mountProceduralFallback(slot: ShowcaseSlot, characterId: CharacterId): void {
    this.clearSlot(slot);
    const rig = CharacterFactory.createFighter(characterId, new THREE.Vector3(0, 0, 0), 1);
    rig.modelRoot.rotation.y = slot.inwardYaw;
    slot.container.add(rig.root);
    slot.container.position.set(slot.baseX, 0, 0);
    slot.container.rotation.set(0, 0, 0);
    slot.baseOffsetY = 0;
    slot.isStaticFloat = true;
  }

  private clearSlot(slot: ShowcaseSlot): void {
    gsap.killTweensOf(slot.container.position);
    if (slot.action) {
      slot.action.stop();
      slot.action = null;
    }
    if (slot.mixer) {
      slot.mixer.stopAllAction();
      slot.mixer = null;
    }
    slot.container.clear();
  }

  public update(deltaSeconds: number): void {
    if (this.disposed) return;

    this.smoothParallax.lerp(this.targetParallax, 0.08);
    this.camera.position
      .copy(this.baseCameraPos)
      .add(new THREE.Vector3(this.smoothParallax.x, this.smoothParallax.y, 0));
    this.camera.lookAt(this.baseLookAt);

    if (this.backdropLogoMesh) {
      this.backdropLogoTime += deltaSeconds;
      this.backdropLogoMesh.position.x = -this.smoothParallax.x * 0.22;
      this.backdropLogoMesh.position.y =
        1.94 - this.smoothParallax.y * 0.1 + Math.sin(this.backdropLogoTime * 1.4) * 0.015;
    }

    // Update fighter idle-1/idle-2 animations + subtle idle breath for 1-frame poses
    for (const slot of [this.slots.p1, this.slots.cpu]) {
      slot.elapsed += deltaSeconds;
      if (slot.mixer) {
        slot.mixer.update(deltaSeconds);
      }
      if (slot.isStaticFloat && slot.container.children.length > 0) {
        slot.container.position.y =
          slot.baseOffsetY + Math.sin(slot.elapsed * 2.1 + (slot.side === 'cpu' ? 1.4 : 0)) * 0.012;
      }
    }

    // Gentle upward bokeh drift
    const posAttr = this.bokehPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < this.bokehSpeeds.length; i += 1) {
      let y = arr[i * 3 + 1] + this.bokehSpeeds[i] * deltaSeconds;
      if (y > 3.25) {
        y = 0.5;
      }
      arr[i * 3 + 1] = y;
    }
    posAttr.needsUpdate = true;
  }

  private async loadShowcaseModelAndIdle(
    characterId: CharacterId,
    variant: SelectIdleVariant,
    clipName: string
  ): Promise<{ scene: THREE.Group | null; clip: THREE.AnimationClip | null }> {
    const tuning = SHOWCASE_CONFIGS[characterId].variants[variant];
    const idleUrl =
      getCharacterIdleUrl(characterId, variant) ?? getCharacterIdleUrl(characterId, 'idle-1');
    const isSharedCentral =
      Boolean(idleUrl) &&
      (idleUrl === getSharedAnimationUrl(variant) || idleUrl === getSharedAnimationUrl('idle'));

    const [scene, sourceAnim] = await Promise.all([
      CharacterFactory.loadCharacterGLBModel(characterId),
      idleUrl
        ? sharedAnimationManager.loadAnimation(`${characterId}_select_${variant}`, idleUrl)
        : Promise.resolve(null),
    ]);

    const clip =
      scene && sourceAnim
        ? retargetClipToCharacter(sourceAnim.clip, {
            targetRoot: scene,
            sourceProfile: sourceAnim.sourceProfile,
            clipName,
            yawOffsetRad: isSharedCentral ? 0 : tuning.clipYawOffset,
          })
        : null;

    return { scene, clip };
  }

  private ensurePortraitRenderer(): {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
  } | null {
    if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') {
      return null;
    }
    if (this.portraitRenderer && this.portraitScene && this.portraitCamera) {
      return {
        renderer: this.portraitRenderer,
        scene: this.portraitScene,
        camera: this.portraitCamera,
      };
    }

    try {
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setSize(180, 220, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;

      const snapScene = new THREE.Scene();
      snapScene.background = new THREE.Color(0x0b101d);

      const ambient = new THREE.AmbientLight(0xffffff, 0.85);
      const key = new THREE.DirectionalLight(0xfffaf0, 1.9);
      key.position.set(0.6, 2.5, 3.8);
      const rim = new THREE.DirectionalLight(0x93c5fd, 0.9);
      rim.position.set(-1.6, 2.2, -2.0);
      snapScene.add(ambient, key, rim);

      const snapCam = new THREE.PerspectiveCamera(26, 180 / 220, 0.1, 20);
      this.portraitRenderer = renderer;
      this.portraitScene = snapScene;
      this.portraitCamera = snapCam;
      return { renderer, scene: snapScene, camera: snapCam };
    } catch {
      return null;
    }
  }

  private capturePortraitFromLoaded(
    characterId: CharacterId,
    sourceScene: THREE.Object3D,
    clip: THREE.AnimationClip | null
  ): string | null {
    const existing = this.capturedPortraits.get(characterId);
    if (existing) return existing;

    const rig = this.ensurePortraitRenderer();
    if (!rig) return null;

    try {
      const cloned = SkeletonUtils.clone(sourceScene);
      const holder = new THREE.Group();
      holder.add(cloned);
      rig.scene.add(holder);

      let mixer: THREE.AnimationMixer | null = null;
      if (clip) {
        mixer = new THREE.AnimationMixer(cloned);
        mixer.clipAction(clip).play();
        mixer.update(0.2);
      }
      holder.updateMatrixWorld(true);

      const headWorld = new THREE.Vector3();
      const headBone = cloned.getObjectByName('Head');
      if (headBone) {
        headBone.getWorldPosition(headWorld);
      } else {
        headWorld.set(0, 1.95, 0);
      }

      rig.camera.position.set(headWorld.x, headWorld.y + 0.01, 1.25);
      rig.camera.lookAt(headWorld.x, headWorld.y - 0.01, 0);
      rig.renderer.render(rig.scene, rig.camera);

      const dataUrl = rig.renderer.domElement.toDataURL('image/png');
      mixer?.stopAllAction();
      rig.scene.remove(holder);
      this.capturedPortraits.set(characterId, dataUrl);
      return dataUrl;
    } catch {
      return null;
    }
  }

  /**
   * Renders crisp 3D bust portrait thumbnails of fighters (on-demand utility).
   */
  public async generateFighterPortraits(
    ids: readonly CharacterId[] = CHARACTER_IDS
  ): Promise<Partial<Record<CharacterId, string>>> {
    const results: Partial<Record<CharacterId, string>> = {};
    for (const id of ids) {
      const cached = this.capturedPortraits.get(id);
      if (cached) {
        results[id] = cached;
        continue;
      }
      const { scene, clip } = await this.loadShowcaseModelAndIdle(
        id,
        'idle-1',
        `${id}_portrait_idle-1`
      );
      if (this.disposed) return results;
      if (scene) {
        const dataUrl = this.capturePortraitFromLoaded(id, scene, clip);
        if (dataUrl) results[id] = dataUrl;
      }
    }
    return results;
  }

  public dispose(): void {
    this.disposed = true;
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.clearSlot(this.slots.p1);
    this.clearSlot(this.slots.cpu);
    this.portraitRenderer?.dispose();
    this.portraitRenderer = null;
    this.portraitScene = null;
    this.portraitCamera = null;
    for (const tex of this.disposableTextures) tex.dispose();
    for (const geo of this.disposableGeometries) geo.dispose();
    for (const mat of this.disposableMaterials) mat.dispose();
  }
}

