/* Bloom hero.

   A dome of nested ovals rises from the bottom edge like a sun on the
   horizon: each oval a step of a five-stop gradient mixed in OKLab (night
   blue, electric blue, magenta, orange, a cream core), born at the apex and
   spreading outward, its core drifting toward the visible rim and leaning a
   little toward the cursor. Every few seconds the whole dome lifts off the
   fold and flies up into the middle, landing as one nested pill of light,
   then sinks back. It is one object the whole way: every ring is the same
   squashed stadium, so the flight is just numbers (its centre, its radius,
   its flat width, its squash), each ring keeping its colour as it goes. Hover
   the middle to hold it up; leave and it settles.

   Ported from a Creative Studio landing-page design (round one, the hero with
   the bloom), at the owner's dialled dome and its first ground, the night
   sunset. Only the dome and its lift-off are kept: in the design the pill of
   light landed behind a call-to-action button under a headline; here there is
   no page, no copy and no button, and the lift-off runs by itself as well as
   on hover. The page never names the client. */

export const params = {
  dome: {
    rings: [24, 5, 48, 1],
    spread: [0.6, 0.2, 1.4, 0.01],
    // how high the dome stands: at the default its centre sits below the frame, so only the cap shows
    height: [0.86, 0.4, 1.4, 0.01],
    speed: [0.55, 0, 1.5, 0.01],
  },
  rise: {
    auto: { type: "toggle", labels: ["On hover", "By itself"], default: true },
    flight: [450, 100, 1500, 10],
    halo: [150, 40, 300, 2],
  },
  colour: {
    ground: "#040120",
    middle: "#ce3da2",
    core: "#ffe9c9",
  },
};

// the dialled dome's other values (hero-with-bloom.html, the orb)
const DOME = { curve: 1.25, core: 0.06, squash: 0.62, driftX: 0, driftY: -0.5, hue: -8, chroma: 1.48, fade: 1.03, grain: 0.04, follow: 0.15, overshoot: 0.81, response: 1, depth: 1.4, cx: 0.5 };
// the night sunset's other stops, either side of the middle
const NIGHT = ["#246ce0", "#fd8502"];
// where the pill of light lands, and its size: the design's button, in css px at a 700 px stage
const PILL = { y: 0.46, w: 132, h: 47 };
// the lift-off by itself: up after a beat, held, then down for a while
const CYCLE = { first: 2.4, hold: 2.6, rest: 2.8 };

