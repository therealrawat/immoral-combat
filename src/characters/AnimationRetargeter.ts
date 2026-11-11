import * as THREE from 'three';

export interface BoneRestPose {
  canonicalName: string;
  targetNodeName: string;
  node: THREE.Object3D;
  localRestQuat: THREE.Quaternion;
  worldRestQuat: THREE.Quaternion;
  worldRestQuatInv: THREE.Quaternion;
  parentWorldRestQuat: THREE.Quaternion;
  parentWorldRestQuatInv: THREE.Quaternion;
}

export interface SkeletonRestProfile {
  bonesByCanonical: Map<string, BoneRestPose>;
  hipsNodeName: string | null;
  hipsRestCharPos: THREE.Vector3 | null;
  hipsParentCharMatrix: THREE.Matrix4;
  hipsParentCharMatrixInv: THREE.Matrix4;
  hipsRestHeight: number;
}

export interface RetargetClipOptions {
  targetProfile?: SkeletonRestProfile;
  targetRoot?: THREE.Object3D | null;
  sourceProfile?: SkeletonRestProfile | null;
  sourceRoot?: THREE.Object3D | null;
  clipName?: string;
  yawOffsetRad?: number;
  hipsYOffset?: number;
  holdDurationSec?: number;
  stripHorizontalRootMotion?: boolean;
  retargetRotations?: boolean;
}

interface ParsedTrackTarget {
  rawBoneName: string;
  canonicalBoneName: string;
  property: string;
}

const CANONICAL_BONE_ALIASES: Record<string, string> = {
  hips: 'Hips',
  pelvis: 'Hips',
  root: 'Hips',
  spine: 'Spine',
  spine01: 'Spine',
  spine1: 'Spine1',
  spine02: 'Spine1',
  spine2: 'Spine2',
  chest: 'Spine2',
  upperchest: 'Spine2',
  neck: 'Neck',
  head: 'Head',
  lefteye: 'LeftEye',
  righteye: 'RightEye',
  leftshoulder: 'LeftShoulder',
  leftarm: 'LeftArm',
  leftupperarm: 'LeftArm',
  leftforearm: 'LeftForeArm',
  leftlowerarm: 'LeftForeArm',
  lefthand: 'LeftHand',
  rightshoulder: 'RightShoulder',
  rightarm: 'RightArm',
  rightupperarm: 'RightArm',
  rightforearm: 'RightForeArm',
  rightlowerarm: 'RightForeArm',
  righthand: 'RightHand',
  leftupleg: 'LeftUpLeg',
  leftthigh: 'LeftUpLeg',
  leftleg: 'LeftLeg',
  leftshin: 'LeftLeg',
  leftcalf: 'LeftLeg',
  leftfoot: 'LeftFoot',
  lefttoebase: 'LeftToeBase',
  rightupleg: 'RightUpLeg',
  rightthigh: 'RightUpLeg',
  rightleg: 'RightLeg',
  rightshin: 'RightLeg',
  rightcalf: 'RightLeg',
  rightfoot: 'RightFoot',
  righttoebase: 'RightToeBase',
};

const NON_SKELETAL_ROOT_NAMES = new Set(['Scene', 'Armature', 'RootNode']);
const ROTATION_DIFF_EPSILON = 1e-3;
const FALLBACK_HIPS_HEIGHT_M = 0.96;

/**
 * Normalizes Mixamo (`mixamorig:Hips`, `mixamorigHips`), Blender (`Armature|Hips`),
 * and Avaturn (`Hips`) joint names to a single canonical Mixamo/Avaturn identifier.
 */
export function normalizeMixamoBoneName(rawName: string): string {
  const leaf = rawName.split(/[|/\\]/).pop() ?? rawName;
  const stripped = leaf.replace(/^mixamorig(?:\d+)?[:_.]?/i, '').trim();
  const compact = stripped.replace(/[\s._-]/g, '').toLowerCase();
  if (CANONICAL_BONE_ALIASES[compact]) {
    return CANONICAL_BONE_ALIASES[compact];
  }
  // Keep finger / auxiliary bone names normalized consistently without mixamorig prefixes
  return stripped || leaf;
}

/**
 * Parses Three.js KeyframeTrack names (`Hips.quaternion`, `.bones[mixamorigHips].position`,
 * `Armature/Hips.quaternion`) into bone name + animated property.
 */
function parseTrackTarget(trackName: string): ParsedTrackTarget | null {
  const bonesBracketMatch = /\.bones\[([^\]]+)\]\.([^.]+)$/.exec(trackName);
  if (bonesBracketMatch) {
    const rawBoneName = bonesBracketMatch[1];
    return {
      rawBoneName,
      canonicalBoneName: normalizeMixamoBoneName(rawBoneName),
      property: bonesBracketMatch[2],
    };
  }

  const lastDot = trackName.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const rawBonePath = trackName.slice(0, lastDot);
  const property = trackName.slice(lastDot + 1);
  const rawBoneName = rawBonePath.split(/[|/\\]/).pop() ?? rawBonePath;
  return {
    rawBoneName,
    canonicalBoneName: normalizeMixamoBoneName(rawBoneName),
    property,
  };
}

