/* The Rylo work card: one spring-driven loop, transforms and opacity only.

   A classic script (not a module), so the card runs on the site and straight
   from disk alike; window.RyloCard.start() returns the handle the page keeps on
   window.__ryloCard (the dials and the verify scripts use it too).

   The miniature is the live site's 1440px page, laid out in layers. Every
   [data-depth] element is a layer; on hover the card tilts toward the pointer and
   each layer is projected as if it sat at its own height above the card plane, so
   the parallax matches the real 3D tilt. The tour never stops for the hover; a
   press and drag scrolls the miniature by hand (with momentum), and the tour picks
   up again from wherever it was let go.

   Everything that moves on its own (the clouds, the bubbles riding the hero's
   line, the press logos, the caption crossing from "They talk" to "You read",
   the tab's dwell bar) runs on the tour's own clock and repeats exactly once per
   tour, so the tour is one seamless loop: the site rests each tile on this tour
   recorded and hands over to the live card with {type: "ks-card", at: seconds}.

   Embedded (?embed=1), the page's own script reads &bleed=N and &radius=N; here
   touch drag stays off unless &touchdrag=1, a click posts {type: "ks-card-open"}
   to the parent, and {type: "ks-card", visible} pauses and resumes the loop. */
(function () {
  'use strict';

  const DW = 1440;                       // Rylo's design width
  const MAX_VH = 1100;                   // a frame taller than the page can fill crops the sides rather than shrinking the page
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset on the card ground
  // &mat=F draws the card framed, its window inset F x the card's width on every side (the site passes mat=0.06)
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height, light from above and a touch left
  const TICK_PER = 80;                   // design px of scroll per ruler notch
  const CLICK_PX = 6;                    // a press that moves less than this is a click

  /* the tour: hold on a stop, glide to the next, every leg eased in and out (seconds at speed 1).
     Each stop is the page y at the top of the frame, chosen so nothing sits half under the nav. */
  const STOPS = [
    { name: 'hero', top: 0, hold: 2.6, move: 1.9 },
    { name: 'they talk, you read', top: 1812, hold: 1.6, move: 1.9 },
    { name: 'the sky', top: 3180, hold: 2.4, move: 1.9 },
    { name: 'Dr. Nissen', top: 5292, hold: 1.6, move: 1.9 },
    { name: 'Live Transcribe', top: 7130, hold: 1.6, move: 2.6 },
  ];
  const PERIOD = STOPS.reduce((a, S) => a + S.hold + S.move, 0);   // 20 s

  const DEFAULTS = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.7, 'light.bloomSize': 1.3, 'light.rim': 0.5, 'light.shadow': 0.6,
    'motion.scrollSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21, 'motion.cloudDrift': 1,
    'drag.momentum': 1, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.2,
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.ruler': true,
    'card.frameColor': '#ff8b2b',   // the mat: Rylo's own light card colour, clear on the Kinetic site's near-black page
    'debug.outlines': false, 'debug.hold': false,
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
  const frac = (v) => v - Math.floor(v);
  const TAU = Math.PI * 2;

  function start({ embed = false } = {}) {
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];
    const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
    const vp = $('#vp'), page = $('#page'), nav = $('#nav');
    const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rimLight = $('#rimLight'), rim = $('#rim');
    const ticksOut = $('.ruler-out .ticks'), ticksIn = $$('.ruler-in .ticks');
    const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const V = { ...DEFAULTS };
    const get = (k) => V[k];
    // inside the site a finger scrolls the site, not the miniature, unless &touchdrag=1
    const touchDrag = !embed || new URLSearchParams(location.search).get('touchdrag') === '1';
    if (!touchDrag) persp.style.touchAction = 'pan-y';

    /* ---- shadow twins: a darkened, blurred copy left on the surface under a lifted layer ---- */
    // a fourth field, flat, casts the shadow of the box alone (no copy of its contents): big cards stay cheap to raster
    for (const el of $$('[data-shadow]')) {
      const parts = el.dataset.shadow.split(',');
      const [surface, alpha, blur] = parts.map(Number), flat = parts[3] === 'flat';
      const tw = el.cloneNode(!flat);
      if (flat) tw.classList.add('flat');
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
    const layers = $$('[data-depth]').map((el) => ({
      el, d: +el.dataset.depth, kind: el.dataset.kind || (nav.contains(el) ? 'vp' : 'page'),
      twin: el._twin || null, parent: null, cx: 0, cy: 0, bx: 0, by: 0, hh: 0, A: null, last: '', skip: false,
    }));
    const layerOf = new Map(layers.map((L) => [L.el, L]));
    for (const L of layers) {
      let p = L.el.parentElement;
      while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
      L.parent = p ? layerOf.get(p) : null;
    }
    const winLayer = layerOf.get(win);
    function posIn(el, root) {
      let x = 0, y = 0, n = el;
      while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
    }

    /* ---- the page's own motion (transform only), all of it on the tour clock ---- */
    const tones = $$('[data-tone]').map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));
    const navInk = { light: $$('#nav [data-ink="light"]'), dark: $$('#nav [data-ink="dark"]'), t: -1 };
    // the bubbles riding the hero's line (and the closing one's): sampled once, placed by arc length
    const paths = {};
    for (const [key, sel] of [['hero', '.hero-path'], ['cta', '.cta-path']]) {
      const box = $(sel), path = box && box.querySelector('path');
      if (!path) continue;
      const len = path.getTotalLength(), N = 480, pts = new Float32Array((N + 1) * 2);
      for (let i = 0; i <= N; i++) { const p = path.getPointAtLength(len * i / N); pts[i * 2] = p.x; pts[i * 2 + 1] = p.y; }
      paths[key] = { box, pts, N, ox: 0, oy: 0, y0: 0, y1: 0 };
    }
    const rides = $$('[data-ride]').map((el) => {
      const bub = el.firstElementChild;
      return { el, key: el.dataset.ride, u0: +el.dataset.u, L: layerOf.get(bub), w: 0, h: 0, last: '' };
    });
    const marquees = $$('[data-marquee]').map((el) => ({ el, y: 0, last: '' }));
    const says = $$('[data-say]').map((el) => ({ el, last: '' }));
    const waves = $$('[data-wave]').map((el) => ({ el, last: '' }));
    const rowsTracks = $$('[data-rows]').map((el) => ({ el, dir: +el.dataset.rows, last: '' }));
    const dwells = $$('[data-dwell]').map((el) => ({ el, last: '' }));
    // the clouds: each wanders on its own slow orbit, the nearer ones further (design px)
    const DRIFT = { 1: [46, 10, 0.3], 2: [64, 12, 2.1], 3: [30, 8, 4.0], 4: [52, 9, 1.2], 5: [74, 14, 3.1] };
    const clouds = $$('[data-drift]').map((el) => ({ el, k: DRIFT[el.dataset.drift] || [40, 8, 0], last: '' }));
    const band = { talk: [0, 0], call: [0, 0], loved: [0, 0] };

    /* ---- state ---- */
    let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
    let s = 0.4, VH = 900, VW = DW, maxScroll = 13000, stops = STOPS.map(() => 0);
    const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
    const T = { mode: 'tour', j: 0, t: 0, from: 0, dur: 1, v: 0 };
    let scroll = 0, clock = 0, tt = 0, tourT = 0, tone = 0, lift = 1;
    let hovered = false, touchActive = false, touchOn = false, pointerLive = false;
    const pointer = { x: 0, y: 0 }, bl = { x: 0, y: -0.2 };
    let down = null, dragging = false, samples = [];
    let running = false, parentVisible = true, raf = 0, tPrev = performance.now();
    let lastTicks = '', lastTone = '', snapTone = true;

    function layout() {
      const framed = MAT > 0 || (!embed && get('card.frame'));
      const [aw, ah] = String(get('card.aspect')).split(':').map(Number);
      stage.style.setProperty('--size', get('card.cardSize'));
      stage.style.setProperty('--ar', (aw / ah) || 1.6);
      card.classList.toggle('is-framed', framed);
      card.style.setProperty('--frame-color', get('card.frameColor'));
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
      for (const L of layers) {
        const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
        [L.cx, L.cy] = posIn(L.el, root);
        L.bx = L.cx; L.by = L.cy;
        L.hh = L.el.offsetHeight / 2;
        L.last = '';
        if (L.twin) L.twin.last = '';
      }
      for (const t of tones) { t.y0 = posIn(t.el, page)[1] - t.el.offsetHeight / 2; t.y1 = t.y0 + t.el.offsetHeight; }
      for (const P of Object.values(paths)) {
        const [x, y] = posIn(P.box, P.box.parentElement);
        P.ox = x - P.box.offsetWidth / 2; P.oy = y - P.box.offsetHeight / 2;
        const sec = P.box.parentElement; P.y0 = sec.offsetTop; P.y1 = sec.offsetTop + sec.offsetHeight;
      }
      for (const R of rides) { const b = R.el.firstElementChild; R.w = b.offsetWidth; R.h = b.offsetHeight; R.last = ''; }
      for (const M of marquees) M.y = posIn(M.el, page)[1];
      const span = (sel) => { const el = $(sel); return el ? [el.offsetTop, el.offsetTop + el.offsetHeight] : [0, 0]; };
      band.talk = span('#s-talk'); band.call = span('#s-call'); band.loved = span('#s-loved');
      maxScroll = Math.max(0, page.offsetHeight - VH);
      stops = STOPS.map((S) => clamp(S.top, 0, maxScroll));
      scroll = clamp(scroll, 0, maxScroll);
      motion(true);
    }

    /* ---- the tour: a pure function of its own clock, so every loop closes exactly on the hero.
       A drag takes over (drag, coast, wait), then a glide hands back to the next stop and the
       tour clock picks up at that stop's hold. The motion clock (tt: clouds, bubbles, logos)
       never jumps for a drag; the two clocks are one and the same until someone drags. ---- */
    const STARTS = []; { let acc = 0; for (const S of STOPS) { STARTS.push(acc); acc += S.hold + S.move; } }
    const wrap = (t) => ((t % PERIOD) + PERIOD) % PERIOD;
    function tourAt(t) {
      t = wrap(t);
      for (let i = 0; i < STOPS.length; i++) {
        const S = STOPS[i], j = (i + 1) % STOPS.length;
        if (t < S.hold) return { i, y: stops[i] };
        t -= S.hold;
        if (t < S.move) return { i, y: stops[i] + (stops[j] - stops[i]) * ease(t / S.move) };
        t -= S.move;
      }
      return { i: 0, y: stops[0] };
    }
    function resume() {
      // the next stop at or below where it was let go; past the last one, glide home
      let j = stops.findIndex((y) => y >= scroll - 24);
      if (j < 0) j = 0;
      const dist = Math.abs(stops[j] - scroll);
      if (dist < 2) { T.mode = 'tour'; tourT = STARTS[j]; scroll = stops[j]; return; }
      T.mode = 'glide'; T.j = j; T.from = scroll; T.t = 0; T.dur = clamp(0.7 + dist / 1500, 0.9, 2.6);
    }
    // the site's resting loop is this tour recorded, so a hovered tile tells the card where
    // the loop is ({type: "ks-card", at}) and the live card picks up from that very frame
    function seekTime(t) {
      tt = tourT = wrap(t);
      T.mode = 'tour';
      scroll = tourAt(tourT).y;
      snapTone = true;   // a jump lands with the nav's and the ruler's ink already right, no fade through
    }
    function advance(dt, still) {
      if (still) return;
      const tdt = dt * get('motion.scrollSpeed');
      tt = wrap(tt + tdt);
      if (dragging) return;
      if (T.mode === 'tour') { tourT = wrap(tourT + tdt); scroll = tourAt(tourT).y; return; }
      if (T.mode === 'coast') {
        const tau = 0.33 * get('drag.momentum');
        if (tau <= 0.001) T.v = 0;
        scroll += T.v * dt;
        T.v *= Math.exp(-dt / Math.max(tau, 0.001));
        if (scroll <= 0 || scroll >= maxScroll) { scroll = clamp(scroll, 0, maxScroll); T.v = 0; }
        if (Math.abs(T.v) < 12) { T.mode = 'wait'; T.t = 0; }
        return;
      }
      if (T.mode === 'wait') { T.t += dt; if (T.t >= get('drag.resumeAfter')) resume(); return; }
      if (T.mode === 'glide') {
        T.t += tdt;
        const u = Math.min(1, T.t / T.dur);
        scroll = T.from + (stops[T.j] - T.from) * ease(u);
        if (u >= 1) { T.mode = 'tour'; tourT = STARTS[T.j]; }
      }
    }

    function step(S, target, k, c, dt) {
      const n = Math.ceil(dt / (1 / 240));
      const h = dt / n;
      for (let i = 0; i < n; i++) { S.v += (-k * (S.x - target) - c * S.v) * h; S.x += S.v * h; }
    }

    /* ---- the frame ---- */
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, Math.max(0, (now - tPrev) / 1000));
      tPrev = now; clock += dt;
      const still = reduced.matches;
      const k = get('motion.stiffness'), c = get('motion.damping'), tiltMax = get('tilt.tiltMax');
      const engaged = hovered || touchActive || touchOn || dragging || get('debug.hold') || still;

      let nx = 0, ny = 0;
      if (still) { nx = -0.38; ny = -0.3; }
      else if (engaged) {
        if (pointerLive && (hovered || touchActive)) { nx = pointer.x; ny = pointer.y; }
        else { nx = 0.42 * Math.sin(clock * 0.55); ny = 0.3 * Math.sin(clock * 0.77 + 1.1); }
      }
      const hT = engaged ? 1 : 0;
      if (still) { spr.rx.x = -ny * tiltMax; spr.ry.x = nx * tiltMax; spr.h.x = 1; spr.rx.v = spr.ry.v = spr.h.v = 0; }
      else {
        step(spr.rx, -ny * tiltMax, k, c, dt);
        step(spr.ry, nx * tiltMax, k, c, dt);
        step(spr.h, hT, k * 0.8, c * 0.95, dt);
      }
      // the bloom chases the pointer a touch behind it, so it feels like light, not a cursor
      const bx = still ? -0.38 : (pointerLive ? pointer.x : nx), by = still ? -0.3 : (pointerLive ? pointer.y : ny);
      const f = still ? 1 : 1 - Math.exp(-dt / 0.08);
      bl.x += (bx - bl.x) * f; bl.y += (by - bl.y) * f;

      advance(dt, still);
      scroll = clamp(scroll, 0, maxScroll);
      motion(false);
      render(dt, still);
      raf = requestAnimationFrame(frame);
    }

    /* the page's own motion, written only while its part of the page is near the frame */
    function motion(force) {
      const lo = scroll - VH * 0.6, hi = scroll + VH * 1.6;
      const near = (a, b) => force || (b > lo && a < hi);
      const ph = tt / PERIOD;                         // 0..1 once per tour
      // bubbles riding the line: one full ride per tour, so the loop closes on itself
      for (const R of rides) {
        const P = paths[R.key];
        if (!P || !near(P.y0, P.y1)) continue;
        const u = frac(R.u0 + ph), fi = u * P.N, i = Math.min(P.N - 1, fi | 0), w = fi - i;
        const x = P.ox + P.pts[i * 2] + (P.pts[i * 2 + 2] - P.pts[i * 2]) * w;
        const y = P.oy + P.pts[i * 2 + 1] + (P.pts[i * 2 + 3] - P.pts[i * 2 + 1]) * w;
        const tx = x - R.w / 2, ty = y - R.h / 2;
        const str = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
        if (str !== R.last) { R.el.style.transform = str; R.last = str; }
        if (R.L) { R.L.cx = R.L.bx + tx; R.L.cy = R.L.by + ty; }
      }
      if (near(band.talk[0], band.talk[1])) {
        // the press logos run a full set per tour
        for (const M of marquees) {
          const str = `translate3d(${(-frac(ph) * 1120).toFixed(1)}px, 0, 0)`;
          if (str !== M.last) { M.el.style.transform = str; M.last = str; }
        }
        // the caption crosses from "They talk" to "You read" twice a tour, mid-seam while the tour holds there
        const m = -332 + 1612 * frac((tt - 0.3) / (PERIOD / 2));
        const ms = `translate3d(${m.toFixed(1)}px, 0, 0)`;
        for (const S of says) if (ms !== S.last) { S.el.style.transform = ms; S.last = ms; }
        // the voice wave and its line slide with the scroll, as on the site
        const ws = `translate3d(${(-200 - (scroll - 1812) * 0.25).toFixed(1)}px, 0, 0)`;
        for (const W of waves) if (ws !== W.last) { W.el.style.transform = ws; W.last = ws; }
      }
      if (near(band.call[0], band.call[1])) {
        const amt = get('motion.cloudDrift');
        for (const C of clouds) {
          const [ax, ay, p] = C.k;
          const dx = ax * amt * Math.sin(TAU * ph + p), dy = ay * amt * Math.sin(TAU * 2 * ph + p * 1.7);
          const str = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
          if (str !== C.last) { C.el.style.transform = str; C.last = str; }
        }
        const ds = `scaleX(${frac(tt / (PERIOD / 2)).toFixed(4)})`;   // the active tab's dwell, 10 s as on the site
        for (const Dw of dwells) if (ds !== Dw.last) { Dw.el.style.transform = ds; Dw.last = ds; }
      }
      if (near(band.loved[0], band.loved[1])) {
        for (const R of rowsTracks) {
          const str = `translate3d(${(R.dir * (scroll - 6000) * 0.12).toFixed(1)}px, 0, 0)`;
          if (str !== R.last) { R.el.style.transform = str; R.last = str; }
        }
      }
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
          write(Tw.el, project(Tw.surface, { x: throwPx * LIGHT.x, y: throwPx * LIGHT.y }), Tw);
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
      const fr = ((scroll / TICK_PER) % 1 + 1) % 1;
      const tk = fr.toFixed(4);
      if (tk !== lastTicks) {
        lastTicks = tk;
        ticksOut.style.transform = `translate3d(0, ${(-fr * 6).toFixed(2)}px, 0)`;
        for (const el of ticksIn) el.style.transform = `translate3d(0, ${(-fr * 6 * K).toFixed(2)}px, 0)`;
      }
      // inside the card its ink follows the section under the reading mark (framed, it sits on the card ground)
      const toneAt = (y) => { let d = 0; for (const t of tones) if (y >= t.y0 && y < t.y1) d = t.dark ? 1 : 0; return d; };
      const dark = embed && !card.classList.contains('is-framed') ? toneAt(scroll + VH / 2) : 0;
      tone += (dark - tone) * (still || snapTone ? 1 : 1 - Math.exp(-dt / 0.18));
      const ts = tone.toFixed(3);
      if (ts !== lastTone) { lastTone = ts; inkLight.style.opacity = ts; inkDark.style.opacity = (1 - tone).toFixed(3); }
      // the nav's ink follows the section under it, as on the site (light over the sky, dark over the paper)
      const nd = toneAt(scroll + 50), fade = (v, d, h) => v + (d - v) * (1 - Math.exp(-h / 0.14));
      if (navInk.t < 0 || snapTone) {
        // a jump in time (the first frame, or the site's {at}) lands with the ink as the loop has it:
        // still finishing its fade if the tour has just come past a change of section
        navInk.t = nd;
        if (T.mode === 'tour' && !still) {
          navInk.t = toneAt(tourAt(tourT - 91 / 60).y + 50);
          for (let m = 90; m >= 0; m--) navInk.t = fade(navInk.t, toneAt(tourAt(tourT - m / 60).y + 50), m ? 1 / 60 : dt);
        }
      } else navInk.t = still ? nd : fade(navInk.t, nd, dt);
      snapTone = false;
      const nl = navInk.t.toFixed(3), ndk = (1 - navInk.t).toFixed(3);
      if (nl !== navInk.last) {
        navInk.last = nl;
        for (const el of navInk.light) el.style.opacity = nl;
        for (const el of navInk.dark) el.style.opacity = ndk;
      }
    }

    /* ---- input ---- */
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
        T.mode = 'coast'; T.v = v;
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
      if (canDrag) { try { persp.setPointerCapture(e.pointerId); } catch (err) { /* already released */ } }
      if (e.pointerType === 'touch' && touchDrag) touchActive = true;
      if (T.mode === 'coast') { T.v = 0; T.mode = 'wait'; T.t = 0; }   // a press catches a flick, like a phone
      setPointer(e);
    });
    persp.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') hovered = true;
      if (e.pointerType !== 'touch' || touchDrag) setPointer(e);
      if (!down || e.pointerId !== down.id) return;
      down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
      if (!dragging && down.moved > 3 && (down.type !== 'touch' || touchDrag)) {
        dragging = true; persp.classList.add('is-dragging');
        T.mode = 'drag'; T.v = 0;
        down.lx = e.clientX; down.ly = e.clientY; samples = [];
      }
      if (dragging) {
        // either way: drag up and the page scrolls down, like a phone (1:1); drag right and it
        // scrubs further down, left back up (drag.scrub px of page per px). The axis that has
        // moved more since the press wins, applied as a step so a change of axis never jumps.
        const ddx = e.clientX - down.lx, ddy = e.clientY - down.ly;
        down.lx = e.clientX; down.ly = e.clientY;
        const across = Math.abs(e.clientX - down.x) > Math.abs(e.clientY - down.y);
        const st = across ? ddx * get('drag.scrub') : -ddy;
        scroll = clamp(scroll + st * pxPerScreen(), 0, maxScroll);
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

    /* ---- pausing: hidden tab, or the framing page says the tile is off screen ---- */
    function wake() {
      const run = !document.hidden && parentVisible;
      if (run && !running) { running = true; tPrev = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!run && running) { running = false; cancelAnimationFrame(raf); }
    }
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || d.type !== 'ks-card') return;
      if (typeof d.at === 'number' && !dragging && T.mode !== 'coast') seekTime(d.at);   // never mid-drag
      if (typeof d.visible === 'boolean') { parentVisible = d.visible; wake(); }
    });

    new ResizeObserver(() => layout()).observe(persp);
    const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
    watchDpr();
    document.fonts.ready.then(layout);
    window.addEventListener('load', layout);
    layout();
    wake();

    const api = {
      set(values, path) {
        Object.assign(V, values);
        card.classList.toggle('show-layers', !!V['debug.outlines']);
        if (!path || /^card\.|^tilt\.perspective|^light\.bloomSize/.test(path)) layout();
      },
      values: V,
      layout,
      // a handle for the site and the verify scripts
      get scroll() { return scroll; }, get mode() { return T.mode; }, get stop() { return tourAt(tourT).i; }, get time() { return tt; }, get tourTime() { return tourT; },
      get h() { return spr.h.x; }, get running() { return running; }, get layers() { return layers.length; },
      get stops() { return stops.slice(); }, get maxScroll() { return maxScroll; }, get period() { return PERIOD; },
      seek(i, t = 0) { seekTime(STARTS[clamp(i | 0, 0, stops.length - 1)] + t); },
      seekTime,
      // verify only: park the miniature at a page y (the tour waits until seek or seekTime)
      peek(y) { T.mode = 'peek'; scroll = clamp(y, 0, maxScroll); },
    };
    return api;
  }

  window.RyloCard = { start, DEFAULTS, PERIOD };
})();
