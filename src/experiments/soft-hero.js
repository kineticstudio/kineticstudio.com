/* Soft hero.

   The hero of a client homepage in the Creative Studio, on its own: a
   stepped pyramid of interlocking concrete bars, one to six cubes long,
   laid in rings round its summit like brickwork, the corners crossing like
   a log cabin. It turns slowly. On the opening every bar drops the last
   little way into place, from the summit outward. Bars on the top steps
   are always sliding out from their step and back in, and corner bars
   sometimes slide lengthways out past their corner. And it is always being
   built from the top, only ever through a red line: a red square appears
   beside the summit, the top face where the next bar will sit lights up
   red, a red line draws down to it at 45 and 90 degrees, the square runs
   down the line, and the bar builds straight up out of its footprint, red,
   then cools to concrete. When the summit and the two rings round it have
   their new layer, the whole top section presses down one step into the
   pyramid, and the next layer begins. Drag to spin it.

   Ported from the page's block engine and its pyramid: real concrete baked
   on the GPU (mottling, pores and bug holes, sand and aggregate), chipped
   arrises worked out from each bar's own geometry, a sun with soft
   percentage-closer shadows, a warm studio environment and ground-truth
   ambient occlusion, under the page's paper grain. Left out: the headline,
   nav and buttons, the words in the red chip (it stays a square), the
   black chip on the right that asks and answers a question, the use-case
   tabs, and the scroll into section two. Everything runs on its own clock,
   so it pauses cleanly. The page never names the client. */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";

export const params = {
  pyramid: {
    zoom: [11, 5, 18, 0.5],
    lift: [-0.12, -0.6, 0.6, 0.01],
    spin: [3, 0, 20, 0.5],
  },
  motion: {
    pace: [1, 0.5, 2, 0.05],
    slide: [1.15, 0, 3, 0.05],
  },
  light: {
    direction: [318, 0, 360, 1],
    softness: [0.42, 0, 1, 0.01],
  },
  colour: {
    ground: "#fef7e0",
    line: "#ff4232",
    grain: [0.45, 0, 1, 0.01],
  },
};

/* ---- the block engine's look, as the page dials it ---- */
const LOOK = { lightHeight: 52, lightStrength: 1.5, fill: 0.42, warmth: 5400, tone: 1, texture: 1, wear: 0.55, occlusion: 1 };
const UNIT = 1;          // one grid cell
const GAP = 0.008;       // the joint between pieces: a hairline, so it never shows daylight
const BEVEL = 0.032;     // the arris radius
const ALIGN = [
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  new THREE.Quaternion(),
];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function kelvinToRGB(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return [r, g, b].map((c) => clamp(c, 0, 255) / 255);
}

/* ---- concrete, baked once on the GPU: R tone mottling, G pores and bug holes,
   B sand and aggregate, A height; then a normal map from that height ---- */
const BAKE_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BAKE_NOISE = `
  uniform float uSeed;
  vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx + uSeed) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx + uSeed * 1.37) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float gnoise(vec2 p, float per) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 g00 = hash22(mod(i, per)) * 2.0 - 1.0;
    vec2 g10 = hash22(mod(i + vec2(1.0, 0.0), per)) * 2.0 - 1.0;
    vec2 g01 = hash22(mod(i + vec2(0.0, 1.0), per)) * 2.0 - 1.0;
    vec2 g11 = hash22(mod(i + vec2(1.0, 1.0), per)) * 2.0 - 1.0;
    float a = dot(g00, f), b = dot(g10, f - vec2(1.0, 0.0));
    float c = dot(g01, f - vec2(0.0, 1.0)), d = dot(g11, f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.4;
  }
  float fbm(vec2 uv, float freq, int octaves) {
    float sum = 0.0, amp = 1.0, norm = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      sum += amp * gnoise(uv * freq, freq); norm += amp; freq *= 2.0; amp *= 0.5;
    }
    return sum / norm;
  }
  vec2 worley(vec2 uv, float freq) {
    vec2 p = uv * freq, i = floor(p), f = fract(p);
    float md = 8.0, id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 c = mod(i + g, freq);
      vec2 r = g + hash22(c + 19.7) - f;
      float d = dot(r, r);
      if (d < md) { md = d; id = hash12(c + 7.3); }
    }
    return vec2(sqrt(md), id);
  }
  float pits(vec2 uv, float freq, float share, float rMin, float rMax) {
    vec2 w = worley(uv, freq);
    if (w.y > share) return 0.0;
    float k = fract(w.y * 53.17 / share);
    float r = mix(rMin, rMax, k * k * k);
    float x = clamp(w.x / r, 0.0, 1.0);
    return (1.0 - x * x) * (1.0 - smoothstep(0.8, 1.0, x));
  }
`;
const BAKE_A = `
  varying vec2 vUv;
  ${BAKE_NOISE}
  void main() {
    vec2 uv = vUv;
    float mott = 0.5 + 0.44 * fbm(uv, 3.0, 5) + 0.2 * fbm(uv + 0.37, 14.0, 4);
    float pore = max(max(pits(uv, 44.0, 0.15, 0.12, 0.36), pits(uv, 120.0, 0.2, 0.1, 0.32)), 0.75 * pits(uv, 300.0, 0.28, 0.14, 0.4));
    float grain = 0.5 + 0.3 * gnoise(uv * 512.0, 512.0) + 0.16 * gnoise(uv * 1024.0, 1024.0);
    vec2 fl = worley(uv, 210.0);
    float fleck = (fl.y < 0.1 ? 1.0 - smoothstep(0.1, 0.3, fl.x) : 0.0) - (fl.y > 0.93 ? 1.0 - smoothstep(0.08, 0.24, fl.x) : 0.0);
    float speck = clamp(grain + 0.34 * fleck, 0.0, 1.0);
    float h = 0.5 + 0.07 * fbm(uv, 6.0, 4) + 0.09 * (speck - 0.5) - 0.42 * pore;
    gl_FragColor = vec4(clamp(mott, 0.0, 1.0), pore, speck, clamp(h, 0.0, 1.0));
  }
`;
const BAKE_N = `
  varying vec2 vUv;
  uniform sampler2D tA;
  uniform float uTexel;
  void main() {
    float l = texture2D(tA, vUv - vec2(uTexel, 0.0)).a, r = texture2D(tA, vUv + vec2(uTexel, 0.0)).a;
    float d = texture2D(tA, vUv - vec2(0.0, uTexel)).a, u = texture2D(tA, vUv + vec2(0.0, uTexel)).a;
    vec3 n = normalize(vec3((l - r) * 7.0, (d - u) * 7.0, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }
`;
function bakeConcrete(renderer, size, seed) {
  const opts = {
    type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  };
  const rtA = new THREE.WebGLRenderTarget(size, size, opts);
  const rtN = new THREE.WebGLRenderTarget(size, size, opts);
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  scene.add(quad);
  const matA = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: BAKE_A, uniforms: { uSeed: { value: seed } }, toneMapped: false });
  const matN = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: BAKE_N, uniforms: { tA: { value: rtA.texture }, uTexel: { value: 1 / size } }, toneMapped: false });
  const prev = renderer.getRenderTarget();
  quad.material = matA;
  renderer.setRenderTarget(rtA);
  renderer.render(scene, cam);
  quad.material = matN;
  renderer.setRenderTarget(rtN);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  matA.dispose();
  matN.dispose();
  quad.geometry.dispose();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  rtA.texture.anisotropy = aniso;
  rtN.texture.anisotropy = aniso;
  return { maps: rtA, normals: rtN };
}

