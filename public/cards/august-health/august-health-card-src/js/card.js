/* August Health work card: the engine (the Happy Droid and Metamag cards',
   from the Ethos card's).

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 21 s round, never paused by
     hover; a drag takes over (up and down like a phone, or sideways to scrub:
     right is further down the page), coasts, and the tour picks up from there
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: August Health's own motion, as Kinetic shipped it. The hero's
     ring of circles turns once in 340 s, each photo counter-turning to stay
     upright (and the closing ring of outlines with it); the section breaks
     flatten from 96px to nothing as their section's bottom goes from 80% to
     30% of the window; the logos run left, 100 s a lap; each product card
     fades in (1 s, outQuart) as it comes 20% into the window while its
     screen slides up from 80% (0.8 s, easeOut); the values' coloured border
     draws itself round the cards, green, then orange, then pink, 6 s per
     1192px, fades and starts again; the case studies step on a card as the
     next arrow does (0.8 s); and the footer, waiting pinned under the page,
     cycles through the four colour schemes the mark's dots switch on the
     site.
   All of it keeps time with the tour, so a recording of one tour closes on
   itself: the rings and the logos run at the site's pace whenever they can
   be seen and wind back while the tour is down among the features and the
   values (a whole turn of the rings would take sixteen tours), and every
   other moment starts as its part comes into the window and resets once it
   has gone, so it follows from the tour's clock alone.

   window.augustHealthCard is the handle the page's dials, the site and the
   verify script use. The embed contract (?embed=1, &bleed=N, &radius=N,
   &touchdrag=1, the ks-card pause message and the ks-card-open click) is the
   same as the other cards', and {type: "ks-card", at: seconds} puts the tour
   and all of its motion at that time (the tile's resting loop handing over
   to the live card). */
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
  const out2 = (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); };          // power2.out
  const out4 = (t) => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 4); };        // outQuart
  const frac = (x) => x - Math.floor(x);
  function cubic(X1, Y1, X2, Y2) { // a CSS cubic-bezier, solved for x
    const bx = (t) => 3 * (1 - t) * (1 - t) * t * X1 + 3 * (1 - t) * t * t * X2 + t * t * t;
    const by = (t) => 3 * (1 - t) * (1 - t) * t * Y1 + 3 * (1 - t) * t * t * Y2 + t * t * t;
    return (x) => {
      x = clamp(x, 0, 1); let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 18; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
      return by(t);
    };
  }
  const easeOut = cubic(0, 0, 0.58, 1);    // the site's interactions' easeOut
  const cssEase = cubic(0.25, 0.1, 0.25, 1); // the carousel's transition

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), main = $('#main');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksIn = $('.notches-in .ticks'), ticksOut = $('.notches-out .ticks');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // the site's design width
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left
  const FOOT_H = 681.5;                  // the footer, as on the live page
  const RING_TURN = 340;                 // s per turn of the rings (the site's, above 990px)
  const RING_R = 676;                    // px out from the ring's centre: 1820 / 2 - 468 / 2
  const CS_PITCH = 408;                  // a case-study card and its gap

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.6, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.7,
    'motion.tourSpeed': 1, 'motion.ambient': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.scrub': 2.5, 'drag.momentum': 1, 'drag.friction': 0.32, 'drag.resumeAfter': 1.1,
    'card.cardSize': 40, 'card.frame': false, 'card.frameColor': '#4865ff', 'card.notches': true, 'card.navBlur': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  if (EMBED && (qs.get('frame') === '1' || qs.get('frame') === 'framed')) V['card.frame'] = true;
  card.style.setProperty('--r', RADIUS + 'px');

  /* ================= the values' border, drawn as segments ================= */
  // the site's three paths (an SVG of 834 x 590 over the 832 x 588 row), green, orange, pink, each
  // drawn at 6 s per 1192px, then all three fade (1 s) and the line starts again half a second later
  const vLines = $('#vLines');
  const SX = 832 / 834, SY = 588 / 590, R = 48;
  const PATHS = [
    { c: '#328a3b', segs: [['v', 1, 109, 49], ['a', 49, 49, 180], ['h', 1, 49, 785], ['a', 785, 49, 270], ['v', 833, 49, 294.5]] },
    { c: '#ff6d39', segs: [['v', 833, 295, 540.5], ['a', 785, 540.5, 0], ['h', 588.5, 785, 49], ['a', 49, 540.5, 90], ['v', 1, 540.5, 480.5]] },
    { c: '#f098d7', segs: [['v', 1, 480.5, 109]] },
  ];
  const ARC = Math.PI / 2 * R;
  let vT0 = 0;
  for (const P of PATHS) {
    let off = 0;
    P.items = P.segs.map((g) => {
      const el = document.createElement(g[0] === 'a' ? 'div' : 'i');
      let len, it;
      if (g[0] === 'v') {
        const [, x, y0, y1] = g; len = Math.abs(y1 - y0);
        Object.assign(el.style, { left: (x * SX - 1) + 'px', top: (Math.min(y0, y1) * SY) + 'px', width: '2px', height: (len * SY) + 'px', background: P.c,
          transformOrigin: y1 > y0 ? '50% 0' : '50% 100%' });
        it = { el, axis: 'y' };
      } else if (g[0] === 'h') {
        const [, y, x0, x1] = g; len = Math.abs(x1 - x0);
        Object.assign(el.style, { left: (Math.min(x0, x1) * SX) + 'px', top: (y * SY - 1) + 'px', width: (len * SX) + 'px', height: '2px', background: P.c,
          transformOrigin: x1 > x0 ? '0 50%' : '100% 50%' });
        it = { el, axis: 'x' };
      } else {
        // a quarter arc: a ring with one coloured side turning into its quadrant, clipped to it
        const [, cx, cy, a] = g; len = ARC;
        el.className = 'q';
        const qx = (a === 270 || a === 0) ? cx : cx - 49, qy = (a === 0 || a === 90) ? cy : cy - 49;
        Object.assign(el.style, { left: (qx * SX) + 'px', top: (qy * SY) + 'px' });
        const ring = document.createElement('i');
        ring.style.left = ((a === 270 || a === 0) ? -49 : 0) + 'px';
        ring.style.top = ((a === 0 || a === 90) ? -49 : 0) + 'px';
        ring.style.borderTopColor = P.c;
        el.appendChild(ring);
        it = { el: ring, axis: 'r', a };
      }
      vLines.appendChild(el);
      Object.assign(it, { off, len, last: '' });
      off += len;
      return it;
    });
    P.len = off; P.t0 = vT0; P.dur = 6 * off / 1192; vT0 += P.dur;
  }
  const V_FADE0 = vT0, V_LOOP = vT0 + 1.5;

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
      el, d: +el.dataset.depth, kind: el === win ? 'card' : page.contains(el) ? 'page' : 'fixed',
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
  const pinY = { foot: 0 };
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= the page's own motion ================= */
  const sec = { hero: $('#hero'), logos: $('#logos'), feats: $('#feats'), vals: $('#vals'), cases: $('#cases'), cta: $('#cta'), foot: $('#foot') };
  const Y = {}; // section tops, measured in layout()
  const rings = [
    { key: 'hero', rotor: { el: $('#heroRotor'), last: '' }, items: $$('#heroRotor .r-it').map((el, i) => ({ el, a: 45 * (i + 1), last: '' })) },
    { key: 'cta', rotor: { el: $('#ctaRotor'), last: '' }, items: [] }, // outlines: round, so they need no counter-turn
  ];
  const breaks = [{ el: $('#heroBrk'), key: 'hero', last: '' }, { el: $('#valsBrk'), key: 'vals', last: '' }];
  const ticker = { el: $('#lgMove'), list: $('#lgMove .lg-list'), w: 2140, last: '' };
  const feats = $$('#feats .fc').map((el) => {
    const shot = $('.fc-shot', el);
    return { el, shot, top: 0, t: -1, op: '', s: { el: shot, last: '', op: '' } };
  });
  const vRow = $('#vRow'), vLinesO = { op: '' };
  let vRowTop = 0, vT = -1;
  const cs = { el: $('#csTrack'), last: '', idx: 0, anim: null, tin: 0 };
  const foot = { bgs: ['#ftBg', '#ftBg1', '#ftBg2', '#ftBg3'].map((s) => ({ el: $(s), op: '' })), t: -1 };
  const FOOT_P = 0.8; // s per colour scheme

  /* ================= state ================= */
  let cw = 576, ch = 432, K = 2.5, cardW = 1440, cardH = 1080;
  let s = 0.4, VH = 1080, HH = 960, maxScroll = 10000;
  let stops = [0, 0, 0, 0, 0, 0, 0];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, ambT = 0, clock = 0, frameDt = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', liftNow = 1;

  function layout() {
    stage.style.setProperty('--size', V['card.cardSize']);
    const framed = MAT > 0 || (!!V['card.frame']);
    card.classList.toggle('is-framed', framed);
    card.style.setProperty('--frame-color', V['card.frameColor']);
    card.classList.toggle('is-light-frame', luminance(V['card.frameColor']) > 0.55);
    vp.classList.toggle('is-flat-nav', !V['card.navBlur']);
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
    // fit by cropping, never letterbox: the page is always 1440 wide and as tall as the window allows;
    // the hero and the close are 100svh (capped at 960px) on the site, so they follow VH
    VH = Math.max(640, Math.round(DW * winH / winW));
    HH = Math.min(VH, 960);
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.transform = `scale(${s})`;
    persp.style.perspective = (V['tilt.perspective'] * cw) + 'px';
    card.style.transform = `scale(${1 / K})`;
    bloom.style.width = bloom.style.height = (V['light.bloomSize'] * cardW) + 'px';
    bloom.style.left = bloom.style.top = (-V['light.bloomSize'] * cardW / 2) + 'px';

    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'page' ? page : vp;
      [L.cx, L.cy] = posIn(L.el, root);
      L.h = L.el.offsetHeight;
    }
    for (const k in sec) Y[k] = sec[k].offsetTop;
    Y.main = main.offsetHeight;
    for (const f of feats) f.top = Y.feats + f.el.offsetTop;
    vRowTop = Y.vals + vRow.offsetTop;
    ticker.w = ticker.list.offsetWidth || 2140;
    maxScroll = Math.max(0, page.offsetHeight - VH);
    stops = [
      0,                                                   // the hero, the ring turning round the headline
      Y.feats + 40,                                        // get to know us: Move-Ins and eMAR coming in
      Y.feats + 790,                                       // the EHR card
      Y.vals + Math.max(20, 1079.6 - VH),                  // our values, the line drawing round the cards
      Y.cases + Math.max(60, 1145 - VH),                   // the case studies, stepping on a card
      Math.round(Y.cta + HH / 2 - VH / 2),                 // the founders' line in its ring
      maxScroll,                                           // the footer, cycling through its colours
    ].map((y) => clamp(Math.round(y), 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    for (const L of layers) L.last = '_';
    if (mode === 'tour' && !reduced.matches) replayMoments(phase); // the moments, true to the tour on the new layout
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; about 21 s round
    [1.6, 1.3], [1.4, 1.0], [1.2, 1.3], [2.1, 1.2], [2.0, 1.0], [1.3, 0.9], [2.2, 2.2],
  ];
  const TOUR = LEGS.reduce((a, [h, m]) => a + h + m, 0);
  const holdAt = LEGS.reduce((a, [h, m], i) => (a.push(i ? a[i - 1] + LEGS[i - 1][0] + LEGS[i - 1][1] : 0), a), []);
  // the rings' and the logos' clock on the tour: straight on, but wound back a whole tour's worth (eased) from the
  // features to the end of the values' stop, where neither the rings nor the logos are in view, so it comes round
  const AMB_BACK = [holdAt[1], holdAt[3] + LEGS[3][0]];
  const ambAt = (t) => { t = ((t % TOUR) + TOUR) % TOUR; return t - TOUR * ease((t - AMB_BACK[0]) / (AMB_BACK[1] - AMB_BACK[0])); };
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
    tPrev = now; clock += dt; frameDt = dt;
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
    const wasTour = mode === 'tour', p0 = phase;
    if (mode === 'tour') {
      if (!still) { phase += dt * speed; scroll = tourAt(phase); }
      else scroll = stops[0]; // reduced motion: one still pose, the hero
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
    // the rings' and the logos' clock: on the tour it follows the tour's (ambAt), by hand it runs straight on
    if (!still) {
      ambT += wasTour && mode === 'tour' && speed > 0.01
        ? V['motion.ambient'] * (ambAt(phase) - ambAt(p0)) / speed
        : V['motion.ambient'] * dt;
    }

    render(dt, still);
    rafId = requestAnimationFrame(frame);
  }

  function setT(o, el, str) { if (o.last !== str) { el.style.transform = str; o.last = str; } }
  function setO(o, el, v) { const str = v.toFixed(3); if (o.op !== str) { el.style.opacity = str; o.op = str; } }

  /* ---- the page's moments, stepped along the scroll y: each starts as its part comes into the window and
     resets once it has gone (every one of them on the hero), so on the tour they follow from its clock alone ---- */
  function stepMoments(y, dt, amb, still) {
    const inView = (y0, y1) => y + VH > y0 && y < y1;
    // the product cards: from the moment each comes 20% into the window
    for (const f of feats) {
      if (still) f.t = 9;
      else if (f.top > y + VH) f.t = -1;                    // below the window again: ready to replay
      else if (f.t < 0 && f.top < y + 0.8 * VH) f.t = 0;    // the site's 20% offset
      else if (f.t >= 0) f.t += dt;
    }
    // the values' line
    if (still) vT = V_FADE0 - 0.001;
    else if (!inView(Y.vals, Y.cases)) vT = -1;
    else if (vT < 0 && vRowTop < y + 0.9 * VH) vT = 0;
    else if (vT >= 0) { vT += amb; if (vT >= V_LOOP) vT -= V_LOOP; }
    // the case studies: a card on, after a beat (each step hands on the time it overran, and a sum of frame
    // times a hair short of the beat counts as on it, so the steps land on the same frames however they are reached)
    const swTop = Y.cases + 536.4;
    if (still || !inView(Y.cases, Y.cta)) { cs.idx = 0; cs.anim = null; cs.tin = 0; }
    else {
      const seen = swTop > y + 40 && swTop + 450 < y + VH + 60;
      if (seen && !cs.anim) {
        cs.tin += amb;
        if (cs.tin >= 1.1 - 1e-9) { cs.anim = { from: cs.idx, t: Math.max(0, cs.tin - 1.1) }; cs.tin = -1.4; }
      }
      if (cs.anim) {
        cs.anim.t += amb;
        const u = clamp(cs.anim.t / 0.8, 0, 1);
        cs.idx = cs.anim.from + cssEase(u);
        if (cs.anim.t >= 0.8 - 1e-9) { cs.idx = (cs.anim.from + 1) % 6; cs.tin += Math.max(0, cs.anim.t - 0.8); cs.anim = null; }
      }
    }
    // the footer's colour schemes
    const footOn = !still && y > maxScroll - FOOT_H * 0.5;
    if (!footOn) foot.t = -1;
    else foot.t = foot.t < 0 ? 0 : foot.t + amb;
  }
  // the moments as one tour from the hero leaves them t seconds in, stepped at the loop's own 60 fps
  function replayMoments(t) {
    t = ((t % TOUR) + TOUR) % TOUR;
    for (const f of feats) f.t = -1;
    vT = -1; cs.idx = 0; cs.anim = null; cs.tin = 0; foot.t = -1;
    for (let i = 1, n = Math.round(t * 60); i <= n; i++) stepMoments(tourAt(i / 60), 1 / 60, V['motion.ambient'] / 60, false);
  }

  function choreography(dt, still) {
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;
    stepMoments(scroll, dt, still ? 0 : dt * V['motion.ambient'], still);

    /* ---- the footer, pinned to the window's bottom under the page ---- */
    pinY.foot = scroll - maxScroll;
    for (const p of pins) setT(p, p.el, `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)`);

    /* ---- the rings: one turn in 340 s, the photos counter-turning ---- */
    const th = 360 * ambT / RING_TURN;
    for (const r of rings) {
      const y0 = Y[r.key];
      if (!inView(y0, y0 + HH)) continue;
      setT(r.rotor, r.rotor.el, `rotate(${th.toFixed(3)}deg)`);
      for (const it of r.items) setT(it, it.el, `rotate(${it.a}deg) translate(${RING_R}px) rotate(${(-it.a - th).toFixed(3)}deg)`);
    }

    /* ---- the section breaks: 96px of curve to none as the section's bottom goes from 80% to 30% ---- */
    for (const b of breaks) {
      const bottom = b.key === 'hero' ? HH : Y.vals + sec.vals.offsetHeight;
      if (!inView(bottom - 120, bottom + 20)) continue;
      const p = clamp((scroll - (bottom - 0.8 * VH)) / (0.5 * VH), 0, 1);
      const sy = 1 - out2(p);
      setT(b, b.el, sy > 0.9995 ? '' : `scaleY(${Math.max(0.0001, sy).toFixed(4)})`);
    }

    /* ---- the logos, 100 s a lap ---- */
    if (inView(Y.logos, Y.feats)) {
      const x = still ? 0 : -(frac((ambT / 100)) * ticker.w);
      setT(ticker, ticker.el, `translate3d(${x.toFixed(2)}px, 0, 0)`);
    }

    /* ---- the product cards: fade in as they come 20% into the window, the screen sliding up ---- */
    for (const f of feats) {
      const t = Math.max(0, f.t);
      setO(f, f.el, f.t < 0 ? 0 : out4(t / 1.0));
      const e = f.t < 0 ? 0 : easeOut(t / 0.8);
      setT(f.s, f.shot, `translate3d(0, ${(-50 + 80 * (1 - e)).toFixed(2)}%, 0)`);
      setO(f.s, f.shot, e);
    }

    /* ---- the values' line: green, then orange, then pink, fading and starting again ---- */
    if (inView(Y.vals, Y.cases) || still) {
      // not started, or faded and waiting: nothing drawn; drawing: each path from its start; fading: all of it
      const T = vT, waiting = T < 0 || T >= V_FADE0 + 1;
      setO(vLinesO, vLines, T > V_FADE0 && T < V_FADE0 + 1 ? 1 - out2(T - V_FADE0) : 1);
      for (const P of PATHS) {
        const len = waiting ? 0 : P.len * clamp((T - P.t0) / P.dur, 0, 1);
        for (const it of P.items) {
          const u = clamp((len - it.off) / it.len, 0, 1);
          const str = it.axis === 'x' ? `scaleX(${u.toFixed(4)})` : it.axis === 'y' ? `scaleY(${u.toFixed(4)})`
            : `rotate(${(it.a - 225 - 96 * (1 - u)).toFixed(2)}deg)`;
          setT(it, it.el, str);
        }
      }
    }

    /* ---- the case studies: a card on, as the next arrow does, after a beat ---- */
    if (inView(Y.cases, Y.cta)) setT(cs, cs.el, `translate3d(${(-CS_PITCH * cs.idx).toFixed(2)}px, 0, 0)`);

    /* ---- the footer's colour schemes: green, blue, pink, orange, a step every 0.8 s, 0.3 s fades ---- */
    if (scroll > maxScroll - FOOT_H - 20) {
      const n = foot.t < 0 ? 0 : Math.floor(foot.t / FOOT_P);
      const cur = n % 4, prev = n ? (n - 1) % 4 : 0;
      const f = foot.t < 0 ? 1 : clamp((foot.t - n * FOOT_P) / 0.3, 0, 1);
      foot.bgs.forEach((b, i) => {
        let o = i === 0 ? 1 : 0;
        if (i && i === cur) o = cur > prev ? f : 1;
        if (i && i === prev && prev !== cur) o = cur > prev ? 1 : 1 - f;
        setO(b, b.el, o);
      });
    }
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

    /* ---- the page: scroll and the site's own motion ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    choreography(dt || 0, still);

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
      } else if (L.kind === 'fixed') yView = L.cy;
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

    // the ruler: its notches slide with the page as it moves on screen
    const npIn = 6 * K, offIn = (scroll * s) % npIn;
    ticksIn.style.transform = `translate3d(0, ${(-offIn).toFixed(2)}px, 0)`;
    const offOut = (scroll * s * lift / K) % 6;
    ticksOut.style.transform = `translate3d(0, ${(-offOut).toFixed(2)}px, 0)`;
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

  // the tour's own clock: the tour, the rings and the logos, and the page's moments, all t seconds into a tour
  function seekTime(t) {
    t = ((t % TOUR) + TOUR) % TOUR;
    mode = 'tour'; bridge = null; phase = t; ambT = ambAt(t);
    scroll = tourAt(phase);
    replayMoments(t);
  }

  /* ================= running, pausing ================= */
  let parentVisible = true;
  function sync() {
    const want = !document.hidden && parentVisible;
    if (want && !running) { running = true; tPrev = performance.now(); rafId = requestAnimationFrame(frame); }
    else if (!want && running) { running = false; cancelAnimationFrame(rafId); }
  }
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('message', (e) => {
    if (e.source && e.source !== window.parent && e.source !== window) return;
    const d = e.data;
    if (!d || d.type !== 'ks-card') return;
    // {at}: the resting loop's time as the tile hands over; the card carries on from that frame (not mid-drag)
    if (typeof d.at === 'number' && isFinite(d.at) && !dragging && (mode === 'tour' || mode === 'bridge')) seekTime(d.at);
    if (typeof d.visible === 'boolean') { parentVisible = d.visible; sync(); }
  });
  reduced.addEventListener('change', () => { if (reduced.matches) { scroll = stops[0]; mode = 'tour'; phase = 0; ambT = 0; } });

  /* ================= the handle ================= */
  const api = {
    embed: EMBED,
    values: V,
    set(values, path) {
      Object.assign(V, values);
      card.classList.toggle('show-layers', !!V['debug.outlines']);
      if (!path || /^card\.|^tilt\.perspective|^light\.bloomSize/.test(path)) layout();
    },
    layout,
    get scroll() { return scroll; }, set scroll(y) { scroll = clamp(y, 0, maxScroll); mode = 'manual'; coast = 0; idle = -1e9; },
    get mode() { return mode; }, get running() { return running; }, get h() { return spr.h.x; },
    get stops() { return stops.slice(); }, get tour() { return TOUR; }, get VH() { return VH; },
    get maxScroll() { return maxScroll; }, get sections() { return { ...Y }; },
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    // the tour's length in seconds (the site records one tour as the tile's resting loop)
    get period() { return TOUR; },
    seek: seekTime,
    resume() { idle = 1e9; },
  };
  window.augustHealthCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
