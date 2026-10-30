/* Black hole.

   Ported from a particle study in the Creative Studio. Thousands of grains
   are born on a ring beyond the edges and fall inward: each is given a home
   somewhere inside a shape, pulled toward it harder the closer it gets, and
   pushed sideways by a swirl, so the cloud wheels in on itself like matter
   round a black hole. A grain that reaches its home is swallowed and born
   again outside; drag keeps the orbits from flying apart. The cursor shoves
   grains aside as it passes.

   The study drew its shape from a client's mark; here the shape is a plain
   ring, disc or pair of discs, drawn by the piece. Its image upload is not
   part of it; the page never names the client. */

export const params = {
  particles: {
    count: [16500, 2000, 40000, 500],
    size: [1.6, 0.3, 3, 0.1],
  },
  pull: {
    suction: [0.9, 0, 3, 0.05],
    swirl: [1.2, -3, 3, 0.05],
    drag: [0.96, 0.8, 0.999, 0.001],
  },
  shape: {
    form: { type: "select", options: ["Ring", "Disc", "Pair"] },
    size: [0.4, 0.15, 0.9, 0.01],
  },
  colour: {
    ground: "#000000",
    dots: "#ffffff",
    trail: [1, 0.05, 1, 0.01],
  },
  reseed: { type: "action", label: "Re-seed" },
};

