/* Object stipple.

   The Cambium hero study (iCloud AI Fun/cambium, index.html): real 3D
   objects (a cabinet, a bookcase, a building, a farmhouse, a tree, a wood
   pile) turning slowly under an isometric camera, drawn entirely in ink
   dots and dashes on warm paper, the way the brand's pen illustrations
   are. The stipple is fixed to each surface (triplanar, in object space) so
   it turns with the object, and each dot is a capsule whose size and
   length come from how dark that facet is under one light; two finer
   layers come in only in the deepest shade. In turn, one object dissolves
   dot by dot and the next is stippled in. Drag to turn it.

   The models are the page's own GLBs (AI Fun/cambium/*.glb), packed to
   positions only: each is flattened, centred, scaled to a 1.2 extent and
   quantised to Int16 with its indices (media/play/object-stipple/*.bin,
   about 250 KB in all, see parseModel). Normals are rebuilt flat here, as
   the page did. */

import * as THREE from "three";

const OBJECTS = [
  { name: "Cabinet", file: "cabinet" },
  { name: "Bookcase", file: "bookcase" },
  { name: "Building", file: "building" },
  { name: "Farmhouse", file: "farmhouse" },
  { name: "Tree", file: "tree" },
  { name: "Wood pile", file: "wood-pile" },
  { name: "Vessel", make: "vessel" },
  { name: "Torus", make: "torus" },
  { name: "Sphere", make: "sphere" },
];
const TOUR = ["Cabinet", "Bookcase", "Building", "Farmhouse", "Tree", "Wood pile"];

export const params = {
  object: { type: "select", options: ["In turn", ...OBJECTS.map((o) => o.name)], default: "In turn" },
  stipple: {
    density: [200, 60, 600, 1],
    dot: [0.22, 0.05, 0.5, 0.01],
    dash: [0.3, 0, 0.45, 0.01],
  },
  light: {
    angle: [-48, -180, 180, 1],
    shade: [2.25, 0.3, 3, 0.05],
  },
  motion: { spin: [0.1, 0, 2, 0.05] },
  colour: { ink: "#9f8e84", paper: "#f9f5f1", ground: "#f5efe4" },
};

const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const MEDIA = new URL("media/play/object-stipple/", ROOT).href;

// the page's tunables, as Hunter left them
const LIGHT = [-0.5, 0.8, 0.45];
const ORTHO_SIZE = 1.2;
const HOLD = 6.5; // seconds each object stays in turn
const OUT = 0.9, IN = 1.4; // the dissolve, seconds

