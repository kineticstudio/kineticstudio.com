/* Glyph morph.

   From Natural Capital (their round two): one set of notation characters
   (digits, operators and strokes) on grainy paper builds an object, holds
   it, then re-forms into the next: a butterfly, a launch vehicle, a
   protein holding an ion, a satellite, a portal, a capsule under its
   parachute, a chip, an ocean drone, a tree, a dendrimer. Everything sits
   on one grid, centred and mirrored about its middle column, and a
   character never leaves its cell. A standing object lives in place:
   cells light, fill and change character. The pointer warms the grid on
   both sides of the axis at once, and a click moves on to the next object.

   Each object is drawn once into a small mask (red says bare character,
   filled block or lit block, green which part it is), only its left half
   read; the right half is its mirror. Their portfolio tab and caption are
   left out. The characters are IBM Plex Mono Medium, their face, cut down
   to the dozen glyphs used (public/media/play/glyph-morph/). */

export const params = {
  grid: {
    cell: [9, 5, 24, 1],
    size: [0.64, 0.3, 0.95, 0.01],
  },
  motion: {
    hold: [4.5, 1.5, 10, 0.1],
    flicker: [0.5, 0, 3, 0.01],
    travel: { type: "toggle", labels: ["Glide", "Hop cell to cell"], default: true },
  },
  cursor: {
    radius: [110, 0, 300, 1],
  },
  colour: {
    paper: "#e9e5da",
    ink: "#1b1d1a",
    moss: "#1f3a1c",
    signal: "#c8ff3d",
  },
  next: { type: "action", label: "Next object" },
};

// The site's root, from <link rel="site-root">, so this also works framed from a folder
const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const FONT_URL = new URL("media/play/glyph-morph/plex-mono-500.woff2", ROOT).href;
const FAMILY = "ks-glyph-morph-mono";
const MONO = `"${FAMILY}", ui-monospace, Menlo, monospace`;

// the source's settings that stay put
const LIFE = 1, REVEAL = 0.6, GRAIN = 1, MIRROR_GLYPHS = true, MIRROR_CURSOR = true;
const ORDER = ["butterfly", "rocket", "protein", "satellite", "portal", "capsule", "chip", "sail", "tree", "dendrimer"];

// Notation rather than letters: digits, operators and strokes.
const CHARS = ["0", "1", "0", "1", "0", "1", "+", "+", "×", "=", "-", ":", "/", "\\", "<", ">", "·"];
const GLYPHS = [...new Set(CHARS)];
const MIRROR = { "/": "\\", "\\": "/", "<": ">", ">": "<" };
const gi = (ch) => GLYPHS.indexOf(ch);
const pick = () => CHARS[Math.floor(Math.random() * (CHARS.length - 1))];
const T1 = 80, T2 = 160, T3 = 240;
const PART = { still: 0, wing: 1, spot: 2, exhaust: 3, canopy: 4, body: 5, helix: 6, ion: 7, signal: 8, panel: 9, globe: 10, sea: 11, pulse: 12 };
const col = (t, g = 0) => `rgb(${t},${g * 20},0)`;
const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const fract = (x) => x - Math.floor(x);
const up = (tone) => Math.min(3, tone + 1);
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const lum = (hex) => {
  const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
};

function ellipse(c, x, y, rx, ry, rot, t, g) { c.fillStyle = col(t, g); c.beginPath(); c.ellipse(x, y, Math.max(0.6, rx), Math.max(0.6, ry), rot, 0, 7); c.fill(); }
function rect(c, x, y, w, h, t, g) { c.fillStyle = col(t, g); c.fillRect(x, y, w, h); }
function line(c, x0, y0, x1, y1, lw, t, g) { c.strokeStyle = col(t, g); c.lineWidth = lw; c.lineCap = "round"; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function poly(c, pts, t, g) { c.fillStyle = col(t, g); c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); }

/* The objects, as the source draws them. live(t, u, v, time, L, k) returns a
   standing cell's tone (0 empty .. 3 lit); k carries the figure's measures
   and helpers. Sizes are in cells, so a line of 1.1 always lands on one. */
