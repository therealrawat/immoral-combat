import * as THREE from 'three';
import { getCharacterDisplayName } from './characterNames';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import chinuFaceUrl from '../../chinu.jpeg';
import priyanshuFaceUrl from '../../priyanshu.jpeg';
import { extractSkeletonRestProfile, retargetClipToCharacter } from './AnimationRetargeter';
import { createHumanoidGLBClips } from './GLBClipsBuilder';
import {
  buildConventionNativeClipSpecs,
  getCharacterAvatarUrls,
  getCharacterIdleUrl,
} from './ModelAssetRegistry';
import { sharedAnimationManager } from './SharedAnimationManager';
import {
  CharacterBoneName,
  CharacterId,
  FighterRig,
  FighterState,
  SelectIdleVariant,
} from '../types/game';

export interface LoadedNativeGLBClips {
  clips: Partial<Record<FighterState, THREE.AnimationClip>>;
  clipSpeeds: Partial<Record<FighterState, number>>;
  clipRepetitions: Partial<Record<FighterState, number>>;
}

export interface LoadedCharacterGLBBundle extends LoadedNativeGLBClips {
  scene: THREE.Group;
}

export const MODIJI_PORTRAIT_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#6d28d9"/>
          <stop offset="100%" stop-color="#312e81"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" fill="url(#bg)"/>
      <circle cx="64" cy="52" r="46" fill="#111827"/>
      <path d="M22 128 C24 88, 104 88, 106 128 Z" fill="#1e1b4b"/>
      <path d="M40 94 L88 94 L80 116 L48 116 Z" fill="#f8fafc"/>
      <ellipse cx="64" cy="60" rx="26" ry="30" fill="#f1c7a5"/>
      <path d="M36 46 Q64 26 92 46 Q92 32 64 26 Q36 32 36 46 Z" fill="#f8fafc"/>
      <rect x="0" y="0" width="128" height="128" rx="24" fill="#ffedd5"/>
      <path d="M22 128 C22 92 106 92 106 128 Z" fill="#f97316"/>
      <path d="M44 102 L64 128 L84 102 Z" fill="#ffffff"/>
      <ellipse cx="64" cy="40" rx="28" ry="18" fill="#e2e8f0"/>
      <ellipse cx="64" cy="63" rx="24" ry="27" fill="#eab38c"/>
      <path d="M40 62 C40 90 88 90 88 62 C85 83 43 83 40 62 Z" fill="#f8fafc"/>
      <path d="M47 72 Q64 89 81 72 L78 86 Q64 96 50 86 Z" fill="#f8fafc"/>
      <path d="M46 53 L58 51 M70 51 L82 53" stroke="#cbd5e1" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="53" cy="60" r="8" fill="none" stroke="#1e293b" stroke-width="2.8"/>
      <circle cx="75" cy="60" r="8" fill="none" stroke="#1e293b" stroke-width="2.8"/>
      <line x1="61" y1="60" x2="67" y2="60" stroke="#1e293b" stroke-width="2.8"/>
      <circle cx="53" cy="60" r="3.1" fill="#dc2626"/>
      <circle cx="75" cy="60" r="3.1" fill="#dc2626"/>
      <path d="M56 74 Q64 79 72 74" fill="none" stroke="#9a3412" stroke-width="2.8" stroke-linecap="round"/>
    </svg>`
  );

interface CharacterVisualTheme {
  displayName: string;
  faceUrl: string;
  shirtColor: number;
  pantsColor: number;
  skinColor: number;
  gloveColor: number;
  shoeColor: number;
  accentColor: number;
  hairColor: number;
  isFemale: boolean;
}

const HEAD_SIZE = 0.62;
const HEAD_BEVEL_RADIUS = 0.06;
const HEAD_BEVEL_SEGMENTS = 4;

/** Real-world heights (Chinu 5'0" = 1.524 m, Priyanshu 5'6" = 1.6764 m) scaled uniformly to ring units. */
const RING_UNITS_PER_METER = 1.42;

export const TRUMP_PORTRAIT_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fde047"/>
          <stop offset="100%" stop-color="#b45309"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="22" fill="url(#bg)"/>
      <path d="M22 120 C26 93 40 84 60 84 C80 84 94 93 98 120 Z" fill="#fefce8"/>
      <path d="M52 84 L60 116 L68 84 Z" fill="#eab308"/>
      <ellipse cx="60" cy="58" rx="23" ry="26" fill="#f5b895"/>
      <path d="M36 42 L60 12 L84 42 Z" fill="#fffbeb" stroke="#d97706" stroke-width="3"/>
      <path d="M57 22 V36 M50 29 H64" stroke="#eab308" stroke-width="3" stroke-linecap="round"/>
      <path d="M37 42 Q60 32 83 42 Q76 47 44 47 Z" fill="#facc15"/>
      <circle cx="51" cy="57" r="2.7" fill="#1e293b"/>
      <circle cx="69" cy="57" r="2.7" fill="#1e293b"/>
      <path d="M51 70 Q60 73 69 70" stroke="#7c2d12" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    </svg>`
  );

