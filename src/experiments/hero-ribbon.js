/* Hero ribbon (Wispr Flow).

   Ported from the Creative Studio's Wispr Flow prototype (clients/wispr-
   flow/prototypes/02-Hero-ribbon.html). Raw speech, faint and rambling,
   falls in from the top left, loops once and dives into the Flow pill;
   out of the pill's far end prints a dark tape of the same thought, clean,
   that swoops round towards the camera and runs along the floor. Little
   chips pop out of the top of the pill as it works (filler removed, a name
   saved) and drift off. The pill's waveform talks the whole time, and a
   click on the pill pops a chip and speeds the text up.

   It opens on the prototype's fly-in: the camera skims low along the tape
   from its far end, then climbs and pans onto the pill, and rests. Drag to
   turn the view a little. On Wispr's own cream, ink and green, in Figtree,
   with the contact shading, soft sun shadow and floor the prototype had.
   The words are new: a dictated note written for this, not Wispr's copy. */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

export const params = {
  motion: {
    speed: [1.05, 0, 3, 0.05],
    sway: [8.6, 0, 30, 0.2],
  },
  ribbon: {
    path: { type: "select", options: ["Swoop toward us", "Run off right"] },
    wave: [1.25, 0, 3, 0.05],
    roll: [0.45, -1.6, 1.6, 0.05],
  },
  pill: {
    energy: [1, 0, 2.5, 0.05],
    chipsEvery: [1.7, 0.4, 6, 0.1],
  },
  colour: {
    background: "#ffffeb",
    tape: "#1a1a1a",
    badge: "#034f46",
  },
  replay: { type: "action", label: "Replay fly-in" },
  pop: { type: "action", label: "Pop a chip" },
};

// Wispr's colours, as the prototype read them off wisprflow.ai
const WISPR = { lumen: "#FFFFEB", vast: "#1A1A1A", fathom: "#034F46" };

// A dictated note, and what it comes out as
const COPY = {
  raw: "So um, I was thinking we could, like, move the the review to Thursday? Uh, because Priya said the files aren't really ready yet and, you know, I'd rather not rush it, but I'm not totally sure, so maybe we just ask her.",
  clean: "Let's move the review to Thursday. Priya said the files aren't ready yet, and I'd rather not rush it. Let's ask her.",
  chips: [
    { text: "Filler removed", kind: "badge" },
    { text: "Grammar corrected", kind: "badge" },
    { text: "Priya", kind: "word" },
    { text: "Saved name", kind: "badge" },
    { text: "Repetition removed", kind: "badge" },
  ],
};

/* Every number the prototype tuned that is not on a dial here, at its saved default. */
const D = {
  "motion.speed": 1.05, "motion.playback": true, "motion.intro": true, "motion.startAngle": -66, "motion.restAngle": -29, "motion.sway": 8.6, "motion.float": 0.1,
  "intro.flyIn": true, "intro.flyTime": 6, "intro.rampUp": 0.3, "intro.endSpeed": 0.2, "intro.revealTime": 6.5, "intro.startAlong": 0.97, "intro.endAlong": 0.36,
  "intro.height": 0.38, "intro.trail": 1, "intro.lens": 52, "intro.pullUp": 1.4, "intro.lookAhead": 0.05, "intro.tilt": 12, "intro.bank": 14, "intro.calmRibbon": 0.25,
  "camera.fieldOfView": 34, "camera.distance": 17, "camera.height": 1.7, "camera.drag": true,
  "scene.background": WISPR.lumen, "scene.sunStrength": 2.2, "scene.ambient": 0.95, "scene.reflections": 0.2, "scene.contactShadow": 1, "scene.shadows": true,
  "floor.show": true, "floor.depth": 3.05, "floor.color": WISPR.lumen, "floor.shadow": 0.2, "floor.shadowColor": WISPR.vast, "floor.softness": 20, "floor.lightAngle": 2, "floor.lightHeight": 70,
  "pill.size": 1, "pill.depth": 0.62, "pill.rim": "#1E1E1E", "pill.face": WISPR.lumen, "pill.bars": "#1E1E1E", "pill.barCount": 17, "pill.energy": 1,
  "raw.ink": WISPR.vast, "raw.opacity": 0.55, "raw.size": 0.44, "raw.loopSize": 1.3, "raw.wave": 1, "raw.facing": true,
  "ribbon.tape": WISPR.vast, "ribbon.ink": WISPR.lumen, "ribbon.width": 0.43, "ribbon.wave": 1.25, "ribbon.roll": 0.45, "ribbon.path": "Swoop toward us", "ribbon.speed": 0.93,
  "bubbles.show": true, "bubbles.every": 1.7, "bubbles.lifetime": 2.9, "bubbles.rise": 1, "bubbles.spread": 1, "bubbles.size": 1, "bubbles.badge": WISPR.fathom, "bubbles.badgeInk": WISPR.lumen,
};
// the prototype's names for the dials here
const ALIAS = {
  "motion.speed": "motion.speed", "motion.sway": "motion.sway",
  "ribbon.path": "ribbon.path", "ribbon.wave": "ribbon.wave", "ribbon.roll": "ribbon.roll",
  "pill.energy": "pill.energy", "bubbles.every": "pill.chipsEvery",
  "scene.background": "colour.background", "floor.color": "colour.background",
  "ribbon.tape": "colour.tape", "bubbles.badge": "colour.badge",
};

