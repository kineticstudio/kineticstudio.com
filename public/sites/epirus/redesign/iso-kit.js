/* The isometric kit: what every Epirus drawing in the icon system's style
   shares. A true isometric camera, flat faces in the icons' three tones (top
   lightest, left middle, right darkest), an optional high sun that casts soft
   shadows, no fog, and soft ink lines from a screen-space pass over normals
   and depth: silhouettes a little darker than the creases inside them. Plus
   the hardware, built once. Epirus's own pieces follow their Critical Point
   Defense Kit and Leonidas Ground Vehicle renders (6 October): Leonidas's
   array on its turntable, on a trailer or on the GV pickup; the radar, a
   little four-panel head on a four-legged stand; the operator station's
   two tables; the generator that powers Leonidas. Then the site's: a
   lattice mast (pylons, comms), Quonset hangars, tanks, a fence; and the
   quadcopters and the two-corner brackets from their hero film.

   iso-world.js (the system, assembled), iso-islands.js, iso-layers.js,
   iso-network.js (critical points joined into one defense) and
   hero-swarm.js are scenes made from these parts. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const seg = (v, a, b) => clamp((v - a) / (b - a));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const boxAt = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// top, left (+z) and right (+x) faces, as the icons shade them
export const PAL = {
  tile: ['#F8F7F3', '#EAE8DF', '#DDDBD1'],
  sand: ['#EFEDE6', '#E3E1D7', '#D4D2C7'],
  yellow: ['#FFE68F', '#FFD748', '#E8BA2E'],
  drone: ['#86898C', '#626568', '#45484B'],
  lampOff: ['#8C8672', '#78725F', '#645E4B'],
  lampOn: ['#FFFBE6', '#FFF1B8', '#FFE68F'],
  // the icon family's accent (prototypes/icons-src/iso.js): what Point
  // Defense protects, the critical asset, is drawn in it
  sage: ['#D5DFD6', '#A7B5A9', '#7F9481'],
};
export const COL = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, v.map((c) => new THREE.Color(c))]));
export const INK = 0x0f0e12, GOLD = 0xb8900a;
/** The dark set, for a drawing on their black (#0f0e12): pass to any
    drawing's configure(). Hunter's dark defaults from Prototypes > Island
    animation v2 (4 October): fog lines, half a pixel wide and light, and
    small square dashes three widths apart. */
export const DARK = {
  theme: 'dark', island: '#36353c', site: '#4a4950', drones: '#a7aaae',
  ink: '#d5dfd6', lineWidth: 0.5, silhouette: 0.16, crease: 0.13, dashWidth: 0.19, dashGap: 3,
  // on the Epirus yellow the fog lines vanish, so its edges take their
  // black instead, like the icons' lines (Hunter, 4 October: more contrast
  // on the yellow pieces)
  yellowInk: '#0f0e12', yellowSilhouette: 0.55, yellowCrease: 0.4,
};

// the isometric view: looking down the cube's diagonal, as the icons do
export const DIR = new THREE.Vector3(1, 1, 1).normalize();
export const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
export const UP = new THREE.Vector3().crossVectors(RIGHT, DIR).negate().normalize();
/** A world point's position along the view's right and up axes. */
export const screenOf = (x, y, z) => [x * RIGHT.x + y * RIGHT.y + z * RIGHT.z, x * UP.x + y * UP.y + z * UP.z];
/** The ground point that sits at (cx, cy) along the view's right and up axes. */
export function groundPointAt(cx, cy) {
  const p = new THREE.Vector3().addScaledVector(RIGHT, cx).addScaledVector(UP, cy);
  const t = p.y / DIR.y;
  return [p.x - DIR.x * t, 0, p.z - DIR.z * t];
}
/** The view that frames a set of world points, with a margin. */
export function frameView(pts, margin = 4) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    const [sx, sy] = screenOf(...p);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return { focus: groundPointAt((x0 + x1) / 2, (y0 + y1) / 2), zoom: 1, height: y1 - y0 + 2 * margin, aspect: (x1 - x0 + 2 * margin) / (y1 - y0 + 2 * margin) };
}

/* ---- materials ---- */

// the sun: over the viewer's left shoulder, 51 degrees up and 30 round from
// the left face, so shadows fall to the right and a little behind, the side
// the icons already shade darkest (Hunter's settings, 4 October)
export const SUN = new THREE.Vector3(-0.3147, 0.7771, 0.545).normalize();

