/* Topography.

   Overland's terrain sandbox in its 3D view (clients/overland/prototypes/
   02-Topo-3D, the July 18 topo sandbox): an endless procedural landscape of
   banded elevation, each band a flat terrace with exact 45 degree bevels
   between, painted with the topo map itself, on a square plate with a
   dark base block. A vehicle drives it on autopilot, steering for low
   ground, and its lidar sweeps the ground round it: rings of dots that
   radiate out and swell with height, linked into ribbons on the high
   ground. The world scrolls through the plate as it goes.

   Ported from the sandbox's own code: the seeded fBm world, the single pass
   marching squares, the bevel heights, the scrolling plate and texture, the
   autopilot and the lidar. The sandbox drives a humvee model (and a 60 MB
   one when it can); here it is a small vehicle built from boxes in the
   same tint, which at this size reads the same. Drag to turn the view. */

import * as THREE from "three";

export const params = {
  terrain: {
    style: { type: "select", options: ["Terrain", "Contour", "Camo", "Wire"] },
    bands: [12, 4, 24, 1],
    scale: [3, 1, 8, 0.1],
    height: [300, 60, 600, 10],
  },
  lidar: {
    count: [1000, 200, 3000, 50],
    radius: [280, 120, 600, 10],
  },
  drive: { speed: [190, 0, 420, 5] },
  colour: {
    ground: "#14100a",
    lidar: "#4a3917",
  },
  newTerrain: { type: "action", label: "New terrain" },
};

// the sandbox's four styles, as it has them
const STYLES = {
  Terrain: { ramp: ["#a2a184", "#8f8a64", "#a3906a", "#7c603f", "#54381f", "#33200f", "#160e07"] },
  Contour: { lines: { bg: "#0b0b0c", stroke: "#a3924f" } },
  Camo: { ramp: ["#8f8c7c", "#a09776", "#948a56", "#6f6844", "#4a5560", "#332f27", "#1f1c16"] },
  Wire: { grid: { bg: "#040404", line: "rgba(226,230,222,0.20)", major: "rgba(226,230,222,0.45)" } },
};

// the sandbox's defaults for everything without a dial (Hunter's, Oct 8)
const P0 = {
  cell: 14, octaves: 2, vehLen: 76, lidarDot: 1, lidarGain: 6.5, lidarLink: 45, linkWidth: 3.2, linkGain: 2.8,
  linkOpacity: 1, linkGlow: 1, lidarSpeed: 0.02, lidarFlow: 0.2, baseDepth: 148, skirt: "#252113", plate: 3250, gridStep: 2,
};
const FEATURE_SPAN = 1400; // reference span for the noise's feature scale
const MARGIN = 2; // cache cells round the plate
const CLIP_M = 3; // mesh cells hidden past each visible plate edge
const RECENTER_STEP = 2; // cells
const TEX_OV = 2; // cells of padding round a repainted texture strip

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);

function mulberry32(s) {
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rand(); }
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

/* ---- marching squares, every band in one pass (the sandbox's) ---- */