export const PUTIN_PORTRAIT_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ef4444"/>
          <stop offset="100%" stop-color="#7f1d1d"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="22" fill="url(#bg)"/>
      <path d="M20 120 C25 91 39 83 60 83 C81 83 95 91 100 120 Z" fill="#0f172a"/>
      <path d="M51 83 L60 116 L69 83 Z" fill="#dc2626"/>
      <path d="M46 83 L60 100 L74 83 Z" fill="#f8fafc"/>
      <ellipse cx="60" cy="56" rx="22" ry="26" fill="#f2c4a6"/>
      <path d="M39 45 Q60 34 81 45 Q75 36 60 36 Q45 36 39 45 Z" fill="#cbd5e1"/>
      <path d="M45 50 L56 52 M64 52 L75 50" stroke="#94a3b8" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="51" cy="56" r="2.5" fill="#1e293b"/>
      <circle cx="69" cy="56" r="2.5" fill="#1e293b"/>
      <path d="M52 69 H68" stroke="#7c2d12" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`
  );

const CHARACTER_HEIGHT_METERS: Record<CharacterId, number> = {
  chinu: 1.524,      // 5'0" (60 in)
  priyanshu: 1.6764, // 5'6" (66 in)
  modiji: 1.7018,    // 5'7" (67 in)
  trump: 1.7272,     // 5'8" (68 in)
  putin: 1.7018,     // 5'7" (67 in)
};

const CHARACTER_THEMES: Record<CharacterId, CharacterVisualTheme> = {
  chinu: {
    displayName: getCharacterDisplayName('chinu'),
    faceUrl: chinuFaceUrl,
    shirtColor: 0xff3b7f,
    pantsColor: 0x2b2d42,
    skinColor: 0xe6ad87,
    gloveColor: 0xffd426,
    shoeColor: 0xffffff,
    accentColor: 0xff7aa8,
    hairColor: 0x3a261f,
    isFemale: true,
  },
  priyanshu: {
    displayName: getCharacterDisplayName('priyanshu'),
    faceUrl: priyanshuFaceUrl,
    shirtColor: 0x2d8cff,
    pantsColor: 0x334155,
    skinColor: 0xdca07b,
    gloveColor: 0x60a5fa,
    shoeColor: 0x1e293b,
    accentColor: 0xff595e,
    hairColor: 0x2d2725,
    isFemale: false,
  },
  modiji: {
    displayName: getCharacterDisplayName('modiji'),
    faceUrl: MODIJI_PORTRAIT_DATA_URL,
    shirtColor: 0xf97316,
    pantsColor: 0xf8fafc,
    skinColor: 0xe3ac84,
    gloveColor: 0xfb923c,
    shoeColor: 0x1e293b,
    accentColor: 0xff7a00,
    hairColor: 0xe2e8f0,
    isFemale: false,
  },
  trump: {
    displayName: getCharacterDisplayName('trump'),
    faceUrl: TRUMP_PORTRAIT_DATA_URL,
    shirtColor: 0xfefce8,
    pantsColor: 0xf8fafc,
    skinColor: 0xf3b48f,
    gloveColor: 0xeab308,
    shoeColor: 0x334155,
    accentColor: 0xeab308,
    hairColor: 0xfacc15,
    isFemale: false,
  },
  putin: {
    displayName: getCharacterDisplayName('putin'),
    faceUrl: PUTIN_PORTRAIT_DATA_URL,
    shirtColor: 0x1e293b,
    pantsColor: 0x0f172a,
    skinColor: 0xf0c2a4,
    gloveColor: 0xdc2626,
    shoeColor: 0x0f172a,
    accentColor: 0xdc2626,
    hairColor: 0xcbd5e1,
    isFemale: false,
  },
};

function loadPortraitTexture(imageUrl: string): THREE.Texture | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const loader = new THREE.TextureLoader();
  const texture = loader.load(imageUrl, (loaded) => {
    const img = loaded.image as { width?: number; height?: number } | undefined;
    if (!img?.width || !img?.height || img.width === img.height) {
      return;
    }

    // Safety center-crop if a non-square portrait is ever swapped in
    if (img.width > img.height) {
      const ratio = img.height / img.width;
      loaded.repeat.set(ratio, 1);
      loaded.offset.set((1 - ratio) * 0.5, 0);
    } else {
      const ratio = img.width / img.height;
      loaded.repeat.set(1, ratio);
      loaded.offset.set(0, (1 - ratio) * 0.5);
    }
    loaded.needsUpdate = true;
  });

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function makeStandardMaterial(color: number, roughness = 0.8): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.04,
  });
}

/**
 * Creates articulated designer-toy fighter rigs for Chinu and Priyanshu
 * with beveled RoundedBoxGeometry bodies, 1:1 square heads, 6-material head arrays,
 * and TextureLoader portrait faces strictly mapped to the front (+Z) face.
 */
export class CharacterFactory {
  private static readonly baseModelCache = new Map<CharacterId, Promise<THREE.Group | null>>();

  public static createFighter(
    id: CharacterId,
    homePosition: THREE.Vector3,
    facingDirection: 1 | -1
  ): FighterRig {
    const theme = CHARACTER_THEMES[id];
    const bodyMeshes: THREE.Mesh[] = [];

    const root = new THREE.Group();
    root.name = `FighterRoot_${id}`;
    root.position.copy(homePosition);

    const heightRatio = CHARACTER_HEIGHT_METERS[id] / CHARACTER_HEIGHT_METERS.priyanshu;

    const modelRoot = new THREE.Group();
    modelRoot.name = `ModelRoot_${id}`;
    modelRoot.rotation.y = facingDirection === 1 ? Math.PI / 2 : -Math.PI / 2;
    modelRoot.scale.setScalar(heightRatio);
    root.add(modelRoot);

    // Every character material uses MeshStandardMaterial with natural matte-vinyl roughness (~0.8)
    const shirtMat = makeStandardMaterial(theme.shirtColor, 0.8);
    const pantsMat = makeStandardMaterial(theme.pantsColor, 0.82);
    const skinMat = makeStandardMaterial(theme.skinColor, 0.8);
    const gloveMat = makeStandardMaterial(theme.gloveColor, 0.74);
    const shoeMat = makeStandardMaterial(theme.shoeColor, 0.8);
    const hairMat = makeStandardMaterial(theme.hairColor, 0.84);
    const accentMat = makeStandardMaterial(theme.accentColor, 0.78);

    const registerShadow = (mesh: THREE.Mesh, recordForFlash = true): THREE.Mesh => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (recordForFlash) {
        bodyMeshes.push(mesh);
      }
      return mesh;
    };

    const bones: Record<CharacterBoneName, THREE.Group> = {
      Hips: new THREE.Group(),
      Torso: new THREE.Group(),
      Head: new THREE.Group(),
      ArmL: new THREE.Group(),
      ArmR: new THREE.Group(),
      LegL: new THREE.Group(),
      LegR: new THREE.Group(),
    };

    (Object.keys(bones) as CharacterBoneName[]).forEach((name) => {
      bones[name].name = name;
    });

    // 1. Hips (beveled designer-toy pelvis)
    bones.Hips.position.set(0, 0.95, 0);
    modelRoot.add(bones.Hips);

    const pelvisMesh = registerShadow(
      new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.24, 0.34, 3, 0.06), pantsMat)
    );
    bones.Hips.add(pelvisMesh);

    // 2. Legs + beveled shoes
    const buildLeg = (pivot: THREE.Group, xOffset: number) => {
      pivot.position.set(xOffset, -0.04, 0);
      bones.Hips.add(pivot);

      const legCapsule = registerShadow(
        new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.52, 6, 12), pantsMat)
      );
      legCapsule.position.set(0, -0.4, 0);
      pivot.add(legCapsule);

      const shoeMesh = registerShadow(
        new THREE.Mesh(new RoundedBoxGeometry(0.23, 0.15, 0.35, 3, 0.045), shoeMat)
      );
      shoeMesh.position.set(0, -0.82, 0.06);
      pivot.add(shoeMesh);
    };

    buildLeg(bones.LegL, 0.18);
    buildLeg(bones.LegR, -0.18);

    const footAnchor = new THREE.Object3D();
    footAnchor.position.set(0, -0.8, 0.2);
    bones.LegR.add(footAnchor);

    // 3. Torso (beveled RoundedBoxGeometry)
    bones.Torso.position.set(0, 0.12, 0);
    bones.Hips.add(bones.Torso);

    const torsoGeo = theme.isFemale
      ? new RoundedBoxGeometry(0.58, 0.66, 0.36, 4, 0.085)
      : new RoundedBoxGeometry(0.64, 0.7, 0.38, 4, 0.09);
    const torsoMesh = registerShadow(new THREE.Mesh(torsoGeo, shirtMat));
    torsoMesh.position.set(0, 0.34, 0);
    bones.Torso.add(torsoMesh);

    if (theme.isFemale) {
      const emblem = registerShadow(
        new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.05, 2, 0.015), gloveMat),
        false
      );
      emblem.rotation.z = Math.PI / 4;
      emblem.position.set(0, 0.38, 0.19);
      bones.Torso.add(emblem);
    } else {
      const tie = registerShadow(
        new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.34, 0.05, 2, 0.015), accentMat),
        false
      );
      tie.position.set(0, 0.34, 0.2);
      bones.Torso.add(tie);
    }

    // 4. Arms + Oversized Boxing Gloves
    const buildArm = (pivot: THREE.Group, xOffset: number) => {
      pivot.position.set(xOffset, 0.56, 0);
      bones.Torso.add(pivot);

      const armCapsule = registerShadow(
        new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.38, 6, 12), skinMat)
      );
      armCapsule.position.set(0, -0.26, 0);
      pivot.add(armCapsule);

      const gloveMesh = registerShadow(
        new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.08, 8, 14), gloveMat)
      );
      gloveMesh.position.set(0, -0.56, 0.04);
      gloveMesh.rotation.x = Math.PI / 2;
      pivot.add(gloveMesh);
    };

    buildArm(bones.ArmL, 0.42);
    buildArm(bones.ArmR, -0.42);

    const fistAnchor = new THREE.Object3D();
    fistAnchor.position.set(0, -0.58, 0.14);
    bones.ArmR.add(fistAnchor);

    // 5. Head: 1:1 square RoundedBoxGeometry with 6-material array
    // Index 4 (+Z Front) strictly receives the TextureLoader face photo without borders.
    bones.Head.position.set(0, 0.72, 0);
    bones.Torso.add(bones.Head);

    const neckMesh = registerShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 12), skinMat)
    );
    neckMesh.position.set(0, 0.04, 0);
    bones.Head.add(neckMesh);

    const headVisualGroup = new THREE.Group();
    headVisualGroup.position.set(0, 0.34, 0);
    // Natural 3/4 turn toward camera (+Z world) so both faces read clearly without foreshortening
    headVisualGroup.rotation.y = facingDirection === 1 ? -0.66 : 0.66;
    bones.Head.add(headVisualGroup);

    const faceTexture = loadPortraitTexture(theme.faceUrl);
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: faceTexture,
      roughness: 0.8,
      metalness: 0.02,
    });

    // Material array order for BoxGeometry / RoundedBoxGeometry:
    // [0: right (+X), 1: left (-X), 2: top (+Y), 3: bottom (-Y), 4: front (+Z), 5: back (-Z)]
    const headMaterials: THREE.MeshStandardMaterial[] = [
      hairMat,
      hairMat,
      hairMat,
      skinMat,
      faceMat,
      hairMat,
    ];

    const headGeo = new RoundedBoxGeometry(
      HEAD_SIZE,
      HEAD_SIZE,
      HEAD_SIZE,
      HEAD_BEVEL_SEGMENTS,
      HEAD_BEVEL_RADIUS
    );
    const headMesh = registerShadow(new THREE.Mesh(headGeo, headMaterials));
    headVisualGroup.add(headMesh);

    if (theme.isFemale) {
      // Stylized headband & back ponytail tucked cleanly behind the front (+Z) portrait edge
      const headband = registerShadow(
        new THREE.Mesh(new RoundedBoxGeometry(HEAD_SIZE + 0.03, 0.075, HEAD_SIZE - 0.08, 3, 0.03), accentMat),
        false
      );
      headband.position.set(0, 0.27, -0.05);
      headVisualGroup.add(headband);

      const hairBun = registerShadow(
        new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.22, 0.18, 3, 0.06), hairMat)
      );
      hairBun.position.set(0, 0.14, -0.34);
      headVisualGroup.add(hairBun);

      const ponytail = registerShadow(
        new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.32, 6, 10), hairMat)
      );
      ponytail.position.set(0, -0.02, -0.39);
      ponytail.rotation.x = 0.45;
      headVisualGroup.add(ponytail);
    } else {
      // Stylized soft rounded hair volume positioned on the upper-back crown so the front face stays clean
      const backHair = registerShadow(
        new THREE.Mesh(new RoundedBoxGeometry(HEAD_SIZE * 0.9, 0.14, HEAD_SIZE * 0.72, 3, 0.05), hairMat)
      );
      backHair.position.set(0, 0.31, -0.08);
      headVisualGroup.add(backHair);

      const tuftLeft = registerShadow(
        new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.17, 0.15, 3, 0.05), hairMat)
      );
      tuftLeft.position.set(0.09, 0.37, -0.03);
      tuftLeft.rotation.z = -0.22;

      const tuftRight = registerShadow(
        new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.19, 0.15, 3, 0.05), hairMat)
      );
      tuftRight.position.set(-0.09, 0.38, -0.05);
      tuftRight.rotation.z = 0.28;

      headVisualGroup.add(tuftLeft, tuftRight);
    }

    const headAnchor = new THREE.Object3D();
    headAnchor.position.set(0, 0.76, 0);
    bones.Head.add(headAnchor);

    const leftEyeAnchor = new THREE.Object3D();
    leftEyeAnchor.position.set(0.11, 0.37, 0.32);
    const rightEyeAnchor = new THREE.Object3D();
    rightEyeAnchor.position.set(-0.11, 0.37, 0.32);
    bones.Head.add(leftEyeAnchor, rightEyeAnchor);

    // Invisible hurtbox proxy (uses MeshStandardMaterial with visible: false for PhysicsCombatSystem Box3 checks)
    const hurtboxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 1.95 * heightRatio, 0.85),
      new THREE.MeshStandardMaterial({ visible: false, roughness: 0.8 })
    );
    hurtboxMesh.position.set(0, 1.0 * heightRatio, 0);
    root.add(hurtboxMesh);

    return {
      id,
      displayName: theme.displayName,
      root,
      modelRoot,
      bones,
      hurtboxMesh,
      hurtbox: new THREE.Box3(),
      fistAnchor,
      footAnchor,
      headAnchor,
      leftEyeAnchor,
      rightEyeAnchor,
      headVisualGroup,
      homePosition: homePosition.clone(),
      facingDirection,
      bodyMeshes,
    };
  }

  /**
   * Loads Priyanshu's 3D Avaturn GLB model (`models/priyanshu/priyanshu-avatar.glb` with full
   * outfit/hair/shoes, falling back to `models/priyanshu/priyanshu-body.glb` if needed).
   */
  public static async loadPriyanshuGLBModel(): Promise<THREE.Group | null> {
    return this.loadCharacterGLBModel('priyanshu');
  }

  public static async loadModijiGLBModel(): Promise<THREE.Group | null> {
    return this.loadCharacterGLBModel('modiji');
  }

  public static async loadChinuGLBModel(): Promise<THREE.Group | null> {
    return this.loadCharacterGLBModel('chinu');
  }

  private static readonly resolvedBaseModels = new Set<CharacterId>();

  public static isBaseModelLoaded(characterId: CharacterId): boolean {
    return this.resolvedBaseModels.has(characterId);
  }

  public static async loadCharacterGLBModel(
    characterId: CharacterId
  ): Promise<THREE.Group | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    let pending = this.baseModelCache.get(characterId);
    if (!pending) {
      pending = this.fetchBaseCharacterTemplate(characterId).then((scene) => {
        if (scene) {
          this.resolvedBaseModels.add(characterId);
        }
        return scene;
      });
      this.baseModelCache.set(characterId, pending);
    }

    const template = await pending;
    return template ? (SkeletonUtils.clone(template) as THREE.Group) : null;
  }

  private static async fetchBaseCharacterTemplate(
    characterId: CharacterId
  ): Promise<THREE.Group | null> {
    const loader = new GLTFLoader();
    const configMap: Record<
      CharacterId,
      { urls: string[]; name: string; fallbackScale: number; groundY: number }
    > = {
      chinu: {
        urls: getCharacterAvatarUrls('chinu'),
        name: 'ChinuGLBScene',
        fallbackScale: 1.147,
        groundY: 0.01,
      },
      priyanshu: {
        urls: getCharacterAvatarUrls('priyanshu'),
        name: 'PriyanshuGLBScene',
        fallbackScale: 1.27,
        groundY: 0.012,
      },
      modiji: {
        urls: getCharacterAvatarUrls('modiji'),
        name: 'ModijiGLBScene',
        fallbackScale: 1.3044,
        groundY: 0.004,
      },
      trump: {
        urls: getCharacterAvatarUrls('trump'),
        name: 'TrumpGLBScene',
        fallbackScale: 1.324,
        groundY: 0.004,
      },
      putin: {
        urls: getCharacterAvatarUrls('putin'),
        name: 'PutinGLBScene',
        fallbackScale: 1.3044,
        groundY: 0.004,
      },
    };
    const config = configMap[characterId];
    const targetWorldHeight = CHARACTER_HEIGHT_METERS[characterId] * RING_UNITS_PER_METER;

    for (const url of config.urls) {
      try {
        const gltf = await loader.loadAsync(url);
        const scene = gltf.scene;
        scene.name = config.name;
        scene.updateMatrixWorld(true);

        const bounds = new THREE.Box3().setFromObject(scene);
        const rawHeight = bounds.max.y - bounds.min.y;
        const scale =
          Number.isFinite(rawHeight) && rawHeight > 0.2
            ? targetWorldHeight / rawHeight
            : config.fallbackScale;
        const groundY = Number.isFinite(bounds.min.y)
          ? -bounds.min.y * scale + 0.004
          : config.groundY;

        scene.scale.setScalar(scale);
        scene.position.set(0, groundY, 0);
        return scene;
      } catch (err) {
        console.warn(`Failed loading ${characterId} GLB ${url}:`, err);
      }
    }

    return null;
  }

  /**
   * Loads a character's `idle-1` or `idle-2` GLB clip (falling back to `idle-1`),
   * retargeted onto `targetRoot` with showcase yaw alignment for Character Select.
   */
  public static async loadSelectIdleClip(
    characterId: CharacterId,
    variant: SelectIdleVariant,
    yawOffsetRad = 0,
    targetRoot?: THREE.Object3D | null
  ): Promise<THREE.AnimationClip | null> {
    const url =
      getCharacterIdleUrl(characterId, variant) ?? getCharacterIdleUrl(characterId, 'idle-1');
    if (!url) return null;

    const loaded = await sharedAnimationManager.loadAnimation(
      `${characterId}_select_${variant}`,
      url
    );
    if (!loaded) return null;

    return retargetClipToCharacter(loaded.clip, {
      targetRoot: targetRoot ?? null,
      sourceProfile: loaded.sourceProfile,
      clipName: `${characterId}_select_${variant}`,
      yawOffsetRad,
    });
  }

  /**
   * Loads shared central or character-specific Mixamo/Avaturn GLB animation overrides
   * (stage 2 after base swap), retargeted onto `targetRoot` and streamed via `onBatch`.
   */
  public static async loadNativeGLBClips(
    characterId: CharacterId,
    onBatch?: (batch: LoadedNativeGLBClips) => void,
    targetRoot?: THREE.Object3D | null,
    onProgress?: (completed: number, total: number) => void
  ): Promise<LoadedNativeGLBClips> {
    const clips: Partial<Record<FighterState, THREE.AnimationClip>> = {};
    const clipSpeeds: Partial<Record<FighterState, number>> = {};
    const clipRepetitions: Partial<Record<FighterState, number>> = {};

    const specs = buildConventionNativeClipSpecs(characterId);
    if (!specs.length) {
      onProgress?.(1, 1);
      return { clips, clipSpeeds, clipRepetitions };
    }

    const targetProfile = targetRoot ? extractSkeletonRestProfile(targetRoot) : undefined;
    const specsByUrl = new Map<string, typeof specs>();
    for (const spec of specs) {
      const list = specsByUrl.get(spec.url);
      if (list) list.push(spec);
      else specsByUrl.set(spec.url, [spec]);
    }

    const totalGroups = specsByUrl.size;
    let completedGroups = 0;

    const loadUrlGroup = async ([url, urlSpecs]: [string, typeof specs]): Promise<void> => {
      try {
        const loaded = await sharedAnimationManager.loadAnimation(urlSpecs[0].clipName, url);
        if (!loaded) return;

        const batchClips: Partial<Record<FighterState, THREE.AnimationClip>> = {};
        const batchSpeeds: Partial<Record<FighterState, number>> = {};
        const batchReps: Partial<Record<FighterState, number>> = {};

        for (const spec of urlSpecs) {
          const retargeted = retargetClipToCharacter(loaded.clip, {
            targetProfile,
            sourceProfile: loaded.sourceProfile,
            clipName: spec.clipName,
            yawOffsetRad: spec.yawOffsetRad,
            hipsYOffset: spec.hipsYOffset,
            holdDurationSec: spec.holdDurationSec,
            stripHorizontalRootMotion: spec.stripHorizontalRootMotion,
          });
          clips[spec.state] = retargeted;
          clipSpeeds[spec.state] = spec.speed;
          batchClips[spec.state] = retargeted;
          batchSpeeds[spec.state] = spec.speed;
          if (spec.repeatCount && spec.repeatCount > 1) {
            clipRepetitions[spec.state] = spec.repeatCount;
            batchReps[spec.state] = spec.repeatCount;
          }
        }

        onBatch?.({
          clips: batchClips,
          clipSpeeds: batchSpeeds,
          clipRepetitions: batchReps,
        });
      } finally {
        completedGroups += 1;
        onProgress?.(completedGroups, totalGroups);
      }
    };

    const allEntries = Array.from(specsByUrl.entries());
    const isPriority = ([, urlSpecs]: [string, typeof specs]) =>
      urlSpecs.some((s) => s.state === 'IDLE' || s.state === 'LOUNGE' || s.state === 'CHAMP_POSE');
    const priorityEntries = allEntries.filter(isPriority);
    const remainingEntries = allEntries.filter((e) => !isPriority(e));

    await Promise.all(priorityEntries.map(loadUrlGroup));
    await Promise.all(remainingEntries.map(loadUrlGroup));

    return { clips, clipSpeeds, clipRepetitions };
  }

  /**
   * Loads the fighter's 3D Avaturn GLB scene plus full retargeted & shared GLB animation clips.
   */
  public static async loadCharacterGLBBundle(
    characterId: CharacterId
  ): Promise<LoadedCharacterGLBBundle | null> {
    const scene = await this.loadCharacterGLBModel(characterId);
    if (!scene) return null;

    const clips = createHumanoidGLBClips(scene);
    const native = await this.loadNativeGLBClips(characterId, undefined, scene);
    Object.assign(clips, native.clips);

    return {
      scene,
      clips,
      clipSpeeds: native.clipSpeeds,
      clipRepetitions: native.clipRepetitions,
    };
  }

  public static swapWithGLBModel(rig: FighterRig, gltfScene: THREE.Group): void {
    rig.modelRoot.clear();
    rig.modelRoot.scale.setScalar(1);
    rig.bodyMeshes.length = 0;

    gltfScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        rig.bodyMeshes.push(mesh);
      }
    });

    // Re-attach combat & dizzy anchors to the GLB skeleton bones
    const glbHead = gltfScene.getObjectByName('Head');
    if (glbHead) {
      rig.headAnchor.position.set(0, 0.28, 0);
      glbHead.add(rig.headAnchor);
    }
    const glbHand = gltfScene.getObjectByName('RightHand');
    if (glbHand) {
      rig.fistAnchor.position.set(0, 0.06, 0);
      glbHand.add(rig.fistAnchor);
    }
    const glbFoot = gltfScene.getObjectByName('RightFoot');
    if (glbFoot) {
      rig.footAnchor.position.set(0, 0, 0.08);
      glbFoot.add(rig.footAnchor);
    }

    // Avoid procedural headVisualGroup Euler tilt overriding skinned GLB Head bone rest pose
    rig.headVisualGroup = undefined;

    const leftEyeBone = gltfScene.getObjectByName('LeftEye');
    const rightEyeBone = gltfScene.getObjectByName('RightEye');
    if (leftEyeBone && rightEyeBone) {
      rig.leftEyeAnchor.position.set(0, 0, 0);
      rig.rightEyeAnchor.position.set(0, 0, 0);
      leftEyeBone.add(rig.leftEyeAnchor);
      rightEyeBone.add(rig.rightEyeAnchor);
    } else if (glbHead) {
      // Skinned GLB Head-local unscaled coords (+X is fighter left, +Y up, +Z forward)
      rig.leftEyeAnchor.position.set(0.031, 0.094, 0.102);
      rig.rightEyeAnchor.position.set(-0.031, 0.094, 0.102);
      glbHead.add(rig.leftEyeAnchor, rig.rightEyeAnchor);
    }

    rig.modelRoot.add(gltfScene);
  }

  public static getEyeOriginsWorld(rig: FighterRig): { left: THREE.Vector3; right: THREE.Vector3 } {
    rig.root.updateMatrixWorld(true);
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    rig.leftEyeAnchor.getWorldPosition(left);
    rig.rightEyeAnchor.getWorldPosition(right);
    return { left, right };
  }
}
