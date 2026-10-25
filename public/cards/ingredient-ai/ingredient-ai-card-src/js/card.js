/* IngredientAI work card: the engine (from the Ethos and Epirus cards').

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 20 s round, never paused by
     hover; a drag takes over (up and down like a phone, or sideways to scrub:
     right is further down the page), coasts, and the tour picks up from there
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: IngredientAI's own motion as the site Kinetic built ran it. The
     hero's coverflow steps a circle every 2 s (2.3 s with its move), with
     the caption under it changing as it goes; the GIF of the search pill
     runs as three stills; the testimonial cards step on, blurred at the
     sides; one cell of the early adopters' wall fades to its next logo
     every 1.9 s; the discover stack sends its front card by every 2.5 s;
     the claims video is two stills crossfading; the supplier cards slide
     on every 4.3 s; the regulators' marquee runs a list every 15 s. The
     nav and the waitlist pill stay fixed in the window, and at the end the
     page lifts off the footer fixed under it.

   window.ingredientCard is the handle the page's dials and the verify script
   use. The embed contract (?embed=1, &bleed=N, &radius=N, &touchdrag=1, the
   ks-card pause message and the ks-card-open click) is the same as the other
   cards'. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const EMBED = qs.has('embed') && qs.get('embed') !== '0';
  document.documentElement.classList.toggle('is-embed', EMBED);
  const BLEED = EMBED ? Math.max(0, parseFloat(qs.get('bleed')) || 0) : 0; // px of frame overhanging the tile
  const RADIUS = EMBED && qs.has('radius') ? Math.max(0, parseFloat(qs.get('radius')) || 0) : 6; // the tile's corner, CSS px
  const TOUCH_DRAG = !EMBED || qs.get('touchdrag') === '1';               // in a tile, a swipe scrolls the site
  const CLICK = 6;                                                        // px: less is a click, more a drag

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const wrap = (v, n, lo) => { const r = ((v - lo) % n + n) % n; return r + lo; };

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), foot = $('#foot'), pillSlot = $('#pillSlot');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksIn = $$('.notches-in .ticks'), ticksOut = $('.notches-out .ticks');
  const inkDark = $('.notches-in .dark'), inkLight = $('.notches-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // IngredientAI's design width
  const PAGE_H = 9365;                   // the whole page: the main column and the footer it lifts off
  const MAIN_H = 8829;                   // where the main column ends and the footer shows
  const PILL_END = 8743;                 // the waitlist pill's last place, 20 px above the main column's end
  const PANEL = [8111, 8696];            // the difference panel, dark under the ruler's mark
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left

  /* the dials' defaults; the page's defineParams writes over these */
  const DEFAULTS = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.7, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.65,
    'motion.tourSpeed': 1, 'motion.carousels': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.friction': 0.32, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.1,
    'card.cardSize': 40, 'card.frame': false, 'card.frameColor': '#aaf5bb', 'card.notches': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  const V = Object.assign({}, DEFAULTS);
  if (EMBED && qs.get('frame') === '1') V['card.frame'] = true;
  card.style.setProperty('--r', RADIUS + 'px');

  /* ================= the page's own motion, set up ================= */
  // the hero's coverflow, from the site's own numbers at 1440: 668 px between slides in the
  // slider's plane, each one 500 px further back (perspective 1200), the two beside the
  // active one pulled in by a fifth of their width
  const HERO = { n: 5, first: 2, hold: 2.0, move: 0.36, pitch: 668, z: 500, P: 1200, pull: 73.6, cy: 239.5 };
  const heroImgs = $$('#hCircles .h-img').map((el) => ({ el, last: '', op: '' }));
  const heroTitles = $$('#hTitles .h-t').map((el) => ({ el, last: '', op: '' }));
  const heroParas = $$('#hPara p').map((el) => ({ el, last: '', op: '' }));
  // see it in action: the GIF's three phrases, about a second each
  const vFrames = $$('#vFrames img').map((el) => ({ el, op: '' }));
  // the testimonials: one card steps in every 2.4 s; each has a sharp and a blurred copy
  const qSlides = $$('#qStage .q-slide').map((el) => {
    const soft = el.cloneNode(true); soft.classList.add('blur'); el.after(soft);
    return { el, soft, last: '', op: '', sop: '' };
  });
  const qNums = $$('#qNum span').map((el) => ({ el, op: '' }));
  // the early adopters: each cell holds its own run of logos
  const aCells = $$('#aLogos .a-cell').map((el, c) => {
    const imgs = el.dataset.logos.split(' ').map((n) => {
      const im = document.createElement('img'); im.src = `ingredient-ai-card-src/img/logos/${n}.svg`; im.alt = '';
      el.appendChild(im); return { el: im, op: '' };
    });
    return { el, imgs };
  });
  const A_ORDER = [5, 2, 7, 0, 3, 6, 1, 4];   // the site picks a random cell, never the same twice running
  // the discover stack: a blurred copy and the front card's drop shadow made once, faded in and out
  const dCards = $$('#dStage .d-card').map((el) => {
    const img = $('img', el), soft = img.cloneNode(); soft.classList.add('soft'); el.appendChild(soft);
    const drop = document.createElement('i'); drop.className = 'drop'; el.prepend(drop);
    return { el, img, soft, drop, last: '', op: '', sop: '', dop: '', iop: '' };
  });
  const rFrames = $$('#rFrames img').map((el) => ({ el, op: '' }));
  const mCards = $$('#mStage .m-card').map((el) => ({ el, last: '', op: '' }));
  // the regulators' marquee: the list three times over, so it always fills the row
  const oTrack = $('#oTrack');
  const REGS = [['reg-tga', 'tga'], ['reg-fda', ''], ['reg-efsa', ''], ['reg-health-canada', '']];
  oTrack.innerHTML = [0, 1, 2].map(() => REGS.map(([f, c]) => `<img class="${c}" src="ingredient-ai-card-src/img/${f}.svg" alt="">`).join('')).join('');
  let oList = 1028, lastTrack = '';

  /* ================= shadow twins ================= */
  // text and cut-out images cast their own shape; panels and cards a plain rounded box
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const box = el.matches('.v-box, .r-panel, .t-panel, .x-panel, .s-card, .pill');
    const tw = el.cloneNode(!box);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-stop', 'id']) n.removeAttribute(a);
    tw.classList.add('twin');
    if (box) tw.classList.add('box');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }

  /* ================= layers ================= */
  const layers = $$('[data-depth]').map((el) => ({
    el, d: +el.dataset.depth, kind: el === win ? 'card' : el.closest('.fixed') ? 'vp' : 'page',
    pill: pillSlot.contains(el), foot: foot.contains(el),
    twin: el._twin || null, parent: null, cx: 0, cy: 0, h: 0, A: null, last: '',
  }));
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= state ================= */
  let cw = 576, ch = 432, K = 2.5, cardW = 1440, cardH = 1080;
  let s = 0.4, VH = 1080, maxScroll = PAGE_H - 1080;
  let stops = [0, 0, 0, 0, 0, 0, 0];
  const secs = {};
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, amb = 0, car = 0, clock = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', liftNow = 1, pillY = 0, lastPill = '', footOn = -1, tone = 0, lastTone = '';

  function layout() {
    stage.style.setProperty('--size', V['card.cardSize']);
    const framed = MAT > 0 || (!!V['card.frame']);
    card.classList.toggle('is-framed', framed);
    card.style.setProperty('--frame-color', V['card.frameColor']);
    card.classList.toggle('is-dark-frame', luminance(V['card.frameColor']) < 0.35);
    cw = persp.clientWidth; ch = persp.clientHeight;
    if (!cw || !ch) return;
    K = Math.min(4, Math.max(1, (window.devicePixelRatio || 1) * 1.25));
    cardW = cw * K; cardH = ch * K;
    card.style.setProperty('--k', K);
    Object.assign(card.style, { width: cardW + 'px', height: cardH + 'px', left: (cw - cardW) / 2 + 'px', top: (ch - cardH) / 2 + 'px' });
    slot.classList.toggle('full', !framed);
    slot.classList.toggle('no-notches', !V['card.notches']);
    const mx = framed ? (MAT ? MAT * cardW : FRAME.x * cardW) : 0, my = framed ? (MAT ? MAT * cardW : FRAME.y * cardH) : 0;
    card.style.setProperty('--mx', mx + 'px');
    card.style.setProperty('--my', my + 'px');
    card.style.setProperty('--win-r', framed ? (cardW * 0.0125) + 'px' : '0px');
    card.style.setProperty('--card-px', cardW + 'px');
    const winW = cardW - 2 * mx, winH = cardH - 2 * my;
    s = winW / DW;
    // fit by cropping, never letterbox: the page is always 1440 wide and as tall as the window allows
    VH = Math.max(600, Math.round(DW * winH / winW));
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
    for (const el of $$('.main > [data-stop]')) secs[el.dataset.stop] = { y: el.offsetTop, h: el.offsetHeight };
    const im = $$('img', oTrack);
    if (im[4] && im[4].offsetLeft > 0) oList = im[4].offsetLeft;
    maxScroll = Math.max(0, PAGE_H - VH);
    const mid = (y) => Math.round(y - VH / 2);
    stops = [
      0,                                  // the hero: the circles stepping round
      mid(2095),                          // join the best: the testimonial cards
      mid(3554),                          // discover new ingredients faster: the stack
      Math.min(3880, mid(4465)),          // instantly review every claim
      mid(6300),                          // dynamic company matching: the suppliers
      mid(7523),                          // trust and security, the coral and the rock
      maxScroll,                          // the difference, and the page lifting off the footer
    ].map((y) => clamp(y, 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    for (const L of layers) L.last = '_';
    lastPill = ''; footOn = -1;
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; about 20 s round
    [3.0, 1.0], [1.7, 0.9], [1.5, 0.9], [1.7, 1.1], [1.5, 1.0], [1.5, 1.0], [1.2, 2.4],
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
    const at = stops.findIndex((y) => Math.abs(y - scroll) <= 3);
    if (at >= 0) { mode = 'tour'; phase = holdAt[at] + LEGS[at][0] * 0.35; return; }
    let j = stops.findIndex((y) => y > scroll + 3);
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
    if (!still) { amb += dt; car += dt * V['motion.carousels']; }
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
        if (Math.abs(coast) > 4 && !still) {
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
  function setO(o, el, v, key) { const str = v.toFixed(3); if (o[key || 'op'] !== str) { el.style.opacity = str; o[key || 'op'] = str; } }
  /* a carousel's position at time t: hold, then an eased step to the next, from index `first` */
  function stepper(t, hold, move, first, curve) {
    const T = hold + move, n = Math.floor(t / T), f = t - n * T;
    return first + n + (f > hold ? (curve || easeOut)((f - hold) / move) : 0);
  }
  /* frames shown one after another, each fading in over the last T of the one before it */
  function xfade(list, p, T) {
    const N = list.length, c = Math.floor(p) % N, f = p - Math.floor(p), n = (c + 1) % N;
    const u = f > 1 - T ? smooth(f, 1 - T, 1) : 0;
    list.forEach((o, j) => {
      let v = 0;
      if (j === c) v = n > c ? 1 : 1 - u;     // the next one sits above: stay; it sits below: fade out
      else if (j === n) v = n > c ? u : 1;
      setO(o, o.el, v);
    });
  }

  /* the hero's coverflow at index a (continuous) */
  function drawHero(a) {
    for (let i = 0; i < HERO.n; i++) {
      const o = wrap(i - a, HERO.n, -HERO.n / 2), ao = Math.abs(o);
      const sc = HERO.P / (HERO.P + HERO.z * ao);
      const pull = -HERO.pull * Math.sign(o) * Math.max(0, 1 - Math.abs(ao - 1));
      const x = (HERO.pitch * o + pull) * sc;
      const vis = 1 - smooth(ao, 2.3, 2.5);
      const im = heroImgs[i], tt = heroTitles[i];
      setT(im, im.el, `translate3d(${x.toFixed(2)}px, ${((HERO.cy - 184) * (1 - sc)).toFixed(2)}px, 0) scale(${sc.toFixed(4)})`);
      setO(im, im.el, vis);
      setT(tt, tt.el, `translate3d(${x.toFixed(2)}px, ${((438.5 - HERO.cy) * (sc - 1)).toFixed(2)}px, 0) scale(${sc.toFixed(4)})`);
      setO(tt, tt.el, (0.2 + 0.8 * Math.max(0, 1 - ao)) * vis);
    }
    // the caption under it changes as each step starts
    const T = HERO.hold + HERO.move, n = Math.floor(car / T), f = car - n * T;
    const on = (HERO.first + n + (f > HERO.hold ? 1 : 0)) % HERO.n;
    const since = f > HERO.hold ? f - HERO.hold : f + HERO.move;
    heroParas.forEach((p, j) => {
      const v = j === on ? smooth(since, 0, 0.22) : 0;
      setO(p, p.el, v);
      setT(p, p.el, j === on ? `translate3d(0, ${(10 * (1 - easeOut(since / 0.5))).toFixed(2)}px, 0)` : 'none');
    });
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

    /* ---- the page ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    // the waitlist pill rides at 89.8% of the window until the main column runs out under it
    pillY = Math.min(0.898 * VH, PILL_END - scroll);
    const pStr = `translate3d(0, ${pillY.toFixed(2)}px, 0)`;
    if (pStr !== lastPill) { pillSlot.style.transform = pStr; lastPill = pStr; }
    // the footer is only there to see once the main column's end is in the window
    const fOn = MAIN_H - scroll < VH + 2 ? 1 : 0;
    if (fOn !== footOn) { foot.style.opacity = fOn; footOn = fOn; }

    /* ---- the page's own motion, only where it can be seen ---- */
    const inView = (name, pad) => { const S = secs[name]; return S && scroll + VH > S.y - (pad || 0) && scroll < S.y + S.h + (pad || 0); };
    const t = still ? 0 : car;
    if (inView('hero')) drawHero(stepper(t, HERO.hold, HERO.move, HERO.first));
    if (inView('video')) xfade(vFrames, t / 0.967, 0.16);
    if (inView('quotes')) {
      const qa = stepper(t, 2.0, 0.4, 0, ease);
      for (let i = 0; i < qSlides.length; i++) {
        const q = qSlides[i], o = wrap(i - qa, qSlides.length, -qSlides.length / 2), ao = Math.abs(o);
        const str = `translate3d(${(900 * o).toFixed(2)}px, ${(100 * Math.min(1, ao)).toFixed(2)}px, 0) rotate(${(7 * o).toFixed(3)}deg) scale(${(1 - 0.04 * Math.min(1, ao)).toFixed(4)})`;
        setT(q, q.el, str);
        if (q.soft._last !== str) { q.soft.style.transform = str; q.soft._last = str; }
        const out = 1 - smooth(ao, 1.05, 1.45);
        setO(q, q.el, Math.max(0, 1 - ao * 1.6));
        setO(q, q.soft, 0.42 * smooth(ao, 0.2, 0.9) * out, 'sop');
      }
      const on = Math.round(qa) % qSlides.length;
      qNums.forEach((n, j) => setO(n, n.el, j === on ? 1 : 0));
    }
    if (inView('adopters')) {
      // one cell at a time: its logo fades out (0.35 s), the next fades in (0.35 s), then a 1.2 s wait
      const CYC = 1.9, n = Math.floor(t / CYC), f = t - n * CYC;
      aCells.forEach((cell, c) => {
        const p = A_ORDER.indexOf(c), N = cell.imgs.length;
        let k = 0, g = 9;                                     // switches done, seconds into the latest
        if (n >= p) { const last = n - ((n - p) % 8); k = Math.floor((last - p) / 8) + 1; g = (n - last) * CYC + f; }
        const cur = k % N, prev = (k + N - 1) % N;
        cell.imgs.forEach((im, j) => {
          let v = 0;
          if (k > 0 && g < 0.35) v = j === prev ? 1 - g / 0.35 : 0;
          else if (k > 0 && g < 0.7) v = j === cur ? (g - 0.35) / 0.35 : 0;
          else v = j === cur ? 1 : 0;
          setO(im, im.el, v);
        });
      });
    }
    if (inView('discover')) {
      const da = stepper(t, 2.0, 0.5, 0, ease);
      for (let i = 0; i < dCards.length; i++) {
        const d = dCards[i], kk = wrap(i - da, dCards.length, -1);
        let x, y, sc, op;
        if (kk >= 0) { x = -57 * kk; y = -55 * kk; sc = 1 - 0.05 * kk; op = Math.max(0, 1 - 0.4 * kk); }
        else { const u = -kk; x = 78 * u; y = 63 * u; sc = 1 + 0.05 * u; op = 1 - u; }
        setT(d, d.el, `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${(-20 * kk).toFixed(1)}px) scale(${sc.toFixed(4)})`);
        setO(d, d.el, op);
        const blur = kk > 0 ? smooth(kk, 0, 0.6) : 0;
        setO(d, d.soft, blur, 'sop');
        setO(d, d.img, 1 - 0.85 * blur, 'iop');
        setO(d, d.drop, Math.max(0, 1 - Math.abs(kk) * 2), 'dop');
      }
    }
    if (inView('research')) xfade(rFrames, t / 4.2, 0.14);
    if (inView('match')) {
      const ma = stepper(t, 4.0, 0.3, 3, easeOut);
      for (let i = 0; i < mCards.length; i++) {
        const m = mCards[i], o = wrap(i - ma, mCards.length, -mCards.length / 2), ao = Math.min(1, Math.abs(o));
        setT(m, m.el, `translate3d(${(393 * o).toFixed(2)}px, 0, 0) scale(${(1 - 0.09 * ao).toFixed(4)})`);
        setO(m, m.el, (1 - 0.54 * ao) * (1 - smooth(Math.abs(o), 1.6, 2.2)));
      }
    }
    if (inView('dossier')) {
      const x = -(((t / 15) * oList + 260) % oList);
      const str = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      if (str !== lastTrack) { oTrack.style.transform = str; lastTrack = str; }
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
        yView = L.cy - scroll;
        // far off the window: leave it be until it comes back into view
        if (yView + L.h / 2 < -margin || yView - L.h / 2 > VH + margin) { L.A = null; continue; }
      } else if (L.kind === 'vp') {
        if (L.foot && !footOn) { L.A = null; continue; }
        yView = L.cy + (L.pill ? pillY : 0);
      }
      const Q = L.kind === 'card' ? { x: L.cx - cardW / 2, y: L.cy - cardH / 2 }
        : { x: (L.cx - DW / 2) * s, y: (yView - VH / 2) * s };
      const project = (d, extra) => {
        const z = d * Zsep * hc;
        const tt = E.z / Math.max(E.z * 0.25, E.z - z);
        return { Q, z, t: tt, o: { x: (tt - 1) * (spread * Q.x - par * E.x) + extra.x, y: (tt - 1) * (spread * Q.y - par * E.y) + extra.y } };
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
        const T = L.twin;
        const zs = T.surface * Zsep * hc;
        const throwPx = Math.max(0, L.A.z - zs);
        const A = project(T.surface, { x: throwPx * LIGHT.x, y: throwPx * LIGHT.y });
        // the higher the layer, the further its shadow falls and the wider it spreads
        A.t *= 1 + throwPx / cardW * 0.35;
        write(T.el, A, T);
        const op = (T.alpha * shadowK * h01).toFixed(3);
        if (op !== T.op) { T.el.style.opacity = op; T.op = op; }
      }
    }

    // the framed window's own shadow on the card ground
    if (card.classList.contains('is-framed')) {
      const Wl = layers[0].A;
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

    // the ruler: its notches slide with the page as it moves on screen; inside the card its ink is
    // light over the dark difference panel and the footer, dark over the rest of the page
    const npIn = 6 * K, offIn = (scroll * s) % npIn;
    const inStr = `translate3d(0, ${(-offIn).toFixed(2)}px, 0)`;
    for (const tk of ticksIn) tk.style.transform = inStr;
    const offOut = (scroll * s * lift / K) % 6;
    ticksOut.style.transform = `translate3d(0, ${(-offOut).toFixed(2)}px, 0)`;
    const yr = scroll + VH / 2;
    const dark = (yr >= PANEL[0] && yr < PANEL[1]) || MAIN_H - scroll < VH / 2 ? 1 : 0;
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
      down.x = e.clientX; down.y = e.clientY; down.scroll = scroll; down.samples = [];
    }
    if (dragging) {
      // whichever axis has moved more since the press drives the page; a change of mind rebases, so nothing jumps
      const axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis !== down.axis) { down.axis = axis; down.x = e.clientX; down.y = e.clientY; down.scroll = scroll; }
      if (down.axis === 'y') {
        // drag up and the page scrolls down, as on a phone, 1:1
        scroll = clamp(down.scroll - (e.clientY - down.y) * designPerScreen(), 0, maxScroll);
      } else {
        // drag right and it scrubs further down the page, left and it comes back up
        scroll = clamp(down.scroll + (e.clientX - down.x) * designPerScreen() * V['drag.scrub'], 0, maxScroll);
      }
      const now = performance.now();
      down.samples.push([now, scroll]);
      while (down.samples.length > 2 && now - down.samples[0][0] > 90) down.samples.shift();
    }
  });
  persp.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, scroll, samples: [], axis: 'y' };
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
      // a click that is not a drag opens the work; the site that frames the card decides how (never navigate here)
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
    defaults: DEFAULTS,
    values: V,
    set(values, path) {
      Object.assign(V, values);
      card.classList.toggle('show-layers', !!V['debug.outlines']);
      if (!path || /^card\.|^tilt\.perspective|^light\.bloomSize/.test(path)) layout();
    },
    layout,
    get scroll() { return scroll; }, set scroll(y) { scroll = clamp(y, 0, maxScroll); mode = 'manual'; coast = 0; idle = -1e9; },
    get mode() { return mode; }, get running() { return running; }, get h() { return spr.h.x; },
    get stops() { return stops.slice(); }, get tour() { return TOUR; }, get VH() { return VH; }, get maxScroll() { return maxScroll; },
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    seek(t) { mode = 'tour'; bridge = null; phase = t; },
    carouselsAt(t) { car = t; },
  };
  window.ingredientCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
