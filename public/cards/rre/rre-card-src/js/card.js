/* The RRE work card: one spring-driven loop, transforms and opacity only.

   The miniature is rre.com's homepage laid out in layers at its 1440px width.
   Every [data-depth] element is a layer; on hover the card tilts toward the
   pointer and each layer is projected as if it sat at its own height above the
   card plane, so the parallax matches the real 3D tilt. The page's film (a
   still of its aerial river delta) sits deepest, fixed in the viewport as on
   the site, so it shows through the gutter, the clear sections and the
   footer's logo window with real depth. The tour never stops for the hover; a
   press and drag scrolls the miniature by hand (with momentum), and the tour
   picks up again from wherever it was let go.

   The page's own motion, rebuilt on the card's clock (requestAnimationFrame
   timestamps), so one recorded tour closes on itself and a seek lands on the
   recorded frame:
   - the headings rise in line by line as they cross 85% of the screen and the
     copy and buttons under them fade up, and each section's hairlines draw
     in with them; all driven by the miniature's scroll, so they play the same
     on every lap and under a drag
   - the film drifts very slowly, once round a tour
   - two of the page's hovers play on the tour's clock: "Deeper relationships"
     lights white, and the first of the latest posts lights sky blue

   A classic script, so the card also runs opened straight from disk.
   window.__rreCard is the handle for the dials, the site and the verify scripts. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const embed = document.documentElement.classList.contains('embed');

  const DW = 1440;                       // RRE's design width
  const MAX_VH = 1100;                   // a frame taller than the page can fill crops the sides rather than shrinking the page
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset on the card ground
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height, light from above and a touch left
  const TICK_PER = 80;                   // design px of scroll per ruler notch
  const CLICK_PX = 6;                    // a press that moves less than this is a click
  const NAV_H = 124;                     // the nav at rest; it scrolls away with the page
  const TRIGGER = 0.85;                  // the page's reveals start when a heading's top crosses 85% of the screen
  const TAU = Math.PI * 2;

  /* the tour: hold on a stop, glide to the next, every leg eased in and out (seconds at speed 1).
     The last stop is the foot of the page (off: 'end'); the last leg glides home to the hero. */
  const STOPS = [
    { id: 's-hero', off: 0, hold: 2.2, move: 1.6 },
    { id: 's-conf', off: 0, hold: 1.5, move: 1.6 },
    { id: 's-invest', off: 0, hold: 1.7, move: 1.6 },
    { id: 's-testi', off: 0, hold: 1.4, move: 1.6 },
    { id: 's-blogs', off: 0, hold: 1.7, move: 1.6 },
    { id: 's-foot', off: 'end', hold: 1.4, move: 2.4 },
  ];
  const PERIOD = STOPS.reduce((a, S) => a + S.hold + S.move, 0);   // 20.3 s
  const STARTS = []; { let a = 0; for (const S of STOPS) { STARTS.push(a); a += S.hold + S.move; } }
  // the page's hover moments, on the tour's clock
  const HOVERS = [
    { key: 'acc', on: STARTS[2] + 0.45, off: STARTS[2] + STOPS[2].hold + 0.1, fade: 0.3 },
    { key: 'row', on: STARTS[4] + 0.35, off: STARTS[4] + STOPS[4].hold + 0.1, fade: 0.2 },
  ];

  const DEFAULTS = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.62, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.6,
    'motion.scrollSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21, 'motion.drift': 1,
    'drag.momentum': 1, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.2,
    // the mat: RRE's own sky blue (--brand--primary, the latest posts' hover), so it reads on the site's near-black page and
    // stays distinct from both the page's powder-blue sections and its dark film when the tour stops on them
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': '#6ccfff', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const c01 = (v) => clamp(v, 0, 1);
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * c01(t));
  const out3 = (t) => 1 - Math.pow(1 - c01(t), 3);   // power3.out, the page's heading ease
  const out2 = (t) => 1 - Math.pow(1 - c01(t), 2);   // power2.out, its copy
  const wrap = (t) => ((t % PERIOD) + PERIOD) % PERIOD;

  const $ = (s) => document.querySelector(s);
  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav'), navShift = $('#navShift'), filmImg = $('#filmImg');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rimLight = $('#rimLight'), rim = $('#rim');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = [...document.querySelectorAll('.ruler-in .ticks')];
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
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
    el, d: +el.dataset.depth, kind: el.dataset.kind || (nav.contains(el) ? 'vp' : 'page'),
    twin: el._twin || null, parent: null, cx: 0, cy: 0, hh: 0, A: null, last: '', skip: false,
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
  const topIn = (el) => posIn(el, page)[1] - el.offsetHeight / 2;

  /* ---- the reveals: per section, its heading's lines, the copy under it and its hairlines,
     all keyed to the heading crossing 85% of the screen (twins included, so shadows rise with them) ---- */
  const groups = [...document.querySelectorAll('.sec')].filter((sec) => sec.querySelector('[data-rv="h"]')).map((sec) => {
    const heads = [...sec.querySelectorAll('[data-rv="h"]')];
    const lines = heads.map((h) => [...h.querySelectorAll('.ln > span')]);
    const sibs = [1, 2].map((k) => [...sec.querySelectorAll(`[data-rv="${k}"]`)].map((el) => ({ el, last: '' })));
    const rules = [...sec.querySelectorAll('.rule')].map((el, j) => ({ el, j, v: el.classList.contains('v'), last: '' }));
    return { sec, head: heads.find((h) => !h.classList.contains('twin') && !h.closest('.twin')) || heads[0], lines: lines.map((ls) => ls.map((el, i) => ({ el, i, last: '' }))), sibs, rules, y: 0, y0: 0, y1: 0 };
  });
  // the elements a hover lights (data-hover="acc" / "row"): a background and, for the post, its words in ink
  const hovers = HOVERS.map((H) => ({ ...H, els: [...document.querySelectorAll(`[data-hover="${H.key}"]`)], outs: [...document.querySelectorAll(`[data-hover-out="${H.key}"]`)], v: 0, last: '' }));
  const tones = [...document.querySelectorAll('[data-tone]')].map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));

  /* ---- state ---- */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, VW = DW, maxScroll = 4000, stops = STOPS.map(() => 0);
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const T = { mode: 'tour', j: 0, t: 0, from: 0, dur: 1, v: 0 };
  // clock: the springs' idle sway; tourT: the tour's own time; tt: the motion clock (the film's drift),
  // which never stops for a drag. tt and tourT are one and the same until someone drags.
  let scroll = 0, clock = 0, tt = 0, tourT = 0, tone = 0, lift = 1;
  let hovered = false, touchActive = false, touchOn = false, pointerLive = false;
  const pointer = { x: 0, y: 0 }, bl = { x: 0, y: -0.2 };
  let down = null, dragging = false, samples = [];
  let running = false, parentVisible = true, raf = 0, tPrev = performance.now();
  let lastNav = '', lastTicks = '', lastTone = '', lastFilm = '', snap = true, frameDark = false;
  const frameLog = [];

  /* ---- layout ---- */
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
    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.hh = L.el.offsetHeight / 2;
      L.last = null;   // null, never '': '' is a real value (no transform), so a reset to it could skip a needed write
      if (L.twin) L.twin.last = L.twin.op = null;
    }
    for (const G of groups) {
      G.y = topIn(G.head); G.y0 = topIn(G.sec); G.y1 = G.y0 + G.sec.offsetHeight;
      for (const ls of G.lines) for (const l of ls) l.last = null;
      for (const ks of G.sibs) for (const k of ks) k.last = null;
      for (const r of G.rules) r.last = null;
    }
    for (const t of tones) { t.y0 = topIn(t.el); t.y1 = t.y0 + t.el.offsetHeight; }
    maxScroll = Math.max(0, page.offsetHeight - VH);
    stops = STOPS.map((S) => S.off === 'end' ? maxScroll : clamp(topIn(document.getElementById(S.id)) + S.off, 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    lastNav = lastFilm = lastTicks = lastTone = null;
    for (const H of hovers) H.last = null;
    snap = true;
  }

  /* ---- the tour: a pure function of its own clock, so every loop closes exactly on the hero.
     A drag takes over (drag, coast, wait), then a glide hands back to the next stop and the
     tour clock picks up at that stop's hold. The site's resting loop is this tour recorded,
     so a hovered tile tells the card where the loop is ({type: "ks-card", at}) and the live
     card picks up from that very frame. ---- */
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
  function seekTime(t) {
    tt = tourT = wrap(+t || 0);
    T.mode = 'tour'; T.v = 0;
    scroll = tourAt(tourT).y;
    snap = true;
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
    raf = requestAnimationFrame(frame);
  }

  function render(dt, still) {
    const rx = spr.rx.x, ry = spr.ry.x;
    const hc = clamp(spr.h.x, -0.2, 1.2), h01 = clamp(spr.h.x, 0, 1);
    const depth = get('layers.depth'), par = get('layers.parallax'), spread = get('layers.spread');
    const tiltMax = get('tilt.tiltMax');
    lift = 1 + (get('tilt.hoverScale') - 1) * hc;
    const shadowK = get('light.shadow');

    page.style.transform = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    const navStr = `translate3d(0, ${(-Math.min(scroll, NAV_H + 4)).toFixed(2)}px, 0)`;
    if (navStr !== lastNav) { navShift.style.transform = navStr; lastNav = navStr; }

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
    if (card.classList.contains('is-framed')) dark = frameDark ? 1 : 0;
    else if (embed) {
      const yr = scroll + VH / 2;
      dark = 1;
      for (const t of tones) if (yr >= t.y0 && yr < t.y1) dark = t.dark ? 1 : 0;
    }
    // (a jump in time, or the first frame, lands with the ink already right: no fade through)
    tone += (dark - tone) * (still || snap ? 1 : 1 - Math.exp(-dt / 0.18));
    const ts = tone.toFixed(3);
    if (ts !== lastTone) { lastTone = ts; inkLight.style.opacity = ts; inkDark.style.opacity = (1 - tone).toFixed(3); }

    // the film drifts, once round a tour (a still under reduced motion)
    const dr = still ? 0 : get('motion.drift'), w = TAU * tt / PERIOD;
    const filmStr = `translate3d(${(dr * 16 * Math.sin(w + 0.6)).toFixed(2)}px, ${(dr * 11 * Math.sin(2 * w + 1.1)).toFixed(2)}px, 0) scale(${(1.045 + dr * 0.025 * Math.sin(w)).toFixed(4)})`;
    if (filmStr !== lastFilm) { filmImg.style.transform = filmStr; lastFilm = filmStr; }

    // the reveals, by the miniature's scroll: heading lines rise, the copy fades up, the hairlines draw
    const trig = scroll + TRIGGER * VH;
    for (const G of groups) {
      if (G.y1 < scroll - VH * 0.6 || G.y0 > scroll + VH * 1.6) continue;
      const d = trig - G.y;
      for (const ls of G.lines) for (const l of ls) {
        const e = out3((d - 30 * l.i) / 130);
        const str = e >= 1 ? '' : `translate3d(0, ${((1 - e) * 110).toFixed(2)}%, 0)|${e.toFixed(3)}`;
        if (str !== l.last) { const [tf, op] = str.split('|'); l.el.style.transform = tf || ''; l.el.style.opacity = op ?? ''; l.last = str; }
      }
      G.sibs.forEach((ks, k) => {
        const e = out2((d - 100 - 30 * k) / 100);
        const str = e >= 1 ? '' : `translate3d(0, ${((1 - e) * 20).toFixed(2)}px, 0)|${e.toFixed(3)}`;
        for (const x of ks) if (str !== x.last) { const [tf, op] = str.split('|'); x.el.style.transform = tf || ''; x.el.style.opacity = op ?? ''; x.last = str; }
      });
      for (const r of G.rules) {
        const e = out3((d - 30 - 6 * r.j) / 140);
        const str = e >= 1 ? '' : `${r.v ? 'scaleY' : 'scaleX'}(${e.toFixed(4)})`;
        if (str !== r.last) { r.el.style.transform = str; r.last = str; }
      }
    }

    // the page's two hovers, on the tour's clock
    for (const H of hovers) {
      const t = tourT;
      const target = still ? 0 : ease((t - H.on) / H.fade) * (1 - ease((t - H.off) / H.fade));
      H.v = snap || still ? target : H.v + (target - H.v) * (1 - Math.exp(-dt / 0.06));
      const op = H.v.toFixed(3);
      if (op !== H.last) { for (const el of H.els) el.style.opacity = op; for (const el of H.outs) el.style.opacity = (1 - H.v).toFixed(3); H.last = op; }
    }
    snap = false;
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
    if (typeof d.at === 'number' && isFinite(d.at) && !dragging) seekTime(d.at);   // never mid-drag
    if (typeof d.visible === 'boolean') { parentVisible = d.visible; wake(); }
  });
  reduced.addEventListener('change', () => { if (reduced.matches) seekTime(0); });

  /* ---- the handle ---- */
  const api = {
    embed,
    defaults: DEFAULTS,
    values: V,
    set(values, path) {
      Object.assign(V, values);
      card.classList.toggle('show-layers', !!V['debug.outlines']);
      if (!path || /^card\.|^tilt\.perspective|^light\.bloomSize/.test(path)) layout();
    },
    layout,
    // the tour's length in seconds (the site records one tour as the tile's resting loop)
    get period() { return PERIOD; },
    // a handle for the verify scripts
    get scroll() { return scroll; }, get mode() { return T.mode; }, get stop() { return tourAt(tourT).i; },
    get tourT() { return tourT; }, get VH() { return VH; },
    get h() { return spr.h.x; }, get running() { return running; }, get layers() { return layers.length; },
    get stops() { return stops.slice(); }, get starts() { return STARTS.slice(); }, get maxScroll() { return maxScroll; },
    get frames() { return frameLog.slice(); },
    seek(i, t = 0) { seekTime(STARTS[clamp(i | 0, 0, STOPS.length - 1)] + t); },
    seekTime,
  };
  window.__rreCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  if (document.fonts) document.fonts.ready.then(layout);
  for (const img of document.images) if (img.decode) img.decode().catch(() => {});
  window.addEventListener('load', layout);
  layout();
  wake();
})();
