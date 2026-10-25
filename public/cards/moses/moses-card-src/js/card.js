/* The moses work card: one spring-driven loop, transforms and opacity only, plus
   one canvas for the shed.

   The miniature is Kinetic's round-two homepage for moses ("Everything sheds")
   laid out in layers at its 1440px width. Every [data-depth] element is a layer;
   on hover the card tilts toward the pointer and each layer is projected as if it
   sat at its own height above the card plane, so the parallax matches the real 3D
   tilt. The tour never stops for the hover; a press and drag scrolls the miniature
   by hand (with momentum), and the tour picks up again from wherever it was let go.

   The shed is the page's own (home-src/shed.js), made light: the drawing is a
   function of how far the miniature has scrolled into the hero (0 at the top, 1
   when the hero's foot reaches the bottom of the frame), so it scrubs both ways,
   and under that a drip never stops, on the card's clock. The holes widen with
   the same story (home-src/wear.js's curve), drawn by the page's own wear shader
   over its field, baked to a PNG so the card does no image work at load. Everything moves on requestAnimationFrame timestamps, and
   the drip and the drift are periodic in the tour's length, so a recording of one
   tour closes on itself.

   A classic script, so the card also runs opened straight from disk.
   window.__mosesCard is the handle for the dials, the site and the verify scripts. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const embed = document.documentElement.classList.contains('embed');

  const DW = 1440;                       // the page's design width
  const MAX_VH = 1100;                   // a frame taller than the page can fill crops the sides rather than shrinking the page
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset on the card ground
  // &mat=F (the site's border on every tile) draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height, light from above and a touch left
  const TICK_PER = 80;                   // design px of scroll per ruler notch
  const CLICK_PX = 6;                    // a press that moves less than this is a click
  const TAU = Math.PI * 2;

  /* the page, at 1440 x 900 (boxes read off the Studio page) */
  const HERO_H = 1785;                   // one screen plus 85vh, and the pile under it
  const SOL_TOP = 1785, SOL_H = 1140;    // the answer, on black
  const IMG = { ox: 340, oy: 336, iw: 760, ih: 760 };   // the worn photo in the hero
  const FLOOR = 1312 - 6;                // where the pile rests: the top of the count's block, less 6

  /* the tour: hold on a stop (drifting a little on the shed, so the particles keep
     falling), glide to the next, every leg eased in and out (seconds at speed 1) */
  const STOPS = [
    { id: 'hero', hold: 3.0, drift: 0, move: 2.2, y: () => 0 },
    { id: 'shed', hold: 2.2, drift: 150, move: 1.8, y: () => 400 },
    { id: 'heap', hold: 2.6, drift: 0, move: 2.2, y: (VH) => HERO_H - VH },
    { id: 'answer', hold: 2.8, drift: 0, move: 2.8, y: (VH) => SOL_TOP + SOL_H / 2 - VH / 2 },
  ];
  const PERIOD = STOPS.reduce((a, S) => a + S.hold + S.move, 0);
  const START = STOPS.reduce((a, S, i) => (a.push(i ? a[i - 1] + STOPS[i - 1].hold + STOPS[i - 1].move : 0), a), []);

  const DEFAULTS = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.62, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.6,
    'motion.scrollSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'shed.amount': 2200, 'shed.drip': 160, 'shed.size': 1.2, 'shed.heap': 0.35, 'shed.holes': 1,
    'drag.momentum': 1, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.2,
    // the mat: moses's own light neutral grey (--dark-grey in home-src/moses.css), so it reads on the site's near-black page
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': '#d4d4d4', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  /* the shed's own values on the page (mountShed's call in 01-Everything-sheds.html and shed.js's defaults) */
  const SHED = { spread: 0.26, wander: 10, dripTime: 6.5, fromHoles: 0.85, grow: 18, ink: 'rgba(255, 255, 255, .92)' };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const $ = (s) => document.querySelector(s);
  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav'), canvas = $('#shed');
  const photo = $('#worn');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rimLight = $('#rimLight'), rim = $('#rim');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = [...document.querySelectorAll('.ruler-in .ticks')];
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const V = { ...DEFAULTS };
  const get = (k) => V[k];
  // inside the site a finger scrolls the site, not the miniature, unless &touchdrag=1
  const touchDrag = !embed || qs.get('touchdrag') === '1';
  if (!touchDrag) persp.style.touchAction = 'pan-y';

  /* ---- shadow twins: a darkened, blurred copy left on the surface under a lifted layer ---- */
  for (const el of document.querySelectorAll('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(true);
    for (const n of [tw, ...tw.querySelectorAll('*')]) {
      for (const a of ['data-layer', 'data-depth', 'data-shadow', 'id']) n.removeAttribute(a);
    }
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }

  /* ---- layers ---- */
  const layers = [...document.querySelectorAll('[data-depth]')].map((el) => ({
    el, d: +el.dataset.depth, kind: el.dataset.kind || (page.contains(el) ? 'page' : 'vp'), edge: el.dataset.edge || '',
    twin: el._twin || null, parent: null, cx: 0, cy: 0, hw: 0, hh: 0, A: null, last: '', skip: false,
  }));
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const winLayer = layers.find((L) => L.el === win);
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }
  const tones = [...document.querySelectorAll('[data-tone]')].map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));

  /* ---- state ---- */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, VW = DW, maxScroll = 2619, stops = STOPS.map(() => 0), span = HERO_H - 900;
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  let mode = 'tour', phase = 0, bridge = null, coast = 0, idle = 0;
  let scroll = 0, clock = 0, drip = 0, synced = true, tone = NaN, lift = 1;   // tone: NaN until the first frame sets it
  let hovered = false, touchActive = false, touchOn = false, pointerLive = false;
  const pointer = { x: 0, y: 0 }, bl = { x: 0, y: -0.2 };
  let down = null, dragging = false, samples = [];
  let running = false, parentVisible = true, raf = 0, tPrev = performance.now();
  let lastTicks = '', lastTone = '', lastNav = null;
  const frameLog = [];

  /* ================= the shed ================= */
  const SH = window.MOSES_SHED;
  const shed = { pts: [], drip: [], landAt: [], level: [], mound: null, res: 1, cleared: false, drawMs: 0 };
  const growMax = () => SHED.grow * get('shed.holes');
  // how far the holes have worn at a point of the story: they widen through the first half, as most particles let go
  const growAt = (p) => growMax() * Math.pow(clamp(p / 0.55, 0, 1), 0.85);
  const storyAt = (y) => clamp(y / span, 0, 1);
  function pick(r, rand) {
    const L = SH.holes[clamp(Math.floor(r), 1, SH.holes.length) - 1];
    return L[Math.floor(rand() * L.length)];
  }
  // the drift of a particle in flight and the drip's rounds both repeat a whole number of times in one tour
  const W_AMB = TAU * Math.max(1, Math.round(0.7 * PERIOD / TAU)) / PERIOD;

  function buildShed() {
    const r = rng(11);
    const { ox, oy, iw, ih } = IMG, O = SH;
    const cx = ox + iw * (O.box[0] + O.box[2]) / 2;
    const halfW = iw * (O.box[2] - O.box[0]) * 0.435;   // the mound (1.15 of this) is as wide as the retainer
    const heapH = halfW * get('shed.heap');
    const n = Math.round(get('shed.amount'));
    const size0 = get('shed.size');
    const pts = [];
    for (let i = 0; i < n; i++) {
      const fromHole = r() < SHED.fromHoles;           // most leave from a hole's edge, where it is when they let go
      const fromEdge = fromHole || r() < 0.8;           // otherwise mostly from the rim, some from the surface
      const birth = (fromEdge ? -0.1 : 0.08) + r() * (fromEdge ? 0.55 : 0.37);   // when it leaves, in story units; all landed by 1
      const src = fromHole ? pick(growAt(birth), r) : fromEdge ? O.edge[Math.floor(r() * O.edge.length)] : O.inner[Math.floor(r() * O.inner.length)];
      const x0 = ox + src[0] * iw, y0 = oy + src[1] * ih;
      const dur = 0.32 + r() * 0.18;                    // how much of the story its fall takes
      const amp = SHED.wander * (0.3 + r() * 0.7), ph = r() * TAU, wob = 1 + r() * 1.5;
      const size = size0 * (0.7 + r() * 0.6);
      // where it comes to rest: a mound, filled from the floor up
      const g = (r() + r() + r()) / 3 * 2 - 1;          // bell-shaped across the heap
      const hx = cx + g * halfW * 1.15;
      const hy = FLOOR - Math.max(0, heapH * (1 - (g * 1.15) ** 2)) * r();
      pts.push({ x0, y0, birth, dur, fall: 0, amp, ph, wob, size, hx, hy, jx: r() * TAU, jy: r() * TAU });
    }
    // the heap settles from the floor up: the earliest to land take the lowest spots, each the open
    // one nearest below where it fell from (out of the next few), so nothing crosses the heap
    const order = pts.map((p, i) => i).sort((a, b) => (pts[a].birth + pts[a].dur) - (pts[b].birth + pts[b].dur));
    const spots = pts.map((p) => [p.hx, p.hy]).sort((a, b) => b[1] - a[1]);
    const open = [];
    let next = 0;
    for (const i of order) {
      while (open.length < 64 && next < spots.length) open.push(spots[next++]);
      let best = 0;
      for (let k = 1; k < open.length; k++) if (Math.abs(open[k][0] - pts[i].x0) < Math.abs(open[best][0] - pts[i].x0)) best = k;
      const [sx, sy] = open.splice(best, 1)[0];
      pts[i].hx = sx; pts[i].hy = sy; pts[i].fall = sy - pts[i].y0;   // it falls to its own spot, not past it
    }
    shed.pts = order.map((i) => pts[i]);               // in landing order
    shed.landAt = shed.pts.map((q) => q.birth + q.dur);
    shed.level = shed.pts.map((q) => q.hy).sort((a, b) => b - a);
    shed.mound = { cx, w: halfW * 1.15, h: heapH, floor: FLOOR };
    // the drip: each particle loops from the retainer to the heap a whole number of times a tour,
    // offset so the first frame already has them strung out all the way down
    const nd = Math.round(get('shed.drip'));
    const dr = [];
    for (let i = 0; i < nd; i++) {
      const hole = r() < SHED.fromHoles;
      const fromEdge = r() < 0.85;
      const src = hole ? pick(1, r) : fromEdge ? O.edge[Math.floor(r() * O.edge.length)] : O.inner[Math.floor(r() * O.inner.length)];
      const rounds = Math.max(1, Math.round(PERIOD / (SHED.dripTime * (0.75 + r() * 0.5))));
      const T = PERIOD / rounds;
      const x0 = ox + src[0] * iw, y0 = oy + src[1] * ih;
      dr.push({ hole, rounds, T, off: r() * T, seed: (r() * 1e9) | 0, cyc: NaN, x0, y0, fall: FLOOR - y0,
        spread: (r() - 0.5) * 2 * SHED.spread * iw * (0.4 + r() * 0.6),
        amp: SHED.wander * (0.3 + r() * 0.7), ph: r() * TAU, wob: 1 + r() * 1.5, size: size0 * (0.7 + r() * 0.6) });
    }
    shed.drip = dr;
    shed.cleared = false;
  }

  // the top of the heap at x, once the story has landed its share of particles
  function heapTop(p, x) {
    const M = shed.mound;
    let lo = 0, hi = shed.landAt.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (shed.landAt[m] <= p) lo = m + 1; else hi = m; }
    const level = lo ? shed.level[lo - 1] : M.floor;
    const g = (x - M.cx) / M.w;
    const mound = M.floor - Math.max(0, M.h * (1 - g * g));
    return Math.min(M.floor, Math.max(level, mound));
  }

  // a hole's drip lets go from that hole's edge as it is at the start of each fall. On the tour that is
  // known from the clock alone (so a seek lands on the recorded frame); off it, from the holes as they are now
  function dripFrom(q, cyc, wornNow) {
    const r = synced && mode === 'tour' ? growAt(storyAt(tourAt(cyc * q.T - q.off))) : wornNow;
    const src = pick(r, rng(q.seed + (((cyc % q.rounds) + q.rounds) % q.rounds) * 7919));
    q.x0 = IMG.ox + src[0] * IMG.iw; q.y0 = IMG.oy + src[1] * IMG.ih; q.fall = FLOOR - q.y0;
    q.cyc = cyc;
  }

  /* ---- the holes, wearing wider: home-src/wear.js's shader, as on the page. Every pixel of plastic
     knows its distance from the nearest hole (torn by noise), baked from the page into wear-field-700.png;
     the plastic nearer than r is gone, the fresh edge a touch whiter. At r = 0 the photo is exactly as it
     is. Drawn only when r or the size changes. Without WebGL the photo shows as it is (a still). ---- */
  const wear = (() => {
    const W = { ready: false, last: -1, draw() {} };
    const fieldImg = new Image();
    fieldImg.src = photo.dataset.field;
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return W;
    const VERT = 'attribute vec2 aPos; varying vec2 vUv; void main() { vUv = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5); gl_Position = vec4(aPos, 0., 1.); }';
    const FRAG = `precision mediump float;
uniform sampler2D uImg, uField;
uniform float uR, uRange, uSoft;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uImg, vUv);
  float e = texture2D(uField, vUv).r * uRange + uSoft;
  float keep = smoothstep(uR - uSoft, uR + uSoft, e);
  float fresh = (1. - smoothstep(uR, uR + 2.5, e)) * step(.5, uR);
  c.rgb += fresh * .22 * c.a;
  gl_FragColor = c * keep;
}`;
    let U = null;
    function setup() {
      const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const tex = (unit, upload) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        upload();
      };
      tex(0, () => { gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo); });
      tex(1, () => {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);   // the field is data, not colour
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, fieldImg);
      });
      U = {};
      for (const n of ['uImg', 'uField', 'uR', 'uRange', 'uSoft']) U[n] = gl.getUniformLocation(prog, n);
      gl.uniform1i(U.uImg, 0);
      gl.uniform1i(U.uField, 1);
      gl.uniform1f(U.uRange, 64);    // the field's reach, in the 700 px photo's pixels
      gl.uniform1f(U.uSoft, 0.8);
      return true;
    }
    W.draw = (r) => {
      if (!W.ready) return;
      const w = Math.max(1, Math.round(IMG.iw * shed.res * 1.15)), h = Math.max(1, Math.round(IMG.ih * shed.res * 1.15));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); W.last = -1; }
      if (Math.abs(r - W.last) < 0.02) return;
      W.last = r;
      gl.uniform1f(U.uR, r);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    Promise.all([photo.decode(), fieldImg.decode()]).then(() => {
      if (!setup()) return;
      photo.after(cv);
      W.ready = true;
      W.draw(growAt(storyAt(scroll)));
      photo.style.visibility = 'hidden';            // the canvas shows the same photo from here on
    }).catch(() => { /* no field: the photo stays as it is */ });
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); W.ready = false; photo.style.visibility = ''; cv.remove(); });
    return W;
  })();

  function drawShed(still) {
    const p = storyAt(scroll);
    const worn = growAt(p);
    wear.draw(worn);

    const res = shed.res;
    if (scroll > HERO_H + 8) {
      if (!shed.cleared) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); shed.cleared = true; }
      return;
    }
    shed.cleared = false;
    const t0 = performance.now();
    const amb = !still;
    const td = still ? 7.3 : drip;
    const yA = scroll - 6, yB = scroll + VH + 6;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(res, 0, 0, res, 0, -scroll * res);
    ctx.fillStyle = SHED.ink;
    ctx.beginPath();
    const R = 1.77;   // a square of this many radii has the round dot's ink
    for (const q of shed.pts) {
      const u = (p - q.birth) / q.dur;
      if (u <= 0) continue;
      if (u >= 1) {
        if (q.hy > yA && q.hy < yB) { const a = q.size * R; ctx.rect(q.hx - a / 2, q.hy - a / 2, a, a); }
        continue;
      }
      const e = u * u * (0.55 + 0.45 * u);             // gathers speed as it falls
      // a landing particle drifts across to its own spot in the heap and settles there, its wander dying out
      const wave = q.amp * Math.sin(q.ph + u * TAU * q.wob);
      let x = q.x0 + (q.hx - q.x0) * u + wave * (1 - u);
      let y = q.y0 + q.fall * e;
      if (amb) { const k = 1 - u; x += 1.4 * k * Math.sin(td * W_AMB + q.jx); y += 0.8 * k * Math.sin(td * W_AMB + q.jy); }
      if (y < yA || y > yB) continue;
      const a = q.size * (0.85 + 0.15 * (1 - u)) * R;
      ctx.rect(x - a / 2, y - a / 2, a, a);
    }
    // the drip: always falling, from the holes into the heap wherever the story has built it to
    const M = shed.mound, lim = M.w * 0.92;
    for (const q of shed.drip) {
      const cyc = Math.floor((td + q.off) / q.T);
      if (q.hole && cyc !== q.cyc) dripFrom(q, cyc, worn);
      const u = (td + q.off) / q.T - cyc;
      const e = u * u * (0.55 + 0.45 * u);
      const wave = q.amp * Math.sin(q.ph + u * TAU * q.wob);
      const tx = M.cx + clamp(q.x0 + q.spread * 0.4 - M.cx, -lim, lim);   // aimed at the mound below it, never past its foot
      const x = q.x0 + (tx - q.x0) * u + wave * (1 - u);
      const y = q.y0 + q.fall * e;
      if (y < yA || y > yB || y >= heapTop(p, x)) continue;                // gone into the heap when it gets there
      const a = q.size * R;
      ctx.rect(x - a / 2, y - a / 2, a, a);
    }
    ctx.fill();
    shed.drawMs = performance.now() - t0;
  }

  /* ================= layout ================= */
  let frameDark = false;
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }
  function layout() {
    const framed = MAT > 0 || (!embed && get('card.frame'));
    const [aw, ah] = String(get('card.aspect')).split(':').map(Number);
    stage.style.setProperty('--size', get('card.cardSize'));
    stage.style.setProperty('--ar', (aw / ah) || 1.6);
    card.classList.toggle('is-framed', framed);
    card.style.setProperty('--frame-color', get('card.frameColor'));
    frameDark = luminance(get('card.frameColor')) < 0.35;
    card.classList.toggle('ruler-inside', framed || embed);
    slot.classList.toggle('is-bleed', !framed && !embed);
    slot.classList.toggle('no-ruler', !get('card.ruler'));
    cw = persp.clientWidth; ch = persp.clientHeight;
    if (!cw || !ch) return;
    K = clamp((window.devicePixelRatio || 1) * 1.25, 1, 4);
    cardW = cw * K; cardH = ch * K;
    card.style.setProperty('--k', K);
    Object.assign(card.style, { width: cardW + 'px', height: cardH + 'px', left: (cw - cardW) / 2 + 'px', top: (ch - cardH) / 2 + 'px' });
    const mx = framed ? (MAT ? MAT * cardW : FRAME.x * cardW) : 0, my = framed ? (MAT ? MAT * cardW : FRAME.y * cardH) : 0;
    card.style.setProperty('--mx', mx + 'px');
    card.style.setProperty('--my', my + 'px');
    card.style.setProperty('--win-r', framed ? (cardW * 0.0125) + 'px' : '0px');
    card.style.setProperty('--card-px', cardW + 'px');
    card.style.setProperty('--bloom-d', (cardW * get('light.bloomSize')) + 'px');
    winLayer.d = framed ? 0.1 : 0;
    const winW = cardW - 2 * mx, winH = cardH - 2 * my;
    // fit the width; a frame tall enough to show more than MAX_VH of page crops the sides instead (never letterboxed)
    s = Math.max(winW / DW, winH / MAX_VH);
    VW = winW / s; VH = winH / s;
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.transform = `translate3d(${(-(DW - VW) / 2 * s).toFixed(2)}px, 0, 0) scale(${s})`;
    persp.style.perspective = (get('tilt.perspective') * cw) + 'px';
    // the particles' canvas: screen density, as the card shows it lifted on hover
    shed.res = clamp(s / K * (window.devicePixelRatio || 1) * (1 + get('tilt.hoverScale') - 1 + 0.02), 0.35, 2);
    const cwPx = Math.round(DW * shed.res), chPx = Math.round(VH * shed.res);
    if (canvas.width !== cwPx || canvas.height !== chPx) { canvas.width = cwPx; canvas.height = chPx; }
    shed.cleared = false;
    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.hw = L.el.offsetWidth / 2; L.hh = L.el.offsetHeight / 2;
      L.last = '';
      if (L.twin) L.twin.last = '';
    }
    for (const t of tones) { t.y0 = posIn(t.el, page)[1] - t.el.offsetHeight / 2; t.y1 = t.y0 + t.el.offsetHeight; }
    maxScroll = Math.max(0, page.offsetHeight - VH);
    span = Math.max(1, HERO_H - VH);
    stops = STOPS.map((S) => clamp(S.y(VH), 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
  }

  /* ================= the tour ================= */
  function tourAt(t) {
    t = ((t % PERIOD) + PERIOD) % PERIOD;
    for (let i = 0; i < STOPS.length; i++) {
      const S = STOPS[i], y = stops[i], j = (i + 1) % STOPS.length;
      if (t < S.hold) return y + S.drift * ease(t / S.hold);
      t -= S.hold;
      if (t < S.move) return y + S.drift + (stops[j] - y - S.drift) * ease(t / S.move);
      t -= S.move;
    }
    return 0;
  }
  // the tour's own clock: the site's resting loop is this tour recorded, so a hovered tile tells the card
  // where the loop is ({type: "ks-card", at}) and the live card picks up from that frame
  function seekTime(t) {
    t = ((t % PERIOD) + PERIOD) % PERIOD;
    mode = 'tour'; bridge = null; phase = t; drip = t; synced = true; tone = NaN;
    for (const q of shed.drip) q.cyc = NaN;
    scroll = tourAt(phase);
  }
  // after a drag: ease to the next stop at or below where it was let go (past the last one, glide home),
  // then carry on the tour from that stop; let go in the shed's own drift, it carries on from that point of it
  function resumeTour() {
    synced = false;
    for (let i = 0; i < STOPS.length; i++) {
      const S = STOPS[i];
      if (!S.drift || scroll < stops[i] - 2 || scroll > stops[i] + S.drift + 24) continue;
      const y = clamp(scroll, stops[i], stops[i] + S.drift);
      return glide(y, START[i] + S.hold * Math.acos(1 - 2 * (y - stops[i]) / S.drift) / Math.PI);
    }
    let j = stops.findIndex((y) => y >= scroll - 24);
    if (j < 0) j = 0;
    glide(stops[j], START[j]);
  }
  function glide(to, ph) {
    const dist = Math.abs(to - scroll);
    if (dist < 2) { mode = 'tour'; phase = ph; bridge = null; return; }
    bridge = { from: scroll, to, phase: ph, t: 0, dur: clamp(0.7 + dist / 1500, 0.9, 2.6) };
    mode = 'bridge';
  }

  function step(S, target, k, c, dt) {
    const n = Math.ceil(dt / (1 / 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) { S.v += (-k * (S.x - target) - c * S.v) * h; S.x += S.v * h; }
  }

  /* ================= the frame ================= */
  function frame(now) {
    if (!running) return;
    const raw = (now - tPrev) / 1000;
    const dt = Math.min(0.05, Math.max(0, raw));
    tPrev = now; clock += dt;
    if (frameLog.length > 600) frameLog.shift();
    frameLog.push(raw * 1000);
    const still = reduced.matches;
    const k = get('motion.stiffness'), c = get('motion.damping'), tiltMax = get('tilt.tiltMax');
    const engaged = hovered || touchActive || touchOn || dragging || get('debug.hold') || still;

    let nx = 0, ny = 0;
    if (still) { nx = -0.38; ny = -0.3; }
    else if (engaged) {
      if (pointerLive && (hovered || touchActive)) { nx = pointer.x; ny = pointer.y; }
      else { nx = 0.42 * Math.sin(clock * 0.55); ny = 0.3 * Math.sin(clock * 0.77 + 1.1); }
    }
    if (still) { spr.rx.x = -ny * tiltMax; spr.ry.x = nx * tiltMax; spr.h.x = 1; spr.rx.v = spr.ry.v = spr.h.v = 0; }
    else {
      step(spr.rx, -ny * tiltMax, k, c, dt);
      step(spr.ry, nx * tiltMax, k, c, dt);
      step(spr.h, engaged ? 1 : 0, k * 0.8, c * 0.95, dt);
    }
    // the bloom chases the pointer a touch behind it, so it feels like light, not a cursor
    const bx = still ? -0.38 : (pointerLive ? pointer.x : nx), by = still ? -0.3 : (pointerLive ? pointer.y : ny);
    const f = still ? 1 : 1 - Math.exp(-dt / 0.08);
    bl.x += (bx - bl.x) * f; bl.y += (by - bl.y) * f;

    // the scroll: the tour, a drag and its coast, or the glide back into the tour. Hover never stops it.
    const speed = get('motion.scrollSpeed');
    if (speed !== 1) synced = false;
    if (!still) drip += dt;
    if (mode === 'tour') {
      if (!still) { phase += dt * speed; scroll = tourAt(phase); }
    } else if (mode === 'manual') {
      if (!dragging) {
        const tau = 0.33 * get('drag.momentum');
        if (Math.abs(coast) > 12 && tau > 0.001 && !still) {
          scroll += coast * dt;
          coast *= Math.exp(-dt / tau);
          if (scroll <= 0 || scroll >= maxScroll) { scroll = clamp(scroll, 0, maxScroll); coast = 0; }
        } else {
          coast = 0; idle += dt;
          if (idle >= get('drag.resumeAfter') && !still) resumeTour();
        }
      }
    } else if (mode === 'bridge') {
      bridge.t += dt * Math.max(0.1, speed);
      const u = clamp(bridge.t / bridge.dur, 0, 1);
      scroll = bridge.from + (bridge.to - bridge.from) * ease(u);
      if (u >= 1) { mode = 'tour'; phase = bridge.phase; bridge = null; }
    }
    scroll = clamp(scroll, 0, maxScroll);
    render(dt, still);
    raf = requestAnimationFrame(frame);
  }

  function render(dt, still) {
    const rx = spr.rx.x, ry = spr.ry.x;
    const hc = clamp(spr.h.x, -0.2, 1.2), h01 = clamp(spr.h.x, 0, 1);
    const depth = get('layers.depth'), par = get('layers.parallax'), spread = get('layers.spread');
    const tiltMax = get('tilt.tiltMax');
    lift = 1 + (get('tilt.hoverScale') - 1 + 0) * hc;
    const shadowK = get('light.shadow');

    page.style.transform = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    card.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${(lift / K).toFixed(5)})`;

    // the eye, in card space: the perspective distance in front of the card centre, rotated into the card's frame
    const P = get('tilt.perspective') * cardW / lift;
    const a = rx * Math.PI / 180, b = ry * Math.PI / 180;
    const E = { x: -P * Math.sin(b) * Math.cos(a), y: P * Math.sin(a), z: P * Math.cos(a) * Math.cos(b) };
    const Zsep = 0.16 * cardW * depth;
    const quiet = Math.abs(hc) < 0.0005 && Math.abs(rx) < 0.001 && Math.abs(ry) < 0.001;
    const reach = VH * 0.5 + VH * 0.6;

    for (const L of layers) {
      if (L.kind === 'page') {
        L.skip = (L.parent && L.parent.skip) || Math.abs(L.cy - scroll - VH / 2) > reach + L.hh;
        if (L.skip) continue;
      }
      const u = L.kind === 'card' ? 1 : s;
      const Q = L.kind === 'card' ? { x: L.cx - cardW / 2, y: L.cy - cardH / 2 }
        : { x: (L.cx - DW / 2) * s, y: (L.cy - (L.kind === 'page' ? scroll : 0) - VH / 2) * s };
      const project = (d, extra) => {
        const z = d * Zsep * hc;
        const t = E.z / Math.max(E.z * 0.25, E.z - z);
        return { Q, z, t, o: { x: (t - 1) * (spread * Q.x - par * E.x) + extra.x, y: (t - 1) * (spread * Q.y - par * E.y) + extra.y } };
      };
      L.A = project(L.d, { x: 0, y: 0 });
      // a layer that hugs the page's edge (its 16 px margin) only gives a few px toward that edge,
      // so lifting and sliding never cut its first letters off
      let ex = 0, ey = 0;
      if (L.edge) {
        const o = L.A.o, lim = 9 * s, gx = (L.A.t - 1) * L.hw * s, gy = (L.A.t - 1) * L.hh * s;
        const soft = (v) => lim * Math.tanh(v / lim);
        const x0 = o.x, y0 = o.y;
        if (L.edge.includes('l') && L.edge.includes('r')) o.x = soft(o.x);
        else if (L.edge.includes('l')) { if (o.x - gx < 0) o.x = soft(o.x - gx) + gx; }
        else if (L.edge.includes('r')) { if (o.x + gx > 0) o.x = soft(o.x + gx) - gx; }
        if (L.edge.includes('t') && o.y - gy < 0) o.y = soft(o.y - gy) + gy;
        ex = o.x - x0; ey = o.y - y0;
      }
      const write = (el, A, cache) => {
        let o = A.o, sc = A.t;
        const Pp = L.parent && L.parent.A;
        if (Pp) {
          o = { x: (A.Q.x - Pp.Q.x) * (1 / Pp.t - 1) + (A.o.x - Pp.o.x) / Pp.t, y: (A.Q.y - Pp.Q.y) * (1 / Pp.t - 1) + (A.o.y - Pp.o.y) / Pp.t };
          sc = A.t / Pp.t;
        }
        const str = quiet ? '' : `translate3d(${(o.x / u).toFixed(2)}px, ${(o.y / u).toFixed(2)}px, 0) scale(${sc.toFixed(5)})`;
        if (str !== cache.last) { el.style.transform = str; cache.last = str; }
      };
      write(L.el, L.A, L);
      if (L.twin) {
        const Tw = L.twin;
        const throwPx = Math.max(0, L.A.z - Tw.surface * Zsep * hc);
        write(Tw.el, project(Tw.surface, { x: throwPx * LIGHT.x + ex, y: throwPx * LIGHT.y + ey }), Tw);
        const op = (Tw.alpha * shadowK * h01).toFixed(3);
        if (op !== Tw.op) { Tw.el.style.opacity = op; Tw.op = op; }
      }
    }

    // the framed window's own shadow on the card ground
    if (card.classList.contains('is-framed')) {
      const W = winLayer.A;
      const throwPx = Math.max(0, W.z) + cardW * 0.012;
      winShadow.style.transform = `translate3d(${(W.o.x + throwPx * LIGHT.x * 1.4).toFixed(2)}px, ${(W.o.y + throwPx * LIGHT.y * 1.4).toFixed(2)}px, 0) scale(${(0.985 + 0.01 * h01).toFixed(4)})`;
      winShadow.style.opacity = (0.4 + 0.3 * h01 * shadowK).toFixed(3);
    }

    // the light: a round bloom under the pointer, a faint rim nearest it, and the card's own shadow
    const bxp = (bl.x + 1) / 2 * cardW, byp = (bl.y + 1) / 2 * cardH;
    bloom.style.transform = `translate3d(${bxp.toFixed(1)}px, ${byp.toFixed(1)}px, 0)`;
    bloom.style.opacity = (get('light.bloom') * h01).toFixed(3);
    rimLight.style.transform = `translate3d(${bxp.toFixed(1)}px, ${byp.toFixed(1)}px, 0)`;
    rim.style.opacity = (get('light.rim') * h01).toFixed(3);
    const ex = tiltMax ? ry / tiltMax : 0, ey = tiltMax ? -rx / tiltMax : 0;
    cshadow.style.transform = `translate3d(${(-ex * 0.035 * cw).toFixed(1)}px, ${((0.03 + 0.035 * h01 - ey * 0.02) * cw).toFixed(1)}px, 0) scale(${(0.96 + 0.06 * h01).toFixed(3)})`;
    // embedded, the card sits exactly on its tile at rest: its shadow only shows once it lifts
    cshadow.style.opacity = ((embed ? 0.42 * h01 : 0.18 + 0.42 * h01) * (0.4 + shadowK)).toFixed(3);

    // the ruler: notches slide with the scroll, the reading mark stays put
    const frac = ((scroll / TICK_PER) % 1 + 1) % 1;
    const tk = frac.toFixed(4);
    if (tk !== lastTicks) {
      lastTicks = tk;
      ticksOut.style.transform = `translate3d(0, ${(-frac * 6).toFixed(2)}px, 0)`;
      for (const el of ticksIn) el.style.transform = `translate3d(0, ${(-frac * 6 * K).toFixed(2)}px, 0)`;
    }
    // the section under a point of the miniature: dark (the hero, the answer) or light (the reviews)
    const darkAt = (y) => { for (const t of tones) if (y >= t.y0 && y < t.y1) return t.dark; return true; };
    // inside the card the ruler's ink follows the section under the reading mark (framed, it sits on the card ground)
    const framedNow = card.classList.contains('is-framed');
    const dark = framedNow ? (frameDark ? 1 : 0) : embed ? (darkAt(scroll + VH / 2) ? 1 : 0) : 0;
    // the first frame (and a seek) starts the ink where it is headed, so the loop's first frame is its last
    tone = isNaN(tone) ? dark : tone + (dark - tone) * (still ? 1 : 1 - Math.exp(-dt / 0.18));
    const ts = tone.toFixed(3);
    if (ts !== lastTone) { lastTone = ts; inkLight.style.opacity = ts; inkDark.style.opacity = (1 - tone).toFixed(3); }
    // the header takes the colour of the ground under it, as on the page
    const light = !darkAt(scroll + 33);
    if (light !== lastNav) { nav.classList.toggle('on-light', light); lastNav = light; }

    drawShed(still);
  }

  /* ================= input ================= */
  function setPointer(e) {
    const r = persp.getBoundingClientRect();
    pointer.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    pointer.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    pointerLive = true;
  }
  const pxPerScreen = () => K / (s * lift);   // design px under one screen px
  function open() {
    // the site frames the card and decides what opening means; the card never navigates itself
    if (window.parent !== window) window.parent.postMessage({ type: 'ks-card-open' }, '*');
    window.dispatchEvent(new CustomEvent('ks-card-open'));
  }
  function endPress(e, cancelled) {
    if (!down || e.pointerId !== down.id) return;
    const wasTouch = down.type === 'touch';
    if (!cancelled && down.moved < CLICK_PX) {
      if (wasTouch && !embed) { touchOn = !touchOn; }
      open();
    }
    if (dragging) {
      // momentum: the speed over the last tenth of a second, if the hand was still moving when it let go
      let v = 0;
      const tNow = e.timeStamp;
      const recent = samples.filter((p) => tNow - p[0] < 100);
      if (!cancelled && recent.length > 1 && tNow - recent[recent.length - 1][0] < 80) {
        const [t0, s0] = recent[0], [t1, s1] = recent[recent.length - 1];
        if (t1 > t0) v = clamp((s1 - s0) / ((t1 - t0) / 1000), -9000, 9000);
      }
      mode = 'manual'; coast = v; idle = 0;
    }
    dragging = false; persp.classList.remove('is-dragging');
    down = null; samples = [];
    if (wasTouch) { touchActive = false; pointerLive = false; }
  }
  persp.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { hovered = true; setPointer(e); } });
  persp.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && !down) { hovered = false; pointerLive = false; } });
  persp.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, moved: 0, lx: 0, ly: 0 };
    const canDrag = e.pointerType !== 'touch' || touchDrag;
    if (canDrag) { try { persp.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } }
    if (e.pointerType === 'touch' && touchDrag) touchActive = true;
    if (mode === 'manual' && Math.abs(coast) > 0) { coast = 0; idle = 0; }   // a press catches a flick, like a phone
    setPointer(e);
  });
  persp.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') hovered = true;
    if (e.pointerType !== 'touch' || touchDrag) setPointer(e);
    if (!down || e.pointerId !== down.id) return;
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (!dragging && down.moved > 3 && (down.type !== 'touch' || touchDrag)) {
      dragging = true; persp.classList.add('is-dragging');
      mode = 'manual'; coast = 0; idle = 0; bridge = null; synced = false;
      down.lx = e.clientX; down.ly = e.clientY; samples = [];
    }
    if (dragging) {
      // either way: drag up and the page scrolls down, like a phone (1:1); drag right and it
      // scrubs further down, left back up (drag.scrub px of page per px). The axis that has
      // moved more since the press wins, applied as a step so a change of axis never jumps.
      const ddx = e.clientX - down.lx, ddy = e.clientY - down.ly;
      down.lx = e.clientX; down.ly = e.clientY;
      const across = Math.abs(e.clientX - down.x) > Math.abs(e.clientY - down.y);
      const stepPx = across ? ddx * get('drag.scrub') : -ddy;
      scroll = clamp(scroll + stepPx * pxPerScreen(), 0, maxScroll);
      idle = 0;
      samples.push([e.timeStamp, scroll]);
      if (samples.length > 24) samples.shift();
    }
  });
  persp.addEventListener('pointerup', (e) => {
    endPress(e, false);
    if (e.pointerType !== 'touch') {
      const r = persp.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { hovered = false; pointerLive = false; }
    }
  });
  persp.addEventListener('pointercancel', (e) => endPress(e, true));
  persp.addEventListener('dragstart', (e) => e.preventDefault());

  /* ================= pausing: hidden tab, or the framing page says the tile is off screen ================= */
  function wake() {
    const run = !document.hidden && parentVisible;
    if (run && !running) { running = true; tPrev = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!run && running) { running = false; cancelAnimationFrame(raf); }
  }
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'ks-card') return;
    if (typeof d.at === 'number' && isFinite(d.at) && !dragging && (mode === 'tour' || mode === 'bridge')) seekTime(d.at);
    if (typeof d.visible === 'boolean') { parentVisible = d.visible; wake(); }
  });
  reduced.addEventListener('change', () => { if (reduced.matches) seekTime(0); });

  /* ================= the handle ================= */
  const api = {
    embed,
    defaults: DEFAULTS,
    values: V,
    set(values, path) {
      Object.assign(V, values);
      card.classList.toggle('show-layers', !!V['debug.outlines']);
      if (!path || /^card\.|^tilt\.perspective|^tilt\.hoverScale|^light\.bloomSize/.test(path)) layout();
      if (!path || /^shed\./.test(path)) buildShed();
    },
    layout,
    // the tour's length in seconds (the site records one tour as the tile's resting loop)
    get period() { return PERIOD; },
    // a handle for the verify scripts
    get scroll() { return scroll; }, set scroll(y) { scroll = clamp(y, 0, maxScroll); mode = 'manual'; coast = 0; idle = -1e9; bridge = null; synced = false; },
    get mode() { return mode; }, get phase() { return phase; },
    get h() { return spr.h.x; }, get running() { return running; }, get layers() { return layers.length; },
    get stops() { return stops.slice(); }, get maxScroll() { return maxScroll; }, get VH() { return VH; },
    get story() { return storyAt(scroll); }, get particles() { return shed.pts.length + shed.drip.length; },
    get shedMs() { return shed.drawMs; }, get frames() { return frameLog.slice(); },
    seekTime,
    seek(i, t = 0) { seekTime(START[clamp(i | 0, 0, STOPS.length - 1)] + t); },
  };
  window.__mosesCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  layout();
  buildShed();
  wake();
})();
