import * as THREE from 'three';
import gsap from 'gsap';
import { FighterRig } from '../types/game';

/**
 * Owns WebGLRenderer, PerspectiveCamera, bright arcade lighting,
 * mouse parallax, 3D fighter raycasting, and GSAP-driven shake / dramatic zoom.
 */
export class SceneManager {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;

  private readonly baseCameraPos = new THREE.Vector3(0, 3.35, 7.6);
  private readonly baseLookAt = new THREE.Vector3(0, 1.1, 0);
  private readonly shakeOffset = new THREE.Vector3();
  private readonly currentLookAt = new THREE.Vector3(0, 1.1, 0);
  private readonly zoomTargetPos = new THREE.Vector3().copy(this.baseCameraPos);

  private readonly pointerNDC = new THREE.Vector2();
  private readonly targetParallax = new THREE.Vector2();
  private readonly smoothParallax = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private onResizeCallback?: (width: number, height: number) => void;
  private orientationRafId?: number;
  private resizeObserver?: ResizeObserver;
  private koCinematicTimeline?: gsap.core.Timeline;
  private greetingTimeline?: gsap.core.Timeline;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070e);
    this.scene.fog = new THREE.Fog(0x05070e, 16, 36);

    const width = Math.max(1, canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 220);
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(this.baseLookAt);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.setupLighting();
    this.handleResize();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleOrientationResize);
    window.visualViewport?.addEventListener('resize', this.handleResize);
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(canvas.parentElement);
    }
    window.addEventListener('pointermove', this.handlePointerMove);
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xe0f7ff, 0xffd6ba, 0.85);
    hemi.position.set(0, 12, 0);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff9eb, 1.85);
    keyLight.position.set(5.5, 11.5, 7.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 30;
    const d = 5.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.75);
    rimLight.position.set(-6, 6, -6);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xfff5eb, 0.6);
    fillLight.position.set(-5.5, 3.8, 6.5);
    this.scene.add(fillLight);
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const nx = (event.clientX / window.innerWidth) * 2 - 1;
    const ny = (event.clientY / window.innerHeight) * 2 - 1;
    this.targetParallax.set(nx * 0.38, -ny * 0.16);
  };

  /**
   * Raycasts pointer coordinates against fighter meshes & hurtboxes so users
   * can click directly on Priyanshu or Chinu in 3D space.
   */
  public pickFighterAt(
    clientX: number,
    clientY: number,
    rigs: FighterRig[]
  ): { rig: FighterRig; point: THREE.Vector3 } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    let closestHit: { rig: FighterRig; distance: number; point: THREE.Vector3 } | null = null;
    for (const rig of rigs) {
      const targets: THREE.Object3D[] = [...rig.bodyMeshes, rig.hurtboxMesh];
      const hits = this.raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hit = hits[0];
        if (!closestHit || hit.distance < closestHit.distance) {
          closestHit = { rig, distance: hit.distance, point: hit.point.clone() };
        }
      }
    }

    return closestHit ? { rig: closestHit.rig, point: closestHit.point } : null;
  }

  public triggerShake(intensity = 0.16, duration = 0.24): void {
    gsap.killTweensOf(this.shakeOffset);
    const state = { power: intensity };
    gsap.to(state, {
      power: 0,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        this.shakeOffset.set(
          (Math.random() - 0.5) * 2 * state.power,
          (Math.random() - 0.5) * 2 * state.power,
          0
        );
      },
      onComplete: () => {
        this.shakeOffset.set(0, 0, 0);
      },
    });
  }

  public triggerDramaticZoom(focusPoint: THREE.Vector3, holdSeconds = 0.42): void {
    gsap.killTweensOf(this.zoomTargetPos);
    gsap.killTweensOf(this.currentLookAt);

    const zoomPos = new THREE.Vector3(
      focusPoint.x * 0.45,
      this.baseCameraPos.y - 0.65,
      this.baseCameraPos.z - 2.1
    );

    const tl = gsap.timeline();
    tl.to(this.zoomTargetPos, {
      x: zoomPos.x,
      y: zoomPos.y,
      z: zoomPos.z,
      duration: 0.14,
      ease: 'power3.out',
    });
    tl.to(
      this.currentLookAt,
      {
        x: focusPoint.x * 0.35,
        y: focusPoint.y + 0.1,
        z: 0,
        duration: 0.14,
        ease: 'power3.out',
      },
      '<'
    );

    tl.to(this.zoomTargetPos, {
      x: this.baseCameraPos.x,
      y: this.baseCameraPos.y,
      z: this.baseCameraPos.z,
      delay: holdSeconds,
      duration: 0.42,
      ease: 'power2.inOut',
    });
    tl.to(
      this.currentLookAt,
      {
        x: this.baseLookAt.x,
        y: this.baseLookAt.y,
        z: this.baseLookAt.z,
        duration: 0.42,
        ease: 'power2.inOut',
      },
      '<'
    );
  }

  public triggerRomanticCloseUp(
    center: THREE.Vector3,
    pairDir: THREE.Vector3,
    holdSeconds = 3.0
  ): void {
    this.animateSideCloseUp(center, pairDir, 2.85, 1.76, 1.63, 0.34, holdSeconds, 0.46);
  }

  public triggerSpankCloseUp(
    center: THREE.Vector3,
    pairDir: THREE.Vector3,
    holdSeconds = 1.05
  ): void {
    this.animateSideCloseUp(center, pairDir, 4.15, 2.04, 1.78, 0.25, holdSeconds, 0.44);
  }

  private animateSideCloseUp(
    center: THREE.Vector3,
    pairDir: THREE.Vector3,
    distance: number,
    camY: number,
    lookY: number,
    inDuration: number,
    holdSeconds: number,
    outDuration: number
  ): void {
    gsap.killTweensOf(this.zoomTargetPos);
    gsap.killTweensOf(this.currentLookAt);

    // Pick perpendicular side profile on the front (+Z) camera half of the ring
    const side = new THREE.Vector3(-pairDir.z, 0, pairDir.x);
    if (side.lengthSq() < 0.0001) {
      side.set(0, 0, 1);
    } else {
      side.normalize();
      if (side.z < 0) side.negate();
    }

    const closePos = new THREE.Vector3(
      center.x + side.x * distance,
      camY,
      Math.max(center.z + side.z * distance, 1.65)
    );
    const lookTarget = new THREE.Vector3(center.x, lookY, center.z);

    const tl = gsap.timeline();
    tl.to(this.zoomTargetPos, {
      x: closePos.x,
      y: closePos.y,
      z: closePos.z,
      duration: inDuration,
      ease: 'power2.out',
    });
    tl.to(
      this.currentLookAt,
      {
        x: lookTarget.x,
        y: lookTarget.y,
        z: lookTarget.z,
        duration: inDuration,
        ease: 'power2.out',
      },
      '<'
    );

    tl.to(this.zoomTargetPos, {
      x: this.baseCameraPos.x,
      y: this.baseCameraPos.y,
      z: this.baseCameraPos.z,
      delay: holdSeconds,
      duration: outDuration,
      ease: 'power2.inOut',
    });
    tl.to(
      this.currentLookAt,
      {
        x: this.baseLookAt.x,
        y: this.baseLookAt.y,
        z: this.baseLookAt.z,
        duration: outDuration,
        ease: 'power2.inOut',
      },
      '<'
    );
  }

  /**
   * Immediately snaps camera to the pre-fight greeting two-shot framing
   * covering both fighters bowing to each other as the stage is set.
   */
  public setupGreetingCamera(leftPos: THREE.Vector3, rightPos: THREE.Vector3): void {
    this.greetingTimeline?.kill();
    this.koCinematicTimeline?.kill();
    gsap.killTweensOf(this.zoomTargetPos);
    gsap.killTweensOf(this.currentLookAt);

    const midX = (leftPos.x + rightPos.x) * 0.5;
    const greetCamPos = new THREE.Vector3(midX, 2.2, 5.4);
    const greetLookAt = new THREE.Vector3(midX, 1.05, 0);

    this.zoomTargetPos.copy(greetCamPos);
    this.currentLookAt.copy(greetLookAt);
    this.camera.position.copy(greetCamPos);
    this.camera.lookAt(greetLookAt);
  }

  /**
   * Cinematic Greeting Sequence:
   * Begins from a medium two-shot covering both fighters bowing to each other as the stage is set,
   * then smoothly zooms out to the wide fighting arena view as "FIGHT!" is called.
   */
  public triggerGreetingCinematic(
    leftPos: THREE.Vector3,
    rightPos: THREE.Vector3,
    holdSeconds = 1.85,
    zoomOutDuration = 0.95
  ): gsap.core.Timeline {
    this.greetingTimeline?.kill();
    gsap.killTweensOf(this.zoomTargetPos);
    gsap.killTweensOf(this.currentLookAt);

    const midX = (leftPos.x + rightPos.x) * 0.5;
    const greetCamPos = new THREE.Vector3(midX, 2.2, 5.4);
    const greetLookAt = new THREE.Vector3(midX, 1.05, 0);

    // Immediately snap / initialize to the greeting shot so it begins directly covering both fighters
    this.zoomTargetPos.copy(greetCamPos);
    this.currentLookAt.copy(greetLookAt);
    this.camera.position.copy(greetCamPos);
    this.camera.lookAt(greetLookAt);

    const tl = gsap.timeline();

    // Subtle organic drift while fighters are bowing
    tl.to(this.zoomTargetPos, {
      y: greetCamPos.y + 0.05,
      z: greetCamPos.z + 0.1,
      duration: holdSeconds,
      ease: 'sine.inOut',
    });

    // Smoothly zoom out as FIGHT! is called, pulling out to the wide fighting arena view
    tl.to(this.zoomTargetPos, {
      x: this.baseCameraPos.x,
      y: this.baseCameraPos.y,
      z: this.baseCameraPos.z,
      duration: zoomOutDuration,
      ease: 'power2.inOut',
    });
    tl.to(
      this.currentLookAt,
      {
        x: this.baseLookAt.x,
        y: this.baseLookAt.y,
        z: this.baseLookAt.z,
        duration: zoomOutDuration,
        ease: 'power2.inOut',
      },
      '<'
    );

    this.greetingTimeline = tl;
    return tl;
  }

  /**
   * KO Dramatic Cinematic Sequence:
   * 1. Fast dramatic zoom directly onto the defeated player as they hit the canvas in slow-motion.
   * 2. Smooth panoramic sweep & low-angle heroic close-up on the victorious fighter celebrating.
   * 3. Seamless transition back to base framing for round reset / rematch.
   */
  public triggerKOCinematicSequence(
    defeatedPos: THREE.Vector3,
    winnerPos: THREE.Vector3,
    onComplete?: () => void,
    isMatchOver = false
  ): gsap.core.Timeline {
    this.koCinematicTimeline?.kill();
    this.greetingTimeline?.kill();
    gsap.killTweensOf(this.zoomTargetPos);
    gsap.killTweensOf(this.currentLookAt);

    // 1. Defeated fighter framing: Close-in, angled downwards toward mat
    const defOffset = defeatedPos.x < 0 ? 0.35 : -0.35;
    const defCamPos = new THREE.Vector3(
      defeatedPos.x + defOffset,
      1.25,
      Math.max(defeatedPos.z + 2.65, 1.85)
    );
    const defLookAt = new THREE.Vector3(defeatedPos.x, 0.42, defeatedPos.z);

    // 2. Winner fighter framing: Low-angle heroic close-up looking up at champion
    const winOffset = winnerPos.x < 0 ? -0.35 : 0.35;
    const winCamPos = new THREE.Vector3(
      winnerPos.x + winOffset,
      1.15,
      Math.max(winnerPos.z + 2.55, 1.85)
    );
    const winLookAt = new THREE.Vector3(winnerPos.x, 1.42, winnerPos.z);

    const tl = gsap.timeline({
      onComplete: () => {
        onComplete?.();
      },
    });

    // Step 1: Punchy zoom into defeated player as they hit the mat
    tl.to(this.zoomTargetPos, {
      x: defCamPos.x,
      y: defCamPos.y,
      z: defCamPos.z,
      duration: 0.28,
      ease: 'power3.out',
    });
    tl.to(
      this.currentLookAt,
      {
        x: defLookAt.x,
        y: defLookAt.y,
        z: defLookAt.z,
        duration: 0.28,
        ease: 'power3.out',
      },
      '<'
    );

    // Step 2: Hold on defeated player (slow-mo fall), then sweep across to winner
    tl.to(this.zoomTargetPos, {
      x: winCamPos.x,
      y: winCamPos.y,
      z: winCamPos.z,
      delay: 1.5,
      duration: 0.75,
      ease: 'power2.inOut',
    });
    tl.to(
      this.currentLookAt,
      {
        x: winLookAt.x,
        y: winLookAt.y,
        z: winLookAt.z,
        duration: 0.75,
        ease: 'power2.inOut',
      },
      '<'
    );

    if (isMatchOver) {
      // In match-over, hold directly on celebrating winner with slow, epic cinematic drift
      tl.to(this.zoomTargetPos, {
        y: winCamPos.y + 0.16,
        z: winCamPos.z + 0.35,
        duration: 8.0,
        ease: 'sine.out',
      });
    } else {
      // Normal round KO: Hold on celebrating winner, then glide smoothly back to arena base
      tl.to(this.zoomTargetPos, {
        x: this.baseCameraPos.x,
        y: this.baseCameraPos.y,
        z: this.baseCameraPos.z,
        delay: 1.6,
        duration: 0.65,
        ease: 'power2.inOut',
      });
      tl.to(
        this.currentLookAt,
        {
          x: this.baseLookAt.x,
          y: this.baseLookAt.y,
          z: this.baseLookAt.z,
          duration: 0.65,
          ease: 'power2.inOut',
        },
        '<'
      );
    }

    this.koCinematicTimeline = tl;
    return tl;
  }

  /**
   * Resets camera to standard fighting viewpoint, cancelling any active cinematic tweens.
   */
  public resetCamera(instant = false): void {
    this.koCinematicTimeline?.kill();
    this.koCinematicTimeline = undefined;
    this.greetingTimeline?.kill();
    this.greetingTimeline = undefined;
    gsap.killTweensOf(this.zoomTargetPos);
    gsap.killTweensOf(this.currentLookAt);

    if (instant) {
      this.zoomTargetPos.copy(this.baseCameraPos);
      this.currentLookAt.copy(this.baseLookAt);
    } else {
      gsap.to(this.zoomTargetPos, {
        x: this.baseCameraPos.x,
        y: this.baseCameraPos.y,
        z: this.baseCameraPos.z,
        duration: 0.45,
        ease: 'power2.out',
      });
      gsap.to(this.currentLookAt, {
        x: this.baseLookAt.x,
        y: this.baseLookAt.y,
        z: this.baseLookAt.z,
        duration: 0.45,
        ease: 'power2.out',
      });
    }
  }

  public render(): void {
    this.smoothParallax.lerp(this.targetParallax, 0.08);
    this.camera.position
      .copy(this.zoomTargetPos)
      .add(this.shakeOffset)
      .add(new THREE.Vector3(this.smoothParallax.x, this.smoothParallax.y, 0));
    this.camera.lookAt(this.currentLookAt);

    if (this.scene.background instanceof THREE.Texture) {
      this.scene.backgroundRotation.y += 0.00018;
    }

    this.renderer.render(this.scene, this.camera);
  }

  public renderCustomScene(customScene: THREE.Scene, customCamera: THREE.Camera): void {
    this.renderer.render(customScene, customCamera);
  }

  public setSkyboxTexture(
    texture: THREE.Texture,
    fogHex?: number,
    fogNear = 45,
    fogFar = 140
  ): void {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = texture;
    if (fogHex !== undefined) {
      this.scene.fog = new THREE.Fog(fogHex, fogNear, fogFar);
    }
  }

  public clearSkybox(): void {
    if (this.scene.background instanceof THREE.Texture) {
      this.scene.background = new THREE.Color(0x05070e);
    }
  }

  public setAtmosphere(bgHex: number, fogHex: number, fogNear: number, fogFar: number): void {
    if (!(this.scene.background instanceof THREE.Texture)) {
      this.scene.background = new THREE.Color(bgHex);
    }
    this.scene.fog = new THREE.Fog(fogHex, fogNear, fogFar);
  }

  public setOnResize(callback: (width: number, height: number) => void): void {
    this.onResizeCallback = callback;
  }

  private readonly handleOrientationResize = (): void => {
    this.handleResize();
    if (this.orientationRafId !== undefined) {
      cancelAnimationFrame(this.orientationRafId);
    }
    this.orientationRafId = requestAnimationFrame(() => {
      this.orientationRafId = undefined;
      this.handleResize();
    });
  };

  private readonly handleResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    const width = Math.max(
      1,
      parent && parent.clientWidth > 0 ? parent.clientWidth : window.innerWidth
    );
    const height = Math.max(
      1,
      parent && parent.clientHeight > 0 ? parent.clientHeight : window.innerHeight
    );
    const aspect = width / height;

    this.camera.aspect = aspect;
    // Widen vertical FOV on portrait mobile viewports so both fighters remain comfortably framed
    this.camera.fov =
      aspect < 1.35 ? Math.min(68, 44 * Math.pow(1.35 / Math.max(aspect, 0.5), 0.36)) : 44;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.onResizeCallback?.(width, height);
  };

  public dispose(): void {
    this.resetCamera(true);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleOrientationResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    if (this.orientationRafId !== undefined) {
      cancelAnimationFrame(this.orientationRafId);
    }
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.dispose();
  }
}
