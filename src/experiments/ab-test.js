/* A/B test.

   Ported from a client page in the Creative Studio (its live A/B testing
   card): a dark test card on a green field, fed from the left by five
   hairline curves that fan in to its edge, with white comets of light
   running along them out of step. The card works through its variants,
   each one sliding up into the thumbnail while its title rolls over, a
   comet circling its border and a shimmer sweeping its status line. After
   the fourth the last comets arrive, the card is the winner (a green
   border, a tick that springs in, the status turns green), one comet fires
   out along the line on the right, and the card shoots off after it,
   accelerating. The next test slides in from the left and settles. Images
   one round, button colours the next.

   Everything is the page's own timing, easing and colour. Its words (the
   team, the status, the variant names) are skeleton lines here, its menu
   photos small abstract stills, and its photographed green ground a soft
   gradient field rebuilt from that photo's colours, so the colour dial can
   move it. The pointer bends the fan toward it; a click calls the winner.
   The page never names the client. */

export const params = {
  test: {
    variant: [1.5, 0.5, 4, 0.05],
    hold: [1.6, 0.4, 4, 0.05],
    subject: { type: "select", options: ["Images and colours", "Images", "Colours"] },
  },
  pulses: {
    period: [2.5, 0.8, 6, 0.1],
    lines: [5, 2, 9, 1],
    spread: [0.38, 0.1, 0.8, 0.01],
  },
  card: {
    size: [1, 0.6, 1.5, 0.01],
  },
  colour: {
    ground: "#2b9a45",
    winner: "#6be285",
  },
};

/* ---- the ground: the photographed gradient sampled 8 by 5, rebuilt smooth ---- */
const FIELD = [
  "69cf80 5fc576 5dc474 5cc373 5ac473 4db766 19993a 088829",
  "66d283 50bc6d 45b15f 41ad5b 3da454 238a3a 027615 037716",
  "52d179 46c56d 35b95c 21a548 177e2f 006516 006400 036a05",
  "2ec761 22bb55 16a045 008328 046217 005a13 005504 005504",
  "0bb646 00a737 067623 006a17 016416 006214 055711 004e08",
].map((row) => row.split(" ").map((h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))));
const REF = "#2b9a45"; // the field's own mean: the ground dial's default leaves it untouched

