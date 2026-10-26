/* Hatch shadow (exe).

   exe's illustrative drop shadow (their guidelines 5.4), drawn live. Each
   element on the desk casts a soft shadow, offset away from a lamp and
   blurred by its height, like a box-shadow; that softness is then rendered
   as grain: Primary's own cross-hatch scan, mixed with single-pixel dust and
   used as a threshold, so the shadow is dense at the edge and dissolves into
   the paper grain by grain. While an element works its shadow runs round it:
   the thinking state. Orbit swings the whole shadow round, as if the lamp
   circled it; chase sends a dense patch round its edge. Here the desk's
   pieces take turns thinking, and a click sets one going.

   Ported from clients/exe/prototypes/01-Hatch-shadow.html (its pen shader,
   shadow field and thinking verbatim, in raw WebGL2 rather than three.js).
   The desk is exe's components with their copy taken out: a terminal, a VM
   card, two buttons and a disc where their mark sat. The scans are
   media/play/hatch-shadow/grain-*.webp (512 square crops of the 700 square
   originals; they mirror-repeat) and paper.webp. */

const STYLES = ["Primary grain", "Light grain", "Charcoal", "Sketched strokes", "Engraved", "Stipple"];
// exe's brand palette by Primary's names, as the prototype's look menus had it
const GROUNDS = ["#F7F4EF", "#EAE5DF", "#FFF7D6", "#BFDFC7", "#CFE5EE", "#FFCE98", "#EED0D0"];
const INKS = ["#282624", "#6E6860", "#304438", "#3A6776", "#9E5C00", "#5D3636"];

export const params = {
  shadow: {
    style: { type: "select", options: STYLES },
    blur: [4.5, 0, 40, 0.5],
    density: [0.74, 0.2, 3, 0.01],
  },
  light: {
    lamp: { type: "select", options: ["Follows pointer", "Orbits", "At rest"] },
    angle: [42, 0, 360, 1],
  },
  thinking: {
    style: { type: "select", options: ["Orbit", "Chase", "Orbit and chase"] },
    lap: [2.2, 0.6, 8, 0.1],
    reach: [16, 0, 48, 1],
  },
  colour: {
    ground: { type: "color", default: GROUNDS[0], options: GROUNDS },
    ink: { type: "color", default: INKS[0], options: INKS },
  },
};

const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const asset = (f) => new URL(`media/play/hatch-shadow/${f}`, ROOT).href;
const GRAIN_PX = 512; // the scans' size: one texel per 0.7 device px, as the prototype's 700 square

