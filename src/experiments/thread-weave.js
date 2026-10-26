/* Thread weave.

   The thread from Counsel's home hero (clients/counsel/designs/01-home,
   Home-Hero-Weave-V13), alone on its navy ground. One spline across the
   frame, drawn as a chain of coloured runs with short stitches between
   them, all riding one dash pattern that drifts to the right while the runs
   breathe in and out of each other's length. It draws itself in close up
   and the camera pulls back. Then the hero's trick: a stitch near the
   middle stretches out along the line to a card's width, the runs either
   side shrinking to make room, and a card rises out of that stretch of
   ribbon; it holds, sinks back into the thread, and the whole set surges on
   so the next stitch can open. The cards are the hero's data-viz cards in
   the brand's style (a week of readings, a lab range, a bar week) without
   their copy. */

// Counsel's colour primitives (tokens-src/counsel-colors.css)
const C = {
  gray0: "#ffffff", gray1: "#f8f8f6", gray15: "#f1f0ed", gray2: "#e9e8e4",
  blue2: "#c5e1ed", blue3: "#9abddb", blue9: "#132045",
  green1: "#dbedd8", green3: "#80c48a", green6: "#286f48", green7: "#005434", green9: "#072a1c",
  brightBlue: "#47afff", yellow: "#fada78", pink: "#ff93ad", maroon: "#6a2032",
};

const PALETTES = [
  { id: "navy", label: "Navy", colors: [C.yellow, C.green6, C.pink, C.brightBlue, C.blue2, C.green7, C.green3] },
  { id: "forest", label: "Forest", colors: [C.yellow, C.gray1, C.pink, C.brightBlue, C.blue2, C.green1, C.green3] },
  { id: "full-thread", label: "Full thread", colors: [C.yellow, C.pink, C.blue9, C.green6, C.brightBlue, C.blue2, C.green1] },
  { id: "billboard", label: "Billboard", colors: [C.pink, C.blue2, C.blue9, C.brightBlue, C.yellow, C.maroon] },
  { id: "greens", label: "Greens", colors: [C.green6, C.green7, C.green3, C.green1, C.yellow] },
  { id: "blues", label: "Blues", colors: [C.blue9, C.brightBlue, C.blue3, C.blue2, C.pink] },
];

// one colour per card, in the hero's category order
const CARD_COLORS = [C.blue2, C.pink, C.yellow, C.green3, C.brightBlue];
const CARD_KINDS = ["line", "bars", "panel"];

export const params = {
  thread: {
    palette: { type: "swatches", label: "Palette", options: PALETTES, default: "navy" },
    thickness: [8, 3, 24, 0.5],
    wave: [1, 0, 2, 0.01],
  },
  motion: {
    flow: [18, 0, 80, 1],
    breathe: [0.14, 0, 0.6, 0.01],
  },
  cards: {
    cards: { type: "toggle", labels: ["Thread only", "Cards"], default: true },
    hold: [5.2, 1.5, 10, 0.1],
  },
  colour: {
    ground: { type: "color", default: C.blue9, options: [C.blue9, C.green7, C.green9, C.gray1, C.gray0] },
  },
  replay: { type: "action", label: "Draw again" },
};

// the hero's fixed dials, as Hunter left them in V13
const S = {
  seed: 7, tickSize: 16, startY: -70, dipY: 190, dipAt: 0.5, riseY: 25, riseAt: 0.8, endY: 90,
  drawMs: 1050, speed: 0.45, introZoom: 2.2, introHold: 600, introPull: 1300,
  cardGrow: 1150, cardShift: 1250, cardCycle: 0.3, cardWidth: 272, cardCenter: 0.44, cardSpread: 0.14, cardTint: 0.26,
};

