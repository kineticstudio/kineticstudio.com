/* Superinterviews work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page on a fixed timeline that starts and
     ends on the hero, never paused by hover; a drag takes over, coasts, and
     the tour picks up from there
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: Superinterviews' own scroll choreography (the dashboard in the
     hero lying back at 25 degrees and flattening as the page scrolls, the
     $25,000,000 counting up, the feature rows sliding in) and its ambient
     motion (the logo and quote marquees, the glowing Refine with AI button,
     the cursor over resume.pdf), all on the tour's own clock so the recorded
     loop is seamless

   The miniature is the live home page laid out in its own flow at 1440px.
   Every [data-depth] element is a layer; on hover each is projected as if it
   sat at its own height above the card plane, so the parallax matches the
   real 3D tilt.

   Embedded (?embed=1, the site's tile): a click that is not a drag posts
   {type: "ks-card-open"} to the parent and never navigates; the parent posts
   {type: "ks-card", visible} to pause and resume and {type: "ks-card", at}
   to put the tour at a time. &bleed=N keeps N px of clear frame round the
   card (set on the page in the head script), &radius=N rounds it, touch drag
   only with &touchdrag=1.

   window.__superinterviewsCard is the handle the dials, the site and the
   verify scripts use. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const EMBED = document.documentElement.classList.contains('embed');
  const BLEED = EMBED ? Math.max(0, parseFloat(qs.get('bleed')) || 0) : 0;   // px of iframe overhanging the tile (the CSS keeps it clear)

  const DW = 1440;                       // Superinterviews' design width
  const MAX_VH = 1100;                   // a frame taller than the page can fill crops the sides rather than shrinking the page
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset on the card ground
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height, light from above and a touch left
  const TICK_PER = 80;                   // design px of scroll per ruler notch
  const CLICK_PX = 6;                    // a press that moves less than this is a click
  const TILT_DEG = 25, TILT_UNTIL = 600; // the hero dashboard lies back this far and is flat by this much scroll (the live page's numbers)
  const RV_RAMP = 150;                   // px of scroll a block takes to slide in

  /* the tour: hold on a stop, glide to the next, every leg eased in and out (seconds at speed 1).
     at: 'start' is the top of the page, 'top' puts the element's top at the top of the view, 'center' centres it (or the span to `to`). */
  const STOPS = [
    { id: 's-hero', at: 'start', hold: 2.4, move: 1.9 },
    { id: 's-stats', to: 's-fhead', at: 'center', hold: 1.4, move: 1.5 },
    { id: 's-f1', at: 'center', hold: 1.5, move: 1.5 },
    { id: 's-f2', at: 'center', hold: 1.5, move: 2.2 },
    { id: 's-f6', at: 'center', hold: 1.5, move: 1.8 },
    { id: 's-cta', at: 'top', hold: 1.5, move: 2.3 },
  ];
  const PERIOD = STOPS.reduce((a, S) => a + S.hold + S.move, 0);

  const DEFAULTS = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.7, 'light.bloomSize': 1.3, 'light.rim': 0.5, 'light.shadow': 0.6,
    'motion.scrollSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.2,
    // the mat: Superinterviews' own pale sage (--green-light), the foot of its hero
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': '#b0fa7b', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
  const frac = (x) => ((x % 1) + 1) % 1;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav'), heroImage = $('#heroImage');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rimLight = $('#rimLight'), rim = $('#rim');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = $$('.ruler-in .ticks');
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
  const logoTrack = $('#logoTrack'), quoteTrack = $('#quoteTrack'), refineGlow = $('#refineGlow'), cursorIcon = $('#cursorIcon');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const V = { ...DEFAULTS };
  const get = (k) => V[k];
  // inside the site a finger scrolls the site, not the miniature, unless &touchdrag=1
  const touchDrag = !EMBED || qs.get('touchdrag') === '1';
  if (!touchDrag) persp.style.touchAction = 'pan-y';

  /* ---- the figure: "$25,000,000" as tokens, each digit a column of 0-9 stepped by transform ---- */
  const statNum = $('#statNum');
  if (statNum) {
    const text = statNum.textContent.trim();
    let place = text.replace(/[^0-9]/g, '').length;
    statNum.innerHTML = [...text].map((ch) => {
      if (/[0-9]/.test(ch)) { place--; return `<span class="tk dg" data-k="${place}"><span class="strip">${'0123456789'.split('').map((d) => `<span>${d}</span>`).join('')}</span></span>`; }
      if (ch === ',') return `<span class="tk cm" data-k="${place}">,</span>`;
      return `<span class="tk cur">${ch}</span>`;
    }).join('');
  }

  /* ---- shadow twins: a darkened, blurred copy left on the surface under a lifted layer ---- */
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(true);
    for (const n of [tw, ...tw.querySelectorAll('*')]) {
      for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-rv', 'id']) n.removeAttribute(a);
    }
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }
  const counters = $$('[data-countup]').map((el) => ({
    toks: [...el.querySelectorAll('.tk')].map((t) => ({
      el: t, strip: t.querySelector('.strip'), k: t.dataset.k == null ? -1 : +t.dataset.k,
      kind: t.classList.contains('dg') ? 'dg' : t.classList.contains('cm') ? 'cm' : 'cur', w: 0, last: '', op: '', d: -1,
    })),
  }));
  const COUNT_TO = statNum ? +statNum.dataset.countup : 0;

  /* ---- layers ---- */
  const layers = $$('[data-depth]').map((el) => ({
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

  /* ---- blocks that slide in as they scroll into view (the live page's scroll reveals, made reversible) ---- */
  const reveals = $$('[data-rv]').map((el) => {
    const [dx, dy] = el.dataset.rv.split(',').map(Number);
    return { el, dx, dy, y0: 0, last: '', op: '' };
  });
  const tones = $$('[data-tone]').map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));
  const stills = $$('.feature-still img').map((el, i) => ({ el, y: 0, ph: i * 1.3, last: '' }));

  /* ---- state ---- */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, VW = DW, maxScroll = 7600, stops = STOPS.map(() => 0);
  let logoW = 743, quoteW = 1212, countA = 0, countB = 1, glowY = 0;
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const T = { mode: 'hold', i: 0, j: 0, t: 0, from: 0, dur: 1, v: 0 };
  let scroll = 0, clock = 0, amb = 0, tone = 0, lift = 1;
  let hovered = false, touchActive = false, touchOn = false, pointerLive = false;
  const pointer = { x: 0, y: 0 }, bl = { x: 0, y: -0.2 };
  let down = null, dragging = false, samples = [];
  let running = false, parentVisible = true, raf = 0, tPrev = performance.now();
  let lastTicks = '', lastTone = '', lastTilt = '', lastLogo = '', lastQuote = '', lastGlow = '', lastCursor = '';

  function layout() {
    const framed = MAT > 0 || (!EMBED && get('card.frame'));
    const [aw, ah] = String(get('card.aspect')).split(':').map(Number);
    stage.style.setProperty('--size', get('card.cardSize'));
    stage.style.setProperty('--ar', (aw / ah) || 1.6);
    card.classList.toggle('is-framed', framed);
    card.style.setProperty('--frame-color', get('card.frameColor'));
    card.classList.toggle('ruler-inside', framed || EMBED);
    slot.classList.toggle('is-bleed', !framed && !EMBED);
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

    // the twins sit exactly on their elements (the page is in flow, so they are placed by hand)
    for (const L of layers) {
      if (!L.twin) continue;
      const el = L.el, tw = L.twin.el;
      Object.assign(tw.style, { left: el.offsetLeft + 'px', top: el.offsetTop + 'px', width: el.offsetWidth + 'px', height: el.offsetHeight + 'px' });
    }
    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.hh = L.el.offsetHeight / 2;
      L.last = '';
      if (L.twin) L.twin.last = '';
    }
    for (const t of tones) { t.y0 = topIn(t.el); t.y1 = t.y0 + t.el.offsetHeight; }
    for (const R of reveals) { R.y0 = topIn(R.el) - VH + 30; R.last = ''; R.op = ''; }
    for (const S of stills) { S.y = posIn(S.el, page)[1]; S.last = ''; }
    maxScroll = Math.max(0, page.offsetHeight - VH);
    stops = STOPS.map((S) => {
      const el = document.getElementById(S.id);
      let y = S.at === 'start' ? 0 : topIn(el);
      if (S.at === 'center') {
        const end = S.to ? document.getElementById(S.to) : el;
        y = (y + topIn(end) + end.offsetHeight) / 2 - VH / 2;
      }
      return clamp(y, 0, maxScroll);
    });
    // the figure counts up as it comes into view, landing as the tour stops on it
    if (statNum) { countA = topIn(statNum) - VH + statNum.offsetHeight / 2; countB = Math.max(countA + 1, stops[1]); }
    for (const C of counters) for (const t of C.toks) { t.w = t.el.offsetWidth; t.h = t.el.offsetHeight; t.last = ''; t.op = ''; t.d = -1; }
    glowY = refineGlow ? posIn(refineGlow, page)[1] : 0;
    const lis = logoTrack ? logoTrack.children : [];
    if (lis.length > 6) logoW = lis[6].offsetLeft - lis[0].offsetLeft;
    const qc = quoteTrack ? quoteTrack.children : [];
    if (qc.length > 3) quoteW = qc[3].offsetLeft - qc[0].offsetLeft;
    lastTilt = lastLogo = lastQuote = lastGlow = lastCursor = '';
    scroll = clamp(scroll, 0, maxScroll);
  }

  /* ---- the tour, as a little state machine so a drag can hand back to it anywhere ---- */
  function moveTo(j, from, dur) { T.mode = 'move'; T.j = j; T.from = from; T.t = 0; T.dur = Math.max(0.05, dur); }
  function resume() {
    // the next stop at or below where it was let go; past the last one, glide home
    let j = stops.findIndex((y) => y >= scroll - 24);
    if (j < 0) j = 0;
    const dist = Math.abs(stops[j] - scroll);
    if (dist < 2) { T.mode = 'hold'; T.i = j; T.t = 0; scroll = stops[j]; return; }
    moveTo(j, scroll, clamp(0.7 + dist / 1500, 0.9, 2.6));
  }
  // the tour's own clock: the site's resting loop is this tour recorded, so a
  // hovered tile tells the card where the loop is ({type: "ks-card", at}) and
  // the live card picks up from that frame
  function seekTime(t) {
    t = ((t % PERIOD) + PERIOD) % PERIOD;
    amb = t;
    for (let i = 0; i < STOPS.length; i++) {
      const S = STOPS[i], j = (i + 1) % STOPS.length;
      if (t < S.hold) { T.mode = 'hold'; T.i = i; T.t = t; scroll = stops[i]; return; }
      t -= S.hold;
      if (t < S.move) { moveTo(j, stops[i], S.move); T.i = i; T.t = t; scroll = stops[i] + (stops[j] - stops[i]) * ease(t / S.move); return; }
      t -= S.move;
    }
  }
  function advance(dt, still) {
    if (!still) amb += dt * get('motion.scrollSpeed');
    if (dragging) return;
    if (T.mode === 'coast') {
      const tau = 0.33 * get('drag.momentum');
      if (still || tau <= 0.001) T.v = 0;
      scroll += T.v * dt;
      T.v *= Math.exp(-dt / Math.max(tau, 0.001));
      if (scroll <= 0 || scroll >= maxScroll) { scroll = clamp(scroll, 0, maxScroll); T.v = 0; }
      if (Math.abs(T.v) < 12) { T.mode = 'wait'; T.t = 0; }
      return;
    }
    if (still) return;
    if (T.mode === 'wait') { T.t += dt; if (T.t >= get('drag.resumeAfter')) resume(); return; }
    const tdt = dt * get('motion.scrollSpeed');
    if (T.mode === 'hold') {
      T.t += tdt; scroll = stops[T.i];
      if (T.t >= STOPS[T.i].hold) moveTo((T.i + 1) % stops.length, scroll, STOPS[T.i].move);
    } else if (T.mode === 'move') {
      T.t += tdt;
      const u = Math.min(1, T.t / T.dur);
      scroll = T.from + (stops[T.j] - T.from) * ease(u);
      if (u >= 1) { T.mode = 'hold'; T.i = T.j; T.t = 0; }
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
    cshadow.style.opacity = ((EMBED ? 0.42 * h01 : 0.18 + 0.42 * h01) * (0.4 + shadowK)).toFixed(3);

    // the ruler: notches slide with the scroll, the reading mark stays put
    const fr = frac(scroll / TICK_PER);
    const tk = fr.toFixed(4);
    if (tk !== lastTicks) {
      lastTicks = tk;
      ticksOut.style.transform = `translate3d(0, ${(-fr * 6).toFixed(2)}px, 0)`;
      for (const el of ticksIn) el.style.transform = `translate3d(0, ${(-fr * 6 * K).toFixed(2)}px, 0)`;
    }
    // inside the card its ink follows the section under the reading mark (framed, it sits on the card ground)
    let dark = 0;
    if (EMBED && !card.classList.contains('is-framed')) {
      const yr = scroll + VH / 2;
      for (const t of tones) if (yr >= t.y0 && yr < t.y1) dark = t.dark ? 1 : 0;
    }
    tone += (dark - tone) * (still ? 1 : 1 - Math.exp(-dt / 0.18));
    const ts = tone.toFixed(3);
    if (ts !== lastTone) { lastTone = ts; inkLight.style.opacity = ts; inkDark.style.opacity = (1 - tone).toFixed(3); }

    choreography(still);
  }

  /* ---- the page's own motion, all functions of the scroll and the tour clock ---- */
  function choreography(still) {
    // the dashboard in the hero lies back at 25 degrees and flattens as the page scrolls
    const tilt = (TILT_DEG * (1 - clamp(scroll / TILT_UNTIL, 0, 1))).toFixed(2);
    if (tilt !== lastTilt) { heroImage.style.transform = `rotateX(${tilt}deg)`; lastTilt = tilt; }

    // the blocks slide in as they come into view (and back out, scrolling up)
    for (const R of reveals) {
      const p = clamp((scroll - R.y0) / RV_RAMP, 0, 1), e = 1 - (1 - p) * (1 - p);
      const str = p >= 1 ? 'none' : `translate3d(${(R.dx * (1 - e)).toFixed(1)}px, ${(R.dy * (1 - e)).toFixed(1)}px, 0)`;
      if (str !== R.last) { R.el.style.transform = str; R.last = str; }
      const op = e.toFixed(3);
      if (op !== R.op) { R.el.style.opacity = op; R.op = op; }
    }

    // the figure counts up (each digit's column steps to its value; leading places stay hidden, the rest stay centred)
    if (counters.length && Math.abs(countA + (countB - countA) / 2 - scroll) < VH * 1.5) {
      const p = clamp((scroll - countA) / (countB - countA), 0, 1);
      const v = Math.round(COUNT_TO * (1 - Math.pow(1 - p, 3)));
      for (const C of counters) {
        let hid = 0;
        const show = (t) => t.kind === 'cur' || t.k === 0 || v >= Math.pow(10, t.k);
        for (const t of C.toks) if (!show(t)) hid += t.w;
        for (const t of C.toks) {
          const vis = show(t);
          const op = vis ? '1' : '0';
          if (op !== t.op) { t.el.style.opacity = op; t.op = op; }
          const str = `translate3d(${(t.kind === 'cur' ? hid / 2 : -hid / 2).toFixed(1)}px, 0, 0)`;
          if (str !== t.last) { t.el.style.transform = str; t.last = str; }
          if (t.kind === 'dg') {
            const d = Math.floor(v / Math.pow(10, t.k)) % 10;
            if (d !== t.d) { t.strip.style.transform = `translate3d(0, ${-d * t.h}px, 0)`; t.d = d; }
          }
        }
      }
    }

    if (still) return;
    const ph = amb / PERIOD;   // whole cycles per tour, so the recorded loop is seamless
    // the logos run (one set per tour) while the band is near
    if (scroll < 2600) {
      const str = `translate3d(${(-frac(ph) * logoW).toFixed(2)}px, 0, 0)`;
      if (str !== lastLogo) { logoTrack.style.transform = str; lastLogo = str; }
    }
    // the quotes run, one set per tour
    if (scroll > 5400) {
      const str = `translate3d(${(-frac(ph) * quoteW).toFixed(2)}px, 0, 0)`;
      if (str !== lastQuote) { quoteTrack.style.transform = str; lastQuote = str; }
    }
    // the Refine with AI button glows (8 breaths a tour, about the live 2.5 s) and the cursor floats over resume.pdf
    if (Math.abs(glowY - scroll - VH / 2) < VH) {
      const g = (0.5 - 0.5 * Math.cos(2 * Math.PI * frac(ph * 8))).toFixed(3);
      if (g !== lastGlow) { refineGlow.style.opacity = g; lastGlow = g; }
      const u = frac(ph * 7);
      const kf = [[0, 0, 0], [0.3, -3, -4], [0.6, 2, -2], [1, 0, 0]];
      let i = 0; while (i < kf.length - 2 && u > kf[i + 1][0]) i++;
      const w = ease((u - kf[i][0]) / (kf[i + 1][0] - kf[i][0]));
      const str = `translate3d(${(kf[i][1] + (kf[i + 1][1] - kf[i][1]) * w).toFixed(2)}px, ${(kf[i][2] + (kf[i + 1][2] - kf[i][2]) * w).toFixed(2)}px, 0)`;
      if (str !== lastCursor) { cursorIcon.style.transform = str; lastCursor = str; }
    }
    // the background loops are stills here; each drifts very slowly, once round a tour
    for (const S of stills) {
      if (Math.abs(S.y - scroll - VH / 2) > VH) continue;
      const q = 2 * Math.PI * ph + S.ph;
      const str = `translate3d(${(7 * Math.sin(q)).toFixed(2)}px, ${(3 * Math.cos(q)).toFixed(2)}px, 0) scale(${(1.012 + 0.012 * Math.sin(q + 0.8)).toFixed(4)})`;
      if (str !== S.last) { S.el.style.transform = str; S.last = str; }
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
      if (wasTouch && !EMBED) { touchOn = !touchOn; }
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
    if (e.source && e.source !== window.parent && e.source !== window) return;
    if (typeof d.at === 'number' && isFinite(d.at) && !dragging && (T.mode === 'hold' || T.mode === 'move')) seekTime(d.at);
    if (typeof d.visible === 'boolean') { parentVisible = d.visible; wake(); }
  });

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  layout();
  wake();

  window.__superinterviewsCard = {
    embed: EMBED, bleed: BLEED, mat: MAT, defaults: DEFAULTS,
    set(values, path) {
      Object.assign(V, values);
      card.classList.toggle('show-layers', !!V['debug.outlines']);
      if (!path || /^card\.|^tilt\.perspective|^light\.bloomSize/.test(path)) layout();
    },
    values: V,
    layout,
    // a handle for the site and the verify scripts
    get period() { return PERIOD; },
    get scroll() { return scroll; }, get mode() { return T.mode; }, get stop() { return T.i; },
    get h() { return spr.h.x; }, get running() { return running; }, get layers() { return layers.length; },
    get stops() { return stops.slice(); }, get maxScroll() { return maxScroll; }, get vh() { return VH; },
    seek(i, t = 0) { T.mode = 'hold'; T.i = clamp(i | 0, 0, stops.length - 1); T.t = t; scroll = stops[T.i]; },
    seekTime,
  };
})();
