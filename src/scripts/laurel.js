/* The chrome award laurel, procedural.

   A port of the studio's Blender laurel (kinetic-contracts/briefs/migration/
   laurel/laurel.py): two branches curving up from the bottom, pointed
   lens-section leaves in pairs along each stem, mirror-finish metal. The
   Blender world (a bright sky, a dark band under a hard white horizon line,
   dark ground) is ported too, as the "studio" environment: it is what makes
   front-on leaves read as polished chrome rather than grey plastic.

     buildLaurel(opts)              -> THREE.Group (both branches)
     mountLaurels(canvas, options)  -> { destroy(), render() }

   One renderer on one canvas draws every laurel on a row of award slots; the
   award logos stay HTML in the middle of each wreath. */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const DEG = Math.PI / 180;

export const LAUREL_DEFAULTS = {
  pairs: 11, // leaf pairs per branch
  length: 1, // leaf length, x the Blender sizes
  width: 1, // leaf width, x the Blender sizes
  curl: 0.05, // how far leaf ends lift toward the viewer
  opening: 56, // the gap between the two tips at the top, in degrees
  base: -82, // where the stems start, degrees round the ring (-90 = bottom)
  spread: 1, // horizontal stretch of the ring
  bow: 0, // wrap the ring round a vertical cylinder: bottom and tips come forward
  stem: 0.022, // stem radius
  detail: 1, // 1 = Blender's 48 x 24 leaf rings; lower for small sizes
  merge: true, // one geometry for the whole laurel (one draw call)
  material: null,
};

/* A pointed leaf along +x from the origin: a lens cross-section that tapers
   to sharp points, widest a little toward the base, curled in z. Domed on
   top (+z, toward the viewer), flatter underneath. */
export function leafGeometry(L, W, H, curl, nu = 48, nv = 24) {
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
      pos.push(x, (Math.cos(a) * W * s) / 2, (zt > 0 ? (zt * H) / 2 : zt * H * 0.18) * s + curl * u * u * L);
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
  const material = o.material ?? createChromeMaterial();
  const nu = Math.max(10, Math.round(48 * o.detail));
  const nv = Math.max(8, Math.round(24 * o.detail));
  const t0 = o.base * DEG;
  const t1 = (90 - o.opening / 2) * DEG;
  const sx = o.spread;
  const parts = []; // { geometry, leaf? }

  for (const side of [1, -1]) {
    const at = (t) => new THREE.Vector3(side * sx * Math.cos(t), Math.sin(t), o.bow * Math.sin(t) ** 2);
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
      const L = (0.36 - 0.14 * f) * o.length;
      for (const out of [1, -1]) {
        const radial = normalAt(t).multiplyScalar(out);
        const d = tangent.clone().multiplyScalar(0.8).addScaledVector(radial, 0.6).normalize();
        const geometry = leafGeometry(L * (out > 0 ? 1 : 0.86), L * 0.36 * o.width, L * 0.26, o.curl, nu, nv);
        parts.push({ geometry, leaf: { position: p.clone(), rotation: Math.atan2(d.y, d.x), out: radial, f, side } });
      }
    }
    // the tip: one leaf carrying on along the stem
    const tip = leafGeometry(0.24 * o.length, 0.085 * o.width, 0.04, o.curl * 0.6, nu, nv);
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
 * Draw `count` laurels on one canvas, one centred on each slot.
 *
 *   mountLaurels(canvas, {
 *     count: 3,                       // how many laurels (max: the slots given)
 *     getSlots: () => [...els],       // the award slot elements, in order
 *     scale: 1,                       // laurel size against its slot (1 = fits it)
 *     laurel: {},                     // buildLaurel options (pairs, curl, ...)
 *     roughness: 0.1,
 *   }) -> { destroy(), render() }
 *
 * The canvas is positioned by the page (absolute, over the row of slots);
 * it is given pointer-events: none so the slots stay clickable. If WebGL is
 * missing, the canvas gets data-laurels="unsupported" (style a PNG fallback
 * from it) and the handle does nothing.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ count?: number, getSlots?: () => Iterable<Element> | ArrayLike<Element>, scale?: number, laurel?: object, roughness?: number }} [options]
 */
