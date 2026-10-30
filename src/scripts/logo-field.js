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
   shrinks to its height, so the field becomes the mark. With given lines the
   shrink is elastic (Hunter, Oct 29: "still doesn't feel like real physics.
   the lines kinda collapse in as they shrink vertically"): each line is let
   go like a stretched band, its two ends springing to the stroke's top and
   bottom, a touch past and back, and pulling in along the line itself, so
   the tails run straight up and down into the bend (every point no longer
   slides diagonally to its place on the arc, which folded the lines into
   chevrons), and the bend becomes the stroke's arc as the tails come in. Given `lines` (the
   homepage: exactly the five, Hunter, Oct 25: "only have five lines, not more
   than five lines"), each is one stroke, at its own place and weight;
   otherwise `count` lines share the strokes, side by side across each.

   With `bands` (the homepage, Hunter, Oct 29: "It needs to feel like the
   lines are catching the pill ... like rubber bands that are slowing down
   the pill"; "I think the right line could be almost all the way to the right
   of the viewport, wherever it needs to be for the geometry to make sense")
   the lines are rubber bands instead. They stand evenly spaced, from the
   mark's straight bar to near the window's right edge (bandsRight, px; "I
   still want each of the lines to be spaced evenly ... I want the lines to
   have a curve"). The pill carries the strokes with it (push), and each band
   is pressed aside by its stroke as that reaches it: on the stroke where it
   is held, and from there easing back to where it stands in one curve, its
   give falling away along its length (each point of the stroke pushes the
   band out e^(-run / reach), the band the furthest of those), so no straight
   runs and no corners. Each band's reach is what lets it leave its stroke's
   ends in the stroke's own direction, so at rest, with the pill in its place,
   the bands are the strokes. Bands that never cross, no field.

     const f = createLogoField(canvas, settings)
     f.layout({ width, height, fieldLeft, fieldRight, logo: { left, top, unit }, strokes, lines?, keep?, bands? })
     f.frame(dt, { body: { x, y, r }, rise: (i) => 0..1, collapse: (i) => 0..1, color, land: 0..1, push: px })
     f.catchAt()                        // bands: the push (px) at which the first band is reached
     f.count()                          // how many lines there are */

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

/* A line that would hang X0 from the body's centre is moved to the X where the
   stream function X * (1 - q^(k/2)) equals X0, with q = a^2 / (X^2 + Y^2 + s^2 a^2).
   That function only ever rises with X, which is why lines never cross. k sets the
   reach (2 is classic flow past a cylinder), s the softness. (The tool's own words.) */
export function bendPush(X0, Y, a, k, s) {
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
  bounce: 0.2, // the collapse: how far a line's released ends spring past the stroke's top and bottom (0 none)
  settle: 0.95, // s from a line's release until its ends are at rest on the stroke
};

export function createLogoField(canvas, S = FIELD) {
  const ctx = canvas.getContext("2d");
  let W = 1, H = 1, dpr = 1, N = 0, M = 0, pitch = 1;
  let x0 = new Float32Array(0), ys = new Float32Array(0);
  // bands: each one's pins (px, top and bottom), its stroke's middle row by row (px), the stroke's
  // ends and their slopes (dx/dy); and how far the strokes are carried with the pill now (px)
  let bands = false, stand = new Float32Array(0), mid = new Float32Array(0), give = new Float32Array(0);
  let endT = new Float32Array(0), endB = new Float32Array(0), slT = new Float32Array(0), slB = new Float32Array(0);
  let pushNow = 0, depth = new Float64Array(0);
  let d, v, target, free, colTmp, colPre, bSum, bW, bCnt, bVel;
  // where each line ends: its stroke, its x at each row of the stroke's height, its width
  let finalX = new Float32Array(0), finalY = new Float32Array(0), finalW = new Float32Array(0);
  // given lines: the stroke's own left and right edge at each row, where each line ends
  let finalL = new Float32Array(0), finalR = new Float32Array(0);
  // given lines: each one's own weight (px), and the least space kept between their centres (px)
  let ownW = null, keepPx = 0;
  // the elastic collapse: each line's two ends (top, bottom: px, px/s, where each was let go) and the stroke's span
  let endY = new Float32Array(0), endV = new Float32Array(0), endY0 = new Float32Array(0), loose = new Uint8Array(0);
  let spanTop = 0, spanBot = 1;
  // how far the pill has come home (0..1): the bend only becomes the stroke's arc as it arrives
  let landNow = 1;

  function layout({ width, height, fieldLeft, fieldRight, logo, strokes, lines = null, keep = 0, bands: asBands = false, bandsRight = 0 }) {
    W = Math.max(1, width);
    H = Math.max(1, height);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const span = Math.max(1, fieldRight - fieldLeft);
    N = lines ? lines.length : Math.max(strokes.length, Math.min(Math.round(S.count), Math.floor(span / 6)));
    bands = Boolean(asBands && lines);
    // (bands are drawn finer: their arcs are the strokes' own)
    M = Math.round(bands ? clamp(H / 4, 100, 320) : clamp(H / 7, 60, 180)) + 1;
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
    // the lines run past the top and bottom, so their ends never show, but only just, so they are in
    // sight the moment the lines let go (Oct 29: past by 6% of the window, the shrink hid its start)
    const past = Math.max(24, 0.02 * H);
    for (let j = 0; j < M; j++) ys[j] = lerp(-past, H + past, j / (M - 1));
    endY = new Float32Array(2 * N);
    endV = new Float32Array(2 * N);
    endY0 = new Float32Array(2 * N);
    loose = new Uint8Array(N);
    // the end: an equal share of the lines for each stroke, side by side across its width
    finalX = new Float32Array(N * M);
    finalY = new Float32Array(M);
    finalW = new Float32Array(N);
    finalL = new Float32Array(N * M);
    finalR = new Float32Array(N * M);
    const n = strokes.length, Hs = strokes[0].H;
    for (let j = 0; j < M; j++) finalY[j] = logo.top + (j / (M - 1)) * Hs * logo.unit;
    spanTop = finalY[0];
    spanBot = finalY[M - 1];
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
    if (bands) layBands(bandsRight, logo.unit);
  }

  /* The bands: where each stands (evenly, from the straight bar's own place to right), its stroke's
     middle row by row, its ends and their slopes (dx/dy), and how its give falls away along it (one
     table of e^(-(sqrt(run^2 + e^2) - e) / reach - (run / hold)^2) by rows apart: e rounds the very tip,
     so a band just reached bows round rather than to a point, and hold, from the logo to the window's
     edge, brings it back near upright by the edge, so it curves all the way, held at its ends) */
  function layBands(right, unit) {
    mid = new Float32Array(N * M);
    stand = new Float32Array(N);
    endT = new Float32Array(N);
    endB = new Float32Array(N);
    slT = new Float32Array(N);
    slB = new Float32Array(N);
    give = new Float32Array(N * M);
    depth = new Float64Array(M);
    const step = (spanBot - spanTop) / (M - 1), dy = ys[1] - ys[0], e = 15 * unit, hold = Math.max(60 * unit, 0.8 * (spanTop - ys[0]));
    for (let i = 0; i < N; i++) {
      const row = i * M;
      for (let j = 0; j < M; j++) mid[row + j] = (finalL[row + j] + finalR[row + j]) / 2;
      endT[i] = mid[row];
      endB[i] = mid[row + M - 1];
      slT[i] = (mid[row + 2] - mid[row]) / (2 * step);
      slB[i] = (mid[row + M - 1] - mid[row + M - 3]) / (2 * step);
    }
    const left = mid[Math.floor(M / 2)];
    for (let i = 0; i < N; i++) {
      stand[i] = x0[i] = N > 1 ? lerp(left, Math.max(left + N * 20, right), i / (N - 1)) : left;
      // the reach that has the band leave its stroke's ends just as the stroke does: how far it is pressed
      // there over how steeply the stroke leaves (a band not pressed at rest, the straight bar, reaches far)
      const out = Math.max(stand[i] - endT[i], stand[i] - endB[i]), lean = Math.max(Math.abs(slT[i]), Math.abs(slB[i]));
      const reach = out > unit ? clamp(out / Math.max(0.05, lean), 140 * unit, 900 * unit) : 420 * unit;
      for (let m = 0; m < M; m++) give[i * M + m] = Math.exp(-(Math.hypot(m * dy, e) - e) / reach - ((m * dy) / hold) ** 2);
    }
  }
  // band i's stroke, carried with the pill by push, at height y: past its ends straight on
  const strokeMid = (i, y, push) => {
    if (y <= spanTop) return endT[i] - slT[i] * (spanTop - y) + push;
    if (y >= spanBot) return endB[i] + slB[i] * (y - spanBot) + push;
    const u = ((y - spanTop) / (spanBot - spanTop)) * (M - 1), j = Math.min(M - 2, Math.floor(u)), f = u - j;
    return lerp(mid[i * M + j], mid[i * M + j + 1], f) + push;
  };
  function bandRows(push) {
    for (let i = 0; i < N; i++) {
      const row = i * M;
      let any = false;
      for (let k = 0; k < M; k++) {
        depth[k] = stand[i] - strokeMid(i, ys[k], push);
        if (depth[k] > 0) any = true;
      }
      for (let j = 0; j < M; j++) {
        let out = 0;
        if (any)
          for (let k = 0; k < M; k++) {
            const dk = depth[k];
            if (dk <= out) continue;
            const g = dk * give[i * M + Math.abs(j - k)];
            if (g > out) out = g;
          }
        d[row + j] = -out; // x0 is where it stands
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

  /* The ends, let go: from where each line's top and bottom are the moment it is released (collapse(i)
     first above 0), two damped springs to the stroke's top and bottom. Stretched as far as it is, the
     line snaps in fastest at first and slows as it nears the stroke, springing a touch past it and back
     (bounce); over the last fifth of settle its last few px are glided exactly into place, so the SVG
     takes over the very same drawing. */
  const edgeY = (j, r) => {
    const cy = H / 2, sc = lerp(0.15, 1, r), off = (1 - r) * 0.45 * H;
    return cy + (ys[j] - cy) * sc + off;
  };
  // (the springs' own state; endY is what is drawn: the spring, glided exactly onto the stroke over the last fifth)
  let endS = new Float32Array(0);
  function stepEnds(dt, rise, collapse) {
    // mostly in about two thirds of the way through settle, the last of it glided onto the stroke after
    const z = clamp(1 - S.bounce, 0.3, 1), w = 4.3 / Math.max(0.1, S.settle);
    const K = w * w, C = 2 * z * w, sub = 4, h = dt / sub;
    if (endS.length !== endY.length) endS = new Float32Array(endY.length);
    for (let i = 0; i < N; i++) {
      const c = collapse(i);
      if (c <= 0) {
        loose[i] = 0;
        continue;
      }
      const r = clamp(rise(i), 0, 1);
      if (!loose[i]) {
        loose[i] = 1;
        endS[2 * i] = endY0[2 * i] = edgeY(0, r);
        endS[2 * i + 1] = endY0[2 * i + 1] = edgeY(M - 1, r);
        endV[2 * i] = endV[2 * i + 1] = 0;
      }
      const glide = clamp((c - 0.8) / 0.2, 0, 1), g = glide * glide * (3 - 2 * glide);
      for (let e = 0; e < 2; e++) {
        const k = 2 * i + e, to = e ? spanBot : spanTop;
        for (let q = 0; q < sub; q++) {
          endV[k] += (-K * (endS[k] - to) - C * endV[k]) * h;
          endS[k] += endV[k] * h;
        }
        endY[k] = c >= 1 ? to : lerp(endS[k], to, g);
      }
    }
  }
  // a given line's bent centre and its slope at any height (px), from the field's rows
  const streamAt = (i, y) => {
    const u = clamp(((y - ys[0]) / (ys[M - 1] - ys[0])) * (M - 1), 0, M - 1), j = Math.min(M - 2, Math.floor(u)), f = u - j;
    return x0[i] + lerp(d[i * M + j], d[i * M + j + 1], f);
  };
  const slopeAt = (i, y) => {
    const step = (ys[M - 1] - ys[0]) / (M - 1);
    return (streamAt(i, y + step) - streamAt(i, y - step)) / (2 * step);
  };
  // the stroke's own edge (finalL or finalR of line i) at any height inside its span
  const strokeAt = (arr, i, y) => {
    const u = clamp(((y - spanTop) / Math.max(1e-6, spanBot - spanTop)) * (M - 1), 0, M - 1), j = Math.min(M - 2, Math.floor(u)), f = u - j;
    return lerp(arr[i * M + j], arr[i * M + j + 1], f);
  };
  /* A released line: drawn between its two ends, every row at its own height (so the tails run up and
     down along the line itself as they come in); its shape the bent line's, becoming the stroke's as far
     as the line has pulled in (past the stroke's ends, the stroke carried on along the bent line, so the
     tails join it smoothly). */
  function fillLoose(i, r) {
    const yt = endY[2 * i], yb = endY[2 * i + 1];
    const L0 = endY0[2 * i + 1] - endY0[2 * i], Lf = spanBot - spanTop;
    // as far as the line has pulled in, and no further than the pill has come: a line short before the
    // pill is there is a straight bar, and the pill's arrival bends it round into the stroke
    const w = Math.min(clamp((L0 - (yb - yt)) / Math.max(1, L0 - Lf), 0, 1), landNow);
    // past the stroke's ends its own arc carries on: out along the end's direction, easing back to upright
    // over D (Hunter, Oct 29, of the line nearest the pill: "this kink right here ... that far-right line needs
    // to actually push off to the right more"; carrying on along the bent line instead met the arc's end, which
    // leans out at about 60 degrees, in a corner)
    const row = i * M, step = (spanBot - spanTop) / (M - 1), carried = bands ? pushNow : 0;
    const endSlope = (k0, k1) => ((finalL[row + k1] + finalR[row + k1]) - (finalL[row + k0] + finalR[row + k0])) / 2 / ((k1 - k0) * step);
    const sTop = endSlope(0, 2), sBot = endSlope(M - 3, M - 1), D = 0.45 * (spanBot - spanTop);
    const reach = (u) => D * (1 - Math.exp(-u / D)); // the distance it leans out over a run of u, at most D
    // (a band past its stroke's ends keeps its own curve, carried onto the stroke's end)
    const bandT = bands ? streamAt(i, spanTop) : 0, bandB = bands ? streamAt(i, spanBot) : 0;
    for (let j = 0; j < M; j++) {
      const y = lerp(yt, yb, j / (M - 1));
      const sx = streamAt(i, y), sl = slopeAt(i, y), half = (ownW[i] / 2) * Math.sqrt(1 + sl * sl);
      let aL, aR;
      if (y < spanTop) {
        const off = bands ? sx - bandT : -sTop * reach(spanTop - y);
        (aL = finalL[row] + off), (aR = finalR[row] + off);
      } else if (y > spanBot) {
        const off = bands ? sx - bandB : sBot * reach(y - spanBot);
        (aL = finalL[row + M - 1] + off), (aR = finalR[row + M - 1] + off);
      } else (aL = strokeAt(finalL, i, y)), (aR = strokeAt(finalR, i, y));
      py[j] = y;
      lx[j] = lerp(sx - half, aL + carried, w);
      rx[j] = lerp(sx + half, aR + carried, w);
    }
    ctx.globalAlpha = Math.min(1, r * 1.6);
    ctx.beginPath();
    ctx.moveTo(lx[0], py[0]);
    for (let j = 1; j < M; j++) ctx.lineTo(lx[j], py[j]);
    for (let j = M - 1; j >= 0; j--) ctx.lineTo(rx[j], py[j]);
    ctx.closePath();
    ctx.fill();
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
      if (ownW) {
        if (loose[i]) fillLoose(i, r);
        else fillLine(i, r, 0);
        continue;
      }
      const c = ease(clamp(collapse(i), 0, 1));
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
    catchAt() {
      let most = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) most = Math.max(most, stand[i] - strokeMid(i, ys[j], 0));
      return most;
    },
    /** Where line i stands across the field, 0 at the left .. 1 nearest the pill. */
    across: (i) => (N > 1 ? i / (N - 1) : 0),
    frame(dt, { body, rise, collapse, color, land = 1, push = 0 }) {
      if (!N) return;
      landNow = clamp(land, 0, 1);
      const h = Math.min(1 / 30, Math.max(0, dt));
      if (bands) {
        pushNow = push;
        bandRows(push);
      } else {
        computeTargets(body);
        stepLines(h);
      }
      if (ownW) stepEnds(h, rise, collapse);
      draw({ rise, collapse, color });
    },
    /** Straight, at rest, as before the pill came. */
    reset() {
      d?.fill(0);
      v?.fill(0);
      loose?.fill(0);
    },
  };
}
