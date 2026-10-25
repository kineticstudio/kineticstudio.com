/* The Anthropic Community work card: the engine (from the Wispr Flow card's).

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity (and draws the globe's canvas):

   - the tour: eased stops through the page, about 21 s round, never paused by
     hover; a drag takes over, coasts, and the tour picks up from there
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the globe: one full turn per tour, slow while the hero is on screen and
     quicker while it is out of sight, so the recorded loop is seamless; it is
     drawn only while it is in view, from this loop's own timestamps, and its
     event tip rides the city it labels

   window.__anthropicCommunityCard is the handle the page's dials, the site and
   the verify scripts use. */
(function () {
  'use strict';

  const DW = 1440;                       // the community page's design width
  const MAX_VH = 1100;                   // a frame taller than the page can fill crops the sides rather than shrinking the page
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset on the card ground
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height, light from above and a touch left
  const TICK_PER = 80;                   // design px of scroll per ruler notch
  const CLICK_PX = 6;                    // a press that moves less than this is a click
  const HERO_H = 1050;                   // the hero's height: below it the globe is out of sight

  /* the tour: hold on a stop, glide to the next, every leg eased in and out (seconds at speed 1).
     off: px from the section's top (the page's nav and sub nav cover the top 121 px of the frame) */
  const STOPS = [
    { id: 's-hero', off: 0, hold: 3.2, move: 2.2 },
    { id: 's-events', off: -10, hold: 1.8, move: 2.0 },
    { id: 's-ideas', off: 4, hold: 1.8, move: 2.0 },
    { id: 's-space', off: -10, hold: 1.6, move: 2.0 },
    { id: 's-cta', off: -201, hold: 1.8, move: 2.8 },
  ];

  /* the globe, as Kinetic's recording shows it (fitted to the recorded outline,
     markers and land): looking at 18.5 N 82 W from three radii away. The
     recording is 1920 x 1080, where the outline is 590 px across with its top
     69 px under the headline; in the card's 16:10 frame it sits a little
     smaller and higher (560 px, its top 36 px under the headline) so the same
     share of the sphere shows above the fold */
  const GLOBE = {
    box: { x: 400, y: 480, w: 1040, h: HERO_H - 480 },      // the canvas, on the page
    cx: 1055, cy: 1065, rs: 560, d: 3.0, phi: 18.5, lam: -82,
    ease: 0.72,                                            // how much slower the turn is while the hero is in view
    tips: ['Toronto', 'Austin', 'Miami'],                  // the cities the recording labels with their events
    tipDy: -17, cityDy: 23,                                // the pill above the marker, the city's name below it
  };

  const DEFAULTS = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.7, 'light.bloomSize': 1.3, 'light.rim': 0.5, 'light.shadow': 0.6,
    'motion.scrollSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.2,
    'globe.turn': 1, 'globe.dotSize': 2.8, 'globe.magnify': 1, 'globe.land': false,
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': '#c96442', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
  const luminance = (hex) => {
    const n = parseInt(String(hex).replace('#', ''), 16);
    if (!isFinite(n)) return 1;
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };

  const embed = document.documentElement.classList.contains('embed');
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rimLight = $('#rimLight'), rim = $('#rim');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = [...document.querySelectorAll('.ruler-in .ticks')];
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
  const tip = $('#tip'), tipCity = $('#tipCity'), globeEl = $('#globe');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const V = { ...DEFAULTS };
  const get = (k) => V[k];
  // inside the site a finger scrolls the site, not the miniature, unless &touchdrag=1
  const touchDrag = !embed || new URLSearchParams(location.search).get('touchdrag') === '1';
  if (!touchDrag) persp.style.touchAction = 'pan-y';

  /* ---- the globe ---- */
  const globe = window.ACGlobe ? window.ACGlobe.create($('#globeCanvas'), { dotSize: DEFAULTS['globe.dotSize'], markerSize: 6.1, hoverRadius: 135, mirror: !DEFAULTS['globe.land'] }) : null;
  const tipCities = globe ? GLOBE.tips.map((n) => globe.cities.find((c) => c[0] === n)).filter(Boolean) : [];
  if (globe) {
    globe.setView({ cx: GLOBE.cx - GLOBE.box.x, cy: GLOBE.cy - GLOBE.box.y, rs: GLOBE.rs, d: GLOBE.d, phi: GLOBE.phi, lam: GLOBE.lam });
    globe.setFade(GLOBE.box.h - 140, GLOBE.box.h);
  }

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
    el, d: +el.dataset.depth, kind: el.dataset.kind || (nav.contains(el) ? 'vp' : 'page'),
    twin: el._twin || null, parent: null, cx: 0, cy: 0, hh: 0, A: null, last: '', skip: false,
  }));
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const winLayer = layers.find((L) => L.el === win);
  const globeLayer = layers.find((L) => L.el === globeEl);
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }
  const tones = [...document.querySelectorAll('[data-tone]')].map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));

  /* ---- state ---- */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, VW = DW, maxScroll = 5000, stops = STOPS.map(() => 0);
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const T = { mode: 'tour', j: 0, t: 0, from: 0, dur: 1, v: 0 };
  let scroll = 0, clock = 0, tone = 0, lift = 1;
  let hovered = false, touchActive = false, touchOn = false, pointerLive = false;
  const pointer = { x: 0, y: 0 }, bl = { x: 0, y: -0.2 };
  let down = null, dragging = false, samples = [];
  let running = false, parentVisible = true, raf = 0, tPrev = performance.now();
  let lastTicks = '', lastTone = '', snapTone = true, settleTip = true;
  // the globe's turn: tt is the tour's own time; off the tour (dragged, coasting, gliding back) it keeps turning slowly by gOff
  let tt = 0, gOff = 0, lam = GLOBE.lam, globeDirty = true, gQ = 1;
  let tipShown = null, tipA = 0, lastTip = '', lastTipOp = '', lastPtr = null;
  let frameMs = 0;
  const frames = [], costs = [];         // the last few frame intervals and the loop's own cost, ms (for the verify scripts)

  function layout() {
    const framed = MAT > 0 || (!embed && get('card.frame'));
    const [aw, ah] = String(get('card.aspect')).split(':').map(Number);
    stage.style.setProperty('--size', get('card.cardSize'));
    stage.style.setProperty('--ar', (aw / ah) || 1.6);
    card.classList.toggle('is-framed', framed);
    card.classList.toggle('ruler-inside', framed || embed);
    card.style.setProperty('--frame-color', get('card.frameColor'));
    card.classList.toggle('is-dark-frame', luminance(get('card.frameColor')) < 0.35);
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
      L.hh = L.el.offsetHeight / 2;
      L.last = '';
      if (L.twin) L.twin.last = '';
    }
    for (const t of tones) { t.y0 = posIn(t.el, page)[1] - t.el.offsetHeight / 2; t.y1 = t.y0 + t.el.offsetHeight; }
    maxScroll = Math.max(0, page.offsetHeight - VH);
    stops = STOPS.map((S) => { const el = document.getElementById(S.id); return clamp(posIn(el, page)[1] - el.offsetHeight / 2 + S.off, 0, maxScroll); });
    scroll = clamp(scroll, 0, maxScroll);
    // the globe's canvas at the density it is shown at (design px -> device px, hovered)
    if (globe) {
      gQ = clamp((s * (window.devicePixelRatio || 1) * (get('tilt.hoverScale') + 0.03)) / K, 0.3, 2.5);
      globe.resize(GLOBE.box.w, GLOBE.box.h, gQ);
      globeDirty = true;
    }
  }

  /* ---- the tour: a pure function of its own clock (tt), so every loop closes exactly on the hero.
     A drag takes over (drag, coast, wait), then a glide hands back to the next stop and the
     tour clock picks up at that stop's hold. ---- */
  const LEG = []; { let a = 0; for (const S of STOPS) { LEG.push(a); a += S.hold + S.move; } }
  const PERIOD = STOPS.reduce((a, S) => a + S.hold + S.move, 0);
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
  // the globe's turn at tour time t: one full turn per tour, slowest at the hero (t = 0) and quickest halfway round
  const turnDeg = (t) => {
    if (!get('globe.turn')) return 0;
    const u = (2 * Math.PI * t) / PERIOD;
    return ((u - GLOBE.ease * Math.sin(u)) * 180) / Math.PI;
  };
  const slowDeg = () => (get('globe.turn') ? (360 * (1 - GLOBE.ease)) / PERIOD : 0);   // deg/s, while it is held off the timeline
  function landOnTimeline(i) {
    // back on a stop: put the tour clock at that hold and keep the globe where it is
    const lamNow = lam;
    tt = LEG[i];
    gOff = (((GLOBE.lam - turnDeg(tt) - lamNow) % 360) + 360) % 360;
  }
  function resume() {
    // the next stop at or below where it was let go; past the last one, glide home
    let j = stops.findIndex((y) => y >= scroll - 24);
    if (j < 0) j = 0;
    const dist = Math.abs(stops[j] - scroll);
    if (dist < 2) { T.mode = 'tour'; scroll = stops[j]; landOnTimeline(j); return; }
    T.mode = 'glide'; T.j = j; T.from = scroll; T.t = 0; T.dur = clamp(0.7 + dist / 1500, 0.9, 2.6);
  }
  // the tour's own clock: the site's resting loop is this tour recorded, so a
  // hovered tile tells the card where the loop is ({type: "ks-card", at}) and
  // the live card picks up from that frame, the globe's turn and its tip included
  function seekTime(t) {
    tt = wrap(t); gOff = 0;
    T.mode = 'tour';
    scroll = tourAt(tt).y;
    snapTone = settleTip = true;
  }
  function advance(dt, still) {
    if (still) return;
    const tdt = dt * get('motion.scrollSpeed');
    if (dragging || T.mode !== 'tour') gOff += slowDeg() * dt;
    if (dragging) return;
    if (T.mode === 'tour') { tt = wrap(tt + tdt); scroll = tourAt(tt).y; return; }
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
      if (u >= 1) { T.mode = 'tour'; landOnTimeline(T.j); }
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
    const t0 = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - tPrev) / 1000));
    frames.push(now - tPrev); if (frames.length > 240) frames.shift();
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
    render(dt, still);
    frameMs = performance.now() - t0;
    costs.push(frameMs); if (costs.length > 240) costs.shift();
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
    const frac = ((scroll / TICK_PER) % 1 + 1) % 1;
    const tk = frac.toFixed(4);
    if (tk !== lastTicks) {
      lastTicks = tk;
      ticksOut.style.transform = `translate3d(0, ${(-frac * 6).toFixed(2)}px, 0)`;
      for (const el of ticksIn) el.style.transform = `translate3d(0, ${(-frac * 6 * K).toFixed(2)}px, 0)`;
    }
    // inside the card its ink follows the section under the reading mark (framed, it sits on the card ground)
    let dark = 0;
    if (embed && !card.classList.contains('is-framed')) {
      const yr = scroll + VH / 2;
      for (const t of tones) if (yr >= t.y0 && yr < t.y1) dark = t.dark ? 1 : 0;
    }
    // (a jump in time, or the first frame, lands with the ink already right: no fade through)
    tone += (dark - tone) * (still || snapTone ? 1 : 1 - Math.exp(-dt / 0.18));
    snapTone = false;
    const ts = tone.toFixed(3);
    if (ts !== lastTone) { lastTone = ts; inkLight.style.opacity = ts; inkDark.style.opacity = (1 - tone).toFixed(3); }

    renderGlobe(dt, still, h01);
  }

  /* ---- the globe: drawn only while the hero is in the frame ---- */
  const heroInView = (y) => y < HERO_H && y + VH > GLOBE.box.y;
  function renderGlobe(dt, still, h01) {
    if (!globe) return;
    const inView = heroInView(scroll);
    lam = GLOBE.lam - turnDeg(still ? 0 : tt) - (still ? 0 : gOff);
    // out of sight the tip lets go of its city, so it always comes in the same way
    if (!inView) { globeDirty = true; tipShown = null; tipA = 0; return; }
    // a jump in time (the first frame, or the site's {at}) plays the tip through from the moment
    // the hero last came into view, so it is on the same city and as faded in as the loop shows it
    if (settleTip && !still && T.mode === 'tour') {
      settleTip = false;
      const N = Math.round(PERIOD * 60);
      let n = 0;
      while (n < N && heroInView(tourAt(tt - (n + 1) / 60).y)) n++;
      tipShown = null; tipA = 0;
      for (let m = n; m >= 1; m--) {
        const t = tt - m / 60;
        globe.setView({ lam: GLOBE.lam - turnDeg(t) });
        tipStep(tourAt(t).y, globe.basis(), 1 / 60, false);
      }
      globeDirty = true;
    }
    // the pointer, on the globe's canvas (design px), so the dots under it swell as they do on the page
    let ptr = { x: -1e5, y: -1e5, amt: 0 };
    if (pointerLive && (hovered || touchActive) && !still) {
      const gA = globeLayer && globeLayer.A ? globeLayer.A.o : { x: 0, y: 0 };
      ptr = {
        x: (DW - VW) / 2 + (pointer.x + 1) / 2 * VW - gA.x / s - GLOBE.box.x,
        y: scroll + (pointer.y + 1) / 2 * VH - gA.y / s - GLOBE.box.y,
        amt: get('globe.magnify') * h01,
      };
    }
    const moving = !still || globeDirty;
    if (moving) { globe.draw({ lam, pointer: ptr }); globeDirty = false; }
    lastPtr = ptr;

    const pos = tipStep(scroll, globe.basis(), dt, still);
    if (pos) {
      const str = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
      if (str !== lastTip) { tip.style.transform = str; lastTip = str; }
    }
    const op = tipA.toFixed(3);
    if (op !== lastTipOp) { tip.style.opacity = op; lastTipOp = op; }
  }
  // the event tip: on the labelled city nearest the front, fading as it turns away or leaves the frame
  function tipStep(y, B, dt, still) {
    let best = null, bestScore = 0.18;
    const scoreOf = (c) => {
      const p = globe.project(c[1], c[2], B);
      const py = p.y + GLOBE.box.y, px = p.x + GLOBE.box.x;
      const inFrame = clamp((y + VH - 34 - py) / 36, 0, 1) * clamp((py - y - 190) / 60, 0, 1) *
        clamp((px - (DW - VW) / 2 - 110) / 60, 0, 1) * clamp(((DW + VW) / 2 - 110 - px) / 60, 0, 1);
      return { p, v: clamp((p.front - 0.2) / 0.25, 0, 1) * inFrame };
    };
    const show = (c) => { tipShown = c; tipCity.textContent = c[0]; };
    for (const c of tipCities) {
      const r = scoreOf(c);
      const sc = r.v + (c === tipShown ? 0.25 : 0);     // a little loyalty, so it does not flicker between two
      if (r.v > 0.05 && sc > bestScore) { bestScore = sc; best = c; }
    }
    if (!tipShown && best) show(best);
    let target = 0, pos = null;
    if (tipShown) {
      const r = scoreOf(tipShown);
      pos = r.p;
      target = best === tipShown ? r.v : 0;
    }
    tipA += (target - tipA) * (still ? 1 : 1 - Math.exp(-dt / 0.12));
    if (tipA < 0.02 && best && best !== tipShown) show(best);
    return pos;
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
    if (canDrag) { try { persp.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } }
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
      const stepPx = across ? ddx * get('drag.scrub') : -ddy;
      scroll = clamp(scroll + stepPx * pxPerScreen(), 0, maxScroll);
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
    if (typeof d.at === 'number' && !dragging) seekTime(d.at);
    if (typeof d.visible === 'boolean') { parentVisible = d.visible; wake(); }
  });

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  reduced.addEventListener('change', () => { globeDirty = true; });
  layout();
  wake();

  window.__anthropicCommunityCard = {
    embed,
    defaults: DEFAULTS,
    set(values, path) {
      Object.assign(V, values);
      card.classList.toggle('show-layers', !!V['debug.outlines']);
      if (globe) {
        globe.look.dotSize = V['globe.dotSize'];
        globe.setMirror(!V['globe.land']);
        globeDirty = true;
      }
      if (!path || /^card\.|^tilt\.|^light\.bloomSize/.test(path)) layout();
    },
    values: V,
    layout,
    seekTime,
    // a handle for the verify scripts
    get scroll() { return scroll; }, get mode() { return T.mode; }, get stop() { return tourAt(tt).i; },
    get h() { return spr.h.x; }, get running() { return running; }, get layers() { return layers.length; },
    get stops() { return stops.slice(); }, get maxScroll() { return maxScroll; }, get period() { return PERIOD; },
    get tourTime() { return tt; }, get globeLon() { return lam; }, get frameMs() { return frameMs; }, get frames() { return frames.slice(); }, get costs() { return costs.slice(); }, get pointerOnGlobe() { return lastPtr; },
    get globe() { return globe ? { webgl: globe.webgl, dots: globe.dots, q: gQ, tip: tipShown && tipShown[0], tipOpacity: tipA } : null; },
    seek(i, t = 0) { seekTime(LEG[clamp(i | 0, 0, stops.length - 1)] + t); },
  };
})();
