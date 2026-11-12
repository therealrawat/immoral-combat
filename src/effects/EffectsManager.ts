import * as THREE from 'three';
import gsap from 'gsap';

const COMIC_WORDS = ['BAM!', 'POW!', 'SMACK!', 'WHACK!', 'BONK!'] as const;
const BLOOD_PALETTE = [0x7f1d1d, 0x5c0606, 0x991b1b, 0x450a0a] as const;
const MAX_ACTIVE_BLOOD_DECALS = 18;

function createBloodMistTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  const blobs = [
    [64, 64, 48, 'rgba(127, 29, 29, 0.85)'],
    [46, 52, 30, 'rgba(92, 6, 6, 0.72)'],
    [82, 72, 28, 'rgba(153, 27, 27, 0.65)'],
    [54, 80, 22, 'rgba(69, 10, 10, 0.62)'],
  ] as const;

  for (const [x, y, r, color] of blobs) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(0.55, 'rgba(127, 29, 29, 0.35)');
    g.addColorStop(1, 'rgba(69, 10, 10, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBloodPuddleTexture(variant: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  const drawOrgBlob = (
    cx: number,
    cy: number,
    baseR: number,
    lobes: number,
    seedOffset: number
  ) => {
    ctx.beginPath();
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const wobble =
        1 +
        0.22 * Math.sin(a * lobes + seedOffset) +
        0.13 * Math.cos(a * (lobes + 3) - seedOffset * 1.7);
      const r = baseR * wobble;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };

  ctx.fillStyle = 'rgba(69, 10, 10, 0.78)';
  drawOrgBlob(128, 128, 66, 5 + variant, variant * 1.3 + 0.4);

  ctx.fillStyle = 'rgba(127, 29, 29, 0.9)';
  drawOrgBlob(124 + variant * 4, 130 - variant * 3, 48, 4 + variant, variant * 2.1 + 1.1);

  ctx.fillStyle = 'rgba(153, 27, 27, 0.65)';
  drawOrgBlob(132, 126, 26, 3, variant * 0.9);

  // Satellite micro droplets around perimeter
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + variant * 0.7;
    const dist = 68 + ((i * 19 + variant * 23) % 44);
    const rx = 128 + Math.cos(angle) * dist;
    const ry = 128 + Math.sin(angle) * dist;
    const rad = 4 + ((i * 7 + variant * 5) % 8);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(127, 29, 29, 0.85)' : 'rgba(80, 7, 7, 0.8)';
    ctx.beginPath();
    ctx.ellipse(rx, ry, rad * 1.25, rad * 0.8, angle, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createHeartGeometry(scale = 0.16): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.8 * scale);
  shape.bezierCurveTo(
    0.9 * scale,
    -0.2 * scale,
    1.1 * scale,
    0.7 * scale,
    0.45 * scale,
    0.95 * scale
  );
  shape.bezierCurveTo(0.15 * scale, 1.05 * scale, 0, 0.72 * scale, 0, 0.52 * scale);
  shape.bezierCurveTo(0, 0.72 * scale, -0.15 * scale, 1.05 * scale, -0.45 * scale, 0.95 * scale);
  shape.bezierCurveTo(
    -1.1 * scale,
    0.7 * scale,
    -0.9 * scale,
    -0.2 * scale,
    0,
    -0.8 * scale
  );

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function createStarGeometry(
  outerRadius = 0.16,
  innerRadius = 0.075,
  depth = 0.05
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function createComicBubbleTexture(word: string, bgColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;

  const cx = 256;
  const cy = 160;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  const spikes = 14;
  for (let i = 0; i < spikes * 2; i++) {
    const isOuter = i % 2 === 0;
    const rx = isOuter ? 235 : 155;
    const ry = isOuter ? 142 : 95;
    const angle = (i * Math.PI) / spikes;
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  ctx.save();
  ctx.translate(10, 10);
  ctx.fillStyle = '#171923';
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#171923';
  ctx.stroke();
  ctx.restore();

  const fontSize = word.length >= 9 ? 62 : word.length >= 7 ? 76 : word.length >= 6 ? 88 : 104;
  ctx.font = `900 ${fontSize}px Bangers, Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = word.length >= 7 ? 12 : 16;
  ctx.strokeStyle = '#171923';
  ctx.strokeText(word, cx, cy + 4);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(word, cx, cy + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDamageNumberTexture(label: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 140;
  const ctx = canvas.getContext('2d')!;

  ctx.font = '900 84px Bangers, Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#171923';
  ctx.strokeText(label, 128, 74);

  ctx.fillStyle = color;
  ctx.fillText(label, 128, 74);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Manages 3D comic-book word sprites ("BAM!", "POW!", "BOING!"), floating damage numbers,
 * flying star particles, shockwave rings, and dizzy head stars animated via GSAP.
 */
export class EffectsManager {
  private readonly scene: THREE.Scene;
  private readonly starGeometry: THREE.ExtrudeGeometry;
  private readonly heartGeometry: THREE.ExtrudeGeometry;
  private readonly ringGeometry: THREE.RingGeometry;
  private readonly bloodDropletGeo: THREE.SphereGeometry;
  private readonly bloodDecalGeo: THREE.PlaneGeometry;
  private readonly bloodDecals: Array<{
    mesh: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
    timeline: gsap.core.Timeline;
  }> = [];
  private readonly textureCache = new Map<string, THREE.CanvasTexture>();
  private wordIndex = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.starGeometry = createStarGeometry();
    this.heartGeometry = createHeartGeometry();
    this.ringGeometry = new THREE.RingGeometry(0.18, 0.34, 28);
    this.bloodDropletGeo = new THREE.SphereGeometry(0.032, 6, 5);
    this.bloodDecalGeo = new THREE.PlaneGeometry(1, 1);
  }

  private getOrCreateTexture(key: string, builder: () => THREE.CanvasTexture): THREE.CanvasTexture {
    const existing = this.textureCache.get(key);
    if (existing) return existing;
    const created = builder();
    this.textureCache.set(key, created);
    return created;
  }

  private getComicTexture(word: string, bgColor: string): THREE.CanvasTexture {
    const key = `bubble_${word}_${bgColor}`;
    const existing = this.textureCache.get(key);
    if (existing) return existing;
    const created = createComicBubbleTexture(word, bgColor);
    this.textureCache.set(key, created);
    return created;
  }

  private getDamageTexture(label: string, color: string): THREE.CanvasTexture {
    const key = `dmg_${label}_${color}`;
    const existing = this.textureCache.get(key);
    if (existing) return existing;
    const created = createDamageNumberTexture(label, color);
    this.textureCache.set(key, created);
    return created;
  }

  public spawnPunchImpact(position: THREE.Vector3, damage = 15, customWord?: string): void {
    const word = customWord ?? COMIC_WORDS[this.wordIndex % COMIC_WORDS.length];
    if (!customWord) this.wordIndex += 1;

    this.spawnComicSprite(position, word, '#ffd426', 1.75);
    this.spawnFloatingNumber(position, `-${damage}`, '#ffffff');
    this.spawnStarBurst(position, 10, 1.5);
    this.spawnShockwave(position, 0xff3b7f, 1.4);
  }

  /** Spawns cyan shield sparks, shockwaves, and comic BLOCKED banner for successful blocks. */
  public spawnBlockImpact(position: THREE.Vector3, chipDamage = 0): void {
    this.spawnComicSprite(position, 'BLOCKED! 🛡️', '#38bdf8', 1.85);
    if (chipDamage > 0) {
      this.spawnFloatingNumber(position, `-${chipDamage}`, '#93c5fd');
    } else {
      this.spawnFloatingNumber(position, 'GUARD!', '#38bdf8');
    }
    this.spawnStarBurst(position, 8, 1.1);
    this.spawnShockwave(position, 0x38bdf8, 1.4);
    this.spawnShockwave(position, 0xffffff, 0.9);
  }

  public spawnLaserEyeCharge(leftOrigin: THREE.Vector3, rightOrigin: THREE.Vector3): void {
    const origins = [leftOrigin, rightOrigin];
    const orbGeo = new THREE.SphereGeometry(0.038, 16, 12);

    for (const origin of origins) {
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.98,
      });
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.88,
      });

      const core = new THREE.Mesh(orbGeo, coreMat);
      const glow = new THREE.Mesh(orbGeo, glowMat);
      core.position.copy(origin);
      glow.position.copy(origin);
      glow.scale.setScalar(2.1);
      this.scene.add(glow, core);

      gsap.to(core.scale, {
        x: 1.45,
        y: 1.45,
        z: 1.45,
        duration: 0.34,
        ease: 'power2.out',
      });
      gsap.to(glow.scale, {
        x: 3.6,
        y: 3.6,
        z: 3.6,
        duration: 0.34,
        ease: 'power2.out',
      });
      gsap.to([coreMat, glowMat], {
        opacity: 0,
        duration: 0.16,
        delay: 0.28,
        ease: 'power2.in',
        onComplete: () => {
          this.scene.remove(core, glow);
          coreMat.dispose();
          glowMat.dispose();
        },
      });
    }

    const disposeTimer = { t: 0 };
    gsap.to(disposeTimer, {
      t: 1,
      duration: 0.5,
      onComplete: () => orbGeo.dispose(),
    });
  }

  public spawnLaserEyeBeam(
    getEyeOrigins: () => { left: THREE.Vector3; right: THREE.Vector3 },
    getTargetPoint: () => THREE.Vector3,
    durationSec = 0.78
  ): void {
    const beamUnitGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    const orbGeo = new THREE.SphereGeometry(0.085, 16, 12);

    const createBeamMeshPair = () => {
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xfff0c2,
        transparent: true,
        opacity: 0.98,
        side: THREE.DoubleSide,
      });
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xff1100,
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
      });
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xff5e00,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
      });
      const core = new THREE.Mesh(beamUnitGeo, coreMat);
      const outer = new THREE.Mesh(beamUnitGeo, outerMat);
      const halo = new THREE.Mesh(beamUnitGeo, haloMat);
      this.scene.add(halo, outer, core);
      return { core, outer, halo, coreMat, outerMat, haloMat };
    };

    const leftBeam = createBeamMeshPair();
    const rightBeam = createBeamMeshPair();

    const eyeGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff1e00,
      transparent: true,
      opacity: 0.95,
    });
    const leftEyeOrb = new THREE.Mesh(orbGeo, eyeGlowMat);
    const rightEyeOrb = new THREE.Mesh(orbGeo, eyeGlowMat);
    leftEyeOrb.scale.setScalar(0.55);
    rightEyeOrb.scale.setScalar(0.55);
    this.scene.add(leftEyeOrb, rightEyeOrb);

    const impactCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfff1a8,
      transparent: true,
      opacity: 0.96,
    });
    const impactOuterMat = new THREE.MeshBasicMaterial({
      color: 0xff1e00,
      transparent: true,
      opacity: 0.82,
    });
    const impactCore = new THREE.Mesh(orbGeo, impactCoreMat);
    const impactOuter = new THREE.Mesh(orbGeo, impactOuterMat);
    this.scene.add(impactOuter, impactCore);

    const upAxis = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const q = new THREE.Quaternion();

    const alignBeam = (
      beam: ReturnType<typeof createBeamMeshPair>,
      start: THREE.Vector3,
      end: THREE.Vector3,
      pulse: number
    ) => {
      dir.subVectors(end, start);
      const len = Math.max(0.05, dir.length());
      dir.divideScalar(len);
      q.setFromUnitVectors(upAxis, dir);
      mid.addVectors(start, end).multiplyScalar(0.5);

      const coreRadius = 0.011 * pulse;
      const outerRadius = 0.032 * pulse;
      const haloRadius = 0.058 * pulse;
      beam.core.position.copy(mid);
      beam.core.quaternion.copy(q);
      beam.core.scale.set(coreRadius, len, coreRadius);

      beam.outer.position.copy(mid);
      beam.outer.quaternion.copy(q);
      beam.outer.scale.set(outerRadius, len, outerRadius);

      beam.halo.position.copy(mid);
      beam.halo.quaternion.copy(q);
      beam.halo.scale.set(haloRadius, len, haloRadius);
    };

    const driver = { t: 0 };
    gsap.to(driver, {
      t: 1,
      duration: durationSec,
      ease: 'none',
      onUpdate: () => {
        const origins = getEyeOrigins();
        const target = getTargetPoint();
        const fade = driver.t > 0.82 ? Math.max(0.05, (1 - driver.t) / 0.18) : 1;
        const jitter = 0.92 + Math.sin(driver.t * Math.PI * 18) * 0.2;
        const pulse = jitter * fade;

        alignBeam(leftBeam, origins.left, target, pulse);
        alignBeam(rightBeam, origins.right, target, pulse);

        leftEyeOrb.position.copy(origins.left);
        rightEyeOrb.position.copy(origins.right);
        leftEyeOrb.scale.setScalar(0.58 * pulse);
        rightEyeOrb.scale.setScalar(0.58 * pulse);

        impactCore.position.copy(target);
        impactOuter.position.copy(target);
        impactCore.scale.setScalar((1.2 + Math.sin(driver.t * 40) * 0.25) * fade);
        impactOuter.scale.setScalar((2.4 + Math.cos(driver.t * 36) * 0.4) * fade);

        leftBeam.coreMat.opacity = 0.98 * fade;
        leftBeam.outerMat.opacity = 0.86 * fade;
        leftBeam.haloMat.opacity = 0.42 * fade;
        rightBeam.coreMat.opacity = 0.98 * fade;
        rightBeam.outerMat.opacity = 0.86 * fade;
        rightBeam.haloMat.opacity = 0.42 * fade;
        eyeGlowMat.opacity = 0.95 * fade;
        impactCoreMat.opacity = 0.96 * fade;
        impactOuterMat.opacity = 0.82 * fade;
      },
      onComplete: () => {
        this.scene.remove(
          leftBeam.core,
          leftBeam.outer,
          leftBeam.halo,
          rightBeam.core,
          rightBeam.outer,
          rightBeam.halo,
          leftEyeOrb,
          rightEyeOrb,
          impactCore,
          impactOuter
        );
        leftBeam.coreMat.dispose();
        leftBeam.outerMat.dispose();
        leftBeam.haloMat.dispose();
        rightBeam.coreMat.dispose();
        rightBeam.outerMat.dispose();
        rightBeam.haloMat.dispose();
        eyeGlowMat.dispose();
        impactCoreMat.dispose();
        impactOuterMat.dispose();
        beamUnitGeo.dispose();
        orbGeo.dispose();
      },
    });
  }

  public spawnLaserBurnImpact(
    position: THREE.Vector3,
    damage = 16,
    word = 'BURN! 🔥',
    isFinisher = false
  ): void {
    const bubblePos = position.clone().add(new THREE.Vector3(isFinisher ? 0.15 : 0.42, isFinisher ? 0.55 : 0.62, 0));
    this.spawnComicSprite(bubblePos, word, isFinisher ? '#ff3b00' : '#ff7a00', isFinisher ? 1.95 : 1.25);
    this.spawnFloatingNumber(position.clone().add(new THREE.Vector3(0, 0.22, 0)), `-${damage}`, isFinisher ? '#ff2200' : '#ffd166');
    this.spawnShockwave(position, isFinisher ? 0xff1e00 : 0xff6a00, isFinisher ? 2.1 : 1.25);

    const flameColors = [0xff2a00, 0xff7a00, 0xffd166, 0xfff3b0];
    const emberGeo = new THREE.DodecahedronGeometry(isFinisher ? 0.095 : 0.068, 0);
    const count = isFinisher ? 18 : 10;

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: flameColors[i % flameColors.length],
        transparent: true,
        opacity: 0.95,
      });
      const ember = new THREE.Mesh(emberGeo, mat);
      ember.position.copy(position);
      this.scene.add(ember);

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spread = (isFinisher ? 1.45 : 0.9) + Math.random() * 0.7;
      gsap.to(ember.position, {
        x: position.x + Math.cos(angle) * spread * 0.75,
        y: position.y + 0.35 + Math.random() * (isFinisher ? 1.35 : 0.85),
        z: position.z + Math.sin(angle) * spread * 0.5,
        duration: 0.55 + Math.random() * 0.25,
        ease: 'power2.out',
      });
      gsap.to(ember.scale, {
        x: 0.01,
        y: 0.01,
        z: 0.01,
        duration: 0.45,
        delay: 0.15,
        ease: 'power2.in',
        onComplete: () => {
          this.scene.remove(ember);
          mat.dispose();
        },
      });
    }

    const cleanupTimer = { t: 0 };
    gsap.to(cleanupTimer, {
      t: 1,
      duration: 0.95,
      onComplete: () => emberGeo.dispose(),
    });
  }

  public spawnKickOverrideImpact(position: THREE.Vector3, damage = 25): void {
    this.spawnComicSprite(position, 'BAM!', '#ff3b7f', 2.35);
    this.spawnFloatingNumber(position, `-${damage}!`, '#ffd426');
    this.spawnStarBurst(position, 16, 2.2);
    this.spawnShockwave(position, 0xffd426, 2.2);
  }

  public spawnRopeBoing(position: THREE.Vector3): void {
    this.spawnComicSprite(position, 'BOING!', '#38bdf8', 1.45);
    this.spawnShockwave(position, 0x38bdf8, 1.15);
  }

  public spawnBossFlexSparkle(position: THREE.Vector3): void {
    this.spawnComicSprite(position, 'BOSS!', '#ff3b7f', 1.35);
    this.spawnStarBurst(position, 8, 1.15);
  }

  public spawnHealBurst(
    position: THREE.Vector3,
    amount: number,
    label = 'CHAI BUFF!'
  ): void {
    this.spawnComicSprite(position, label, '#ff7a00', 1.3);
    if (amount > 0) {
      this.spawnFloatingNumber(
        position.clone().add(new THREE.Vector3(0, 0.25, 0)),
        `+${amount} HP!`,
        '#34d399'
      );
    }
    this.spawnShockwave(position.clone().setY(0.18), 0xff7a00, 1.45);
  }

  public spawnSignatureAura(position: THREE.Vector3): void {
    this.spawnShockwave(position.clone().setY(0.15), 0xffd426, 2.0);
    this.spawnShockwave(position.clone().setY(0.25), 0xff3b7f, 1.6);
  }

  public spawnSpankImpact(
    position: THREE.Vector3,
    step: 1 | 2 | 3,
    damage: number,
    backDir: THREE.Vector3 = new THREE.Vector3(-1, 0, 0)
  ): void {
    const words: Record<1 | 2 | 3, string> = {
      1: 'SLAP!',
      2: 'WHACK!',
      3: 'SPANKED!!',
    };
    const isFinale = step === 3;
    const textOrigin = position
      .clone()
      .addScaledVector(backDir, 1.45)
      .add(new THREE.Vector3(0, isFinale ? 0.12 : -0.05, 0));
    const dmgOrigin = position
      .clone()
      .addScaledVector(backDir, -0.95)
      .add(new THREE.Vector3(0, -0.1, 0));

    this.spawnComicSprite(
      textOrigin,
      words[step],
      isFinale ? '#ff3b7f' : '#ff7aa8',
      isFinale ? 0.78 : 0.62
    );
    this.spawnFloatingNumber(
      dmgOrigin,
      isFinale ? `-${damage}!!` : `-${damage}`,
      isFinale ? '#ffd426' : '#ffffff'
    );
    this.spawnStarBurst(position, isFinale ? 10 : 4, isFinale ? 1.1 : 0.75);
    this.spawnShockwave(position, isFinale ? 0xffd426 : 0xff3b7f, isFinale ? 1.35 : 0.85);
  }

  public spawnSignatureImpact(position: THREE.Vector3, damage = 45): void {
    this.spawnComicSprite(position, 'BOSS SLAM!', '#ff3b7f', 2.55);
    this.spawnFloatingNumber(position, `-${damage}!!`, '#ffd426');
    this.spawnStarBurst(position, 22, 2.65);
    this.spawnShockwave(position, 0xffd426, 2.8);
    this.spawnShockwave(position, 0xff3b7f, 2.1);
  }

  public spawnKissHealEffects(midpoint: THREE.Vector3): void {
    const captionOrigin = midpoint.clone().add(new THREE.Vector3(0.64, 0.14, 0));
    const healOrigin = midpoint.clone().add(new THREE.Vector3(-0.6, 0.14, 0));
    const haloOrigin = midpoint.clone().setY(0.12);
    const heartOrigin = midpoint.clone().add(new THREE.Vector3(0, -0.06, -0.18));

    this.spawnComicSprite(captionOrigin, 'MWAH!', '#ff5e99', 1.15);
    this.spawnFloatingNumber(healOrigin, '+150 HP!', '#34d399');
    this.spawnShockwave(haloOrigin, 0xff87b2, 1.5);
    this.spawnHeartFountain(heartOrigin, 12);
  }

  private spawnHeartFountain(origin: THREE.Vector3, count: number): void {
    const palette = [0xff3b7f, 0xff7aa8, 0xf43f5e, 0xffb3c6];

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: palette[i % palette.length],
        emissive: palette[i % palette.length],
        emissiveIntensity: 0.42,
        roughness: 0.25,
      });
      const heart = new THREE.Mesh(this.heartGeometry, mat);
      heart.position.copy(origin);
      heart.scale.setScalar(0.55 + Math.random() * 0.55);
      this.scene.add(heart);

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.35;
      const spread = 0.75 + Math.random() * 0.9;
      gsap.to(heart.position, {
        x: origin.x + Math.cos(angle) * spread,
        y: origin.y + 0.9 + Math.random() * 1.15,
        z: origin.z + Math.sin(angle) * spread * 0.65,
        duration: 0.95,
        ease: 'power2.out',
      });
      gsap.to(heart.rotation, {
        y: Math.PI * (2 + Math.random() * 2),
        z: (Math.random() - 0.5) * 0.8,
        duration: 0.95,
        ease: 'none',
      });
      gsap.to(heart.scale, {
        x: 0.001,
        y: 0.001,
        z: 0.001,
        duration: 0.32,
        delay: 0.65,
        ease: 'power2.in',
        onComplete: () => {
          this.scene.remove(heart);
          mat.dispose();
        },
      });
    }
  }

  private spawnFloatingNumber(position: THREE.Vector3, label: string, color: string): void {
    const texture = this.getDamageTexture(label, color);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 22;
    sprite.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * 0.45, 0.55, 0.45));
    sprite.scale.set(0.01, 0.01, 1);
    this.scene.add(sprite);

    gsap
      .timeline({
        onComplete: () => {
          this.scene.remove(sprite);
          mat.dispose();
        },
      })
      .to(sprite.scale, { x: 1.05, y: 0.58, duration: 0.14, ease: 'back.out(2.2)' })
      .to(sprite.position, { y: sprite.position.y + 0.95, duration: 0.72, ease: 'power2.out' }, 0)
      .to(mat, { opacity: 0, duration: 0.25, delay: 0.45 }, 0);
  }

  private spawnComicSprite(
    position: THREE.Vector3,
    word: string,
    bgColor: string,
    baseScale: number
  ): void {
    const texture = this.getComicTexture(word, bgColor);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 20;
    sprite.position.copy(position).add(new THREE.Vector3(0, 0.35, 0.35));
    sprite.scale.set(0.01, 0.01, 1);
    mat.rotation = (Math.random() - 0.5) * 0.35;
    this.scene.add(sprite);

    const targetW = baseScale * 1.45;
    const targetH = baseScale * 0.92;

    const tl = gsap.timeline({
      onComplete: () => {
        this.scene.remove(sprite);
        mat.dispose();
      },
    });

    tl.to(sprite.scale, {
      x: targetW,
      y: targetH,
      duration: 0.18,
      ease: 'back.out(2.6)',
    });
    tl.to(
      sprite.position,
      {
        y: sprite.position.y + 0.72,
        duration: 0.65,
        ease: 'power2.out',
      },
      0
    );
    tl.to(
      mat,
      {
        opacity: 0,
        duration: 0.26,
        delay: 0.36,
        ease: 'power1.in',
      },
      0
    );
  }

  private spawnStarBurst(origin: THREE.Vector3, count: number, spread: number): void {
    const palette = [0xffd426, 0xff3b7f, 0x38bdf8, 0xffffff];

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: palette[i % palette.length],
        emissive: palette[i % palette.length],
        emissiveIntensity: 0.35,
        roughness: 0.25,
      });
      const star = new THREE.Mesh(this.starGeometry, mat);
      star.position.copy(origin);
      star.scale.setScalar(0.65 + Math.random() * 0.65);
      this.scene.add(star);

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = (0.65 + Math.random() * 0.75) * spread;
      const targetX = origin.x + Math.cos(angle) * dist;
      const targetY = origin.y + Math.sin(angle) * dist * 0.75 + 0.35;
      const targetZ = origin.z + (Math.random() - 0.5) * dist;

      gsap.to(star.position, {
        x: targetX,
        y: targetY,
        z: targetZ,
        duration: 0.45,
        ease: 'power2.out',
      });
      gsap.to(star.rotation, {
        x: Math.PI * (2 + Math.random() * 2),
        y: Math.PI * (2 + Math.random() * 2),
        z: Math.PI * 2,
        duration: 0.55,
        ease: 'none',
      });
      gsap.to(star.scale, {
        x: 0.001,
        y: 0.001,
        z: 0.001,
        duration: 0.3,
        delay: 0.25,
        ease: 'power2.in',
        onComplete: () => {
          this.scene.remove(star);
          mat.dispose();
        },
      });
    }
  }

  private spawnShockwave(origin: THREE.Vector3, color: number, maxScale: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(this.ringGeometry, mat);
    ring.position.copy(origin).add(new THREE.Vector3(0, 0, 0.2));
    ring.scale.setScalar(0.25);
    this.scene.add(ring);

    gsap.to(ring.scale, {
      x: maxScale * 2.4,
      y: maxScale * 2.4,
      duration: 0.32,
      ease: 'power2.out',
    });
    gsap.to(mat, {
      opacity: 0,
      duration: 0.32,
      ease: 'power2.out',
      onComplete: () => {
        this.scene.remove(ring);
        mat.dispose();
      },
    });
  }

  public spawnDizzyStars(headAnchor: THREE.Object3D, durationSec = 1.45): void {
    const orbitGroup = new THREE.Group();
    headAnchor.add(orbitGroup);

    const starCount = 3;
    const radius = 0.34;
    const meshes: Array<{ mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }> = [];

    for (let i = 0; i < starCount; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffd426,
        emissive: 0xffa200,
        emissiveIntensity: 0.5,
      });
      const star = new THREE.Mesh(this.starGeometry, mat);
      const angle = (i / starCount) * Math.PI * 2;
      star.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      star.scale.setScalar(0.55);
      orbitGroup.add(star);
      meshes.push({ mesh: star, mat });
    }

    gsap.to(orbitGroup.rotation, {
      y: Math.PI * 4,
      duration: durationSec,
      ease: 'none',
      onComplete: () => {
        headAnchor.remove(orbitGroup);
        for (const item of meshes) {
          item.mat.dispose();
        }
      },
    });
  }

  /**
   * Spawns directional arterial blood spray, mist puffs, and persistent floor splatter decals
   * scaled by strike force and sustained aggressive beating intensity.
   */
  public spawnBloodSplatter(
    origin: THREE.Vector3,
    sprayDir: THREE.Vector3,
    intensity = 1.0
  ): void {
    const clampedIntensity = Math.min(2.5, Math.max(0.55, intensity));
    const dir = sprayDir.clone();
    dir.y = 0;
    if (dir.lengthSq() < 0.0001) {
      dir.set(1, 0, 0);
    } else {
      dir.normalize();
    }

    // 1. Rapid directional crimson blood mist puff(s)
    const mistCount = clampedIntensity >= 1.25 ? 2 : 1;
    const mistTex = this.getOrCreateTexture('blood_mist', createBloodMistTexture);
    for (let i = 0; i < mistCount; i++) {
      const mat = new THREE.SpriteMaterial({
        map: mistTex,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      });
      const mist = new THREE.Sprite(mat);
      mist.renderOrder = 12;
      mist.position.copy(origin).add(
        new THREE.Vector3(
          dir.x * (0.06 + i * 0.1),
          (Math.random() - 0.3) * 0.12,
          dir.z * (0.06 + i * 0.1) + (Math.random() - 0.5) * 0.08
        )
      );
      const startSize = 0.22;
      const endSize = 0.52 + clampedIntensity * 0.24;
      mist.scale.set(startSize, startSize, 1);
      mat.rotation = Math.random() * Math.PI * 2;
      this.scene.add(mist);

      gsap.to(mist.position, {
        x: mist.position.x + dir.x * (0.28 + i * 0.16),
        y: Math.max(0.25, mist.position.y - 0.08),
        z: mist.position.z + dir.z * (0.28 + i * 0.16) + (Math.random() - 0.5) * 0.16,
        duration: 0.26,
        ease: 'power2.out',
      });
      gsap.to(mist.scale, {
        x: endSize,
        y: endSize,
        duration: 0.26,
        ease: 'power2.out',
      });
      gsap.to(mat, {
        opacity: 0,
        duration: 0.28,
        ease: 'power2.out',
        onComplete: () => {
          this.scene.remove(mist);
          mat.dispose();
        },
      });
    }

    // 2. Ballistic 3D stretched crimson droplets falling to floor
    const dropletCount = Math.min(26, Math.round(7 + clampedIntensity * 7));
    for (let i = 0; i < dropletCount; i++) {
      const color = BLOOD_PALETTE[i % BLOOD_PALETTE.length];
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.14,
        metalness: 0.06,
      });
      const drop = new THREE.Mesh(this.bloodDropletGeo, mat);
      drop.position.copy(origin).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.12,
          (Math.random() - 0.5) * 0.1
        )
      );
      const radiusScale = 0.55 + Math.random() * 0.85;
      drop.scale.set(radiusScale * 0.72, radiusScale * 0.72, radiusScale * 1.9);

      const spreadYaw = Math.atan2(dir.z, dir.x) + (Math.random() - 0.5) * 1.15;
      const dist = (0.45 + Math.random() * 0.95) * (0.7 + clampedIntensity * 0.36);
      const targetX = drop.position.x + Math.cos(spreadYaw) * dist;
      const targetZ = drop.position.z + Math.sin(spreadYaw) * dist;
      const apexY = drop.position.y + 0.12 + Math.random() * 0.34;
      const airDur = 0.26 + Math.random() * 0.22;

      drop.lookAt(targetX, apexY, targetZ);
      this.scene.add(drop);

      const dropTl = gsap.timeline({
        onComplete: () => {
          this.scene.remove(drop);
          mat.dispose();
        },
      });

      dropTl.to(drop.position, {
        x: drop.position.x + (targetX - drop.position.x) * 0.48,
        y: apexY,
        z: drop.position.z + (targetZ - drop.position.z) * 0.48,
        duration: airDur * 0.38,
        ease: 'power2.out',
      });
      dropTl.to(drop.position, {
        x: targetX,
        y: 0.018,
        z: targetZ,
        duration: airDur * 0.62,
        ease: 'power2.in',
      });
      dropTl.to(
        drop.scale,
        {
          x: 0.01,
          y: 0.01,
          z: 0.01,
          duration: 0.12,
          ease: 'power1.in',
        },
        airDur * 0.82
      );
    }

    // 3. Persistent organic blood splatters on the arena floor on heavy / aggressive hits
    if (clampedIntensity >= 1.0) {
      const splatCount = clampedIntensity >= 1.85 ? 2 : 1;
      for (let s = 0; s < splatCount; s++) {
        this.spawnFloorBloodSplat(origin, dir, clampedIntensity, s);
      }
    }
  }

  private spawnFloorBloodSplat(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    intensity: number,
    index: number
  ): void {
    while (this.bloodDecals.length >= MAX_ACTIVE_BLOOD_DECALS) {
      const oldest = this.bloodDecals.shift();
      if (oldest) {
        oldest.timeline.kill();
        this.scene.remove(oldest.mesh);
        oldest.mat.dispose();
      }
    }

    const variant = Math.floor(Math.random() * 3);
    const tex = this.getOrCreateTexture(`blood_puddle_${variant}`, () =>
      createBloodPuddleTexture(variant)
    );
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const mesh = new THREE.Mesh(this.bloodDecalGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.renderOrder = 3;

    const offsetDist = 0.25 + Math.random() * 0.55 + index * 0.26;
    const x = Math.max(-2.85, Math.min(2.85, origin.x + dir.x * offsetDist + (Math.random() - 0.5) * 0.28));
    const z = Math.max(-2.85, Math.min(2.85, origin.z + dir.z * offsetDist + (Math.random() - 0.5) * 0.28));
    mesh.position.set(x, 0.014, z);

    const endScale = (0.48 + Math.random() * 0.34) * Math.min(1.45, 0.72 + intensity * 0.32);
    mesh.scale.setScalar(0.18);
    this.scene.add(mesh);

    const entry: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; timeline: gsap.core.Timeline } = {
      mesh,
      mat,
      timeline: gsap.timeline(),
    };
    this.bloodDecals.push(entry);

    entry.timeline
      .to(mesh.scale, {
        x: endScale,
        y: endScale,
        duration: 0.18,
        ease: 'power2.out',
      })
      .to(mat, {
        opacity: 0,
        duration: 1.6,
        delay: 7.2,
        ease: 'power1.in',
        onComplete: () => {
          const idx = this.bloodDecals.indexOf(entry);
          if (idx >= 0) this.bloodDecals.splice(idx, 1);
          this.scene.remove(mesh);
          mat.dispose();
        },
      });
  }

  public clearBloodDecals(): void {
    while (this.bloodDecals.length > 0) {
      const entry = this.bloodDecals.pop();
      if (!entry) continue;
      entry.timeline.kill();
      this.scene.remove(entry.mesh);
      entry.mat.dispose();
    }
  }

  public dispose(): void {
    this.clearBloodDecals();
    this.starGeometry.dispose();
    this.heartGeometry.dispose();
    this.ringGeometry.dispose();
    this.bloodDropletGeo.dispose();
    this.bloodDecalGeo.dispose();
    for (const tex of this.textureCache.values()) {
      tex.dispose();
    }
    this.textureCache.clear();
  }
}
