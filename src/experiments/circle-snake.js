/* Circle snake.

   Ported from a client card in the Creative Studio (its "start the
   conversation" section): thirteen circles in three colours, multiplied
   into warm paper, that follow one another along a path. The head wanders
   on two slow sines and turns away from the walls; over the piece it
   chases the cursor (eased in and out over two seconds), and the rest ease
   after their places on its trail, the tail a touch slower. Where they
   overlap the colours mix, which is the point. The liquid glass lens that
   sat over this card in the Playground is not part of it.

   The page never names the client. */

export const params = {
  circles: {
    count: [13, 3, 30, 1],
    size: [177, 60, 320, 1],
    overlap: [0.6, 0, 0.9, 0.01],
  },
  motion: {
    pace: [0.42, 0.05, 1.5, 0.01],
    follow: [0.05, 0.01, 0.2, 0.005],
    stagger: [0.22, 0, 0.9, 0.01],
  },
  colour: {
    paper: "#f0e9dd",
    one: "#ffd46f",
    two: "#ffa0ff",
    three: "#2cc3e9",
    blend: { type: "select", options: ["Multiply", "Normal"] },
  },
  scatter: { type: "action", label: "Scatter" },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeIO3 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const STEP = 1 / 60;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 1, H = 1, dpr = 1, k = 1, raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  // the head and its trail (newest last), in css px; the circles, head first
  const head = { x: 0, y: 0, ang: 0.9 };
  let trail = [], dots = [];
  let time = 0, phase = 0;
  // the cursor: where it is, and how much the head is chasing it (eased over two seconds)
  let target = null, grab = 0, grabFrom = 0, grabGoal = 0, grabT = 99;

  const R = () => (v["circles.size"] * k) / 2;
  const speed = () => 160 * v["motion.pace"] * k;

  function turn(dt) {
    const sp = speed();
    let wander = 0.45 * Math.sin((time + phase) * 0.4) + 0.25 * Math.sin((time + phase) * 0.17 + 2);
    const cap = sp / (420 * k);
    wander = clamp(wander, -cap, cap);
    // near a wall it turns back toward the middle
    let wall = 0;
    const margin = Math.min(Math.max(340 * k, v["circles.size"] * k * 1.6), Math.min(W, H) * 0.45);
    const edge = Math.min(head.x, W - head.x, head.y, H - head.y);
    if (edge < margin) {
      let diff = Math.atan2(H / 2 - head.y, W / 2 - head.x) - head.ang;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const wcap = sp / (240 * k);
      wall = clamp(diff * Math.min(1, (margin - edge) / margin) * 2, -wcap, wcap);
    }
    head.ang += (wander + wall) * dt;
  }
  function step(dt) {
    time += dt;
    const r = R(), sp = speed();
    turn(dt);
    let vx = Math.cos(head.ang) * sp, vy = Math.sin(head.ang) * sp;
    if (grab > 0.001 && target) {
      const tx = clamp(target.x, r, W - r), ty = clamp(target.y, r, H - r);
      const cx = (tx - head.x) * v["motion.follow"] * 60, cy = (ty - head.y) * v["motion.follow"] * 60;
      vx += (cx - vx) * grab;
      vy += (cy - vy) * grab;
      if (grab > 0.05 && (vx || vy)) head.ang = Math.atan2(vy, vx);
    }
    head.x = clamp(head.x + vx * dt, r, W - r);
    head.y = clamp(head.y + vy * dt, r, H - r);
    const l = trail[trail.length - 1];
    if (!l || Math.hypot(head.x - l.x, head.y - l.y) > 1) trail.push({ x: head.x, y: head.y });
    // enough path for thirty circles at no overlap
    if (trail.length > 9000) trail.splice(0, trail.length - 8000);
  }
  // each circle's place: one spacing apart along the trail, back from the head
  function points() {
    const n = v["circles.count"];
    const spacing = Math.max(1, v["circles.size"] * k * (1 - v["circles.overlap"]));
    const end = trail[trail.length - 1] ?? head;
    const pts = [{ x: end.x, y: end.y }];
    let prev = pts[0], acc = 0;
    for (let i = trail.length - 2; i >= 0 && pts.length < n; i--) {
      const cur = trail[i];
      let dx = cur.x - prev.x, dy = cur.y - prev.y, seg = Math.hypot(dx, dy);
      while (seg > 0 && acc + seg >= spacing && pts.length < n) {
        const t = (spacing - acc) / seg;
        prev = { x: prev.x + dx * t, y: prev.y + dy * t };
        pts.push({ x: prev.x, y: prev.y });
        dx = cur.x - prev.x; dy = cur.y - prev.y; seg = Math.hypot(dx, dy); acc = 0;
      }
      acc += seg;
      prev = cur;
    }
    while (pts.length < n) pts.push({ ...pts[pts.length - 1] });
    return pts;
  }
  // the circles ease after their places, the tail a touch slower
  function followDots(dt) {
    const pts = points(), n = pts.length;
    while (dots.length < n) dots.push({ ...(dots[dots.length - 1] ?? pts[dots.length]) });
    dots.length = n;
    for (let i = 0; i < n; i++) {
      const kk = 1 - Math.pow(1 - 0.55 * (1 - (v["motion.stagger"] * i) / Math.max(1, n - 1)), dt * 60);
      dots[i].x += (pts[i].x - dots[i].x) * kk;
      dots[i].y += (pts[i].y - dots[i].y) * kk;
    }
  }
  // laid out whole, the head at (x, y): its trail walked backward from there (turning off the walls
  // the same way), long enough for the whole snake, then turned round, so it opens where it is put
  function seed(x = W * 0.56, y = H * 0.52, ang = -0.5) {
    Object.assign(head, { x, y, ang: ang + Math.PI });
    trail = [{ x, y }];
    const n = Math.ceil(((v["circles.count"] * v["circles.size"] * k * (1 - v["circles.overlap"]) * 1.6) / Math.max(1, speed())) * 60) + 30;
    for (let i = 0; i < n; i++) step(STEP);
    trail.reverse();
    Object.assign(head, { x, y, ang });
    dots = points().map((p) => ({ ...p }));
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = v["colour.paper"];
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = v["colour.blend"] === "Normal" ? "source-over" : "multiply";
    const cols = [v["colour.one"], v["colour.two"], v["colour.three"]];
    const r = R();
    // the tail first, so the head is on top where the blend is Normal
    for (let i = dots.length - 1; i >= 0; i--) {
      g.fillStyle = cols[i % 3];
      g.beginPath();
      g.arc(dots[i].x, dots[i].y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    grabT += dt;
    grab = grabFrom + (grabGoal - grabFrom) * easeIO3(grabT / 2);
    // fixed steps, so the path is the same at any frame rate
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(STEP, left);
      step(h);
      left -= h;
    }
    followDots(dt);
    draw();
    if (!reduced && onScreen && tabVisible) raf = requestAnimationFrame(frame);
  }
  // (re)start: the first frame after a pause takes no time
  function loop() {
    if (!raf && !reduced && onScreen && tabVisible) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // the card was 1280 x 720: sizes and speeds scale with the piece's area, and a circle is never
  // wider than 40% of the short side
  const scale = () => {
    k = clamp(Math.sqrt((W * H) / (1280 * 720)), 0.35, 2);
    k = Math.min(k, (Math.min(W, H) * 0.4) / Math.max(1, v["circles.size"]));
  };
  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    const sx = w / W, sy = h / H;
    W = w;
    H = h;
    scale();
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (!trail.length) seed();
    else {
      // the snake keeps its place, scaled with the piece
      for (const p of trail) (p.x *= sx), (p.y *= sy);
      for (const p of dots) (p.x *= sx), (p.y *= sy);
      head.x *= sx;
      head.y *= sy;
    }
    draw();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // the cursor: over the piece the head chases it, off it the head goes back to wandering
  const toLocal = (e) => {
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const want = (on) => {
    const goal = on ? 1 : 0;
    if (goal !== grabGoal) {
      grabGoal = goal;
      grabFrom = grab;
      grabT = 0;
    }
  };
  const onMove = (e) => {
    target = toLocal(e);
    if (e.pointerType === "mouse" || e.buttons) want(true);
  };
  const onDown = (e) => {
    target = toLocal(e);
    want(true);
  };
  const onUp = (e) => e.pointerType !== "mouse" && want(false);
  const onLeave = () => want(false);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", onLeave);
  host.addEventListener("pointerleave", onLeave);

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
  loop();

  return {
    update(values, path) {
      Object.assign(v, values);
      // a new count or overlap needs nothing: new circles come in from the tail as the trail allows
      if (path === null || path === "circles.size") scale();
      if (reduced) {
        followDots(1);
        draw();
      }
    },
    action(name) {
      if (name === "scatter") {
        phase = Math.random() * 100;
        seed(W * (0.25 + Math.random() * 0.5), H * (0.25 + Math.random() * 0.5), Math.random() * Math.PI * 2);
        draw();
      }
    },
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onLeave);
      host.removeEventListener("pointerleave", onLeave);
      canvas.remove();
    },
  };
}
