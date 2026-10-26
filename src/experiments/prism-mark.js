/* Prism mark (Rime).

   Ported from the Prism hero in the Creative Studio (clients/rime/designs/
   system/prsm-hero.js, the canvas behind brand-pages/PRSM-hero.html). Two
   voices, a dot at either side, and between them the Prism: the mark's
   triangle stood up as a tetrahedron of tinted glass.

   Refraction, the landing page's own motion: a packet of white light leaves
   one dot as a flat line of circles, folds into the turning glass, comes out
   of the far side split into the spectrum, opens into a fan twice over and
   gathers into the listener's dot, colouring towards it as it lands. The
   prism rolls a full turn on every passage, then turns to face the other
   voice, which answers. Every circle is mixed the site's way: multiplied on
   white, masked to its own coverage, then laid on the dark ground, so the
   overlaps stay pigment colours whatever the ground.

   Waveform, the earlier study: the words ride a wave as stacks of blended
   circles, fold flat into an opaque pyramid that spins up when struck, and
   come out in the listener's colours. Its spin is planned at the strike so
   it brakes square onto the face that looks at the next voice. */

export const params = {
  motion: {
    mode: { type: "select", options: ["Refraction", "Waveform"] },
    speed: [1.05, 0.2, 3, 0.05],
    spin: [0.28, 0, 2, 0.01],
  },
  prism: {
    size: [0.26, 0.12, 0.45, 0.01],
    glass: [0.86, 0.2, 1, 0.01],
    fan: [2.2, 1, 4, 0.05],
  },
  colour: {
    ground: "#2e2a25",
    prism: "#ffa0ff",
    left: "#ffd46f",
    right: "#8be89a",
  },
  restart: { type: "action", label: "Restart" },
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);
const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (v) => "#" + v.map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, "0")).join("");
const mix = (a, b, k) => {
  const A = hex2(a), B = hex2(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * k));
};
const easeBack = (t, c1 = 0.9) => {
  const c2 = c1 * 1.525;
  return t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2;
};

/* Rime's numbers, as the hero tool had them. The waveform study runs on the
   base set; refraction is the landing page's preset over it. */
const BASE = {
  motionMode: "classic", faceBlend: "screen",
  spectrum: ["#ffa0ff", "#ffd46f", "#8be89a", "#2cc3e9", "#ff756f"],
  ground: "#2e2a25", arrow: "#ffa0ff", dotA: "#ffd46f", dotB: "#8be89a",
  voiceA: ["#ffcf61", "#ff756f", "#ff96ff"], voiceB: ["#8be89a", "#13bee9", "#2c9859"],
  waveA: 1, waveB: 0.72, refract: true, blend: "burn",
  count: 5, radius: 11, overlap: 0.35, colGap: 2.2, words: 26, speed: 240,
  amp: 1, wavelength: 420, waveSpeed: 1.4,
  arrowSize: 0.2, lineY: 0.5, pause: 0.55, turn: 0.8, dots: true, speedMul: 1.5,
  arrowShape: 0.866, turnDir: 1, dotSize: 1.3, dotX: 0.07, dotPulse: 0, jitter: 0,
  emerge: 4, suck: 170, suckPull: 0, inside: 1, exit: 4, land: 140, landPull: 0,
  faceBack: "#2cc3e9", faceA: "#ffd46f", faceB: "#8be89a",
  spin: 3.2, strike: 0.45, brake: 1.3, slack: 1.2, drift: 36, driftRate: 3.5,
  sway: 0.12, swaySpeed: 0.7, appear: 1.1, faceAlpha: 1, whiteIn: 0, lineIn: 0, fanOut: 1, idleSpin: 0, passRoll: 0,
};
const REFRACTION = {
  spectrum: ["#ffa0ff", "#ffd46f", "#2cc3e9", "#ffa0ff", "#ffd46f"],
  motionMode: "refraction", faceAlpha: 0.86, faceBlend: "multiply", blend: "burn",
  radius: 9, count: 5, colGap: 2.35, words: 22, speed: 280, speedMul: 1.05,
  pause: 0.15, turn: 1.1, drift: 0, idleSpin: 0.28, passRoll: 0, sway: 0.13,
  whiteIn: 1, lineIn: 1, fanOut: 2.2, dotSize: 1.55, appear: 0.8,
  arrow: "#ffa0ff", faceBack: "#2cc3e9", faceA: "#ffd46f", faceB: "#ffffff",
};

