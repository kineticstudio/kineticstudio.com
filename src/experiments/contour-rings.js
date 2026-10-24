/* Contour rings.

   A target of concentric rings, drawn the way a survey map draws height:
   every ring is a contour of one field (the distance from the centre plus
   flowing simplex noise), traced with marching squares and stitched into
   lines. So the rings bend, pinch and break into islands but never cross.
   The noise is held back at the centre, so the bullseye stays true while the
   outer rings turn to terrain. Rings are born at the centre in the accent
   colour and cool as they drift out; every fifth is an index ring, drawn
   heavier, as on a map. A pointer pushes the rings apart like a lens. */

export const params = {
  rings: {
    count: [34, 8, 90, 1],
    weight: [1, 0.5, 3, 0.1],
    drift: [0.2, -1, 1, 0.01],
  },
  noise: {
    amount: [0.55, 0, 1, 0.01],
    scale: [0.45, 0.1, 1, 0.01],
    speed: [0.12, 0, 0.6, 0.01],
  },
  pointer: [0.6, 0, 1, 0.01],
  colour: { ink: "#d9e2d2", accent: "#a8ff66", ground: "#0d0d0d" },
};

/* 3D simplex noise (after Stefan Gustavson), seeded. Returns about -1..1. */
function simplex3(seed = 7) {
  const grad = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  const pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    pm12[i] = perm[i] % 12;
  }
  const F3 = 1 / 3, G3 = 1 / 6;
  const corner = (gi, x, y, z) => {
    let t = 0.6 - x * x - y * y - z * z;
    if (t < 0) return 0;
    t *= t;
    return t * t * (grad[gi] * x + grad[gi + 1] * y + grad[gi + 2] * z);
  };
  return (x, y, z) => {
    const sk = (x + y + z) * F3;
    const i = Math.floor(x + sk), j = Math.floor(y + sk), k = Math.floor(z + sk);
    const t = (i + j + k) * G3;
    const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    const ii = i & 255, jj = j & 255, kk = k & 255;
    return 32 * (
      corner(pm12[ii + perm[jj + perm[kk]]] * 3, x0, y0, z0) +
      corner(pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3, x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3) +
      corner(pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3, x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3) +
      corner(pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3, x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3)
    );
  };
}

