/* Ink world.

   From Exe (their prototype 07): a flight through three ink studies, each
   rebuilt as a diorama. Every picture was cut offline into six depth
   layers, each filled in behind the nearer ones, so the first frame of a
   scene is exactly the drawing and the camera can then move into it with
   real parallax: the city from the hill, a whip to the bridge, down
   through an engraved waterline and along the reef. Plants sway on their
   own layer only, the bay ripples, light drifts through the water, fish
   patrol and turn, a sailboat and two gulls drift, marine snow and
   bubbles rise. The last pass prints it all in one ink on one paper.

   The pictures are in public/media/play/ink-world/<scene>/, made small
   from the prototype's: grey (the studies are monochrome), 0.6 of the
   stored size, and the depth and sway maps one texel per mesh vertex,
   which is all the mesh ever read of them. With Loop on, a rested flight
   dissolves into the paper and develops in again at the city. */

import * as THREE from "three";

export const params = {
  flight: {
    speed: [1, 0.2, 3, 0.05],
    depth: [1, 0, 1.5, 0.01],
    loop: { type: "toggle", labels: ["Rest on the reef", "Loop"], default: true },
  },
  life: {
    sway: [1, 0, 3, 0.05],
    swim: [1, 0, 3, 0.05],
    light: [1, 0, 2, 0.05],
  },
  look: {
    ink: "#282624",
    ground: "#f7f4ef",
    paper: [0.3, 0, 1, 0.01],
  },
  flyAgain: { type: "action", label: "Fly again" },
};

// The site's root, from <link rel="site-root">, so this also works framed from a folder
const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const BASE = new URL("media/play/ink-world/", ROOT).href;

const DPR_CAP = 1.5; // the prototype's own render scale: the pictures hold no more detail than this
const REST = 7; // seconds resting on the reef before a looped flight starts again
const OUTRO = 0.9; // the dissolve into the paper
const INTRO = 1.3; // and the develop in

/* Times in seconds at speed 1; positions in each diorama's own units (its
   camera starts at the origin looking down -z). waterline: the next scene
   rises through a waterline over this one's last second. splash: bubbles
   burst as the camera arrives. ease 'in' runs a whip at full speed into the
   cut, 'out' carries it on after. */
const PLAN = [
  { scene: "city", zn: 2.2, zf: 70, gamma: 1.5, from: 0, to: 11,
    keys: [
      { t: 0, pos: [0, 0, 0], yaw: 0, pitch: 0, zoom: 1 },
      { t: 5, pos: [0.02, -0.04, -0.4], yaw: 0.4, pitch: -0.5, zoom: 1.02 },
      { t: 9.9, pos: [0.05, -0.07, -0.85], yaw: 0.8, pitch: -1, zoom: 1.06 },
      { t: 11, pos: [0.06, -0.07, -0.9], yaw: 7, pitch: -1, zoom: 1.06, ease: "in" },
    ] },
  { scene: "bridge", zn: 2.4, zf: 80, gamma: 1.6, from: 11, to: 24, waterline: true,
    keys: [
      { t: 11, pos: [0, 0, 0], yaw: -7, pitch: 0, zoom: 1 },
      { t: 12.3, pos: [0, 0, -0.04], yaw: 0, pitch: 0, zoom: 1, ease: "out" },
      { t: 18, pos: [0.12, -0.05, -0.6], yaw: 1, pitch: -1, zoom: 1.04 },
      { t: 22.6, pos: [0.24, -0.16, -1.0], yaw: 2, pitch: -6, zoom: 1.09 },
      { t: 24, pos: [0.27, -0.2, -1.1], yaw: 2, pitch: -10, zoom: 1.11 },
    ] },
  { scene: "reef", zn: 1.8, zf: 30, gamma: 1.25, under: true, shimmer: 0.78, snow: 260, from: 24, to: 40, splash: true,
    // bubbles rise from the drawn bubble columns (picture pixels, disparity)
    bubbles: [{ px: 935, py: 830, d: 0.3, spread: 30, rise: 560, n: 14 }, { px: 1902, py: 480, d: 0.32, spread: 16, rise: 330, n: 7 }],
    keys: [
      { t: 24, pos: [0, 0.12, 0], yaw: 0, pitch: 12, zoom: 1 },
      { t: 26.5, pos: [0, 0.06, -0.1], yaw: 0, pitch: 2, zoom: 1, ease: "out" },
      { t: 34, pos: [0.04, -0.03, -0.55], yaw: 0.5, pitch: -1, zoom: 1.04 },
      { t: 40, pos: [0.05, -0.05, -0.8], yaw: 0.8, pitch: -2, zoom: 1.06 },
    ] },
];
const TOTAL = PLAN[PLAN.length - 1].to;

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const smooth = (k) => k * k * (3 - 2 * k);
const rad = Math.PI / 180;
// colours go to the shaders as written (display values): the output isn't colour-managed
const rgb = (hex) => {
  const s = String(hex).replace("#", "");
  const n = s.length === 3 ? s.replace(/./g, "$&$&") : s;
  return new THREE.Vector3(parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255);
};