/* The engine, as it was, less its own observers (the module owns the loop). */
class PrsmHero {
  constructor(canvas, opts, reduced) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.off = document.createElement("canvas");
    this.og = this.off.getContext("2d");
    this.s = Object.assign({}, BASE, opts);
    this.reduced = reduced;
    this.reset();
    this.resize();
  }
  set(patch) {
    const mode = this.s.motionMode;
    Object.assign(this.s, patch);
    if (mode !== this.s.motionMode) this.reset();
  }
  reset() {
    Object.assign(this, { appear: 0, t: 0, speaker: 0, phase: "speak", cols: [], spawned: 0, spawnT: 0, struck: false, angle: 0, from: 0, turnT: 0, wait: 0, lastSpawn: [-9, -9], yaw: 0, pitch: 0, rest: 0, faceLeft: false, swayT: 0, omega: 0, spin: "rest", plan: null, runT: 0, rollA: 0, drift: 0, driftV: 0, driftTo: 0, edgeL: null, edgeR: null, prismPulse: 0, passSpin: null });
    if (this.s.motionMode === "refraction") {
      this.yaw = 0.25;
      this.pitch = -0.3;
    }
  }
  resize() {
    const c = this.canvas, previousWidth = this.W;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = c.clientWidth || 1;
    this.H = c.clientHeight || 1;
    if (previousWidth && this.s.motionMode === "refraction") {
      const scale = this.W / previousWidth;
      this.cols.forEach((word) => {
        word.x *= scale;
        if (word.entry !== undefined) {
          word.entry *= scale;
          word.depth *= scale;
        }
      });
    }
    c.width = this.off.width = Math.max(1, Math.floor(this.W * this.dpr));
    c.height = this.off.height = Math.max(1, Math.floor(this.H * this.dpr));
  }
  geo() {
    const s = this.s, W = this.W, H = this.H;
    const breath = s.motionMode === "refraction" ? 0.68 + 0.4 * (this.prismPulse || 0) : 1;
    // on a tall stage the prism is sized by the width, so it still fits between the voices
    const base = Math.min(H, W * 1.35) * s.arrowSize * breath, hx = base * s.arrowShape;
    const cx = W / 2 + this.drift, cy = H * s.lineY;
    return { cx, cy, base, hx, dotA: { x: W * s.dotX, y: cy }, dotB: { x: W * (1 - s.dotX), y: cy } };
  }
  tick(dt) {
    if (this.s.motionMode === "refraction") return this.tickOptics(dt);
    const s = this.s;
    dt *= s.speedMul;
    this.t += dt;
    if (this.appear < 1) this.appear = s.appear > 0 ? Math.min(1, this.appear + dt / s.appear) : 1;
    const G = this.geo(), dir = this.speaker === 0 ? 1 : -1, listener = 1 - this.speaker;
    const P = this.project(G), xs = P.map((v) => v[0]), rawL = G.cx + Math.min(...xs), rawR = G.cx + Math.max(...xs);
    if (this.edgeL === null) {
      this.edgeL = rawL;
      this.edgeR = rawR;
    }
    const f = Math.min(1, dt * 5);
    this.edgeL += (rawL - this.edgeL) * f;
    this.edgeR += (rawR - this.edgeR) * f;
    const xL = this.edgeL, xR = this.edgeR, xBase = dir > 0 ? xL : xR, xApex = dir > 0 ? xR : xL;
    const from = this.speaker === 0 ? G.dotA : G.dotB, to = listener === 0 ? G.dotA : G.dotB, sgn = s.turnDir < 0 ? -1 : 1;
    if (this.phase === "speak") {
      this.spawnT += dt;
      const every = (s.colGap * s.radius) / s.speed;
      if (this.appear >= 1 && this.spawned < s.words && (!this.spawned || this.spawnT >= every)) {
        this.spawnT = this.spawned ? this.spawnT - every : 0;
        this.spawned++;
        this.lastSpawn[this.speaker] = this.t;
        this.cols.push({ x: from.x, i: this.spawned, stage: "out", e: 0, s: 0, g: 0, run: 0 });
      }
      this.cols.forEach((c) => {
        if (c.stage === "out") {
          c.run += s.speed * dt;
          c.g = 0.45 + 0.55 * smooth(clamp(c.run / (s.radius * 1.2), 0, 1));
          c.e = smooth(clamp(c.run / (s.radius * Math.max(0.5, s.emerge)), 0, 1));
          c.x = from.x + dir * c.run;
          const d = dir > 0 ? xBase - c.x : c.x - xBase;
          c.s = smooth(clamp(1 - d / s.suck, 0, 1));
          c.run += s.speed * dt * s.suckPull * c.s * c.s;
          if (d <= 0) {
            c.stage = "in";
            c.run = 0;
          }
        } else if (c.stage === "in") {
          c.x += dir * s.speed * s.inside * dt;
          if (dir > 0 ? c.x >= xApex : c.x <= xApex) {
            c.stage = "back";
            c.run = 0;
            c.e = 0;
            c.s = 0;
            c.g = 0.5;
          }
        } else if (c.stage === "back") {
          const d0 = dir > 0 ? to.x - c.x : c.x - to.x;
          c.s = smooth(clamp(1 - d0 / s.land, 0, 1));
          const step = s.speed * dt * (1 + s.landPull * c.s * c.s);
          c.x += dir * step;
          c.run += step;
          c.g = 0.5 + 0.5 * smooth(clamp(c.run / (s.radius * 1.2), 0, 1));
          c.e = smooth(clamp(c.run / (s.radius * Math.max(0.5, s.exit)), 0, 1));
          if ((dir > 0 ? to.x - c.x : c.x - to.x) <= 0) c.stage = "done";
        }
      });
      this.cols = this.cols.filter((c) => c.stage !== "done");
      if (this.spawned >= s.words && !this.cols.length) {
        this.phase = "wait";
        this.wait = s.pause;
      }
    } else if (this.phase === "wait") {
      this.wait -= dt;
      if (this.wait <= 0 && this.spin === "rest") {
        this.speaker = 1 - this.speaker;
        this.phase = "speak";
        this.spawned = 0;
        this.spawnT = 0;
        this.struck = false;
      }
    }
    const reach = s.radius * 0.75, onEdge = (c) => c.stage === "out" && (dir > 0 ? xBase - c.x : c.x - xBase) <= reach;
    if (!this.struck && this.phase === "speak" && this.cols.some(onEdge)) {
      this.struck = true;
      this.planSpin(G, sgn);
      this.driftTo = dir * s.drift;
    }
    if (this.spin === "run") {
      const p = this.plan;
      this.runT += dt;
      const t = Math.min(this.runT, p.T);
      let w, d;
      if (t < p.up) {
        w = (p.w * t) / p.up;
        d = (0.5 * p.w * t * t) / p.up;
      } else if (t < p.T - p.dn) {
        w = p.w;
        d = 0.5 * p.w * p.up + p.w * (t - p.up);
      } else {
        const r = p.T - t;
        w = (p.w * r) / p.dn;
        d = p.D - (0.5 * p.w * r * r) / p.dn;
      }
      this.yaw = p.from + p.sgn * d;
      this.omega = p.sgn * w;
      this.swayT += dt;
      const a = clamp((w / Math.max(0.1, s.spin)) * 1.3, 0, 1);
      this.pitch = a * s.sway * Math.sin(this.swayT * s.swaySpeed + 1.1);
      if (this.runT >= p.T) {
        this.spin = "rest";
        this.faceLeft = !this.faceLeft;
        this.yaw = (((p.from + p.sgn * p.D) % TAU) + TAU) % TAU;
        this.rest = this.yaw;
        this.omega = 0;
        this.pitch = 0;
        this.swayT = 0;
      }
    } else if (s.idleSpin) {
      this.yaw = (this.yaw + s.idleSpin * dt) % TAU;
      this.omega = s.idleSpin;
    }
    if (this.spin !== "run") this.pitch = 0;
    if (s.passRoll && this.cols.some((c) => c.stage === "in")) this.rollA += s.passRoll * dt;
    else this.rollA += (0 - this.rollA) * Math.min(1, dt * 2.2);
    this.pitch += this.rollA;
    const r = s.driftRate, acc = -r * r * (this.drift - this.driftTo) - 1.5 * r * this.driftV;
    this.driftV += acc * dt;
    this.drift += this.driftV * dt;
  }
  opticsPose(who) {
    return who === 0 ? 0.25 : this.flip(this.geo()) - 0.25;
  }
  settleOptics() {
    // the still: the first voice mid-sentence, the prism turned toward it
    this.appear = 1;
    this.speaker = 0;
    this.yaw = this.opticsPose(0);
    this.pitch = -0.3;
    this.prismPulse = 1;
    const G = this.geo(), span = G.dotB.x - G.dotA.x;
    this.cols = Array.from({ length: 17 }, (_, i) => ({ x: G.dotA.x + (span * (i + 1)) / 18, i }));
  }
  tickOptics(dt) {
    const s = this.s;
    dt *= s.speedMul;
    this.t += dt;
    this.appear = Math.min(1, this.appear + dt / Math.max(0.05, s.appear));
    this.yaw = (this.yaw + s.idleSpin * dt) % TAU;
    this.pitch = -0.3 + this.rollA + 0.055 * Math.sin(this.t * 0.9);
    if (this.appear < 1) return;
    const G = this.geo(), dir = this.speaker === 0 ? 1 : -1;
    const from = this.speaker === 0 ? G.dotA : G.dotB, to = this.speaker === 0 ? G.dotB : G.dotA;
    const radius = Math.min(s.radius, this.W * 0.015), gap = radius * s.colGap;
    const speed = s.speed * clamp(this.W / 1000, 0.6, 1.15);
    const total = Math.max(3, Math.min(Math.round(s.words), Math.floor((Math.abs(to.x - from.x) / gap) * 0.48)));
    if (this.phase === "speak") {
      this.spawnT += dt;
      const every = gap / speed;
      while (this.spawned < total && (this.spawned === 0 || this.spawnT >= every)) {
        this.spawnT = this.spawned ? this.spawnT - every : 0;
        this.spawned++;
        this.cols.push({ x: from.x, i: this.spawned });
        this.lastSpawn[this.speaker] = this.t;
      }
      this.cols.forEach((c) => {
        c.x += dir * speed * dt;
      });
      this.cols = this.cols.filter((c) => dir * (to.x - c.x) > 0);
      const O = this.opticsGeometry();
      if (!this.passSpin && this.cols.some((c) => dir * (c.x - O.entry) >= 0)) {
        // one revolution spans the whole packet, first entry to last exit
        const tail = this.cols[this.cols.length - 1];
        this.passSpin = { time: 0, duration: Math.max(1.7, (1.3 * (Math.max(0, dir * (O.exit - tail.x)) + Math.max(0, total - this.spawned) * gap)) / speed) };
        this.spin = "run";
      }
      // colour is gained on contact and kept as a face turns away
      this.cols.forEach((c) => {
        if (c.entry === undefined && dir * (c.x - O.entry) >= 0) {
          c.entry = O.entry;
          c.depth = Math.max(1, Math.abs(O.exit - O.entry));
        }
      });
      if (this.spawned >= total && !this.cols.length) {
        this.phase = "wait";
        this.wait = s.pause;
      }
    } else if (this.phase === "wait") {
      this.wait -= dt;
      if (this.wait <= 0 && (!this.passSpin || this.passSpin.time >= this.passSpin.duration)) {
        this.phase = "turn";
        this.spin = "run";
        this.turnT = 0;
        this.from = this.yaw;
        this.turnTo = this.from + (this.opticsPose(1 - this.speaker) - this.opticsPose(this.speaker));
      }
    } else if (this.phase === "turn") {
      this.turnT += dt;
      const u = clamp(this.turnT / Math.max(0.3, s.turn), 0, 1);
      const ease = u * u * u * (u * (u * 6 - 15) + 10);
      this.yaw = this.from + (this.turnTo - this.from) * ease + s.idleSpin * this.turnT;
      if (u >= 1) {
        this.speaker = 1 - this.speaker;
        this.spin = "rest";
        this.phase = "speak";
        this.spawned = 0;
        this.spawnT = 0;
        this.passSpin = null;
        this.rollA = 0;
        this.yaw = ((this.yaw % TAU) + TAU) % TAU;
      }
    }
    if (this.passSpin && this.phase !== "turn") {
      const p = this.passSpin;
      p.time = Math.min(p.duration, p.time + dt);
      const u = p.time / p.duration;
      this.rollA = TAU * smooth(u);
      if (u >= 1) this.spin = "rest";
    }
    const O = this.opticsGeometry();
    const nearGlass = this.cols.some((c) => {
      const approach = O.dir * (c.x - O.entry);
      return approach >= -radius * 2.5 && O.dir * (O.exit - c.x) >= -radius;
    });
    this.prismPulse += ((nearGlass ? 1 : 0) - this.prismPulse) * Math.min(1, dt * (nearGlass ? 7 : 3.5));
    this.pitch = -0.3 + this.rollA + 0.055 * Math.sin(this.t * 0.9);
    this.drift = 0;
  }
  opticsGeometry() {
    const G = this.geo(), R = this.project(G), cuts = [];
    // the light meets the silhouette at the centreline; all six edges take part
    [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].forEach(([i, j]) => {
      const a = R[i], b = R[j];
      if ((a[1] <= 0 && b[1] >= 0) || (b[1] <= 0 && a[1] >= 0)) {
        const t = Math.abs(b[1] - a[1]) < 0.0001 ? 0 : -a[1] / (b[1] - a[1]);
        cuts.push(G.cx + a[0] + (b[0] - a[0]) * t);
      }
    });
    if (!cuts.length) cuts.push(G.cx);
    const dir = this.speaker === 0 ? 1 : -1;
    const entry = dir > 0 ? Math.min(...cuts) : Math.max(...cuts);
    const exit = dir > 0 ? Math.max(...cuts) : Math.min(...cuts);
    const from = this.speaker === 0 ? G.dotA.x : G.dotB.x;
    const to = this.speaker === 0 ? G.dotB.x : G.dotA.x;
    const reach = Math.max(1, Math.abs(to - entry));
    return { ...G, dir, entry, exit, from, to, reach, fan: Math.min(this.s.fanOut * 30, reach * 0.19, G.base * 0.28) };
  }
  opticsSample(x, lane, O) {
    const q = clamp((O.dir * (x - O.entry)) / O.reach, 0, 1);
    // two full swells after the exit: open, gather, open, arrive
    const exitQ = clamp(Math.abs(O.exit - O.entry) / O.reach, 0.05, 0.9);
    const outgoing = clamp((O.dir * (x - O.exit)) / Math.max(1, Math.abs(O.to - O.exit)), 0, 1);
    const fanShape = q <= exitQ ? 0.45 * Math.pow(Math.sin((Math.PI * q) / exitQ), 2) : Math.pow(Math.sin(TAU * outgoing), 2);
    const spread = O.fan * fanShape;
    const colour = smooth(clamp((q / exitQ - 0.38) / 0.48, 0, 1));
    const arrival = smooth(clamp((outgoing - 0.65) / 0.35, 0, 1));
    return { y: O.cy + lane * spread, spread, colour, arrival, swell: fanShape };
  }
  opticsCircles(fn) {
    const s = this.s, O = this.opticsGeometry();
    const n = Math.max(1, Math.round(s.count)), mid = (n - 1) / 2, centre = Math.floor(n / 2);
    const r = Math.min(s.radius, this.W * 0.015);
    this.cols.forEach((c) => {
      const start = smooth(clamp(Math.abs(c.x - O.from) / (r * 2), 0, 1));
      for (let j = 0; j < n; j++) {
        const lane = (j - mid) / Math.max(1, mid), P = this.opticsSample(c.x, lane, O), offset = Math.abs(P.y - O.cy);
        const bud = j === centre ? 1 : smooth(clamp(offset / (r * 1.8), 0, 1));
        const radius = r * (0.72 + 0.28 * start) * bud * (c.entry === undefined ? 1 : 0.8 + 0.2 * P.swell);
        if (radius < 0.3) continue;
        const colour = c.entry === undefined ? (this.still ? P.colour : 0) : P.colour;
        const pal = s.spectrum, spectral = mix("#ffffff", pal[j % pal.length], colour);
        const destination = this.speaker === 0 ? s.dotB : s.dotA;
        fn(c.x, P.y, radius, mix(spectral, destination, P.arrival), colour);
      }
    });
  }
  glassLayer(g, G, front, appear) {
    const s = this.s, R = this.project(G), faces = this.faces(G, true);
    g.save();
    g.translate(G.cx, G.cy);
    g.scale(0.94 + 0.06 * appear, 0.94 + 0.06 * appear);
    if (!front) {
      // a lit acrylic volume, so the tinted planes have light to filter
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = appear * 0.92;
      g.fillStyle = "#f8f3ea";
      g.beginPath();
      faces.filter((f) => f.front).forEach((f) => {
        f.idx.forEach((k, j) => (j ? g.lineTo(R[k][0], R[k][1]) : g.moveTo(R[k][0], R[k][1])));
        g.closePath();
      });
      g.fill();
    }
    g.globalCompositeOperation = s.faceBlend;
    faces.filter((f) => f.front === front).forEach((f) => {
      g.beginPath();
      f.idx.forEach((k, j) => (j ? g.lineTo(R[k][0], R[k][1]) : g.moveTo(R[k][0], R[k][1])));
      g.closePath();
      g.fillStyle = f.colour;
      g.globalAlpha = appear * s.faceAlpha;
      g.fill();
    });
    g.restore();
  }
  drawOptics() {
    const g = this.g, s = this.s, O = this.opticsGeometry(), d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = s.ground;
    g.fillRect(0, 0, this.W, this.H);
    const appear = smooth(this.appear);
    this.glassLayer(g, O, false, appear);
    this.glassLayer(g, O, true, appear);
    const circles = [];
    this.opticsCircles((x, y, r, col, energy) => {
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(r) && r > 0) circles.push({ x, y, r, col, energy });
    });
    if (circles.length) {
      const o = this.og;
      // a faint coloured halo behind the blended layer
      g.save();
      g.globalAlpha = 0.16;
      circles.forEach(({ x, y, r, col, energy }) => {
        if (energy < 0.01) return;
        g.shadowColor = col;
        g.shadowBlur = energy * r;
        g.fillStyle = col;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      });
      g.restore();
      o.setTransform(d, 0, 0, d, 0, 0);
      o.globalAlpha = 1;
      o.globalCompositeOperation = "source-over";
      o.fillStyle = "#ffffff";
      o.fillRect(0, 0, this.W, this.H);
      o.globalCompositeOperation = "multiply";
      circles.forEach(({ x, y, r, col }) => {
        o.fillStyle = col;
        o.beginPath();
        o.arc(x, y, r, 0, TAU);
        o.fill();
      });
      o.globalCompositeOperation = "destination-in";
      o.fillStyle = "#000000";
      o.beginPath();
      circles.forEach(({ x, y, r }) => {
        o.moveTo(x + r, y);
        o.arc(x, y, r, 0, TAU);
      });
      o.fill();
      g.drawImage(this.off, 0, 0, this.W, this.H);
    }
    if (s.dots)
      [[O.dotA, s.dotA], [O.dotB, s.dotB]].forEach(([p, col]) => {
        g.fillStyle = col;
        g.beginPath();
        g.arc(p.x, p.y, Math.min(s.radius, this.W * 0.015) * s.dotSize * appear, 0, TAU);
        g.fill();
      });
  }
  // the spin's plan, made at the strike: of the rests ahead, the one whose speed comes closest
  planSpin(G, sgn) {
    const s = this.s, base = this.faceLeft ? 0 : this.flip(G), y0 = sgn * this.yaw;
    const Tc = ((Math.max(1, Math.round(s.words)) - 1) * (s.colGap * s.radius)) / s.speed, ramps = s.strike + s.brake;
    let best = null;
    for (let k = 0; k < 16; k++) {
      const D = base + TAU * k - y0;
      if (D < 0.5) continue;
      const T = Math.max(clamp(D / s.spin + ramps / 2, Tc - 0.5 * s.slack, Tc + 0.5 * s.slack), ramps / 2, 0.3);
      const f = Math.min(1, T / ramps), up = s.strike * f, dn = s.brake * f, w = D / (T - (up + dn) / 2), cost = Math.abs(Math.log(w / s.spin));
      if (!best || cost < best.cost) best = { D, T, up, dn, w, cost, Tc };
      if (w > s.spin * 3) break;
    }
    if (!best) {
      const from = Number.isFinite(y0) ? y0 : 0;
      const D = ((((base - from) % TAU) + TAU) % TAU) + TAU;
      const T = Math.max(D / s.spin, ramps / 2, 0.3), f = Math.min(1, T / ramps), up = s.strike * f, dn = s.brake * f;
      best = { D, T, up, dn, w: D / (T - (up + dn) / 2), cost: 0, Tc };
      if (!Number.isFinite(this.yaw)) this.yaw = 0;
    }
    this.plan = { ...best, from: this.yaw, sgn };
    this.runT = 0;
    this.spin = "run";
  }
  // the pyramid: the arrow's triangle as the front face, its far vertex behind, centred on its centroid
  solid(G) {
    const hx = G.hx, b = G.base, F = [[(hx * 2) / 3, 0], [-hx / 3, -b / 2], [-hx / 3, b / 2]];
    const edge = (Math.hypot(F[0][0] - F[1][0], F[0][1] - F[1][1]) + Math.hypot(F[1][0] - F[2][0], F[1][1] - F[2][1]) + Math.hypot(F[2][0] - F[0][0], F[2][1] - F[0][1])) / 3, h = edge * 0.8165;
    return { V: [[F[0][0], F[0][1], h / 4], [F[1][0], F[1][1], h / 4], [F[2][0], F[2][1], h / 4], [0, 0, (-3 * h) / 4]], h, hx };
  }
  flip(G) {
    const { h, hx } = this.solid(G);
    return Math.atan2(-h, hx / 3) + Math.PI;
  }
  project(G) {
    const { V } = this.solid(G), cA = Math.cos(this.yaw), sA = Math.sin(this.yaw), cP = Math.cos(this.pitch), sP = Math.sin(this.pitch);
    return V.map(([x, y, z]) => {
      const x1 = x * cA + z * sA, z1 = -x * sA + z * cA;
      return [x1, y * cP - z1 * sP, y * sP + z1 * cP];
    });
  }
  faces(G, includeBack = false) {
    const s = this.s, R = this.project(G || this.geo()), cols = [s.arrow, s.faceBack, s.faceA, s.faceB];
    return [[0, 1, 2], [3, 2, 1], [0, 3, 1], [0, 2, 3]]
      .map((idx, i) => {
        const [a, b, c] = idx.map((k) => R[k]), e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const ctr = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        if (n[0] * ctr[0] + n[1] * ctr[1] + n[2] * ctr[2] < 0) n = n.map((v) => -v);
        return { idx, i, z: ctr[2], front: n[2] > 0, colour: cols[i] };
      })
      .filter((f) => includeBack || f.front)
      .sort((a, b) => a.z - b.z);
  }
  pyramid(g, G) {
    const R = this.project(G);
    g.globalAlpha = this.s.faceAlpha;
    this.faces(G).forEach((f) => {
      g.fillStyle = f.colour;
      g.strokeStyle = f.colour;
      g.lineWidth = 1;
      g.beginPath();
      f.idx.forEach((k, j) => (j ? g.lineTo(R[k][0], R[k][1]) : g.moveTo(R[k][0], R[k][1])));
      g.closePath();
      g.fill();
      g.stroke();
    });
    g.globalAlpha = 1;
  }
  eachCircle(fn) {
    const s = this.s, G = this.geo(), dir = this.speaker === 0 ? 1 : -1, n = Math.max(1, Math.round(s.count)), mid = (n - 1) / 2, centre = Math.floor(n / 2);
    const voice = (v) => [v === 0 ? s.voiceA : s.voiceB, s.wavelength * (v === 0 ? s.waveA : s.waveB)];
    this.cols.forEach((c) => {
      // the speaker's up to the prism's centre, the listener's past it (under the solid)
      const before = c.stage === "out" || (c.stage === "in" && (dir > 0 ? c.x < G.cx : c.x > G.cx));
      let [pal, wl] = voice(!s.refract || before ? this.speaker : 1 - this.speaker);
      if (s.whiteIn > 0 && before) pal = pal.map((v) => mix(v, "#ffffff", s.whiteIn));
      if (c.stage === "in") {
        fn(c.x, G.cy, s.radius * 0.7, pal[centre % pal.length]);
        return;
      }
      if (c.stage !== "out" && c.stage !== "back") return;
      const wave = 0.5 + 0.5 * Math.sin((c.x / wl) * TAU - this.t * s.waveSpeed + s.jitter * Math.sin(c.i * 7.3) * 2);
      const open = c.e * (1 - c.s), fold = 1 - 0.3 * c.s * c.s;
      const r = s.radius * c.g * fold;
      if (r < 0.4) return;
      let E = s.amp * wave * open;
      if (s.lineIn && c.stage === "out") E *= 1 - s.lineIn;
      if (c.stage === "back") E *= s.fanOut;
      const spacing = 2 * r * (1 - s.overlap);
      for (let j = 0; j < n; j++) {
        const idx = n - 1 - j, off = E * (idx - mid) * spacing;
        // the centre circle is whole; the others bud out of it as they separate
        const bud = idx === centre ? 1 : smooth(clamp((Math.abs(off) - 0.3 * r) / (0.7 * r), 0, 1));
        const rj = r * bud;
        if (rj < 0.4) continue;
        fn(c.x, G.cy + off, rj, pal[idx % pal.length]);
      }
    });
  }
  draw() {
    if (this.s.motionMode === "refraction") return this.drawOptics();
    const g = this.g, o = this.og, s = this.s, G = this.geo(), d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = s.ground;
    g.fillRect(0, 0, this.W, this.H);
    // built against white with the burn, then only the covered pixels come across
    const safe = (fn) => (x, y, r, col) => {
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(r) && r > 0) fn(x, y, r, col);
    };
    let circles = 0;
    this.eachCircle(safe(() => circles++));
    if (circles) {
      o.setTransform(d, 0, 0, d, 0, 0);
      o.globalCompositeOperation = "source-over";
      o.fillStyle = "#fff";
      o.fillRect(0, 0, this.W, this.H);
      o.globalCompositeOperation = "multiply";
      this.eachCircle(safe((x, y, r, col) => {
        o.fillStyle = col;
        o.beginPath();
        o.arc(x, y, r, 0, TAU);
        o.fill();
      }));
      o.globalCompositeOperation = "destination-in";
      o.fillStyle = "#000";
      o.beginPath();
      this.eachCircle(safe((x, y, r) => {
        o.moveTo(x + r, y);
        o.arc(x, y, r, 0, TAU);
      }));
      o.fill();
      g.drawImage(this.off, 0, 0, this.W, this.H);
    }
    if (s.dots) {
      [[G.dotA, s.dotA, 0], [G.dotB, s.dotB, 1]].forEach(([p, col, who]) => {
        const pop = smooth(clamp((this.appear - (who ? 0.15 : 0)) / 0.5, 0, 1));
        const r = s.radius * s.dotSize * pop;
        if (r <= 0) return;
        g.fillStyle = col;
        g.beginPath();
        g.arc(p.x, p.y, r, 0, TAU);
        g.fill();
      });
    }
    // the pyramid springs out of its centre on the reveal
    const ak = this.appear >= 1 ? 1 : easeBack(clamp((this.appear - 0.3) / 0.7, 0, 1));
    if (ak > 0.01) {
      g.save();
      g.translate(G.cx, G.cy);
      g.scale(ak, ak);
      this.pyramid(g, G);
      g.restore();
    }
  }
}

