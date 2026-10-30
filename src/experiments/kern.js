/* Kern.

   Ported from a kerning study: the professional's way of judging spacing,
   made literal. Sand pours into the space between each pair of letters,
   gap by gap, the word easing open as it fills, so every pair holds a pool
   of grains in proportion to its area. Then the word is kerned optically:
   each pair is set at its closest no-overlap distance and opened until its
   pool, weighted toward the x-height, matches the pool between two n's. The
   letters slide; where a gap tightens, its surplus grains sink out of it and
   gather in a pink heap on the floor below, and where one opens, green grains
   fall in from above. A while later it lets go, the heaps rise back into
   their gaps and the green grains drift up and out, and it kerns again.

   The study measured outlines with opentype.js from a CDN font; here the
   letters are the site's own Neue Montreal, and their left and right ink
   edges are read row by row from the rendered glyphs, which is all the
   kerning needs. The study's counts and notes on each pair, its controls and
   its algorithm switch are not part of it. A click kerns or lets go. */

export const params = {
  word: "Kerning",
  sand: {
    count: [4100, 500, 10000, 50],
    size: [0.8, 0.2, 3, 0.05],
    wobble: [3.5, 0, 10, 0.1],
  },
  motion: {
    pace: [1, 0.2, 3, 0.05],
  },
  colour: {
    ground: "#3e1824",
    // not "type": ks-params reads a group with a type key as one control
    letters: "#c2fbff",
    sand: "#8d7c81",
    shrinks: "#ff70fa",
    grows: "#8aff99",
  },
  kern: { type: "action", label: "Kern" },
};

const FACES = import.meta.glob("../assets/fonts/PPNeueMontreal-Regular.woff2", { query: "?url", import: "default", eager: true });
const FAMILY = "Kern Grotesk";