/* ---- colour math (OKLab / OKLCH), the design's own ---- */
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
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 1, H = 1, dpr = 1, raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  let phase = 0, mouse = null, offsets = [], labs = [];
  // the flight: p eases toward 1 while it is wanted, m is p smoothed once more
  const rise = { p: 0, m: 0 };
  let clock = 0, nextFlip = CYCLE.first, autoUp = false, hoverUp = false, tapUp = false;

  const rings = () => Math.round(v["dome.rings"]);
  const grow = () => (still ? 0 : v["dome.speed"]);
  const relab = () => (labs = [v["colour.ground"], NIGHT[0], v["colour.middle"], NIGHT[1], v["colour.core"]].map((h) => rgbToOklab(hexToRgb(h))));
  const colourAt = (t) => sampleGradient(labs, t, DOME.hue, DOME.chroma);
  // the pill keeps the design's proportions to the stage
  const scale = () => Math.max(0.62, Math.min(1.6, Math.min(W, H) / 700));
  const pill = () => {
    const s = scale();
    return { x: W / 2, y: H * PILL.y, w: PILL.w * s, h: PILL.h * s, halo: v["rise.halo"] * s };
  };

  function ringU(i) {
    const n = rings();
    if (n === 1) return 0;
    return mod(i / (n - 1) - phase, n / (n - 1));
  }

  // every ring is one shape, a squashed stadium: at the fold it is the dome's ellipse,
  // at the top the pill's halo, and the flight between is numbers, never a swap
  function computeRings() {
    const out = [], n = rings(), m = rise.m, b = pill(), cy = 2 - v["dome.height"];
    const maxR = Math.max(W, H) * 0.62 * v["dome.spread"];
    const flat = Math.max(0, b.w - b.h);
    for (let i = 0; i < n; i++) {
      const u = ringU(i), uc = Math.min(u, 1);
      const r = Math.max(0, maxR * (1 - (1 - DOME.core) * Math.pow(u, DOME.curve)));
      let ox = DOME.driftX * maxR * uc + (offsets[i]?.x ?? 0);
      let oy = DOME.driftY * maxR * uc + (offsets[i]?.y ?? 0);
      const limit = maxR - r + DOME.overshoot * maxR;
      let oyT = oy / DOME.squash;
      const d = Math.hypot(ox, oyT);
      if (d > limit) (ox *= limit / d), (oyT *= limit / d);
      oy = oyT * DOME.squash;
      // drift and the cursor's lean belong to the resting dome; they let go in the air
      ox *= 1 - m;
      oy *= 1 - m;
      const rn = maxR > 0 ? r / maxR : 0;
      out.push({
        x: DOME.cx * W + ox + (b.x - DOME.cx * W - ox) * m,
        y: cy * H + oy + (b.y - cy * H - oy) * m,
        R: r + (b.h / 2 + rn * b.halo - r) * m,
        F: flat * m,
        sq: DOME.squash + (1 - DOME.squash) * m,
        fill: colourAt(Math.pow(uc, DOME.fade)),
      });
    }
    return out.sort((a, c) => c.R - a.R);
  }

  // the inner rings answer first and commit; the outer ones barely stir
  function stepFollow(k) {
    const n = rings();
    if (offsets.length !== n) offsets = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
    const bx = DOME.cx * W, by = (2 - v["dome.height"]) * H;
    for (let i = 0; i < n; i++) {
      const u = Math.min(ringU(i), 1);
      let tx = 0, ty = 0;
      if (mouse) {
        const pull = DOME.follow * Math.pow(u, DOME.depth);
        tx = (mouse.x - bx) * pull;
        ty = (mouse.y - by) * pull;
      }
      const ease = 1 - Math.pow(1 - Math.min(0.5, (0.045 + 0.1 * u) * DOME.response), k);
      offsets[i].x += (tx - offsets[i].x) * ease;
      offsets[i].y += (ty - offsets[i].y) * ease;
    }
  }

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
      g.save();
      g.translate(ring.x, ring.y);
      g.scale(1, ring.sq);
      g.beginPath();
      g.roundRect(-ring.F / 2 - ring.R, -ring.R, ring.F + 2 * ring.R, 2 * ring.R, ring.R);
      g.fill();
      g.restore();
    }
    g.save();
    g.globalAlpha = DOME.grain;
    g.globalCompositeOperation = "overlay";
    g.fillStyle = grain;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  const wanted = () => (hoverUp || tapUp || (v["rise.auto"] && !mouse && autoUp) ? 1 : 0);

  function frame(now) {
    raf = 0;
    const ms = last ? Math.min(100, now - last) : 16;
    last = now;
    clock += ms / 1000;
    const n = rings();
    if (grow() > 0 && n > 1) phase = mod(phase + grow() * 0.00009 * ms, n / (n - 1));
    // by itself: up, held, down, rested
    if (clock >= nextFlip) {
      autoUp = !autoUp;
      nextFlip = clock + (autoUp ? CYCLE.hold : CYCLE.rest);
    }
    const goal = wanted(), k = 1 - Math.exp((-3 * ms) / Math.max(80, v["rise.flight"]));
    rise.p += (goal - rise.p) * k;
    if (rise.p < 0.001 && !goal) rise.p = 0;
    rise.m = rise.p * rise.p * (3 - 2 * rise.p);
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

  // hovering where the pill lands holds it up, as hovering the button did; a tap toggles it
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const overPill = (p) => {
    const b = pill(), rx = b.w / 2 + b.halo * 0.6, ry = b.h / 2 + b.halo * 0.6;
    return ((p.x - b.x) / rx) ** 2 + ((p.y - b.y) / ry) ** 2 <= 1;
  };
  const onMove = (e) => {
    mouse = local(e);
    hoverUp = e.pointerType === "mouse" && overPill(mouse);
    canvas.style.cursor = hoverUp ? "pointer" : "";
  };
  // on a touch screen a tap lifts it or lands it
  const onDown = (e) => {
    if (still || e.button !== 0 || e.pointerType === "mouse") return;
    tapUp = !tapUp;
  };
  const onClick = () => {
    if (!still) return;
    // reduced motion: a click or tap lifts it or lands it in one step
    tapUp = !tapUp;
    rise.p = rise.m = tapUp ? 1 : 0;
    draw();
  };
  const onLeave = (e) => {
    mouse = null;
    hoverUp = false;
    if (e.pointerType === "mouse") tapUp = false;
    // the cycle picks up from the ground
    autoUp = false;
    nextFlip = clock + 1.4;
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("click", onClick);
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
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.remove();
    },
  };
}