/* Sun shadows with a real penumbra (percentage-closer soft shadows) for a
   directional light: find what stands between the point and the sun, then blur
   by how far away that is. The page patched three's shadow chunk for every
   material; here only the concrete gets it, so nothing else on the site does. */
function pcssChunk(width, depth, res) {
  const GLSL = `
    #define PCSS_W ${width.toFixed(4)}
    #define PCSS_DEPTH ${depth.toFixed(4)}
    #define PCSS_RES ${res.toFixed(1)}
    float pcssIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    vec2 pcssVogel(int i, int n, float phi) { float r = sqrt((float(i) + 0.5) / float(n)); float t = float(i) * 2.39996323 + phi; return r * vec2(cos(t), sin(t)); }
    float pcssDir(sampler2D map, vec4 sc, float size) {
      float tanA = size * 0.001;
      float zr = sc.z;
      float phi = pcssIGN(gl_FragCoord.xy) * 6.2831853;
      float slope = PCSS_W / PCSS_DEPTH;
      float searchUV = max(3.5 * tanA / PCSS_W, 2.0 / PCSS_RES);
      float sum = 0.0, cnt = 0.0;
      for (int i = 0; i < 16; i++) {
        vec2 o = pcssVogel(i, 16, phi) * searchUV;
        float zb = unpackRGBAToDepth(texture2D(map, sc.xy + o));
        if (zb < zr - (0.0003 + length(o) * slope * 0.9)) { sum += zb; cnt += 1.0; }
      }
      if (cnt < 0.5) return 1.0;
      float dist = (zr - sum / cnt) * PCSS_DEPTH;
      float rUV = clamp(dist * tanA / PCSS_W, 1.2 / PCSS_RES, 42.0 / PCSS_RES);
      float lit = 0.0;
      for (int i = 0; i < 28; i++) {
        vec2 o = pcssVogel(i, 28, phi + 1.7) * rUV;
        float z = unpackRGBAToDepth(texture2D(map, sc.xy + o));
        lit += step(zr - (0.0003 + length(o) * slope * 0.9), z);
      }
      return lit / 28.0;
    }
  `;
  let chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  chunk = chunk.replace("float texture2DCompare(", GLSL + "\n\tfloat texture2DCompare(");
  chunk = chunk.replace("#if defined( SHADOWMAP_TYPE_PCF )", "return mix( 1.0, pcssDir( shadowMap, shadowCoord, shadowRadius ), shadowIntensity );\n\t\t#if defined( SHADOWMAP_TYPE_PCF )");
  return chunk;
}

/* The concrete material: three's standard material with the baked maps, a tone
   per piece, chipped arrises, red edge marks for the build, and the AO pre-pass
   feeding the ambient light. */
