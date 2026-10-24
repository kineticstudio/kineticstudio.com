/* Kinetic lines.

   The mark is five strokes: a straight bar, then four arcs that bow further
   and further to the left. Measured off src/assets/brand/mark-ink.svg, each
   arc is a band between two concentric circles, cut flat at the top and the
   bottom, 101 units thick on a 1148-unit height. The five sit 189.5 apart at
   their middles and their left edges bow by 0, 53.7, 103, 170 and 265.6.

   Here that stroke becomes a field: rows of lines whose bow follows a wave
   that travels through them, so the mark keeps forming and letting go across
   the screen. "Mark only" draws the five on their own, breathing from
   straight to arcs and back. */

export const params = {
  markOnly: false,
  field: {
    lines: [48, 12, 140, 1],
    rows: [4, 1, 8, 1],
    weight: [0.5, 0.1, 0.9, 0.01],
  },
  wave: {
    curvature: [1, 0, 1.2, 0.01],
    speed: [0.22, 0, 1, 0.01],
    length: [1, 0.3, 3, 0.01],
    direction: { type: "select", options: ["Diagonal", "Left to right", "Right to left", "From centre"] },
  },
  colour: { ink: "#d9e2d2", ground: "#0d0d0d" },
};

const HALF = 574; // the mark's half-height, in its own units
const MARK_PITCH = 189.5 / 1148; // middle-to-middle spacing, as a share of height
const MARK_BOW = [0, 53.68, 103.0, 169.98, 265.58].map((s) => s / HALF); // left-edge bow / half-height
const BOW_MAX = MARK_BOW[4];

/* The deepest bow a stroke of half-height h and thickness T can take before
   its inner edge stops reaching the flat caps. */
const bowLimit = (h, T) => 0.97 * (h + T - Math.sqrt((h + T) ** 2 - h * h));

/* One stroke into the current path. x is the left edge at the middle, s the
   bow of that edge in px. Always wound the same way so overlaps stay filled. */
