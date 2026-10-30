/* Thinking net.

   From a client study (their round two): a white technical network reads
   footage as it plays. Each new frame is drawn small, the subject found as
   the dark (or strongly contrasting) shape nearest the middle that does not
   run off the frame, and corner features (Shi-Tomasi) are followed frame to
   frame by block matching with a sub-pixel fit. The network takes those
   tracks as anchors and decides the rest: which become nodes and of what
   kind (hollow rings, dots, hubs with their spokes, sample tiles holding a
   pixelated crop of what is under them), how they link, when lines rewire,
   when nodes retire, the lines that run off the frame, a few huge faint
   orbit arcs behind it all, and now and then a lock-on that snaps brackets
   round the subject. The footage is graded a little toward found footage:
   grain, a vignette, a faint flicker.

   The source's readouts (ticking numbers, boxed values, the lock-on's
   figures) are left out, so nothing in it is text. Move over it and the
   cursor becomes a feature the network can bind; click to lock on where
   you are. The clips (a butterfly against the sky, a satellite over the
   limb) are in public/experiments/thinking-net/. */

export const params = {
  footage: {
    clip: { type: "select", options: ["Butterfly", "Satellite"] },
    speed: [1, 0.25, 2, 0.05],
  },
  grade: {
    grain: [0.55, 0, 1.6, 0.01],
    vignette: [0.5, 0, 1, 0.01],
  },
  network: {
    nodes: [38, 6, 90, 1],
    tiles: [6, 0, 12, 1],
    arcs: [4, 0, 8, 1],
    lines: [0.85, 0.1, 1, 0.01],
  },
  colour: {
    line: "#ffffff",
    signal: "#c8ff3d",
  },
  lock: { type: "action", label: "Lock on" },
};

const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const CLIPS = [
  { id: "Butterfly", src: new URL("experiments/thinking-net/butterfly.mp4", ROOT).href },
  { id: "Satellite", src: new URL("experiments/thinking-net/satellite.mp4", ROOT).href },
];

// the source's settings that stay put
const LOOPS = 2, CROSSFADE = 0.8, BRIGHTNESS = 0.97, CONTRAST = 1.08, SATURATION = 0.86, FLICKER = 0.3;
const POINTS = 96, SEARCH = 5, SUBJECT_BIAS = 0.8, OUTER_NODES = 8, ARC = "#c8ccd2";

