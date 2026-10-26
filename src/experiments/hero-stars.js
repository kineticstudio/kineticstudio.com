/* Hero stars.

   From Owner (the hero of their Why Owner page): one four-pointed star,
   its sides drawn in toward the middle, repeated in rings that are born
   small at the centre, grow outward at a steady rate and fade as they
   go, so the field is always opening and never ends. A fine green line on
   cream, the stroke kept the same width at every size, as the page's
   non-scaling SVG stroke is. (The hero draws it at 0.6 px and 55%,
   behind its headline; alone on the stage it opens a touch firmer.) Left
   alone it opens from the middle of the stage; the pointer pulls the
   young inner rings toward it more than the old outer ones, so the rings
   bend into a tunnel. */

export const params = {
  form: {
    count: [24, 6, 48, 1],
    spacing: [0.215, 0.05, 0.6, 0.005],
    scale: [0.42, 0.1, 1, 0.01],
    rotate: [45, 0, 90, 1],
  },
  line: {
    width: [0.8, 0.2, 3, 0.05],
    opacity: [0.75, 0.05, 1, 0.05],
  },
  motion: {
    duration: [65.5, 10, 140, 0.5],
    direction: { type: "select", options: ["Outward", "Inward"] },
  },
  colour: {
    stroke: "#1f4d2c",
    ground: "#fbf8f5",
  },
};

// the page's star, in its own viewBox (-822 -822 1644 1644)
const STAR =
  "M0 821.462C10.286 821.462 19.294 814.562 21.968 804.622L84.269 573.232C148.478 334.762 334.762 148.479 573.232 84.269L804.622 21.968C814.562 19.294 821.462 10.287 821.462 0C821.462 -10.287 814.562 -19.294 804.622 -21.969L573.232 -84.270C334.762 -148.479 148.479 -334.758 84.270 -573.235L21.968 -804.625C19.294 -814.558 10.286 -821.461 0 -821.461C-10.287 -821.461 -19.295 -814.558 -21.969 -804.625L-84.270 -573.235C-148.479 -334.758 -334.758 -148.479 -573.235 -84.270L-804.625 -21.969C-814.558 -19.294 -821.461 -10.287 -821.461 0C-821.461 10.287 -814.558 19.294 -804.625 21.968L-573.235 84.269C-334.758 148.479 -148.479 334.762 -84.270 573.232L-21.969 804.622C-19.295 814.562 -10.287 821.462 0 821.462Z";
const HALF = 822;
// the hero's other settings, which stay put
const INNER = 0.08, FADE_IN = 0.41, FADE_OUT = 1;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.append(canvas);
  const g = canvas.getContext("2d");
  const star = new Path2D(STAR);

  let W = 1, H = 1, dpr = 1;
  // where in its cycle the field is (0..1); reduced motion holds a settled phase
  let phase = reduced ? 0.37 : 0;
  let raf = 0, last = 0;
  let onScreen = true, tabVisible = !document.hidden;
  const pull = { x: 0, y: 0, tx: 0, ty: 0 };

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, canvas.width, canvas.height);
    const count = Math.round(v["form.count"]);
    const range = count * v["form.spacing"];
    // the hero's stage: a square as wide as the long side of the screen, at the page's master scale
    const unit = (Math.max(W, H) * v["form.scale"]) / (2 * HALF);
    const rot = (v["form.rotate"] * Math.PI) / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const cx = W / 2, cy = H / 2;
    g.lineWidth = v["line.width"] * dpr;
    g.lineJoin = "round";
    g.strokeStyle = v["colour.stroke"];
    const base = v["line.opacity"];
    for (let i = 0; i < count; i++) {
      const p = (phase + i / count) % 1;
      const s = (INNER + range * p) * unit;
      const opIn = Math.min(1, p / FADE_IN), opOut = Math.min(1, (1 - p) / FADE_OUT);
      const a = Math.min(opIn, opOut) * base;
      if (a <= 0.003) continue;
      // young rings lean toward the pointer, old ones hardly at all
      const lean = (1 - p) ** 2;
      const x = cx + pull.x * lean, y = cy + pull.y * lean;
      // a stroke the same width at every size: the path is scaled, the pen is not
      const path = new Path2D();
      path.addPath(star, new DOMMatrix([s * cos * dpr, s * sin * dpr, -s * sin * dpr, s * cos * dpr, x * dpr, y * dpr]));
      g.globalAlpha = a;
      g.stroke(path);
    }
    g.globalAlpha = 1;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const dir = v["motion.direction"] === "Inward" ? -1 : 1;
    phase = (((phase + (dt / v["motion.duration"]) * dir) % 1) + 1) % 1;
    const k = 1 - Math.exp(-dt * 2.2);
    pull.x += (pull.tx - pull.x) * k;
    pull.y += (pull.ty - pull.y) * k;
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

  const onMove = (e) => {
    if (reduced) return;
    const r = host.getBoundingClientRect();
    pull.tx = (e.clientX - r.left - r.width / 2) * 0.6;
    pull.ty = (e.clientY - r.top - r.height / 2) * 0.6;
  };
  const onLeave = () => {
    pull.tx = 0;
    pull.ty = 0;
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);

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

  return {
    update(nv) {
      Object.assign(v, nv);
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
