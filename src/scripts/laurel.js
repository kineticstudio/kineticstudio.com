/* The chrome award laurel, procedural.

   A port of the studio's Blender laurel (kinetic-contracts/briefs/migration/
   laurel/laurel.py): two branches curving up from the bottom, pointed
   lens-section leaves in pairs along each stem, mirror-finish metal. The
   Blender world (a bright sky, a dark band under a hard white horizon line,
   dark ground) is ported too, as the "studio" environment: it is what makes
   front-on leaves read as polished chrome rather than grey plastic.

     buildLaurel(opts)              -> THREE.Group (both branches)
     mountLaurels(canvas, options)  -> { destroy(), render() }

   One renderer on one canvas draws every laurel on a row of award slots, in
   the site's chrome with bloom (chrome.js); the award logos stay HTML
   in the middle of each wreath. */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createBloom, createChrome, createChromeWorld } from "./chrome.js";

const DEG = Math.PI / 180;

export const LAUREL_DEFAULTS = {
  pairs: 11, // leaf pairs per branch
  length: 1, // leaf length, x the Blender sizes
  width: 1, // leaf width, x the Blender sizes
  curl: 0.05, // how far leaf ends lift toward the viewer
  opening: 56, // the gap between the two tips at the top, in degrees
  base: -82, // where the stems start, degrees round the ring (-90 = bottom)
  spread: 1, // horizontal stretch of the ring
  apart: 0, // moves the two branches apart (or together, below 0), in ring units: the space between them
  bow: 0, // wrap the ring round a vertical cylinder: bottom and tips come forward
  stem: 0.022, // stem radius
  thickness: 0.26, // how domed a leaf is, against its length
  ridge: 0, // 0 a smooth dome; toward 1 a sharp midrib down each leaf
  under: 0.18, // how full the underside is against the top (1 = a pebble, round both ways)
  taper: 1, // how much smaller the leaves get toward the tips (0 = all the same)
  detail: 1, // 1 = Blender's 48 x 24 leaf rings; lower for small sizes
  merge: true, // one geometry for the whole laurel (one draw call)
  material: null,
};

/* A pointed leaf along +x from the origin: a lens cross-section that tapers
   to sharp points, widest a little toward the base, curled in z. Domed on
   top (+z, toward the viewer), flatter underneath. */
export function leafGeometry(L, W, H, curl, nu = 48, nv = 24, ridge = 0, under = 0.18) {
  const pos = [];
  const idx = [];
  pos.push(0, 0, curl * L); // base point (u = -1)
  for (let i = 1; i < nu; i++) {
    const u = -1 + (2 * i) / nu;
    const s = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 1.5)), 0.85) * (1 - 0.22 * u);
    const x = ((u + 1) / 2) * L;
    for (let j = 0; j < nv; j++) {
      const a = (2 * Math.PI * j) / nv;
      const zt = Math.sin(a);
      // the top is a dome, or with `ridge` a raised midrib: two faces that
      // each catch a different band of the world, the way a chrome leaf does
      const top = zt * (1 - ridge) + (1 - Math.abs(Math.cos(a))) * ridge;
      pos.push(x, (Math.cos(a) * W * s) / 2, (zt > 0 ? (top * H) / 2 : (zt * H * under) / 2) * s + curl * u * u * L);
    }
  }
  pos.push(L, 0, curl * L); // tip point (u = 1)
  const tip = pos.length / 3 - 1;
  const ring = (i, j) => 1 + (i - 1) * nv + (j % nv);
  for (let j = 0; j < nv; j++) idx.push(0, ring(1, j + 1), ring(1, j));
  for (let i = 1; i < nu - 1; i++) {
    for (let j = 0; j < nv; j++) {
      const a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j + 1), d = ring(i + 1, j);
      idx.push(a, b, c, a, c, d);
    }
  }
  for (let j = 0; j < nv; j++) idx.push(ring(nu - 1, j), ring(nu - 1, j + 1), tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createChromeMaterial(opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(0.97, 0.97, 0.99, THREE.LinearSRGBColorSpace),
    metalness: 1,
    roughness: 0.07,
    ...opts,
  });
}

