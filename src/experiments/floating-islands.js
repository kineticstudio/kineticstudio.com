/* Islands.

   Overland's islands, round one (clients/overland/prototypes/04-Islands-R1,
   the Aug 6 port of the topo sandbox into their site): three square plates
   of banded terrain floating in the dark, set on an isometric lattice, each
   with a skirt and the vehicle model driving it on autopilot, the ground
   scrolling under it as it goes. The terrain is a winding canyon carved
   along each vehicle's course, so it threads the low ground instead of
   wandering. Round each vehicle the perception view: a white box with
   corner cubes, the yellow committed route ahead, the dashed history
   behind, and the lidar, a polar grid of dots that spins and radiates out,
   swelling with height, coloured by elevation, flaring as the scanner head
   passes. On the site the scroll pulled the plates apart and dived the
   camera into the middle one; here the camera glides between the two on
   its own. Click a plate to raise its ground (with a modifier, to lower it).

   Ported from the section's own code (js/island-3d.js): the plates and
   their shader banding, the canyon, the autopilot with its course hold and
   heading limit, the suspension, the flattened sun shadow, the route and
   trail ribbons, the lidar, the lattice, the camera and the sculpting. Left
   out: the telemetry panel over the middle vehicle (its readouts and
   status words), the arrow key driving, and the scroll. */

import * as THREE from "three";

export const params = {
  terrain: {
    bands: [21, 3, 24, 1],
    height: [80, 20, 160, 5],
    canyon: [0.45, 0, 1, 0.05],
  },
  lidar: {
    dots: [2350, 100, 3000, 50],
    colour: { type: "toggle", labels: ["One colour", "Elevation"], default: true },
  },
  drive: { speed: [105, 0, 340, 5] },
  view: { camera: { type: "select", options: ["Glide", "Wide", "Close"] } },
  colour: {
    ground: "#0a0a08",
    low: "#e9e4d2",
    high: "#2d2114",
  },
  newTerrain: { type: "action", label: "New terrain" },
};

// The site's root, from <link rel="site-root">, so this also works framed from a folder
const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const MODEL_URL = new URL("experiments/floating-islands/vehicle.glb", ROOT).href;

/* the section's defaults, as Hunter dialled them in (Aug 2) */
const CFG0 = {
  dots: 2350, fieldR: 210, spin: 0.12, radiate: 0.23, dotSize: 0.55,
  dotGain: 5.5, dotColor: "#e4f809", dotOpacity: 1, autopilot: true, radiateOut: true,
  linkElev: 26, linkWidth: 0.5, linkGain: 0, linkOpacity: 0.1, glowFloor: 1, height: 80, unit: 146,
  vehColor: "#9d8448", tireColor: "#141414", vehBright: 2.1, shadow: 1,
  gridDiv: 7, spread: 1.3, scrollZoom: 0.71, camHi: 3200, camLo: 400,
  terrBands: 21, terrScale: 0.7, colorLow: "#e9e4d2", colorHigh: "#2d2114", skirt: "#57503c",
  vehSpeed: 105,
  axisPull: 1.4, maxDev: 38, dotRainbow: true,
  boxOn: true, boxColor: "#f2eee6", boxPad: 1.2, boxOpacity: 0.9, boxH: 1, boxCube: 4,
  pathOn: true, pathLen: 350, pathColor: "#e4f809", pathW: 2, pathDash: 0, pathGap: 10, pathFlow: 40,
  trailOn: true, trailColor: "#ffffff", trailW: 2, trailDash: 1, trailGap: 11, trailFlow: 0,
  canyonOn: true, canyonMix: 0.45, canyonW: 12, canyonDepth: 0.7, canyonWall: 0.16,
  canyonRough: 5, meanderAmp: 16, meander: 1.5,
};
const AWAY = Math.PI / 4 + Math.PI; // straight away from the camera azimuth (the chase view)
const PLATE = 900, N = 112, CELL = PLATE / (N - 1), UNIT = 58;
const RAMP = ["#e9e4d2", "#d8cfae", "#b9b48c", "#9aa07b", "#8a795a", "#6b5638", "#4a3722", "#2d2114"];
const BASE_Y = -46;
const PATH_SEGS = 22, TRAIL_N = 46, LINE_QUADS = 140;
// the camera's two ends: the site at rest (three islands touching) and scrolled through (dived into the middle one)
const VIEW_LO = 0, VIEW_HI = 0.926, GLIDE_S = 26;
// how far the scene sits below the middle, in world units, at rest and dived
const LIFT_LO = 290, LIFT_HI = 90;

