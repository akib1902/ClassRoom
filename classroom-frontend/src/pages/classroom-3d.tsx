import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Scroll-driven 3D walkthrough of a classroom mid-lesson.
 *
 * The page renders a tall scroll track with a sticky canvas. Scrolling the
 * page moves the camera along a spline through the room while the lesson
 * keeps running: the teacher paces and gestures, students idle, look around
 * and raise hands, a paper ball gets tossed, the ceiling fan spins, dust
 * drifts through the window light and the wall clock keeps real time.
 *
 * Everything is procedural geometry — no external model or texture assets.
 */

const CAPTIONS = [
  {
    start: 0.1,
    end: 0.42,
    text: "A regular class in session — the teacher paces while the room settles.",
  },
  {
    start: 0.47,
    end: 0.74,
    text: "Four rows of desks, daylight from the tall corridor windows.",
  },
  {
    start: 0.79,
    end: 1.01,
    text: "Up at the blackboard — chalk, diagrams and the mid-term countdown.",
  },
] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const fadeWindow = (p: number, start: number, end: number, feather = 0.06): number => {
  const inFade = start <= 0 ? 1 : THREE.MathUtils.smoothstep(p, start - feather, start + feather);
  const outFade = end >= 1 ? 1 : 1 - THREE.MathUtils.smoothstep(p, end - feather, end + feather);
  return Math.min(inFade, outFade);
};

/** 0 → 1 → 0 arm-raise pulse on a repeating cycle. */
const raisePulse = (t: number, offset: number): number => {
  const k = (t + offset) % 8;
  if (k < 0.45) return THREE.MathUtils.smoothstep(k, 0, 0.45);
  if (k < 3.2) return 1;
  if (k < 3.7) return 1 - THREE.MathUtils.smoothstep(k, 3.2, 3.7);
  return 0;
};

/* ------------------------------------------------------------------ */
/* Textures (procedural canvas)                                        */
/* ------------------------------------------------------------------ */

const makeBlackboardTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#24523e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // chalk dust smudges
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(Math.random() * 1024, Math.random() * 384, Math.random() * 90, Math.random() * 14);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.lineWidth = 3;
  ctx.font = "600 46px 'Segoe UI', sans-serif";
  ctx.fillText("Midterm countdown: 11 days", 52, 82);
  ctx.font = "400 34px 'Segoe UI', sans-serif";
  ctx.fillText("Ch. 7 — Integration by parts", 52, 152);
  ctx.fillText("∫ u dv = uv − ∫ v du", 52, 214);

  // little chalk graph
  ctx.beginPath();
  ctx.moveTo(660, 310);
  ctx.lineTo(980, 310);
  ctx.moveTo(690, 340);
  ctx.lineTo(690, 130);
  ctx.stroke();
  ctx.beginPath();
  for (let x = 0; x <= 280; x += 4) {
    const y = 260 - Math.sin(x / 45) * 60 - x * 0.18;
    if (x === 0) ctx.moveTo(690 + x, 300 - y * 0.6);
    else ctx.lineTo(690 + x, 300 - y * 0.6);
  }
  ctx.stroke();
  ctx.font = "italic 28px Georgia, serif";
  ctx.fillText("due Friday", 840, 360);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makePosterTexture = (title: string, subtitle: string, accent: string): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 342;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#fdfbf4";
  ctx.fillRect(0, 0, 256, 342);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 256, 78);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px 'Segoe UI', sans-serif";
  ctx.fillText(title, 18, 52);
  ctx.fillStyle = "#334155";
  ctx.font = "500 24px 'Segoe UI', sans-serif";
  const words = subtitle.split(" ");
  let line = "";
  let y = 128;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > 218) {
      ctx.fillText(line, 18, y);
      y += 34;
      line = word;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, 18, y);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/* ------------------------------------------------------------------ */
/* Figures                                                             */
/* ------------------------------------------------------------------ */

type Palette = {
  shirts: THREE.MeshStandardMaterial[];
  skins: THREE.MeshStandardMaterial[];
  pants: THREE.MeshStandardMaterial[];
  hairs: THREE.MeshStandardMaterial[];
  dark: THREE.MeshStandardMaterial;
};

type SeatedStudent = {
  root: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  phase: number;
  raiser: boolean;
  raiseOffset: number;
};