// shared by every icon material; each surface fills them in as it renders
// (exported for a ground drawn with its own shader, iso-plane.js)
export const SHADOW = {
  tShadow: { value: null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowTexel: { value: new THREE.Vector2() },
  uShadowOffset: { value: 0.05 },
  uLight: { value: SUN.clone() },
  uShadowTone: { value: new THREE.Color(0.7, 0.7, 0.73) }, // linear: a soft, barely cool grey
};

const ICON_VERT = `
  uniform mat4 uShadowMatrix; uniform float uShadowOffset;
  varying vec3 vN; varying vec4 vShadow;
  #ifdef HEAT
    varying float vHeat;
  #endif
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = m * instanceMatrix;
    #endif
    #if defined(HEAT) && defined(USE_INSTANCING_COLOR)
      vHeat = instanceColor.r;
    #endif
    vN = normalize(mat3(m) * normal);
    vec4 wp = m * vec4(position, 1.0);
    // pushed out along the normal a touch, so a face does not shadow itself
    vShadow = uShadowMatrix * vec4(wp.xyz + vN * uShadowOffset, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const ICON_FRAG = `
  uniform vec3 uTop; uniform vec3 uLeft; uniform vec3 uRight;
  uniform sampler2DShadow tShadow; uniform float uShadowOn; uniform vec2 uShadowTexel; uniform vec3 uLight; uniform vec3 uShadowTone;
  varying vec3 vN; varying vec4 vShadow;
  #ifdef HEAT
    uniform vec3 uHotTop; uniform vec3 uHotLeft; uniform vec3 uHotRight; varying float vHeat;
  #endif
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
    vec3 top = uTop, left = uLeft, right = uRight;
    #ifdef HEAT
      // the heat is on the surface: tops only, the sides keep their tones
      top = mix(top, uHotTop, vHeat);
    #endif
    vec3 col = (top * w.x + left * w.y + right * w.z) / (w.x + w.y + w.z);
    // cast shadows land only on faces turned to the sun; the faces turned
    // away already carry the icons' darkest tone
    if (uShadowOn > 0.5) col = mix(col, col * uShadowTone, (1.0 - lit()) * smoothstep(0.02, 0.3, dot(n, uLight)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
/** A flat material in three tones: [top, left, right] colors. With hot (a
    second set of tones), an instanced mesh blends each instance's top face
    toward it by the red of its instance colour, 0 to 1: a heat map in the
    icons' style. */
export function iconMaterial(cols, hot = null) {
  const uniforms = { uTop: { value: cols[0].clone() }, uLeft: { value: cols[1].clone() }, uRight: { value: cols[2].clone() }, ...SHADOW };
  if (hot) Object.assign(uniforms, { uHotTop: { value: hot[0].clone() }, uHotLeft: { value: hot[1].clone() }, uHotRight: { value: hot[2].clone() } });
  return new THREE.ShaderMaterial({
    uniforms,
    defines: hot ? { HEAT: '' } : {},
    vertexShader: ICON_VERT,
    fragmentShader: ICON_FRAG,
  });
}
/** Blend an icon material between two palettes. */
export function tint(m, a, b, k) {
  m.uniforms.uTop.value.copy(a[0]).lerp(b[0], k);
  m.uniforms.uLeft.value.copy(a[1]).lerp(b[1], k);
  m.uniforms.uRight.value.copy(a[2]).lerp(b[2], k);
}
/** The icons' three tones from one colour, taken as the left face's: the
    top lifted toward white and the right face a step darker, the way the
    yellow (#FFD748 between #FFE68F and #E8BA2E) and the sand are shaded. */
export function tones(hex) {
  const mid = new THREE.Color(hex).convertLinearToSRGB();
  const out = (c) => c.convertSRGBToLinear();
  // a light colour's top lifts a long way toward white, a dark one's barely
  const lift = 0.45 * (0.2126 * mid.r + 0.7152 * mid.g + 0.0722 * mid.b);
  return [out(mid.clone().lerp(new THREE.Color(1, 1, 1), lift)), out(mid.clone()), out(mid.clone().multiplyScalar(0.91))];
}
/** Set an icon material's three tones. */
export function paint(m, cols) {
  m.uniforms.uTop.value.copy(cols[0]);
  m.uniforms.uLeft.value.copy(cols[1]);
  m.uniforms.uRight.value.copy(cols[2]);
}

/** A circle as a hairline that keeps its pixel width at any size or angle;
    dashes > 0 breaks it into that many dashes. Scale the mesh for radius. */
export function hairlineMaterial(color, dashes = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uWidth: { value: 1.25 }, uDpr: { value: 1 }, uDashes: { value: dashes } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uWidth; uniform float uDpr; uniform float uDashes; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float px = abs(r - 0.98) / max(fwidth(r), 1e-6);
        float hw = uWidth * uDpr * 0.5;
        float a = (1.0 - smoothstep(hw - 0.5, hw + 0.5, px)) * uOpacity;
        if (uDashes > 0.0 && fract(atan(p.y, p.x) / 6.2831853 * uDashes) > 0.55) a = 0.0;
        if (a <= 0.0) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** A dashed ribbon along a run on the ground: draws in with uDraw, its dashes
    march with uShift. Pair with runGeometry. */
export function runMaterial(color, opacity, dash = 1.6, duty = 0.55) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uDraw: { value: 0 }, uLen: { value: 1 }, uDash: { value: dash }, uDuty: { value: duty }, uShift: { value: 0 } },
    vertexShader: 'attribute float aU; varying float vU; void main() { vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uDraw; uniform float uLen; uniform float uDash; uniform float uDuty; uniform float uShift; varying float vU;
      void main() {
        if (vU > uDraw * uLen) discard;
        if (fract((vU - uShift) / uDash) > uDuty) discard;
        gl_FragColor = vec4(uColor, uOpacity);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
}
/** A flat ribbon along ground points [[x, z], ...] at height y. */
export function runGeometry(pts, width, y = 0.06) {
  const pos = [], u = [], idx = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    const nx = (-(bz - az) / len) * (width / 2), nz = ((bx - ax) / len) * (width / 2);
    const base = pos.length / 3;
    pos.push(ax + nx, y, az + nz, ax - nx, y, az - nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz);
    u.push(acc, acc, acc + len, acc + len);
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    acc += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(u, 1));
  g.setIndex(idx);
  g.userData.length = acc;
  return g;
}
/** Square dashes: every dashed line in a drawing shares one width and one
    gap (`dash`, a set of uniforms: uWidth in world units, uGap as a multiple
    of the width), so they all read at the same weight. The dash ends are
    smoothed over a pixel; uDraw draws the line in, uShift marches it. */
export function dashUniforms(width = 0.32, gap = 1) {
  return { uWidth: { value: width }, uGap: { value: gap } };
}
export function dashMaterial(dash, color, opacity = 1) {
  return new THREE.ShaderMaterial({
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
}
/** A dashed line along ground points [[x, z], ...] at height y, for
    dashMaterial: its width comes from the material, so it can change live. */
export function dashGeometry(pts, y = 0.07) {
  const pos = [], side = [], u = [], idx = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    const base = pos.length / 3;
    pos.push(ax, y, az, ax, y, az, bx, y, bz, bx, y, bz);
    side.push(nx, 0, nz, -nx, 0, -nz, nx, 0, nz, -nx, 0, -nz);
    u.push(acc, acc, acc + len, acc + len);
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    acc += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(u, 1));
  g.setIndex(idx);
  g.userData.length = acc;
  return g;
}
export const runLength = (pts) => pts.reduce((L, p, i) => (i ? L + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
/** The ground point a fraction u along a run. */
export function along(pts, u) {
  let left = runLength(pts) * clamp(u);
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left <= l) { const f = l ? left / l : 0; return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]; }
    left -= l;
  }
  return pts[pts.length - 1];
}

/* ---- the renderer: color, then normals and depth, then the lines ---- */

const OUTLINE_FRAG = `
  uniform sampler2D tColor; uniform sampler2D tNormal; uniform sampler2D tDepth;
  uniform vec2 uStep; uniform vec3 uInk; uniform float uDepthEdge; uniform float uSilhouette; uniform float uCrease; uniform float uTransparent;
  uniform vec3 uYellowInk; uniform float uYellowSilhouette; uniform float uYellowCrease; uniform float uPerspA;
  uniform float uFadeOn; uniform mat4 uInvViewProj; uniform vec2 uFadeCenter; uniform vec2 uFadeReach; uniform vec2 uFadeBelow;
  varying vec2 vUv;
  vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
  float dep(vec2 uv) { return texture2D(tDepth, uv).x; }
  void main() {
    vec4 c = texture2D(tColor, vUv);
    vec3 col = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
    vec2 ox = vec2(uStep.x, 0.0), oy = vec2(0.0, uStep.y);
    float d0 = dep(vUv);
    // nearer than its neighbours by more than a sloped surface would be: the
    // near side of a silhouette, so the line falls on the object, one side only
    float dEdge = max(dep(vUv - ox) + dep(vUv + ox) - 2.0 * d0, dep(vUv - oy) + dep(vUv + oy) - 2.0 * d0);
    // under a perspective camera the depth buffer runs as 1/distance, so the
    // same jump is measured against the distance (uPerspA = far / (far - near))
    if (uPerspA > 0.0) dEdge /= max(uPerspA - d0, 1e-7);
    vec3 n0 = nrm(vUv);
    vec3 a = n0 - nrm(vUv + ox), b = n0 - nrm(vUv + oy);
    float nEdge = max(dot(a, a), dot(b, b));
    float sil = smoothstep(uDepthEdge * 0.6, uDepthEdge * 1.4, dEdge), crease = smoothstep(0.07, 0.18, nEdge) * step(d0, 0.9999);
    // a line on the Epirus yellow (lit or in shadow, not the darker heat
    // map's gold) can take an ink and weights of its own; off below zero
    float onYellow = smoothstep(0.19, 0.26, min(col.r, col.g) - col.b) * step(0.0, uYellowSilhouette);
    float e = mix(max(sil * uSilhouette, crease * uCrease), max(sil * uYellowSilhouette, crease * uYellowCrease), onYellow);
    // setFade(): what stands low on the ground fades out with its distance
    // from a centre, lines and all, the way the ground's grid does
    float keep = 1.0;
    if (uFadeOn > 0.5 && d0 < 0.9999) {
      vec4 wp = uInvViewProj * vec4(vUv * 2.0 - 1.0, d0 * 2.0 - 1.0, 1.0);
      wp /= wp.w;
      float k = 1.0 - smoothstep(uFadeReach.x, uFadeReach.y, length(wp.xz - uFadeCenter));
      keep = mix(1.0, k * k, 1.0 - smoothstep(uFadeBelow.x, uFadeBelow.y, wp.y));
    }
    gl_FragColor = vec4(mix(col, mix(uInk, uYellowInk, onYellow), e), (uTransparent > 0.5 ? max(c.a, e) : 1.0) * keep);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a; // the canvas takes premultiplied color
  }`;

export const OVER = 1; // the layer for overlays: drawn in color, outlined by nothing
export const NOCAST = 2; // solids that get lines but cast no shadow (things in the air)

/**
 * One isometric drawing surface. Solids go in `scene` on layer 0 and get
 * lines; overlays (dashes, rings, brackets) use `overlay()` and do not.
 *   setSize(w, h)   css pixels
 *   setView({ focus, zoom })
 *   render()
 *   project([x, y, z]) -> [x%, y%] of the canvas box
 * Options: shadows (a radius in world units around the origin that the sun's
 * shadow map covers, or false), shadowSize (the map's pixels, 2048 unless a
 * small drawing needs less), lines ({ silhouette, crease }, ink strength
 * 0 to 1), transparent (no white ground: the page shows through),
 * perspective (a vertical fov in degrees: a perspective camera, placed with
 * setCamera() instead of setView(); hero-flyin.js).
 *   configure({ lineWidth, silhouette, crease, ink, yellowInk,
 *     yellowSilhouette, yellowCrease, shadows, shadowStrength, shadowSoftness,
 *     sunAngle, sunHeight, pixelRatio, antialias }) changes any of them while
 *   it runs (angles in degrees, widths in css pixels; the yellow ones give
 *   lines on the Epirus yellow their own ink and weights).
 */
export function createIsoRenderer(canvas, { baseHeight = 90, maxDpr = 2, stills = false, shadows = false, shadowSize = 2048, lines = {}, transparent = false, perspective = 0 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: transparent, premultipliedAlpha: true, preserveDrawingBuffer: stills });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const camera = perspective ? new THREE.PerspectiveCamera(perspective, 1, 1, 6000) : new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1400);
  camera.layers.enableAll();

  const rtColor = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
  const rtNormal = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(2, 2) });
  const normalMat = new THREE.MeshNormalMaterial();
  const outline = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rtColor.texture }, tNormal: { value: rtNormal.texture }, tDepth: { value: rtNormal.depthTexture }, uStep: { value: new THREE.Vector2() },
      uInk: { value: new THREE.Color(INK) }, uDepthEdge: { value: 0.0008 }, uSilhouette: { value: lines.silhouette ?? 0.27 }, uCrease: { value: lines.crease ?? 0.29 },
      uTransparent: { value: transparent ? 1 : 0 },
      uYellowInk: { value: new THREE.Color(INK) }, uYellowSilhouette: { value: -1 }, uYellowCrease: { value: 0 },
      uPerspA: { value: 0 },
      uFadeOn: { value: 0 }, uInvViewProj: { value: new THREE.Matrix4() }, uFadeCenter: { value: new THREE.Vector2() }, uFadeReach: { value: new THREE.Vector2(1, 2) }, uFadeBelow: { value: new THREE.Vector2(12, 16) },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: OUTLINE_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const post = new THREE.Scene();
  post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outline));
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const white = new THREE.Color(0xffffff);
  const v3 = new THREE.Vector3();
  // the view's right and up in the world, for anything drawn facing the
  // camera (brackets): the isometric axes, or a perspective camera's own
  const surface = { renderer, scene, camera, viewH: 1, pxScale: 1, baseHeight, right: RIGHT.clone(), up: UP.clone() };

  // the sun's shadow map: depth from the sun over everything on layer 0. A
  // surface without shadows still binds a real (1 by 1) depth map, because a
  // shadow sampler with nothing valid bound fails every draw that uses it
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
    cam.position.copy(SUN).multiplyScalar(D);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    cam.layers.set(0);
    const matrix = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    const aim = (dir) => {
      cam.position.copy(dir).multiplyScalar(D);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    };
    return { on: !!shadows, can: !!shadows, drawn: false, rt, cam, depth, matrix, aim, texel: 1.4 / SIZE, mat: new THREE.MeshBasicMaterial({ colorWrite: false }) };
  })();

  surface.setSize = (w, h) => {
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    surface.viewH = Math.max(1, h);
    const aspect = w / Math.max(1, h), H = surface.baseHeight;
    if (perspective) camera.aspect = aspect;
    else {
      camera.top = H / 2; camera.bottom = -H / 2;
      camera.left = (-H * aspect) / 2; camera.right = (H * aspect) / 2;
    }
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    const W = Math.max(2, Math.floor(w * pr)), Hp = Math.max(2, Math.floor(h * pr));
    rtColor.setSize(W, Hp);
    rtNormal.setSize(W, Hp);
    // one line, one css pixel wide (two device pixels on a retina screen)
    const k = Math.max(1, Math.round(pr * surface.pxScale * cfg.lineWidth));
    outline.uniforms.uStep.value.set(k / W, k / Hp);
  };
  // v.turn (radians, optional) swings the isometric view round the
  // vertical (iso-many.js, round six: it turns a little as it pulls back)
  const turnAxis = new THREE.Vector3(0, 1, 0), turnDir = new THREE.Vector3();
  surface.setView = (v) => {
    const dir = v.turn ? turnDir.copy(DIR).applyAxisAngle(turnAxis, v.turn) : DIR;
    camera.position.set(...v.focus).addScaledVector(dir, 600);
    camera.up.set(0, 1, 0);
    camera.lookAt(...v.focus);
    camera.zoom = v.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    if (v.turn != null) {
      surface.right.setFromMatrixColumn(camera.matrixWorld, 0);
      surface.up.setFromMatrixColumn(camera.matrixWorld, 1);
    }
  };
  /** A perspective surface's camera: { position, target, fov (degrees) }. The
      depth lines are scaled to the distance to the target, so a piece there
      is drawn with the weight it has in the isometric drawings. */
  surface.setCamera = ({ position, target, fov = camera.fov, near, far = 6000, up = [0, 1, 0] }) => {
    camera.position.set(...position);
    camera.up.set(...up);
    camera.lookAt(...target);
    const dist = camera.position.distanceTo(v3.set(...target));
    camera.fov = fov;
    camera.near = near ?? Math.max(0.5, dist * 0.01);
    camera.far = far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    surface.right.setFromMatrixColumn(camera.matrixWorld, 0);
    surface.up.setFromMatrixColumn(camera.matrixWorld, 1);
    outline.uniforms.uPerspA.value = camera.far / (camera.far - camera.near);
    outline.uniforms.uDepthEdge.value = (lines.depthEdge ?? 1.1) / dist;
  };
  /** A transparent surface: everything standing below below[0] (fully) to
      below[1] (not at all) fades out from reach[0] to reach[1] world units
      from center ([x, z]), its lines with it, the way the grid's lines do
      (iso-plane.js). Things in the air stay. Pass null to stop. */
  surface.setFade = (f) => {
    const u = outline.uniforms;
    u.uFadeOn.value = f ? 1 : 0;
    if (!f) return;
    u.uFadeCenter.value.set(...f.center);
    u.uFadeReach.value.set(...f.reach);
    if (f.below) u.uFadeBelow.value.set(...f.below);
  };
  surface.render = () => {
    if (outline.uniforms.uFadeOn.value) outline.uniforms.uInvViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
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
    renderer.render(post, postCam);
  };
  surface.configure = (o = {}) => {
    const u = outline.uniforms;
    if (o.silhouette != null) u.uSilhouette.value = o.silhouette;
    if (o.crease != null) u.uCrease.value = o.crease;
    if (o.ink != null) u.uInk.value.set(o.ink);
    if (o.yellowInk != null) u.uYellowInk.value.set(o.yellowInk);
    if (o.yellowSilhouette != null) u.uYellowSilhouette.value = o.yellowSilhouette;
    if (o.yellowCrease != null) u.uYellowCrease.value = o.yellowCrease;
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
    if (o.antialias != null && o.antialias !== rtColor.samples) { rtColor.samples = o.antialias; rtColor.dispose(); }
    if (o.pixelRatio != null) renderer.setPixelRatio(o.pixelRatio);
    if (o.lineWidth != null) cfg.lineWidth = o.lineWidth;
    if (lastW) surface.setSize(lastW, lastH);
  };
  surface.project = (at) => {
    v3.set(...at).project(camera);
    return [((v3.x + 1) / 2) * 100, ((1 - v3.y) / 2) * 100];
  };
  /** World units per css pixel in the current view (under a perspective
      camera, at the depth of the point given). */
  surface.unitsPerPx = (at) => {
    if (!perspective) return (camera.top - camera.bottom) / camera.zoom / surface.viewH;
    const depth = at ? -v3.set(...at).applyMatrix4(camera.matrixWorldInverse).z : 100;
    return (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.max(depth, 0.1)) / surface.viewH;
  };
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
  return surface;
}