function simplifyLoop(pts) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  return out.length >= 3 ? out : pts;
}
function traceAllBands(G, n) {
  const { gw, gh, elev } = G;
  const bandArr = new Int16Array(gw * gh);
  for (let i = 0; i < bandArr.length; i++) bandArr[i] = Math.min(n - 1, (elev[i] * n) | 0);
  const bandAt = (x, y) => (x < 0 || y < 0 || x >= gw || y >= gh ? -1 : bandArr[y * gw + x]);
  const sampleG = (x, y) => (x < 0 || y < 0 || x >= gw || y >= gh ? -1 : elev[y * gw + x]);
  const segMaps = new Array(n).fill(null);
  const segKey = (x, y) => (x * 2 + 1) * 100000 + (y * 2 + 1);
  for (let y = -1; y < gh; y++) {
    for (let x = -1; x < gw; x++) {
      const btl = bandAt(x, y), btr = bandAt(x + 1, y), bbr = bandAt(x + 1, y + 1), bbl = bandAt(x, y + 1);
      let lo = Math.min(btl, btr, bbr, bbl);
      const hi = Math.max(btl, btr, bbr, bbl);
      if (hi <= lo && hi <= 0) continue;
      if (lo < 0) lo = -1;
      const Tx = x + 0.5, Ty = y, Rx = x + 1, Ry = y + 0.5, Bx = x + 0.5, By = y + 1, Lx = x, Ly = y + 0.5;
      for (let k = Math.max(1, lo + 1); k <= hi; k++) {
        const segs = segMaps[k] || (segMaps[k] = new Map());
        const add = (sx, sy, ex, ey) => segs.set(segKey(sx, sy), { sx, sy, ex, ey });
        const code = (btl >= k ? 8 : 0) | (btr >= k ? 4 : 0) | (bbr >= k ? 2 : 0) | (bbl >= k ? 1 : 0);
        switch (code) {
          case 8: add(Lx, Ly, Tx, Ty); break;
          case 4: add(Tx, Ty, Rx, Ry); break;
          case 2: add(Rx, Ry, Bx, By); break;
          case 1: add(Bx, By, Lx, Ly); break;
          case 7: add(Tx, Ty, Lx, Ly); break;
          case 11: add(Rx, Ry, Tx, Ty); break;
          case 13: add(Bx, By, Rx, Ry); break;
          case 14: add(Lx, Ly, Bx, By); break;
          case 12: add(Lx, Ly, Rx, Ry); break;
          case 3: add(Rx, Ry, Lx, Ly); break;
          case 9: add(Bx, By, Tx, Ty); break;
          case 6: add(Tx, Ty, Bx, By); break;
          case 10: {
            const inC = (sampleG(x, y) + sampleG(x + 1, y) + sampleG(x, y + 1) + sampleG(x + 1, y + 1)) / 4 >= k / n;
            if (inC) { add(Rx, Ry, Tx, Ty); add(Lx, Ly, Bx, By); } else { add(Lx, Ly, Tx, Ty); add(Rx, Ry, Bx, By); }
            break;
          }
          case 5: {
            const inC = (sampleG(x, y) + sampleG(x + 1, y) + sampleG(x, y + 1) + sampleG(x + 1, y + 1)) / 4 >= k / n;
            if (inC) { add(Tx, Ty, Lx, Ly); add(Bx, By, Rx, Ry); } else { add(Tx, Ty, Rx, Ry); add(Bx, By, Lx, Ly); }
            break;
          }
        }
      }
    }
  }
  const loopsPerBand = new Array(n).fill(null);
  for (let k = 1; k < n; k++) {
    const segs = segMaps[k];
    if (!segs) continue;
    const loops = [];
    while (segs.size) {
      let seg = segs.get(segs.keys().next().value);
      const pts = [];
      while (seg) {
        segs.delete(segKey(seg.sx, seg.sy));
        pts.push([seg.sx, seg.sy]);
        seg = segs.get(segKey(seg.ex, seg.ey));
      }
      if (pts.length >= 3) loops.push(simplifyLoop(pts));
    }
    loopsPerBand[k] = loops;
  }
  return loopsPerBand;
}
function loopsPath(loops) {
  const path = new Path2D();
  for (const pts of loops) {
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    path.closePath();
  }
  return path;
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const P = { ...P0 };
  const sync3 = () => {
    P.bands = v["terrain.bands"];
    P.scale = v["terrain.scale"];
    P.height3d = v["terrain.height"];
    P.lidarCount = v["lidar.count"];
    P.lidarRadius = v["lidar.radius"];
    P.speed = v["drive.speed"];
  };
  sync3();

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab";
  host.append(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    canvas.remove();
    const note = document.createElement("p");
    note.textContent = "This piece needs WebGL, which this browser has turned off.";
    note.style.cssText = "position:absolute;inset:auto 0 50% 0;margin:0;text-align:center;color:#a2a184;opacity:.7;";
    host.append(note);
    return { update() {}, action() {}, destroy: () => note.remove() };
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.enabled = true;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(v["colour.ground"]);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -6000, 6000);
  scene.add(new THREE.AmbientLight(0xfff4e0, 0.9));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
  sun.position.set(-600, 900, 500);
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0015;
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 1, far: 4000 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  /* ---- the vehicle: +z forward, yaw / pitch / roll in YXZ ---- */
  const vehicle = new THREE.Group();
  vehicle.rotation.order = "YXZ";
  scene.add(vehicle);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x9c7150 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
  const veh = new THREE.Group();
  const box = (w, h, l, x, y, z, m = bodyMat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    veh.add(mesh);
  };
  box(22, 7, 46, 0, 9.5, 0); // the hull
  box(21, 3.5, 15, 0, 14.6, 13.5); // the bonnet
  box(20, 8, 19, 0, 17, -3); // the cab
  box(21.5, 3, 13, 0, 14.4, -16); // the rear deck
  const tyre = new THREE.CylinderGeometry(5.6, 5.6, 4.2, 14).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-11.4, 14.5], [11.4, 14.5], [-11.4, -14.5], [11.4, -14.5]]) {
    const t = new THREE.Mesh(tyre, tyreMat);
    t.position.set(x, 5.6, z);
    t.castShadow = true;
    veh.add(t);
  }
  veh.scale.setScalar(P.vehLen / 46);
  vehicle.add(veh);

  const T = {
    terrain: null, overlay: null, skirt: null, texture: null, texCanvas: null, tpc: 10,
    lidar: null, lidarLines: null, lidarPhase: 0, flowPhase: 0, lidarRings: 0, lidarSpokes: 0, lidarN: 0, lidarHeights: null, ringF: null, ringFade: null,
    escapeT: 0, travelT: 0, travelRefX: 0, travelRefZ: 0,
    G3: null, zFine: null, PC: 0, sub: 1, FW: 0, plateW: 0, visW: P.plate, skirtN: 0,
    clipPlanes: [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)],
    speed: 0, heading: (3 * Math.PI) / 4, pitch: 0, roll: 0,
    camAz: Math.PI / 4, camEl: Math.atan(1 / Math.sqrt(2)), zoom: 1, camTarget: new THREE.Vector3(),
  };

  let seed = 20260718;
  let noise = makeNoise(seed);
  let palette = null;
  let lidarRGB = hexToRgb(v["colour.lidar"]).map((c) => c / 255);
  const style = () => STYLES[v["terrain.style"]] ?? STYLES.Terrain;

  function buildPalette() {
    const ramp = style().ramp;
    if (!ramp) { palette = null; return; }
    const n = P.bands;
    palette = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) * (ramp.length - 1);
      const lo = Math.floor(t), hi = Math.min(ramp.length - 1, lo + 1), f = t - lo;
      const a = hexToRgb(ramp[lo]), b = hexToRgb(ramp[hi]);
      const c = a.map((x, k) => Math.round(x + (b[k] - x) * f));
      palette.push(`rgb(${c[0]},${c[1]},${c[2]})`);
    }
  }
  buildPalette();

  /* ---- the world: a pure function of grid coordinates ---- */
  function worldElev(cx, cz) {
    const fq = (P.scale * P.cell) / FEATURE_SPAN;
    let amp = 1, freq = fq, sum = 0, norm = 0;
    for (let o = 0; o < P.octaves; o++) {
      sum += amp * noise(cx * freq, cz * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    const e = 0.5 + (sum / norm - 0.48) * 1.9;
    return e < 0 ? 0 : e > 1 ? 1 : e;
  }
  function fillGrid(G) {
    for (let y = 0; y < G.gh; y++) for (let x = 0; x < G.gw; x++) G.elev[y * G.gw + x] = worldElev(G.ox + x, G.oz + y);
  }
  function scrollGridFill(G, dcx, dcz) {
    const e = G.elev, w = G.gw, h = G.gh;
    if (dcx > 0) for (let r = 0; r < h; r++) e.copyWithin(r * w, r * w + dcx, r * w + w);
    if (dcx < 0) for (let r = 0; r < h; r++) e.copyWithin(r * w - dcx, r * w, r * w + w + dcx);
    if (dcz > 0) e.copyWithin(0, dcz * w, w * h);
    if (dcz < 0) e.copyWithin(-dcz * w, 0, (h + dcz) * w);
    const xa = dcx > 0 ? w - dcx : 0, xb = dcx > 0 ? w : -dcx, za = dcz > 0 ? h - dcz : 0, zb = dcz > 0 ? h : -dcz;
    if (dcx) for (let y = 0; y < h; y++) for (let x = xa; x < xb; x++) e[y * w + x] = worldElev(G.ox + x, G.oz + y);
    if (dcz) for (let y = za; y < zb; y++) for (let x = 0; x < w; x++) e[y * w + x] = worldElev(G.ox + x, G.oz + y);
  }
  function subGrid(G, x0, y0, w, h) {
    const elev = new Float32Array(w * h);
    for (let y = 0; y < h; y++) elev.set(G.elev.subarray((y0 + y) * G.gw + x0, (y0 + y) * G.gw + x0 + w), y * w);
    return { elev, gw: w, gh: h, ox: G.ox + x0, oz: G.oz + y0 };
  }
  function elevBilinear(G, gx, gy) {
    gx = Math.max(0, Math.min(G.gw - 1.001, gx));
    gy = Math.max(0, Math.min(G.gh - 1.001, gy));
    const xi = Math.floor(gx), yi = Math.floor(gy), xf = gx - xi, yf = gy - yi;
    const a = G.elev[yi * G.gw + xi], b = G.elev[yi * G.gw + xi + 1], c = G.elev[(yi + 1) * G.gw + xi], d = G.elev[(yi + 1) * G.gw + xi + 1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }

  /* ---- the topo map, painted into the plate's texture ---- */
  function renderTopo(c, scale, G, offx, offy, linePx, clip) {
    const st = style();
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (clip) { c.beginPath(); c.rect(clip.x, clip.y, clip.w, clip.h); c.clip(); }
    c.fillStyle = st.lines ? st.lines.bg : st.grid ? st.grid.bg : palette[0];
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.setTransform(scale, 0, 0, scale, -offx * scale, -offy * scale);
    if (st.grid) {
      // graph paper anchored to the world, warping over the relief
      const minor = Math.max(2, Math.round(P.gridStep)), major = minor * 4;
      const on = (x, m) => ((x % m) + m) % m === 0;
      for (const pass of [false, true]) {
        c.strokeStyle = pass ? st.grid.major : st.grid.line;
        c.lineWidth = ((pass ? 1.5 : 0.75) * (linePx / 1.6)) / scale;
        c.beginPath();
        for (let x = 0; x <= G.gw; x++) {
          if (!on(G.ox + x, minor) || on(G.ox + x, major) !== pass) continue;
          c.moveTo(x, -1);
          c.lineTo(x, G.gh + 1);
        }
        for (let y = 0; y <= G.gh; y++) {
          if (!on(G.oz + y, minor) || on(G.oz + y, major) !== pass) continue;
          c.moveTo(-1, y);
          c.lineTo(G.gw + 1, y);
        }
        c.stroke();
      }
      c.fillStyle = st.grid.major;
      const r = (2.4 * (linePx / 1.6)) / scale;
      for (let x = 0; x <= G.gw; x++) {
        if (!on(G.ox + x, major)) continue;
        for (let y = 0; y <= G.gh; y++) if (on(G.oz + y, major)) c.fillRect(x - r / 2, y - r / 2, r, r);
      }
      c.restore();
      return;
    }
    if (st.lines) {
      c.strokeStyle = st.lines.stroke;
      c.lineWidth = linePx / scale;
      c.lineJoin = "round";
      c.lineCap = "round";
    }
    const loopsPerBand = traceAllBands(G, P.bands);
    for (let k = 1; k < P.bands; k++) {
      const loops = loopsPerBand[k];
      if (!loops || !loops.length) continue;
      const path = loopsPath(loops);
      if (st.lines) c.stroke(path);
      else { c.fillStyle = palette[k]; c.fill(path, "evenodd"); }
    }
    c.restore();
  }
  const texLine = () => (1.6 * T.tpc) / P.cell; // the sandbox's 1.6 world px
  function update3DTexture() {
    if (!T.texture) return;
    renderTopo(T.texCanvas.getContext("2d"), T.tpc, T.G3, MARGIN, MARGIN, texLine());
    T.texture.needsUpdate = true;
  }
  function texStripX(c, dcx) {
    const px = T.tpc, G3 = T.G3;
    const w = Math.min(c.canvas.width, Math.abs(dcx) * px), sx = dcx > 0 ? c.canvas.width - w : 0;
    const gx0 = Math.max(0, Math.floor(sx / px) + MARGIN - TEX_OV), gx1 = Math.min(G3.gw - 1, Math.ceil((sx + w) / px) + MARGIN + TEX_OV);
    renderTopo(c, px, subGrid(G3, gx0, 0, gx1 - gx0 + 1, G3.gh), MARGIN - gx0, MARGIN, texLine(), { x: sx, y: 0, w, h: c.canvas.height });
  }
  function texStripZ(c, dcz) {
    const px = T.tpc, G3 = T.G3;
    const h = Math.min(c.canvas.height, Math.abs(dcz) * px), sy = dcz > 0 ? c.canvas.height - h : 0;
    const gz0 = Math.max(0, Math.floor(sy / px) + MARGIN - TEX_OV), gz1 = Math.min(G3.gh - 1, Math.ceil((sy + h) / px) + MARGIN + TEX_OV);
    renderTopo(c, px, subGrid(G3, 0, gz0, G3.gw, gz1 - gz0 + 1), MARGIN, MARGIN - gz0, texLine(), { x: 0, y: sy, w: c.canvas.width, h });
  }
  function scroll3DTexture(dcx, dcz) {
    const c = T.texCanvas.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(T.texCanvas, -dcx * T.tpc, -dcz * T.tpc);
    if (dcx) texStripX(c, dcx);
    if (dcz) texStripZ(c, dcz);
    T.texture.needsUpdate = true;
  }

  /* ---- heights: exact 45 degree bevels between the levels ---- */
  function bevelHeightAt(fx, fz) {
    const { G3, sub } = T;
    const gx = MARGIN + fx / sub, gy = MARGIN + fz / sub;
    const e = elevBilinear(G3, gx, gy);
    const dx = elevBilinear(G3, gx + 0.5, gy) - elevBilinear(G3, gx - 0.5, gy);
    const dy = elevBilinear(G3, gx, gy + 0.5) - elevBilinear(G3, gx, gy - 0.5);
    const grad = Math.max(1e-6, Math.hypot(dx, dy) / P.cell);
    const nB = P.bands, stepH = P.height3d / (nB - 1), rampW = Math.max(1, stepH);
    const half = 0.5 * grad * rampW;
    let kFull = ((e - half) * nB) | 0;
    kFull = Math.max(0, Math.min(nB - 1, kFull));
    let h = kFull * stepH;
    const kHi = Math.min(nB - 1, Math.ceil((e + half) * nB));
    for (let k = kFull + 1; k <= kHi; k++) {
      const f = 0.5 + (e - k / nB) / grad / rampW;
      h += stepH * (f < 0 ? 0 : f > 1 ? 1 : f);
    }
    return h;
  }
  function fillFineAll() {
    const { FW } = T;
    for (let fz = 0; fz < FW; fz++) for (let fx = 0; fx < FW; fx++) T.zFine[fz * FW + fx] = bevelHeightAt(fx, fz);
  }
  function scrollFine(dfx, dfz) {
    const z = T.zFine, FW = T.FW;
    if (dfx > 0) for (let r = 0; r < FW; r++) z.copyWithin(r * FW, r * FW + dfx, r * FW + FW);
    if (dfx < 0) for (let r = 0; r < FW; r++) z.copyWithin(r * FW - dfx, r * FW, r * FW + FW + dfx);
    if (dfz > 0) z.copyWithin(0, dfz * FW, FW * FW);
    if (dfz < 0) z.copyWithin(-dfz * FW, 0, (FW + dfz) * FW);
  }
  function fillFineStrips(dfx, dfz) {
    const { FW } = T;
    const xa = dfx > 0 ? FW - dfx : 0, xb = dfx > 0 ? FW : -dfx, za = dfz > 0 ? FW - dfz : 0, zb = dfz > 0 ? FW : -dfz;
    if (dfx) for (let fz = 0; fz < FW; fz++) for (let fx = xa; fx < xb; fx++) T.zFine[fz * FW + fx] = bevelHeightAt(fx, fz);
    if (dfz) for (let fz = za; fz < zb; fz++) for (let fx = 0; fx < FW; fx++) T.zFine[fz * FW + fx] = bevelHeightAt(fx, fz);
  }
  function writePositions() {
    const pos = T.terrain.geometry.attributes.position, arr = pos.array, z = T.zFine, n = T.FW * T.FW;
    for (let i = 0; i < n; i++) arr[i * 3 + 1] = z[i];
    pos.needsUpdate = true;
  }
  function sampleHeight(wx, wz) {
    const { G3, FW } = T;
    const fine = P.cell / T.sub;
    const gx = Math.max(0, Math.min(FW - 1.001, (wx - (G3.ox + MARGIN) * P.cell) / fine));
    const gy = Math.max(0, Math.min(FW - 1.001, (wz - (G3.oz + MARGIN) * P.cell) / fine));
    const xi = Math.floor(gx), yi = Math.floor(gy), xf = gx - xi, yf = gy - yi, z = T.zFine;
    const a = z[yi * FW + xi], b = z[yi * FW + xi + 1], c = z[(yi + 1) * FW + xi], d = z[(yi + 1) * FW + xi + 1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }

  /* ---- the plate ---- */
  function disposePlate() {
    if (T.skirt) { T.skirt.geometry.dispose(); T.skirt.material.dispose(); scene.remove(T.skirt); T.skirt = null; }
    if (T.terrain) {
      T.overlay.material.dispose();
      T.terrain.geometry.dispose();
      T.terrain.material.dispose();
      scene.remove(T.terrain);
      T.texture.dispose();
      T.terrain = T.overlay = null;
    }
  }
  function rebuild3DTerrain() {
    disposePlate();
    const PC = Math.max(40, Math.round(P.plate / P.cell)) + 2 * CLIP_M;
    // two fine cells per grid cell keep the bevels clean and the mesh light
    const sub = 2;
    T.PC = PC;
    T.sub = sub;
    T.FW = PC * sub + 1;
    T.plateW = PC * P.cell;
    T.visW = (PC - 2 * CLIP_M) * P.cell;
    // the texture: whole pixels per cell so a scrolled strip lands exactly
    T.tpc = W < 720 ? 8 : 10;
    const CW = PC + 1 + 2 * MARGIN;
    T.G3 = { elev: new Float32Array(CW * CW), gw: CW, gh: CW, ox: 0, oz: 0 };
    T.texCanvas = document.createElement("canvas");
    T.texCanvas.width = T.texCanvas.height = PC * T.tpc;
    T.texture = new THREE.CanvasTexture(T.texCanvas);
    T.texture.colorSpace = THREE.SRGBColorSpace;
    T.texture.generateMipmaps = false; // mipmaps blur the map and fringe the cliff tops
    T.texture.minFilter = THREE.LinearFilter;
    T.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const geo = new THREE.PlaneGeometry(T.plateW, T.plateW, T.FW - 1, T.FW - 1);
    geo.rotateX(-Math.PI / 2);
    T.terrain = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: T.texture, clippingPlanes: T.clipPlanes }));
    T.terrain.frustumCulled = false;
    T.terrain.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    scene.add(T.terrain);
    // the shadow catcher: invisible but for the vehicle's shadow
    T.overlay = new THREE.Mesh(geo, new THREE.ShadowMaterial({ opacity: 0.35, clippingPlanes: T.clipPlanes }));
    T.overlay.receiveShadow = true;
    T.overlay.frustumCulled = false;
    T.terrain.add(T.overlay);
    // the base block's wall, rebuilt along the moving plate edge every frame
    T.skirtN = Math.ceil(T.visW / (P.cell / sub));
    const skirtAttr = new THREE.BufferAttribute(new Float32Array(4 * T.skirtN * 18), 3);
    skirtAttr.setUsage(THREE.DynamicDrawUsage);
    const skirtGeo = new THREE.BufferGeometry();
    skirtGeo.setAttribute("position", skirtAttr);
    T.skirt = new THREE.Mesh(skirtGeo, new THREE.MeshBasicMaterial({ color: P.skirt, side: THREE.DoubleSide }));
    T.skirt.frustumCulled = false;
    scene.add(T.skirt);
    T.zFine = new Float32Array(T.FW * T.FW);
    recenter(true);
  }
  function recenter(force) {
    const { G3, PC } = T;
    const snap = P.cell * RECENTER_STEP;
    const ccx = Math.round(vehicle.position.x / snap) * RECENTER_STEP, ccz = Math.round(vehicle.position.z / snap) * RECENTER_STEP;
    const ox = ccx - (PC >> 1) - MARGIN, oz = ccz - (PC >> 1) - MARGIN;
    const dcx = ox - G3.ox, dcz = oz - G3.oz;
    if (!force && dcx === 0 && dcz === 0) return;
    G3.ox = ox;
    G3.oz = oz;
    const dfx = dcx * T.sub, dfz = dcz * T.sub;
    if (force || Math.abs(dfx) >= T.FW || Math.abs(dfz) >= T.FW) {
      fillGrid(G3);
      fillFineAll();
      writePositions();
      update3DTexture();
    } else {
      scrollGridFill(G3, dcx, dcz);
      scrollFine(dfx, dfz);
      fillFineStrips(dfx, dfz);
      writePositions();
      scroll3DTexture(dcx, dcz);
    }
    T.terrain.position.set((ox + MARGIN) * P.cell + T.plateW / 2, 0, (oz + MARGIN) * P.cell + T.plateW / 2);
  }
  // the visible edge follows the vehicle continuously: clip planes trim the
  // larger mesh and the wall is redrawn along them
  function updateRim() {
    const p = vehicle.position, half = T.visW / 2;
    T.clipPlanes[0].constant = -(p.x - half);
    T.clipPlanes[1].constant = p.x + half;
    T.clipPlanes[2].constant = -(p.z - half);
    T.clipPlanes[3].constant = p.z + half;
    const N = T.skirtN, bottom = -P.baseDepth, verts = T.skirt.geometry.attributes.position.array, LIP = 0.8;
    let o = 0;
    const put = (x, y, z) => { verts[o++] = x; verts[o++] = y; verts[o++] = z; };
    const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
    for (let side = 0; side < 4; side++) {
      const [ax, az] = corners[side], [bx, bz] = corners[(side + 1) % 4];
      const dx = (bx - ax) / N, dz = (bz - az) / N;
      let x1 = ax, z1 = az, h1 = sampleHeight(p.x + x1, p.z + z1) + LIP;
      for (let i = 1; i <= N; i++) {
        const x2 = ax + dx * i, z2 = az + dz * i, h2 = sampleHeight(p.x + x2, p.z + z2) + LIP;
        put(x1, h1, z1); put(x2, h2, z2); put(x2, bottom, z2);
        put(x1, h1, z1); put(x2, bottom, z2); put(x1, bottom, z1);
        x1 = x2; z1 = z2; h1 = h2;
      }
    }
    T.skirt.geometry.attributes.position.needsUpdate = true;
    T.skirt.position.set(p.x, 0, p.z);
  }

  /* ---- the lidar: rings of dots on aligned spokes, draped on the ground ---- */
  function disposeLidar() {
    for (const o of [T.lidar, T.lidarLines]) if (o) { o.geometry.dispose(); o.material.dispose(); scene.remove(o); }
    T.lidar = T.lidarLines = null;
  }
  function buildLidar() {
    disposeLidar();
    const rings = Math.max(2, Math.round(Math.sqrt(P.lidarCount / 2)));
    const spokes = Math.max(3, Math.round(P.lidarCount / rings));
    const n = rings * spokes;
    Object.assign(T, { lidarRings: rings, lidarSpokes: spokes, lidarN: n, lidarHeights: new Float32Array(n), ringF: new Float32Array(rings), ringFade: new Float32Array(rings) });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("dsize", new THREE.BufferAttribute(new Float32Array(n), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(v["colour.lidar"]) }, opacity: { value: 0.9 } },
      vertexShader: "attribute float dsize; void main() { gl_PointSize = dsize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 color; uniform float opacity; void main() { vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard; gl_FragColor = vec4(color, opacity); }",
      transparent: true,
    });
    T.lidar = new THREE.Points(geo, mat);
    T.lidar.frustumCulled = false;
    scene.add(T.lidar);
    // links between neighbouring dots on high ground, as ribbons
    const maxSegs = spokes * (rings - 1) + spokes * rings;
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxSegs * 18), 3));
    lineGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(maxSegs * 18), 3));
    T.lidarLines = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    T.lidarLines.frustumCulled = false;
    scene.add(T.lidarLines);
  }
  function updateLidar(dt) {
    T.lidarPhase += dt * P.lidarSpeed * Math.PI * 2;
    const p = vehicle.position;
    const { lidarRings: rings, lidarSpokes: spokes, lidarHeights: hs } = T;
    const arr = T.lidar.geometry.attributes.position.array, sizes = T.lidar.geometry.attributes.dsize.array;
    const pxRatio = renderer.getPixelRatio(), spokeStep = (Math.PI * 2) / spokes;
    T.flowPhase = (T.flowPhase + dt * P.lidarFlow) % 1; // the rings radiate outward
    for (let j = 0; j < rings; j++) {
      const f = ((j + 1) / rings + T.flowPhase) % 1;
      const fade = f < 0.15 ? f / 0.15 : f > 0.85 ? (1 - f) / 0.15 : 1;
      T.ringF[j] = f;
      T.ringFade[j] = fade;
      const r = P.lidarRadius * f;
      for (let s = 0; s < spokes; s++) {
        const i = j * spokes + s, a = T.lidarPhase + s * spokeStep;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, h = sampleHeight(x, z);
        hs[i] = h;
        arr[i * 3] = x;
        arr[i * 3 + 1] = h + 2;
        arr[i * 3 + 2] = z;
        const e = Math.max(0, Math.min(1, h / P.height3d));
        sizes[i] = P.lidarDot * (0.4 + e * P.lidarGain) * pxRatio * fade;
      }
    }
    T.lidar.geometry.attributes.position.needsUpdate = true;
    T.lidar.geometry.attributes.dsize.needsUpdate = true;
    T.lidarLines.material.opacity = P.linkOpacity;
    const la = T.lidarLines.geometry.attributes.position.array, lc = T.lidarLines.geometry.attributes.color.array;
    const hThr = (P.lidarLink / 100) * P.height3d, hSpan = Math.max(1, P.height3d - hThr);
    let c = 0;
    const pushSeg = (i1, i2) => {
      const x1 = arr[i1 * 3], y1 = arr[i1 * 3 + 1], z1 = arr[i1 * 3 + 2], x2 = arr[i2 * 3], y2 = arr[i2 * 3 + 1], z2 = arr[i2 * 3 + 2];
      const t = Math.min(1, ((hs[i1] + hs[i2]) / 2 - hThr) / hSpan);
      const glow = P.linkGlow + (1 - P.linkGlow) * t, w = (P.linkWidth + P.linkGain * t) / 2;
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 1, px = (-dz / len) * w, pz = (dx / len) * w;
      const o = c * 18;
      la.set([x1 - px, y1, z1 - pz, x2 - px, y2, z2 - pz, x2 + px, y2, z2 + pz, x1 - px, y1, z1 - pz, x2 + px, y2, z2 + pz, x1 + px, y1, z1 + pz], o);
      for (let k = 0; k < 6; k++) {
        lc[o + k * 3] = glow * lidarRGB[0];
        lc[o + k * 3 + 1] = glow * lidarRGB[1];
        lc[o + k * 3 + 2] = glow * lidarRGB[2];
      }
      c++;
    };
    for (let j = 0; j < rings; j++) {
      for (let s = 0; s < spokes; s++) {
        const i = j * spokes + s, iRing = j * spokes + ((s + 1) % spokes);
        if (hs[i] > hThr && hs[iRing] > hThr) pushSeg(i, iRing);
        const jn = (j + 1) % rings;
        if (T.ringF[jn] > T.ringF[j]) {
          const iSpoke = jn * spokes + s;
          if (hs[i] > hThr && hs[iSpoke] > hThr) pushSeg(i, iSpoke);
        }
      }
    }
    T.lidarLines.geometry.setDrawRange(0, c * 6);
    T.lidarLines.geometry.attributes.position.needsUpdate = true;
    T.lidarLines.geometry.attributes.color.needsUpdate = true;
  }

  /* ---- driving: the lidar-guided autopilot steers for low ground ---- */
  function autopilot(dt) {
    const p = vehicle.position;
    T.travelT += dt;
    if (T.travelT >= 2.5) {
      // boxed in by high ground: power straight ahead for a while to climb out
      if (Math.hypot(p.x - T.travelRefX, p.z - T.travelRefZ) < 60 && T.escapeT <= 0 && P.speed > 0) T.escapeT = 3;
      T.travelRefX = p.x;
      T.travelRefZ = p.z;
      T.travelT = 0;
    }
    if (T.escapeT > 0) {
      T.escapeT -= dt;
      T.speed += (P.speed * 0.85 - T.speed) * Math.min(1, dt * 2);
      return;
    }
    const D = P.lidarRadius;
    let best = 0, bestCost = Infinity;
    for (const off of [-0.9, -0.5, -0.22, 0, 0.22, 0.5, 0.9]) {
      const a = T.heading + off, sx = Math.sin(a), sz = Math.cos(a);
      let cost = 0;
      for (const f of [0.45, 0.75, 1]) cost += sampleHeight(p.x + sx * D * f, p.z + sz * D * f);
      cost += Math.abs(off) * 2.5;
      if (cost < bestCost) { bestCost = cost; best = off; }
    }
    T.heading += Math.max(-1, Math.min(1, best * 2)) * 1.3 * dt;
    const target = P.speed * 0.6 * (1 - 0.35 * Math.abs(best));
    T.speed += (target - T.speed) * Math.min(1, dt * 1.5);
  }
  function drive(dt) {
    autopilot(dt);
    const p = vehicle.position, fx = Math.sin(T.heading), fz = Math.cos(T.heading);
    p.x += fx * T.speed * dt;
    p.z += fz * T.speed * dt;
    settle(dt);
  }
  // the body rides the highest support, pitching and rolling with the ground
  function settle(dt) {
    const p = vehicle.position, fx = Math.sin(T.heading), fz = Math.cos(T.heading);
    const HB = P.vehLen * 0.36, TR = P.vehLen * 0.23;
    const h = sampleHeight(p.x, p.z), hF = sampleHeight(p.x + fx * HB, p.z + fz * HB), hB = sampleHeight(p.x - fx * HB, p.z - fz * HB);
    const rx = fz, rz = -fx, hR = sampleHeight(p.x + rx * TR, p.z + rz * TR), hL = sampleHeight(p.x - rx * TR, p.z - rz * TR);
    const support = Math.max(h, (hF + hB) / 2, (hL + hR) / 2) + 1.5;
    if (support > p.y || dt === 0) p.y = support;
    else p.y += (support - p.y) * Math.min(1, dt * 6);
    const k = dt === 0 ? 1 : Math.min(1, dt * 8);
    T.pitch += (-Math.atan2(hF - hB, HB * 2) - T.pitch) * k;
    T.roll += (Math.atan2(hR - hL, TR * 2) - T.roll) * k;
    vehicle.rotation.set(T.pitch, T.heading, T.roll);
  }
  function updateCamera(dt) {
    const { camTarget } = T;
    camTarget.x = vehicle.position.x;
    camTarget.z = vehicle.position.z;
    camTarget.y += (vehicle.position.y - camTarget.y) * (dt === 0 ? 1 : Math.min(1, dt * 5));
    const dist = 2000, ce = Math.cos(T.camEl), se = Math.sin(T.camEl);
    camera.position.set(camTarget.x + Math.sin(T.camAz) * ce * dist, camTarget.y + se * dist, camTarget.z + Math.cos(T.camAz) * ce * dist);
    camera.lookAt(camTarget);
    sun.position.set(camTarget.x - 600, 900, camTarget.z + 500);
    sun.target.position.set(camTarget.x, 0, camTarget.z);
    // the whole plate in view, at any aspect
    const aspect = H / W;
    // the sandbox frames 1.5 plates across; a wide stage pulls back until
    // the whole plate, its base block and its peaks, sits inside the frame,
    // and a tall one leans in, letting the plate's side corners go
    const across = aspect > 1 ? Math.max(1.1, 1.5 - (aspect - 1) * 0.4) : 1.5;
    const viewW = Math.max(T.visW * across, (T.visW * 1.05) / aspect) / T.zoom;
    camera.left = -viewW / 2;
    camera.right = viewW / 2;
    camera.top = (viewW * aspect) / 2;
    camera.bottom = (-viewW * aspect) / 2;
    camera.updateProjectionMatrix();
  }

  /* ---- the loop ---- */
  let W = 1, H = 1, raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  function renderFrame(dt) {
    if (dt > 0) {
      drive(dt);
      recenter(false);
    }
    updateRim();
    updateLidar(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    renderFrame(dt);
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
  // a still: the lidar a little way into its sweep
  function still() {
    T.flowPhase = 0.35;
    T.lidarPhase = 0.6;
    settle(0);
    renderFrame(0);
  }
  const redraw = () => (reduced ? still() : !raf && renderFrame(0));

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
  }

  /* ---- drag to turn the view ---- */
  let drag = null;
  const onDown = (e) => {
    drag = { x: e.clientX };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!drag) return;
    T.camAz -= (e.clientX - drag.x) * 0.006;
    drag.x = e.clientX;
    redraw();
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
    const was = W < 720;
    resize();
    if ((W < 720) !== was) rebuild3DTerrain(); // the texture's resolution follows the stage
    redraw();
  });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
  io.observe(host);
  const onVis = () => { tabVisible = !document.hidden; sync(); };
  document.addEventListener("visibilitychange", onVis);

  resize();
  rebuild3DTerrain();
  buildLidar();
  settle(0);
  T.camTarget.copy(vehicle.position);
  redraw();
  sync();

  return {
    update(values, path) {
      Object.assign(v, values);
      sync3();
      const changed = (k) => path == null || path === k;
      if (changed("terrain.style") || changed("terrain.bands")) buildPalette();
      if (changed("terrain.bands") || changed("terrain.scale")) {
        fillGrid(T.G3);
        fillFineAll();
        writePositions();
        update3DTexture();
        settle(0);
      } else if (changed("terrain.height")) {
        fillFineAll();
        writePositions();
        settle(0);
      } else if (changed("terrain.style")) update3DTexture();
      if (changed("lidar.count")) buildLidar();
      if (changed("colour.ground")) scene.background.set(v["colour.ground"]);
      if (changed("colour.lidar")) {
        lidarRGB = hexToRgb(v["colour.lidar"]).map((c) => c / 255);
        T.lidar.material.uniforms.color.value.set(v["colour.lidar"]);
      }
      redraw();
    },
    action(name) {
      if (name !== "newTerrain") return;
      seed = (Math.random() * 1e9) | 0;
      noise = makeNoise(seed);
      recenter(true);
      settle(0);
      redraw();
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
      disposePlate();
      disposeLidar();
      veh.traverse((o) => o.geometry?.dispose());
      bodyMat.dispose();
      tyreMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
