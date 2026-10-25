/* The homepage intro's field of lines (Hunter, Oct 24: "It should look more
   like that [the Kinetic lines tool with the cursor's magnetism]. Maybe there
   are a lot of lines, like 30 smaller lines, and then we collapse it all to
   these ones into the logo").

   Ported from the Studio's Kinetic lines tool (kinetic-studio, designs/
   03-Kinetic-lines.html, Oct 1): lines stream around a moving body the way
   water streams past a stone (the stream function of flow past a cylinder),
   so they bend as far as you like and never cross, and the nearest bend
   most, nesting like the strokes of the mark. Clear space between lines is
   kept exactly, row by row, the most bent counting most. Every point on a
   line is a spring with string tension, so lines wobble and ripple after the
   body passes. Here the body is the round end of the KINETIC pill.

   At the end every line is drawn into one of the logo's five strokes and
   shrinks to its height, so the field becomes the mark. Given `lines` (the
   homepage: exactly the five, Hunter, Oct 25: "only have five lines, not more
   than five lines"), each is one stroke, at its own place and weight;
   otherwise `count` lines share the strokes, side by side across each.

     const f = createLogoField(canvas, settings)
     f.layout({ width, height, fieldLeft, fieldRight, logo: { left, top, unit }, strokes, lines?, keep? })
     f.frame(dt, { body: { x, y, r }, rise: (i) => 0..1, collapse: (i) => 0..1, color })
     f.count()                          // how many lines there are */

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

/* A line that would hang X0 from the body's centre is moved to the X where the
   stream function X * (1 - q^(k/2)) equals X0, with q = a^2 / (X^2 + Y^2 + s^2 a^2).
   That function only ever rises with X, which is why lines never cross. k sets the
   reach (2 is classic flow past a cylinder), s the softness. (The tool's own words.) */
