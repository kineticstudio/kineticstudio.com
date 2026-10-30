/* Scene inset.

   From a client study (their round two): a small turntable in the middle
   of a plain ground, holding four little dioramas, each a chunk of the
   world torn out with its strata showing: a butterfly working the flowers
   of a meadow, a rocket on its pad venting steam, a wing-sailed drone
   riding the swell with a gull overhead, and a burned slope being reseeded
   by a quadcopter, every pod it drops coming up a seedling. It holds on one
   with a slow drift, then turns to the next in one continuous Hermite curve;
   the one leaving dissolves through an ordered dither, and the turn itself
   glitches (macroblocks hang on to the last held frame and slide, rows
   smear like a pixel sort, a few blocks go lilac). The one facing us is
   read like a machine-vision pass: crosshairs on what it found, thin lines
   between detections, and two cursors clicking things, each click cropping
   a hard rectangle into another view of the scene (its normals or depth).

   Everything is made in code. Click to turn to the next. The source's
   caption, its detection labels and its readouts are left out, so there is
   no text in it. */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const params = {
  scene: {
    size: [0.42, 0.2, 0.6, 0.01],
    elevation: [26, 5, 60, 1],
  },
  turn: {
    hold: [5, 2, 12, 0.1],
    time: [1.5, 0.6, 4, 0.05],
    glitch: [0.35, 0, 1, 0.01],
  },
  notation: {
    lines: [0.5, 0, 1, 0.01],
    cursors: { type: "toggle", labels: ["Off", "On"], default: true },
    view: { type: "select", options: ["Normals", "Depth", "None"] },
  },
  colour: {
    ground: "#e9e5da",
    signal: "#c8ff3d",
  },
  next: { type: "action", label: "Next scene" },
};

// ================================================================ basics
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const lumOf = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

// the source's settings that stay put
const DRIFT = 6, PULL_BACK = 0.06, FOV = 22, SUN_ANGLE = -38, SUN_HEIGHT = 50, FLOOR_SHADOW = 0.09, LABEL = 9.5;
const BLUE = "#5b8cff", RED = "#ff5a4a", INK = "#0b0d0c";

