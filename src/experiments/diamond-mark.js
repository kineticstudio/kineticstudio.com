/* Diamond mark.

   Ported from a mark builder in the AI Fun folder: a form made of nothing
   but horizontal bars in two half columns, each bar cut where it meets a
   diagonal mask, angled to follow the edge or straight across, the bars
   thicker toward the top or the bottom on a height gradient that can run
   the other way on the right. The builder drew a client's letter with it;
   this keeps the technique and lets it draw a plain diamond instead (or a
   hexagon, or a circle), and sets it moving: the two halves step past each
   other half a bar at a time, the left down and the right up, so the form
   breaks into a comb and locks back together, while the height gradient
   swings slowly between them. Drag up or down to push the bars through by
   hand; let go and they settle back into register.

   Its look: cream bars on warm charcoal. */

export const params = {
  bars: {
    rows: [11, 3, 24, 1],
    weight: [0.5, 0.12, 0.92, 0.01],
    cut: { type: "select", options: ["Angled", "Straight"] },
  },
  mask: {
    form: { type: "select", options: ["Diamond", "Hexagon", "Circle"] },
    angle: [0.8, 0.35, 1.6, 0.01],
    gap: [16, 0, 140, 1],
  },
  motion: {
    speed: [1, 0, 3, 0.05],
    swell: [1.1, 0, 1.9, 0.01],
  },
  colour: {
    ground: "#2b2b27",
    mark: "#f3ecd8",
  },
};

const HH = 400; // the form's half height, in the builder's 1000-unit square
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 1, H = 1, dpr = 1, raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  let clock = 0, steps = 0, stepAt = 0.35; // steps taken, and where in the current one we are
  let extra = 0, drag = null; // a hand push, in steps

  /* The mask: how far a bar may reach from the axis at height y, and the
     heights where its edge turns a corner (an angled cut bends there too). */
  function reach(y) {
    const s = v["mask.angle"], a = Math.abs(y);
    if (a >= HH) return 0;
    if (v["mask.form"] === "Circle") return s * HH * Math.sqrt(1 - (a / HH) ** 2);
    const tip = s * (HH - a);
    return v["mask.form"] === "Hexagon" ? Math.min(s * HH * 0.58, tip) : tip;
  }
  function bends(y1, y2) {
    const out = [];
    const add = (y) => y > y1 && y < y2 && out.push(y);
    if (v["mask.form"] === "Circle") {
      for (let i = 1; i < 8; i++) add(y1 + ((y2 - y1) * i) / 8);
    } else if (v["mask.form"] === "Hexagon") {
      const c = HH * 0.42;
      add(-c);
      add(c);
    } else add(0);
    add(-HH);
    add(HH);
    return out.sort((a, b) => a - b);
  }

  // one bar of a half: side -1 reaches left from the axis, +1 right
  function bar(side, yc, th, k, cx, cy) {
    const y1 = yc - th / 2, y2 = yc + th / 2;
    if (y2 <= -HH || y1 >= HH) return;
    const inner = cx + side * (v["mask.gap"] / 2) * k;
    const X = (x) => inner + side * x * k;
    const Y = (y) => cy + y * k;
    if (v["bars.cut"] === "Straight") {
      const r = reach(yc);
      if (r * k < 0.4) return;
      g.rect(Math.min(inner, X(r)), Y(y1), r * k, th * k);
      return;
    }
    // angled: the outer edge follows the mask from the bar's top to its bottom
    const ys = [y1, ...bends(y1, y2), y2];
    if (Math.max(...ys.map(reach)) * k < 0.4) return;
    g.moveTo(inner, Y(y1));
    for (const y of ys) g.lineTo(X(reach(y)), Y(y));
    g.lineTo(inner, Y(y2));
    g.closePath();
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, W, H);

    const n = Math.round(v["bars.rows"]);
    const pitch = (2 * HH) / n;
    // the widest the form gets, so it fits whatever the dials do
    let widest = 0;
    for (let i = 0; i <= 40; i++) widest = Math.max(widest, reach(-HH + (2 * HH * i) / 40));
    const k = Math.min((W * 0.74) / (2 * widest + v["mask.gap"]), (H * 0.74) / (2 * HH));
    const cx = W / 2, cy = H / 2;

    // where the halves are: each step moves the left half down and the right half up by half a bar
    const u = steps + (reduced ? 0 : easeIO(clamp(stepAt, 0, 1))) + extra;
    const shift = (((u * 0.5) % 1) + 1) % 1; // in pitches
    // the height gradient swings between the halves, the right running opposite (held part way, when still)
    const swing = v["motion.swell"] * (reduced ? 0.5 : Math.sin(clock * 0.9));

    g.fillStyle = v["colour.mark"];
    g.beginPath();
    for (const side of [-1, 1]) {
      const off = (side < 0 ? shift : -shift) * pitch;
      const grad = side < 0 ? swing : -swing;
      for (let i = -1; i <= n; i++) {
        const yc = -HH + (i + 0.5) * pitch + off;
        const t = clamp((yc + HH) / (2 * HH), 0, 1);
        const th = pitch * v["bars.weight"] * Math.max(0.05, 1 + grad * (0.5 - t));
        bar(side, yc, Math.min(th, pitch * 0.98), k, cx, cy);
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
    const sp = v["motion.speed"];
    clock += dt * Math.max(0.15, sp);
    // a step: one second of travel, then a rest in register; faster at a higher speed
    stepAt += (dt * sp) / 1.0;
    if (stepAt >= 1 + 1.1) {
      steps += 1;
      stepAt = 0;
    }
    // let go, a push settles to the nearest register
    if (!drag) extra += (Math.round(extra) - extra) * Math.min(1, dt * 5);
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

  // drag up or down: the halves follow the hand, a bar's travel per bar of drag
  const onDown = (e) => {
    drag = { y: e.clientY, from: extra };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!drag) return;
    const n = Math.round(v["bars.rows"]);
    const barPx = Math.max(8, (H * 0.74) / n);
    extra = drag.from + ((e.clientY - drag.y) / barPx) * 2;
    if (!raf) draw();
  };
  const onUp = () => {
    canvas.style.cursor = "grab";
    drag = null;
    if (reduced) {
      extra = Math.round(extra);
      draw();
    }
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

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
    update(values) {
      Object.assign(v, values);
      if (!raf) draw();
    },
    action() {},
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.remove();
    },
  };
}
