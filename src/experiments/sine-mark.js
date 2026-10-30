/* Sine wave mark.

   Ported from a logo generator in the AI Fun folder. Its method: lay rows
   of horizontal lines over a curve, find every place a row crosses it, put
   a block cap on each crossing and a hairline bar between them, and let a
   sine wave run through the whole stack. The generator fed it a client's
   wave; here it reads any word you type (or a circle, with no word), so
   the caps land on the edges of the letters and the bars run through
   their insides, heavier on the left and thinning to the right as the
   generator's caps did. The wave sways the rows from side to side and
   travels up through them. Brush across the bars and they swing, then
   settle back into the wave. */

export const params = {
  type: {
    word: "Kinetic",
  },
  scan: {
    rows: [16, 6, 60, 1],
    caps: [1.5, 0.2, 3, 0.05],
    bar: [0.14, 0.03, 0.6, 0.01],
    taper: [0.55, 0, 0.9, 0.01],
  },
  wave: {
    amplitude: [0.12, 0, 0.8, 0.01],
    frequency: [0.8, 0.1, 4, 0.05],
    speed: [0.35, 0, 2, 0.01],
  },
  colour: {
    ground: "#000000",
    mark: "#f3ecd8",
  },
};

// the site's own grotesk, bundled with it (found by pattern, as the other type pieces do)
const FACES = import.meta.glob("../assets/fonts/PPNeueMontreal-Medium.woff2", { query: "?url", import: "default", eager: true });
const FAMILY = "Sine Mark Grotesk";
const STACK = `"${FAMILY}", "Helvetica Neue", Helvetica, Arial, sans-serif`;
const FONT_PX = 300; // the word is read at this size, off screen
// in ems: tracked out and thickened, so the letters keep apart and a stem holds its caps
const SPACING = 0.07, HEAVIER = 0.05;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 1, H = 1, dpr = 1, raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  let phase = 0, alive = true, fontReady = false;

  /* ---- the shape, read once into runs per row ---- */
  const mask = document.createElement("canvas");
  const mg = mask.getContext("2d", { willReadFrequently: true });
  let shape = { w: 1, h: 1, rows: [] }; // rows: [{ y, runs: [[x0, x1], ...] }] in mask px, ink box from 0
  let built = "";
  function build() {
    const word = String(v["type.word"] ?? "").trim().slice(0, 16);
    const n = Math.round(v["scan.rows"]);
    const key = `${word}|${n}|${fontReady}`;
    if (key === built) return;
    built = key;
    let mw, mh;
    if (word) {
      mg.font = `500 ${FONT_PX}px ${STACK}`;
      mg.letterSpacing = `${FONT_PX * SPACING}px`;
      mw = Math.ceil(mg.measureText(word).width + FONT_PX * 0.4);
      mh = Math.ceil(FONT_PX * 1.5);
    } else {
      mw = mh = Math.ceil(FONT_PX * 1.1);
    }
    mask.width = mw;
    mask.height = mh;
    mg.clearRect(0, 0, mw, mh);
    mg.fillStyle = "#fff";
    if (word) {
      mg.font = `500 ${FONT_PX}px ${STACK}`;
      mg.letterSpacing = `${FONT_PX * SPACING}px`;
      mg.textBaseline = "alphabetic";
      mg.fillText(word, FONT_PX * 0.2, FONT_PX * 1.1);
      // set a touch heavier than the face, so a stem holds two caps and the bar between
      mg.strokeStyle = "#fff";
      mg.lineJoin = "round";
      mg.lineWidth = FONT_PX * HEAVIER;
      mg.strokeText(word, FONT_PX * 0.2, FONT_PX * 1.1);
    } else {
      mg.beginPath();
      mg.arc(mw / 2, mh / 2, FONT_PX * 0.45, 0, Math.PI * 2);
      mg.fill();
    }
    const px = mg.getImageData(0, 0, mw, mh).data;
    const ink = (x, y) => px[(y * mw + x) * 4 + 3] > 127;
    // the ink's box
    let x0 = mw, x1 = -1, y0 = mh, y1 = -1;
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++)
        if (ink(x, y)) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) {
      shape = { w: 1, h: 1, rows: [] };
      return;
    }
    const h = y1 - y0 + 1, pitch = h / n;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const y = Math.min(y1, Math.round(y0 + (i + 0.5) * pitch));
      const runs = [];
      let start = -1;
      for (let x = x0; x <= x1 + 1; x++) {
        const on = x <= x1 && ink(x, y);
        if (on && start < 0) start = x;
        if (!on && start >= 0) {
          runs.push([start - x0, x - x0]);
          start = -1;
        }
      }
      rows.push({ y: (i + 0.5) * pitch, runs });
    }
    shape = { w: x1 - x0 + 1, h, rows, pitch };
    springs.length = n;
    for (let i = 0; i < n; i++) springs[i] ??= { x: 0, v: 0 };
  }

  /* ---- the brush: each row on a spring, pushed by the pointer passing over it ---- */
  const springs = [];
  let brush = null; // { x, y } in css px, last seen

  let view = { s: 1, ox: 0, oy: 0 };
  function fit() {
    const pad = (v["wave.amplitude"] * 2 + 0.05) * shape.h + v["scan.caps"] * (shape.pitch ?? 1);
    const s = Math.min((W * 0.74) / (shape.w + pad), (H * 0.6) / shape.h);
    view = { s, ox: W / 2 - (shape.w * s) / 2, oy: H / 2 - (shape.h * s) / 2 };
  }

  function draw() {
    build();
    fit();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, W, H);
    if (!shape.rows.length) return;
    const { s, ox, oy } = view;
    const n = shape.rows.length, pitch = shape.pitch;
    const amp = v["wave.amplitude"] * shape.h;
    const freq = v["wave.frequency"];
    const capW = v["scan.caps"] * pitch;
    const barH = v["scan.bar"] * pitch;
    const taper = v["scan.taper"];
    // the generator's caps: heaviest on the left, thinning to the right
    const capH = (x) => pitch * 0.82 * (1 - taper * Math.pow(clamp(x / shape.w, 0, 1), 0.85));
    g.fillStyle = v["colour.mark"];
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const row = shape.rows[i];
      const t = n > 1 ? i / (n - 1) : 0.5;
      // the wave, travelling up the rows; the brush on top of it
      const dx = amp * Math.sin(Math.PI * 2 * freq * t + phase) + (springs[i]?.x ?? 0);
      const yc = oy + row.y * s;
      for (const [a, b] of row.runs) {
        const ha = capH(a), hb = capH(b);
        // the caps, one on each crossing
        g.rect(ox + (a + dx - capW / 2) * s, yc - (ha / 2) * s, capW * s, ha * s);
        g.rect(ox + (b + dx - capW / 2) * s, yc - (hb / 2) * s, capW * s, hb * s);
        // the bar between them
        const l = a + capW / 2, r = b - capW / 2;
        if (r > l) g.rect(ox + (l + dx) * s, yc - (barH / 2) * s, (r - l) * s, barH * s);
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
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    phase -= dt * v["wave.speed"] * Math.PI;
    // springs: stiff enough to settle in a second or two, loose enough to swing
    for (const sp of springs) {
      if (!sp) continue;
      sp.v += (-38 * sp.x - 4.2 * sp.v) * dt;
      sp.x += sp.v * dt;
    }
    draw();
  }

  function sync() {
    const run = !reduced && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const local = (e) => {
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMove = (e) => {
    const p = local(e);
    if (brush && !reduced && shape.rows.length) {
      const { s, oy } = view;
      const vx = (p.x - brush.x) / s; // in mask px
      const reachPx = shape.pitch * s * 2.2;
      shape.rows.forEach((row, i) => {
        const d = Math.abs(oy + row.y * s - p.y);
        if (d < reachPx && springs[i]) {
          // a brush, not a shove: however fast the hand, a row swings by about a letter at most
          const cap = shape.h * 3;
          springs[i].v = clamp(springs[i].v + clamp(vx, -shape.h * 0.3, shape.h * 0.3) * 9 * (1 - d / reachPx), -cap, cap);
        }
      });
    }
    brush = p;
  };
  const onLeave = () => (brush = null);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("pointercancel", onLeave);

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

  // the face: drawn at once in the fallback, again when the site's grotesk is in
  let face = null;
  const url = Object.values(FACES)[0];
  if (url && typeof FontFace === "function") {
    face = new FontFace(FAMILY, `url(${url}) format("woff2")`, { weight: "500" });
    face
      .load()
      .then(() => {
        if (!alive) return;
        document.fonts.add(face);
        fontReady = true;
        draw();
      })
      .catch(() => {});
  }

  resize();
  draw();
  sync();

  return {
    update(values) {
      Object.assign(v, values);
      if (!raf) draw();
    },
    action() {},
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      if (face) document.fonts.delete(face);
      canvas.remove();
    },
  };
}
