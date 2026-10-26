/* Supply network.

   Cambium's national supply map (clients/cambium/designs/02-Supply-Network-Map),
   ported without its copy: the lower 48 as a dot matrix on their brown, the
   timber sources in blue, four regional hubs in glass, and a tour that opens
   each hub in turn, fans its sawmills and recurring programs out on spokes
   with light running along them, then lights one species' range in orange.

   The map is the prototype's own AlbersUsa frame, baked once into a small
   region raster (public/media/play/supply-network/regions.png: 0 water, then
   West, Midwest, South and Northeast in steps of 50), so no map library
   runs here. The hubs and the species ranges are projected into the same
   frame below. The dot field, the cursor lens, the ripples, the reveal and
   the fan all follow the prototype's numbers. */

export const params = {
  dots: {
    spacing: [10.5, 7, 16, 0.5],
    brightness: [0.21, 0.08, 0.4, 0.01],
    sourceSize: [0.26, 0.16, 0.4, 0.01],
  },
  motion: {
    tour: { type: "toggle", labels: ["Tour off", "Tour on"], default: true },
    pace: [1, 0.5, 2, 0.05],
    ripple: [1, 0, 3, 0.05],
  },
  colour: {
    ground: "#261107",
    land: "#fffcf6",
    source: "#b9e4f8",
    accent: "#d65b19",
  },
};

const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const RASTER = new URL("media/play/supply-network/regions.png", ROOT).href;

/* ---- the map's frame (raster units, 960 wide) ---- */

const RW = 960, RH = 609;
// the lower 48 is 944 units wide here and was 728 in the prototype's frame,
// so a prototype unit is this many raster units
const ORIG = 944 / 728;
// the hubs: West, Midwest, South, Northeast
const HUBS = [[188.1, 151.3], [476.6, 225.9], [648.6, 467], [815.2, 139.1]];
// what each hub holds, as the sheet has it: sawmills, then recurring programs
const HOLDS = [[5, 9], [4, 7], [2, 1], [3, 6]];
// the species' native ranges: [x, y, radius] circles
const SPECIES = [
  [[81.9, 46.8, 31.1], [50.4, 109.3, 29.8], [25.5, 212.7, 28.3]],
  [[630.9, 282.2, 60], [700.5, 344.9, 50], [534.6, 236.6, 43.2], [811.2, 252.3, 36.7], [788.1, 346.1, 36.7], [554.1, 300.8, 50], [661, 265.4, 40]],
  [[791.4, 204.3, 46.5], [767.4, 288.5, 38.3], [843.1, 155.8, 38.1], [902.3, 107.6, 36.3], [883.3, 179.4, 29.9], [707.7, 245.9, 36.6]],
  [[904.2, 102.3, 39.6], [860.4, 142.2, 36.4], [673.3, 134.1, 42.8], [578.9, 119.6, 42.7], [784.7, 205.6, 39.9], [732.7, 350, 33.3]],
  [[78.4, 64.8, 36.1], [71.3, 120, 36.4], [177.1, 65.9, 36], [54.4, 206.4, 30]],
  [[37.8, 240.3, 18.3], [58.9, 293.8, 18.3]],
  [[87.9, 134.1, 31.5], [125.2, 224.1, 33.3], [220.2, 266.2, 31.7]],
  [[22.4, 235.9, 25], [40.3, 149.6, 24.9]],
  [[55.2, 98.7, 18.2], [69.9, 60, 16.4]],
  [[55, 93.9, 21.5], [77.4, 45.5, 18], [32.5, 176.2, 18.3]],
  [[742.3, 339.3, 46.7], [783.4, 276.4, 38.3], [689.3, 392.8, 43.3], [775.8, 362.2, 40], [730.9, 420.2, 39.9], [823.7, 297.1, 33.4], [632.6, 439.9, 36.6]],
  [[62.9, 55.6, 27.9], [42.6, 107, 24.8]],
  [[833.4, 158, 46.4], [676, 156.9, 43], [780.3, 239.3, 38.3], [911, 90.8, 36.3], [876.4, 138.3, 31.5], [849, 244.5, 31.7], [564.7, 152.5, 42.9], [564.3, 467, 36.5]],
  [[560.4, 467.2, 46.5], [640.2, 439.3, 43.2], [731.9, 457.3, 46.5], [798.1, 381.9, 43.3], [505.9, 486.8, 43.1]],
  [[80.1, 41.6, 31.1], [56.4, 77.5, 28], [178, 61.5, 27.8]],
  [[17.7, 195.9, 21.7], [32.3, 147.2, 18.3]],
  [[201.5, 71, 27.8], [161.8, 48.5, 22.9]],
  [[718, 295.9, 53.3], [809.9, 210.1, 43.2], [634.9, 374.8, 46.7], [668.2, 204.2, 43.1], [801.3, 315.5, 40], [869.1, 163.9, 36.5], [751, 398.8, 40], [551.5, 328.7, 50], [665.8, 423.1, 39.9]],
];
// the prototype's tour: a hub, then a species from its part of the country
// (Douglas fir, white oak, southern yellow pine, black walnut)
const TOUR = [{ hub: 0 }, { species: 4 }, { hub: 3 }, { species: 17 }, { hub: 2 }, { species: 13 }, { hub: 1 }, { species: 1 }];