/* ---- hardware ---- */

const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};

/** A strut between two points: a square bar of side t. */
function strut(a, b, t) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = new THREE.BoxGeometry(t, t, A.distanceTo(B));
  g.applyMatrix4(new THREE.Matrix4().lookAt(B, A, new THREE.Vector3(0, 1, 0)));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

/** Leonidas's array on its turntable, as it rides its trailer or a vehicle
    (Epirus's Critical Point Defense Kit render): the turntable, the
    cabinet with vents, the connector box, the yoke and hinge, the cables
    up to the array, and the array enclosure leaning back with its frame and
    tiles. Faces local +z; its base sits at y = 0. Options: hinge (the tilt
    axis's height) and lift (the enclosure's rise above it), for a drawing
    matched to a photograph (hero-simreal.js); the defaults are the kit's.
    Returns { group, tilt, emitter (local to tilt), top (local to tilt) }. */
// Round six's pages carry data-r6 on <html>: there the array is drawn closer
// to the fielded unit (Jeff Morgan, 10 October: "Can we refine these details
// on the models?", against their Barstow photograph and kit render): a
// smooth radome face in its frame, the cable bundles looping down from the
// array's foot to the turntable, round hubs where the array hinges on its
// side arms, and the EO/IR camera on top. Earlier rounds keep their drawing.
const R6_DETAIL = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-r6');
function buildArray(mat, { hinge = 2.59, lift = 0, refined = R6_DETAIL } = {}) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(1.3, 1.42, 0.46, 40), mat, 0, 0.23, 0);
  add(g, new THREE.BoxGeometry(1.6, 1.25, 1.1), mat, 0, 0.625, -1.55);
  add(g, mergeGeometries([0, 1, 2, 3, 4].map((i) => boxAt(0.05, 0.08, 0.9, 0, 0.3 + i * 0.16, 0))), mat, 0.82, 0, -1.55);
  add(g, new THREE.BoxGeometry(0.9, 0.42, 0.6), mat, 1.8, 0.21, 1.55);
  add(g, mergeGeometries([boxAt(0.36, hinge - 0.29, 0.75, -2.25, 0, 0), boxAt(0.36, hinge - 0.29, 0.75, 2.25, 0, 0)]), mat, 0, (hinge + 0.63) / 2, 0);
  add(g, new THREE.CylinderGeometry(0.3, 0.3, 4.9, 20).rotateZ(Math.PI / 2), mat, 0, hinge, 0);
  // the cables from the turntable up to the array's foot
  if (refined) {
    // two bundles of three, hanging forward in loops as the real ones do
    const cable = (x) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(x * 1.2, hinge - 0.15, 0.35),
      new THREE.Vector3(x * 1.28, hinge * 0.58, 1.12),
      new THREE.Vector3(x * 1.12, 0.82, 1.02),
      new THREE.Vector3(x, 0.47, 0.6),
    ]), 18, 0.065, 6);
    add(g, mergeGeometries([-0.98, -0.74, -0.5, 0.5, 0.74, 0.98].map(cable)), mat);
    // the hubs on the side arms, at the hinge
    add(g, mergeGeometries([-1, 1].map((side) => new THREE.CylinderGeometry(0.58, 0.58, 0.12, 28).rotateZ(Math.PI / 2).translate(side * 2.49, hinge, 0))), mat);
  } else {
    add(g, mergeGeometries([-0.75, -0.4, 0.4, 0.75].map((x) => strut([x, 0.46, 0.35], [x * 1.25, hinge - 0.39, 0.55], 0.12))), mat);
  }
  const tilt = new THREE.Group();
  tilt.position.set(0, hinge, 0);
  tilt.rotation.x = -0.28;
  g.add(tilt);
  const mid = 2.95 + lift; // the enclosure's centre above the tilt axis
  add(tilt, new THREE.BoxGeometry(4.2, 5.5, 0.9), mat, 0, mid, 0);
  add(tilt, mergeGeometries([boxAt(4.3, 0.14, 0.12, 0, 2.75, 0), boxAt(4.3, 0.14, 0.12, 0, -2.75, 0), boxAt(0.14, 5.6, 0.12, 2.1, 0, 0), boxAt(0.14, 5.6, 0.12, -2.1, 0, 0)]), mat, 0, mid, 0.51);
  if (refined) {
    // the radome: one smooth face, set a little inside the frame
    add(tilt, new THREE.BoxGeometry(3.86, 5.22, 0.05), mat, 0, mid, 0.47);
    // the EO/IR camera on its post at the top
    add(tilt, mergeGeometries([boxAt(0.42, 0.22, 0.42, 0, 2.86, -0.1), new THREE.CylinderGeometry(0.12, 0.12, 0.22, 12).translate(0, 3.08, -0.1), new THREE.SphereGeometry(0.25, 18, 12).translate(0, 3.36, -0.1)].map((x) => x.toNonIndexed())), mat, 0, mid, 0);
  } else {
    const tiles = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) tiles.push(boxAt(0.56, 0.56, 0.06, -1.6 + c * 0.64, -2.24 + r * 0.64, 0));
    add(tilt, mergeGeometries(tiles), mat, 0, mid, 0.49);
  }
  add(tilt, mergeGeometries([[-2.16, 1.2], [-2.16, -1.2], [2.16, 1.2], [2.16, -1.2]].map(([x, y]) => boxAt(0.12, 0.5, 0.3, x, y, 0))), mat, 0, mid, 0);
  // the back: stiffeners and the label plate, the side an isometric view sees
  add(tilt, mergeGeometries([-1.2, 0, 1.2].map((x) => boxAt(0.16, 5.1, 0.1, x, 0, 0))), mat, 0, mid, -0.5);
  add(tilt, new THREE.BoxGeometry(1.5, 0.6, 0.06), mat, 0.6, 1.5 + lift, -0.56);
  return { group: g, tilt, emitter: new THREE.Vector3(0, mid, 0.7), top: new THREE.Vector3(0, 5.9 + lift, 0) };
}