const vertexShader = /* glsl */ `
  varying vec3 vObjPos;
  varying vec3 vObjNormal;
  varying vec3 vWorldNormal;
  void main() {
    vObjPos      = position;
    vObjNormal   = normal;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* The page's stipple shader, with one addition: uReveal gates each dot by
   its own hash, so an object can be stippled in and dissolved away dot by
   dot, and the paper body fades with it. */
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vObjPos;
  varying vec3 vObjNormal;
  varying vec3 vWorldNormal;
  uniform vec3  uInk;
  uniform vec3  uPaper;
  uniform vec3  uGround;
  uniform vec3  uLightDir;
  uniform float uLitFloor;
  uniform float uShadowCeil;
  uniform float uShadowGamma;
  uniform float uActivationSoft;
  uniform float uDotDensity;
  uniform float uDotRadius;
  uniform float uDashLength;
  uniform float uDashVariance;
  uniform float uLayer2Scale;
  uniform float uLayer2Start;
  uniform float uLayer3Scale;
  uniform float uLayer3Start;
  uniform float uReveal;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  vec2 hash22(vec2 p) { return vec2(hash21(p), hash21(p + 17.3)); }

  // a capsule per cell: two round ends and a body, along uv.x
  float capsuleLayer(vec2 uv, float darkness, float baseRadius, float soft, float dashLen, float dashVar) {
    vec2 cell  = floor(uv);
    vec2 local = fract(uv);
    float thresh     = hash21(cell);
    float activation = smoothstep(thresh - soft, thresh + soft, darkness);
    float born = hash21(cell + 41.7);
    activation *= smoothstep(born - 0.06, born + 0.06, uReveal * 1.12 - 0.06);
    float sizeVar = 0.7 + 0.6 * hash21(cell + 3.7);
    float radius  = baseRadius * sizeVar * activation;
    vec2 center = 0.15 + 0.7 * hash22(cell + 19.7);
    float lenRoll = hash21(cell + 7.3);
    float halfLen = dashLen * activation * mix(1.0, lenRoll, dashVar);
    vec2 d = local - center;
    d.x = max(abs(d.x) - halfLen, 0.0);
    float dist = length(d);
    float aa = fwidth(dist) * 1.2;
    float mask = 1.0 - smoothstep(radius - aa, radius + aa, dist);
    mask *= smoothstep(0.0, aa, radius);
    return mask;
  }

  // per-face uv pairs chosen so the dashes run horizontally on vertical faces
  float triplanarCapsule(vec3 coord, vec3 n, float darkness, float radius, float soft, float dashLen, float dashVar) {
    vec3 nAbs = pow(abs(n), vec3(3.0));
    nAbs = nAbs / (nAbs.x + nAbs.y + nAbs.z + 1e-4);
    float sX = capsuleLayer(vec2(coord.z, coord.y), darkness, radius, soft, dashLen, dashVar);
    float sY = capsuleLayer(vec2(coord.x, coord.z), darkness, radius, soft, dashLen, dashVar);
    float sZ = capsuleLayer(vec2(coord.x, coord.y), darkness, radius, soft, dashLen, dashVar);
    return sX * nAbs.x + sY * nAbs.y + sZ * nAbs.z;
  }

  void main() {
    vec3  n     = normalize(vWorldNormal);
    vec3  L     = normalize(uLightDir);
    float NdotL = max(dot(n, L), 0.0);
    float darkness = mix(uShadowCeil, uLitFloor, NdotL);
    darkness = pow(darkness, uShadowGamma);

    vec3 nObj = normalize(vObjNormal);
    vec3 coord = vObjPos * uDotDensity;
    float R = uDotRadius;
    float S = uActivationSoft;
    float d2 = smoothstep(uLayer2Start, 1.0, darkness);
    float d3 = smoothstep(uLayer3Start, 1.0, darkness);
    float ink1 = triplanarCapsule(coord,                       nObj, darkness, R,        S, uDashLength,        uDashVariance);
    float ink2 = triplanarCapsule(coord * uLayer2Scale + 11.0, nObj, d2,       R * 0.85, S, uDashLength * 0.85, uDashVariance);
    float ink3 = triplanarCapsule(coord * uLayer3Scale + 23.0, nObj, d3,       R * 0.7,  S, uDashLength * 0.7,  uDashVariance);
    float ink = 1.0 - (1.0 - ink1) * (1.0 - ink2) * (1.0 - ink3);

    vec3 body = mix(uGround, uPaper, smoothstep(0.0, 0.35, uReveal));
    gl_FragColor = vec4(mix(body, uInk, ink), 1.0);
  }
`;

/* A packed model: Int16 positions and indices (see the header above). */
function parseModel(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "KSOB") throw new Error("not a packed model");
  const vCount = view.getUint32(4, true), iCount = view.getUint32(8, true), iBytes = view.getUint32(12, true);
  const q = view.getFloat32(16, true);
  const head = 24, posBytes = vCount * 6, pad = (4 - ((head + posBytes) % 4)) % 4;
  const raw = new Int16Array(buffer, head, vCount * 3);
  const pos = new Float32Array(vCount * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = raw[i] * q;
  const index = iBytes === 2 ? new Uint16Array(buffer, head + posBytes + pad, iCount) : new Uint32Array(buffer, head + posBytes + pad, iCount);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(index.slice(), 1));
  // flat facets, as the page had them: unshared vertices, normals per face
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}