const rgbOf = (hex) => {
  const s = String(hex).replace("#", "");
  const n = s.length === 3 ? s.replace(/./g, "$&$&") : s;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function toRgb([h, s, l]) {
  if (!s) return [l, l, l].map((c) => c * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((c) => c * 255);
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Catmull-Rom across the sampled grid, so the field has no creases
function cubic(p0, p1, p2, p3, t) {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
// any colour moved by the ground dial's distance from the field's own colour
function shifter(ground) {
  const [gh0, gs0, gl0] = toHsl(rgbOf(ground)), [rh, rs, rl] = toHsl(rgbOf(REF));
  const sat = rs > 0 ? gs0 / rs : 1;
  return (c) => {
    const [h, s, l] = toHsl(c);
    return toRgb([h + gh0 - rh, clamp01(s * sat), clamp01(l + gl0 - rl)]);
  };
}
function fieldCanvas(ground) {
  const gw = 8, gh = 5, OW = 192, OH = 108;
  const shift = shifter(ground);
  const grid = FIELD.map((row) => row.map(shift));
  const at = (x, y, k) => grid[Math.max(0, Math.min(gh - 1, y))][Math.max(0, Math.min(gw - 1, x))][k];
  const c = document.createElement("canvas");
  c.width = OW;
  c.height = OH;
  const g = c.getContext("2d");
  const img = g.createImageData(OW, OH);
  for (let j = 0; j < OH; j++) {
    const fy = ((j + 0.5) / OH) * gh - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    for (let i = 0; i < OW; i++) {
      const fx = ((i + 0.5) / OW) * gw - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      for (let k = 0; k < 3; k++) {
        const rows = [-1, 0, 1, 2].map((dy) => cubic(at(x0 - 1, y0 + dy, k), at(x0, y0 + dy, k), at(x0 + 1, y0 + dy, k), at(x0 + 2, y0 + dy, k), tx));
        img.data[(j * OW + i) * 4 + k] = Math.max(0, Math.min(255, cubic(rows[0], rows[1], rows[2], rows[3], ty)));
      }
      img.data[(j * OW + i) * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
// the photo's fine grain
function grainTile() {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d");
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 6 + Math.random() * 12;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---- the page's easings ---- */
function bezier(x1, y1, x2, y2) {
  const s = (t, a, b) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) {
      const v = s(t, x1, x2);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return s(t, y1, y2);
  };
}
const SLIDE = bezier(0.4, 0, 0.2, 1);
const TITLE_OUT = bezier(0.4, 0, 1, 1);
const TITLE_IN = bezier(0, 0, 0.2, 1);
const EXIT = bezier(0.85, 0, 1, 1);
const EXIT_FADE = bezier(0.6, 0, 1, 1);
const ENTER = bezier(0.16, 1, 0.3, 1);
const EASE = bezier(0.25, 0.1, 0.25, 1);
const EASE_OUT = bezier(0, 0, 0.58, 1);
const BACK = bezier(0.34, 1.56, 0.64, 1);

/* ---- the card, in the page's px (the stage scales it) ---- */
const CARD_W = 400, CARD_H = 96, PAD = 14, THUMB = 68, GAP = 16, RADIUS = 20;
const PULSE_LEN = 155, DRAIN = 0.65, EXIT_DUR = 0.6, ENTER_DUR = 0.95, ENTER_GAP = 0.024, VARIANTS = 4;
// the variants' titles, as skeleton lines of four widths; the status line, testing and won
const TITLE_W = [[0.62, 0.47, 0.71, 0.54], [0.4, 0.43, 0.41, 0.42]];
const STATUS_W = [0.52, 0.7];
const SWATCHES = ["#66d938", "#4caf50", "#2ecc71", "#00a86b"];
// four small stills on the page's cream: a lit ball each, a different size and colour
const STILLS = [
  { c: "#3f7fd8", r: 0.24, x: 0.5, y: 0.52 },
  { c: "#e6a33c", r: 0.3, x: 0.46, y: 0.56 },
  { c: "#d9543f", r: 0.2, x: 0.55, y: 0.5 },
  { c: "#e9d34a", r: 0.27, x: 0.5, y: 0.54 },
];

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:pointer";
  host.append(canvas);
  const g = canvas.getContext("2d");
  const grain = grainTile();
  let field = fieldCanvas(v["colour.ground"]);
  // the card's body is the field's deepest green, so it moves with the ground too
  const bodyOf = () => `rgba(${shifter(v["colour.ground"])([18, 50, 22]).map(Math.round).join(",")},0.88)`;
  let body = bodyOf();
  let groundCache = null;

  let W = 1, H = 1, dpr = 1, u = 1, raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  const rnd = Math.random;

  /* ---- the test's clock, as the page ran it ---- */
  let round = 0;                         // 0 images, 1 colours
  let state = "testing", st = 0;         // seconds in this state
  let variantT = 0, idx = 0, prevIdx = 0;
  let slide = 1, titleT = 1;             // the thumbnail's slide and the title's roll, 0..1 when running
  let titleFrom = 0;
  let pulseT = 0, phases = [];
  let winT = -1, rightT = -1;            // since the winner was found; since the right comet left
  let spin = 0;                          // the border comet's angle, in turns
  let sweep = 0;                         // the status shimmer, 0..1
  let dx = 0, alpha = 1;                 // the card's travel and opacity
  const lean = { y: 0, ty: 0 };

  const freshPhases = () => (phases = Array.from({ length: 9 }, () => rnd() * 0.28));
  freshPhases();
  const rounds = () => (v["test.subject"] === "Images" ? [0] : v["test.subject"] === "Colours" ? [1] : [0, 1]);
  round = rounds()[0];

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    groundCache = null;
  }
  // the stage's scale: the card at about its page size, never wider than two thirds of a narrow screen
  const scale = () => Math.min((W * 0.66) / CARD_W, Math.max(0.6, Math.min(W / 1232, H / 700)), 1.25) * v["card.size"];

  function paintGround() {
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = canvas.height;
    const cg = c.getContext("2d");
    cg.imageSmoothingEnabled = true;
    cg.imageSmoothingQuality = "high";
    // the photo is a wide crop: cover the host with it
    const s = Math.max(c.width / field.width, c.height / field.height);
    cg.drawImage(field, (c.width - field.width * s) / 2, (c.height - field.height * s) / 2, field.width * s, field.height * s);
    cg.fillStyle = cg.createPattern(grain, "repeat");
    cg.fillRect(0, 0, c.width, c.height);
    groundCache = c;
  }

  /* ---- geometry: the card at rest in the middle, the fan into its left edge ---- */
  function geometry() {
    u = scale();
    const cw = CARD_W * u, ch = CARD_H * u;
    const cx = W / 2, cy = H / 2;
    return { cw, ch, cx, cy, lx: cx - cw / 2, rx: cx + cw / 2 };
  }
  function curves(geo) {
    const n = Math.round(v["pulses.lines"]);
    // the page's fan is 38% of its stage's height; on a tall narrow screen, of its width
    const spread = Math.min(H, W * 0.8) * v["pulses.spread"];
    const out = [];
    for (let i = 0; i < n; i++) {
      const frac = n > 1 ? i / (n - 1) - 0.5 : 0;
      const sy = geo.cy + lean.y + frac * spread, ex = geo.lx, ey = geo.cy;
      const c = { ax: 0, ay: sy, bx: ex * 0.4, by: sy, cx: ex * 0.84, cy: ey, dx: ex, dy: ey };
      c.len = bezLen(c);
      out.push(c);
    }
    return out;
  }
  const bez = (c, t) => {
    const m = 1 - t;
    return [m * m * m * c.ax + 3 * m * m * t * c.bx + 3 * m * t * t * c.cx + t * t * t * c.dx, m * m * m * c.ay + 3 * m * m * t * c.by + 3 * m * t * t * c.cy + t * t * t * c.dy];
  };
  function bezLen(c) {
    let len = 0, prev = bez(c, 0);
    for (let i = 1; i <= 40; i++) {
      const p = bez(c, i / 40);
      len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
    }
    return len;
  }

  // a comet: a run of short segments, brightening toward its head
  function comet(pointAt, len, progress, peak) {
    const L = PULSE_LEN * u;
    const head = progress * (len + L), tail = Math.max(0, head - L), vis = Math.min(head, len);
    if (vis <= tail) return;
    const span = vis - tail, steps = 40;
    g.lineWidth = Math.max(1, 1.6 * u);
    g.lineCap = "round";
    for (let i = 0; i < steps; i++) {
      const a = tail + span * (i / steps), b = tail + span * ((i + 1) / steps);
      const pa = pointAt(a / len), pb = pointAt(b / len);
      g.strokeStyle = `rgba(255,255,255,${(peak * ((a - tail) / span) ** 1.7).toFixed(3)})`;
      g.beginPath();
      g.moveTo(pa[0], pa[1]);
      g.lineTo(pb[0], pb[1]);
      g.stroke();
    }
  }

  /* ---- the card's parts ---- */
  function drawStill(i, x, y, s) {
    const k = STILLS[i % STILLS.length];
    g.fillStyle = "#f5ede0";
    g.fillRect(x, y, s, s);
    // a floor under a soft back wall
    const floor = g.createLinearGradient(0, y + s * 0.55, 0, y + s);
    floor.addColorStop(0, "rgba(206,170,128,0)");
    floor.addColorStop(1, "rgba(206,170,128,0.55)");
    g.fillStyle = floor;
    g.fillRect(x, y + s * 0.55, s, s * 0.45);
    const bx = x + k.x * s, by = y + k.y * s, r = k.r * s;
    // its shadow, then the ball, lit from the top left
    g.fillStyle = "rgba(90,60,30,0.22)";
    g.beginPath();
    g.ellipse(bx + r * 0.25, by + r * 0.95, r * 1.05, r * 0.28, 0, 0, Math.PI * 2);
    g.fill();
    const lit = g.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r * 1.05);
    lit.addColorStop(0, "rgba(255,255,255,0.85)");
    lit.addColorStop(0.18, k.c);
    lit.addColorStop(1, shade(k.c, -0.35));
    g.fillStyle = lit;
    g.beginPath();
    g.arc(bx, by, r, 0, Math.PI * 2);
    g.fill();
  }
  function variantFill(i, x, y, s) {
    if (round === 0) drawStill(i, x, y, s);
    else {
      g.fillStyle = SWATCHES[i % SWATCHES.length];
      g.fillRect(x, y, s, s);
    }
  }

  function drawCard(geo) {
    const { cw, ch } = geo;
    const x = geo.cx - cw / 2 + dx, y = geo.cy - ch / 2;
    if (alpha <= 0.002) return;
    g.save();
    g.globalAlpha = alpha;
    const won = winT >= 0 ? winT : -1;
    // the body, its shadow and its border
    g.save();
    g.shadowColor = "rgba(0,0,0,0.32)";
    g.shadowBlur = 64 * u * dpr;
    g.shadowOffsetY = 24 * u * dpr;
    g.fillStyle = body;
    roundRect(g, x, y, cw, ch, RADIUS * u);
    g.fill();
    g.restore();
    const bw = Math.max(1, u);
    const greenIn = won >= 0 ? EASE(Math.min(1, won / 0.45)) : 0;
    g.strokeStyle = mixRgba([255, 255, 255, 0.14], [...rgbOf(v["colour.winner"]), 1], greenIn);
    g.lineWidth = bw;
    roundRect(g, x + bw / 2, y + bw / 2, cw - bw, ch - bw, RADIUS * u - bw / 2);
    g.stroke();
    // the comet round the border, fading out once there is a winner
    const cometA = won >= 0 ? 1 - EASE(Math.min(1, won / 0.4)) : 1;
    if (cometA > 0.002) {
      const cg = g.createConicGradient(((180 + spin * 360) * Math.PI) / 180, x + cw / 2, y + ch / 2);
      cg.addColorStop(0, "rgba(255,255,255,0)");
      cg.addColorStop(0.62, "rgba(255,255,255,0)");
      cg.addColorStop(0.72, `rgba(255,255,255,${0.08 * cometA})`);
      cg.addColorStop(0.86, `rgba(255,255,255,${0.45 * cometA})`);
      cg.addColorStop(0.96, `rgba(255,255,255,${0.65 * cometA})`);
      cg.addColorStop(1, `rgba(255,255,255,${0.65 * cometA})`);
      g.strokeStyle = cg;
      roundRect(g, x + bw / 2 - bw, y + bw / 2 - bw, cw + bw, ch + bw, RADIUS * u + bw / 2);
      g.stroke();
    }
    // the thumbnail: the new variant slides up as the old one leaves
    const tx = x + PAD * u, ty = y + (ch - THUMB * u) / 2, ts = THUMB * u;
    g.save();
    roundRect(g, tx, ty, ts, ts, 13 * u);
    g.clip();
    if (slide < 1) {
      const e = SLIDE(slide);
      variantFill(prevIdx, tx, ty - e * ts, ts);
      variantFill(idx, tx, ty + (1 - e) * ts, ts);
    } else variantFill(idx, tx, ty, ts);
    g.restore();
    // the text: a status line over the variant's title, both as skeleton lines
    const textX = tx + ts + GAP * u, textW = cw - (textX - x) - 28 * u;
    const rowH = 16 * u, titleH = 25.3 * u, colH = rowH + 3 * u + titleH;
    const rowY = y + (ch - colH) / 2;
    // the tick springs in and pushes the status over
    let sx = textX;
    if (won >= 0) {
      const wk = EASE(Math.min(1, won / 0.22)), op = EASE(Math.min(1, won / 0.28)), sc = 0.4 + 0.6 * BACK(Math.min(1, won / 0.32));
      const size = 16 * u, cxk = textX + (size * wk) / 2, cyk = rowY + rowH / 2;
      if (wk > 0.01) {
        g.save();
        g.globalAlpha *= op;
        g.beginPath();
        g.rect(textX, rowY, size * wk, rowH);
        g.clip();
        g.translate(cxk, cyk);
        g.scale(sc, sc);
        g.fillStyle = v["colour.winner"];
        g.beginPath();
        g.arc(0, 0, size / 2, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#fff";
        g.lineWidth = 1.6 * (size / 16);
        g.lineCap = g.lineJoin = "round";
        const q = size / 16;
        g.beginPath();
        g.moveTo(-3.5 * q, 0);
        g.lineTo(-1 * q, 2.5 * q);
        g.lineTo(3.5 * q, -2.5 * q);
        g.stroke();
        g.restore();
      }
      sx += (size + 6 * u) * wk;
    }
    const barH = 7 * u, barY = rowY + (rowH - barH) / 2;
    const statusW = textW * (won >= 0 ? STATUS_W[0] * 0.78 : STATUS_W[round === 0 ? 0 : 1]);
    roundRect(g, sx, barY, statusW, barH, barH / 2);
    if (won >= 0) g.fillStyle = v["colour.winner"];
    else {
      // the shimmer: a broad highlight carried right to left across the line
      const L = statusW, off = -2 * L * sweep;
      const sh = g.createLinearGradient(sx + off, 0, sx + off + 3 * L, 0);
      sh.addColorStop(0, "rgba(255,255,255,0.16)");
      sh.addColorStop(0.3, "rgba(255,255,255,0.16)");
      sh.addColorStop(0.5, "rgba(255,255,255,0.62)");
      sh.addColorStop(0.7, "rgba(255,255,255,0.16)");
      sh.addColorStop(1, "rgba(255,255,255,0.16)");
      g.fillStyle = sh;
    }
    g.fill();
    // the title rolls up and over to the next one
    const tY = rowY + rowH + 3 * u, lineH = 13 * u;
    g.save();
    g.beginPath();
    g.rect(textX, tY, textW, titleH);
    g.clip();
    let shown = idx, off = 0;
    if (titleT < 0.5) {
      shown = titleFrom;
      off = -TITLE_OUT(titleT / 0.5) * titleH;
    } else if (titleT < 1) off = (1 - TITLE_IN((titleT - 0.5) / 0.5)) * titleH;
    g.fillStyle = "rgba(255,255,255,0.92)";
    roundRect(g, textX, tY + (titleH - lineH) / 2 + off, textW * TITLE_W[round][shown % VARIANTS], lineH, lineH / 2);
    g.fill();
    g.restore();
    g.restore();
  }

  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!groundCache) paintGround();
    g.drawImage(groundCache, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const geo = geometry();
    const cs = curves(geo);
    // the ghost hairlines, always there; with the card gone the right one runs through
    g.lineCap = "round";
    g.lineWidth = Math.max(0.75, 1.2 * u);
    g.strokeStyle = "rgba(255,255,255,0.10)";
    for (const c of cs) {
      g.beginPath();
      g.moveTo(c.ax, c.ay);
      g.bezierCurveTo(c.bx, c.by, c.cx, c.cy, c.dx, c.dy);
      g.stroke();
    }
    const rightFrom = state === "exiting" || state === "entering" ? geo.lx : geo.rx;
    g.beginPath();
    g.moveTo(rightFrom, geo.cy);
    g.lineTo(W, geo.cy);
    g.stroke();
    // the comets in, while it tests and while the last ones arrive
    if (state === "testing" || state === "draining") {
      const period = v["pulses.period"];
      cs.forEach((c, i) => {
        const p = (pulseT / period + phases[i]) % 1;
        comet((t) => bez(c, Math.max(0, Math.min(1, t))), c.len, p, 0.84);
      });
    }
    // and the one out, once there is a winner
    if (rightT >= 0) {
      const len = W - geo.rx;
      comet((t) => [geo.rx + len * Math.max(0, Math.min(1, t)), geo.cy], len, Math.min(1, rightT / 0.9), 0.88);
    }
    drawCard(geo);
  }

  /* ---- the test, stepped ---- */
  function swap(to) {
    prevIdx = idx;
    titleFrom = idx;
    idx = to;
    slide = 0;
    titleT = 0;
  }
  function nextRound() {
    const list = rounds();
    round = list[(list.indexOf(round) + 1) % list.length] ?? list[0];
    idx = prevIdx = titleFrom = 0;
    slide = titleT = 1;
    winT = -1;
    variantT = 0;
    freshPhases();
  }
  function callWinner() {
    if (state !== "testing") return;
    state = "draining";
    st = 0;
  }

  function step(dt) {
    st += dt;
    spin = winT >= 0 ? spin : (spin + dt / 2.6) % 1;
    sweep = (sweep + dt / 2.2) % 1;
    if (slide < 1) slide = Math.min(1, slide + dt / 0.38);
    if (titleT < 1) titleT = Math.min(1, titleT + dt / 0.38);
    if (winT >= 0) winT += dt;
    if (rightT >= 0) rightT += dt;
    if (state === "testing" || state === "draining") pulseT += dt;
    lean.y += (lean.ty - lean.y) * (1 - Math.exp(-dt * 3));

    if (state === "testing") {
      variantT += dt;
      if (variantT > v["test.variant"]) {
        variantT = 0;
        if (idx + 1 >= VARIANTS) callWinner();
        else swap(idx + 1);
      }
    } else if (state === "draining") {
      if (st >= DRAIN) {
        state = "winner";
        st = 0;
        winT = 0;
        rightT = 0;
      }
    } else if (state === "winner") {
      if (st >= v["test.hold"]) {
        state = "exiting";
        st = 0;
      }
    } else if (state === "exiting") {
      const geo = geometry();
      const k = Math.min(1, st / EXIT_DUR);
      // off to the right, starting slow and accelerating
      dx = EXIT(k) * 2.3 * geo.cw;
      alpha = 1 - EXIT_FADE(Math.min(1, st / (EXIT_DUR * 0.8)));
      if (st >= EXIT_DUR) {
        state = "entering";
        st = -ENTER_GAP;
        rightT = -1;
        nextRound();
        dx = -60 * u;
        alpha = 0;
      }
    } else if (state === "entering") {
      if (st >= 0) {
        dx = -60 * u * (1 - ENTER(Math.min(1, st / ENTER_DUR)));
        alpha = EASE_OUT(Math.min(1, st / 0.4));
      }
      if (st >= ENTER_DUR) {
        state = "testing";
        st = 0;
        dx = 0;
        alpha = 1;
        pulseT = 0;
        variantT = 0;
      }
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.06, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt);
    draw();
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

  // reduced motion: one settled frame, mid test, the comets part way along
  if (reduced) {
    pulseT = v["pulses.period"] * 0.55;
    spin = 0.3;
    sweep = 0.4;
  }

  const onMove = (e) => {
    if (reduced) return;
    const r = host.getBoundingClientRect();
    // the fan leans toward the pointer while it is over the left of the stage
    const y = e.clientY - r.top, x = e.clientX - r.left;
    lean.ty = x < W / 2 ? (y - H / 2) * 0.45 : 0;
  };
  const onLeave = () => (lean.ty = 0);
  const onClick = () => {
    if (reduced) return;
    callWinner();
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);

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

  resize();
  draw();
  sync();

  return {
    update(nv) {
      const prevGround = v["colour.ground"], prevSubject = v["test.subject"];
      Object.assign(v, nv);
      if (v["colour.ground"] !== prevGround) {
        field = fieldCanvas(v["colour.ground"]);
        body = bodyOf();
        groundCache = null;
      }
      // a new subject starts with its first round on the next card
      if (v["test.subject"] !== prevSubject && !rounds().includes(round)) {
        round = rounds()[0];
        idx = prevIdx = titleFrom = 0;
        slide = titleT = 1;
      }
      draw();
    },
    action() {},
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      canvas.remove();
    },
  };
}

function mixRgba(a, b, t) {
  const m = a.map((x, i) => x + (b[i] - x) * t);
  return `rgba(${Math.round(m[0])},${Math.round(m[1])},${Math.round(m[2])},${m[3].toFixed(3)})`;
}
function shade(hex, k) {
  const c = rgbOf(hex).map((x) => Math.round(k < 0 ? x * (1 + k) : x + (255 - x) * k));
  return `rgb(${c.join(",")})`;
}