/** Leonidas on its trailer, after Epirus's Critical Point Defense Kit render:
    a deck on frame rails, tandem wheels under each side, a tongue to the
    front with its jack wheel, jack stands at the corners, and the array on
    its turntable in the middle of the deck. The trailer runs along x; the
    array faces local +z. Turn userData.turn (the turntable) to aim, never
    the trailer. Options, for a drawing matched to a photograph
    (hero-simreal.js; the defaults are the kit's): deck (its top's height),
    wheels (the axles' x), wheelR, jacks (the stands' x), array ({ x, scale,
    hinge, lift }). userData: turn, tilt, emitter (local to tilt), top
    (local to tilt). */
export function buildLeonidas(mat, { deck = 1.3, wheels = [-0.15, 1.0], wheelR = 0.5, jacks = [-2.95, 2.95], array: arrayShape = {} } = {}) {
  const node = new THREE.Group();
  const DECK = deck;
  add(node, new THREE.BoxGeometry(6.4, 0.3, 3.6), mat, 0, DECK - 0.15, 0);
  add(node, mergeGeometries([boxAt(6.4, 0.22, 0.22, 0, DECK - 0.41, -1.15), boxAt(6.4, 0.22, 0.22, 0, DECK - 0.41, 1.15)]), mat);
  const wheel = new THREE.CylinderGeometry(wheelR, wheelR, 0.36, 24).rotateX(Math.PI / 2);
  add(node, mergeGeometries(wheels.flatMap((x) => [-1.58, 1.58].map((z) => wheel.clone().translate(x, wheelR, z)))), mat);
  add(node, mergeGeometries([strut([-3.2, DECK - 0.38, -1.1], [-4.6, DECK - 0.44, 0], 0.18), strut([-3.2, DECK - 0.38, 1.1], [-4.6, DECK - 0.44, 0], 0.18), boxAt(0.36, 0.2, 0.3, -4.7, DECK - 0.44, 0)]), mat);
  add(node, mergeGeometries([boxAt(0.1, DECK - 0.68, 0.1, -4.05, 0.16 + (DECK - 0.68) / 2, 0), new THREE.CylinderGeometry(0.16, 0.16, 0.12, 14).rotateX(Math.PI / 2).translate(-4.05, 0.16, 0)]), mat);
  add(node, mergeGeometries(jacks.flatMap((x) => [-1.45, 1.45].map((z) => [x, z])).flatMap(([x, z]) => [boxAt(0.16, DECK - 0.3, 0.16, x, (DECK - 0.3) / 2, z), boxAt(0.5, 0.08, 0.5, x, 0.04, z)])), mat);
  const array = buildArray(mat, arrayShape);
  array.group.position.set(arrayShape.x ?? 0, DECK, 0);
  array.group.scale.setScalar(arrayShape.scale ?? 1);
  node.add(array.group);
  node.userData = { turn: array.group, tilt: array.tilt, emitter: array.emitter, top: array.top };
  return node;
}

