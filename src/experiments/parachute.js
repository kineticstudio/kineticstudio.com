/* Parachute.

   Ported from an interaction study: an arc of nodes hangs over a puck like
   the canopy of a parachute, each node tied to it by a dashed line whose
   dashes stream down toward it. As the puck comes near, the nodes are drawn
   off the arc toward it, and close enough they break free altogether. Then it
   launches: the nodes run down their lines into the puck, the arc fades, and
   the puck floods the whole piece with its colour, holds, and draws back in,
   letting the canopy out again.

   Untouched, the puck drifts under the canopy on its own and launches every
   so often; the cursor takes it over, and a click on it launches it. The
   study's puck was a labelled button opening a form; the label, the button
   shape and the form are not part of it, and the page never names the client. */

export const params = {
  canopy: {
    nodes: [19, 5, 41, 1],
    sweep: [0.55, 0.2, 0.95, 0.01],
    pull: [0.55, 0, 1, 0.01],
    reach: [360, 120, 640, 1],
  },
  motion: {
    flow: [1, 0, 4, 0.01],
    wander: [1, 0, 2, 0.01],
  },
  colour: {
    ground: "#1f211e",
    nodes: "#5a9d7c",
    puck: "#cfd3bd",
    lines: "#d8d6c4",
  },
  launch: { type: "action", label: "Launch" },
};

