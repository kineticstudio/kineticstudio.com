/* Depth engraving.

   Exe's depth engraving prototype (clients/exe/prototypes/02-Depth-
   engraving.html): one of the brand's engravings with a depth map read from
   it (Depth Anything V2 Small, run locally), so the flat print becomes a
   relief on a finely divided plane. The camera drifts round it, pivoting on
   a focus depth, so the near rocks slide over the far city; over the piece
   it follows the cursor, and a click flies into the world toward the point
   chosen (another click comes back out). More than one plate cuts it
   instead into flat layers at even depths, their cut edges inked, like a
   paper theatre (the prototype's Plates mode, folded into the one dial).
   Raking light lifts the ink lines off the paper, survey contours draw
   lines of equal depth, and a wash takes the light to one colour of the
   palette while the ink stays black. The paper texture lies over it all.

   Ported from the prototype's own shader, mesh, depth smoothing and camera.
   The pictures and depth maps are made small for the site: four of the six
   scenes (the computer and the panorama left out), the pictures re-encoded,
   and the 16 bit depth maps as 8 bit greys at two thirds size, which the
   smoothing pass the prototype already runs turns back into a continuous
   surface. Its pointer, drift and still modes are one here: it drifts until
   the cursor is over it. Its figure caption is left off. */

import * as THREE from "three";

const SCENES = {
  "The bridge": { file: "golden-gate", focus: 0.32 },
  "Cable car": { file: "cable-car", focus: 0.45 },
  "Sea floor": { file: "sea-floor", focus: 0.35 },
  "Two pufferfish": { file: "pufferfish-pair", focus: 0.4 },
};
// one colour wash from the palette: the ink stays black, the light goes to the wash
const WASH = {
  "Original colour": [0, null],
  "Warm black and white": [1, null],
  "Blue wash": [2, "#cfe5ee"],
  "Green wash": [2, "#bfdfc7"],
  "Yellow wash": [2, "#fff7d6"],
  "Orange wash": [2, "#ffce98"],
  "Red wash": [2, "#eed0d0"],
};

export const params = {
  scene: { type: "select", options: Object.keys(SCENES) },
  depth: {
    strength: [0.32, 0, 1, 0.01],
    // one is the whole relief; more cuts it into that many flat plates
    plates: [1, 1, 12, 1],
  },
  camera: {
    parallax: [0.07, 0, 0.2, 0.005],
    drift: [1.6, 0, 3, 0.05],
  },
  print: {
    wash: { type: "select", options: Object.keys(WASH) },
    rakingLight: [0, 0, 1, 0.01],
    contours: [0, 0, 60, 1],
    paper: [0.35, 0, 1, 0.01],
  },
};

// The site's root, from <link rel="site-root">, so this also works framed from a folder
const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const asset = (f) => new URL(`experiments/depth-engraving/${f}`, ROOT).href;

const SMOOTHING = 2; // the prototype's default
const HAZE = 0;

const vertexShader = /* glsl */ `
uniform sampler2D uDepth; uniform float uStrength; uniform int uPlate; uniform float uLo;
out vec2 vUv; out float vD;
void main() {
  vUv = uv;
  float d = textureLod(uDepth, uv, 0.0).r;
  vD = d;
  vec3 p = position;
  p.z += (uPlate == 1 ? uLo : d) * uStrength;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const fragmentShader = /* glsl */ `