/** A lattice mast with a head: the power station's pylon. (The radar is
    buildRadar, Epirus's little tripod.) userData: head. */
export function buildMast(mat) {
  const mast = new THREE.Group();
  add(mast, new THREE.BoxGeometry(2.2, 0.4, 2.2), mat, 0, 0.2, 0);
  const lattice = [];
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) lattice.push(boxAt(0.2, 9.6, 0.2, x, 5.2, z));
  for (let l = 0; l < 6; l++) {
    const y = 1.6 + l * 1.65;
    lattice.push(boxAt(1.36, 0.1, 0.1, 0, y, -0.6), boxAt(1.36, 0.1, 0.1, 0, y, 0.6), boxAt(0.1, 0.1, 1.36, -0.6, y, 0), boxAt(0.1, 0.1, 1.36, 0.6, y, 0));
    const d = new THREE.BoxGeometry(0.08, 1.85, 0.08);
    lattice.push(d.clone().rotateZ(0.65).translate(0, y + 0.82, 0.6), d.clone().rotateZ(-0.65).translate(0, y + 0.82, -0.6), d.clone().rotateX(0.65).translate(0.6, y + 0.82, 0), d.clone().rotateX(-0.65).translate(-0.6, y + 0.82, 0));
  }
  add(mast, mergeGeometries(lattice), mat);
  add(mast, new THREE.BoxGeometry(1.9, 0.18, 1.9), mat, 0, 10.1, 0);
  const head = new THREE.Group();
  head.position.y = 11.1;
  mast.add(head);
  add(head, new THREE.CylinderGeometry(0.28, 0.34, 0.6, 16), mat, 0, -0.55, 0);
  add(head, new THREE.BoxGeometry(3.0, 1.6, 0.36), mat, 0, 0.25, 0);
  const radarTiles = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) radarTiles.push(boxAt(0.42, 0.42, 0.05, -1.18 + c * 0.47, -0.47 + r * 0.47, 0));
  add(head, mergeGeometries(radarTiles), mat, 0, 0.25, 0.2);
  mast.userData = { head };
  return mast;
}