const NODE_R = 4.5;
const RELEASE = 140;
const COLLAPSE = 650, EXPAND = 600, HOLD = 520, REFORM = 900;
// untouched, it launches about this often (ms)
const AUTO_EVERY = 6800;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t) => t * t * t;
const rgba = (h, a) => {
  const s = String(h).replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(f, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function mount(host, values, ctx = {}) {
  const reduced = Boolean(ctx.reducedMotion);
  let v = { ...values };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 1, H = 1, dpr = 1, k = 1;
  let arc = null;
  let nodes = [];

  // The canopy: a wide circle's top, as the study drew it, narrowed in
  // portrait so its ends stay in the piece.
  function layout() {
    const sweep = Math.PI * v["canopy.sweep"];
    const half = sweep / 2;
    const radius = Math.min(Math.min(W, H) * 0.95, (W * 0.47) / Math.sin(half));
    const center = { x: W / 2, y: H * (W < H ? 0.3 : 0.18) + radius };
    arc = { center, radius, start: -Math.PI / 2 - half, end: -Math.PI / 2 + half };
    const n = Math.round(v["canopy.nodes"]);
    const old = nodes;
    nodes = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = arc.start + t * (arc.end - arc.start);
      const hx = center.x + Math.cos(a) * radius, hy = center.y + Math.sin(a) * radius;
      const o = old[i];
      nodes.push({ homeX: hx, homeY: hy, x: o ? o.x : hx, y: o ? o.y : hy, sx: hx, sy: hy });
    }
  }

  /* ----- the puck ----- */
  const puck = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let pointer = null; // where the cursor holds it, when it does
  let wanderT = 0;
  const puckR = () => 26 * k;

  // its own path when nobody holds it: a pendulum under the canopy, low in
  // the middle and rising at each end of its swing to brush the arc, where
  // the nodes break free
  function wanderAt(t) {
    const amp = v["motion.wander"];
    const w = 0.55;
    return {
      x: W / 2 + W * 0.36 * amp * Math.sin(t * w) * (0.92 + 0.08 * Math.sin(t * 0.13)),
      y: W < H ? H * 0.6 + H * 0.1 * Math.min(1, amp) * Math.cos(t * w * 2) : H * 0.66 + H * 0.2 * Math.min(1, amp) * Math.cos(t * w * 2),
    };
  }

  /* ----- the launch ----- */
  // idle | collapsing | expanding | holding | contracting | returning
  let state = "idle";
  let stateT = 0;
  let anchor = { x: 0, y: 0 };
  // the first launch comes sooner, so it shows in the first seconds
  let sinceLaunch = AUTO_EVERY - 2900;

  function launch() {
    if (state !== "idle") return;
    state = "collapsing";
    stateT = 0;
    anchor = { x: puck.x, y: puck.y };
    for (const n of nodes) {
      n.sx = n.x;
      n.sy = n.y;
    }
  }

  function advance(dt) {
    const ms = dt * 1000;
    if (state === "idle") {
      sinceLaunch += ms;
      if (!pointer) {
        wanderT += dt;
        const w = wanderAt(wanderT);
        target.x = w.x;
        target.y = w.y;
        if (sinceLaunch > AUTO_EVERY) launch();
      } else {
        target.x = pointer.x;
        target.y = pointer.y;
      }
      const e = 1 - Math.pow(1 - 0.18, dt * 60);
      puck.x += (target.x - puck.x) * e;
      puck.y += (target.y - puck.y) * e;
      // the magnetic pull: nodes drift off the arc as the puck comes near
      const reach = v["canopy.reach"] * k, maxPull = v["canopy.pull"], release = RELEASE * k;
      for (const n of nodes) {
        const dx = puck.x - n.homeX, dy = puck.y - n.homeY;
        const dist = Math.hypot(dx, dy);
        let pull = 0;
        if (dist < reach) {
          const q = 1 - dist / reach;
          pull = q * q * maxPull;
        }
        if (dist < release) pull = Math.max(pull, 0.85 + 0.15 * (1 - dist / release));
        n.x += (n.homeX + dx * pull - n.x) * e;
        n.y += (n.homeY + dy * pull - n.y) * e;
      }
      return;
    }
    stateT += ms;
    const dur = { collapsing: COLLAPSE, expanding: EXPAND, holding: HOLD, contracting: EXPAND, returning: REFORM }[state];
    if (stateT >= dur) {
      stateT = 0;
      const next = { collapsing: "expanding", expanding: "holding", holding: "contracting", contracting: "returning", returning: "idle" }[state];
      if (next === "idle") {
        // the canopy is out again: the nodes pick up where the return left them
        for (const n of nodes) {
          n.x = n.homeX;
          n.y = n.homeY;
        }
        sinceLaunch = 0;
      }
      state = next;
    }
  }

  /* ----- drawing ----- */
  let clock = 0;
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, W, H);

    let nodeT = 0, lineA = 1, arcA = 1, nodeA = 1;
    let r = puckR();
    const p = state === "idle" ? puck : anchor;
    const t = state === "idle" ? 0 : Math.min(1, stateT / ({ collapsing: COLLAPSE, expanding: EXPAND, holding: HOLD, contracting: EXPAND, returning: REFORM }[state]));
    const cover = Math.hypot(Math.max(p.x, W - p.x), Math.max(p.y, H - p.y)) + 4;
    let fromHome = false;
    if (state === "collapsing") {
      nodeT = easeIO(t);
      lineA = 1 - 0.4 * t;
      arcA = 1 - t;
      r *= 1 + 0.06 * Math.sin(t * Math.PI);
    } else if (state === "expanding") {
      const e = easeIO(t);
      nodeT = 1;
      nodeA = 1 - easeIn(t);
      lineA = arcA = 0;
      r = r + (cover - r) * e;
    } else if (state === "holding") {
      nodeA = lineA = arcA = 0;
      r = cover;
    } else if (state === "contracting") {
      const e = easeIO(t);
      nodeT = 1;
      nodeA = easeIn(t);
      lineA = arcA = 0;
      r = cover + (r - cover) * e;
    } else if (state === "returning") {
      // the canopy lets out again: the nodes run back up their lines to the arc
      fromHome = true;
      nodeT = 1 - easeIO(t);
      lineA = 0.6 + 0.4 * t;
      arcA = t;
    }

    const at = (n) => {
      const fx = fromHome ? n.homeX : state === "idle" ? n.x : n.sx;
      const fy = fromHome ? n.homeY : state === "idle" ? n.y : n.sy;
      return [fx + (p.x - fx) * nodeT, fy + (p.y - fy) * nodeT];
    };

    // dashed lines from the puck to every node, the dashes streaming toward it
    if (lineA > 0) {
      g.strokeStyle = rgba(v["colour.lines"], 0.45 * lineA);
      g.lineWidth = 1;
      g.setLineDash([3, 5]);
      g.lineDashOffset = clock * 20 * v["motion.flow"];
      g.beginPath();
      for (const n of nodes) {
        const [x, y] = at(n);
        g.moveTo(p.x, p.y);
        g.lineTo(x, y);
      }
      g.stroke();
      g.setLineDash([]);
    }
    if (arcA > 0) {
      g.strokeStyle = rgba(v["colour.lines"], 0.55 * arcA);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(arc.center.x, arc.center.y, arc.radius, arc.start, arc.end);
      g.stroke();
    }
    if (nodeA > 0) {
      g.globalAlpha = nodeA;
      g.fillStyle = v["colour.nodes"];
      g.beginPath();
      for (const n of nodes) {
        const [x, y] = at(n);
        g.moveTo(x + NODE_R, y);
        g.arc(x, y, NODE_R, 0, Math.PI * 2);
      }
      g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = v["colour.puck"];
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fill();
  }

  /* ----- loop ----- */
  let raf = 0, last = 0;
  let visible = !document.hidden, onscreen = true;
  const live = () => !reduced && visible && onscreen;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    advance(dt);
    draw();
  }
  function sync() {
    if (live()) {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function settleStill() {
    // the study's opening frame: the puck below the canopy's middle
    puck.x = W / 2;
    puck.y = H * (W < H ? 0.7 : 0.82);
    for (const n of nodes) {
      n.x = n.homeX;
      n.y = n.homeY;
    }
    for (let i = 0; i < 90; i++) {
      state = "idle";
      const save = pointer;
      pointer = { x: puck.x, y: puck.y };
      advance(1 / 60);
      pointer = save;
    }
  }

  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    const first = W === 1 && H === 1;
    const sx = w / W, sy = h / H;
    W = w;
    H = h;
    k = clamp(Math.min(W, H) / 900, 0.6, 1.25);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    layout();
    if (first) {
      // it opens already drifting, a little way into its path
      wanderT = 0.5;
      const w0 = wanderAt(wanderT);
      puck.x = w0.x;
      puck.y = w0.y;
      if (reduced) settleStill();
    } else {
      puck.x *= sx;
      puck.y *= sy;
      anchor.x *= sx;
      anchor.y *= sy;
      if (reduced) settleStill();
    }
    draw();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver((entries) => {
    onscreen = entries[entries.length - 1].isIntersecting;
    sync();
  });
  io.observe(host);
  const onVisibility = () => {
    visible = !document.hidden;
    sync();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const local = (e) => {
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMove = (e) => {
    if (e.pointerType === "mouse" || e.buttons) pointer = local(e);
    canvas.style.cursor = state === "idle" && Math.hypot(local(e).x - puck.x, local(e).y - puck.y) < puckR() * 1.3 ? "pointer" : "default";
  };
  const onDown = (e) => {
    const q = local(e);
    if (state === "idle" && Math.hypot(q.x - puck.x, q.y - puck.y) < puckR() * 1.6) launch();
    else pointer = q;
  };
  const onLeave = () => {
    pointer = null;
    // pick the path up from wherever the cursor left the puck
    canvas.style.cursor = "default";
  };
  const onUp = (e) => {
    if (e.pointerType !== "mouse") pointer = null;
  };
  if (!reduced) {
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointercancel", onLeave);
  }

  resize();
  sync();

  return {
    update(next, path) {
      v = { ...next };
      if (path == null || path.startsWith("canopy.nodes") || path.startsWith("canopy.sweep")) layout();
      if (reduced) {
        settleStill();
        draw();
      }
    },
    action(name) {
      if (name === "launch") {
        if (reduced) return;
        launch();
      }
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      canvas.remove();
    },
  };
}
