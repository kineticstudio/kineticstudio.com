/* Combo card.

   Ported from a client prototype in the Creative Studio (its combo card):
   two rounded trapezoid tiles, no two corners square with each other, laid
   high left and low right so they overlap in the middle, and where they
   overlap the region turns a second colour, the tile and overlap pair
   doing the work. The cursor parts and tilts them (one each way, so the
   overlap opens and closes on its own); left alone they drift the same way
   on two slow sines. The shuffle throws both out to the sides with an
   accelerating tilt, swaps to the next pair and springs them back in past
   the middle, ringing until they settle. Here it also shuffles on its own
   every few seconds.

   Left out: the person cutout that sat over the overlap (a photo the
   prototype never had), the Shuffle button and the swatch row, which are
   the panel's dials now. The page never names the client. */

export const params = {
  tiles: {
    size: [1, 0.5, 1.6, 0.01],
    corner: [30, 0, 90, 1],
    part: [1, 0, 2.5, 0.05],
  },
  motion: {
    drift: [1, 0, 2, 0.05],
    pace: [1, 0.2, 3, 0.05],
    every: [4.5, 0, 12, 0.5],
  },
  colour: {
    ground: "#0d0d0d",
    pair: { type: "select", options: ["Lemon and blue", "Blue and lemon", "Lilac and forest", "Forest and lilac", "Bone and red", "Cyan and black"] },
  },
  shuffle: { type: "action", label: "Shuffle" },
};

// the prototype's pairs: the tiles' colour, and the colour their overlap turns
const PAIRS = [
  { tile: "#f2e04a", overlap: "#2b4ce0" },
  { tile: "#2b4ce0", overlap: "#f2e04a" },
  { tile: "#f0b6f5", overlap: "#14543c" },
  { tile: "#14543c", overlap: "#f0b6f5" },
  { tile: "#eae4d5", overlap: "#ed2b24" },
  { tile: "#62d6f2", overlap: "#0d0d0d" },
];
const NAMES = params.colour.pair.options;

// the prototype's stage, in its viewBox units
const VIEW_W = 940, VIEW_H = 720;
const TILE_W = 520, TILE_H = 360;
const A = { x: 380, y: 300, r: -4 };
const B = { x: 560, y: 420, r: 3 };
const THROW = 1600;
const DEG = Math.PI / 180;

