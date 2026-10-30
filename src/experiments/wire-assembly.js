/* Wire assembly.

   Overland's component placement instrument (clients/overland/prototypes/
   spark-component-placement.html, the tool behind the homepage's kit
   assembly): a chassis cab truck as an x-ray wireframe, turning slowly, and
   six parts as glowing yellow boxes that fly in from their own directions,
   each along a dashed lead line, and settle on their mounts, one after
   another. Here the assembly runs by itself (the site scrubs it with the
   scroll): in, hold, back out, again.

   Ported from the tool's own code, which is the build's verbatim: the wire
   (the longest strokes by chord, bucketed by depth and faded toward the
   back, which is what gives it the ghosted look), the projection and pitch,
   the idle spin and the drag with its fling, the parts' mounts, sizes,
   directions and windows, and how far each may fly before it leaves the
   frame. The wire is the build's, cut to the strokes the tool ever draws.
   The parts' name tags are left off. */

export const params = {
  parts: {
    pace: [1, 0.2, 3, 0.05],
    spread: [1, 0, 1.6, 0.05],
  },
  wire: {
    width: [0.7, 0.2, 2.5, 0.05],
    strength: [0.45, 0.05, 1, 0.01],
    fade: [0.6, 0, 1, 0.01],
    pitch: [-0.26, -1.2, 1.2, 0.01],
  },
  motion: { spin: [0.1, -0.6, 0.6, 0.01] },
  colour: {
    ground: "#0a0a08",
    wire: "#75705f",
    parts: "#e4f80d",
  },
  assemble: { type: "action", label: "Assemble again" },
};

// The site's root, from <link rel="site-root">, so this also works framed from a folder
const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const WIRE_URL = new URL("experiments/wire-assembly/wire.bin.gz", ROOT).href;

/* constants, verbatim from the tool */
const REF_AREA = 1400 * 900, REF_BUDGET = 60000;
const budgetFor = (w, h) => Math.round(Math.min(REF_BUDGET, Math.max(9000, ((w * h) / REF_AREA) * REF_BUDGET * 1.35)));
const DEPTH_SPAN = 2600, BUCKETS = 12;

/* the build's placements: mounts in the wire's millimetres, real box sizes,
   the direction each flies in from and its window of the assembly */
const PIECES = [
  { at: [0, 2193, -810], size: [326, 112, 204], dir: [0, 1.1, 0.4], win: [0.0, 0.17] },
  { at: [-25, 950, -85], size: [305, 185, 369], dir: [-1.2, 0.6, -0.2], win: [0.08, 0.26] },
  { at: [0, 1050, -1900], size: [207, 162, 207], dir: [-0.9, 0.2, 1.1], win: [0.16, 0.34] },
  { at: [-150, 800, -170], size: [280, 110, 221], dir: [0.9, 0.7, 0.8], win: [0.24, 0.43] },
  { at: [200, 750, -1250], size: [168, 144, 144], dir: [1.2, 0.5, -0.7], win: [0.32, 0.51] },
  { at: [0, 2078, -250], size: [594, 90, 486], dir: [0.6, 1.2, -0.5], win: [0.4, 0.59] },
];
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

/* the loop the scroll used to drive: in, hold, out, a breath, again (seconds at pace 1) */
const T_IN = 6.5, T_HOLD = 3.6, T_OUT = 4.2, T_REST = 1.2;
const CYCLE = T_IN + T_HOLD + T_OUT + T_REST;
function assemblyAt(t) {
  const u = ((t % CYCLE) + CYCLE) % CYCLE;
  if (u < T_IN) return u / T_IN;
  if (u < T_IN + T_HOLD) return 1;
  if (u < T_IN + T_HOLD + T_OUT) return 1 - (u - T_IN - T_HOLD) / T_OUT;
  return 0;
}

const rgbOf = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [255, 255, 255];
};

