/* Way work card: the engine (from the Epirus and Ethos cards').

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 21 s round, never paused by
     hover; a drag takes over (up and down like a phone, or sideways to scrub:
     right is further down the page), coasts, and the tour picks up from there
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: Way's own behaviour, driven by the miniature's scroll as the
     site drives it by the window's: the hero's tickets held in place while
     they spin out round their bottom-left corners and gather behind the
     Introducing ticket, which opens until its Venice loop (a still here)
     fills the window and the line grows over it; the brand section sliding
     up over that; the hub's picture held beside its four steps, changing
     with each; the experiences drifting sideways as the page goes by; the
     nav that slides away going down and comes back on its ground going up.
     On a clock: the logo strip running, the three brands taking turns, the
     product footage drifting.

   window.wayCard is the handle the page's dials and the verify script use.
   The embed contract (?embed=1, &bleed=N, &radius=N, &touchdrag=1, the
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
  const easeOut2 = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 2);
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav'), navShift = $('#navShift'), navGround = $('#navGround');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksIn = $$('.notches-in .ticks'), ticksOut = $('.notches-out .ticks');
  const inkDark = $('.notches-in .dark'), inkLight = $('.notches-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // Way's design width
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left

  /* the dials' defaults; the page's defineParams writes over these */
  const DEFAULTS = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.75, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.7,
    'motion.tourSpeed': 1, 'motion.ambient': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.friction': 0.32, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.1,
    'card.cardSize': 40, 'card.frame': false, 'card.frameColor': '#b1ff85', 'card.notches': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  const V = Object.assign({}, DEFAULTS);
  if (EMBED && qs.get('frame') === '1') V['card.frame'] = true;
  card.style.setProperty('--r', RADIUS + 'px');

  /* ================= shadow twins ================= */
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(true);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-depth-to', 'data-shadow', 'data-stop', 'data-tone', 'id']) n.removeAttribute(a);
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    // a layer laid out in a row (the experiences) keeps its place; its twin lies over it, out of the row
    if (getComputedStyle(el).position !== 'absolute') Object.assign(tw.style, { position: 'absolute', margin: '0' });
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }
  const placeTwins = () => {
    for (const el of $$('[data-shadow]')) {
      const tw = el._twin.el;
      if (tw.style.position === 'absolute') Object.assign(tw.style, { left: el.offsetLeft + 'px', top: el.offsetTop + 'px', width: el.offsetWidth + 'px', height: el.offsetHeight + 'px' });
    }
  };

  /* what the page animates, each with its shadow twin's copy where it has one */
  const A = (name) => $$(`[data-anim="${name}"]`);
  const rots = [A('rot1'), A('rot2'), A('rot3')].map((els) => ({ els, last: '', op: '' }));
  const tkMain = $('#tkMain'), tkBody = $('#tkBody'), vClip = $('#vClip'), vImg = $('#vImg'), vTitle = $('#vTitle');
  const tkStill = document.createElement('img');             // the main ticket's loop at rest, rounded like the others
  tkStill.src = vImg.getAttribute('src'); tkStill.alt = '';
  tkStill.style.cssText = 'position:absolute;left:0;width:354px;max-width:none;object-fit:cover';
  $('.tkt-img', tkBody).appendChild(tkStill);
  const logoTrack = $('#logoTrack'), logoFade = $('#logoFade'), heroCopy = $('#heroCopy');
  const ibg = A('ibg'), iui = A('iui'), icode = A('icode'), ip = A('ip'), pill = A('pill');
  const tabOn = [0, 1, 2].map((i) => A('ton' + i)), tabOff = [0, 1, 2].map((i) => A('toff' + i));
  const TABS = [{ x: 8, w: 114 }, { x: 126, w: 119 }, { x: 249, w: 114 }];
  const hubShots = A('hub'), pimgs = A('pimg'), actTrack = $('#actTrack');

  /* ================= pins: held in the window while the page scrolls past ================= */
  const pins = { hero: { el: $('#pinHero'), start: 0, len: 0, off: 0, last: '' }, hub: { el: $('#pinHub'), start: 0, len: 2400, off: 0, last: '' } };

  /* ================= layers ================= */
  const layers = $$('[data-depth]').map((el) => ({
    el, d: +el.dataset.depth, dTo: el.dataset.depthTo != null ? +el.dataset.depthTo : null,
    kind: el === win ? 'card' : nav.contains(el) ? 'vp' : 'page',
    pin: Object.values(pins).find((p) => p.el.contains(el)) || null,
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
  const tones = $$('.page > [data-tone]').map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));

  /* ================= state ================= */
  let cw = 576, ch = 432, K = 2.5, cardW = 1440, cardH = 1080;
  let s = 0.36, VH = 1080, maxScroll = 4000;
  let PIN = 2400, P1 = 1300, P2 = 2300, OFF = 90, logoPeriod = 1597, actMax = 1500;
  const CLIP = { x: -22, y: 0, w: 1484, h: 1112 };   // the Venice still at full size, a touch over the window
  let stops = [0, 0, 0, 0, 0, 0, 0, 0];
  const secs = {};
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, amb = 0, clock = 0, grow = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', liftNow = 1;
  let navShown = 1, navGroundOp = 0, prevScroll = 0, navWant = 1, tone = 1;
  let lastNav = '', lastNavG = '', lastTone = '', lastLogo = '', lastAct = '', lastFront = null;
  const cache = new Map();
  const setT = (el, str) => { const c = cache.get(el) || {}; if (c.t !== str) { el.style.transform = str; c.t = str; cache.set(el, c); } };
  const setO = (el, v) => { const str = v.toFixed(3); const c = cache.get(el) || {}; if (c.o !== str) { el.style.opacity = str; c.o = str; cache.set(el, c); } };

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

    // the hero's scroll animation, in windows: the tickets spin out and gather (P1), the Introducing ticket opens (P2), a beat on Venice, then the brands slide up over it
    PIN = Math.round(2.3 * VH); P1 = 1.2 * VH; P2 = 2.1 * VH; OFF = (VH - 900) / 2;
    vp.style.setProperty('--pin', PIN + 'px');
    pins.hero.len = PIN + VH;
    Object.assign(CLIP, { x: -22, y: -0.015 * VH, w: 1484, h: 1.03 * VH });
    // the ticket's still at rest shows just what the opening loop will show at its smallest
    const restH = CLIP.h * 354 / CLIP.w;
    Object.assign(tkStill.style, { height: restH.toFixed(2) + 'px', top: ((144 - restH) / 2).toFixed(2) + 'px' });

    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.h = L.el.offsetHeight;
    }
    placeTwins();
    for (const t of tones) { t.y0 = t.el.offsetTop; t.y1 = t.y0 + t.el.offsetHeight; secs[t.el.dataset.stop] = { y: t.y0, h: t.el.offsetHeight }; }
    maxScroll = Math.max(0, page.offsetHeight - VH);
    pins.hub.start = secs.hub.y + 466 - 96;            // the picture holds 96px under the top of the window, as on the site
    logoPeriod = logoTrack.children[8] ? logoTrack.children[8].offsetLeft : 1597;
    actMax = Math.max(0, actTrack.scrollWidth - 1228);
    const centre = (a) => Math.round(secs[a].y + (secs[a].h - VH) / 2);
    stops = [
      0,                                  // the hero: the tickets stacked
      Math.round(2.2 * VH),               // Venice, the Introducing line over it
      centre('iface'),                    // three brands, one booking flow
      centre('feat'),                     // brand loyalty and profit
      secs.hub.y,                         // the single hub: launch
      centre('plat'),                     // Host, Activate, Reserve
      centre('act'),                      // grow revenue, build connection
      maxScroll,                          // the report and the footer
    ].map((y) => clamp(y, 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    for (const L of layers) L.last = '_';
    cache.clear();
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; about 21 s round
    [2.0, 2.3], [1.1, 0.9], [2.0, 0.8], [1.1, 0.8], [1.2, 1.4], [1.4, 0.8], [1.2, 1.2], [0.9, 2.0],
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
    if (!still) amb += dt * V['motion.ambient'];
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

    // the nav: shown at the top, it slides away going down and comes back on its ground going up
    const vel = dt > 0 ? (scroll - prevScroll) / dt : 0;
    prevScroll = scroll;
    if (scroll < 80) navWant = 1;
    else if (vel > 40) navWant = 0;
    else if (vel < -40) navWant = 1;
    const gn = still ? 1 : 1 - Math.exp(-dt / 0.16);
    navShown += (navWant - navShown) * gn;
    navGroundOp += ((scroll > 80 ? 1 : 0) - navGroundOp) * gn;

    render(dt, still);
    rafId = requestAnimationFrame(frame);
  }

  /* the hero, at this scroll: the tickets' spin, the opening onto Venice */
  function drawHero(still) {
    const u1 = clamp(scroll / P1, 0, 1);
    const th = [
      360 * easeOut2((u1 - 0.3) / 0.7),          // La Seine Musicale goes last
      5 + 355 * easeOut2((u1 - 0.12) / 0.88),    // Guided Fly Fishing
      10 + 350 * easeOut2(u1 / 0.8),             // Outrigger Excursion, on top, goes first
    ];
    const dx = 399 * easeOut2((u1 - 0.15) / 0.85); // the stack slides to the middle of the window
    const e2 = ease((scroll - P1) / (P2 - P1));
    grow = e2;
    const fade = 1 - smooth(e2, 0, 0.3);
    rots.forEach((r, i) => {
      const str = `translate3d(${dx.toFixed(2)}px, 0, 0) rotate(${th[i].toFixed(3)}deg)`;
      if (str !== r.last) { for (const el of r.els) el.style.transform = str; r.last = str; }
      const op = fade.toFixed(3);
      if (op !== r.op) { for (const el of r.els) el.style.opacity = op; r.op = op; }
    });
    // once La Seine Musicale has swung clear, the Introducing ticket is the one in front
    const front = th[0] > 180;
    if (front !== lastFront) { tkMain.classList.toggle('front', front); lastFront = front; }

    // the Introducing ticket's picture, from its place in the ticket to the whole window
    const top = 210 + OFF;
    const I0 = { x: 137 + dx + 7, y: top + 7, w: 354, h: 144 };
    const I = { x: lerp(I0.x, CLIP.x, e2), y: lerp(I0.y, CLIP.y, e2), w: lerp(I0.w, CLIP.w, e2), h: lerp(I0.h, CLIP.h, e2) };
    const kk = I.w / 354;
    setT(tkBody, `translate3d(${(I.x - 7 * kk - 137).toFixed(2)}px, ${(I.y - 7 * kk - top).toFixed(2)}px, 0) scale(${kk.toFixed(5)})`);
    const sx = I.w / CLIP.w, sy = I.h / CLIP.h, cc = Math.max(sx, sy);
    const drift = 1 + (still ? 0 : 0.035 * e2 * (0.5 - 0.5 * Math.cos(amb * 0.25)));
    setT(vClip, `translate3d(${(I.x - CLIP.x).toFixed(2)}px, ${(I.y - CLIP.y).toFixed(2)}px, 0) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})`);
    setT(vImg, `scale(${(cc / sx * drift).toFixed(5)}, ${(cc / sy * drift).toFixed(5)})`);
    const opening = e2 > 0.0005;
    setO(vClip, opening ? 1 : 0);
    setO(tkStill, opening ? 0 : 1);
    // the line: from under the picture in the ticket to the middle of the window, three times the size
    const sc = Math.pow(3, e2) / 3;
    const c0 = { x: 137 + dx + 72 + 112, y: top + 232 + 37 };
    const ic = { x: I.x + I.w / 2, y: I.y + I.h / 2 };
    const cx = lerp(c0.x, ic.x, e2), cy = lerp(c0.y, ic.y, e2);
    setT(vTitle, `translate3d(${(cx - 336 * sc - 384).toFixed(2)}px, ${(cy - 108 * sc - (VH / 2 - 108)).toFixed(2)}px, 0) scale(${sc.toFixed(5)})`);
  }

  /* the brand section: Turtle Bay, Andaz and Autocamp in turn */
  function drawTabs(still) {
    const T = 2.6, f0 = still ? 0 : amb, n = Math.floor(f0 / T), f = f0 - n * T;
    const cur = n % 3, nxt = (n + 1) % 3, mix = still ? 0 : smooth(f, T - 0.5, T);
    const w = [0, 0, 0]; w[cur] += 1 - mix; w[nxt] += mix;
    for (const set of [ibg, iui, icode]) set.forEach((el, i) => setO(el, w[i % 3]));
    for (let i = 0; i < 3; i++) { for (const el of tabOn[i]) setO(el, w[i]); for (const el of tabOff[i]) setO(el, 1 - w[i]); }
    ip.forEach((el, i) => setO(el, i === 0 ? 1 - w[2] : w[2]));
    const m = ease(mix), x = lerp(TABS[cur].x, TABS[nxt].x, m), ww = lerp(TABS[cur].w, TABS[nxt].w, m);
    for (const el of pill) setT(el, `translate3d(${(x - 8).toFixed(2)}px, 0, 0) scale(${(ww / 114).toFixed(4)}, 1)`);
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
    for (const p of Object.values(pins)) {
      p.off = clamp(scroll - p.start, 0, p.len);
      const str = `translate3d(0, ${p.off.toFixed(2)}px, 0)`;
      if (str !== p.last) { p.el.style.transform = str; p.last = str; }
    }
    const navStr = `translate3d(0, ${(-(1 - navShown) * 112).toFixed(2)}px, 0)`;
    if (navStr !== lastNav) { navShift.style.transform = navStr; lastNav = navStr; }
    const ng = navGroundOp.toFixed(3);
    if (ng !== lastNavG) { navGround.style.opacity = ng; lastNavG = ng; }

    /* ---- Way's own behaviour, only where it can be seen ---- */
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;
    if (scroll < PIN + VH + 4) drawHero(still);
    if (inView(0, VH)) {
      const x = still ? 0 : (amb * 32) % logoPeriod;
      const str = `translate3d(${(-x).toFixed(2)}px, 0, 0)`;
      if (str !== lastLogo) { logoTrack.style.transform = str; lastLogo = str; }
      // as on the site, the strip goes as soon as the tickets start to move, and the copy fades as it scrolls away
      setO(logoFade, 0.8 * (1 - smooth(scroll, 0, 0.3 * VH)));
      setO(heroCopy, 1 - smooth(scroll, 0.04 * VH, 0.62 * VH));
    }
    if (inView(secs.iface.y, secs.iface.y + secs.iface.h)) drawTabs(still);
    if (inView(secs.hub.y, secs.hub.y + secs.hub.h)) {
      // the picture changes as each step comes up beside it
      const f = clamp((scroll - pins.hub.start) / 800, 0, 3);
      hubShots.forEach((el, i) => { const j = i % 4; setO(el, (j ? smooth(f, j - 0.58, j - 0.42) : 1) * (j < 3 ? 1 - smooth(f, j + 0.42, j + 0.58) : 1)); });
    }
    if (inView(secs.plat.y + 443, secs.plat.y + 760)) {
      // the products' footage: their loops as stills, drifting slowly
      pimgs.forEach((el, i) => { const j = i % 3; setT(el, `translate3d(${(still ? 0 : 6 * Math.sin(amb * 0.23 + j * 2)).toFixed(2)}px, 0, 0) scale(${(1.05 + (still ? 0 : 0.03 * Math.sin(amb * 0.31 + j))).toFixed(4)})`); });
    }
    if (inView(secs.act.y, secs.act.y + secs.act.h)) {
      // the experiences drift sideways as the page goes by
      const x = clamp((scroll - (secs.act.y - VH)) * 0.5, 0, actMax);
      const str = `translate3d(${(-x).toFixed(2)}px, 0, 0)`;
      if (str !== lastAct) { actTrack.style.transform = str; lastAct = str; }
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
        yView = L.cy + (L.pin ? L.pin.off : 0) - scroll;
        // far off the window: leave it be until it comes back into view
        if (yView + L.h / 2 < -margin || yView - L.h / 2 > VH + margin) { L.A = null; continue; }
      }
      const d = L.dTo == null ? L.d : lerp(L.d, L.dTo, grow);
      const Q = L.kind === 'card' ? { x: L.cx - cardW / 2, y: L.cy - cardH / 2 }
        : { x: (L.cx - DW / 2) * s, y: ((L.kind === 'page' ? yView : L.cy) - VH / 2) * s };
      const project = (dd, extra) => {
        const z = dd * Zsep * hc;
        const t = E.z / Math.max(E.z * 0.25, E.z - z);
        return { Q, z, t, o: { x: (t - 1) * (spread * Q.x - par * E.x) + extra.x, y: (t - 1) * (spread * Q.y - par * E.y) + extra.y } };
      };
      L.A = project(d, { x: 0, y: 0 });
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

    // the ruler: its notches slide with the page as it moves on screen; inside the card its ink follows the section under the mark
    const npIn = 6 * K, offIn = (scroll * s) % npIn;
    const inStr = `translate3d(0, ${(-offIn).toFixed(2)}px, 0)`;
    for (const t of ticksIn) t.style.transform = inStr;
    const offOut = (scroll * s * lift / K) % 6;
    ticksOut.style.transform = `translate3d(0, ${(-offOut).toFixed(2)}px, 0)`;
    const yr = scroll + VH / 2;
    let dark = 1;
    for (const t of tones) if (yr >= t.y0 && yr < t.y1) dark = t.dark ? 1 : 0;
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
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); }, get nav() { return navShown; },
    get grow() { return grow; },
    seek(t) { mode = 'tour'; bridge = null; phase = t; },
    ambAt(t) { amb = t; },
  };
  window.wayCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