const rgb = (c) => {
  const n = parseInt(c.length === 4 ? c.slice(1).replace(/./g, "$&$&") : c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lerp3 = (x, y, t) => x.map((v, i) => v + (y[i] - v) * t);
const css = (c) => `rgb(${c.map(Math.round).join(",")})`;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* A typed array that grows. */
const grow = (arr, n, Type) => (arr.length >= n ? arr : new Type(Math.max(n, arr.length * 2)));

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const noise = simplex3(11);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 0, H = 0, dpr = 1;
  let time = reduced ? 14 : 6, last = 0, raf = 0;
  let onScreen = true, tabVisible = !document.hidden;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, on: 0, target: 0 };

  // The sampled field and the scratch space for tracing it.
  let cs = 4, nx = 0, ny = 0, field = new Float32Array(0);
  // Noise is smooth at this scale, so it is sampled on a grid twice as
  // coarse and read back bilinearly: a quarter of the cost.
  let gx = 0, gy = 0, coarse = new Float32Array(0);
  let base = new Int32Array(0), kmin = new Int32Array(0), slot = new Int32Array(0);
  let seg = new Float32Array(0), segK = new Int32Array(0), link = new Int32Array(0), seen = new Uint8Array(0);

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cs = Math.min(6, Math.max(3, Math.min(W, H) / 200));
    nx = Math.ceil(W / cs) + 1;
    ny = Math.ceil(H / cs) + 1;
    field = new Float32Array(nx * ny);
    gx = Math.ceil(nx / 2) + 1;
    gy = Math.ceil(ny / 2) + 1;
    coarse = new Float32Array(gx * gy);
    const edges = (nx - 1) * ny + nx * (ny - 1);
    base = new Int32Array(edges + 1);
    kmin = new Int32Array(edges);
  }

  function sample() {
    const m = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    const amp = v["noise.amount"] * 0.2 * m;
    const f = 1 / (v["noise.scale"] * m);
    const z = time * v["noise.speed"];
    const calm = m * 0.45;
    const lens = Math.min(0.85, pointer.on * v.pointer * 0.85);
    const sig2 = (0.16 * m) ** 2;
    const step = cs * 2;
    if (amp > 0) {
      for (let j = 0; j < gy; j++) {
        for (let i = 0; i < gx; i++) {
          const x = i * step, y = j * step;
          coarse[j * gx + i] = noise(x * f, y * f, z) + 0.42 * noise(x * f * 2.1 + 17.3, y * f * 2.1 - 9.1, z * 1.6 + 4.2);
        }
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let x = i * cs, y = j * cs;
        if (lens > 0.002) {
          // Read the field from nearer the pointer, so the rings spread away from it.
          const qx = x - pointer.x, qy = y - pointer.y;
          const k = 1 - lens * Math.exp(-(qx * qx + qy * qy) / sig2);
          x = pointer.x + qx * k;
          y = pointer.y + qy * k;
        }
        const d = Math.hypot(x - cx, y - cy);
        let val = d;
        if (amp > 0) {
          const fx = Math.min(gx - 1.001, Math.max(0, x / step)), fy = Math.min(gy - 1.001, Math.max(0, y / step));
          const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy, o = iy * gx + ix;
          const n = (coarse[o] * (1 - ax) + coarse[o + 1] * ax) * (1 - ay) + (coarse[o + gx] * (1 - ax) + coarse[o + gx + 1] * ax) * ay;
          const u = Math.min(1, d / calm);
          val += amp * n * (0.08 + 0.92 * u * u * (3 - 2 * u));
        }
        field[j * nx + i] = val;
      }
    }
  }

  /* Marching squares for every ring at once, then stitch the pieces into
     lines. Each crossing lives on a grid edge at one level; the two cells
     either side of that edge share it, which is how pieces find each other. */
  function trace(sp, phase) {
    const hx = nx - 1, HN = hx * ny, E = HN + nx * (ny - 1);
    const kLow = Math.floor(-phase) + 1; // smallest ring with a positive radius
    // Pass 1: how many levels cross each edge, and where its slots start.
    let total = 0;
    for (let e = 0; e < E; e++) {
      let a, b;
      if (e < HN) {
        const j = (e / hx) | 0, i = e - j * hx;
        a = field[j * nx + i];
        b = field[j * nx + i + 1];
      } else {
        const o = e - HN;
        a = field[o];
        b = field[o + nx];
      }
      const lo = a < b ? a : b, hi = a < b ? b : a;
      const k0 = Math.max(kLow, Math.ceil(lo / sp - phase));
      const k1 = Math.ceil(hi / sp - phase); // exclusive
      base[e] = total;
      kmin[e] = k0;
      if (k1 > k0) total += k1 - k0;
    }
    base[E] = total;
    slot = grow(slot, total, Int32Array);
    slot.fill(-1, 0, total);

    // Pass 2: the pieces.
    let n = 0;
    const put = (x1, y1, e1, x2, y2, e2, k) => {
      if (n * 4 + 4 > seg.length) {
        seg = grow(seg, n * 4 + 4, Float32Array);
        segK = grow(segK, n + 1, Int32Array);
        link = grow(link, n * 2 + 2, Int32Array);
      }
      seg[n * 4] = x1;
      seg[n * 4 + 1] = y1;
      seg[n * 4 + 2] = x2;
      seg[n * 4 + 3] = y2;
      segK[n] = k;
      link[n * 2] = link[n * 2 + 1] = -1;
      for (let end = 0; end < 2; end++) {
        const e = end ? e2 : e1;
        const s = base[e] + k - kmin[e];
        if (k < kmin[e] || s >= base[e + 1]) continue; // a rounding edge case: leave it unjoined
        const r = n * 2 + end;
        const o = slot[s];
        if (o < 0) slot[s] = r;
        else {
          link[r] = o;
          link[o] = r;
        }
      }
      n++;
    };
    for (let j = 0; j < ny - 1; j++) {
      const y0 = j * cs, y1 = y0 + cs;
      for (let i = 0; i < hx; i++) {
        const o = j * nx + i;
        const a = field[o], b = field[o + 1], c = field[o + nx + 1], d = field[o + nx];
        const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
        const k0 = Math.max(kLow, Math.ceil(lo / sp - phase));
        const k1 = Math.ceil(hi / sp - phase);
        if (k1 <= k0) continue;
        const x0 = i * cs, x1 = x0 + cs;
        const eT = j * hx + i, eB = eT + hx, eL = HN + o, eR = eL + 1;
        for (let k = k0; k < k1; k++) {
          const L = (k + phase) * sp;
          const code = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
          if (code === 0 || code === 15) continue;
          // Crossings on the top (a-b), right (b-c), bottom (d-c) and left (a-d) edges.
          const tx = x0 + ((L - a) / (b - a)) * cs;
          const ry = y0 + ((L - b) / (c - b)) * cs;
          const bx = x0 + ((L - d) / (c - d)) * cs;
          const ly = y0 + ((L - a) / (d - a)) * cs;
          switch (code) {
            case 1: case 14: put(x0, ly, eL, bx, y1, eB, k); break;
            case 2: case 13: put(bx, y1, eB, x1, ry, eR, k); break;
            case 3: case 12: put(x0, ly, eL, x1, ry, eR, k); break;
            case 4: case 11: put(tx, y0, eT, x1, ry, eR, k); break;
            case 6: case 9: put(tx, y0, eT, bx, y1, eB, k); break;
            case 7: case 8: put(x0, ly, eL, tx, y0, eT, k); break;
            case 5: case 10: {
              if ((code === 5) === ((a + b + c + d) / 4 > L)) {
                put(x0, ly, eL, tx, y0, eT, k);
                put(bx, y1, eB, x1, ry, eR, k);
              } else {
                put(x0, ly, eL, bx, y1, eB, k);
                put(tx, y0, eT, x1, ry, eR, k);
              }
              break;
            }
          }
        }
      }
    }
    return n;
  }

  function draw() {
    const half = Math.hypot(W, H) / 2;
    const sp = half / v["rings.count"];
    const phase = time * v["rings.drift"];
    sample();
    const n = trace(sp, phase);

    // Walk the pieces into lines, one path per look.
    seen = grow(seen, n, Uint8Array);
    seen.fill(0, 0, n);
    const paths = new Map();
    const pathFor = (k) => {
      const L = (k + phase) * sp;
      const key = L < sp * 4 ? `a${k}` : ((k % 5) + 5) % 5 === 0 ? "i" : "p";
      let p = paths.get(key);
      if (!p) paths.set(key, (p = { path: new Path2D(), k }));
      return p.path;
    };
    for (let s0 = 0; s0 < n; s0++) {
      if (seen[s0]) continue;
      // Back up to the free end of this line (or all the way round a loop).
      let cur = s0, end = 0, closed = false;
      for (let guard = 0; guard < n; guard++) {
        const o = link[cur * 2 + end];
        if (o < 0) break;
        const ns = o >> 1;
        if (ns === s0) {
          closed = true;
          break;
        }
        cur = ns;
        end = 1 - (o & 1);
      }
      if (closed) {
        cur = s0;
        end = 0;
      }
      const path = pathFor(segK[cur]);
      path.moveTo(seg[cur * 4 + end * 2], seg[cur * 4 + end * 2 + 1]);
      for (let guard = 0; guard < n; guard++) {
        seen[cur] = 1;
        const out = 1 - end;
        path.lineTo(seg[cur * 4 + out * 2], seg[cur * 4 + out * 2 + 1]);
        const o = link[cur * 2 + out];
        if (o < 0) break;
        const ns = o >> 1;
        if (seen[ns]) {
          if (closed) path.closePath();
          break;
        }
        cur = ns;
        end = o & 1;
      }
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, W, H);
    g.lineCap = "round";
    g.lineJoin = "round";
    const w = v["rings.weight"];
    const ink = rgb(v["colour.ink"]), accent = rgb(v["colour.accent"]);
    const plain = lerp3(rgb(v["colour.ground"]), ink, 0.7);
    for (const [key, { path, k }] of paths) {
      const isIndex = ((k % 5) + 5) % 5 === 0;
      let colour = isIndex ? ink : plain;
      if (key[0] === "a") colour = lerp3(accent, colour, smooth(sp * 0.5, sp * 4, (k + phase) * sp));
      g.lineWidth = isIndex ? w * 2.1 : w;
      g.strokeStyle = css(colour);
      g.stroke(path);
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    const k = 1 - Math.exp(-dt * 5);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    pointer.on += (pointer.target - pointer.on) * (1 - Math.exp(-dt * 2.5));
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
    if (pointer.on < 0.02) {
      pointer.x = pointer.tx;
      pointer.y = pointer.ty;
    }
    pointer.target = 1;
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