async function fetchWire(signal) {
  const r = await fetch(WIRE_URL, { signal });
  if (!r.ok) throw new Error(`wire ${r.status}`);
  let bytes = new Uint8Array(await r.arrayBuffer());
  // served gzipped as a file, or already decoded by a server that says Content-Encoding
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const ds = new DecompressionStream("gzip");
    bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, false) !== 0x57495245) throw new Error("bad wire");
  const n = dv.getUint32(4, true);
  const mn = [dv.getFloat32(8, true), dv.getFloat32(12, true), dv.getFloat32(16, true)];
  const mx = [dv.getFloat32(20, true), dv.getFloat32(24, true), dv.getFloat32(28, true)];
  const sp = mx.map((v, i) => v - mn[i] || 1);
  let off = 32, total = 0;
  const counts = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const c = dv.getUint16(off, true);
    counts[i] = c;
    total += c;
    off += 2 + c * 6;
  }
  // packed flat, as the tool packs it
  const PXYZ = new Float32Array(total * 3), start = new Int32Array(n + 1), chord = new Float32Array(n);
  off = 32;
  let pi = 0;
  for (let s = 0; s < n; s++) {
    const c = counts[s];
    off += 2;
    start[s] = pi;
    for (let j = 0; j < c; j++, pi++, off += 6) {
      PXYZ[pi * 3] = mn[0] + (dv.getUint16(off, true) / 65535) * sp[0];
      PXYZ[pi * 3 + 1] = mn[1] + (dv.getUint16(off + 2, true) / 65535) * sp[1];
      PXYZ[pi * 3 + 2] = mn[2] + (dv.getUint16(off + 4, true) / 65535) * sp[2];
    }
    const a = start[s] * 3, b = (pi - 1) * 3;
    chord[s] = Math.hypot(PXYZ[b] - PXYZ[a], PXYZ[b + 1] - PXYZ[a + 1], PXYZ[b + 2] - PXYZ[a + 2]);
  }
  start[n] = pi;
  const order = Array.from(chord.keys()).sort((a, b) => chord[b] - chord[a]);
  const M = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  return { PXYZ, start, chord, order, npoly: n, M, R: Math.hypot(mx[0] - mn[0], mx[2] - mn[2]) / 2, RY: (mx[1] - mn[1]) / 2, mn, mx };
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let G = null, thresh = 0;
  let W = 1, H = 1, DPR = 1;
  let yaw = -2.35, yawVel = 0;
  let clock = 0, assembly = reduced ? 1 : 0;
  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden, dead = false;
  const buckets = Array.from({ length: BUCKETS }, () => []);
  // the view the projection uses, eased toward the fit of the stage so a reflow glides
  const view = { sx: 0, sy: 0, scl: 0, tsx: 0, tsy: 0, tscl: 0, live: false };

  // the longest strokes by chord, up to the stage's budget
  function select() {
    if (!G) return;
    const budget = budgetFor(W, H);
    let acc = 0;
    thresh = 0;
    for (const k of G.order) {
      acc += G.start[k + 1] - G.start[k] - 1;
      if (acc >= budget) {
        thresh = G.chord[k];
        break;
      }
    }
  }
  function fitTargets() {
    if (!G) return;
    const pitch = v["wire.pitch"];
    const Rv = G.RY * Math.cos(pitch) + G.R * Math.abs(Math.sin(pitch));
    view.tscl = Math.min(W / 2 / G.R, H / 2 / Rv) * 0.98;
    view.tsx = W / 2;
    view.tsy = H / 2;
    if (!view.live) {
      view.sx = view.tsx;
      view.sy = view.tsy;
      view.scl = view.tscl;
      view.live = true;
    }
  }

  function draw() {
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, W, H);
    if (!G) return;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const pitch = v["wire.pitch"];
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const M = G.M, scl = view.scl, Sx = view.sx, Sy = view.sy;
    const project = (X0, Y0, Z0) => {
      const X = X0 - M[0], Y = Y0 - M[1], Z = Z0 - M[2];
      const x = X * cyaw + Z * syaw;
      const z = -X * syaw + Z * cyaw;
      return [Sx + x * scl, Sy - (Y * cp - z * sp) * scl, Y * sp + z * cp];
    };

    /* the wire: every kept segment into one of twelve depth buckets, the far ones faded */
    const { PXYZ, start, chord, npoly } = G;
    for (const b of buckets) b.length = 0;
    for (let s = 0; s < npoly; s++) {
      if (chord[s] < thresh) continue;
      let px = 0, py = 0, pz = 0, has = false;
      for (let a = start[s]; a < start[s + 1]; a++) {
        const X = PXYZ[a * 3] - M[0], Y = PXYZ[a * 3 + 1] - M[1], Z = PXYZ[a * 3 + 2] - M[2];
        const x = X * cyaw + Z * syaw, z = -X * syaw + Z * cyaw;
        const sx = Sx + x * scl, sy = Sy - (Y * cp - z * sp) * scl, z2 = Y * sp + z * cp;
        if (has) {
          const t = Math.min(1, Math.max(0, ((pz + z2) / 2 + DEPTH_SPAN) / (2 * DEPTH_SPAN)));
          buckets[Math.min(BUCKETS - 1, (t * BUCKETS) | 0)].push(px, py, sx, sy);
        }
        px = sx;
        py = sy;
        pz = z2;
        has = true;
      }
    }
    const [sr, sg, sb] = rgbOf(v["colour.wire"]);
    g.lineWidth = v["wire.width"];
    g.lineCap = "round";
    for (let i = 0; i < BUCKETS; i++) {
      const b = buckets[i];
      if (!b.length) continue;
      const alpha = (1 - (v["wire.fade"] * 0.9 * (i + 0.5)) / BUCKETS) * v["wire.strength"];
      g.strokeStyle = `rgba(${sr},${sg},${sb},${alpha.toFixed(3)})`;
      g.beginPath();
      for (let j = 0; j < b.length; j += 4) {
        g.moveTo(b[j], b[j + 1]);
        g.lineTo(b[j + 2], b[j + 3]);
      }
      g.stroke();
    }

    /* the parts: each flies in from its direction over its window, as far as the frame allows */
    const brand = rgbOf(v["colour.parts"]).join(",");
    const safeX = (W / 2 / scl) * 0.9, safeY = (H / 2 / scl) * 0.9;
    for (const pc of PIECES) {
      const [w0, w1] = pc.win;
      const p = Math.min(1, Math.max(0, (assembly - w0) / (w1 - w0)));
      if (p <= 0) continue;
      const off = 1 - p;
      const [mx0, my0, mz0] = pc.at;
      const [sw, sh, sd] = pc.size;
      const cy = my0 - M[1] + sh / 2;
      const cr = Math.hypot(mx0 - M[0], mz0 - M[2]) + Math.max(sw, sd) / 2;
      let D = G.R * 0.55;
      if (pc.dir[1] > 0) D = Math.min(D, (safeY - cy) / pc.dir[1]);
      else if (pc.dir[1] < 0) D = Math.min(D, (-safeY - cy) / pc.dir[1]);
      const horiz = Math.hypot(pc.dir[0], pc.dir[2]);
      if (horiz > 0) D = Math.min(D, (safeX - cr) / horiz);
      D = Math.max(0, D) * v["parts.spread"];
      const ox = mx0 + pc.dir[0] * D * off, oy = my0 + pc.dir[1] * D * off, oz = mz0 + pc.dir[2] * D * off;
      const fade = Math.min(1, p / 0.34);
      if (p < 0.98) {
        // the lead line, from where it is to where it goes
        g.strokeStyle = `rgba(${brand},${(0.35 * fade).toFixed(3)})`;
        g.lineWidth = 1;
        g.setLineDash([4, 5]);
        g.beginPath();
        const a = project(ox, oy, oz), b = project(mx0, my0, mz0);
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
        g.setLineDash([]);
      }
      const X = sw / 2, Y = sh / 2, Z = sd / 2;
      const corners = [
        [ox - X, oy - Y, oz - Z], [ox + X, oy - Y, oz - Z], [ox + X, oy + Y, oz - Z], [ox - X, oy + Y, oz - Z],
        [ox - X, oy - Y, oz + Z], [ox + X, oy - Y, oz + Z], [ox + X, oy + Y, oz + Z], [ox - X, oy + Y, oz + Z],
      ].map((c) => project(c[0], c[1], c[2]));
      // a soft wide pass, then the line itself
      for (const [wdt, al] of [[4, (0.1 + 0.14 * p) * fade], [1.4, (0.25 + 0.75 * p) * fade]]) {
        g.strokeStyle = `rgba(${brand},${al.toFixed(3)})`;
        g.lineWidth = wdt;
        g.beginPath();
        for (const [A, B] of EDGES) {
          g.moveTo(corners[A][0], corners[A][1]);
          g.lineTo(corners[B][0], corners[B][1]);
        }
        g.stroke();
      }
      if (p >= 0.98) {
        const [nx, ny] = project(mx0, my0, mz0);
        g.fillStyle = `rgb(${brand})`;
        g.fillRect(nx - 3.5, ny - 3.5, 7, 7);
      }
    }
  }

  /* one step of the timed motion: the assembly, the idle spin and the view easing */
  function advance(dt) {
    clock += dt * v["parts.pace"];
    assembly = assemblyAt(clock);
    if (!dragging) {
      yawVel += (v["motion.spin"] - yawVel) * (1 - Math.exp(-dt * 0.8));
      // a fling runs fast and eases back to the idle spin
      if (Math.abs(yawVel - v["motion.spin"]) < 0.02) flung = false;
      yaw += yawVel * dt * (flung && Math.abs(yawVel) > 0.12 ? 6 : 1);
    }
    if (view.live) {
      const k = 1 - Math.exp(-dt * 9);
      view.sx += (view.tsx - view.sx) * k;
      view.sy += (view.tsy - view.sy) * k;
      view.scl += (view.tscl - view.scl) * k;
    }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    advance(dt);
    draw();
  }
  function sync() {
    const run = !reduced && onScreen && tabVisible && G && !dead;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  // a still: everything settled on its mount
  function settle() {
    if (!view.live) return;
    view.sx = view.tsx;
    view.sy = view.tsy;
    view.scl = view.tscl;
  }
  const redraw = () => {
    if (reduced) settle();
    if (reduced || !raf) draw();
  };

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    select();
    fitTargets();
    // setting the bitmap size wiped it: repaint now at the current view
    draw();
  }

  /* drag to turn it, with a fling */
  let dragging = false, flung = false, lastX = 0;
  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    yaw += dx * 0.008;
    yawVel = dx * 0.008;
    flung = true;
    redraw();
  };
  const onUp = () => {
    dragging = false;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

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

  resize();
  const abort = new AbortController();
  fetchWire(abort.signal)
    .then((wire) => {
      if (dead) return;
      G = wire;
      select();
      fitTargets();
      redraw();
      sync();
    })
    .catch((e) => {
      if (!dead && e?.name !== "AbortError") console.warn("wire-assembly: the wire did not load", e);
    });

  return {
    update(values, path) {
      Object.assign(v, values);
      if (path == null || path === "wire.pitch") fitTargets();
      redraw();
    },
    action(name) {
      if (name !== "assemble") return;
      clock = 0;
      assembly = reduced ? 1 : 0;
      redraw();
    },
    destroy() {
      dead = true;
      abort.abort();
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.remove();
    },
  };
}