function bendPush(X0, Y, a, k, s) {
  const ax = Math.abs(X0), sg = X0 < 0 ? -1 : 1, e = k / 2, a2 = a * a, s2a2 = s * s * a2, Y2 = Y * Y;
  const r2 = X0 * X0 + Y2;
  if (r2 > 25 * a2) return X0 * Math.pow(a2 / (r2 + s2a2), e);
  const h = (u) => {
    const q = a2 / (u * u + Y2 + s2a2);
    return u * (1 - Math.pow(q, e));
  };
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

/** The intro's settings (the homepage's Params set them). */
export const FIELD = {
  count: 30, // lines across the field
  weight: 0.32, // a line's width, as a share of the space between lines
  gap: 0.3, // the least clear space lines keep as they bend, a share of that space
  reach: 0.45, // how far the pill's push carries (0 tight, 1 far)
  softness: 0.1, // 0 a solid body the lines wrap round, 1 a soft dent
  clearance: 16, // logo units of clear space round the pill
  response: 0.55, // how quickly the lines take up the bend
  wobble: 0.3, // how much they overshoot and ring
  ripple: 0.2, // string tension: bends travel along each line
};

export function createLogoField(canvas, S = FIELD) {
  const ctx = canvas.getContext("2d");
  let W = 1, H = 1, dpr = 1, N = 0, M = 0, pitch = 1;
  let x0 = new Float32Array(0), ys = new Float32Array(0);
  let d, v, target, free, colTmp, colPre, bSum, bW, bCnt, bVel;
  // where each line ends: its stroke, its x at each row of the stroke's height, its width
  let finalX = new Float32Array(0), finalY = new Float32Array(0), finalW = new Float32Array(0);
  // given lines: the stroke's own left and right edge at each row, where each line ends
  let finalL = new Float32Array(0), finalR = new Float32Array(0);
  // given lines: each one's own weight (px), and the least space kept between their centres (px)
  let ownW = null, keepPx = 0;

  function layout({ width, height, fieldLeft, fieldRight, logo, strokes, lines = null, keep = 0 }) {
    W = Math.max(1, width);
    H = Math.max(1, height);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const span = Math.max(1, fieldRight - fieldLeft);
    N = lines ? lines.length : Math.max(strokes.length, Math.min(Math.round(S.count), Math.floor(span / 6)));
    M = Math.round(clamp(H / 7, 60, 180)) + 1;
    pitch = span / N;
    d = new Float32Array(N * M);
    v = new Float32Array(N * M);
    target = new Float32Array(N * M);
    free = new Float32Array(N * M);
    colTmp = new Float32Array(M);
    colPre = new Float64Array(M + 1);
    bSum = new Float64Array(N);
    bW = new Float64Array(N);
    bCnt = new Int32Array(N);
    bVel = new Float64Array(N);
    x0 = new Float32Array(N);
    ys = new Float32Array(M);
    for (let i = 0; i < N; i++) x0[i] = lines ? lines[i].x : fieldLeft + (i + 0.5) * pitch;
    ownW = lines ? Float32Array.from(lines, (l) => l.w) : null;
    keepPx = lines ? keep : 0;
    if (lines && N > 1) pitch = (x0[N - 1] - x0[0]) / (N - 1);
    // the lines run past the top and bottom, so their ends never show
    for (let j = 0; j < M; j++) ys[j] = lerp(-0.06 * H, 1.06 * H, j / (M - 1));
    // the end: an equal share of the lines for each stroke, side by side across its width
    finalX = new Float32Array(N * M);
    finalY = new Float32Array(M);
    finalW = new Float32Array(N);
    finalL = new Float32Array(N * M);
    finalR = new Float32Array(N * M);
    const n = strokes.length, Hs = strokes[0].H;
    for (let j = 0; j < M; j++) finalY[j] = logo.top + (j / (M - 1)) * Hs * logo.unit;
    for (let i = 0; i < N; i++) {
      const s = Math.min(n - 1, Math.floor((i * n) / N));
      const first = Math.ceil((s * N) / n), share = Math.ceil(((s + 1) * N) / n) - first;
      const k = i - first, st = strokes[s];
      const mid = st.right(Hs / 2) - st.left(Hs / 2);
      finalW[i] = (mid / share) * (share > 1 ? 1.12 : 1.02) * logo.unit;
      for (let j = 0; j < M; j++) {
        const yu = (j / (M - 1)) * Hs, l = st.left(yu), r = st.right(yu);
        finalX[i * M + j] = logo.left + (l + ((k + 0.5) / share) * (r - l)) * logo.unit;
        finalL[i * M + j] = logo.left + l * logo.unit;
        finalR[i * M + j] = logo.left + r * logo.unit;
      }
    }
  }

  function computeTargets(body) {
    target.fill(0);
    const a = Math.max(2, body.r), k = lerp(3.6, 1.3, S.reach), s = S.softness;
    for (let i = 0; i < N; i++) {
      const X0 = x0[i] - body.x, row = i * M;
      for (let j = 0; j < M; j++) target[row + j] = bendPush(X0, ys[j] - body.y, a, k, s);
    }
    // keep the gaps, then smooth what that changed up and down each line
    free.set(target);
    keepGaps(target, keepPx || Math.min(1, S.weight + S.gap) * pitch, true, null);
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
    // each point is a little mass on a spring toward the bend, pulling on its
    // neighbours along the line, so bends ring and travel
    const w = lerp(4, 30, S.response), z = lerp(1.15, 0.1, S.wobble), K = w * w, C = 2 * z * w;
    const TK = S.ripple * 3.2 * K;
    const sub = 2, h = dt / sub;
    for (let q = 0; q < sub; q++) {
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
    keepGaps(d, keepPx ? keepPx * 0.92 : Math.min(pitch * 0.95, S.weight * pitch + 0.6), false, v);
  }

  /* Lines keep a clear gap: per row, the positions closest to the given ones
     with every neighbour at least g apart (pool adjacent violators: exact, one
     pass). On the target the more bent a line the more it counts, so the
     lines hugging the pill hold their curve and the outer ones make room. */
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

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const px = new Float32Array(512), py = new Float32Array(512), lx = new Float32Array(512), rx = new Float32Array(512);
  /* A given line is a filled shape, its weight held across its bends, its
     ends cut flat; at the end its edges are the stroke's own, so it is the
     logo exactly when the SVG takes over. */
  function fillLine(i, r, c) {
    const row = i * M, cy = H / 2;
    const sc = lerp(0.15, 1, r), off = (1 - r) * 0.45 * H;
    for (let j = 0; j < M; j++) {
      px[j] = x0[i] + d[row + j];
      py[j] = lerp(cy + (ys[j] - cy) * sc + off, finalY[j], c);
    }
    for (let j = 0; j < M; j++) {
      const a = Math.max(0, j - 1), b = Math.min(M - 1, j + 1);
      const slope = (px[b] - px[a]) / Math.max(1e-6, ((ys[b] - ys[a]) * sc));
      const half = (ownW[i] / 2) * Math.sqrt(1 + slope * slope);
      lx[j] = lerp(px[j] - half, finalL[row + j], c);
      rx[j] = lerp(px[j] + half, finalR[row + j], c);
    }
    ctx.globalAlpha = Math.min(1, r * 1.6);
    ctx.beginPath();
    ctx.moveTo(lx[0], py[0]);
    for (let j = 1; j < M; j++) ctx.lineTo(lx[j], py[j]);
    for (let j = M - 1; j >= 0; j--) ctx.lineTo(rx[j], py[j]);
    ctx.closePath();
    ctx.fill();
  }
  function draw({ rise, collapse, color }) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    const cy = H / 2;
    for (let i = 0; i < N; i++) {
      const r = clamp(rise(i), 0, 1);
      if (r <= 0) continue;
      const c = ease(clamp(collapse(i), 0, 1));
      if (ownW) {
        fillLine(i, r, c);
        continue;
      }
      // rising in: from below, stretching to the window's height
      const sc = lerp(0.15, 1, r), off = (1 - r) * 0.45 * H;
      const row = i * M;
      for (let j = 0; j < M; j++) {
        const fx = x0[i] + d[row + j], fy = cy + (ys[j] - cy) * sc + off;
        px[j] = lerp(fx, finalX[row + j], c);
        py[j] = lerp(fy, finalY[j], c);
      }
      ctx.globalAlpha = Math.min(1, r * 1.6);
      ctx.lineWidth = lerp(ownW ? ownW[i] : S.weight * pitch, finalW[i], c);
      ctx.save();
      if (c > 0) {
        // the stroke's ends cut flat, as the logo's are: drawn a touch long, clipped to its height
        ctx.beginPath();
        ctx.rect(-W, py[0], W * 3, py[M - 1] - py[0]);
        ctx.clip();
      }
      ctx.beginPath();
      const ext = ctx.lineWidth;
      const ux = px[0] - px[1], uy = py[0] - py[1], ul = Math.hypot(ux, uy) || 1;
      ctx.moveTo(px[0] + (ux / ul) * ext, py[0] + (uy / ul) * ext);
      ctx.lineTo(px[0], py[0]);
      for (let j = 1; j < M - 1; j++) ctx.quadraticCurveTo(px[j], py[j], (px[j] + px[j + 1]) / 2, (py[j] + py[j + 1]) / 2);
      ctx.lineTo(px[M - 1], py[M - 1]);
      const vx = px[M - 1] - px[M - 2], vy = py[M - 1] - py[M - 2], vl = Math.hypot(vx, vy) || 1;
      ctx.lineTo(px[M - 1] + (vx / vl) * ext, py[M - 1] + (vy / vl) * ext);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  return {
    layout,
    count: () => N,
    /** Where line i stands across the field, 0 at the left .. 1 nearest the pill. */
    across: (i) => (N > 1 ? i / (N - 1) : 0),
    frame(dt, { body, rise, collapse, color }) {
      if (!N) return;
      computeTargets(body);
      stepLines(Math.min(1 / 30, Math.max(0, dt)));
      draw({ rise, collapse, color });
    },
    /** Straight, at rest, as before the pill came. */
    reset() {
      d?.fill(0);
      v?.fill(0);
    },
  };
}