const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const FAMILY = "HeroRibbonFigtree";
let fontsReady = null;
function loadFonts() {
  fontsReady ??= Promise.all(
    [["Figtree-Medium.woff2", "500"], ["Figtree-SemiBold.woff2", "600"]].map(async ([file, weight]) => {
      try {
        const face = new FontFace(FAMILY, `url(${new URL(`media/play/hero-ribbon/${file}`, ROOT).href})`, { weight });
        await face.load();
        document.fonts.add(face);
      } catch {
        /* the system face stands in */
      }
    }),
  );
  return fontsReady;
}

const hexLum = (hex) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (d) => (d * Math.PI) / 180;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const easeInBack = (t) => {
  const c = 1.7;
  return (c + 1) * t * t * t - c * t * t;
};
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function roundedRectShape(w, h, r, seg = 20) {
  // explicit points, so a full capsule has no zero-length edges
  r = Math.min(r, w / 2, h / 2);
  const hw = w / 2, hh = h / 2, pts = [];
  const corners = [[hw - r, -hh + r, -Math.PI / 2], [hw - r, hh - r, 0], [-hw + r, hh - r, Math.PI / 2], [-hw + r, -hh + r, Math.PI]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      const p = new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a));
      if (!pts.length || pts[pts.length - 1].distanceTo(p) > 1e-6) pts.push(p);
    }
  }
  if (pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  return new THREE.Shape(pts);
}
function slab(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelOffset: -bevel, bevelSegments: 5, curveSegments: 32,
  });
  g.translate(0, 0, bevel - depth / 2);
  const creased = toCreasedNormals(g, Math.PI / 5);
  g.dispose();
  return creased;
}

