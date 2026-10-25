/* Chrome: the world, the metal and the bloom that every chrome object on
   the site shares (the award laurels, the Chrome laurel experiment).

     createChromeWorld(renderer)   -> PMREM render target (.texture)
     createChrome(opts)            -> MeshPhysicalMaterial
     createBloom(renderer, opts)   -> { target, setSize(w, h), finish(), dispose() }

   The world is laurel.js's Blender studio made hotter: a black floor, a dark
   band, a hard white horizon line bright enough to bloom, a grey sky, and
   three small softboxes that slide glints across the metal as it turns.
   Neutral, no tint (Hunter, Oct 23: "a neutral color, not the blue").

   The bloom works on a transparent canvas: draw the scene into `target`
   (any viewports you like), then `finish()` composites it to the screen with
   the glow, tone mapped, its alpha raised just enough to carry the halo. */

import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

const DEG = Math.PI / 180;

// [position up the ramp, linear rgb], same bands as laurel.js STUDIO_STOPS
const grey = (v) => [v, v, v];
export const CHROME_STOPS = [
  [0.0, grey(0)],
  [0.14, grey(0.002)],
  [0.2, grey(0.32)],
  [0.25, grey(0.025)],
  [0.3, grey(0.045)],
  [0.55, grey(0.006)],
  [0.68, grey(0)],
  [0.725, grey(0.16)],
  [0.74, grey(8)],
  [0.785, grey(3.8)],
  [0.815, grey(0.3)],
  [0.86, grey(0.7)],
  [0.93, grey(1.05)],
  [1.0, grey(1.2)],
];

// softboxes: direction (world), size (cosine falloff), linear rgb
const GLINTS = [
  [[-0.55, 0.62, 0.56], 0.985, grey(16)],
  [[0.72, 0.28, 0.6], 0.99, grey(9)],
  [[0.1, -0.5, 0.86], 0.993, grey(6)],
];

/* "mirror": the jeweller's world. Mostly black, so polished metal reads as a
   dark mirror, with a hot horizon line and a ring of small softboxes that
   throw bright glints off every curve; the bloom catches those (Hunter,
   Oct 23: "reflective chrome mirrors ... more bloom", not white). */
export const MIRROR_STOPS = [
  [0.0, grey(0)],
  [0.2, grey(0.05)],
  [0.25, grey(0.004)],
  [0.6, grey(0.002)],
  [0.7, grey(0.01)],
  [0.735, grey(0.04)],
  [0.745, grey(10)],
  [0.765, grey(2.5)],
  [0.8, grey(0.03)],
  [0.9, grey(0.06)],
  [1.0, grey(0.12)],
];
const MIRROR_GLINTS = [
  [[-0.55, 0.62, 0.56], 0.992, grey(26)],
  [[0.6, 0.55, 0.58], 0.994, grey(20)],
  [[0.0, 0.85, 0.5], 0.995, grey(16)],
  [[-0.85, 0.05, 0.5], 0.993, grey(14)],
  [[0.85, -0.1, 0.5], 0.993, grey(12)],
  [[0.15, -0.6, 0.78], 0.995, grey(9)],
  [[-0.3, 0.2, 0.93], 0.997, grey(8)],
];
/* "blender": the Blender laurel's own world (laurel.js STUDIO_STOPS: bright
   sky, a dark band under a hard white horizon line, black floor), the bright
   bands run hot so they bloom. A domed leaf sweeps through all of it, which
   is what reads as solid chrome rather than a flat cut-out. */
export const BLENDER_STOPS = [
  [0.0, grey(0)], [0.14, grey(0)], [0.2, grey(0.14)], [0.25, grey(0.03)], [0.3, grey(0.04)], [0.55, grey(0.006)], [0.68, grey(0)],
  [0.725, grey(0.04)], [0.74, grey(5)], [0.785, grey(3.2)], [0.815, grey(0.4)], [0.86, grey(0.9)], [0.93, grey(1.3)], [1.0, grey(1.4)],
];
/* "polished": the classic chrome reflection, made for small, plump forms
   (Hunter, Oct 24: the laurels "need to look like chrome"). A bright sky
   that is lightest just over the horizon, a hot hairline horizon, black
   just under it and a dim floor; every rounded surface carries that whole
   story from its top to its bottom, a light half and a dark half with a
   sharp line between, which is what the eye reads as chrome. Neutral. */