const GLSL_COMMON = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}`;

/* ---------- the layer mesh: pushed out along its rays by depth ---------- */
const LAYER_VERT = /* glsl */ `
uniform sampler2D uDepth, uSway; uniform vec2 uTan; uniform float uZn, uZf, uGamma, uTime, uSwayAmp, uDepthAmt, uLayer;
out vec2 vUv;
void main() {
  // the model's depth is relative and squeezes the far distance: a curve pushes the far range back
  vec2 dp = texture(uDepth, uv).rg;   // 16-bit depth, high byte in red, low in green
  float d = pow(max((dp.r * 65280.0 + dp.g * 255.0) / 65535.0, 0.0), uGamma);
  d = max(mix(0.5, d, uDepthAmt), 0.0);   // past 1 the far range would swing behind the camera; it rests at the far plane instead
  float z = 1.0 / (d * (1.0 / uZn - 1.0 / uZf) + 1.0 / uZf);
  vec4 sw = texture(uSway, uv);
  float s = sw.r * uSwayAmp * step(sw.g * 255.0 / 32.0 - 0.5, uLayer);   // only the plant's own layer (and nearer) moves
  float w = sin(uTime * 1.05 + uv.y * 16.0 + uv.x * 6.0) * 0.6 + sin(uTime * 0.61 + uv.y * 7.0 - uv.x * 3.0) * 0.4;
  vec2 q = uv + vec2(w * 0.0042 * s, 0.0);
  vec3 p = vec3((q.x * 2.0 - 1.0) * uTan.x, (q.y * 2.0 - 1.0) * uTan.y, -1.0) * z;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const LAYER_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap, uFx; uniform float uTime, uShimmer, uLayer, uFxOn, uLight, uRipple; uniform vec3 uPaperTone;
in vec2 vUv; out vec4 fragColor;
void main() {
  vec2 uv = vUv;
  if (uShimmer > 0.0) {   // the surface seen from below: its light moves
    float k = smoothstep(uShimmer, uShimmer + 0.12, uv.y);
    uv.x += (sin(uv.y * 90.0 + uTime * 0.9) * 0.0016 + sin(uv.y * 37.0 - uTime * 0.55 + uv.x * 20.0) * 0.0012) * k;
    uv.y += sin(uv.x * 60.0 + uTime * 0.7) * 0.0008 * k;
  }
  float rays = 0.0;
  if (uFxOn > 0.5) {
    vec4 f = texture(uFx, vUv);
    float mine = 1.0 - step(0.5, abs(f.b * 255.0 / 32.0 - uLayer));
    float rip = f.r * mine * uRipple;
    if (rip > 0.001) {   // water: its lines undulate a little
      uv.y += (sin(uv.x * 420.0 + uTime * 1.3) * 0.5 + sin(uv.x * 170.0 - uTime * 0.8 + uv.y * 300.0) * 0.5) * 0.00045 * rip;
      uv.x += sin(uv.y * 900.0 + uTime * 0.9) * 0.0008 * rip;
    }
    rays = f.g * mine * uLight;
  }
  vec4 c = texture(uMap, uv);
  if (c.a < 0.01) discard;
  if (rays > 0.001) {   // light in the water: soft lighter bands drift across the drawn rays
    float x = uv.x + uv.y * 0.12;
    float b = 0.5 + 0.5 * sin(x * 36.0 + uTime * 0.32 + sin(x * 8.0 - uTime * 0.19) * 1.8);
    c.rgb = mix(c.rgb, uPaperTone, smoothstep(0.55, 1.0, b) * rays * 0.6);
  }
  fragColor = vec4(c.rgb, c.a);
}`;

/* ---------- a cut-out: a flat card at its depth, its tail or wings moving ---------- */
const SPRITE_VERT = /* glsl */ `
uniform float uTime, uWiggle, uFlap, uPhase, uTailRight;
out vec2 vUv;
void main() {
  vec3 p = position;
  float tail = pow(clamp(uTailRight > 0.5 ? uv.x : 1.0 - uv.x, 0.0, 1.0), 2.0);
  p.y += sin(uTime * 7.0 + uPhase - uv.x * 3.0) * tail * uWiggle;
  float wing = abs(uv.y - 0.5) * 2.0;
  p.y += sin(uTime * 1.6 + uPhase) * wing * wing * uFlap * sign(uv.y - 0.5);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const SPRITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap; in vec2 vUv; out vec4 fragColor;
void main() { vec4 c = texture(uMap, vUv); if (c.a < 0.01) discard; fragColor = c; }`;

/* ---------- marine snow and bubbles ---------- */
const MOTE_VERT = /* glsl */ `
uniform float uTime, uScale, uRise, uStart, uRiseH, uSize;
in vec4 seed;
out float vA; out float vRing;
void main() {
  vec3 p = position;
  float t = uTime * (0.06 + seed.x * 0.08);
  if (uStart > -50.0) {   // a burst: every bubble leaves at once and rises fast
    float age = max(0.0, uTime - uStart);
    p.y += age * (0.9 + seed.y * 1.4) + age * age * 0.4;
  } else {
    p.y += uRise > 0.5 ? mod(uTime * (0.25 + seed.y * 0.3) * uRiseH / 9.0 + seed.z * uRiseH, uRiseH) : -mod(t + seed.z * 6.0, 6.0) + 3.0;
  }
  p.x += sin(uTime * (0.3 + seed.w) + seed.z * 6.28) * (uRise > 0.5 ? 0.06 * uRiseH / 9.0 : 0.15);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * uSize * (uRise > 0.5 ? (5.0 + seed.y * 6.0) : (1.4 + seed.y * 1.6)) / max(0.3, -mv.z) * 3.0;
  vA = (uRise > 0.5 ? 0.8 : 0.35 + seed.w * 0.4) * smoothstep(0.4, 1.2, -mv.z);
  vRing = uRise;
}`;
const MOTE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk; in float vA; in float vRing; out vec4 fragColor;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = vRing > 0.5 ? smoothstep(0.5, 0.42, r) - smoothstep(0.36, 0.28, r) : smoothstep(0.5, 0.25, r);
  if (a * vA < 0.02) discard;
  fragColor = vec4(uInk, a * vA);
}`;

/* ---------- the print: ink on paper, the waterline, the whip, the develop ---------- */
const POST_VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D tA, tB, uPaper; uniform vec2 uRes, uBlur; uniform float uDpr, uTime, uLine, uPaperAmt, uAppear, uPaperOn;
uniform vec3 uInk, uGround;
${GLSL_COMMON}
vec3 look(vec3 c) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = clamp((1.0 - l - 0.06) / 0.88, 0.0, 1.0);          // how much ink this pixel holds
  return mix(uGround, uInk, k);
}
void main() {
  vec2 p = vUv * uRes / uDpr;
  vec3 a = texture(tA, vUv).rgb;
  if (length(uBlur) > 0.5) {   // a whip: the turn smears the picture, as a fast camera would
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 15; i++) acc += texture(tA, vUv + (float(i) / 14.0 - 0.5) * uBlur / uRes).rgb;
    a = acc / 15.0;
  }
  vec3 col = look(a);
  if (uLine > -0.5) {
    // going under: below the waterline the next scene, above it this one; the line itself is drawn
    float x = vUv.x;
    float edge = uLine + sin(x * 11.0 + uTime * 2.6) * 0.012 + sin(x * 29.0 - uTime * 4.1) * 0.006;
    vec3 b = look(texture(tB, vUv).rgb);
    float below = step(vUv.y, edge);
    col = mix(col, b, below);
    float dist = abs(vUv.y - edge) * uRes.y / uDpr;
    float band = 1.0 - smoothstep(10.0, 22.0, dist);
    float lines = smoothstep(0.55, 0.85, abs(fract((vUv.y - edge) * uRes.y / uDpr / 3.2) - 0.5) * 2.0);
    float glint = step(0.62, vnoise(vec2(x * 90.0 + uTime, floor((vUv.y - edge) * uRes.y / uDpr / 3.2))));
    col = mix(col, mix(uGround, uInk, lines * (1.0 - glint) * 0.85), band);
    col = mix(col, uInk, (1.0 - smoothstep(0.6, 1.4, dist)) * 0.9);
  }
  if (uAppear < 0.999) {
    // arriving (or leaving): the drawing develops in dot by dot and patch by patch, never a fade
    float th = hash12(floor(gl_FragCoord.xy) + 0.71) * 0.55 + vnoise(p * 0.0045 + 4.2) * 0.45;
    col = mix(uGround, col, step(th, uAppear * 1.1));
  }
  if (uPaperOn > 0.5) {
    vec4 t = texture(uPaper, p / 600.0);
    col *= mix(vec3(1.0), t.rgb, t.a * uPaperAmt);
  }
  fragColor = vec4(col, 1.0);
}`;

/* the camera's pose at time t inside a scene: smooth through the keys */
function poseAt(plan, t) {
  const K = plan.keys;
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1] || K[i];
  const r = Math.min(1, Math.max(0, (t - a.t) / Math.max(0.001, b.t - a.t)));
  const k = b.ease === "in" ? r * r : b.ease === "out" ? 1 - (1 - r) * (1 - r) : smooth(r); // a whip runs at full speed through the cut
  const lerp = (x, y) => x + (y - x) * k;
  return { pos: a.pos.map((v, j) => lerp(v, b.pos[j])), yaw: lerp(a.yaw, b.yaw), pitch: lerp(a.pitch, b.pitch), zoom: lerp(a.zoom ?? 1, b.zoom ?? 1) };
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);
  const aborter = new AbortController();
  let destroyed = false;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;background:${v["look.ground"]}`;
  host.append(canvas);

  let gl;
  try {
    gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  } catch {
    return { update(nv) { Object.assign(v, nv); canvas.style.background = v["look.ground"]; }, action() {}, destroy() { canvas.remove(); } };
  }
  gl.outputColorSpace = THREE.LinearSRGBColorSpace; // the shaders work in display values, as the hexes are written
  gl.setClearColor(new THREE.Color(...rgb(v["look.ground"]).toArray()), 1);

  const owned = { textures: new Set(), materials: new Set(), geometries: new Set(), bitmaps: new Set() };
  const keep = (kind, x) => (owned[kind].add(x), x);

  const shared = {
    time: { value: 0 }, sway: { value: v["life.sway"] }, depth: { value: v["flight.depth"] }, dpr: { value: 1 },
    ink: { value: rgb(v["look.ink"]) }, splashAt: { value: -100 }, light: { value: v["life.light"] }, ripple: { value: 1 },
  };
  const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
  const rtA = new THREE.WebGLRenderTarget(1, 1);
  const rtB = new THREE.WebGLRenderTarget(1, 1);

  const postUniforms = {
    tA: { value: rtA.texture }, tB: { value: rtB.texture }, uPaper: { value: null }, uPaperOn: { value: 0 },
    uRes: { value: new THREE.Vector2() }, uDpr: { value: 1 }, uTime: shared.time, uLine: { value: -1 }, uBlur: { value: new THREE.Vector2() },
    uPaperAmt: { value: v["look.paper"] }, uAppear: { value: 0 }, uInk: shared.ink, uGround: { value: rgb(v["look.ground"]) },
  };
  const postMat = keep("materials", new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms: postUniforms, depthTest: false, depthWrite: false }));
  const postGeo = keep("geometries", new THREE.PlaneGeometry(2, 2));
  const postScene = new THREE.Scene();
  postScene.add(new THREE.Mesh(postGeo, postMat));
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* ---------- loading: pictures are decoded off the main thread ---------- */
  const fetchBlob = async (url) => {
    const r = await fetch(url, { signal: aborter.signal });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.blob();
  };
  const bitmapOf = async (blob, size) => {
    const o = { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" };
    if (size) Object.assign(o, { resizeWidth: Math.max(1, Math.round(size[0])), resizeHeight: Math.max(1, Math.round(size[1])), resizeQuality: "high" });
    return keep("bitmaps", await createImageBitmap(blob, o));
  };
  const texOf = (bmp, { nearest = false, mips = false, repeat = false } = {}) => {
    const t = keep("textures", new THREE.Texture(bmp));
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    t.minFilter = nearest ? THREE.NearestFilter : mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.generateMipmaps = mips;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (mips) t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  const tex = async (url, opts, size) => texOf(await bitmapOf(await fetchBlob(url), size), opts);

  function points(n, place, order) {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = place(i);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
    }
    const g = keep("geometries", new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seed, 4));
    const m = keep("materials", new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, glslVersion: THREE.GLSL3, transparent: true, depthWrite: false,
      uniforms: { uRise: { value: 0 }, uStart: { value: -100 }, uRiseH: { value: 9 }, uSize: { value: 1 }, uTime: shared.time, uScale: shared.dpr, uInk: shared.ink },
    }));
    const p = new THREE.Points(g, m);
    p.renderOrder = order;
    p.frustumCulled = false;
    return p;
  }

  async function buildScene(plan, devW) {
    const base = `${BASE}${plan.scene}/`;
    const meta = await (await fetch(`${base}meta.json`, { signal: aborter.signal })).json();
    const group = new THREE.Group();
    const W = meta.fullWidth, H = meta.fullHeight;
    const tanX = Math.tan((meta.fov * rad) / 2) * (W / meta.width);
    const tanY = Math.tan((meta.fov * rad) / 2) * (H / meta.width);
    // the pictures at the size this canvas can show (about one texel a device pixel), never larger than shipped
    const k = Math.min(meta.scale ?? 1, Math.max(0.35, (devW * 1.25) / meta.width));
    const shrink = k < (meta.scale ?? 1) - 0.02 ? [W * k, H * k] : null;
    const [sway, fx] = await Promise.all([
      tex(`${base}sway.png`, { nearest: true }),
      meta.fx ? tex(`${base}fx.png`) : Promise.resolve(null),
    ]);
    const [segX, segY] = meta.segments ?? [Math.round(W / 8), Math.round(H / 8)];
    const geo = keep("geometries", new THREE.PlaneGeometry(1, 1, segX, segY));
    geo.translate(0.5, 0.5, 0);
    const layers = await Promise.all(meta.layers.map(async (L, i) => {
      const [map, depth] = await Promise.all([tex(base + L.file, {}, shrink), tex(base + L.depth, { nearest: true })]);
      const m = keep("materials", new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: LAYER_VERT, fragmentShader: LAYER_FRAG, transparent: true, depthWrite: true, depthTest: true, side: THREE.DoubleSide,
        uniforms: {
          uMap: { value: map }, uFx: { value: fx }, uFxOn: { value: fx ? 1 : 0 }, uShimmer: { value: i === 0 && plan.shimmer ? plan.shimmer : 0 },
          uDepth: { value: depth }, uSway: { value: sway }, uLayer: { value: i }, uTan: { value: new THREE.Vector2(tanX, tanY) },
          uZn: { value: plan.zn }, uZf: { value: plan.zf }, uGamma: { value: plan.gamma }, uTime: shared.time, uSwayAmp: shared.sway, uDepthAmt: shared.depth,
          uLight: shared.light, uRipple: shared.ripple, uPaperTone: { value: new THREE.Vector3(0.975, 0.962, 0.925) },
        },
      }));
      const mesh = new THREE.Mesh(geo, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = i;
      group.add(mesh);
      return mesh;
    }));
    // what moves on its own card: fish, the sailboat, the gulls
    const zOf = (d) => 1 / (Math.pow(d, plan.gamma) * (1 / plan.zn - 1 / plan.zf) + 1 / plan.zf);
    const at = (px, py, d) => {
      const z = zOf(d), u = (meta.pad[0] + px) / W, vv = 1 - (meta.pad[1] + py) / H;
      return [(u * 2 - 1) * tanX * z, (vv * 2 - 1) * tanY * z, -z];
    };
    const sprites = await Promise.all(meta.sprites.map(async (s, i) => {
      const map = await tex(base + s.file, {});
      const z = zOf(s.disp);
      const cx = (meta.pad[0] + s.x + s.w / 2) / W, cy = 1 - (meta.pad[1] + s.y + s.h / 2) / H;
      const w = (s.w / W) * 2 * tanX * z, h = (s.h / H) * 2 * tanY * z;
      const g = keep("geometries", new THREE.PlaneGeometry(1, 1, 24, 6));
      const mo = s.motion || {};
      const fish = /^fish/.test(s.name), bird = /^gull/.test(s.name);
      const m = keep("materials", new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
        uniforms: { uMap: { value: map }, uTime: shared.time, uWiggle: { value: fish ? 0.035 : 0 }, uFlap: { value: bird ? 0.05 : 0 }, uPhase: { value: i * 1.7 }, uTailRight: { value: (mo.face || 1) < 0 ? 1 : 0 } },
      }));
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 50;
      mesh.scale.set(w, h, 1);
      const home = new THREE.Vector3((cx * 2 - 1) * tanX * z, (cy * 2 - 1) * tanY * z, -z);
      mesh.position.copy(home);
      group.add(mesh);
      return { mesh, home, z, w, h, i, mo, unit: (2 * tanX * z) / W };
    }));
    // marine snow and bubbles, under water only
    let snow = null;
    const bubbles = [];
    if (plan.under) {
      const N = plan.snow ?? 1600;
      snow = points(N, () => {
        const z = 0.6 + Math.pow(Math.random(), 1.6) * 16;
        return [(Math.random() * 2 - 1) * tanX * z * 1.2, (Math.random() * 2 - 1) * tanY * z * 0.9, -z];
      }, 60);
      group.add(snow);
      for (const b of plan.bubbles || []) {
        // a column rising from a point in the picture
        const [x, y, z] = at(b.px, b.py, b.d), u = (2 * tanX * zOf(b.d)) / W;
        const p = points(b.n, () => [x + (Math.random() - 0.5) * b.spread * u, y, z + (Math.random() - 0.5) * 0.05], 61);
        Object.assign(p.material.uniforms, { uRise: { value: 1 }, uRiseH: { value: b.rise * u }, uSize: { value: 0.55 } });
        group.add(p);
        bubbles.push(p);
      }
      if (plan.splash) {
        // going under: a burst of bubbles in front of the camera
        const sp = points(140, () => {
          const z = 0.5 + Math.random() * 3.5;
          return [(Math.random() * 2 - 1) * tanX * z * 0.8, (Math.random() * 1.6 - 1.1) * tanY * z * 0.6 + 0.2, -z];
        }, 62);
        Object.assign(sp.material.uniforms, { uRise: { value: 1 }, uStart: shared.splashAt });
        group.add(sp);
      }
    }
    const scene = new THREE.Scene();
    scene.add(group);
    const textures = [sway, fx, ...layers.flatMap((m) => [m.material.uniforms.uMap.value, m.material.uniforms.uDepth.value]), ...sprites.map((sp) => sp.mesh.material.uniforms.uMap.value)].filter(Boolean);
    return { plan, meta, scene, layers, sprites, snow, bubbles, textures };
  }

  /* ---------- size ---------- */
  let W = 1, H = 1, DPR = 1;
  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    gl.setPixelRatio(DPR);
    gl.setSize(Math.round(W), Math.round(H), false);
    const pw = Math.max(1, Math.round(W * DPR)), ph = Math.max(1, Math.round(H * DPR));
    rtA.setSize(pw, ph);
    rtB.setSize(pw, ph);
    postUniforms.uRes.value.set(pw, ph);
    postUniforms.uDpr.value = DPR;
    shared.dpr.value = DPR;
  }
  resize();

  /* ---------- the flight ---------- */
  const scenes = new Array(PLAN.length).fill(null);
  let ready = false;
  const flight = { u: still ? 1 : 0 };
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  let raf = 0, last = performance.now(), tAll = 0, born = null, introZoom = 1, active = performance.now(), skip = false;
  let rest = 0, outro = null;
  let onScreen = true, tabVisible = !document.hidden;
  const splashT = (PLAN.find((p) => p.splash)?.from ?? 1e9) - 0.6;

  // how far the flight may go: up to the first scene still loading (and its waterline, a second before)
  const reach = () => {
    const missing = scenes.findIndex((s) => !s);
    if (missing < 0) return 1;
    const prev = PLAN[missing - 1];
    return Math.max(0, (PLAN[missing].from - (prev?.waterline ? 1.2 : 0.05)) / TOTAL);
  };
  const sceneAt = (t) => {
    for (let i = 0; i < PLAN.length; i++) if (scenes[i] && t >= PLAN[i].from && t <= PLAN[i].to) return scenes[i];
    return scenes.filter(Boolean).pop();
  };

  function placeCamera(sc, t) {
    const p = poseAt(sc.plan, t);
    // the viewport sees the picture's full width (on tall screens its full height), narrowed by the zoom
    const viewAsp = W / H, picAsp = sc.meta.width / sc.meta.height;
    const tanHalfX = Math.tan((sc.meta.fov * rad) / 2) / (p.zoom * introZoom);
    const tanHalfY = viewAsp >= picAsp ? tanHalfX / viewAsp : tanHalfX / picAsp;
    cam.fov = (2 * Math.atan(tanHalfY)) / rad;
    cam.aspect = viewAsp;
    cam.updateProjectionMatrix();
    cam.position.set(p.pos[0], p.pos[1], p.pos[2]);
    // never turn far enough to see the mirrored margins: a turn may use a quarter of them, the rest is for parallax
    const m = sc.meta, tf = Math.tan((m.fov * rad) / 2);
    const tX = (tf * (m.width + m.pad[0] * 0.25)) / m.width, tY = (tf * (m.height + m.pad[1] * 0.25)) / m.width;
    const maxPitch = Math.max(0, Math.atan(tY) / rad - Math.atan(tanHalfY) / rad);
    const maxYaw = Math.max(0, Math.atan(tX) / rad - Math.atan(tanHalfY * viewAsp) / rad);
    const pitch = Math.max(-maxPitch, Math.min(maxPitch, p.pitch - look.y * 1.6));
    const yaw = Math.max(-maxYaw, Math.min(maxYaw, p.yaw + look.x * 2.2));
    cam.rotation.order = "YXZ";
    cam.rotation.set(pitch * rad, -yaw * rad, 0);
    cam.updateMatrixWorld();
  }

  /* fish patrol and turn (on the clock, so they keep going at rest); boats and birds drift (on the flight) */
  function swim(sc, t) {
    const lt = t - sc.plan.from, sw = v["life.swim"];
    for (const s of sc.sprites) {
      const mo = s.mo, m = s.mesh;
      const face = mo.face || 1, ph = s.i * 2.3;
      let x = s.home.x, dir = face;
      const y = s.home.y + Math.sin(tAll * 0.9 + ph) * (mo.bob || 0) * s.unit;
      if (mo.kind === "patrol") {
        const a = (tAll / (mo.period || 20)) * Math.PI * 2 + ph;
        x += Math.sin(a) * (mo.range || 60) * s.unit * sw;
        // facing follows the way it swims; it flattens as it turns
        dir = sw > 0 ? Math.max(-1, Math.min(1, Math.cos(a) * 4)) || face : face;
      } else if (mo.kind === "drift") {
        x += lt * (mo.speed || 0) * s.unit * sw;
      }
      m.position.set(x, y, s.home.z);
      m.scale.x = s.w * (mo.kind === "patrol" ? dir * face : 1);
      m.rotation.z = (mo.rock || 0) * rad * Math.sin(tAll * 0.8 + ph);
    }
  }

  function render() {
    const t = flight.u * TOTAL;
    const sc = sceneAt(t);
    if (!sc) return;
    shared.time.value = tAll;
    // the splash: bubbles leave as the camera goes under (in flight time, so it shows the same at any speed)
    shared.splashAt.value = tAll - Math.max(0, t - splashT);
    placeCamera(sc, t);
    swim(sc, t);
    gl.setRenderTarget(rtA);
    gl.clear();
    gl.render(sc.scene, cam);
    // going under: the next scene shows below a waterline that rises over the last second of this one
    const next = scenes[PLAN.indexOf(sc.plan) + 1];
    let line = -1;
    if (next && sc.plan.waterline && t > sc.plan.to - 1.1) {
      const k = (t - (sc.plan.to - 1.1)) / 1.1;
      line = smooth(Math.min(1, k)) * 1.15 - 0.05;
      placeCamera(next, next.plan.from);
      swim(next, next.plan.from);
      gl.setRenderTarget(rtB);
      gl.clear();
      gl.render(next.scene, cam);
      placeCamera(sc, t);
    }
    // turn speed, in screen pixels per frame, sets the blur (from the planned move, so a whip blurs even where the turn is held at the edge)
    const flying = !still && outro == null && flight.u < reach() && flight.u < 1;
    const q1 = poseAt(sc.plan, Math.min(sc.plan.to, t + 1 / 60)), q0 = poseAt(sc.plan, t);
    const pxPerDeg = (H * DPR) / cam.fov, on = flying ? v["flight.speed"] : 0;
    postUniforms.uBlur.value.set(Math.min(140, Math.abs(q1.yaw - q0.yaw) * pxPerDeg * 0.9 * on), Math.min(140, Math.abs(q1.pitch - q0.pitch) * pxPerDeg * 0.9 * on));
    postUniforms.uLine.value = line;
    gl.setRenderTarget(null);
    gl.render(postScene, postCam);
  }

  function frame(now) {
    raf = 0;
    if (!ready || destroyed) return;
    // left alone at rest (no pointer, no flight), the drift draws every other frame: slow enough not to show
    const arriving = born != null && now - born < INTRO * 1800;
    const flying = flight.u < Math.min(1, reach());
    const idle = now - active > 700 && !arriving && !flying && outro == null;
    if (idle && (skip = !skip)) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (born == null) born = now;
    const age = (now - born) / 1000;
    tAll += dt;
    if (outro != null) {
      // looping: the reef dissolves into the paper, then the city develops in
      outro += dt;
      postUniforms.uAppear.value = 1 - smooth(Math.min(1, outro / OUTRO));
      if (outro >= OUTRO) {
        outro = null;
        rest = 0;
        flight.u = 0;
        born = now;
        postUniforms.uAppear.value = 0;
      }
    } else {
      postUniforms.uAppear.value = smooth(Math.min(1, age / INTRO));
      introZoom = 1 - 0.06 * Math.pow(1 - Math.min(1, age / (INTRO * 1.8)), 3);
      if (flying) flight.u = Math.min(reach(), flight.u + (dt / TOTAL) * v["flight.speed"]);
      else if (flight.u >= 1 && v["flight.loop"]) {
        rest += dt;
        if (rest > REST) outro = 0;
      }
    }
    look.x += (look.tx - look.x) * 0.05;
    look.y += (look.ty - look.y) * 0.05;
    render();
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    const run = !still && ready && onScreen && tabVisible && !destroyed;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  const drawStill = () => {
    if (!still || !ready || destroyed) return;
    postUniforms.uAppear.value = 1;
    flight.u = Math.min(1, reach());
    render();
  };

  function applyValues() {
    shared.sway.value = v["life.sway"];
    shared.depth.value = v["flight.depth"];
    shared.light.value = v["life.light"];
    shared.ink.value = rgb(v["look.ink"]);
    postUniforms.uGround.value = rgb(v["look.ground"]);
    postUniforms.uPaperAmt.value = v["look.paper"];
    gl.setClearColor(new THREE.Color(...rgb(v["look.ground"]).toArray()), 1);
    canvas.style.background = v["look.ground"];
  }
  applyValues();

  /* ---------- go: the city first, so the flight can start while the rest arrive ---------- */
  const devW = W * DPR;
  const frameGap = () => new Promise((res) => requestAnimationFrame(() => res()));
  (async () => {
    const paper = tex(`${BASE}paper.webp`, { mips: true, repeat: true }).then((t) => {
      if (destroyed) return;
      postUniforms.uPaper.value = t;
      postUniforms.uPaperOn.value = 1;
      gl.initTexture(t);
      drawStill();
    }).catch(() => {});
    // the city has the line to itself; the rest start once its pictures are in
    const builds = [buildScene(PLAN[0], devW)];
    builds[0].catch(() => {}).finally(() => {
      for (let i = 1; i < PLAN.length; i++) builds[i] = buildScene(PLAN[i], devW);
    });
    for (let i = 0; i < PLAN.length; i++) {
      try {
        if (i > 0) await builds[0].catch(() => {});
        const sc = await builds[i];
        if (destroyed) return;
        try { await gl.compileAsync(sc.scene, cam); } catch { /* compiled on first draw */ }
        // each picture goes up to the GPU on a frame of its own, so loading never freezes the page
        for (const t of sc.textures) {
          if (destroyed) return;
          gl.initTexture(t);
          await frameGap();
        }
        scenes[i] = sc;
        if (i === 0) {
          try { await gl.compileAsync(postScene, postCam); } catch { /* compiled on first draw */ }
          ready = true;
          sync();
        }
        drawStill();
      } catch (e) {
        if (destroyed || e?.name === "AbortError") return;
        console.warn("ink-world: scene missing", PLAN[i].scene, e);
        return;
      }
    }
    await paper;
  })();

  /* ---------- listening ---------- */
  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    look.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    look.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    active = performance.now();
  };
  const onLeave = () => {
    look.tx = 0;
    look.ty = 0;
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  const ro = new ResizeObserver(() => {
    resize();
    drawStill();
  });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    sync();
  });
  io.observe(host);
  const onVis = () => {
    tabVisible = !document.hidden;
    sync();
  };
  document.addEventListener("visibilitychange", onVis);

  return {
    update(nv) {
      Object.assign(v, nv);
      applyValues();
      active = performance.now();
      if (!v["flight.loop"]) rest = 0;
      drawStill();
    },
    action(name) {
      if (name !== "flyAgain" || still) return;
      outro = null;
      rest = 0;
      flight.u = 0;
      born = performance.now();
      active = born;
    },
    destroy() {
      destroyed = true;
      aborter.abort();
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      for (const t of owned.textures) t.dispose();
      for (const m of owned.materials) m.dispose();
      for (const g of owned.geometries) g.dispose();
      for (const b of owned.bitmaps) b.close?.();
      rtA.dispose();
      rtB.dispose();
      gl.dispose();
      gl.forceContextLoss();
      canvas.remove();
    },
  };
}