type StandingFigure = {
  root: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
};

const ARM_REST = 1.05; // forearm resting on the desk
const ARM_RAISED = 2.95; // hand up

const buildSeatedStudent = (
  mats: { shirt: THREE.MeshStandardMaterial; skin: THREE.MeshStandardMaterial; pants: THREE.MeshStandardMaterial; hair: THREE.MeshStandardMaterial },
  opts: { raiser: boolean; phase: number; raiseOffset: number },
): SeatedStudent => {
  const root = new THREE.Group();
  const HIP = 0.52;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.24), mats.shirt);
  torso.position.y = HIP + 0.25;
  torso.castShadow = true;
  root.add(torso);

  const head = new THREE.Group();
  head.position.y = HIP + 0.5;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), mats.skin);
  skull.position.y = 0.15;
  skull.castShadow = true;
  head.add(skull);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.142, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mats.hair,
  );
  hair.position.y = 0.16;
  head.add(hair);
  root.add(head);

  const mkArm = (side: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.235, HIP + 0.44, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.4, 0.075), mats.shirt);
    arm.position.y = -0.2;
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mats.skin);
    hand.position.y = -0.42;
    pivot.add(hand);
    pivot.rotation.x = ARM_REST;
    root.add(pivot);
    return pivot;
  };

  const armL = mkArm(-1);
  const armR = mkArm(1);

  const mkLeg = (side: number): void => {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.4), mats.pants);
    thigh.position.set(side * 0.11, HIP - 0.045, -0.2);
    thigh.castShadow = true;
    root.add(thigh);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), mats.pants);
    shin.position.set(side * 0.11, 0.21, -0.4);
    root.add(shin);
  };
  mkLeg(-1);
  mkLeg(1);

  return {
    root,
    head,
    armL,
    armR,
    phase: opts.phase,
    raiser: opts.raiser,
    raiseOffset: opts.raiseOffset,
  };
};

