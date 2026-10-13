import * as THREE from "three";

import type { CampusTheme } from "../config";

/**
 * Campus 3D engine — plain three.js, no scene-graph framework.
 *
 * The visitor stands inside a ring of floating "portal" cards. Scrolling,
 * dragging or the arrow keys orbit the camera; hovering lifts a card; choosing
 * one flies the camera into it (dolly + FOV kick) before the overlay panel
 * opens. Every theme swaps palette, fog, layout, decorations and lighting, so
 * the same engine renders three visibly different rooms.
 */

export type CampusNodeSpec = {
  id: string;
  label: string;
  code: string;
  blurb: string;
};

export type CampusEngineOptions = {
  mount: HTMLElement;
  theme: CampusTheme;
  nodes: CampusNodeSpec[];
  reducedMotion: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onFail: () => void;
};

type NodeRecord = {
  spec: CampusNodeSpec;
  group: THREE.Group;
  card: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  scan: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.CanvasTexture;
  angle: number;
  position: THREE.Vector3;
  hover: number;
  focus: number;
};

type Tween = {
  from: number;
  to: number;
  elapsed: number;
  duration: number;
  ease: (t: number) => number;
  apply: (value: number) => void;
};

const TAU = Math.PI * 2;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Shortest signed distance between two angles. */
const angleDelta = (from: number, to: number) => {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
};

const hexToCss = (hex: number) => `#${hex.toString(16).padStart(6, "0")}`;

