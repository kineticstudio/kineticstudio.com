/* Rise (Trace).

   Ported from the Creative Studio's Trace designs (clients/trace/designs/
   07-Rise.html, the dot-matrix take on its Emergence scene). A plane of
   faint dots seen from a low corner, fading and shrinking toward the near
   left. A line starts almost invisible there and climbs toward the far
   right, dot to dot, gaining weight and colour as it goes, lifting each dot
   it reaches off the plane on a bar: the few that were picked, and did
   well. As it passes, a scatter of the field's other dots rise on bars of
   their own, the ones that do well anyway, and some of them sink back. It
   draws itself in, holds, and runs again.

   Trace's look: pure black, white dots, a punch of its neon. Drag to turn
   the field; a click replays it. */

export const params = {
  motion: {
    speed: [0.15, 0.03, 0.8, 0.01],
    drift: [1, 0, 4, 0.05],
  },
  field: {
    density: [68, 16, 80, 1],
    rise: [0.04, 0, 0.3, 0.005],
  },
  line: {
    lift: [0.52, 0, 1.6, 0.01],
    wander: [0.35, 0, 1.2, 0.01],
  },
  camera: {
    yaw: [45, -180, 180, 1],
    pitch: [17, 2, 70, 1],
  },
  colour: {
    ground: "#000000",
    dots: "#ffffff",
    trace: "#cfff24",
  },
  replay: { type: "action", label: "Replay" },
  newPath: { type: "action", label: "New path" },
};

/* Everything else the prototype tuned, at Hunter's saved values. */
const S = {
  dotSize: 0.07, fade: 1, extent: 1, steps: 9, curve: 1.2, width: 3, distance: 3.4, fov: 3.15,
  gradFade: 0.6, gradSize: 0.89, gradCurve: 1.5,
  riseRadius: 0.4, riseHeight: 0.09, riseVariance: 0.5, riseSpeed: 0.12, fallSpeed: 0.2, riseHold: 0.18,
  riseLead: 0, riseStay: 0.55, riseCap: 1, riseSeed: 3, riseRamp: 0.75, riseRampCurve: 1.6,
  barRadius: 2.6, chosenTint: 1, chosenAlpha: 0.9, hold: 1.4,
};

