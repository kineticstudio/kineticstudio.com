/* Konvoy work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 20 s round, never paused by
     hover; a drag (up and down like a phone, or sideways to scrub, right going
     further down the page) takes over, coasts, and the tour picks up from
     where it was left
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the site's own motion: a tile fills with colour from its left edge while
     the cursor is on it and empties when it leaves (green on the pages, amber
     in the menu; 500 ms, the site's easings), the mark spins three turns when
     the cursor passes it, the menu's black sheet comes down from the top, and
     the rail's title changes as the portfolio arrives under it. On the tour a
     scripted cursor rests on the tiles; over the card, the pointer is the
     cursor.

   window.konvoyCard is the handle the page's dials and the verify script use. */
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
  // the site's own easings (its interactions name them): inOutQuart in, inOutQuad out, swingFromTo for the mark
  const inOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
  const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const swingFromTo = (t) => {
    const s = 1.70158 * 1.525;
    t *= 2;
    return t < 1 ? 0.5 * (t * t * ((s + 1) * t - s)) : 0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2);
  };

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), chrome = $('#chrome');
  const mclip = $('#mclip'), minner = $('#min'), mrail = $('#mrail'), mark = $('#mark');
  const railIntro = $('#railIntro'), railTitle = $('#railTitle');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksIn = $$('.notches-in .ticks'), ticksOut = $('.notches-out .ticks');
  const inkDark = $('.notches-in .dark'), inkLight = $('.notches-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // the site's design width
  const TOP = 100.8;                     // the fixed header and the report banner cover the top of the window
  const RAIL = 248;                      // the fixed rail covers its left
  const GRID_W = DW - RAIL;              // the grids fill the rest
  const NAV_H = 50;                      // the menu's own header
  const PORT_N = 44;                     // companies on the June 2025 portfolio
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left
  const SPIN = 1.5;                      // s: the mark's three turns

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.25,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.62, 'light.bloomSize': 1.3, 'light.rim': 0.4, 'light.shadow': 0.7,
    'motion.tourSpeed': 1, 'motion.fill': 0.5, 'motion.menu': true, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.scrub': 2.5, 'drag.momentum': 1, 'drag.friction': 0.32, 'drag.resumeAfter': 1.2,
    'card.cardSize': 40, 'card.frame': false, 'card.frameColor': '#b6dcc6', 'card.notches': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  if (EMBED && /^(1|framed)$/.test(qs.get('frame') || '')) V['card.frame'] = true;
  const DEFAULTS = Object.assign({}, V);
  card.style.setProperty('--r', RADIUS + 'px');

  /* ================= shadow twins ================= */
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(true);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-stop', 'data-grid', 'data-i', 'id']) n.removeAttribute(a);
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }

  /* ================= layers ================= */
  const layers = $$('[data-depth]').map((el) => ({
    el, d: +el.dataset.depth, kind: el === win ? 'card' : chrome.contains(el) ? 'vp' : 'page',
    menu: mclip.contains(el), twin: el._twin || null, parent: null, fade: 1,
    cx: 0, cy: 0, h: 0, A: null, last: '',
  }));
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const winLayer = layers[0];
  const titleLayer = layers.find((L) => L.el === railTitle);
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= the tiles' fills ================= */
  const grids = { home: [], menu: [], port: [] };
  for (const el of $$('[data-grid]')) grids[el.dataset.grid][+el.dataset.i] = { el: el.querySelector('.wipe'), v: 0, from: 0, to: 0, t: 1, last: '' };
  const allTiles = [...grids.home, ...grids.menu, ...grids.port];
  let hoverKey = '';
  function setTarget(grid, i, still) {
    const key = grid ? grid + i : '';
    if (key === hoverKey && !still) return;
    hoverKey = key;
    for (const g in grids) grids[g].forEach((w, j) => {
      const to = g === grid && j === i ? 1 : 0;
      if (still) { w.v = w.from = w.to = to; w.t = 1; return; }
      if (w.to !== to) { w.from = w.v; w.to = to; w.t = 0; }
    });
  }

  /* ================= state ================= */
  let cw = 576, ch = 432, K = 2.5, cardW = 1440, cardH = 1080, mx = 0, my = 0;
  let s = 0.36, VH = 900, maxScroll = 5000, rowH = 378;
  let stops = [0, 0, 0, 0, 0];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, clock = 0, prevTl = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', liftNow = 1, tone = 0, lastTone = '';
  let menuR = 0, menuO = 0, menuArmed = false, lastMenu = '';
  let spinT = -1, lastSpin = '', railT = -1;

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
    mx = framed ? (MAT ? MAT * cardW : FRAME.x * cardW) : 0; my = framed ? (MAT ? MAT * cardW : FRAME.y * cardH) : 0;
    card.style.setProperty('--mx', mx + 'px');
    card.style.setProperty('--my', my + 'px');
    card.style.setProperty('--win-r', framed ? (cardW * 0.0125) + 'px' : '0px');
    card.style.setProperty('--card-px', cardW + 'px');
    const winW = cardW - 2 * mx, winH = cardH - 2 * my;
    s = winW / DW;
    // fit by cropping, never letterbox: the page is always 1440 wide and as tall as the window allows
    VH = Math.max(640, Math.round(DW * winH / winW));
    rowH = VH * 0.42;
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.transform = `scale(${s})`;
    persp.style.perspective = (V['tilt.perspective'] * cw) + 'px';
    card.style.transform = `scale(${1 / K})`;
    bloom.style.width = bloom.style.height = (V['light.bloomSize'] * cardW) + 'px';
    bloom.style.left = bloom.style.top = (-V['light.bloomSize'] * cardW / 2) + 'px';

    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.h = L.el.offsetHeight;
    }
    maxScroll = Math.max(0, page.offsetHeight - VH);
    // the portfolio's first row just under the banner (the portfolio page at the top), then two rows on at a time
    const p1 = VH - TOP;
    stops = [
      0,                 // the home: the fills running across the grid, the mark, the menu
      p1,                // the newest companies
      p1 + 2 * rowH,     // k-ID to Pok Pok
      p1 + 4 * rowH,     // Cognitive3D to Echo3D
      maxScroll,         // the oldest, Bunch to Opera Event
    ].map((y) => clamp(Math.round(y), 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    for (const L of layers) L.last = '_';
    buildTour();
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  /* ================= the tour ================= */
  // [hold at the stop, then the move to the next] in seconds at speed 1; about 20 s round.
  // Through the menu, the move from the home to the portfolio happens under its black sheet.
  let LEGS = [], TOUR = 20, holdAt = [];
  // where the scripted cursor rests at each stop: [from, to] s into the hold, the grid, the tile
  const RESTS = [
    [[0.35, 1.45, 'home', 0], [1.45, 2.5, 'home', 3], [2.5, 3.5, 'home', 4], [3.5, 4.35, 'home', 1]],
    [[0.5, 1.95, 'port', 2]],      // Diversion
    [[0.4, 1.6, 'port', 17]],      // Root
    [[0.4, 1.6, 'port', 24]],      // Legends of Learning
    [[0.4, 1.6, 'port', 41]],      // Muxy
  ];
  const MARK_AT = 4.45;              // s into the home hold: the cursor crosses the mark on its way to the menu
  const MENU_AT = 5.0;               // the menu opens
  const MENU_PICK = 5.65;            // PORTFOLIO fills amber
  function buildTour() {
    const viaMenu = !!V['motion.menu'];
    LEGS = [[6.4, viaMenu ? 0.5 : 1.3], [2.2, 1.1], [1.9, 1.1], [1.9, 1.2], [1.9, 2.6]];
    TOUR = LEGS.reduce((a, [h, m]) => a + h + m, 0);
    holdAt = LEGS.reduce((a, [h, m], i) => (a.push(i ? a[i - 1] + LEGS[i - 1][0] + LEGS[i - 1][1] : 0), a), []);
  }
  buildTour();
  const local = (t) => ((t % TOUR) + TOUR) % TOUR;
  function tourAt(t) {
    t = local(t);
    for (let i = 0; i < LEGS.length; i++) {
      const [h, m] = LEGS[i];
      if (t < h) return stops[i];
      t -= h;
      if (t < m) return stops[i] + (stops[(i + 1) % stops.length] - stops[i]) * ease(t / m);
      t -= m;
    }
    return 0;
  }
  // the scripted cursor: which tile it rests on at tour time t
  function restAt(t) {
    t = local(t);
    const viaMenu = !!V['motion.menu'];
    for (let i = 0; i < LEGS.length; i++) {
      const u = t - holdAt[i];
      if (u < 0 || u >= LEGS[i][0] + LEGS[i][1]) continue;
      for (const [a, b, g, j] of RESTS[i]) if (u >= a && u < b) return [g, j];
      if (i === 0) {
        if (viaMenu && u >= MENU_PICK) return ['menu', 0];
        if (!viaMenu && u >= MENU_AT) return ['home', 0]; // no menu: PORTFOLIO fills and the page runs down to it
      }
      return null;
    }
    return null;
  }
  /* after a drag: ease from wherever it was left to the next stop down the page, then carry on the tour from that stop */
  function resumeTour() {
    let j = stops.findIndex((y) => y > scroll + 3);
    const at = stops.findIndex((y) => Math.abs(y - scroll) <= 3);
    if (at >= 0) { mode = 'tour'; phase = holdAt[at] + LEGS[at][0] * 0.35; prevTl = local(phase); return; }
    if (j < 0) j = 0;
    const dist = Math.abs(stops[j] - scroll);
    bridge = { from: scroll, to: stops[j], stop: j, t: 0, dur: clamp(0.55 + dist / 2600, 0.6, 2.4) };
    mode = 'bridge';
  }

  function step(S, target, k, c, dt) {
    const n = Math.ceil(dt / (1 / 240)), h = dt / n;
    for (let i = 0; i < n; i++) { S.v += (-k * (S.x - target) - c * S.v) * h; S.x += S.v * h; }
  }

  /* the pointer, in the miniature's window px (flat: close enough under a 10 degree tilt) */
  function pointerWin() {
    return [((pointer.x + 1) / 2 * cardW - mx) / s, ((pointer.y + 1) / 2 * cardH - my) / s];
  }
  function hitTest(wx, wy, menuUp) {
    if (wx < 0 || wx > DW || wy < 0 || wy > VH) return null;
    if (menuUp) {
      if (wy < NAV_H || wx < RAIL) return null;
      const r = Math.floor((wy - NAV_H) / (VH * 0.45)), c = Math.floor((wx - RAIL) / (GRID_W / 3));
      return r < 2 ? ['menu', r * 3 + Math.min(2, c)] : null;
    }
    if (wy < TOP || wx < RAIL) return null;
    const py = wy + scroll;
    if (py < VH) {
      const r = Math.floor((py - TOP) / rowH);
      return r >= 0 && r < 2 ? ['home', r * 3 + Math.min(2, Math.floor((wx - RAIL) / (GRID_W / 3)))] : null;
    }
    const i = Math.floor((py - VH) / rowH) * 5 + Math.min(4, Math.floor((wx - RAIL) / (GRID_W / 5)));
    return i < PORT_N ? ['port', i] : null;
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
      if (u >= 1) { mode = 'tour'; phase = holdAt[bridge.stop]; prevTl = local(phase); bridge = null; }
    }
    scroll = clamp(scroll, 0, maxScroll);

    // the tour's own beats: the mark spins as the cursor crosses it; the menu comes down, then the portfolio loads
    const tl = local(phase);
    const tour = mode === 'tour' && !still;
    const crossed = (at) => tour && tl !== prevTl && (prevTl < tl ? prevTl < at && at <= tl : at > prevTl || at <= tl);
    if (crossed(holdAt[0] + MARK_AT) && spinT < 0) spinT = 0;
    const m0 = holdAt[0] + MENU_AT, m1 = holdAt[1];
    if (V['motion.menu'] && crossed(m0)) menuArmed = true;
    if (!tour || tl < m0 || tl > m1 + 0.3) menuArmed = false;
    if (menuArmed) {
      menuR = inOutQuad(clamp((tl - m0) / 0.5, 0, 1));      // the sheet's height, 0 to 100% in 500 ms
      menuO = 1 - clamp((tl - m1) / 0.22, 0, 1);            // the portfolio page arriving
    } else {
      menuO *= Math.exp(-dt / 0.08);
      if (menuO < 0.01) { menuO = 0; menuR = 0; }
    }
    prevTl = tl;
    const menuUp = menuO > 0.5 && menuR > 0.6;

    // who is the cursor: the pointer over the card, or the tour's
    let target = null;
    if (still) target = ['home', 0];
    else if (pointerLive && (hovered || touchOn)) {
      const [wx, wy] = pointerWin();
      target = hitTest(wx, wy, menuUp);
      if (!menuUp && wy >= 0 && wy < TOP - 50 && Math.abs(wx - 1349) < 22 && spinT < 0) spinT = 0; // over the mark
    } else if (mode === 'tour') {
      target = restAt(phase);
      if (target && target[0] === 'menu' && !menuUp) target = null;
    }
    setTarget(target ? target[0] : null, target ? target[1] : -1, still);
    const fillDur = Math.max(0.05, V['motion.fill']);
    for (const w of allTiles) {
      if (w.t < 1) {
        w.t = Math.min(1, w.t + dt / fillDur);
        const e = w.to > w.from ? inOutQuart(w.t) : inOutQuad(w.t);
        w.v = w.from + (w.to - w.from) * e;
      }
      const str = w.v <= 0.0005 ? 'scaleX(0)' : w.v >= 0.9995 ? 'none' : `scaleX(${w.v.toFixed(4)})`;
      if (str !== w.last) { w.el.style.transform = str; w.last = str; }
    }
    if (spinT >= 0) {
      spinT += dt;
      if (spinT >= SPIN || still) spinT = -1;
    }
    const spin = spinT < 0 ? 'none' : `rotate(${(1080 * swingFromTo(spinT / SPIN)).toFixed(2)}deg)`;
    if (spin !== lastSpin) { mark.style.transform = spin; lastSpin = spin; }

    render(dt, still);
    rafId = requestAnimationFrame(frame);
  }

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

    /* ---- the page: scroll, the rail's title, the menu ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    // the rail says what page it is: the firm's line on the home, PORTFOLIO once the portfolio is up
    const rt = smooth(scroll, VH * 0.3, VH * 0.75);
    if (rt !== railT) { railT = rt; railIntro.style.opacity = (1 - rt).toFixed(3); railTitle.style.opacity = rt.toFixed(3); titleLayer.fade = rt; }
    // the menu: its sheet's height grows from the top (a clip that slides down, its contents held still)
    const menuShown = menuO > 0.001 && menuR > 0.001;
    const mStr = menuShown ? `${menuR.toFixed(4)}|${menuO.toFixed(3)}` : '';
    if (mStr !== lastMenu) {
      lastMenu = mStr;
      mclip.style.visibility = menuShown ? 'visible' : 'hidden';
      if (menuShown) {
        mclip.style.transform = `translate3d(0, ${((menuR - 1) * VH).toFixed(2)}px, 0)`;
        minner.style.transform = `translate3d(0, ${((1 - menuR) * VH).toFixed(2)}px, 0)`;
        mclip.style.opacity = menuO.toFixed(3);
        mrail.style.opacity = menuR.toFixed(3);
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
      if (L.menu && !menuShown) { L.A = null; L.last = '_'; if (L.twin) L.twin.last = '_'; continue; }
      const u2 = L.kind === 'card' ? 1 : s;
      let yView = 0;
      if (L.kind === 'page') {
        yView = L.cy - scroll;
        // far off the window: leave it be until it comes back into view
        if (yView + L.h / 2 < -margin || yView - L.h / 2 > VH + margin) { L.A = null; continue; }
      }
      const Q = L.kind === 'card' ? { x: L.cx - cardW / 2, y: L.cy - cardH / 2 }
        : { x: (L.cx - DW / 2) * s, y: ((L.kind === 'page' ? yView : L.cy) - VH / 2) * s };
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
        const op = (Tw.alpha * shadowK * h01 * L.fade).toFixed(3);
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

    // the ruler: its notches slide with the page as it moves on screen; inside the card its ink follows the ground (light over the black menu)
    const npIn = 6 * K, offIn = (scroll * s) % npIn;
    const inStr = `translate3d(0, ${(-offIn).toFixed(2)}px, 0)`;
    for (const t of ticksIn) t.style.transform = inStr;
    const offOut = (scroll * s * lift / K) % 6;
    ticksOut.style.transform = `translate3d(0, ${(-offOut).toFixed(2)}px, 0)`;
    const dark = menuShown && menuR > 0.5 ? menuO : 0;
    tone += (dark - tone) * (still ? 1 : 1 - Math.exp(-dt / 0.12));
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
      if (path === 'motion.menu') buildTour();
    },
    layout,
    get scroll() { return scroll; }, set scroll(y) { scroll = clamp(y, 0, maxScroll); mode = 'manual'; coast = 0; idle = -1e9; },
    get mode() { return mode; }, get running() { return running; }, get h() { return spr.h.x; },
    get stops() { return stops.slice(); }, get tour() { return TOUR; }, get VH() { return VH; },
    get maxScroll() { return maxScroll; }, get phase() { return local(phase); },
    get menu() { return { r: menuR, o: menuO }; },
    get fills() { const o = {}; for (const g in grids) grids[g].forEach((w, i) => { if (w.v > 0.01) o[g + i] = +w.v.toFixed(3); }); return o; },
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    seek(t) { mode = 'tour'; bridge = null; phase = t; prevTl = local(t); },
  };
  window.konvoyCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