// ================================================================ the dissolve
// A scene leaving the front dissolves through an ordered dither rather than going
// transparent: no sorting, and it is the same pixel language as the glitch.
const FADE = `uniform float uFade;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
float bayer4(vec2 a) { return bayer2(.5 * a) * .25 + bayer2(a); }
`;
function makeKit(swayT) {
  function hook(m, fadeU, sway = false) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFade = fadeU;
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", FADE + "void main() {\n  if (uFade < .999 && bayer4(gl_FragCoord.xy * .5) > uFade - .03) discard;");
      if (sway) {
        sh.uniforms.uTime = swayT;
        sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz;
#else
  vec3 ip = vec3(0.);
#endif
  float sw = sin(uTime * 1.5 + ip.x * 7. + ip.z * 5.) * .6 + sin(uTime * 2.6 + ip.z * 9.) * .3;
  transformed.x += sw * transformed.y * .2;
  transformed.z += sw * transformed.y * .1;`);
      }
    };
    m.customProgramCacheKey = () => (sway ? "inset-fade-sway" : "inset-fade");
    return m;
  }
  function materials(fadeU) {
    return {
      flat: hook(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.93, metalness: 0 }), fadeU),
      flat2: hook(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }), fadeU),
      smooth: hook(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 }), fadeU),
      sway: hook(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }), fadeU, true),
    };
  }
  return { hook, materials };
}

// ================================================================ geometry helpers
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();
function prep(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
function setFaceColors(g, fn) {
  const p = g.attributes.position.array, n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const c = fn((p[i * 3] + p[i * 3 + 3] + p[i * 3 + 6]) / 3, (p[i * 3 + 1] + p[i * 3 + 4] + p[i * 3 + 7]) / 3, (p[i * 3 + 2] + p[i * 3 + 5] + p[i * 3 + 8]) / 3, i / 3);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
function paint(g, hex, jit = 0, seed = 1) {
  g = prep(g);
  const r = rng(seed), base = new THREE.Color(hex);
  return setFaceColors(g, () => { _c.copy(base); if (jit) _c.offsetHSL(0, 0, (r() - 0.5) * jit); return _c; });
}
function paintBy(g, fn) { return setFaceColors(prep(g), fn); }
function paintY(g, h0, h1, y0, y1) {
  g = prep(g);
  const p = g.attributes.position.array, n = g.attributes.position.count, col = new Float32Array(n * 3), a = new THREE.Color(h0), b = new THREE.Color(h1);
  for (let i = 0; i < n; i++) { _c.copy(a).lerp(b, clamp((p[i * 3 + 1] - y0) / (y1 - y0), 0, 1)); col.set([_c.r, _c.g, _c.b], i * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
const merge = (list) => mergeGeometries(list, false);
const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function bar(a, b, t, hex) {
  const A = V3(...a), B = V3(...b), len = A.distanceTo(B), g = new THREE.BoxGeometry(t, t, len);
  const up = Math.abs(B.y - A.y) / len > 0.98 ? V3(1, 0, 0) : V3(0, 1, 0);
  const m = new THREE.Matrix4().lookAt(A, B, up);
  m.setPosition(A.clone().add(B).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return paint(g, hex);
}
function placeMatrix(x, y, z, rx, ry, rz, s) {
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), typeof s === "number" ? _s.setScalar(s) : _s.set(...s));
}
function xfBox(w, h, d, x, y, z) { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return b; }

// ================================================================ the torn chunk
// A disc of ground whose rim is a sum of a dozen sines (so it tears, but stays one
// piece), a faceted top coloured face by face, and walls stepping down through strata
// to a lumpy underside.
function chunk(o) {
  const N = o.segs || 56, M = o.rings || 7, r = rng(o.seed);
  const terms = [];
  for (let k = 2; k <= 13; k++) terms.push([k, (((r() * 2 - 1) * 0.1) / Math.pow(k, 0.7)) * (o.rough ?? 1), r() * TAU]);
  const rimR = (a) => { let v = 0; for (const [k, am, ph] of terms) v += am * Math.sin(k * a + ph); return (o.radius || 1) * (1 + v); };
  const th = [], rr = [];
  for (let i = 0; i < N; i++) { const a = ((i + (r() - 0.5) * 0.5) / N) * TAU; th.push(a); rr.push(rimR(a) * (1 + (r() - 0.5) * 0.07 * (o.rough ?? 1))); }
  const H = o.height, pos = [], col = [];
  const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let n = 0; n < 3; n++) col.push(k.r, k.g, k.b); };
  const grid = [[[0, H(0, 0), 0]]];
  for (let j = 1; j <= M; j++) {
    const row = [];
    for (let i = 0; i < N; i++) {
      const f = j / M, edge = j === M;
      const a = th[i] + (edge ? 0 : ((r() - 0.5) * 0.4 * TAU) / N), rad = rr[i] * (edge ? 1 : f + ((r() - 0.5) * 0.3) / M);
      const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
      row.push([x, H(x, z), z]);
    }
    grid.push(row);
  }
  if (!o.noTop) {
    const calm = () => 0.5;
    const face = (a, b, c) => { const x = (a[0] + b[0] + c[0]) / 3, z = (a[2] + b[2] + c[2]) / 3; return o.top(x, (a[1] + b[1] + c[1]) / 3, z, x * x + z * z < 0.045 ? calm : r); };
    for (let i = 0; i < N; i++) { const a = grid[0][0], b = grid[1][i], c = grid[1][(i + 1) % N]; tri(a, b, c, face(a, b, c)); }
    for (let j = 1; j < M; j++) for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N, a = grid[j][i], b = grid[j + 1][i], c = grid[j + 1][i2], d = grid[j][i2];
      if ((i + j) % 2) { tri(a, b, c, face(a, b, c)); tri(a, c, d, face(a, c, d)); }
      else { tri(a, b, d, face(a, b, d)); tri(b, c, d, face(b, c, d)); }
    }
  }
  // walls, band by band; band 0's top ring is the rim itself (the sea moves it)
  const rim = grid[M], rimMap = [];
  const total = o.strata.reduce((s, b) => s + b.d, 0);
  let prev = rim, depth = 0;
  o.strata.forEach((b, k) => {
    depth += b.d;
    const f = depth / total, shrink = 1 - 0.5 * Math.pow(f, 1.6);
    const next = rim.map((p, i) => {
      const a = th[i] + ((r() - 0.5) * 0.25 * TAU) / N, rad = rr[i] * shrink * (1 + (r() - 0.5) * 0.09);
      const y = (o.flatStrata ? 0 : p[1]) - depth * (1 + (r() - 0.5) * 0.3);
      return [Math.sin(a) * rad, y, Math.cos(a) * rad];
    });
    const bc = new THREE.Color(b.c);
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N, A = prev[i], B = prev[i2], C = next[i2], D = next[i];
      const c = bc.clone().offsetHSL(0, 0, (r() - 0.5) * (b.j ?? 0.05));
      if (b.rock && r() < 0.18) c.offsetHSL(0, -0.05, 0.06);
      const base = pos.length / 3;
      tri(A, D, C, c);
      tri(A, C, B, c);
      if (k === 0) rimMap.push([base, i], [base + 3, i], [base + 5, i2]);
    }
    prev = next;
  });
  // the underside: one lumpy ring, then a point
  const lowY = Math.min(...prev.map((p) => p[1]));
  const under = prev.map((p) => { const s = 0.45 + r() * 0.2; return [p[0] * s, lowY - 0.06 - r() * 0.08, p[2] * s]; });
  const apex = [(r() - 0.5) * 0.1, lowY - 0.2 - r() * 0.06, (r() - 0.5) * 0.1];
  const lc = new THREE.Color(o.strata[o.strata.length - 1].c);
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N, c = lc.clone().offsetHSL(0, 0, (r() - 0.5) * 0.06);
    tri(prev[i], under[i], under[i2], c);
    tri(prev[i], under[i2], prev[i2], c);
    tri(under[i], apex, under[i2], c.clone().offsetHSL(0, 0, -0.04));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return { geo, grid, th, rr, rimMap, N, M };
}
// a few torn-off bits hanging by the rim
function debris(group, ch, colors, seed, mat) {
  const r = rng(seed), bits = [];
  for (let i = 0; i < 6; i++) {
    const a = ((r() < 0.5 ? 1 : -1) * (Math.PI / 2 + (r() - 0.3) * 1.9) + TAU) % TAU, ii = Math.floor((a / TAU) * ch.N) % ch.N, rad = ch.rr[ii] * (1.03 + r() * 0.12);
    const m = new THREE.Mesh(paint(new THREE.IcosahedronGeometry(0.016 + r() * 0.028, 0), colors[Math.floor(r() * colors.length)], 0.08, seed + i), mat);
    m.position.set(Math.sin(a) * rad, -0.08 - r() * 0.42, Math.cos(a) * rad);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.userData = { y0: m.position.y, ph: r() * TAU };
    m.castShadow = true;
    group.add(m);
    bits.push(m);
  }
  return bits;
}
function bob(bits, t, dt) { for (const b of bits) { b.position.y = b.userData.y0 + 0.012 * Math.sin(t * 0.7 + b.userData.ph); b.rotation.y += dt * 0.15; } }
function marker(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }

// ================================================================ 1. meadow: a butterfly at the flowers
function stem(h, lean, seed) {
  const r = rng(seed), parts = [];
  const top = V3(lean[0], h, lean[1]);
  const curve = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(lean[0] * 0.2, h * 0.5, lean[1] * 0.2), top]);
  parts.push(paint(new THREE.TubeGeometry(curve, 6, 0.0055, 4), "#5c7c33", 0.06, seed));
  for (let k = 0; k < 2; k++) {
    const lf = new THREE.SphereGeometry(1, 6, 3);
    lf.scale(0.0075, 0.002, 0.03); lf.translate(0, 0, 0.027); lf.rotateX(-0.35 + r() * 0.3); lf.rotateY(r() * TAU);
    const p = curve.getPoint(0.15 + k * 0.2);
    lf.translate(p.x, p.y, p.z);
    parts.push(paint(lf, "#6a8a38", 0.08, seed + k));
  }
  return { parts, top };
}
function daisy(h, lean, seed, petal = "#f3f0e7", centre = "#dfa22b", n = 11, hs = 1.6) {
  const { parts, top } = stem(h, lean, seed), r = rng(seed + 3), head = [];
  for (let i = 0; i < n; i++) {
    const pg = new THREE.SphereGeometry(1, 6, 3);
    pg.scale(0.011 * hs, 0.0032 * hs, 0.03 * hs); pg.translate(0, 0, 0.031 * hs); pg.rotateX(-0.25); pg.rotateY((i / n) * TAU + r() * 0.15);
    head.push(paint(pg, petal, 0.05, seed * 7 + i));
  }
  const cg = new THREE.SphereGeometry(0.0155 * hs, 8, 4);
  cg.scale(1, 0.55, 1);
  head.push(paint(cg, centre, 0.12, seed));
  const hg = merge(head);
  hg.rotateX(0.6); hg.translate(top.x, top.y, top.z);
  return { geo: merge([...parts, hg]), top };
}
function bell(h, lean, seed, colr = "#b29ade", hs = 1.6) {
  const { parts, top } = stem(h, lean, seed);
  const cup = new THREE.LatheGeometry(V2([[0.002, 0], [0.011, 0.005], [0.017, 0.017], [0.021, 0.032], [0.026, 0.045], [0.034, 0.052]].map(([a, b]) => [a * hs, b * hs])), 7);
  const st = new THREE.SphereGeometry(0.0055 * hs, 6, 3);
  st.translate(0, 0.03 * hs, 0);
  const hg = merge([paint(cup, colr, 0.1, seed), paint(st, "#e8c050", 0.05, seed)]);
  hg.rotateX(0.35); hg.translate(top.x, top.y - 0.004, top.z);
  return { geo: merge([...parts, hg]), top };
}
function tuftGeo(seed) {
  const r = rng(seed), bl = [];
  for (let i = 0; i < 6; i++) {
    const h = 0.045 + r() * 0.065, g = new THREE.ConeGeometry(0.0065, h, 3, 1);
    g.translate(0, h / 2, 0); g.rotateZ((r() - 0.5) * 0.8); g.rotateY(r() * TAU); g.translate((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.02);
    bl.push(paintY(g, "#7a7a7a", "#ffffff", 0, 0.1));
  }
  return merge(bl);
}
// the wing pattern is drawn from the same outlines the geometry uses, so the margins land
const FORE = [[0, 0], [0.016, 0.022], [0.045, 0.048], [0.078, 0.061], [0.097, 0.056], [0.095, 0.036], [0.074, 0.012], [0.044, -0.002], [0.014, -0.006]];
const HIND = [[0, -0.004], [0.022, -0.008], [0.05, -0.02], [0.066, -0.042], [0.06, -0.064], [0.04, -0.074], [0.018, -0.062], [0.005, -0.032]];
function wingTexture() {
  const S = 256, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d");
  const U = ([x, y]) => [(x / 0.1) * S, (1 - (y + 0.078) / 0.142) * S];
  c.fillStyle = "#e4782a"; c.fillRect(0, 0, S, S);
  const [hx, hy] = U([0, 0]), g = c.createRadialGradient(hx, hy, 0, hx, hy, S * 0.75);
  g.addColorStop(0, "#b9501b"); g.addColorStop(0.45, "rgba(214,104,36,.4)"); g.addColorStop(1, "rgba(240,140,50,0)");
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  c.strokeStyle = "#17120f"; c.lineCap = "round"; c.lineJoin = "round";
  const path = (pts, close) => { c.beginPath(); pts.forEach((p, i) => { const [x, y] = U(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); if (close) c.closePath(); };
  c.lineWidth = 3.2;
  for (const t of [FORE[2], FORE[3], FORE[4], FORE[5], FORE[6]]) path([[0.003, 0.002], [t[0] * 0.5, t[1] * 0.45], t]), c.stroke();
  for (const t of [HIND[2], HIND[3], HIND[4], HIND[5], HIND[6]]) path([[0.003, -0.006], [t[0] * 0.5, t[1] * 0.55], t]), c.stroke();
  path([[0.03, 0.02], [0.05, 0.028], [0.066, 0.03]]); c.stroke();
  c.lineWidth = 24; path(FORE, true); c.stroke(); path(HIND, true); c.stroke();
  // the tip of the forewing goes black, with two rows of pale spots
  c.fillStyle = "#17120f"; c.beginPath(); { const [x, y] = U([0.09, 0.05]); c.arc(x, y, 34, 0, TAU); } c.fill();
  c.fillStyle = "#f4efe2";
  const cen = (pts) => pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
  for (const pts of [FORE, HIND]) {
    const m = cen(pts);
    for (let i = 1; i < pts.length - 1; i++) for (let k = 0; k < 2; k++) {
      const t = (k + 0.5) / 2, a = pts[i], b = pts[i + 1], p = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
      const [x, y] = U([lerp(p[0], m[0], 0.07), lerp(p[1], m[1], 0.07)]);
      c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill();
    }
  }
  for (const [u, w] of [[0.072, 0.045], [0.08, 0.052], [0.083, 0.04]]) { const [x, y] = U([u, w]); c.beginPath(); c.arc(x, y, 3.4, 0, TAU); c.fill(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function wingGeo(pts, mirror) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(V2(pts)));
  const p = g.attributes.position.array, uv = g.attributes.uv.array;
  for (let i = 0; i < g.attributes.position.count; i++) { uv[i * 2] = p[i * 3] / 0.1; uv[i * 2 + 1] = (p[i * 3 + 1] + 0.078) / 0.142; }
  g.rotateX(Math.PI / 2); // (x, y) -> (x, 0, y): flat, forward is +z
  if (mirror) g.scale(-1, 1, 1);
  return g;
}

function buildMeadow(fadeU, kit) {
  const M = kit.materials(fadeU), g = new THREE.Group(), R = rng(101);
  const H = (x, z) => 0.055 * (1 - Math.min(1, x * x + z * z)) + 0.012 * Math.sin(3.1 * x + 1) * Math.cos(3.7 * z);
  const greens = ["#617f36", "#6f8f3c", "#809d46", "#8fa94f"].map((h) => new THREE.Color(h));
  const ch = chunk({
    seed: 7, height: H, rings: 8,
    top: (x, y, z, r) => {
      const n = Math.sin(x * 5.3 + z * 2.1) * 0.5 + Math.sin(z * 6.7 - x * 3.3) * 0.5;
      const c = greens[clamp(Math.floor((n * 0.5 + 0.5) * 4 + (r() - 0.5)), 0, 3)].clone().offsetHSL(0, 0, (r() - 0.5) * 0.04);
      if (x * x + z * z > 0.78 && r() < 0.3) c.set("#7a6345");
      return c;
    },
    strata: [{ d: 0.05, c: "#4a3726" }, { d: 0.11, c: "#6c5035" }, { d: 0.12, c: "#93744f" }, { d: 0.15, c: "#8a8377", j: 0.08, rock: true }, { d: 0.1, c: "#76706a", rock: true }],
  });
  const ground = new THREE.Mesh(ch.geo, M.flat);
  ground.receiveShadow = true; ground.castShadow = true; g.add(ground);
  const bits = debris(g, ch, ["#6c5035", "#8a8377", "#93744f"], 17, M.flat);

  // grass, instanced, swaying in the vertex shader
  const TUFTS = 80, tufts = new THREE.InstancedMesh(tuftGeo(5), M.sway, TUFTS);
  const tuftPos = [];
  for (let i = 0; i < TUFTS; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * 0.8, x = Math.sin(a) * d, z = Math.cos(a) * d;
    tufts.setMatrixAt(i, placeMatrix(x, H(x, z) - 0.006, z, 0, R() * TAU, 0, 0.7 + R() * 0.7));
    tufts.setColorAt(i, _c.copy(greens[Math.floor(R() * 4)]).offsetHSL(0, 0.05, 0.06 + (R() - 0.5) * 0.06));
    tuftPos.push([x, z]);
  }
  tufts.castShadow = true; tufts.receiveShadow = true; g.add(tufts);

  // flowers
  const spots = [[-0.34, 0.12, 0.44, "daisy"], [-0.12, -0.22, 0.4, "bell"], [0.06, 0.26, 0.3, "daisy"], [0.32, -0.04, 0.5, "daisy"], [0.48, 0.28, 0.3, "bell"], [-0.54, -0.22, 0.34, "daisy"], [0.16, -0.42, 0.46, "bell"], [-0.1, 0.5, 0.22, "daisy"]];
  const flowers = spots.map(([x, z, h, kind], i) => {
    const lean = [(R() - 0.5) * 0.06, (R() - 0.5) * 0.04 + 0.015];
    const f = kind === "daisy" ? daisy(h, lean, 40 + i, i === 7 ? "#efe6f6" : "#f3f0e7") : bell(h, lean, 40 + i, i === 6 ? "#9c86d6" : "#b29ade");
    const mesh = new THREE.Mesh(f.geo, M.flat2);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const holder = new THREE.Group();
    holder.position.set(x, H(x, z) - 0.004, z);
    holder.add(mesh); g.add(holder);
    return { holder, mesh, head: marker(holder, f.top.x, f.top.y + 0.01, f.top.z), ph: R() * TAU };
  });

  // the butterfly
  const tex = wingTexture();
  const wingMat = kit.hook(new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 }), fadeU);
  const bfly = new THREE.Group();
  bfly.rotation.order = "YXZ"; g.add(bfly);
  const body = new THREE.CapsuleGeometry(0.0055, 0.036, 2, 6);
  body.rotateX(Math.PI / 2);
  const headG = new THREE.SphereGeometry(0.0062, 6, 4);
  headG.translate(0, 0, 0.026);
  const ant = (s) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(s * 0.002, 0.003, 0.028), V3(s * 0.007, 0.012, 0.044), V3(s * 0.012, 0.015, 0.056)]), 4, 0.0009, 3);
  const bodyMesh = new THREE.Mesh(merge([paint(body, "#2a231f", 0.06), paint(headG, "#2a231f"), paint(ant(1), "#2a231f"), paint(ant(-1), "#2a231f")]), M.flat);
  bodyMesh.castShadow = true; bfly.add(bodyMesh);
  const wR = new THREE.Group(), wL = new THREE.Group();
  wR.position.x = 0.004; wL.position.x = -0.004; bfly.add(wR, wL);
  for (const [grp, mir] of [[wR, false], [wL, true]]) for (const pts of [FORE, HIND]) { const w = new THREE.Mesh(wingGeo(pts, mir), wingMat); w.castShadow = true; grp.add(w); }
  bfly.scale.setScalar(2);
  const bAt = marker(bfly, 0, 0, 0);
  const grassMk = marker(g, tuftPos[3][0], H(tuftPos[3][0], tuftPos[3][1]) + 0.04, tuftPos[3][1]);

  let t = 0, phase = 0, yawPrev = 0;
  const path = (u) => [0.36 * Math.sin(u) + 0.08 * Math.sin(2.6 * u + 1), 0.22 * Math.sin(2 * u + 0.6) + 0.02];
  return {
    group: g,
    update(dt) {
      t += dt; bob(bits, t, dt);
      for (const f of flowers) { f.holder.rotation.z = 0.05 * Math.sin(t * 1.3 + f.ph); f.holder.rotation.x = 0.04 * Math.sin(t * 1.1 + f.ph * 2); }
      const u = t * 0.36, [x, z] = path(u), [x2, z2] = path(u + 0.02);
      const freq = 5.4 + 1.6 * Math.sin(0.7 * u), glide = smooth(0.72, 0.95, Math.sin(0.53 * u + 2));
      phase += dt * freq * TAU * (1 - glide * 0.85);
      const flap = Math.sin(phase) * 0.5 + 0.5;
      const ang = lerp(lerp(-0.3, 1.2, flap), 0.22, glide);
      wR.rotation.z = ang; wL.rotation.z = -ang;
      const y = H(x, z) + 0.44 + 0.07 * Math.sin(1.3 * u + 0.4) + 0.02 * Math.cos(phase) * (1 - glide);
      bfly.position.set(x, y, z);
      const yaw = Math.atan2(x2 - x, z2 - z);
      let dy = yaw - yawPrev;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yawPrev = yaw;
      bfly.rotation.set(-0.18 - 0.12 * Math.cos(phase) * (1 - glide), yaw, clamp(-dy * 20, -0.5, 0.5));
    },
    dets: [
      { cls: "main", at: bAt, obj: bfly },
      { cls: "blue", at: flowers[0].head, obj: flowers[0].mesh },
      { cls: "blue", at: flowers[3].head, obj: flowers[3].mesh },
      { cls: "blue", at: flowers[4].head, obj: flowers[4].mesh },
      { cls: "red", at: grassMk, size: [0.1, 0.1, 0.1] },
    ],
    links: [[1, 2], [2, 3], [1, 4]],
  };
}

// ================================================================ 2. launch pad: a rocket on the pad
function gridFin(hex) {
  const p = [], w = 0.046, h = 0.036, t = 0.0032;
  p.push(bar([-w / 2, 0, 0], [w / 2, 0, 0], t, hex), bar([-w / 2, h, 0], [w / 2, h, 0], t, hex), bar([-w / 2, 0, 0], [-w / 2, h, 0], t, hex), bar([w / 2, 0, 0], [w / 2, h, 0], t, hex));
  for (let k = 1; k < 4; k++) p.push(bar([-w / 2 + (w * k) / 4, 0, 0], [-w / 2 + (w * k) / 4, h, 0], t * 0.7, hex));
  for (let k = 1; k < 3; k++) p.push(bar([-w / 2, (h * k) / 3, 0], [w / 2, (h * k) / 3, 0], t * 0.7, hex));
  return merge(p);
}
function lattice(x0, z0, y0, w, h, levels, t, hex) {
  const parts = [], hw = w / 2, cs = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
  for (const [cx, cz] of cs) parts.push(bar([x0 + cx, y0, z0 + cz], [x0 + cx, y0 + h, z0 + cz], t * 1.4, hex));
  for (let l = 0; l <= levels; l++) {
    const y = y0 + (h * l) / levels, y2 = y0 + (h * (l + 1)) / levels;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 4];
      parts.push(bar([x0 + ax, y, z0 + az], [x0 + bx, y, z0 + bz], t, hex));
      if (l < levels) { const f = (l + k) % 2; parts.push(bar([x0 + (f ? ax : bx), y, z0 + (f ? az : bz)], [x0 + (f ? bx : ax), y2, z0 + (f ? bz : az)], t * 0.75, hex)); }
    }
  }
  return parts;
}
function puffs(mat, n) {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat, n);
  const P = Array.from({ length: n }, (_, i) => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 0.05, rot: i * 1.7, lift: 0 }));
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, placeMatrix(0, -9, 0, 0, 0, 0, 0));
  let next = 0;
  return {
    mesh,
    emit(o) { const p = P[next]; next = (next + 1) % n; Object.assign(p, o, { on: true, age: 0 }); },
    step(dt) {
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (!p.on) continue;
        p.age += dt;
        if (p.age >= p.life) { p.on = false; mesh.setMatrixAt(i, placeMatrix(0, -9, 0, 0, 0, 0, 0)); continue; }
        const d = Math.exp(-dt * 0.9);
        p.vx *= d; p.vz *= d; p.vy = p.vy * d + p.lift * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const u = p.age / p.life, s = p.size * (1 - Math.pow(1 - u, 3)) * (1 - Math.pow(u, 5));
        mesh.setMatrixAt(i, placeMatrix(p.x, p.y, p.z, p.rot, p.rot * 0.7, 0, s));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
function buildLaunch(fadeU, kit) {
  const M = kit.materials(fadeU), g = new THREE.Group(), R = rng(202);
  const H = (x, z) => { const d = Math.hypot(x, z); return d < 0.6 ? 0 : -0.035 * smooth(0.6, 1.05, d) + 0.006 * Math.sin(9 * x) * Math.cos(7 * z); };
  const sand = ["#cdbb91", "#c4b086", "#d5c59f", "#bfac84"].map((h) => new THREE.Color(h));
  const ch = chunk({
    seed: 13, height: H, rings: 8, rough: 0.9,
    top: (x, y, z, r) => {
      const d = Math.hypot(x, z);
      if (d < 0.56) return _c.set("#bdb9ae");
      if (x < -0.45 && Math.abs(z - 0.12 - (x + 0.45) * 0.2) < 0.07) return _c.set("#8b867c").offsetHSL(0, 0, (r() - 0.5) * 0.03);
      const c = sand[Math.floor(r() * 4)].clone();
      if (r() < 0.13) c.set("#7b8a4c").offsetHSL(0, 0, (r() - 0.5) * 0.06);
      return c;
    },
    strata: [{ d: 0.04, c: "#c4aa7d" }, { d: 0.1, c: "#a98a5e" }, { d: 0.1, c: "#d4c8ad" }, { d: 0.14, c: "#a29989", j: 0.08, rock: true }, { d: 0.12, c: "#898175", rock: true }],
  });
  const ground = new THREE.Mesh(ch.geo, M.flat);
  ground.receiveShadow = true; ground.castShadow = true; g.add(ground);
  const bits = debris(g, ch, ["#a98a5e", "#d4c8ad", "#a29989"], 23, M.flat);

  // pad: an octagon of concrete with the flame trench notched out of it toward +x
  const PR = 0.5, oct = [];
  for (let k = 0; k < 8; k++) { const a = -Math.PI / 8 + (k * Math.PI) / 4; oct.push([Math.cos(a) * PR, Math.sin(a) * PR]); }
  const ex = oct[0][0], padPts = [[ex, oct[0][1]], [ex, -0.06], [0, -0.06], [0, 0.06], [ex, 0.06], ...oct.slice(1)];
  const padG = new THREE.ExtrudeGeometry(new THREE.Shape(V2(padPts)), { depth: 0.035, bevelEnabled: false });
  padG.rotateX(-Math.PI / 2);
  const parts = [paint(padG, "#c6c2b8", 0.03, 3)];
  parts.push(paint(xfBox(0.66, 0.006, 0.12, 0.33, 0.002, 0), "#2f2c29"));
  parts.push(paint(xfBox(0.22, 0.022, 0.22, 0, 0.144, 0), "#4a4b48", 0.04)); // launch table
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) parts.push(paint(xfBox(0.024, 0.1, 0.024, sx * 0.08, 0.085, sz * 0.08), "#4a4b48", 0.04));
  // the tower, behind and left, with its arms and a lightning mast
  const TX = -0.22, TZ = -0.14, TW = 0.1, TH = 1.74;
  parts.push(...lattice(TX, TZ, 0.035, TW, TH, 16, 0.0055, "#8d8a83"));
  parts.push(paint(xfBox(0.15, 0.03, 0.15, TX, 0.05, TZ), "#7c7973"));
  parts.push(bar([TX, 0.035 + TH, TZ], [TX, 0.035 + TH + 0.24, TZ], 0.005, "#6d6a64"));
  parts.push(paint(xfBox(0.13, 0.022, 0.03, TX + 0.1, 1.15, TZ + 0.06), "#8d8a83"), paint(xfBox(0.04, 0.034, 0.04, -0.07, 1.15, -0.02), "#e4e1d8", 0.03));
  parts.push(bar([TX + 0.05, 0.72, TZ + 0.04], [-0.05, 0.72, -0.01], 0.008, "#8d8a83"));
  // a LOX sphere on legs, a pipe to the pad, a low building
  const tank = V3(0.52, 0.17, -0.42);
  const tg = new THREE.SphereGeometry(0.085, 12, 8);
  tg.translate(tank.x, tank.y, tank.z);
  parts.push(paint(tg, "#e6e3db", 0.02));
  for (const a of [0.4, 2, 3.6, 5.2]) parts.push(bar([tank.x + Math.cos(a) * 0.06, H(tank.x, tank.z), tank.z + Math.sin(a) * 0.06], [tank.x + Math.cos(a) * 0.05, tank.y, tank.z + Math.sin(a) * 0.05], 0.008, "#7d7a74"));
  parts.push(bar([tank.x - 0.05, 0.03, tank.z + 0.05], [0.2, 0.03, -0.2], 0.012, "#6f6c66"));
  parts.push(paint(xfBox(0.17, 0.07, 0.1, -0.6, H(-0.6, 0.3) + 0.035, 0.3), "#d9d3c5", 0.03), paint(xfBox(0.18, 0.012, 0.11, -0.6, H(-0.6, 0.3) + 0.075, 0.3), "#8f8a80"));
  const stat = new THREE.Mesh(merge(parts), M.flat);
  stat.castShadow = true; stat.receiveShadow = true; g.add(stat);

  // the vehicle: a slender stage, a dark interstage with stowed grid fins, a short second stage and an ogive fairing
  const Y0 = 0.155, RR = 0.056, rp = [], SEG = 20;
  rp.push(paint(new THREE.LatheGeometry(V2([[0, Y0], [RR * 0.9, Y0], [RR, Y0 + 0.03]]), SEG), "#262725"));
  rp.push(paint(new THREE.LatheGeometry(V2([[RR, Y0 + 0.03], [RR, Y0 + 0.86]]), SEG), "#efeee9"));
  rp.push(paint(new THREE.LatheGeometry(V2([[RR, Y0 + 0.86], [RR, Y0 + 0.97]]), SEG), "#1e1f1e"));
  rp.push(paint(new THREE.LatheGeometry(V2([[RR, Y0 + 0.97], [RR, Y0 + 1.16]]), SEG), "#efeee9"));
  rp.push(paint(new THREE.LatheGeometry(V2([[RR * 1.01, Y0 + 1.16], [RR * 1.01, Y0 + 1.172]]), SEG), "#a19f99"));
  const og = [];
  for (let k = 0; k <= 12; k++) { const s = k / 12; og.push([RR * Math.pow(Math.cos((s * Math.PI) / 2), 0.6) + 1e-4, Y0 + 1.172 + s * 0.36]); }
  rp.push(paint(new THREE.LatheGeometry(V2(og), SEG), "#efeee9"));
  for (let k = 0; k < 4; k++) {
    const fin = gridFin("#3a3b39");
    fin.translate(0, 0, RR + 0.007); fin.rotateY((k * Math.PI) / 2 + Math.PI / 4); fin.translate(0, Y0 + 0.885, 0);
    rp.push(fin);
    const leg = new THREE.BoxGeometry(0.014, 0.25, 0.008);
    leg.translate(0, 0, RR + 0.003); leg.rotateY((k * Math.PI) / 2); leg.translate(0, Y0 + 0.16, 0);
    rp.push(paint(leg, "#2a2b2a"));
  }
  const rocket = new THREE.Mesh(merge(rp), M.smooth);
  rocket.castShadow = true; rocket.receiveShadow = true; g.add(rocket);

  // vapour: deluge steam out of the trench, boil-off from the interstage
  const steamMat = kit.hook(new THREE.MeshStandardMaterial({ color: "#f5f3ee", emissive: "#56544f", flatShading: true, roughness: 1, metalness: 0 }), fadeU);
  const steam = puffs(steamMat, 120);
  g.add(steam.mesh);
  let t = 0, eT = 0, eV = 0;
  const ventMk = marker(g, 0.72, 0.1, 0);
  return {
    group: g,
    update(dt) {
      t += dt; bob(bits, t, dt);
      eT += dt * 20; eV += dt * 8;
      while (eT > 1) { eT--; steam.emit({ x: 0.5 + R() * 0.08, y: 0.02, z: (R() - 0.5) * 0.08, vx: 0.22 + R() * 0.16, vy: 0.05 + R() * 0.08, vz: (R() - 0.5) * 0.12, life: 2.2 + R() * 1.3, size: 0.05 + R() * 0.06, lift: 0.06 }); }
      while (eV > 1) { eV--; steam.emit({ x: RR + 0.004, y: Y0 + 0.9 + R() * 0.06, z: (R() - 0.5) * 0.04, vx: 0.05 + R() * 0.03, vy: -0.015 - R() * 0.02, vz: (R() - 0.5) * 0.03 + 0.02, life: 1.8 + R() * 1, size: 0.018 + R() * 0.02, lift: -0.01 }); }
      steam.step(dt);
      ventMk.position.set(0.7 + 0.03 * Math.sin(t * 0.8), 0.09, 0.02 * Math.sin(t * 0.6));
    },
    dets: [
      { cls: "main", at: marker(g, 0, Y0 + 0.62, 0), obj: rocket },
      { cls: "blue", at: marker(g, TX, 0.95, TZ), size: [0.14, 1.75, 0.14] },
      { cls: "blue", at: marker(g, tank.x, tank.y, tank.z), size: [0.2, 0.2, 0.2] },
      { cls: "red", at: ventMk, size: [0.22, 0.14, 0.16] },
    ],
    links: [[1, 2], [1, 3]],
  };
}

// ================================================================ 3. sea: a wing sail drone
function airfoil(c, th, n = 10) {
  const up = [], lo = [];
  for (let k = 0; k <= n; k++) {
    const x = (1 - Math.cos((k / n) * Math.PI)) / 2, t = 5 * th * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    up.push([x * c, t * c]); lo.push([x * c, -t * c]);
  }
  return new THREE.Shape(V2(up.concat(lo.reverse().slice(1, -1))));
}
function foil(c, th, h, y0) { // stands up along +y, chord along -z from a quarter-chord pivot
  const g = new THREE.ExtrudeGeometry(airfoil(c, th), { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(0, y0, c * 0.25);
  return g;
}
function buildSea(fadeU, kit) {
  const M = kit.materials(fadeU), g = new THREE.Group();
  const W = (x, z, t) => 0.032 * Math.sin(5.2 * x + 3.1 * z - 1.9 * t) + 0.02 * Math.sin(-3.4 * x + 5.9 * z - 2.3 * t + 1) + 0.009 * Math.sin(10.5 * x + 7.6 * z - 3.6 * t + 2);
  const ch = chunk({
    seed: 29, height: () => 0, noTop: true, rings: 12, segs: 64, rough: 0.7, flatStrata: true,
    strata: [{ d: 0.12, c: "#3f7c98", j: 0.03 }, { d: 0.14, c: "#306781", j: 0.03 }, { d: 0.12, c: "#25536b", j: 0.03 }, { d: 0.06, c: "#cdb98e" }, { d: 0.14, c: "#7e776b", j: 0.08, rock: true }],
  });
  const walls = new THREE.Mesh(ch.geo, M.flat);
  walls.receiveShadow = true; g.add(walls);
  const bits = debris(g, ch, ["#7e776b", "#cdb98e"], 31, M.flat);
  // the water: same rim as the walls, so the cut edge rides the waves
  const N = ch.N, RG = ch.M, wp = [0, 0, 0], wi = [];
  for (let j = 1; j <= RG; j++) for (let i = 0; i < N; i++) { const p = ch.grid[j][i]; wp.push(p[0], 0, p[2]); }
  const idx = (j, i) => (j === 0 ? 0 : 1 + (j - 1) * N + (i % N));
  for (let i = 0; i < N; i++) wi.push(idx(0, 0), idx(1, i), idx(1, i + 1));
  for (let j = 1; j < RG; j++) for (let i = 0; i < N; i++) { const a = idx(j, i), b = idx(j + 1, i), c = idx(j + 1, i + 1), d = idx(j, i + 1); wi.push(a, b, c, a, c, d); }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
  wg.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(wp.length), 3));
  wg.setIndex(wi);
  wg.computeVertexNormals();
  const waterMat = kit.hook(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0 }), fadeU);
  const water = new THREE.Mesh(wg, waterMat);
  water.receiveShadow = true; g.add(water);
  const deep = new THREE.Color("#215b7a"), crest = new THREE.Color("#5ea2b9"), foam = new THREE.Color("#e4eeec");

  // the drone: a white hull with an orange belly, solar deck, and the rigid wing
  const hp = [];
  for (let k = 0; k <= 14; k++) { const s = k / 14; let rad = 0.03 * Math.pow(Math.sin(Math.PI * s), 0.5); if (s > 0.6) rad *= 1 - ((s - 0.6) / 0.4) * 0.4; hp.push([Math.max(rad, 0.0006), (s - 0.5) * 0.44]); }
  const hull = new THREE.LatheGeometry(V2(hp), 10);
  hull.rotateX(Math.PI / 2); hull.scale(1, 0.55, 1);
  const dParts = [paintBy(hull, (x, y) => _c.set(y < -0.003 ? "#e2602a" : "#f0eee8"))];
  dParts.push(paint(xfBox(0.032, 0.004, 0.17, 0, 0.017, -0.01), "#283748"));
  dParts.push(paint(xfBox(0.006, 0.1, 0.075, 0, -0.06, -0.01), "#2a2a28"));
  const drone = new THREE.Group();
  drone.rotation.order = "YXZ"; g.add(drone);
  const hullMesh = new THREE.Mesh(merge(dParts), M.smooth);
  hullMesh.castShadow = true; hullMesh.receiveShadow = true; drone.add(hullMesh);
  const sail = new THREE.Group();
  sail.position.set(0, 0.016, 0.03); drone.add(sail);
  const sParts = [paint(foil(0.085, 0.16, 0.27, 0), "#f06a22"), paint(foil(0.085, 0.16, 0.04, 0.27), "#f0eee8")];
  sParts.push(bar([0, 0.055, -0.05], [0, 0.055, -0.2], 0.005, "#2c2d2b"), paint(foil(0.032, 0.14, 0.075, 0.02), "#f06a22").translate(0, 0, -0.2));
  sParts.push(paint(xfBox(0.012, 0.012, 0.02, 0, 0.318, 0), "#2c2d2b"), bar([0, 0.31, 0], [0, 0.37, 0], 0.003, "#2c2d2b"));
  const sailMesh = new THREE.Mesh(merge(sParts), M.smooth);
  sailMesh.castShadow = true; sail.add(sailMesh);

  // a gull working the wind
  const gull = new THREE.Group();
  gull.rotation.order = "YXZ"; g.add(gull);
  const gb = new THREE.ConeGeometry(0.009, 0.055, 5);
  gb.rotateX(Math.PI / 2);
  gull.add(new THREE.Mesh(paint(gb, "#f1efea", 0.04), M.flat));
  const gwPts = [[0, 0.012], [0.03, 0.014], [0.06, 0.004], [0.088, -0.012], [0.052, -0.008], [0.02, -0.014], [0, -0.012]];
  const gwR = new THREE.Group(), gwL = new THREE.Group();
  gull.add(gwR, gwL);
  for (const [grp, mir] of [[gwR, false], [gwL, true]]) {
    const gg = new THREE.ShapeGeometry(new THREE.Shape(V2(gwPts)));
    gg.rotateX(Math.PI / 2);
    if (mir) gg.scale(-1, 1, 1);
    const m = new THREE.Mesh(paintBy(gg, (x) => _c.set(Math.abs(x) > 0.062 ? "#1f2123" : "#9ba2a7")), M.flat2);
    m.castShadow = true; grp.add(m);
  }
  gull.scale.setScalar(2);
  drone.scale.setScalar(1.8);

  let t = 0, psi = 0, roll = 0, pitch = 0, heave = 0, trim = 0;
  const swellMk = marker(g, -0.52, 0, 0.3);
  const posArr = wg.attributes.position.array, colArr = wg.attributes.color.array, wallPos = ch.geo.attributes.position.array;
  return {
    group: g,
    update(dt) {
      t += dt; bob(bits, t, dt);
      for (let v = 0; v < posArr.length / 3; v++) {
        const x = posArr[v * 3], z = posArr[v * 3 + 2], y = W(x, z, t);
        posArr[v * 3 + 1] = y;
        _c.copy(deep).lerp(crest, smooth(-0.04, 0.05, y));
        if (y > 0.05) _c.lerp(foam, smooth(0.05, 0.06, y));
        colArr[v * 3] = _c.r; colArr[v * 3 + 1] = _c.g; colArr[v * 3 + 2] = _c.b;
      }
      wg.attributes.position.needsUpdate = true;
      wg.attributes.color.needsUpdate = true;
      for (const [vi, ri] of ch.rimMap) { const p = ch.grid[RG][ri]; wallPos[vi * 3 + 1] = W(p[0], p[2], t); }
      ch.geo.attributes.position.needsUpdate = true;
      // the drone holds station, rides the swell, trims its wing
      const dx = 0.04 + 0.06 * Math.sin(t * 0.11), dz = 0.08 * Math.cos(t * 0.09);
      psi = 0.95 + 0.16 * Math.sin(t * 0.17);
      const fx = Math.sin(psi), fz = Math.cos(psi), sx = fz, sz = -fx;
      const bow = W(dx + fx * 0.34, dz + fz * 0.34, t), stern = W(dx - fx * 0.34, dz - fz * 0.34, t), port = W(dx + sx * 0.1, dz + sz * 0.1, t), stb = W(dx - sx * 0.1, dz - sz * 0.1, t);
      pitch = lerp(pitch, Math.atan2(bow - stern, 0.68), 0.2);
      roll = lerp(roll, Math.atan2(port - stb, 0.2) * 0.7, 0.15);
      heave = W(dx, dz, t);
      drone.position.set(dx, heave + 0.014, dz);
      drone.rotation.set(-pitch, psi, roll);
      trim = 0.42 + 0.12 * Math.sin(t * 0.23);
      sail.rotation.y = trim;
      // gull
      const a = t * 0.38, gx = -0.06 + 0.6 * Math.cos(a), gz = -0.12 + 0.44 * Math.sin(a);
      gull.position.set(gx, 0.78 + 0.05 * Math.sin(t * 0.9), gz);
      gull.rotation.set(0, Math.atan2(-Math.sin(a) * 0.6, Math.cos(a) * 0.44), -0.3);
      const glide = smooth(0.4, 0.8, Math.sin(t * 0.7));
      const fl = (1 - glide) * 0.55 * Math.sin(t * 2.6 * TAU) + 0.12;
      gwR.rotation.z = fl; gwL.rotation.z = -fl;
      swellMk.position.y = W(-0.52, 0.3, t) + 0.01;
    },
    dets: [
      { cls: "main", at: marker(drone, 0, 0.02, -0.01), obj: drone },
      { cls: "blue", at: marker(sail, 0, 0.15, -0.01), size: [0.12, 0.32, 0.12] },
      { cls: "blue", at: swellMk, size: [0.24, 0.1, 0.24] },
      { cls: "red", at: marker(gull, 0, 0, 0), obj: gull },
    ],
    links: [[1, 2], [2, 3]],
  };
}

// ================================================================ 4. burned slope: reseeded by drone
function buildSlope(fadeU, kit) {
  const M = kit.materials(fadeU), g = new THREE.Group(), R = rng(404);
  const H = (x, z) => -0.26 * z + 0.03 * Math.sin(3.2 * x + 0.5) * Math.cos(2.4 * z) + 0.012 * Math.sin(8.1 * x - 5.3 * z);
  const burnt = ["#2d2825", "#382f29", "#433830", "#544b43"].map((h) => new THREE.Color(h));
  const ch = chunk({
    seed: 41, height: H, rings: 8,
    top: (x, y, z, r) => {
      const n = Math.sin(x * 4.1 + z * 2.3) + Math.sin(z * 5.7 - x * 1.9), m = Math.sin(x * 7.3 + z * 3.1) * 0.5 + Math.sin(z * 8.9 - x * 4.7) * 0.5;
      if (n > 1.0 && r() < 0.85) return _c.set(n > 1.4 ? "#6a8c3a" : "#5a7832").offsetHSL(0, 0, (r() - 0.5) * 0.04);
      return burnt[clamp(Math.floor((m * 0.5 + 0.5) * 4 + (r() - 0.5) * 0.8), 0, 3)].clone().offsetHSL(0, 0, (r() - 0.5) * 0.02);
    },
    strata: [{ d: 0.05, c: "#28211b" }, { d: 0.11, c: "#5a4331" }, { d: 0.12, c: "#86694c" }, { d: 0.16, c: "#837b6e", j: 0.08, rock: true }, { d: 0.1, c: "#6d675f", rock: true }],
  });
  const ground = new THREE.Mesh(ch.geo, M.flat);
  ground.receiveShadow = true; ground.castShadow = true; g.add(ground);
  const bits = debris(g, ch, ["#5a4331", "#86694c", "#837b6e"], 43, M.flat);

  // stumps with broken tops, one standing snag, a fallen log, some rock
  const sp = [], stumps = [[-0.42, 0.18, 0.06, 0.2], [0.34, 0.3, 0.055, 0.13], [0.08, -0.28, 0.068, 0.28], [-0.2, -0.5, 0.05, 0.17], [0.55, -0.2, 0.055, 0.23], [-0.6, -0.12, 0.045, 0.12], [0.2, 0.52, 0.042, 0.09]];
  stumps.forEach(([x, z, rad, h], i) => {
    const c = new THREE.CylinderGeometry(rad * 0.85, rad, h, 7, 2);
    const p = c.attributes.position;
    for (let v = 0; v < p.count; v++) if (p.getY(v) > h / 2 - 1e-4) { const a = Math.atan2(p.getZ(v), p.getX(v)); p.setY(v, h / 2 - (Math.sin(a * 2 + i) * 0.5 + 0.5) * h * 0.35); }
    c.translate(x, H(x, z) + h / 2 - 0.01, z);
    sp.push(paintBy(c, (cx, cy) => _c.set(cy > H(x, z) + h * 0.55 ? "#4a3f35" : "#1f1c19").offsetHSL(0, 0, (R() - 0.5) * 0.05)));
  });
  const snag = [-0.22, -0.2], sh = 0.4;
  {
    const c = new THREE.CylinderGeometry(0.022, 0.038, sh, 7, 3), p = c.attributes.position;
    for (let v = 0; v < p.count; v++) if (p.getY(v) > sh / 2 - 1e-4) p.setY(v, sh / 2 - (Math.sin(Math.atan2(p.getZ(v), p.getX(v)) * 3) * 0.5 + 0.5) * 0.09);
    c.translate(snag[0], H(...snag) + sh / 2 - 0.01, snag[1]);
    sp.push(paintBy(c, (cx, cy) => _c.set(cy > H(...snag) + sh * 0.8 ? "#4a3f35" : "#262120").offsetHSL(0, 0, (R() - 0.5) * 0.05)));
  }
  sp.push(bar([snag[0], H(...snag) + 0.24, snag[1]], [snag[0] + 0.1, H(...snag) + 0.31, snag[1] + 0.02], 0.013, "#262120"), bar([snag[0], H(...snag) + 0.3, snag[1]], [snag[0] - 0.07, H(...snag) + 0.35, snag[1] - 0.03], 0.011, "#262120"));
  const log = new THREE.CylinderGeometry(0.03, 0.034, 0.44, 7);
  log.rotateZ(Math.PI / 2); log.rotateY(0.3); log.translate(-0.26, H(-0.26, 0.4) + 0.025, 0.4);
  sp.push(paint(log, "#2b2520", 0.08));
  for (let k = 0; k < 5; k++) { const x = (R() - 0.5) * 1.2, z = (R() - 0.5) * 1.1, r0 = 0.02 + R() * 0.025; sp.push(paint(new THREE.IcosahedronGeometry(r0, 0).translate(x, H(x, z) + r0 * 0.4, z), "#7c766c", 0.1, k)); }
  const stat = new THREE.Mesh(merge(sp), M.flat);
  stat.castShadow = true; stat.receiveShadow = true; g.add(stat);

  // seedlings: an instanced field, more sprouting where the pods land
  const sg = merge([paint(new THREE.CylinderGeometry(0.003, 0.004, 0.03, 5).translate(0, 0.015, 0), "#6a5340"), paint(new THREE.ConeGeometry(0.024, 0.05, 6).translate(0, 0.048, 0), "#ffffff", 0.1), paint(new THREE.ConeGeometry(0.017, 0.038, 6).translate(0, 0.075, 0), "#ffffff", 0.1, 2)]);
  const CAP = 72, seeds = new THREE.InstancedMesh(sg, M.flat, CAP);
  const greens = ["#6fa23e", "#84b84a", "#5d8f35", "#78ad42"];
  const field = [];
  const setSeed = (i, s, k) => seeds.setMatrixAt(i, placeMatrix(s.x, s.y, s.z, 0, s.rot, 0, Math.max(1e-4, s.scale * k)));
  const base = 18;
  for (let i = 0; i < CAP; i++) {
    seeds.setColorAt(i, _c.set(greens[i % 4]).offsetHSL(0, 0, (R() - 0.5) * 0.05));
    if (i < base) {
      let x, z;
      do { x = (R() - 0.5) * 1.4; z = (R() - 0.5) * 1.3; } while (x * x + z * z > 0.62 || stumps.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 0.09));
      const s = { x, z, y: H(x, z) - 0.004, rot: R() * TAU, scale: 1.1 + R() * 0.9, born: -9 };
      field.push(s);
      setSeed(i, s, 1);
    } else seeds.setMatrixAt(i, placeMatrix(0, -9, 0, 0, 0, 0, 0));
  }
  seeds.castShadow = true; seeds.receiveShadow = true; g.add(seeds);
  const older = field.reduce((a, b) => (b.z > -0.2 && b.scale > a.scale ? b : a), field[0]);

  // the drone: white body, dark arms, blurred rotors, a seed hopper underneath
  const quad = new THREE.Group();
  quad.rotation.order = "YXZ"; g.add(quad);
  const qp = [paint(new THREE.BoxGeometry(0.06, 0.024, 0.072), "#ecebe5", 0.03)];
  const dome = new THREE.SphereGeometry(0.022, 8, 4, 0, TAU, 0, Math.PI / 2);
  dome.scale(1, 0.5, 1.2); dome.translate(0, 0.01, 0);
  qp.push(paint(dome, "#2b2d2b"));
  qp.push(bar([-0.07, 0.004, -0.07], [0.07, 0.004, 0.07], 0.007, "#2b2c2a"), bar([-0.07, 0.004, 0.07], [0.07, 0.004, -0.07], 0.007, "#2b2c2a"));
  for (const [x, z] of [[0.07, 0.07], [-0.07, 0.07], [0.07, -0.07], [-0.07, -0.07]]) qp.push(paint(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 8).translate(x, 0.012, z), "#2b2c2a"));
  qp.push(paint(new THREE.CylinderGeometry(0.017, 0.012, 0.03, 8).translate(0, -0.024, 0), "#4b5a44"), paint(new THREE.ConeGeometry(0.006, 0.01, 6).rotateX(Math.PI).translate(0, -0.043, 0), "#2b2c2a"));
  qp.push(bar([-0.025, -0.03, -0.03], [-0.025, -0.03, 0.03], 0.004, "#2b2c2a"), bar([0.025, -0.03, -0.03], [0.025, -0.03, 0.03], 0.004, "#2b2c2a"), bar([-0.025, -0.01, 0], [-0.025, -0.03, 0], 0.004, "#2b2c2a"), bar([0.025, -0.01, 0], [0.025, -0.03, 0], 0.004, "#2b2c2a"));
  const qMesh = new THREE.Mesh(merge(qp), M.flat);
  qMesh.castShadow = true; quad.add(qMesh);
  const discMat = new THREE.MeshBasicMaterial({ color: "#d9d7d0", transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
  const props = [];
  for (const [x, z] of [[0.07, 0.07], [-0.07, 0.07], [0.07, -0.07], [-0.07, -0.07]]) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.042, 18).rotateX(-Math.PI / 2), discMat);
    d.position.set(x, 0.021, z); quad.add(d);
    const pr = new THREE.Mesh(paint(new THREE.BoxGeometry(0.078, 0.002, 0.007), "#222322"), M.flat);
    pr.position.set(x, 0.022, z); quad.add(pr); props.push(pr);
  }
  quad.scale.setScalar(2);
  const PODS = 16, pods = new THREE.InstancedMesh(paint(new THREE.IcosahedronGeometry(0.008, 0), "#6b4a2b"), M.flat, PODS);
  const podS = Array.from({ length: PODS }, () => ({ on: false, x: 0, y: 0, z: 0, vy: 0, vx: 0, vz: 0 }));
  for (let i = 0; i < PODS; i++) pods.setMatrixAt(i, placeMatrix(0, -9, 0, 0, 0, 0, 0));
  pods.castShadow = true; g.add(pods);

  let t = 0, dropT = 0, podNext = 0, yaw = 0;
  const qAt = marker(quad, 0, 0, 0);
  const newMk = marker(g, older.x, older.y + 0.06, older.z), oldMk = marker(g, older.x, older.y + 0.07 * older.scale, older.z);
  const qpos = (u) => [0.52 * Math.sin(u * 0.55), 0.06 + 0.3 * Math.sin(u * 0.55 * 0.37 + 1)];
  const reset = () => {
    for (let i = base; i < CAP; i++) seeds.setMatrixAt(i, placeMatrix(0, -9, 0, 0, 0, 0, 0));
    field.length = base;
    seeds.instanceMatrix.needsUpdate = true;
    for (const p of podS) p.on = false;
  };
  return {
    group: g,
    reset,
    update(dt) {
      t += dt; bob(bits, t, dt);
      const [x, z] = qpos(t), [x2, z2] = qpos(t + 0.05), vx = (x2 - x) / 0.05, vz = (z2 - z) / 0.05, spd = Math.hypot(vx, vz);
      const y = H(x, z) + 0.4 + 0.012 * Math.sin(t * 2.1);
      const ty = Math.atan2(vx, vz);
      let d = ty - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, dt * 3);
      quad.position.set(x, y, z);
      quad.rotation.set(clamp(spd * 0.5, 0, 0.3), yaw, clamp(-d * 0.8, -0.25, 0.25));
      for (let i = 0; i < props.length; i++) props[i].rotation.y += dt * (31 + i * 3) * (i % 2 ? 1 : -1);
      // drop a pod every so often; where it lands, a seedling comes up
      dropT += dt;
      if (dropT > 0.42) {
        dropT = 0;
        const p = podS[podNext];
        podNext = (podNext + 1) % PODS;
        Object.assign(p, { on: true, x, y: y - 0.09, z, vx: vx * 0.35, vz: vz * 0.35, vy: -0.05 });
      }
      for (let i = 0; i < PODS; i++) {
        const p = podS[i];
        if (!p.on) continue;
        p.vy -= 1.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const gy = H(p.x, p.z);
        if (p.y <= gy + 0.005) {
          p.on = false;
          pods.setMatrixAt(i, placeMatrix(0, -9, 0, 0, 0, 0, 0));
          if (p.x * p.x + p.z * p.z < 0.72 && field.length < CAP) field.push({ x: p.x, z: p.z, y: gy - 0.004, rot: R() * TAU, scale: 0.75 + R() * 0.4, born: t });
        } else pods.setMatrixAt(i, placeMatrix(p.x, p.y, p.z, 0, 0, 0, 1));
      }
      pods.instanceMatrix.needsUpdate = true;
      let grew = false;
      for (let i = base; i < field.length; i++) { const s = field[i], u = (t - s.born) / 1.1; if (u < 1.2) { const k = u >= 1 ? 1 : 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2); setSeed(i, s, clamp(k, 0, 1.2)); grew = true; } }
      if (grew) seeds.instanceMatrix.needsUpdate = true;
      const nw = field.length > base ? field[field.length - 1] : field[2];
      newMk.position.set(nw.x, nw.y + 0.05 * nw.scale, nw.z);
    },
    dets: [
      { cls: "main", at: qAt, obj: quad },
      { cls: "blue", at: newMk, size: [0.07, 0.1, 0.07] },
      { cls: "blue", at: oldMk, size: [0.08, 0.12, 0.08] },
      { cls: "red", at: marker(g, stumps[0][0], H(stumps[0][0], stumps[0][1]) + 0.08, stumps[0][1]), size: [0.11, 0.18, 0.11] },
      { cls: "red", at: marker(g, stumps[2][0], H(stumps[2][0], stumps[2][1]) + 0.1, stumps[2][1]), size: [0.12, 0.24, 0.12] },
    ],
    links: [[1, 2], [3, 2], [4, 1]],
  };
}

// ================================================================ the piece
const RING = 1.6;
const mod4 = (n) => ((n % 4) + 4) % 4;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const stage = document.createElement("div");
  stage.style.cssText = `position:absolute;inset:0;overflow:hidden;cursor:pointer;user-select:none;-webkit-user-select:none;background:${v["colour.ground"]}`;
  const glc = document.createElement("canvas"), ac = document.createElement("canvas");
  glc.style.cssText = "position:absolute;display:block";
  ac.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  for (const c of [glc, ac]) c.setAttribute("aria-hidden", "true");
  stage.append(glc, ac);
  host.append(stage);
  const g2 = ac.getContext("2d");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: "high-performance" });
  } catch {
    return { update() {}, action() {}, destroy: () => stage.remove() };
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 60);
  camera.layers.enable(1); // layer 1: the soft floor shadows, left out of the click views

  const hemi = new THREE.HemisphereLight("#f4f1e8", "#5a5244", 1.35);
  const sun = new THREE.DirectionalLight("#fff3df", 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 2.1, bottom: -1.4, near: 0.5, far: 16 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.012;
  scene.add(hemi, sun, sun.target);

  const swayT = { value: 0 }, kit = makeKit(swayT);
  // the turntable
  const turntable = new THREE.Group();
  scene.add(turntable);
  const blobTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const c = cv.getContext("2d");
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 63);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.35, "#9a9a9a"); gr.addColorStop(0.7, "#2c2c2c"); gr.addColorStop(1, "#000000");
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  })();
  const scenes = [buildMeadow, buildLaunch, buildSea, buildSlope].map((fn, i) => {
    const fadeU = { value: i === 0 ? 1 : 0 }, sc = fn(fadeU, kit), holder = new THREE.Group(), a = (i * Math.PI) / 2;
    holder.position.set(Math.sin(a) * RING, 0, Math.cos(a) * RING);
    holder.rotation.y = a;
    holder.add(sc.group);
    turntable.add(holder);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#0b0d0c", alphaMap: blobTex, transparent: true, depthWrite: false, opacity: 0.12 }));
    blob.position.y = -1.08;
    blob.layers.set(1);
    holder.add(blob);
    sc.group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    return Object.assign(sc, { fadeU, holder, blob, index: i, fade: i === 0 ? 1 : 0 });
  });

  // post: the glitch on the turn. The last held frame is kept; through the turn some
  // macroblocks hang on to it and slide along the direction of the turn (a datamosh),
  // some rows are smeared from the start of a run (a pixel sort), and a few blocks take
  // a lilac cast. All of it scales with one amount.
  const rtScene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const rtPrev = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const postMat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rtScene.texture }, tPrev: { value: rtPrev.texture }, uAmt: { value: 0 }, uTime: { value: 0 }, uDir: { value: 1 }, uProg: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uDpr: { value: 1 }, uTint: { value: new THREE.Color("#9d8fd8") }, uGround: { value: new THREE.Color() } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: `
      uniform sampler2D tScene, tPrev; uniform float uAmt, uTime, uDir, uProg, uDpr; uniform vec2 uRes; uniform vec3 uTint, uGround;
      varying vec2 vUv;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      vec3 srgb(vec3 c) { c = max(c, 0.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
      void main() {
        vec2 uv = vUv, px = uv * uRes;
        vec3 col = texture2D(tScene, uv).rgb;
        float st = floor(uTime * 14.);
        float bs = 12. * uDpr * (1. + floor(h21(vec2(st, 7.)) * 3.));
        vec2 cell = floor(px / bs);
        float band = h21(vec2(floor(px.y / (bs * 3.)), st));
        // only where there is something to break: a block over bare ground stays ground
        vec2 cc = (cell + .5) * bs / uRes;
        float busy = step(.03, distance(texture2D(tScene, cc).rgb, uGround)) + step(.03, distance(texture2D(tPrev, cc).rgb, uGround));
        if (busy > 0. && h21(cell + st * .13) * (.5 + band) < uAmt * .38) {
          float slide = uDir * (.01 + .1 * h21(cell + 3.1)) * uProg;
          col = texture2D(tPrev, uv + vec2(slide, 0.)).rgb;
        }
        float row = floor(px.y / (2. * uDpr));
        if (h21(vec2(row, floor(uTime * 9.))) < uAmt * .16) {
          float run = (24. + 150. * h21(vec2(row, 5.))) * uDpr, x0 = floor(px.x / run) * run;
          vec3 s = texture2D(tScene, vec2((x0 + (px.x - x0) * .12) / uRes.x, uv.y)).rgb;
          col = mix(col, s, .9);
        }
        if (busy > 0. && h21(cell * 1.7 + st) < uAmt * .1) col = mix(col, uTint, .3);
        gl_FragColor = vec4(srgb(col), 1.);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  postQuad.frustumCulled = false;
  postScene.add(postQuad);
  const normalMat = new THREE.MeshNormalMaterial({ flatShading: true });
  // the crops read lilac: the normals pass, pulled toward it
  normalMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("packNormalToRGB( normal )", "mix(packNormalToRGB( normal ), vec3(.68, .62, .93), .4)"); };
  const depthMat = new THREE.MeshDepthMaterial();

  // ================================================================ layout
  let W = 1, Hh = 1, dpr = 1, insetPx = 300;
  const glR = { x: 0, y: 0, s: 1 };
  function layout() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    Hh = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    // a phone gets a floor, or the notation swamps a tiny scene
    insetPx = Math.max(v["scene.size"] * Math.min(W, Hh), Math.min(Math.min(W, Hh) * 0.58, 230));
    const s = Math.round(Math.min(Math.max(W, Hh), insetPx * 2.7));
    glR.s = s;
    glR.x = Math.round((W - s) / 2);
    glR.y = Math.round((Hh - s) / 2 - insetPx * 0.05);
    Object.assign(glc.style, { left: glR.x + "px", top: glR.y + "px", width: s + "px", height: s + "px" });
    renderer.setPixelRatio(dpr);
    renderer.setSize(s, s, false);
    rtScene.setSize(s * dpr, s * dpr);
    rtPrev.setSize(s * dpr, s * dpr);
    postMat.uniforms.uRes.value.set(s * dpr, s * dpr);
    postMat.uniforms.uDpr.value = dpr;
    ac.width = Math.round(W * dpr);
    ac.height = Math.round(Hh * dpr);
  }

  // ================================================================ the turn
  // S counts quarter turns. While holding it creeps (the drift); a turn is a cubic Hermite
  // from wherever S is, at whatever speed it has, to the next stop, arriving at the creep
  // speed, so the whole motion is one continuous curve.
  let now = 0, S = 0, dS = 0, target = 0, turn = null, holdT0 = 0, annScene = 0, annT0 = 0, annA = 1, viewRect = null;
  const creep = () => { const d = DRIFT / 90; return { d, vel: (2 * d) / Math.max(0.5, v["turn.hold"]) }; };
  function planTurn(to) {
    if (to === target && !turn) return;
    if (reduced) {
      // a still piece jumps straight to the next stop
      target = to; S = to; dS = 0; turn = null; arrive(); annT0 = now - 9; return;
    }
    const { d, vel } = creep(), dist = Math.abs(to - S), T = v["turn.time"] * Math.max(1, Math.sqrt(dist));
    if (!turn && v["turn.glitch"] > 0) { renderer.setRenderTarget(rtPrev); renderer.render(scene, camera); renderer.setRenderTarget(null); }
    turn = { a0: turn ? 0 : annA, t0: now, T, p0: S, m0: dS * T, p1: to - d * Math.sign(to - S || 1), m1: vel * T * Math.sign(to - S || 1), dir: Math.sign(to - S) || 1 };
    target = to;
  }
  const step = (k) => planTurn(target + k);
  function advanceS(dt) {
    const { vel } = creep();
    if (turn) {
      const s = (now - turn.t0) / turn.T;
      if (s >= 1) { S = turn.p1; dS = turn.m1 / turn.T; turn = null; arrive(); }
      else {
        const s2 = s * s, s3 = s2 * s;
        S = (2 * s3 - 3 * s2 + 1) * turn.p0 + (s3 - 2 * s2 + s) * turn.m0 + (-2 * s3 + 3 * s2) * turn.p1 + (s3 - s2) * turn.m1;
        dS = ((6 * s2 - 6 * s) * turn.p0 + (3 * s2 - 4 * s + 1) * turn.m0 + (-6 * s2 + 6 * s) * turn.p1 + (3 * s2 - 2 * s) * turn.m1) / turn.T;
      }
    } else {
      S += vel * dt;
      dS = vel;
      if (now - holdT0 >= v["turn.hold"]) planTurn(target + 1);
    }
  }
  function arrive() {
    holdT0 = now;
    annScene = mod4(target);
    annT0 = now;
    for (const c of cursors) { c.phase = "idle"; c.wait = c.delay; }
    for (const d of scenes[annScene].dets) d.hl = -9;
  }

  // ================================================================ notation
  const cursors = [
    { x: 0, y: 0, sx: 0, sy: 0, phase: "idle", t0: 0, dur: 1, target: -1, delay: 0.7, wait: 0.7, seen: false, r: rng(5) },
    { x: 0, y: 0, sx: 0, sy: 0, phase: "idle", t0: 0, dur: 1, target: -1, delay: 2.1, wait: 2.1, seen: false, r: rng(9) },
  ];
  const _box = new THREE.Box3(), _sz = new THREE.Vector3(), _ctr = new THREE.Vector3();
  const project = (obj) => { obj.getWorldPosition(_v); _v.project(camera); return [glR.x + ((_v.x + 1) / 2) * glR.s, glR.y + ((1 - _v.y) / 2) * glR.s]; };
  function screenBox(d) {
    let b;
    if (d.size) { d.at.getWorldPosition(_ctr); b = _box.setFromCenterAndSize(_ctr, _sz.set(...d.size)); }
    else b = _box.setFromObject(d.obj);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
      const x = glR.x + ((_v.x + 1) / 2) * glR.s, y = glR.y + ((1 - _v.y) / 2) * glR.s;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return [x0 - 3, y0 - 3, x1 + 3, y1 + 3];
  }
  const lineColour = () => (lumOf(v["colour.ground"]) > 0.45 ? INK : v["colour.signal"]);
  const clsColor = (c) => (c === "main" ? v["colour.signal"] : c === "blue" ? BLUE : RED);
  const hlEnv = (d) => { const u = now - d.hl; return u < 0 || u > 1.5 ? 0 : u < 0.16 ? easeOut(u / 0.16) : u < 1.15 ? 1 : 1 - (u - 1.15) / 0.35; };

  function updateCursors(dt, dets, pts) {
    for (const c of cursors) {
      const tp = (i) => [pts[i][0] + 1, pts[i][1] + 1];
      if (c.phase === "idle") {
        c.wait -= dt;
        if (c.wait <= 0) {
          const other = cursors.find((o) => o !== c).target, opts = dets.map((_, i) => i).filter((i) => i !== c.target && i !== other);
          c.target = opts[Math.floor(c.r() * opts.length)] ?? 0;
          const [tx, ty] = tp(c.target);
          if (!c.seen) { const a = c.r() * TAU; c.x = tx + Math.cos(a) * insetPx * 0.35; c.y = ty + Math.abs(Math.sin(a)) * insetPx * 0.3 + 20; c.seen = true; }
          c.sx = c.x; c.sy = c.y; c.t0 = now; c.dur = 0.8 + c.r() * 0.6; c.bend = (c.r() - 0.5) * 0.5; c.phase = "move";
        }
      } else if (c.phase === "move") {
        const u = clamp((now - c.t0) / c.dur, 0, 1), e = easeIO(u), [tx, ty] = tp(c.target);
        const dx = tx - c.sx, dy = ty - c.sy;
        c.x = c.sx + dx * e - dy * c.bend * Math.sin(Math.PI * u);
        c.y = c.sy + dy * e + dx * c.bend * Math.sin(Math.PI * u);
        if (u >= 1) { c.phase = "click"; c.t0 = now; dets[c.target].hl = now; }
      } else if (c.phase === "click" || c.phase === "rest") {
        const [tx, ty] = tp(c.target), k = 1 - Math.exp(-dt * 10);
        const off = c.phase === "rest" ? Math.min(1, (now - c.t0 - 0.9) / 1.2) * 14 : 0;
        c.x = lerp(c.x, tx + off * 0.7, k);
        c.y = lerp(c.y, ty + off, k);
        if (c.phase === "click" && now - c.t0 > 0.9) c.phase = "rest";
        if (now - c.t0 > 1.6 + c.r() * 0.02 + (c.target % 2) * 0.6) { c.phase = "idle"; c.wait = 0.3 + c.r() * 0.9; }
      }
    }
  }
  function drawCursor(c, a) {
    const s = LABEL / 9.5, P = [[0, 0], [0, 14], [3.4, 10.8], [5.8, 16], [8.1, 15], [5.8, 9.9], [10.2, 9.9]];
    const press = c.phase === "click" ? 1 - 0.14 * Math.sin(Math.PI * clamp((now - c.t0) / 0.18, 0, 1)) : 1;
    g2.save();
    g2.globalAlpha = a;
    g2.translate(Math.round(c.x) + 0.5, Math.round(c.y) + 0.5);
    g2.scale(s * press, s * press);
    g2.beginPath();
    P.forEach(([x, y], i) => (i ? g2.lineTo(x, y) : g2.moveTo(x, y)));
    g2.closePath();
    g2.fillStyle = "#ffffff"; g2.fill();
    g2.lineWidth = 1 / (s * press); g2.strokeStyle = INK; g2.stroke();
    g2.restore();
    if (c.phase === "click") {
      const u = (now - c.t0) / 0.5;
      if (u < 1) { g2.globalAlpha = a * (1 - u); g2.strokeStyle = clsColor(scenes[annScene].dets[c.target]?.cls); g2.lineWidth = 1; g2.beginPath(); g2.arc(c.x, c.y, 3 + u * 11, 0, TAU); g2.stroke(); }
    }
  }
  function drawAnn(dt) {
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, W, Hh);
    viewRect = null;
    const sc = scenes[annScene], dets = sc.dets, since = now - annT0;
    annA = turn ? turn.a0 * Math.max(0, 1 - (now - turn.t0) / 0.3) : clamp(since / 0.35, 0, 1);
    if (annA <= 0.002) return;
    const pts = dets.map((d) => project(d.at));
    const A = annA;
    g2.lineCap = "butt";
    // lines between detections, drawn on after arrival
    if (v["notation.lines"] > 0) {
      const links = dets.slice(1).map((_, i) => [0, i + 1]).concat(sc.links || []);
      g2.lineWidth = 1;
      g2.strokeStyle = lineColour();
      links.forEach(([a, b], k) => {
        const p = easeOut(clamp((since - 0.2 - k * 0.07) / 0.45, 0, 1));
        if (!p) return;
        const hot = Math.max(hlEnv(dets[a]), hlEnv(dets[b]));
        g2.globalAlpha = A * Math.min(1, v["notation.lines"] * (1 + hot * 0.8));
        g2.beginPath();
        g2.moveTo(pts[a][0], pts[a][1]);
        g2.lineTo(lerp(pts[a][0], pts[b][0], p), lerp(pts[a][1], pts[b][1], p));
        g2.stroke();
      });
    }
    // a click crops a hard rectangle into a different view
    let best = null;
    dets.forEach((d) => { const e = hlEnv(d); if (e > 0 && (!best || d.hl > best.hl)) best = d; });
    dets.forEach((d, i) => {
      const e = hlEnv(d);
      if (!e) return;
      const [x0, y0, x1, y1] = screenBox(d), [cx, cy] = pts[i];
      const bx0 = lerp(cx, x0, e), by0 = lerp(cy, y0, e), bx1 = lerp(cx, x1, e), by1 = lerp(cy, y1, e);
      if (d === best && v["notation.view"] !== "None") viewRect = [bx0, by0, bx1, by1];
      g2.globalAlpha = A * e;
      g2.strokeStyle = clsColor(d.cls);
      g2.lineWidth = 1;
      g2.strokeRect(Math.round(bx0) + 0.5, Math.round(by0) + 0.5, Math.round(bx1 - bx0), Math.round(by1 - by0));
    });
    // crosshairs
    dets.forEach((d, i) => {
      const p = clamp((since - 0.05 - i * 0.06) / 0.2, 0, 1);
      if (!p) return;
      const x = Math.round(pts[i][0]) + 0.5, y = Math.round(pts[i][1]) + 0.5, col = clsColor(d.cls);
      g2.globalAlpha = A * p;
      if (d.cls === "main") {
        const L = 6, G = 2;
        g2.lineWidth = 3;
        g2.strokeStyle = "rgba(11,13,12,.35)";
        g2.beginPath();
        g2.moveTo(x - L, y); g2.lineTo(x - G, y); g2.moveTo(x + G, y); g2.lineTo(x + L, y); g2.moveTo(x, y - L); g2.lineTo(x, y - G); g2.moveTo(x, y + G); g2.lineTo(x, y + L);
        g2.stroke();
        g2.lineWidth = 1; g2.strokeStyle = col; g2.stroke();
      } else {
        g2.fillStyle = col; g2.globalAlpha = A * p * 0.32; g2.fillRect(x - 4, y - 4, 8, 8);
        g2.globalAlpha = A * p; g2.lineWidth = 1; g2.strokeStyle = col; g2.strokeRect(x - 4, y - 4, 8, 8);
        g2.strokeStyle = "#ffffff";
        g2.beginPath(); g2.moveTo(x - 2, y); g2.lineTo(x + 2, y); g2.moveTo(x, y - 2); g2.lineTo(x, y + 2); g2.stroke();
      }
    });
    if (v["notation.cursors"]) {
      if (!reduced) updateCursors(dt, dets, pts);
      for (const c of cursors) if (c.seen) drawCursor(c, A);
    }
    g2.globalAlpha = 1;
  }

  // ================================================================ frame
  const _bg = new THREE.Color();
  function placeCamera() {
    const s = turn ? clamp((now - turn.t0) / turn.T, 0, 1) : 0;
    const d = (glR.s / (insetPx * Math.tan((FOV * DEG) / 2))) * (1 + PULL_BACK * Math.sin(Math.PI * s));
    const el = v["scene.elevation"] * DEG, tY = 0.12;
    camera.fov = FOV;
    camera.aspect = 1;
    camera.position.set(0, tY + Math.sin(el) * d, RING + Math.cos(el) * d);
    camera.near = Math.max(0.1, d - 4);
    camera.far = d + 5;
    camera.lookAt(0, tY, RING);
    camera.updateProjectionMatrix();
    const az = SUN_ANGLE * DEG, hh = SUN_HEIGHT * DEG;
    sun.target.position.set(0, 0, RING);
    sun.position.set(Math.sin(az) * Math.cos(hh) * 7, Math.sin(hh) * 7, RING + Math.cos(az) * Math.cos(hh) * 7);
    sun.target.updateMatrixWorld();
  }
  function render(gAmt) {
    _bg.set(v["colour.ground"]);
    renderer.setClearColor(_bg, 1);
    if (gAmt > 0.004) {
      renderer.setRenderTarget(rtScene);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      const u = postMat.uniforms;
      u.uAmt.value = gAmt;
      u.uGround.value.copy(_bg);
      u.uTime.value = now;
      u.uDir.value = turn ? turn.dir : 1;
      u.uProg.value = turn ? clamp((now - turn.t0) / turn.T, 0, 1) : 1;
      renderer.render(postScene, postCam);
      return;
    }
    renderer.render(scene, camera);
    if (viewRect) {
      let [x0, y0, x1, y1] = viewRect;
      x0 = clamp(x0 - glR.x, 0, glR.s); x1 = clamp(x1 - glR.x, 0, glR.s); y0 = clamp(y0 - glR.y, 0, glR.s); y1 = clamp(y1 - glR.y, 0, glR.s);
      if (x1 - x0 > 2 && y1 - y0 > 2) {
        renderer.setScissorTest(true);
        renderer.setScissor(x0, glR.s - y1, x1 - x0, y1 - y0);
        renderer.setViewport(0, 0, glR.s, glR.s);
        renderer.autoClear = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.clear(true, true, false);
        scene.overrideMaterial = v["notation.view"] === "Depth" ? depthMat : normalMat;
        camera.layers.disable(1);
        renderer.render(scene, camera);
        scene.overrideMaterial = null;
        camera.layers.enable(1);
        renderer.autoClear = true;
        renderer.shadowMap.autoUpdate = true;
        renderer.setScissorTest(false);
      }
    }
  }
  function tick(dt) {
    now += dt;
    if (!reduced) advanceS(dt);
    swayT.value = now;
    turntable.rotation.y = (-S * Math.PI) / 2;
    for (const sc of scenes) {
      const d = ((((sc.index - S) % 4) + 6) % 4) - 2; // signed quarter turns from the front
      const f = 1 - smooth(0.18, 0.78, Math.abs(d));
      if (f <= 0 && sc.fade > 0 && sc.reset) sc.reset();
      sc.fade = f;
      sc.fadeU.value = f;
      sc.holder.visible = f > 0.001;
      sc.blob.material.opacity = FLOOR_SHADOW * f;
      if (f > 0.001 && dt > 0) sc.update(dt);
    }
    placeCamera();
    const s = turn ? clamp((now - turn.t0) / turn.T, 0, 1) : 0;
    const gAmt = turn ? v["turn.glitch"] * Math.pow(Math.sin(Math.PI * smooth(0.08, 0.92, s)), 2) : 0;
    // the notation first: a click's crop is decided there
    drawAnn(dt);
    render(gAmt);
  }

  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  function frame(ms) {
    raf = 0;
    const dt = last ? Math.min(0.05, (ms - last) / 1000) : 0;
    last = ms;
    tick(dt);
    if (running()) raf = requestAnimationFrame(frame);
  }
  const running = () => !reduced && onScreen && tabVisible;
  function loop() {
    if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  // a still frame: every scene settled a moment in, the notation drawn on in full
  function still() {
    tick(0);
  }

  const onClick = () => { step(1); if (reduced) still(); };
  stage.addEventListener("click", onClick);
  const ro = new ResizeObserver(() => { layout(); if (!raf) still(); });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    onScreen ? loop() : stop();
  });
  io.observe(host);
  const onVis = () => {
    tabVisible = !document.hidden;
    tabVisible ? loop() : stop();
  };
  document.addEventListener("visibilitychange", onVis);

  // start: on the first scene, drifting a little short of its stop
  {
    const { d } = creep();
    target = 0;
    S = reduced ? 0 : -d;
    annScene = 0;
    for (const sc of scenes) {
      const dd = ((((sc.index - S) % 4) + 6) % 4) - 2;
      sc.fade = 1 - smooth(0.18, 0.78, Math.abs(dd));
      // everything a moment into its life, so the first frame is not a pose
      sc.update(0.5);
    }
    if (reduced) { annT0 = -9; holdT0 = 0; }
  }
  layout();
  still();
  loop();

  return {
    update(values, path) {
      Object.assign(v, values);
      stage.style.background = v["colour.ground"];
      if (path === null || path === "scene.size") layout();
      if (!raf) still();
    },
    action(name) {
      if (name === "next") { step(1); if (reduced) still(); }
    },
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      stage.removeEventListener("click", onClick);
      const mats = new Set(), texs = new Set([blobTex]);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        for (const m of [].concat(o.material || [])) { mats.add(m); if (m.map) texs.add(m.map); }
      });
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      for (const x of [postMat, normalMat, depthMat, rtScene, rtPrev, postQuad.geometry]) x.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      stage.remove();
    },
  };
}