function stroke(g, x, cy, h, T, s) {
  if (s < 0.35) {
    g.moveTo(x, cy - h);
    g.lineTo(x, cy + h);
    g.lineTo(x + T, cy + h);
    g.lineTo(x + T, cy - h);
    g.closePath();
    return x + T;
  }
  const ro = (h * h + s * s) / (2 * s);
  const ri = ro - T;
  const cx = x + ro;
  const a = Math.asin(h / ro);
  const b = Math.asin(Math.min(1, h / ri));
  const inner = cx - Math.sqrt(Math.max(0, ri * ri - h * h));
  g.moveTo(cx - Math.sqrt(ro * ro - h * h), cy - h);
  g.arc(cx, cy, ro, Math.PI + a, Math.PI - a, true);
  g.lineTo(inner, cy + h);
  g.arc(cx, cy, ri, Math.PI - b, Math.PI + b, false);
  g.closePath();
  return inner; // the stroke's right-most point (at the caps)
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

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
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, on: 0, target: 0 };

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  /* The wave is a pulse shaped like the mark read left to right: a steep
     rise from straight to the deepest arc over about four strokes, then a
     long, easy return to straight, then a rest. q is px into the period. */
  function pulse(q, rise, fall) {
    if (q < rise) return (q / rise) ** 1.35;
    q -= rise;
    if (q < fall) {
      const u = q / fall;
      return 1 - u * u * (3 - 2 * u);
    }
    return 0;
  }

  /* Horizontal width of a stroke at its caps (wider than T once it bows). */
  function capWidth(s, h, T) {
    if (s < 0.35) return T;
    const ro = (h * h + s * s) / (2 * s);
    const ri = ro - T;
    return T + (ri - Math.sqrt(Math.max(0, ri * ri - h * h))) - s;
  }

  let bows = new Float32Array(0);

  function drawField() {
    // Lines are counted across a 1200px stage; narrower stages keep a little
    // more of the weight so a phone doesn't get hairlines.
    const lines = Math.max(6, Math.round(v["field.lines"] * Math.min(1.25, Math.sqrt(W / 1200))));
    const rows = Math.round(v["field.rows"]);
    const pitch = W / lines;
    const T = Math.max(0.75, v["field.weight"] * pitch);
    const gap = Math.max(12, Math.min(pitch * 1.8, H * 0.08));
    const rowH = (H - gap * (rows + 1)) / rows;
    const h = rowH / 2;
    const sCap = bowLimit(h, T);
    const A = Math.min(sCap, BOW_MAX * v["wave.curvature"] * h);
    const rise = pitch * 4.2;
    const fall = Math.max(v["wave.length"] * Math.max(W, H) * 0.3, pitch * 6);
    const lam = (rise + fall) * 1.7;
    const sp = v["wave.speed"] * (Math.max(W, H) * 0.62) / lam; // periods per second
    const dir = v["wave.direction"];
    const extra = Math.ceil((A + T * 2) / pitch) + 2;
    const n = lines + extra + 1;
    if (bows.length < n) bows = new Float32Array(n);
    const sig2 = (0.11 * Math.max(W, H)) ** 2;
    const pOn = pointer.on;
    const slack = 0.18 * (pitch - T);
    const shift = dir === "Right to left" ? time * sp : -time * sp;

    g.beginPath();
    for (let r = 0; r < rows; r++) {
      const cy = gap + h + r * (rowH + gap);
      for (let k = 0; k < n; k++) {
        const xc = (k - extra + 0.5) * pitch;
        let proj;
        if (dir === "Diagonal") proj = xc + (cy - H / 2) * 0.9;
        else if (dir === "From centre") proj = Math.hypot(xc - W / 2, (cy - H / 2) * 1.15);
        else proj = xc;
        const ph = proj / lam + shift;
        let f = pulse((ph - Math.floor(ph)) * lam, rise, fall);
        if (pOn > 0.001) {
          const d2 = (xc - pointer.x) ** 2 + (cy - pointer.y) ** 2;
          f = Math.max(f, pOn * Math.exp(-d2 / sig2));
        }
        let s = A * f;
        // Never let a stroke straighten so fast that the one before it,
        // fanned out at its caps, runs into it.
        if (k > 0) {
          const prev = bows[k - 1];
          const room = Math.max(0, pitch - capWidth(prev, h, T) - slack);
          s = Math.max(s, prev - room);
        }
        bows[k] = s;
        stroke(g, xc - T / 2, cy, h, T, s);
      }
    }
    g.fill();
  }

  function drawMark() {
    const height = Math.min(H * 0.62, W * 0.8 * (1148 / 1206));
    const h = height / 2;
    const pitch = MARK_PITCH * height;
    const T = v["field.weight"] * pitch;
    const sCap = bowLimit(h, T);
    const cy = H / 2;
    // Each stroke breathes on its own, a beat behind the one before, holding
    // at straight and at the full mark.
    const bows = MARK_BOW.map((b, i) => {
      let e = 1;
      if (!reduced) {
        const u = (((time * v["wave.speed"] * 0.9 - i * 0.045) % 1) + 1) % 1;
        e = smooth(0.06, 0.42, u) - smooth(0.58, 0.94, u);
      }
      return Math.min(sCap, b * v["wave.curvature"] * h * e);
    });
    // Measure, then centre the mark on its current width.
    const right = (i) => {
      const s = bows[i];
      if (s < 0.35) return i * pitch + T;
      const ro = (h * h + s * s) / (2 * s);
      const ri = ro - T;
      return i * pitch + ro - Math.sqrt(Math.max(0, ri * ri - h * h));
    };
    let wide = 0;
    for (let i = 0; i < 5; i++) wide = Math.max(wide, right(i));
    const x0 = (W - wide) / 2;
    g.beginPath();
    for (let i = 0; i < 5; i++) stroke(g, x0 + i * pitch, cy, h, T, bows[i]);
    g.fill();
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, W, H);
    g.fillStyle = v["colour.ink"];
    if (v.markOnly) drawMark();
    else drawField();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    const k = 1 - Math.exp(-dt * 6);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    pointer.on += (pointer.target - pointer.on) * (1 - Math.exp(-dt * 3));
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

  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    pointer.tx = e.clientX - r.left;
    pointer.ty = e.clientY - r.top;
    if (pointer.target === 0 && pointer.on < 0.02) {
      pointer.x = pointer.tx;
      pointer.y = pointer.ty;
    }
    pointer.target = 0.85;
  };
  const onLeave = () => (pointer.target = 0);
  if (!reduced) {
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
  }

  resize();
  draw();
  sync();

  return {
    update(values) {
      Object.assign(v, values);
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
      canvas.remove();
    },
  };
}
