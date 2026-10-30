/* Thread line.

   Counsel's thread line tool (clients/counsel/prototypes/thread-line.html),
   on its light green ground. One long smooth curve, a gentle wave with a
   slow seeded drift, calmed toward both edges and bleeding past them, cut
   into uneven coloured runs with butt joints and short stitch ticks in some
   of the seams. The whole pattern marches to the right forever (each run's
   dash pattern tiles at the path's length, so a run leaving on the right
   comes back on the left) while the runs swell and shrink around their
   seeded lengths. It draws itself in along its own length.

   Then the tool's card: one stitch near the middle stretches out along the
   line to a card's width, the runs either side shrinking to make room, and
   a small card rises out of that stretch of ribbon, washed in its colour.
   While it holds, its level fills; it sinks back into the line, the stitch
   narrows, and the whole set surges on to the right so a fresh one can open.

   Ported from the tool's own code: the curve, the cut, the travel and the
   breathing, the card's open, hold, fold and surge. The card carried a
   label and a counting figure; here the label is a plain chip and the
   figure a level that fills the same way, so there is no text. The tool's
   Draw a line button is the action. */

export const params = {
  curve: {
    waves: [0.8, 0.2, 1.75, 0.05],
    amplitude: [0.16, 0, 0.4, 0.01],
    tilt: [0, -0.5, 0.5, 0.01],
  },
  thread: {
    palette: {
      type: "swatches",
      label: "Palette",
      default: "full",
      options: [
        { id: "full", label: "Full thread", colors: ["#FADA78", "#FF93AD", "#132045", "#018150", "#47AFFF", "#BBD6EA", "#DCEAD9"] },
        { id: "billboard", label: "Billboard", colors: ["#FF93AD", "#BBD6EA", "#132045", "#47AFFF", "#FADA78", "#6A2032"] },
        { id: "greens", label: "Greens", colors: ["#018150", "#005434", "#9ADB8F", "#DCEAD9", "#FADA78"] },
        { id: "blues", label: "Blues", colors: ["#132045", "#47AFFF", "#97BCE6", "#BBD6EA", "#FF93AD"] },
        { id: "brights", label: "Brights", colors: ["#FADA78", "#FF93AD", "#47AFFF", "#DBE64C"] },
      ],
    },
    thickness: [10, 2, 36, 1],
    segments: [5, 2, 12, 1],
  },
  motion: {
    flow: [40, 0, 150, 1],
    breathe: [0.25, 0, 1, 0.01],
  },
  cards: {
    cards: { type: "toggle", labels: ["Line only", "Cards"], default: true },
    hold: [2.2, 0.5, 6, 0.1],
  },
  colour: {
    ground: { type: "color", default: "#e5f7e1", options: ["#e5f7e1", "#f8f9f4", "#003722", "#132045"] },
  },
  draw: { type: "action", label: "Draw a line" },
};