precision highp float;
in vec2 vUv; in float vD; out vec4 fragColor;
uniform sampler2D uImg, uDepth; uniform int uPlate, uWash; uniform float uLo, uEdges, uHaze, uRake, uContours;
uniform vec3 uWashColor; uniform vec2 uLight, uTexel;
const vec3 INK = vec3(0.157, 0.149, 0.141);
const vec3 PAPER = vec3(0.969, 0.957, 0.937);
void main() {
  float d = texture(uDepth, vUv).r;
  if (uPlate == 1 && d < uLo) discard;     // a plate holds everything at or in front of its cut
  vec3 c = texture(uImg, vUv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (uWash == 1) c = mix(INK, PAPER, lum);
  else if (uWash == 2) c = mix(INK, uWashColor, lum);
  // raking light across the print: macro relief from depth, micro relief from the ink lines
  if (uRake > 0.0) {
    float hgt = d * 0.6 + (1.0 - lum) * 0.4;
    vec3 n = normalize(vec3(-dFdx(hgt) * 60.0, -dFdy(hgt) * 60.0, 1.0));
    float sh = dot(n, normalize(vec3(uLight, 0.55)));
    c *= mix(1.0, 0.55 + 0.75 * sh, uRake);
  }
  // survey contours: lines of equal depth, drawn as hairlines
  if (uContours > 0.5) {
    float v = d * uContours;
    float f = abs(fract(v) - 0.5) / fwidth(v);
    float line = 1.0 - smoothstep(0.35, 1.0, f);
    c = mix(c, INK, line * 0.85);
  }
  // the cut edge of a plate, inked
  if (uPlate == 1 && uEdges > 0.5) {
    float o = min(min(texture(uDepth, vUv + vec2(uTexel.x, 0.0)).r, texture(uDepth, vUv - vec2(uTexel.x, 0.0)).r),
                  min(texture(uDepth, vUv + vec2(0.0, uTexel.y)).r, texture(uDepth, vUv - vec2(0.0, uTexel.y)).r));
    if (o < uLo) c = INK;
  }
  c = mix(c, PAPER, (1.0 - d) * uHaze);
  fragColor = vec4(c, 1.0);
}`;

/* depth: an 8 bit grey, smoothed on the CPU as the prototype smooths its 16 bit one */
function boxBlur(src, w, h, r) {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(src.length), dst = new Float32Array(src.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / n;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return dst;
}
async function loadDepth(file, signal) {
  const r = await fetch(asset(`${file}.depth.png`), { signal });
  if (!r.ok) throw new Error(`depth ${r.status}`);
  const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(bmp, 0, 0);
  bmp.close?.();
  const px = x.getImageData(0, 0, c.width, c.height).data;
  const w = c.width, h = c.height;
  const raw = new Float32Array(w * h);
  for (let i = 0; i < raw.length; i++) raw[i] = px[i * 4] / 255;
  let d = boxBlur(raw, w, h, SMOOTHING);
  d = boxBlur(d, w, h, Math.round(SMOOTHING * 0.5));
  const half = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) half[(h - 1 - y) * w + xx] = THREE.DataUtils.toHalfFloat(d[y * w + xx]);
  const tex = new THREE.DataTexture(half, w, h, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { tex, w, h, raw: d };
}
function loadImage(file, anisotropy) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      asset(`${file}.jpg`),
      (t) => {
        t.colorSpace = THREE.NoColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.anisotropy = anisotropy;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}
const rgb = (hex) => new THREE.Vector3(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:zoom-in";
  const paper = document.createElement("div");
  paper.style.cssText = `position:absolute;inset:0;pointer-events:none;background:url("${asset("paper.webp")}") 0 0 / 600px repeat;mix-blend-mode:multiply`;
  host.style.background = "#f7f4ef";
  host.append(canvas, paper);

  let gl;
  try {
    gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  } catch {
    canvas.remove();
    paper.remove();
    const note = document.createElement("p");
    note.textContent = "This piece needs WebGL, which this browser has turned off.";
    note.style.cssText = "position:absolute;inset:auto 0 50% 0;margin:0;text-align:center;color:#282624;opacity:.7;";
    host.append(note);
    return { update() {}, action() {}, destroy: () => note.remove() };
  }
  gl.outputColorSpace = THREE.LinearSRGBColorSpace; // the shaders work in display values, as the brand hexes are written
  gl.setClearColor(0xf7f4ef, 1);
  gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  const root = new THREE.Group();
  scene.add(root);

  const shared = {
    uImg: { value: null }, uDepth: { value: null }, uStrength: { value: v["depth.strength"] }, uEdges: { value: 1 },
    uWash: { value: 0 }, uWashColor: { value: rgb("#cfe5ee") }, uHaze: { value: HAZE }, uRake: { value: 0 },
    uLight: { value: new THREE.Vector2(-0.6, 0.5) }, uContours: { value: 0 }, uTexel: { value: new THREE.Vector2(1, 1) },
  };
  let meshes = [];
  let imgAspect = 1.5;
  let current = null; // { name, dep, img }
  let dead = false;
  const abort = new AbortController();

  function syncUniforms() {
    shared.uStrength.value = v["depth.strength"];
    const [mode, hex] = WASH[v["print.wash"]] ?? WASH["Original colour"];
    shared.uWash.value = mode;
    if (hex) shared.uWashColor.value.copy(rgb(hex));
    shared.uRake.value = v["print.rakingLight"];
    shared.uContours.value = v["print.contours"];
    paper.style.opacity = String(v["print.paper"]);
  }
  function buildMeshes() {
    for (const m of meshes) {
      root.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    meshes = [];
    if (!current) return;
    const relief = v["depth.plates"] < 2;
    const count = relief ? 1 : v["depth.plates"];
    const segX = relief ? 420 : 1, segY = relief ? Math.round(420 / imgAspect) : 1;
    for (let k = 0; k < count; k++) {
      const geo = new THREE.PlaneGeometry(imgAspect, 1, segX, segY);
      const uniforms = { ...shared, uPlate: { value: relief ? 0 : 1 }, uLo: { value: relief ? 0 : k / count } };
      const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader, fragmentShader, depthTest: true });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = k;
      root.add(m);
      meshes.push(m);
    }
  }

  /* the camera: cover the stage, parallax round the focus depth, zoom to a point */
  let W = 1, H = 1;
  const view = { dist: 3, aim: new THREE.Vector3(), aimTo: new THREE.Vector3(), zoom: 1, zoomTo: 1, px: 0, py: 0, tpx: 0, tpy: 0, pointer: false };
  let focus = SCENES[v.scene]?.focus ?? 0.32;
  function baseDistance() {
    const fov = (camera.fov * Math.PI) / 180;
    const viewAspect = W / H, overscan = 1.24;
    const visH = viewAspect > imgAspect ? imgAspect / viewAspect / overscan : 1 / overscan;
    return visH / 2 / Math.tan(fov / 2); // where the far plane (z = 0) covers the stage
  }
  function frameCamera() {
    view.dist = baseDistance();
    if (view.zoomTo <= 1.001) {
      view.aimTo.set(0, 0, focus * v["depth.strength"]);
      view.aim.copy(view.aimTo);
    }
  }
  function placeCamera() {
    const reach = (view.dist - view.aim.z) / view.zoom;
    const amp = v["camera.parallax"] * reach;
    camera.position.set(view.aim.x + view.px * amp, view.aim.y - view.py * amp * 0.7, view.aim.z + reach);
    camera.lookAt(view.aim);
    shared.uLight.value.set(-view.px - 0.4, view.py + 0.5);
  }

  async function loadScene(name) {
    const sc = SCENES[name] ?? SCENES["The bridge"];
    const [img, dep] = await Promise.all([loadImage(sc.file, anisotropy), loadDepth(sc.file, abort.signal)]);
    if (dead) {
      img.dispose();
      dep.tex.dispose();
      return;
    }
    // a later pick may have overtaken this one
    if (v.scene !== name) {
      img.dispose();
      dep.tex.dispose();
      return;
    }
    current?.img.dispose();
    current?.dep.tex.dispose();
    current = { name, img, dep };
    imgAspect = img.image.width / img.image.height;
    shared.uImg.value = img;
    shared.uDepth.value = dep.tex;
    shared.uTexel.value.set(1 / dep.w, 1 / dep.h);
    focus = sc.focus;
    view.zoomTo = 1;
    view.zoom = 1;
    canvas.style.cursor = "zoom-in";
    buildMeshes();
    syncUniforms();
    frameCamera();
    redraw();
  }

  /* ---- the loop ---- */
  let raf = 0, last = 0, t = 0, onScreen = true, tabVisible = !document.hidden;
  function render() {
    placeCamera();
    gl.render(scene, camera);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt * v["camera.drift"];
    // it drifts on two slow sines until the cursor is over it
    const tx = view.pointer ? view.tpx : Math.sin(t * 0.21) * 0.8;
    const ty = view.pointer ? view.tpy : Math.cos(t * 0.17) * 0.5;
    const k = 1 - Math.exp(-dt * 3.7); // the prototype's 0.06 a frame, at any frame rate
    view.px += (tx - view.px) * k;
    view.py += (ty - view.py) * k;
    view.zoom += (view.zoomTo - view.zoom) * k;
    view.aim.lerp(view.aimTo, k);
    render();
  }
  function sync() {
    const run = !reduced && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  // a still: the camera where the drift sets out from, everything arrived
  function still() {
    view.px = 0;
    view.py = 0.5;
    view.zoom = view.zoomTo;
    view.aim.copy(view.aimTo);
    render();
  }
  const redraw = () => (reduced ? still() : !raf && render());

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    gl.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    frameCamera();
    redraw();
  }

  /* ---- the cursor, and a click to fly in ---- */
  const onMove = (e) => {
    if (e.pointerType !== "mouse") return;
    const r = host.getBoundingClientRect();
    view.tpx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    view.tpy = ((e.clientY - r.top) / r.height - 0.5) * 2;
    view.pointer = true;
  };
  const onLeave = () => (view.pointer = false);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const onClick = (e) => {
    if (!current) return;
    if (view.zoomTo > 1.05) {
      view.zoomTo = 1;
      view.aimTo.set(0, 0, focus * v["depth.strength"]);
      canvas.style.cursor = "zoom-in";
      redraw();
      return;
    }
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return;
    const u = hit.x / imgAspect + 0.5, vv = 0.5 - hit.y; // image space, v down
    const { w, h, raw } = current.dep;
    const d = raw[Math.min(h - 1, Math.max(0, Math.round(vv * (h - 1)))) * w + Math.min(w - 1, Math.max(0, Math.round(u * (w - 1))))];
    view.aimTo.set(hit.x, hit.y, d * v["depth.strength"]);
    view.zoomTo = 2.4;
    canvas.style.cursor = "zoom-out";
    redraw();
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);

  const ro = new ResizeObserver(resize);
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
  const onLost = (e) => e.preventDefault();
  canvas.addEventListener("webglcontextlost", onLost);

  syncUniforms();
  resize();
  loadScene(v.scene).catch((e) => !dead && e?.name !== "AbortError" && console.warn("depth-engraving: the scene did not load", e));
  sync();

  return {
    update(values, path) {
      const was = { ...v };
      Object.assign(v, values);
      if (v.scene !== was.scene) {
        loadScene(v.scene).catch((e) => !dead && e?.name !== "AbortError" && console.warn("depth-engraving: the scene did not load", e));
      }
      if (path == null || path === "depth.plates") buildMeshes();
      syncUniforms();
      if (path == null || path === "depth.strength") {
        // the pivot keeps to the focus depth as the relief deepens
        if (view.zoomTo <= 1.001) view.aimTo.set(0, 0, focus * v["depth.strength"]);
        else view.aimTo.z = (view.aimTo.z / Math.max(1e-4, was["depth.strength"])) * v["depth.strength"];
        if (reduced) view.aim.copy(view.aimTo);
      }
      redraw();
    },
    action() {},
    destroy() {
      dead = true;
      abort.abort();
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const m of meshes) {
        m.geometry.dispose();
        m.material.dispose();
      }
      current?.img.dispose();
      current?.dep.tex.dispose();
      gl.dispose();
      gl.forceContextLoss();
      canvas.remove();
      paper.remove();
      host.style.background = "";
    },
  };
}
