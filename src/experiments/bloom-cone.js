/* Bloom cone.

   A stack of flat ovals, each one a step of a five-stop gradient mixed in
   OKLab, nested from a pale rim to a hot core. The rings are born small at
   the apex and spread outward, cooling as they go, so the stack radiates for
   ever without moving; the apex is pushed high, so the nest reads as a cone
   seen from above. Over the piece the inner rings lean toward the cursor
   first and the outer ones trail, and the core may spill past the rim. Press
   and drag to move the eye of the stack. Drops, off at first, fall from the
   top and land on the apex at the moment a ring is born there.

   Ported from a Creative Studio design tool (round one, the cone), at the
   owner's dialled cone of August 14: 27 rings at 0.42 spread, the apex high,
   the haze stops with a softer peach core, a little grain. The exports,
   presets and saved defaults of the tool are not part of it. The page never
   names the client. */

export const params = {
  stack: {
    rings: [27, 5, 48, 1],
    spread: [0.42, 0.2, 1.4, 0.01],
    squash: [0.62, 0.35, 1.3, 0.01],
    apex: [0.42, -1, 1.5, 0.01],
  },
  motion: {
    grow: [0.7, 0, 1, 0.01],
    follow: [0.34, 0, 1, 0.01],
    drops: { type: "toggle", labels: ["No drops", "Drops"], default: false },
  },
  colour: {
    ground: "#cee2eb",
    core: "#fd9e63",
    hue: [0, -90, 90, 1],
  },
};

// the dialled cone's other values (the tool's DEFAULTS)
const CONE = { curve: 1.25, core: 0.06, driftX: 0, chroma: 1, fade: 1.03, grain: 0.04, overshoot: 0.4, cx: 0.5, cy: 0.58 };
// the haze stops between the rim and the core
const MIDDLE = ["#c4b6e4", "#7100ff", "#ff00f9"];
// with Drops on: the tool's switch restores its dialled fall
const DROPS = { fall: 600, height: 1, stretch: 0.8 };