function makePrimitive(kind) {
  if (kind === "torus") return new THREE.TorusGeometry(0.45, 0.17, 32, 96);
  if (kind === "sphere") return new THREE.SphereGeometry(0.55, 64, 48);
  const pts = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = Math.sin(t * Math.PI) * (0.42 - 0.03 * Math.cos(t * Math.PI * 4));
    pts.push(new THREE.Vector2(Math.max(r, 0), (t - 0.5) * 1.1));
  }
  return new THREE.LatheGeometry(pts, 96);
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);
  const aborter = new AbortController();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:pan-y";
  host.append(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(v["colour.ground"]);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(6, 6, 6);
  camera.lookAt(0, 0, 0);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uInk: { value: new THREE.Color(v["colour.ink"]) },
      uPaper: { value: new THREE.Color(v["colour.paper"]) },
      uGround: { value: new THREE.Color(v["colour.ground"]) },
      uLightDir: { value: new THREE.Vector3(...LIGHT).normalize() },
      uLitFloor: { value: 0.37 },
      uShadowCeil: { value: 0.95 },
      uShadowGamma: { value: v["light.shade"] },
      uActivationSoft: { value: 0.5 },
      uDotDensity: { value: v["stipple.density"] },
      uDotRadius: { value: v["stipple.dot"] },
      uDashLength: { value: v["stipple.dash"] },
      uDashVariance: { value: 0.4 },
      uLayer2Scale: { value: 1.7 },
      uLayer2Start: { value: 0.35 },
      uLayer3Scale: { value: 2.9 },
      uLayer3Start: { value: 0.65 },
      uReveal: { value: still ? 1 : 0 },
    },
  });

  const pivot = new THREE.Group();
  scene.add(pivot);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.visible = false;
  pivot.add(mesh);
  // a still frame turns the object a little off square, so its sides read
  if (still) pivot.rotation.y = 0.35;

  /* ---- the objects, fetched as they are wanted ---- */
  const geometries = new Map();
  const pending = new Map();
  function load(name) {
    if (geometries.has(name)) return Promise.resolve(geometries.get(name));
    if (pending.has(name)) return pending.get(name);
    const def = OBJECTS.find((o) => o.name === name) ?? OBJECTS[0];
    const p = def.make
      ? Promise.resolve(makePrimitive(def.make))
      : fetch(new URL(`${def.file}.bin`, MEDIA).href, { signal: aborter.signal })
          .then((r) => {
            if (!r.ok) throw new Error(`${def.file}.bin: ${r.status}`);
            return r.arrayBuffer();
          })
          .then(parseModel);
    const done = p.then((g) => {
      geometries.set(name, g);
      pending.delete(name);
      return g;
    });
    pending.set(name, done);
    return done;
  }

  /* ---- what is showing, and the dissolve between ---- */
  let showing = null; // the object name on the mesh
  let wanted = null;
  let reveal = still ? 1 : 0;
  let phase = "in"; // in, hold, next, out
  let phaseT = 0;
  let tourAt = 0;
  const wantName = () => (v.object === "In turn" ? TOUR[tourAt % TOUR.length] : v.object);

  function put(name, g) {
    mesh.geometry = g;
    mesh.visible = true;
    showing = name;
    draw();
  }
  function want(name) {
    wanted = name;
    if (showing === name) return;
    load(name)
      .then((g) => {
        if (wanted !== name) return;
        if (!showing || still) {
          put(name, g);
          phase = "in";
          phaseT = 0;
          reveal = still ? 1 : reveal;
        } else if (phase !== "out") {
          phase = "out";
          phaseT = 0;
        }
        sync();
      })
      .catch((e) => {
        if (e.name !== "AbortError") console.warn("object-stipple:", e.message);
      });
  }

  function tick(dt) {
    phaseT += dt;
    if (phase === "in") {
      reveal = Math.min(1, reveal + dt / IN);
      if (reveal >= 1) {
        phase = "hold";
        phaseT = 0;
      }
    } else if (phase === "out") {
      reveal = Math.max(0, reveal - dt / OUT);
      if (reveal <= 0) {
        const g = geometries.get(wanted);
        if (g) {
          put(wanted, g);
          phase = "in";
          phaseT = 0;
        }
      }
    } else if (phase === "hold" && v.object === "In turn" && phaseT >= HOLD) {
      // "next" waits for the next object to arrive, then it dissolves out
      phase = "next";
      tourAt++;
      // fetch ahead so the swap after this one never waits
      load(TOUR[(tourAt + 1) % TOUR.length]).catch(() => {});
      want(wantName());
    }
    material.uniforms.uReveal.value = reveal * reveal * (3 - 2 * reveal);
  }

  /* ---- drag to turn ---- */
  let dragging = false, lastX = 0, resumeAt = 0, clock = 0;
  const yAxis = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    q.setFromAxisAngle(yAxis, dx * 0.009);
    pivot.quaternion.premultiply(q);
    if (!raf) draw();
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    resumeAt = clock + 0.8;
    canvas.style.cursor = "grab";
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  function setLight() {
    // the dial turns the page's light around the vertical, keeping its height
    const [x, y, z] = LIGHT;
    const r = Math.hypot(x, z);
    const a = (v["light.angle"] * Math.PI) / 180;
    material.uniforms.uLightDir.value.set(Math.sin(a) * r, y, Math.cos(a) * r).normalize();
  }

  function paint() {
    const u = material.uniforms;
    u.uInk.value.set(v["colour.ink"]);
    u.uPaper.value.set(v["colour.paper"]);
    u.uGround.value.set(v["colour.ground"]);
    scene.background.set(v["colour.ground"]);
    u.uDotDensity.value = density();
    u.uDotRadius.value = v["stipple.dot"];
    u.uDashLength.value = v["stipple.dash"];
    u.uShadowGamma.value = v["light.shade"];
    setLight();
  }

  let W = 1, H = 1, pxPerUnit = 375;
  const density = () => v["stipple.density"] * Math.max(0.5, Math.min(1.25, pxPerUnit / 375));
  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    // fit the object on the short side, so a phone sees all of it
    const aspect = W / H;
    const short = aspect < 1 ? 1 : ORTHO_SIZE;
    const hw = short * Math.max(aspect, 1), hh = short * Math.max(1, 1 / aspect);
    // the dots keep about the size they have on the page's own full window
    // (375px a unit) rather than turning to grain on a small stage
    pxPerUnit = H / (2 * hh);
    material.uniforms.uDotDensity.value = density();
    camera.left = -hw;
    camera.right = hw;
    camera.top = hh;
    camera.bottom = -hh;
    camera.updateProjectionMatrix();
  }

  function draw() {
    renderer.render(scene, camera);
  }

  let raf = 0, last = 0;
  let onScreen = true, tabVisible = !document.hidden;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    if (!dragging && clock >= resumeAt && v["motion.spin"] > 0) {
      q.setFromAxisAngle(yAxis, v["motion.spin"] * dt);
      pivot.quaternion.premultiply(q);
    }
    if (showing) tick(dt);
    draw();
  }
  function sync() {
    const run = !still && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const ro = new ResizeObserver(() => {
    resize();
    draw();
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

  paint();
  resize();
  want(wantName());
  // the rest of the tour arrives in the background
  if (!still) load(TOUR[1]).catch(() => {});
  sync();

  return {
    update(values, path) {
      Object.assign(v, values);
      paint();
      if (path == null || path === "object") {
        if (v.object === "In turn") {
          tourAt = Math.max(0, TOUR.indexOf(showing));
          if (phase === "hold") phaseT = 0;
        }
        want(wantName());
      }
      draw();
    },
    action() {},
    destroy() {
      aborter.abort();
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      for (const g of geometries.values()) g.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