const NS = "http://www.w3.org/2000/svg";

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function splinePath(pts) {
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function hexMix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/* ---- the cards' pictures, in the brand book's data-viz style ---- */

const W = 244, H = 150;

function chartLine(hi, n) {
  // a week of readings, the last one the thing that matters
  const sets = [[120, 112, 126, 117, 129, 145], [98, 104, 101, 110, 107, 121], [131, 126, 138, 129, 122, 116]];
  const values = sets[n % sets.length];
  const low = 80, high = 160, top = 14, bottom = 14;
  const pts = values.map((v, i) => [14 + (i / (values.length - 1)) * (W - 28), H - bottom - ((v - low) / (high - low)) * (H - bottom - top)]);
  const line = splinePath(pts);
  const area = `${line} L ${pts[pts.length - 1][0]} ${H - bottom + 6} L ${pts[0][0]} ${H - bottom + 6} Z`;
  const guides = [80, 120, 160].map((v) => H - bottom - ((v - low) / (high - low)) * (H - bottom - top)).map((y) => `<path class="guide" d="M8 ${y.toFixed(1)}H${W - 8}"/>`).join("");
  const dots = pts.map(([x, y], i) => (i === pts.length - 1
    ? `<g class="dot" style="--i:${i}"><circle cx="${x}" cy="${y}" r="7" fill="${C.blue9}"/><circle cx="${x}" cy="${y}" r="4" fill="${hi}"/></g>`
    : `<circle class="dot" style="--i:${i}" cx="${x}" cy="${y}" r="4" fill="${C.blue9}"/>`)).join("");
  const id = `tw-warm-${Math.random().toString(36).slice(2, 8)}`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}" stop-opacity="0.55"/><stop offset="1" stop-color="${hi}" stop-opacity="0"/></linearGradient></defs>${guides}<path class="area" d="${area}" fill="url(#${id})"/><path class="line" d="${line}" fill="none" stroke="${C.blue9}" stroke-width="2.5" stroke-linecap="round"/>${dots}</svg>`;
}

function chartBars(hi, n) {
  const sets = [[42, 58, 50, 66, 54, 72, 88], [64, 52, 70, 48, 60, 44, 36], [30, 46, 40, 58, 66, 62, 80]];
  const values = sets[n % sets.length];
  const gap = 10, bw = (W - 16 - gap * (values.length - 1)) / values.length;
  const base = H - 10;
  const bars = values.map((v, i) => {
    const h = (v / 100) * (H - 26);
    const last = i === values.length - 1;
    return `<rect class="bar" style="--i:${i}" x="${(8 + i * (bw + gap)).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${C.blue9}" fill-opacity="${last ? 1 : 0.14}"/>`;
  }).join("");
  const lastX = 8 + (values.length - 1) * (bw + gap) + bw / 2;
  const lastY = base - (values[values.length - 1] / 100) * (H - 26) - 12;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path class="guide" d="M8 ${base + 0.5}H${W - 8}"/>${bars}<circle class="dot" style="--i:7" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="5" fill="${hi}" stroke="${C.blue9}" stroke-width="2"/></svg>`;
}

function chartPanel(hi, n) {
  // the brand's range bar: a grey track in three segments, the healthy range
  // in the card's colour, a navy dot where this reading sits
  const rows = [[0.3, 0.62, 0.48], [0.22, 0.55, 0.81], [0.4, 0.7, 0.58]];
  const x0 = 10, x1 = W - 10, th = 14, gap = 6;
  const band = hexMix(hi, C.gray0, 0.1);
  const grey = C.gray2;
  const px = (f) => x0 + (x1 - x0) * f;
  const seg = (a, b, fill, cls, i) => {
    const l = px(a) + (a === 0 ? 0 : gap / 2), r = px(b) - (b === 1 ? 0 : gap / 2);
    return `<rect class="${cls}" style="--i:${i}" x="${l.toFixed(1)}" width="${(r - l).toFixed(1)}" height="${th}" rx="${th / 2}" fill="${fill}"/>`;
  };
  const out = rows.map((r, i) => {
    const [lo, hiF, val] = n % 2 ? [r[0], r[1], r[2]] : [r[0], r[1], 1 - r[2] * 0.9];
    const y = 22 + i * 46;
    return `<g class="row" style="--i:${i}" transform="translate(0 ${y})">${seg(0, lo, grey, "seg", i)}${seg(lo, hiF, band, "band", i)}${seg(hiF, 1, grey, "seg", i)}<circle class="dot" style="--i:${i}" cx="${px(val).toFixed(1)}" cy="${th / 2}" r="10" fill="${C.blue9}"/></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${out}</svg>`;
}

const CSS = `
.tw { position: absolute; inset: 0; overflow: hidden; transition: background-color .4s ease; }
.tw-root { position: absolute; inset: 0; will-change: transform; }
.tw-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
.tw-anchor { position: absolute; left: 0; top: 0; will-change: transform; }
.tw-card { position: absolute; left: 0; top: 0; box-sizing: border-box; transform: translate(-50%, -50%); visibility: hidden;
  overflow: hidden; border-radius: 16px; padding: 18px 16px; display: flex; align-items: center; justify-content: center; }
.tw-card svg { display: block; width: 100%; height: 100%; overflow: visible; }
.tw-card .guide { stroke: ${C.blue9}; stroke-opacity: .14; stroke-width: 1; stroke-dasharray: 2 4; fill: none; }
.tw-card .line { stroke-dasharray: 720; stroke-dashoffset: 720; animation: twDraw 1000ms cubic-bezier(.2,.8,.2,1) var(--d, 500ms) forwards; }
.tw-card .area { opacity: 0; animation: twFade 700ms ease calc(var(--d, 500ms) + 450ms) forwards; }
.tw-card .dot { transform-box: fill-box; transform-origin: center; transform: scale(0); animation: twPop 420ms cubic-bezier(.2,.9,.3,1.25) calc(var(--d, 500ms) + 220ms + var(--i, 0) * 120ms) forwards; }
.tw-card .bar { transform-box: fill-box; transform-origin: center bottom; transform: scaleY(0); animation: twGrow 620ms cubic-bezier(.2,.8,.2,1) calc(var(--d, 500ms) + var(--i, 0) * 70ms) forwards; }
.tw-card .row { opacity: 0; animation: twFade 520ms cubic-bezier(.2,.8,.2,1) calc(var(--d, 500ms) + var(--i, 0) * 110ms) forwards; }
.tw-card .band { transform-box: fill-box; transform-origin: left center; transform: scaleX(0); animation: twBand 700ms cubic-bezier(.2,.8,.2,1) calc(var(--d, 500ms) + 160ms + var(--i, 0) * 110ms) forwards; }
.tw-card .row .dot { animation-delay: calc(var(--d, 500ms) + 520ms + var(--i, 0) * 110ms); }
.tw.still .tw-card * { animation-duration: 1ms !important; animation-delay: 0ms !important; }
@keyframes twDraw { to { stroke-dashoffset: 0; } }
@keyframes twFade { to { opacity: 1; } }
@keyframes twPop { to { transform: scale(1); } }
@keyframes twGrow { to { transform: scaleY(1); } }
@keyframes twBand { to { transform: scaleX(1); } }
`;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);
  const uid = Math.random().toString(36).slice(2, 8);

  const wrap = document.createElement("div");
  wrap.className = `tw${still ? " still" : ""}`;
  const style = document.createElement("style");
  style.textContent = CSS;
  const root = document.createElement("div");
  root.className = "tw-root";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "tw-svg");
  svg.setAttribute("aria-hidden", "true");
  const anchor = document.createElement("div");
  anchor.className = "tw-anchor";
  const card = document.createElement("div");
  card.className = "tw-card";
  anchor.append(card);
  root.append(svg, anchor);
  wrap.append(style, root);
  host.append(wrap);

  let fw = 1, fh = 1;
  let live = null;
  let clock = 0; // ms, advanced only while the piece is running
  let raf = 0, last = 0;
  let onScreen = true, tabVisible = !document.hidden;
  let introDone = still;
  let introTimers = [];
  let surgeBase = 0;
  let deal = 0;
  let cardH = 188;
  const mgr = { mode: "idle", run: -1, uw: 0, uh: 0, phaseStart: 0, until: 0, surgeStart: 0, surgeDist: 0, surgeDone: false, waitFrom: 0, unsafeSince: 0, aimCenter: S.cardCenter };

  const palette = () => (PALETTES.find((p) => p.id === v["thread.palette"]) ?? PALETTES[0]).colors;
  // a phone keeps some thread either side of the card (the cards carry no copy to read)
  const cardW = () => Math.min(S.cardWidth, fw * (fw < 600 ? 0.62 : 0.82));
  const flowNow = () => v["motion.flow"] * Math.max(0.34, Math.min(1, fw / 1440));
  const holdMs = () => v["cards.hold"] * 1000;
  const driftFrac = () => (flowNow() * ((S.cardGrow + holdMs()) / 1000)) / fw;

  /* The weave: four heights joined smoothly (where it starts on the left,
     how far it dips, how far it comes back up, how far it falls away on the
     right), then composed into runs and stitches along that one path. */
  function rebuild(drawIn) {
    if (fw < 2 || fh < 2) return;
    svg.setAttribute("viewBox", `0 0 ${fw} ${fh}`);
    const rng = mulberry32(Math.round(S.seed) * 2654435761);
    const bleed = 80, n = 24;
    rng();
    rng();
    const keys = [[0, S.startY], [S.dipAt, S.dipY], [S.riseAt, S.riseY], [1, S.endY]];
    const mid = (Math.min(...keys.map((k) => k[1])) + Math.max(...keys.map((k) => k[1]))) / 2;
    const scale = v["thread.wave"] * Math.min(Math.max(0.45, Math.min(1, fw / 1000)), fh / 640);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = -bleed + t * (fw + bleed * 2);
      let yy = keys[keys.length - 1][1];
      for (let k = 0; k < keys.length - 1; k++) {
        const [ta, ya] = keys[k], [tb, yb] = keys[k + 1];
        if (t <= tb) {
          const u = Math.max(0, Math.min(1, (t - ta) / Math.max(tb - ta, 0.0001)));
          yy = ya + (yb - ya) * (u * u * (3 - 2 * u));
          break;
        }
      }
      pts.push([x, fh * 0.5 + (yy - mid) * scale]);
    }
    const d = splinePath(pts);
    const probe = document.createElementNS(NS, "path");
    probe.setAttribute("d", d);
    svg.replaceChildren(probe);
    const total = probe.getTotalLength();

    // the showcase: green, blue, pink and yellow as four short runs with a
    // stitch between each, framed by two long quiet runs
    const colors = palette();
    const SHOW = [C.green6, C.brightBlue, C.pink, C.yellow].filter((c) => colors.includes(c));
    const quiet = colors.filter((c) => !SHOW.includes(c));
    const order = [...colors];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const outerA = quiet.includes(C.blue9) ? C.blue9 : quiet[0] || colors[0];
    const outerB = quiet.find((c) => c !== outerA) || colors.find((c) => c !== outerA) || outerA;
    const stitch = (i) => (quiet.length ? quiet[(i + 1) % quiet.length] : order[i % order.length]);
    const pieces = [{ base: 1.2, color: outerA, tick: false, phase: rng() * Math.PI * 2 }];
    if (SHOW.length) {
      SHOW.forEach((c, i) => {
        pieces.push({ base: S.tickSize, color: stitch(i), tick: true, phase: rng() * Math.PI * 2 });
        pieces.push({ base: 0.42, color: c, tick: false, phase: rng() * Math.PI * 2 });
      });
    } else {
      // a palette with none of the showcase colours rolls its own runs
      order.slice(0, 4).forEach((c, i) => {
        pieces.push({ base: S.tickSize, color: order[(i + 4) % order.length], tick: true, phase: rng() * Math.PI * 2 });
        pieces.push({ base: 0.42, color: c, tick: false, phase: rng() * Math.PI * 2 });
      });
    }
    pieces.push({ base: S.tickSize, color: stitch(SHOW.length), tick: true, phase: rng() * Math.PI * 2 });
    pieces.push({ base: 1.8, color: outerB, tick: false, phase: rng() * Math.PI * 2 });

    const g = document.createElementNS(NS, "g");
    for (const p of pieces) {
      const seg = document.createElementNS(NS, "path");
      seg.setAttribute("d", d);
      seg.setAttribute("fill", "none");
      seg.setAttribute("stroke", p.color);
      seg.setAttribute("stroke-linecap", "butt");
      p.el = seg;
      g.appendChild(seg);
    }
    const runs = pieces.filter((p) => !p.tick).length;
    live = { t0: clock, pieces, total, runs, pts, g, path: pieces[0].el, reveal: null };
    Object.assign(mgr, { mode: "idle", until: 0, uw: 0, uh: 0, run: -1 });
    card.style.visibility = "hidden";

    if (drawIn && !still) {
      const mask = document.createElementNS(NS, "mask");
      mask.setAttribute("id", `tw-draw-${uid}`);
      mask.setAttribute("maskUnits", "userSpaceOnUse");
      const reveal = document.createElementNS(NS, "path");
      reveal.setAttribute("d", d);
      reveal.setAttribute("fill", "none");
      reveal.setAttribute("stroke", "#fff");
      reveal.setAttribute("stroke-width", String(v["thread.thickness"] + 4));
      reveal.setAttribute("stroke-dasharray", `${total} ${total}`);
      reveal.setAttribute("stroke-dashoffset", String(total));
      reveal.style.transition = `stroke-dashoffset ${S.drawMs}ms cubic-bezier(0.6, 0, 0.2, 1)`;
      mask.appendChild(reveal);
      g.setAttribute("mask", `url(#tw-draw-${uid})`);
      live.reveal = reveal;
      svg.replaceChildren(mask, g);
      requestAnimationFrame(() => requestAnimationFrame(() => (reveal.style.strokeDashoffset = "0")));
      const drop = () => {
        if (!live || live.reveal !== reveal) return;
        g.removeAttribute("mask");
        mask.remove();
        live.reveal = null;
      };
      reveal.addEventListener("transitionend", drop, { once: true });
      introTimers.push(setTimeout(drop, S.drawMs + 150));
    } else {
      svg.replaceChildren(g);
    }
    layout();
    // a still frame opens its card in the same breath: the first pass picks
    // the stitch, the second stretches it to the card's width
    if (still) layout();
  }

  /* ---- the dash conveyor ---- */
  function layout() {
    if (!live) return;
    const now = clock;
    const { pieces, total, runs } = live;
    const amp = still ? 0 : v["motion.breathe"] * 0.45;
    const t = now * 0.001 * S.speed * 1.6;
    let wsum = 0;
    for (const p of pieces) if (!p.tick) {
      p.w = p.base * (1 + amp * Math.sin(t + p.phase));
      wsum += p.w;
    }
    const flow = still ? surgeBase : Math.max(0, now - live.t0) * 0.001 * flowNow() + surgeOffset(now);
    // the card originates from a stitch and stretches it to the card's
    // width; the runs share whatever length remains
    const focusLen = S.tickSize + (cardW() - S.tickSize) * (mgr.uw || 0);
    let ti = 0, tickSum = 0;
    for (const p of pieces) {
      if (!p.tick) continue;
      p.lenNow = mgr.uw > 0 && ti === mgr.run ? focusLen : S.tickSize;
      tickSum += p.lenNow;
      ti++;
    }
    const runSpace = Math.max(total - tickSum, runs * 40);
    const width = String(v["thread.thickness"]);
    let at = 0;
    const anchors = [];
    for (const p of pieces) {
      const len = p.tick ? p.lenNow : (p.w / wsum) * runSpace;
      p.el.setAttribute("stroke-width", width);
      // a piece cycling past the right end re-enters at the left, drawn as
      // a second dash inside the same window
      const pos = (((at + flow) % total) + total) % total;
      if (pos + len <= total) p.el.setAttribute("stroke-dasharray", `0 ${pos.toFixed(2)} ${len.toFixed(2)} ${total.toFixed(2)}`);
      else {
        const r2 = pos + len - total;
        p.el.setAttribute("stroke-dasharray", `${r2.toFixed(2)} ${(pos - r2).toFixed(2)} ${(total - pos).toFixed(2)} ${total.toFixed(2)}`);
      }
      if (p.tick) anchors.push({ mid: (((at + flow + len / 2) % total) + total) % total, color: p.color, len });
      at += len;
    }
    if (live.reveal) live.reveal.setAttribute("stroke-width", String(v["thread.thickness"] + 4));
    live.anchors = anchors;
    cardTick(now, anchors, total);
  }

  function surgeOffset(now) {
    if (mgr.mode !== "surge" || mgr.surgeDone) return surgeBase;
    const u = Math.min(1, (now - mgr.surgeStart) / Math.max(S.cardShift, 1));
    return surgeBase + mgr.surgeDist * easeIO(u);
  }

  /* ---- the cards ---- */
  const xAt = (a) => live.path.getPointAtLength(a.mid).x;
  function visibleEnough(a) {
    const x = xAt(a) / fw, half = cardW() / 2 / fw;
    return x > Math.max(0.22, half + 0.04) && x < Math.min(0.62, 1 - half - driftFrac() - 0.04);
  }
  function safe(a) {
    const x = xAt(a) / fw, half = cardW() / 2 / fw;
    return x - half > -0.05 && x + half < 1.05;
  }
  function stale(a, now) {
    if (safe(a)) {
      mgr.unsafeSince = 0;
      return false;
    }
    if (!mgr.unsafeSince) mgr.unsafeSince = now;
    return now - mgr.unsafeSince > 800;
  }
  function pickCenter() {
    mgr.aimCenter = Math.max(0.26, Math.min(0.72, S.cardCenter + (Math.random() * 2 - 1) * S.cardSpread));
    return mgr.aimCenter;
  }
  // how far to ride so a stitch arrives where the next card likes to open
  function aimedSurge(anchors, total, avoid, minD) {
    if (!anchors.length) return minD;
    const aim = fw * pickCenter() - (flowNow() * (S.cardGrow + holdMs() * 0.5)) / 1000;
    const lead = (flowNow() * S.cardShift) / 1000;
    let best = { D: minD, err: Infinity };
    for (let D = minD; D < minD + total; D += 6) {
      for (let i = 0; i < anchors.length; i++) {
        if (i === avoid && anchors.length > 1) continue;
        const arc = (((anchors[i].mid + D + lead) % total) + total) % total;
        const err = Math.abs(live.path.getPointAtLength(arc).x - aim);
        if (err < best.err) best = { D, err };
      }
      if (best.err < 4) break;
    }
    return best.D;
  }

  function themeCard() {
    const n = deal++;
    const hi = CARD_COLORS[n % CARD_COLORS.length];
    const kind = CARD_KINDS[n % CARD_KINDS.length];
    // the card's ground is white leaned toward its colour: a pale wash, not a slab
    card.style.background = hexMix(C.gray0, hi, S.cardTint);
    card.style.setProperty("--d", `${Math.round(S.cardGrow * 0.45)}ms`);
    card.innerHTML = kind === "line" ? chartLine(hi, n) : kind === "bars" ? chartBars(hi, n) : chartPanel(hi, n);
  }

  function openOn(now, anchors, avoid, waited) {
    const target = fw * (mgr.aimCenter || S.cardCenter);
    const ok = waited > 1200 ? () => true : waited > 500 ? safe : visibleEnough;
    const others = anchors.filter((a, i) => i !== avoid && ok(a));
    const pool = others.length ? others : anchors.filter(ok);
    if (!pool.length) return false;
    const pick = pool.reduce((a, b) => (Math.abs(xAt(b) - target) < Math.abs(xAt(a) - target) ? b : a));
    mgr.run = anchors.indexOf(pick);
    mgr.mode = "open";
    mgr.phaseStart = now;
    mgr.unsafeSince = 0;
    themeCard();
    return true;
  }

  function cardTick(now, anchors, total) {
    if (!v["cards.cards"] || !anchors.length) {
      mgr.uw = mgr.uh = 0;
      card.style.visibility = "hidden";
      return;
    }
    if (mgr.run >= anchors.length) mgr.run = 0;
    if (still) {
      if (mgr.run < 0) {
        const target = fw * S.cardCenter;
        const pick = anchors.reduce((a, b) => (Math.abs(xAt(b) - target) < Math.abs(xAt(a) - target) ? b : a));
        mgr.run = anchors.indexOf(pick);
        themeCard();
      }
      mgr.uw = mgr.uh = 1;
    } else if (mgr.mode === "idle") {
      if (!mgr.until) mgr.until = now + (introDone ? 900 : S.introHold + S.introPull * 0.55 + 250);
      if (now >= mgr.until) openOn(now, anchors, -1, now - mgr.until);
    } else if (mgr.mode === "open") {
      // width first: the ribbon stretches, then the card rises over the back half
      const t2 = now - mgr.phaseStart;
      mgr.uw = easeIO(Math.min(1, t2 / (S.cardGrow * 0.6)));
      mgr.uh = easeIO(Math.max(0, Math.min(1, (t2 - S.cardGrow * 0.45) / (S.cardGrow * 0.55))));
      if (stale(anchors[mgr.run], now)) {
        mgr.mode = "fold";
        mgr.phaseStart = now;
      } else if (t2 >= S.cardGrow) {
        mgr.uw = mgr.uh = 1;
        mgr.mode = "hold";
        mgr.until = now + holdMs();
      }
    } else if (mgr.mode === "hold") {
      mgr.uw = mgr.uh = 1;
      if (stale(anchors[mgr.run], now)) mgr.until = now;
      if (now >= mgr.until) {
        mgr.mode = "fold";
        mgr.phaseStart = now;
      }
    } else if (mgr.mode === "fold") {
      // the card sinks back into the ribbon first, then the ribbon narrows
      const growF = S.cardGrow * 0.8, t2 = now - mgr.phaseStart;
      mgr.uh = 1 - easeIO(Math.min(1, t2 / (growF * 0.55)));
      mgr.uw = 1 - easeIO(Math.max(0, Math.min(1, (t2 - growF * 0.4) / (growF * 0.6))));
      if (t2 >= growF) {
        mgr.uw = mgr.uh = 0;
        mgr.mode = "surge";
        mgr.surgeStart = now;
        mgr.surgeDist = aimedSurge(anchors, total, mgr.run, S.cardCycle * total);
        mgr.surgeDone = false;
      }
    } else if (mgr.mode === "surge") {
      mgr.uw = mgr.uh = 0;
      if (now - mgr.surgeStart >= S.cardShift) {
        if (!mgr.surgeDone) {
          surgeBase += mgr.surgeDist;
          mgr.surgeDone = true;
          mgr.waitFrom = now;
        }
        openOn(now, anchors, mgr.run, now - (mgr.waitFrom || now));
      }
    }

    const focus = anchors[mgr.run];
    if (!focus || mgr.uh <= 0.01) {
      card.style.visibility = "hidden";
      return;
    }
    const cw = cardW();
    cardH = Math.round(Math.max(150, Math.min(196, cw * 0.69)));
    card.style.visibility = "visible";
    card.style.width = `${cw}px`;
    card.style.height = `${cardH}px`;
    const slice = v["thread.thickness"] + 4;
    const insetY = ((1 - mgr.uh) * Math.max(cardH - slice, 0)) / 2;
    const insetX = Math.max(0, (cw - focus.len) / 2);
    card.style.clipPath = `inset(${insetY.toFixed(1)}px ${insetX.toFixed(1)}px round ${Math.min(16, slice / 2 + mgr.uh * 16).toFixed(1)}px)`;
    const pt = live.path.getPointAtLength(focus.mid);
    const half = cw / 2;
    const cx = Math.max(half + 10, Math.min(fw - half - 10, pt.x));
    const safeY = Math.max(cardH / 2 + 12, Math.min(fh - cardH / 2 - 12, pt.y));
    const cy = pt.y + (safeY - pt.y) * mgr.uh;
    anchor.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
  }

  /* ---- the intro: the thread draws itself close up, the camera pulls out ---- */
  function weaveMidFrac() {
    if (!live) return 0.5;
    const half = 0.5 / S.introZoom;
    const inView = live.pts.filter(([x]) => x >= fw * (0.5 - half) && x <= fw * (0.5 + half));
    const pts = inView.length ? inView : live.pts;
    return Math.max(0.1, Math.min(0.9, pts.reduce((a, p) => a + p[1], 0) / pts.length / fh));
  }
  function playIntro() {
    for (const t of introTimers) clearTimeout(t);
    introTimers = [];
    surgeBase = 0;
    deal = 0;
    introDone = false;
    rebuild(true);
    if (still) {
      introDone = true;
      return;
    }
    const at = weaveMidFrac();
    root.style.transition = "none";
    root.style.transformOrigin = `50% ${(at * 100).toFixed(2)}%`;
    root.style.transform = `translateY(${((0.5 - at) * 100).toFixed(2)}%) scale(${S.introZoom})`;
    void root.offsetWidth;
    introTimers.push(setTimeout(() => {
      root.style.transition = `transform ${S.introPull}ms cubic-bezier(0.5, 0, 0.15, 1)`;
      root.style.transform = "translateY(0%) scale(1)";
      introTimers.push(setTimeout(() => {
        root.style.transition = "";
        root.style.transform = "";
        introDone = true;
      }, S.introPull + 100));
    }, S.introHold));
  }

  function paint() {
    wrap.style.backgroundColor = v["colour.ground"];
  }

  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === fw && h === fh) return false;
    fw = w;
    fh = h;
    return true;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(50, Math.max(0, now - last));
    last = now;
    clock += dt;
    layout();
  }

  function sync() {
    const run = !still && onScreen && tabVisible && fw > 1;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const ro = new ResizeObserver(() => {
    const first = !live;
    if (!resize() && !first) return;
    if (first) playIntro();
    else rebuild(false);
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
  if (fw > 1 && fh > 1) playIntro();
  sync();

  return {
    update(values, path) {
      Object.assign(v, values);
      paint();
      if (path === "thread.palette" || path === "thread.wave" || path == null) {
        const drawIn = false;
        const base = surgeBase;
        rebuild(drawIn);
        surgeBase = base;
      }
      if (path === "cards.cards" && v["cards.cards"]) Object.assign(mgr, { mode: "idle", until: 0, run: -1 });
      layout();
      if (still) layout();
    },
    action(name) {
      if (name === "replay") playIntro();
      sync();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      for (const t of introTimers) clearTimeout(t);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      wrap.remove();
    },
  };
}