/**
 * Build the laurel: both branches, centred on the ring's centre (where the
 * award logo sits), facing +z. With `merge` the whole thing is one mesh;
 * without it every leaf is its own mesh, listed in group.userData.leaves
 * with its rest pose and outward direction (for the experiment's Explode).
 */
export function buildLaurel(opts = {}) {
  const o = { ...LAUREL_DEFAULTS, ...opts };
  const material = o.material ?? createChrome();
  const nu = Math.max(10, Math.round(48 * o.detail));
  const nv = Math.max(8, Math.round(24 * o.detail));
  const t0 = o.base * DEG;
  const t1 = (90 - o.opening / 2) * DEG;
  const sx = o.spread;
  const parts = []; // { geometry, leaf? }

  for (const side of [1, -1]) {
    const at = (t) => new THREE.Vector3(side * (sx * Math.cos(t) + o.apart), Math.sin(t), o.bow * Math.sin(t) ** 2);
    const tangentAt = (t) => new THREE.Vector3(-side * sx * Math.sin(t), Math.cos(t), 0).normalize();
    const normalAt = (t) => new THREE.Vector3(side * Math.cos(t), sx * Math.sin(t), 0).normalize();

    // the stem: a tube along the arc
    const arc = new THREE.Curve();
    arc.getPoint = (k, target = new THREE.Vector3()) => target.copy(at(t0 + (t1 - t0) * k));
    const stem = new THREE.TubeGeometry(arc, Math.round(64 * Math.max(0.5, o.detail)), o.stem, Math.max(6, Math.round(10 * o.detail)), false);
    stem.deleteAttribute("uv");
    parts.push({ geometry: stem });

    // leaves in pairs, shrinking toward the tip
    const pairs = Math.max(1, Math.round(o.pairs));
    for (let k = 0; k < pairs; k++) {
      const f = pairs === 1 ? 0 : k / (pairs - 1);
      const t = t0 + (t1 - t0) * (0.06 + 0.9 * f);
      const p = at(t);
      const tangent = tangentAt(t);
      const L = 0.36 * (1 - 0.39 * o.taper * f) * o.length;
      for (const out of [1, -1]) {
        const radial = normalAt(t).multiplyScalar(out);
        const d = tangent.clone().multiplyScalar(0.8).addScaledVector(radial, 0.6).normalize();
        const geometry = leafGeometry(L * (out > 0 ? 1 : 0.86), L * 0.36 * o.width, L * o.thickness, o.curl, nu, nv, o.ridge, o.under);
        parts.push({ geometry, leaf: { position: p.clone(), rotation: Math.atan2(d.y, d.x), out: radial, f, side } });
      }
    }
    // the tip: one leaf carrying on along the stem
    const tL = 0.24 * (1 - 0.3 * o.taper) * o.length;
    const tip = leafGeometry(tL, tL * 0.36 * o.width, tL * o.thickness, o.curl * 0.6, nu, nv, o.ridge, o.under);
    const td = tangentAt(t1);
    parts.push({ geometry: tip, leaf: { position: at(t1), rotation: Math.atan2(td.y, td.x), out: normalAt(t1), f: 1.05, side } });
  }

  const group = new THREE.Group();
  group.name = "laurel";
  const leaves = [];
  if (o.merge) {
    const m = new THREE.Matrix4();
    const geos = parts.map(({ geometry, leaf }) => {
      if (leaf) geometry.applyMatrix4(m.makeRotationZ(leaf.rotation).setPosition(leaf.position));
      return geometry;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    group.add(new THREE.Mesh(merged, material));
  } else {
    for (const { geometry, leaf } of parts) {
      const mesh = new THREE.Mesh(geometry, material);
      if (leaf) {
        mesh.position.copy(leaf.position);
        mesh.rotation.z = leaf.rotation;
        mesh.userData.rest = { position: leaf.position.clone(), rotation: leaf.rotation };
        mesh.userData.out = leaf.out;
        mesh.userData.f = leaf.f;
        leaves.push(mesh);
      }
      group.add(mesh);
    }
  }

  const box = new THREE.Box3().setFromObject(group);
  group.userData.leaves = leaves;
  group.userData.material = material;
  // extents measured from the ring's centre, so the logo slot stays centred
  group.userData.extent = {
    halfWidth: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
    apart: o.apart, // how much of halfWidth is the space between the branches
    halfHeight: Math.max(Math.abs(box.min.y), Math.abs(box.max.y)),
    box,
  };
  group.userData.dispose = () => {
    group.traverse((c) => c.isMesh && c.geometry.dispose());
    if (!o.material) material.dispose();
  };
  return group;
}

/* The Blender world, by direction: the y of the direction (after the
   world's mapping rotation) runs through a ramp of bands. Front-on surfaces
   land on the hard white horizon line; tilted ones sweep through the dark
   band and the bright sky. `floor` lifts the darkest bands a touch so the
   metal keeps its edge on a near-black page. */
export const STUDIO_STOPS = [
  [0.0, 0.0], [0.14, 0.0], [0.2, 0.14], [0.25, 0.03], [0.3, 0.04], [0.55, 0.006], [0.68, 0.0],
  [0.725, 0.04], [0.74, 1.0], [0.785, 0.95], [0.815, 0.4], [0.86, 0.8], [0.93, 1.0], [1.0, 1.0],
];

function studioScene(floor = 0, stops = STUDIO_STOPS) {
  const rot = new THREE.Matrix3().setFromMatrix4(
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-32 * DEG, 14 * DEG, 0, "ZYX")),
  );
  const scene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uRot: { value: rot }, uFloor: { value: floor } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform mat3 uRot;
      uniform float uFloor;
      varying vec3 vDir;
      const float P[${stops.length}] = float[](${stops.map((s) => s[0].toFixed(3)).join(",")});
      const float V[${stops.length}] = float[](${stops.map((s) => s[1].toFixed(3)).join(",")});
      void main() {
        vec3 d = uRot * normalize(vDir);
        float f = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        float v = V[0];
        for (int i = 1; i < ${stops.length}; i++) {
          if (f <= P[i]) { v = mix(V[i - 1], V[i], (f - P[i - 1]) / max(P[i] - P[i - 1], 1e-4)); break; }
        }
        v = uFloor + v * (1.0 - uFloor);
        gl_FragColor = vec4(vec3(v), 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 96, 64), material));
  return scene;
}

