/* Superlink work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 21 s round, never paused by
     hover; a drag (up and down like a phone, or sideways to scrub, right going
     further down the page) takes over, coasts, and the tour picks up from
     where it was left
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: the site's own scroll choreography (the black hero lifting away
     at 3.2 times the page, so Nora's card, which keeps to the page, drops out
     of the row of names into the vision; the vision's title rising at 1.7
     times; the feature cards spreading out from the tree as they arrive; the
     two rows of posts drifting past each other) and light stand-ins for its
     films (Nora's mountains and the ocean as stills with a slow drift, the
     glows breathing)

   window.superlinkCard is the handle the page's dials and the verify script use. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const EMBED = qs.has('embed') && qs.get('embed') !== '0';
  document.documentElement.classList.toggle('is-embed', EMBED);
  const BLEED = EMBED ? Math.max(0, parseFloat(qs.get('bleed')) || 0) : 0; // px of frame overhanging the tile
  const RADIUS = EMBED && qs.has('radius') ? Math.max(0, parseFloat(qs.get('radius')) || 0) : 6; // the card's corners, CSS px
  const TOUCH_DRAG = !EMBED || qs.get('touchdrag') === '1';               // in a tile, a swipe scrolls the site
  const CLICK = 6;                                                        // px: less is a click, more a drag

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const frac = (x) => x - Math.floor(x);

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksIn = $$('.notches-in .ticks'), ticksOut = $('.notches-out .ticks');
  const inkDark = $('.notches-in .dark'), inkLight = $('.notches-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // the site's design width
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left
  /* the site's scroll speeds: the hero at 3.2 times the page, the vision's title at 1.7 */
  const PIN = { hero: { k: -2.2, upTo: 480 }, title: { k: -0.7, upTo: 1500 } };
  /* the two rows of posts: one set's width each, and their drift in px/s (the top row left, the bottom right) */
  const ROWS = [{ id: 'tRow1', span: 2080, speed: -12 }, { id: 'tRow2', span: 2000, speed: 10 }];

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.7, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.75,
    'motion.tourSpeed': 1, 'motion.ambient': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.scrub': 2.5, 'drag.momentum': 1, 'drag.friction': 0.32, 'drag.resumeAfter': 1.2,
    'card.cardSize': 40, 'card.frame': false, 'card.frameColor': '#8defde', 'card.notches': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  if (EMBED && /^(1|framed)$/.test(qs.get('frame') || '')) V['card.frame'] = true;
  const DEFAULTS = Object.assign({}, V);
  card.style.setProperty('--r', RADIUS + 'px');

  /* ================= the rows of posts: a second copy of each set, so a row never runs out ================= */
  for (const R of ROWS) {
    const mq = document.getElementById(R.id);
    const shift = R.speed < 0 ? R.span : -R.span; // drifting left, the copy follows on the right; drifting right, it leads on the left
    for (const el of [...mq.children]) {
      const c = el.cloneNode(true);
      c.style.left = (parseFloat(el.style.left) + shift) + 'px';
      mq.appendChild(c);
    }
    R.el = mq; R.last = '';
  }

  /* ================= shadow twins ================= */
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur, kind] = el.dataset.shadow.split(',');
    const tw = el.cloneNode(true);
    if (kind === 'box') {
      // a plain rounded slab in the layer's shape, cheaper than the layer itself in black
      const src = parseFloat(getComputedStyle(el).borderTopLeftRadius) ? el : (el.firstElementChild || el);
      tw.innerHTML = '';
      tw.classList.add('box');
      const tb = document.createElement('i');
      tb.className = 'tb';
      tb.style.borderRadius = getComputedStyle(src).borderRadius;
      tw.appendChild(tb);
    }
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-stop', 'data-pin', 'id']) n.removeAttribute(a);
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', +blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface: +surface, alpha: +alpha, last: '', op: '' };
  }

  /* ================= layers ================= */
  const layers = $$('[data-depth]').map((el) => {
    const pinEl = el.closest('[data-pin]');
    return {
      el, d: +el.dataset.depth, kind: el === win ? 'card' : 'page',
      pin: pinEl ? pinEl.dataset.pin : null, twin: el._twin || null, parent: null,
      cx: 0, cy: 0, h: 0, A: null, last: '',
    };
  });
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const winLayer = layers[0];
  const pins = $$('[data-pin]').map((el) => ({ el, name: el.dataset.pin, last: '' }));
  const pinY = {};
  for (const p of pins) pinY[p.name] = 0;
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= the page's own motion ================= */
  // the feature cards spread out from the tree as they arrive: the left column from the right, the right from the left
  const spreads = $$('[data-spread]').map((el) => ({
    el: el.classList.contains('twin') ? el.querySelector('.tb') : el.querySelector('.fc'),
    host: el, dx: +el.dataset.spread, y: 0, last: '',
  }));
  const amb = {
    heroGlow: { el: $('#hGlow'), last: '', op: '' },
    film: { el: $('#nFilm'), last: '' },
    namesGlow: { el: $('#nGlow'), last: '', op: '' },
    sea: { el: $('#bSea'), last: '' },
  };

  /* ================= state ================= */
  let cw = 576, ch = 432, K = 2.5, cardW = 1440, cardH = 1080;
  let s = 0.36, VH = 900, maxScroll = 5000;
  let stops = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const secs = {};
  let darkRanges = [];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, ambT = 0, clock = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', liftNow = 1, tone = 0, lastTone = '';

  function layout() {
    stage.style.setProperty('--size', V['card.cardSize']);
    const framed = MAT > 0 || (!!V['card.frame']);
    card.classList.toggle('is-framed', framed);
    card.style.setProperty('--frame-color', V['card.frameColor']);
    card.classList.toggle('is-light-frame', luminance(V['card.frameColor']) > 0.55);
    cw = persp.clientWidth; ch = persp.clientHeight;
    if (!cw || !ch) return;
    K = Math.min(4, Math.max(1, (window.devicePixelRatio || 1) * 1.25));
    cardW = cw * K; cardH = ch * K;
    card.style.setProperty('--k', K);
    Object.assign(card.style, { width: cardW + 'px', height: cardH + 'px', left: (cw - cardW) / 2 + 'px', top: (ch - cardH) / 2 + 'px' });
    slot.classList.toggle('full', !framed);
    slot.classList.toggle('no-notches', !V['card.notches']);
    winLayer.d = framed ? 0.1 : 0;
    win.dataset.depth = winLayer.d;
    const mx = framed ? (MAT ? MAT * cardW : FRAME.x * cardW) : 0, my = framed ? (MAT ? MAT * cardW : FRAME.y * cardH) : 0;
    card.style.setProperty('--mx', mx + 'px');
    card.style.setProperty('--my', my + 'px');
    card.style.setProperty('--win-r', framed ? (cardW * 0.0125) + 'px' : '0px');
    card.style.setProperty('--card-px', cardW + 'px');
    const winW = cardW - 2 * mx, winH = cardH - 2 * my;
    s = winW / DW;
    // fit by cropping, never letterbox: the page is always 1440 wide and as tall as the window allows
    VH = Math.max(640, Math.round(DW * winH / winW));
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.transform = `scale(${s})`;
    persp.style.perspective = (V['tilt.perspective'] * cw) + 'px';
    card.style.transform = `scale(${1 / K})`;
    bloom.style.width = bloom.style.height = (V['light.bloomSize'] * cardW) + 'px';
    bloom.style.left = bloom.style.top = (-V['light.bloomSize'] * cardW / 2) + 'px';

    for (const p of pins) { p.el.style.transform = ''; p.last = ''; }
    for (const L of layers) {
      [L.cx, L.cy] = posIn(L.el, L.kind === 'card' ? card : page);
      L.h = L.el.offsetHeight;
    }
    for (const sp of spreads) sp.y = posIn(sp.host, page)[1] - sp.host.offsetHeight / 2;
    for (const el of $$('.page > [data-stop]')) secs[el.dataset.stop] = { y: el.offsetTop, h: el.offsetHeight };
    maxScroll = Math.max(0, page.offsetHeight - VH);
    // a band's middle under the window's middle
    const at = (mid) => Math.round(mid - VH / 2);
    stops = [
      0,                                   // the hero: own the real you, the row of names
      320,                                 // the hero gone, Nora's card under the vision
      at(secs.features.y + 571),           // the four features on the tree
      at(secs.names.y + secs.names.h / 2), // just you, nothing else: the names struck through
      at(secs.brand.y + secs.brand.h / 2), // the ocean and Nora's name in its field
      at(secs.story.y + 538),              // the story of a million names
      at(secs.said.y + 312),               // the two rows of posts
      at(secs.one.y + 479),                // there is only one you, the free name
      maxScroll,                           // the footer
    ].map((y) => clamp(y, 0, maxScroll));
    // where the ruler's ink goes light: the black band and the ocean (the rest is cream and mint)
    darkRanges = [[secs.names.y, secs.story.y]];
    scroll = clamp(scroll, 0, maxScroll);
    for (const L of layers) L.last = '_';
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; about 21 s round
    [1.6, 1.4], [1.4, 1.1], [1.3, 1.0], [1.2, 0.9], [1.2, 0.9], [1.0, 0.9], [1.1, 0.85], [1.1, 0.85], [1.1, 2.2],
  ];
  const TOUR = LEGS.reduce((a, [h, m]) => a + h + m, 0);
  const holdAt = LEGS.reduce((a, [h, m], i) => (a.push(i ? a[i - 1] + LEGS[i - 1][0] + LEGS[i - 1][1] : 0), a), []);
  function tourAt(t) {
    t = ((t % TOUR) + TOUR) % TOUR;
    for (let i = 0; i < LEGS.length; i++) {
      const [h, m] = LEGS[i];
      if (t < h) return stops[i];
      t -= h;
      if (t < m) return stops[i] + (stops[(i + 1) % stops.length] - stops[i]) * ease(t / m);
      t -= m;
    }
    return 0;
  }
  /* after a drag: ease from wherever it was left to the next stop down the page, then carry on the tour from that stop */
  function resumeTour() {
    let j = stops.findIndex((y) => y > scroll + 3);
    const at = stops.findIndex((y) => Math.abs(y - scroll) <= 3);
    if (at >= 0) { mode = 'tour'; phase = holdAt[at] + LEGS[at][0] * 0.35; return; }
    if (j < 0) j = 0;
    const dist = Math.abs(stops[j] - scroll);
    bridge = { from: scroll, to: stops[j], stop: j, t: 0, dur: clamp(0.55 + dist / 2600, 0.6, 2.4) };
    mode = 'bridge';
  }

  function step(S, target, k, c, dt) {
    const n = Math.ceil(dt / (1 / 240)), h = dt / n;
    for (let i = 0; i < n; i++) { S.v += (-k * (S.x - target) - c * S.v) * h; S.x += S.v * h; }
  }

  /* ================= the frame ================= */
  let tPrev = performance.now(), rafId = 0, running = false;
  const frameLog = [];
  function frame(now) {
    if (!running) return;
    const raw = (now - tPrev) / 1000;
    const dt = Math.min(0.05, Math.max(0, raw));
    tPrev = now; clock += dt;
    if (frameLog.length > 600) frameLog.shift();
    frameLog.push(raw * 1000);
    const still = reduced.matches;
    if (!still) ambT += dt * V['motion.ambient'];
    const k = V['motion.stiffness'], c = V['motion.damping'], tiltMax = V['tilt.tiltMax'];
    const hold = V['debug.hold'];

    // what the hover wants
    const engaged = hovered || touchOn || touchLatch || dragging || hold || still;
    let nx = 0, ny = 0;
    if (still) { nx = -0.38; ny = -0.3; }
    else if (engaged) {
      if (pointerLive) { nx = pointer.x; ny = pointer.y; }
      else { nx = 0.42 * Math.sin(clock * 0.55); ny = 0.3 * Math.sin(clock * 0.77 + 1.1); }
    }
    if (still) { spr.rx.x = -ny * tiltMax; spr.ry.x = nx * tiltMax; spr.h.x = 1; spr.rx.v = spr.ry.v = spr.h.v = 0; glow.x = nx; glow.y = ny; }
    else {
      step(spr.rx, -ny * tiltMax, k, c, dt);
      step(spr.ry, nx * tiltMax, k, c, dt);
      step(spr.h, engaged ? 1 : 0, k * 0.8, c * 0.95, dt);
      const g = 1 - Math.exp(-dt / 0.07);
      glow.x += (nx - glow.x) * g; glow.y += (ny - glow.y) * g;
    }

    // the scroll: the tour, a drag and its coast, or the bridge back into the tour. Hover never stops it.
    const speed = V['motion.tourSpeed'];
    if (mode === 'tour') {
      if (!still) { phase += dt * speed; scroll = tourAt(phase); }
    } else if (mode === 'manual') {
      if (!dragging) {
        if (Math.abs(coast) > 40 && !still) { // design px/s: below this the coast is done
          scroll += coast * dt;
          coast *= Math.exp(-dt / Math.max(0.05, V['drag.friction']));
          if (scroll <= 0 || scroll >= maxScroll) { scroll = clamp(scroll, 0, maxScroll); coast = 0; }
        } else {
          coast = 0; idle += dt;
          if (idle >= V['drag.resumeAfter'] && !still) resumeTour();
        }
      }
    } else if (mode === 'bridge') {
      bridge.t += dt * Math.max(0.1, speed);
      const u = clamp(bridge.t / bridge.dur, 0, 1);
      scroll = bridge.from + (bridge.to - bridge.from) * ease(u);
      if (u >= 1) { mode = 'tour'; phase = holdAt[bridge.stop]; bridge = null; }
    }
    scroll = clamp(scroll, 0, maxScroll);

    render(dt, still);
    rafId = requestAnimationFrame(frame);
  }

  function setT(o, el, str) { if (o.last !== str) { el.style.transform = str; o.last = str; } }
  function setO(o, el, str) { if (o.op !== str) { el.style.opacity = str; o.op = str; } }

  function render(dt, still) {
    const rx = spr.rx.x, ry = spr.ry.x;
    const hc = Math.max(-0.2, Math.min(1.2, spr.h.x));
    const h01 = clamp(spr.h.x, 0, 1);
    const depth = V['layers.depth'], par = V['layers.parallax'], spread = V['layers.spread'];
    const tiltMax = V['tilt.tiltMax'];
    const shadowK = V['light.shadow'];
    const a = rx * Math.PI / 180, b = ry * Math.PI / 180;
    const Pc = V['tilt.perspective'] * cardW; // the eye distance in the card's own px
    // embedded, the frame is the limit: the card lifts only as far as the bleed allows once its
    // nearest corner has come forward with the tilt, and with no bleed it shrinks a touch instead
    const hoverLift = 1 + (V['tilt.hoverScale'] - 1) * hc;
    const lift = EMBED
      ? Math.min(hoverLift, Math.min((cw / 2 + BLEED) / (cw / 2), (ch / 2 + BLEED) / (ch / 2)) *
          (1 - (Math.abs(Math.sin(b)) * cardW / 2 + Math.abs(Math.sin(a)) * cardH / 2) / Pc))
      : hoverLift;
    liftNow = lift;

    /* ---- the page: scroll and the site's own choreography ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    // the hero lifts away faster than the page, the vision's title a little faster
    for (const p of pins) {
      const P = PIN[p.name];
      pinY[p.name] = P ? P.k * Math.min(scroll, P.upTo) : 0;
      setT(p, p.el, pinY[p.name] ? `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)` : '');
    }
    // the feature cards spread out to the tree as they come up into the window
    for (const sp of spreads) {
      const into = VH - (sp.y - scroll);
      const t = still ? 1 : smooth(into, VH * 0.22, VH * 0.42);
      setT(sp, sp.el, t > 0.999 ? '' : `translate3d(${(sp.dx * (1 - t)).toFixed(2)}px, 0, 0)`);
    }

    /* ---- light stand-ins for the site's films, only where they can be seen ---- */
    const inView = (k, pad) => { const S = secs[k]; return S && scroll + VH > S.y - (pad || 0) && scroll < S.y + S.h + (pad || 0); };
    const T = ambT;
    if (scroll < 500) {
      // the hero's blue glow breathing behind the row of names
      setT(amb.heroGlow, amb.heroGlow.el, `scale(${(1 + 0.035 * Math.sin(T * 0.45)).toFixed(4)})`);
      setO(amb.heroGlow, amb.heroGlow.el, (0.86 + 0.14 * Math.sin(T * 0.62)).toFixed(3));
    }
    if (scroll < 1300) {
      // Nora's mountains under the stars: a still of the film, drifting slowly
      setT(amb.film, amb.film.el, `translate3d(${(-8 * Math.sin(T * 0.17)).toFixed(2)}px, ${(3 * Math.sin(T * 0.23)).toFixed(2)}px, 0) scale(${(1.07 + 0.03 * Math.sin(T * 0.21)).toFixed(4)})`);
    }
    if (inView('names', 100)) {
      setT(amb.namesGlow, amb.namesGlow.el, `translate3d(${(26 * Math.sin(T * 0.31)).toFixed(1)}px, ${(18 * Math.cos(T * 0.23)).toFixed(1)}px, 0)`);
      setO(amb.namesGlow, amb.namesGlow.el, (0.88 + 0.12 * Math.sin(T * 0.5)).toFixed(3));
    }
    if (inView('brand', 100)) {
      // the ocean, a still of the film, the swell moving under it
      setT(amb.sea, amb.sea.el, `translate3d(${(12 * Math.sin(T * 0.16)).toFixed(2)}px, ${(7 * Math.cos(T * 0.13)).toFixed(2)}px, 0) scale(${(1.035 + 0.02 * Math.sin(T * 0.19)).toFixed(4)})`);
    }
    if (inView('said', 80)) {
      for (const R of ROWS) {
        const x = R.speed < 0 ? -frac((T * -R.speed) / R.span) * R.span : frac((T * R.speed) / R.span) * R.span;
        setT(R, R.el, `translate3d(${x.toFixed(2)}px, 0, 0)`);
      }
    }

    /* ---- the card tilts toward the pointer ---- */
    card.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${(lift / K).toFixed(5)})`;

    // the eye in card space: straight in front of the card centre, rotated into the card's frame
    const P = Pc / lift;
    const E = { x: -P * Math.sin(b) * Math.cos(a), y: P * Math.sin(a), z: P * Math.cos(a) * Math.cos(b) };
    const Zsep = 0.16 * cardW * depth;
    const quiet = Math.abs(hc) < 0.0005 && Math.abs(rx) < 0.001 && Math.abs(ry) < 0.001;
    const margin = VH * 0.75;

    for (const L of layers) {
      const u2 = L.kind === 'card' ? 1 : s;
      let yView = 0;
      if (L.kind === 'page') {
        yView = L.cy + (L.pin ? pinY[L.pin] : 0) - scroll;
        // far off the window: leave it be until it comes back into view
        if (yView + L.h / 2 < -margin || yView - L.h / 2 > VH + margin) { L.A = null; continue; }
      }
      const Q = L.kind === 'card' ? { x: L.cx - cardW / 2, y: L.cy - cardH / 2 }
        : { x: (L.cx - DW / 2) * s, y: (yView - VH / 2) * s };
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
        const str = quiet ? '' : `translate3d(${(o.x / u2).toFixed(2)}px, ${(o.y / u2).toFixed(2)}px, 0) scale(${sc.toFixed(5)})`;
        if (str !== cache.last) { el.style.transform = str; cache.last = str; }
      };
      write(L.el, L.A, L);
      if (L.twin) {
        const Tw = L.twin;
        const zs = Tw.surface * Zsep * hc;
        const throwPx = Math.max(0, L.A.z - zs);
        const A = project(Tw.surface, { x: throwPx * LIGHT.x, y: throwPx * LIGHT.y });
        // the higher the layer, the further its shadow falls and the wider it spreads
        A.t *= 1 + throwPx / cardW * 0.35;
        write(Tw.el, A, Tw);
        const op = (Tw.alpha * shadowK * h01).toFixed(3);
        if (op !== Tw.op) { Tw.el.style.opacity = op; Tw.op = op; }
      }
    }

    // the framed window's own shadow on the card ground
    if (card.classList.contains('is-framed')) {
      const Wl = winLayer.A;
      const throwPx = Math.max(0, Wl.z) + cardW * 0.012;
      winShadow.style.transform = `translate3d(${(Wl.o.x + throwPx * LIGHT.x * 1.4).toFixed(2)}px, ${(Wl.o.y + throwPx * LIGHT.y * 1.4).toFixed(2)}px, 0) scale(${(0.985 + 0.01 * h01).toFixed(4)})`;
      winShadow.style.opacity = (0.36 + 0.3 * h01 * shadowK).toFixed(3);
    }

    // the light: a round bloom under the pointer, the rim nearest it brightening, the card's own shadow
    const gx = (glow.x + 1) / 2 * cardW, gy = (glow.y + 1) / 2 * cardH;
    bloom.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
    bloom.style.opacity = (V['light.bloom'] * h01).toFixed(3);
    rimLight.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
    rim.style.opacity = (V['light.rim'] * h01).toFixed(3);
    if (!EMBED) {
      const ex = tiltMax ? ry / tiltMax : 0, ey = tiltMax ? -rx / tiltMax : 0;
      cshadow.style.transform = `translate3d(${(-ex * 0.035 * cw).toFixed(1)}px, ${((0.03 + 0.035 * h01 - ey * 0.02) * cw).toFixed(1)}px, 0) scale(${(0.96 + 0.06 * h01).toFixed(3)})`;
      cshadow.style.opacity = ((0.18 + 0.42 * h01) * (0.4 + shadowK)).toFixed(3);
    }

    // the ruler: its notches slide with the page as it moves on screen; inside the card its ink follows the ground under the mark
    const npIn = 6 * K, offIn = (scroll * s) % npIn;
    const inStr = `translate3d(0, ${(-offIn).toFixed(2)}px, 0)`;
    for (const t of ticksIn) t.style.transform = inStr;
    const offOut = (scroll * s * lift / K) % 6;
    ticksOut.style.transform = `translate3d(0, ${(-offOut).toFixed(2)}px, 0)`;
    const yr = scroll + VH / 2;
    let dark = 0;
    for (const [y0, y1] of darkRanges) if (yr >= y0 && yr < y1) dark = 1;
    tone += (dark - tone) * (still ? 1 : 1 - Math.exp(-dt / 0.18));
    const ts = tone.toFixed(3);
    if (ts !== lastTone) { lastTone = ts; inkLight.style.opacity = ts; inkDark.style.opacity = (1 - tone).toFixed(3); }
  }

  /* ================= input ================= */
  function setPointer(e) {
    const r = persp.getBoundingClientRect();
    pointer.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    pointer.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    pointerLive = true;
  }
  // in a tile a vertical swipe belongs to the site's own page, unless &touchdrag=1
  if (!TOUCH_DRAG) persp.style.touchAction = 'pan-y';
  // screen px to design px: the card is drawn at lift / K, the page inside it at s
  const designPerScreen = () => K / (s * liftNow);
  /* Drag either way. Up and down is a phone: drag up and the page goes down, 1:1 under the finger.
     Sideways scrubs: drag right and the page runs on down, left and it comes back up, at drag.scrub
     px of the miniature per px of drag. Whichever axis has moved more since the axis was last
     chosen drives it; on a change of axis the drag re-anchors where it is, so nothing jumps. */
  function dragScroll(e) {
    const dx = e.clientX - down.ax, dy = e.clientY - down.ay;
    const axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (axis !== down.axis && Math.abs(axis === 'x' ? dx : dy) > CLICK) {
      down.axis = axis; down.ax = e.clientX; down.ay = e.clientY; down.scroll = scroll;
      return;
    }
    const k = designPerScreen();
    const delta = down.axis === 'x'
      ? (e.clientX - down.ax) * V['drag.scrub'] * k
      : -(e.clientY - down.ay) * k;
    scroll = clamp(down.scroll + delta, 0, maxScroll);
  }
  persp.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { hovered = true; setPointer(e); } });
  persp.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch' && !down) { hovered = false; pointerLive = false; }
  });
  persp.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || (down && down.id === e.pointerId)) setPointer(e);
    if (e.pointerType !== 'touch') hovered = true;
    if (!down || down.id !== e.pointerId) return;
    const dy = e.clientY - down.y0, dx = e.clientX - down.x0;
    if (!dragging && (down.type !== 'touch' || TOUCH_DRAG) && Math.hypot(dx, dy) >= CLICK) {
      dragging = true; mode = 'manual'; bridge = null; coast = 0;
      persp.classList.add('is-dragging');
      down.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      down.ax = e.clientX; down.ay = e.clientY; down.scroll = scroll; down.samples = [];
    }
    if (dragging) {
      dragScroll(e);
      const now = performance.now();
      down.samples.push([now, scroll]);
      while (down.samples.length > 2 && now - down.samples[0][0] > 90) down.samples.shift();
    }
  });
  persp.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, axis: 'y', scroll, samples: [] };
    if (e.pointerType !== 'touch' || TOUCH_DRAG) {
      try { persp.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: fine */ }
    }
    if (e.pointerType === 'touch' && TOUCH_DRAG) { touchOn = true; setPointer(e); }
    if (e.pointerType !== 'touch') e.preventDefault(); // no text selection, no image ghost
  });
  function release(e, cancelled) {
    if (!down || down.id !== e.pointerId) return;
    if (dragging) {
      const sm = down.samples;
      if (sm.length >= 2 && !reduced.matches) {
        const [t0, y0] = sm[0], [t1, y1] = sm[sm.length - 1];
        const v = (t1 - t0) > 8 ? (y1 - y0) / ((t1 - t0) / 1000) : 0;
        // a finger lifted after a pause does not fling
        coast = performance.now() - t1 > 60 ? 0 : clamp(v * V['drag.momentum'], -9000, 9000);
      } else coast = 0;
      idle = 0;
      dragging = false;
      persp.classList.remove('is-dragging');
    } else if (!cancelled && Math.hypot(e.clientX - down.x0, e.clientY - down.y0) < CLICK) {
      // a click that is not a drag opens the work; the site that frames the card decides how
      if (EMBED && window.parent !== window) window.parent.postMessage({ type: 'ks-card-open' }, '*');
      else if (e.pointerType === 'touch') touchLatch = !touchLatch; // on a phone, a tap shows the layers
      window.dispatchEvent(new CustomEvent('ks-card-open'));
    }
    down = null;
    if (e.pointerType === 'touch') { touchOn = false; pointerLive = false; }
    else {
      const r = persp.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) { hovered = false; pointerLive = false; }
    }
  }
  persp.addEventListener('pointerup', (e) => release(e, false));
  persp.addEventListener('pointercancel', (e) => release(e, true));
  persp.addEventListener('dragstart', (e) => e.preventDefault());

  /* ================= running, pausing ================= */
  let parentVisible = true;
  function sync() {
    const want = !document.hidden && parentVisible;
    if (want && !running) { running = true; tPrev = performance.now(); rafId = requestAnimationFrame(frame); }
    else if (!want && running) { running = false; cancelAnimationFrame(rafId); }
  }
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || window.parent === window) return;
    const d = e.data;
    if (d && d.type === 'ks-card' && typeof d.visible === 'boolean') { parentVisible = d.visible; sync(); }
  });
  reduced.addEventListener('change', () => { if (reduced.matches) { scroll = 0; mode = 'tour'; phase = 0; } });

  /* ================= the handle ================= */
  const api = {
    embed: EMBED,
    values: V,
    defaults: DEFAULTS,
    set(values, path) {
      Object.assign(V, values);
      card.classList.toggle('show-layers', !!V['debug.outlines']);
      if (!path || /^card\.|^tilt\.perspective|^light\.bloomSize/.test(path)) layout();
    },
    layout,
    get scroll() { return scroll; }, set scroll(y) { scroll = clamp(y, 0, maxScroll); mode = 'manual'; coast = 0; idle = -1e9; },
    get mode() { return mode; }, get running() { return running; }, get h() { return spr.h.x; },
    get stops() { return stops.slice(); }, get tour() { return TOUR; }, get VH() { return VH; },
    get maxScroll() { return maxScroll; },
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    seek(t) { mode = 'tour'; bridge = null; phase = t; },
  };
  window.superlinkCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
