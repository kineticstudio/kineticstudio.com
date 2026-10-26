/* Island.

   Epirus's island animation, v2 (clients/epirus/prototypes/04-Island-
   animation-v2): their three main pieces of hardware each on its own small
   island, drawn in the icon system's isometric style, three flat tones to a
   face, soft ink lines, a high sun. The places draw in as gold dashes; the
   radar's island slots in, then the operator station's, then the array's
   with its generator and power line, each warming to yellow as it lands,
   and gold dotted routes run between every pair. Then, on a loop, two drone
   swarms come in over the far side, the radar pings and tracks them, the
   brackets lock, the station lights up, and the array turns to each swarm
   in turn and rings run out to it until it drops. The islands turn slowly;
   drag to spin them.

   Ported from the prototype's own drawing: the isometric kit (iso-kit.js:
   the renderer with its normal and depth line pass, the materials, the
   hardware), the archipelago (iso-islands.js) and the timeline
   (island-loop.js), with Hunter's dark defaults. The captions and numbered
   badges are left out. */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const params = {
  story: {
    speed: [1.4, 0.25, 3, 0.05],
  },
  view: {
    turn: [3, 0, 30, 0.5],
    zoom: [1.03, 0.6, 1.6, 0.01],
  },
  lines: {
    outlines: [0.16, 0, 1, 0.01],
  },
  shadow: {
    strength: [1.3, 0, 2, 0.05],
    sunAngle: [-30, -180, 180, 1],
  },
  colour: {
    ground: "#0f0e12",
    island: "#36353c",
    accent: "#ffd748",
    ink: "#d5dfd6",
  },
  replay: { type: "action", label: "Play from the start" },
};

