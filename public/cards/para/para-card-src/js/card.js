/* Para work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity (and, while the hero's circle opens, that
   mask's corner radius and inner shadow):

   - the tour: eased stops through the page, about 20 s round, never paused by
     hover; a drag (up and down like a phone, or sideways to scrub, right going
     further down the page) takes over, coasts, and the tour picks up from
     where it was left
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: the site's own scroll choreography, measured off the live page
     frame by frame: the hero's circle opening into the whole window as its
     sheared wall of voice messages straightens and the odd rows slide left,
     "The voice advantage" sliding up over the held wall, the starburst's bars
     growing, the bento art rising into its tiles, the four steps stacking,
     the script typing itself in; and light stand-ins for its motion (the
     cloning buttons breathing, the spinner turning)

   window.paraCard is the handle the page's dials and the verify script use. */
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

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.7, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.75,
    'motion.tourSpeed': 1, 'motion.pulse': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.scrub': 2.5, 'drag.momentum': 1, 'drag.friction': 0.32, 'drag.resumeAfter': 1.2,
    'card.cardSize': 40, 'card.frame': false, 'card.frameColor': '#fe3c6b', 'card.notches': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  if (EMBED && /^(1|framed)$/.test(qs.get('frame') || '')) V['card.frame'] = true;
  const DEFAULTS = Object.assign({}, V);
  card.style.setProperty('--r', RADIUS + 'px');

  /* ================= the script, word by word (it types itself in as step 2 arrives) ================= */
  const tyMain = $('#tyMain');
  tyMain.innerHTML = tyMain.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' ');
  const words = $$('.w', tyMain).map((el) => ({ el, op: '' }));

  /* ================= the starburst's six bars, each at its own angle, growing from l0 to l1 ================= */
  const sticks = $$('#burst .st').map((el) => {
    const a = +el.dataset.a, l0 = +el.dataset.l0, l1 = +el.dataset.l1;
    el.style.height = l1 + 'px'; el.style.top = (550 - l1) / 2 + 'px';
    const last = `rotate(${a}deg) scaleY(${(l0 / l1).toFixed(4)})`; // at rest as it first comes into the window
    el.style.transform = last;
    return { el, a, l0, l1, last };
  });

  /* ================= shadow twins ================= */
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(true);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-stop', 'data-pin', 'id']) n.removeAttribute(a);
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }

  /* ================= layers ================= */
  const layers = $$('[data-depth]').map((el) => {
    const pinEl = el.closest('[data-pin]');
    return {
      el, d: +el.dataset.depth, d0: +el.dataset.depth, kind: el === win ? 'card' : 'page',
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
  const layerOf = (el) => layers.find((L) => L.el === el);
  const pins = $$('[data-pin]').map((el) => ({ el, name: el.dataset.pin, top: 0, last: '' }));
  const pinY = {};
  for (const p of pins) pinY[p.name] = 0;
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= the hero: the circle that opens into the wall ================= */
  /* Measured off the live page at 1440 x 900 (headless Chromium, 2026-10-23): over the first 1700 px
     of scroll the mask grows from a 512 px circle at the right (x 848) to the whole window on a
     quadratic ease-out, its corner radius falling from 1600 px to nothing; the wall inside is
     rotated and its rows skewed by the same angle (-21 deg to 0, which keeps the cards' sides
     upright), the odd rows slide 307.2 px left, and the wall's origin follows the path below
     (x, y in window px against the opening, a smoothed fit of the live page's own). */
  const HERO = { grow: 1.5, x0: 848, d0: 512, r0: 1600, a0: -21, slide: -307.2, pitch: 222.77 };
  const GPATH = [ // [opening, x, y] at a 900 px window
    [0, -79.5, 568.2], [0.2214, -150, 490], [0.4152, -198.8, 410], [0.5017, -227.7, 369.4], [0.5814, -236.6, 326.4],
    [0.654, -229.8, 282.5], [0.7197, -211.3, 239], [0.7786, -184.9, 197.2], [0.8305, -153.7, 157.1], [0.8754, -120.7, 121.5],
    [0.9135, -88.3, 89.3], [0.9577, -45.8, 51.6], [0.9861, -15.5, 25.8], [0.9991, -1, 13.8], [1, 0, 14],
  ];
  function gAt(p) { // Catmull-Rom through the measured path
    let i = 0;
    while (i < GPATH.length - 2 && p > GPATH[i + 1][0]) i++;
    const P = (j) => GPATH[clamp(j, 0, GPATH.length - 1)];
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const t = clamp((p - p1[0]) / Math.max(1e-6, p2[0] - p1[0]), 0, 1), t2 = t * t, t3 = t2 * t;
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
  }
  const hero = {
    ovl: layerOf($('#hOvl')), btl: layerOf($('#hBtl')),
    oval: { el: $('#hOval'), last: '', r: '' }, inner: { el: $('#hOvalIn'), last: '' }, shade: { el: $('#hShade'), last: '' },
    grids: [$('#hGrid'), $('#hBtns')].map((el) => ({ el, last: '' })),
    rows: $$('.h-row').map((el) => ({ el, odd: el.classList.contains('is-odd'), last: '' })),
  };

  /* ================= the rest of the page's own motion ================= */
  const rises = $$('.fb').map((el) => ({ block: el, img: $('.rise', el), top: 0, h: 0, last: '' }));
  const pulses = [$('#clA'), $('#clB')].map((el) => ({ el, last: '' }));
  const spin = { el: $('#clSpin'), last: '' };

  /* ================= state ================= */
  let cw = 576, ch = 432, K = 2.5, cardW = 1440, cardH = 1080;
  let s = 0.4, VH = 1080, maxScroll = 10000;
  let stops = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const secs = {};
  let tones = [];
  let G = 1620, burstTop = 0, typeTop = 0;
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, ambT = 0, clock = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', liftNow = 1, tone = 0, lastTone = '', openNow = 0;

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
      const root = L.kind === 'card' ? card : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.h = L.el.offsetHeight;
    }
    for (const el of $$('.page > .sec[data-stop]')) secs[el.dataset.stop] = { y: el.offsetTop, h: el.offsetHeight, dark: el.dataset.tone === 'dark' };
    for (const p of pins) p.top = posIn(p.el, page)[1] - p.el.offsetHeight / 2;
    for (const r of rises) { r.top = secs.features.y + r.block.offsetTop; r.h = r.img.offsetHeight; r.last = '_'; }
    burstTop = secs.features.y + 676;
    typeTop = pins.find((p) => p.name === 's1').top;
    G = HERO.grow * VH;
    maxScroll = Math.max(0, page.offsetHeight - VH);
    const S = secs;
    const mid = (k, a, b) => Math.round(S[k].y + (a + b) / 2 - VH / 2);
    stops = [
      0,                                   // the hero: voice marketing made personal, the circle of messages
      Math.round(G),                       // the wall of voice messages, the whole window
      S.features.y + 30,                   // the voice advantage, the starburst rising
      mid('features', 1418, 2488),         // the bento
      S.steps.y,                           // 1, clone your authentic voice
      S.steps.y + 2 * VH,                  // 3, deliver branded messaging at scale
      mid('testimonials', 128, 914),       // the best have spoken
      mid('wall', 0, 1117),                // hear the difference
      mid('cases', 128, 877),              // case studies
      S.cta.y + 290,                       // ready to talk? over the footer (the very end, in a tall window)
    ].map((y) => clamp(y, 0, maxScroll));
    // where the ruler's ink goes light: the sections on Para's maroon and black
    tones = Object.values(S).map((v) => [v.y, v.y + v.h, v.dark ? 1 : 0]);
    scroll = clamp(scroll, 0, maxScroll);
    for (const L of layers) L.last = '_';
    for (const o of [hero.oval, hero.inner, hero.shade, ...hero.grids, ...hero.rows]) o.last = '_';
    hero.oval.r = '_';
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; about 20 s round
    [1.5, 0.95], [1.0, 0.8], [1.1, 0.9], [1.1, 0.85], [1.0, 0.95], [1.0, 0.95], [1.0, 0.8], [0.95, 0.8], [0.95, 0.9], [1.1, 1.9],
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
    if (!still) ambT += dt * V['motion.pulse'];
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

  /* the hero's circle, its wall and the wall's play buttons, at opening p (0 the circle, 1 the window) */
  function renderHero(p) {
    const w = HERO.d0 + (DW - HERO.d0) * p, h = HERO.d0 + (VH - HERO.d0) * p;
    const x = HERO.x0 * (1 - p), y = (VH / 2 - HERO.d0 / 2) * (1 - p);
    const sx = w / DW, sy = h / VH;
    const R = Math.min(HERO.r0 * (1 - p), w / 2, h / 2);
    // the mask is the window's own size, scaled to the opening and counter-scaled inside, so only transforms move it
    setT(hero.oval, hero.oval.el, `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})`);
    setT(hero.inner, hero.inner.el, `scale(${(1 / sx).toFixed(5)}, ${(1 / sy).toFixed(5)}) translate3d(${(-x).toFixed(2)}px, ${(-y).toFixed(2)}px, 0)`);
    const rs = `${(R / sx).toFixed(1)}px / ${(R / sy).toFixed(1)}px`;
    if (rs !== hero.oval.r) {
      hero.oval.r = rs;
      hero.oval.el.style.borderRadius = rs;
      // the site's inset 0 5px 50px maroon shadow round the opening, in the mask's own (scaled) units
      const gm = Math.sqrt(sx * sy);
      hero.shade.el.style.boxShadow = `inset 0 ${(5 / sy).toFixed(2)}px ${(50 / gm).toFixed(1)}px rgba(56, 6, 36, .5)`;
    }
    // the wall: rotated by a, each row skewed by a (sides stay upright), the odd rows sliding left
    const a = HERO.a0 * (1 - p);
    const [gx, gy0] = gAt(p);
    const gy = gy0 + (VH - 900) / 2 * (1 - p); // the live circle sits in the middle of the window, whatever its height
    const gStr = `translate3d(${gx.toFixed(2)}px, ${gy.toFixed(2)}px, 0) rotate(${a.toFixed(4)}deg)`;
    for (const g of hero.grids) setT(g, g.el, gStr);
    const tx = HERO.slide * p;
    for (const r of hero.rows) setT(r, r.el, `translate3d(${(r.odd ? tx : 0).toFixed(2)}px, 0, 0) skewX(${a.toFixed(4)}deg)`);
    // the circle floats high at rest and settles to the back as it becomes the window's ground
    hero.ovl.d = 0.5 - 0.42 * p;
    hero.btl.d = hero.ovl.d + 0.24;
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

    /* ---- the page: scroll and the site's own choreography ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    // held in the window: the hero until "The voice advantage" has slid over it, each step until the next has
    pinY.hero = clamp(scroll, 0, G + VH);
    for (let i = 0; i < 4; i++) pinY['s' + i] = clamp(scroll - (secs.steps.y + i * VH), 0, (3 - i) * VH);
    for (const p of pins) setT(p, p.el, pinY[p.name] ? `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)` : '');

    // the circle opens over the first 1.5 windows of scroll, on the site's quadratic ease-out
    const tOpen = clamp(scroll / G, 0, 1), open = 1 - (1 - tOpen) * (1 - tOpen);
    if (scroll < G + VH * 1.2) renderHero(open);
    openNow = open;

    // the starburst's bars grow as it rises through the window
    if (scroll + VH > burstTop - 40 && scroll < burstTop + 600) {
      const u = clamp((scroll + VH - burstTop) / VH, 0, 1);
      for (const st of sticks) setT(st, st.el, `rotate(${st.a}deg) scaleY(${((st.l0 + (st.l1 - st.l0) * u) / st.l1).toFixed(4)})`);
    }
    // the bento's art rises into each tile as the tile comes up into the window
    for (const r of rises) {
      const yv = r.top - scroll;
      if (yv > VH + 40 || yv < -1200) continue;
      const t = still ? 1 : smooth(VH - yv, 40, 380);
      setT(r, r.img, t > 0.999 ? '' : `translate3d(0, ${(r.h * (1 - ease(t))).toFixed(2)}px, 0)`);
    }
    // step 2's script types itself in as the step slides up into the window
    if (scroll > typeTop - VH * 1.2 && scroll < typeTop + VH * 2) {
      const u = still ? 1 : clamp((scroll - (typeTop - VH * 0.65)) / (VH * 0.8), 0, 1);
      const n = u * words.length;
      for (let i = 0; i < words.length; i++) setO(words[i], words[i].el, (0.2 + 0.8 * clamp(n - i, 0, 1)).toFixed(2));
    }
    // the cloning buttons breathe and the spinner turns, only while step 1 can be seen
    if (scroll > secs.steps.y - VH && scroll < secs.steps.y + VH * 1.2) {
      const T = ambT;
      pulses.forEach((o, i) => setT(o, o.el, `scale(${(1 + 0.09 * Math.sin(T * 4.2 + i * 1.9)).toFixed(4)})`));
      setT(spin, spin.el, `rotate(${((T * 120) % 360).toFixed(1)}deg)`);
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
    for (const [y0, y1, d] of tones) if (yr >= y0 && yr < y1) dark = d;
    // held in the window, the hero's right edge is maroon once the opening has reached it
    if (yr < secs.features.y) dark = openNow > 0.91 ? 1 : 0;
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
  window.paraCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