function concreteMaterial(baked, shared, shadowChunk) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, normalMap: baked.normals.texture });
  mat.normalScale.set(0.75, 0.75);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 aSeed;
        attribute vec4 aMark;
        attribute vec3 aHalf;
        uniform float uUvScale;
        varying vec2 vCUv;
        varying vec3 vLocal;
        varying vec3 vHalf;
        varying vec4 vSeed;
        varying vec4 vMark;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        {
          float q = floor(aSeed.z + 0.5);
          vec2 t = uv;
          if (q == 1.0) t = vec2(-uv.y, uv.x); else if (q == 2.0) t = -uv; else if (q == 3.0) t = vec2(uv.y, -uv.x);
          vCUv = t * uUvScale + aSeed.xy;
          #ifdef USE_NORMALMAP
            vNormalMapUv = vCUv;
          #endif
          vLocal = position; vHalf = aHalf; vSeed = aSeed; vMark = aMark;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <shadowmap_pars_fragment>", shadowChunk)
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D tCx;
        uniform sampler2D tAO;
        uniform vec2 uRes;
        uniform vec3 uTone1;
        uniform vec3 uTone2;
        uniform vec3 uChipTone;
        uniform vec3 uAOTint;
        uniform vec3 uRed;
        uniform float uPores;
        uniform float uSpeck;
        uniform float uMott;
        uniform float uWear;
        uniform float uAO;
        uniform float uDirectAO;
        uniform float uRough;
        varying vec2 vCUv;
        varying vec3 vLocal;
        varying vec3 vHalf;
        varying vec4 vSeed;
        varying vec4 vMark;
        float ccHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float ccNoise(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(ccHash(i), ccHash(i + vec3(1, 0, 0)), f.x), mix(ccHash(i + vec3(0, 1, 0)), ccHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(ccHash(i + vec3(0, 0, 1)), ccHash(i + vec3(1, 0, 1)), f.x), mix(ccHash(i + vec3(0, 1, 1)), ccHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `
        vec3 ccD = vHalf - abs(vLocal);
        float ccD0 = min(ccD.x, min(ccD.y, ccD.z));
        float ccD2 = max(ccD.x, max(ccD.y, ccD.z));
        float ccEdge = ccD.x + ccD.y + ccD.z - ccD0 - ccD2;
        vec4 ccTex = texture2D(tCx, vCUv);
        vec3 ccP = vLocal * 7.0 + vSeed.xyw * 13.0;
        float ccAlong = ccNoise(ccP * 0.5);
        float ccRag = ccNoise(ccP * 2.4) * 0.6 + ccNoise(ccP * 6.3) * 0.4;
        float ccCorner = 1.0 - smoothstep(0.0, 0.2, ccD2);
        float ccW = uWear * (0.075 * smoothstep(0.45, 0.82, ccAlong) + 0.05 * ccCorner * smoothstep(0.3, 0.7, ccAlong)) * (0.5 + 0.8 * ccRag);
        float ccAA = fwidth(ccEdge) * 1.2 + 0.0008;
        float ccChip = (1.0 - smoothstep(ccW - ccAA, ccW + ccAA, ccEdge)) * step(0.002, ccW);
        float ccM = mix(0.5, ccTex.r, uMott);
        vec3 ccBase = mix(uTone2, uTone1, smoothstep(0.08, 0.92, ccM));
        ccBase *= 1.0 + vSeed.w * 0.07;
        ccBase *= 1.0 + (ccTex.b - 0.5) * 0.36 * uSpeck;
        ccBase = mix(ccBase, ccBase * vec3(0.4, 0.37, 0.34), clamp(ccTex.g * 1.25, 0.0, 1.0) * uPores);
        ccBase = mix(ccBase, uChipTone * (0.88 + 0.36 * (ccTex.b - 0.5)), ccChip * 0.7);
        ccBase = mix(ccBase, uRed * 0.62, vMark.y);
        diffuseColor.rgb = ccBase;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `
        float roughnessFactor = clamp(uRough + (ccTex.b - 0.5) * 0.12 + ccTex.g * 0.1 + ccChip * 0.06, 0.3, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          float ccH = -ccChip * (0.003 + 0.011 * clamp(1.0 - ccEdge / max(ccW, 0.001), 0.0, 1.0))
                      + ccChip * (ccNoise(vLocal * 90.0) - 0.5) * 0.0028;
          vec2 ccDH = vec2(dFdx(ccH), dFdy(ccH));
          vec3 ccSX = dFdx(-vViewPosition), ccSY = dFdy(-vViewPosition);
          vec3 ccR1 = cross(ccSY, normal), ccR2 = cross(normal, ccSX);
          float ccDet = dot(ccSX, ccR1);
          normal = normalize(abs(ccDet) * normal - sign(ccDet) * (ccDH.x * ccR1 + ccDH.y * ccR2));
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          float ccLineW = 0.006 + fwidth(ccEdge) * 0.75;
          float ccLine = 1.0 - smoothstep(ccLineW * 0.5, ccLineW, ccEdge);
          totalEmissiveRadiance += uRed * (vMark.x * ccLine * 2.6 + vMark.z * 0.55);
        }`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
        {
          float ccAO = mix(1.0, texture2D(tAO, gl_FragCoord.xy / uRes).r, uAO);
          reflectedLight.indirectDiffuse *= ccAO * mix(uAOTint, vec3(1.0), ccAO);
          reflectedLight.indirectSpecular *= ccAO;
          float ccK = mix(1.0, ccAO, uDirectAO);
          reflectedLight.directDiffuse *= ccK;
          reflectedLight.directSpecular *= ccK;
        }`,
      );
  };
  mat.customProgramCacheKey = () => "soft-hero-concrete-v1";
  return mat;
}

function pieceGeometry(len) {
  const g = new RoundedBoxGeometry(UNIT - GAP, UNIT - GAP, len * UNIT - GAP, 4, BEVEL);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  // texture in world units, so a beam's long face is not stretched, and each face gets its own patch
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, w, f;
    if (ax >= ay && ax >= az) {
      u = z; w = y; f = nor.getX(i) > 0 ? 0 : 1;
    } else if (ay >= az) {
      u = x; w = z; f = nor.getY(i) > 0 ? 2 : 3;
    } else {
      u = x; w = y; f = nor.getZ(i) > 0 ? 4 : 5;
    }
    uv.setXY(i, u + f * 1.618, w + f * 2.718);
  }
  const half = [(UNIT - GAP) / 2, (UNIT - GAP) / 2, (len * UNIT - GAP) / 2];
  const h = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) h.set(half, i * 3);
  g.setAttribute("aHalf", new THREE.BufferAttribute(h, 3));
  return g;
}

/* A soft studio: warm white sky, sand horizon, a darker warm floor, and a big soft
   box on the sun's side for the specular sheen on the arrises. */
