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

   Lengths are in sheet heights (the sheet is 1 by 1, the headshot's frame). */

import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { createBloom } from "./chrome.js";

// the head asset: for each direction out from the middle of his head (384 round, 193 top to
// bottom), how far out his surface is, in 16 bits (R hi, G lo) of RMAX
const RMAX = 0.8;
// the middle of his head, where it turns (in the headshot's frame: x right, y up, z toward you)
const PIVOT = new THREE.Vector3(362 / 720 - 0.5, 0.5 - 262 / 720, 0.03);

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
  const r = new Float32Array(c.width * c.height);
  for (let i = 0; i < r.length; i++) r[i] = ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * RMAX;
  return { w: c.width, h: c.height - 1, r };
}

/* His head: a sphere pushed out to his surface along each direction
   (made offline from the headshot's depth; see the About notes in
   src/data/membrane-look.js). `step` thins it (mobile). */
function headGeometry({ w, h, r }, step = 1) {
  const W = Math.floor(w / step), H = Math.floor(h / step);
  const pos = new Float32Array(W * (H + 1) * 3);
  const probe = [];
  for (let j = 0; j <= H; j++) {
    const ph = (j / H) * Math.PI;
    for (let i = 0; i < W; i++) {
      const th = ((i * step + 0.5) / w) * Math.PI * 2;
      const rr = r[j * step * w + i * step];
      const k = (j * W + i) * 3;
      pos[k] = Math.sin(ph) * Math.sin(th) * rr;
      pos[k + 1] = Math.cos(ph) * rr;
      pos[k + 2] = Math.sin(ph) * Math.cos(th) * rr;
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
export function mountMembrane(canvas, L, { matcaps, headUrl = "/images/hunter-head.png", reduced = false, mobile = false } = {}) {
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
  let head = null; // { mesh, probe }

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
  const sheetMat = new THREE.ShaderMaterial({
    transparent: true,
    extensions: { derivatives: true },
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
    },
    vertexShader: /* glsl */ `
      uniform sampler2D tShape;
      varying vec2 vUv;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += texture2D(tShape, uv).a;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tShape, tMatcap, tObj;
      uniform vec3 uTint;
      uniform float uExposure, uContrast, uTexture, uGrain, uCavity, uCorner, uDebug;
      varying vec2 vUv;
      varying vec3 vView;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float skin(vec2 p) { return noise(p) * 0.65 + noise(p * 2.13 + 7.1) * 0.35; }
      void main() {
        vec4 s = texture2D(tShape, vUv);
        // the latex's fine skin, a little flatter where it is stretched over him
        vec2 p = vUv * uGrain;
        float e = 0.25;
        float n0 = skin(p);
        vec2 gn = vec2(skin(p + vec2(e, 0.0)) - n0, skin(p + vec2(0.0, e)) - n0) / e;
        float stretch = clamp(length(s.xy) * 0.8, 0.0, 1.0);
        vec2 slope = s.xy + gn * uTexture * 0.06 * (1.0 - 0.6 * stretch);
        vec3 n = normalize(mat3(viewMatrix) * normalize(vec3(-slope, 1.0))); // the sheet sits at the origin, unturned
        // the matcap, the way MeshMatcapMaterial reads it
        vec3 v = normalize(vView);
        vec3 x = normalize(vec3(v.z, 0.0, -v.x));
        vec3 y = cross(v, x);
        vec2 muv = vec2(dot(x, n), dot(y, n)) * 0.495 + 0.5;
        vec3 c = texture2D(tMatcap, muv).rgb;
        c = pow(c, vec3(uContrast)) * uTint * uExposure;
        // the creases a little darker
        c *= 1.0 - uCavity * clamp(s.z * 0.004, 0.0, 0.6);
        // the sheet's frame, its corners rounded
        vec2 q = abs(vUv - 0.5) - (0.5 - uCorner);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCorner;
        float aa = max(fwidth(d), 1e-4);
        float alpha = 1.0 - smoothstep(-aa, aa, d);
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
  let obj, soft, levels, state, shapeRT;
  const size = () => {
    const q = L.render.quality;
    return Math.max(96, Math.round((mobile ? 160 : 256) * Math.min(q, 1.5)));
  };
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
  const makeSheet = () => {
    const seg = Math.round((mobile ? 150 : 300) * Math.min(L.render.quality, 1.6));
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
    heightMat.uniforms.uNeck.value = L.press.neck;
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
    const reach = 0.01 + 0.14 * THREE.MathUtils.clamp(L.latex.spread, 0, 1);
    const eps = (1 / N / reach) ** 2 * 4;
    let prev = null;
    for (let k = levels.length - 1; k >= 0; k--) {
      const [o, a, b] = levels[k];
      copy.uniforms.tSrc.value = prev ? prev.texture : o.texture;
      draw(copy, a);
      let src = a, dst = b;
      const scale = Math.pow(4, k);
      relax.uniforms.uK.value = 1 - Math.min(0.5, eps * scale);
      relax.uniforms.tObj.value = o.texture;
      relax.uniforms.uTexel.value.set(1 / o.width, 1 / o.height);
      const iters = k === levels.length - 1 ? 24 : 14;
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
    renderer.setRenderTarget(null);
  };

  // --- the matcaps
  const loader = new THREE.TextureLoader();
  const cache = {};
  const matcap = (name) => {
    const file = matcaps[name] ?? Object.values(matcaps)[0];
    if (!cache[file]) {
      cache[file] = loader.loadAsync(`/images/matcaps/${file}.jpg`).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
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
  const place = (yaw) => {
    if (!head) return;
    const leanR = THREE.MathUtils.degToRad(L.motion.lean);
    turn.rotation.set(lean.y * leanR * 0.6, yaw + lean.x * leanR, 0, "YXZ");
    turn.position.set(PIVOT.x, PIVOT.y, PIVOT.z);
    turn.updateMatrixWorld(true);
    // how far forward he is at this angle
    let zMax = -1;
    for (const p of head.probe) zMax = Math.max(zMax, v3.copy(p).applyMatrix4(turn.matrixWorld).z);
    const f = THREE.MathUtils.clamp(L.press.follow, 0, 1);
    turn.position.z = PIVOT.z + L.press.depth - (f * zMax + (1 - f) * frontMost);
    turn.updateMatrixWorld(true);
    // and the view swings a touch toward the pointer, so the chrome moves
    const d = camera.userData.dist ?? 4;
    const ax = lean.x * leanR * 0.35, ay = -lean.y * leanR * 0.25;
    camera.position.set(Math.sin(ax) * Math.cos(ay) * d, Math.sin(ay) * d, Math.cos(ax) * Math.cos(ay) * d);
    camera.lookAt(0, 0, 0);
  };

  let t = 0, last = 0, raf = 0, on = false, first = true;
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  const frame = (dt) => {
    if (!head || !sheetMat.uniforms.tMatcap.value) return;
    const k = 1 - Math.exp(-dt * 3);
    lean.x += (lean.tx - lean.x) * k;
    lean.y += (lean.ty - lean.y) * k;
    place(reduced ? THREE.MathUtils.degToRad(35) : yawAt(t));
    simulate(dt);
    sheetMat.uniforms.tShape.value = shapeRT.texture;
    sheetMat.uniforms.tObj.value = obj.texture;
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
  (async () => {
    const data = await loadHead(headUrl);
    const { geometry, probe } = headGeometry(data, mobile ? 2 : 1);
    const mesh = new THREE.Mesh(geometry, heightMat);
    mesh.frustumCulled = false;
    turn.add(mesh);
    head = { mesh, probe };
    frontMost = probe.reduce((m, p) => Math.max(m, p.z + PIVOT.z), 0);
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
    },
    /** Quality: the targets and the sheet's mesh again. */
    rebuild(next) {
      L = next;
      makeTargets();
      makeSheet();
      apply();
      frame(0);
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