// the prototype's tuned shadow and pen; the dials above reach the rest
const S = {
  lampHeight: 1000, maxOffset: 24, blurGrowth: 0.25, spread: -2, spreadGrowth: 0.05, shorten: 7, near: 0.55, far: 0.95, curve: 1, gamma: 1,
  grainScale: 0.7, dust: 0.25, dustSize: 0.5, grainSoftness: 0, inkAlpha: 1, charcoal: 1.3,
  cell: 7, length: 24, width: 0.9, angleDeg: 38, cross: 82, crossShare: 0.55, jitter: 14, buildUp: 0.62,
  spacing: 4.2, weight: 2.2, wobble: 1.2, breaks: 0.08, dot: 4.5, drawIn: 900, lift: 1, paper: 0.15,
};
const T = { tail: 0.5, rest: 0.25, head: 0.9, lift: 6, hold: 3.6, gap: 2.2 };
const HMAX = 80, FS = 0.5;
const rad = Math.PI / 180, TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (k) => k * k * (3 - 2 * k);
const wrap = (a, m = TAU) => ((a % m) + m) % m;

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = v;
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`;
const PEN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uField, uGrainDense, uGrainLight; uniform vec2 uRes; uniform float uDpr, uGrainPx;
uniform vec3 uGround, uInk; uniform float uInkAlpha; uniform int uStyle;
uniform float uSeed, uThinkSeed, uBoil, uDrawIn, uGain, uGamma, uGrainScale, uGrainSoft, uDust, uDustSize, uCharcoal;
uniform float uCell, uLen, uWidth, uAngle1, uAngle2, uCrossShare, uJitter, uBuild;
uniform float uSpacing, uWeight, uWobble, uBreaks, uDot;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 hash42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(.1031, .1030, .0973, .1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float tone(float r) { return clamp(pow(r, uGamma) * uGain, 0.0, 1.0) * uDrawIn; }
float D(vec2 p) { return tone(texture(uField, p / uRes).r); }
// the sum of two even random values is a trapezoid; bending it back to even keeps coverage exact
float evenMix(float a, float b, float k) {
  float lo = min(k, 1.0 - k), hi = 1.0 - lo, s = mix(a, b, k);
  if (lo < 0.001) return s;
  if (s < lo) return s * s / (2.0 * lo * hi);
  if (s > hi) return 1.0 - (1.0 - s) * (1.0 - s) / (2.0 * lo * hi);
  return (s - lo * 0.5) / hi;
}
// Primary's grain: their scan, mixed with dust, used as a threshold; four samples per pixel
float scanned(vec2 p, sampler2D grain) {
  vec2 f = texture(uField, p / uRes).rg;
  float cover = tone(f.r);
  if (cover < 0.002) return 0.0;
  float seed = f.g > 0.02 ? uThinkSeed : uSeed;
  vec2 shift = seed > 0.0 ? hash42(vec2(seed, 3.7)).xy : vec2(0.0);
  float ink = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 q = gl_FragCoord.xy + vec2(float(i & 1), float(i >> 1)) * 0.5 - 0.25;
    float scan = texture(grain, q / (uGrainPx * uGrainScale) + shift).r;
    float dust = hash12(floor(q / uDustSize) + seed * 17.0);
    ink += smoothstep(1.0 - cover - uGrainSoft, 1.0 - cover + uGrainSoft + 0.0001, evenMix(scan, dust, uDust));
  }
  return ink * 0.25;
}
// a procedural charcoal: fine dots, short scratches and clumps
float charcoal(vec2 p) {
  float cover = D(p);
  if (cover < 0.002) return 0.0;
  vec2 dp = gl_FragCoord.xy / uCharcoal;
  float dots = hash12(floor(dp) + uSeed * 17.0);
  vec2 rp = mat2(0.62, -0.78, 0.78, 0.62) * dp;
  float scr = vnoise(rp * vec2(0.24, 1.5) + uSeed * 3.1);
  float clump = vnoise(dp / 20.0 + 11.0);
  float v = mix(dots, scr, 0.42) + (clump - 0.5) * 0.3;
  return smoothstep(1.0 - cover - 0.01, 1.0 - cover + 0.01, v);
}
float sketched(vec2 p) {
  float ink = 0.0;
  vec2 cell = floor(p / uCell);
  int R = int(ceil(uLen * 0.5 / uCell));
  float aa = 0.8 / uDpr;
  for (int j = -5; j <= 5; j++) for (int i = -5; i <= 5; i++) {
    if (abs(i) > R || abs(j) > R) continue;
    vec2 c = cell + vec2(i, j);
    for (int k = 0; k < 3; k++) {
      vec4 r = hash42(c * 1.37 + float(k) * 19.19);
      vec4 b = hash42(c * 2.11 + float(k) * 7.7 + uSeed) - 0.5;
      vec2 ctr = (c + r.xy) * uCell + b.xy * uBoil;
      float tn = D(ctr);
      // no shadow, no stroke (the prototype let a hash of exactly zero through, so strays dotted the paper)
      if (tn < 0.002 || r.z > tn) continue;
      bool crossed = r.z < tn * uCrossShare && tn > 0.3;
      float ang = (crossed ? uAngle2 : uAngle1) + (r.w - 0.5) * uJitter + b.z * 0.06 * uBoil;
      vec2 d = vec2(cos(ang), sin(ang));
      float len = uLen * mix(0.45, 1.0, fract(r.w * 7.31 + r.x));
      vec2 pa = p - ctr;
      float along = dot(pa, d), half_ = len * 0.5;
      if (abs(along) > half_) continue;
      float across = abs(dot(pa, vec2(-d.y, d.x)) - sin(along / half_ * 1.5708) * b.w * 0.6);
      float w = uWidth * (0.55 + 0.7 * fract(r.y * 13.7)) * (1.0 - pow(abs(along) / half_, 4.0));
      ink = 1.0 - (1.0 - ink) * (1.0 - (1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, across)) * uBuild);
    }
  }
  return ink;
}
float engraved(vec2 p) {
  float tn = D(p);
  if (tn < 0.003) return 0.0;
  float ink = 0.0, aa = 0.8 / uDpr;
  for (int L = 0; L < 3; L++) {
    float th = L == 0 ? 0.0 : (L == 1 ? 0.42 : 0.74);
    if (tn <= th) break;
    float ang = L == 0 ? uAngle1 : (L == 1 ? uAngle2 : uAngle1 + 0.785);
    vec2 d = vec2(cos(ang), sin(ang)), n = vec2(-d.y, d.x);
    float along = dot(p, d), acr = dot(p, n), id = floor(acr / uSpacing);
    float wob = (vnoise(vec2(along * 0.016, id * 3.1 + float(L) * 11.0 + uSeed * 0.37)) - 0.5) * uWobble;
    float f = abs(fract((acr + wob) / uSpacing) - 0.5) * uSpacing;
    float w = mix(0.25, uWeight, clamp((tn - th) / (1.0 - th), 0.0, 1.0)) * 0.5;
    float brk = step(uBreaks, vnoise(vec2(along * 0.045, id * 7.7 + float(L) * 5.0 + uSeed * 0.21)));
    ink = 1.0 - (1.0 - ink) * (1.0 - (1.0 - smoothstep(w - aa, w + aa, f)) * brk);
  }
  return ink;
}
float stippled(vec2 p) {
  float ink = 0.0; vec2 cell = floor(p / uDot); float aa = 0.8 / uDpr;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(i, j);
    vec4 r = hash42(c * 1.91);
    vec4 b = hash42(c * 3.7 + uSeed) - 0.5;
    vec2 ctr = (c + 0.15 + r.xy * 0.7) * uDot + b.xy * uBoil * 0.5;
    float tn = D(ctr);
    if (tn < 0.002 || r.z > pow(tn, 0.7)) continue;
    float rd = uDot * 0.24 * (0.65 + 0.6 * r.w);
    ink = max(ink, 1.0 - smoothstep(rd - aa, rd + aa, length(p - ctr)));
  }
  return ink;
}
void main() {
  vec2 p = vUv * uRes;
  float ink;
  if (uStyle == 0) ink = scanned(p, uGrainDense);
  else if (uStyle == 1) ink = scanned(p, uGrainLight);
  else if (uStyle == 2) ink = charcoal(p);
  else if (uStyle == 3) ink = sketched(p);
  else if (uStyle == 4) ink = engraved(p);
  else ink = stippled(p);
  fragColor = vec4(mix(uGround, uInk, ink * uInkAlpha), 1.0);
}`;