/* ================= the isometric kit (iso-kit.js) ================= */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (x, a, b) => clamp((x - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const boxAt = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// top, left (+z) and right (+x) faces, as the icons shade them
const PAL = {
  tile: ["#F8F7F3", "#EAE8DF", "#DDDBD1"],
  sand: ["#EFEDE6", "#E3E1D7", "#D4D2C7"],
  yellow: ["#FFE68F", "#FFD748", "#E8BA2E"],
  drone: ["#86898C", "#626568", "#45484B"],
  lampOff: ["#8C8672", "#78725F", "#645E4B"],
  lampOn: ["#FFFBE6", "#FFF1B8", "#FFE68F"],
};
const COL = Object.fromEntries(Object.entries(PAL).map(([k, x]) => [k, x.map((c) => new THREE.Color(c))]));
const INK = 0x0f0e12, GOLD = 0xb8900a;
// the yellow as the design draws it; dialled elsewhere, its tones are made from it
const EPIRUS = "#ffd748";
// the dark set's fixed colours (Hunter's, 4 October): the operator's site and the drones
const SITE = "#4a4950", DRONES = "#a7aaae";

// the isometric view: down the cube's diagonal
const DIR = new THREE.Vector3(1, 1, 1).normalize();
const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const UP = new THREE.Vector3().crossVectors(RIGHT, DIR).negate().normalize();
const screenOf = (x, y, z) => [x * RIGHT.x + y * RIGHT.y + z * RIGHT.z, x * UP.x + y * UP.y + z * UP.z];
function groundPointAt(cx, cy) {
  const p = new THREE.Vector3().addScaledVector(RIGHT, cx).addScaledVector(UP, cy);
  const t = p.y / DIR.y;
  return [p.x - DIR.x * t, 0, p.z - DIR.z * t];
}
function frameView(pts, margin = 4) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    const [sx, sy] = screenOf(...p);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return { focus: groundPointAt((x0 + x1) / 2, (y0 + y1) / 2), zoom: 1, height: y1 - y0 + 2 * margin, aspect: (x1 - x0 + 2 * margin) / (y1 - y0 + 2 * margin) };
}

const SUN = new THREE.Vector3(-0.3147, 0.7771, 0.545).normalize();
const makeShadowUniforms = () => ({
  tShadow: { value: null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowTexel: { value: new THREE.Vector2() },
  uShadowOffset: { value: 0.05 },
  uLight: { value: SUN.clone() },
  uShadowTone: { value: new THREE.Color(0.7, 0.7, 0.73) },
});

const ICON_VERT = `
  uniform mat4 uShadowMatrix; uniform float uShadowOffset;
  varying vec3 vN; varying vec4 vShadow;
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = m * instanceMatrix;
    #endif
    vN = normalize(mat3(m) * normal);
    vec4 wp = m * vec4(position, 1.0);
    vShadow = uShadowMatrix * vec4(wp.xyz + vN * uShadowOffset, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const ICON_FRAG = `
  uniform vec3 uTop; uniform vec3 uLeft; uniform vec3 uRight;
  uniform sampler2DShadow tShadow; uniform float uShadowOn; uniform vec2 uShadowTexel; uniform vec3 uLight; uniform vec3 uShadowTone;
  varying vec3 vN; varying vec4 vShadow;
  float lit() {
    vec3 sc = vShadow.xyz / vShadow.w;
    if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
    float s = 0.0;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
      s += texture(tShadow, vec3(sc.xy + vec2(float(i), float(j)) * uShadowTexel, sc.z - 0.0006));
    return s / 9.0;
  }
  void main() {
    vec3 n = normalize(vN);
    vec3 w = max(vec3(n.y, n.z, n.x), 0.0) + 0.001;
    vec3 col = (uTop * w.x + uLeft * w.y + uRight * w.z) / (w.x + w.y + w.z);
    if (uShadowOn > 0.5) col = mix(col, col * uShadowTone, (1.0 - lit()) * smoothstep(0.02, 0.3, dot(n, uLight)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
const iconMaterial = (cols, shadow) =>
  new THREE.ShaderMaterial({
    uniforms: { uTop: { value: cols[0].clone() }, uLeft: { value: cols[1].clone() }, uRight: { value: cols[2].clone() }, ...shadow },
    vertexShader: ICON_VERT,
    fragmentShader: ICON_FRAG,
  });
function tint(m, a, b, k) {
  m.uniforms.uTop.value.copy(a[0]).lerp(b[0], k);
  m.uniforms.uLeft.value.copy(a[1]).lerp(b[1], k);
  m.uniforms.uRight.value.copy(a[2]).lerp(b[2], k);
}
// the icons' three tones from one colour, taken as the left face's
function tones(hex) {
  const mid = new THREE.Color(hex).convertLinearToSRGB();
  const out = (c) => c.convertSRGBToLinear();
  const lift = 0.45 * (0.2126 * mid.r + 0.7152 * mid.g + 0.0722 * mid.b);
  return [out(mid.clone().lerp(new THREE.Color(1, 1, 1), lift)), out(mid.clone()), out(mid.clone().multiplyScalar(0.91))];
}
function paint(m, cols) {
  m.uniforms.uTop.value.copy(cols[0]);
  m.uniforms.uLeft.value.copy(cols[1]);
  m.uniforms.uRight.value.copy(cols[2]);
}

// a circle as a hairline that keeps its pixel width at any size or angle
const hairlineMaterial = (color) =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uWidth: { value: 1.25 }, uDpr: { value: 1 } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uWidth; uniform float uDpr; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float px = abs(r - 0.98) / max(fwidth(r), 1e-6);
        float hw = uWidth * uDpr * 0.5;
        float a = (1.0 - smoothstep(hw - 0.5, hw + 0.5, px)) * uOpacity;
        if (a <= 0.0) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

// square dashes, one width and gap for every dashed line in the drawing
const dashUniforms = (width = 0.32, gap = 1) => ({ uWidth: { value: width }, uGap: { value: gap } });
const dashMaterial = (dash, color, opacity = 1) =>
  new THREE.ShaderMaterial({
    uniforms: { ...dash, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uDraw: { value: 1 }, uLen: { value: 1 }, uShift: { value: 0 } },
    vertexShader: `attribute vec3 aSide; attribute float aU; uniform float uWidth; varying float vU;
      void main() { vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position + aSide * (uWidth * 0.5), 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uDraw; uniform float uLen; uniform float uWidth; uniform float uGap; uniform float uShift; varying float vU;
      void main() {
        if (vU > uDraw * uLen) discard;
        float period = uWidth * (1.0 + uGap);
        float f = mod(vU - uShift, period);
        float aa = max(fwidth(vU), 1e-4) * 0.6;
        float on = max(smoothstep(-aa, aa, f) * (1.0 - smoothstep(uWidth - aa, uWidth + aa, f)), smoothstep(period - aa, period + aa, f));
        if (on <= 0.01) discard;
        gl_FragColor = vec4(uColor, uOpacity * on);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
function dashGeometry(pts, y = 0.07) {
  const pos = [], side = [], u = [], idx = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len, base = pos.length / 3;
    pos.push(ax, y, az, ax, y, az, bx, y, bz, bx, y, bz);
    side.push(nx, 0, nz, -nx, 0, -nz, nx, 0, nz, -nx, 0, -nz);
    u.push(acc, acc, acc + len, acc + len);
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    acc += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 3));
  g.setAttribute("aU", new THREE.Float32BufferAttribute(u, 1));
  g.setIndex(idx);
  g.userData.length = acc;
  return g;
}

// the line pass: colour, then normals and depth, then the soft ink lines
const OUTLINE_FRAG = `
  uniform sampler2D tColor; uniform sampler2D tNormal; uniform sampler2D tDepth;
  uniform vec2 uStep; uniform vec3 uInk; uniform float uDepthEdge; uniform float uSilhouette; uniform float uCrease; uniform float uTransparent;
  varying vec2 vUv;
  vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
  float dep(vec2 uv) { return texture2D(tDepth, uv).x; }
  void main() {
    vec4 c = texture2D(tColor, vUv);
    vec3 col = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
    vec2 ox = vec2(uStep.x, 0.0), oy = vec2(0.0, uStep.y);
    float d0 = dep(vUv);
    float dEdge = max(dep(vUv - ox) + dep(vUv + ox) - 2.0 * d0, dep(vUv - oy) + dep(vUv + oy) - 2.0 * d0);
    vec3 n0 = nrm(vUv);
    vec3 a = n0 - nrm(vUv + ox), b = n0 - nrm(vUv + oy);
    float nEdge = max(dot(a, a), dot(b, b));
    float sil = smoothstep(uDepthEdge * 0.6, uDepthEdge * 1.4, dEdge), crease = smoothstep(0.07, 0.18, nEdge) * step(d0, 0.9999);
    float e = max(sil * uSilhouette, crease * uCrease);
    gl_FragColor = vec4(mix(col, uInk, e), uTransparent > 0.5 ? max(c.a, e) : 1.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }`;

const OVER = 1; // overlays: drawn in colour, outlined by nothing
const NOCAST = 2; // solids that get lines but cast no shadow

function createIsoRenderer(canvas, { baseHeight = 90, maxDpr = 2, shadows = false, shadowSize = 2048, transparent = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: transparent, premultipliedAlpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1400);
  camera.layers.enableAll();
  const SHADOW = makeShadowUniforms();

  const rtColor = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
  const rtNormal = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(2, 2) });
  const normalMat = new THREE.MeshNormalMaterial();
  const outline = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rtColor.texture }, tNormal: { value: rtNormal.texture }, tDepth: { value: rtNormal.depthTexture }, uStep: { value: new THREE.Vector2() },
      uInk: { value: new THREE.Color(INK) }, uDepthEdge: { value: 0.0008 }, uSilhouette: { value: 0.27 }, uCrease: { value: 0.29 },
      uTransparent: { value: transparent ? 1 : 0 },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: OUTLINE_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const post = new THREE.Scene();
  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outline);
  post.add(postQuad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const white = new THREE.Color(0xffffff);
  const v3 = new THREE.Vector3();
  const surface = { renderer, scene, camera, shadow: SHADOW, viewH: 1, pxScale: 1, baseHeight, right: RIGHT.clone(), up: UP.clone() };

  const cfg = { lineWidth: 1, shadowStrength: 1.3, shadowSoftness: 1 };
  const tone = SHADOW.uShadowTone.value.clone(), light = SUN.clone();
  let lastW = 0, lastH = 0;
  const sun = (() => {
    const SIZE = shadows ? shadowSize : 1, R = shadows || 1, D = 400;
    const depth = new THREE.DepthTexture(SIZE, SIZE);
    depth.compareFunction = THREE.LessEqualCompare;
    depth.minFilter = depth.magFilter = THREE.LinearFilter;
    const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthTexture: depth });
    const cam = new THREE.OrthographicCamera(-R, R, R, -R, D - R * 1.2, D + R * 1.2);
    const matrix = new THREE.Matrix4();
    const aim = (dir) => {
      cam.position.copy(dir).multiplyScalar(D);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    };
    cam.layers.set(0);
    aim(SUN);
    return { on: !!shadows, can: !!shadows, drawn: false, rt, cam, depth, matrix, aim, texel: 1.4 / SIZE, mat: new THREE.MeshBasicMaterial({ colorWrite: false }) };
  })();

  surface.setSize = (w, h) => {
    lastW = w;
    lastH = h;
    renderer.setSize(w, h, false);
    surface.viewH = Math.max(1, h);
    const aspect = w / Math.max(1, h), H = surface.baseHeight;
    camera.top = H / 2;
    camera.bottom = -H / 2;
    camera.left = (-H * aspect) / 2;
    camera.right = (H * aspect) / 2;
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    const W = Math.max(2, Math.floor(w * pr)), Hp = Math.max(2, Math.floor(h * pr));
    rtColor.setSize(W, Hp);
    rtNormal.setSize(W, Hp);
    const k = Math.max(1, Math.round(pr * surface.pxScale * cfg.lineWidth));
    outline.uniforms.uStep.value.set(k / W, k / Hp);
  };
  const turnAxis = new THREE.Vector3(0, 1, 0), turnDir = new THREE.Vector3();
  surface.setView = (view) => {
    const dir = view.turn ? turnDir.copy(DIR).applyAxisAngle(turnAxis, view.turn) : DIR;
    camera.position.set(...view.focus).addScaledVector(dir, 600);
    camera.up.set(0, 1, 0);
    camera.lookAt(...view.focus);
    camera.zoom = view.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  surface.render = () => {
    if (sun.on || !sun.drawn) {
      scene.overrideMaterial = sun.mat;
      renderer.setRenderTarget(sun.rt);
      renderer.clear();
      if (sun.on) renderer.render(scene, sun.cam);
      scene.overrideMaterial = null;
      sun.drawn = true;
    }
    SHADOW.tShadow.value = sun.depth;
    SHADOW.uShadowMatrix.value.copy(sun.matrix);
    SHADOW.uShadowTexel.value.set(sun.texel * cfg.shadowSoftness, sun.texel * cfg.shadowSoftness);
    SHADOW.uShadowOn.value = sun.on ? 1 : 0;
    SHADOW.uLight.value.copy(light);
    SHADOW.uShadowTone.value.setRGB(1, 1, 1).lerp(tone, cfg.shadowStrength);
    camera.layers.enableAll();
    renderer.setRenderTarget(rtColor);
    renderer.setClearColor(white, transparent ? 0 : 1);
    renderer.clear();
    renderer.render(scene, camera);
    camera.layers.set(0);
    camera.layers.enable(NOCAST);
    scene.overrideMaterial = normalMat;
    renderer.setRenderTarget(rtNormal);
    renderer.setClearColor(0x8080ff, 1);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.enableAll();
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(post, postCam);
  };
  surface.configure = (o = {}) => {
    const u = outline.uniforms;
    if (o.silhouette != null) u.uSilhouette.value = o.silhouette;
    if (o.crease != null) u.uCrease.value = o.crease;
    if (o.ink != null) u.uInk.value.set(o.ink);
    if (o.shadows != null) { sun.on = sun.can && !!o.shadows; sun.drawn = false; }
    if (o.shadowStrength != null) cfg.shadowStrength = o.shadowStrength;
    if (o.shadowSoftness != null) cfg.shadowSoftness = o.shadowSoftness;
    if (o.sunAngle != null || o.sunHeight != null) {
      const sph = new THREE.Spherical().setFromVector3(light);
      const az = o.sunAngle != null ? THREE.MathUtils.degToRad(o.sunAngle) : sph.theta;
      const el = o.sunHeight != null ? THREE.MathUtils.degToRad(o.sunHeight) : Math.PI / 2 - sph.phi;
      light.setFromSphericalCoords(1, Math.PI / 2 - el, az);
      sun.aim(light);
    }
    if (o.pixelRatio != null) renderer.setPixelRatio(o.pixelRatio);
    if (o.lineWidth != null) cfg.lineWidth = o.lineWidth;
    if (lastW) surface.setSize(lastW, lastH);
  };
  surface.unitsPerPx = () => (camera.top - camera.bottom) / camera.zoom / surface.viewH;
  surface.solid = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  surface.overlay = (obj, parent = scene) => {
    obj.layers.set(OVER);
    obj.renderOrder = 2;
    parent.add(obj);
    return obj;
  };
  surface.dispose = () => {
    rtColor.dispose();
    rtNormal.dispose();
    rtNormal.depthTexture?.dispose();
    sun.rt.dispose();
    sun.depth.dispose();
    sun.mat.dispose();
    normalMat.dispose();
    outline.dispose();
    postQuad.geometry.dispose();
  };
  return surface;
}

/* ---- the hardware, after Epirus's Critical Point Defense Kit render ---- */

const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};
function strut(a, b, t) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = new THREE.BoxGeometry(t, t, A.distanceTo(B));
  g.applyMatrix4(new THREE.Matrix4().lookAt(B, A, new THREE.Vector3(0, 1, 0)));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
// the array on its turntable: cabinet, connector box, yoke and hinge, the
// cables, the enclosure leaning back with its frame and tiles
function buildArray(mat, { hinge = 2.59, lift = 0 } = {}) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(1.3, 1.42, 0.46, 40), mat, 0, 0.23, 0);
  add(g, new THREE.BoxGeometry(1.6, 1.25, 1.1), mat, 0, 0.625, -1.55);
  add(g, mergeGeometries([0, 1, 2, 3, 4].map((i) => boxAt(0.05, 0.08, 0.9, 0, 0.3 + i * 0.16, 0))), mat, 0.82, 0, -1.55);
  add(g, new THREE.BoxGeometry(0.9, 0.42, 0.6), mat, 1.8, 0.21, 1.55);
  add(g, mergeGeometries([boxAt(0.36, hinge - 0.29, 0.75, -2.25, 0, 0), boxAt(0.36, hinge - 0.29, 0.75, 2.25, 0, 0)]), mat, 0, (hinge + 0.63) / 2, 0);
  add(g, new THREE.CylinderGeometry(0.3, 0.3, 4.9, 20).rotateZ(Math.PI / 2), mat, 0, hinge, 0);
  add(g, mergeGeometries([-0.75, -0.4, 0.4, 0.75].map((x) => strut([x, 0.46, 0.35], [x * 1.25, hinge - 0.39, 0.55], 0.12))), mat);
  const tilt = new THREE.Group();
  tilt.position.set(0, hinge, 0);
  tilt.rotation.x = -0.28;
  g.add(tilt);
  const mid = 2.95 + lift;
  add(tilt, new THREE.BoxGeometry(4.2, 5.5, 0.9), mat, 0, mid, 0);
  add(tilt, mergeGeometries([boxAt(4.3, 0.14, 0.12, 0, 2.75, 0), boxAt(4.3, 0.14, 0.12, 0, -2.75, 0), boxAt(0.14, 5.6, 0.12, 2.1, 0, 0), boxAt(0.14, 5.6, 0.12, -2.1, 0, 0)]), mat, 0, mid, 0.51);
  const tiles = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) tiles.push(boxAt(0.56, 0.56, 0.06, -1.6 + c * 0.64, -2.24 + r * 0.64, 0));
  add(tilt, mergeGeometries(tiles), mat, 0, mid, 0.49);
  add(tilt, mergeGeometries([[-2.16, 1.2], [-2.16, -1.2], [2.16, 1.2], [2.16, -1.2]].map(([x, y]) => boxAt(0.12, 0.5, 0.3, x, y, 0))), mat, 0, mid, 0);
  add(tilt, mergeGeometries([-1.2, 0, 1.2].map((x) => boxAt(0.16, 5.1, 0.1, x, 0, 0))), mat, 0, mid, -0.5);
  add(tilt, new THREE.BoxGeometry(1.5, 0.6, 0.06), mat, 0.6, 1.5 + lift, -0.56);
  return { group: g, tilt, emitter: new THREE.Vector3(0, mid, 0.7) };
}
// the array on its trailer: deck, rails, tandem wheels, tongue and jack
function buildTrailerArray(mat) {
  const node = new THREE.Group();
  const DECK = 1.3, wheelR = 0.5;
  add(node, new THREE.BoxGeometry(6.4, 0.3, 3.6), mat, 0, DECK - 0.15, 0);
  add(node, mergeGeometries([boxAt(6.4, 0.22, 0.22, 0, DECK - 0.41, -1.15), boxAt(6.4, 0.22, 0.22, 0, DECK - 0.41, 1.15)]), mat);
  const wheel = new THREE.CylinderGeometry(wheelR, wheelR, 0.36, 24).rotateX(Math.PI / 2);
  add(node, mergeGeometries([-0.15, 1.0].flatMap((x) => [-1.58, 1.58].map((z) => wheel.clone().translate(x, wheelR, z)))), mat);
  add(node, mergeGeometries([strut([-3.2, DECK - 0.38, -1.1], [-4.6, DECK - 0.44, 0], 0.18), strut([-3.2, DECK - 0.38, 1.1], [-4.6, DECK - 0.44, 0], 0.18), boxAt(0.36, 0.2, 0.3, -4.7, DECK - 0.44, 0)]), mat);
  add(node, mergeGeometries([boxAt(0.1, DECK - 0.68, 0.1, -4.05, 0.16 + (DECK - 0.68) / 2, 0), new THREE.CylinderGeometry(0.16, 0.16, 0.12, 14).rotateX(Math.PI / 2).translate(-4.05, 0.16, 0)]), mat);
  add(node, mergeGeometries([-2.95, 2.95].flatMap((x) => [-1.45, 1.45].map((z) => [x, z])).flatMap(([x, z]) => [boxAt(0.16, DECK - 0.3, 0.16, x, (DECK - 0.3) / 2, z), boxAt(0.5, 0.08, 0.5, x, 0.04, z)])), mat);
  const array = buildArray(mat);
  array.group.position.set(0, DECK, 0);
  node.add(array.group);
  node.userData = { turn: array.group, tilt: array.tilt, emitter: array.emitter };
  return node;
}
// the radar: a four-legged stand, a pole, and four panels facing every way
function buildRadar(mat) {
  const r = new THREE.Group();
  const HUB = 0.95, TOP = 3.55;
  const parts = [new THREE.CylinderGeometry(0.17, 0.17, 0.32, 14).translate(0, HUB, 0), new THREE.CylinderGeometry(0.1, 0.1, TOP - HUB, 14).translate(0, (TOP + HUB) / 2, 0), new THREE.CylinderGeometry(0.15, 0.15, 0.42, 14).translate(0, HUB + 0.95, 0)];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, fx = Math.cos(a) * 1.55, fz = Math.sin(a) * 1.55;
    parts.push(strut([0, HUB, 0], [fx * 0.94, 0.1, fz * 0.94], 0.12), boxAt(0.44, 0.08, 0.44, fx, 0.04, fz));
  }
  add(r, mergeGeometries(parts), mat);
  const head = new THREE.Group();
  head.position.y = TOP;
  r.add(head);
  const panels = [boxAt(0.62, 0.62, 0.62, 0, 0.36, 0), new THREE.CylinderGeometry(0.2, 0.24, 0.16, 16).translate(0, 0.75, 0)];
  for (let k = 0; k < 4; k++) {
    const turn = (k * Math.PI) / 2;
    panels.push(boxAt(0.62, 0.8, 0.16, 0, 0, 0).rotateX(-0.2).translate(0, 0.42, 0.72).rotateY(turn));
    panels.push(boxAt(0.1, 0.1, 0.36, 0, 0.36, 0.48).rotateY(turn));
  }
  add(head, mergeGeometries(panels), mat);
  r.userData = { head };
  return r;
}
// the operator station: two tables, laptops (the lamp), an antenna, rack cases, a monitor
function buildOperatorStation(mat, lampMat) {
  const s = new THREE.Group();
  const table = (cx, w) => [boxAt(w, 0.08, 1.0, cx, 1.02, 0), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => boxAt(0.07, 0.98, 0.07, cx + sx * (w / 2 - 0.1), 0.49, sz * 0.42))];
  add(s, mergeGeometries([...table(-1.15, 2.1), ...table(1.15, 2.0)]), mat);
  add(s, mergeGeometries([-1.55, -0.8].map((x) => boxAt(0.52, 0.04, 0.36, x, 1.08, 0.12))), mat);
  const lamp = add(s, mergeGeometries([-1.55, -0.8].map((x) => new THREE.BoxGeometry(0.52, 0.36, 0.04).rotateX(-0.22).translate(x, 1.27, -0.07))), lampMat);
  add(s, mergeGeometries([boxAt(0.04, 0.62, 0.04, -2.05, 1.37, -0.3), boxAt(0.04, 0.5, 0.04, -1.96, 1.31, -0.3), boxAt(0.16, 0.06, 0.16, -2.0, 1.08, -0.3)]), mat);
  add(s, mergeGeometries([boxAt(0.8, 0.62, 0.62, 0.65, 1.37, -0.08), boxAt(0.74, 0.5, 0.62, 1.58, 1.31, -0.08), boxAt(0.6, 0.42, 0.05, 1.58, 1.83, -0.22)]), mat);
  add(s, mergeGeometries([0, 1, 2].map((i) => boxAt(0.66, 0.05, 0.03, 0.65, 1.17 + i * 0.17, 0.24))), mat);
  s.userData = { lamp };
  return s;
}
// the generator the array runs from: a skid, louvres, door seams, a radiator
function buildGenerator(mat) {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(3.7, 0.3, 1.66), mat, 0, 0.15, 0);
  add(g, new THREE.BoxGeometry(3.9, 1.5, 1.86), mat, 0, 1.05, 0);
  add(g, new THREE.BoxGeometry(3.94, 0.16, 1.9), mat, 0, 1.88, 0);
  const louvres = [];
  for (const x0 of [-1.45, 0.55]) for (let i = 0; i < 6; i++) {
    const x = x0 + i * 0.16;
    louvres.push(boxAt(0.06, 0.7, 0.04, x, 1.0, 0.95), boxAt(0.06, 0.7, 0.04, x, 1.0, -0.95));
  }
  for (const x of [-0.25, 0.3]) louvres.push(boxAt(0.04, 1.3, 0.03, x, 1.05, 0.945), boxAt(0.04, 1.3, 0.03, x, 1.05, -0.945));
  add(g, mergeGeometries(louvres), mat);
  add(g, mergeGeometries([0, 1, 2, 3, 4].map((i) => boxAt(0.04, 0.08, 1.3, 0, 0.6 + i * 0.22, 0))), mat, 1.97, 0, 0);
  return g;
}
// a quadcopter: body, belly, arms, motors and rotors
function droneGeometry(scale = 2.3) {
  const parts = [new THREE.BoxGeometry(0.62, 0.22, 0.62), boxAt(0.22, 0.12, 0.22, 0, -0.16, 0.18)];
  for (const a of [Math.PI / 4, -Math.PI / 4]) parts.push(new THREE.BoxGeometry(1.8, 0.08, 0.12).rotateY(a));
  for (const [x, z] of [[0.64, 0.64], [-0.64, 0.64], [0.64, -0.64], [-0.64, -0.64]]) {
    parts.push(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10).translate(x, 0.06, z));
    parts.push(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 24).translate(x, 0.15, z));
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  g.scale(scale, scale, scale);
  return g;
}
// two-corner brackets round each drone, sized in pixels, as in their hero film
function createBrackets(surface, n, color = INK) {
  const ARMS = n * 4;
  const pos = new Float32Array(ARMS * 12), col = new Float32Array(ARMS * 16);
  const index = [];
  for (let q = 0; q < ARMS; q++) index.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
  const geo = new THREE.BufferGeometry();
  geo.setIndex(index);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  const mesh = surface.overlay(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide })));
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  const ink = new THREE.Color(color);
  return {
    mesh,
    color: ink,
    set(i, x, y, z, alpha, lock, time, size = 3.2) {
      const o = i * 16;
      if (alpha <= 0.002) { col.fill(0, o * 4, (o + 16) * 4); return; }
      const u = surface.unitsPerPx(), ps = surface.pxScale, R = surface.right, U = surface.up;
      const s = clamp(size / u, 10 * ps, 20 * ps) * (1 + 0.7 * (1 - easeOut(lock)));
      const l = s * 0.72, t = 0.65 * ps;
      const jx = Math.sin(time * 1.3 + i * 2.1) * s * 0.08, jy = Math.cos(time * 1.1 + i * 1.7) * s * 0.07;
      const arms = [[-s - t, s - t, -s + l, s + t], [-s - t, s - l, -s + t, s - t], [s - l, -s - t, s + t, -s + t], [s - t, -s + t, s + t, -s + l]];
      arms.forEach(([x0, y0, x1, y1], a) => {
        [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([cx, cy], vtx) => {
          const k = o + a * 4 + vtx, px = (cx + jx) * u, py = (cy + jy) * u;
          pos[k * 3] = x + R.x * px + U.x * py;
          pos[k * 3 + 1] = y + R.y * px + U.y * py;
          pos[k * 3 + 2] = z + R.z * px + U.z * py;
          col[k * 4] = ink.r; col[k * 4 + 1] = ink.g; col[k * 4 + 2] = ink.b; col[k * 4 + 3] = alpha * 0.9;
        });
      });
    },
    commit() {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

/* ================= the archipelago (iso-islands.js) ================= */

const TILE = 20, THICK = 2.4;
const SIZE = { leonidas: 1.0, mast: 1.2, radarHead: 1.15, shelter: 2.0, generator: 1.0, pad: 9 };
// Hunter's sizes in the prototype, relative to the islands' own
const SIZES = { leonidas: 1.15 / 1.15, mast: 1.25 / 1.25, radarHead: 1.1 / 1.1, shelter: 2.1 / 2.1, drones: 0.55 };
const LEO = { x: -3, z: -3 }, GEN = { x: 7.3, z: 7.3 };
const ISLANDS = { effect: { x: -12, z: -14 }, sense: { x: -16, z: 18 }, decide: { x: 20, z: -12 } };
const ROUTES = [["sense", "decide"], ["decide", "effect"], ["sense", "effect"]];
const SWARMS = [
  { phi: 211, drift: 4, rate: 0.3, phase: 0, y: 15, spin: 0.55 },
  { phi: 239, drift: 4, rate: 0.3, phase: 2.2, y: 19, spin: -0.45 },
];
const ORBIT = 44;
const GROUP = [[0, 4.5, 0], [60, 6, 1.2], [125, 3.5, -1.3], [180, 6.4, 0.8], [245, 5, 2], [305, 4, -0.9]];
const DRONE_LIST = SWARMS.flatMap((sw, k) => GROUP.map((g, j) => ({ k, j, g })));
function swarmCenter(sw, time, arrive, out) {
  const phi = ((sw.phi + sw.drift * Math.sin(sw.rate * time + sw.phase)) * Math.PI) / 180, r = lerp(ORBIT + 56, ORBIT, arrive);
  return out.set(Math.cos(phi) * r, sw.y + Math.sin(time * 0.8 + sw.phase) * 0.6, Math.sin(phi) * r);
}
const turned = (x, y, z, a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const edge = (a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, h = TILE / 2 - 1.2;
  const t = Math.min(h / Math.abs(dx || 1e-6), h / Math.abs(dz || 1e-6));
  return [a.x + dx * t, a.z + dz * t];
};
// the view that frames the islands at every angle of the turn, the radar at
// its tallest and both swarms
function islandsView(turn = [0, TAU]) {
  const pts = [];
  const steps = turn[0] === turn[1] ? 0 : 24;
  for (let i = 0; i <= steps; i++) {
    const a = steps ? lerp(turn[0], turn[1], i / steps) : turn[0];
    for (const p of Object.values(ISLANDS)) {
      for (const x of [-TILE / 2, TILE / 2]) for (const z of [-TILE / 2, TILE / 2]) pts.push(turned(p.x + x, 0, p.z + z, a), turned(p.x + x, -THICK, p.z + z, a));
    }
    pts.push(turned(ISLANDS.effect.x, 11, ISLANDS.effect.z, a));
  }
  for (const sw of SWARMS) for (let d = -1; d <= 1; d += 0.25) {
    const phi = ((sw.phi + sw.drift * d) * Math.PI) / 180;
    for (const r of [ORBIT - 7, ORBIT + 7]) pts.push([Math.cos(phi) * r, sw.y + 4, Math.sin(phi) * r], [Math.cos(phi) * r, sw.y - 3, Math.sin(phi) * r]);
  }
  return frameView(pts);
}

// one island with one piece on it, centred on the origin
function buildPieceIsland(kind, { solid, overlay, dash, mats }) {
  const g = new THREE.Group();
  solid(new THREE.BoxGeometry(TILE, THICK, TILE), mats.tile, 0, -THICK / 2, 0, g);
  const piece = new THREE.Group();
  g.add(piece);
  const dashed = (pts, color, opacity, y = 0.07) => {
    const geo = dashGeometry(pts, y);
    const m = dashMaterial(dash, color, opacity);
    m.uniforms.uLen.value = geo.userData.length;
    return overlay(new THREE.Mesh(geo, m), g);
  };
  if (kind === "sense") {
    const mast = buildRadar(mats.piece);
    mast.scale.setScalar(SIZE.mast);
    mast.userData.head.scale.setScalar(SIZE.radarHead);
    piece.add(mast);
    g.userData.head = mast.userData.head;
    g.userData.mast = mast;
  } else if (kind === "decide") {
    // turned a quarter so the operator faces the drones over the far side
    const sh = buildOperatorStation(mats.piece, mats.lamp);
    sh.rotation.y = Math.PI / 2;
    sh.scale.setScalar(SIZE.shelter);
    piece.add(sh);
    g.userData.shelter = sh;
  } else if (kind === "effect") {
    solid(new THREE.BoxGeometry(SIZE.pad, 0.6, SIZE.pad), mats.piece, LEO.x, 0.3, LEO.z, piece);
    const leo = buildTrailerArray(mats.piece);
    leo.position.set(LEO.x + 0.85 * SIZE.leonidas, 0.6, LEO.z);
    leo.scale.setScalar(SIZE.leonidas);
    leo.userData.turn.rotation.y = Math.PI;
    piece.add(leo);
    g.userData.leo = leo;
    const gen = buildGenerator(mats.piece);
    gen.position.set(GEN.x, 0, GEN.z);
    gen.rotation.y = Math.PI / 4;
    gen.scale.setScalar(SIZE.generator);
    piece.add(gen);
    const corner = LEO.x + SIZE.pad / 2;
    g.userData.power = dashed([[GEN.x - 0.8, GEN.z - 0.8], [corner + 0.25, corner + 0.25]], GOLD, 0.9, 0.08).material;
  }
  g.userData.piece = piece;
  return g;
}

function createIsoIslands(canvas, opts = {}) {
  const FULL = islandsView(opts.turn);
  const surface = createIsoRenderer(canvas, { baseHeight: FULL.height, maxDpr: opts.maxDpr, shadows: 60, transparent: !!opts.transparent });
  const { renderer, scene, solid, overlay, shadow } = surface;
  const pal = Object.fromEntries(Object.entries(COL).map(([k, x]) => [k, x.map((c) => c.clone())]));
  const pose = { leonidas: 180, track: true, radar: 0, sweep: 0 };
  const size = { ...SIZES };
  let dashSpeed = 1.9;
  const dash = dashUniforms(0.32, 1);
  const routes = [];
  const group = new THREE.Group();
  scene.add(group);
  const v3 = new THREE.Vector3();
  const tileMat = iconMaterial(pal.tile, shadow);

  // plan: where each island will go
  const slots = {};
  for (const [key, p] of Object.entries(ISLANDS)) {
    const h = TILE / 2;
    const geo = dashGeometry([[p.x - h, p.z - h], [p.x + h, p.z - h], [p.x + h, p.z + h], [p.x - h, p.z + h], [p.x - h, p.z - h]], 0.02);
    const m = dashMaterial(dash, GOLD, 0.85);
    m.uniforms.uLen.value = geo.userData.length;
    overlay(new THREE.Mesh(geo, m), group);
    routes.push(m);
    slots[key] = m;
  }
  // the islands
  const islands = {};
  for (const [key, p] of Object.entries(ISLANDS)) {
    const pieceMat = iconMaterial(pal.sand, shadow);
    const lampMat = iconMaterial(pal.lampOff, shadow);
    const isl = buildPieceIsland(key, { solid, overlay, dash, mats: { tile: tileMat, piece: pieceMat, lamp: lampMat } });
    isl.position.set(p.x, 0, p.z);
    group.add(isl);
    islands[key] = { ...isl.userData, g: isl, mat: pieceMat, lampMat };
    if (isl.userData.power) routes.push(isl.userData.power);
  }
  // the routes between every pair
  const links = ROUTES.map(([a, b]) => {
    const geo = dashGeometry([edge(ISLANDS[a], ISLANDS[b]), edge(ISLANDS[b], ISLANDS[a])], 0.07);
    const m = dashMaterial(dash, GOLD, 0.7);
    m.uniforms.uLen.value = geo.userData.length;
    overlay(new THREE.Mesh(geo, m), group);
    routes.push(m);
    return { key: [a, b].sort().join("-"), m };
  });
  // the swarms, brackets, track lines and rings
  const droneMat = iconMaterial(pal.drone, shadow);
  const drones = new THREE.InstancedMesh(droneGeometry(), droneMat, DRONE_LIST.length);
  drones.frustumCulled = false;
  drones.layers.set(NOCAST);
  scene.add(drones);
  const brackets = createBrackets(surface, DRONE_LIST.length);
  const tracks = SWARMS.map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    g.setAttribute("aSide", new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    g.setAttribute("aU", new THREE.Float32BufferAttribute(new Float32Array(4), 1));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    const t = overlay(new THREE.Mesh(g, dashMaterial(dash, GOLD, 0.9)));
    t.frustumCulled = false;
    routes.push(t.material);
    return t;
  });
  const quad = new THREE.PlaneGeometry(2, 2);
  const hairlines = [];
  const ringMesh = (color, flat, parent) => {
    const m = overlay(new THREE.Mesh(quad, hairlineMaterial(color)), parent);
    if (flat) m.rotation.x = -Math.PI / 2;
    m.visible = false;
    hairlines.push(m.material);
    return m;
  };
  const ping = ringMesh(INK, true, group);
  const waves = [0, 1, 2].map(() => ringMesh(INK, false, scene));
  const pulses = Object.keys(ISLANDS).map(() => ringMesh(GOLD, true, group));

  const tmp = new THREE.Object3D();
  const centers = SWARMS.map(() => new THREE.Vector3()), target = new THREE.Vector3();
  const emitter = new THREE.Vector3(), aim = new THREE.Vector3(), along = new THREE.Vector3(), across = new THREE.Vector3(), toward = new THREE.Vector3();

  // an island slots in: it eases a short way down into place, growing the
  // last few percent, while its piece warms to yellow
  function land(isl, k, height = 5) {
    isl.g.visible = k > 0.001;
    const settle = easeOut(seg(k, 0, 0.75));
    isl.g.position.y = (1 - settle) * height;
    isl.g.scale.setScalar(0.92 + 0.08 * settle);
    tint(isl.mat, pal.sand, pal.yellow, easeInOut(seg(k, 0.3, 0.75)));
    return seg(k, 0.45, 1);
  }
  function pulse(ring, x, z, r, k) {
    ring.visible = k > 0 && k < 1;
    if (!ring.visible) return;
    ring.position.set(x, 0.1, z);
    ring.scale.setScalar(r + easeOut(k) * 5);
    ring.material.uniforms.uOpacity.value = (1 - k) * 0.8;
  }
  function trackLine(t, from, c, k, time) {
    t.visible = k > 0;
    if (!t.visible) return;
    along.subVectors(c, from);
    const len = along.length();
    across.crossVectors(along.normalize(), DIR).normalize();
    const g = t.geometry, pa = g.attributes.position, sa = g.attributes.aSide, ua = g.attributes.aU;
    toward.copy(from).addScaledVector(along, len);
    [from, from, toward, toward].forEach((p, i) => {
      const side = i % 2 ? -1 : 1;
      pa.setXYZ(i, p.x, p.y, p.z);
      sa.setXYZ(i, across.x * side, across.y * side, across.z * side);
      ua.setX(i, i < 2 ? 0 : len);
    });
    pa.needsUpdate = sa.needsUpdate = ua.needsUpdate = true;
    t.material.uniforms.uLen.value = len;
    t.material.uniforms.uDraw.value = k;
    t.material.uniforms.uShift.value = time * dashSpeed;
  }

  function apply(s, view) {
    const time = s.time || 0, approach = s.approach || 0, plan = s.plan || 0, sense = s.sense || 0;
    const decide = s.decide || 0, effect = s.effect || 0, whole = s.whole || 0;
    surface.setView(view);
    group.rotation.y = s.turn || 0;
    group.updateMatrixWorld(true);
    hairlines.forEach((m) => { m.uniforms.uWidth.value = 1.1 * surface.pxScale; m.uniforms.uDpr.value = renderer.getPixelRatio(); });
    const S = islands.sense, D = islands.decide, E = islands.effect;

    const drawn = easeInOut(seg(plan, 0.2, 0.9));
    slots.sense.uniforms.uDraw.value = drawn * (1 - seg(sense, 0.3, 0.45));
    slots.decide.uniforms.uDraw.value = drawn * (1 - seg(decide, 0.3, 0.45));
    slots.effect.uniforms.uDraw.value = drawn * (1 - seg(effect, 0.25, 0.38));

    const arrive = easeOut(seg(approach, 0, 1));
    SWARMS.forEach((sw, k) => group.localToWorld(swarmCenter(sw, time, arrive, centers[k])));
    DRONE_LIST.forEach(({ k, j, g: [deg, r, h] }, i) => {
      const down = easeInOut(k === 0 ? seg(effect, 0.46 + j * 0.03, 0.58 + j * 0.03) : seg(effect, 0.78 + j * 0.02, 0.88 + j * 0.02));
      const c = centers[k], a = (deg * Math.PI) / 180 + time * SWARMS[k].spin;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const y = c.y + h + Math.sin(time * 1.6 + i * 1.3) * 0.5 - easeInOut(down) * 9;
      tmp.position.set(x, y, z);
      tmp.rotation.set(down * 1.2 * Math.sin(i), time * 0.25 + i, down * 0.9 * Math.cos(i));
      tmp.scale.setScalar(arrive > 0 ? (1 - seg(down, 0.4, 1)) * size.drones : 0);
      tmp.updateMatrix();
      drones.setMatrixAt(i, tmp.matrix);
      const lock = easeOut(seg(sense, 0.5 + i * 0.025, 0.72 + i * 0.025));
      brackets.set(i, x, y, z, lock * (1 - seg(down, 0, 0.4)) * (arrive > 0 ? 1 : 0), lock, time);
    });
    drones.instanceMatrix.needsUpdate = true;
    brackets.commit();
    const swing = easeInOut(seg(effect, 0.62, 0.76));
    target.lerpVectors(centers[0], centers[1], swing);

    // sense: the radar's island lands; it pings and tracks
    const sK = land(S, seg(sense, 0, 0.45));
    S.head.rotation.y = (pose.radar + time * pose.sweep) * DEG;
    pulse(pulses[1], ISLANDS.sense.x, ISLANDS.sense.z, 6, sK);
    const pinging = seg(sense, 0.42, 0.6) * (1 - 0.6 * effect);
    const pk = (((time / 2.8) % 1) + 1) % 1;
    ping.visible = pinging > 0;
    ping.position.set(ISLANDS.sense.x, 0.1, ISLANDS.sense.z);
    ping.scale.setScalar(3 + pk * 5);
    ping.material.uniforms.uOpacity.value = (1 - pk) * 0.5 * pinging;
    S.head.getWorldPosition(v3);
    const from = v3.clone();
    trackLine(tracks[0], from, centers[0], seg(sense, 0.55, 0.85) * (1 - seg(effect, 0.6, 0.7)) * (arrive > 0.5 ? 1 : 0), time);
    trackLine(tracks[1], from, centers[1], seg(sense, 0.6, 0.9) * (1 - seg(effect, 0.9, 0.98)) * (arrive > 0.5 ? 1 : 0), time);

    // decide: the station's island lands; its laptops light as the operator authorizes
    const dK = land(D, seg(decide, 0, 0.45));
    pulse(pulses[2], ISLANDS.decide.x, ISLANDS.decide.z, 6, dK);
    tint(D.lampMat, pal.lampOff, pal.lampOn, seg(decide, 0.72, 0.9));

    // the routes: gold dashes marching toward the receiving island
    const route = (m, k, live) => {
      m.uniforms.uDraw.value = k;
      m.uniforms.uShift.value = time * dashSpeed;
      m.uniforms.uOpacity.value = lerp(0.6, 1, Math.min(1, live));
    };
    for (const { key, m } of links) {
      if (key === "decide-sense") route(m, easeInOut(seg(decide, 0.3, 0.65)), seg(decide, 0.55, 0.75));
      else if (key === "decide-effect") route(m, easeInOut(seg(effect, 0.12, 0.38)), seg(effect, 0.35, 0.5) + whole);
      else route(m, easeInOut(seg(effect, 0.2, 0.42)), seg(effect, 0.35, 0.5) + whole);
    }

    // effect: the array's island lands; power runs from its generator; it
    // follows the swarm the radar found, rests square before and after, and fires
    const eK = land(E, seg(effect, 0, 0.4));
    pulse(pulses[0], ISLANDS.effect.x, ISLANDS.effect.z, 7, eK);
    route(E.power, easeInOut(seg(effect, 0.28, 0.44)), seg(effect, 0.4, 0.5) + whole);
    const leo = E.leo;
    leo.updateMatrixWorld(true);
    leo.parent.worldToLocal(aim.copy(target));
    const rest = pose.leonidas * DEG, wanted = Math.atan2(aim.x - leo.position.x, aim.z - leo.position.z);
    const follow = pose.track ? easeInOut(seg(sense, 0.5, 0.8)) * (1 - easeInOut(seg(whole, 0, 0.7))) : 0;
    leo.userData.turn.rotation.y = rest + (((((wanted - rest) % TAU) + TAU * 1.5) % TAU) - Math.PI) * follow;
    leo.updateMatrixWorld(true);
    leo.userData.tilt.localToWorld(emitter.copy(leo.userData.emitter));
    const firing = seg(effect, 0.42, 0.54) * (1 - seg(effect, 0.92, 0.99));
    waves.forEach((w, i) => {
      const u = (((time / 2.1 + i / 3) % 1) + 1) % 1;
      w.visible = firing > 0 && arrive > 0;
      if (!w.visible) return;
      w.position.lerpVectors(emitter, target, u);
      w.lookAt(target);
      w.scale.setScalar(lerp(2.5, 10, u));
      w.material.uniforms.uOpacity.value = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.55 * firing;
    });

    // the whole: every island pulses together once
    if (whole > 0) {
      const k = seg(whole, 0.1, 0.8);
      Object.values(ISLANDS).forEach((p, i) => pulse(pulses[i], p.x, p.z, 8, k));
    }
  }

  function configure(o = {}) {
    surface.configure(o);
    if (o.island) { pal.tile = tones(o.island); paint(tileMat, pal.tile); }
    if (o.site) pal.sand = tones(o.site);
    if (o.drones) { pal.drone = tones(o.drones); paint(droneMat, pal.drone); }
    if (o.epirus) {
      pal.yellow = o.epirus.toLowerCase() === EPIRUS ? COL.yellow.map((c) => c.clone()) : tones(o.epirus);
      // the routes and the landing pulses are the yellow too, on the dark set
      routes.forEach((m) => m.uniforms.uColor.value.set(o.epirus));
      pulses.forEach((r) => r.material.uniforms.uColor.value.set(o.epirus));
    }
    if (o.air) {
      brackets.color.set(o.air);
      [ping, ...waves].forEach((r) => r.material.uniforms.uColor.value.set(o.air));
    }
    if (o.dashSpeed != null) dashSpeed = o.dashSpeed;
    if (o.dashWidth != null) dash.uWidth.value = o.dashWidth;
    if (o.dashGap != null) dash.uGap.value = o.dashGap;
  }

  function dispose() {
    scene.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    });
    quad.dispose();
    surface.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { apply, configure, render: surface.render, setSize: surface.setSize, dispose, full: FULL };
}

/* ================= the timeline (island-loop.js) ================= */

const ramp = (t, a, b) => clamp((t - a) / (b - a));
const LOOP_AT = 3.6, LOOP = 11;
const ASSEMBLY_AT = { plan: [0.4, 1.8], sense: [1.4, 2.4], decide: [2.2, 3.6], effect: [3.2, 4.0] };
function stateAt(t) {
  const at = ASSEMBLY_AT;
  const s = { time: t, plan: ramp(t, ...at.plan), sense: 0.5 * ramp(t, ...at.sense), decide: ramp(t, ...at.decide), effect: 0.4 * ramp(t, ...at.effect), approach: 0, whole: 0 };
  if (t > LOOP_AT) {
    const u = (t - LOOP_AT) % LOOP;
    s.approach = ramp(u, 0, 3.4);
    s.sense = 0.5 + 0.5 * ramp(u, 2.2, 4.2);
    s.effect = 0.4 + 0.6 * ramp(u, 4.4, 8.2);
    s.whole = ramp(u, 8.2, 9.6);
  }
  return s;
}
// a still: the array firing on the first swarm as it drops
const STILL_AT = LOOP_AT + 5.6;

/* ================= the piece ================= */

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;background:${v["colour.ground"]}`;
  host.append(canvas);

  let world;
  try {
    world = createIsoIslands(canvas, { transparent: true, turn: [0, TAU], maxDpr: 2 });
  } catch {
    canvas.remove();
    const note = document.createElement("p");
    note.textContent = "This piece needs WebGL, which this browser has turned off.";
    note.style.cssText = "position:absolute;inset:auto 0 50% 0;margin:0;text-align:center;color:#d5dfd6;opacity:.7;";
    host.append(note);
    return { update() {}, action() {}, destroy: () => note.remove() };
  }
  const FULL = world.full;

  // Hunter's dark defaults for everything without a dial
  world.configure({
    lineWidth: 0.5, dashWidth: 0.19, dashGap: 3, dashSpeed: 1.9, air: 0xffffff,
    site: SITE, drones: DRONES, shadows: true, shadowSoftness: 1, sunHeight: 51,
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
  });
  const look = () => {
    canvas.style.background = v["colour.ground"];
    world.configure({
      silhouette: v["lines.outlines"], crease: v["lines.outlines"] * (0.13 / 0.16), ink: v["colour.ink"],
      island: v["colour.island"], epirus: v["colour.accent"],
      shadowStrength: v["shadow.strength"], sunAngle: v["shadow.sunAngle"],
    });
  };
  look();

  let W = 0, H = 0, view = { focus: FULL.focus, zoom: 1 };
  function fit() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    world.setSize(W, H);
    const pad = W < 720 ? 12 : 32;
    // on a tall stage the islands come in closer and the swarms may run past the sides
    const tall = H / W > 1.3 ? 1.15 : 1;
    const px = Math.min((W - pad * 2) / (FULL.height * FULL.aspect), (H - pad * 2) / FULL.height) * v["view.zoom"] * tall;
    view = { focus: FULL.focus, zoom: (px * FULL.height) / H };
  }

  let clock = reduced ? STILL_AT : 0, angle = 0;
  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  const draw = () => {
    world.apply({ ...stateAt(clock), turn: angle * DEG }, view);
    world.render();
  };
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt * v["story.speed"];
    if (!drag) angle += v["view.turn"] * dt;
    draw();
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

  // drag to spin the islands; the turn picks up again on release
  let drag = null;
  const onDown = (e) => {
    drag = { x: e.clientX };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!drag) return;
    angle += (e.clientX - drag.x) * 0.4;
    drag.x = e.clientX;
    if (!raf) draw();
  };
  const onUp = () => {
    drag = null;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  const ro = new ResizeObserver(() => {
    fit();
    draw();
  });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
  io.observe(host);
  const onVis = () => { tabVisible = !document.hidden; sync(); };
  document.addEventListener("visibilitychange", onVis);

  fit();
  draw();
  sync();

  return {
    update(values, path) {
      Object.assign(v, values);
      look();
      if (path == null || path === "view.zoom") fit();
      if (!raf) draw();
    },
    action(name) {
      if (name !== "replay") return;
      clock = reduced ? STILL_AT : 0;
      if (!raf) draw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      world.dispose();
      canvas.remove();
    },
  };
}