export const POLISHED_STOPS = [
  [0.0, grey(0.05)],
  [0.22, grey(0.03)],
  [0.42, grey(0.008)],
  [0.485, grey(0)],
  [0.495, grey(0.05)],
  [0.5, grey(7)],
  [0.512, grey(2.4)],
  [0.53, grey(1.25)],
  [0.62, grey(0.85)],
  [0.8, grey(0.5)],
  [1.0, grey(0.3)],
];
const POLISHED_GLINTS = [
  [[-0.5, 0.7, 0.5], 0.993, grey(14)],
  [[0.62, 0.45, 0.64], 0.995, grey(9)],
];
const LOOKS = {
  polished: { stops: POLISHED_STOPS, glints: POLISHED_GLINTS },
  studio: { stops: CHROME_STOPS, glints: GLINTS },
  mirror: { stops: MIRROR_STOPS, glints: MIRROR_GLINTS },
  blender: { stops: BLENDER_STOPS, glints: GLINTS },
};

const v3 = (c) => `vec3(${c.map((n) => n.toFixed(4)).join(",")})`;

// tipped further back than laurel.js's world, so a face turned to the camera
// mirrors the sky and the hot horizon line lands on its curves
function chromeScene(stops, tilt, boxes) {
  const rot = new THREE.Matrix3().setFromMatrix4(
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt * DEG, 14 * DEG, 0, "ZYX")),
  );
  const glints = boxes.map(([d, size, c]) => [new THREE.Vector3(...d).normalize().toArray(), size, c]);
  const scene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uRot: { value: rot } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform mat3 uRot;
      varying vec3 vDir;
      const float P[${stops.length}] = float[](${stops.map((s) => s[0].toFixed(3)).join(",")});
      const vec3 C[${stops.length}] = vec3[](${stops.map((s) => v3(s[1])).join(",")});
      void main() {
        vec3 n = normalize(vDir);
        vec3 d = uRot * n;
        float f = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = C[0];
        for (int i = 1; i < ${stops.length}; i++) {
          if (f <= P[i]) { c = mix(C[i - 1], C[i], (f - P[i - 1]) / max(P[i] - P[i - 1], 1e-4)); break; }
        }
        ${glints.map(([d, size, col]) => `c += ${v3(col)} * smoothstep(${size.toFixed(4)}, 1.0, dot(n, ${v3(d)}));`).join("\n        ")}
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 96, 64), material));
  return scene;
}

/**
 * The chrome world as a PMREM environment; dispose the target when done.
 * look: "polished" (sky over a hot horizon over black, the classic chrome),
 * "studio" (grey sky, bright), "mirror" (black, hot lights only) or
 * "blender" (the Blender laurel's world, hot).
 */
export function createChromeWorld(renderer, { look = "studio", stops, glints, tilt = -48, soft = 1 } = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const preset = LOOKS[look] ?? LOOKS.studio;
  /* `soft` grows every light and dims it to match (Hunter, Oct 24: the
     flicker "looks a little bit random and not real"): pinpoint lights wink
     on and off as a leaf turns through them; bigger, softer ones glide
     across it, the way a real light does on polished metal */
  const k = Math.max(0.25, soft);
  // the same light in all: k times the spread, 1/k the brightness
  const lights = (glints ?? preset.glints).map(([d, size, c]) => [d, 1 - (1 - size) * k, c.map((x) => x / k)]);
  const scene = chromeScene(stops ?? preset.stops, tilt, lights);
  const target = pmrem.fromScene(scene, 0, 0.1, 100);
  scene.traverse((c) => {
    if (c.isMesh) {
      c.geometry.dispose();
      c.material.dispose();
    }
  });
  pmrem.dispose();
  return target;
}

/** Mirror metal under a clear coat that throws back the glints. */
export function createChrome(opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(0.9, 0.9, 0.92, THREE.LinearSRGBColorSpace),
    metalness: 1,
    roughness: 0.035,
    clearcoat: 0.3,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.4,
    ...opts,
  });
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