/* The desk: exe's components, their copy taken out. Bars stand in for the words. */
const CSS = `
.hs-layer { position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; }
.hs-desk { display: grid; grid-template-columns: 500px 300px; column-gap: 96px; row-gap: 48px; align-items: start; transform-origin: 50% 50%; }
.hs-layer.is-narrow .hs-desk { grid-template-columns: var(--hs-col, 340px); row-gap: 34px; }
.hs-desk > * { position: relative; }
.hs-disc { grid-column: 1; grid-row: 1; width: 84px; height: 84px; border-radius: 50%; background: #282624; justify-self: start; cursor: pointer; }
.hs-term { grid-column: 1; grid-row: 2 / span 2; height: 248px; background: #fff; box-shadow: inset 0 0 0 .5px #282624; cursor: pointer; }
.hs-vm { grid-column: 2; grid-row: 2; background: #fff; box-shadow: inset 0 0 0 .5px #282624; padding: 18px 20px 20px; cursor: pointer; }
.hs-acts { grid-column: 2; grid-row: 3; display: flex; flex-wrap: wrap; gap: 12px; }
.hs-layer.is-narrow :is(.hs-disc, .hs-term, .hs-vm, .hs-acts) { grid-column: 1; grid-row: auto; }
.hs-layer.is-narrow .hs-disc { width: 64px; height: 64px; }
.hs-layer.is-narrow .hs-term { height: 216px; }
.hs-head { display: flex; align-items: center; gap: 14px; height: 38px; padding: 0 14px; background: #F5F2EC; box-shadow: inset 0 -.5px 0 #282624, inset 0 0 0 .5px #282624; }
.hs-dots { display: inline-flex; gap: 6px; }
.hs-dots i { width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 0 0 .5px #282624; }
.hs-bar { display: block; height: 6px; border-radius: 1px; background: #6E6860; opacity: .55; }
.hs-body { padding: 18px 20px; display: grid; gap: 12px; }
.hs-line { display: flex; gap: 10px; align-items: center; transform-origin: 0 50%; transition: transform .35s cubic-bezier(.2,.7,.2,1), opacity .35s; }
.hs-line.is-hidden { transform: scaleX(0); opacity: 0; }
.hs-line .hs-bar { height: 7px; }
.hs-ink { background: #282624; opacity: .85; }
.hs-faint { background: #6E6860; opacity: .3; }
.hs-hl { background: #BFDFC7; opacity: 1; }
.hs-top { display: flex; align-items: center; gap: 8px; }
.hs-dot { width: 8px; height: 8px; border-radius: 50%; background: #0AAF44; box-shadow: inset 0 0 0 .5px #282624; transition: background-color .3s; }
.hs-vm.is-busy .hs-dot { background: transparent; }
.hs-title { height: 12px; width: 70%; margin: 16px 0 14px; }
.hs-specs { display: grid; grid-template-columns: repeat(2, 1fr); box-shadow: inset 0 .5px 0 #282624; padding-top: 10px; gap: 8px 0; }
.hs-specs .hs-bar:nth-child(odd) { width: 30px; height: 5px; }
.hs-specs .hs-bar:nth-child(even) { width: 54px; height: 8px; grid-row: 2; }
.hs-btn { height: 44px; display: inline-flex; align-items: center; gap: 12px; padding: 0 18px; cursor: pointer; }
.hs-primary { background: #282624; }
.hs-primary .hs-bar { width: 90px; height: 7px; background: #fff; opacity: .9; }
.hs-secondary { background: #EAE5DF; }
.hs-paper { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply; }
`;

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  parent?.append(n);
  return n;
}
const bar = (parent, width, cls = "") => {
  const b = el("span", `hs-bar ${cls}`, parent);
  if (width) b.style.width = `${width}px`;
  return b;
};

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);
  const style = el("style");
  style.textContent = CSS;
  host.append(style);
  host.style.background = v["colour.ground"];

  const canvas = el("canvas", "", host);
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";

  /* ---- the desk ---- */
  const layer = el("div", "hs-layer", host);
  layer.setAttribute("aria-hidden", "true");
  const desk = el("div", "hs-desk", layer);
  const disc = el("div", "hs-disc", desk);
  const term = el("div", "hs-term", desk);
  const head = el("div", "hs-head", term);
  const dots = el("span", "hs-dots", head);
  for (let i = 0; i < 3; i++) el("i", "", dots);
  bar(head, 170, "hs-faint");
  const body = el("div", "hs-body", term);
  // a session: a comment, a command, its answer, a comment, a command, the answer that matters
  const SESSION = [[["hs-faint", 150]], [["hs-faint", 8], ["hs-ink", 230]], [["", 250]], [["hs-faint", 290]], [["hs-faint", 8], ["hs-ink", 260]], [["hs-hl", 84]]];
  const lines = SESSION.map((parts) => {
    const line = el("div", "hs-line", body);
    for (const [cls, w] of parts) bar(line, w, cls);
    return line;
  });
  const vm = el("div", "hs-vm", desk);
  const top = el("div", "hs-top", vm);
  el("span", "hs-dot", top);
  bar(top, 54, "hs-ink");
  const fig = bar(top, 38);
  fig.style.marginLeft = "auto";
  bar(vm, 0, "hs-ink hs-title");
  const specs = el("div", "hs-specs", vm);
  bar(specs, 0);
  bar(specs, 0, "hs-ink");
  bar(specs, 0);
  bar(specs, 0, "hs-ink");
  const ssh = bar(vm, 190);
  ssh.style.marginTop = "16px";
  const acts = el("div", "hs-acts", desk);
  const primary = el("div", "hs-btn hs-primary", acts);
  bar(primary);
  const secondary = el("div", "hs-btn hs-secondary", acts);
  bar(secondary, 8, "hs-faint");
  bar(secondary, 92, "hs-ink");
  bar(secondary, 12, "hs-faint");
  const paperEl = el("div", "hs-paper", host);
  paperEl.style.background = `url("${asset("paper.webp")}") 0 0 / 384px repeat`;
  paperEl.style.opacity = String(S.paper);

  /* ---- casters: each element as a soft, offset shape, like a box-shadow ---- */
  const spec = [
    [disc, 40, 22, 42],
    [term, 14, 0, 0],
    [vm, 24, 12, 0],
    [primary, 7, 20, 0],
    [secondary, 5, 18, 0],
  ];
  const casters = spec.map(([node, h, hover, radius], i) => ({
    el: node, base: h, hover, radius, cur: h, phase: i * 1.7, hovering: false,
    thinking: false, settling: false, think: 0, angle: 0, restAng: 0, until: 0,
  }));
  const listeners = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  };
  casters.forEach((c) => {
    on(c.el, "pointerenter", () => (c.hovering = true));
    on(c.el, "pointerleave", () => (c.hovering = false));
    on(c.el, "click", () => startThinking(c, performance.now()));
  });
  const [discC, termC, vmC] = casters;

  /* ---- thinking: while an element works, its shadow runs round it ---- */
  const tStyle = () => v["thinking.style"];
  function think(c, onNow) {
    if (onNow) {
      if (!c.thinking && !c.settling && c.think < 0.02) c.angle = c.restAng;
      c.thinking = true;
      c.settling = false;
    } else if (c.thinking) {
      c.thinking = false;
      c.settling = tStyle() !== "Chase" && !still;
    }
  }
  function stepThink(c, restAng, dt) {
    c.restAng = restAng;
    const step = (TAU / v["thinking.lap"]) * dt;
    const going = c.thinking || c.settling;
    if (going && !still) {
      if (c.settling && wrap(restAng - c.angle) <= step) {
        c.settling = false;
        c.angle = restAng;
      } else c.angle += step;
    } else if (!going) c.angle = restAng;
    const k = dt / 0.4;
    c.think = c.thinking || c.settling ? Math.min(1, c.think + k) : Math.max(0, c.think - k);
  }
  // the terminal plays its session while it thinks; the card goes busy
  function startThinking(c, now) {
    if (still) return;
    think(c, true);
    c.until = now + T.hold * 1000;
    if (c === termC) {
      lines.forEach((l) => l.classList.add("is-hidden"));
      lines.forEach((l, i) => timers.push(setTimeout(() => l.classList.remove("is-hidden"), 250 + (i * T.hold * 900) / lines.length)));
    }
    if (c === vmC) vm.classList.add("is-busy");
  }
  function endThinking(c) {
    think(c, false);
    c.until = 0;
    if (c === vmC) vm.classList.remove("is-busy");
  }
  const timers = [];
  // the desk takes turns: the terminal, the card, the disc
  const turns = [termC, vmC, discC];
  let turn = 0, nextTurn = performance.now() + 1400;

  /* A point on a rounded rectangle's outline, by distance along it, clockwise from the top-left. */
  function outline(w, h, r, s) {
    const e1 = w - 2 * r, e2 = h - 2 * r, q = (Math.PI * r) / 2;
    const segs = [e1, q, e2, q, e1, q, e2, q];
    let i = 0;
    while (i < 7 && s > segs[i]) {
      s -= segs[i];
      i++;
    }
    const arc = (cx, cy, a0) => {
      const a = a0 + (r > 0 ? s / r : 0);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    switch (i) {
      case 0: return [r + s, 0];
      case 1: return arc(w - r, r, -Math.PI / 2);
      case 2: return [w, r + s];
      case 3: return arc(w - r, h - r, 0);
      case 4: return [w - r - s, h];
      case 5: return arc(r, h - r, Math.PI / 2);
      case 6: return [0, h - r - s];
      default: return arc(r, r, Math.PI);
    }
  }

  const field = document.createElement("canvas");
  const fctx = field.getContext("2d");
  const ring = document.createElement("canvas");
  const rctx = ring.getContext("2d");
  /* Chase: a dense patch runs round the element's own edge, from the middle of its right side. */
  function drawChase(c, x, y, w, h, blur, col, amount) {
    const e = Math.max(2, v["thinking.reach"] * 0.4), ew = w + e * 2, eh = h + e * 2;
    const rr = Math.min(c.radius + e, ew / 2, eh / 2);
    const pad = Math.ceil(blur * 2 + 16);
    ring.width = Math.max(1, Math.ceil((ew + pad * 2) * FS));
    ring.height = Math.max(1, Math.ceil((eh + pad * 2) * FS));
    rctx.setTransform(FS, 0, 0, FS, pad * FS, pad * FS);
    const L = 2 * (ew + eh) - 8 * rr + TAU * rr, N = 96;
    const s0 = ew - 2 * rr + (Math.PI * rr) / 2 + (eh - 2 * rr) / 2;
    const headAt = wrap((wrap(c.angle) / TAU) * L + s0, L);
    rctx.lineWidth = Math.max(8, blur * 1.3);
    rctx.lineCap = "butt";
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * L, a1 = ((i + 1) / N) * L;
      const behind = wrap(headAt - (a0 + a1) / 2, L) / L;
      const a = amount * T.head * Math.exp((-behind / Math.max(0.02, T.tail)) * 2.3);
      if (a < 0.01) continue;
      const [x0, y0] = outline(ew, eh, rr, a0), [x1, y1] = outline(ew, eh, rr, a1);
      rctx.strokeStyle = `rgba(${col},${a.toFixed(3)})`;
      rctx.beginPath();
      rctx.moveTo(x0, y0);
      rctx.lineTo(x1, y1);
      rctx.stroke();
    }
    fctx.drawImage(ring, (x - e - pad) * FS, (y - e - pad) * FS);
  }

  let W = 1, H = 1, dpr = 1;
  const lamp = { x: 0, y: 0, tx: 0, ty: 0, inside: false, t: 0 };
  const restLamp = () => ({ x: W / 2 - Math.cos(v["light.angle"] * rad) * 600, y: H / 2 - Math.sin(v["light.angle"] * rad) * 600 });

  function drawField(dt) {
    const sr = host.getBoundingClientRect();
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.filter = "none";
    fctx.globalCompositeOperation = "source-over";
    fctx.fillStyle = "#000";
    fctx.fillRect(0, 0, field.width, field.height);
    fctx.globalCompositeOperation = "lighten";
    const k = still ? 1 : 1 - Math.pow(0.9, dt * 60);
    const reach = v["thinking.reach"], ts = tStyle();
    for (const c of casters) {
      const target = c.base + c.think * T.lift + (c.hovering ? c.hover * S.lift : 0);
      c.cur += (target - c.cur) * k;
      const r = c.el.getBoundingClientRect();
      const x = r.left - sr.left, y = r.top - sr.top, w = r.width, h = r.height;
      const hgt = Math.max(0, c.cur);
      const dx = x + w / 2 - lamp.x, dy = y + h / 2 - lamp.y, d = Math.hypot(dx, dy) || 1;
      const len = Math.min(S.maxOffset * (hgt / 20), (hgt * d) / S.lampHeight);
      let ox = (dx / d) * len, oy = (dy / d) * len;
      stepThink(c, Math.atan2(oy, ox), dt);
      const kk = smooth(c.think);
      const orbit = ts !== "Chase" ? kk : 0;
      const chase = ts !== "Orbit" ? kk : 0;
      if (orbit > 0) {
        ox = lerp(ox, Math.cos(c.angle) * reach, orbit);
        oy = lerp(oy, Math.sin(c.angle) * reach, orbit);
      }
      const blur = v["shadow.blur"] + hgt * S.blurGrowth;
      const spread = S.spread + hgt * S.spreadGrowth;
      const dens = lerp(S.near, S.far, Math.pow(Math.min(1, hgt / HMAX), S.curve));
      const col = c.think > 0.02 ? "255,255,0" : "255,0,0";
      fctx.filter = `blur(${(blur * FS).toFixed(2)}px)`;
      // Primary's shadows sit lower than they are wide: the top tucks in further than the sides
      const sy0 = spread - S.shorten;
      const sx = x - spread + ox, sy = y - sy0 + oy, sw = w + spread * 2, sh = Math.max(1, h + sy0 * 2);
      fctx.fillStyle = `rgba(${col},${(dens * lerp(1, T.rest, chase)).toFixed(3)})`;
      fctx.beginPath();
      fctx.roundRect(sx * FS, sy * FS, sw * FS, sh * FS, Math.max(0, Math.min(c.radius + sy0, sw / 2, sh / 2)) * FS);
      fctx.fill();
      if (chase > 0.001) drawChase(c, x, y, w, h, blur, col, chase);
    }
  }

  /* ---- the pen ---- */
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false });
  if (!gl) {
    host.style.background = v["colour.ground"];
    return { update() {}, action() {}, destroy() { style.remove(); canvas.remove(); layer.remove(); paperEl.remove(); host.style.background = ""; } };
  }
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, PEN));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const U = {};
  for (const n of ["uField", "uGrainDense", "uGrainLight", "uRes", "uDpr", "uGrainPx", "uGround", "uInk", "uInkAlpha", "uStyle", "uSeed", "uThinkSeed", "uBoil", "uDrawIn", "uGain", "uGamma", "uGrainScale", "uGrainSoft", "uDust", "uDustSize", "uCharcoal", "uCell", "uLen", "uWidth", "uAngle1", "uAngle2", "uCrossShare", "uJitter", "uBuild", "uSpacing", "uWeight", "uWobble", "uBreaks", "uDot"])
    U[n] = gl.getUniformLocation(prog, n);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  const makeTex = (unit, wrapMode, filter) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    return t;
  };
  const fieldTex = makeTex(0, gl.CLAMP_TO_EDGE, gl.LINEAR);
  // averaging would flatten the grain and shorten the tail, so the scans are read nearest
  const denseTex = makeTex(1, gl.MIRRORED_REPEAT, gl.NEAREST);
  const lightTex = makeTex(2, gl.MIRRORED_REPEAT, gl.NEAREST);
  gl.uniform1i(U.uField, 0);
  gl.uniform1i(U.uGrainDense, 1);
  gl.uniform1i(U.uGrainLight, 2);
  let destroyed = false, lost = false, loaded = 0;
  const images = [["grain-dense.webp", denseTex, 1], ["grain-light.webp", lightTex, 2]].map(([file, tex, unit]) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (destroyed || lost) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      if (++loaded === 2) {
        drawFrom = performance.now();
        render(performance.now(), 0);
      }
    };
    img.src = asset(file);
    return img;
  });

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  let drawFrom = performance.now();
  const drawInValue = (now) => {
    if (still || S.drawIn <= 0) return 1;
    const k = Math.min(1, (now - drawFrom) / S.drawIn);
    return 1 - Math.pow(1 - k, 3);
  };

  function render(now, dt) {
    if (lost || destroyed) return;
    drawField(dt);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, field);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uGrainPx, GRAIN_PX);
    gl.uniform3fv(U.uGround, rgb(v["colour.ground"]));
    gl.uniform3fv(U.uInk, rgb(v["colour.ink"]));
    gl.uniform1f(U.uInkAlpha, S.inkAlpha);
    gl.uniform1i(U.uStyle, Math.max(0, STYLES.indexOf(v["shadow.style"])));
    gl.uniform1f(U.uSeed, 0);
    gl.uniform1f(U.uThinkSeed, 0);
    gl.uniform1f(U.uBoil, 0);
    gl.uniform1f(U.uDrawIn, loaded === 2 ? drawInValue(now) : 0);
    gl.uniform1f(U.uGain, v["shadow.density"]);
    gl.uniform1f(U.uGamma, S.gamma);
    gl.uniform1f(U.uGrainScale, S.grainScale);
    gl.uniform1f(U.uGrainSoft, S.grainSoftness);
    gl.uniform1f(U.uDust, S.dust);
    gl.uniform1f(U.uDustSize, S.dustSize);
    gl.uniform1f(U.uCharcoal, S.charcoal);
    gl.uniform1f(U.uCell, S.cell);
    gl.uniform1f(U.uLen, S.length);
    gl.uniform1f(U.uWidth, S.width);
    gl.uniform1f(U.uAngle1, -S.angleDeg * rad);
    gl.uniform1f(U.uAngle2, -(S.angleDeg + S.cross) * rad);
    gl.uniform1f(U.uCrossShare, S.crossShare);
    gl.uniform1f(U.uJitter, S.jitter * rad);
    gl.uniform1f(U.uBuild, S.buildUp);
    gl.uniform1f(U.uSpacing, S.spacing);
    gl.uniform1f(U.uWeight, S.weight);
    gl.uniform1f(U.uWobble, S.wobble);
    gl.uniform1f(U.uBreaks, S.breaks);
    gl.uniform1f(U.uDot, S.dot);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---- the lamp: at rest up and to the left, like the light in Primary's screens ---- */
  function moveLamp(dt) {
    let tx, ty;
    const mode = v["light.lamp"];
    if (mode === "Orbits") {
      lamp.t += still ? 0 : 0.24 * dt;
      tx = W / 2 + Math.cos(lamp.t) * W * 0.45;
      ty = H / 2 + Math.sin(lamp.t) * H * 0.45;
    } else if (mode === "Follows pointer" && lamp.inside) {
      tx = lamp.tx;
      ty = lamp.ty;
    } else ({ x: tx, y: ty } = restLamp());
    const k = still ? 1 : 1 - Math.pow(0.92, dt * 60);
    lamp.x += (tx - lamp.x) * k;
    lamp.y += (ty - lamp.y) * k;
  }
  on(host, "pointermove", (e) => {
    const r = host.getBoundingClientRect();
    lamp.tx = e.clientX - r.left;
    lamp.ty = e.clientY - r.top;
    lamp.inside = true;
    if (still) redraw();
  });
  on(host, "pointerleave", () => {
    lamp.inside = false;
    if (still) redraw();
  });

  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    for (const c of casters) if (c.until && now >= c.until) endThinking(c);
    if (now >= nextTurn) {
      const c = turns[turn++ % turns.length];
      startThinking(c, now);
      nextTurn = now + (T.hold + T.gap) * 1000;
    }
    moveLamp(dt);
    render(now, dt);
  }
  const redraw = () => {
    moveLamp(0);
    render(performance.now(), 0);
  };

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    field.width = Math.max(1, Math.round(W * FS));
    field.height = Math.max(1, Math.round(H * FS));
    // the desk: two columns on a wide stage, one on a narrow one, scaled to fit with room round it
    const narrow = W < 820;
    layer.classList.toggle("is-narrow", narrow);
    if (narrow) layer.style.setProperty("--hs-col", `${Math.min(500, W - 56)}px`);
    desk.style.transform = "none";
    const s = Math.min(1, (W - 64) / desk.offsetWidth, (H - 72) / desk.offsetHeight);
    desk.style.transform = s < 1 ? `scale(${s.toFixed(4)})` : "none";
    if (!lamp.inside && v["light.lamp"] !== "Orbits") ({ x: lamp.x, y: lamp.y } = restLamp());
  }

  function sync() {
    const run = !still && !lost && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      last = performance.now();
      nextTurn = Math.max(nextTurn, last + 600);
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  on(canvas, "webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
    sync();
  });
  const ro = new ResizeObserver(() => {
    resize();
    redraw();
    sync();
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

  resize();
  redraw();
  sync();

  return {
    update(nv, path) {
      const was = v["shadow.style"];
      Object.assign(v, nv);
      host.style.background = v["colour.ground"];
      // a new pen draws itself in, grain by grain
      if (v["shadow.style"] !== was) drawFrom = performance.now();
      if (path === "light.angle" || path === "light.lamp") {
        if (still || v["light.lamp"] === "At rest") ({ x: lamp.x, y: lamp.y } = restLamp());
      }
      if (still) redraw();
    },
    action() {},
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      for (const [t, type, fn, opts] of listeners) t.removeEventListener(type, fn, opts);
      timers.forEach(clearTimeout);
      images.forEach((img) => (img.onload = null));
      for (const t of [fieldTex, denseTex, lightTex]) gl.deleteTexture(t);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      field.width = field.height = ring.width = ring.height = 0;
      style.remove();
      canvas.remove();
      layer.remove();
      paperEl.remove();
      host.style.background = "";
    },
  };
}