/**
 * Strips embedded meshes, skins, materials, and image payloads from a GLB ArrayBuffer,
 * leaving only the skeletal node hierarchy and animation clips so Three.js can parse
 * animation assets without decoding duplicate geometry or textures.
 */
export function stripGLBVisualChunks(ab: ArrayBuffer): ArrayBuffer | null {
  if (ab.byteLength < 28) return null;
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) return null;

  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + jsonLen + 8 > ab.byteLength) {
    return null;
  }

  const binOffset = 20 + jsonLen;
  if (dv.getUint32(binOffset + 4, true) !== 0x004e4942) return null;
  const binPayloadLen = dv.getUint32(binOffset, true);
  if (binOffset + 8 + binPayloadLen > ab.byteLength) return null;

  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jsonLen)));
  delete json.meshes;
  delete json.materials;
  delete json.textures;
  delete json.images;
  delete json.skins;
  delete json.extensionsUsed;
  delete json.extensionsRequired;

  if (Array.isArray(json.nodes)) {
    for (const node of json.nodes) {
      if (node && typeof node === 'object') {
        delete node.mesh;
        delete node.skin;
      }
    }
  }

  const rawJsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const paddedJsonLen = (rawJsonBytes.length + 3) & ~3;
  const out = new Uint8Array(20 + paddedJsonLen + 8 + binPayloadLen);
  const outDv = new DataView(out.buffer);
  outDv.setUint32(0, 0x46546c67, true);
  outDv.setUint32(4, 2, true);
  outDv.setUint32(8, out.byteLength, true);
  outDv.setUint32(12, paddedJsonLen, true);
  outDv.setUint32(16, 0x4e4f534a, true);
  out.set(rawJsonBytes, 20);
  for (let i = rawJsonBytes.length; i < paddedJsonLen; i += 1) {
    out[20 + i] = 0x20;
  }
  out.set(new Uint8Array(ab, binOffset, 8 + binPayloadLen), 20 + paddedJsonLen);
  return out.buffer;
}

/**
 * Extracts character-space bone rest orientations and Hips height metadata from a
 * Mixamo/Avaturn GLB scene (works identically for full SkinnedMesh rigs and skinless
 * bone-only animation scenes).
 */
export function extractSkeletonRestProfile(root: THREE.Object3D): SkeletonRestProfile {
  root.updateMatrixWorld(true);

  const rootWorldMatrix = root.matrixWorld.clone();
  const rootWorldMatrixInv = rootWorldMatrix.clone().invert();
  const rootWorldQuatInv = new THREE.Quaternion();
  root.getWorldQuaternion(rootWorldQuatInv);
  rootWorldQuatInv.invert();

  const bonesByCanonical = new Map<string, BoneRestPose>();
  const charMatrixTmp = new THREE.Matrix4();
  const posTmp = new THREE.Vector3();
  const scaleTmp = new THREE.Vector3();

  let hipsNode: THREE.Object3D | null = null;
  let hipsNodeName: string | null = null;

  root.traverse((obj) => {
    if (obj === root || !obj.name) return;
    if ((obj as THREE.Mesh).isMesh || NON_SKELETAL_ROOT_NAMES.has(obj.name)) return;

    const canonicalName = normalizeMixamoBoneName(obj.name);
    if (bonesByCanonical.has(canonicalName)) return;

    const worldRestQuat = new THREE.Quaternion();
    obj.getWorldQuaternion(worldRestQuat);
    worldRestQuat.premultiply(rootWorldQuatInv).normalize();

    const parentWorldRestQuat = new THREE.Quaternion();
    if (obj.parent && obj.parent !== root) {
      obj.parent.getWorldQuaternion(parentWorldRestQuat);
      parentWorldRestQuat.premultiply(rootWorldQuatInv).normalize();
    } else if (obj.parent === root) {
      parentWorldRestQuat.identity();
    }

    const pose: BoneRestPose = {
      canonicalName,
      targetNodeName: obj.name,
      node: obj,
      localRestQuat: obj.quaternion.clone().normalize(),
      worldRestQuat,
      worldRestQuatInv: worldRestQuat.clone().invert(),
      parentWorldRestQuat,
      parentWorldRestQuatInv: parentWorldRestQuat.clone().invert(),
    };

    bonesByCanonical.set(canonicalName, pose);
    if (canonicalName === 'Hips') {
      hipsNode = obj;
      hipsNodeName = obj.name;
    }
  });

  const hipsParentCharMatrix = new THREE.Matrix4();
  let hipsRestCharPos: THREE.Vector3 | null = null;
  let hipsRestHeight = FALLBACK_HIPS_HEIGHT_M;

  if (hipsNode) {
    const h = hipsNode as THREE.Object3D;
    if (h.parent) {
      hipsParentCharMatrix.copy(rootWorldMatrixInv).multiply(h.parent.matrixWorld);
    }
    charMatrixTmp.copy(rootWorldMatrixInv).multiply(h.matrixWorld);
    charMatrixTmp.decompose(posTmp, new THREE.Quaternion(), scaleTmp);
    if (posTmp.y > 0.05) {
      hipsRestCharPos = posTmp.clone();
      hipsRestHeight = posTmp.y;
    }
  }

  return {
    bonesByCanonical,
    hipsNodeName,
    hipsRestCharPos,
    hipsParentCharMatrix,
    hipsParentCharMatrixInv: hipsParentCharMatrix.clone().invert(),
    hipsRestHeight,
  };
}