/**
 * Bloom for a transparent (or opaque) canvas: the bright parts are pulled
 * out with a soft threshold, blurred down a mip chain and back up, and
 * added on top. Set `renderer.toneMapping` as you like (the site uses
 * ACES Filmic, for the contrast chrome wants); it is applied here.
 *
 * @param {THREE.WebGLRenderer} renderer
 * `halo` adds the whole object's shape to what glows (0 = only the bright
 * parts past `threshold`), in `haloColor`.
 *
 * @param {{ threshold?: number, knee?: number, strength?: number, radius?: number, levels?: number, samples?: number, halo?: number, haloColor?: THREE.ColorRepresentation }} [opts]
 */
export function createBloom(renderer, { threshold = 1.5, knee = 0.6, strength = 0.8, radius = 0.85, levels = 6, samples = 4, halo = 0, haloColor = 0xf2f2f4, steady = 0 } = {}) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
  /* steady: each frame keeps this much of the one before (at 60 fps), so a
     glint on a thin, turning leaf glides from pixel to pixel instead of
     winking on and off, and the bloom it throws holds still with it */
  const history = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
  let fresh = true;
  let keep = steady;
  const settle = new THREE.ShaderMaterial({
    uniforms: { tCur: { value: null }, tPrev: { value: null }, uKeep: { value: 0 } },
    vertexShader: VERT,
    depthTest: false,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform sampler2D tCur, tPrev;
      uniform float uKeep;
      varying vec2 vUv;
      void main() {
        gl_FragColor = mix(texture2D(tCur, vUv), texture2D(tPrev, vUv), uKeep);
      }`,
  });
  const mips = Array.from({ length: levels }, () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
  const quad = new FullScreenQuad();
  const texel = (rt) => new THREE.Vector2(1 / rt.width, 1 / rt.height);

  const prefilter = new THREE.ShaderMaterial({
    uniforms: {
      tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: threshold }, uKnee: { value: knee },
      uHalo: { value: halo },
    },
    vertexShader: VERT,
    /* the bright parts past the threshold in colour, and the halo in alpha:
       the whole object's shape, blurred alongside, so a glow sits round all
       of it (Hunter, Oct 24: "I want to have a bloom on the whole laurel"),
       dark faces too, not only round the glints */
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uTexel;
      uniform float uThreshold, uKnee, uHalo;
      varying vec2 vUv;
      // each tap weighted down by its own brightness (Karis), so one hot
      // pixel can't throw a glow of its own and blink it on and off
      vec4 tap(vec2 o, inout float w) {
        vec4 t = texture2D(tSrc, vUv + uTexel * o);
        float k = 1.0 / (1.0 + max(t.r, max(t.g, t.b)));
        w += k;
        return vec4(t.rgb * k, t.a);
      }
      void main() {
        float w = 0.0;
        vec4 t = tap(vec2(-1, -1), w) + tap(vec2(1, -1), w) + tap(vec2(-1, 1), w) + tap(vec2(1, 1), w);
        vec3 c = t.rgb / max(w, 1e-4);
        t.a *= 0.25;
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
        soft = soft * soft / (4.0 * uKnee + 1e-4);
        vec3 bright = c * max(soft, br - uThreshold) / max(br, 1e-4);
        gl_FragColor = vec4(bright, t.a * uHalo);
      }`,
  });
  // 13 taps, as in Jimenez's "Next generation post processing in Call of Duty"
  const down = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uTexel;
      varying vec2 vUv;
      vec4 s(float x, float y) { return texture2D(tSrc, vUv + uTexel * vec2(x, y)); }
      void main() {
        vec4 c = s(0., 0.) * 0.125;
        c += (s(-1., -1.) + s(1., -1.) + s(-1., 1.) + s(1., 1.)) * 0.125;
        c += (s(-2., -2.) + s(2., -2.) + s(-2., 2.) + s(2., 2.)) * 0.03125;
        c += (s(0., -2.) + s(-2., 0.) + s(2., 0.) + s(0., 2.)) * 0.0625;
        gl_FragColor = c;
      }`,
  });
  const up = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: radius } },
    vertexShader: VERT,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uTexel;
      uniform float uScatter;
      varying vec2 vUv;
      vec4 s(float x, float y) { return texture2D(tSrc, vUv + uTexel * vec2(x, y)); }
      void main() {
        vec4 c = s(0., 0.) * 4.0;
        c += (s(-1., 0.) + s(1., 0.) + s(0., -1.) + s(0., 1.)) * 2.0;
        c += s(-1., -1.) + s(1., -1.) + s(-1., 1.) + s(1., 1.);
        gl_FragColor = c / 16.0 * uScatter;
      }`,
  });
  up.transparent = true;
  // premultiplied in, premultiplied out: the glow raises alpha just enough
  // to stay valid over the page, so it reads as light on any browser
  const composite = new THREE.ShaderMaterial({
    uniforms: {
      tBase: { value: target.texture }, tBloom: { value: mips[0].texture }, uStrength: { value: strength },
      uHaloColor: { value: new THREE.Color(haloColor) },
    },
    vertexShader: VERT,
    depthTest: false,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform sampler2D tBase, tBloom;
      uniform float uStrength;
      uniform vec3 uHaloColor;
      varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tBase, vUv);
        vec4 b = texture2D(tBloom, vUv);
        // the halo glows round the shape, and only a little over the metal itself, so the reflections stay
        vec3 glow = (b.rgb + uHaloColor * b.a * (1.0 - 0.85 * base.a)) * uStrength;
        vec3 sum = base.rgb + glow;
        float a = clamp(max(base.a, max(glow.r, max(glow.g, glow.b))), 0.0, 1.0);
        gl_FragColor = vec4(a > 0.0 ? sum / a : vec3(0.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor = vec4(gl_FragColor.rgb * a, a);
      }`,
  });

  let w = 1, h = 1;
  const setSize = (width, height) => {
    w = Math.max(1, Math.round(width));
    h = Math.max(1, Math.round(height));
    target.setSize(w, h);
    for (const t of history) t.setSize(w, h);
    fresh = true;
    let mw = w, mh = h;
    for (const m of mips) {
      mw = Math.max(1, mw >> 1);
      mh = Math.max(1, mh >> 1);
      m.setSize(mw, mh);
    }
  };

  const pass = (material, src, dst) => {
    material.uniforms.tSrc.value = src.texture;
    material.uniforms.uTexel.value.copy(texel(src));
    quad.material = material;
    renderer.setRenderTarget(dst);
    quad.render(renderer);
  };

  return {
    target,
    setSize,
    get strength() {
      return composite.uniforms.uStrength.value;
    },
    set strength(v) {
      composite.uniforms.uStrength.value = v;
    },
    set threshold(v) {
      prefilter.uniforms.uThreshold.value = v;
    },
    set halo(v) {
      prefilter.uniforms.uHalo.value = v;
    },
    set haloColor(v) {
      composite.uniforms.uHaloColor.value.set(v);
    },
    set radius(v) {
      up.uniforms.uScatter.value = v;
    },
    set steady(v) {
      keep = v;
    },
    /** Glow and tone-map `target` onto the canvas; dt (s) since the last frame, 0 for a redraw. */
    finish(dt = 0) {
      const autoClear = renderer.autoClear;
      const scissor = renderer.getScissorTest();
      renderer.autoClear = false;
      renderer.setScissorTest(false);
      target.scissorTest = false;
      target.viewport.set(0, 0, w, h);
      // this frame into the history: a redraw (dt 0) or a new size starts it afresh
      settle.uniforms.tCur.value = target.texture;
      settle.uniforms.tPrev.value = history[0].texture;
      settle.uniforms.uKeep.value = fresh || !(dt > 0) || keep <= 0 ? 0 : Math.pow(Math.min(keep, 0.95), dt * 60);
      quad.material = settle;
      renderer.setRenderTarget(history[1]);
      quad.render(renderer);
      history.reverse();
      fresh = false;
      const base = history[0];
      composite.uniforms.tBase.value = base.texture;
      pass(prefilter, base, mips[0]);
      for (let i = 1; i < mips.length; i++) pass(down, mips[i - 1], mips[i]);
      for (let i = mips.length - 2; i >= 0; i--) pass(up, mips[i + 1], mips[i]);
      quad.material = composite;
      renderer.setRenderTarget(null);
      quad.render(renderer);
      renderer.autoClear = autoClear;
      renderer.setScissorTest(scissor);
    },
    dispose() {
      target.dispose();
      for (const m of [...mips, ...history]) m.dispose();
      for (const m of [prefilter, down, up, composite, settle]) m.dispose();
      quad.dispose();
    },
  };
}
