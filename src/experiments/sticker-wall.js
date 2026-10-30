/* Sticker wall.

   Ported from a sticker experiment in the Creative Studio. Each sticker goes
   down the way a real one does: it arrives curled back on itself, and a crease
   sweeps across it as it is pressed flat, the flap rolling down out of the
   air (a CSS 3D fold, its face shaded as it turns and its adhesive side dark
   behind), with a soft shadow cast under the curl and a tight rim shadow once
   it is down. Each lands at its own tilt, never past upright.

   Untouched, stickers keep arriving across the wall, and once it is full the
   oldest peel back off the way they came; a click sticks one where you put
   it. The experiment's sticker was a cap brand's; these are plain foil seals,
   bursts, capsules and flowers drawn by the piece, with no marks or words,
   and the landing page, tooltip and button around it are not part of it. */

export const params = {
  sticker: {
    kind: { type: "select", options: ["Mixed", "Seal", "Burst", "Capsule", "Flower"] },
    size: [245, 90, 420, 1],
    tilt: [45, 0, 90, 1],
  },
  peel: {
    duration: [500, 150, 2000, 10],
    curl: [120, 20, 180, 1],
  },
  wall: {
    every: [0.9, 0.2, 4, 0.05],
    count: [16, 3, 48, 1],
  },
  colour: {
    ground: "#111111",
    foil: "#d6b25e",
    ink: "#2a1c12",
  },
  peelAll: { type: "action", label: "Peel all" },
};

const KINDS = ["Seal", "Burst", "Capsule", "Flower"];
const OVERSHOOT = 112;
const ART = 512;

/* ---------- the stickers' own art ---------- */

