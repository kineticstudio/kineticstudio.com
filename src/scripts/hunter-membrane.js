/* Hunter, pressing through a chrome membrane (About, the founder row).

   Hunter, Oct 25: "Imagine this chrome reflective membrane that I'm pushing
   my head against, and then I'm rotating around it, and that membrane kind
   of changes to show off my profile. Imagine some elastic-type reflective
   material that I poke my head into. It adds texture. It spins. My head
   spins around it as the membrane stays the same."

   How it is made, each frame, all on the GPU:
     1. his head (a closed mesh from public/images/hunter-head.png: a stand-in
        made from his headshot, see scripts/hunter-head) turns behind
        the sheet; an orthographic camera looking at the sheet renders how far
        each point of him comes through it (the obstacle);
     2. the sheet is drawn over him like latex: an obstacle problem (the sheet
        is as flat as it can be while never passing through him, pinned at
        the frame), solved coarse to fine, so it bridges his eye sockets and
        is drawn up round his face;
     3. each point of the sheet springs toward that shape, so it gives and
        settles as he turns;
     4. the sheet, a dense plane, takes the heights in its vertex shader and
        its normals from a smoothed map, and mirrors a chrome matcap, with a
        fine orange-peel skin and a little darkening in the creases.

   Then (Oct 25: "it looks a little creepy. Maybe it looks too much like C3PO.
   I need it to also have hair texture"; his reference, a portrait carved in
   stone) a second subject: his bust as a carved relief (public/images/
   hunter-relief.png, made from his headshot by scripts/hunter-head/relief.py,
   or another photo of him: MEMBRANE_PORTRAITS, picked by L.portrait.photo):
   the volumes in a mesh that presses into the sheet as his head does, and the
   carving (hair in strands and locks, stubble, the photo's fine lines) in a
   fine height map rendered from the same pose at a higher resolution, which
   the sheet takes wherever it touches him. Stone is a material made for it.

   Lengths are in sheet heights (the sheet is 1 by 1, the headshot's frame). */

import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { createBloom } from "./chrome.js";

// the head asset: for each direction out from the middle of his head (384 round, 193 top to
// bottom), how far out his surface is, in 16 bits (R hi, G lo) of RMAX; two maps, one over
// the other: his head with the photo's facial detail, then the same head without it
const RMAX = 0.8;
const PIVOT = new THREE.Vector3(362 / 720 - 0.5, 0.5 - 262 / 720, 0.03);

/** The sheet's materials, in the order the shader knows them. */
export const MATERIALS = ["Chrome", "Matte", "Clay", "Plaster", "Rubber", "Glass", "Stone"];

// the relief asset (scripts/hunter-head/relief.py), 1024 x 2048: on top the volumes in 16 bits (R hi,
// G lo) of R_MACRO pixels and the carve (B, signed); under it strands (R), locks (G), stubble (B), signed;
// pixels of the 1024 frame, so a sheet height is 1024 of them
const R_MACRO = 256, R_CARVE = 4, R_STRANDS = 3.5, R_LOCKS = 2, R_STUBBLE = 3;

async function loadRelief(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const n = c.width;
  const macro = new Float32Array(n * n);
  // the detail as a texture, rows turned so v = 0 is the bottom: strands, locks, stubble, carve
  const detail = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const a = (y * n + x) * 4, b = ((y + n) * n + x) * 4, o = ((n - 1 - y) * n + x) * 4;
      macro[y * n + x] = ((px[a] * 256 + px[a + 1]) / 65535) * R_MACRO;
      detail[o] = px[b];
      detail[o + 1] = px[b + 1];
      detail[o + 2] = px[b + 2];
      detail[o + 3] = px[a + 2];
    }
  const tex = new THREE.DataTexture(detail, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { n, macro, tex };
}

/* His bust as a slab: a grid over the frame, raised by the relief's volumes
   (x `depth`), its vertices about PIVOT the way the head's are, so it turns
   and presses the same way. */