/* A strip swept along a curve, rebuilt every frame so it can wave. */
class Ribbon {
  constructor({ points, width, texLen, segments = 600, hint, sway = null, twist = null, alphaRamp = null, constrain = null }) {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    this.n = segments;
    this.len = curve.getLength();
    this.rest = curve.getSpacedPoints(segments);
    this.s = this.rest.map((_, i) => (i / segments) * this.len);
    this.cur = this.rest.map((p) => p.clone());
    Object.assign(this, { width, hint, sway, twist, constrain });
    const vc = (segments + 1) * 2;
    this.pos = new Float32Array(vc * 3);
    this.nor = new Float32Array(vc * 3);
    const uv = new Float32Array(vc * 2);
    const col = alphaRamp ? new Float32Array(vc * 4) : null;
    for (let i = 0; i <= segments; i++) {
      const u = this.s[i] / texLen;
      uv.set([u, 0, u, 1], i * 4);
      if (col) {
        const a = alphaRamp(this.s[i], this.len);
        col.set([1, 1, 1, a, 1, 1, 1, a], i * 8);
      }
    }
    const idx = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute("color", new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    this.geo = g;
    this._T = v3(); this._W = v3(); this._N = v3(); this._H = v3(); this._tmp = v3();
    this.update(0);
  }
  update(time) {
    const { n, cur, rest, s, pos, nor, _T: T, _W: W, _N: N, _H: H, _tmp: tmp } = this;
    for (let i = 0; i <= n; i++) {
      cur[i].copy(rest[i]);
      if (this.sway) this.sway(cur[i], s[i], time);
      if (this.constrain) this.constrain(cur[i]);
    }
    const hw = this.width / 2;
    for (let i = 0; i <= n; i++) {
      T.subVectors(cur[Math.min(i + 1, n)], cur[Math.max(i - 1, 0)]).normalize();
      this.hint(cur[i], s[i], H);
      W.crossVectors(H, T).normalize();
      N.crossVectors(T, W);
      if (this.twist) {
        const a = this.twist(s[i], time);
        if (a) {
          const ca = Math.cos(a), sa = Math.sin(a);
          tmp.copy(W).multiplyScalar(ca).addScaledVector(N, sa);
          N.multiplyScalar(ca).addScaledVector(W, -sa);
          W.copy(tmp);
        }
      }
      const p = cur[i], o = i * 6;
      pos[o] = p.x - W.x * hw; pos[o + 1] = p.y - W.y * hw; pos[o + 2] = p.z - W.z * hw;
      pos[o + 3] = p.x + W.x * hw; pos[o + 4] = p.y + W.y * hw; pos[o + 5] = p.z + W.z * hw;
      nor[o] = nor[o + 3] = N.x; nor[o + 1] = nor[o + 4] = N.y; nor[o + 2] = nor[o + 5] = N.z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const P = (k) => (k === "ribbon.ink" ? (hexLum(P("ribbon.tape")) > 0.45 ? WISPR.vast : WISPR.lumen) : ALIAS[k] ? v[ALIAS[k]] : D[k]);
  let destroyed = false;

  /* ---- renderer, scene, camera, post ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCF honours shadow.radius, the softness
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:${reduced ? "none" : "opacity 1s ease"};touch-action:none;cursor:grab;outline:none`;
  // the page's cream under the canvas, so it fades in from the ground and not from black
  const backdrop = document.createElement("div");
  backdrop.style.cssText = `position:absolute;inset:0;background:${P("scene.background")}`;
  host.append(backdrop, canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P("scene.background"));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 200);
  const TARGET = new THREE.Vector3(0.3, -0.35, 0);

  const rtSize = new THREE.Vector2(2, 2);
  const target = new THREE.WebGLRenderTarget(rtSize.x, rtSize.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, rtSize.x, rtSize.y);
  gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1, scale: 1.2, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
  composer.addPass(gtao);
  const output = new OutputPass();
  composer.addPass(output);
  {
    // floating text and the background stay out of the contact shading (three
    // r180 only restores what it hid itself, so these keep their own list)
    const OV = "_overrideVisibility" in gtao ? "_overrideVisibility" : "overrideVisibility";
    const RV = "_restoreVisibility" in gtao ? "_restoreVisibility" : "restoreVisibility";
    const ov = gtao[OV].bind(gtao);
    const rv = gtao[RV].bind(gtao);
    const hidden = [];
    let bg = null;
    gtao[OV] = () => {
      ov();
      bg = scene.background;
      scene.background = null;
      scene.traverse((o) => {
        if (o.userData.noAO && o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      });
    };
    gtao[RV] = () => {
      rv();
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
      scene.background = bg;
    };
  }

  const hemi = new THREE.HemisphereLight("#FFFFF6", "#E6D2F2", 0.95);
  const sun = new THREE.DirectionalLight("#FFF5E4", 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 90 });
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  scene.add(hemi, sun, sun.target);

  const floor = new THREE.Group();
  const floorFill = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ color: WISPR.lumen }));
  const floorShadow = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.ShadowMaterial({ color: WISPR.vast, opacity: 0.35, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  for (const m of [floorFill, floorShadow]) m.rotation.x = -Math.PI / 2;
  floorShadow.receiveShadow = true;
  floorShadow.userData.noAO = true;
  floorFill.userData.noAO = true; // contact shading at grazing angles draws a band along the horizon
  floor.add(floorFill, floorShadow);
  floor.visible = false;
  scene.add(floor);

  /* ---- materials and helpers ---- */
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0, ...o });
  const M = {
    rim: std("#1E1E1E", { roughness: 0.42 }),
    face: std(WISPR.lumen, { roughness: 0.9 }),
    bars: std("#1E1E1E", { roughness: 0.42 }),
    tapeBack: std("#1E1E1E", { roughness: 0.6 }),
    badge: std(WISPR.fathom, { roughness: 0.6 }),
    chipRim: std("#1E1E1E", { roughness: 0.42 }),
    chipFace: std(WISPR.lumen, { roughness: 0.9 }),
  };
  const shared = new Set(Object.values(M));
  function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function dispose(group) {
    const geos = new Set();
    group.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material && !shared.has(o.material)) {
        o.material.map?.dispose();
        o.material.dispose();
      }
      o.customDepthMaterial?.dispose();
    });
    for (const g of geos) g.dispose();
    group.removeFromParent();
  }

  const MAX_TEX = Math.min(renderer.capabilities.maxTextureSize, 8192);
  const ANISO = renderer.capabilities.getMaxAnisotropy();
  const font = (weight, px) => `${weight} ${px}px ${FAMILY}, Figtree, Arial, sans-serif`;
  function stripTexture({ text, h, fontPx, weight = 500, color, bg = null, gapEm = 1.4 }) {
    const c = document.createElement("canvas");
    let g = c.getContext("2d");
    g.font = font(weight, fontPx);
    const w = Math.max(fontPx * 4, g.measureText(text || " ").width + fontPx * gapEm);
    const s = Math.min(1, MAX_TEX / w);
    c.width = Math.floor(w * s);
    c.height = Math.round(h * s);
    g = c.getContext("2d");
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, c.width, c.height);
    }
    g.font = font(weight, fontPx * s);
    g.fillStyle = color;
    g.textBaseline = "middle";
    g.fillText(text, (fontPx * gapEm * s) / 2, c.height / 2 + fontPx * s * 0.05);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = ANISO;
    tex.wrapS = THREE.RepeatWrapping;
    return { tex, aspect: c.width / c.height };
  }

  /* ---- the rig: pill, raw loops in, clean tape out. It turns as one piece. ---- */
  const rig = new THREE.Group();
  rig.position.set(-0.3, 0, 0);
  scene.add(rig);
  const camLocal = new THREE.Vector3(0, 0, 20);
  const flow = { boost: 0 };
  // with the floor on, the tape eases down onto it rather than through (a smooth max)
  const rigInv = new THREE.Matrix4();
  const _fw = new THREE.Vector3();
  function settleOnFloor(p) {
    if (!floor.visible) return;
    _fw.copy(p).applyMatrix4(rig.matrixWorld);
    const rest = floor.position.y + 0.02 + P("ribbon.width") * 0.5 * Math.min(1, Math.abs(P("ribbon.roll")));
    const d = _fw.y - rest, k = 0.35;
    _fw.y = rest + (d + Math.sqrt(d * d + k * k)) / 2;
    p.copy(_fw.applyMatrix4(rigInv));
  }
  let ribbonCalm = 1; // eased toward the fly-in's calm while the camera rides it
  const pillDims = () => {
    const k = P("pill.size");
    return { w: 2.6 * k, h: 1.1 * k, d: P("pill.depth") };
  };

  const pill = { group: null, bars: [], face: 1 };
  function buildPill() {
    if (pill.group) dispose(pill.group);
    const { w, h, d } = pillDims();
    const g = new THREE.Group();
    rig.add(g);
    mesh(slab(roundedRectShape(w, h, h / 2), d, Math.min(0.09, d * 0.2)), M.rim, g);
    const fw = w - 0.15, fh = h - 0.15;
    mesh(slab(roundedRectShape(fw, fh, fh / 2), 0.07, 0.025), M.face, g, 0, 0, d / 2 - 0.012);
    const n = Math.round(P("pill.barCount")), span = w - 0.8 * P("pill.size");
    const barGeo = new THREE.CapsuleGeometry(0.034 * Math.sqrt(P("pill.size")), 1, 6, 12);
    pill.bars = [];
    for (let i = 0; i < n; i++) pill.bars.push(mesh(barGeo, M.bars, g, n === 1 ? 0 : -span / 2 + (span * i) / (n - 1), 0, d / 2 + 0.06));
    pill.group = g;
    pill.face = fh;
  }

  const ribbons = { group: null, raw: null, tape: null, rawTex: null, tapeTex: null, rawLen: 1, tapeLen: 1, rawMat: null };
  function buildRibbons() {
    let rawOffset = 0, tapeOffset = 0;
    if (ribbons.group) {
      rawOffset = ribbons.rawTex.offset.x;
      tapeOffset = ribbons.tapeTex.offset.x;
      dispose(ribbons.group);
    }
    const g = new THREE.Group();
    rig.add(g);
    const { w } = pillDims();
    const pl = -w / 2, pr = w / 2;

    // raw dictation: faint, falling in from the top left, looping, diving into the pill
    const rawW = P("raw.size");
    const raw = stripTexture({ text: COPY.raw, h: 112, fontPx: 60, color: "#ffffff" });
    const rawLen = raw.aspect * rawW;
    const pts = [v3(-10.6, 6.4, -3.2), v3(-9.2, 4.2, -2.1), v3(-7.9, 1.9, -1.2), v3(-6.6, -0.2, -0.5), v3(-5.6, -0.72, -0.2)];
    const R = P("raw.loopSize"), tilt = 0.32;
    const LC = v3(-4.45 - (R - 1.3) * 0.6, 0.55 + (R - 1.3) * 0.9, 0);
    const U = v3(Math.cos(tilt), 0, -Math.sin(tilt)), Vv = v3(0, 1, 0), Dd = v3(Math.sin(tilt), 0, Math.cos(tilt));
    for (let i = 0; i <= 12; i++) {
      const f = i / 12, th = -Math.PI / 2 + f * Math.PI * 2 * 0.97;
      pts.push(LC.clone().addScaledVector(U, R * Math.cos(th) + f * 0.55).addScaledVector(Vv, R * Math.sin(th)).addScaledVector(Dd, f * 0.7 - 0.1));
    }
    pts.push(v3(-2.45, -0.5, 0.5), v3(-1.85, -0.16, 0.22), v3(Math.min(pl - 0.2, -1.5), 0, 0.04), v3(pl + 0.5, 0, 0));
    let rawEnd = 1e6;
    const rawRibbon = new Ribbon({
      points: pts, width: rawW, texLen: rawLen, segments: 1000,
      hint: (p, s, out) => (P("raw.facing") ? out.subVectors(camLocal, p).normalize() : out.set(0, 0, 1)),
      alphaRamp: (s) => smooth(0.5, 6.5, s),
      sway: (p, s, t) => {
        const k = (1 - smooth(rawEnd - 4, rawEnd - 1.2, s)) * P("raw.wave");
        p.y += Math.sin(s * 0.55 - t * 0.9) * 0.14 * k;
        p.z += Math.cos(s * 0.4 - t * 0.7) * 0.12 * k;
      },
    });
    rawEnd = rawRibbon.len;
    const rawMat = new THREE.MeshBasicMaterial({ map: raw.tex, color: P("raw.ink"), opacity: P("raw.opacity"), transparent: true, alphaTest: 0.01, side: THREE.DoubleSide, vertexColors: true, depthWrite: false });
    const rawMesh = new THREE.Mesh(rawRibbon.geo, rawMat);
    rawMesh.frustumCulled = false;
    rawMesh.userData.noAO = true;
    // the letters cast their own shadows, so the loop reads on the floor
    rawMesh.castShadow = true;
    rawMesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: raw.tex, alphaTest: 0.3 });
    g.add(rawMesh);

    // clean tape: prints out of the pill's right end, then swoops toward us (or runs off right)
    const tapeW = P("ribbon.width");
    const clean = stripTexture({ text: COPY.clean + " ", h: 168, fontPx: 84, color: P("ribbon.ink"), bg: P("ribbon.tape"), gapEm: 0.6 });
    const tapeLen = clean.aspect * tapeW;
    const swoop = P("ribbon.path") === "Swoop toward us";
    const tp = swoop
      ? [v3(pr - 0.5, 0, 0), v3(pr + 0.2, 0, 0), v3(pr + 1.1, 0.07, 0.02), v3(pr + 2.3, 0.3, 0.12),
         v3(pr + 3.5, 0.12, 0.55), v3(pr + 4.25, -0.55, 1.6), v3(pr + 4.1, -1.45, 3.2), v3(pr + 3.0, -2.15, 5.0),
         v3(pr + 1.3, -2.7, 6.7), v3(pr - 0.8, -3.05, 8.4), v3(pr - 3.0, -3.25, 9.8),
         v3(pr - 5.3, -3.38, 11.0), v3(pr - 7.8, -3.45, 11.9), v3(pr - 10.5, -3.5, 12.5),
         v3(pr - 13.2, -3.53, 12.7), v3(pr - 15.8, -3.55, 12.3), v3(pr - 18.2, -3.56, 11.3), v3(pr - 20.3, -3.57, 9.8)]
      : [v3(pr - 0.5, 0, 0), v3(pr + 0.2, 0, 0), v3(pr + 1.4, 0.1, 0.05), v3(pr + 3.0, 0.45, 0.2),
         v3(pr + 4.8, 0.25, 0.4), v3(pr + 6.8, 0.6, 0.6), v3(pr + 9.5, 0.4, 0.9), v3(pr + 13, 0.8, 1.2)];
    const tapeRibbon = new Ribbon({
      points: tp, width: tapeW, texLen: tapeLen, segments: 1300,
      hint: (p, s, out) => {
        const k = smooth(1.2, 8.5, s);
        return out.set(0, k, 1 - k).normalize();
      },
      sway: (p, s, t) => {
        const k = smooth(0.6, 3.5, s) * P("ribbon.wave") * ribbonCalm;
        p.y += Math.sin(s * 0.75 - t * 1.05) * 0.2 * k;
        p.z += Math.sin(s * 0.5 - t * 0.8 + 1.2) * 0.16 * k;
        p.x += Math.cos(s * 0.45 - t * 0.6) * 0.08 * k;
      },
      twist: (s, t) => -smooth(6, 14, s) * (P("ribbon.roll") + 0.15 * Math.sign(P("ribbon.roll")) * Math.sin(t * 0.5)),
      constrain: settleOnFloor,
    });
    M.tapeBack.color.set(P("ribbon.tape"));
    const front = new THREE.Mesh(tapeRibbon.geo, std("#ffffff", { map: clean.tex, roughness: 0.55, side: THREE.FrontSide }));
    const back = new THREE.Mesh(tapeRibbon.geo, M.tapeBack);
    for (const m of [front, back]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    front.material.shadowSide = THREE.DoubleSide;
    back.material.side = THREE.BackSide;
    back.castShadow = false;
    raw.tex.offset.x = rawOffset;
    clean.tex.offset.x = tapeOffset;
    Object.assign(ribbons, { group: g, raw: rawRibbon, tape: tapeRibbon, rawTex: raw.tex, tapeTex: clean.tex, rawLen, tapeLen, rawMat });
  }

  /* ---- the chips: out of the top of the pill, facing us, up and away (scale only, no fades) ---- */
  const CHECK = new Path2D("M4 12.5l5 5L20 6.5");
  const bubbles = [];
  function chipTexture(W, Dp, b, ppu = 380) {
    const c = document.createElement("canvas");
    c.width = Math.round(W * ppu);
    c.height = Math.round(Dp * ppu);
    const g = c.getContext("2d");
    g.scale(c.width / W, c.height / Dp);
    g.textBaseline = "middle";
    if (b.kind === "badge") {
      g.save();
      g.translate(0.2, Dp / 2 - 0.1);
      g.scale(0.2 / 24, 0.2 / 24);
      g.strokeStyle = P("bubbles.badgeInk");
      g.lineWidth = 2.6;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.stroke(CHECK);
      g.restore();
      g.font = font(500, 0.22);
      g.fillStyle = P("bubbles.badgeInk");
      g.textAlign = "left";
      g.fillText(b.text, 0.47, Dp / 2 + 0.01);
    } else {
      g.font = font(600, 0.23);
      g.fillStyle = WISPR.vast;
      g.textAlign = "center";
      g.fillText(b.text, W / 2, Dp / 2 + 0.01);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    return t;
  }
  function buildBubbles() {
    for (const b of bubbles) dispose(b.g);
    bubbles.length = 0;
    const Dp = 0.46;
    const meas = document.createElement("canvas").getContext("2d");
    for (const b of COPY.chips) {
      meas.font = b.kind === "badge" ? font(500, 22) : font(600, 23);
      const W = meas.measureText(b.text).width / 100 + (b.kind === "badge" ? 0.66 : 0.52);
      const g = new THREE.Group();
      g.visible = false;
      g.userData.noAO = true;
      rig.add(g);
      const inner = new THREE.Group();
      inner.scale.setScalar(P("bubbles.size"));
      g.add(inner);
      if (b.kind === "badge") mesh(slab(roundedRectShape(W, Dp, Dp / 2), 0.09, 0.03), M.badge, inner);
      else {
        mesh(slab(roundedRectShape(W, Dp, Dp / 2), 0.09, 0.03), M.chipRim, inner);
        mesh(slab(roundedRectShape(W - 0.07, Dp - 0.07, (Dp - 0.07) / 2), 0.1, 0.025), M.chipFace, inner).castShadow = false;
      }
      const face = new THREE.Mesh(new THREE.PlaneGeometry(W, Dp), std("#ffffff", { map: chipTexture(W, Dp, b), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      face.position.z = 0.054;
      inner.add(face);
      bubbles.push({ g, life: -1, from: v3(), to: v3(), drift: v3(), k: 0 });
    }
  }
  let bubbleIdx = 0, sinceBubble = 0;
  function launchBubble() {
    if (!bubbles.length) return;
    const b = bubbles[bubbleIdx % bubbles.length];
    const k = bubbleIdx++;
    const side = [-0.95, 0.95, -0.35, 0.6, 0.1][k % 5] * P("bubbles.spread");
    const rise = P("bubbles.rise"), top = pillDims().h / 2;
    b.k = k;
    b.life = 0;
    b.from.set(side * 0.25, top - 0.23, 0.25);
    b.to.set(side, top + (0.83 + (k % 2) * 0.14) * rise, 0.75);
    b.drift.set(side * 0.75, 0.95 * rise, 0.35);
    b.g.visible = true;
    sinceBubble = 0;
  }

  /* ---- live dials: everything that needs no rebuild is read every frame ---- */
  const dirty = new Set();
  let controls = null;
  function applyLive() {
    for (const part of dirty) {
      if (part === "ribbons") buildRibbons();
    }
    dirty.clear();
    scene.background.set(P("scene.background"));
    backdrop.style.background = P("scene.background");
    sun.intensity = P("scene.sunStrength");
    const az = rad(P("floor.lightAngle")), el = rad(P("floor.lightHeight"));
    sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(30);
    sun.shadow.radius = Math.max(0.01, P("floor.softness"));
    floor.visible = P("floor.show");
    floor.position.y = -P("floor.depth");
    floorFill.material.color.set(P("floor.color"));
    floorShadow.material.color.set(P("floor.shadowColor"));
    floorShadow.material.opacity = P("floor.shadow");
    hemi.intensity = P("scene.ambient");
    scene.environmentIntensity = P("scene.reflections");
    gtao.blendIntensity = P("scene.contactShadow");
    gtao.enabled = P("scene.contactShadow") > 0.001;
    sun.castShadow = P("scene.shadows");
    M.rim.color.set(P("pill.rim"));
    M.face.color.set(P("pill.face"));
    M.bars.color.set(P("pill.bars"));
    M.badge.color.set(P("bubbles.badge"));
    if (ribbons.rawMat) {
      ribbons.rawMat.color.set(P("raw.ink"));
      ribbons.rawMat.opacity = P("raw.opacity");
    }
    if (controls) controls.enabled = P("camera.drag") && flyDone;
  }

  /* ---- the camera ---- */
  const lastFrame = { d: null, h: null };
  const restPos = new THREE.Vector3(), restTarget = new THREE.Vector3();
  const camState = { flying: !reduced && P("intro.flyIn") }; // while true, resizes never move the camera
  let W = 1, H = 1;
  function fit() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    const aspect = W / H;
    camera.aspect = aspect;
    // pull back on narrow screens and lift the piece a little
    const portrait = aspect < 0.9;
    const base = P("camera.distance");
    const dist = aspect >= 1.35 ? base : base * Math.min(2.5, 1.35 / aspect) * 0.93;
    const tgt = TARGET.clone();
    if (portrait) tgt.set(-0.4, -1.5, 0);
    const dir = v3(0.2, P("camera.height") + 0.35, 17).normalize();
    restPos.copy(tgt).addScaledVector(dir, dist);
    restTarget.copy(tgt);
    if (!camState.flying && controls) {
      camera.position.copy(restPos);
      controls.target.copy(restTarget);
      controls.update();
    }
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(W, H);
    lastFrame.d = base;
    lastFrame.h = P("camera.height");
  }

  /* ---- the loop ---- */
  let time = 0, introT = 0;
  let camT = 0, flyDone = reduced || !P("intro.flyIn"), camSnap = true;
  const _cp = v3(), _ct = v3(), _ca = v3(), _cb = v3(), _dir = v3(), _wantP = v3(), _wantT = v3(), _bp = v3();
  const camLookAt = new THREE.Vector3();
  let camBank = 0;
  function aimOf(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, dist = Math.hypot(dx, dy, dz);
    return { yaw: Math.atan2(dx, dz), pitch: Math.asin(dy / dist), dist };
  }
  // the camera rides a smoothed rail through the tape's resting shape, not the waving tape itself
  let rail = null;
  function buildRail() {
    const r = ribbons.tape, w = Math.round(r.n * 0.02), pts = [];
    for (let k = 0; k <= 24; k++) {
      const c = Math.round((k / 24) * r.n), avg = v3();
      for (let j = -w; j <= w; j++) avg.add(r.rest[Math.max(0, Math.min(r.n, c + j))]);
      avg.multiplyScalar(1 / (2 * w + 1));
      if (r.constrain) r.constrain(avg);
      pts.push(avg);
    }
    rail = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  }
  const railPoint = (along, out) => rail.getPointAt(clamp01(along), out).applyMatrix4(rig.matrixWorld);
  // distance flown at time u: ramp up, cruise, ease off to endSpeed, glide to a stop
  let flightTable = null, flightKey = "";
  function flightProgress(u) {
    const ramp = P("intro.rampUp"), end = P("intro.endSpeed"), N = 512;
    if (flightKey !== ramp + "/" + end) {
      const sp = (x) => smooth(0, ramp, x) * (1 - (1 - end) * smooth(0.45, 0.85, x)) * (1 - smooth(0.8, 1, x));
      flightTable = new Float32Array(N + 1);
      for (let i = 1; i <= N; i++) flightTable[i] = flightTable[i - 1] + (sp((i - 1) / N) + sp(i / N)) / 2;
      for (let i = 1; i <= N; i++) flightTable[i] /= flightTable[N];
      flightKey = ramp + "/" + end;
    }
    const x = clamp01(u) * N, i = Math.min(N - 1, Math.floor(x));
    return lerp(flightTable[i], flightTable[i + 1], x - i);
  }

  function tickFrame(dt, render = true) {
    applyLive();
    const d = P("motion.speed") * (P("motion.playback") ? dt : 0);
    time += d;
    introT += d;
    const t = time;

    const dur = 3.6;
    const flyOn = P("intro.flyIn") && !reduced;
    const flying = flyOn && !flyDone;
    {
      const rs = P("intro.flyTime") * 0.65;
      const reveal = flyOn ? smooth(rs, rs + P("intro.revealTime"), camT) : 1;
      ribbonCalm = flyDone ? 1 : lerp(P("intro.calmRibbon"), 1, reveal);
    }
    // with the fly-in on, the camera does the revealing, so the rig waits at its rest angle
    const turn = P("motion.intro") && !flyOn && !reduced;
    const intro = turn ? easeInOutCubic(clamp01(introT / dur)) : 1;
    const settle = turn ? smooth(dur * 0.6, dur + 2, introT) : flyOn ? smooth(0, 3, camT - P("intro.flyTime") * 0.65 - P("intro.revealTime") * 0.5) : 1;
    rig.rotation.y = lerp(rad(P("motion.startAngle")), rad(P("motion.restAngle")), intro) + Math.sin(t * 0.3) * rad(P("motion.sway")) * settle;
    rig.rotation.x = Math.sin(t * 0.23 + 0.4) * 0.05 * settle * (P("motion.sway") / 8.6);
    rig.rotation.z = Math.sin(t * 0.19) * 0.025 * settle * (P("motion.sway") / 8.6);
    rig.position.y = Math.sin(t * 0.55) * P("motion.float");
    rig.updateMatrixWorld(true);
    rigInv.copy(rig.matrixWorld).invert();

    // the waveform
    const n = pill.bars.length;
    for (let i = 0; i < n; i++) {
      const env = Math.sin((Math.PI * (i + 0.5)) / n);
      const w = Math.abs(Math.sin(t * 3.1 + i * 0.73) * Math.sin(t * 1.7 + i * 1.91) + 0.35 * Math.sin(t * 6.3 + i * 2.4));
      pill.bars[i].scale.y = Math.min(0.05 + env * (0.16 + 0.44 * w) * P("pill.energy") * (1 + flow.boost * 0.45), pill.face - 0.32);
    }

    // the text flows
    flow.boost = Math.max(0, flow.boost - d * 0.4);
    const sp = P("ribbon.speed") * (1 + flow.boost * 2.4) * d;
    ribbons.rawTex.offset.x -= sp / ribbons.rawLen;
    ribbons.tapeTex.offset.x -= sp / ribbons.tapeLen;
    camLocal.copy(camera.position);
    rig.worldToLocal(camLocal);
    ribbons.raw.update(t);
    ribbons.tape.update(t);

    // the chips
    if (P("bubbles.show")) {
      sinceBubble += d;
      if (sinceBubble > P("bubbles.every") * (1 - flow.boost * 0.5)) launchBubble();
    }
    for (const b of bubbles) {
      if (b.life < 0) continue;
      b.life += d / P("bubbles.lifetime");
      if (b.life >= 1) {
        b.life = -1;
        b.g.visible = false;
        continue;
      }
      const u = b.life;
      const fly = easeOutCubic(clamp01(u / 0.34));
      const drift = easeOutCubic(Math.max(0, u - 0.3) / 0.7);
      _bp.lerpVectors(b.from, b.to, fly).addScaledVector(b.drift, drift);
      _bp.x += Math.sin(t * 1.7 + b.k) * 0.03 * fly;
      const sc = easeOutBack(clamp01(u / 0.16)) * (1 - easeInBack(clamp01((u - 0.84) / 0.16)));
      b.g.position.copy(_bp);
      b.g.scale.setScalar(Math.max(0.001, sc));
      b.g.lookAt(camera.position);
      b.g.rotateZ(Math.sin(t * 2.1 + b.k * 1.3) * 0.05);
    }

    // the fly-in: low along the tape, building speed, then easing off and climbing
    // while it pans left, so the pill slides in from the edge of the frame
    camState.flying = flying;
    if (flying) {
      camT += d;
      buildRail();
      const T1 = P("intro.flyTime"), T2 = P("intro.revealTime");
      const revealStart = T1 * 0.65, total = revealStart + T2;
      const along = lerp(P("intro.startAlong"), P("intro.endAlong"), flightProgress(clamp01(camT / T1)));
      railPoint(along, _ca);
      railPoint(along - P("intro.lookAhead"), _cb);
      _dir.subVectors(_ca, _cb).normalize();
      _wantP.copy(_ca).addScaledVector(_dir, P("intro.trail")).add(_cp.set(0, P("intro.height"), 0));
      _wantT.copy(_cb);
      _wantT.y -= Math.tan(rad(P("intro.tilt"))) * _wantT.distanceTo(_wantP);
      const b = clamp01((camT - revealStart) / T2);
      const pan = easeInOutSine(clamp01(b / 0.85));
      const q = easeInOutSine(b);
      _wantP.y += easeInOutSine(clamp01(b / 0.6)) * 0.9 * (1 - q);
      _wantP.lerp(restPos, q);
      _wantP.y += Math.sin(Math.PI * q) * P("intro.pullUp");
      // the aim blends as yaw and pitch, so the pan turns at an even rate
      pill.group.getWorldPosition(_ct);
      const aimSkim = aimOf(_wantP, _wantT), aimPill = aimOf(_wantP, _ct), aimRest = aimOf(_wantP, restTarget);
      const yaw = aimSkim.yaw + wrapAngle(aimPill.yaw - aimSkim.yaw) * pan;
      const yawEnd = yaw + wrapAngle(aimRest.yaw - yaw) * q;
      const pitch = lerp(lerp(aimSkim.pitch, aimPill.pitch, pan), aimRest.pitch, q);
      const reach = lerp(lerp(aimSkim.dist, aimPill.dist, pan), aimRest.dist, q);
      _wantT.set(Math.sin(yawEnd) * Math.cos(pitch), Math.sin(pitch), Math.cos(yawEnd) * Math.cos(pitch)).multiplyScalar(reach).add(_wantP);
      if (camSnap) {
        camera.position.copy(_wantP);
        camLookAt.copy(_wantT);
        camSnap = false;
        camBank = 0;
      } else {
        const k = 1 - Math.exp(-dt * 9);
        camera.position.lerp(_wantP, k);
        camLookAt.lerp(_wantT, k);
      }
      camera.lookAt(camLookAt);
      // bank into the bend of the rail, letting go as the pan takes over
      railPoint(along - 0.06, _cb);
      railPoint(along - 0.12, _ct);
      const h1 = Math.atan2(_cb.x - _ca.x, _cb.z - _ca.z), h2 = Math.atan2(_ct.x - _cb.x, _ct.z - _cb.z);
      let bend = h2 - h1;
      bend = Math.atan2(Math.sin(bend), Math.cos(bend));
      const lean = Math.max(-1, Math.min(1, bend * 3)) * rad(P("intro.bank")) * (1 - pan);
      camBank += (lean - camBank) * (1 - Math.exp(-dt * 2.5));
      camera.rotateZ(camBank);
      camera.near = 0.05;
      camera.fov = lerp(P("intro.lens"), P("camera.fieldOfView"), q);
      camera.updateProjectionMatrix();
      if (camT >= total && camera.position.distanceTo(restPos) < 0.0005 && camLookAt.distanceTo(restTarget) < 0.0005) {
        flyDone = true;
        camState.flying = false;
        camera.position.copy(restPos);
        controls.target.copy(restTarget);
        camera.fov = P("camera.fieldOfView");
        camera.near = 0.5;
        camera.updateProjectionMatrix();
      }
    } else {
      if (camera.fov !== P("camera.fieldOfView") || camera.near !== 0.5) {
        camera.fov = P("camera.fieldOfView");
        camera.near = 0.5;
        camera.updateProjectionMatrix();
      }
      controls.update();
    }
    if (render) {
      renderer.shadowMap.needsUpdate = true;
      composer.render();
    }
  }

  /* ---- running, pausing, the pointer ---- */
  let ready = false, running = false, onScreen = true, tabVisible = !document.hidden;
  const clock = new THREE.Clock(false);
  function sync() {
    const run = ready && !reduced && onScreen && tabVisible && W > 1;
    if (run && !running) {
      running = true;
      clock.start();
      renderer.setAnimationLoop(() => tickFrame(Math.min(clock.getDelta(), 1 / 30)));
    } else if (!run && running) {
      running = false;
      clock.stop();
      renderer.setAnimationLoop(null);
    }
  }
  // a still: the piece settled at rest, a chip on its way up
  function still() {
    if (!ready) return;
    time = 2.4;
    introT = 9;
    for (const b of bubbles) {
      b.life = -1;
      b.g.visible = false;
    }
    bubbleIdx = 0;
    launchBubble();
    for (let i = 0; i < 40; i++) tickFrame(1 / 60, false);
    sinceBubble = -1e9; // and no more
    tickFrame(0);
  }

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downAt = null;
  function overPill(e) {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    return !!pill.group && ray.intersectObject(pill.group, true).length > 0;
  }
  const onDown = (e) => {
    if (!flyDone && P("intro.flyIn")) camT = Math.max(camT, P("intro.flyTime") * 0.65); // a press hurries the fly-in on to its reveal
    downAt = [e.clientX, e.clientY];
    if (P("camera.drag")) canvas.style.cursor = "grabbing";
  };
  const onUp = (e) => {
    canvas.style.cursor = "grab";
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6 && overPill(e)) pop();
    downAt = null;
  };
  const onHover = (e) => {
    if (e.pointerType !== "mouse" || downAt || !ready) return;
    canvas.style.cursor = overPill(e) ? "pointer" : "grab";
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointermove", onHover);

  const ro = new ResizeObserver(() => {
    fit();
    if (ready && !running) tickFrame(0);
    sync();
  });
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    sync();
  });
  const onVis = () => {
    tabVisible = !document.hidden;
    sync();
  };
  document.addEventListener("visibilitychange", onVis);

  loadFonts().then(() => {
    if (destroyed) return;
    buildPill();
    buildRibbons();
    buildBubbles();
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.rotateSpeed = 0.5;
    controls.minAzimuthAngle = -0.6;
    controls.maxAzimuthAngle = 0.6;
    controls.minPolarAngle = Math.PI / 2 - 0.45;
    controls.maxPolarAngle = Math.PI / 2 + 0.25;
    if (reduced) controls.addEventListener("change", () => !running && composer.render());
    fit();
    ready = true;
    ro.observe(host);
    io.observe(host);
    if (reduced) still();
    else tickFrame(0);
    requestAnimationFrame(() => (canvas.style.opacity = "1"));
    sync();
  });

  // a chip, and a rush of text; in a still, the chip is shown on its way
  function pop() {
    if (!ready) return;
    launchBubble();
    flow.boost = 1;
    if (!reduced) return;
    for (let i = 0; i < 30; i++) tickFrame(1 / 60, false);
    tickFrame(0);
  }

  function replay() {
    if (!ready) return;
    introT = 0;
    camT = 0;
    flyDone = reduced || !P("intro.flyIn");
    camSnap = true;
    camState.flying = !flyDone;
    if (flyDone) fit();
    if (reduced) still();
  }

  return {
    update(values, path) {
      const before = { tape: v["colour.tape"], path: v["ribbon.path"] };
      Object.assign(v, values);
      if (v["colour.tape"] !== before.tape || v["ribbon.path"] !== before.path) {
        dirty.add("ribbons");
        // a new path is a new rail: a fly-in under way is carried to its rest
        if (v["ribbon.path"] !== before.path && !flyDone) {
          flyDone = true;
          camState.flying = false;
          fit();
        }
      }
      if (ready && !running) {
        if (reduced) still();
        else tickFrame(0);
      }
    },
    action(name) {
      if (name === "replay") replay();
      if (name === "pop") pop();
    },
    destroy() {
      destroyed = true;
      renderer.setAnimationLoop(null);
      running = false;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onHover);
      controls?.dispose();
      if (pill.group) dispose(pill.group);
      if (ribbons.group) dispose(ribbons.group);
      for (const b of bubbles) dispose(b.g);
      for (const m of shared) m.dispose();
      floorFill.geometry.dispose();
      floorFill.material.dispose();
      floorShadow.geometry.dispose();
      floorShadow.material.dispose();
      scene.environment?.dispose();
      room.dispose?.();
      pmrem.dispose();
      gtao.dispose();
      output.dispose?.();
      composer.dispose?.();
      target.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      backdrop.remove();
    },
  };
}