// A rounded trapezoid: four corners, none square with each other, rounded with quadratics.
function tilePath(w, h, r) {
  const pts = [
    [-w * 0.48, -h * 0.46],
    [w * 0.5, -h * 0.52],
    [w * 0.44, h * 0.5],
    [-w * 0.52, h * 0.44],
  ];
  const p = new Path2D();
  for (let i = 0; i < 4; i++) {
    const c = pts[i], prev = pts[(i + 3) % 4], next = pts[(i + 1) % 4];
    const into = toward(c, prev, r), out = toward(c, next, r);
    if (i) p.lineTo(into[0], into[1]);
    else p.moveTo(into[0], into[1]);
    p.quadraticCurveTo(c[0], c[1], out[0], out[1]);
  }
  p.closePath();
  return p;
}
function toward([x, y], [tx, ty], r) {
  const dx = tx - x, dy = ty - y, len = Math.hypot(dx, dy);
  // a corner can't round past half its shorter side
  const k = Math.min(r, len * 0.45) / len;
  return [x + dx * k, y + dy * k];
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.append(canvas);
  const g = canvas.getContext("2d");

  let W = 1, H = 1, dpr = 1, raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  let tile = tilePath(TILE_W, TILE_H, v["tiles.corner"]);
  let pairIndex = Math.max(0, NAMES.indexOf(v["colour.pair"]));
  let time = 0, sinceShuffle = 0;
  // the pose the cursor (or the drift) asks for, and the pose drawn, eased after it
  const pose = { x: 0, y: 0, tx: 0, ty: 0 };
  let pointer = null;
  // what the shuffle adds on top: the throw, the extra tilt
  const anim = { off: 0, tilt: 0 };
  // the shuffle as a clock: out for 340 ms, then a 900 ms spring back
  let shuffle = null;

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function drawTile(t, fill) {
    g.save();
    g.translate(t.x, t.y);
    g.rotate(t.r * DEG);
    g.fillStyle = fill;
    g.fill(tile);
    g.restore();
  }

  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = v["colour.ground"];
    g.fillRect(0, 0, canvas.width, canvas.height);
    // the prototype's stage at its own size (940 wide), shrunk to fit with a little air round the pair
    const k = Math.min(1, (W * 0.94) / 800, (H * 0.9) / VIEW_H) * v["tiles.size"];
    g.setTransform(dpr * k, 0, 0, dpr * k, dpr * (W / 2 - (VIEW_W / 2) * k), dpr * (H / 2 - (VIEW_H / 2) * k));
    const part = v["tiles.part"];
    const px = pose.x * part, py = pose.y * part;
    const ta = { x: A.x + px * 70 - anim.off, y: A.y + py * 50, r: A.r + px * 5 - anim.tilt };
    const tb = { x: B.x - px * 70 + anim.off, y: B.y - py * 50, r: B.r - px * 5 + anim.tilt };
    const pair = PAIRS[pairIndex];
    drawTile(ta, pair.tile);
    drawTile(tb, pair.tile);
    // tile B again, clipped to tile A: the intersection, in the second colour
    g.save();
    g.translate(ta.x, ta.y);
    g.rotate(ta.r * DEG);
    g.clip(tile);
    g.rotate(-ta.r * DEG);
    g.translate(tb.x - ta.x, tb.y - ta.y);
    g.rotate(tb.r * DEG);
    g.fillStyle = pair.overlap;
    g.fill(tile);
    g.restore();
  }

  function startShuffle(to) {
    if (shuffle) {
      // already on the way: just retarget the colour it lands on
      shuffle.to = to;
      return;
    }
    if (reduced) {
      pairIndex = to;
      draw();
      return;
    }
    shuffle = { t: 0, to, swapped: false };
    sinceShuffle = 0;
  }

  function stepShuffle(dt) {
    if (!shuffle) return;
    shuffle.t += dt;
    const t = shuffle.t;
    if (t < 0.34) {
      // out: accelerating, the tilt selling the throw
      const e = (t / 0.34) ** 2;
      anim.off = THROW * e;
      anim.tilt = 14 * e;
      return;
    }
    if (!shuffle.swapped) {
      pairIndex = shuffle.to;
      shuffle.swapped = true;
    }
    const u = Math.min(1, (t - 0.34) / 0.9);
    // in: a spring that overshoots the middle and settles
    const s = 1 - Math.exp(-5.2 * u) * Math.cos(8.5 * u);
    anim.off = THROW * (1 - s);
    anim.tilt = 14 * (1 - s);
    if (u >= 1) {
      anim.off = 0;
      anim.tilt = 0;
      shuffle = null;
      sinceShuffle = 0;
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.06, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt * v["motion.pace"];
    // left alone, the pair drifts the way the cursor would part it
    if (pointer) {
      pose.tx = pointer.x;
      pose.ty = pointer.y;
    } else {
      const d = v["motion.drift"];
      pose.tx = d * (0.3 * Math.sin(time * 0.52) + 0.12 * Math.sin(time * 0.83 + 1.3));
      pose.ty = d * (0.26 * Math.sin(time * 0.41 + 2.1) + 0.1 * Math.sin(time * 0.97 + 0.4));
    }
    const ease = 1 - Math.exp(-dt * (pointer ? 9 : 3));
    pose.x += (pose.tx - pose.x) * ease;
    pose.y += (pose.ty - pose.y) * ease;
    const every = v["motion.every"];
    if (every > 0 && !shuffle) {
      sinceShuffle += dt;
      if (sinceShuffle >= every) startShuffle((pairIndex + 1) % PAIRS.length);
    }
    stepShuffle(dt);
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
    pointer = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
  };
  const onLeave = () => (pointer = null);
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
    update(nv, path) {
      const prevPair = v["colour.pair"], prevCorner = v["tiles.corner"];
      Object.assign(v, nv);
      if (v["tiles.corner"] !== prevCorner) tile = tilePath(TILE_W, TILE_H, v["tiles.corner"]);
      if (v["colour.pair"] !== prevPair) {
        const to = Math.max(0, NAMES.indexOf(v["colour.pair"]));
        // a pair picked from the list arrives the way a shuffle does; a full reset just sets it
        if (path === "colour.pair") startShuffle(to);
        else pairIndex = to;
      }
      draw();
    },
    action(name) {
      if (name === "shuffle") startShuffle(((shuffle ? shuffle.to : pairIndex) + 1) % PAIRS.length);
    },
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