function slabGeometry({ n, macro }, segs, depth = 1) {
  const S = Math.max(16, segs | 0);
  const pos = new Float32Array((S + 1) * (S + 1) * 3);
  const uv = new Float32Array((S + 1) * (S + 1) * 2);
  const facing = new Float32Array((S + 1) * (S + 1)).fill(1);
  const probe = [];
  const at = (x, y) => {
    const fx = Math.min(n - 1.001, Math.max(0, x)), fy = Math.min(n - 1.001, Math.max(0, y));
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, i = y0 * n + x0;
    return (macro[i] * (1 - tx) + macro[i + 1] * tx) * (1 - ty) + (macro[i + n] * (1 - tx) + macro[i + n + 1] * tx) * ty;
  };
  for (let j = 0; j <= S; j++)
    for (let i = 0; i <= S; i++) {
      const u = i / S, v = 1 - j / S, k = j * (S + 1) + i;
      const z = (at(u * (n - 1), (1 - v) * (n - 1)) / n) * depth;
      pos.set([u - 0.5 - PIVOT.x, v - 0.5 - PIVOT.y, z - PIVOT.z], k * 3);
      uv.set([u, v], k * 2);
      if (i % 6 === 0 && j % 6 === 0 && z > 0.002) probe.push(new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
    }
  const idx = [];
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const a = j * (S + 1) + i, b = a + 1, c = a + S + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("facing", new THREE.BufferAttribute(facing, 1));
  g.setIndex(idx);
  return { geometry: g, probe };
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

async function loadHead(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const w = c.width, rows = c.height / 2; // detailed on top, plain under it
  const read = (row0) => {
    const r = new Float32Array(w * rows);
    for (let i = 0; i < r.length; i++) {
      const k = (row0 * w + i) * 4;
      r[i] = ((px[k] * 256 + px[k + 1]) / 65535) * RMAX;
    }
    return r;
  };
  return { w, h: rows - 1, full: read(0), plain: read(rows) };
}

/* His head: a sphere pushed out to his surface along each direction
   (made offline from the headshot's depth, or from his scan; see
   scripts/hunter-head). `detail` is how much of the facial depth it keeps
   (0 the plain head, 1 as made, more exaggerates); `step` thins the mesh;
   `carve` how much of the headshot's carving its face takes (the scan has
   its own face, so none). */
function headGeometry({ w, h, full, plain }, step = 1, detail = 1, carve = 1) {
  const W = Math.floor(w / step), H = Math.floor(h / step);
  const pos = new Float32Array(W * (H + 1) * 3);
  const uv = new Float32Array(W * (H + 1) * 2);
  const facing = new Float32Array(W * (H + 1));
  const probe = [];
  for (let j = 0; j <= H; j++) {
    const ph = (Math.min(j * step, h) / h) * Math.PI;
    const row = Math.min(j * step, h) * w;
    for (let i = 0; i < W; i++) {
      const th = ((i * step + 0.5) / w) * Math.PI * 2;
      const q = row + i * step;
      const rr = Math.max(0.01, plain[q] + (full[q] - plain[q]) * detail);
      const k = (j * W + i) * 3;
      pos[k] = Math.sin(ph) * Math.sin(th) * rr;
      pos[k + 1] = Math.cos(ph) * rr;
      pos[k + 2] = Math.sin(ph) * Math.cos(th) * rr;
      // the relief's carving, projected on from the front: the face takes it, the sides let it go
      const q2 = (j * W + i) * 2;
      uv[q2] = pos[k] + PIVOT.x + 0.5;
      uv[q2 + 1] = pos[k + 1] + PIVOT.y + 0.5;
      facing[j * W + i] = carve * Math.max(0, Math.min(1, (Math.sin(ph) * Math.cos(th) - 0.35) / 0.5));
      if (i % 4 === 0 && j % 3 === 0) probe.push(new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2]));
    }
  }
  const idx = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const a = j * W + i, b = j * W + ((i + 1) % W), c = a + W, d = b + W;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("facing", new THREE.BufferAttribute(facing, 1));
  g.setIndex(idx);
  return { geometry: g, probe };
}

const rt = (w, h, opts = {}) =>
  new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    ...opts,
  });

const pass = (fragmentShader, uniforms) =>
  new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });

/**
 * Mount the membrane on a canvas. `L` is MEMBRANE_LOOK (src/data/membrane-look.js).
 * @returns {null | { ready: Promise<void>, update(L): void, rebuild(L): void, dispose(): void }}
 */