// the tool's fixed dials, as it opens
const S = {
  wobble: 0.25, position: 0.5, variance: 0.5, ticks: 0.7, tickSize: 16, speed: 0.6,
  cardGrow: 900, cardShift: 900, cardCycle: 0.55, cardWidth: 320,
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

// Catmull-Rom through the sampled points, as one smooth cubic path
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

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function hexMix(a, b, t) {
  const pa = rgbOf(a), pb = rgbOf(b);
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
function lum(hex) {
  const [r, g, b] = rgbOf(hex).map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const inkFor = (hex) => (lum(hex) > 0.45 ? "#132045" : "#f8f9f4");
const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

// the draw-in's curve, cubic-bezier(0.6, 0, 0.2, 1), solved for x
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t;
  const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = X(t) - x, d = dX(t);
      if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    t = Math.max(0, Math.min(1, t));
    return ((ay * t + by) * t + cy) * t;
  };
}
const drawEase = bezier(0.6, 0, 0.2, 1);
const DRAW_MS = 1100;

const CSS = `
.tl { position: absolute; inset: 0; overflow: hidden; transition: background-color .4s ease; }
.tl-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
.tl-anchor { position: absolute; left: 0; top: 0; will-change: transform; pointer-events: none; }
.tl-card { position: absolute; left: 0; top: 0; box-sizing: border-box; transform: translate(-50%, -50%); visibility: hidden;
  overflow: hidden; border-radius: 18px; padding: 14px 16px 16px; display: flex; flex-direction: column;
  align-items: flex-start; justify-content: space-between; gap: 38px; }
.tl-chip { display: block; width: 92px; max-width: 46%; height: 24px; border-radius: 8px; flex: none; }
.tl-level { position: relative; display: block; width: 100%; height: 12px; border-radius: 6px; overflow: hidden; flex: none; }
.tl-level i { position: absolute; left: 0; top: 0; bottom: 0; display: block; border-radius: 6px; }
`;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);

  const wrap = document.createElement("div");
  wrap.className = "tl";
  const style = document.createElement("style");
  style.textContent = CSS;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "tl-svg");
  svg.setAttribute("aria-hidden", "true");
  const anchor = document.createElement("div");
  anchor.className = "tl-anchor";
  const card = document.createElement("div");
  card.className = "tl-card";
  const chip = document.createElement("span");
  chip.className = "tl-chip";
  const level = document.createElement("span");
  level.className = "tl-level";
  const fill = document.createElement("i");
  level.append(fill);
  card.append(chip, level);
  anchor.append(card);
  wrap.append(style, svg, anchor);
  host.append(wrap);

  let fw = 1, fh = 1;
  let seed = 7;
  let live = null;
  let clock = 0; // ms, advanced only while the piece runs
  let raf = 0, last = 0;
  let onScreen = true, tabVisible = !document.hidden;
  let surgeBase = 0;
  let flowPos = 0; // px travelled along the path
  let cardH = 120;
  const mgr = { mode: "idle", run: -1, uw: 0, uh: 0, phaseStart: 0, until: 0, levelStart: 0, surgeStart: 0, surgeDist: 0 };

  const palette = () => (params.thread.palette.options.find((p) => p.id === v["thread.palette"]) ?? params.thread.palette.options[0]).colors;
  const cardTarget = () => Math.min(S.cardWidth, fw * 0.7, (live?.total ?? 1000) * 0.35);
  // a narrow stage travels a little slower, so a card has time to be read before it leaves
  const flowNow = () => v["motion.flow"] * Math.max(0.4, Math.min(1, fw / 1440));
  // where a card opens: the middle, less half of how far it will ride while it is open
  const aimX = () => {
    const ride = (flowNow() * (S.cardGrow + v["cards.hold"] * 1000)) / 1000;
    return fw / 2 - Math.min(ride / 2, Math.max(0, fw / 2 - cardTarget() / 2 - 12));
  };

  function paint() {
    wrap.style.backgroundColor = v["colour.ground"];
  }

  /* The curve: long swings only, never a scribble. The wave and one low
     frequency drift are smooth functions, an envelope calms the swing toward
     both edges, and the last stretch settles into a long easy tail. Then the
     cut: uneven runs, and a stitch slipped into some of the seams. */
  function rebuild(drawIn) {
    if (fw < 2 || fh < 2) return;
    svg.setAttribute("viewBox", `0 0 ${fw} ${fh}`);
    const rng = mulberry32(Math.round(seed) * 2654435761);
    const bleed = 80, n = 24;
    const amp = v["curve.amplitude"], waves = v["curve.waves"], tilt = v["curve.tilt"];
    const phase = rng() * Math.PI * 2, phase2 = rng() * Math.PI * 2;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = -bleed + t * (fw + bleed * 2);
      const settle = 0.55 + 0.45 * Math.sin(Math.PI * t);
      const tail = 1 - 0.6 * Math.max(0, (t - 0.78) / 0.22);
      const wave = Math.sin(phase + t * waves * Math.PI * 2) * amp * fh;
      const drift = Math.sin(phase2 + t * 1.4 * Math.PI) * S.wobble * amp * fh * 0.5;
      pts.push([x, fh * S.position + (wave + drift) * settle * tail + (t - 0.5) * tilt * fh]);
    }
    const d = splinePath(pts);
    const probe = document.createElementNS(NS, "path");
    probe.setAttribute("d", d);
    svg.replaceChildren(probe);
    const total = probe.getTotalLength();

    const runs = Math.max(2, Math.round(v["thread.segments"]));
    const weights = [];
    for (let i = 0; i < runs; i++) weights.push(1 + (rng() * 2 - 1) * S.variance);
    const wsum = weights.reduce((a, b) => a + b, 0);
    const order = [...palette()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let ci = 0;
    const nextColor = (avoid) => {
      let c = order[ci % order.length];
      if (c === avoid) {
        ci++;
        c = order[ci % order.length];
      }
      ci++;
      return c;
    };
    const tickBudget = weights.map(() => rng() < S.ticks);
    const pieces = [];
    let prev = null;
    for (let i = 0; i < runs; i++) {
      const c = nextColor(prev);
      pieces.push({ base: weights[i] / wsum, color: c, tick: false, phase: rng() * Math.PI * 2 });
      prev = c;
      if (i < runs - 1 && tickBudget[i]) {
        const t = nextColor(prev);
        pieces.push({ base: S.tickSize, color: t, tick: true, phase: rng() * Math.PI * 2 });
        prev = t;
      }
    }
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
    live = { pieces, total, runs, path: pieces[0].el, reveal: null, drawFrom: clock };
    Object.assign(mgr, { mode: "idle", until: 0, uw: 0, uh: 0, run: -1, avoid: -1 });
    card.style.visibility = "hidden";

    // the Draw move: the thread draws itself in along its own length
    if (drawIn && !still) {
      const id = `tl-draw-${Math.random().toString(36).slice(2, 8)}`;
      const mask = document.createElementNS(NS, "mask");
      mask.setAttribute("id", id);
      mask.setAttribute("maskUnits", "userSpaceOnUse");
      mask.setAttribute("x", String(-bleed * 2));
      mask.setAttribute("y", String(-fh));
      mask.setAttribute("width", String(fw + bleed * 4));
      mask.setAttribute("height", String(fh * 3));
      const reveal = document.createElementNS(NS, "path");
      reveal.setAttribute("d", d);
      reveal.setAttribute("fill", "none");
      reveal.setAttribute("stroke", "#fff");
      reveal.setAttribute("stroke-dasharray", String(total));
      reveal.setAttribute("stroke-dashoffset", String(total));
      mask.appendChild(reveal);
      g.setAttribute("mask", `url(#${id})`);
      live.reveal = reveal;
      live.mask = mask;
      svg.replaceChildren(mask, g);
    } else svg.replaceChildren(g);
    layout();
  }

  /* The runs travel and breathe: the whole pattern marches along the path to
     the right, each piece's dash tiling at the path's length, while the runs
     swell and shrink round their seeded share and the stitches hold. The
     focused stitch stretches to the card's width, the runs sharing what is
     left. */
  function layout() {
    if (!live) return;
    const { pieces, total, runs } = live;
    const amp = still ? 0 : v["motion.breathe"] * 0.45;
    const t = clock * 0.001 * S.speed * 1.6;
    let wsum = 0;
    for (const p of pieces) {
      if (!p.tick) {
        p.w = p.base * (1 + amp * Math.sin(t + p.phase));
        wsum += p.w;
      }
    }
    const flow = still ? 0 : flowPos + surgeOffset();
    const uw = mgr.uw || 0;
    const focusLen = S.tickSize + (cardTarget() - S.tickSize) * uw;
    let ti = 0, tickSum = 0;
    for (const p of pieces) {
      if (!p.tick) continue;
      p.lenNow = uw > 0 && ti === mgr.run ? focusLen : S.tickSize;
      tickSum += p.lenNow;
      ti++;
    }
    const runSpace = Math.max(total - tickSum, runs * 40);
    let at = 0;
    const ticks = [], runsNow = [];
    const width = v["thread.thickness"];
    for (const p of pieces) {
      const len = p.tick ? p.lenNow : (p.w / wsum) * runSpace;
      p.el.setAttribute("stroke-width", width);
      p.el.setAttribute("stroke-dasharray", `${len} ${Math.max(total - len, 0)}`);
      p.el.setAttribute("stroke-dashoffset", String(-((at + flow) % total)));
      const mid = (at + flow + len / 2) % total;
      (p.tick ? ticks : runsNow).push({ mid, color: p.color, len });
      at += len;
    }
    if (live.reveal) {
      const u = (clock - live.drawFrom) / DRAW_MS;
      live.reveal.setAttribute("stroke-width", width + 4);
      live.reveal.setAttribute("stroke-dashoffset", String(total * (1 - drawEase(u))));
      if (u >= 1) {
        // drawn: the mask has done its work
        live.pieces[0].el.parentNode?.removeAttribute("mask");
        live.mask?.remove();
        live.reveal = null;
      }
    }
    cardTick(ticks.length ? ticks : runsNow, total);
  }

  // during a surge the dash pattern gets an extra eased push on top of the flow
  function surgeOffset() {
    if (mgr.mode !== "surge") return surgeBase;
    const u = Math.min(1, (clock - mgr.surgeStart) / Math.max(S.cardShift, 1));
    return surgeBase + mgr.surgeDist * easeIO(u);
  }

  const pointAt = (mid) => live.path.getPointAtLength(((mid % live.total) + live.total) % live.total);
  const visibleRun = (r) => {
    const x = pointAt(r.mid).x;
    return x > fw * 0.1 && x < fw * 0.9;
  };
  function themeCard(color) {
    const bg = hexMix(v["colour.ground"], color, 0.32);
    card.style.background = bg;
    chip.style.background = color;
    // the level is drawn in the ink the figure was set in
    const ink = inkFor(bg);
    level.style.background = `color-mix(in srgb, ${ink} 14%, transparent)`;
    fill.style.background = ink;
  }
  // the level fills from half to nearly full while the card holds, as the tool's figure counted
  const setLevel = (u) => (fill.style.width = `${(50 + 49 * u).toFixed(2)}%`);

  /* The surge rides on about half the thread, as far as brings the next
     stitch to where a card opens, so a narrow stage never waits for one. */
  function arcAtX(x) {
    let lo = 0, hi = live.total;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (live.path.getPointAtLength(mid).x < x) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function surgeTo(anchors, total) {
    const want = S.cardCycle * total;
    const aim = arcAtX(aimX()) - (flowNow() * S.cardShift) / 1000;
    const pool = anchors.length > 1 ? anchors.filter((_, i) => i !== mgr.run) : anchors;
    let best = null;
    for (const a of pool) {
      let d = (((aim - a.mid) % total) + total) % total;
      while (d < total * 0.3) d += total;
      if (best === null || Math.abs(d - want) < Math.abs(best - want)) best = d;
    }
    return best ?? want;
  }

  // a card opens only where it will fit whole; after a while waiting, on the nearest stitch anyway
  function openOn(anchors, avoid, force) {
    const score = (a) => Math.abs(pointAt(a.mid).x - aimX());
    const half = cardTarget() / 2 + 12;
    const fits = (a) => {
      const x = pointAt(a.mid).x;
      return x - half >= 0 && x + half <= fw;
    };
    let pool = anchors.filter((a, i) => i !== avoid && fits(a));
    if (!pool.length) pool = anchors.filter(fits);
    if (!pool.length && !force) return false;
    if (!pool.length) pool = anchors.filter((a, i) => i !== avoid && visibleRun(a));
    if (!pool.length) pool = anchors.filter(visibleRun);
    const pick = (pool.length ? pool : anchors).reduce((a, b) => (score(b) < score(a) ? b : a));
    mgr.run = anchors.indexOf(pick);
    mgr.color = pick.color;
    themeCard(pick.color);
    setLevel(0);
    mgr.levelStart = clock;
    mgr.mode = "open";
    mgr.phaseStart = clock;
    return true;
  }

  function cardTick(anchors, total) {
    if (!v["cards.cards"] || !anchors.length) {
      mgr.uw = 0;
      mgr.uh = 0;
      card.style.visibility = "hidden";
      return;
    }
    if (mgr.run >= anchors.length) mgr.run = 0;
    const now = clock, hold = v["cards.hold"] * 1000;
    if (still) {
      if (mgr.run < 0) {
        const score = (a) => Math.abs(pointAt(a.mid).x - fw / 2);
        mgr.run = anchors.indexOf(anchors.reduce((a, b) => (score(b) < score(a) ? b : a)));
      }
      mgr.uw = 1;
      mgr.uh = 1;
      mgr.color = anchors[mgr.run].color;
      themeCard(mgr.color);
      setLevel(1);
    } else if (mgr.mode === "idle") {
      if (!mgr.until) mgr.until = now + (live.reveal ? 1600 : 400);
      if (now >= mgr.until) openOn(anchors, mgr.avoid ?? -1, now >= mgr.until + 2500);
    } else if (mgr.mode === "open") {
      // width first: the ribbon stretches over the front of the grow, the card rises over the back
      const t2 = now - mgr.phaseStart;
      mgr.uw = easeIO(Math.min(1, t2 / (S.cardGrow * 0.6)));
      mgr.uh = easeIO(Math.max(0, Math.min(1, (t2 - S.cardGrow * 0.45) / (S.cardGrow * 0.55))));
      if (t2 >= S.cardGrow) {
        mgr.uw = 1;
        mgr.uh = 1;
        mgr.mode = "hold";
        mgr.until = now + hold;
      }
    } else if (mgr.mode === "hold") {
      mgr.uw = 1;
      mgr.uh = 1;
      const su = Math.min(1, (now - mgr.levelStart) / Math.max(Math.min(hold * 0.75, 1600), 1));
      setLevel(1 - Math.pow(1 - su, 3));
      if (pointAt(anchors[mgr.run].mid).x + anchors[mgr.run].len / 2 > fw - 12) mgr.until = now; // drifting off: wrap up
      if (now >= mgr.until) {
        mgr.mode = "fold";
        mgr.phaseStart = now;
      }
    } else if (mgr.mode === "fold") {
      // the card sinks back into the ribbon first, then the ribbon narrows to its stitch
      const growF = S.cardGrow * 0.8, t2 = now - mgr.phaseStart;
      mgr.uh = 1 - easeIO(Math.min(1, t2 / (growF * 0.55)));
      mgr.uw = 1 - easeIO(Math.max(0, Math.min(1, (t2 - growF * 0.4) / (growF * 0.6))));
      if (t2 >= growF) {
        Object.assign(mgr, { uw: 0, uh: 0, mode: "surge", surgeStart: now, surgeDist: surgeTo(anchors, total) });
      }
    } else if (mgr.mode === "surge") {
      mgr.uw = 0;
      mgr.uh = 0;
      if (now - mgr.surgeStart >= S.cardShift) {
        surgeBase += mgr.surgeDist;
        Object.assign(mgr, { mode: "idle", until: now, avoid: mgr.run });
        openOn(anchors, mgr.run, false);
      }
    }

    const focus = anchors[mgr.run];
    if (!focus || mgr.uh <= 0.01) {
      card.style.visibility = "hidden";
      return;
    }
    card.style.visibility = "visible";
    card.style.width = `${focus.len}px`;
    const slice = v["thread.thickness"] + 4;
    const insetY = ((1 - mgr.uh) * Math.max(cardH - slice, 0)) / 2;
    card.style.clipPath = `inset(${insetY.toFixed(2)}px 0px round ${Math.min(18, slice / 2 + mgr.uh * 18).toFixed(2)}px)`;
    const pt = pointAt(focus.mid);
    anchor.style.transform = `translate(${pt.x.toFixed(2)}px, ${pt.y.toFixed(2)}px)`;
  }

  function measureCard() {
    card.style.width = `${S.cardWidth}px`;
    card.style.clipPath = "none";
    cardH = card.offsetHeight || cardH;
  }

  /* ---- the loop ---- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(50, Math.max(0, now - last));
    last = now;
    clock += dt;
    flowPos += (dt / 1000) * flowNow();
    layout();
  }
  function sync() {
    const run = !still && onScreen && tabVisible && live;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === fw && h === fh) return false;
    fw = w;
    fh = h;
    return true;
  }

  const ro = new ResizeObserver(() => {
    const first = !live;
    if (!resize() && !first) return;
    const base = surgeBase;
    rebuild(first);
    surgeBase = base;
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
  measureCard();
  resize();
  if (fw > 1 && fh > 1) rebuild(true);
  sync();

  const SHAPE = new Set(["curve.waves", "curve.amplitude", "curve.tilt", "thread.segments", "thread.palette"]);
  return {
    update(values, path) {
      Object.assign(v, values);
      paint();
      if (path === "colour.ground" && mgr.color) themeCard(mgr.color);
      if (path == null || SHAPE.has(path)) {
        // a reshaped thread keeps its place in the flow, and does not replay the draw
        const base = surgeBase;
        rebuild(false);
        surgeBase = base;
      }
      if (path === "cards.cards" && v["cards.cards"]) Object.assign(mgr, { mode: "idle", until: 0, run: -1, avoid: -1 });
      layout();
    },
    action(name) {
      if (name !== "draw") return;
      // a different thread every press: a fresh seed, never the current one
      let s;
      do s = 1 + Math.floor(Math.random() * 99);
      while (s === seed);
      seed = s;
      rebuild(true);
      sync();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      wrap.remove();
    },
  };
}