/**
 * A PMREM environment for the chrome. kind "studio" is the Blender world
 * above (the reference look); "room" is three's RoomEnvironment. Returns the
 * render target: use `.texture`, and dispose it when done.
 */
export function createChromeEnvironment(renderer, { kind = "studio", floor = 0.006, stops = STUDIO_STOPS } = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = kind === "room" ? new RoomEnvironment() : studioScene(floor, stops);
  const target = pmrem.fromScene(scene, kind === "room" ? 0.04 : 0, 0.1, 100);
  if (scene.dispose) scene.dispose();
  scene.traverse((c) => {
    if (c.isMesh) {
      c.geometry.dispose();
      c.material.dispose();
    }
  });
  pmrem.dispose();
  return target;
}

/**
 * Draw `count` laurels on one canvas, one centred on each slot, in mirror
 * chrome with a bloom. The wreaths hold still, leaning a little toward the
 * pointer; their leaves sway and twist in a slow wind, each on its own.
 *
 *   mountLaurels(canvas, {
 *     count: 3,                       // how many laurels (max: the slots given)
 *     getSlots: () => [...els],       // the award slot elements, in order
 *     scale: 1,                       // laurel size against its slot (1 = fits it)
 *     laurel: {},                     // buildLaurel options (pairs, curl, ...)
 *     roughness: 0.04,
 *     metal: {},                      // envMapIntensity, clearcoat, tint (a colour)
 *     bloom: {},                      // createBloom options (strength, threshold, radius)
 *     world: {},                      // createChromeWorld options (look, tilt)
 *     exposure: 0.95,
 *     turn: 0,                        // how far each wreath sways side to side, degrees
 *     motion: {},                     // wind, windSpeed, lean (multipliers)
 *     flash: {},                      // every (s, 0 = never), count, sweep (deg), pass (s), glow
 *     steady: 0.6,                    // how much of the last frame each frame keeps (0 = none), so glints glide
 *     quality: 1.5,                   // render scale against the screen's pixels (supersampling)
 *   }) -> { destroy(), render(), update(o), flash() }
 *
 * The canvas is positioned by the page (absolute, over the row of slots,
 * with room round it for the glow); it is given pointer-events: none so the
 * slots stay clickable. If WebGL is missing, the canvas gets
 * data-laurels="unsupported" (style a PNG fallback from it) and the handle
 * does nothing.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ count?: number, getSlots?: () => Iterable<Element> | ArrayLike<Element>, scale?: number, laurel?: object, roughness?: number, bloom?: object }} [options]
 */