function settingsOf(v) {
  const refraction = v["motion.mode"] !== "Waveform";
  return {
    ...BASE,
    ...(refraction ? REFRACTION : {}),
    speedMul: v["motion.speed"],
    idleSpin: v["motion.spin"],
    arrowSize: v["prism.size"],
    faceAlpha: v["prism.glass"],
    fanOut: v["prism.fan"],
    ground: v["colour.ground"],
    arrow: v["colour.prism"],
    dotA: v["colour.left"],
    dotB: v["colour.right"],
  };
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.append(canvas);
  const hero = new PrsmHero(canvas, settingsOf(v), reduced);

  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;

  /* Reduced motion: a still. Refraction has its own (the first voice mid
     sentence, lit through the glass); the waveform is run a little way in. */
  function settle() {
    hero.reset();
    hero.still = true;
    if (hero.s.motionMode === "refraction") hero.settleOptics();
    else for (let i = 0; i < 150; i++) hero.tick(1 / 60);
    hero.draw();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    hero.tick(dt);
    hero.draw();
  }

  function sync() {
    const run = !reduced && onScreen && tabVisible && hero.W > 1;
    if (run && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const ro = new ResizeObserver(() => {
    hero.resize();
    if (reduced) settle();
    else hero.draw();
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

  if (reduced) settle();
  else hero.draw();
  sync();

  return {
    update(values) {
      Object.assign(v, values);
      hero.set(settingsOf(v));
      if (reduced) settle();
      else if (!raf) hero.draw();
    },
    action(name) {
      if (name !== "restart") return;
      hero.reset();
      if (reduced) settle();
      else hero.draw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      hero.off.width = hero.off.height = 0;
      canvas.remove();
    },
  };
}