export function mountLaurels(canvas, { count = 1, getSlots, scale = 1, laurel = {}, roughness = 0.1 } = {}) {
  const noop = { destroy() {}, render() {}, supported: false };
  if (!canvas || typeof getSlots !== "function") return noop;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    canvas.dataset.laurels = "unsupported";
    return noop;
  }
  canvas.dataset.laurels = "on";
  canvas.style.pointerEvents = "none";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const env = createChromeEnvironment(renderer);
  const scene = new THREE.Scene();
  scene.environment = env.texture;
  const material = createChromeMaterial({ roughness });
  const wreath = buildLaurel({ detail: 0.6, ...laurel, merge: true, material });
  scene.add(wreath);
  const rim = new THREE.DirectionalLight(0xeef3ea, 1.1);
  rim.position.set(-2, 2.5, -3);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(18, 1, 0.1, 100);
  const tanHalf = Math.tan((camera.fov * DEG) / 2);
  const { halfWidth, halfHeight } = wreath.userData.extent;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = reduce.matches;
  const states = [];
  const stateFor = (i) =>
    (states[i] ??= { rx: 0, ry: 0, phase: i * 1.7 + 0.4 });
  let pointer = null;
  let visible = true;
  let onscreen = true;
  let raf = 0;
  let last = performance.now();
  let time = 0;

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h) renderer.setSize(w, h, false);
  };

  const draw = (dt) => {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const c = canvas.getBoundingClientRect();
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    const slots = Array.from(getSlots() ?? []).slice(0, count);
    const k = 1 - Math.exp(-dt * 4); // pointer easing
    slots.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const cx = r.left - c.left + r.width / 2;
      const cy = r.top - c.top + r.height / 2;
      // fit the wreath to the slot, then pad the viewport so the sway and
      // tilt never clip against its edges
      const ppu = Math.min(r.width / 2 / halfWidth, r.height / 2 / halfHeight) * scale;
      const size = Math.max(halfWidth, halfHeight) * 2 * ppu * 1.25;
      const x = cx - size / 2, y = ch - (cy + size / 2);
      if (x > cw || y > ch || x + size < 0 || y + size < 0) return;

      const s = stateFor(i);
      let tx = 0, ty = 0;
      if (pointer && !reduced) {
        const span = Math.max(window.innerWidth, window.innerHeight) * 0.5;
        const dx = (pointer.x - (r.left + r.width / 2)) / span;
        const dy = (pointer.y - (r.top + r.height / 2)) / span;
        ty = Math.tanh(dx * 1.6) * 8 * DEG;
        tx = Math.tanh(dy * 1.6) * 8 * DEG;
      }
      s.ry += (ty - s.ry) * k;
      s.rx += (tx - s.rx) * k;
      const t = reduced ? 0 : time;
      const ph = s.phase;
      wreath.rotation.set(
        s.rx + Math.sin(t * 0.43 + ph * 0.9) * 1.6 * DEG,
        s.ry + Math.sin(t * 0.5 + ph) * 4 * DEG,
        Math.sin(t * 0.37 + ph * 1.3) * 1.2 * DEG,
      );

      camera.aspect = 1;
      camera.position.set(0, 0, size / 2 / (ppu * tanHalf));
      camera.updateProjectionMatrix();
      renderer.setViewport(x, y, size, size);
      renderer.setScissor(x, y, size, size);
      renderer.render(scene, camera);
    });
  };

  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    draw(dt);
    schedule();
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
    if (reduced || !raf) draw(1);
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
      for (const s of states) if (s) s.rx = s.ry = 0;
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
  draw(1);
  schedule();

  return {
    supported: true,
    /** Redraw now (after a layout change, in reduced motion). */
    render: () => draw(1),
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
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      delete canvas.dataset.laurels;
    },
  };
}
