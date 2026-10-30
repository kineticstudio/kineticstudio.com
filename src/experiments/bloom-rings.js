/* Bloom rings.

   Concentric rings, each a step of a five-stop gradient mixed in OKLab and
   pushed hot (the chroma raised by half, the hue turned a touch), nested from
   a near-black rim to a golden core. Rings are born small at the centre and
   spread outward, cooling into the dark, so the target radiates for ever.
   The inner rings follow the cursor hard and the outer ones trail behind, and
   the core may spill well past the rim; untouched, the pull wanders by itself,
   so the bands bunch and open on one side and then the other. Press and drag
   to move the eye of the target.

   Ported from a Creative Studio design tool (round two, the rings), at the
   owner's dialled defaults: 24 circles at 0.6 spread, radiating, with a
   strong follow and overshoot, on the ember stops. The tool's exports,
   presets and saved defaults are not part of it; the idle wander is added
   here, so it moves when nobody is pointing. The page never names the
   client. */

export const params = {
  structure: {
    rings: [24, 5, 48, 1],
    spread: [0.6, 0.3, 1.4, 0.01],
    overshoot: [0.81, 0, 1, 0.01],
  },
  motion: {
    grow: [0.55, 0, 1, 0.01],
    follow: [0.67, 0, 1, 0.01],
    wander: [0.5, 0, 1, 0.01],
  },
  colour: {
    ground: "#12060e",
    middle: "#b81d54",
    core: "#ffd27a",
    chroma: [1.48, 0.2, 1.8, 0.01],
  },
};

// the dialled rings' other values (the tool's round-two DEFAULTS)
const RINGS = { curve: 1.25, core: 0.06, squash: 1, drift: [0, 0], hue: -8, fade: 1.03, cx: 0.5, cy: 0.5 };
// the ember stops either side of the middle one
const EMBER = ["#4a0f3a", "#ff6a1f"];

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
  let phase = 0, mouse = null, offsets = [], clock = 0;
  let cx = RINGS.cx, cy = RINGS.cy, dragging = null;
  let labs = [];

  const rings = () => Math.round(v["structure.rings"]);
  const grow = () => (still ? 0 : v["motion.grow"]);
  const stops = () => [v["colour.ground"], EMBER[0], v["colour.middle"], EMBER[1], v["colour.core"]];
  const relab = () => (labs = stops().map((h) => rgbToOklab(hexToRgb(h))));
  const colourAt = (t) => sampleGradient(labs, t, RINGS.hue, v["colour.chroma"]);

  function ringU(i) {
    const n = rings();
    if (n === 1) return 0;
    return mod(i / (n - 1) - phase, n / (n - 1));
  }

  function computeRings() {
    const out = [], n = rings(), sq = RINGS.squash;
    const maxR = Math.max(W, H) * 0.62 * v["structure.spread"];
    for (let i = 0; i < n; i++) {
      const u = ringU(i), uc = Math.min(u, 1);
      const r = Math.max(0, maxR * (1 - (1 - RINGS.core) * Math.pow(u, RINGS.curve)));
      let ox = RINGS.drift[0] * maxR * uc + (offsets[i]?.x ?? 0);
      let oy = RINGS.drift[1] * maxR * uc + (offsets[i]?.y ?? 0);
      // the elliptical fence, in unsquashed space; overshoot lets the core spill past the rim
      const limit = maxR - r + v["structure.overshoot"] * maxR;
      let oyT = oy / sq;
      const d = Math.hypot(ox, oyT);
      if (d > limit) (ox *= limit / d), (oyT *= limit / d);
      oy = oyT * sq;
      out.push({ x: cx * W + ox, y: cy * H + oy, rx: r, ry: r * sq, fill: colourAt(Math.pow(uc, RINGS.fade)) });
    }
    return out.sort((a, b) => b.rx - a.rx);
  }

  // untouched, the pull drifts on two slow sines round the middle, as if someone were pointing
  function wanderPoint() {
    const a = v["motion.wander"] * 0.3 * Math.min(W, H), s = clock / 1000;
    return { x: cx * W + a * (Math.sin(s * 0.61 + 0.6) * 0.7 + Math.sin(s * 0.23 + 2) * 0.3), y: cy * H + a * (Math.sin(s * 0.47 + 1.4) * 0.6 + Math.sin(s * 0.19) * 0.4) };
  }
  // inner rings respond first and commit; the outer ones barely stir and trail
  function stepFollow(k) {
    const n = rings();
    if (offsets.length !== n) offsets = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
    const bx = cx * W, by = cy * H, follow = v["motion.follow"];
    const at = mouse ?? (v["motion.wander"] > 0 ? wanderPoint() : null);
    for (let i = 0; i < n; i++) {
      const u = Math.min(ringU(i), 1);
      let tx = 0, ty = 0;
      if (at && follow > 0) {
        const pull = follow * Math.pow(u, 1.4);
        tx = (at.x - bx) * pull;
        ty = (at.y - by) * pull;
      }
      const ease = 1 - Math.pow(1 - (0.045 + 0.1 * u), k);
      offsets[i].x += (tx - offsets[i].x) * ease;
      offsets[i].y += (ty - offsets[i].y) * ease;
    }
  }

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
  }

  function frame(now) {
    raf = 0;
    const ms = last ? Math.min(100, now - last) : 16;
    last = now;
    clock += ms;
    const n = rings();
    if (grow() > 0 && n > 1) phase = mod(phase + grow() * 0.00009 * ms, n / (n - 1));
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

  // the cursor pulls the core; press and drag moves the eye of the target
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