export function mountMembrane(canvas, L, { matcaps, portraits = { Headshot: "hunter-relief.png" }, headUrl = "/images/hunter-head.png", scanUrl = "/images/hunter-scan.png", reliefBase = "/images/", matcapBase = "/images/matcaps/", reduced = false, mobile = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.autoClear = false;

  // --- the head, behind the sheet, seen by the height camera
  const headScene = new THREE.Scene();
  const turn = new THREE.Group(); // turns about PIVOT and leans
  headScene.add(turn);
  const heightMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uNeck: { value: 0.12 } },
    vertexShader: /* glsl */ `
      uniform float uNeck;
      #define PIVOT_Y ${PIVOT.y.toFixed(4)}
      varying float vZ;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        // his neck sinks back under the jaw (it is his head that presses, not a column)
        vZ = w.z - uNeck * smoothstep(-0.11, -0.24, position.y + PIVOT_Y);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying float vZ;
      void main() { gl_FragColor = vec4(max(vZ, 0.0), 0.0, 0.0, 1.0); }`,
  });
  const headCam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 4);
  headCam.position.set(0, 0, 2);
  let head = null; // { mesh, probe, key }
  // the carving, rendered from the same pose as the volumes: how much of it the sheet takes here
  const fineMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      tDetail: { value: null },
      tState: { value: null },
      uW: { value: new THREE.Vector4(1, 1, 1, 1) },
      uContact: { value: 0.006 },
      uRes: { value: 1024 },
      uNeck: heightMat.uniforms.uNeck,
    },
    vertexShader: /* glsl */ `
      attribute float facing;
      uniform float uNeck;
      #define PIVOT_Y ${PIVOT.y.toFixed(4)}
      varying vec2 vUv;
      varying float vZ, vFacing;
      void main() {
        vUv = uv;
        vFacing = facing;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vZ = w.z - uNeck * smoothstep(-0.11, -0.24, position.y + PIVOT_Y);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDetail, tState;
      uniform vec4 uW;
      uniform float uContact, uRes;
      varying vec2 vUv;
      varying float vZ, vFacing;
      void main() {
        vec4 t = (texture2D(tDetail, vUv) * 255.0 - 128.0) / 127.0;
        // strands, locks, stubble, carve: pixels of the 1024 frame, weighted by their dials
        float px = t.r * ${R_STRANDS.toFixed(2)} * uW.x + t.g * ${R_LOCKS.toFixed(2)} * uW.y + t.b * ${R_STUBBLE.toFixed(2)} * uW.z + t.a * ${R_CARVE.toFixed(2)} * uW.w;
        // only where the sheet lies on him
        float gap = texture2D(tState, gl_FragCoord.xy / uRes).r - vZ;
        float contact = 1.0 - smoothstep(0.0, uContact, gap);
        gl_FragColor = vec4(px / 1024.0 * vFacing * contact * step(0.0, vZ), 0.0, 0.0, 1.0);
      }`,
  });

  // --- the passes
  const quad = new FullScreenQuad();
  const blur = pass(
    /* glsl */ `
    uniform sampler2D tSrc; uniform vec2 uDir; uniform float uSigma;
    varying vec2 vUv;
    void main() {
      if (uSigma < 0.05) { gl_FragColor = texture2D(tSrc, vUv); return; }
      float w = 0.0; float s = 0.0;
      for (int i = -6; i <= 6; i++) {
        float x = float(i) * max(uSigma, 0.5) / 2.0;
        float k = exp(-0.5 * x * x / (uSigma * uSigma));
        s += texture2D(tSrc, vUv + uDir * x).r * k; w += k;
      }
      gl_FragColor = vec4(s / w, 0.0, 0.0, 1.0);
    }`,
    { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uSigma: { value: 0 } },
  );
  // a level down the pyramid keeps the highest point of the four under it
  const shrink = pass(
    /* glsl */ `
    uniform sampler2D tSrc; uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      vec2 o = uTexel * 0.5;
      float a = texture2D(tSrc, vUv + vec2(-o.x, -o.y)).r, b = texture2D(tSrc, vUv + vec2(o.x, -o.y)).r;
      float c = texture2D(tSrc, vUv + vec2(-o.x, o.y)).r, d = texture2D(tSrc, vUv + vec2(o.x, o.y)).r;
      gl_FragColor = vec4(max(max(a, b), max(c, d)), 0.0, 0.0, 1.0);
    }`,
    { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
  );
  // one relaxation of the sheet over him: as flat as it can be, never through him, pinned at the frame
  const relax = pass(
    /* glsl */ `
    uniform sampler2D tPrev, tObj; uniform vec2 uTexel; uniform float uK;
    varying vec2 vUv;
    float s(vec2 o) {
      vec2 p = vUv + o * uTexel;
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0;
      return texture2D(tPrev, p).r;
    }
    void main() {
      float avg = (s(vec2(1, 0)) + s(vec2(-1, 0)) + s(vec2(0, 1)) + s(vec2(0, -1))) * 0.2
                + (s(vec2(1, 1)) + s(vec2(-1, 1)) + s(vec2(1, -1)) + s(vec2(-1, -1))) * 0.05;
      gl_FragColor = vec4(max(texture2D(tObj, vUv).r, avg * uK), 0.0, 0.0, 1.0);
    }`,
    { tPrev: { value: null }, tObj: { value: null }, uTexel: { value: new THREE.Vector2() }, uK: { value: 0.999 } },
  );
  const copy = pass(
    /* glsl */ `
    uniform sampler2D tSrc; varying vec2 vUv;
    void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).r, 0.0, 0.0, 1.0); }`,
    { tSrc: { value: null } },
  );
  // the sheet's give: each point springs toward the shape (R height, G speed)
  const spring = pass(
    /* glsl */ `
    uniform sampler2D tState, tTarget; uniform float uDt, uW, uZeta, uReset;
    varying vec2 vUv;
    void main() {
      float target = texture2D(tTarget, vUv).r;
      vec2 s = texture2D(tState, vUv).rg;
      if (uReset > 0.5) { gl_FragColor = vec4(target, 0.0, 0.0, 1.0); return; }
      float h = s.r, v = s.g;
      v += (uW * uW * (target - h) - 2.0 * uZeta * uW * v) * uDt;
      h += v * uDt;
      gl_FragColor = vec4(h, v, 0.0, 1.0);
    }`,
    { tState: { value: null }, tTarget: { value: null }, uDt: { value: 0 }, uW: { value: 15 }, uZeta: { value: 0.55 }, uReset: { value: 1 } },
  );
  // the sheet's whole shape (his press, its belly, its rolled rim) and its slopes, for the normals
  const shape = pass(
    /* glsl */ `
    uniform sampler2D tState; uniform vec2 uTexel; uniform float uPillow, uRim;
    varying vec2 vUv;
    float H(vec2 o) {
      vec2 p = vUv + o * uTexel;
      vec2 q = clamp(p, 0.0, 1.0);
      float h = texture2D(tState, q).r;
      float belly = uPillow * sin(3.14159265 * q.x) * sin(3.14159265 * q.y);
      // distance in from the frame, round at the corners so the roll has no seams
      vec2 rq = abs(q - 0.5) - 0.4;
      float ed = -(length(max(rq, 0.0)) + min(max(rq.x, rq.y), 0.0) - 0.1);
      float roll = 1.0 - clamp(ed / 0.06, 0.0, 1.0);
      return h + belly - uRim * 0.02 * roll * roll;
    }
    void main() {
      // slopes over a 3x3 (Sobel), smooth enough for a mirror
      float a = H(vec2(-1, -1)), b = H(vec2(0, -1)), c = H(vec2(1, -1));
      float d = H(vec2(-1, 0)), e = H(vec2(0, 0)), f = H(vec2(1, 0));
      float g = H(vec2(-1, 1)), h = H(vec2(0, 1)), i = H(vec2(1, 1));
      float gx = ((c + 2.0 * f + i) - (a + 2.0 * d + g)) / (8.0 * uTexel.x);
      float gy = ((g + 2.0 * h + i) - (a + 2.0 * b + c)) / (8.0 * uTexel.y);
      float lap = (b + d + f + h - 4.0 * e) / (uTexel.x * uTexel.x);
      gl_FragColor = vec4(gx, gy, lap, e);
    }`,
    { tState: { value: null }, uTexel: { value: new THREE.Vector2() }, uPillow: { value: 0.03 }, uRim: { value: 0.4 } },
  );

  // --- the sheet
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(18, 1, 0.1, 20);
  /* The sheet's materials. Chrome mirrors a matcap; the rest are lit: one
     studio light (its angle round the sheet and its height), a soft sky and
     floor, occlusion where the sheet folds, a soft shadow marched over the
     sheet's own heights, a glossy reflection of the matcap blurred by
     roughness, and a satin sheen at grazing angles. */
  const sheetMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      tShape: { value: null },
      tMatcap: { value: null },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uExposure: { value: 1 },
      uContrast: { value: 1 },
      uTexture: { value: 0.35 },
      uGrain: { value: 70 },
      uCavity: { value: 0.5 },
      uCorner: { value: 0.035 },
      uDebug: { value: 0 },
      tObj: { value: null },
      uMat: { value: 0 },
      uColor: { value: new THREE.Color(0.8, 0.8, 0.8) },
      uRough: { value: 0.8 },
      uSpec: { value: 0.1 },
      uSheen: { value: 0 },
      uAmbient: { value: 0.5 },
      uAO: { value: 0.8 },
      uShadow: { value: 0.6 },
      uSoft: { value: 0.5 },
      uLight: { value: new THREE.Vector3(0, 0.6, 0.8) },
      uLightI: { value: 1.2 },
      uSpeckle: { value: 0 },
      tFine: { value: null },
      uFineTexel: { value: 1 / 1024 },
      uRot: { value: new THREE.Matrix3() },
      uRotInv: { value: new THREE.Matrix3() },
    },
    vertexShader: /* glsl */ `
      uniform sampler2D tShape;
      varying vec2 vUv;
      varying vec3 vView;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += texture2D(tShape, uv).a;
        vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tShape, tMatcap, tObj, tFine;
      uniform vec3 uTint, uColor, uLight;
      uniform mat3 uRot, uRotInv;
      uniform float uExposure, uContrast, uTexture, uGrain, uCavity, uCorner, uDebug, uFineTexel;
      uniform float uMat, uRough, uSpec, uSheen, uAmbient, uAO, uShadow, uSoft, uLightI, uSpeckle;
      varying vec2 vUv;
      varying vec3 vView;
      varying vec3 vWorld;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float skin(vec2 p) { return noise(p) * 0.65 + noise(p * 2.13 + 7.1) * 0.35; }
      float F(vec2 uv) { return texture2D(tFine, uv).r; }
      // the whole height here: the sheet over him, and the carving where it lies on him
      float H(vec2 uv) { return texture2D(tShape, uv).a + F(uv); }
      void main() {
        vec4 s = texture2D(tShape, vUv);
        // the carving's slopes and its creases, at its own resolution
        float e = uFineTexel;
        float f0 = F(vUv), fe = F(vUv + vec2(e, 0.0)), fw = F(vUv - vec2(e, 0.0)), fn = F(vUv + vec2(0.0, e)), fs = F(vUv - vec2(0.0, e));
        vec2 fg = vec2(fe - fw, fn - fs) / (2.0 * e);
        float fineCrease = clamp((fe + fw + fn + fs - 4.0 * f0) / (e * e) / 2500.0, 0.0, 1.0);
        // the skin's fine texture, a little flatter where it is stretched over him
        vec2 p = vUv * uGrain;
        float ee = 0.25;
        float n0 = skin(p);
        vec2 gn = vec2(skin(p + vec2(ee, 0.0)) - n0, skin(p + vec2(0.0, ee)) - n0) / ee;
        float stretch = clamp(length(s.xy) * 0.8, 0.0, 1.0);
        vec2 slope = s.xy + fg + gn * uTexture * 0.06 * (1.0 - 0.6 * stretch);
        vec3 nw = normalize(vec3(-slope, 1.0)); // in the sheet's own space
        vec3 n = normalize(mat3(viewMatrix) * (uRot * nw));
        // the matcap, the way MeshMatcapMaterial reads it
        vec3 v = normalize(vView);
        vec3 x = normalize(vec3(v.z, 0.0, -v.x));
        vec3 y = cross(v, x);
        vec2 muv = vec2(dot(x, n), dot(y, n)) * 0.495 + 0.5;
        float crease = clamp(s.z * 0.004, 0.0, 0.6) + fineCrease * 0.6;
        vec3 c;
        float alpha = 1.0;
        if (uMat < 0.5) {
          // chrome
          c = pow(texture2D(tMatcap, muv).rgb, vec3(uContrast)) * uTint;
          c *= 1.0 - uCavity * min(crease, 0.8);
        } else {
          vec3 V = normalize(uRotInv * (cameraPosition - vWorld));
          vec3 Lw = normalize(uLight); // given in the sheet's own space
          float ndl = dot(nw, Lw), ndv = max(dot(nw, V), 0.0);
          // occlusion: the creases, and the sheet standing above this point nearby
          float h0 = s.a + f0, occ = 0.0;
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.785398;
            vec2 d = vec2(cos(a), sin(a));
            occ += max(0.0, H(vUv + d * 0.012) - h0) * 24.0 + max(0.0, H(vUv + d * 0.045) - h0) * 4.0;
          }
          float ao = clamp(1.0 - uAO * (occ / 8.0 + crease * 0.8), 0.0, 1.0);
          // a soft shadow, marched over the heights toward the light
          float sh = 1.0;
          vec2 ld = Lw.xy; float lx = length(ld);
          if (lx > 1e-3) {
            ld /= lx; float rise = Lw.z / lx;
            // its steps jittered a pixel at a time, so a long low shadow is a fine grain, not a comb of copies
            float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            for (int i = 1; i <= 32; i++) {
              float k = (float(i) - jit) * 0.75;
              float t = k * k * 0.0006;
              float above = (h0 + t * rise) - H(vUv + ld * t);
              sh = min(sh, clamp(above / (uSoft * t * 0.6 + 1e-4) + 0.5, 0.0, 1.0));
            }
          }
          sh = mix(1.0, sh, uShadow);
          // the material's own colour, flecked and mottled by speckle (stone)
          vec3 base = uColor;
          if (uSpeckle > 0.0) {
            vec2 q = vUv * 900.0;
            float mottle = noise(vUv * 14.0) * 0.6 + noise(vUv * 41.0) * 0.4 - 0.5;
            float fleck = smoothstep(0.78, 0.95, noise(q) * 0.7 + noise(q * 2.7) * 0.3);
            float pale = smoothstep(0.82, 0.97, noise(q * 1.3 + 31.0));
            float grain = noise(q * 3.1) - 0.5;
            base *= 1.0 + uSpeckle * (0.16 * mottle + 0.1 * grain - 0.38 * fleck + 0.12 * pale);
          }
          // light: a wrapped diffuse for the soft materials, a sky and a floor
          float wrap = uRough * 0.15;
          float diff = max((ndl + wrap) / (1.0 + wrap), 0.0) * sh;
          float sky = mix(0.55, 1.0, nw.y * 0.5 + 0.5);
          c = base * (uAmbient * sky * ao + uLightI * diff * mix(0.8, 1.0, ao));
          // gloss: a highlight from the light, and the room's reflection blurred by roughness
          vec3 Hv = normalize(Lw + V);
          float shin = mix(600.0, 6.0, uRough);
          float spec = pow(max(dot(nw, Hv), 0.0), shin) * (shin + 8.0) / 40.0;
          float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
          vec3 env = textureLod(tMatcap, muv, uRough * 7.0).rgb;
          c += uSpec * (uLightI * spec * sh * vec3(1.0) + env * mix(0.25, 1.0, fres) * ao);
          // satin: a sheen where the sheet turns away from you
          c += uSheen * pow(1.0 - ndv, 3.0) * sky * ao * mix(base, vec3(1.0), 0.5) * 0.8;
          if (uMat > 4.5 && uMat < 5.5) {
            // glass-ish: the page through it, more of the room at grazing angles
            alpha = clamp(0.28 + 0.75 * fres + uSpec * spec * 0.3 + crease * 0.5, 0.0, 1.0);
            c = mix(base * 0.6, env, 0.7) * mix(0.55, 1.0, ao) + uLightI * spec * sh * 0.6;
          }
        }
        c *= uExposure;
        // the sheet's frame, its corners rounded
        vec2 q = abs(vUv - 0.5) - (0.5 - uCorner);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCorner;
        float aa = max(fwidth(d), 1e-4);
        alpha *= 1.0 - smoothstep(-aa, aa, d);
        if (uDebug > 0.5) c = vec3(s.a * uDebug);
        if (uDebug < -0.5) c = vec3(texture2D(tObj, vUv).r * -uDebug);
        gl_FragColor = vec4(c * alpha, alpha);
      }`,
  });
  sheetMat.premultipliedAlpha = true;
  let sheet = null;

  let bloom = createBloom(renderer, { threshold: 0.9, strength: 0.25, radius: 0.7, samples: 4 });

  // --- targets, sized by quality
  let N = 0;
  let obj, soft, levels, state, shapeRT, fineRT, NF = 0;
  // fidelity: the height maps' size and the sheet's mesh (a phone gets at most half)
  const size = () => Math.max(64, Math.round(mobile ? Math.min(L.fidelity.maps, 160) : L.fidelity.maps));
  const makeTargets = () => {
    const n = size();
    if (n === N) return;
    N = n;
    obj?.dispose();
    soft?.forEach((t) => t.dispose());
    levels?.forEach((l) => l.forEach((t) => t.dispose()));
    state?.forEach((t) => t.dispose());
    shapeRT?.dispose();
    obj = rt(N, N, { depthBuffer: true });
    soft = [rt(N, N), rt(N, N)];
    levels = [];
    for (let s = N, k = 0; k < 4; k++, s = Math.max(8, Math.round(s / 2))) levels.push([rt(s, s), rt(s, s), rt(s, s)]); // obstacle, ping, pong
    state = [rt(N, N, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }), rt(N, N, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })];
    shapeRT = rt(N, N);
    reset = true;
  };
  // the carving's own map, finer than the sheet's
  const makeFine = () => {
    const n = Math.max(128, Math.round(mobile ? Math.min(L.fidelity.fine, 768) : L.fidelity.fine));
    if (n === NF) return;
    NF = n;
    fineRT?.dispose();
    fineRT = rt(n, n, { depthBuffer: true });
  };
  const makeSheet = () => {
    const seg = Math.max(16, Math.round(mobile ? Math.min(L.fidelity.segments, 160) : L.fidelity.segments));
    if (sheet?.userData.seg === seg) return;
    if (sheet) {
      sheet.geometry.dispose();
      scene.remove(sheet);
    }
    sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, seg, seg), sheetMat);
    sheet.userData.seg = seg;
    scene.add(sheet);
  };

  const draw = (mat, target) => {
    quad.material = mat;
    renderer.setRenderTarget(target);
    quad.render(renderer);
  };

  // --- the solve, every frame
  let reset = true;
  const simulate = (dt) => {
    // how far he comes through
    renderer.setRenderTarget(obj);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    if (head) renderer.render(headScene, headCam);
    renderer.setClearColor(0x000000, 0);
    // softened by the sheet's thickness
    heightMat.uniforms.uNeck.value = head?.bust ? 0 : L.press.neck;
    const sig = L.press.soft * (N / 256);
    blur.uniforms.uSigma.value = sig;
    blur.uniforms.tSrc.value = obj.texture;
    blur.uniforms.uDir.value.set(1 / N, 0);
    draw(blur, soft[0]);
    blur.uniforms.tSrc.value = soft[0].texture;
    blur.uniforms.uDir.value.set(0, 1 / N);
    draw(blur, levels[0][0]);
    // the obstacle down the pyramid
    for (let k = 1; k < levels.length; k++) {
      shrink.uniforms.tSrc.value = levels[k - 1][0].texture;
      shrink.uniforms.uTexel.value.set(1 / levels[k - 1][0].width, 1 / levels[k - 1][0].height);
      draw(shrink, levels[k][0]);
    }
    // relax coarse to fine; a coarser texel spans more sheet, so it lets go faster
    // spread: how far round him the sheet is drawn up (a falloff length, in sheet heights)
    const reach = 0.0015 + 0.15 * THREE.MathUtils.clamp(L.latex.spread, 0, 1);
    const eps = (1 / N / reach) ** 2 * 4;
    let prev = null;
    // start no coarser than the reach: a coarse level's blocky picture of him would stand round him as a
    // halo that a short reach cannot take back
    const top = THREE.MathUtils.clamp(Math.floor(Math.log2(Math.max(1, (reach * N) / 2))), 0, levels.length - 1);
    for (let k = top; k >= 0; k--) {
      const [o, a, b] = levels[k];
      copy.uniforms.tSrc.value = prev ? prev.texture : o.texture;
      draw(copy, a);
      let src = a, dst = b;
      const scale = Math.pow(4, k);
      relax.uniforms.uK.value = 1 - Math.min(0.5, eps * scale);
      relax.uniforms.tObj.value = o.texture;
      relax.uniforms.uTexel.value.set(1 / o.width, 1 / o.height);
      const iters = k === top ? 24 : 14;
      for (let i = 0; i < iters; i++) {
        relax.uniforms.tPrev.value = src.texture;
        draw(relax, dst);
        [src, dst] = [dst, src];
      }
      prev = src;
    }
    // the sheet's own smoothness: it leaves him with a fillet, not a kink
    const sm = L.latex.smooth * (N / 256);
    if (sm > 0.05) {
      blur.uniforms.uSigma.value = sm;
      blur.uniforms.tSrc.value = prev.texture;
      blur.uniforms.uDir.value.set(1 / N, 0);
      draw(blur, soft[0]);
      blur.uniforms.tSrc.value = soft[0].texture;
      blur.uniforms.uDir.value.set(0, 1 / N);
      draw(blur, soft[1]);
      prev = soft[1];
    }
    // the give
    const w = Math.PI * 2 * L.latex.spring;
    const steps = Math.max(1, Math.ceil((w * dt) / 0.4));
    spring.uniforms.uW.value = w;
    spring.uniforms.uZeta.value = L.latex.damping;
    spring.uniforms.tTarget.value = prev.texture;
    for (let i = 0; i < (reset ? 1 : steps); i++) {
      spring.uniforms.uReset.value = reset || dt <= 0 ? 1 : 0;
      spring.uniforms.uDt.value = dt / steps;
      spring.uniforms.tState.value = state[0].texture;
      draw(spring, state[1]);
      state.reverse();
    }
    reset = false;
    shape.uniforms.tState.value = state[0].texture;
    shape.uniforms.uTexel.value.set(1 / N, 1 / N);
    shape.uniforms.uPillow.value = L.latex.pillow;
    shape.uniforms.uRim.value = L.latex.rim;
    draw(shape, shapeRT);
    // the carving, from the same pose, where the sheet lies on him
    renderer.setRenderTarget(fineRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.setClearColor(0x000000, 0);
    if (head && reliefData) {
      const F = L.fidelity;
      fineMat.uniforms.tDetail.value = reliefData.tex;
      fineMat.uniforms.tState.value = state[0].texture;
      fineMat.uniforms.uRes.value = NF;
      fineMat.uniforms.uW.value.set(F.strands, F.locks, F.stubble, F.carve);
      headScene.overrideMaterial = fineMat;
      renderer.render(headScene, headCam);
      headScene.overrideMaterial = null;
    }
    renderer.setRenderTarget(null);
  };

  // --- the matcaps
  const loader = new THREE.TextureLoader();
  const cache = {};
  const matcap = (name) => {
    const file = matcaps[name] ?? Object.values(matcaps)[0];
    if (!cache[file]) {
      cache[file] = loader.loadAsync(`${matcapBase}${file}.jpg`).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        // mipmapped, so the lit materials can read it blurred by roughness
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        return t;
      });
    }
    return cache[file];
  };

  const apply = () => {
    const u = sheetMat.uniforms;
    u.uTint.value.set(L.look.tint);
    u.uExposure.value = L.look.exposure;
    u.uContrast.value = L.look.contrast;
    u.uTexture.value = L.surface.texture;
    u.uGrain.value = L.surface.grain;
    u.uCavity.value = L.surface.cavity;
    u.uCorner.value = L.frame.corner;
    const M = L.material;
    u.uMat.value = Math.max(0, MATERIALS.indexOf(M.type));
    u.uColor.value.set(M.color);
    u.uRough.value = M.roughness;
    u.uSpec.value = M.gloss;
    u.uSheen.value = M.sheen;
    u.uAmbient.value = M.ambient;
    u.uAO.value = M.ao;
    u.uShadow.value = M.shadow;
    u.uSpeckle.value = M.speckle ?? 0;
    u.uSoft.value = L.light.softness;
    u.uLightI.value = L.light.intensity;
    const tone = { ACES: THREE.ACESFilmicToneMapping, Neutral: THREE.NeutralToneMapping, AgX: THREE.AgXToneMapping, None: THREE.NoToneMapping }[L.render.tone];
    renderer.toneMapping = tone ?? THREE.ACESFilmicToneMapping;
    bloom.strength = L.glow.bloom;
    bloom.threshold = L.glow.threshold;
    bloom.radius = L.glow.radius;
    matcap(L.look.matcap).then((t) => {
      u.tMatcap.value = t;
      redraw();
    });
    fit();
  };

  // --- size
  let W = 0, Hh = 0;
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, (devicePixelRatio || 1) * Math.min(1, L.render.quality));
    renderer.setPixelRatio(dpr);
    renderer.setSize(r.width, r.height, false);
    W = Math.round(r.width * dpr);
    Hh = Math.round(r.height * dpr);
    bloom.setSize(W, Hh);
    camera.aspect = r.width / r.height;
    // the sheet fills `fill` of the box's shorter side
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const fitH = 1 / L.frame.fill / Math.min(1, camera.aspect);
    camera.userData.dist = fitH / 2 / Math.tan(fov / 2);
    camera.updateProjectionMatrix();
  };

  // --- the turn
  const legs = [0, 1, 0, -1, 0];
  const yawAt = (t) => {
    const period = 14 / Math.max(0.01, L.motion.speed);
    const u = (((t / period) % 1) + 1) % 1;
    const leg = Math.floor(u * 4), v = u * 4 - leg;
    const hold = THREE.MathUtils.clamp(L.motion.hold, 0, 0.9);
    const w = v < hold ? 0 : (v - hold) / (1 - hold);
    const e = w < 0.5 ? 4 * w * w * w : 1 - (-2 * w + 2) ** 3 / 2;
    return THREE.MathUtils.degToRad(L.motion.range) * (legs[leg] + (legs[leg + 1] - legs[leg]) * e);
  };
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e) => {
    const r = canvas.getBoundingClientRect();
    lean.tx = THREE.MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / (innerWidth * 0.5), -1, 1);
    lean.ty = THREE.MathUtils.clamp((e.clientY - (r.top + r.height / 2)) / (innerHeight * 0.5), -1, 1);
  };
  if (!reduced) addEventListener("pointermove", onPointer, { passive: true });

  const v3 = new THREE.Vector3();
  let frontMost = 0.3;
  const rot = new THREE.Matrix4(), rotInv = new THREE.Matrix4(), lightW = new THREE.Vector3();
  const place = (yaw) => {
    if (!head) return;
    const look = THREE.MathUtils.degToRad(L.motion.look ?? 0);
    turn.rotation.set(lean.y * look * 0.6, yaw + lean.x * look, 0, "YXZ");
    turn.position.set(PIVOT.x, PIVOT.y, PIVOT.z);
    turn.updateMatrixWorld(true);
    // how far forward he is at this angle
    let zMax = -1;
    for (const p of head.probe) zMax = Math.max(zMax, v3.copy(p).applyMatrix4(turn.matrixWorld).z);
    const f = THREE.MathUtils.clamp(L.press.follow, 0, 1);
    turn.position.z = PIVOT.z + L.press.depth - (f * zMax + (1 - f) * frontMost);
    turn.updateMatrixWorld(true);
    // the slab tilts a few degrees toward the pointer; the light and the view stay where they are
    const tilt = THREE.MathUtils.degToRad(L.motion.lean);
    if (sheet) {
      sheet.rotation.set(lean.y * tilt, lean.x * tilt, 0);
      sheet.updateMatrixWorld(true);
      rot.extractRotation(sheet.matrixWorld);
      rotInv.copy(rot).invert();
      sheetMat.uniforms.uRot.value.setFromMatrix4(rot);
      sheetMat.uniforms.uRotInv.value.setFromMatrix4(rotInv);
    }
    const d = camera.userData.dist ?? 4;
    camera.position.set(0, 0, d);
    camera.lookAt(0, 0, 0);
    // the light: its angle round the sheet (0 from above, clockwise), raking slowly to and fro, and its
    // height over it; the shader takes it in the sheet's own space
    const sweep = reduced ? 0 : L.light.sweep * Math.sin((t / Math.max(1, L.light.period)) * Math.PI * 2);
    const az = THREE.MathUtils.degToRad(L.light.angle + sweep), el = THREE.MathUtils.degToRad(L.light.height);
    lightW.set(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)).applyMatrix4(rotInv);
    sheetMat.uniforms.uLight.value.copy(lightW);
  };

  let t = 0, last = 0, raf = 0, on = false, first = true;
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  const frame = (dt) => {
    if (!head || !fineRT || !sheetMat.uniforms.tMatcap.value) return;
    const k = 1 - Math.exp(-dt * 3);
    lean.x += (lean.tx - lean.x) * k;
    lean.y += (lean.ty - lean.y) * k;
    place(reduced ? THREE.MathUtils.degToRad(35) : yawAt(t));
    simulate(dt);
    sheetMat.uniforms.tShape.value = shapeRT.texture;
    sheetMat.uniforms.tObj.value = obj.texture;
    sheetMat.uniforms.tFine.value = fineRT.texture;
    sheetMat.uniforms.uFineTexel.value = 1 / NF;
    renderer.setRenderTarget(bloom.target);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    renderer.toneMappingExposure = 1;
    bloom.finish(dt);
    if (first) {
      first = false;
      resolveReady();
    }
  };
  const loop = (now) => {
    raf = 0;
    const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 0);
    last = now;
    t += dt;
    frame(dt);
    if (on && !reduced) raf = requestAnimationFrame(loop);
  };
  const redraw = () => {
    if (!raf) frame(0);
  };
  const io = new IntersectionObserver(([e]) => {
    on = e.isIntersecting;
    if (on && !raf && !reduced) {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  });
  const ro = new ResizeObserver(() => {
    fit();
    redraw();
  });

  makeTargets();
  makeSheet();
  fit();
  // his bust (the relief's volumes as a slab) or his head (the turning stand-in), behind the sheet
  let headData = null, reliefData = null, reliefName = "";
  // the bust's photo (L.portrait.photo, one of portraits): each relief loaded once, when first picked
  const reliefs = new Map();
  const photo = () => (L.portrait?.photo in portraits ? L.portrait.photo : Object.keys(portraits)[0]);
  const loadPortrait = (name) => {
    if (!reliefs.has(name)) reliefs.set(name, loadRelief(new URL(portraits[name], new URL(reliefBase, location.href)).href));
    return reliefs.get(name);
  };
  const usePortrait = async () => {
    const name = photo();
    if (name === reliefName) return;
    reliefName = name;
    const data = await loadPortrait(name);
    if (name !== photo()) return; // picked another while this one loaded
    reliefData = data;
    makeHead();
    reset = true;
    frame(0);
    for (let i = 0; i < 20; i++) frame(1 / 60);
  };
  // his scan (Hunter, Oct 25: "make a high-definition model of me based on this and then use this for the
  // membrane"): the third subject, loaded when first picked
  let scanData = null, scanLoad = null;
  const useScan = () =>
    (scanLoad ??= loadHead(scanUrl).then((d) => {
      scanData = d;
      makeHead();
      reset = true;
      frame(0);
      for (let i = 0; i < 20; i++) frame(1 / 60);
    }));
  const makeHead = () => {
    const subject = L.fidelity.subject;
    const bust = subject === "Bust", scan = subject === "Scan";
    if (scan && !scanData) return void useScan();
    if (bust ? !reliefData : !headData) return;
    const step = Math.max(1, Math.round(L.fidelity.head) + (mobile ? 1 : 0));
    const key = bust ? `bust:${reliefName}:${step}:${L.fidelity.relief}` : `${subject}:${step}:${L.fidelity.detail}`;
    if (head?.key === key) return;
    const { geometry, probe } = bust
      ? slabGeometry(reliefData, 448 / step, L.fidelity.relief)
      : headGeometry(scan ? scanData : headData, step, L.fidelity.detail, scan ? 0 : 1);
    if (head) {
      head.mesh.geometry.dispose();
      head.mesh.geometry = geometry;
      Object.assign(head, { probe, key, bust });
    } else {
      const mesh = new THREE.Mesh(geometry, heightMat);
      mesh.frustumCulled = false;
      turn.add(mesh);
      head = { mesh, probe, key, bust };
    }
    frontMost = probe.reduce((m, p) => Math.max(m, p.z + PIVOT.z), 0);
    reset = true;
  };
  (async () => {
    reliefName = photo();
    [headData, reliefData] = await Promise.all([loadHead(headUrl), loadPortrait(reliefName)]);
    makeFine();
    makeHead();
    // start a little way into the turn, already settled
    t = 14 / Math.max(0.01, L.motion.speed) * 0.02;
    apply();
    await matcap(L.look.matcap);
    sheetMat.uniforms.tMatcap.value = await matcap(L.look.matcap);
    // settle the sheet before it is first seen
    reset = true;
    frame(0);
    for (let i = 0; i < 30; i++) frame(1 / 60);
    ro.observe(canvas);
    io.observe(canvas);
  })();

  return {
    ready,
    /** Look, light and motion: live. */
    update(next) {
      L = next;
      apply();
      redraw();
      if (reliefData) usePortrait();
    },
    /** Fidelity and quality: the maps, the sheet's mesh and his head again. */
    rebuild(next) {
      L = next;
      makeTargets();
      makeFine();
      makeSheet();
      makeHead();
      apply();
      reset = true;
      frame(0);
      for (let i = 0; i < 20; i++) frame(1 / 60);
      if (reliefData) usePortrait();
    },
    /** For checks from a console or a headless browser: jump to a moment of the turn. */
    seek(seconds) {
      t = seconds;
      reset = true;
      frame(0);
      for (let i = 0; i < 40; i++) frame(1 / 60);
    },
    get t() {
      return t;
    },
    /** Show the sheet's heights (x gain) instead of the chrome; 0 for the chrome. */
    debug(gain) {
      sheetMat.uniforms.uDebug.value = gain;
      frame(0);
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      removeEventListener("pointermove", onPointer);
      bloom.dispose();
      renderer.dispose();
    },
  };
}