const buildStandingFigure = (palette: Palette, shirtIndex: number): StandingFigure => {
  const root = new THREE.Group();
  const shirt = palette.shirts[shirtIndex % palette.shirts.length];
  const skin = palette.skins[shirtIndex % palette.skins.length];
  const pants = palette.pants[shirtIndex % palette.pants.length];
  const hair = palette.hairs[shirtIndex % palette.hairs.length];

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.86, 0.16), pants);
  legL.position.set(-0.1, 0.43, 0);
  legL.castShadow = true;
  root.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.1;
  root.add(legR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.56, 0.26), shirt);
  torso.position.y = 1.14;
  torso.castShadow = true;
  root.add(torso);

  const head = new THREE.Group();
  head.position.y = 1.42;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 12), skin);
  skull.position.y = 0.16;
  skull.castShadow = true;
  head.add(skull);
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.152, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair,
  );
  hairCap.position.y = 0.17;
  head.add(hairCap);
  root.add(head);

  const mkArm = (side: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.26, 1.38, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.08), shirt);
    arm.position.y = -0.23;
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skin);
    hand.position.y = -0.49;
    pivot.add(hand);
    pivot.rotation.x = 0.15;
    root.add(pivot);
    return pivot;
  };

  return { root, armL: mkArm(-1), armR: mkArm(1) };
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Classroom3D() {
  const trackRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const captionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    const track = trackRef.current;
    if (!mount || !track) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }

    /* ---------------- renderer / scene ---------------- */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(mount.clientWidth || 800, mount.clientHeight || 600);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111726);
    scene.fog = new THREE.Fog(0x111726, 26, 46);

    const camera = new THREE.PerspectiveCamera(
      58,
      (mount.clientWidth || 800) / (mount.clientHeight || 600),
      0.1,
      80,
    );

    /* ---------------- palette ---------------- */
    const palette: Palette = {
      shirts: [0x4f6df5, 0xe0566b, 0x2fae7f, 0xe8952f, 0x8b5cf6, 0x38bdf8, 0xf472b6].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.82 }),
      ),
      skins: [0xf1c9a5, 0xd9a06b, 0x8d5524, 0xffdbac].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }),
      ),
      pants: [0x2f3646, 0x465066, 0x6b5a45].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
      ),
      hairs: [0x2b2118, 0x4a3423, 0x151515, 0x7a5230].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }),
      ),
      dark: new THREE.MeshStandardMaterial({ color: 0x1d2433, roughness: 0.85 }),
    };

    /* ---------------- room ---------------- */
    const W = 13;
    const D = 17;
    const H = 3.4;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ color: 0xc59b6d, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // plank lines
    const plankMat = new THREE.MeshStandardMaterial({ color: 0xa97f52, roughness: 0.9 });
    for (let z = -D / 2 + 1; z < D / 2; z += 1.1) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(W, 0.012, 0.045), plankMat);
      plank.position.set(0, 0.006, z);
      scene.add(plank);
    }

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ color: 0xf3f1e9, roughness: 0.95 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = H;
    scene.add(ceiling);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xefe9dd, roughness: 0.95 });
    const mkWall = (w: number, x: number, z: number, rotY: number): void => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
      wall.position.set(x, H / 2, z);
      wall.rotation.y = rotY;
      wall.receiveShadow = true;
      scene.add(wall);
    };
    mkWall(W, 0, -D / 2, 0); // front (board)
    mkWall(W, 0, D / 2, Math.PI); // back (door)
    mkWall(D, -W / 2, 0, Math.PI / 2); // left (posters)
    mkWall(D, W / 2, 0, -Math.PI / 2); // right (windows)

    /* ---------------- blackboard ---------------- */
    const boardTex = makeBlackboardTexture();
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 2.05),
      new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.92 }),
    );
    board.position.set(0, 1.8, -D / 2 + 0.04);
    scene.add(board);

    const boardFrameMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8 });
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.09, 0.09), boardFrameMat);
    frameTop.position.set(0, 2.87, -D / 2 + 0.05);
    scene.add(frameTop);
    const frameBottom = frameTop.clone();
    frameBottom.position.y = 0.73;
    scene.add(frameBottom);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.05, 0.16), boardFrameMat);
    tray.position.set(0, 0.7, -D / 2 + 0.1);
    scene.add(tray);

    /* ---------------- windows + light ---------------- */
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xdfefff });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    for (const wz of [-5.2, 0, 5.2]) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.6), windowMat);
      pane.position.set(W / 2 - 0.03, 1.95, wz);
      pane.rotation.y = -Math.PI / 2;
      scene.add(pane);
      for (const dy of [-0.84, 0.84]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 2.84), frameMat);
        bar.position.set(W / 2 - 0.05, 1.95 + dy, wz);
        scene.add(bar);
      }
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.66, 0.07), frameMat);
      mullion.position.set(W / 2 - 0.05, 1.95, wz);
      scene.add(mullion);
    }

    /* ---------------- posters (left wall) ---------------- */
    const posterDefs: Array<[string, string, string]> = [
      ["F9", "Notice board updates", "#4f6df5"],
      ["F10", "Study materials shelf", "#2fae7f"],
      ["F11", "Exam suggestions wall", "#e8952f"],
    ];
    posterDefs.forEach(([title, subtitle, accent], i) => {
      const tex = makePosterTexture(title, subtitle, accent);
      const poster = new THREE.Mesh(
        new THREE.PlaneGeometry(0.92, 1.24),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
      );
      poster.position.set(-W / 2 + 0.03, 1.75, -3 + i * 3);
      poster.rotation.y = Math.PI / 2;
      scene.add(poster);
    });

    /* ---------------- door ---------------- */
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 2.15, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.8 }),
    );
    door.position.set(-4.6, 1.075, D / 2 - 0.05);
    scene.add(door);
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xc9c2b4, metalness: 0.7, roughness: 0.35 }),
    );
    handle.position.set(-4.24, 1.05, D / 2 - 0.12);
    scene.add(handle);

    /* ---------------- clock (right wall) ---------------- */
    const clockGroup = new THREE.Group();
    clockGroup.position.set(W / 2 - 0.06, 2.6, -6.6);
    const clockFace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.05, 32),
      new THREE.MeshStandardMaterial({ color: 0xfdfdf8, roughness: 0.5 }),
    );
    clockFace.rotation.z = Math.PI / 2;
    clockGroup.add(clockFace);
    const clockRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.03, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 }),
    );
    clockRim.rotation.y = Math.PI / 2;
    clockGroup.add(clockRim);
    const minuteHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.17, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x1e293b }),
    );
    minuteHand.position.x = -0.04;
    minuteHand.position.y = 0.07;
    const minutePivot = new THREE.Group();
    minutePivot.add(minuteHand);
    minutePivot.position.x = -0.035;
    clockGroup.add(minutePivot);
    const secondHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.22, 0.012),
      new THREE.MeshStandardMaterial({ color: 0xe0566b }),
    );
    secondHand.position.y = 0.09;
    const secondPivot = new THREE.Group();
    secondPivot.add(secondHand);
    secondPivot.position.x = -0.04;
    clockGroup.add(secondPivot);
    scene.add(clockGroup);

    /* ---------------- furniture ---------------- */
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xd9b483, roughness: 0.75 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x5b6472, roughness: 0.55, metalness: 0.35 });

    const DESK_W = 1.5;
    const DESK_D = 0.75;
    const deskTopY = 0.78;
    const cols = [-4.4, -1.8, 1.8, 4.4];
    const rows = [-4.8, -1.6, 1.6, 4.8];
    const emptySeats = new Set(["1-2", "3-0"]); // two vacant desks

    const addDesk = (x: number, z: number): void => {
      const top = new THREE.Mesh(new THREE.BoxGeometry(DESK_W, 0.05, DESK_D), woodMat);
      top.position.set(x, deskTopY, z);
      top.castShadow = true;
      top.receiveShadow = true;
      scene.add(top);
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, deskTopY - 0.025, DESK_D - 0.1), metalMat);
        leg.position.set(x + sx * (DESK_W / 2 - 0.06), (deskTopY - 0.025) / 2, z);
        scene.add(leg);
      }
      // chair
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.44), woodMat);
      seat.position.set(x, 0.47, z + 0.62);
      seat.castShadow = true;
      scene.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.05), woodMat);
      back.position.set(x, 0.74, z + 0.83);
      back.castShadow = true;
      scene.add(back);
      for (const sx of [-1, 1]) {
        const cLeg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.47, 0.05), metalMat);
        cLeg.position.set(x + sx * 0.19, 0.235, z + 0.62);
        scene.add(cLeg);
      }
    };

    const students: SeatedStudent[] = [];
    rows.forEach((z, r) => {
      cols.forEach((x, c) => {
        addDesk(x, z);
        if (emptySeats.has(`${r}-${c}`)) return;
        const paletteIdx = (r * cols.length + c) % palette.shirts.length;
        const student = buildSeatedStudent(
          {
            shirt: palette.shirts[paletteIdx],
            skin: palette.skins[paletteIdx % palette.skins.length],
            pants: palette.pants[paletteIdx % palette.pants.length],
            hair: palette.hairs[paletteIdx % palette.hairs.length],
          },
          {
            raiser: (r + c) % 3 === 0,
            phase: Math.random() * Math.PI * 2,
            raiseOffset: Math.random() * 8,
          },
        );
        student.root.position.set(x, 0, z + 0.62);
        student.root.rotation.y = Math.PI; // face the board (-z)
        scene.add(student.root);
        students.push(student);
      });
    });

    /* ---------------- teacher desk ---------------- */
    const teacherDeskTop = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.95), woodMat);
    teacherDeskTop.position.set(-4.4, 0.78, -6.9);
    teacherDeskTop.castShadow = true;
    teacherDeskTop.receiveShadow = true;
    scene.add(teacherDeskTop);
    const teacherDeskBase = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.75, 0.84), woodMat);
    teacherDeskBase.position.set(-4.4, 0.375, -6.9);
    scene.add(teacherDeskBase);

    /* ---------------- people ---------------- */
    const teacher = buildStandingFigure(palette, 5);
    teacher.root.position.set(0, 0, -7.0);
    teacher.root.rotation.y = Math.PI; // face the class
    scene.add(teacher.root);

    /* ---------------- paper ball toss ---------------- */
    const paperBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf5f5ef, roughness: 0.95 }),
    );
    paperBall.visible = false;
    scene.add(paperBall);

    const toss = {
      active: false,
      t: 0,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      nextAt: 4,
    };

    const startToss = (): void => {
      const a = students[Math.floor(Math.random() * students.length)];
      const b = students[Math.floor(Math.random() * students.length)];
      if (!a || !b || a === b) return;
      a.root.getWorldPosition(toss.from);
      b.root.getWorldPosition(toss.to);
      toss.from.y += 1.25;
      toss.to.y += 1.1;
      toss.t = 0;
      toss.active = true;
      paperBall.visible = true;
    };

    /* ---------------- ceiling fan ---------------- */
    const fan = new THREE.Group();
    fan.position.set(0, H - 0.28, -0.5);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8), metalMat);
    rod.position.y = 0.13;
    fan.add(rod);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.09, 16), metalMat);
    fan.add(hub);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe7e2d6, roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.018, 0.19), bladeMat);
      blade.position.x = 0.68;
      const holder = new THREE.Group();
      holder.rotation.y = (i / 4) * Math.PI * 2;
      holder.add(blade);
      fan.add(holder);
    }
    scene.add(fan);

    /* ---------------- dust motes ---------------- */
    const DUST = 150;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(DUST * 3);
    const dustSeed = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = 1 + Math.random() * 5;
      dustPos[i * 3 + 1] = 0.4 + Math.random() * 2.6;
      dustPos[i * 3 + 2] = -7 + Math.random() * 13;
      dustSeed[i] = Math.random() * Math.PI * 2;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xfff2cc,
        size: 0.035,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    scene.add(dust);

    /* ---------------- lighting ---------------- */
    scene.add(new THREE.AmbientLight(0xdfe6f5, 0.55));
    scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x8a6b4a, 0.5));

    const sun = new THREE.DirectionalLight(0xfff3dd, 1.7);
    sun.position.set(9.5, 7, 2.5);
    sun.target.position.set(0, 1, -1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -11;
    sun.shadow.camera.right = 11;
    sun.shadow.camera.top = 11;
    sun.shadow.camera.bottom = -11;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);

    const boardLight = new THREE.PointLight(0xfff6e0, 6, 9, 2);
    boardLight.position.set(0, 3.0, -6.4);
    scene.add(boardLight);

    /* ---------------- camera path ---------------- */
    const posCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.75, 7.4),
      new THREE.Vector3(0, 1.62, 3.6),
      new THREE.Vector3(-1.6, 1.55, 0.0),
      new THREE.Vector3(1.4, 1.5, -3.4),
      new THREE.Vector3(3.1, 1.56, -5.3),
      new THREE.Vector3(0.9, 1.66, -6.45),
    ]);
    const lookCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.45, -8.4),
      new THREE.Vector3(0, 1.4, -8.4),
      new THREE.Vector3(-2.4, 1.1, -4.2),
      new THREE.Vector3(0.6, 1.3, -8.4),
      new THREE.Vector3(-1.2, 1.4, -8.3),
      new THREE.Vector3(0.2, 1.6, -8.5),
    ]);

    /* ---------------- scroll progress ---------------- */
    let smoothP = 0;

    const readProgress = (): number => {
      const rect = track.getBoundingClientRect();
      const range = rect.height - window.innerHeight;
      if (range <= 0) return 0;
      return clamp01(-rect.top / range);
    };

    /* ---------------- animation loop ---------------- */
    const clock = new THREE.Clock();
    let frames = 0;
    let activityT = 0;

    const animate = (): void => {
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      activityT += dt;
      const t = activityT;

      // scroll smoothing → camera
      const targetP = readProgress();
      smoothP += (targetP - smoothP) * Math.min(1, dt * 5);
      const p = clamp01(smoothP);
      camera.position.copy(posCurve.getPoint(p));
      camera.lookAt(lookCurve.getPoint(p));

      // teacher: pacing + gestures + bob
      const pace = Math.sin(t * 0.32);
      teacher.root.position.x = pace * 2.7;
      teacher.root.position.y = Math.abs(Math.sin(t * 2.4)) * 0.028;
      teacher.root.rotation.y = Math.PI + Math.cos(t * 0.32) * 0.22;
      teacher.armR.rotation.x = 0.55 + Math.sin(t * 1.7) * 0.55;
      teacher.armL.rotation.x = 0.15 + Math.sin(t * 2.4) * 0.2;

      // students: idle sway, head look-around, hand raises
      for (const s of students) {
        s.root.rotation.z = Math.sin(t * 0.8 + s.phase) * 0.02;
        s.head.rotation.y = Math.sin(t * 0.45 + s.phase) * 0.4;
        if (s.raiser) {
          const raise = raisePulse(t, s.raiseOffset);
          s.armR.rotation.x = ARM_REST + (ARM_RAISED - ARM_REST) * raise;
        } else {
          s.armR.rotation.x = ARM_REST + Math.sin(t * 1.1 + s.phase) * 0.06;
        }
        s.armL.rotation.x = ARM_REST + Math.sin(t * 0.9 + s.phase * 2) * 0.05;
      }

      // paper toss
      if (!toss.active && t > toss.nextAt) {
        startToss();
        toss.nextAt = t + 7 + Math.random() * 4;
      }
      if (toss.active) {
        toss.t += dt / 1.15;
        if (toss.t >= 1) {
          toss.active = false;
          paperBall.visible = false;
        } else {
          const u = toss.t;
          paperBall.position.lerpVectors(toss.from, toss.to, u);
          paperBall.position.y += 4 * 0.95 * u * (1 - u);
          paperBall.rotation.x += dt * 7;
          paperBall.rotation.z += dt * 5;
        }
      }

      // fan + dust + clock
      fan.rotation.y += dt * 4.6;
      const dustAttr = dust.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < DUST; i++) {
        const y = dustAttr.getY(i) + dt * 0.045;
        dustAttr.setY(i, y > 3.1 ? 0.4 : y);
        dustAttr.setX(i, dustPos[i * 3] + Math.sin(elapsed * 0.35 + dustSeed[i]) * 0.14);
      }
      dustAttr.needsUpdate = true;
      secondPivot.rotation.x = -elapsed * ((Math.PI * 2) / 60);
      minutePivot.rotation.x = -elapsed * ((Math.PI * 2) / 3600) - 1.1;

      // captions + hint (throttled to every 4th frame)
      if (frames % 4 === 0) {
        for (let i = 0; i < CAPTIONS.length; i++) {
          const el = captionRefs.current[i];
          if (el) el.style.opacity = fadeWindow(p, CAPTIONS[i].start, CAPTIONS[i].end).toFixed(3);
        }
        if (hintRef.current) {
          hintRef.current.style.opacity = (1 - clamp01((p - 0.02) / 0.06)).toFixed(3);
        }
      }
      frames++;

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    /* ---------------- resize ---------------- */
    const onResize = (): void => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);
    onResize();

    /* ---------------- cleanup ---------------- */
    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });
      boardTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={trackRef} className="relative" style={{ height: "420vh" }}>
      <div className="sticky top-0 h-dvh overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />

        {/* title */}
        <div className="pointer-events-none absolute left-4 top-6 z-10 md:left-8">
          <h1 className="text-2xl font-bold drop-shadow md:text-3xl">3D Classroom</h1>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground drop-shadow md:text-sm">
            A live lesson you can scroll through — procedural three.js, no model assets.
          </p>
        </div>

        {/* scroll captions */}
        {CAPTIONS.map((caption, i) => (
          <div
            key={caption.text}
            ref={(el) => {
              captionRefs.current[i] = el;
            }}
            className="pointer-events-none absolute bottom-24 left-1/2 z-10 w-[min(30rem,88vw)] -translate-x-1/2 rounded-lg border bg-background/75 p-4 text-center text-sm backdrop-blur"
            style={{ opacity: 0 }}
          >
            {caption.text}
          </div>
        ))}

        {/* scroll hint */}
        <div
          ref={hintRef}
          className="pointer-events-none absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/70 px-4 py-2 text-xs font-medium backdrop-blur md:text-sm"
        >
          <span className="animate-bounce">↓</span> Scroll to walk through the room
        </div>

        {failed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-8 text-center">
            <div className="rounded-lg border bg-background/80 p-6 backdrop-blur">
              <p className="font-semibold">WebGL is not available</p>
              <p className="mt-2 text-sm text-muted-foreground">
                This page needs WebGL for the 3D walkthrough. Try enabling hardware acceleration or a
                different browser.
              </p>
            </div>
          </div>
        )}

        <p className="sr-only">
          An interactive 3D walkthrough of a classroom during a lesson: a teacher paces in front of
          the blackboard, students sit at four rows of desks, occasionally raise hands and toss a
          paper ball, a ceiling fan spins and daylight comes through the corridor windows. Scrolling
          moves the camera from the back door to the blackboard.
        </p>
      </div>
    </div>
  );
}
