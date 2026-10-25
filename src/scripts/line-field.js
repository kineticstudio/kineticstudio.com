/* A field of Kinetic lines the cursor plays with (Hunter, Oct 25: "we had 50
   to 100 lines on some of the previous prototypes, and your cursor can play
   around with them? That's what I want the footer to have").

   Ported from the Studio's Kinetic lines tool (the kinetic-studio project's
   designs/03-Kinetic-lines.html). The mark is a row of vertical strokes bent
   by a force; here the force is a body that follows the cursor with
   momentum, and the lines stream round it the way water streams past a
   stone, so they bend as far as you like and never cross. Each point on a
   line is a mass on a spring toward its bend, with string tension along the
   line, so bends ring and travel. A click sends out a ring. When the cursor
   leaves, the force wanders on its own. It runs only while on screen, and
   with reduced motion the lines hold still, bent once round the middle.

   mountLineField(canvas, options) → { destroy } */

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

export const LINE_FIELD = {
  lines: 96, // how many lines across
  weight: 0.12, // stroke width as a share of the spacing between lines
  gap: 0.25, // the least clear space lines keep as they bend, a share of the spacing
  size: 0.16, // the force's size, a share of the field's shorter side
  reach: 0.55, // how far its push carries (0 tight, 1 far)
  softness: 0, // 0 a solid body the lines wrap round, 1 a soft dent
  momentum: 0.6, // how heavily the force follows the cursor
  driftSpeed: 0.5, // how fast it wanders once the cursor has gone
  response: 0.55, // how quickly the lines take up the bend
  wobble: 0.35, // how much they overshoot and ring
  ripple: 0.25, // string tension: bends travel along each line
  pulse: 0.6, // a click's ring
};

/* A line that would hang X0 from the body's centre moves to the X where the
   stream function X (1 - q^(k/2)) equals X0, q = a² / (X² + Y² + s²a²). It
   only ever rises with X, which is why lines never cross. */
function bendPush(X0, Y, a, k, s) {
  const ax = Math.abs(X0), sg = X0 < 0 ? -1 : 1, e = k / 2, a2 = a * a, s2a2 = s * s * a2, Y2 = Y * Y;
  const r2 = X0 * X0 + Y2;
  // far away the first order answer is exact enough and costs one pow
  if (r2 > 25 * a2) return X0 * Math.pow(a2 / (r2 + s2a2), e);
  const h = (u) => u * (1 - Math.pow(a2 / (u * u + Y2 + s2a2), e));
  const dh = (u) => {
    const D = u * u + Y2 + s2a2, qe = Math.pow(a2 / D, e);
    return 1 - qe + (2 * e * u * u * qe) / D;
  };
  const core2 = a2 * (1 - s * s) - Y2;
  let lo = Math.max(ax, core2 > 0 ? Math.sqrt(core2) : 0), hi = ax + a * (1 + s) + 1e-6;
  for (let i = 0; i < 6 && h(hi) < ax; i++) hi = lo + (hi - lo) * 2;
  let u = Math.min(hi, Math.max(lo, ax + (a2 / Math.max(a, ax)) * 0.6));
  for (let i = 0; i < 9; i++) {
    const f = h(u) - ax;
    if (Math.abs(f) < 1e-3) break;
    if (f > 0) hi = u;
    else lo = u;
    const n = u - f / Math.max(1e-6, dh(u));
    u = n > lo && n < hi ? n : (lo + hi) / 2;
  }
  return sg * u - X0;
}