/* ---- colour math (OKLab / OKLCH), the tool's own ---- */
const hexToRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const rgbToHex = (c) => "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function rgbToOklab([r, g, b]) {
  r = toLin(r); g = toLin(g); b = toLin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)].map((v) => Math.min(1, Math.max(0, v)));
}
// t from the rim (0) to the core (1), with the hue turned and the chroma scaled in OKLCH
function sampleGradient(labs, t, hueShiftDeg, chromaMul) {
  const seg = Math.min(labs.length - 2, Math.floor(t * (labs.length - 1)));
  const f = t * (labs.length - 1) - seg;
  const A = labs[seg], B = labs[seg + 1];
  const [L, a, b] = [0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * f);
  const C = Math.hypot(a, b) * chromaMul, h = Math.atan2(b, a) + (hueShiftDeg * Math.PI) / 180;
  return rgbToHex(oklabToRgb([L, C * Math.cos(h), C * Math.sin(h)]));
}
const mod = (x, m) => ((x % m) + m) % m;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:pan-y";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 1, H = 1, dpr = 1, raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  let phase = 0, mouse = null, offsets = [], drops = [], totalPhase = 0, nextBirth = 1;
  let cx = CONE.cx, cy = CONE.cy, dragging = null;
  let labs = [];

  const rings = () => Math.round(v["stack.rings"]);
  const squash = () => v["stack.squash"];
  const grow = () => (still ? 0 : v["motion.grow"]);
  const stops = () => [v["colour.ground"], ...MIDDLE, v["colour.core"]];
  const relab = () => (labs = stops().map((h) => rgbToOklab(hexToRgb(h))));
  const colourAt = (t) => sampleGradient(labs, t, v["colour.hue"], CONE.chroma);

  function ringU(i) {
    const n = rings();
    if (n === 1) return 0;
    return mod(i / (n - 1) - phase, n / (n - 1));
  }

  function computeRings() {
    const out = [], n = rings(), sq = squash();
    const maxR = Math.max(W, H) * 0.62 * v["stack.spread"];
    for (let i = 0; i < n; i++) {
      const u = ringU(i), uc = Math.min(u, 1);
      const r = Math.max(0, maxR * (1 - (1 - CONE.core) * Math.pow(u, CONE.curve)));
      let ox = CONE.driftX * maxR * uc + (offsets[i]?.x ?? 0);
      let oy = -v["stack.apex"] * maxR * uc + (offsets[i]?.y ?? 0);
      // the elliptical fence, in unsquashed space; overshoot lets the core spill past the rim
      const limit = maxR - r + CONE.overshoot * maxR;
      let oyT = oy / sq;
      const d = Math.hypot(ox, oyT);
      if (d > limit) (ox *= limit / d), (oyT *= limit / d);
      oy = oyT * sq;
      out.push({ x: cx * W + ox, y: cy * H + oy, rx: r, ry: r * sq, fill: colourAt(Math.pow(uc, CONE.fade)) });
    }
    return out.sort((a, b) => b.rx - a.rx);
  }

  // inner rings respond first and commit; the outer ones barely stir and trail
  function stepFollow(k) {
    const n = rings();
    if (offsets.length !== n) offsets = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
    const bx = cx * W, by = cy * H, follow = v["motion.follow"];
    for (let i = 0; i < n; i++) {
      const u = Math.min(ringU(i), 1);
      let tx = 0, ty = 0;
      if (mouse && follow > 0) {
        const pull = follow * Math.pow(u, 1.4);
        tx = (mouse.x - bx) * pull;
        ty = (mouse.y - by) * pull;
      }
      const ease = 1 - Math.pow(1 - (0.045 + 0.1 * u), k);
      offsets[i].x += (tx - offsets[i].x) * ease;
      offsets[i].y += (ty - offsets[i].y) * ease;
    }
  }

  // a drop falls from the top and lands on the apex as a ring is born there
  function stepDrops(dt) {
    if (!(v["motion.drops"] && grow() > 0 && rings() > 1)) {
      drops = [];
      totalPhase = 0;
      nextBirth = 1;
      return;
    }
    const rate = grow() * 0.00009, spacing = 1 / (rings() - 1);
    totalPhase += rate * dt;
    const upcoming = Math.floor(totalPhase / spacing) + 1;
    const msUntil = (upcoming * spacing - totalPhase) / rate;
    if (upcoming > nextBirth && msUntil <= DROPS.fall) {
      nextBirth = upcoming;
      drops.push({ t: 1 - msUntil / DROPS.fall, land: null });
    }
    for (const d of drops) {
      if (d.land === null) {
        d.t += dt / DROPS.fall;
        if (d.t >= 1) d.land = 0;
      } else d.land += dt;
    }
    drops = drops.filter((d) => d.land === null || d.land < 140);
  }
  function drawDrops() {
    if (!drops.length) return;
    const maxR = Math.max(W, H) * 0.62 * v["stack.spread"], sq = squash();
    const ax = cx * W + CONE.driftX * maxR, ay = cy * H - v["stack.apex"] * maxR;
    const rCore = Math.max(3, maxR * CONE.core);
    const y0 = ay - (ay + rCore * 2) * DROPS.height;
    g.fillStyle = colourAt(1);
    for (const d of drops) {
      if (d.land === null) {
        const t = Math.max(0, Math.min(1, d.t)), s = 1 + DROPS.stretch * t;
        g.globalAlpha = Math.min(1, 0.25 + t * 1.5);
        g.beginPath();
        g.ellipse(ax, y0 + (ay - y0) * t * t, rCore / Math.sqrt(s), rCore * sq * s, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        const p = d.land / 140;
        g.globalAlpha = 1 - p;
        g.beginPath();
        g.ellipse(ax, ay, rCore * (1 + 0.5 * p), rCore * sq * (1 - 0.5 * p), 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  // the grain: a random tile laid over in overlay
  const tile = document.createElement("canvas");
  tile.width = tile.height = 256;
  const tc = tile.getContext("2d"), img = tc.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.random() * 255;
    img.data[i + 3] = 255;
  }
  tc.putImageData(img, 0, 0);
  const grain = g.createPattern(tile, "repeat");

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = colourAt(0);
    g.fillRect(0, 0, W, H);
    for (const ring of computeRings()) {
      g.fillStyle = ring.fill;
      g.beginPath();
      g.ellipse(ring.x, ring.y, ring.rx, ring.ry, 0, 0, Math.PI * 2);
      g.fill();
    }
    drawDrops();
    g.save();
    g.globalAlpha = CONE.grain;
    g.globalCompositeOperation = "overlay";
    g.fillStyle = grain;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  function frame(now) {
    raf = 0;
    const ms = last ? Math.min(100, now - last) : 16;
    last = now;
    const n = rings();
    if (grow() > 0 && n > 1) phase = mod(phase + grow() * 0.00009 * ms, n / (n - 1));
    stepDrops(ms);
    stepFollow(ms / 16.667);
    draw();
    if (onScreen && tabVisible && !still) raf = requestAnimationFrame(frame);
  }
  function loop() {
    if (!raf && !still && onScreen && tabVisible) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    draw();
  }

  // the cursor pulls the core; press and drag moves the eye of the stack
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMove = (e) => {
    mouse = local(e);
    if (dragging === e.pointerId) {
      cx = mouse.x / W;
      cy = mouse.y / H;
      if (still) draw();
    }
  };
  const onDown = (e) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    dragging = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    onMove(e);
  };
  const onUp = () => {
    dragging = null;
    canvas.style.cursor = "grab";
  };
  const onLeave = () => {
    if (dragging === null) mouse = null;
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    onScreen ? loop() : stop();
  });
  io.observe(host);
  const onVis = () => {
    tabVisible = !document.hidden;
    tabVisible ? loop() : stop();
  };
  document.addEventListener("visibilitychange", onVis);

  relab();
  resize();
  loop();

  return {
    update(values, path) {
      Object.assign(v, values);
      if (path == null || path.startsWith("colour.")) relab();
      draw();
    },
    action() {},
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.remove();
    },
  };
}