/** The radar as Epirus fields it (their Critical Point Defense Kit render):
    a little tower, about half Leonidas's height, on a four-legged stand with
    splayed legs and foot pads, a telescoping pole, and a head of four small
    panels facing every way round a central unit, so it sees all round and
    does not turn. userData: head (the four panels and the unit, at the top
    of the pole). */
export function buildRadar(mat) {
  const r = new THREE.Group();
  const HUB = 0.95, TOP = 3.55;
  const parts = [new THREE.CylinderGeometry(0.17, 0.17, 0.32, 14).translate(0, HUB, 0), new THREE.CylinderGeometry(0.1, 0.1, TOP - HUB, 14).translate(0, (TOP + HUB) / 2, 0), new THREE.CylinderGeometry(0.15, 0.15, 0.42, 14).translate(0, HUB + 0.95, 0)];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const fx = Math.cos(a) * 1.55, fz = Math.sin(a) * 1.55;
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

/** The operator station, as Epirus sets it up (their Critical Point Defense
    Kit render): two tables, one with two laptops open toward the operator
    (+z) and a small antenna, one with two rack cases and a monitor. The
    laptop screens are the lamp: they light as the operator authorizes.
    About 4.4 wide (x) and 1.0 deep. Options (round six, Jeff Morgan,
    9 October): screens: 3 sets their three-screen display in place of the
    two laptops ("we have a 3 GUI display": a rugged laptop with a screen
    folding out to each side, all three lit); person: a material, to seat
    the operator at it, on a stool on the +z side, hands on the keys.
    userData: lamp. */
export function buildOperatorStation(mat, lampMat = mat, { screens = 2, person = null } = {}) {
  const s = new THREE.Group();
  const table = (cx, w) => [boxAt(w, 0.08, 1.0, cx, 1.02, 0), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => boxAt(0.07, 0.98, 0.07, cx + sx * (w / 2 - 0.1), 0.49, sz * 0.42))];
  add(s, mergeGeometries([...table(-1.15, 2.1), ...table(1.15, 2.0)]), mat);
  let lamp;
  if (screens === 3) {
    // the base, the middle screen leaning back, and a wing hinged to each
    // side of it, turned in toward the operator
    const X = -1.1, Z = -0.06, SW = 0.6, WW = 0.5, H = 0.4, IN = 0.5;
    add(s, boxAt(0.66, 0.04, 0.44, X, 1.08, 0.14), mat);
    const panel = (w) => new THREE.BoxGeometry(w, H, 0.035).rotateX(-0.2);
    const wing = (side) => panel(WW).rotateY(-side * IN).translate(X + side * (SW / 2 + (WW / 2) * Math.cos(IN)), 1.29, Z + (WW / 2) * Math.sin(IN));
    lamp = add(s, mergeGeometries([panel(SW).translate(X, 1.29, Z), wing(-1), wing(1)]), lampMat);
  } else {
    add(s, mergeGeometries([-1.55, -0.8].map((x) => boxAt(0.52, 0.04, 0.36, x, 1.08, 0.12))), mat);
    lamp = add(s, mergeGeometries([-1.55, -0.8].map((x) => new THREE.BoxGeometry(0.52, 0.36, 0.04).rotateX(-0.22).translate(x, 1.27, -0.07))), lampMat);
  }
  if (person) {
    // the operator, seated at the screens and facing them (-z): a stool,
    // legs bent under the table, a torso leaning in a little, arms out to
    // the keys, a head; about 1.75 tall seated, a person at the table's
    // scale (the table top stands 1.06)
    const X = -1.1, Z = 1.0;
    const stool = [boxAt(0.46, 0.06, 0.42, X, 0.6, Z + 0.05), boxAt(0.08, 0.57, 0.08, X, 0.29, Z + 0.05), boxAt(0.44, 0.04, 0.44, X, 0.02, Z + 0.05)];
    add(s, mergeGeometries(stool), mat);
    const body = [];
    for (const side of [-1, 1]) {
      const x = X + side * 0.12;
      body.push(strut([x, 0.72, Z + 0.06], [x, 0.7, Z - 0.42], 0.17)); // thigh
      body.push(strut([x, 0.68, Z - 0.42], [x, 0.1, Z - 0.48], 0.15)); // shin
      body.push(boxAt(0.14, 0.08, 0.28, x, 0.04, Z - 0.54)); // foot
      body.push(strut([X + side * 0.27, 1.36, Z - 0.02], [X + side * 0.24, 1.12, Z - 0.26], 0.12)); // upper arm
      body.push(strut([X + side * 0.24, 1.12, Z - 0.26], [X + side * 0.12, 1.13, Z - 0.66], 0.1)); // forearm
    }
    body.push(new THREE.BoxGeometry(0.46, 0.66, 0.26).rotateX(-0.14).translate(X, 1.1, Z - 0.02)); // torso, leaning in
    body.push(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10).translate(X, 1.48, Z - 0.06)); // neck
    body.push(new THREE.SphereGeometry(0.15, 16, 12).translate(X, 1.62, Z - 0.08)); // head
    add(s, mergeGeometries(body.map((g) => g.toNonIndexed())), person);
  }
  add(s, mergeGeometries([boxAt(0.04, 0.62, 0.04, -2.05, 1.37, -0.3), boxAt(0.04, 0.5, 0.04, -1.96, 1.31, -0.3), boxAt(0.16, 0.06, 0.16, -2.0, 1.08, -0.3)]), mat);
  add(s, mergeGeometries([boxAt(0.8, 0.62, 0.62, 0.65, 1.37, -0.08), boxAt(0.74, 0.5, 0.62, 1.58, 1.31, -0.08), boxAt(0.6, 0.42, 0.05, 1.58, 1.83, -0.22)]), mat);
  add(s, mergeGeometries([0, 1, 2].map((i) => boxAt(0.66, 0.05, 0.03, 0.65, 1.17 + i * 0.17, 0.24))), mat);
  s.userData = { lamp };
  return s;
}