// The study's numbers were in a 1400 wide stage with its type near 320 units;
// here everything is measured at 200 px and scaled, so its units come over
// at 200 / 320.
const REF = 200;
const U = REF / 320;
const MIN_CLEARANCE = 2;
const DOT_SPEED = 4.5;
const GRAVITY = 0.7, DRIFT = 90, WOBBLE = 22, MAGNET = 0.7;
const FLOOR = 0.385 * REF;
const SPREAD = 0.045 * REF;
const SCATTER = 80 * U;
// the timeline, in ms at pace 1
const POUR_DUR = 2800, POUR_STEP = 180;
const HOLD_AFTER_POUR = 350, TO_OPTICAL = 2400, HOLD_OPTICAL = 4200, TO_DEFAULT = 1400, HOLD_DEFAULT = 2600;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const rgbOf = (h) => {
  const s = String(h).replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(f, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixCss = (a, b, t) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(",")})`;

function mkRng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- glyphs: ink edges, row by row ---------- */

function measureGlyph(ch, font) {
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = font;
  const advance = probe.measureText(ch).width;
  if (/\s/.test(ch)) return { ch, isSpace: true, advance, inkLeft: 0, inkRight: advance, inkTop: -REF * 0.5, inkBottom: 0 };
  const pad = Math.ceil(REF * 0.6), by = Math.ceil(REF * 1.25);
  const w = Math.ceil(advance + pad * 2), h = Math.ceil(REF * 1.75);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.font = font;
  g.fillStyle = "#000";
  g.textBaseline = "alphabetic";
  g.fillText(ch, pad, by);
  const a = g.getImageData(0, 0, w, h).data;
  const rows = [];
  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    const o = y * w * 4 + 3;
    for (let x = 0; x < w; x++) if (a[o + x * 4] >= 128) { l = x; break; }
    if (l >= 0) for (let x = w - 1; x >= l; x--) if (a[o + x * 4] >= 128) { r = x + 1; break; }
    if (l >= 0) {
      rows[y] = [l - pad, r - pad];
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, l - pad);
      right = Math.max(right, r - pad);
    }
  }
  if (top === Infinity) return { ch, isSpace: true, advance, inkLeft: 0, inkRight: advance, inkTop: -REF * 0.5, inkBottom: 0 };
  const n = bottom - top + 1;
  const L = new Array(n).fill(null), R = new Array(n).fill(null);
  for (let y = top; y <= bottom; y++) if (rows[y]) [L[y - top], R[y - top]] = rows[y];
  // rows with no ink inside the glyph (the gap under an i's dot) take the nearest edge, as the study did
  let ll = null, rl = null;
  for (let r = 0; r < n; r++) {
    if (L[r] !== null) ll = L[r]; else if (ll !== null) L[r] = ll;
    if (R[r] !== null) rl = R[r]; else if (rl !== null) R[r] = rl;
  }
  ll = rl = null;
  for (let r = n - 1; r >= 0; r--) {
    if (L[r] !== null) ll = L[r]; else if (ll !== null) L[r] = ll;
    if (R[r] !== null) rl = R[r]; else if (rl !== null) R[r] = rl;
  }
  return { ch, isSpace: false, advance, L, R, yMin: top - by, n, inkLeft: left, inkRight: right, inkTop: top - by, inkBottom: bottom - by };
}
const rightAt = (d, y) => {
  const r = Math.round(y - d.yMin);
  return r < 0 || r >= d.n ? null : d.R[r];
};
const leftAt = (d, y) => {
  const r = Math.round(y - d.yMin);
  return r < 0 || r >= d.n ? null : d.L[r];
};

/* ---------- the study's kerning maths ---------- */

function span(a, b) {
  return [Math.ceil(Math.max(a.inkTop, b.inkTop)), Math.floor(Math.min(a.inkBottom, b.inkBottom))];
}
function poolArea(a, b, dx) {
  if (a.isSpace || b.isSpace) return 0;
  const [y0, y1] = span(a, b);
  let area = 0;
  for (let y = y0; y <= y1; y++) {
    const aR = rightAt(a, y), bL = leftAt(b, y);
    if (aR == null || bL == null) continue;
    const gap = dx + bL - aR;
    if (gap > 0) area += gap;
  }
  return area;
}
function minNoOverlapDx(a, b) {
  const [y0, y1] = span(a, b);
  let mc = -Infinity;
  for (let y = y0; y <= y1; y++) {
    const aR = rightAt(a, y), bL = leftAt(b, y);
    if (aR == null || bL == null) continue;
    mc = Math.max(mc, aR - bL);
  }
  return (mc === -Infinity ? 0 : mc) + MIN_CLEARANCE;
}
function heightWeight(y, m) {
  const mu = (m.xTop + m.xBot) / 2, sig = (m.xBot - m.xTop) * 0.55, d = y - mu;
  return Math.exp(-(d * d) / (2 * sig * sig));
}
function weightedPoolArea(a, b, dx, m) {
  if (a.isSpace || b.isSpace) return 0;
  const [y0, y1] = span(a, b);
  let area = 0;
  for (let y = y0; y <= y1; y++) {
    const aR = rightAt(a, y), bL = leftAt(b, y);
    if (aR == null || bL == null) continue;
    const gap = dx + bL - aR;
    if (gap > 0) area += gap * heightWeight(y, m);
  }
  return area;
}
function dxForWeightedTarget(a, b, target, dxFloor, m) {
  if (weightedPoolArea(a, b, dxFloor, m) >= target) return dxFloor;
  let lo = dxFloor, hi = dxFloor + 60, safe = 0;
  while (weightedPoolArea(a, b, hi, m) < target && safe++ < 12) hi += 200;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    weightedPoolArea(a, b, mid, m) < target ? (lo = mid) : (hi = mid);
  }
  return (lo + hi) / 2;
}

/* ---------- mount ---------- */

export function mount(host, values, ctx = {}) {
  const reduced = Boolean(ctx.reducedMotion);
  let v = { ...values };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:pointer;";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 1, H = 1, dpr = 1;
  let fontReady = false, face = null;
  const fontAt = (px) => `400 ${px}px "${FAMILY}", "Helvetica Neue", Arial, sans-serif`;

  /* ----- the word, measured and kerned ----- */
  let letters = [], def = [], opt = [], mid = [], tight = [];
  let metrics = null, wordW = 1, wordAsc = REF * 0.75;
  function layoutWord() {
    const text = Array.from(String(v.word ?? "").slice(0, 16));
    const font = fontAt(REF);
    letters = text.map((ch) => measureGlyph(ch, font));
    def = [];
    opt = [];
    if (!letters.length) return;
    const xg = measureGlyph("x", font), ng = measureGlyph("n", font);
    metrics = { xTop: xg.inkTop, xBot: xg.inkBottom, xH: xg.inkBottom - xg.inkTop };
    // as set: the font's own advances and kerning
    const p = document.createElement("canvas").getContext("2d");
    p.font = font;
    if ("fontKerning" in p) p.fontKerning = "normal";
    const s = text.join("");
    for (let i = 0; i < text.length; i++) {
      def.push(i === 0 ? 0 : p.measureText(s.slice(0, i + 1)).width - p.measureText(text[i]).width);
    }
    // optical: closest distance plus a margin, opened until the x-height
    // weighted pool matches the one between two n's
    const target = weightedPoolArea(ng, ng, minNoOverlapDx(ng, ng) + metrics.xH * 0.14, metrics);
    const fc = metrics.xH * 0.08;
    opt = [0];
    for (let i = 0; i < letters.length - 1; i++) {
      const a = letters[i], b = letters[i + 1];
      const dx = a.isSpace || b.isSpace ? a.advance : dxForWeightedTarget(a, b, target, minNoOverlapDx(a, b) + fc, metrics);
      opt.push(opt[i] + dx);
    }
    // the pour opens from a fifth tighter; the kern tightens what shrinks first, then opens what grows
    tight = def.map((x) => def[0] + (x - def[0]) * 0.8);
    mid = [def[0]];
    for (let i = 0; i < letters.length - 1; i++) mid.push(mid[i] + Math.min(def[i + 1] - def[i], opt[i + 1] - opt[i]));
    const inked = letters.filter((d) => !d.isSpace);
    wordAsc = inked.length ? -Math.min(...inked.map((d) => d.inkTop)) : REF * 0.75;
    const first = letters[0], last = letters[letters.length - 1];
    wordW = Math.max(1, opt[opt.length - 1] + last.inkRight - (opt[0] + first.inkLeft));
  }

  /* ----- the piece's scale ----- */
  let fs = REF, s = 1, cx = 0, by = 0;
  function fit() {
    // the study set the word across 70% of its stage; a little less here, so the Playground panel clears it
    const share = W < H ? 0.84 : 0.64;
    fs = REF * Math.min((share * W) / wordW, (0.4 * H) / Math.max(1, wordAsc), (0.2 * W) / Math.max(1, wordAsc));
    fs = Math.max(12, fs);
    s = fs / REF;
    cx = W / 2;
    by = H / 2 + 0.25 * fs;
  }
  // a word laid out at pen positions, centred on its ink
  function centred(pos) {
    if (!pos.length) return pos;
    const first = letters[0], last = letters[letters.length - 1];
    const le = pos[0] + first.inkLeft, re = pos[pos.length - 1] + last.inkRight;
    const off = -(le + re) / 2;
    return pos.map((x) => x + off);
  }

  /* ----- the sand ----- */
  let gaps = [];
  function gapPoints(i, count, dx) {
    const a = letters[i], b = letters[i + 1];
    if (!a || !b || a.isSpace || b.isSpace) return [];
    const [y0, y1] = span(a, b);
    if (y1 <= y0) return [];
    const rand = mkRng(i * 7919 + 31337);
    const pts = [];
    for (let at = 0; pts.length < count && at < count * 8; at++) {
      const y = y0 + rand() * (y1 - y0);
      const aR = rightAt(a, y), bL = leftAt(b, y);
      if (aR == null || bL == null || dx + bL - aR <= 0) {
        rand();
        continue;
      }
      pts.push({ y, xf: rand() });
    }
    pts.sort((p, q) => q.y - p.y);
    return pts;
  }
  const effectiveCount = () => Math.round(v["sand.count"] * clamp(Math.pow(fs / 325, 1.3), 0.2, 1.5));
  function buildSand() {
    gaps = [];
    const n = letters.length - 1;
    if (n < 1) return;
    const areas = (pos) => letters.slice(0, -1).map((a, i) => Math.max(0, poolArea(a, letters[i + 1], pos[i + 1] - pos[i])));
    const dA = areas(def), oA = areas(opt);
    const density = effectiveCount() / (dA.reduce((x, y) => x + y, 0) || 1);
    const counts = (A) => A.map((x) => (x > 0 ? Math.max(8, Math.round(density * x)) : 0));
    const D = counts(dA), O = counts(oA);
    const surplus = D.map((d, i) => Math.max(0, d - O[i]));
    const maxSurplus = Math.max(1, ...surplus);
    for (let i = 0; i < n; i++) {
      const rand = mkRng(i * 3141 + 59265);
      const grain = (p) => ({ y: p.y, xf: p.xf, ph: rand() * Math.PI * 2, fr: 0.5 + rand() * 0.9, mode: "in", t0: 0, xo: 0, yo: 0 });
      const sand = gapPoints(i, D[i], def[i + 1] - def[i]).map(grain);
      // where the kern tightens the gap, its bottom grains are the ones that sink
      const sinkers = sand.slice(0, surplus[i]);
      const fr = mkRng(i * 5551 + 7777);
      for (const q of sinkers) {
        q.xo = (fr() * 2 - 1) * SPREAD;
        q.yo = fr() * SCATTER * (surplus[i] / maxSurplus);
      }
      // where it opens, new grains fall into the top of the wider pool
      const grows = O[i] > D[i] ? gapPoints(i, O[i], opt[i + 1] - opt[i]).slice(D[i]).map(grain) : [];
      for (const q of grows) q.mode = "away";
      gaps.push({ sand, sinkers, grows });
    }
  }

  /* ----- the timeline ----- */
  let clock = 0; // ms, at the piece's pace
  let phase = "pour", phaseT = 0;
  function setPhase(p) {
    phase = p;
    phaseT = clock;
    if (p === "toOptical") {
      for (const gp of gaps) {
        const E = gp.sinkers.length;
        gp.sinkers.forEach((q, j) => { q.mode = "sink"; q.t0 = clock + (j * 300) / Math.max(1, E); });
        const G = gp.grows.length;
        gp.grows.forEach((q, j) => { q.mode = "fall"; q.t0 = clock + (j * 180) / Math.max(1, G); });
      }
    } else if (p === "toDefault") {
      for (const gp of gaps) {
        const E = gp.sinkers.length;
        gp.sinkers.forEach((q, j) => { q.mode = "rise"; q.t0 = clock + (j * 180) / Math.max(1, E); });
        const G = gp.grows.length;
        gp.grows.forEach((q, j) => {
          if (q.mode === "fall" && q.t0 > clock) q.mode = "away";
          else { q.mode = "out"; q.t0 = clock + (j * 300) / Math.max(1, G); }
        });
      }
    }
  }
  const pourEnd = () => Math.max(0, letters.length - 2) * POUR_STEP + POUR_DUR;
  function advanceTimeline() {
    const t = clock - phaseT;
    if (phase === "pour" && t > pourEnd() + HOLD_AFTER_POUR) setPhase("toOptical");
    else if (phase === "toOptical" && t > TO_OPTICAL) setPhase("optical");
    else if (phase === "optical" && t > HOLD_OPTICAL) setPhase("toDefault");
    else if (phase === "toDefault" && t > TO_DEFAULT) setPhase("default");
    else if (phase === "default" && t > HOLD_DEFAULT) setPhase("toOptical");
  }
  function fillOf(i) {
    if (phase !== "pour") return 1;
    return clamp((clock - phaseT - i * POUR_STEP) / POUR_DUR, 0, 1);
  }
  const lerpPos = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  function positions() {
    const t = clock - phaseT;
    if (phase === "pour") {
      const pos = tight.slice();
      let shift = 0;
      for (let j = 1; j < pos.length; j++) {
        shift += (def[j] - def[j - 1] - (tight[j] - tight[j - 1])) * easeIO(fillOf(j - 1));
        pos[j] = tight[j] + shift;
      }
      return pos;
    }
    if (phase === "toOptical") {
      return t < 1200 ? lerpPos(def, mid, easeIO(clamp(t / 1200, 0, 1))) : lerpPos(mid, opt, easeIO(clamp((t - 1200) / 1200, 0, 1)));
    }
    if (phase === "optical") return opt;
    if (phase === "toDefault") return lerpPos(opt, def, easeIO(clamp(t / 1200, 0, 1)));
    return def;
  }

  /* ----- drawing ----- */
  const pointer = { x: 0, y: 0, on: false };
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, W, H);
    if (!fontReady || !letters.length) return;

    const pos = centred(positions());
    const time = reduced ? 0 : clock / 1000;
    const amp = reduced ? 0 : v["sand.wobble"] * U;
    const r1 = Math.max(0.55, v["sand.size"] * U * s);
    const topRef = (0 - by) / s;
    const sand = rgbOf(v["colour.sand"]), pink = rgbOf(v["colour.shrinks"]);
    const SX = (x) => cx + x * s, SY = (y) => by + y * s;
    const stirR = 60, stirK = 16;

    const dot = (x, y, r, fill, alpha) => {
      let X = SX(x), Y = SY(y);
      if (pointer.on) {
        const dx = X - pointer.x, dy = Y - pointer.y, d = Math.hypot(dx, dy);
        if (d < stirR && d > 0.01) {
          const q = (1 - d / stirR) ** 2 * stirK;
          X += (dx / d) * q;
          Y += (dy / d) * q;
        }
      }
      g.globalAlpha = alpha;
      g.fillStyle = fill;
      g.beginPath();
      g.arc(X, Y, r, 0, Math.PI * 2);
      g.fill();
    };

    for (let i = 0; i < gaps.length; i++) {
      const a = letters[i], b = letters[i + 1];
      const gp = gaps[i];
      if (!gp || a.isSpace || b.isSpace) continue;
      const [y0, y1] = span(a, b);
      const edges = (y) => {
        const aR = rightAt(a, y), bL = leftAt(b, y);
        if (aR == null || bL == null) return null;
        const gL = pos[i] + aR, gR = pos[i + 1] + bL;
        return gR > gL ? [gL, gR] : null;
      };
      const centre = (pos[i] + a.inkRight + pos[i + 1] + b.inkLeft) / 2;
      const settledAt = (q) => {
        const e = edges(q.y);
        if (!e) return null;
        const ts = time * q.fr * DOT_SPEED;
        return [e[0] + q.xf * (e[1] - e[0]) + Math.sin(ts + q.ph) * amp * 0.75, q.y + Math.cos(ts * 1.25 + q.ph * 1.7) * amp * 0.5];
      };
      const floorAt = (q) => {
        const ts = time * q.fr * DOT_SPEED;
        return [centre + q.xo + Math.sin(ts + q.ph) * amp * 0.3, FLOOR + q.yo + Math.cos(ts * 1.25 + q.ph) * amp * 0.15];
      };
      const fill = fillOf(i);
      const np = gp.sand.length;

      // the sand: pouring in, settled, or sinking to the floor and back
      for (let j = 0; j < np; j++) {
        const q = gp.sand[j];
        if (phase === "pour" || q.mode === "in") {
          const tRelease = (j / Math.max(1, np - 1)) * 0.65;
          const fallT = phase === "pour" ? clamp((fill - tRelease) / 0.35, 0, 1) : 1;
          if (fallT <= 0) break; // sorted bottom up: nothing after this has landed yet
          if (fallT < 1) {
            const e = edges(q.y);
            if (!e) continue;
            const tx = e[0] + q.xf * (e[1] - e[0]), mx = (e[0] + e[1]) / 2;
            const yStart = topRef - (20 + q.ph * 60) * U;
            const y = yStart + (q.y - yStart) * Math.pow(fallT, 1.5 + GRAVITY);
            let x = mx + (tx - mx) * Math.pow(fallT, 1 / (MAGNET * 2));
            x += Math.sin(q.ph * Math.PI * 2) * DRIFT * U * 0.25 * (1 - fallT) ** 2;
            x += Math.sin(fallT * 15 + q.ph * 8) * WOBBLE * U * 0.12 * fallT * (1 - fallT);
            dot(x, y, r1, `rgb(${sand})`, Math.min(1, fallT * 3));
            continue;
          }
          const p = settledAt(q);
          if (!p) continue;
          // a small bounce as each grain lands
          let bounce = 0;
          if (phase === "pour") {
            const landed = (clock - phaseT - i * POUR_STEP - (tRelease + 0.35) * POUR_DUR) / 1000;
            if (landed > 0) bounce = Math.sin(landed * 24) * Math.exp(-landed * 9) * 2.2 * U;
          }
          dot(p[0], p[1] - bounce, r1, `rgb(${sand})`, 1);
        } else if (q.mode === "sink" || q.mode === "rise") {
          let k = q.mode === "sink" ? (clock - q.t0) / 1000 : (clock - q.t0) / 900;
          if (k < 0) {
            const p = q.mode === "sink" ? settledAt(q) : floorAt(q);
            if (p) dot(p[0], p[1], q.mode === "sink" ? r1 : r1 * 2, q.mode === "sink" ? `rgb(${sand})` : `rgb(${pink})`, 1);
            continue;
          }
          k = Math.min(1, k);
          const e = easeIO(q.mode === "sink" ? k : 1 - k);
          const a0 = settledAt(q) ?? floorAt(q), b0 = floorAt(q);
          dot(a0[0] + (b0[0] - a0[0]) * e, a0[1] + (b0[1] - a0[1]) * e, r1 * (1 + e), mixCss(sand, pink, e), 1);
          if (k >= 1) q.mode = q.mode === "sink" ? "floor" : "in";
        } else if (q.mode === "floor") {
          const p = floorAt(q);
          dot(p[0], p[1], r1 * 2, `rgb(${pink})`, 1);
        }
      }

      // the green grains: falling into the opened gap, settled, or drifting up and away
      const green = v["colour.grows"];
      for (const q of gp.grows) {
        if (q.mode === "away") continue;
        if (q.mode === "fall") {
          const k = (clock - q.t0) / 1000;
          if (k < 0) continue;
          const t = Math.min(1, k);
          const yTop = topRef - (40 + q.ph * 80) * U;
          const y = yTop + (q.y - yTop) * easeIO(t);
          // inside the gap it follows the edges at its own height, so it never crosses the ink
          const e = y >= Math.max(a.inkTop, b.inkTop) ? edges(y) : null;
          const e2 = e ?? edges(q.y);
          if (!e2) continue;
          dot(e2[0] + q.xf * (e2[1] - e2[0]), y, r1 * 2, green, Math.min(1, t * 2.5));
          if (t >= 1) q.mode = "in";
        } else if (q.mode === "in") {
          const p = settledAt(q);
          if (p) dot(p[0], p[1], r1 * 2, green, 1);
        } else if (q.mode === "out") {
          const k = (clock - q.t0) / 1100;
          const p = settledAt(q) ?? [centre, q.y];
          if (k < 0) {
            dot(p[0], p[1], r1 * 2, green, 1);
            continue;
          }
          const t = Math.min(1, k);
          const y = p[1] - easeIO(t) * (p[1] - topRef + 50 * U);
          dot(p[0], y, r1 * 2, green, t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1);
          if (t >= 1) q.mode = "away";
        }
      }

      // a faint mist of dust rising off each full pool
      if (fill >= 0.7 && !reduced) {
        const dust = Math.min(1, (fill - 0.7) / 0.3);
        for (let d = 0; d < 5; d++) {
          const ph = (((time * 0.36 + d / 5 + i * 0.29) % 1) + 1) % 1;
          const dy = y0 + (y1 - y0) * 0.06 - ph * (y1 - y0) * 0.26;
          const e = edges(clamp(dy, y0, y1 - 1));
          if (!e) continue;
          dot(e[0] + ((d * 0.168 + i * 0.618) % 1) * (e[1] - e[0]), dy, Math.max(0.6, 0.38 * U * s), `rgb(${sand})`, Math.sin(ph * Math.PI) * 0.18 * dust);
        }
      }
    }

    // the letters, over their sand
    g.globalAlpha = 1;
    g.fillStyle = v["colour.letters"];
    g.font = fontAt(fs);
    g.textBaseline = "alphabetic";
    if ("fontKerning" in g) g.fontKerning = "none";
    for (let i = 0; i < letters.length; i++) if (!letters[i].isSpace) g.fillText(letters[i].ch, SX(pos[i]), by);
  }

  /* ----- loop ----- */
  let raf = 0, last = 0, pending = 0;
  let visible = !document.hidden, onscreen = true;
  const live = () => !reduced && visible && onscreen && fontReady;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt * 1000 * v["motion.pace"];
    advanceTimeline();
    draw();
  }
  function sync() {
    if (live()) {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  function redraw() {
    if (raf || pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      draw();
    });
  }

  // Reduced motion: the kerned word, settled, its heaps on the floor.
  function settleKerned(kerned = true) {
    phase = kerned ? "optical" : "default";
    phaseT = clock;
    for (const gp of gaps) {
      for (const q of gp.sinkers) q.mode = kerned ? "floor" : "in";
      for (const q of gp.grows) q.mode = kerned ? "in" : "away";
    }
  }

  function rebuild() {
    if (!fontReady) return;
    layoutWord();
    fit();
    buildSand();
    if (reduced) settleKerned();
    else {
      phase = "pour";
      phaseT = clock;
    }
    redraw();
  }

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (fontReady && letters.length) {
      const before = effectiveCount();
      fit();
      // the grain count follows the type's size; rebuild only when it really moves
      if (Math.abs(effectiveCount() - before) > before * 0.25) {
        const was = phase;
        buildSand();
        if (reduced || was === "optical" || was === "toOptical") settleKerned(true);
        else if (was !== "pour") settleKerned(false);
      }
    }
    draw();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver((entries) => {
    onscreen = entries[entries.length - 1].isIntersecting;
    sync();
  });
  io.observe(host);
  const onVisibility = () => {
    visible = !document.hidden;
    sync();
  };
  document.addEventListener("visibilitychange", onVisibility);

  // a click kerns the word, or lets it go
  function toggle() {
    if (reduced) {
      settleKerned(phase !== "optical");
      redraw();
      return;
    }
    if (phase === "optical") setPhase("toDefault");
    else if (phase === "default" || (phase === "pour" && clock - phaseT > pourEnd())) setPhase("toOptical");
  }
  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.on = e.pointerType === "mouse" || e.buttons > 0;
  };
  const onLeave = () => {
    pointer.on = false;
  };
  const onDown = () => toggle();
  if (!reduced) {
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointercancel", onLeave);
  }
  host.addEventListener("pointerdown", onDown);

  let dead = false;
  const start = () => {
    if (dead) return;
    fontReady = true;
    resize();
    rebuild();
    sync();
  };
  const faceUrl = Object.values(FACES)[0];
  resize();
  if (faceUrl && typeof FontFace === "function") {
    face = new FontFace(FAMILY, `url(${faceUrl}) format("woff2")`, { weight: "400" });
    document.fonts.add(face);
    face.load().then(start, () => {
      document.fonts.delete(face);
      face = null;
      start();
    });
  } else start();

  return {
    update(next, path) {
      const prev = v;
      v = { ...next };
      if (path == null || path === "word") {
        if (prev.word !== v.word || path == null) rebuild();
      } else if (path === "sand.count") {
        buildSand();
        if (reduced) settleKerned();
        else {
          phase = "pour";
          phaseT = clock;
        }
      }
      if (!raf) redraw();
    },
    action(name) {
      if (name === "kern") toggle();
    },
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      if (pending) cancelAnimationFrame(pending);
      raf = pending = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      host.removeEventListener("pointerdown", onDown);
      if (face) document.fonts.delete(face);
      canvas.remove();
    },
  };
}