function buildEnvironment(renderer, sunDir, warmth) {
  const [wr, wg, wb] = kelvinToRGB(warmth);
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, toneMapped: false,
      uniforms: {
        uTop: { value: new THREE.Color(0.95 * wr, 0.95 * wg, 0.95 * wb) },
        uHorizon: { value: new THREE.Color(0.86, 0.8, 0.7) },
        uGround: { value: new THREE.Color(0.42, 0.38, 0.33) },
      },
      vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 uTop, uHorizon, uGround; varying vec3 vDir;
        void main() { float y = vDir.y; vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.55)) : mix(uHorizon, uGround, pow(-y, 0.4)); gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  scene.add(sky);
  const box = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2 * wr, 3.2 * wg, 3.2 * wb), side: THREE.DoubleSide }));
  box.position.copy(sunDir).multiplyScalar(8.5);
  box.lookAt(0, 0, 0);
  scene.add(box);
  const bounce = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.66, 0.6, 0.52), side: THREE.DoubleSide }));
  bounce.position.set(-sunDir.x, -0.6, -sunDir.z).normalize().multiplyScalar(8.5);
  bounce.lookAt(0, 0, 0);
  scene.add(bounce);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  return rt;
}

/* A tile of paper grain for the overlay the page lays over its canvas. */
function grainTile(size = 192, seed = 3) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d"), img = ctx.createImageData(size, size), R = mulberry32(seed);
  for (let i = 0; i < size * size; i++) {
    const g = 128 + (R() + R() + R() - 1.5) * 96;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = clamp(g, 0, 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

/* ---- the pyramid's motion helpers ---- */
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const out = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
// lines only ever run at 45 or 90 degrees: down at 45 and then straight down, or along and then down at 45
function route(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
  if (Math.abs(dy) >= Math.abs(dx)) return [a, [b[0], a[1] + sy * Math.abs(dx)], b];
  return [a, [a[0] + sx * (Math.abs(dx) - Math.abs(dy)), a[1]], b];
}
// the first k (0 to 1) of a path, by length, and where its end is
function partial(path, k) {
  const seg = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1])), total = seg.reduce((a, b) => a + b, 0);
  let left = total * Math.min(1, Math.max(0, k));
  const pts = [path[0]];
  for (let i = 0; i < seg.length; i++) {
    const a = path[i], b = path[i + 1];
    if (left >= seg[i]) {
      pts.push(b);
      left -= seg[i];
      continue;
    }
    const f = seg[i] ? left / seg[i] : 0;
    pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    break;
  }
  return { pts, tip: pts[pts.length - 1], total };
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const STILL = Boolean(ctx.reducedMotion);

  const ground = document.createElement("div");
  ground.setAttribute("aria-hidden", "true");
  ground.style.cssText = `position:absolute;inset:0;background:${v["colour.ground"]}`;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:pan-y";
  // the red square, its line and the lit footprint, drawn over the scene
  const lines = document.createElement("canvas");
  lines.setAttribute("aria-hidden", "true");
  lines.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  const grain = document.createElement("div");
  grain.setAttribute("aria-hidden", "true");
  grain.style.cssText = `position:absolute;inset:0;pointer-events:none;mix-blend-mode:soft-light;background-size:192px 192px;background-image:url(${grainTile()});opacity:${v["colour.grain"]}`;
  host.append(ground, canvas, lines, grain);
  const lg = lines.getContext("2d");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", stencil: false });
  } catch (e) {
    console.warn("soft-hero: no WebGL here", e);
    return {
      update(nv) {
        Object.assign(v, nv);
        ground.style.background = v["colour.ground"];
      },
      action() {},
      destroy() {
        ground.remove();
        canvas.remove();
        lines.remove();
        grain.remove();
      },
    };
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const MAX_DPR = Math.min(window.devicePixelRatio || 1, 2);
  let dpr = MAX_DPR;
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.5, 120);
  const cluster = new THREE.Group();
  scene.add(cluster);

  /* ---- the pyramid: rings of bars round the summit ---- */
  const R = 15;                            // rings, from the summit out to the edge
  const KL = 2;                            // the rings that are built through red lines
  const SETS = 4;
  const rnd = Math.random;
  const cfg = { pace: v["motion.pace"], spin: v["pyramid.spin"], motion: v["motion.slide"] };
  // lengths one to six, the longer ones likelier further down the pyramid
  const pickLen = (left, r) => {
    const f = Math.min(1, r / 8);
    const w = [[1, 0.16], [2, 0.26], [3, 0.26], [4, 0.16 + 0.06 * f], [5, 0.08 + 0.1 * f], [6, 0.04 + 0.12 * f]].filter(([l]) => l <= left);
    let u = rnd() * w.reduce((a, [, p]) => a + p, 0);
    for (const [l, p] of w) {
      u -= p;
      if (u <= 0) return l;
    }
    return w[w.length - 1][0];
  };
  /* for every ring, four splits of its edge into bars, one per level (mod 4): the top layer, the
     layer under it (so a bar sliding out shows concrete, never a hole), and two free to lift onto the
     next levels. On even sets the north and south sides run through both corners, on odd sets east
     and west do. */
  const bars = [];
  for (let r = 0; r <= R; r++)
    for (let parity = 0; parity < SETS; parity++) {
      if (r === 0) {
        bars.push({ r, parity, len: 1, axis: 2, cx: 0, cz: 0, nx: 0, nz: 0, ends: [0, 0] });
        continue;
      }
      const ns = parity % 2 === 0;
      const sides = [
        { axis: 0, n: [0, -1], from: ns ? -r : -r + 1, to: ns ? r : r - 1, at: (k) => [k, -r], own: ns },
        { axis: 0, n: [0, 1], from: ns ? -r : -r + 1, to: ns ? r : r - 1, at: (k) => [k, r], own: ns },
        { axis: 2, n: [1, 0], from: ns ? -r + 1 : -r, to: ns ? r - 1 : r, at: (k) => [r, k], own: !ns },
        { axis: 2, n: [-1, 0], from: ns ? -r + 1 : -r, to: ns ? r - 1 : r, at: (k) => [-r, k], own: !ns },
      ];
      for (const sd of sides) {
        let k = sd.from;
        while (k <= sd.to) {
          const len = pickLen(sd.to - k + 1, r), cells = Array.from({ length: len }, (_, i) => sd.at(k + i));
          const cx = cells.reduce((a, c) => a + c[0], 0) / len, cz = cells.reduce((a, c) => a + c[1], 0) / len;
          // a bar that holds a corner may slide lengthways out past it, poking through
          const ends = [sd.own && k === sd.from ? -1 : 0, sd.own && k + len - 1 === sd.to ? 1 : 0];
          bars.push({ r, parity, len, axis: sd.axis, cx, cz, nx: sd.n[0], nz: sd.n[1], ends });
          k += len;
        }
      }
    }
  bars.forEach((b, i) => {
    b.i = i;
    b.off = 0;
    b.offE = 0;
    b.slide = null;
  });

  /* ---- the sun ---- */
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  const sunDir = new THREE.Vector3();
  const SHADOW_RES = Math.min(4096, renderer.capabilities.maxTextureSize);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.012;
  scene.add(sun, sun.target);
  const shadowR = R * 1.1;
  {
    const cam = sun.shadow.camera;
    cam.left = -shadowR;
    cam.right = shadowR;
    cam.top = shadowR;
    cam.bottom = -shadowR;
    cam.near = 1;
    cam.far = 4 * shadowR + 2;
    cam.updateProjectionMatrix();
  }
  const shadowChunk = pcssChunk(2 * shadowR, sun.shadow.camera.far - sun.shadow.camera.near, SHADOW_RES);

  /* ---- concrete ---- */
  const baked = bakeConcrete(renderer, 2048, 11.0);
  const shared = {
    tCx: { value: baked.maps.texture },
    tAO: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uUvScale: { value: 0.42 },
    uTone1: { value: new THREE.Color() },
    uTone2: { value: new THREE.Color() },
    uChipTone: { value: new THREE.Color() },
    uAOTint: { value: new THREE.Color(0.84, 0.76, 0.66) },
    uRed: { value: new THREE.Color(v["colour.line"]) },
    uPores: { value: 1 }, uSpeck: { value: 1 }, uMott: { value: 1 },
    uWear: { value: LOOK.wear }, uAO: { value: 1 }, uDirectAO: { value: 0.35 }, uRough: { value: 0.86 },
  };
  const material = concreteMaterial(baked, shared, shadowChunk);
  const geos = [null, 1, 2, 3, 4, 5, 6].map((n) => n && pieceGeometry(n));

  // ambient occlusion, rendered before the frame and read by the concrete
  const gtao = new GTAOPass(scene, camera, 2, 2);
  gtao.output = GTAOPass.OUTPUT.Off;
  gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 3.0, scale: 1.5, samples: 16, distanceFallOff: 0.6, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 7, rings: 2, samples: 16 });
  shared.tAO.value = gtao.pdRenderTarget.texture;

  // every bar is an instance of the piece of its length
  const pieces = bars.map((b) => ({
    len: b.len, axis: b.axis, mark: [0, 0, 0, 0],
    seed: [rnd() * 9, rnd() * 9, Math.floor(rnd() * 4), rnd() * 2 - 1],
    pose: { position: new THREE.Vector3(0, -999, 0), quaternion: ALIGN[b.axis].clone(), scale: 0.0001, scaleV: null },
  }));
  const meshes = [];
  {
    const byLen = [[], [], [], [], [], [], []];
    pieces.forEach((p) => byLen[p.len].push(p));
    for (let len = 1; len <= 6; len++) {
      const list = byLen[len];
      if (!list.length) continue;
      const geometry = geos[len].clone();
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const seeds = new Float32Array(list.length * 4), marks = new Float32Array(list.length * 4);
      list.forEach((p, k) => {
        p.mesh = mesh;
        p.slot = k;
        seeds.set(p.seed, k * 4);
      });
      geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
      const markAttr = new THREE.InstancedBufferAttribute(marks, 4);
      markAttr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("aMark", markAttr);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      cluster.add(mesh);
      meshes.push(mesh);
    }
  }
  const _m = new THREE.Matrix4(), _sc = new THREE.Vector3();
  function placePieces() {
    for (const p of pieces) {
      const q = p.pose;
      _m.compose(q.position, q.quaternion, q.scaleV ? _sc.copy(q.scaleV) : _sc.setScalar(q.scale));
      p.mesh.setMatrixAt(p.slot, _m);
      p.mesh.geometry.attributes.aMark.setXYZW(p.slot, p.mark[0], p.mark[1], p.mark[2], p.mark[3]);
    }
    for (const m of meshes) {
      m.instanceMatrix.needsUpdate = true;
      m.geometry.attributes.aMark.needsUpdate = true;
    }
  }
  const mark = (i, edges = 0, paint = 0, glow = 0) => (pieces[i].mark = [edges, paint, glow, 0]);

  /* ---- the look ---- */
  function aimSun() {
    const az = THREE.MathUtils.degToRad(v["light.direction"]), el = THREE.MathUtils.degToRad(LOOK.lightHeight);
    sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    sun.position.copy(sunDir).multiplyScalar(2 * shadowR + 1);
    sun.target.position.set(0, 0, 0);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
  }
  let envRT = null, envKey = "";
  function applyLook() {
    aimSun();
    const [r, g, b] = kelvinToRGB(LOOK.warmth);
    sun.color.setRGB(r, g, b);
    sun.intensity = 3.1 * LOOK.lightStrength;
    sun.shadow.radius = (0.004 + 0.085 * Math.pow(v["light.softness"], 1.6)) * 1000;
    const key = `${Math.round(v["light.direction"])}`;
    if (envKey !== key) {
      if (envRT) envRT.dispose();
      envRT = buildEnvironment(renderer, sunDir, LOOK.warmth);
      scene.environment = envRT.texture;
      envKey = key;
    }
    scene.environmentIntensity = 0.85 * LOOK.fill;
    // sand concrete in linear light
    const t = LOOK.tone;
    shared.uTone1.value.setRGB(0.65 * t, 0.555 * t, 0.42 * t);
    shared.uTone2.value.setRGB(0.43 * t, 0.36 * t, 0.27 * t);
    shared.uChipTone.value.setRGB(0.66 * t, 0.6 * t, 0.5 * t);
    shared.uPores.value = Math.min(1.4, LOOK.texture);
    shared.uSpeck.value = LOOK.texture;
    shared.uMott.value = Math.min(1.3, 0.4 + 0.6 * LOOK.texture);
    material.normalScale.set(0.75 * LOOK.texture, 0.75 * LOOK.texture);
    shared.uAO.value = Math.min(1, LOOK.occlusion);
    shared.uDirectAO.value = 0.35 * LOOK.occlusion;
    shared.uRed.value.set(v["colour.line"]);
    gtao.blendIntensity = 1;
  }

  /* ---- camera and framing: the summit in the middle, the pyramid running off the foot and sides ---- */
  let W = 1, H = 1, azimuth = 20;
  const view = { elevation: 28, fill: 1 };
  function placeCamera() {
    // a phone frames it closer, as the page does
    const radius = v["pyramid.zoom"] * (W < 700 ? 8 / 11 : 1);
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const fov = Math.min(vfov, hfov);
    const dist = radius / Math.sin(fov / 2) / Math.max(0.2, view.fill / 0.72);
    const el = THREE.MathUtils.degToRad(view.elevation);
    camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
    camera.near = Math.max(0.5, dist - radius * 3);
    camera.far = dist + radius * 3;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    // lens shift: move the pyramid within the frame without bending its perspective
    camera.projectionMatrix.elements[9] = -v["pyramid.lift"];
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld(true);
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    shared.uRes.value.copy(buf);
    const aoScale = dpr > 1.25 ? 0.5 : 1;
    gtao.setSize(Math.max(2, Math.round(buf.x * aoScale)), Math.max(2, Math.round(buf.y * aoScale)));
    camera.aspect = W / H;
    placeCamera();
    const ld = Math.min(2, window.devicePixelRatio || 1);
    lines.width = Math.round(W * ld);
    lines.height = Math.round(H * ld);
    lg.setTransform(ld, 0, 0, ld, 0, 0);
  }

  /* ---- where everything is ---- */
  const H0 = R + 4;
  const h = Array.from({ length: R + 1 }, (_, r) => H0 - r);   // each ring's top layer height
  const Sd = H0;                                                // the height drawn at the middle of the frame
  const state = bars.map(() => ({ y: null }));
  const ringBars = (r, parity) => bars.filter((b) => b.r === r && b.parity === parity);
  const sets = h.map((y) => ({ top: y % SETS, under: (y + SETS - 1) % SETS }));
  for (let r = 0; r <= R; r++) {
    ringBars(r, sets[r].top).forEach((b) => (state[b.i].y = h[r]));
    ringBars(r, sets[r].under).forEach((b) => (state[b.i].y = h[r] - 1));
  }
  let sinkK = 0;                                                // the top section pressing down one step (0 to 1)

  // the clock (ms): it only runs while the piece does, so everything pauses together
  let now = 0;
  const timers = [];
  const later = (fn, ms) => timers.push({ at: now + ms, fn });
  function runTimers() {
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at > now) continue;
      const { fn } = timers.splice(i, 1)[0];
      fn();
    }
  }

  // the opening: whole bars drop into place from the summit outward, so what you see is always solid
  const dropAt = bars.map((b) => 150 + b.r * 70 + rnd() * 180);
  const ASSEMBLED = 150 + R * 70 + 180 + 600;
  let introT0 = STILL ? null : 0;
  function place(b, extra = {}) {
    extra = { out: 0, up: 0, scale: 1, ...extra };
    const q = pieces[b.i].pose, s = state[b.i];
    if (introT0 !== null && extra.sy === undefined) {
      const k = (now - introT0 - dropAt[b.i]) / 600;
      if (k < 0) {
        q.position.set(0, -999, 0);
        q.scale = 0.0001;
        q.scaleV = null;
        return;
      }
      if (k < 1) extra.up += 2.4 * (1 - out(k));
    }
    if (s.y === null) {
      q.position.set(0, -999, 0);
      q.scale = 0.0001;
      q.scaleV = null;
      return;
    }
    const o = b.off + extra.out, e = b.offE, ex = b.axis === 0 ? e : 0, ez = b.axis === 2 ? e : 0;
    // growing up from its footprint: only its height scales, its foot stays on the step
    const sy = extra.sy ?? 1, up = extra.up - (1 - sy) / 2;
    const press = b.r <= KL ? sinkK : 0;
    q.position.set((b.cx + b.nx * o + ex) * UNIT, (s.y + up - press - Sd) * UNIT, (b.cz + b.nz * o + ez) * UNIT);
    q.quaternion.copy(ALIGN[b.axis]);
    q.scale = extra.scale;
    if (extra.sy !== undefined) (q.scaleV || (q.scaleV = new THREE.Vector3())).set(1, sy, 1);
    else q.scaleV = null;
  }

  /* ---- the red line: a square beside the summit, the lit footprint, the line, the run ---- */
  const _w = new THREE.Vector3(), _pv = new THREE.Vector3();
  const screen = (x, y, z) => {
    cluster.localToWorld(_w.set(x * UNIT, (y - Sd) * UNIT, z * UNIT));
    _pv.copy(_w).project(camera);
    return [(_pv.x * 0.5 + 0.5) * W, (-_pv.y * 0.5 + 0.5) * H];
  };
  // the square holds still beside the summit, which does not move as it turns
  function squareSpot() {
    const [sx, sy] = screen(0, H0 + 0.5, 0), m = 142;
    const x = Math.min(W - m, Math.max(m, sx - (Math.min(340, W * 0.2) + 130)));
    return [x, Math.max(30, sy - 70)];
  }
  // its beats (ms): the footprint and line at 520, run the line from 2000, land at 2520
  const IN = { line: 520, go: 2000, land: 2520, end: 2900 };
  let show = null, squareA = 0;
  const arrivals = [], cooling = [];
  function arrive(b, y, { red = 0, from = 2.6, dur = 760 } = {}) {
    b.slide = null;
    b.off = 0;
    b.offE = 0;
    state[b.i].y = y;
    arrivals.push({ b, t0: now, dur: dur * cfg.pace, from, red });
  }
  function think(b, y, done) {
    show = { b, y, t0: now, done, landed: false };
  }
  function drawShow(dt) {
    lg.clearRect(0, 0, W, H);
    // the square fades in as it appears and out as it lands, as the chip did
    const want = show && !show.landed ? 1 : 0;
    squareA += (want - squareA) * (1 - Math.exp(-dt / 0.07));
    if (!show && squareA < 0.01) return;
    const red = v["colour.line"];
    if (!show) return;
    const s = show, t = (now - s.t0) / cfg.pace, b = s.b, y = s.y - 0.5;
    const hx = b.axis === 0 ? b.len / 2 : 0.5, hz = b.axis === 0 ? 0.5 : b.len / 2;
    const pts = [[b.cx - hx, y, b.cz - hz], [b.cx + hx, y, b.cz - hz], [b.cx + hx, y, b.cz + hz], [b.cx - hx, y, b.cz + hz]].map((p) => screen(...p));
    const [fx, fy] = screen(b.cx, y, b.cz);
    const [ax, ay] = squareSpot();
    if (!s.landed && t >= IN.land) {
      s.landed = true;
      s.done();
    }
    const path = route([ax, ay], [fx, fy]);
    lg.fillStyle = red;
    lg.strokeStyle = red;
    // the lit footprint
    const faceA = t > IN.land ? Math.max(0, 1 - (t - IN.land) / 90) : out((t - IN.line) / 200);
    if (faceA > 0.002) {
      lg.globalAlpha = faceA;
      lg.beginPath();
      pts.forEach((p, i) => (i ? lg.lineTo(p[0], p[1]) : lg.moveTo(p[0], p[1])));
      lg.closePath();
      lg.fill();
    }
    // the line, drawn down to it
    const fade = t > IN.land ? Math.max(0, 1 - (t - IN.land) / 300) : 1;
    if (t > IN.line && fade > 0.002) {
      const drawn = partial(path, out((t - IN.line) / 400));
      lg.globalAlpha = fade;
      lg.lineWidth = 1.5;
      lg.lineJoin = "miter";
      lg.beginPath();
      drawn.pts.forEach((p, i) => (i ? lg.lineTo(p[0], p[1]) : lg.moveTo(p[0], p[1])));
      lg.stroke();
    }
    // the square: at home by the middle of its foot, then running the line into the footprint
    if (squareA > 0.01) {
      lg.globalAlpha = squareA;
      if (t < IN.go) lg.fillRect(ax - 5, ay - 9, 10, 10);
      else {
        const [x, yy] = partial(path, ease((t - IN.go) / (IN.land - IN.go))).tip;
        lg.fillRect(x - 5, yy - 5, 10, 10);
      }
    }
    lg.globalAlpha = 1;
    if (t > IN.end) show = null;
  }

  /* ---- a level: the summit and the rings round it get a new layer, one bar per red line, top
     first; then the whole top section presses down one step into the pyramid, and it begins again ---- */
  let pressing = false, pressAnim = null;
  function stepPress() {
    const P = pressAnim;
    if (!P) return;
    const k = Math.min(1, (now - P.t0) / P.dur);
    sinkK = ease(k);
    if (k < 1) return;
    for (const L of P.layers) {
      const S = sets[L.r];
      ringBars(L.r, S.under).forEach((b) => (state[b.i].y = null));
      ringBars(L.r, S.top).forEach((b) => (state[b.i].y = h[L.r] - 1));
      ringBars(L.r, L.set).forEach((b) => (state[b.i].y = h[L.r]));
      sets[L.r] = { top: L.set, under: S.top };
    }
    sinkK = 0;
    pressing = false;
    pressAnim = null;
    later(level, 1000 * cfg.pace);
  }
  const settle = (r) => bars.forEach((b) => {
    if (b.r === r && b.slide) b.slide = { ...b.slide, back: true, t0: now - 9999 };
  });
  function level() {
    // each ring's new layer uses a free split whose corners run the other way to the layer under it
    const layers = Array.from({ length: KL + 1 }, (_, r) => {
      const free = [0, 1, 2, 3].filter((k) => k !== sets[r].top && k !== sets[r].under);
      const set = free.find((k) => k % 2 !== sets[r].top % 2) ?? free[0];
      return { r, set, y: h[r] + 1, todo: ringBars(r, set).sort(() => rnd() - 0.5) };
    });
    let r = 0;
    (function next() {
      const L = layers[r];
      if (!L) return press();
      if (!L.todo.length) {
        r++;
        return next();
      }
      if (L.todo.length === ringBars(L.r, L.set).length) settle(L.r);
      const b = L.todo.shift();
      think(b, L.y, () => arrive(b, L.y, { red: 1, from: 0, dur: 560 }));
      later(next, (3100 + rnd() * 300) * cfg.pace);
    })();
    function press() {
      pressing = true;
      for (let k = 0; k <= KL; k++) settle(k);
      later(() => (pressAnim = { t0: now, dur: 1100 * cfg.pace, layers }), 700 * cfg.pace);
    }
  }

  /* ---- always moving: bars on the top layers slide out from their step and back in ---- */
  function wander() {
    let live = 0;
    for (const b of bars) if (b.slide) live++;
    if (live < bars.length * 0.02 * cfg.motion && rnd() < 0.12) {
      const top = bars.filter((b) => b.r > 0 && state[b.i].y === h[b.r] && !b.slide && !(pressing && b.r <= KL) && !arrivals.some((a) => a.b === b));
      if (top.length) {
        const b = top[Math.floor(rnd() * top.length)];
        const corner = b.ends.filter((d) => d !== 0);
        // out from the step, or (a corner bar, sometimes) lengthways out past its corner
        const lengthways = corner.length && rnd() < 0.55;
        b.slide = lengthways
          ? { key: "offE", to: corner[Math.floor(rnd() * corner.length)] * (0.35 + rnd() * 0.55), t0: now, dur: 1500 + rnd() * 800, hold: 900 + rnd() * 2200, back: false }
          : { key: "off", to: 0.2 + rnd() * 0.5, t0: now, dur: 1400 + rnd() * 800, hold: 800 + rnd() * 2000, back: false };
      }
    }
    for (const b of bars) {
      if (!b.slide) continue;
      const s = b.slide, t = now - s.t0, key = s.key || "off";
      if (!s.back) {
        b[key] = s.to * ease(t / s.dur);
        if (t > s.dur + s.hold) {
          s.back = true;
          s.t0 = now;
          s.from = b[key];
        }
      } else {
        b[key] = (s.from ?? b[key]) * (1 - ease(t / s.dur));
        if (t >= s.dur) {
          b[key] = 0;
          b.slide = null;
        }
      }
    }
  }

  /* ---- drag sideways to spin it; let go and it carries on turning, slowing ---- */
  let drag = null, flick = 0;
  const onDown = (e) => {
    if (e.button > 0) return;
    drag = { last: e.clientX, t: performance.now() };
    flick = 0;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!drag) return;
    const t = performance.now(), d = (e.clientX - drag.last) * 0.3;
    azimuth += d;
    flick = (d / Math.max(8, t - drag.t)) * 1000;
    drag.last = e.clientX;
    drag.t = t;
    if (!raf) frameOnce();
  };
  const letGo = () => {
    if (!drag) return;
    if (performance.now() - drag.t > 90) flick = 0;
    drag = null;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", letGo);
  canvas.addEventListener("pointercancel", letGo);

  /* ---- each frame ---- */
  function step(dt) {
    now += dt * 1000;
    runTimers();
    if (!STILL && cfg.spin && !drag) azimuth += cfg.spin * dt;
    if (!drag && flick) {
      azimuth += flick * dt;
      flick *= Math.pow(0.03, dt);
      if (Math.abs(flick) < 2) flick = 0;
    }
    if (introT0 !== null && now - introT0 > ASSEMBLED) introT0 = null;
    stepPress();
    if (!STILL && introT0 === null) wander();
    for (const b of bars) place(b);
    for (let n = arrivals.length - 1; n >= 0; n--) {
      const a = arrivals[n], k = Math.min(1, (now - a.t0) / a.dur), e = out(k);
      // the red footprint rises into the bar
      if (a.red) place(a.b, { sy: Math.max(0.02, e) });
      else place(a.b, { out: a.from * (1 - e) });
      if (a.red) mark(a.b.i, 1, 1, 0.6);
      if (k >= 1) {
        arrivals.splice(n, 1);
        if (a.red) cooling.push({ i: a.b.i, t0: now, dur: 900 * cfg.pace });
      }
    }
    for (let n = cooling.length - 1; n >= 0; n--) {
      const c = cooling[n], t = Math.min(1, (now - c.t0) / c.dur), k = 1 - t;
      mark(c.i, k, k, 0.6 * k);
      if (t >= 1) cooling.splice(n, 1);
    }
    cluster.rotation.set(0, THREE.MathUtils.degToRad(azimuth), 0);
    cluster.updateMatrixWorld(true);
    placePieces();
    drawShow(dt);
  }
  function render() {
    cluster.updateMatrixWorld(true);
    gtao.render(renderer, null, null);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden, lost = false, frameTimes = [];
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    step(dt);
    render();
    // keep it smooth on slower machines: drop resolution if frames run long, as the page does
    frameTimes.push(dt);
    if (frameTimes.length >= 90) {
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      frameTimes = [];
      if (avg > 0.024 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        resize();
      }
    }
  }
  // a still frame (reduced motion, a dial, a drag while paused)
  function frameOnce() {
    if (lost) return;
    step(0);
    render();
  }
  function sync() {
    const run = !STILL && !lost && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    sync();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  const ro = new ResizeObserver(() => {
    resize();
    if (!raf) frameOnce();
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

  applyLook();
  resize();
  if (!STILL) {
    // the opening, then the first red line once the last bar has landed
    later(level, ASSEMBLED + 300);
  }
  frameOnce();
  sync();

  return {
    update(nv, path) {
      Object.assign(v, nv);
      cfg.pace = v["motion.pace"];
      cfg.spin = v["pyramid.spin"];
      cfg.motion = v["motion.slide"];
      ground.style.background = v["colour.ground"];
      grain.style.opacity = String(v["colour.grain"]);
      if (path == null || path.startsWith("light.") || path === "colour.line") applyLook();
      placeCamera();
      if (!raf) frameOnce();
    },
    action() {},
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", letGo);
      canvas.removeEventListener("pointercancel", letGo);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const m of meshes) {
        m.geometry.dispose();
        m.dispose();
      }
      geos.forEach((g) => g?.dispose());
      material.dispose();
      baked.maps.dispose();
      baked.normals.dispose();
      envRT?.dispose();
      gtao.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      ground.remove();
      canvas.remove();
      lines.remove();
      grain.remove();
    },
  };
}
