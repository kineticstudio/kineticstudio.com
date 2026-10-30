/* Dot cube.

   Ported from a studio tool in the Creative Studio (03-Spinning-Cube): a
   cube drawn as nothing but circles. Points sit on an n x n x n lattice in
   a cube of side 2, and one test decides which are kept, by counting how
   many of a point's coordinates lie on a face: two or more is an edge, one
   or more is the surface, any is the solid lattice, so each form is a
   subset of the next. It turns on a clean turntable, one axis, upright, so
   it reads as a solid object turning rather than something tumbling
   through space, the pose accumulating so a new speed carries on from
   where it is. Depth is size alone: every dot is the mark's own colour at
   full strength, nearer dots a little larger, and the solid reads through
   the gaps. Drag to turn it; let go and it keeps turning from there.

   Its look: white dots on near black. The tilt, a view from a little above
   so the top face shows, is new here. */

export const params = {
  spin: {
    speed: [0.25, 0, 3, 0.05],
    tilt: [16, -60, 60, 1],
  },
  cube: {
    form: { type: "select", options: ["Lattice", "Surface", "Edges"] },
    density: [11, 2, 18, 1],
    size: [0.85, 0.2, 1, 0.01],
    lens: [8.6, 2.2, 12, 0.1],
  },
  dots: {
    size: [0.11, 0.05, 1, 0.01],
    depth: [0.52, 0, 1.6, 0.01],
  },
  colour: {
    ground: "#0b0b0c",
    dots: "#ffffff",
  },
};

const TAU = Math.PI * 2;
const TURNS_Y = 0.07; // the tool's turntable, in turns per second, before the speed dial

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 1, H = 1, dpr = 1, raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  // the live pose, in radians; it opens a little turned, so it reads as a cube from the first frame
  const pose = { ax: 0, ay: 0.62 };

  /* The lattice, rebuilt only when the form or the density changes. */
  let points = new Float32Array(0), count = 0, pitch = 1, built = "";
  function build() {
    const n = Math.max(2, Math.round(v["cube.density"]));
    const form = v["cube.form"];
    if (built === `${n}|${form}`) return;
    built = `${n}|${form}`;
    pitch = 2 / (n - 1);
    const at = (i) => (i / (n - 1)) * 2 - 1;
    const out = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        for (let k = 0; k < n; k++) {
          // how many coordinates are pinned to a face
          const onFace = (i === 0 || i === n - 1) + (j === 0 || j === n - 1) + (k === 0 || k === n - 1);
          if (form === "Edges" && onFace < 2) continue;
          if (form === "Surface" && onFace < 1) continue;
          out.push(at(i), at(j), at(k));
        }
    points = new Float32Array(out);
    count = out.length / 3;
  }

  function draw() {
    build();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const scale = Math.min(W, H) * 0.5 * v["cube.size"];
    const cam = v["cube.lens"];
    const depth = v["dots.depth"];
    // the dot is a share of the gap to its neighbour, so any density stays a field of dots
    const base = v["dots.size"] * pitch * scale * 0.5;
    const sx = Math.sin(pose.ax), cxs = Math.cos(pose.ax);
    const sy = Math.sin(pose.ay), cys = Math.cos(pose.ay);
    const tilt = (v["spin.tilt"] * Math.PI) / 180, st = Math.sin(tilt), ct = Math.cos(tilt);
    // one colour at full strength, no fading, so the circles go down as one shape
    g.fillStyle = v["colour.dots"];
    g.beginPath();
    for (let p = 0; p < count; p++) {
      let x = points[p * 3], y = points[p * 3 + 1], z = points[p * 3 + 2];
      // the pose: the drag's pitch, then the turntable
      [y, z] = [y * cxs - z * sx, y * sx + z * cxs];
      [x, z] = [x * cys + z * sy, -x * sy + z * cys];
      // the view from a little above
      [y, z] = [y * ct - z * st, y * st + z * ct];
      const zc = z + cam;
      if (zc <= 0.05) continue;
      const lens = (cam * 0.5) / zc;
      const r = base * (1 + (lens - 1) * depth);
      if (r <= 0.15) continue;
      const px = cx + x * scale * lens, py = cy + y * scale * lens;
      g.moveTo(px + r, py);
      g.arc(px, py, r, 0, TAU);
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
    // turns per second: the pose accumulates, so a new speed carries on from here
    if (!drag) pose.ay += TURNS_Y * v["spin.speed"] * TAU * dt;
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

  // drag to turn it: the drag adds to the angles the spin is already advancing
  let drag = null;
  const onDown = (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!drag) return;
    pose.ay += (e.clientX - drag.x) * 0.008;
    pose.ax += (e.clientY - drag.y) * 0.008;
    drag = { x: e.clientX, y: e.clientY };
    if (!raf) draw();
  };
  const onUp = () => {
    drag = null;
    canvas.style.cursor = "grab";
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