const STEP = 1 / 60;
const rgb = (h) => {
  const s = String(h).replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(f, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function mount(host, values, ctx = {}) {
  const reduced = Boolean(ctx.reducedMotion);
  let v = { ...values };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;";
  host.append(canvas);
  const g = canvas.getContext("2d", { alpha: false });

  let W = 1, H = 1, dpr = 1;
  let N = 0;
  let px, py, vx, vy, tx, ty;
  let targets = new Float32Array(0);
  let nTargets = 0;

  /* ----- the shape: every third pixel inside it is a home ----- */
  function buildTargets() {
    const cx = W / 2, cy = H / 2;
    const S = Math.min(W, H) * v["shape.size"];
    const form = v["shape.form"];
    const pts = [];
    const stepPx = 3;
    // the study's shape was a wide pair of lobes; the pair keeps its proportions
    const inside = (x, y) => {
      const dx = x - cx, dy = y - cy;
      if (form === "Disc") return dx * dx + dy * dy < (S * 0.5) ** 2;
      if (form === "Pair") {
        const r = S * 0.36, o = S * 0.42;
        return (dx - o) ** 2 + dy * dy < r * r || (dx + o) ** 2 + dy * dy < r * r;
      }
      const d = Math.hypot(dx, dy);
      return d < S * 0.5 && d > S * 0.33;
    };
    const R = S * 1.0;
    for (let y = Math.max(0, cy - R); y < Math.min(H, cy + R); y += stepPx) {
      for (let x = Math.max(0, cx - R); x < Math.min(W, cx + R); x += stepPx) {
        if (inside(x, y)) pts.push(x, y);
      }
    }
    targets = new Float32Array(pts);
    nTargets = pts.length / 2;
  }

  // smaller pieces get proportionally fewer grains, so the density holds
  const effectiveCount = () => Math.round(v["particles.count"] * Math.min(1, Math.max(0.3, (W * H) / (1440 * 900))));

  function spawnPos(i) {
    const cx = W / 2, cy = H / 2;
    const r = Math.max(W, H) * 0.5 * 1.1 + Math.random() * 40;
    const a = Math.random() * Math.PI * 2;
    px[i] = cx + Math.cos(a) * r;
    py[i] = cy + Math.sin(a) * r;
    vx[i] = -Math.cos(a) * (0.4 + Math.random() * 0.8);
    vy[i] = -Math.sin(a) * (0.4 + Math.random() * 0.8);
  }
  function assignTarget(i) {
    if (!nTargets) {
      tx[i] = W / 2;
      ty[i] = H / 2;
      return;
    }
    const k = (Math.random() * nTargets) | 0;
    tx[i] = targets[k * 2];
    ty[i] = targets[k * 2 + 1];
  }
  function seed(i, initial) {
    spawnPos(i);
    assignTarget(i);
    if (initial) {
      const t = Math.random();
      px[i] = px[i] * t + (W / 2) * (1 - t);
      py[i] = py[i] * t + (H / 2) * (1 - t);
    }
  }
  function sizePool() {
    const n = effectiveCount();
    if (n === N && px) return;
    const old = N;
    const grow = (a) => {
      const b = new Float32Array(n);
      if (a) b.set(a.subarray(0, Math.min(a.length, n)));
      return b;
    };
    px = grow(px); py = grow(py); vx = grow(vx); vy = grow(vy); tx = grow(tx); ty = grow(ty);
    N = n;
    for (let i = old; i < N; i++) seed(i, true);
  }

  /* ----- one step of the study's physics, per sixtieth of a second ----- */
  const mouse = { x: -1e6, y: -1e6, active: false };
  function step() {
    const pull = v["pull.suction"] * 0.06;
    const swirl = v["pull.swirl"] * 0.04;
    const drag = v["pull.drag"];
    const absorbR2 = 16;
    const mx = mouse.x, my = mouse.y, ma = mouse.active;
    for (let i = 0; i < N; i++) {
      const dx = tx[i] - px[i], dy = ty[i] - py[i];
      const d2 = dx * dx + dy * dy + 0.0001;
      const invD = 1 / Math.sqrt(d2);
      const f = pull * (1 + 60 / (d2 + 30));
      vx[i] += dx * invD * f - dy * invD * swirl;
      vy[i] += dy * invD * f + dx * invD * swirl;
      if (ma) {
        const mdx = px[i] - mx, mdy = py[i] - my;
        const md2 = mdx * mdx + mdy * mdy;
        if (md2 < 14000) {
          const inv = 1 / (Math.sqrt(md2) + 1);
          const k = 90 * inv * inv;
          vx[i] += mdx * inv * k;
          vy[i] += mdy * inv * k;
        }
      }
      vx[i] *= drag;
      vy[i] *= drag;
      px[i] += vx[i];
      py[i] += vy[i];
      if (d2 < absorbR2 || px[i] < -200 || px[i] > W + 200 || py[i] < -200 || py[i] > H + 200) seed(i, false);
    }
  }

  function draw(trail = v["colour.trail"]) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [br, bg, bb] = rgb(v["colour.ground"]);
    g.globalAlpha = 1;
    g.fillStyle = `rgba(${br},${bg},${bb},${trail})`;
    g.fillRect(0, 0, W, H);
    const [dr, dg, db] = rgb(v["colour.dots"]);
    g.fillStyle = `rgba(${dr},${dg},${db},0.7)`;
    const s = v["particles.size"], h = s * 0.5;
    for (let i = 0; i < N; i++) g.fillRect(px[i] - h, py[i] - h, s, s);
  }

  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width)), hh = Math.max(1, Math.floor(r.height));
    const sx = w / W, sy = hh / H;
    const had = N > 0;
    W = w;
    H = hh;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    buildTargets();
    if (had) {
      // the cloud keeps its place, scaled with the piece; homes are drawn again
      for (let i = 0; i < N; i++) {
        px[i] *= sx; py[i] *= sy;
        assignTarget(i);
      }
    }
    sizePool();
    draw(1);
  }

  // A settled moment, for reduced motion: the cloud run for a few seconds.
  function settle() {
    for (let k = 0; k < 240; k++) step();
    draw(1);
  }

  /* ----- loop: fixed steps, so the swirl is the same at any frame rate ----- */
  let raf = 0, last = 0, acc = 0;
  let visible = !document.hidden, onscreen = true;
  const live = () => !reduced && visible && onscreen;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    let n = 0;
    while (acc >= STEP && n < 4) {
      step();
      acc -= STEP;
      n++;
    }
    if (n === 4) acc = 0;
    draw();
  }
  function sync() {
    if (live()) {
      if (!raf) {
        last = performance.now();
        acc = STEP;
        raf = requestAnimationFrame(tick);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const ro = new ResizeObserver(() => {
    resize();
    if (reduced) settle();
  });
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

  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.active = true;
  };
  const onLeave = () => {
    mouse.active = false;
    mouse.x = mouse.y = -1e6;
  };
  if (!reduced) {
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointercancel", onLeave);
  }

  resize();
  if (reduced) settle();
  else {
    // a few seconds of fall first, so it opens already wheeling round its shape
    for (let k = 0; k < 170; k++) step();
    draw(1);
    sync();
  }

  return {
    update(next, path) {
      v = { ...next };
      if (path == null || path === "particles.count") sizePool();
      if (path == null || path === "shape.form" || path === "shape.size") {
        buildTargets();
        for (let i = 0; i < N; i++) assignTarget(i);
      }
      if (reduced) settle();
    },
    action(name) {
      if (name === "reseed") {
        for (let i = 0; i < N; i++) seed(i, false);
        if (reduced) settle();
      }
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      canvas.width = canvas.height = 1;
      canvas.remove();
    },
  };
}