const rgbOf = (h) => {
  const s = String(h).replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(f, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixRgb = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// a seeded random, so a sticker kind always comes out the same
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starPath(g, cx, cy, r, points = 5, inner = 0.45, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}

// Gold foil: a raking gradient, crinkles, mottling and a soft highlight.
function foil(g, path, F, rand) {
  const light = mixRgb(F, [255, 250, 230], 0.42), dark = mixRgb(F, [40, 25, 5], 0.34);
  g.save();
  path();
  g.clip();
  const lg = g.createLinearGradient(0, 0, ART, ART);
  lg.addColorStop(0, css(light));
  lg.addColorStop(0.32, css(F));
  lg.addColorStop(0.52, css(mixRgb(light, F, 0.4)));
  lg.addColorStop(0.78, css(F));
  lg.addColorStop(1, css(dark));
  g.fillStyle = lg;
  g.fillRect(0, 0, ART, ART);
  for (let i = 0; i < 14; i++) {
    const x = rand() * ART, y = rand() * ART, r = 40 + rand() * 120;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, css(rand() < 0.5 ? dark : light, 0.18));
    rg.addColorStop(1, css(F, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, ART, ART);
  }
  g.lineWidth = 1;
  for (let i = 0; i < 1400; i++) {
    const x = rand() * ART, y = rand() * ART, a = rand() * Math.PI, l = 3 + rand() * 11;
    g.strokeStyle = rand() < 0.5 ? "rgba(255,255,240,0.13)" : css(dark, 0.16);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const hg = g.createRadialGradient(ART * 0.3, ART * 0.28, 0, ART * 0.3, ART * 0.28, ART * 0.55);
  hg.addColorStop(0, "rgba(255,255,245,0.32)");
  hg.addColorStop(1, "rgba(255,255,245,0)");
  g.fillStyle = hg;
  g.fillRect(0, 0, ART, ART);
  g.restore();
}

// The printed ink: flat, with a little wear.
function ink(g, path, K, rand, fillRule = "nonzero") {
  g.save();
  path();
  g.clip(fillRule);
  g.fillStyle = css(K);
  g.fillRect(0, 0, ART, ART);
  for (let i = 0; i < 10; i++) {
    const x = rand() * ART, y = rand() * ART, r = 30 + rand() * 90;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, "rgba(255,240,210,0.07)");
    rg.addColorStop(1, "rgba(255,240,210,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, ART, ART);
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,240,210,${0.03 + rand() * 0.05})`;
    g.fillRect(rand() * ART, rand() * ART, 1 + rand() * 2, 1 + rand());
  }
  g.restore();
}

function drawKind(kind, F, K) {
  const c = document.createElement("canvas");
  c.width = c.height = ART;
  const g = c.getContext("2d");
  const rand = rng(KINDS.indexOf(kind) * 977 + 13);
  const C = ART / 2, R = ART * 0.48;

  if (kind === "Seal") {
    const disc = (r) => () => { g.beginPath(); g.arc(C, C, r, 0, Math.PI * 2); };
    ink(g, disc(R), K, rand);
    foil(g, disc(R * 0.8), F, rand);
    // a ring of foil stars round the rim
    g.save();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      starPath(g, C + Math.cos(a) * R * 0.9, C + Math.sin(a) * R * 0.9, R * 0.045);
      g.fillStyle = css(F);
      g.fill();
    }
    g.restore();
    // the band across the middle, between double rules, three foil stars in it
    g.save();
    disc(R * 0.8)();
    g.clip();
    g.fillStyle = css(K);
    g.fillRect(0, C - R * 0.16, ART, R * 0.32);
    for (const y of [-0.24, -0.205, 0.205, 0.24]) g.fillRect(0, C + y * R - R * 0.012, ART, R * 0.024);
    g.restore();
    for (const dx of [-0.36, 0, 0.36]) {
      starPath(g, C + dx * R, C, R * 0.085);
      g.fillStyle = css(F);
      g.fill();
    }
    starPath(g, C, C - R * 0.5, R * 0.16);
    g.fillStyle = css(K);
    g.fill();
    g.beginPath();
    g.arc(C, C + R * 0.5, R * 0.11, 0, Math.PI * 2);
    g.lineWidth = R * 0.035;
    g.strokeStyle = css(K);
    g.stroke();
  } else if (kind === "Burst") {
    const burst = () => {
      g.beginPath();
      const n = 36;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2, rr = i % 2 ? R * 0.88 : R;
        const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    };
    foil(g, burst, F, rand);
    g.beginPath();
    g.arc(C, C, R * 0.7, 0, Math.PI * 2);
    g.lineWidth = R * 0.04;
    g.strokeStyle = css(K);
    g.stroke();
    ink(g, () => { g.beginPath(); g.arc(C, C, R * 0.58, 0, Math.PI * 2); }, K, rand);
    starPath(g, C, C + R * 0.02, R * 0.36);
    foil(g, () => starPath(g, C, C + R * 0.02, R * 0.36), F, rand);
  } else if (kind === "Capsule") {
    const w = ART * 0.94, h = ART * 0.5, x0 = C - w / 2, y0 = C - h / 2;
    const pill = (inset) => () => {
      g.beginPath();
      g.roundRect(x0 + inset, y0 + inset, w - inset * 2, h - inset * 2, (h - inset * 2) / 2);
    };
    foil(g, pill(0), F, rand);
    ink(g, pill(ART * 0.03), K, rand);
    g.beginPath();
    pill(ART * 0.06)();
    g.lineWidth = ART * 0.008;
    g.strokeStyle = css(F, 0.9);
    g.stroke();
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.arc(C + i * ART * 0.13, C, ART * (i === 0 ? 0.05 : 0.032), 0, Math.PI * 2);
      g.fillStyle = css(F);
      g.fill();
    }
  } else {
    // flower: six round petals and a printed heart
    const petals = () => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        g.moveTo(C + Math.cos(a) * R * 0.52 + R * 0.46, C + Math.sin(a) * R * 0.52);
        g.arc(C + Math.cos(a) * R * 0.52, C + Math.sin(a) * R * 0.52, R * 0.46, 0, Math.PI * 2);
      }
      g.moveTo(C + R * 0.6, C);
      g.arc(C, C, R * 0.6, 0, Math.PI * 2);
    };
    foil(g, petals, F, rand);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.moveTo(C + Math.cos(a) * R * 0.42, C + Math.sin(a) * R * 0.42);
      g.lineTo(C + Math.cos(a) * R * 0.86, C + Math.sin(a) * R * 0.86);
      g.lineWidth = R * 0.025;
      g.lineCap = "round";
      g.strokeStyle = css(K, 0.55);
      g.stroke();
    }
    ink(g, () => { g.beginPath(); g.arc(C, C, R * 0.34, 0, Math.PI * 2); }, K, rand);
    g.beginPath();
    g.arc(C, C, R * 0.24, 0, Math.PI * 2);
    g.lineWidth = R * 0.03;
    g.strokeStyle = css(F);
    g.stroke();
  }
  // as a blob URL, so every sticker and its masks share one decoded image
  const bin = atob(c.toDataURL("image/png").split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
}

/* ---------- the peel, as the experiment's stylesheet had it ---------- */

const STYLE = `
.ksw { position:absolute; inset:0; overflow:hidden; cursor:crosshair; user-select:none; -webkit-user-select:none; touch-action:pan-y; }
.ksw-s { --progress:0; --tilt:0deg; --curl:0deg; position:absolute; width:var(--ksw-size); height:var(--ksw-size);
  transform:translate(-50%,-50%) rotate(var(--tilt)); pointer-events:none; perspective:900px; transform-style:preserve-3d;
  filter:drop-shadow(3px 2px 2px rgba(0,0,0,1)); }
.ksw-f { position:absolute; inset:0; transform-style:preserve-3d; }
.ksw-a { position:absolute; inset:0; width:100%; height:100%; display:block; -webkit-user-drag:none; }
.ksw-placed { -webkit-mask-image:linear-gradient(to right,#000 0,#000 calc(var(--progress)*1% - .5%),rgba(0,0,0,0) calc(var(--progress)*1% + .5%));
  mask-image:linear-gradient(to right,#000 0,#000 calc(var(--progress)*1% - .5%),rgba(0,0,0,0) calc(var(--progress)*1% + .5%)); }
.ksw-shadow { position:absolute; inset:0; mix-blend-mode:multiply; opacity:var(--peeling,1); filter:blur(6px);
  background:linear-gradient(to right,rgba(0,0,0,0) calc(var(--progress)*1% - 22%),rgba(0,0,0,.7) calc(var(--progress)*1% - 2%),rgba(0,0,0,0) calc(var(--progress)*1% + 1%));
  -webkit-mask:var(--ksw-art) center/contain no-repeat; mask:var(--ksw-art) center/contain no-repeat; }
.ksw-wrap { position:absolute; inset:0; transform-origin:calc(var(--progress)*1%) 50%; transform:rotateY(calc(-1*var(--curl))); transform-style:preserve-3d; }
.ksw-face { position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden; transform-style:preserve-3d; }
.ksw-face .ksw-a { -webkit-mask-image:linear-gradient(to right,rgba(0,0,0,0) calc(var(--progress)*1% - .5%),#000 calc(var(--progress)*1% + .5%));
  mask-image:linear-gradient(to right,rgba(0,0,0,0) calc(var(--progress)*1% - .5%),#000 calc(var(--progress)*1% + .5%)); }
.ksw-front .ksw-shade { position:absolute; inset:0; mix-blend-mode:multiply;
  background:linear-gradient(to right,rgba(255,255,255,.25) calc(var(--progress)*1%),rgba(255,255,255,0) calc(var(--progress)*1% + 6%),rgba(0,0,0,0) calc(var(--progress)*1% + 10%),rgba(0,0,0,.55) 100%);
  -webkit-mask:var(--ksw-art) center/contain no-repeat; mask:var(--ksw-art) center/contain no-repeat; }
.ksw-back { transform:rotateY(180deg); }
.ksw-back .ksw-a { filter:brightness(.42) saturate(1.05); }
`;

/* ---------- mount ---------- */

export function mount(host, values, ctx = {}) {
  const reduced = Boolean(ctx.reducedMotion);
  let v = { ...values };

  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);
  const wall = document.createElement("div");
  wall.className = "ksw";
  wall.setAttribute("aria-hidden", "true");
  host.append(wall);

  let art = {};
  function paintArt() {
    const old = art;
    const F = rgbOf(v["colour.foil"]), K = rgbOf(v["colour.ink"]);
    art = {};
    for (const k of KINDS) art[k] = drawKind(k, F, K);
    for (const s of stickers) dress(s);
    // let the old images go once the new ones are in
    setTimeout(() => Object.values(old).forEach((u) => URL.revokeObjectURL(u)), 1000);
  }

  let W = 1, H = 1, scale = 1;
  const stickers = [];
  const kindOf = (s) => (v["sticker.kind"] === "Mixed" ? KINDS[s.pick % KINDS.length] : v["sticker.kind"]);

  function dress(s) {
    const url = art[kindOf(s)];
    if (s.url === url) return;
    s.url = url;
    s.el.style.setProperty("--ksw-art", `url("${url}")`);
    for (const img of s.imgs) img.src = url;
  }
  function place(s) {
    s.el.style.left = `${s.fx * 100}%`;
    s.el.style.top = `${s.fy * 100}%`;
    s.el.style.setProperty("--tilt", `${(s.r * Math.min(90, v["sticker.tilt"])).toFixed(2)}deg`);
  }
  function pose(s, e) {
    s.el.style.setProperty("--progress", (e * OVERSHOOT).toFixed(3));
    s.el.style.setProperty("--curl", `${((1 - e) * v["peel.curl"]).toFixed(2)}deg`);
    s.el.style.setProperty("--peeling", e >= 1 ? "0" : "1");
  }

  let pickCount = 0;
  function add(fx, fy, settled = false) {
    const el = document.createElement("div");
    el.className = "ksw-s";
    el.innerHTML =
      '<div class="ksw-f"><div class="ksw-wrap">' +
      '<div class="ksw-face ksw-back"><img class="ksw-a" alt=""></div>' +
      '<div class="ksw-face ksw-front"><img class="ksw-a" alt=""><div class="ksw-shade"></div></div>' +
      '</div><img class="ksw-a ksw-placed" alt=""><div class="ksw-shadow"></div></div>';
    const s = {
      el, imgs: [...el.querySelectorAll("img")], fx, fy,
      r: Math.random() * 2 - 1,
      // in Mixed, the kinds come round in turn, shuffled a little
      pick: (pickCount++ + (Math.random() < 0.3 ? 1 : 0)) % KINDS.length,
      state: settled ? "down" : "on", t: 0, url: null,
    };
    for (const img of s.imgs) img.draggable = false;
    dress(s);
    place(s);
    pose(s, settled ? 1 : 0);
    wall.append(el);
    stickers.push(s);
    trim();
    return s;
  }
  // past the count, the oldest peel back off
  function trim() {
    const live = stickers.filter((s) => s.state !== "off");
    let extra = live.length - v["wall.count"];
    for (const s of live) {
      if (extra-- <= 0) break;
      peelOff(s);
    }
  }
  function peelOff(s) {
    if (s.state === "off") return;
    if (reduced) {
      remove(s);
      return;
    }
    // from wherever it is in its own landing
    s.t = s.state === "on" ? 1 - s.t : 0;
    s.state = "off";
  }
  function remove(s) {
    s.el.remove();
    const i = stickers.indexOf(s);
    if (i >= 0) stickers.splice(i, 1);
  }

  // Somewhere with room: the best of a few tries, away from the newest ones.
  function spot() {
    const recent = stickers.filter((s) => s.state !== "off").slice(-7);
    let best = null, bestD = -1;
    for (let i = 0; i < 8; i++) {
      const fx = 0.1 + Math.random() * 0.8, fy = 0.12 + Math.random() * 0.76;
      let d = Infinity;
      for (const s of recent) d = Math.min(d, Math.hypot((s.fx - fx) * W, (s.fy - fy) * H));
      if (d > bestD) {
        bestD = d;
        best = [fx, fy];
      }
    }
    return best;
  }

  /* ----- the animation ----- */
  const ease = (t) => 1 - Math.pow(1 - t, 2.2);
  let raf = 0, last = 0, since = 0;
  let visible = !document.hidden, onscreen = true;
  const live = () => !reduced && visible && onscreen;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dur = v["peel.duration"] / 1000;
    for (const s of [...stickers]) {
      if (s.state === "on") {
        s.t = Math.min(1, s.t + dt / dur);
        pose(s, ease(s.t));
        if (s.t >= 1) s.state = "down";
      } else if (s.state === "off") {
        s.t = Math.min(1, s.t + dt / (dur * 1.3));
        pose(s, 1 - ease(s.t));
        s.el.style.opacity = s.t > 0.75 ? String(1 - (s.t - 0.75) / 0.25) : "1";
        if (s.t >= 1) remove(s);
      }
    }
    since += dt;
    if (since >= v["wall.every"]) {
      since = 0;
      const [fx, fy] = spot();
      add(fx, fy);
    }
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

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    // the experiment halved its stickers on a phone; they follow the piece's size
    scale = Math.max(0.5, Math.min(1.2, Math.min(W, H) / 900));
    wall.style.setProperty("--ksw-size", `${Math.round(v["sticker.size"] * scale)}px`);
  }
  function ground() {
    wall.style.background = v["colour.ground"];
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

  const onDown = (e) => {
    const r = host.getBoundingClientRect();
    add((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, reduced);
    since = 0;
  };
  host.addEventListener("pointerdown", onDown);

  resize();
  ground();
  paintArt();
  // it opens with a few already down, and the next on its way
  const opening = reduced
    ? [[0.2, 0.3], [0.5, 0.22], [0.8, 0.3], [0.32, 0.62], [0.66, 0.58], [0.15, 0.8], [0.5, 0.84], [0.86, 0.76]]
    : [[0.24, 0.34], [0.7, 0.28], [0.58, 0.7]];
  for (const [fx, fy] of opening) add(fx, fy, true);
  since = v["wall.every"] - 0.35;
  sync();

  return {
    update(next, path) {
      const prev = v;
      v = { ...next };
      if (path == null || path === "colour.ground") ground();
      if (path == null || path === "sticker.size") resize();
      if (path == null || path === "colour.foil" || path === "colour.ink") {
        if (prev["colour.foil"] !== v["colour.foil"] || prev["colour.ink"] !== v["colour.ink"]) paintArt();
      }
      if (path == null || path === "sticker.kind") for (const s of stickers) dress(s);
      if (path == null || path === "sticker.tilt") for (const s of stickers) place(s);
      if (path == null || path === "peel.curl") for (const s of stickers) if (s.state === "down") pose(s, 1);
      if (path == null || path === "wall.count") trim();
    },
    action(name) {
      if (name === "peelAll") for (const s of [...stickers]) peelOff(s);
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointerdown", onDown);
      wall.remove();
      style.remove();
      Object.values(art).forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