const SHAPES = {
  butterfly: {
    aspect: 1.32,
    draw(c, w, h) {
      const cx = w / 2, s = -1;
      ellipse(c, cx + s * w * 0.27, h * 0.37, w * 0.25, h * 0.27, s * 0.45, T1, PART.wing);
      ellipse(c, cx + s * w * 0.27, h * 0.37, w * 0.2, h * 0.21, s * 0.45, T2, PART.wing);
      ellipse(c, cx + s * w * 0.19, h * 0.7, w * 0.16, h * 0.19, -s * 0.55, T1, PART.wing);
      ellipse(c, cx + s * w * 0.19, h * 0.7, w * 0.12, h * 0.14, -s * 0.55, T2, PART.wing);
      ellipse(c, cx + s * w * 0.37, h * 0.27, w * 0.035, h * 0.045, 0, T3, PART.spot);
      ellipse(c, cx + s * w * 0.3, h * 0.44, w * 0.02, h * 0.028, 0, T1, PART.spot);
      ellipse(c, cx + s * w * 0.21, h * 0.74, w * 0.025, h * 0.035, 0, T3, PART.spot);
      c.strokeStyle = col(T1, PART.body); c.lineWidth = Math.max(1.1, w * 0.012);
      c.beginPath(); c.moveTo(cx + s * w * 0.01, h * 0.2); c.quadraticCurveTo(cx + s * w * 0.05, h * 0.04, cx + s * w * 0.12, h * 0.02); c.stroke();
      ellipse(c, cx, h * 0.52, w * 0.028, h * 0.33, 0, T2, PART.body);
    },
    // rings run out from the thorax to the wing tips, the same on both wings
    live(t, u, v, time, L, k) { return t.part === PART.wing && fract(Math.hypot(u, ((v - 0.47) * k.meta.bh) / k.meta.half) * 1.3 - time * 0.5) < 0.055 * L ? up(t.tone) : t.tone; },
  },
  // a modern launch vehicle: a slender tank, an ogive fairing, an interstage, grid fins, engines and legs
  rocket: {
    aspect: 0.26,
    draw(c, w, h) {
      const cx = w / 2, r = w * 0.2, B = PART.body;
      c.fillStyle = col(T2, B); c.beginPath(); c.moveTo(cx, h * 0.004);
      c.bezierCurveTo(cx - r * 0.6, h * 0.02, cx - r, h * 0.07, cx - r, h * 0.15); c.lineTo(cx + r, h * 0.15);
      c.bezierCurveTo(cx + r, h * 0.07, cx + r * 0.6, h * 0.02, cx, h * 0.004); c.fill();
      ellipse(c, cx, h * 0.014, r * 0.25, h * 0.009, 0, T3, B);
      rect(c, cx - r, h * 0.15, 2 * r, 1, T1, B);
      rect(c, cx - r, h * 0.15 + 1, 2 * r, h * 0.21 - 1, T2, B);
      rect(c, cx - r, h * 0.36, 2 * r, 1.2, T3, B);
      rect(c, cx - r, h * 0.36 + 1.2, 2 * r, h * 0.49 - 1.2, T2, B);
      for (const s of [-1, 1]) rect(c, cx + s * r * 0.52 - 0.55, h * 0.17, 1.1, h * 0.67, T1, B);
      for (const s of [-1, 1]) rect(c, s < 0 ? cx - r * 1.55 : cx + r, h * 0.385, r * 0.55, 1.1, T1, B);
      rect(c, cx - r * 1.08, h * 0.85, r * 2.16, 1.1, T1, B);
      for (const x of [-0.58, 0, 0.58]) poly(c, [[cx + (x - 0.16) * r, h * 0.862], [cx + (x + 0.16) * r, h * 0.862], [cx + (x + 0.26) * r, h * 0.91], [cx + (x - 0.26) * r, h * 0.91]], T2, B);
      for (const s of [-1, 1]) { line(c, cx + s * r, h * 0.7, cx + s * r * 2.3, h * 0.955, 1.1, T1, B); rect(c, cx + s * r * 2.3 - r * 0.3, h * 0.955, r * 0.6, 1.1, T2, B); }
      // the exhaust is bare characters only, and they flicker in place
      poly(c, [[cx - r * 0.8, h * 0.915], [cx + r * 0.8, h * 0.915], [cx, h]], T1, PART.exhaust);
    },
    live(t, u, v, time, L, k) {
      if (t.part === PART.exhaust) return hash(t.c, t.r, Math.floor(time * 14)) < (1 - Math.max(0, (v - 0.915) / 0.085) * 0.85) * (0.5 + 0.45 * L) ? 1 : 0;
      if (t.part === PART.body && k.atRow(t, 0.85 - fract(time * 0.18) * 0.85)) return up(t.tone);
      return t.tone;
    },
  },
  // a helix bundle holding a metal ion in its pocket
  protein: {
    aspect: 0.5,
    draw(c, w, h) {
      rect(c, w * 0.06, h * 0.03, w * 0.88, h * 0.94, T1, PART.helix);
      ellipse(c, w / 2, h * 0.5, w * 0.27, w * 0.27, 0, T1, PART.signal);
      ellipse(c, w / 2, h * 0.5, w * 0.11, w * 0.11, 0, T3, PART.ion);
    },
    live(t, u, v, time, L, k) {
      if (t.part === PART.helix) return k.helixTone(t, u, time * L, false);
      if (t.part === PART.signal) return fract(k.cellsFrom(u, v, 0, 0.5) / 3.2 + time * 0.9 * L) < 0.3 ? 1 : 0;
      return t.tone;
    },
  },
  // a navigation satellite: bus, two solar wings, and its signal fanning down
  satellite: {
    aspect: 1.9,
    draw(c, w, h) {
      const cx = w / 2;
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? cx - w * 0.47 : cx + w * 0.12, pw = w * 0.35;
        rect(c, x0, h * 0.36, pw, h * 0.28, T2, PART.panel);
        for (let i = 0; i <= 7; i++) rect(c, x0 + (i * pw) / 7 - 0.5, h * 0.36, 1, h * 0.28, T1, PART.panel);
        rect(c, x0, h * 0.5 - 0.5, pw, 1, T1, PART.panel);
      }
      rect(c, cx - w * 0.12, h * 0.5 - 0.6, w * 0.24, 1.2, T1, PART.body);
      rect(c, cx - w * 0.06, h * 0.28, w * 0.12, h * 0.44, T2, PART.body);
      rect(c, cx - w * 0.025, h * 0.28, w * 0.05, h * 0.06, T3, PART.body);
      rect(c, cx - 0.6, h * 0.1, 1.2, h * 0.18, T1, PART.body);
      ellipse(c, cx, h * 0.1, 1.3, 1.3, 0, T3, PART.spot);
      c.fillStyle = col(T1, PART.signal); c.beginPath(); c.moveTo(cx, h * 0.75); c.arc(cx, h * 0.75, h * 0.25, Math.PI * 0.27, Math.PI * 0.73); c.closePath(); c.fill();
      rect(c, cx - w * 0.04, h * 0.72, w * 0.08, 1.6, T3, PART.body);
    },
    live(t, u, v, time, L, k) {
      if (t.part === PART.panel && fract(u * 1.6 - time * 0.45) < 0.05 * L) return up(t.tone);
      if (t.part === PART.signal) return fract(k.cellsFrom(u, v, 0, 0.75) / 4 - time * 0.9 * L) < 0.3 ? 1 : 0;
      return t.tone;
    },
  },
  // a portal: an arch on a slab, and through it another world
  portal: {
    aspect: 0.78,
    draw(c, w, h) {
      const arch = (x0, x1, top, bot) => { const r = (x1 - x0) / 2; c.beginPath(); c.moveTo(x0, bot); c.lineTo(x0, top + r); c.arc(x0 + r, top + r, r, Math.PI, 0); c.lineTo(x1, bot); c.closePath(); };
      c.fillStyle = col(T2, PART.body); arch(w * 0.1, w * 0.9, h * 0.02, h * 0.9); c.fill();
      c.fillStyle = col(T1, PART.globe); arch(w * 0.27, w * 0.73, h * 0.15, h * 0.9); c.fill();
      c.fillStyle = col(T1, PART.still); c.fillRect(0, h * 0.9, w, Math.max(1.1, h * 0.05));
    },
    // the world through the door: a rolling horizon, a sun, furrows running toward you
    live(t, u, v, time, L, k) {
      if (t.part !== PART.globe) return t.tone;
      const hz = 0.66 + 0.035 * Math.sin(u * 5 - time * 0.8 * L) + 0.02 * Math.sin(u * 11 + time * 0.5 * L);
      if (v > hz) return fract((v - hz) * 9 - time * 0.6 * L) < 0.18 ? 3 : 2;
      if (Math.hypot(u * k.meta.half, (v - 0.45) * k.meta.bh) < k.meta.bh * 0.06) return 3;
      return 1;
    },
  },
  // a reentry capsule coming home under its parachute
  capsule: {
    aspect: 0.8,
    draw(c, w, h) {
      const cx = w / 2;
      c.fillStyle = col(T2, PART.canopy); c.beginPath(); c.ellipse(cx, h * 0.3, w * 0.46, h * 0.26, 0, Math.PI, 0); c.closePath(); c.fill();
      for (const g of [-0.66, -0.33, 0, 0.33, 0.66]) line(c, cx + g * w * 0.16, h * 0.06, cx + g * w * 0.46, h * 0.3, 1, T1, PART.canopy);
      ellipse(c, cx, h * 0.05, w * 0.05, 1, 0, T3, PART.canopy);
      for (const s of [-1, 1]) for (const x of [0.45, 0.3, 0.15]) line(c, cx + s * w * x, h * 0.3, cx + s * w * 0.05, h * 0.7, 0.9, T1, PART.still);
      poly(c, [[cx - w * 0.05, h * 0.7], [cx + w * 0.05, h * 0.7], [cx + w * 0.16, h * 0.86], [cx - w * 0.16, h * 0.86]], T2, PART.body);
      rect(c, cx - w * 0.09, h * 0.76, w * 0.18, 1, T1, PART.body);
      ellipse(c, cx, h * 0.7, 1.2, 1.2, 0, T3, PART.spot);
      c.fillStyle = col(T3, PART.body); c.beginPath(); c.ellipse(cx, h * 0.86, w * 0.17, h * 0.035, 0, 0, Math.PI); c.fill();
    },
    live(t, u, v, time, L) { return t.part === PART.canopy && fract(v * 2.5 - time * 0.5) < 0.05 * L ? up(t.tone) : t.tone; },
  },
  // a chip: pins, package, die, and the grid of cores
  chip: {
    aspect: 1,
    draw(c, w, h) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const p = 0.16 + i * (0.68 / (n - 1));
        rect(c, w * p - 0.6, h * 0.02, 1.2, h * 0.07, T1, PART.signal); rect(c, w * p - 0.6, h * 0.91, 1.2, h * 0.07, T1, PART.signal);
        rect(c, w * 0.02, h * p - 0.6, w * 0.07, 1.2, T1, PART.signal); rect(c, w * 0.91, h * p - 0.6, w * 0.07, 1.2, T1, PART.signal);
      }
      rect(c, w * 0.1, h * 0.1, w * 0.8, h * 0.8, T1, PART.still);
      rect(c, w * 0.2, h * 0.2, w * 0.6, h * 0.6, T2, PART.panel);
      for (let i = 1; i < 6; i++) { rect(c, w * (0.2 + i * 0.1) - 0.5, h * 0.2, 1, h * 0.6, T1, PART.panel); rect(c, w * 0.2, h * (0.2 + i * 0.1) - 0.5, w * 0.6, 1, T1, PART.panel); }
    },
    live(t, u, v, time, L, k) {
      if (t.part === PART.panel && t.tone === 2 && k.atRow(t, 0.2 + fract(time * 0.3) * 0.6)) return 3;
      if (t.part === PART.signal) return hash(t.c, t.r, Math.floor(time * 8 * L)) < 0.75 ? 1 : 0;
      return t.tone;
    },
  },
  // an ocean drone seen head on: the wing sail, hull, keel, and the seafloor it maps
  sail: {
    aspect: 0.62,
    draw(c, w, h) {
      const cx = w / 2;
      ellipse(c, cx, h * 0.07, w * 0.07, h * 0.045, 0, T2, PART.body);
      rect(c, cx - w * 0.07, h * 0.07, w * 0.14, h * 0.55, T2, PART.body);
      rect(c, cx - 0.6, h * 0.04, 1.2, h * 0.58, T3, PART.body);
      rect(c, cx - 0.6, 0, 1.2, h * 0.04, T1, PART.still);
      ellipse(c, cx, h * 0.64, w * 0.22, h * 0.032, 0, T2, PART.body);
      rect(c, 0, h * 0.67, w, h * 0.065, T1, PART.sea);
      rect(c, cx - 0.7, h * 0.735, 1.4, h * 0.16, T1, PART.still);
      ellipse(c, cx, h * 0.9, w * 0.06, h * 0.02, 0, T2, PART.body);
      c.fillStyle = col(T1, PART.pulse); c.beginPath(); c.moveTo(0, h * 0.975);
      c.bezierCurveTo(w * 0.2, h * 0.93, w * 0.35, h * 0.99, cx, h * 0.95); c.bezierCurveTo(w * 0.65, h * 0.99, w * 0.8, h * 0.93, w, h * 0.975);
      c.lineTo(w, h); c.lineTo(0, h); c.fill();
    },
    live(t, u, v, time, L, k) {
      if (t.part === PART.sea) return Math.sin(u * k.meta.half * 0.55 - time * 2.2 * L + t.r * 1.7) > -0.15 ? 1 : 0;
      if (t.part === PART.pulse && fract(u * 2 - time * 0.3 * L) < 0.08) return up(t.tone);
      return t.tone;
    },
  },
  tree: {
    aspect: 0.95,
    draw(c, w, h) {
      const cx = w / 2;
      poly(c, [[cx - w * 0.055, h * 0.95], [cx - w * 0.03, h * 0.55], [cx + w * 0.03, h * 0.55], [cx + w * 0.055, h * 0.95]], T2, PART.body);
      c.strokeStyle = col(T1, PART.canopy); c.lineWidth = Math.max(1.1, w * 0.022);
      for (const [x1, y1] of [[-0.22, 0.42], [-0.1, 0.3]]) { c.beginPath(); c.moveTo(cx, h * 0.62); c.quadraticCurveTo(cx + w * x1 * 0.4, h * 0.55, cx + w * x1, h * y1); c.stroke(); }
      const blobs = [[0, 0.3, 0.3], [-0.24, 0.4, 0.22], [-0.12, 0.18, 0.2], [0, 0.48, 0.2], [-0.34, 0.52, 0.14]];
      for (const [x, y, r] of blobs) ellipse(c, cx + w * x, h * y, w * r, h * r * 0.9, 0, T1, PART.canopy);
      for (const [x, y, r] of blobs) ellipse(c, cx + w * x, h * y, w * r * 0.78, h * r * 0.7, 0, T2, PART.canopy);
      for (const [x, y] of [[-0.2, 0.3], [-0.08, 0.12], [-0.3, 0.48], [-0.06, 0.42]]) ellipse(c, cx + w * x, h * y, w * 0.022, h * 0.022, 0, T3, PART.spot);
      rect(c, 0, h * 0.965, w, Math.max(1.1, h * 0.03), T1, PART.still);
    },
    live(t, u, v, time, L) { return t.part === PART.canopy && fract(v * 1.2 + time * 0.3) < 0.03 * L ? up(t.tone) : t.tone; },
  },
  // a dendrimer: a core, branching three times, its ends lit
  dendrimer: {
    aspect: 1,
    draw(c, w, h) {
      const cx = w / 2, cy = h / 2, R = w * 0.47;
      const branch = (x, y, a, len, gen) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        line(c, x, y, x2, y2, 1.1, T1, PART.body);
        if (gen < 3) { branch(x2, y2, a - 0.42, len * 0.64, gen + 1); branch(x2, y2, a + 0.42, len * 0.64, gen + 1); ellipse(c, x2, y2, 1.3, 1.3, 0, T2, PART.body); }
        else ellipse(c, x2, y2, 1.7, 1.7, 0, T3, PART.spot);
      };
      for (let k = 0; k < 6; k++) branch(cx, cy, Math.PI / 6 + (k * Math.PI) / 3, R * 0.4, 0);
      ellipse(c, cx, cy, w * 0.07, w * 0.07, 0, T3, PART.ion);
    },
    live(t, u, v, time, L, k) { return t.part === PART.body && fract((k.cellsFrom(u, v, 0, 0.5) / k.meta.half) * 1.4 - time * 0.45) < 0.06 * L ? up(t.tone) : t.tone; },
  },
};

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair";
  host.append(canvas);
  const g = canvas.getContext("2d");

  /* ---------------- the grid ---------------- */
  let W = 0, H = 0, dpr = 1, S = 9, cols = 0, rows = 0, ox = 0, oy = 0, mid = 0;
  let heat = new Float32Array(0), occ = new Uint8Array(0);
  const mask = document.createElement("canvas");
  const mctx = mask.getContext("2d", { willReadFrequently: true });
  const SUB = 4; // mask pixels per cell, so each cell samples its own centre
  let meta = { top: 0, bh: 1, half: 1 };

  // helpers the objects use while they stand
  const K = {
    get meta() { return meta; },
    atRow: (t, vv) => Math.abs(t.r - (meta.top + vv * meta.bh)) < 0.6,
    cellsFrom: (u, vv, cu, cv) => Math.hypot((u - cu) * meta.half, (vv - cv) * meta.bh),
    helixTone(t, u, time, rungs) {
      const r = t.r - meta.top, th = r * 0.16 + time * 1.3, x = Math.abs(Math.cos(th)) * 0.86, w = 1.6 / Math.max(1, meta.half);
      if (Math.abs(u - x) < w * (rungs ? 1 : 1.6)) return Math.sin(2 * th) > 0 ? 2 : 1;
      if (rungs && Math.round(r) % 4 === 0 && u < x) return Math.abs(u - x) < w * 2.2 ? 3 : 1;
      return 0;
    },
  };

  function layout() {
    S = Math.round(v["grid.cell"]);
    cols = Math.floor(W / S);
    if (cols % 2 === 0) cols--; // odd, so one column is the axis
    cols = Math.max(1, cols);
    rows = Math.max(1, Math.floor(H / S));
    ox = Math.round((W - cols * S) / 2);
    oy = Math.round((H - rows * S) / 2);
    mid = (cols - 1) / 2;
    heat = new Float32Array(cols * rows);
    occ = new Uint8Array(cols * rows);
  }

  function targetsFor(name) {
    const sh = SHAPES[name];
    const boxH = rows * v["grid.size"], boxW = Math.min(cols * 0.9, boxH * sh.aspect), bh = boxW / sh.aspect;
    const top = (rows - bh) / 2;
    mask.width = cols * SUB;
    mask.height = rows * SUB;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.setTransform(SUB, 0, 0, SUB, (cols / 2 - boxW / 2) * SUB, top * SUB);
    sh.draw(mctx, boxW, bh);
    const d = mctx.getImageData(0, 0, mask.width, mask.height).data, pairs = [], singles = [];
    for (let r = rows - 1; r >= 0; r--) for (let c = 0; c <= mid; c++) {
      // the axis column samples just left of the axis, where the half drawings end
      const o = ((r * SUB + SUB / 2) * mask.width + (c * SUB + SUB / 2 - (c === mid ? 1 : 0))) * 4, red = d[o];
      if (red < 40) continue;
      const t = { c, r, tone: red > 200 ? 3 : red > 120 ? 2 : 1, part: Math.round(d[o + 1] / 20), seed: hash(c, r, 7) };
      (c === mid ? singles : pairs).push(t);
    }
    return { pairs, singles, meta: { top, bh, half: boxW / 2 } }; // bottom row first, so figures build from the ground up
  }

  /* ---------------- the characters ---------------- */
  let P = [], shapeIx = 0, phaseStart = 0, now = 0;
  const current = () => ORDER[shapeIx];

  function assign(name, first) {
    const T = targetsFor(name);
    meta = T.meta;
    for (const isPair of [true, false]) {
      const list = isPair ? T.pairs : T.singles, live = P.filter((p) => p.pair === isPair && p.out === undefined);
      list.forEach((t, i) => {
        let p = live[i];
        if (!p) {
          // a new character starts from one already on the page, or from below it
          const src = !first && live.length ? live[Math.floor(Math.random() * live.length)] : null;
          p = { pair: isPair, c: src ? src.c : t.c, r: src ? src.r : rows + 2, ch: pick(), chR: pick(), lastTone: 1 };
          P.push(p);
        }
        p.sc = p.c; p.sr = p.r; p.t0 = now; p.tgt = t; p.prevTone = p.lastTone ?? 1;
        const rise = 1 - t.r / rows;
        p.delay = (first ? rise * 1.4 : rise * 0.6) + Math.random() * (first ? 0.25 : 0.4);
        p.dur = first ? 0.6 + Math.random() * 0.3 : 0.8 + Math.random() * 0.5;
        if (first) { p.sc = isPair ? Math.max(0, Math.min(mid - 1, t.c + Math.round((Math.random() - 0.5) * 4))) : mid; p.sr = rows + 1 + Math.random() * 5; }
        p.arc = isPair ? (Math.random() - 0.5) * (first ? 2 : 12) : 0;
        if (Math.random() < 0.25) { p.ch = pick(); p.chR = pick(); }
        // reduced motion: every character is already home
        if (still) { p.t0 = -1e9; p.c = t.c; p.r = t.r; }
      });
      // what the new figure does not need dissolves where it stands
      for (const p of live.slice(list.length)) {
        p.out = now + Math.random() * 0.7;
        p.tgt = null;
      }
    }
    if (still) P = P.filter((p) => p.out === undefined);
    phaseStart = now;
  }

  // a standing object lives in place: cells light, fill and empty, nothing moves
  function liveTone(t, time) {
    const L = still ? 0 : LIFE, sh = SHAPES[current()];
    const u = (mid - t.c) / Math.max(1, meta.half), vv = (t.r - meta.top) / meta.bh;
    if (t.part === PART.spot) return L && hash(t.c, t.r, Math.floor(time * 2.5 + t.seed * 9)) < 0.35 * L ? 1 : t.tone;
    return sh.live ? sh.live(t, u, vv, L ? time : 0, L, K) : t.tone;
  }

  /* ---------------- paper and type ---------------- */
  let paper = null, paperKey = "", atlas = null, atlasKey = "", fontReady = 0;
  // one tile of fine tooth, reused under the whole sheet
  const TOOTH = new Float32Array(256 * 256);
  for (let i = 0; i < TOOTH.length; i++) TOOTH[i] = Math.random() - 0.5;
  const palette = () => {
    const paperHex = v["colour.paper"], inkHex = v["colour.ink"];
    // text on the lit block is whichever of ink and paper is darker, as the light and dark sets have it
    const dark = lum(inkHex) < lum(paperHex) ? inkHex : paperHex;
    return { paper: paperHex, ink: inkHex, fill: v["colour.moss"], onFill: paperHex, highlight: v["colour.signal"], onHighlight: dark, mark: inkHex };
  };

  function makePaper() {
    const c = paper ?? document.createElement("canvas");
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    const x = c.getContext("2d", { willReadFrequently: true }), gr0 = GRAIN, pale = lum(v["colour.paper"]) > 0.5;
    x.fillStyle = v["colour.paper"];
    x.fillRect(0, 0, c.width, c.height);
    // soft mottling, then fibres, then fine tooth (seeded, so the sheet stays the same sheet as its colour moves)
    let s = 20231023;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      const r = (60 + rnd() * 260) * dpr, px = rnd() * c.width, py = rnd() * c.height;
      const gr = x.createRadialGradient(px, py, 0, px, py, r), vv = rnd() < 0.5 ? 255 : 0;
      gr.addColorStop(0, `rgba(${vv},${vv},${vv},${(pale ? 0.035 : 0.028) * gr0})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = gr;
      x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    x.lineWidth = dpr * 0.6;
    for (let i = 0; i < 900 * Math.min(1.5, gr0); i++) {
      const px = rnd() * c.width, py = rnd() * c.height, a = rnd() * 6.28, l = (4 + rnd() * 16) * dpr;
      x.strokeStyle = `rgba(${pale ? "90,80,60" : "210,210,215"},${(0.04 + rnd() * 0.05) * Math.min(1, gr0)})`;
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + Math.cos(a + 0.6) * l * 0.5, py + Math.sin(a + 0.6) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l);
      x.stroke();
    }
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data, cw = c.width, amp = 22 * gr0;
    for (let y = 0, o = 0; y < c.height; y++) {
      const row = (y & 255) << 8;
      for (let xx = 0; xx < cw; xx++, o += 4) {
        const n = TOOTH[row | (xx & 255)] * amp;
        d[o] += n; d[o + 1] += n; d[o + 2] += n;
      }
    }
    x.putImageData(id, 0, 0);
    paper = c;
  }

  // every character in three styles, drawn once at device pixels: bare, on a block, on a lit block
  function makeAtlas() {
    const pal = palette();
    const t = Math.max(2, Math.round(S * dpr)), c = atlas ?? document.createElement("canvas");
    c.width = t * GLYPHS.length;
    c.height = t * 3;
    const x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    x.font = `500 ${Math.round(t * 0.8)}px ${MONO}`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    const styles = [[null, pal.ink], [pal.fill, pal.onFill], [pal.highlight, pal.onHighlight]];
    styles.forEach(([bg, fg], j) => GLYPHS.forEach((ch, i) => {
      if (bg) { x.fillStyle = bg; x.fillRect(i * t, j * t, t, t); }
      x.fillStyle = fg;
      x.fillText(ch, i * t + t / 2, j * t + t / 2 + t * 0.04);
    }));
    atlas = c;
    atlas.t = t;
  }

  /* ---------------- the pointer ---------------- */
  const pointer = { x: -999, y: -999, in: false };
  function updateHeat(dt) {
    const R = v["cursor.radius"] / S, pc = (pointer.x - ox) / S - 0.5, pr = (pointer.y - oy) / S - 0.5, mc = cols - 1 - pc;
    const upK = Math.min(1, dt * 10), downK = Math.min(1, dt * 2.5), on = pointer.in && R > 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let tgt = 0;
      if (on) {
        const dy = r - pr, d1 = Math.hypot(c - pc, dy), d = MIRROR_CURSOR ? Math.min(d1, Math.hypot(c - mc, dy)) : d1;
        if (d < R) tgt = Math.pow(1 - d / R, 1.4);
      }
      const i = r * cols + c, h = heat[i];
      heat[i] = h + (tgt - h) * (tgt > h ? upK : downK);
    }
  }

  /* ---------------- draw ---------------- */
  function cell(ch, style, ic, ir, alpha) {
    if (ic < 0 || ic >= cols || ir < 0 || ir >= rows) return;
    const t = atlas.t, x = ox + ic * S, y = oy + ir * S;
    if (alpha < 1) g.globalAlpha = alpha;
    g.drawImage(atlas, gi(ch) * t, style * t, t, t, x, y, S, S);
    if (alpha < 1) g.globalAlpha = 1;
    occ[ir * cols + ic] = 1;
  }

  let sizeKey = "";
  function draw(dt) {
    const sk = [W, H, Math.round(v["grid.cell"]), v["grid.size"]].join();
    if (sk !== sizeKey) {
      sizeKey = sk;
      layout();
      P = [];
      assign(current(), true);
    }
    const pk = [W, H, dpr, v["colour.paper"]].join();
    if (pk !== paperKey) { paperKey = pk; makePaper(); }
    const ak = [S, dpr, v["colour.ink"], v["colour.paper"], v["colour.moss"], v["colour.signal"], fontReady].join();
    if (ak !== atlasKey) { atlasKey = ak; makeAtlas(); }
    if (!still && now - phaseStart > v["motion.hold"] + 2.4) next();

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(paper, 0, 0, W, H);
    updateHeat(dt);
    occ.fill(0);
    const time = now, flick = still ? 0 : v["motion.flicker"] * dt * 0.5, hop = v["motion.travel"];

    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      if (p.out !== undefined) {
        // dissolving: it keeps its cell, goes to a point, and is gone
        const k = (now - p.out) / 0.35;
        if (k > 1) { P.splice(i, 1); continue; }
        const ic = Math.round(p.c), ir = Math.round(p.r), a = k < 0 ? 1 : 1 - k;
        const ch = k < 0 ? p.ch : "·", st = k < 0 ? Math.max(0, Math.min(2, p.lastTone - 1)) : 0;
        if (k >= 0 || p.lastTone > 0) {
          cell(ch, st, ic, ir, a);
          if (p.pair) cell(MIRROR_GLYPHS ? MIRROR[ch] || ch : p.chR, st, cols - 1 - ic, ir, a);
        }
        continue;
      }
      const t = p.tgt, k = Math.min(1, Math.max(0, (now - p.t0 - p.delay) / p.dur)), e = ease(k);
      let c = p.sc + (t.c - p.sc) * e, r = p.sr + (t.r - p.sr) * e;
      if (p.arc) {
        const dx = t.c - p.sc, dy = t.r - p.sr, L = Math.hypot(dx, dy) || 1, a = Math.sin(e * Math.PI) * p.arc;
        c += (-dy / L) * a;
        r += (dx / L) * a;
      }
      p.c = c;
      p.r = r;
      const settled = k >= 1;
      // waiting its turn it keeps the tone it had; in flight it travels bare; landed, it lives
      const tone = k <= 0 ? p.prevTone : settled ? liveTone(t, time) : 1;
      p.lastTone = tone;
      if (settled && Math.random() < flick) { p.ch = pick(); p.chR = pick(); }
      const onGrid = hop || settled;
      const ic = Math.round(c), ir = Math.round(r);
      const h = ic >= 0 && ic < cols && ir >= 0 && ir < rows ? heat[ir * cols + ic] : 0;
      const hR = ir >= 0 && ir < rows ? heat[ir * cols + (cols - 1 - ic)] || 0 : 0;
      const put = (ch, hv, side) => {
        let tn = tone;
        if (hv > 0.55 && tn > 0) tn = Math.min(3, tn + 1);
        if (hv > 0.2 && Math.random() < hv * 0.25) ch = pick();
        if (tn <= 0) return;
        const st = tn - 1, ac = side ? cols - 1 - ic : ic;
        if (onGrid) cell(ch, st, ac, ir, 1);
        else {
          // gliding: off the grid only while it travels
          const t2 = atlas.t, x = ox + (side ? cols - 1 - c : c) * S, y = oy + r * S;
          g.drawImage(atlas, gi(ch) * t2, st * t2, t2, t2, x, y, S, S);
        }
      };
      put(p.ch, h, 0);
      if (p.pair) put(MIRROR_GLYPHS ? MIRROR[p.ch] || p.ch : p.chR, MIRROR_CURSOR ? h : hR, 1);
    }

    // the grid itself shows through where the pointer is
    if (REVEAL > 0 && pointer.in && !still) {
      g.fillStyle = palette().mark;
      const R = Math.ceil(v["cursor.radius"] / S) + 1, pc = Math.round((pointer.x - ox) / S - 0.5), pr = Math.round((pointer.y - oy) / S - 0.5);
      const spots = MIRROR_CURSOR ? [pc, cols - 1 - pc] : [pc];
      for (const sc of spots) for (let r = pr - R; r <= pr + R; r++) for (let c = sc - R; c <= sc + R; c++) {
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const i = r * cols + c, hv = heat[i];
        if (hv < 0.02 || occ[i]) continue;
        occ[i] = 1;
        g.globalAlpha = Math.min(1, hv * REVEAL * 1.4);
        const x = ox + c * S + S / 2, y = oy + r * S + S / 2, a = Math.max(1, Math.round(S * 0.14));
        g.fillRect(x - a, y - 0.5, a * 2, 1);
        g.fillRect(x - 0.5, y - a, 1, a * 2);
      }
      g.globalAlpha = 1;
    }
  }

  function go(i) {
    shapeIx = (i + ORDER.length) % ORDER.length;
    assign(current(), false);
  }
  function next() { go(shapeIx + 1); }

  /* ---------------- running ---------------- */
  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  function frame(ms) {
    raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min((ms - last) / 1000, 0.05));
    last = ms;
    now += dt;
    draw(dt);
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
  const drawStill = () => still && W > 1 && draw(0);

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.floor(r.width));
    H = Math.max(1, Math.floor(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  const onMove = (e) => {
    const b = host.getBoundingClientRect();
    pointer.x = e.clientX - b.left;
    pointer.y = e.clientY - b.top;
    pointer.in = true;
  };
  const onLeave = () => (pointer.in = false);
  const onClick = () => {
    next();
    drawStill();
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("click", onClick);

  // their face, cut down to the glyphs; the atlas is redrawn once it is in
  let face = null;
  try {
    face = new FontFace(FAMILY, `url(${FONT_URL}) format("woff2")`, { weight: "500" });
    face.load().then((f) => {
      if (!canvas.isConnected) return;
      document.fonts.add(f);
      fontReady = 1;
      drawStill();
    }).catch(() => {});
  } catch { /* the fallback mono stands in */ }

  const ro = new ResizeObserver(() => {
    resize();
    if (still) drawStill();
    else draw(0);
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

  resize();
  draw(0);
  sync();

  return {
    update(nv) {
      Object.assign(v, nv);
      if (still) drawStill();
    },
    action(name) {
      if (name === "next") {
        next();
        drawStill();
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("click", onClick);
      if (face && document.fonts.has?.(face)) document.fonts.delete(face);
      mask.width = mask.height = 0;
      if (paper) paper.width = paper.height = 0;
      if (atlas) atlas.width = atlas.height = 0;
      canvas.remove();
    },
  };
}
