/* Stipple.

   A moving picture, redrawn in dots: every frame is read into a small
   buffer, one sample per dot, and each dot is sized by how bright the
   picture is there (by area, so the tones read true). The source is the
   clip at /media/play/stipple-source.mp4 when it exists (any flat border
   round it, like a screen recording's margin, is found and cropped away).
   Without it, or with Source set to Planet, the picture is made here: a
   ringed planet turning under a slow-moving light, the kind of form
   halftone loves. */

export const params = {
  dots: {
    spacing: [8, 4, 24, 1],
    size: [0.86, 0.2, 1.6, 0.01],
    shape: { type: "select", options: ["Circle", "Square", "Line"] },
    jitter: [0.12, 0, 1, 0.01],
  },
  picture: {
    source: { type: "select", options: ["Clip", "Planet"] },
    contrast: [1.35, 0.5, 3, 0.01],
    invert: false,
  },
  colour: { ink: "#d9e2d2", ground: "#0d0d0d" },
};

const SOURCE = "/media/play/stipple-source.mp4";

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

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const noise = simplex3(5);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 0, H = 0, dpr = 1;
  let time = reduced ? 7 : 0, last = 0, raf = 0;
  let onScreen = true, tabVisible = !document.hidden;
  let destroyed = false;

  // The video, if there is one. Until it proves itself the planet is drawn.
  let video = null, videoReady = false;
  let crop = null; // the clip's picture inside any flat border, in video px
  let fade = 0; // 0 planet .. 1 clip
  let other = new Float32Array(0);
  const buffer = document.createElement("canvas");
  const bg = buffer.getContext("2d", { willReadFrequently: true });
  const aborter = new AbortController();

  // The dot lattice: where each dot sits and its fixed jitter.
  let lattice = { key: "", xs: new Float32Array(0), ys: new Float32Array(0), jx: new Float32Array(0), jy: new Float32Array(0), cols: 0, rows: 0, line: false };
  let lum = new Float32Array(0);

  /* Spacing is in px on a 900px stage; smaller stages tighten it a little
     so a phone still gets a picture's worth of dots. */
  const spacing = () => v["dots.spacing"] * Math.min(1.25, Math.max(0.6, Math.sqrt(Math.min(W, H) / 900)));

  function buildLattice() {
    const sp = spacing();
    const line = v["dots.shape"] === "Line";
    const key = `${W}x${H}:${sp}:${line}`;
    if (lattice.key === key) return;
    // Circles and squares sit on a triangular lattice, as a halftone screen
    // does; lines are rows sampled twice as finely along their length.
    const rowH = line ? sp : sp * 0.866;
    const stepX = line ? sp / 2 : sp;
    const cols = Math.ceil(W / stepX) + 2;
    const rows = Math.ceil(H / rowH) + 2;
    const n = cols * rows;
    const xs = new Float32Array(n), ys = new Float32Array(n), jx = new Float32Array(n), jy = new Float32Array(n);
    let s = 1234567;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
    const offX = (W - (cols - 3) * stepX) / 2, offY = (H - (rows - 3) * rowH) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        xs[i] = offX + (c - 1) * stepX + (!line && r % 2 ? stepX / 2 : 0);
        ys[i] = offY + (r - 1) * rowH;
        jx[i] = rnd();
        jy[i] = line ? noise(c * 0.09, r * 0.7, 3.1) * 0.9 : rnd();
      }
    }
    lattice = { key, xs, ys, jx, jy, cols, rows, line };
    lum = new Float32Array(n);
    other = new Float32Array(n);
  }

  /* The made picture: a ringed planet, its bands turning, under a light
     that swings slowly from a crescent to nearly full and back. Orthographic,
     one ray per dot. */
  function planet(t, out) {
    const { xs, ys } = lattice;
    // On a tall stage the rings swing onto the diagonal so the planet can
    // be bigger and still carry them.
    const tall = Math.min(1, Math.max(0, (H / W - 1) / 1.1));
    const R = Math.min(H * 0.31, W * (0.2 + 0.17 * tall));
    const cx = W * 0.5, cy = H * 0.5;
    const roll = -0.2 - 0.75 * tall, cr = Math.cos(roll), sr = Math.sin(roll);
    // The ring plane leans towards us so the rings read as an open ellipse.
    const lean = 0.3, nY = Math.cos(lean), nZ = Math.sin(lean);
    const spin = t * 0.09;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const swing = 0.45 + 0.6 * Math.sin(t * 0.11);
    let lx = Math.sin(swing) * 0.9, ly = -0.32, lz = Math.cos(swing) * 0.8 + 0.25;
    const ll = Math.hypot(lx, ly, lz);
    lx /= ll; ly /= ll; lz /= ll;
    const ringLight = 0.6 + 0.4 * Math.abs(nY * ly - nZ * lz);
    for (let i = 0; i < xs.length; i++) {
      const sx = (xs[i] - cx) / R, sy = (ys[i] - cy) / R;
      const u = sx * cr - sy * sr, w = sx * sr + sy * cr;
      const d2 = u * u + w * w;
      let L = 0;
      let zs = -Infinity;
      if (d2 < 1) {
        const z = Math.sqrt(1 - d2);
        zs = z;
        // Into the planet's frame (its pole is the ring normal), then turn.
        const py = w * nY - z * nZ, pzr = w * nZ + z * nY;
        const px = u * cs + pzr * sn, pz = -u * sn + pzr * cs;
        const warp = noise(px * 1.1, py * 1.1, pz * 1.1 + t * 0.015);
        const albedo = 0.6 + 0.2 * Math.sin(py * 10 + warp * 1.2) + 0.1 * Math.sin(py * 23 + warp * 2.2) + 0.08 * noise(px * 5, py * 9, pz * 5);
        const ndl = u * lx + w * ly + z * lz;
        const lit = Math.max(0, (ndl + 0.1) / 1.1);
        const spec = Math.max(0, 2 * ndl * z - lz) ** 16;
        L = 0.05 + albedo * lit ** 0.85 + spec * 0.2;
      }
      // The rings: where this dot's ray meets the ring plane (near side below).
      const zr = (w * nY) / nZ;
      const rho = Math.sqrt(u * u + w * w + zr * zr);
      if (rho > 1.32 && rho < 2.25 && zr > zs) {
        const k = (rho - 1.32) / 0.93;
        let band = 0.55 + 0.25 * Math.sin(rho * 46) + 0.15 * Math.sin(rho * 17 + 1);
        band *= k < 0.06 ? k / 0.06 : 1;
        band *= k > 0.94 ? (1 - k) / 0.06 : 1;
        if (rho > 1.86 && rho < 1.95) band *= 0.08; // the gap
        if (rho < 1.55) band *= 0.55; // the faint inner ring
        // In the planet's shadow?
        const b = u * lx + w * ly + zr * lz;
        const c = rho * rho - 1;
        const shade = b < 0 && b * b - c > 0 ? 0.08 : 1;
        L = Math.max(L * 0.15, band * ringLight * shade);
      }
      out[i] = L;
    }
  }

  /* Find the picture inside a flat border (a screen recording's margin, a
     letterbox): the corners agree on a colour, and the rows and columns
     that differ from it bound the picture. No border, no crop. */
  function measureCrop() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const w = 160, h = Math.max(2, Math.round((160 * vh) / vw));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(video, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const px = (i, j) => {
      const o = (j * w + i) * 4;
      return [d[o], d[o + 1], d[o + 2]];
    };
    const corners = [px(1, 1), px(w - 2, 1), px(1, h - 2), px(w - 2, h - 2)];
    const ref = [0, 1, 2].map((k) => corners.reduce((a, c) => a + c[k], 0) / 4);
    const off = (c) => Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]);
    if (corners.some((c) => off(c) > 30)) return null;
    const rowHit = (j) => {
      let n = 0;
      for (let i = 0; i < w; i++) if (off(px(i, j)) > 36) n++;
      return n / w > 0.3;
    };
    const colHit = (i) => {
      let n = 0;
      for (let j = 0; j < h; j++) if (off(px(i, j)) > 36) n++;
      return n / h > 0.3;
    };
    let top = 0, bottom = h - 1, left = 0, right = w - 1;
    while (top < h - 1 && !rowHit(top)) top++;
    while (bottom > top && !rowHit(bottom)) bottom--;
    while (left < w - 1 && !colHit(left)) left++;
    while (right > left && !colHit(right)) right--;
    const bw = right - left + 1, bh = bottom - top + 1;
    if (bw < w * 0.4 || bh < h * 0.4 || (bw > w * 0.97 && bh > h * 0.97)) return null;
    // Step in a little to clear rounded corners and soft edges.
    const ix = bw * 0.03, iy = bh * 0.03;
    const sx = vw / w, sy = vh / h;
    return { x: (left + ix) * sx, y: (top + iy) * sy, w: (bw - ix * 2) * sx, h: (bh - iy * 2) * sy };
  }

  /* A video frame: drawn cover-fit into a small buffer, one pixel per dot
     spacing, then read back. */
  function fromVideo(out) {
    const { xs, ys } = lattice;
    const sp = spacing();
    const bw = Math.max(2, Math.ceil(W / sp) + 1), bh = Math.max(2, Math.ceil(H / sp) + 1);
    if (buffer.width !== bw || buffer.height !== bh) {
      buffer.width = bw;
      buffer.height = bh;
    }
    if (crop === undefined && (reduced || video.currentTime > 0.3)) crop = measureCrop();
    const src = crop || { x: 0, y: 0, w: video.videoWidth, h: video.videoHeight };
    const scale = Math.max(bw / src.w, bh / src.h);
    const dw = src.w * scale, dh = src.h * scale;
    bg.drawImage(video, src.x, src.y, src.w, src.h, (bw - dw) / 2, (bh - dh) / 2, dw, dh);
    const data = bg.getImageData(0, 0, bw, bh).data;
    const at = (x, y) => {
      const o = (y * bw + x) * 4;
      return (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
    };
    for (let i = 0; i < xs.length; i++) {
      // Bilinear, so dots between samples don't step.
      const fx = Math.min(bw - 1.001, Math.max(0, xs[i] / sp)), fy = Math.min(bh - 1.001, Math.max(0, ys[i] / sp));
      const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
      const top = at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax;
      const bot = at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax;
      out[i] = top * (1 - ay) + bot * ay;
    }
  }

  const clipOn = () => videoReady && v["picture.source"] === "Clip" && video.readyState >= 2 && video.videoWidth > 0;

  function draw() {
    buildLattice();
    // Cross-fade between the made planet and the clip as either comes and goes.
    if (fade >= 1 && clipOn()) fromVideo(lum);
    else if (fade <= 0 || !videoReady) planet(time, lum);
    else {
      planet(time, lum);
      if (video.readyState >= 2) {
        fromVideo(other);
        const k = fade * fade * (3 - 2 * fade);
        for (let i = 0; i < lum.length; i++) lum[i] += (other[i] - lum[i]) * k;
      }
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, W, H);
    g.fillStyle = v["colour.ink"];

    const sp = spacing();
    const size = v["dots.size"];
    const contrast = v["picture.contrast"];
    const invert = v["picture.invert"];
    const jit = v["dots.jitter"] * sp;
    const shape = v["dots.shape"];
    const { xs, ys, jx, jy, cols, rows } = lattice;
    const tone = (L) => {
      let t = (L - 0.5) * contrast + 0.5;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return invert ? 1 - t : t;
    };

    g.beginPath();
    if (shape === "Line") {
      // Engraving: each row is one ribbon that swells with the light.
      const maxT = sp * 0.5 * size;
      for (let r = 0; r < rows; r++) {
        const o = r * cols;
        let open = false;
        let start = -1;
        const flush = (end) => {
          if (start < 0) return;
          for (let c = start; c < end; c++) {
            const i = o + c;
            const y = ys[i] + jy[i] * jit;
            const half = tone(lum[i]) * maxT;
            if (c === start) g.moveTo(xs[i], y - half);
            else g.lineTo(xs[i], y - half);
          }
          for (let c = end - 1; c >= start; c--) {
            const i = o + c;
            g.lineTo(xs[i], ys[i] + jy[i] * jit + tone(lum[i]) * maxT);
          }
          g.closePath();
          start = -1;
        };
        for (let c = 0; c < cols; c++) {
          const on = tone(lum[o + c]) * maxT > 0.12;
          if (on && !open) start = c;
          if (!on && open) flush(c);
          open = on;
        }
        if (open) flush(cols);
      }
    } else {
      const maxR = sp * 0.5 * size;
      const square = shape === "Square";
      for (let i = 0; i < xs.length; i++) {
        const t = tone(lum[i]);
        // By area: a dot twice as bright covers twice the paper.
        const r = Math.sqrt(t) * maxR;
        if (r < 0.25) continue;
        const x = xs[i] + jx[i] * jit, y = ys[i] + jy[i] * jit;
        if (square) {
          const a = r * 0.886 * 2; // the square with the circle's area
          g.rect(x - a / 2, y - a / 2, a, a);
        } else {
          g.moveTo(x + r, y);
          g.arc(x, y, r, 0, Math.PI * 2);
        }
      }
    }
    g.fill();
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
    fade = Math.min(1, Math.max(0, fade + (clipOn() ? dt : -dt) / 0.9));
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
    if (video && videoReady && !reduced) {
      const play = run && v["picture.source"] === "Clip";
      if (play && video.paused) video.play().catch(() => {});
      else if (!play && !video.paused) video.pause();
    }
  }

  /* Use the clip only if it is really there and really a video; anything
     else (missing, an HTML 404 page, autoplay refused) leaves the planet. */
  async function tryVideo() {
    try {
      const res = await fetch(SOURCE, { method: "HEAD", signal: aborter.signal, cache: "no-store" });
      if (!res.ok || !/^video\//.test(res.headers.get("content-type") ?? "")) return;
      if (destroyed) return;
      video = document.createElement("video");
      Object.assign(video, { muted: true, loop: true, playsInline: true, preload: "auto" });
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.src = SOURCE;
      await new Promise((resolve, reject) => {
        video.addEventListener("loadeddata", resolve, { once: true });
        video.addEventListener("error", reject, { once: true });
      });
      if (destroyed) return;
      if (reduced) {
        // One still, a little way in.
        await new Promise((resolve) => {
          video.addEventListener("seeked", resolve, { once: true });
          video.currentTime = Math.min(1.5, (video.duration || 3) / 3);
        });
      } else {
        await video.play();
      }
      if (destroyed) return;
      videoReady = true;
      crop = undefined; // measured once the clip is under way
      if (reduced) fade = 1;
      sync();
      draw();
    } catch {
      videoReady = false;
      if (video) {
        video.removeAttribute("src");
        video.load();
        video = null;
      }
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

  resize();
  draw();
  sync();
  tryVideo();

  return {
    update(values) {
      Object.assign(v, values);
      if (reduced) fade = clipOn() ? 1 : 0;
      sync();
      draw();
    },
    action() {},
    destroy() {
      destroyed = true;
      aborter.abort();
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video = null;
      }
      buffer.width = buffer.height = 0;
      canvas.remove();
    },
  };
}
