/* Ease grid.

   Timing curves, felt instead of graphed. A grid of marks runs out and back
   on a loop, each one a beat behind the next in the chosen pattern, all on
   one easing curve, so the curve's character (the snap of expo, the
   overshoot of back, the wobble of a spring) reads as a wave across the
   whole field. The first mark to move is picked out in the accent colour,
   and the small readout in the corner traces that mark's progress along
   the curve. With the waves coming from the centre, a click moves where
   they start. */

const EASE = {
  "Expo in-out": (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
  Spring: (t) => {
    if (t >= 1) return 1;
    const z = 0.3, w = 14, wd = w * Math.sqrt(1 - z * z);
    const v = 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
    const settle = t ** 6;
    return v * (1 - settle) + settle;
  },
  "Back out": (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  "Elastic out": (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  "Bounce out": (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  "Expo out": (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  "Cubic in-out": (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  "Sine in-out": (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  Linear: (t) => t,
};

// the site's text face for the labels (no monospace anywhere, Hunter, Oct 25)
const TEXT_FACE = (typeof document !== "undefined" && getComputedStyle(document.documentElement).getPropertyValue("--primary-family").trim()) || "sans-serif";

export const params = {
  timing: {
    easing: { type: "select", options: Object.keys(EASE) },
    duration: [1.2, 0.2, 3, 0.05],
    stagger: [2.4, 0, 4, 0.05],
    pattern: { type: "select", options: ["From centre", "Diagonal", "Left to right", "Random"] },
  },
  grid: {
    size: [11, 4, 32, 1],
    property: { type: "select", options: ["Spin", "Scale", "Rise"] },
  },
  colour: { ink: "#d9e2d2", accent: "#a8ff66", ground: "#0d0d0d" },
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const rgb = (c) => {
  const n = parseInt(c.length === 4 ? c.slice(1).replace(/./g, "$&$&") : c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixCss = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 0, H = 0, dpr = 1;
  let time = 0, last = 0, raf = 0;
  let onScreen = true, tabVisible = !document.hidden;

  // Layout and stagger order, rebuilt when the grid or pattern changes.
  let cols = 0, rows = 0, cell = 0, ox = 0, oy = 0;
  let rank = new Float32Array(0), lead = 0;
  let card = 0; // the readout takes a card x card block of cells, bottom left
  let origin = null;
  let delay = new Float32Array(0); // each mark's current offset in time, easing toward rank x stagger
  let layoutKey = "";

  function seeded(seed) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  function layout() {
    const size = Math.round(v["grid.size"]);
    const key = `${W}x${H}:${size}:${v["timing.pattern"]}:${origin ? origin.join() : ""}`;
    if (key === layoutKey) return;
    layoutKey = key;
    cell = Math.min(W, H) / (size + 1);
    cols = Math.max(1, Math.floor(W / cell) - 1);
    rows = Math.max(1, Math.floor(H / cell) - 1);
    ox = (W - cols * cell) / 2 + cell / 2;
    oy = (H - rows * cell) / 2 + cell / 2;
    card = Math.ceil(Math.min(124, Math.max(92, Math.min(W, H) * 0.14)) / cell);
    if (cols < card + 2 || rows < card + 2) card = 0;
    const n = cols * rows;
    rank = new Float32Array(n);
    const fresh = delay.length !== n;
    if (fresh) delay = new Float32Array(n);
    const pattern = v["timing.pattern"];
    const [oc, or] = origin ?? [(cols - 1) / 2, (rows - 1) / 2];
    let max = 0;
    if (pattern === "Random") {
      const order = Array.from({ length: n }, (_, i) => i);
      const rnd = seeded(20261023);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      order.forEach((cellIndex, i) => (rank[cellIndex] = i));
      max = n - 1;
    } else {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let d;
          if (pattern === "Left to right") d = c;
          else if (pattern === "Diagonal") d = c + r;
          else d = Math.hypot(c - oc, r - or);
          rank[r * cols + c] = d;
          if (d > max) max = d;
        }
      }
    }
    lead = -1;
    for (let i = 0; i < n; i++) {
      rank[i] = max > 0 ? rank[i] / max : 0;
      if (!hidden(i) && (lead < 0 || rank[i] < rank[lead])) lead = i;
    }
    if (fresh) for (let i = 0; i < n; i++) delay[i] = rank[i] * v["timing.stagger"];
  }

  const hidden = (i) => card > 0 && i % cols < card && Math.floor(i / cols) >= rows - card;

  /* Every mark runs the same loop (out, hold, back, rest), offset in time
     by its place in the pattern, so the waves never stop coming. */
  function timing() {
    const dur = v["timing.duration"];
    const hold = 0.25 + dur * 0.2;
    return { dur, hold, period: 2 * (dur + hold) };
  }

  /* Where a mark is in its loop: the eased value, and its progress through
     the current run of the curve (for the readout). */
  function phaseAt(t, T, ease) {
    let u = t % T.period;
    if (u < 0) u += T.period;
    if (u < T.dur) return [ease(u / T.dur), u / T.dur];
    u -= T.dur;
    if (u < T.hold) return [1, 1];
    u -= T.hold;
    if (u < T.dur) return [1 - ease(u / T.dur), u / T.dur];
    return [0, 1];
  }

  function draw() {
    layout();
    const ease = EASE[v["timing.easing"]] ?? EASE["Expo in-out"];
    const T = timing();
    const prop = v["grid.property"];
    const stg = v["timing.stagger"];
    // A settled frame for reduced motion: part way through a wave.
    const now = reduced ? stg * 0.5 + T.dur * 0.6 : time;

    const ground = rgb(v["colour.ground"]), ink = rgb(v["colour.ink"]);
    const dim = ground.map((x, i) => x + (ink[i] - x) * 0.32);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, W, H);

    // Bucket the marks by tone so the whole grid is a dozen fills.
    const BUCKETS = 12;
    const paths = Array.from({ length: BUCKETS }, () => new Path2D());
    const leadPath = new Path2D();
    const dt = 0.045;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (hidden(i)) continue;
        const local = now - delay[i];
        const e = phaseAt(local, T, ease)[0];
        const x = ox + c * cell, y = oy + r * cell;
        const p = i === lead ? leadPath : paths[Math.min(BUCKETS - 1, Math.round(clamp01(e) * (BUCKETS - 1)))];
        if (prop === "Spin") {
          const a = (e * Math.PI) / 2;
          const len = cell * 0.33, th = cell * 0.07;
          const ca = Math.cos(a), sa = Math.sin(a);
          // A bar with round ends, turning from upright to flat.
          const dx = sa * len, dy = -ca * len;
          const nx = ca * th, ny = sa * th;
          p.moveTo(x - dx + nx, y - dy + ny);
          p.lineTo(x + dx + nx, y + dy + ny);
          p.arc(x + dx, y + dy, th, a, a - Math.PI, true);
          p.lineTo(x - dx - nx, y - dy - ny);
          p.arc(x - dx, y - dy, th, a + Math.PI, a, true);
          p.closePath();
        } else if (prop === "Rise") {
          // A dot that lifts through its cell and stretches with its speed.
          const rad = cell * 0.12;
          const lift = cell * 0.62;
          const yNow = y + lift * (0.5 - e);
          const ePrev = reduced ? e : phaseAt(local - dt, T, ease)[0];
          const yPrev = y + lift * (0.5 - ePrev);
          const top = Math.min(yNow, yPrev), bot = Math.max(yNow, yPrev);
          p.moveTo(x + rad, top);
          p.arc(x, top, rad, 0, Math.PI, true);
          p.lineTo(x - rad, bot);
          p.arc(x, bot, rad, Math.PI, 0, true);
          p.closePath();
        } else {
          const rad = Math.max(0, cell * (0.06 + 0.34 * e));
          p.moveTo(x + rad, y);
          p.arc(x, y, rad, 0, Math.PI * 2);
        }
      }
    }
    for (let b = 0; b < BUCKETS; b++) {
      g.fillStyle = mixCss(dim, ink, b / (BUCKETS - 1));
      g.fill(paths[b]);
    }
    g.fillStyle = v["colour.accent"];
    g.fill(leadPath);

    if (card && lead >= 0) drawReadout(ease, phaseAt(now - delay[lead], T, ease)[1], T, ink, ground);
  }

  /* The corner readout: the curve, and the lead mark riding along it. */
  function drawReadout(ease, pr, T, ink, ground) {
    // The card's cells, inset a little.
    const inset = Math.max(8, cell * 0.14);
    const bx = ox - cell / 2 + inset, by = oy + (rows - card - 0.5) * cell + inset;
    const bs = card * cell - inset * 2;
    const m = Math.max(10, bs * 0.1);
    const s = bs - m * 2;
    const x0 = bx + m, y0 = by + m;
    // How far this curve overshoots, so it always fits the box.
    let lo = 0, hi = 1;
    for (let i = 0; i <= 120; i++) {
      const y = ease(i / 120);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    const fs = s < 110 ? 10 : 11;
    const top = y0 + fs * 2.4, bottom = y0 + s - fs * 1.6;
    const Y = (val) => bottom - ((val - lo) / (hi - lo)) * (bottom - top);
    const X = (t) => x0 + t * s;

    g.fillStyle = mixCss(ground, ink, 0.07);
    g.beginPath();
    if (g.roundRect) g.roundRect(bx, by, bs, bs, Math.min(10, bs * 0.06));
    else g.rect(bx, by, bs, bs);
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = mixCss(ground, ink, 0.18);
    g.beginPath();
    g.moveTo(X(0), Y(0));
    g.lineTo(X(1), Y(0));
    g.moveTo(X(0), Y(1));
    g.lineTo(X(1), Y(1));
    g.stroke();
    g.strokeStyle = mixCss(ground, ink, 0.75);
    g.lineWidth = 1.5;
    g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      if (i) g.lineTo(X(t), Y(ease(t)));
      else g.moveTo(X(t), Y(ease(t)));
    }
    g.stroke();

    // The lead mark's progress through the curve, on each run out and back.
    g.fillStyle = v["colour.accent"];
    g.beginPath();
    g.arc(X(pr), Y(ease(pr)), 3.5, 0, Math.PI * 2);
    g.fill();

    g.font = `${fs}px ${TEXT_FACE}`;
    g.textBaseline = "top";
    g.textAlign = "left";
    g.fillStyle = mixCss(ground, ink, 0.85);
    g.fillText(v["timing.easing"], x0, y0);
    g.textBaseline = "bottom";
    g.textAlign = "right";
    g.fillStyle = mixCss(ground, ink, 0.5);
    g.fillText(`${T.dur.toFixed(2)}s`, x0 + s, y0 + s);
  }

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    // Delays glide to their new targets, so a new pattern, stagger or
    // origin re-times the wave instead of jumping it.
    const k = 1 - Math.exp(-dt * 3);
    const stg = v["timing.stagger"];
    for (let i = 0; i < delay.length; i++) delay[i] += (rank[i] * stg - delay[i]) * k;
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

  // Click: the waves start from the mark under the pointer.
  const onDown = (e) => {
    const r = host.getBoundingClientRect();
    const c = Math.round((e.clientX - r.left - ox) / cell);
    const rr = Math.round((e.clientY - r.top - oy) / cell);
    if (v["timing.pattern"] !== "From centre") return;
    origin = [Math.min(cols - 1, Math.max(0, c)), Math.min(rows - 1, Math.max(0, rr))];
    layout();
    if (reduced) settle();
    draw();
  };
  const settle = () => {
    for (let i = 0; i < delay.length; i++) delay[i] = rank[i] * v["timing.stagger"];
  };
  host.addEventListener("pointerdown", onDown);

  resize();
  draw();
  sync();

  return {
    update(values, path) {
      Object.assign(v, values);
      if (path === "timing.pattern" || path === null) origin = null;
      layout();
      if (reduced) settle();
      draw();
    },
    action() {},
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointerdown", onDown);
      canvas.remove();
    },
  };
}