function estimateClipHipsHeight(clip: THREE.AnimationClip): number {
  for (const track of clip.tracks) {
    const parsed = parseTrackTarget(track.name);
    if (parsed && parsed.canonicalBoneName === 'Hips' && parsed.property === 'position') {
      if (track.values.length >= 3 && track.values[1] > 0.05) {
        return track.values[1];
      }
    }
  }
  return FALLBACK_HIPS_HEIGHT_M;
}

/**
 * Retargets a shared Mixamo/Avaturn `AnimationClip` onto any target character skeleton:
 * - Maps bone names across naming conventions (`mixamorig:*` / bare Mixamo / Avaturn).
 * - Drops non-Hips bone position & bone scale tracks so target limb proportions stay intact.
 * - Re-expresses quaternion tracks through target & source rest frames:
 *   `q_tgt = W_tgt,P^-1 * W_src,P * q_src * W_src^-1 * W_tgt`
 * - Scales `Hips.position` motion by `targetHipsHeight / sourceHipsHeight` around each
 *   character's rest pelvis height so taller/shorter rigs never float or sink.
 */
export function retargetClipToCharacter(
  sourceClip: THREE.AnimationClip,
  options: RetargetClipOptions = {}
): THREE.AnimationClip {
  const {
    clipName = sourceClip.name,
    yawOffsetRad = 0,
    hipsYOffset = 0,
    holdDurationSec,
    stripHorizontalRootMotion = false,
    retargetRotations = true,
  } = options;

  const targetProfile =
    options.targetProfile ?? (options.targetRoot ? extractSkeletonRestProfile(options.targetRoot) : null);
  const sourceProfile =
    options.sourceProfile ?? (options.sourceRoot ? extractSkeletonRestProfile(options.sourceRoot) : null);

  const qYaw = yawOffsetRad
    ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawOffsetRad)
    : null;
  const qLeftBasis = new THREE.Quaternion();
  const qRightBasis = new THREE.Quaternion();
  const qSrc = new THREE.Quaternion();
  const qTgt = new THREE.Quaternion();
  const qPrevTgt = new THREE.Quaternion();
  const vSrc = new THREE.Vector3();
  const vDelta = new THREE.Vector3();
  const vTgt = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const clipHipsFallback = estimateClipHipsHeight(sourceClip);
  const sourceHipsHeight = sourceProfile?.hipsRestHeight ?? clipHipsFallback;
  const targetHipsHeight = targetProfile?.hipsRestHeight ?? sourceHipsHeight;
  const heightScale =
    sourceHipsHeight > 1e-4 && targetHipsHeight > 1e-4 ? targetHipsHeight / sourceHipsHeight : 1;

  const retargetedTracks: THREE.KeyframeTrack[] = [];

  for (const track of sourceClip.tracks) {
    const parsed = parseTrackTarget(track.name);
    if (!parsed) {
      retargetedTracks.push(track.clone());
      continue;
    }

    const { canonicalBoneName, property } = parsed;
    if (property === 'scale') continue;
    if (property === 'position' && canonicalBoneName !== 'Hips') continue;

    const targetBone = targetProfile?.bonesByCanonical.get(canonicalBoneName);
    if (targetProfile && !targetBone) {
      // Skip tracks for bones not present on this character rig (avoids PropertyBinding warnings)
      continue;
    }

    const TrackCtor = track.constructor as new (
      name: string,
      times: Float32Array,
      values: Float32Array
    ) => THREE.KeyframeTrack;

    const stride = track.getValueSize();
    let newTimes: Float32Array;
    let newValues: Float32Array;

    if (holdDurationSec && holdDurationSec > 0 && track.values.length >= stride) {
      newTimes = new Float32Array([0, holdDurationSec]);
      newValues = new Float32Array(stride * 2);
      const firstPose = track.values.subarray(0, stride);
      newValues.set(firstPose, 0);
      newValues.set(firstPose, stride);
    } else {
      newTimes = new Float32Array(track.times);
      newValues = new Float32Array(track.values);
    }

    const targetTrackName = `${targetBone ? targetBone.targetNodeName : canonicalBoneName}.${property}`;

    if (property === 'quaternion' && stride === 4) {
      const sourceBone = sourceProfile?.bonesByCanonical.get(canonicalBoneName);
      const useRestBasis = Boolean(retargetRotations && targetBone && sourceBone);

      if (useRestBasis && targetBone && sourceBone) {
        qLeftBasis.copy(targetBone.parentWorldRestQuatInv).multiply(sourceBone.parentWorldRestQuat);
        qRightBasis.copy(sourceBone.worldRestQuatInv).multiply(targetBone.worldRestQuat);
      } else {
        qLeftBasis.identity();
        qRightBasis.identity();
      }

      if (canonicalBoneName === 'Hips' && qYaw) {
        if (targetBone) {
          qLeftBasis
            .copy(targetBone.parentWorldRestQuatInv)
            .multiply(qYaw)
            .multiply(sourceBone ? sourceBone.parentWorldRestQuat : targetBone.parentWorldRestQuat);
        } else {
          qLeftBasis.premultiply(qYaw);
        }
      }

      const hasYawAdjustment = canonicalBoneName === 'Hips' && Boolean(qYaw);
      const needsTransform =
        hasYawAdjustment ||
        (useRestBasis &&
          (qLeftBasis.angleTo(qRightBasis.clone().invert()) > ROTATION_DIFF_EPSILON ||
            qLeftBasis.lengthSq() > 0));

      if (needsTransform && (useRestBasis || hasYawAdjustment)) {
        let hasPrev = false;
        for (let i = 0; i < newValues.length; i += 4) {
          qSrc.set(newValues[i], newValues[i + 1], newValues[i + 2], newValues[i + 3]).normalize();
          qTgt.copy(qLeftBasis).multiply(qSrc).multiply(qRightBasis).normalize();

          // Keep quaternion keys in the same hemisphere for artifact-free SLERP
          if (hasPrev && qTgt.dot(qPrevTgt) < 0) {
            qTgt.set(-qTgt.x, -qTgt.y, -qTgt.z, -qTgt.w);
          }
          qPrevTgt.copy(qTgt);
          hasPrev = true;

          newValues[i] = qTgt.x;
          newValues[i + 1] = qTgt.y;
          newValues[i + 2] = qTgt.z;
          newValues[i + 3] = qTgt.w;
        }
      }

      retargetedTracks.push(new TrackCtor(targetTrackName, newTimes, newValues));
      continue;
    }

    if (property === 'position' && canonicalBoneName === 'Hips' && stride === 3) {
      const srcRestChar = sourceProfile?.hipsRestCharPos;
      const tgtRestChar = targetProfile?.hipsRestCharPos;

      for (let i = 0; i < newValues.length; i += 3) {
        vSrc.set(newValues[i], newValues[i + 1], newValues[i + 2]);
        if (sourceProfile) {
          vSrc.applyMatrix4(sourceProfile.hipsParentCharMatrix);
        }

        if (srcRestChar && tgtRestChar) {
          vDelta.copy(vSrc).sub(srcRestChar).multiplyScalar(heightScale);
          if (stripHorizontalRootMotion) {
            vDelta.x = 0;
            vDelta.z = 0;
          }
          if (yawOffsetRad) {
            vDelta.applyAxisAngle(yAxis, yawOffsetRad);
          }
          vDelta.y += hipsYOffset;
          vTgt.copy(tgtRestChar).add(vDelta);
        } else {
          vTgt.copy(vSrc).multiplyScalar(heightScale);
          if (stripHorizontalRootMotion) {
            vTgt.x = 0;
            vTgt.z = 0;
          }
          if (yawOffsetRad) {
            vTgt.applyAxisAngle(yAxis, yawOffsetRad);
          }
          vTgt.y += hipsYOffset;
        }

        if (targetProfile) {
          vTgt.applyMatrix4(targetProfile.hipsParentCharMatrixInv);
        }

        newValues[i] = vTgt.x;
        newValues[i + 1] = vTgt.y;
        newValues[i + 2] = vTgt.z;
      }

      retargetedTracks.push(new TrackCtor(targetTrackName, newTimes, newValues));
      continue;
    }

    retargetedTracks.push(new TrackCtor(targetTrackName, newTimes, newValues));
  }

  const finalDuration =
    holdDurationSec && holdDurationSec > 0 ? holdDurationSec : sourceClip.duration;
  return new THREE.AnimationClip(clipName, finalDuration, retargetedTracks);
}