export function mountLineField(canvas, options = {}) {
  const P = { ...LINE_FIELD, ...options };
  const stage = canvas.parentElement;
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const view = { w: 1, h: 1, dpr: 1 };
  let N = 0, M = 0, pitch = 1, x0, ys, d, v, target, free, colTmp, colPre, bSum, bW, bCnt, bVel;
  let T = 0, last = 0, raf = 0, on = false, color = "#fff";
  const body = { x: 0, y: 0, vx: 0, vy: 0, placed: false };
  const ptr = { x: 0, y: 0, inside: false, lastMove: -10 };
  const pulses = [];

  const wander = (t) => {
    const sp = 0.6 + P.driftSpeed * 1.4;
    return [view.w * (0.5 + 0.3 * Math.sin(t * 0.13 * sp)), view.h * (0.5 + 0.22 * Math.sin(t * 0.21 * sp + 1.3))];
  };

  function layout() {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    view.w = w;
    view.h = h;
    view.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    color = getComputedStyle(stage).color;
    // fewer lines on a phone, so each stays a line and not a hatch
    const across = Math.round(clamp(w < 640 ? P.lines * 0.5 : P.lines, 2, 400)), extra = Math.ceil(across * 0.2);
    const n = across + extra * 2, m = Math.round(clamp(h / 7, 40, 160)) + 1;
    pitch = w / across;
    if (n !== N || m !== M) {
      N = n;
      M = m;
      d = new Float32Array(N * M);
      v = new Float32Array(N * M);
      target = new Float32Array(N * M);
      free = new Float32Array(N * M);
      bSum = new Float64Array(N);
      bW = new Float64Array(N);
      bCnt = new Int32Array(N);
      bVel = new Float64Array(N);
      colTmp = new Float32Array(M);
      colPre = new Float64Array(M + 1);
    }
    x0 = new Float32Array(N);
    ys = new Float32Array(M);
    for (let i = 0; i < N; i++) x0[i] = (i - extra + 0.5) * pitch;
    // the lines run past the top and bottom so their ends never show
    for (let j = 0; j < M; j++) ys[j] = lerp(-0.06 * h, 1.06 * h, j / (M - 1));
    if (!body.placed) {
      body.placed = true;
      [body.x, body.y] = wander(T);
    }
    targets();
    if (reduced) d.set(target);
    draw();
  }

  function stepBody(dt) {
    // a mass on a spring behind the cursor: momentum carries it past and it settles back
    const idle = T - ptr.lastMove > 2.5 || !ptr.inside;
    const [tx, ty] = !idle ? [ptr.x, ptr.y] : wander(T);
    const w0 = idle ? 1.6 : lerp(16, 1.8, P.momentum), z = 0.72;
    body.vx += (w0 * w0 * (tx - body.x) - 2 * z * w0 * body.vx) * dt;
    body.vy += (w0 * w0 * (ty - body.y) - 2 * z * w0 * body.vy) * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
  }

  function targets() {
    const a = Math.max(2, P.size * Math.min(view.w, view.h * 1.6)), k = lerp(3.6, 1.3, P.reach), s = P.softness;
    for (let i = 0; i < N; i++) {
      const X0 = x0[i] - body.x, row = i * M;
      for (let j = 0; j < M; j++) target[row + j] = bendPush(X0, ys[j] - body.y, a, k, s);
    }
    // a ring of force running out from a click
    const ring = 0.07 * Math.min(view.w, view.h);
    for (let p = pulses.length - 1; p >= 0; p--) {
      const pu = pulses[p], age = T - pu.t;
      if (age > 3.2) {
        pulses.splice(p, 1);
        continue;
      }
      const rho = age * Math.hypot(view.w, view.h) * 0.32, amp = P.pulse * pitch * 7 * Math.exp(-age / 0.8);
      for (let i = 0; i < N; i++) {
        const X = x0[i] - pu.x, row = i * M;
        for (let j = 0; j < M; j++) {
          const Y = ys[j] - pu.y, r = Math.hypot(X, Y) + 1e-3, g = (r - rho) / ring;
          if (g > -3 && g < 3) target[row + j] += amp * Math.exp(-g * g) * (X / r);
        }
      }
    }
    // keep the gaps, then smooth what that changed along each line
    free.set(target);
    keepGaps(target, Math.min(1, P.weight + P.gap) * pitch, true, null);
    const R = Math.max(2, Math.round(M / 14));
    for (let i = 0; i < N; i++) {
      const row = i * M;
      for (let j = 0; j < M; j++) colTmp[j] = target[row + j] - free[row + j];
      for (let pass = 0; pass < 3; pass++) {
        colPre[0] = 0;
        for (let j = 0; j < M; j++) colPre[j + 1] = colPre[j] + colTmp[j];
        for (let j = 0; j < M; j++) {
          const lo = Math.max(0, j - R), hi = Math.min(M - 1, j + R);
          colTmp[j] = (colPre[hi + 1] - colPre[lo]) / (hi - lo + 1);
        }
      }
      for (let j = 0; j < M; j++) target[row + j] = free[row + j] + colTmp[j];
    }
  }

  function stepLines(dt) {
    // each point a mass on a spring toward its bend, pulling on its neighbours along the line
    const w = lerp(4, 30, P.response), z = lerp(1.15, 0.1, P.wobble), K = w * w, C = 2 * z * w, TK = P.ripple * 3.2 * K;
    const sub = 2, h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < N; i++) {
        const row = i * M;
        for (let j = 0; j < M; j++) {
          const idx = row + j, dj = d[idx];
          const lap = (j > 0 ? d[idx - 1] : dj) + (j < M - 1 ? d[idx + 1] : dj) - 2 * dj;
          v[idx] += (K * (target[idx] - dj) - C * v[idx] + TK * lap) * h;
        }
        for (let j = 0; j < M; j++) d[row + j] += v[row + j] * h;
      }
    }
    keepGaps(d, Math.min(pitch * 0.95, P.weight * pitch + 0.6), false, v);
  }

  /* Lines keep a clear gap: per row, the positions nearest the given ones with
     every neighbour at least g apart (pool adjacent violators, exact in one
     pass). On the target, the more a line bends the more it counts, so the
     lines hugging the force hold their curve and the outer ones make room. */
  function keepGaps(arr, g, weighted, vel) {
    for (let j = 0; j < M; j++) {
      let nb = 0;
      for (let i = 0; i < N; i++) {
        const idx = i * M + j, t = weighted ? target[idx] / pitch : 0, wt = 1 + 4 * t * t;
        bSum[nb] = (x0[i] + arr[idx] - i * g) * wt;
        bW[nb] = wt;
        bCnt[nb] = 1;
        bVel[nb] = vel ? vel[idx] * wt : 0;
        nb++;
        while (nb > 1 && bSum[nb - 2] / bW[nb - 2] > bSum[nb - 1] / bW[nb - 1]) {
          bSum[nb - 2] += bSum[nb - 1];
          bW[nb - 2] += bW[nb - 1];
          bCnt[nb - 2] += bCnt[nb - 1];
          bVel[nb - 2] += bVel[nb - 1];
          nb--;
        }
      }
      let i = 0;
      for (let b = 0; b < nb; b++) {
        const mean = bSum[b] / bW[b], vm = bVel[b] / bW[b], touching = bCnt[b] > 1;
        for (let c = 0; c < bCnt[b]; c++, i++) {
          const idx = i * M + j;
          arr[idx] = mean + i * g - x0[i];
          if (vel && touching) vel[idx] = vm;
        }
      }
    }
  }

  function draw() {
    const k = view.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.lineWidth = Math.max(1 / k, P.weight * pitch);
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const row = i * M, x = x0[i];
      if (x + d[row + (M >> 1)] < -pitch * 4 || x + d[row + (M >> 1)] > view.w + pitch * 4) continue;
      ctx.moveTo(x + d[row], ys[0]);
      // through the midpoints, so a few points read as one clean curve
      for (let j = 1; j < M - 1; j++) {
        const xa = x + d[row + j], xb = x + d[row + j + 1];
        ctx.quadraticCurveTo(xa, ys[j], (xa + xb) / 2, (ys[j] + ys[j + 1]) / 2);
      }
      ctx.lineTo(x + d[row + M - 1], ys[M - 1]);
    }
    ctx.stroke();
  }

  function frame(now) {
    raf = 0;
    if (!on) return;
    const dt = Math.min(0.033, Math.max(0.001, (now - (last || now)) / 1000));
    last = now;
    T += dt;
    stepBody(dt);
    targets();
    stepLines(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  const start = () => {
    if (on || reduced) return;
    on = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    on = false;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const local = (e) => {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const move = (e) => {
    [ptr.x, ptr.y] = local(e);
    ptr.inside = true;
    ptr.lastMove = T;
  };
  const leave = () => (ptr.inside = false);
  const click = (e) => {
    const [x, y] = local(e);
    pulses.push({ x, y, t: T });
    if (pulses.length > 4) pulses.shift();
  };
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerleave", leave);
  stage.addEventListener("pointerdown", click);

  const seen = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? start() : stop()));
  seen.observe(stage);
  const vis = () => (document.hidden ? stop() : stage.getBoundingClientRect().top < innerHeight && start());
  document.addEventListener("visibilitychange", vis);
  const sized = new ResizeObserver(layout);
  sized.observe(stage);
  layout();

  return {
    destroy() {
      stop();
      seen.disconnect();
      sized.disconnect();
      document.removeEventListener("visibilitychange", vis);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
      stage.removeEventListener("pointerdown", click);
    },
  };
}