/* ------------------------------------------------------------------ */
/* Procedural card art                                                 */
/* ------------------------------------------------------------------ */

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] => {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const makeCardTexture = (
  node: CampusNodeSpec,
  index: number,
  theme: CampusTheme,
): THREE.CanvasTexture => {
  const W = 768;
  const H = 480;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const accent = theme.accentCss;
  const accent2 = hexToCss(theme.accentSecondary);

  ctx.clearRect(0, 0, W, H);

  // panel body
  ctx.fillStyle = "rgba(8, 12, 24, 0.82)";
  roundedRect(ctx, 10, 10, W - 20, H - 20, 40);
  ctx.fill();

  // top accent wash
  const wash = ctx.createLinearGradient(0, 0, 0, 260);
  wash.addColorStop(0, `${accent}30`);
  wash.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = wash;
  roundedRect(ctx, 10, 10, W - 20, H - 20, 40);
  ctx.fill();

  // border
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  roundedRect(ctx, 10, 10, W - 20, H - 20, 40);
  ctx.stroke();

  // corner ticks
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(42, 96);
  ctx.lineTo(42, 42);
  ctx.lineTo(96, 42);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W - 42, H - 96);
  ctx.lineTo(W - 42, H - 42);
  ctx.lineTo(W - 96, H - 42);
  ctx.stroke();

  // code chip
  ctx.fillStyle = accent;
  roundedRect(ctx, 56, 58, 176, 54, 16);
  ctx.fill();
  ctx.fillStyle = "#05070f";
  ctx.font = "700 30px 'Segoe UI', Inter, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(node.code, 76, 86);

  // index
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "600 26px 'JetBrains Mono', monospace";
  ctx.textAlign = "right";
  ctx.fillText(String(index + 1).padStart(2, "0"), W - 60, 86);
  ctx.textAlign = "left";

  // label
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 62px 'Segoe UI', Inter, sans-serif";
  const labelLines = wrapText(ctx, node.label, W - 130).slice(0, 2);
  let y = 236;
  for (const line of labelLines) {
    ctx.fillText(line, 58, y);
    y += 68;
  }

  // blurb
  ctx.fillStyle = "rgba(226, 236, 255, 0.72)";
  ctx.font = "400 30px 'Segoe UI', Inter, sans-serif";
  const blurbLines = wrapText(ctx, node.blurb, W - 130).slice(0, 2);
  y += 10;
  for (const line of blurbLines) {
    ctx.fillText(line, 58, y);
    y += 40;
  }

  // footer rail
  ctx.fillStyle = accent2;
  ctx.fillRect(58, H - 84, 120, 5);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(188, H - 84, W - 246, 5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export class CampusEngine {
  private readonly opts: CampusEngineOptions;
  private readonly mount: HTMLElement;
  private readonly theme: CampusTheme;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(-2, -2);
  private readonly center = new THREE.Vector3(0, 0, 0);
  private readonly lookFar = new THREE.Vector3();
  private readonly lookFocus = new THREE.Vector3();
  private readonly lookCurrent = new THREE.Vector3();

  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly nodes: NodeRecord[] = [];
  private readonly tweens: Tween[] = [];
  private readonly pointerOrigin = { x: 0 };

  private particles?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private particleSeeds?: Float32Array;
  private readonly animated: Array<{ mesh: THREE.Object3D; update: (t: number) => void }> =
    [];

  private yaw = 0;
  private dragged = false;
  private pointerDown = false;
  private hoveredId: string | null = null;
  /** Set by the HUD rail so hovering a list row lights the matching card. */
  private highlightId: string | null = null;
  private focusId: string | null = null;
  private focusBlend = 0;
  private fov = 58;
  private fps = 0;
  private raf = 0;
  private lastTime = 0;
  private disposed = false;

  constructor(opts: CampusEngineOptions) {
    this.opts = opts;
    this.mount = opts.mount;
    this.theme = opts.theme;

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
      });
    } catch {
      opts.onFail();
      return;
    }

    this.buildScene();
    this.attachInput();
    this.start();
  }

  /* ------------------------------ scene ------------------------------ */

  private buildScene() {
    const { theme, mount, reducedMotion } = this.opts;
    const width = mount.clientWidth || 960;
    const height = mount.clientHeight || 640;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.background);
    this.scene.fog = new THREE.Fog(theme.fogColor, theme.fogNear, theme.fogFar);

    this.camera = new THREE.PerspectiveCamera(this.fov, width / height, 0.1, 90);
    this.fov = this.camera.fov;

    // floor
    const floorMat = new THREE.MeshBasicMaterial({ color: theme.floor });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    this.scene.add(floor);
    this.track(floor.geometry, floorMat);

    const grid = new THREE.GridHelper(90, 60, theme.grid, theme.grid);
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.28;
    this.scene.add(grid);
    this.track(grid.geometry, gridMat);

    this.buildDecor();

    // lights
    this.scene.add(
      new THREE.AmbientLight(theme.ambient, theme.ambientIntensity),
    );
    const key = new THREE.DirectionalLight(0xffffff, theme.keyIntensity);
    key.position.set(5, 11, 6);
    this.scene.add(key);
    const rimRig = new THREE.PointLight(theme.rim, theme.rimIntensity, 40, 2);
    rimRig.position.set(0, 3.2, 0);
    this.scene.add(rimRig);
    const fill = new THREE.PointLight(theme.accent, 1.1, 34, 2);
    fill.position.set(-4, 2.4, -6);
    this.scene.add(fill);

    this.buildNodes();
    if (!reducedMotion) this.buildParticles();
  }

  private buildDecor() {
    const { theme, reducedMotion } = this.opts;
    const structureMat = new THREE.MeshBasicMaterial({
      color: theme.structure,
      transparent: true,
      opacity: 0.9,
    });
    const accentMat = new THREE.MeshBasicMaterial({
      color: theme.accent,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const secondaryMat = new THREE.MeshBasicMaterial({
      color: theme.accentSecondary,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.track(structureMat, accentMat, secondaryMat);

    if (theme.layout === "ring") {
      // command deck: concentric floor rails + ring of pillars
      for (const [radius, mat] of [
        [theme.ringRadius + 2.4, accentMat],
        [theme.ringRadius + 5.4, secondaryMat],
      ] as const) {
        const ringGeo = new THREE.RingGeometry(radius - 0.05, radius, 128);
        const ring = new THREE.Mesh(ringGeo, mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.015;
        this.scene.add(ring);
        this.track(ringGeo);
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const h = 4.4 + (i % 3) * 0.8;
        const geo = new THREE.BoxGeometry(0.16, h, 0.16);
        const pillar = new THREE.Mesh(geo, structureMat);
        pillar.position.set(
          Math.sin(a) * (theme.ringRadius + 3.6),
          h / 2,
          Math.cos(a) * (theme.ringRadius + 3.6),
        );
        this.scene.add(pillar);
        this.track(geo);
      }
    } else if (theme.layout === "stage") {
      // lecture stage: raised platform + light bars
      const discGeo = new THREE.CylinderGeometry(
        theme.ringRadius - 0.6,
        theme.ringRadius - 0.2,
        0.22,
        64,
      );
      const disc = new THREE.Mesh(discGeo, structureMat);
      disc.position.y = -0.11;
      this.scene.add(disc);
      this.track(discGeo);

      for (let i = 0; i < 10; i++) {
        const geo = new THREE.BoxGeometry(0.14, 6.2, 0.14);
        const bar = new THREE.Mesh(geo, i % 2 ? accentMat : secondaryMat);
        const a = (i / 10) * TAU + 0.3;
        bar.position.set(
          Math.sin(a) * (theme.ringRadius + 2.2),
          3.1,
          Math.cos(a) * (theme.ringRadius + 2.2),
        );
        this.scene.add(bar);
        this.track(geo);
      }
    } else {
      // study atrium: floating constellation shards
      for (let i = 0; i < 26; i++) {
        const size = 0.14 + Math.random() * 0.2;
        const geo = new THREE.OctahedronGeometry(size, 0);
        const mesh = new THREE.Mesh(
          geo,
          i % 3 === 0 ? accentMat : secondaryMat,
        );
        const a = Math.random() * TAU;
        const r = 5 + Math.random() * 8;
        mesh.position.set(
          Math.sin(a) * r,
          0.6 + Math.random() * 5.4,
          Math.cos(a) * r,
        );
        this.scene.add(mesh);
        this.track(geo);
        if (!reducedMotion) {
          const base = mesh.position.y;
          const phase = Math.random() * TAU;
          this.animated.push({
            mesh,
            update: (t) => {
              mesh.position.y = base + Math.sin(t * 0.5 + phase) * 0.25;
              mesh.rotation.y = t * 0.25 + phase;
            },
          });
        }
      }
    }
  }

  private buildNodes() {
    const { theme, nodes: specs } = this.opts;
    const count = specs.length || 1;

    specs.forEach((spec, index) => {
      const angle = (index / count) * TAU - Math.PI / 2;
      const radius = theme.ringRadius + (Math.random() - 0.5) * theme.radiusJitter;
      const y = theme.nodeY + (Math.random() - 0.5) * theme.yJitter;
      const position = new THREE.Vector3(
        Math.sin(angle) * radius,
        y,
        Math.cos(angle) * radius,
      );

      const group = new THREE.Group();
      group.position.copy(position);
      // cards face the middle of the room, where the camera sits
      group.lookAt(0, y, 0);
      this.scene.add(group);

      const texture = makeCardTexture(spec, index, theme);
      const cardMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        toneMapped: false,
      });
      const card = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.06), cardMat);
      card.renderOrder = 2;
      group.add(card);

      const glowMat = new THREE.MeshBasicMaterial({
        color: theme.accent,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3), glowMat);
      glow.position.z = -0.05;
      glow.renderOrder = 1;
      group.add(glow);

      const scanMat = new THREE.MeshBasicMaterial({
        color: theme.accent,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const scan = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.07), scanMat);
      scan.position.z = 0.02;
      scan.renderOrder = 3;
      group.add(scan);

      const beamMat = new THREE.MeshBasicMaterial({
        color: theme.accent,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, y - 0.15, 8),
        beamMat,
      );
      beam.position.set(
        position.x,
        (y - 0.15) / 2,
        position.z,
      );
      this.scene.add(beam);

      const ringGeo = new THREE.RingGeometry(0.5, 0.62, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: theme.accent,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(position.x, 0.02, position.z);
      this.scene.add(ring);

      this.track(
        texture,
        cardMat,
        card.geometry,
        glowMat,
        glow.geometry,
        scanMat,
        scan.geometry,
        beamMat,
        beam.geometry,
        ringGeo,
        ringMat,
      );

      this.nodes.push({
        spec,
        group,
        card,
        glow,
        beam,
        ring,
        scan,
        texture,
        angle,
        position,
        hover: 0,
        focus: 0,
      });
    });
  }

  private buildParticles() {
    const { theme } = this.opts;
    const count = theme.particles;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = Math.random() * 9;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 26;
      seeds[i] = Math.random() * TAU;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: theme.accent,
      size: 0.055,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
    this.track(geometry, material);
    this.particles = points;
    this.particleSeeds = seeds;
  }

  private track(...items: Array<{ dispose: () => void }>) {
    this.disposables.push(...items);
  }

  /* ------------------------------ input ------------------------------ */

  private attachInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = "none";

    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointerleave", this.onPointerLeave);
    el.addEventListener("wheel", this.onWheel, { passive: true });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.mount);
    window.addEventListener("resize", this.handleResize);
  }

  private resizeObserver?: ResizeObserver;
  private readonly handleResize = () => this.resize();

  private onWheel = (event: WheelEvent) => {
    const amount = (event.deltaY || 0) * 0.0016;
    this.yaw += amount;
  };

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (this.pointerDown) {
      const dx = event.clientX - this.pointerOrigin.x;
      if (Math.abs(dx) > 2) this.dragged = true;
      this.yaw -= dx * 0.0042;
      this.pointerOrigin.x = event.clientX;
    }
  };

  private onPointerDown = (event: PointerEvent) => {
    this.pointerDown = true;
    this.dragged = false;
    this.pointerOrigin.x = event.clientX;
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
  };

  private onPointerUp = (event: PointerEvent) => {
    const wasDragging = this.dragged;
    this.pointerDown = false;
    this.renderer.domElement.releasePointerCapture?.(event.pointerId);
    if (wasDragging) return;
    const hit = this.pick();
    if (hit) this.opts.onSelect(hit.spec.id);
  };

  private onPointerLeave = () => {
    this.pointerDown = false;
    this.dragged = false;
    this.pointer.set(-2, -2);
    if (this.hoveredId) {
      this.hoveredId = null;
      this.opts.onHover(null);
    }
  };

  /** Keyboard support — the HUD rail calls this. */
  rotateBy(delta: number) {
    this.yaw += delta;
  }

  /** Mirror the HUD rail's hover/focus state onto the matching 3D card. */
  setHighlight(id: string | null) {
    this.highlightId = id;
  }

  private pick(): NodeRecord | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.nodes.map((node) => node.card),
      false,
    )[0];
    if (!hit) return null;
    return this.nodes.find((node) => node.card === hit.object) ?? null;
  }

  /* --------------------------- transitions --------------------------- */

  private tween(
    from: number,
    to: number,
    duration: number,
    ease: (t: number) => number,
    apply: (value: number) => void,
  ) {
    const existing = this.tweens.find((item) => item.apply === apply);
    if (existing) {
      existing.from = from;
      existing.to = to;
      existing.elapsed = 0;
      existing.duration = duration;
      existing.ease = ease;
      return;
    }
    this.tweens.push({ from, to, elapsed: 0, duration, ease, apply });
  }

  /** Cinematic dolly into a node. */
  focus(id: string) {
    const node = this.nodes.find((item) => item.spec.id === id);
    if (!node) return;
    this.focusId = id;
    const targetYaw = this.yaw + angleDelta(this.yaw, node.angle);
    const duration = this.opts.reducedMotion ? 0.01 : 0.95;
    this.tween(this.yaw, targetYaw, duration, easeInOutCubic, (v) => {
      this.yaw = v;
    });
    this.tween(this.focusBlend, 1, duration, easeInOutCubic, (v) => {
      this.focusBlend = v;
    });
    this.tween(this.fov, 46, duration, easeInOutCubic, (v) => {
      this.fov = v;
    });
  }

  /** Release focus and drift back out to the room. */
  release() {
    this.focusId = null;
    const duration = this.opts.reducedMotion ? 0.01 : 0.8;
    this.tween(this.focusBlend, 0, duration, easeOutCubic, (v) => {
      this.focusBlend = v;
    });
    this.tween(this.fov, 58, duration, easeOutCubic, (v) => {
      this.fov = v;
    });
  }

  /* ------------------------------- loop ------------------------------ */

  private start() {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      this.fps = 1 / Math.max(dt, 0.0001);
      this.update(dt, now / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private update(dt: number, time: number) {
    const { theme, reducedMotion } = this.opts;

    // tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const item = this.tweens[i];
      item.elapsed += dt;
      const t = clamp01(item.elapsed / item.duration);
      item.apply(item.from + (item.to - item.from) * item.ease(t));
      if (t >= 1) this.tweens.splice(i, 1);
    }

    // idle drift
    if (
      !this.focusId &&
      !this.pointerDown &&
      !this.hoveredId &&
      !this.tweens.length &&
      !reducedMotion
    ) {
      this.yaw += dt * theme.autoOrbit;
    }

    // hover pick (matrices are refreshed on render, but the first frame runs
    // before any render — keep the graph current so picking is always exact)
    this.scene.updateMatrixWorld();
    const hovered = this.pick();
    const hoveredId = hovered?.spec.id ?? this.highlightId;
    if (hoveredId !== this.hoveredId) {
      this.hoveredId = hoveredId;
      this.opts.onHover(hoveredId);
      this.renderer.domElement.style.cursor = hoveredId ? "pointer" : "grab";
    }

    // camera
    const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const bob = reducedMotion ? 0 : Math.sin(time * 0.6) * 0.045;
    this.camera.position.set(
      dir.x * theme.cameraRadius,
      theme.cameraHeight + bob * 0.4,
      dir.z * theme.cameraRadius,
    );
    this.lookFar.set(
      dir.x * (theme.cameraRadius + 14),
      theme.cameraHeight - 0.5,
      dir.z * (theme.cameraRadius + 14),
    );
    const focused = this.focusId
      ? this.nodes.find((node) => node.spec.id === this.focusId)
      : undefined;
    if (focused) {
      this.lookFocus.copy(focused.position);
    } else {
      this.lookFocus.copy(this.lookFar);
    }
    const blend = eased(this.focusBlend);
    this.lookCurrent.copy(this.lookFar).lerp(this.lookFocus, blend);
    if (focused) {
      // settle fractionally below centre so the card sits in the upper third
      this.lookCurrent.y -= 0.12 * blend;
    }
    this.camera.lookAt(this.lookCurrent);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // nodes
    for (const node of this.nodes) {
      const isHover = node.spec.id === this.hoveredId;
      const isFocus = node.spec.id === this.focusId;
      const hoverTarget = isHover || isFocus ? 1 : 0;
      node.hover += (hoverTarget - node.hover) * Math.min(1, dt * 9);

      const scale = 1 + node.hover * 0.07 + (isFocus ? blend * 0.06 : 0);
      node.group.scale.setScalar(scale);
      node.glow.material.opacity = 0.14 + node.hover * 0.34;
      node.beam.material.opacity = 0.16 + node.hover * 0.4;
      node.ring.material.opacity = 0.2 + node.hover * 0.45;
      node.ring.scale.setScalar(1 + node.hover * 0.12);

      // per-room hover signature
      if (theme.hover === "scan") {
        const active = node.hover;
        node.scan.material.opacity = active * 0.85;
        node.scan.position.y = Math.sin(time * 3.2) * 0.95 * active;
      } else if (theme.hover === "spotlight") {
        node.glow.material.opacity += node.hover * 0.25;
        node.group.position.y = node.position.y + node.hover * 0.12;
      } else {
        const pulse = 1 + Math.sin(time * 2.6) * 0.05 * node.hover;
        node.group.scale.setScalar(scale * pulse);
      }
    }

    // decor + particles
    for (const item of this.animated) item.update(time);

    if (this.particles && this.particleSeeds) {
      const attr = this.particles.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const y = attr.getY(i) + dt * 0.18;
        attr.setY(i, y > 9 ? 0 : y);
        const seed = this.particleSeeds[i];
        attr.setX(
          i,
          attr.getX(i) + Math.sin(time * 0.3 + seed) * dt * 0.06,
        );
      }
      attr.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    if (!this.renderer || this.disposed) return;
    const w = this.mount.clientWidth;
    const h = this.mount.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** Live FPS, used by the HUD's performance readout. */
  getFps() {
    return Math.round(this.fps);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const el = this.renderer?.domElement;
    if (el) {
      el.removeEventListener("pointermove", this.onPointerMove);
      el.removeEventListener("pointerdown", this.onPointerDown);
      el.removeEventListener("pointerup", this.onPointerUp);
      el.removeEventListener("pointerleave", this.onPointerLeave);
      el.removeEventListener("wheel", this.onWheel);
    }
    window.removeEventListener("resize", this.handleResize);
    this.resizeObserver?.disconnect();
    for (const item of this.disposables) item.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (el?.parentNode === this.mount) this.mount.removeChild(el);
    }
  }
}

const eased = (value: number) => easeInOutCubic(clamp01(value));
