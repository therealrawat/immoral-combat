import gsap from 'gsap';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizeMixamoBoneName } from '../../characters/AnimationRetargeter';
import { getObjectModelUrl } from '../../characters/ModelAssetRegistry';
import { BaseSpecialMoves, disposeObject3D } from '../specialMoveUtils';

const LAPTOP_OPEN_DURATION = 0.42;
const POSE_BLEND_IN_DURATION = 0.28;
const TYPING_END_TIME = 1.88;
const ENTER_SLAM_TIME = 1.88;
const FOG_START_TIME = 1.96;
const FOG_DURATION_SECONDS = 2.45;
const CINEMATIC_RELEASE_TIME = 3.45;

const POISON_TICK_TIMES = [2.05, 2.65, 3.25] as const;
const POISON_TICK_DAMAGES = [11, 11, 12] as const;
const POISON_TICK_WORDS = ['POISONED! ☣️', 'TOXIC FOG! 🤢', 'BREACHED!! 💀'] as const;

const CYBER_HACK_QUIPS = [
  'sudo inject --poison-fog target.exe 💻☣️',
  'Bypassing firewall... deploying neuro-toxin! 🟢⌨️',
  'Ctrl+Alt+Poison!! Breathe that kernel panic! 💻🤢',
] as const;

let cachedLaptopTemplatePromise: Promise<THREE.Group | null> | null = null;
const sharedLaptopLoader = new GLTFLoader();

function createProceduralFallbackLaptop(): THREE.Group {
  const root = new THREE.Group();
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.72,
    roughness: 0.28,
  });
  const baseGroup = new THREE.Group();
  baseGroup.name = 'Cube_0';
  const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 1.45), chassisMat);
  baseGroup.add(baseMesh);

  const deckGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.65, 0.8),
    new THREE.MeshBasicMaterial({ color: 0x22c55e })
  );
  deckGlow.rotation.x = -Math.PI / 2;
  deckGlow.position.set(0, 0.055, -0.05);
  baseGroup.add(deckGlow);

  const lidGroup = new THREE.Group();
  lidGroup.name = 'Cube001_3';
  lidGroup.position.set(0, 0.09, -0.72);
  lidGroup.rotation.x = -1.735;

  const lidShell = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 1.4), chassisMat);
  lidShell.position.set(0, 0, 0.7);
  lidGroup.add(lidShell);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.68, 1.15),
    new THREE.MeshStandardMaterial({
      color: 0x052e16,
      emissive: 0x22c55e,
      emissiveIntensity: 1.4,
    })
  );
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, -0.04, 0.72);
  lidGroup.add(screen);

  root.add(baseGroup, lidGroup);
  return root;
}

/**
 * Lazily downloads and caches `models/objects/cyberpunk_laptop.glb` for reuse across casts.
 */
export function preloadCyberpunkLaptop(): Promise<THREE.Group | null> {
  if (cachedLaptopTemplatePromise) {
    return cachedLaptopTemplatePromise;
  }

  const url = getObjectModelUrl('cyberpunk_laptop');
  if (!url) {
    cachedLaptopTemplatePromise = Promise.resolve(null);
    return cachedLaptopTemplatePromise;
  }

  cachedLaptopTemplatePromise = sharedLaptopLoader
    .loadAsync(url)
    .then((gltf) => gltf.scene)
    .catch((err) => {
      console.warn('[CyberpunkPoisonSpecialMove] Failed loading cyberpunk_laptop.glb, using fallback:', err);
      cachedLaptopTemplatePromise = null;
      return null;
    });

  return cachedLaptopTemplatePromise;
}

function createPoisonCloudTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, 256, 256);

  const puffs = [
    [128, 128, 92, 'rgba(34, 197, 94, 0.62)', 'rgba(21, 128, 61, 0.25)'],
    [94, 108, 62, 'rgba(132, 204, 22, 0.56)', 'rgba(34, 197, 94, 0.18)'],
    [164, 118, 60, 'rgba(74, 222, 128, 0.52)', 'rgba(22, 101, 52, 0.16)'],
    [116, 158, 66, 'rgba(101, 163, 13, 0.50)', 'rgba(20, 83, 45, 0.14)'],
    [152, 152, 54, 'rgba(163, 230, 53, 0.42)', 'rgba(34, 197, 94, 0.12)'],
  ] as const;

  for (const [x, y, r, inner, mid] of puffs) {
    const grad = ctx.createRadialGradient(x, y, 4, x, y, r);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.55, mid);
    grad.addColorStop(1, 'rgba(5, 46, 22, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createHoloCodeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = 'rgba(2, 24, 14, 0.72)';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 152);

  ctx.font = 'bold 14px monospace';
  const lines = [
    '> ROOT ACCESS: GRANTED',
    '> TARGET LOCKED [TOXIC]',
    '> DEPLOYING FOG_CORE.BIN',
    '  0x4F 0x9A 0xDE 0xAD',
    '> PAYLOAD: 100% READY',
  ];
  lines.forEach((line, idx) => {
    ctx.fillStyle = idx === 4 ? '#bef264' : '#4ade80';
    ctx.fillText(line, 14, 28 + idx * 26);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface PoisonCloudPuff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  angleOffset: number;
  orbitRadius: number;
  baseY: number;
  riseSpeed: number;
  spinSpeed: number;
  baseScale: number;
  phase: number;
}

interface ToxicSpore {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  heightOffset: number;
  speed: number;
}

interface TypingBones {
  spine: THREE.Object3D | null;
  spine2: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  leftForeArm: THREE.Object3D | null;
  leftHand: THREE.Object3D | null;
  leftIndex: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
  rightForeArm: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  rightIndex: THREE.Object3D | null;
}

export interface CyberpunkPoisonOptions {
  facingTarget?: THREE.Object3D;
  getOpponentPosition?: () => THREE.Vector3;
  onTriggerOpponentStagger?: () => void;
  setOpponentMovementPaused?: (paused: boolean) => void;
  onLaptopOpen?: () => void;
  onKeystroke?: (pitchScale: number) => void;
  onFogRelease?: (targetPos: THREE.Vector3) => void;
  onPoisonTick?: (
    tickIndex: number,
    damage: number,
    word: string,
    opponentPos: THREE.Vector3
  ) => void;
  onComplete?: () => void;
}

/**
 * Modular Three.js + GSAP controller for Priyanshu's realistic Cybersecurity Poison signature:
 * 1. Summons `cyberpunk_laptop.glb` cleanly in front of Priyanshu, smoothly swinging open its lid.
 * 2. Blends Priyanshu's spine, head, elbows, forearms, and fingers onto the glowing keyboard to type fast code.
 * 3. Fires an executable breach packet into the opponent, engulfing them in swirling toxic poison fog with 3 poison damage ticks.
 */
export class CyberpunkPoisonSpecialMove extends BaseSpecialMoves {
  private readonly options: CyberpunkPoisonOptions;
  private readonly bones: TypingBones;

  private elapsedSec = 0;
  private poseBlend = 0;
  private typingIntensity = 0;
  private enterPressDip = 0;
  private fogActive = false;
  private fogIntensity = 0;

  private laptopWrapper: THREE.Group | null = null;
  private clonedLaptopModel: THREE.Group | null = null;
  private laptopLight: THREE.PointLight | null = null;
  private holoScreenMesh: THREE.Mesh | null = null;
  private fogRoot: THREE.Group | null = null;
  private fogLight: THREE.PointLight | null = null;
  private fogPuffs: PoisonCloudPuff[] = [];
  private fogSpores: ToxicSpore[] = [];
  private groundMiasmaRing: THREE.Mesh | null = null;

  private laptopWorldPos = new THREE.Vector3();
  private laptopRight = new THREE.Vector3(0, 0, 1);
  private laptopForward = new THREE.Vector3(1, 0, 0);

  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();
  private readonly _q1 = new THREE.Quaternion();
  private readonly _q2 = new THREE.Quaternion();

  constructor(
    character: THREE.Object3D,
    opponent: THREE.Object3D,
    scene: THREE.Scene,
    options: CyberpunkPoisonOptions = {}
  ) {
    super(character, opponent, scene);
    this.options = options;
    this.bones = this.resolveTypingBones();
  }

  private findBone(targetNormalized: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this.character.traverse((node) => {
      if (found || !node.name) return;
      if (normalizeMixamoBoneName(node.name) === targetNormalized) {
        found = node;
      }
    });
    return found;
  }

  private resolveTypingBones(): TypingBones {
    return {
      spine: this.findBone('Spine'),
      spine2: this.findBone('Spine2') ?? this.findBone('Spine1'),
      neck: this.findBone('Neck'),
      head: this.findBone('Head'),
      leftArm: this.findBone('LeftArm'),
      leftForeArm: this.findBone('LeftForeArm'),
      leftHand: this.findBone('LeftHand'),
      leftIndex: this.findBone('LeftHandIndex1'),
      rightArm: this.findBone('RightArm'),
      rightForeArm: this.findBone('RightForeArm'),
      rightHand: this.findBone('RightHand'),
      rightIndex: this.findBone('RightHandIndex1'),
    };
  }

  public async execute(): Promise<void> {
    if (this.disposed) return;

    const charPos = this.getCharacterWorldPos();
    const oppPos = this.getOpponentWorldPos(this.options.getOpponentPosition);
    const forward = this.computeHorizontalDirection(charPos, oppPos, this.options.facingTarget);
    const facingTarget = this.options.facingTarget ?? this.character;
    facingTarget.rotation.y = Math.atan2(forward.x, forward.z);

    this.laptopForward.copy(forward);
    this.laptopRight.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

    const shoulderHeight = this.bones.spine2
      ? this.bones.spine2.getWorldPosition(new THREE.Vector3()).y - charPos.y
      : 1.18;
    const laptopY = charPos.y + Math.max(0.86, shoulderHeight - 0.16);
    this.laptopWorldPos
      .copy(charPos)
      .addScaledVector(forward, 0.42)
      .setY(laptopY);

    // Load or use cached cyberpunk_laptop.glb cleanly
    const template = await preloadCyberpunkLaptop();
    if (this.disposed) return;
    const laptopModel = (template ?? createProceduralFallbackLaptop()).clone(true);
    this.clonedLaptopModel = laptopModel;

    // Position and orient laptop so keyboard deck & open screen face Priyanshu (angled slightly for visibility)
    const wrapper = new THREE.Group();
    wrapper.position.copy(this.laptopWorldPos).add(new THREE.Vector3(0, -0.22, 0));
    wrapper.rotation.y = Math.atan2(-forward.x, -forward.z) + 0.12;
    wrapper.rotation.x = -0.14;
    wrapper.scale.setScalar(0.01);

    const modelPivot = new THREE.Group();
    modelPivot.scale.setScalar(0.22);
    modelPivot.add(laptopModel);
    wrapper.add(modelPivot);

    // Subtle green/cyan screen spill PointLight on Priyanshu's hands and face
    const screenLight = new THREE.PointLight(0x4ade80, 0, 2.8, 1.8);
    screenLight.position.set(0, 0.28, 0.12);
    wrapper.add(screenLight);
    this.laptopLight = screenLight;

    // Crisp semi-transparent holographic terminal readout floating just above screen
    const holoTex = createHoloCodeTexture();
    const holoMat = new THREE.MeshBasicMaterial({
      map: holoTex ?? undefined,
      color: 0x86efac,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const holoGeo = new THREE.PlaneGeometry(0.32, 0.19);
    const holoMesh = new THREE.Mesh(holoGeo, holoMat);
    holoMesh.position.set(0, 0.36, -0.04);
    wrapper.add(holoMesh);
    this.holoScreenMesh = holoMesh;

    this.scene.add(wrapper);
    this.laptopWrapper = wrapper;

    // Start laptop lid closed and smoothly hinge open via quaternion slerp
    // Note: GLTFLoader sanitizes dots in node names ("Cube.001_3" -> "Cube001_3")
    const lid =
      laptopModel.getObjectByName('Cube001_3') ?? laptopModel.getObjectByName('Cube.001_3');
    const lidOpenQuat = lid ? lid.quaternion.clone() : new THREE.Quaternion();
    const lidClosedQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.04, 0, 0));
    if (lid) {
      lid.quaternion.copy(lidClosedQuat);
    }

    const animState = {
      lidOpen: 0,
      poseBlend: 0,
      typingIntensity: 0,
      enterDip: 0,
      fogIntensity: 0,
    };

    // Tween laptop materialize & opening hinge
    this.trackTween(
      gsap.to(wrapper.position, {
        y: this.laptopWorldPos.y,
        duration: 0.32,
        ease: 'back.out(1.4)',
      })
    );
    this.trackTween(
      gsap.to(wrapper.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 0.3,
        ease: 'back.out(1.5)',
      })
    );
    this.trackTween(
      gsap.to(animState, {
        lidOpen: 1,
        duration: LAPTOP_OPEN_DURATION,
        delay: 0.12,
        ease: 'power2.out',
        onStart: () => {
          this.options.onLaptopOpen?.();
        },
        onUpdate: () => {
          if (lid) {
            lid.quaternion.copy(lidClosedQuat).slerp(lidOpenQuat, animState.lidOpen);
          }
          screenLight.intensity = animState.lidOpen * 1.9;
        },
      })
    );

    // Blend Priyanshu into realistic hunched typing pose
    this.trackTween(
      gsap.to(animState, {
        poseBlend: 1,
        duration: POSE_BLEND_IN_DURATION,
        ease: 'power2.out',
        onUpdate: () => {
          this.poseBlend = animState.poseBlend;
        },
      })
    );

    // Typing burst + hologram readout activation
    this.trackTween(
      gsap.to(animState, {
        typingIntensity: 1,
        duration: 0.18,
        delay: 0.45,
        onUpdate: () => {
          this.typingIntensity = animState.typingIntensity;
        },
      })
    );
    this.trackTween(
      gsap.to(holoMat, {
        opacity: 0.85,
        duration: 0.24,
        delay: 0.5,
        ease: 'power2.out',
      })
    );

    // Schedule authentic rhythmic keystroke audio clicks over the typing window
    const keystrokeTimes = [0.54, 0.67, 0.79, 0.91, 1.02, 1.14, 1.26, 1.38, 1.5, 1.62, 1.74];
    keystrokeTimes.forEach((sec, idx) => {
      const pitch = 0.88 + ((idx * 37) % 10) * 0.03;
      this.scheduleStep(sec, () => {
        this.options.onKeystroke?.(pitch);
      });
    });

    // Dramatic final Enter slam -> breach packet -> Poison Fog eruption
    this.trackTween(
      gsap.to(animState, {
        enterDip: 1,
        duration: 0.08,
        delay: ENTER_SLAM_TIME - 0.06,
        yoyo: true,
        repeat: 1,
        ease: 'power2.in',
        onUpdate: () => {
          this.enterPressDip = animState.enterDip;
        },
      })
    );

    this.scheduleStep(ENTER_SLAM_TIME, () => {
      this.options.onKeystroke?.(0.72);
      this.typingIntensity = 0;
      animState.typingIntensity = 0;
      const liveOpp = this.getOpponentWorldPos(this.options.getOpponentPosition);
      this.spawnCyberPacketBeam(
        this.laptopWorldPos.clone().add(new THREE.Vector3(0, 0.16, 0)),
        liveOpp.clone().setY(0.85)
      );
    });

    // Poison fog starts engulfing opponent cleanly right as cyber payload arrives
    this.scheduleStep(FOG_START_TIME, () => {
      const liveOpp = this.getOpponentWorldPos(this.options.getOpponentPosition);
      this.initPoisonFogSystem(liveOpp);
      this.fogActive = true;
      this.options.setOpponentMovementPaused?.(true);
      this.options.onFogRelease?.(liveOpp.clone());
    });

    this.trackTween(
      gsap.to(animState, {
        fogIntensity: 1,
        duration: 0.4,
        delay: FOG_START_TIME,
        ease: 'power2.out',
        onUpdate: () => {
          this.fogIntensity = animState.fogIntensity;
        },
      })
    );

    // 3 escalating Poison Damage + Choke ticks inside the toxic cloud
    POISON_TICK_TIMES.forEach((sec, idx) => {
      this.scheduleStep(sec, () => {
        const liveOpp = this.getOpponentWorldPos(this.options.getOpponentPosition);
        this.options.onTriggerOpponentStagger?.();
        this.options.onPoisonTick?.(
          idx,
          POISON_TICK_DAMAGES[idx],
          POISON_TICK_WORDS[idx],
          liveOpp.clone()
        );
      });
    });

    // Close laptop & drop Priyanshu cleanly back to combat stance
    this.trackTween(
      gsap.to(holoMat, {
        opacity: 0,
        duration: 0.22,
        delay: TYPING_END_TIME + 0.55,
      })
    );
    this.trackTween(
      gsap.to(animState, {
        lidOpen: 0,
        duration: 0.3,
        delay: TYPING_END_TIME + 0.72,
        ease: 'power2.in',
        onUpdate: () => {
          if (lid) {
            lid.quaternion.copy(lidClosedQuat).slerp(lidOpenQuat, animState.lidOpen);
          }
          screenLight.intensity = animState.lidOpen * 1.9;
        },
      })
    );
    this.trackTween(
      gsap.to(wrapper.scale, {
        x: 0.01,
        y: 0.01,
        z: 0.01,
        duration: 0.26,
        delay: TYPING_END_TIME + 1.02,
        ease: 'power2.in',
        onComplete: () => {
          this.detachLaptopSafely();
        },
      })
    );
    this.trackTween(
      gsap.to(animState, {
        poseBlend: 0,
        duration: 0.35,
        delay: TYPING_END_TIME + 0.9,
        ease: 'power2.out',
        onUpdate: () => {
          this.poseBlend = animState.poseBlend;
        },
      })
    );

    // Release movement/cinematic lock so fight resumes smoothly while fog dissipates
    this.scheduleStep(CINEMATIC_RELEASE_TIME, () => {
      this.options.setOpponentMovementPaused?.(false);
      this.options.onComplete?.();
    });

    // Fade out poison fog gracefully after its lingering window
    this.trackTween(
      gsap.to(animState, {
        fogIntensity: 0,
        duration: 0.72,
        delay: FOG_START_TIME + FOG_DURATION_SECONDS - 0.65,
        ease: 'power2.in',
        onUpdate: () => {
          this.fogIntensity = animState.fogIntensity;
        },
        onComplete: () => {
          this.fogActive = false;
          this.disposePoisonFog();
        },
      })
    );

    return new Promise<void>((resolve) => {
      this.scheduleStep(FOG_START_TIME + FOG_DURATION_SECONDS + 0.15, () => {
        resolve();
      });
    });
  }

  private scheduleStep(delaySec: number, callback: () => void): void {
    const proxy = { t: 0 };
    const tween = gsap.to(proxy, {
      t: 1,
      duration: Math.max(0.01, delaySec),
      onComplete: () => {
        this.untrackTween(tween);
        if (!this.disposed) callback();
      },
    });
    this.trackTween(tween);
  }

  private spawnCyberPacketBeam(startPos: THREE.Vector3, endPos: THREE.Vector3): void {
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
    });
    const beamGeo = new THREE.SphereGeometry(0.11, 14, 10);
    const packet = new THREE.Mesh(beamGeo, beamMat);
    packet.position.copy(startPos);
    this.addTransientObject(packet);

    const moveTween = gsap.to(packet.position, {
      x: endPos.x,
      y: endPos.y,
      z: endPos.z,
      duration: 0.16,
      ease: 'power2.in',
      onComplete: () => {
        this.untrackTween(moveTween);
        this.destroyTransientObject(packet);
      },
    });
    this.trackTween(moveTween);
  }

  private initPoisonFogSystem(initialPos: THREE.Vector3): void {
    this.disposePoisonFog();

    const root = new THREE.Group();
    root.position.set(initialPos.x, 0, initialPos.z);

    // Subtle ground miasma halo directly beneath the opponent
    const ringGeo = new THREE.RingGeometry(0.28, 1.32, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.035;
    root.add(ringMesh);
    this.groundMiasmaRing = ringMesh;

    const fogTex = createPoisonCloudTexture();
    const palette = [0x22c55e, 0x4ade80, 0x84cc16, 0x16a34a, 0xa3e635];

    for (let i = 0; i < 16; i++) {
      const mat = new THREE.SpriteMaterial({
        map: fogTex ?? undefined,
        color: palette[i % palette.length],
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.renderOrder = 14;
      const puff: PoisonCloudPuff = {
        sprite,
        mat,
        angleOffset: (i / 16) * Math.PI * 2 + Math.random() * 0.4,
        orbitRadius: 0.18 + (i % 4) * 0.24,
        baseY: 0.2 + (i % 5) * 0.34,
        riseSpeed: 0.16 + (i % 3) * 0.08,
        spinSpeed: (i % 2 === 0 ? 1 : -1) * (0.45 + (i % 4) * 0.18),
        baseScale: 1.05 + (i % 4) * 0.32,
        phase: i * 0.63,
      };
      root.add(sprite);
      this.fogPuffs.push(puff);
    }

    // Rising toxic acid bubbles / spores inside the poison cloud
    const sporeGeo = new THREE.SphereGeometry(0.036, 8, 6);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xa3e635 : 0x4ade80,
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(sporeGeo, mat);
      root.add(mesh);
      this.fogSpores.push({
        mesh,
        mat,
        angle: (i / 14) * Math.PI * 2,
        radius: 0.28 + Math.random() * 0.65,
        heightOffset: (i / 14) * 1.75,
        speed: 0.7 + Math.random() * 0.65,
      });
    }

    const fogLight = new THREE.PointLight(0x4ade80, 0, 4.2, 1.5);
    fogLight.position.set(0, 1.15, 0);
    root.add(fogLight);
    this.fogLight = fogLight;

    this.scene.add(root);
    this.fogRoot = root;
  }

  /**
   * Called every frame right after AnimationMixer update so upper-body typing IK,
   * hologram shimmer, and opponent poison cloud swirl stay silky smooth.
   */
  public update(deltaSec: number): void {
    if (this.disposed) return;
    this.elapsedSec += deltaSec;

    if (this.holoScreenMesh) {
      this.holoScreenMesh.position.y = 0.35 + Math.sin(this.elapsedSec * 7.5) * 0.012;
      if (this.laptopLight && this.typingIntensity > 0) {
        this.laptopLight.intensity = 1.65 + Math.sin(this.elapsedSec * 28) * 0.32;
      }
    }

    if (this.poseBlend > 0.005) {
      this.applyTypingPose();
    }

    if (this.fogActive && this.fogRoot) {
      const oppPos = this.getOpponentWorldPos(this.options.getOpponentPosition);
      this.fogRoot.position.x = THREE.MathUtils.lerp(this.fogRoot.position.x, oppPos.x, 0.22);
      this.fogRoot.position.z = THREE.MathUtils.lerp(this.fogRoot.position.z, oppPos.z, 0.22);

      if (this.groundMiasmaRing) {
        const ringMat = this.groundMiasmaRing.material as THREE.MeshBasicMaterial;
        ringMat.opacity = 0.42 * this.fogIntensity;
        const pulse = 1 + Math.sin(this.elapsedSec * 5.2) * 0.08;
        this.groundMiasmaRing.scale.set(pulse, pulse, 1);
      }
      if (this.fogLight) {
        this.fogLight.intensity = (2.1 + Math.sin(this.elapsedSec * 9) * 0.45) * this.fogIntensity;
      }

      for (const puff of this.fogPuffs) {
        const t = this.elapsedSec * puff.spinSpeed + puff.angleOffset;
        const cycle = (this.elapsedSec * puff.riseSpeed + puff.phase * 0.2) % 1;
        const rad = puff.orbitRadius * (0.85 + cycle * 0.55);
        puff.sprite.position.set(
          Math.cos(t) * rad,
          puff.baseY + cycle * 0.65,
          Math.sin(t) * rad
        );
        const s = puff.baseScale * (0.78 + cycle * 0.55);
        puff.sprite.scale.set(s, s, 1);
        puff.mat.rotation = t * 0.65;
        const lifeFade = Math.sin(cycle * Math.PI);
        puff.mat.opacity = 0.62 * this.fogIntensity * (0.45 + 0.55 * lifeFade);
      }

      for (const spore of this.fogSpores) {
        const h = (spore.heightOffset + this.elapsedSec * spore.speed) % 1.95;
        const sway = spore.angle + this.elapsedSec * 1.4;
        spore.mesh.position.set(
          Math.cos(sway) * spore.radius,
          0.12 + h,
          Math.sin(sway) * spore.radius
        );
        spore.mat.opacity = 0.85 * this.fogIntensity * (1 - h / 2.1);
      }
    }
  }

  private applyTypingPose(): void {
    const w = this.poseBlend;
    const {
      spine,
      spine2,
      neck,
      head,
      leftArm,
      leftForeArm,
      leftHand,
      leftIndex,
      rightArm,
      rightForeArm,
      rightHand,
      rightIndex,
    } = this.bones;

    // Subtle natural forward lean & screen gaze
    spine?.rotateX(0.08 * w);
    spine2?.rotateX(0.11 * w);
    neck?.rotateX(0.14 * w);
    head?.rotateX(0.16 * w);

    this.character.updateMatrixWorld(true);
    const charPos = this.getCharacterWorldPos();

    // Compute world keyboard target points slightly alternating with fast keystrokes
    const leftTap =
      this.typingIntensity * Math.max(0, Math.sin(this.elapsedSec * 29)) * 0.032;
    const rightTap =
      this.typingIntensity * Math.max(0, Math.cos(this.elapsedSec * 33 + 0.8)) * 0.032 +
      this.enterPressDip * 0.055;

    const leftElbowHint = this._v1
      .copy(charPos)
      .addScaledVector(this.laptopForward, 0.18)
      .addScaledVector(this.laptopRight, -0.25)
      .setY(this.laptopWorldPos.y + 0.06);
    const rightElbowHint = this._v2
      .copy(charPos)
      .addScaledVector(this.laptopForward, 0.18)
      .addScaledVector(this.laptopRight, 0.25)
      .setY(this.laptopWorldPos.y + 0.06);

    const leftKeyTarget = this._v3
      .copy(this.laptopWorldPos)
      .addScaledVector(this.laptopRight, -0.095 + Math.sin(this.elapsedSec * 7.2) * 0.025)
      .addScaledVector(this.laptopForward, 0.02)
      .add(new THREE.Vector3(0, 0.055 - leftTap, 0));

    if (leftArm && leftForeArm && leftHand) {
      this.aimBoneSegment(leftArm, leftForeArm, leftElbowHint, w);
      this.aimBoneSegment(leftForeArm, leftHand, leftKeyTarget, w);
      leftHand.rotateX((0.28 + leftTap * 6) * w);
      leftIndex?.rotateX((0.45 + leftTap * 10) * w);
    }

    const rightKeyTarget = this._v3
      .copy(this.laptopWorldPos)
      .addScaledVector(this.laptopRight, 0.095 + Math.cos(this.elapsedSec * 6.5) * 0.025)
      .addScaledVector(this.laptopForward, 0.02)
      .add(new THREE.Vector3(0, 0.055 - rightTap, 0));

    if (rightArm && rightForeArm && rightHand) {
      this.aimBoneSegment(rightArm, rightForeArm, rightElbowHint, w);
      this.aimBoneSegment(rightForeArm, rightHand, rightKeyTarget, w);
      rightHand.rotateX((0.28 + rightTap * 6) * w);
      rightIndex?.rotateX((0.45 + rightTap * 10) * w);
    }
  }

  private aimBoneSegment(
    bone: THREE.Object3D,
    childJoint: THREE.Object3D,
    targetWorld: THREE.Vector3,
    weight: number
  ): void {
    bone.parent?.updateWorldMatrix(true, false);
    bone.updateWorldMatrix(true, true);

    const origin = bone.getWorldPosition(new THREE.Vector3());
    const tip = childJoint.getWorldPosition(new THREE.Vector3());
    const currentDir = tip.sub(origin);
    const desiredDir = targetWorld.clone().sub(origin);
    if (currentDir.lengthSq() < 1e-6 || desiredDir.lengthSq() < 1e-6) return;

    currentDir.normalize();
    desiredDir.normalize();

    const deltaWorld = this._q1.setFromUnitVectors(currentDir, desiredDir);
    const boneWorldQuat = bone.getWorldQuaternion(new THREE.Quaternion());
    const targetWorldQuat = deltaWorld.multiply(boneWorldQuat);

    const parentWorldQuat = bone.parent
      ? bone.parent.getWorldQuaternion(this._q2)
      : this._q2.identity();
    const targetLocalQuat = parentWorldQuat.invert().multiply(targetWorldQuat);
    bone.quaternion.slerp(targetLocalQuat, weight);
    bone.updateMatrixWorld(true);
  }

  private detachLaptopSafely(): void {
    if (this.clonedLaptopModel) {
      // Detach shared GLTF clone before disposing wrapper children so cached template textures stay intact
      this.clonedLaptopModel.removeFromParent();
      this.clonedLaptopModel = null;
    }
    if (this.laptopWrapper) {
      this.laptopWrapper.removeFromParent();
      disposeObject3D(this.laptopWrapper);
      this.laptopWrapper = null;
    }
    this.laptopLight = null;
    this.holoScreenMesh = null;
  }

  private disposePoisonFog(): void {
    if (this.fogRoot) {
      this.fogRoot.removeFromParent();
      disposeObject3D(this.fogRoot);
      this.fogRoot = null;
    }
    this.groundMiasmaRing = null;
    this.fogLight = null;
    this.fogPuffs = [];
    this.fogSpores = [];
  }

  public override dispose(): void {
    this.fogActive = false;
    this.poseBlend = 0;
    this.detachLaptopSafely();
    this.disposePoisonFog();
    super.dispose();
  }
}

export function pickCyberHackQuip(index: number): string {
  return CYBER_HACK_QUIPS[index % CYBER_HACK_QUIPS.length];
}