const TAU = Math.PI * 2;
const FADE = 0.45; // seconds a retiring node takes to go
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const easeInOut = (k) => ((k = clamp(k, 0, 1)), k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const backOut = (k) => {
  k = clamp(k, 0, 1);
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------ the network
   Ported from the study's think-net.js with the text taken out: no readout
   boxes, bare numbers or hub figures, and the lock-on is brackets only. */
const NET = {
  subjectSpacing: 16, offFrameLines: 3, hubs: 4, spokesMin: 3, spokesMax: 6, nodeLife: 7, churn: 0.3, rewire: 0.8,
  drawOnTime: 0.45, smoothing: 0.09, tileSize: 44, tileRefresh: 0.35, mosaic: 7, tileZoom: 1.5,
  lockEvery: 6.5, lockHold: 2.4, arcOpacity: 0.16, arcSpeed: 0.015,
};
class ThinkNet {
  constructor(opts) {
    this.o = Object.assign({}, NET, opts);
    this.r = mulberry(7);
    this.nodes = []; this.edges = []; this.bound = new Map(); this.amap = new Map(); this.pairs = new Set();
    this.t = 0; this.uid = 1; this.W = 0; this.H = 0; this.dpr = 1;
    this.lock = null; this.nextLock = 3.4;
    this.acc = { rewire: 0, hub: 0, outer: 0, passive: 0 };
    this.arcList = []; this.arcKey = "";
    this.atlas = document.createElement("canvas");
    this.atlas.width = this.atlas.height = 256;
    this.actx = this.atlas.getContext("2d");
    this.slots = [];
    for (let i = 255; i >= 0; i--) this.slots.push(i);
    this.subject = null; this.f = { anchors: [] };
  }
  set(o) { Object.assign(this.o, o); }

  step(dt, f) {
    const o = this.o, r = this.r;
    this.t += dt;
    const t = this.t;
    this.f = f;
    if (f.W !== this.W || f.H !== this.H) { this.W = f.W; this.H = f.H; this.arcKey = ""; }
    const S = (this.subject = Object.assign({}, f.subject || { x0: f.W * 0.4, y0: f.H * 0.4, x1: f.W * 0.6, y1: f.H * 0.6 }));
    if (S.cx === undefined) { S.cx = (S.x0 + S.x1) / 2; S.cy = (S.y0 + S.y1) / 2; }
    S.diag = Math.max(24, Math.hypot(S.x1 - S.x0, S.y1 - S.y0));
    const amap = this.amap;
    amap.clear();
    for (const a of f.anchors) amap.set(a.key, a);

    // follow the anchors, smoothed
    const k0 = dt > 0 ? 1 - Math.exp(-dt / Math.max(0.004, o.smoothing)) : 0;
    for (const n of this.nodes) {
      let k = k0;
      if (n.free) {
        n.ax += n.dvx * dt; n.ay += n.dvy * dt;
        if (n.dieAt === Infinity && (n.ax < 4 || n.ay < 4 || n.ax > this.W - 4 || n.ay > this.H - 4)) this.retire(n);
      } else {
        const a = amap.get(n.key);
        if (a) {
          n.ax = a.x; n.ay = a.y;
          if (a.w !== undefined) n.w = a.w;
          n.lost = 0;
          if (a.tau && dt > 0) k = 1 - Math.exp(-dt / a.tau);
        } else if (n.dieAt === Infinity) {
          if (!n.lost) n.lost = t + 0.1 + r() * 0.7;
          else if (t > n.lost) this.retire(n);
        }
      }
      const px = n.x, py = n.y;
      n.x += (n.ax - n.x) * k; n.y += (n.ay - n.y) * k;
      if (dt > 0) { n.vx += ((n.x - px) / dt - n.vx) * 0.12; n.vy += ((n.y - py) / dt - n.vy) * 0.12; }
      if (n.dieAt === Infinity && t > n.born + n.life) this.retire(n);
      // a hub that no longer sits on the subject lets go
      if (n.kind === "hub" && !n.free && n.dieAt === Infinity) {
        n.weak = n.w < 0.5 ? (n.weak || 0) + dt : 0;
        if (n.weak > 0.8) this.retire(n);
      }
    }
    // gone
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (t < n.dieAt + FADE) continue;
      this.nodes.splice(i, 1);
      if (n.key && this.bound.get(n.key) === n) this.bound.delete(n.key);
      if (n.slot !== undefined) this.slots.push(n.slot);
    }
    for (let i = this.edges.length - 1; i >= 0; i--) {
      const e = this.edges[i];
      const gone = t > e.dieAt + e.dur || !this.nodes.includes(e.a) || (e.b && !this.nodes.includes(e.b));
      if (!gone) continue;
      if (e.dieAt === Infinity) { e.a.deg--; if (e.b) e.b.deg--; }
      this.edges.splice(i, 1);
      this.pairs.delete(e.key);
    }
    this.discover(dt);
    this.updateOuter(dt);
    this.updateEdges(dt);
    this.updateTiles();
    this.updateLock(dt);
  }

  // births: with no scan, nodes simply surface, a few a second, dense on the subject and sparse elsewhere
  discover(dt) {
    const o = this.o, r = this.r;
    const target = Math.max(0, Math.round(o.nodes - o.outerNodes));
    let live = 0, weak = 0, strong = 0;
    for (const n of this.nodes) if (!n.free && n.dieAt === Infinity) { live++; if (n.w < 0.9) weak++; else strong++; }
    const cap = Math.max(6, Math.min(target, Math.round(this.subject.diag / Math.max(2, o.subjectSpacing))));
    const found = [];
    this.acc.passive += dt * Math.max(0.6, (target - live) * 0.9);
    while (this.acc.passive >= 1) {
      this.acc.passive -= 1;
      const list = this.f.anchors.filter((a) => !a.hold && !this.bound.has(a.key));
      if (list.length) found.push(list[Math.floor(r() * list.length)]);
    }
    let births = 0;
    for (const a of found) {
      if (births >= 3) break;
      const w = a.w ?? 0.5;
      if (r() > 0.3 + 0.7 * w) continue;
      if (w < 0.9 && weak >= target * 0.3) continue;
      if (w >= 0.9 && strong >= cap) continue;
      if (this.crowded(a.x, a.y)) continue;
      if (live < target) { this.birth(a); live++; births++; if (w < 0.9) weak++; else strong++; }
      else if (r() < o.churn) { const old = this.oldest(); if (old) { this.retire(old); this.birth(a); births++; } }
    }
  }
  crowded(x, y) {
    const R = clamp(this.subject.diag * 0.16, 34, 90), R2 = R * R;
    let c = 0;
    for (const n of this.nodes) if (n.dieAt === Infinity && (n.x - x) ** 2 + (n.y - y) ** 2 < R2 && ++c >= 3) return true;
    return false;
  }
  oldest() {
    let best = null;
    for (const n of this.nodes) if (!n.free && n.dieAt === Infinity && n.kind !== "hub" && (!best || n.born < best.born)) best = n;
    return best;
  }
  node(x, y, extra) {
    return Object.assign({ id: this.uid++, key: null, free: false, x, y, ax: x, ay: y, vx: 0, vy: 0, w: 0.5, born: this.t, dieAt: Infinity, lost: 0, deg: 0, ox: 0, oy: 0 }, extra);
  }
  birth(a, kind) {
    const n = this.node(a.x, a.y, { key: a.key, w: a.w ?? 0.5 });
    n.kind = kind || this.pickKind(n);
    this.setupKind(n);
    this.place(n);
    this.nodes.push(n);
    this.bound.set(a.key, n);
    this.connect(n);
    return n;
  }
  birthFree(x, y) {
    const r = this.r;
    const n = this.node(x, y, { free: true, w: 0.1, dvx: (r() - 0.5) * 6, dvy: (r() - 0.5) * 4 });
    n.kind = r() < 0.5 ? "ring" : "dot";
    this.setupKind(n);
    n.life *= 1.8;
    this.nodes.push(n);
    this.connect(n);
  }
  pickKind(n) {
    const o = this.o, r = this.r;
    let hubs = 0, tiles = 0;
    for (const m of this.nodes) if (m.dieAt === Infinity) { if (m.kind === "hub") hubs++; else if (m.kind === "tile") tiles++; }
    const hubCap = Math.max(1, Math.min(o.hubs, Math.round(this.subject.diag / 90)));
    if (hubs < hubCap && n.w > 0.75) {
      const min = Math.max(46, this.subject.diag * 0.24);
      let far = true;
      for (const m of this.nodes) if (m.kind === "hub" && m.dieAt === Infinity && Math.hypot(m.x - n.x, m.y - n.y) < min) { far = false; break; }
      if (far) return "hub";
    }
    if (tiles < o.tiles && n.w > 0.45 && r() < 0.45) {
      const m = this.f.measure ? this.f.measure(n.x, n.y) : null;
      if (!m || m.edge === undefined || m.edge > 0.12) return "tile";
    }
    return r() < 0.55 ? "ring" : "dot";
  }
  setupKind(n) {
    const o = this.o, r = this.r;
    n.life = o.nodeLife * (0.55 + r() * 0.9) * (n.kind === "hub" ? 2.4 : n.kind === "tile" ? 1.3 : 1);
    if (n.kind === "hub") n.spokes = o.spokesMin + Math.floor(r() * (o.spokesMax - o.spokesMin + 1));
    if (n.kind === "tile") {
      n.slot = this.slots.pop();
      if (n.slot === undefined) { n.kind = "ring"; return; }
      n.size = Math.round(o.tileSize * [0.6, 0.8, 1, 1, 1.3][Math.floor(r() * 5)]);
      n.n = clamp(Math.round(o.mosaic + (r() - 0.5) * 4), 3, 16);
      n.mode = r() < 0.3 ? (r() < 0.5 ? "smearV" : "smearH") : "mosaic";
      n.zoom = o.tileZoom * (0.7 + r() * 0.6);
      n.nextRefresh = 0; n.smearAt = r(); n.has = false;
    }
  }
  // a tile finds room: on a crowded subject it moves out along a leader line; if nowhere is clear it becomes a plain node
  place(n) {
    if (n.kind !== "tile") return;
    const S = this.subject, r = this.r;
    const base = Math.atan2(n.y - S.cy, n.x - S.cx), L0 = clamp(S.diag * 0.2, 26, 84), tries = [];
    if (r() < clamp(S.diag / 900, 0.15, 0.45)) tries.push([0, 0]);
    for (let i = 0; i < 5; i++) { const a = base + (r() - 0.5) * 1.5, L = L0 * (0.75 + r() * 0.8); tries.push([Math.cos(a) * L, Math.sin(a) * L]); }
    for (const [dx, dy] of tries) {
      n.ox = dx; n.oy = dy;
      const X = n.x + dx, Y = n.y + dy;
      if (X < 10 || Y < 10 || X > this.W - 10 || Y > this.H - 10) continue;
      if (!this.overlaps(n)) return;
    }
    n.ox = n.oy = 0;
    this.slots.push(n.slot);
    n.slot = undefined;
    n.kind = r() < 0.5 ? "ring" : "dot";
  }
  rectOf(n) {
    const X = n.x + n.ox, Y = n.y + n.oy;
    if (n.kind === "tile") { const h = n.size / 2; return [X - h, Y - h, X + h, Y + h]; }
    return [X - 5, Y - 5, X + 5, Y + 5];
  }
  overlaps(n) {
    const a = this.rectOf(n), pad = 4;
    if (a[0] < 4 || a[1] < 4 || a[2] > this.W - 4 || a[3] > this.H - 4) return true;
    for (const m of this.nodes) {
      if (m === n || m.dieAt !== Infinity || m.kind !== "tile") continue;
      const b = this.rectOf(m);
      if (a[0] < b[2] + pad && a[2] > b[0] - pad && a[1] < b[3] + pad && a[3] > b[1] - pad) return true;
    }
    return false;
  }
  dx(n) { return n.ox ? n.x + n.ox * easeOut((this.t - n.born) / 0.3) : n.x; }
  dy(n) { return n.oy ? n.y + n.oy * easeOut((this.t - n.born) / 0.3) : n.y; }
  retire(n, delay = 0) {
    if (n.dieAt !== Infinity) return;
    n.dieAt = this.t + delay;
    for (const e of this.edges) if (e.a === n || e.b === n) this.cut(e, delay);
  }
  cut(e, delay = 0) {
    if (e.dieAt !== Infinity) return;
    e.dieAt = this.t + delay;
    e.a.deg--;
    if (e.b) e.b.deg--;
  }

  // links
  reach() { return Math.max(120, this.subject.diag * 0.62); }
  nearest(n, pred, maxD) {
    let best = null, bd = maxD * maxD;
    for (const m of this.nodes) {
      if (m === n || m.dieAt !== Infinity || !pred(m)) continue;
      const d = (m.x - n.x) ** 2 + (m.y - n.y) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  linked(a, b) { return this.pairs.has(a.id < b.id ? a.id + ":" + b.id : b.id + ":" + a.id); }
  link(a, b, spoke = false) {
    if (!a || !b || a === b) return null;
    const key = a.id < b.id ? a.id + ":" + b.id : b.id + ":" + a.id;
    if (this.pairs.has(key)) return null;
    this.pairs.add(key);
    const e = { a, b, key, spoke, off: false, born: this.t, dieAt: Infinity, dur: this.o.drawOnTime * (0.7 + this.r() * 0.6), life: Infinity };
    a.deg++; b.deg++;
    this.edges.push(e);
    return e;
  }
  offFrame(n) {
    const S = this.subject;
    const ang = Math.atan2(n.y - S.cy, n.x - S.cx) + (this.r() - 0.5) * 0.9;
    n.deg++;
    this.edges.push({ a: n, b: null, ang, key: "off" + this.uid++, spoke: false, off: true, born: this.t, dieAt: Infinity, dur: this.o.drawOnTime * 1.8, life: this.t + 3 + this.r() * 6 });
  }
  connect(n) {
    const r = this.r, reach = this.reach();
    if (n.free) {
      const h = (r() < 0.4 && this.nearest(n, (m) => m.kind === "hub" && !m.free, Infinity)) || this.nearest(n, () => true, Infinity);
      if (h) this.link(h, n, h.kind === "hub");
      if (r() < 0.35) this.link(n, this.nearest(n, (m) => m.free, Infinity));
      return;
    }
    if (n.kind === "hub") { this.link(this.nearest(n, (m) => m.kind === "hub", reach * 2.2), n); return; }
    const h = this.nearest(n, (m) => m.kind === "hub" && m.deg < m.spokes + 2, reach * 1.2);
    if (h) this.link(h, n, true);
    else this.link(this.nearest(n, (m) => !m.free && m.deg < 3, reach), n);
    if (r() < 0.35) this.link(n, this.nearest(n, (m) => !m.free && m.kind !== "hub" && m.deg < 3 && !this.linked(m, n), reach * 0.6));
  }
  spokeFor(h, reach) {
    const t = this.t, angs = [];
    for (const e of this.edges) if (e.dieAt === Infinity && (e.a === h || e.b === h)) { const m = e.a === h ? e.b : e.a; if (m) angs.push(Math.atan2(m.y - h.y, m.x - h.x)); }
    let best = null, bs = Infinity;
    for (const m of this.nodes) {
      if (m === h || m.dieAt !== Infinity || m.kind === "hub" || m.deg >= 4 || this.linked(h, m) || t - m.born < 0.1) continue;
      const d = Math.hypot(m.x - h.x, m.y - h.y);
      if (d > reach) continue;
      const a = Math.atan2(m.y - h.y, m.x - h.x);
      let pen = 0;
      for (const b of angs) { const dd = Math.abs(((a - b + Math.PI * 3) % TAU) - Math.PI); if (dd < 0.45) pen += (0.45 - dd) / 0.45; }
      const sc = d * (1 + 2.5 * pen) * (m.w >= 0.9 ? 1 : 1.8) * (m.free ? 2.5 : 1);
      if (sc < bs) { bs = sc; best = m; }
    }
    return best;
  }
  // tiles drift into each other as the subject moves: the younger one goes
  declutter() {
    const live = this.nodes.filter((n) => n.dieAt === Infinity && n.kind === "tile" && this.t - n.born > 0.4);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.dieAt !== Infinity || b.dieAt !== Infinity) continue;
      const A = this.rectOf(a), B = this.rectOf(b);
      if (A[0] < B[2] && A[2] > B[0] && A[1] < B[3] && A[3] > B[1]) this.retire(a.born > b.born ? a : b);
    }
  }
  updateEdges(dt) {
    const o = this.o, r = this.r, t = this.t;
    for (const e of this.edges) if (e.dieAt === Infinity && t > e.life) this.cut(e);
    this.acc.hub += dt;
    if (this.acc.hub > 0.16) {
      this.acc.hub = 0;
      const reach = this.reach();
      for (const h of this.nodes) {
        if (h.kind !== "hub" || h.dieAt !== Infinity || t - h.born < 0.25) continue;
        let spokes = 0;
        for (const e of this.edges) if (e.dieAt === Infinity && e.spoke && (e.a === h || e.b === h)) spokes++;
        if (spokes < h.spokes) this.link(h, this.spokeFor(h, reach), true);
      }
      for (const n of this.nodes) if (n.dieAt === Infinity && n.deg <= 0 && t - n.born > 0.5) this.link(this.nearest(n, () => true, Infinity), n);
      if ((this.dc = (this.dc || 0) + 1) % 3 === 0) this.declutter();
    }
    // rewire: one line goes, another forms
    this.acc.rewire += dt * o.rewire;
    while (this.acc.rewire >= 1) {
      this.acc.rewire -= 1;
      const live = this.edges.filter((e) => e.dieAt === Infinity && !e.off && t - e.born > e.dur);
      if (live.length > 4) this.cut(live[Math.floor(r() * live.length)]);
      const ns = this.nodes.filter((n) => n.dieAt === Infinity && !n.free);
      if (ns.length > 2) {
        const n = ns[Math.floor(r() * ns.length)];
        const m = this.nearest(n, (m) => !m.free && m.deg < 4 && !this.linked(n, m), Math.max(130, this.subject.diag * 0.7));
        if (m) this.link(n, m, n.kind === "hub" || m.kind === "hub");
      }
    }
    // lines that run off the frame
    let off = 0;
    for (const e of this.edges) if (e.off && e.dieAt === Infinity) off++;
    if (off < o.offFrameLines && r() < dt * 1.2) {
      const c = this.nodes.filter((n) => n.dieAt === Infinity && (n.free || n.kind === "hub"));
      if (c.length) this.offFrame(c[Math.floor(r() * c.length)]);
    }
  }
  updateOuter(dt) {
    const o = this.o, r = this.r, W = this.W, H = this.H, S = this.subject;
    let have = 0;
    for (const n of this.nodes) if (n.free && n.dieAt === Infinity) have++;
    if (have >= o.outerNodes) return;
    this.acc.outer += dt * 1.3;
    if (this.acc.outer < 1) return;
    this.acc.outer = 0;
    const m = 26;
    for (let i = 0; i < 14; i++) {
      let x, y;
      if (r() < 0.65) {
        // the band along one of the four edges
        const side = Math.floor(r() * 4), bx = W * 0.14, by = H * 0.14;
        x = side === 0 ? m + r() * bx : side === 1 ? W - m - r() * bx : m + r() * (W - 2 * m);
        y = side === 2 ? m + r() * by : side === 3 ? H - m - r() * by : m + r() * (H - 2 * m);
      } else { x = m + r() * (W - 2 * m); y = m + r() * (H - 2 * m); }
      const pad = S.diag * 0.35;
      if (x > S.x0 - pad && x < S.x1 + pad && y > S.y0 - pad && y < S.y1 + pad) continue;
      this.birthFree(x, y);
      break;
    }
  }
  updateTiles() {
    const f = this.f;
    if (!f.sample || !this.o.tiles) return;
    const t = this.t, c = this.actx;
    for (const n of this.nodes) {
      if (n.kind !== "tile" || t < n.nextRefresh) continue;
      n.nextRefresh = t + this.o.tileRefresh * (0.5 + this.r());
      const crop = n.size / n.zoom, rc = f.sample.map(n.x - crop / 2, n.y - crop / 2, crop, crop);
      if (!rc || !f.sample.src) continue;
      const sx = (n.slot % 16) * 16, sy = Math.floor(n.slot / 16) * 16, N = n.n;
      c.clearRect(sx, sy, 16, 16);
      c.imageSmoothingEnabled = true;
      try {
        if (n.mode === "smearV") c.drawImage(f.sample.src, rc[0], rc[1] + rc[3] * n.smearAt, rc[2], Math.max(1, rc[3] / 32), sx, sy, N, N);
        else if (n.mode === "smearH") c.drawImage(f.sample.src, rc[0] + rc[2] * n.smearAt, rc[1], Math.max(1, rc[2] / 32), rc[3], sx, sy, N, N);
        else c.drawImage(f.sample.src, rc[0], rc[1], rc[2], rc[3], sx, sy, N, N);
        n.has = true;
        n.flash = t;
      } catch {
        /* the source is not ready yet */
      }
      if (this.r() < 0.25) n.smearAt = this.r();
    }
  }

  // lock-on
  lockOn(keys) {
    const o = this.o, r = this.r, S = this.subject, list = this.f.anchors;
    let whole = false;
    if (!keys) {
      if (r() < 0.5 || !list.length) { keys = list.filter((a) => (a.w ?? 0.5) >= 0.9).map((a) => a.key); whole = true; }
      else {
        const near = list.filter((a) => (a.w ?? 0.5) >= 0.9), c = (near.length ? near : list)[Math.floor(r() * (near.length || list.length))], R = Math.max(40, S.diag * 0.22);
        keys = list.filter((a) => Math.hypot(a.x - c.x, a.y - c.y) < R).map((a) => a.key);
      }
    }
    const box = whole ? this.subjectBox() : this.boxOf(keys);
    if (!box) { this.nextLock = this.t + 1; return; }
    const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, s = 1.9;
    const ox = (r() - 0.5) * S.diag * 0.3, oy = (r() - 0.5) * S.diag * 0.3;
    this.lock = { keys, whole, t0: this.t, snap: 0.34, hold: o.lockHold * (0.8 + r() * 0.4), release: 0, x0, y0, x1, y1,
      f: [cx + ox + (x0 - cx) * s, cy + oy + (y0 - cy) * s, cx + ox + (x1 - cx) * s, cy + oy + (y1 - cy) * s] };
  }
  subjectBox() {
    const S = this.subject, pad = 10;
    return [S.x0 - pad, S.y0 - pad, S.x1 + pad, S.y1 + pad];
  }
  boxOf(keys, free = false) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, c = 0;
    for (const k of keys) {
      const a = this.amap.get(k);
      if (!a) continue;
      c++;
      if (a.x < x0) x0 = a.x; if (a.y < y0) y0 = a.y; if (a.x > x1) x1 = a.x; if (a.y > y1) y1 = a.y;
    }
    if (c < 2) return null;
    const S = this.subject, m = S.diag * 0.3;
    if (!free) { x0 = Math.max(x0, S.x0 - m); y0 = Math.max(y0, S.y0 - m); x1 = Math.min(x1, S.x1 + m); y1 = Math.min(y1, S.y1 + m); }
    if (x1 < x0 || y1 < y0) return null;
    const pad = 9, minS = 26;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max(minS, x1 - x0 + pad * 2) / 2, hh = Math.max(minS, y1 - y0 + pad * 2) / 2;
    return [cx - hw, cy - hh, cx + hw, cy + hh];
  }
  updateLock(dt) {
    const o = this.o, t = this.t;
    if (!this.lock && t >= this.nextLock && this.f.anchors.length > 2) this.lockOn();
    const L = this.lock;
    if (!L) return;
    const box = L.whole ? this.subjectBox() : this.boxOf(L.keys, L.free);
    if (box) {
      const k = dt > 0 ? 1 - Math.exp(-dt / 0.12) : 0;
      L.x0 += (box[0] - L.x0) * k; L.y0 += (box[1] - L.y0) * k; L.x1 += (box[2] - L.x1) * k; L.y1 += (box[3] - L.y1) * k;
    } else if (!L.release) L.release = t;
    if (!L.release && t > L.t0 + L.snap + L.hold) L.release = t;
    if (L.release && t > L.release + 0.35) { this.lock = null; this.nextLock = t + o.lockEvery * (0.7 + this.r() * 0.6); }
  }

  draw(ctx, dpr = 1) {
    this.dpr = dpr;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    this.drawArcs(ctx);
    this.drawEdges(ctx);
    this.drawTiles(ctx);
    this.drawNodes(ctx);
    this.drawLock(ctx);
    ctx.restore();
  }
  // a 1 px stroke lands on whole device pixels
  snap(v) { const d = this.dpr; return (Math.round(v * d) + (d < 1.5 ? 0.5 : 0)) / d; }
  alpha(n) {
    const t = this.t;
    let a = easeOut((t - n.born) / 0.28);
    if (t > n.dieAt) a *= 1 - clamp((t - n.dieAt) / FADE, 0, 1);
    return a;
  }
  makeArcs() {
    const r = mulberry(91 + this.o.arcs), W = this.W, H = this.H, D = Math.hypot(W, H);
    this.arcList = [];
    for (let i = 0; i < this.o.arcs; i++) {
      const ang = r() * TAU, dist = D * (0.75 + r() * 0.9);
      const cx = W / 2 + Math.cos(ang) * dist, cy = H / 2 + Math.sin(ang) * dist;
      const rad = dist * (0.8 + r() * 0.34);
      const toC = Math.atan2(H / 2 - cy, W / 2 - cx), span = (D / rad) * 1.5;
      this.arcList.push({ cx, cy, r: rad, a0: toC - span / 2 + (r() - 0.5) * 0.3, span, spin: (r() < 0.5 ? -1 : 1) * (0.5 + r()), rider: r() < 0.55 ? 0.015 + r() * 0.025 : 0, ph: r() });
    }
  }
  drawArcs(ctx) {
    const o = this.o, key = [this.W, this.H, o.arcs].join();
    if (key !== this.arcKey) { this.arcKey = key; this.makeArcs(); }
    ctx.strokeStyle = o.arc;
    ctx.fillStyle = o.arc;
    for (const a of this.arcList) {
      const rot = this.t * o.arcSpeed * a.spin;
      ctx.globalAlpha = o.arcOpacity;
      ctx.beginPath();
      ctx.arc(a.cx, a.cy, a.r, a.a0 + rot, a.a0 + a.span + rot);
      ctx.stroke();
      if (a.rider) {
        // something small on its orbit
        const u = (a.ph + this.t * a.rider) % 1, an = a.a0 + rot + u * a.span;
        ctx.globalAlpha = Math.min(1, o.arcOpacity * 3.2);
        ctx.beginPath();
        ctx.arc(a.cx + Math.cos(an) * a.r, a.cy + Math.sin(an) * a.r, 1.6, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  extent(n, dx, dy) {
    const ax = Math.abs(dx) > 1e-6 ? 1 / Math.abs(dx) : 1e9, ay = Math.abs(dy) > 1e-6 ? 1 / Math.abs(dy) : 1e9;
    if (n.kind === "ring") return 3;
    if (n.kind === "hub") return 4.6;
    if (n.kind === "tile") return Math.min((n.size / 2 + 0.5) * ax, (n.size / 2 + 0.5) * ay);
    return 0;
  }
  drawEdges(ctx) {
    const o = this.o, t = this.t, D = Math.hypot(this.W, this.H) * 1.5;
    ctx.strokeStyle = o.line;
    ctx.globalAlpha = o.lineOpacity;
    ctx.beginPath();
    const seg = (ax, ay, A, bx, by, B, p, q) => {
      let dx = bx - ax, dy = by - ay;
      const L = Math.hypot(dx, dy);
      if (L < 1) return;
      dx /= L; dy /= L;
      const s0 = A ? this.extent(A, dx, dy) : 0, s1 = B ? L - this.extent(B, -dx, -dy) : L;
      if (s1 - s0 < 2) return;
      const a0 = s0 + (s1 - s0) * q, a1 = s0 + (s1 - s0) * p;
      ctx.moveTo(ax + dx * a0, ay + dy * a0);
      ctx.lineTo(ax + dx * a1, ay + dy * a1);
    };
    for (const e of this.edges) {
      if (t < e.born) continue;
      const p = easeOut((t - e.born) / e.dur), q = t > e.dieAt ? easeInOut((t - e.dieAt) / e.dur) : 0;
      if (p <= q) continue;
      const A = e.a, B = e.b, ax = this.dx(A), ay = this.dy(A);
      seg(ax, ay, A, B ? this.dx(B) : ax + Math.cos(e.ang) * D, B ? this.dy(B) : ay + Math.sin(e.ang) * D, B, p, q);
    }
    // leaders from an anchor out to its tile
    for (const n of this.nodes) {
      if (!n.ox && !n.oy) continue;
      const p = easeOut((t - n.born) / 0.3), q = t > n.dieAt ? clamp((t - n.dieAt) / FADE, 0, 1) : 0;
      if (p > q) seg(n.x, n.y, null, this.dx(n), this.dy(n), n, 1 - q, 0);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawTiles(ctx) {
    const t = this.t, o = this.o;
    ctx.imageSmoothingEnabled = false;
    ctx.strokeStyle = o.line;
    ctx.fillStyle = o.line;
    for (const n of this.nodes) {
      if (n.kind !== "tile") continue;
      const a = this.alpha(n);
      if (a <= 0.01) continue;
      const s = Math.round(n.size * (0.55 + 0.45 * easeOut((t - n.born) / 0.3)));
      const x = this.snap(this.dx(n) - s / 2), y = this.snap(this.dy(n) - s / 2);
      if (n.has) {
        ctx.globalAlpha = a;
        ctx.drawImage(this.atlas, (n.slot % 16) * 16, Math.floor(n.slot / 16) * 16, n.n, n.n, x, y, s, s);
        if (t - n.flash < 0.06) { ctx.globalAlpha = a * 0.14; ctx.fillRect(x, y, s, s); }
      }
      ctx.globalAlpha = a * o.lineOpacity;
      ctx.strokeRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
  }
  drawNodes(ctx) {
    const t = this.t, o = this.o;
    ctx.strokeStyle = o.line;
    ctx.fillStyle = o.line;
    for (const n of this.nodes) {
      const a = this.alpha(n);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      const x = n.x, y = n.y;
      if (n.ox || n.oy) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill(); }
      if (n.kind === "ring") { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.stroke(); }
      else if (n.kind === "dot") { ctx.beginPath(); ctx.arc(x, y, 1.9, 0, TAU); ctx.fill(); }
      else if (n.kind === "hub") {
        ctx.beginPath(); ctx.arc(x, y, 3.8, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill();
      }
      // found: one ring goes out from it
      const k = (t - n.born) / 0.55;
      if (k < 1) { ctx.globalAlpha = (1 - k) * 0.7; ctx.beginPath(); ctx.arc(x, y, 3 + easeOut(k) * 15, 0, TAU); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }
  drawLock(ctx) {
    const L = this.lock;
    if (!L) return;
    const o = this.o, t = this.t, col = o.signal;
    const ks = (t - L.t0) / L.snap, kk = backOut(ks), rel = L.release ? clamp((t - L.release) / 0.35, 0, 1) : 0;
    let x0 = lerp(L.f[0], L.x0, kk), y0 = lerp(L.f[1], L.y0, kk), x1 = lerp(L.f[2], L.x1, kk), y1 = lerp(L.f[3], L.y1, kk);
    if (rel) { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, s = 1 + rel * 0.4; x0 = cx + (x0 - cx) * s; x1 = cx + (x1 - cx) * s; y0 = cy + (y0 - cy) * s; y1 = cy + (y1 - cy) * s; }
    const blink = ks < 1 ? (Math.floor(ks * 7) % 2 ? 0.3 : 1) : 1, a = (1 - rel) * blink;
    if (a <= 0.01) return;
    x0 = this.snap(x0); y0 = this.snap(y0); x1 = this.snap(x1); y1 = this.snap(y1);
    const arm = clamp(Math.min(x1 - x0, y1 - y0) * 0.22, 5, 14);
    ctx.globalAlpha = a;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + arm); ctx.lineTo(x0, y0); ctx.lineTo(x0 + arm, y0);
    ctx.moveTo(x1 - arm, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + arm);
    ctx.moveTo(x1, y1 - arm); ctx.lineTo(x1, y1); ctx.lineTo(x1 - arm, y1);
    ctx.moveTo(x0 + arm, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - arm);
    const cx = this.snap((x0 + x1) / 2), cy = this.snap((y0 + y1) / 2);
    ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------ tracking */
const AW = 240;
function tracker() {
  let AH = 181, N = AW * AH;
  const acan = document.createElement("canvas"), actx = acan.getContext("2d", { willReadFrequently: true });
  const Tk = {
    tracks: [], uid: 1, subj: null, label: 0, frames: 0, prev: null, gray: null,
    get AH() { return AH; },
    alloc() {
      N = AW * AH; acan.width = AW; acan.height = AH;
      this.gray = new Float32Array(N); this.prev = null;
      this.mask = new Uint8Array(N); this.labels = new Int32Array(N); this.stack = new Int32Array(N);
      this.ix = new Float32Array(N); this.iy = new Float32Array(N);
      this.a = new Float32Array(N); this.b = new Float32Array(N); this.c = new Float32Array(N); this.tmp = new Float32Array(N);
      this.bgw = Math.ceil(AW / 10); this.bgh = Math.ceil(AH / 10); this.bg = new Float32Array(this.bgw * this.bgh);
    },
    reset() { this.tracks = []; this.prev = null; this.subj = null; this.label = 0; },
    analyse(el) {
      const vw = el.videoWidth, vh = el.videoHeight;
      if (!vw) return;
      const h = Math.round((AW * vh) / vw);
      if (h !== AH || !this.gray) { AH = h; this.alloc(); }
      actx.drawImage(el, 0, 0, AW, AH);
      const d = actx.getImageData(0, 0, AW, AH).data, g = this.gray;
      for (let i = 0, j = 0; i < N; i++, j += 4) g[i] = (0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]) / 255;
      this.findSubject();
      if (this.prev) this.track();
      if (this.frames++ % 2 === 0 || this.tracks.length < 12) this.seed();
      if (this.frames % 4 === 0) this.thin();
      for (const t of this.tracks) t.w = this.weightAt(t.x, t.y);
      if (!this.prev) this.prev = new Float32Array(N);
      this.prev.set(g);
    },
    findSubject() {
      const g = this.gray, W = AW, H = AH, bw = this.bgw, bh = this.bgh, bg = this.bg;
      // a coarse, blurred background to measure local contrast against
      bg.fill(0);
      const cnt = new Float32Array(bw * bh);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = ((y / 10) | 0) * bw + ((x / 10) | 0); bg[k] += g[y * W + x]; cnt[k]++; }
      for (let k = 0; k < bg.length; k++) bg[k] /= cnt[k] || 1;
      const bgAt = (x, y) => {
        const fx = clamp(x / 10 - 0.5, 0, bw - 1), fy = clamp(y / 10 - 0.5, 0, bh - 1), x0 = fx | 0, y0 = fy | 0, x1 = Math.min(bw - 1, x0 + 1), y1 = Math.min(bh - 1, y0 + 1), u = fx - x0, v = fy - y0;
        return (bg[y0 * bw + x0] * (1 - u) + bg[y0 * bw + x1] * u) * (1 - v) + (bg[y1 * bw + x0] * (1 - u) + bg[y1 * bw + x1] * u) * v;
      };
      const m = this.mask;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, val = g[i], b = bgAt(x, y);
        m[i] = val < 0.2 || b - val > 0.16 || val - b > 0.3 ? 1 : 0;
      }
      // connected shapes; the subject is the best one
      const L = this.labels, st = this.stack;
      L.fill(0);
      let lab = 0, best = null, bestS = 0;
      for (let s0 = 0; s0 < N; s0++) {
        if (!m[s0] || L[s0]) continue;
        lab++;
        let sp = 0;
        st[sp++] = s0;
        L[s0] = lab;
        const c = { lab, area: 0, sx: 0, sy: 0, x0: W, y0: H, x1: 0, y1: 0, touch: 0, l: null, r: null, t: null, b: null };
        while (sp) {
          const i = st[--sp], x = i % W, y = (i / W) | 0;
          c.area++; c.sx += x; c.sy += y;
          if (x < c.x0) { c.x0 = x; c.l = [x, y]; }
          if (x > c.x1) { c.x1 = x; c.r = [x, y]; }
          if (y < c.y0) { c.y0 = y; c.t = [x, y]; }
          if (y > c.y1) { c.y1 = y; c.b = [x, y]; }
          if (x === 0) c.touch |= 1;
          if (x === W - 1) c.touch |= 2;
          if (y === 0) c.touch |= 4;
          if (y === H - 1) c.touch |= 8;
          if (x > 0 && m[i - 1] && !L[i - 1]) { L[i - 1] = lab; st[sp++] = i - 1; }
          if (x < W - 1 && m[i + 1] && !L[i + 1]) { L[i + 1] = lab; st[sp++] = i + 1; }
          if (y > 0 && m[i - W] && !L[i - W]) { L[i - W] = lab; st[sp++] = i - W; }
          if (y < H - 1 && m[i + W] && !L[i + W]) { L[i + W] = lab; st[sp++] = i + W; }
        }
        if (c.area < 10) continue;
        const cx = c.sx / c.area, cy = c.sy / c.area, nx = cx / W - 0.5, ny = cy / H - 0.5;
        let s = Math.sqrt(c.area) * Math.exp(-(nx * nx + ny * ny) / 0.08);
        const sides = (c.touch & 1) + ((c.touch >> 1) & 1) + ((c.touch >> 2) & 1) + ((c.touch >> 3) & 1);
        if (c.touch & 8) s *= 0.06;
        if (sides >= 2) s *= 0.1;
        if (c.area > N * 0.3) s *= 0.05;
        if (this.subj) s *= 1 + 2 * Math.exp(-Math.hypot(cx - this.subj.cx, cy - this.subj.cy) / 25);
        if (s > bestS) { bestS = s; best = c; c.cx = cx; c.cy = cy; }
      }
      if (!best || bestS < 1.5) { this.label = -1; return; }
      this.label = best.lab;
      // landmarks on the shape itself: along rays from its centre, the outline and a point inside
      const K = 20, rays = [], Lb = best.lab;
      for (let i = 0; i < K; i++) {
        const a = (i / K) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        let far = 0;
        for (let rr = 1; rr < 140; rr += 0.75) {
          const X = Math.round(best.cx + ca * rr), Y = Math.round(best.cy + sa * rr);
          if (X < 0 || Y < 0 || X >= W || Y >= H) break;
          if (L[Y * W + X] === Lb) far = rr;
        }
        rays.push(far);
      }
      const S = this.subj, k = S ? 0.35 : 1;
      const tgt = { x0: best.x0, y0: best.y0, x1: best.x1, y1: best.y1, cx: best.cx, cy: best.cy, area: best.area, l: best.l, r: best.r, t: best.t, b: best.b, rays };
      if (!S) { this.subj = JSON.parse(JSON.stringify(tgt)); return; }
      for (let i = 0; i < K; i++) S.rays[i] += (rays[i] - S.rays[i]) * 0.45;
      for (const key of ["x0", "y0", "x1", "y1", "cx", "cy", "area"]) S[key] += (tgt[key] - S[key]) * k;
      for (const key of ["l", "r", "t", "b"]) { S[key][0] += (tgt[key][0] - S[key][0]) * k; S[key][1] += (tgt[key][1] - S[key][1]) * k; }
    },
    weightAt(x, y) {
      const S = this.subj;
      if (!S) return 0.3;
      const ix = x | 0, iy = y | 0, L = this.labels;
      if (this.label > 0) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = ix + dx, Y = iy + dy;
        if (X >= 0 && Y >= 0 && X < AW && Y < AH && L[Y * AW + X] === this.label) return 1;
      }
      const dx = Math.max(S.x0 - x, 0, x - S.x1), dy = Math.max(S.y0 - y, 0, y - S.y1);
      const diag = Math.hypot(S.x1 - S.x0, S.y1 - S.y0) + 10;
      return Math.max(0.04, 0.55 * Math.exp(-Math.hypot(dx, dy) / (diag * 0.25)));
    },
    track() {
      const g = this.gray, p = this.prev, W = AW, H = AH, R = 3, SR = SEARCH, w = 2 * SR + 1, n = (2 * R + 1) ** 2;
      const sad = this.sad && this.sad.length === w * w ? this.sad : (this.sad = new Float32Array(w * w));
      const keep = [];
      for (const tr of this.tracks) {
        const px = Math.round(tr.x), py = Math.round(tr.y);
        if (px < R + 1 || py < R + 1 || px >= W - R - 1 || py >= H - R - 1) continue;
        const cx = Math.round(tr.x + tr.vx), cy = Math.round(tr.y + tr.vy);
        let best = 1e9, bx = 0, by = 0;
        for (let oy = -SR; oy <= SR; oy++) for (let ox = -SR; ox <= SR; ox++) {
          const qx = cx + ox, qy = cy + oy, si = (oy + SR) * w + ox + SR;
          if (qx < R || qy < R || qx >= W - R || qy >= H - R) { sad[si] = 1e9; continue; }
          let s = 0;
          for (let dy = -R; dy <= R; dy++) {
            const a = (py + dy) * W + px, b = (qy + dy) * W + qx;
            for (let dx = -R; dx <= R; dx++) s += Math.abs(p[a + dx] - g[b + dx]);
            if (s > best) break;
          }
          sad[si] = s;
          if (s < best) { best = s; bx = ox; by = oy; }
        }
        if (best / n > 0.075) continue; // lost it
        // sub-pixel: a parabola through the neighbours
        let sx = 0, sy = 0;
        const ix = bx + SR, iy = by + SR;
        if (ix > 0 && ix < w - 1) { const l = sad[iy * w + ix - 1], r = sad[iy * w + ix + 1], den = l - 2 * best + r; if (den > 1e-6 && l < 1e8 && r < 1e8) sx = clamp((0.5 * (l - r)) / den, -0.5, 0.5); }
        if (iy > 0 && iy < w - 1) { const u = sad[(iy - 1) * w + ix], dn = sad[(iy + 1) * w + ix], den = u - 2 * best + dn; if (den > 1e-6 && u < 1e8 && dn < 1e8) sy = clamp((0.5 * (u - dn)) / den, -0.5, 0.5); }
        const X = cx + bx + sx + (tr.x - px), Y = cy + by + sy + (tr.y - py);
        tr.vx = tr.vx * 0.5 + (X - tr.x) * 0.5;
        tr.vy = tr.vy * 0.5 + (Y - tr.y) * 0.5;
        tr.x = X; tr.y = Y; tr.age++;
        keep.push(tr);
      }
      this.tracks = keep;
    },
    // Shi-Tomasi corners, the best per cell, weighted toward the subject
    seed() {
      const g = this.gray, W = AW, H = AH, max = POINTS;
      if (this.tracks.length >= max) return;
      const Ix = this.ix, Iy = this.iy, A = this.a, B = this.b, C = this.c, T = this.tmp;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, gx = (g[i + 1] - g[i - 1]) * 0.5, gy = (g[i + W] - g[i - W]) * 0.5;
        Ix[i] = gx; Iy[i] = gy; A[i] = gx * gx; B[i] = gy * gy; C[i] = gx * gy;
      }
      for (const arr of [A, B, C]) {
        for (let y = 0; y < H; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; T[i] = arr[i - 2] + arr[i - 1] + arr[i] + arr[i + 1] + arr[i + 2]; }
        for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; arr[i] = T[i - 2 * W] + T[i - W] + T[i] + T[i + W] + T[i + 2 * W]; }
      }
      const CS = 6, cand = [];
      let top = 0;
      for (let cy0 = 4; cy0 < H - 4; cy0 += CS) for (let cx0 = 4; cx0 < W - 4; cx0 += CS) {
        let bl = 0, bx = 0, by = 0;
        for (let y = cy0; y < Math.min(H - 4, cy0 + CS); y++) for (let x = cx0; x < Math.min(W - 4, cx0 + CS); x++) {
          const i = y * W + x, a = A[i], b = B[i], c = C[i], l = (a + b) / 2 - Math.sqrt(((a - b) / 2) ** 2 + c * c);
          if (l > bl) { bl = l; bx = x; by = y; }
        }
        if (bl > 0) { cand.push({ x: bx, y: by, l: bl }); if (bl > top) top = bl; }
      }
      const thr = Math.max(0.0015, top * 0.02), bias = SUBJECT_BIAS;
      const ow = Math.ceil(W / 4), occ = new Uint8Array(ow * Math.ceil(H / 4));
      const mark = (x, y) => {
        const cx = (x / 4) | 0, cy = (y / 4) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < ow && Y < occ.length / ow) occ[Y * ow + X] = 1; }
      };
      for (const t of this.tracks) mark(t.x, t.y);
      for (const c of cand) c.s = c.l * (1 - bias + bias * 2 * this.weightAt(c.x, c.y));
      cand.sort((p, q) => q.s - p.s);
      let bgCount = 0;
      for (const t of this.tracks) if (t.w < 0.5) bgCount++;
      for (const c of cand) {
        if (this.tracks.length >= max) break;
        const w = this.weightAt(c.x, c.y);
        // on the subject a fainter corner will do; off it, only so many
        if (c.l < (w >= 0.9 ? thr * 0.25 : thr) || occ[((c.y / 4) | 0) * ow + ((c.x / 4) | 0)]) continue;
        if (w < 0.5) { if (bgCount >= max * 0.3) continue; bgCount++; }
        this.tracks.push({ id: this.uid++, x: c.x, y: c.y, vx: 0, vy: 0, age: 0, w: 0.5 });
        mark(c.x, c.y);
      }
    },
    // two tracks that have slid onto the same feature: keep the older
    thin() {
      const out = [], ow = Math.ceil(AW / 3), occ = new Set();
      for (const t of [...this.tracks].sort((a, b) => b.age - a.age)) {
        const k = ((t.y / 3) | 0) * ow + ((t.x / 3) | 0);
        if (occ.has(k)) continue;
        occ.add(k);
        out.push(t);
      }
      this.tracks = out;
    },
  };
  return Tk;
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;background:#0b0d0c";
  host.append(canvas);
  const g = canvas.getContext("2d", { alpha: false });
  const net = new ThinkNet({ nodes: v["network.nodes"], outerNodes: OUTER_NODES, tiles: v["network.tiles"], arcs: v["network.arcs"], lineOpacity: v["network.lines"], line: v["colour.line"], arc: ARC, signal: v["colour.signal"] });
  const Tk = tracker();

  // footage: two players per clip, so a clip can crossfade into its own next loop
  const player = (src) => {
    const el = document.createElement("video");
    Object.assign(el, { muted: true, playsInline: true, preload: "auto" });
    el.setAttribute("muted", "");
    el.setAttribute("playsinline", "");
    el.style.display = "none";
    el.src = src;
    host.append(el);
    return el;
  };
  const players = CLIPS.map((c) => [player(c.src), player(c.src)]);
  const clipIx = (id) => Math.max(0, CLIPS.findIndex((c) => c.id === id));
  let cur = null, nxt = null, fadeT0 = 0, wall = 0, gen = 0, analysed = null, lastTime = -1;
  let wantClip = clipIx(v["footage.clip"]);

  function startShot(ci, loopN, fade) {
    const busy = [cur && cur.el, nxt && nxt.el];
    const el = players[ci].find((e) => !busy.includes(e)) || players[ci][0];
    // (a still piece is on its first frame already; seeking it again would only blank it)
    if (el.currentTime > 0) try { el.currentTime = 0; } catch { /* not loaded */ }
    el.playbackRate = v["footage.speed"];
    if (!reduced) el.play().catch(() => {});
    const shot = { ci, el, loop: loopN };
    if (nxt && nxt.el !== el) nxt.el.pause();
    if (!cur || fade <= 0) {
      if (cur && cur.el !== el) cur.el.pause();
      const changed = !cur || cur.ci !== ci;
      cur = shot;
      nxt = null;
      dominant(changed);
    } else {
      nxt = shot;
      fadeT0 = wall;
      nxt.switched = false;
    }
  }
  // the network re-reads the frame when the footage changes under it
  function dominant(changed) {
    if (!changed) return;
    gen++;
    Tk.reset();
    net.nextLock = net.t + 2.2;
  }
  function schedule() {
    if (!cur) return;
    const el = cur.el, d = el.duration;
    if (!nxt && d && isFinite(d) && !reduced) {
      const left = (d - el.currentTime) / Math.max(0.05, v["footage.speed"]);
      if (el.ended || left <= CROSSFADE + 0.02) {
        const done = cur.loop + 1;
        const go = done >= LOOPS ? (cur.ci + 1) % CLIPS.length : cur.ci;
        startShot(go, go === cur.ci ? done : 0, CROSSFADE);
      }
    }
    if (nxt) {
      const k = (wall - fadeT0) / CROSSFADE;
      if (k >= 0.5 && !nxt.switched) { nxt.switched = true; const changed = nxt.ci !== cur.ci; analysed = null; dominant(changed); }
      if (k >= 1) { if (cur.el !== nxt.el) cur.el.pause(); cur = nxt; nxt = null; }
    }
  }
  const source = () => (nxt && nxt.switched ? nxt.el : cur && cur.el);

  // frame mapping
  let W = 1, H = 1, dpr = 1, map = { s: 1, ox: 0, oy: 0, k: 1, vw: 720, vh: 544 };
  const cover = (el) => {
    const vw = (el && el.videoWidth) || 720, vh = (el && el.videoHeight) || 544, s = Math.max(W / vw, H / vh);
    return { s, ox: (W - vw * s) / 2, oy: (H - vh * s) / 2, vw, vh, k: (vw / AW) * s };
  };
  function measure(x, y) {
    const gr = Tk.gray, AH = Tk.AH;
    if (!gr || !Tk.prev) return { lum: 0.4, ang: 0 };
    const ax = clamp((x - map.ox) / map.k, 1, AW - 2.001), ay = clamp((y - map.oy) / map.k, 1, AH - 2.001);
    const x0 = ax | 0, y0 = ay | 0, u = ax - x0, w = ay - y0, i = y0 * AW + x0;
    const lum = (gr[i] * (1 - u) + gr[i + 1] * u) * (1 - w) + (gr[i + AW] * (1 - u) + gr[i + AW + 1] * u) * w;
    const gx = gr[i + 1] - gr[i - 1], gy = gr[i + AW] - gr[i - AW];
    const j = Math.min(AW * AH - 1 - 2 * AW - 2, Math.max(2 * AW + 2, i));
    const edge = Math.abs(gr[j + 2] - gr[j - 2]) + Math.abs(gr[j + 2 * AW] - gr[j - 2 * AW]);
    return { lum, ang: Math.atan2(-gy, gx), edge };
  }

  // grain and grade
  const grainTiles = [0, 1, 2, 3].map(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const x = c.getContext("2d"), id = x.createImageData(160, 160), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = 128 + ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 190; d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255; }
    x.putImageData(id, 0, 0);
    return c;
  });
  let patterns = null, vig = null, vigKey = "";

  // the cursor: a feature the network can bind, and a click locks on round it
  const ptr = { x: 0, y: 0, in: false };
  const toLocal = (e) => {
    const r = host.getBoundingClientRect();
    ptr.x = e.clientX - r.left;
    ptr.y = e.clientY - r.top;
  };
  const onMove = (e) => { toLocal(e); ptr.in = true; };
  const onLeave = () => { ptr.in = false; };
  const onDown = (e) => { toLocal(e); ptr.in = e.pointerType === "mouse"; lockAt(ptr.x, ptr.y); };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("pointerdown", onDown);
  let anchors = [];
  function lockAt(x, y) {
    const near = anchors.map((a) => [a, Math.hypot(a.x - x, a.y - y)]).sort((p, q) => p[1] - q[1]).slice(0, 6).filter((p) => p[1] < 160).map((p) => p[0].key);
    if (near.length < 2) { net.lockOn(); return; }
    net.lockOn(near);
    if (net.lock) net.lock.free = true;
    if (reduced) paint();
  }

  function analyseAndStep(dt) {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = Math.max(2, Math.round(W * dpr)), ch = Math.max(2, Math.round(H * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; vigKey = ""; patterns = null; }
    if (!cur && players[wantClip][0].readyState >= 2) startShot(wantClip, 0, 0);
    schedule();
    const src = source();
    if (src) {
      map = cover(src);
      // a new frame of footage: read it
      if (src.readyState >= 2 && (src !== analysed || src.currentTime !== lastTime)) {
        analysed = src;
        lastTime = src.currentTime;
        Tk.analyse(src);
      }
    }
    // the network reads the frame
    anchors = [];
    const toS = (x, y) => [map.ox + x * map.k, map.oy + y * map.k];
    for (const t of Tk.tracks) { const [x, y] = toS(t.x, t.y); anchors.push({ key: "t" + t.id, x, y, w: t.w }); }
    let subject = null;
    const S = Tk.subj;
    if (S && Tk.prev) {
      const [x0, y0] = toS(S.x0, S.y0), [x1, y1] = toS(S.x1 + 1, S.y1 + 1), [cx, cy] = toS(S.cx, S.cy);
      subject = { x0, y0, x1, y1, cx, cy };
      // the shape's own landmarks: its centre and its four extremes, and points round its outline
      anchors.push({ key: `s${gen}c`, x: cx, y: cy, w: 1, tau: 0.2 });
      for (const e of ["l", "r", "t", "b"]) { const [x, y] = toS(S[e][0], S[e][1]); anchors.push({ key: `s${gen}${e}`, x, y, w: 1, tau: 0.18 }); }
      S.rays.forEach((rr, i) => {
        if (rr < 2) return;
        const a = (i / S.rays.length) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const [ox, oy] = toS(S.cx + ca * rr, S.cy + sa * rr);
        anchors.push({ key: `s${gen}o${i}`, x: ox, y: oy, w: 1, tau: 0.14 });
        if (i % 2 === 0) { const [ix, iy] = toS(S.cx + ca * rr * 0.55, S.cy + sa * rr * 0.55); anchors.push({ key: `s${gen}i${i}`, x: ix, y: iy, w: 1, tau: 0.14 }); }
      });
    }
    if (ptr.in) anchors.push({ key: "ptr", x: ptr.x, y: ptr.y, w: 1, tau: 0.06 });
    // the network's size is for 1440 x 900; it scales with the frame
    const scale = clamp(Math.sqrt((W * H) / (1440 * 900)), 0.55, 1.25);
    net.set({ nodes: Math.round(v["network.nodes"] * scale), outerNodes: Math.round(OUTER_NODES * Math.min(1, scale * 1.1)), tiles: v["network.tiles"], arcs: v["network.arcs"], lineOpacity: v["network.lines"], line: v["colour.line"], signal: v["colour.signal"] });
    net.step(dt, { W, H, anchors, subject, measure, sample: src ? { src, map: (x, y, w, h) => [(x - map.ox) / map.s, (y - map.oy) / map.s, w / map.s, h / map.s] } : null });
  }

  function paint() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#0b0d0c";
    g.fillRect(0, 0, W, H);
    // the footage, graded a little toward found footage
    g.filter = `brightness(${BRIGHTNESS}) contrast(${CONTRAST}) saturate(${SATURATION})`;
    const drawShot = (shot, a) => {
      if (!shot || shot.el.readyState < 2) return;
      const m = cover(shot.el);
      g.globalAlpha = a;
      g.drawImage(shot.el, m.ox, m.oy, m.vw * m.s, m.vh * m.s);
    };
    drawShot(cur, 1);
    if (nxt) drawShot(nxt, clamp((wall - fadeT0) / CROSSFADE, 0, 1));
    g.filter = "none";
    g.globalAlpha = 1;
    if (!reduced) {
      const f = (Math.random() - 0.5) * FLICKER * 0.06 + (Math.random() < 0.015 ? FLICKER * 0.05 : 0);
      g.fillStyle = f > 0 ? `rgba(255,255,255,${f})` : `rgba(0,0,0,${-f})`;
      g.fillRect(0, 0, W, H);
    }
    const vk = [W, H, v["grade.vignette"]].join();
    if (vk !== vigKey) {
      vigKey = vk;
      const R = Math.hypot(W, H) / 2;
      vig = g.createRadialGradient(W / 2, H / 2, R * 0.35, W / 2, H / 2, R);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, `rgba(0,0,0,${v["grade.vignette"] * 0.75})`);
    }
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
    if (v["grade.grain"] > 0) {
      if (!patterns) patterns = grainTiles.map((c) => g.createPattern(c, "repeat"));
      const ox = Math.random() * 160, oy = Math.random() * 160;
      g.save();
      g.globalCompositeOperation = "overlay";
      g.globalAlpha = Math.min(1, v["grade.grain"] * 0.6);
      g.translate(-ox, -oy);
      g.fillStyle = patterns[(Math.random() * 4) | 0];
      g.fillRect(0, 0, W + 160, H + 160);
      g.restore();
    }
    net.draw(g, dpr);
  }

  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  function frame(ms) {
    raf = 0;
    const dt = last ? Math.min(0.05, (ms - last) / 1000) : 0;
    last = ms;
    wall += dt;
    analyseAndStep(dt);
    paint();
    if (running()) raf = requestAnimationFrame(frame);
  }
  const running = () => !reduced && onScreen && tabVisible;
  function loop() {
    if (!running()) return;
    for (const el of [cur?.el, nxt?.el]) el?.play().catch(() => {});
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    for (const p of players.flat()) p.pause();
  }

  // reduced motion: the first frame of the clip, read once, and the network grown on it for a few seconds at once
  let settled = false;
  function settle() {
    if (settled || players[wantClip][0].readyState < 2) return;
    settled = true;
    analyseAndStep(0);
    for (let i = 0; i < 120; i++) analyseAndStep(1 / 30);
    paint();
  }
  const onReady = () => {
    if (!reduced) return loop();
    settled = false;
    settle();
  };
  for (const p of players.flat()) { p.addEventListener("loadeddata", onReady); p.addEventListener("seeked", onReady); }

  const ro = new ResizeObserver(() => {
    if (!reduced || !settled) return;
    analyseAndStep(0);
    paint();
  });
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
  loop();

  return {
    update(values, path) {
      Object.assign(v, values);
      if (path === null || path === "footage.clip") {
        const ci = clipIx(v["footage.clip"]);
        if (ci !== wantClip) {
          wantClip = ci;
          if (cur && cur.ci !== ci) {
            if (nxt) { cur = nxt; nxt = null; }
            startShot(ci, 0, reduced ? 0 : CROSSFADE);
          }
          if (reduced) { settled = false; const p = players[ci][0]; p.readyState >= 2 ? settle() : null; return; }
        }
      }
      if (path === null || path === "footage.speed") for (const p of players.flat()) p.playbackRate = v["footage.speed"];
      if (reduced && settled) { analyseAndStep(0); paint(); }
    },
    action(name) {
      if (name !== "lock") return;
      net.lock = null;
      net.lockOn();
      if (reduced) paint();
    },
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      for (const p of players.flat()) {
        p.removeEventListener("loadeddata", onReady);
        p.removeEventListener("seeked", onReady);
        p.removeAttribute("src");
        p.load();
        p.remove();
      }
      canvas.remove();
    },
  };
}