/** The Leonidas Ground Vehicle (Epirus's GV render): a heavy pickup with a
    grille guard and a roof rack carrying its sensor, a flatbed with side
    rails and an equipment box behind the cab, and Leonidas's array on a
    turntable at the back of the bed with its EO/IR ball on top. The truck is
    the host vehicle (hull material), the array and its sensors are Epirus
    (array material). Faces +x, about 6.4 long and 2.3 wide. userData:
    turret (turn it about y to aim; 0 faces +x), tilt, emitter (local to
    tilt). */
export function buildGV(hull, array = hull) {
  const v = new THREE.Group();
  const wheel = new THREE.CylinderGeometry(0.56, 0.56, 0.42, 24).rotateX(Math.PI / 2);
  add(v, mergeGeometries([[2.05, -1.0], [2.05, 1.0], [-1.65, -1.0], [-1.65, 1.0]].map(([x, z]) => wheel.clone().translate(x, 0.56, z))), hull);
  add(v, new THREE.BoxGeometry(6.0, 0.32, 1.5), hull, 0, 0.84, 0);
  const side = new THREE.Shape();
  [[0.15, 1.0], [3.05, 1.0], [3.05, 1.72], [1.85, 1.86], [1.42, 2.72], [0.15, 2.72]].forEach(([x, y], i) => (i ? side.lineTo(x, y) : side.moveTo(x, y)));
  const cab = new THREE.ExtrudeGeometry(side, { depth: 2.0, bevelEnabled: false }).translate(0, 0, -1.0);
  cab.computeVertexNormals();
  add(v, cab, hull);
  add(v, mergeGeometries([boxAt(0.1, 0.95, 0.1, 3.2, 1.35, -0.85), boxAt(0.1, 0.95, 0.1, 3.2, 1.35, 0.85), boxAt(0.1, 0.1, 1.84, 3.2, 1.8, 0), boxAt(0.1, 0.1, 1.84, 3.2, 1.25, 0)]), hull);
  add(v, mergeGeometries([boxAt(1.2, 0.07, 0.07, 0.8, 2.86, -0.9), boxAt(1.2, 0.07, 0.07, 0.8, 2.86, 0.9), boxAt(0.07, 0.14, 1.86, 1.38, 2.8, 0), boxAt(0.07, 0.14, 1.86, 0.22, 2.8, 0)]), hull);
  add(v, mergeGeometries([boxAt(0.46, 0.5, 0.36, 0.95, 3.15, 0.25), boxAt(0.34, 0.6, 0.12, 0.6, 3.2, -0.35)]), array);
  add(v, new THREE.BoxGeometry(3.1, 0.16, 2.1), hull, -1.5, 1.08, 0);
  add(v, mergeGeometries([boxAt(3.1, 0.08, 0.08, -1.5, 1.55, 1.06), boxAt(3.1, 0.08, 0.08, -1.5, 1.55, -1.06), ...[-2.9, -1.5, -0.1].flatMap((x) => [boxAt(0.08, 0.45, 0.08, x, 1.33, 1.06), boxAt(0.08, 0.45, 0.08, x, 1.33, -1.06)])]), hull);
  add(v, new THREE.BoxGeometry(0.85, 0.85, 1.9), hull, -0.45, 1.58, 0);
  const turret = new THREE.Group();
  turret.position.set(-1.95, 1.16, 0);
  v.add(turret);
  const arr = buildArray(array);
  arr.group.scale.setScalar(0.6);
  arr.group.rotation.y = Math.PI / 2;
  turret.add(arr.group);
  add(arr.tilt, mergeGeometries([boxAt(0.18, 0.5, 0.18, 0, 6.1, 0), new THREE.SphereGeometry(0.42, 20, 12).translate(0, 6.6, 0)]), array);
  v.userData = { turret, tilt: arr.tilt, emitter: arr.emitter };
  return v;
}