function mulberry32(s) {
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(s) {
  const rand = mulberry32(s);
  const perm = new Uint8Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rand();
  }
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const lattice = (x, y) => vals[perm[perm[x & 255] + (y & 255)]];
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const a = lattice(xi, yi), b = lattice(xi + 1, yi), c = lattice(xi, yi + 1), d = lattice(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const deltaKey = (cx, cz) => cx * 1048576 + cz; // the sandbox's sculpt key

/* dashed ribbon writer: walks a polyline's arc length emitting dash quads;
   phase slides the pattern along the line */
function dashRibbon(geo, pts, count, w, dash, gap, phase) {
  const arr = geo.attributes.position.array;
  let q = 0;
  const solid = dash <= 0 || gap <= 0;
  const period = dash + gap;
  let sPos = solid ? 0 : ((-phase % period) + period) % period;
  const emit = (ax, ay, az, bx, by, bz, px, pz) => {
    const o = q * 18;
    arr[o] = ax - px; arr[o + 1] = ay; arr[o + 2] = az - pz;
    arr[o + 3] = bx - px; arr[o + 4] = by; arr[o + 5] = bz - pz;
    arr[o + 6] = bx + px; arr[o + 7] = by; arr[o + 8] = bz + pz;
    arr[o + 9] = ax - px; arr[o + 10] = ay; arr[o + 11] = az - pz;
    arr[o + 12] = bx + px; arr[o + 13] = by; arr[o + 14] = bz + pz;
    arr[o + 15] = ax + px; arr[o + 16] = ay; arr[o + 17] = az + pz;
    q++;
  };
  for (let i = 0; i + 1 < count && q < LINE_QUADS; i++) {
    const ax = pts[i * 3], ay = pts[i * 3 + 1], az = pts[i * 3 + 2];
    const bx = pts[(i + 1) * 3], by = pts[(i + 1) * 3 + 1], bz = pts[(i + 1) * 3 + 2];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const segLen = Math.hypot(dx, dz) || 1e-4;
    const px = (-dz / segLen) * w / 2, pz = (dx / segLen) * w / 2;
    if (solid) {
      emit(ax, ay, az, bx, by, bz, px, pz);
      continue;
    }
    let t0 = 0;
    while (t0 < segLen && q < LINE_QUADS) {
      const inDash = sPos < dash;
      // always forward: a float-absorbed remainder once spun forever
      const stepLen = Math.max(inDash ? dash - sPos : period - sPos, 1e-3);
      const t1 = Math.min(segLen, t0 + stepLen);
      if (inDash && t1 > t0) {
        const f0 = t0 / segLen, f1 = t1 / segLen;
        emit(ax + dx * f0, ay + dy * f0, az + dz * f0, ax + dx * f1, ay + dy * f1, az + dz * f1, px, pz);
      }
      sPos = (sPos + (t1 - t0)) % period;
      t0 = t1;
    }
  }
  geo.setDrawRange(0, q * 6);
  geo.attributes.position.needsUpdate = true;
}

/* The vehicle is one plain glTF binary (one mesh, one primitive, float positions and
   normals, 32 bit indices, no transforms), so it is read here directly rather than
   through the full loader. */
async function loadVehicle(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`vehicle ${r.status}`);
  const buf = await r.arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a glb");
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const read = (i, Type, size) => {
    const acc = json.accessors[i], view = json.bufferViews[acc.bufferView];
    const off = binStart + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    return new Type(buf.slice(off, off + acc.count * size * Type.BYTES_PER_ELEMENT));
  };
  const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const TYPES = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
  const group = new THREE.Group();
  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives) {
      const geo = new THREE.BufferGeometry();
      for (const [name, key] of [["POSITION", "position"], ["NORMAL", "normal"]]) {
        const i = prim.attributes[name];
        if (i == null) continue;
        const acc = json.accessors[i];
        geo.setAttribute(key, new THREE.BufferAttribute(read(i, TYPES[acc.componentType], SIZES[acc.type]), SIZES[acc.type]));
      }
      if (prim.indices != null) geo.setIndex(new THREE.BufferAttribute(read(prim.indices, TYPES[json.accessors[prim.indices].componentType], 1), 1));
      group.add(new THREE.Mesh(geo));
    }
  }
  return group;
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const CFG = { ...CFG0 };
  const readDials = () => {
    CFG.terrBands = v["terrain.bands"];
    CFG.height = v["terrain.height"];
    CFG.canyonMix = v["terrain.canyon"];
    CFG.dots = v["lidar.dots"];
    CFG.dotRainbow = v["lidar.colour"];
    CFG.vehSpeed = v["drive.speed"];
    CFG.colorLow = v["colour.low"];
    CFG.colorHigh = v["colour.high"];
  };
  readDials();

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:crosshair";
  host.append(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    canvas.remove();
    const note = document.createElement("p");
    note.textContent = "This piece needs WebGL, which this browser has turned off.";
    note.style.cssText = "position:absolute;inset:auto 0 50% 0;margin:0;text-align:center;color:#e9e4d2;opacity:.7;";
    host.append(note);
    return { update() {}, action() {}, destroy: () => note.remove() };
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(v["colour.ground"]);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -9000, 9000);
  scene.add(new THREE.AmbientLight(0xfff4e0, 2.6));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(-500, 800, 300);
  scene.add(sun);

  /* crisp elevation bands in the shader, the ramp stepped from the eight stop camo ramp */
  const islands = [];
  let rampTex = null;
  function buildRampTex() {
    const stops = RAMP.slice();
    stops[0] = CFG.colorLow;
    stops[stops.length - 1] = CFG.colorHigh;
    const n = Math.max(2, Math.round(CFG.terrBands));
    const data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * (stops.length - 1);
      const lo = Math.floor(t), hi = Math.min(stops.length - 1, lo + 1), f = t - lo;
      const a = hexRgb(stops[lo]), b = hexRgb(stops[hi]);
      for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(a[k] + (b[k] - a[k]) * f);
      data[i * 4 + 3] = 255;
    }
    const old = rampTex;
    rampTex = new THREE.DataTexture(data, n, 1);
    rampTex.colorSpace = THREE.SRGBColorSpace;
    rampTex.magFilter = rampTex.minFilter = THREE.NearestFilter;
    rampTex.needsUpdate = true;
    for (const isl of islands) isl.plate.material.uniforms.ramp.value = rampTex;
    old?.dispose();
  }
  buildRampTex();
  const bandMaterial = () =>
    new THREE.ShaderMaterial({
      uniforms: { ramp: { value: rampTex }, uH: { value: CFG.height } },
      vertexShader: `
        varying float vH;
        void main() {
          vH = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D ramp;
        uniform float uH;
        varying float vH;
        void main() {
          float e = clamp(vH / uH, 0.0, 0.999);
          gl_FragColor = vec4(texture2D(ramp, vec2(e, 0.5)).rgb, 1.0);
        }`,
    });

  /* the vehicle: one merged mesh, two-tone by vertex colour (tyres picked out by position) */
  const vehGeos = [];
  const vehMats = [];
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: CFG.shadow, depthWrite: true, depthFunc: THREE.LessDepth });
  function applyVehColor() {
    const body = new THREE.Color(CFG.vehColor).multiplyScalar(CFG.vehBright);
    const tire = new THREE.Color(CFG.tireColor).multiplyScalar(CFG.vehBright);
    for (const g of vehGeos) {
      const pos = g.attributes.position, col = g.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const isTire = Math.abs(x) > 0.45 && y < 0.95 && Math.hypot(y - 0.41, Math.abs(z) - 1.486) < 0.5;
        const c = isTire ? tire : body;
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    }
  }
  let modelWrap = null;
  function dressVehicle(isl) {
    if (!modelWrap || isl.dressed) return;
    isl.dressed = true;
    isl.veh.add(modelWrap.clone(true));
    // the hard sun shadow: the silhouette flattened onto the ground and sheared along the sun
    const sh = modelWrap.clone(true);
    sh.traverse((n) => {
      if (n.isMesh) {
        n.material = shadowMat;
        n.renderOrder = 2;
      }
    });
    isl.shInner.add(sh);
  }

  /* ---- an island: a plate, its skirt, a vehicle, its chrome, its lidar ---- */
  const cornerGeo = new THREE.BoxGeometry(1, 1, 1);
  const cornerMat = new THREE.MeshBasicMaterial({ color: CFG.boxColor, transparent: true, opacity: CFG.boxOpacity });
  const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  function makeIsland(seedOffset) {
    const isl = {};
    isl.noise = makeNoise(((Math.random() * 1e9) | 0) + seedOffset);
    const elev = new Float32Array(N * N);
    const sculpt = new Map();
    // the chase view: every vehicle drives away from the camera, so the canyon carves to match
    const st = { ox: 0, oz: 0, heading: AWAY, y: 0, pitch: 0, roll: 0 };
    st.axis = st.heading;

    // elevation is a pure function of world cells (grid plus scroll offset)
    function worldElev(cx, cz) {
      const noise = isl.noise;
      let amp = 1, freq = 0.03 * CFG.terrScale, sum = 0, norm = 0;
      for (let o = 0; o < 5; o++) {
        sum += amp * noise(cx * freq, cz * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      let e = 0.5 + (sum / norm - 0.48) * 1.9;
      if (CFG.canyonOn && CFG.canyonMix > 0) {
        // the canyon's frame: u along the course, v across it; the floor meanders on a slow noise
        const ax = Math.sin(st.axis), az = Math.cos(st.axis);
        const u = cx * ax + cz * az;
        const vv = cx * az - cz * ax;
        const v0 = (N / 2) * az - (N / 2) * ax;
        const wander = (noise(u * CFG.meander * 0.01, 42.7) - 0.5) * 2 * CFG.meanderAmp;
        const Wc = CFG.canyonW;
        const dC0 = Math.abs(vv - v0 - wander);
        if (dC0 < Wc * 3.5) {
          // a rough edge, so the canyon wobbles like every other contour
          const rough = (noise(cx * 0.12 + 7.7, cz * 0.12 + 3.3) - 0.5) * 2 * CFG.canyonRough;
          const dC = Math.max(0, dC0 + rough);
          const floorMask = Math.exp(-(dC * dC) / (Wc * Wc));
          let eC = e + (0.1 - e) * floorMask * CFG.canyonDepth;
          if (dC > Wc) {
            const wallT = (dC - Wc * 1.5) / (Wc * 0.8);
            eC += Math.exp(-wallT * wallT) * CFG.canyonWall;
          }
          e += (eC - e) * CFG.canyonMix;
        }
      }
      const d = sculpt.get(deltaKey(Math.round(cx), Math.round(cz)));
      if (d) e += d;
      return e < 0 ? 0 : e > 1 ? 1 : e;
    }
    function fillElev() {
      const ox = st.ox / CELL, oz = st.oz / CELL;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) elev[y * N + x] = worldElev(x + ox, y + oz);
    }
    fillElev();
    const elevAt = (fx, fy) => {
      fx = Math.max(0, Math.min(N - 1.001, fx));
      fy = Math.max(0, Math.min(N - 1.001, fy));
      const xi = fx | 0, yi = fy | 0, xf = fx - xi, yf = fy - yi;
      const a = elev[yi * N + xi], b = elev[yi * N + xi + 1];
      const c = elev[(yi + 1) * N + xi], d = elev[(yi + 1) * N + xi + 1];
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
    const hAt = (x, z) => elevAt((x + PLATE / 2) / CELL, (z + PLATE / 2) / CELL) * CFG.height;

    const group = new THREE.Group();
    scene.add(group);
    const SEGS = N - 1;
    const geo = new THREE.PlaneGeometry(PLATE, PLATE, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);
    const plate = new THREE.Mesh(geo, bandMaterial());
    group.add(plate);
    const displace = () => {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const ix = i % (SEGS + 1), iy = (i / (SEGS + 1)) | 0;
        pos.setY(i, elev[iy * N + ix] * CFG.height);
      }
      pos.needsUpdate = true;
      geo.computeBoundingSphere();
    };
    displace();

    // the skirt, a ribbon round the plate's edge down to the base
    const edge = [];
    for (let x = 0; x < N; x++) edge.push([x, 0]);
    for (let y = 1; y < N; y++) edge.push([N - 1, y]);
    for (let x = N - 2; x >= 0; x--) edge.push([x, N - 1]);
    for (let y = N - 2; y >= 1; y--) edge.push([0, y]);
    edge.push(edge[0]);
    const sv = new Float32Array(edge.length * 6);
    const skirtGeo = new THREE.BufferGeometry();
    skirtGeo.setAttribute("position", new THREE.BufferAttribute(sv, 3));
    const idx = [];
    for (let i = 0; i < edge.length - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    skirtGeo.setIndex(idx);
    const fillSkirt = () => {
      edge.forEach(([ex, ey], i) => {
        const wx = ex * CELL - PLATE / 2, wz = ey * CELL - PLATE / 2;
        const h = elev[ey * N + ex] * CFG.height;
        sv.set([wx, h, wz, wx, BASE_Y, wz], i * 6);
      });
      skirtGeo.attributes.position.needsUpdate = true;
      skirtGeo.computeBoundingSphere();
    };
    fillSkirt();
    const skirtMat = new THREE.MeshBasicMaterial({ color: CFG.skirt, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(skirtGeo, skirtMat));

    // the vehicle rig: the model, and a shadow that counter-rotates so the sun stays put
    const veh = new THREE.Group();
    veh.rotation.order = "YXZ";
    const shRig = new THREE.Group();
    shRig.position.y = 1.0;
    const shear = new THREE.Group();
    shear.matrixAutoUpdate = false;
    shear.matrix.set(1, 0.625, 0, 0, 0, 0.001, 0, 0, 0, -0.375, 1, 0, 0, 0, 0, 1);
    const shInner = new THREE.Group();
    shear.add(shInner);
    shRig.add(shear);
    veh.add(shRig);
    group.add(veh);

    // the perception chrome: the box with its corner cubes, the route ahead and the trail behind
    const box = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: CFG.boxColor, transparent: true, opacity: CFG.boxOpacity }));
    for (let ci = 0; ci < 8; ci++) {
      const c = new THREE.Mesh(cornerGeo, cornerMat);
      c.position.set(ci & 1 ? 0.5 : -0.5, ci & 2 ? 0.5 : -0.5, ci & 4 ? 0.5 : -0.5);
      box.add(c);
    }
    group.add(box);
    const ribbon = (color, opacity) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LINE_QUADS * 18), 3));
      g.setDrawRange(0, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
      m.frustumCulled = false;
      group.add(m);
      return m;
    };
    const path = ribbon(CFG.pathColor, 0.95);
    const trail = ribbon(CFG.trailColor, 0.85);

    Object.assign(isl, {
      group, plate, geo, elev, worldElev, fillElev, elevAt, hAt, displace, fillSkirt, skirtGeo, skirtMat,
      veh, shRig, shInner, st, sculpt, box, path, pathGeo: path.geometry, trail, trailGeo: trail.geometry,
      hist: new Float32Array(TRAIL_N * 2), histN: 0, histAcc: 0, histD: new Float32Array(TRAIL_N), histRun: 0,
      vx: 0, vz: 0, pathPhase: 0, trailPhase: 0,
      lidar: null, lidarLines: null, lidarPhase: Math.random() * 6.28, flowPhase: Math.random(), sweepPhase: Math.random() * 6.28,
      rings: 0, spokes: 0, heights: null, dressed: false,
    });
    buildLidar(isl);
    dressVehicle(isl);
    islands.push(isl);
  }
  const refill = (isl) => {
    isl.fillElev();
    isl.displace();
    isl.fillSkirt();
  };

  /* ---- lidar: a polar dot grid and links over the high ground ---- */
  function buildLidar(isl) {
    if (isl.lidar) {
      isl.lidar.geometry.dispose();
      isl.lidar.material.dispose();
      isl.group.remove(isl.lidar);
      isl.lidarLines.geometry.dispose();
      isl.lidarLines.material.dispose();
      isl.group.remove(isl.lidarLines);
    }
    const rings = Math.max(2, Math.round(Math.sqrt(CFG.dots / 2)));
    const spokes = Math.max(3, Math.round(CFG.dots / rings));
    const n = rings * spokes;
    isl.rings = rings;
    isl.spokes = spokes;
    isl.heights = new Float32Array(n);
    // flat quads lying on the terrain (points always face the camera, which read as standing tiles)
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    isl.lidar = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: CFG.dotOpacity, depthWrite: false }), n);
    isl.lidar.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    isl.lidar.setColorAt(0, new THREE.Color(1, 1, 1));
    isl.lidar.frustumCulled = false;
    isl.group.add(isl.lidar);
    const maxSegs = spokes * (rings - 1) + spokes * rings;
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxSegs * 18), 3));
    lineGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(maxSegs * 18), 3));
    lineGeo.setDrawRange(0, 0);
    isl.lidarLines = new THREE.Mesh(
      lineGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    isl.lidarLines.frustumCulled = false;
    isl.group.add(isl.lidarLines);
  }

  let lidarPos = new Float32Array(0), glowS = new Float32Array(0);
  const m4 = new THREE.Matrix4(), dotCol = new THREE.Color(), baseCol = new THREE.Color(), linkCol = new THREE.Color();
  function updateLidar(isl, dt) {
    const { rings, spokes, heights: hs } = isl;
    if (lidarPos.length < rings * spokes * 3) lidarPos = new Float32Array(rings * spokes * 3);
    if (glowS.length < spokes) glowS = new Float32Array(spokes);
    isl.lidarPhase += dt * CFG.spin * Math.PI * 2;
    isl.sweepPhase += dt * 0.35 * Math.PI * 2; // the scanner head, about a turn every three seconds
    if (CFG.radiateOut) isl.flowPhase = (isl.flowPhase + dt * CFG.radiate) % 1;
    isl.lidar.material.opacity = CFG.dotOpacity;
    isl.lidarLines.material.opacity = CFG.linkOpacity;
    const arr = lidarPos;
    baseCol.set(CFG.dotColor);
    const spokeStep = (Math.PI * 2) / spokes;
    const vx = isl.vx, vz = isl.vz;
    // a radar sweep: dots flare as the head passes, then decay behind it
    for (let s = 0; s < spokes; s++) {
      const a = isl.lidarPhase + s * spokeStep;
      const behind = (((isl.sweepPhase - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      glowS[s] = CFG.glowFloor + (1 - CFG.glowFloor) * Math.exp(-behind * 1.3);
    }
    for (let j = 0; j < rings; j++) {
      let f = (j + 1) / rings, fade = 1;
      if (CFG.radiateOut) {
        f = (f + isl.flowPhase) % 1;
        fade = f < 0.15 ? f / 0.15 : f > 0.85 ? (1 - f) / 0.15 : 1;
      }
      const r = CFG.fieldR * f;
      for (let s = 0; s < spokes; s++) {
        const i = j * spokes + s;
        const a = isl.lidarPhase + s * spokeStep;
        const x = vx + Math.cos(a) * r, z = vz + Math.sin(a) * r;
        const h = isl.hAt(x, z);
        hs[i] = h;
        arr[i * 3] = x;
        arr[i * 3 + 1] = h + 2;
        arr[i * 3 + 2] = z;
        const e = Math.max(0, Math.min(1, h / CFG.height));
        const sz = Math.max(0.001, CFG.dotSize * (0.4 + e * CFG.dotGain) * fade * 2.2);
        m4.makeScale(sz, 1, sz);
        m4.setPosition(x, h + 2, z);
        isl.lidar.setMatrixAt(i, m4);
        // the perception cloud: low ground blue, then green, yellow, red
        if (CFG.dotRainbow) dotCol.setHSL(0.66 - 0.66 * e, 0.95, 0.55).multiplyScalar(0.45 + 0.55 * glowS[s]);
        else dotCol.copy(baseCol).multiplyScalar(glowS[s]);
        isl.lidar.setColorAt(i, dotCol);
      }
    }
    isl.lidar.instanceMatrix.needsUpdate = true;
    if (isl.lidar.instanceColor) isl.lidar.instanceColor.needsUpdate = true;

    // link neighbouring dots that both sit on high ground
    const la = isl.lidarLines.geometry.attributes.position.array;
    const lc = isl.lidarLines.geometry.attributes.color.array;
    const hThr = (CFG.linkElev / 100) * CFG.height;
    const hSpan = Math.max(1, CFG.height - hThr);
    linkCol.set(CFG.dotColor);
    let c = 0;
    const pushSeg = (i1, i2) => {
      const x1 = arr[i1 * 3], y1 = arr[i1 * 3 + 1], z1 = arr[i1 * 3 + 2];
      const x2 = arr[i2 * 3], y2 = arr[i2 * 3 + 1], z2 = arr[i2 * 3 + 2];
      if (CFG.dotRainbow) linkCol.setHSL(0.66 - 0.66 * Math.max(0, Math.min(1, (hs[i1] + hs[i2]) / 2 / CFG.height)), 0.95, 0.55);
      const t = Math.min(1, ((hs[i1] + hs[i2]) / 2 - hThr) / hSpan);
      const glow = CFG.glowFloor + (1 - CFG.glowFloor) * t;
      const w = (CFG.linkWidth + CFG.linkGain * t) / 2;
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz) || 1;
      const px = (-dz / len) * w, pz = (dx / len) * w;
      const o = c * 18;
      la[o] = x1 - px; la[o + 1] = y1; la[o + 2] = z1 - pz;
      la[o + 3] = x2 - px; la[o + 4] = y2; la[o + 5] = z2 - pz;
      la[o + 6] = x2 + px; la[o + 7] = y2; la[o + 8] = z2 + pz;
      la[o + 9] = x1 - px; la[o + 10] = y1; la[o + 11] = z1 - pz;
      la[o + 12] = x2 + px; la[o + 13] = y2; la[o + 14] = z2 + pz;
      la[o + 15] = x1 + px; la[o + 16] = y1; la[o + 17] = z1 + pz;
      for (let k = 0; k < 6; k++) {
        lc[o + k * 3] = linkCol.r * glow;
        lc[o + k * 3 + 1] = linkCol.g * glow;
        lc[o + k * 3 + 2] = linkCol.b * glow;
      }
      c++;
    };
    for (let j = 0; j < rings; j++) {
      for (let s = 0; s < spokes; s++) {
        const i = j * spokes + s;
        if (hs[i] < hThr) continue;
        const iNext = j * spokes + ((s + 1) % spokes);
        if (hs[iNext] >= hThr) pushSeg(i, iNext);
        if (j < rings - 1) {
          const iOut = (j + 1) * spokes + s;
          if (hs[iOut] >= hThr) pushSeg(i, iOut);
        }
      }
    }
    isl.lidarLines.geometry.setDrawRange(0, c * 6);
    isl.lidarLines.geometry.attributes.position.needsUpdate = true;
    isl.lidarLines.geometry.attributes.color.needsUpdate = true;
  }

  /* ---- the vehicles ---- */
  const linePts = new Float32Array((PATH_SEGS + TRAIL_N + 2) * 3);
  function poseVehicle(isl, dt) {
    const s = isl.st;
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const HB = CFG.unit * 0.36, TR = CFG.unit * 0.23;
    const h = isl.hAt(isl.vx, isl.vz);
    const hF = isl.hAt(isl.vx + fx * HB, isl.vz + fz * HB), hB = isl.hAt(isl.vx - fx * HB, isl.vz - fz * HB);
    const hR = isl.hAt(isl.vx + fz * TR, isl.vz - fx * TR), hL = isl.hAt(isl.vx - fz * TR, isl.vz + fx * TR);
    const support = Math.max(h, (hF + hB) / 2, (hL + hR) / 2) + 1;
    const k = Math.min(1, dt * 6);
    s.y += (support - s.y) * k;
    s.pitch += (-Math.atan2(hF - hB, HB * 2) - s.pitch) * k;
    s.roll += (Math.atan2(hR - hL, TR * 2) - s.roll) * k;
    // no wheel ever sinks into the ground: lift the hull by the worst deficit, which reads as suspension
    const sr = Math.sin(s.roll), sp2 = Math.sin(s.pitch), cp2 = Math.cos(s.pitch);
    let lift = 0;
    for (let wi = 0; wi < 4; wi++) {
      const lx = wi & 1 ? TR : -TR, lz = wi & 2 ? HB : -HB;
      const wxp = isl.vx + lz * fx + lx * fz, wzp = isl.vz + lz * fz - lx * fx;
      const planeY = s.y + lx * sr * cp2 - lz * sp2;
      const deficit = isl.hAt(wxp, wzp) + 0.5 - planeY;
      if (deficit > lift) lift = deficit;
    }
    s.y += lift;
    isl.veh.position.set(isl.vx, s.y, isl.vz);
    isl.veh.rotation.set(s.pitch, s.heading, s.roll);
    isl.shRig.rotation.y = -s.heading;
    isl.shInner.rotation.y = s.heading;
    updatePerception(isl, dt);
  }

  function updatePerception(isl, dt) {
    const s = isl.st;
    const bw = CFG.unit * 0.62 * CFG.boxPad, bh = CFG.unit * 0.52 * CFG.boxPad * CFG.boxH, bl = CFG.unit * 1.06 * CFG.boxPad;
    isl.box.scale.set(bw, bh, bl);
    isl.box.position.set(isl.vx, s.y + CFG.unit * 0.27 * CFG.boxH, isl.vz);
    isl.box.rotation.y = s.heading;
    for (const c of isl.box.children) c.scale.set(CFG.boxCube / bw, CFG.boxCube / bh, CFG.boxCube / bl);

    // the committed route: the live steering integrated forward, cut at the rim
    isl.pathPhase += CFG.pathFlow * dt;
    const step = CFG.pathLen / PATH_SEGS;
    const rim = PLATE / 2 - CELL;
    let px = isl.vx, pz = isl.vz, hdg = s.heading, n = 1;
    linePts[0] = px;
    linePts[1] = isl.hAt(px, pz) + 3;
    linePts[2] = pz;
    for (let k = 0; k < PATH_SEGS; k++) {
      // steered the way the autopilot will: toward low ground, held to the course
      const probe = step * 2.2;
      const hL = isl.hAt(px + Math.sin(hdg + 0.5) * probe, pz + Math.cos(hdg + 0.5) * probe);
      const hR = isl.hAt(px + Math.sin(hdg - 0.5) * probe, pz + Math.cos(hdg - 0.5) * probe);
      let dh = (hR - hL) * 0.01;
      let axDev = s.axis - hdg;
      while (axDev > Math.PI) axDev -= Math.PI * 2;
      while (axDev < -Math.PI) axDev += Math.PI * 2;
      dh += axDev * 0.18;
      hdg += Math.max(-0.16, Math.min(0.16, dh));
      const nx = px + Math.sin(hdg) * step, nz = pz + Math.cos(hdg) * step;
      if (Math.abs(nx) > rim || Math.abs(nz) > rim) break;
      linePts[n * 3] = nx;
      linePts[n * 3 + 1] = isl.hAt(nx, nz) + 3;
      linePts[n * 3 + 2] = nz;
      n++;
      px = nx;
      pz = nz;
    }
    dashRibbon(isl.pathGeo, linePts, n, CFG.pathW, CFG.pathDash, CFG.pathGap, isl.pathPhase);

    // the history: past world offsets, drawn relative to the scrolled ground
    isl.trailPhase += CFG.trailFlow * dt;
    isl.histAcc += dt;
    if (isl.histAcc > 0.18) {
      isl.histAcc = 0;
      if (isl.histN >= TRAIL_N) {
        isl.hist.copyWithin(0, 2);
        isl.histD.copyWithin(0, 1);
        isl.histN = TRAIL_N - 1;
      }
      if (isl.histN > 0) isl.histRun += Math.hypot(s.ox - isl.hist[(isl.histN - 1) * 2], s.oz - isl.hist[(isl.histN - 1) * 2 + 1]);
      isl.hist[isl.histN * 2] = s.ox;
      isl.hist[isl.histN * 2 + 1] = s.oz;
      isl.histD[isl.histN] = isl.histRun;
      isl.histN++;
    }
    let m = 0, startDist = 0;
    for (let k = 0; k < isl.histN; k++) {
      const ax = isl.vx - (s.ox - isl.hist[k * 2]), az = isl.vz - (s.oz - isl.hist[k * 2 + 1]);
      if (Math.abs(ax) > rim || Math.abs(az) > rim) {
        m = 0;
        continue;
      }
      if (m === 0) startDist = isl.histD[k]; // so the dashes stay pinned to the ground as samples expire
      linePts[m * 3] = ax;
      linePts[m * 3 + 1] = isl.hAt(ax, az) + 3;
      linePts[m * 3 + 2] = az;
      m++;
    }
    dashRibbon(isl.trailGeo, linePts, m, CFG.trailW, CFG.trailDash, CFG.trailGap, isl.trailPhase - startDist);
  }

  /* lidar guided autopilot: probe headings, steer for the lowest ground ahead, scroll the ground under it */
  function autopilotDrive(isl, dt) {
    const s = isl.st;
    let spd = CFG.vehSpeed;
    s.travelT = (s.travelT || 0) + dt;
    if (s.travelT >= 2.5) {
      const moved = Math.hypot(s.ox - (s.refX ?? s.ox), s.oz - (s.refZ ?? s.oz));
      if (moved < 60 && (s.escapeT || 0) <= 0 && CFG.vehSpeed > 20) s.escapeT = 3; // boxed in: power straight out
      s.refX = s.ox;
      s.refZ = s.oz;
      s.travelT = 0;
    }
    if ((s.escapeT || 0) > 0) {
      s.escapeT -= dt;
      spd = CFG.vehSpeed * 0.85;
    } else {
      const D = CFG.fieldR;
      let best = 0, bestCost = Infinity;
      for (const off of [-0.9, -0.5, -0.22, 0, 0.22, 0.5, 0.9]) {
        const a = s.heading + off;
        const sx = Math.sin(a), sz = Math.cos(a);
        let cost = 0;
        for (const f of [0.45, 0.75, 1]) cost += isl.hAt(isl.vx + sx * D * f, isl.vz + sz * D * f);
        cost += Math.abs(off) * 2.5 * (CFG.height / 300);
        // the course hold, so it threads the terrain like a canyon run
        let axisOff = a - s.axis;
        while (axisOff > Math.PI) axisOff -= Math.PI * 2;
        while (axisOff < -Math.PI) axisOff += Math.PI * 2;
        cost += axisOff * axisOff * CFG.axisPull * 30;
        if (cost < bestCost) {
          bestCost = cost;
          best = off;
        }
      }
      s.heading += Math.max(-1, Math.min(1, best * 2)) * 1.3 * dt;
      spd = CFG.vehSpeed * (1 - 0.35 * Math.abs(best)); // slow into turns
    }
    // the heading may weave, but never far enough off the course to loop
    const lim = (CFG.maxDev * Math.PI) / 180;
    let dev = s.heading - s.axis;
    while (dev > Math.PI) dev -= Math.PI * 2;
    while (dev < -Math.PI) dev += Math.PI * 2;
    if (dev > lim) s.heading = s.axis + lim;
    else if (dev < -lim) s.heading = s.axis - lim;
    s.ox += Math.sin(s.heading) * spd * dt;
    s.oz += Math.cos(s.heading) * spd * dt;
    refill(isl);
  }

  makeIsland(11);
  makeIsland(22);
  makeIsland(33);

  /* ---- the lattice under them: the plates' own grid, edges on its lines ---- */
  let isoGrid = null;
  function buildIsoGrid() {
    if (isoGrid) {
      isoGrid.geometry.dispose();
      isoGrid.material.dispose();
      scene.remove(isoGrid);
    }
    const STEPS = 18, EXT = PLATE * STEPS;
    const step = PLATE / Math.max(1, Math.round(CFG.gridDiv));
    const pts = [];
    for (let p = PLATE / 2 - Math.ceil(EXT / step) * step; p <= EXT; p += step) {
      pts.push(-EXT, BASE_Y, p, EXT, BASE_Y, p);
      pts.push(p, BASE_Y, -EXT, p, BASE_Y, EXT);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    isoGrid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x26221b, transparent: true, opacity: 0.16 }));
    scene.add(isoGrid);
  }
  buildIsoGrid();

  /* ---- the camera: from the three islands at rest down into the middle one ---- */
  let W = 1, H = 1, viewFx = 0, glideT = 0;
  function viewTarget() {
    const cam = v["view.camera"];
    if (cam === "Wide") return VIEW_LO;
    if (cam === "Close") return VIEW_HI;
    if (reduced) return (VIEW_LO + VIEW_HI) / 2;
    return VIEW_LO + (VIEW_HI - VIEW_LO) * (0.5 - 0.5 * Math.cos((glideT / GLIDE_S) * Math.PI * 2));
  }
  function placeIslands() {
    const f = viewFx;
    const s = PLATE * (1 + CFG.spread * f);
    islands[0].group.position.set(-s, 0, 0);
    islands[1].group.position.set(0, 0, 0);
    islands[2].group.position.set(0, 0, -s);
    const y = CFG.camHi + (CFG.camLo - CFG.camHi) * f;
    camera.position.set(Math.sin(Math.PI / 4) * 1550, y, Math.cos(Math.PI / 4) * 1550);
    camera.lookAt(0, 0, 0);
    const aspect = W / Math.max(1, H);
    const Wb = 3600, Hb = Wb / aspect;
    const cy = LIFT_LO + (LIFT_HI - LIFT_LO) * f;
    const z = 1 - CFG.scrollZoom * f;
    camera.left = -(Wb / 2) * z;
    camera.right = (Wb / 2) * z;
    camera.top = cy + (Hb / 2) * z;
    camera.bottom = cy - (Hb / 2) * z;
    camera.updateProjectionMatrix();
  }

  /* ---- the loop ---- */
  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden, dead = false;
  function step(dt) {
    for (const isl of islands) {
      if (CFG.autopilot && dt > 0) autopilotDrive(isl, dt);
      poseVehicle(isl, dt);
      updateLidar(isl, dt);
    }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    glideT += dt;
    // a picked view is eased to; the glide is followed exactly
    const goal = viewTarget();
    viewFx += (goal - viewFx) * (v["view.camera"] === "Glide" ? 1 : 1 - Math.exp(-dt * 2.2));
    placeIslands();
    step(dt);
    renderer.render(scene, camera);
  }
  function sync() {
    const run = !reduced && onScreen && tabVisible && W > 1 && !dead;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  // a still: everything posed in place, the lidar a little way into its sweep
  function still() {
    viewFx = viewTarget();
    placeIslands();
    for (const isl of islands) {
      for (let i = 0; i < 40; i++) poseVehicle(isl, 0.05);
      updateLidar(isl, 0);
    }
    renderer.render(scene, camera);
  }
  const redraw = () => {
    if (reduced) still();
    else if (!raf) {
      placeIslands();
      step(0);
      renderer.render(scene, camera);
    }
  };

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    placeIslands();
    redraw();
  }

  /* ---- click a plate to raise its ground (with a modifier, lower it); it persists in world space ---- */
  let downX = 0, downY = 0;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onDown = (e) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const onUp = (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(islands.map((i) => i.plate), false);
    if (!hits.length) return;
    const isl = islands.find((i) => i.plate === hits[0].object);
    const local = isl.plate.worldToLocal(hits[0].point.clone());
    const gx = (local.x + PLATE / 2 + isl.st.ox) / CELL, gy = (local.z + PLATE / 2 + isl.st.oz) / CELL;
    const lower = e.metaKey || e.ctrlKey || e.altKey;
    const AMP = 0.09 * (lower ? -1 : 1), RAD = 7;
    for (let y = Math.ceil(gy - RAD); y <= gy + RAD; y++) {
      for (let x = Math.ceil(gx - RAD); x <= gx + RAD; x++) {
        const d = Math.hypot(x - gx, y - gy) / RAD;
        if (d > 1) continue;
        const key = deltaKey(x, y);
        isl.sculpt.set(key, (isl.sculpt.get(key) || 0) + AMP * ((Math.cos(d * Math.PI) + 1) / 2));
      }
    }
    refill(isl);
    redraw();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  const onLost = (e) => e.preventDefault();
  canvas.addEventListener("webglcontextlost", onLost);

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

  viewFx = viewTarget();
  resize();
  sync();

  /* the vehicle model, flat shaded, its long axis forward, sized to the section's unit */
  loadVehicle(MODEL_URL).then(
    (m) => {
      if (dead) return;
      const bb = new THREE.Box3().setFromObject(m);
      const size = bb.getSize(new THREE.Vector3());
      const ctr = bb.getCenter(new THREE.Vector3());
      m.position.sub(ctr);
      m.position.y += size.y / 2;
      const wrap = new THREE.Group();
      wrap.add(m);
      wrap.rotation.y = size.x >= size.z ? Math.PI / 2 : 0;
      wrap.scale.setScalar(UNIT / Math.max(size.x, size.z));
      m.traverse((n) => {
        if (!n.isMesh) return;
        const g = n.geometry;
        g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
        n.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
        vehMats.push(n.material);
        vehGeos.push(g); // the clones share the geometry, so one recolour tints all
      });
      applyVehColor();
      modelWrap = wrap;
      for (const isl of islands) dressVehicle(isl);
      redraw();
    },
    (e) => !dead && console.warn("floating-islands: the vehicle did not load", e),
  );

  return {
    update(values, path) {
      const was = { ...CFG };
      Object.assign(v, values);
      readDials();
      const changed = (k) => path == null || path === k;
      if (changed("lidar.dots") && CFG.dots !== was.dots) islands.forEach(buildLidar);
      if (changed("terrain.height")) {
        for (const isl of islands) {
          isl.plate.material.uniforms.uH.value = CFG.height;
          isl.displace();
          isl.fillSkirt();
        }
      }
      if (changed("terrain.bands") || changed("colour.low") || changed("colour.high")) buildRampTex();
      if (changed("terrain.canyon")) islands.forEach(refill);
      if (changed("colour.ground")) scene.background.set(v["colour.ground"]);
      redraw();
    },
    action(name) {
      if (name !== "newTerrain") return;
      for (const isl of islands) {
        isl.noise = makeNoise((Math.random() * 1e9) | 0);
        isl.sculpt.clear();
        refill(isl);
      }
      redraw();
    },
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const isl of islands) {
        isl.geo.dispose();
        isl.plate.material.dispose();
        isl.skirtGeo.dispose();
        isl.skirtMat.dispose();
        isl.box.material.dispose();
        for (const o of [isl.path, isl.trail, isl.lidar, isl.lidarLines]) {
          o.geometry.dispose();
          o.material.dispose();
        }
      }
      isoGrid?.geometry.dispose();
      isoGrid?.material.dispose();
      boxEdges.dispose();
      cornerGeo.dispose();
      cornerMat.dispose();
      shadowMat.dispose();
      for (const g of vehGeos) g.dispose();
      for (const m of vehMats) m.dispose();
      rampTex?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