// the prototype's glyphs (24-unit boxes): the hub's tree, a sawmill, a program
const GLYPH = {
  tree: new Path2D("m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17zM12 22v-3"),
  sawmill: new Path2D("M2 20a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8l-6 4V8l-6 4V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v3M2 20V9m3 12v-5h4v5"),
  program: new Path2D("M21 8a9 9 0 0 0-15.6-3.4L3 7M3 4v3.5h3.5M3 16a9 9 0 0 0 15.6 3.4L21 17M21 20v-3.5h-3.5"),
};

/* ---- helpers ---- */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const rgbOf = (hex) => {
  const h = String(hex).replace("#", "");
  const s = h.length === 3 ? h.replace(/./g, "$&$&") : h.padEnd(6, "0");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) || 0);
};
const css = ([r, g, b], a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

/** A CSS cubic-bezier as a function of progress. */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = (s) => ((ax * s + bx) * s + cx) * s;
  const y = (s) => ((ay * s + by) * s + cy) * s;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0, hi = 1, s = t;
    for (let i = 0; i < 18; i++) {
      const v = x(s);
      if (Math.abs(v - t) < 1e-4) break;
      if (v < t) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return y(s);
  };
}
const EASE = bezier(0.38, 0.005, 0.215, 1); // Cambium's ease
const OUT = bezier(0.22, 1, 0.36, 1); // the fan's ease-out
const SPRING = bezier(0.34, 1.56, 0.64, 1); // the pins' and hubs' pop
const tween = (t, at, dur, ease = EASE) => ease(clamp((t - at) / dur));

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- the piece ---- */

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);

  const make = () => {
    const c = document.createElement("canvas");
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.append(c);
    return c;
  };
  const dotsCanvas = make(), uiCanvas = make();
  const dg = dotsCanvas.getContext("2d"), ug = uiCanvas.getContext("2d");

  let W = 0, H = 0, dpr = 1, S = 1, OX = 0, OY = 0, full = true, u = 1;
  let pan = 1, camX = RW / 2; // the portrait view's centre, in raster units
  const oxFor = (x) => {
    const c = W / 2 - x * S;
    return pan > 1 ? Math.min(16, Math.max(W - 16 - RW * S, c)) : (W - RW * S) / 2;
  };
  // where the view wants to be: the open hub, or the middle of the lit range
  const focusX = () => {
    if (state.open >= 0) return HUBS[state.open][0];
    if (state.species != null) {
      const a = SPECIES[state.species];
      return a.reduce((s, c) => s + c[0], 0) / a.length;
    }
    return RW / 2;
  };
  let STEP = 0, DOTS = [], LAND = [], SRC = [], HIT = null;
  let clock = 0, last = 0, raf = 0, destroyed = false;
  let onScreen = true, tabVisible = !document.hidden;
  let revealAt = null; // clock ms when the dots began to appear
  let dotsBusy = true;
  const ripples = [];
  const ptr = { x: 0, y: 0, on: false }, lens = { x: 0, y: 0, s: 0 };

  // what is open: the hub (index or -1), the lit species, the active pin
  const state = { open: -1, species: null, active: null };
  // the fans on screen: the open one and any still folding away
  let fans = [];
  // each hub's look, eased toward its state every frame
  const hubLook = HUBS.map(() => ({ on: 0, dim: 0, hover: 0 }));
  let hoverHub = -1, hoverPin = null;

  // the tour, run on the piece's own clock so pausing it pauses the tour
  const tour = { step: 0, phase: 0, wait: 0, cooldown: 0 };

  const colours = () => {
    const ground = rgbOf(v["colour.ground"]), land = rgbOf(v["colour.land"]);
    const source = rgbOf(v["colour.source"]), accent = rgbOf(v["colour.accent"]);
    return {
      ground, land, source, accent,
      lit: accent.map((c) => Math.min(255, c * 1.08 + 4)), // the prototype's #e8702f beside its #d65b19
      mill: mix(ground, land, 0.25), // brown-mid on the cream pins
      prog: ground, // brown-dark
      mark: mix(ground, land, 0.1), // the brown on the hub's blue mark
    };
  };
  let C = colours();

  /* ---- layout: the frame fitted into the host ---- */

  function layout() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [dotsCanvas, uiCanvas]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    full = W >= 720;
    const mx = full ? Math.max(28, W * 0.06) : 16;
    const my = full ? Math.max(28, H * 0.09) : Math.max(24, H * 0.08);
    S = Math.max(0.05, Math.min((W - mx * 2) / RW, (H - my * 2) / RH));
    // on a tall stage the country is drawn wider than the stage, about half
    // its height, and the view travels to whichever hub or range is lit
    pan = H / W > 1.2 ? Math.min(1.9, Math.max(1, (H * 0.5) / (RH * S))) : 1;
    S *= pan;
    OX = oxFor(camX);
    OY = (H - RH * S) / 2;
    u = S * ORIG; // screen px per prototype unit
    buildDots();
    fans.forEach((f) => { f.items = fanLayout(f.hub); });
    dotsBusy = true;
  }

  const regionAt = (x, y) => {
    if (!HIT) return -1;
    const xi = Math.min(RW - 1, Math.max(0, Math.round(x))), yi = Math.min(RH - 1, Math.max(0, Math.round(y)));
    const g = HIT[(yi * RW + xi) * 4];
    return g < 25 ? -1 : Math.min(3, Math.max(0, Math.round(g / 50) - 1));
  };

  /* The dot lattice, sized in screen pixels so the texture reads the same on
     a phone and a wide screen, and the sources: a seeded pick of grid points
     inside each species' range. */
  function buildDots() {
    DOTS = []; LAND = []; SRC = [];
    if (!HIT) return;
    const spacing = v["dots.spacing"];
    STEP = full ? clamp(spacing / S, 5 * ORIG, 20 * ORIG) : (spacing * 6.5) / 10.5 / S;
    const rowH = (STEP * Math.sqrt(3)) / 2;
    let row = 0;
    for (let y = rowH / 2; y < RH; y += rowH, row++) {
      for (let x = row % 2 ? STEP : STEP / 2; x < RW; x += STEP) {
        const reg = regionAt(x, y);
        if (reg < 0) continue;
        DOTS.push({ x, y, reg, sp: null, a: -1, r: 0, appear: 140 + (x / RW) * 950 + (y / RH) * 160 });
      }
    }
    SPECIES.forEach((areas, si) => {
      const rnd = mulberry32(si * 9973 + 17), cand = new Set();
      for (const [cx, cy, R] of areas) {
        DOTS.forEach((d, i) => { if ((d.x - cx) ** 2 + (d.y - cy) ** 2 <= R * R) cand.add(i); });
      }
      const arr = [...cand];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      const want = Math.round(Math.min(34, Math.max(14, areas.length * 6)) * (full ? 1.15 : 0.8));
      arr.slice(0, want).forEach((i) => (DOTS[i].sp ||= []).push(si));
    });
    LAND = DOTS.filter((d) => !d.sp);
    SRC = DOTS.filter((d) => d.sp);
  }

  /* ---- the fan: a hub's sawmills and programs on two rings ---- */

  const pinPx = () => (full ? Math.min(34, Math.max(24, 960 * u * 0.0235)) : 23);
  const hubPx = () => {
    const fs = clamp(960 * u * 0.0095, 11, 14);
    return { mark: 2.1 * fs, size: 2.1 * fs + 0.9 * fs };
  };

  function fanLayout(h) {
    const [mills, progs] = HOLDS[h];
    const spread = (n, cat) => Array.from({ length: n }, (_, j) => [(j + 0.5) / n, cat]);
    const cats = [...spread(mills, "sawmill"), ...spread(progs, "program")].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    const [r1, r2] = full ? [86 * u, 124 * u] : [54, 80];
    const sq = full ? 0.78 : 0.9;
    const [hx, hy] = HUBS[h];
    const n = cats.length, inner = Math.min(n, 10), pts = [];
    [[r1, inner, 0], [r2, n - inner, 1]].forEach(([rad, cap, ri]) => {
      for (let i = 0; i < cap; i++) {
        const a = -Math.PI / 2 + (i / cap) * Math.PI * 2 + (ri ? Math.PI / cap : 0);
        pts.push([hx + (Math.cos(a) * rad) / S, hy + (Math.sin(a) * rad * sq) / S]);
      }
    });
    // a ring that would run off the stage slides back in as one piece
    const m = (pinPx() / 2 + 6) / S;
    const ox = oxFor(hx);
    const L = -ox / S + m, R = (W - ox) / S - m, T = -OY / S + m, B = (H - OY) / S - m;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const dx = Math.min(0, R - Math.max(...xs)) || Math.max(0, L - Math.min(...xs));
    const dy = Math.min(0, B - Math.max(...ys)) || Math.max(0, T - Math.min(...ys));
    return cats.map((cat, i) => ({ cat, i, x: pts[i][0] + dx, y: pts[i][1] + dy, look: { active: 0, dim: 0 } }));
  }

  function openHub(h, quiet = false) {
    if (h === state.open) return;
    for (const f of fans) if (f.closing == null) f.closing = clock;
    state.open = h;
    state.active = null;
    if (h >= 0) {
      fans.push({ hub: h, items: fanLayout(h), t0: reduced ? -1e6 : clock, closing: null });
      if (!quiet) ripple(...HUBS[h]);
    }
    dotsBusy = true;
  }
  function lightSpecies(si) {
    state.species = si;
    dotsBusy = true;
  }
  function ripple(x, y) {
    if (reduced || v["motion.ripple"] <= 0) return;
    ripples.push({ x, y, t0: clock });
    dotsBusy = true;
  }

  /* ---- the dot field ---- */

  const RIPPLE_MS = 1100;
  function drawDots(dt) {
    const k = 1 - Math.pow(0.8, dt / 16.7);
    let busy = false;
    dg.setTransform(1, 0, 0, 1, 0, 0);
    dg.fillStyle = css(C.ground);
    dg.fillRect(0, 0, dotsCanvas.width, dotsCanvas.height);
    if (revealAt == null || !DOTS.length) return false;
    dg.setTransform(S * dpr, 0, 0, S * dpr, OX * dpr, OY * dpr);

    const rt = clock - revealAt, revealing = !reduced && rt < 1900;
    if (revealing) busy = true;

    const lensOn = ptr.on && full ? 1 : 0;
    lens.s += (lensOn - lens.s) * k;
    lens.x += (ptr.x - lens.x) * Math.min(1, k * 1.7);
    lens.y += (ptr.y - lens.y) * Math.min(1, k * 1.7);
    if (Math.abs(lensOn - lens.s) > 0.01 || (lens.s > 0.01 && Math.hypot(ptr.x - lens.x, ptr.y - lens.y) > 0.4)) busy = true;
    const LR = STEP * 6.5, LR2 = LR * LR;

    for (let i = ripples.length - 1; i >= 0; i--) if (clock - ripples[i].t0 > RIPPLE_MS) ripples.splice(i, 1);
    if (ripples.length) busy = true;
    const rip = v["motion.ripple"], speed = 0.42 * ORIG, spread = 260 * ORIG * ORIG;

    const rLand = STEP * 0.16, rSrc = STEP * v["dots.sourceSize"];
    const openReg = state.open, lit = state.species, dimLand = lit != null;
    const inks = [C.land, C.source, C.lit];
    for (let pass = 0; pass < 3; pass++) {
      dg.fillStyle = css(inks[pass]);
      const list = pass === 0 ? LAND : SRC;
      for (let n = 0; n < list.length; n++) {
        const d = list[n];
        const isLit = lit != null && d.sp && d.sp.includes(lit);
        if ((pass === 1 && isLit) || (pass === 2 && !isLit)) continue;
        let ta, tr;
        if (pass === 0) {
          ta = openReg >= 0 ? (d.reg === openReg ? 0.46 : 0.08) : v["dots.brightness"];
          if (dimLand) ta = Math.min(ta, 0.14);
          tr = rLand;
        } else if (pass === 1) {
          ta = openReg >= 0 ? (d.reg === openReg ? 0.95 : 0.28) : 0.88;
          if (lit != null) ta = 0.16;
          tr = rSrc;
        } else {
          ta = 1;
          tr = rSrc * 1.4;
        }
        if (d.a < 0 || reduced) { d.a = ta; d.r = tr; }
        d.a += (ta - d.a) * k;
        d.r += (tr - d.r) * k;
        if (Math.abs(ta - d.a) > 0.004 || Math.abs(tr - d.r) > 0.004) busy = true;
        let a = d.a, r = d.r;
        if (revealing) {
          const t = (rt - d.appear) / 460;
          if (t <= 0) continue;
          if (t < 1) { const e = t * t * (3 - 2 * t); a *= e; r *= 0.3 + 0.7 * e; }
        }
        if (lens.s > 0.01) {
          const dx = d.x - lens.x, dy = d.y - lens.y, dd = dx * dx + dy * dy;
          if (dd < LR2) {
            const f = (1 - Math.sqrt(dd) / LR) ** 2 * lens.s;
            a += (pass === 0 ? 0.16 : 0.05) * f;
            r *= 1 + 0.3 * f;
          }
        }
        for (let q = 0; q < ripples.length; q++) {
          const rp = ripples[q], t = clock - rp.t0, dist = Math.hypot(d.x - rp.x, d.y - rp.y) - t * speed;
          const g = Math.exp(-(dist * dist) / spread) * (1 - t / RIPPLE_MS) ** 2;
          if (g > 0.01) { a += 0.14 * g * rip; r *= 1 + 0.22 * g * rip; }
        }
        if (a < 0.01) continue;
        dg.globalAlpha = Math.min(1, a);
        dg.beginPath();
        dg.arc(d.x, d.y, r, 0, 6.2832);
        dg.fill();
      }
    }
    dg.globalAlpha = 1;
    return busy;
  }

  /* ---- glass, hubs, pins, spokes ---- */

  const toScreen = (x, y) => [OX + x * S, OY + y * S];

  // a box-shadow that ignores the fill's own transparency, as CSS draws it
  function dropShadow(path, ox, oy, blur, colour) {
    const far = 10000;
    ug.save();
    ug.translate(-far, 0);
    ug.shadowColor = colour;
    ug.shadowBlur = blur * dpr;
    ug.shadowOffsetX = (far + ox) * dpr;
    ug.shadowOffsetY = oy * dpr;
    ug.fillStyle = "#000";
    ug.fill(path);
    ug.restore();
  }
  // an inset box-shadow: the outside's shadow, seen through a hole the shape's size
  function insetShadow(cx, cy, r, oy, blur, colour) {
    ug.save();
    const clip = new Path2D();
    clip.arc(cx, cy, r, 0, Math.PI * 2);
    ug.clip(clip);
    const ring = new Path2D();
    ring.rect(cx - r * 4, cy - r * 4, r * 8, r * 8);
    ring.arc(cx, cy, r, 0, Math.PI * 2, true);
    ug.shadowColor = colour;
    ug.shadowBlur = blur * dpr;
    ug.shadowOffsetY = oy * dpr;
    ug.fillStyle = "#000";
    ug.fill(ring, "evenodd");
    ug.restore();
  }
  function glyph(path, cx, cy, size, colour, width) {
    ug.save();
    ug.translate(cx - size / 2, cy - size / 2);
    ug.scale(size / 24, size / 24);
    ug.strokeStyle = colour;
    ug.lineWidth = width;
    ug.lineCap = "round";
    ug.lineJoin = "round";
    ug.stroke(path);
    ug.restore();
  }

  function drawFan(f, dt) {
    const [hx, hy] = HUBS[f.hub];
    const [sx, sy] = toScreen(hx, hy);
    const t = clock - f.t0;
    const closing = f.closing != null ? clock - f.closing : -1;
    const pin = pinPx();
    const flowOn = !reduced;
    const k = reduced ? 1 : 1 - Math.exp(-dt / 90);
    // spokes, under the pins
    for (const p of f.items) {
      const [px, py] = toScreen(p.x, p.y);
      const L = Math.hypot(px - sx, py - sy);
      if (L < 1) continue;
      const draw = closing >= 0 ? 1 - tween(closing, 0, 400, OUT) : tween(t, 0, 600, OUT);
      const look = p.look;
      look.dim += ((state.active && state.active !== p && f.closing == null ? 1 : 0) - look.dim) * k;
      const groupA = 1 - 0.75 * look.dim;
      if (draw <= 0.001) continue;
      ug.globalAlpha = groupA;
      ug.strokeStyle = css(C.land, 0.2);
      ug.lineWidth = 1;
      ug.beginPath();
      ug.moveTo(sx, sy);
      ug.lineTo(sx + (px - sx) * draw, sy + (py - sy) * draw);
      ug.stroke();
      // the pulse of light: sawmills flow into the hub, programs out to the program
      const flowA = closing >= 0 ? 0 : tween(t, 450, 300);
      if (flowOn && flowA > 0) {
        const period = 2400, phase = (((t + p.i * 410) % period) + period) % period / period;
        let s0 = p.cat === "program" ? phase : 1 - phase; // dash start along the spoke, 0..1
        const segs = [[s0, s0 + 0.08]];
        if (s0 + 0.08 > 1) segs.push([0, s0 + 0.08 - 1]);
        ug.globalAlpha = groupA * flowA;
        ug.strokeStyle = css(C.land, 0.9);
        ug.lineWidth = 1.6;
        ug.lineCap = "round";
        ug.beginPath();
        for (const [a, b] of segs) {
          const e = Math.min(1, b);
          ug.moveTo(sx + (px - sx) * a, sy + (py - sy) * a);
          ug.lineTo(sx + (px - sx) * e, sy + (py - sy) * e);
        }
        ug.stroke();
        ug.lineCap = "butt";
      }
    }
    ug.globalAlpha = 1;
    // pins
    for (const p of f.items) {
      const dl = p.i * 28;
      let pos, op, sc;
      if (closing >= 0) {
        pos = 1 - tween(closing, 0, 600, OUT);
        op = 1 - tween(closing, 0, 350);
        sc = 1 - 0.6 * tween(closing, 0, 350);
      } else {
        pos = tween(t, dl, 600, OUT);
        op = tween(t, dl, 350);
        sc = 0.4 + 0.6 * SPRING(clamp(t / 350));
      }
      const look = p.look;
      look.active += ((state.active === p ? 1 : 0) - look.active) * (reduced ? 1 : 1 - Math.exp(-dt / 70));
      const hovered = hoverPin === p ? 1 : 0;
      const act = Math.max(look.active, hovered);
      op *= 1 - 0.68 * look.dim;
      if (op <= 0.01) continue;
      const [px, py] = toScreen(hx + (p.x - hx) * pos, hy + (p.y - hy) * pos);
      const r = (pin / 2) * sc * (1 + 0.15 * act);
      ug.globalAlpha = op;
      const disc = new Path2D();
      disc.arc(px, py, r, 0, Math.PI * 2);
      dropShadow(disc, 0, 8 * sc, 18, "rgba(0,0,0,.45)");
      ug.fillStyle = css(mix(C.land, C.accent, act));
      ug.fill(disc);
      glyph(GLYPH[p.cat], px, py, r * 2 * 0.56, css(mix(p.cat === "sawmill" ? C.mill : C.prog, C.land, act)), 2);
    }
    ug.globalAlpha = 1;
  }

  function drawHubs(dt) {
    const { mark, size } = hubPx();
    const k = reduced ? 1 : 1 - Math.exp(-dt / 100);
    const anyOpen = state.open >= 0;
    HUBS.forEach(([hx, hy], i) => {
      const look = hubLook[i];
      look.on += ((state.open === i ? 1 : 0) - look.on) * k;
      look.dim += ((anyOpen && state.open !== i ? 1 : 0) - look.dim) * k;
      look.hover += ((hoverHub === i ? 1 : 0) - look.hover) * k;
      // the hubs pop in as the dots finish arriving
      const at = 1100 + i * 120;
      const rt = revealAt == null ? -1 : reduced ? 1e6 : clock - revealAt;
      const pop = rt < 0 ? 0 : SPRING(clamp((rt - at) / 700));
      const op = (rt < 0 ? 0 : tween(rt, at, 350)) * (1 - 0.6 * look.dim);
      if (op <= 0.01) return;
      const [cx, cy] = toScreen(hx, hy);
      const R = (size / 2) * (0.5 + 0.5 * pop), mr = (mark / 2) * (0.5 + 0.5 * pop);
      ug.globalAlpha = op;
      const disc = new Path2D();
      disc.arc(cx, cy, R, 0, Math.PI * 2);
      dropShadow(disc, -10, 12, 30, "rgba(0,0,0,.35)");
      // glass, warming to the accent as it opens
      ug.fillStyle = css([255, 255, 255], 0.08 + 0.08 * look.hover);
      ug.fill(disc);
      if (look.on > 0.002) {
        ug.fillStyle = css(C.accent, look.on);
        ug.fill(disc);
      }
      insetShadow(cx, cy, R, 1, 0.5, "rgba(255,255,255,.55)");
      insetShadow(cx, cy, R, 3, 5, "rgba(255,255,255,.22)");
      insetShadow(cx, cy, R, -1, 0.5, "rgba(255,255,255,.18)");
      // the mark: the source blue with the tree, cream with an orange tree when open
      ug.fillStyle = css(mix(C.source, C.land, look.on));
      ug.beginPath();
      ug.arc(cx, cy, mr, 0, Math.PI * 2);
      ug.fill();
      glyph(GLYPH.tree, cx, cy, mr * 2 * (1.3 / 2.1), css(mix(C.mark, C.accent, look.on)), 1.7);
      // its pulse, until a hub opens
      if (!reduced && !anyOpen && look.on < 0.05) {
        const cyc = (((clock - i * 750) % 3000) + 3000) % 3000 / 3000;
        const e = EASE(clamp(cyc / 0.7));
        const pa = (1 - e) * 0.85 * (1 - look.dim);
        if (pa > 0.01) {
          ug.strokeStyle = css(C.source, pa);
          ug.lineWidth = 1;
          ug.beginPath();
          ug.arc(cx, cy, mr * (1 + 1.5 * e), 0, Math.PI * 2);
          ug.stroke();
        }
      }
    });
    ug.globalAlpha = 1;
  }

  function drawUI(dt) {
    ug.setTransform(1, 0, 0, 1, 0, 0);
    ug.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    if (revealAt == null) return;
    ug.setTransform(dpr, 0, 0, dpr, 0, 0);
    fans = fans.filter((f) => f.closing == null || clock - f.closing < 620);
    for (const f of fans) drawFan(f, dt);
    drawHubs(dt);
  }

  /* ---- the tour ---- */

  function runTour(dt) {
    if (!v["motion.tour"] || reduced || revealAt == null) return;
    if (clock - revealAt < 2500) return;
    if (tour.cooldown > 0) { tour.cooldown -= dt; return; }
    if (hoverHub >= 0 || hoverPin) return;
    tour.wait -= dt * v["motion.pace"];
    if (tour.wait > 0) return;
    const s = TOUR[tour.step % TOUR.length];
    if (s.hub != null) {
      const f = () => fans.find((x) => x.hub === s.hub && x.closing == null);
      if (tour.phase === 0) { lightSpecies(null); openHub(s.hub); tour.wait = 1200; tour.phase = 1; }
      else if (tour.phase === 1) { state.active = f()?.items.find((p) => p.cat === "sawmill") ?? null; tour.wait = 3600; tour.phase = 2; }
      else if (tour.phase === 2) { state.active = f()?.items.find((p) => p.cat === "program") ?? null; tour.wait = 3600; tour.phase = 3; }
      else { state.active = null; openHub(-1); tour.wait = 900; tour.phase = 0; tour.step++; }
    } else if (tour.phase === 0) { openHub(-1); lightSpecies(s.species); tour.wait = 2800; tour.phase = 1; }
    else { lightSpecies(null); tour.wait = 800; tour.phase = 0; tour.step++; }
  }
  function stopTour() {
    tour.phase = 0;
    tour.wait = 0;
    state.active = null;
    lightSpecies(null);
    openHub(-1);
  }

  /* ---- the loop ---- */

  function render(dt) {
    if (dotsBusy || reduced) dotsBusy = drawDots(dt);
    drawUI(dt);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(50, Math.max(0, now - last));
    last = now;
    clock += dt;
    if (revealAt == null && HIT) { revealAt = clock; dotsBusy = true; }
    runTour(dt);
    if (pan > 1) {
      const to = focusX();
      if (Math.abs(to - camX) > 0.05) {
        camX += (to - camX) * (1 - Math.exp(-dt / 520));
        OX = oxFor(camX);
        dotsBusy = true;
      }
    }
    render(dt);
  }
  function sync() {
    const run = !reduced && onScreen && tabVisible && W > 1 && !!HIT;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  // reduced motion: everything arrived, the West hub open and still
  function still() {
    if (!HIT) return;
    if (revealAt == null) {
      revealAt = -1e6;
      openHub(0, true);
    }
    clock = 1e6;
    fans.forEach((f) => { f.t0 = -1e6; });
    camX = focusX();
    OX = oxFor(camX);
    render(16);
  }

  /* ---- the pointer, a bonus ---- */

  const toMap = (e) => {
    const r = host.getBoundingClientRect();
    return [(e.clientX - r.left - OX) / S, (e.clientY - r.top - OY) / S, e.clientX - r.left, e.clientY - r.top];
  };
  function pick(sx, sy) {
    const { size } = hubPx();
    for (let i = HUBS.length - 1; i >= 0; i--) {
      const [cx, cy] = toScreen(...HUBS[i]);
      if (Math.hypot(sx - cx, sy - cy) <= size / 2 + 4) return { hub: i };
    }
    const f = fans.find((x) => x.closing == null);
    if (f) for (const p of f.items) {
      const [px, py] = toScreen(p.x, p.y);
      if (Math.hypot(sx - px, sy - py) <= pinPx() / 2 + 3) return { pin: p };
    }
    return null;
  }
  const onMove = (e) => {
    if (e.pointerType !== "mouse") return;
    const [x, y, sx, sy] = toMap(e);
    ptr.x = x; ptr.y = y;
    if (!ptr.on) { ptr.on = true; lens.x = x; lens.y = y; }
    dotsBusy = true;
    const hit = pick(sx, sy);
    hoverHub = hit?.hub ?? -1;
    hoverPin = hit?.pin ?? null;
    if (hoverHub >= 0 && state.open !== hoverHub) {
      lightSpecies(null);
      openHub(hoverHub);
      tour.phase = 0; tour.wait = 0;
    }
    if (hoverPin) state.active = hoverPin;
    host.style.cursor = hit ? "pointer" : "";
    if (hoverHub >= 0 || hoverPin) tour.cooldown = 2600;
    if (reduced) still();
  };
  const onLeave = () => {
    ptr.on = false;
    hoverHub = -1;
    hoverPin = null;
    host.style.cursor = "";
    dotsBusy = true;
    if (reduced) still();
  };
  const onDown = (e) => {
    const [x, y] = toMap(e);
    ripple(x, y);
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("pointerdown", onDown);

  /* ---- wiring ---- */

  const ro = new ResizeObserver(() => {
    layout();
    if (reduced) still(); else render(0);
  });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
  io.observe(host);
  const onVis = () => { tabVisible = !document.hidden; sync(); };
  document.addEventListener("visibilitychange", onVis);

  layout();
  render(0);

  // the region raster, read back once
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    if (destroyed) return;
    const c = document.createElement("canvas");
    c.width = RW;
    c.height = RH;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, RW, RH);
    HIT = g.getImageData(0, 0, RW, RH).data;
    buildDots();
    if (reduced) still();
    sync();
  };
  img.src = RASTER;

  return {
    update(values, path) {
      Object.assign(v, values);
      C = colours();
      if (path == null || path === "dots.spacing" || path === "dots.sourceSize") {
        buildDots();
        fans.forEach((f) => { f.items = fanLayout(f.hub); });
      }
      if (path === "motion.tour" && !v["motion.tour"]) stopTour();
      dotsBusy = true;
      if (reduced) still(); else if (!raf) render(16);
    },
    action() {},
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      img.onload = null;
      dotsCanvas.remove();
      uiCanvas.remove();
      host.style.cursor = "";
    },
  };
}