export function mountLaurels(canvas, { count = 1, getSlots, scale: scaleOpt = 1, laurel = {}, roughness = 0.04, metal = {}, bloom: bloomOpts = {}, world = {}, tone = "aces", exposure = 0.95, turn: turnOpt = 0, motion: motionOpt = {}, flash: flashOpt = {}, quality: qualityOpt = 1.5, steady = 0.6 } = {}) {
  const noop = { destroy() {}, render() {}, supported: false };
  if (!canvas || typeof getSlots !== "function") return noop;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
  } catch {
    canvas.dataset.laurels = "unsupported";
    return noop;
  }
  canvas.dataset.laurels = "on";
  canvas.style.pointerEvents = "none";
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.toneMapping = tone === "none" ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;

  // the dark mirror world: black reflections, hot glints, and the glow on them
  const env = createChromeWorld(renderer, { look: "mirror", tilt: -32, ...world });
  const bloom = createBloom(renderer, { strength: 1.1, threshold: 0.8, haloColor: metal.tint ?? 0xf2f2f4, steady, ...bloomOpts });
  // drawn at `quality` x the screen's pixels and filtered down, so a mirror
  // leaf's thin highlights hold still instead of shimmering at the pixel edges
  let rp = pr * qualityOpt;
  const scene = new THREE.Scene();
  scene.environment = env.texture;
  const { tint, ...metalRest } = metal;
  const material = createChrome({ roughness, ...metalRest, ...(tint && { color: new THREE.Color(tint) }) });
  // the metal's own reflection map: three ignores envMapIntensity for a
  // scene.environment, so without this `reflect` (and the flash's glow) did nothing
  material.envMap = env.texture;
  let reflect = material.envMapIntensity;
  // live: everything that needs no rebuild (handle.update)
  let scale = scaleOpt, turn = turnOpt;
  // twist = how far each leaf turns about its own length; flutter = how much
  // each leaf moves on its own beat (0: the branch moves as one wave, the way
  // a real branch does, so the highlights glide instead of winking at random)
  const motion = { wind: 1, windSpeed: 1, lean: 1, twist: 1, flutter: 1, ...motionOpt };
  // a flash: every `every` s (0 = never) a burst of `count` passes; each pass
  // slides the world's lights `sweep` degrees across the metal and back over
  // `pass` s, the reflections brightening by `glow` at its height
  const flash = { every: 0, count: 1, sweep: 60, pass: 0.7, glow: 0.6, ...flashOpt };
  let flashAt = -1, nextFlash = 1.2;
  // every leaf its own mesh, so each can move in the wind
  const wreath = buildLaurel({ detail: 0.7, ...laurel, merge: false, material });
  scene.add(wreath);
  const leaves = wreath.userData.leaves.map((mesh, j) => {
    mesh.rotation.order = "ZYX"; // x then twists the leaf about its own length
    return { mesh, rest: mesh.userData.rest.rotation, f: mesh.userData.f, w: j * 0.37 + Math.sin(j * 12.9898) * 2 };
  });
  const rim = new THREE.DirectionalLight(0xffffff, 2.2);
  rim.position.set(-2, 2.5, -3);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(18, 1, 0.1, 100);
  const tanHalf = Math.tan((camera.fov * DEG) / 2);
  const { halfWidth, halfHeight } = wreath.userData.extent;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = reduce.matches;
  const states = [];
  const stateFor = (i) => (states[i] ??= { rx: 0, ry: 0, phase: i * 1.7 + 0.4 });
  let pointer = null;
  let visible = true;
  let onscreen = true;
  let raf = 0;
  let last = performance.now();
  let time = 0;
  let windTime = 0;

  /* The wind (Hunter, Oct 23: no spin, no bounce, "sway in the wind, the
     little leaves individually"): a slow gust swells and fades, and a wave
     runs up each branch, so every leaf sways about its stem and twists about
     its own length a little out of step with its neighbours; tips move most. */
  const blow = (t, ph) => {
    const gust = motion.wind * (0.6 + 0.4 * Math.sin(t * 0.29 + ph) * Math.sin(t * 0.17 + ph * 2.1));
    for (const l of leaves) {
      const reach = 0.45 + l.f;
      const own = l.w * motion.flutter;
      const sway = gust * reach * 4.5 * DEG * Math.sin(t * 1.25 - l.f * 3.2 + own + ph);
      const twist = gust * reach * 11 * DEG * motion.twist * Math.sin(t * 1.9 - l.f * 2.4 + own * 1.7 + ph * 0.6);
      const lift = gust * reach * 3 * DEG * Math.sin(t * 1.55 - l.f * 2 + own * 0.9);
      l.mesh.rotation.set(twist, lift, l.rest + sway);
    }
  };

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    bloom.setSize(w * rp, h * rp);
  };

  const draw = (dt) => {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const c = canvas.getBoundingClientRect();
    const target = bloom.target;
    target.scissorTest = false;
    target.viewport.set(0, 0, cw * rp, ch * rp);
    renderer.setRenderTarget(target);
    renderer.clear();
    const slots = Array.from(getSlots() ?? []).slice(0, count);
    const k = 1 - Math.exp(-dt * 4); // pointer easing
    // the flash: the world turns under the metal and back, so the lights slide over every leaf
    let yaw = 0, boost = 0;
    if (!reduced) {
      if (flash.every > 0 && time >= nextFlash) flashAt = time;
      const ft = time - flashAt, pass = Math.max(0.05, flash.pass);
      if (flashAt >= 0 && ft < flash.count * pass) {
        const i = Math.floor(ft / pass), u = Math.sin(Math.PI * ((ft % pass) / pass));
        yaw = (i % 2 ? -1 : 1) * flash.sweep * DEG * u;
        boost = flash.glow * u;
      } else if (flashAt >= 0 && ft >= flash.count * pass) {
        flashAt = -1;
        nextFlash = flash.every > 0 ? time + flash.every : Infinity;
      }
    }
    material.envMapRotation.set(0, yaw, 0);
    material.envMapIntensity = reflect * (1 + boost);
    slots.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const cx = r.left - c.left + r.width / 2;
      const cy = r.top - c.top + r.height / 2;
      // fit the wreath to the slot, then pad the viewport so the lean and the
      // leaves' sway never clip against its edges
      // fit by the wreath itself, not the space between its branches, so
      // moving them apart never shrinks the leaves
      const fitW = Math.max(halfHeight * 0.4, halfWidth - Math.max(0, wreath.userData.extent.apart));
      const ppu = Math.min(r.width / 2 / fitW, r.height / 2 / halfHeight) * scale;
      const size = Math.max(halfWidth, halfHeight) * 2 * ppu * 1.3;
      const x = cx - size / 2, y = ch - (cy + size / 2);
      if (x > cw || y > ch || x + size < 0 || y + size < 0) return;

      const s = stateFor(i);
      let tx = 0, ty = 0;
      if (pointer && !reduced) {
        const span = Math.max(window.innerWidth, window.innerHeight) * 0.5;
        const dx = (pointer.x - (r.left + r.width / 2)) / span;
        const dy = (pointer.y - (r.top + r.height / 2)) / span;
        ty = Math.tanh(dx * 1.6) * 9 * DEG * motion.lean;
        tx = Math.tanh(dy * 1.6) * 6 * DEG * motion.lean;
      }
      s.ry += (ty - s.ry) * k;
      s.rx += (tx - s.rx) * k;
      const t = reduced ? 0 : time;
      const tw = reduced ? 0 : windTime;
      const ph = s.phase;
      // the wreath itself only leans toward the pointer and breathes a touch
      // `turn`: how far it slowly sways side to side, in degrees, so the light runs over it
      wreath.rotation.set(s.rx + Math.sin(t * 0.4 + ph) * 1.2 * DEG, s.ry + Math.sin(t * 0.33 + ph * 1.3) * (2.5 + turn) * DEG, 0);
      blow(tw, ph);

      camera.aspect = 1;
      camera.position.set(0, 0, size / 2 / (ppu * tanHalf));
      camera.updateProjectionMatrix();
      target.viewport.set(x * rp, y * rp, size * rp, size * rp);
      target.scissor.set(x * rp, y * rp, size * rp, size * rp);
      target.scissorTest = true;
      renderer.setRenderTarget(target);
      renderer.clearDepth();
      renderer.render(scene, camera);
    });
    bloom.finish(dt);
  };

  /* The clock runs on the frames' own timestamps. It used to restart after
     every frame was drawn, so each step was a frame less the time the draw
     took: uneven steps, the wind and the turn stuttering, and every glint
     winking as it jumped (Hunter, Oct 24: "blinking, blinking, blinking ...
     rather than a smooth reflection"). It only restarts on resuming. */
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    windTime += dt * motion.windSpeed;
    draw(dt);
    if (!reduced && visible && onscreen) raf = requestAnimationFrame(frame);
  };
  const schedule = () => {
    if (raf || reduced || !visible || !onscreen) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const still = () => {
    if (reduced) draw(1);
  };

  const ro = new ResizeObserver(() => {
    resize();
    if (reduced || !raf) draw(0);
  });
  ro.observe(canvas);
  for (const el of Array.from(getSlots() ?? [])) el && ro.observe(el);
  const io = new IntersectionObserver(
    ([e]) => {
      onscreen = e.isIntersecting;
      schedule();
    },
    { rootMargin: "120px" },
  );
  io.observe(canvas);
  const onVisibility = () => {
    visible = document.visibilityState !== "hidden";
    schedule();
  };
  const onPointer = (e) => (pointer = { x: e.clientX, y: e.clientY });
  const onLeave = () => (pointer = null);
  const onReduce = () => {
    reduced = reduce.matches;
    if (reduced) {
      cancelAnimationFrame(raf);
      raf = 0;
      for (const s of states) if (s) Object.assign(s, { rx: 0, ry: 0 });
      still();
    } else schedule();
  };
  const onLost = (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);
  window.addEventListener("resize", still);
  reduce.addEventListener("change", onReduce);
  canvas.addEventListener("webglcontextlost", onLost);

  resize();
  draw(0);
  schedule();

  return {
    supported: true,
    /** Redraw now (after a layout change, in reduced motion). */
    render: () => draw(0),
    /** Change what needs no rebuild: scale, turn, roughness, metal, bloom, exposure, motion, flash. */
    update(o = {}) {
      if (o.scale !== undefined) scale = o.scale;
      if (o.turn !== undefined) turn = o.turn;
      if (o.roughness !== undefined) material.roughness = o.roughness;
      if (o.metal) {
        if (o.metal.envMapIntensity !== undefined) reflect = o.metal.envMapIntensity;
        if (o.metal.clearcoat !== undefined) material.clearcoat = o.metal.clearcoat;
        if (o.metal.tint) material.color.set(o.metal.tint);
      }
      if (o.bloom) for (const key of ["strength", "threshold", "radius", "halo"]) if (o.bloom[key] !== undefined) bloom[key] = o.bloom[key];
      if (o.steady !== undefined) bloom.steady = o.steady;
      if (o.metal?.tint) bloom.haloColor = o.metal.tint;
      if (o.quality !== undefined) {
        rp = pr * o.quality;
        resize();
      }
      if (o.exposure !== undefined) renderer.toneMappingExposure = o.exposure;
      if (o.motion) Object.assign(motion, o.motion);
      if (o.flash) {
        Object.assign(flash, o.flash);
        if (flashAt < 0) nextFlash = flash.every > 0 ? time + Math.min(flash.every, 1) : Infinity;
      }
      if (reduced || !raf) draw(0);
    },
    /** Flash now. */
    flash() {
      flashAt = time;
      schedule();
    },
    /** For tuning from a console: the metal, the bloom, the renderer. */
    debug: { material, bloom, renderer, rim, states },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("resize", still);
      reduce.removeEventListener("change", onReduce);
      canvas.removeEventListener("webglcontextlost", onLost);
      wreath.userData.dispose();
      material.dispose();
      bloom.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      delete canvas.dataset.laurels;
    },
  };
}