// a seeded hash, so a seed gives the same field every time
const hash = (i, seed) => {
  let h = (i * 374761393 + seed * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);
const rgbOf = (hex) => {
  const h = String(hex).replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a, 0, 1).toFixed(3)})`;
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const BUCKETS = 40; // the plane's alphas, batched into this many fills

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 1, H = 1, dpr = 1, raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  let progress = reduced ? 1 : 0, hold = 0, clock = 0, seed = 7;
  let drag = null, dYaw = 0, dPitch = 0;

  /* ---- the geometry ---- */
  let plane = { n: 0, x: new Float32Array(0), z: new Float32Array(0), ga: new Float32Array(0), gs: new Float32Array(0) };
  let path = [];
  let risers = [];
  let built = "";
  function build() {
    const key = `${v["field.density"]}|${v["line.lift"]}|${v["line.wander"]}|${v["field.rise"]}|${seed}`;
    if (key === built) return;
    built = key;
    const n = Math.round(v["field.density"]), E = S.extent, N = n * n;
    const x = new Float32Array(N), z = new Float32Array(N), ga = new Float32Array(N), gs = new Float32Array(N);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const k = i * n + j;
        x[k] = -E + (2 * E * i) / (n - 1);
        z[k] = -E + (2 * E * j) / (n - 1);
        // the plane's own gradient, near left to far right: faint and small at the start
        const t = Math.pow(((x[k] + E) / (2 * E) + (z[k] + E) / (2 * E)) / 2, S.gradCurve);
        ga[k] = 1 - S.gradFade * (1 - t);
        gs[k] = 1 - S.gradSize * (1 - t);
      }
    plane = { n: N, x, z, ga, gs };
    // the path: origin at the near-left corner, destination at the far right, wandering
    // sideways on the way, each step snapped to a real dot so the line is dot to dot
    path = [];
    const used = new Set();
    for (let k = 0; k < S.steps; k++) {
      const t = k / (S.steps - 1);
      const wx = -E + 2 * E * t;
      const wz = -E + 2 * E * t + (hash(k, seed) - 0.5) * 2 * v["line.wander"] * E * Math.sin(Math.PI * t);
      let best = -1, bd = Infinity;
      for (let i = 0; i < N; i++) {
        if (used.has(i)) continue;
        const dd = (x[i] - wx) ** 2 + (z[i] - wz) ** 2;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      used.add(best);
      path.push({ x: x[best], z: z[best], y: v["line.lift"] * Math.pow(t, S.curve), t, dot: best });
    }
    // the risers: a share of the field, each with its own height and fate
    risers = [];
    for (let i = 0; i < N; i++) {
      if (used.has(i)) continue;
      const jt = ((x[i] + E) / (2 * E) + (z[i] + E) / (2 * E)) / 2;
      const share = v["field.rise"] * (1 - S.riseRamp * (1 - Math.pow(jt, S.riseRampCurve)));
      if (hash(i, S.riseSeed) > share) continue;
      risers.push({ x: x[i], z: z[i], jt, height: S.riseHeight * (1 - S.riseVariance * hash(i, S.riseSeed + 11)), stays: hash(i, S.riseSeed + 23) < S.riseStay });
    }
  }

  /* ---- the projection: turned, pitched, a long lens ---- */
  let cy = 1, sy = 0, cp = 1, sp = 0, unit = 1;
  function camera() {
    const sway = reduced ? 0 : Math.sin(clock * 0.21) * 7 * v["motion.drift"];
    const yaw = ((v["camera.yaw"] + dYaw + sway) * Math.PI) / 180;
    const pitch = (clamp(v["camera.pitch"] + dPitch + (reduced ? 0 : Math.sin(clock * 0.13 + 1) * 1.5 * v["motion.drift"]), 1, 80) * Math.PI) / 180;
    cy = Math.cos(yaw);
    sy = Math.sin(yaw);
    cp = Math.cos(pitch);
    sp = Math.sin(pitch);
    // a tall stage lets the field run off its sides rather than shrink to a stamp
    unit = Math.min(W * 0.62, H * 0.5);
  }
  const P = { sx: 0, sy: 0, k: 0, depth: 0 };
  function project(x, y, z, out = P) {
    const X = x * cy - z * sy, Z0 = x * sy + z * cy;
    const Y = y * cp + Z0 * sp;
    const Z = -y * sp + Z0 * cp + S.distance;
    const k = (S.fov / Z) * unit;
    out.sx = W / 2 + X * k;
    out.sy = H / 2 + 0.08 * unit - Y * k;
    out.k = k / unit;
    out.depth = Z;
    return out;
  }

  /* A bar from the plane up to height h: the side as a thick round-capped
     stroke between its projected ends, the top an ellipse squashed by the pitch. */
  const A = { ...P }, B = { ...P };
  function cylinder(x, z, h, radius, colour, alpha, cap) {
    if (h <= 0.002) return;
    project(x, 0, z, A);
    project(x, h, z, B);
    const rr = radius * A.k * S.distance;
    if (rr <= 0.2) return;
    g.lineCap = "round";
    g.lineWidth = rr * 2;
    g.strokeStyle = rgba(colour, alpha * 0.55);
    g.beginPath();
    g.moveTo(A.sx, A.sy);
    g.lineTo(B.sx, B.sy);
    g.stroke();
    g.beginPath();
    g.ellipse(B.sx, B.sy, rr, Math.max(0.6, rr * Math.abs(sp)), 0, 0, Math.PI * 2);
    g.fillStyle = rgba(colour, alpha * cap);
    g.fill();
  }

  const buckets = Array.from({ length: BUCKETS + 1 }, () => []);
  function draw() {
    build();
    camera();
    const ground = rgbOf(v["colour.ground"]), mark = rgbOf(v["colour.dots"]), trace = rgbOf(v["colour.trace"]);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = `rgb(${ground.join(",")})`;
    g.fillRect(0, 0, W, H);
    const p = progress;
    const base = S.dotSize * unit * 0.011;
    const stepLen = 1 / (S.steps - 1);

    // how lit each path dot is: it lifts and brightens over one step as the line arrives
    const lifted = path.map((pt) => {
      const lit = clamp((p - pt.t) / stepLen + 1, 0, 1);
      return { ...pt, y: pt.y * smooth(lit), lit };
    });

    // the plane: flat dots that never overlap, so batched by alpha rather than sorted
    for (const b of buckets) b.length = 0;
    const { n, x, z, ga, gs } = plane;
    for (let i = 0; i < n; i++) {
      project(x[i], 0, z[i]);
      const r = base * P.k * S.distance * gs[i];
      if (r <= 0.05) continue;
      buckets[Math.round(S.fade * ga[i] * BUCKETS)].push(P.sx, P.sy, r);
    }
    buckets.forEach((list, a) => {
      if (!list.length || !a) return;
      g.fillStyle = rgba(mark, a / BUCKETS);
      g.beginPath();
      for (let j = 0; j < list.length; j += 3) {
        g.moveTo(list[j] + list[j + 2], list[j + 1]);
        g.arc(list[j], list[j + 1], list[j + 2], 0, Math.PI * 2);
      }
      g.fill();
    });

    // the risers, rising when the line has passed and, for some, sinking back after a hold
    const up = [];
    for (const r of risers) {
      const since = p - r.jt - S.riseLead;
      if (since <= 0) continue;
      let f = clamp(since / Math.max(S.riseSpeed, 0.01), 0, 1);
      if (!r.stays) {
        const down = clamp((since - S.riseSpeed - S.riseHold) / Math.max(S.fallSpeed, 0.01), 0, 1);
        f *= 1 - smooth(down);
      }
      const h = r.height * smooth(f);
      if (h > 0.002) up.push({ x: r.x, z: r.z, h, depth: project(r.x, 0, r.z).depth });
    }
    up.sort((a, b) => b.depth - a.depth);
    for (const r of up) cylinder(r.x, r.z, r.h, base * S.riseRadius, mark, S.fade * 0.6, S.riseCap);

    // the chosen: each connected dot's bar, from the plane to the line
    const chosen = mixRgb(mark, trace, S.chosenTint);
    const bars = lifted.filter((pt) => pt.lit > 0 && pt.y > 0.002).map((pt) => ({ ...pt, depth: project(pt.x, 0, pt.z).depth }));
    bars.sort((a, b) => b.depth - a.depth);
    for (const pt of bars) cylinder(pt.x, pt.z, pt.y, base * S.barRadius, chosen, S.chosenAlpha * (0.5 + 0.5 * pt.lit), 1);

    // the line: dot to dot, gaining weight and colour as it climbs
    g.lineCap = "round";
    for (let k = 0; k < lifted.length - 1; k++) {
      const a = lifted[k], b = lifted[k + 1];
      if (p <= a.t) break;
      const f = clamp((p - a.t) / (b.t - a.t), 0, 1);
      project(a.x, a.y, a.z, A);
      project(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f, B);
      const strength = Math.pow(a.t + (b.t - a.t) * f * 0.5, 0.8);
      g.lineWidth = Math.max(0.6, S.width * (0.12 + 0.88 * strength) * B.k * S.distance);
      g.strokeStyle = rgba(trace, 0.12 + 0.88 * strength);
      g.beginPath();
      g.moveTo(A.sx, A.sy);
      g.lineTo(B.sx, B.sy);
      g.stroke();
    }

    // the reached dots, lifted, over the line: faint at the origin, unmistakable at the end
    const reached = lifted.filter((pt) => pt.lit > 0).map((pt) => ({ ...pt, ...project(pt.x, pt.y, pt.z, {}) }));
    reached.sort((a, b) => b.depth - a.depth);
    for (const pt of reached) {
      const grow = 1 + 1.6 * Math.pow(pt.t, 1.2) * pt.lit;
      g.beginPath();
      g.arc(pt.sx, pt.sy, base * pt.k * S.distance * grow, 0, Math.PI * 2);
      g.fillStyle = `rgb(${mixRgb(mark, trace, clamp(0.35 + pt.t, 0, 1)).join(",")})`;
      g.globalAlpha = S.fade + (1 - S.fade) * pt.lit * (0.45 + 0.55 * pt.t);
      g.fill();
      g.globalAlpha = 1;
    }
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
    clock += dt;
    if (drag?.moved !== true) {
      // let go, the turn eases back to the dials
      dYaw *= 1 - Math.min(1, dt * 0.8);
      dPitch *= 1 - Math.min(1, dt * 0.8);
    }
    if (progress >= 1) {
      hold += dt;
      if (hold > S.hold) {
        hold = 0;
        progress = 0;
      }
    } else progress = Math.min(1, progress + dt * v["motion.speed"]);
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

  function replay() {
    hold = 0;
    progress = reduced ? 1 : 0;
    draw();
  }

  const onDown = (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: dYaw, pitch: dPitch, moved: false };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    dYaw = drag.yaw + dx * 0.35;
    dPitch = clamp(drag.pitch + dy * 0.3, -v["camera.pitch"] + 2, 80 - v["camera.pitch"]);
    if (!raf) draw();
  };
  const onUp = () => {
    canvas.style.cursor = "grab";
    if (drag && !drag.moved) replay(); // a click, not a drag: run it again
    drag = null;
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
    action(name) {
      if (name === "replay") replay();
      if (name === "newPath") {
        seed = (seed % 60) + 1 + Math.floor(Math.random() * 7);
        replay();
      }
    },
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