/** A Quonset hangar along x: half cylinder, end walls, door and roof seams. */
export function buildHangar(mat, len, r, seams = 5) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(r, r, len, 40, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), mat);
  const end = new THREE.CircleGeometry(r, 40, 0, Math.PI).rotateY(Math.PI / 2);
  add(g, end, mat, len / 2, 0, 0);
  add(g, end.clone().rotateY(Math.PI), mat, -len / 2, 0, 0);
  add(g, new THREE.BoxGeometry(0.3, r * 0.85, r * 0.9), mat, len / 2 + 0.15, r * 0.425, 0);
  if (seams > 0) {
    const rings = [];
    for (let i = 1; i <= seams; i++) rings.push(new THREE.TorusGeometry(r + 0.05, 0.08, 4, 40, Math.PI).rotateY(Math.PI / 2).translate(-len / 2 + (len * i) / (seams + 1), 0, 0));
    add(g, mergeGeometries(rings), mat);
  }
  return g;
}

/** A tank with two bands, standing on the ground. */
export function buildTank(mat, r = 2.4, h = 4.6) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(r, r, h, 40), mat, 0, h / 2, 0);
  add(g, mergeGeometries([new THREE.TorusGeometry(r + 0.03, 0.09, 6, 40).rotateX(Math.PI / 2).translate(0, h / 2 + 1.6, 0), new THREE.TorusGeometry(r + 0.03, 0.09, 6, 40).rotateX(Math.PI / 2).translate(0, h / 2 - 1.2, 0)]), mat);
  return g;
}

/** A ring fence: posts and a top rail around (cx, cz). */
export function buildFence(mat, cx, cz, r, n = 64) {
  const g = new THREE.Group();
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), mat, n);
  const tmp = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    tmp.position.set(cx + Math.cos(a) * r, 1.3, cz + Math.sin(a) * r);
    tmp.updateMatrix();
    posts.setMatrixAt(i, tmp.matrix);
  }
  g.add(posts);
  add(g, new THREE.TorusGeometry(r, 0.09, 4, 160).rotateX(Math.PI / 2), mat, cx, 2.5, cz);
  return g;
}

/** The generator every Leonidas runs from: Leonidas is electric, so a
    standard generator is its magazine, and its power line runs to the
    array (Epirus, 6 October). After the kit's render: an enclosure on a
    skid, two louvre grilles down each side, door seams, a band under the
    roof line and a radiator grille at the front (+x). About 3.9 long, 1.9
    wide and 2.0 tall. */
export function buildGenerator(mat) {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(3.7, 0.3, 1.66), mat, 0, 0.15, 0);
  add(g, new THREE.BoxGeometry(3.9, 1.5, 1.86), mat, 0, 0.3 + 0.75, 0);
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

/** The critical point: what the point defense is there to protect, after the
    icon family's "Critical asset" (a building on its pad inside its
    protection; round six, Jeff Morgan, 9 October). A two-storey block on a
    plinth, a band between the storeys, windows in rows, a parapet, a lower
    wing to one side, and plant and a short mast on the roof. Centred on the
    origin, about 9.2 along x, 5.2 along z and 5.4 to the top of the mast.
    The scene draws its protection round it. */
export function buildCriticalPoint(mat) {
  const g = new THREE.Group();
  // the block spans x -4.4 to 1.6, the wing 1.6 to 4.4: centred on the origin
  const P = 0.25, H = 3.4, B = -1.4, WX = 3.0; // the plinth, the block's height, the block's and the wing's centres
  const parts = [
    boxAt(9.2, P, 5.2, 0, P / 2, 0), // plinth
    boxAt(6.0, H, 4.4, B, P + H / 2, 0), // the block
    boxAt(6.12, 0.12, 4.52, B, P + H / 2, 0), // the band between the storeys
    boxAt(6.24, 0.24, 4.64, B, P + H + 0.12, 0), // parapet
    boxAt(2.8, 1.9, 3.4, WX, P + 0.95, 0.2), // the wing
    boxAt(2.92, 0.16, 3.52, WX, P + 1.98, 0.2),
    boxAt(1.3, 0.62, 0.9, B - 1.4, P + H + 0.55, -0.9), // plant on the roof
    boxAt(0.9, 0.46, 0.9, B + 0.8, P + H + 0.47, 1.0),
    boxAt(0.12, 1.5, 0.12, B + 2.2, P + H + 0.99, -1.2), // the mast
  ];
  // windows: shallow frames in rows on the long faces and the far end, two
  // storeys; a door in the wing
  for (const y of [P + 0.95, P + 2.65]) {
    for (let i = 0; i < 5; i++) {
      const x = B - 2.4 + i * 1.2;
      parts.push(boxAt(0.62, 0.62, 0.06, x, y, 2.21), boxAt(0.62, 0.62, 0.06, x, y, -2.21));
    }
    for (const z of [-1.2, 0, 1.2]) parts.push(boxAt(0.06, 0.62, 0.62, B - 3.01, y, z));
  }
  parts.push(boxAt(0.9, 1.25, 0.06, WX, P + 0.62, 1.91));
  add(g, mergeGeometries(parts), mat);
  // a small dish on the mast
  add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20).rotateZ(Math.PI / 2).rotateY(0.6), mat, B + 2.2, P + H + 1.5, -1.2);
  return g;
}

/** A quadcopter: body, belly, arms, motors and rotors. */
export function droneGeometry(scale = 2.3) {
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

/** Brackets for n targets: top left and bottom right, sized in pixels around
    each, as in Epirus's hero film. set() each target, then commit(). */
export function createBrackets(surface, n, color = INK) {
  const ARMS = n * 4;
  const pos = new Float32Array(ARMS * 12), col = new Float32Array(ARMS * 16);
  const index = [];
  for (let q = 0; q < ARMS; q++) index.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
  const geo = new THREE.BufferGeometry();
  geo.setIndex(index);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  const mesh = surface.overlay(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide })));
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  const ink = new THREE.Color(color);
  return {
    mesh,
    color: ink, // change it to recolour the brackets
    set(i, x, y, z, alpha, lock, time, size = 3.2) {
      const o = i * 16;
      if (alpha <= 0.002) { col.fill(0, o * 4, (o + 16) * 4); return; }
      const u = surface.unitsPerPx([x, y, z]), ps = surface.pxScale, R = surface.right, U = surface.up;
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
