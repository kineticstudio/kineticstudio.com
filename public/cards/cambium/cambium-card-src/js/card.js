/* Cambium work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 20 s round, never paused by
     hover; a drag takes over (up and down like a phone, sideways as a
     scrub), coasts, and the tour picks up from there
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: Cambium's own scroll choreography (the desk and its objects
     sliding away at their own speeds, the iPad lifting off the desk and
     growing into the supply chain dashboard, which slides its sidebar,
     header and legend in) and its ambient motion (the species changing every
     few seconds with the booklet, blueprint, polaroid, tooltip and samples,
     the tooltips floating, the plant moving in the breeze, the globe's
     routes, the dashboard tabs, the customer belt), on the tour's own clock:
     it starts over with every tour, and everything seen as the tour comes
     round to the desk turns a whole number of times a tour, so a recording
     of one tour closes on itself

   The site rests a tile on that recording and, on hover, posts
   {type: "ks-card", at: seconds} so the live card carries on from the frame
   the loop was showing (the tour and the ambient motion both).

   window.cambiumCard is the handle the page's dials, the site and the verify script use. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const EMBED = qs.has('embed') && qs.get('embed') !== '0';
  document.documentElement.classList.toggle('is-embed', EMBED);
  const BLEED = EMBED ? Math.max(0, parseFloat(qs.get('bleed')) || 0) : 0; // px of frame overhanging the tile
  const TOUCH_DRAG = !EMBED || qs.get('touchdrag') === '1';               // in a tile, a swipe scrolls the site
  const CLICK = 6;                                                        // px: less is a click, more a drag

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const TAU = Math.PI * 2;

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksIn = $('.notches-in .ticks'), ticksOut = $('.notches-out .ticks'), notchesIn = $('.notches-in');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // Cambium's design width
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: -0.06, y: 0.2 };    // shadow throw per px of height: the desk's light, from the window at the top right
  const IMG = 'cambium-card-src/img/';

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.7, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.7,
    'motion.tourSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21, 'motion.ambient': 1,
    'drag.momentum': 1, 'drag.friction': 0.32, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.2,
    'card.cardSize': 40, 'card.frame': true, 'card.frameColor': '#d65b19', 'card.notches': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  if (EMBED && qs.get('frame') === 'full') V['card.frame'] = false;

  /* ================= the customer belt ================= */
  const CUSTOMERS = [['Enterprise', 'enterprise'], ['General Contractors', 'contractors'], ['Architects', 'architects'], ['Sawmills', 'sawmills'], ['Manufacturers', 'manufacturers']];
  const BELT_PITCH = 418, BELT_LOOP = BELT_PITCH * CUSTOMERS.length;
  const belt = $('#belt');
  belt.innerHTML = [...CUSTOMERS, ...CUSTOMERS].map(([t, f], i) =>
    `<div class="c-card" style="left:${i * BELT_PITCH}px"><div class="t">${t}</div><img src="${IMG}cust-${f}.webp" alt=""></div>`).join('');

  /* ================= shadow twins ================= */
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(true);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-pin', 'id']) n.removeAttribute(a);
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }

  /* ================= pins: Cambium's scroll choreography =================
     A pin is a wrapper the page moves on its own as it scrolls (a translate,
     a scale and a turn about its own centre); the layers inside it are
     projected from where the pin has put them. */
  const IPAD = { hx: 719.5, hy: 713, fx: 1171, fy: 1400.5, k0: 0.46, stick: 687.5, from: 245, to: 890 };
  const PIN = {
    desk: (y) => ({ x: 0, y: -0.15 * Math.min(y, 1500), k: 1, r: 0 }),      // the desk slides away a touch faster than the page
    hero: (y) => ({ x: 0, y: -0.2 * Math.min(y, 1500), k: 1, r: 0 }),       // the headline, tooltips and objects faster still
    shade: (y) => ({ x: 0, y: -0.1 * Math.min(y, 1500), k: 1, r: 0 }),      // the window's shade on the desk
    foot: (y) => ({ x: 0, y: -0.25 * clamp(maxScroll - y, 0, VH), k: 1, r: 0 }), // the footer rides up into place at the end
    ipad: (y) => {
      // sticky on screen at first, then lifted, carried right and grown into the dashboard (power3.out, as the live scrub)
      const u = clamp((y - IPAD.from) / (IPAD.to - IPAD.from), 0, 1), p = 1 - Math.pow(1 - u, 3);
      return { x: IPAD.hx + (IPAD.fx - IPAD.hx) * p - IPAD.fx, y: IPAD.hy + Math.min(y, IPAD.stick) - IPAD.fy, k: IPAD.k0 + (1 - IPAD.k0) * p, r: -2 * (1 - p), p };
    },
  };
  const pins = $$('[data-pin]').map((el) => ({ el, name: el.dataset.pin, cx: 0, cy: 0, st: { x: 0, y: 0, k: 1, r: 0, p: 0 }, last: '' }));
  const pinOf = (el) => { const p = el.parentElement && el.parentElement.closest('[data-pin]'); return p ? pins.find((x) => x.el === p) : null; };

  /* ================= layers ================= */
  const layers = $$('[data-depth]').map((el) => ({
    el, d: +el.dataset.depth, kind: el === win ? 'card' : nav.contains(el) ? 'vp' : 'page',
    pin: pinOf(el), twin: el._twin || null, parent: null,
    cx: 0, cy: 0, h: 0, A: null, last: '',
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

  /* ================= the things that move on their own ================= */
  const spEls = $$('[data-sp]').map((el) => ({ el, i: +el.dataset.sp, last: '' }));   // the species sets (and their twins)
  const SLOTS = { T: [77, 0], L: [0, 62], R: [116, 84] };
  const SP_SLOTS = [{ walnut: 'T', ash: 'L', pine: 'R' }, { pine: 'T', walnut: 'L', ash: 'R' }, { ash: 'T', pine: 'L', walnut: 'R' }];
  const samples = $$('#samples .smp').map((el) => ({ el, name: el.dataset.smp, last: '', z: '' }));
  const bobs = $$('.bob').map((el, i) => ({ el, ph: [0, -1.3, -2.6][(i % 3)] * TAU / 3.9, last: '' }));
  const spin = $$('.spin').map((el) => ({ el, last: '' }));
  const plant = $$('.h-plant img').filter((el) => !el.closest('.twin')).map((el) => ({ el, last: '' }));
  const globeB = $('#globeB'), footShade = $('#footShade');
  const dash = { side: $('#dSide'), top: $('#dTop'), leg: $('#dLeg'), last: '' };
  const tabs = $$('[data-tab]').map((el) => ({ el, i: +el.dataset.tab, last: '' }));
  const beltCache = { last: '' };
  const tones = $$('.page > .sec').map((el) => ({ el, dark: el.dataset.tone === 'dark', y0: 0, y1: 0 }));

  /* ================= state ================= */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.36, VH = 900, maxScroll = 6000;
  let heroH = 1100, beltTop = 2482, beltBottom = 2944;
  let stops = [0, 0, 0, 0, 0, 0, 0, 0];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, amb = 0, clock = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', liftNow = 1, lastTone = '', flat = false;

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
    VH = flat ? 900 : Math.max(640, Math.round(DW * winH / winW));
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.transform = flat ? 'none' : `scale(${s})`;
    persp.style.perspective = (V['tilt.perspective'] * cw) + 'px';
    card.style.transform = `scale(${1 / K})`;
    bloom.style.width = bloom.style.height = (V['light.bloomSize'] * cardW) + 'px';
    bloom.style.left = bloom.style.top = (-V['light.bloomSize'] * cardW / 2) + 'px';

    for (const p of pins) { [p.cx, p.cy] = posIn(p.el, page); p.last = '_'; }
    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.h = L.el.offsetHeight;
      L.last = '_';
      if (L.twin) L.twin.last = '_';
    }
    for (const t of tones) { t.y0 = t.el.offsetTop; t.y1 = t.y0 + t.el.offsetHeight; }
    const top = (sel) => { const el = $(sel); return el ? el.offsetTop : 0; };
    heroH = top('.supply');
    beltTop = top('.custom') + 307; beltBottom = beltTop + 462;
    maxScroll = Math.max(0, page.offsetHeight - VH);
    const sec = (sel, off) => clamp(top(sel) + off, 0, maxScroll);
    stops = [
      0,                         // the hero: the desk, the species changing
      sec('.supply', -200),      // the iPad grown into the supply chain dashboard
      sec('.custom', 15),        // we stand up supply chains, the customer belt
      sec('.ai', -69),           // the world's oldest industry, in growth rings
      sec('.projects', -107),    // featured projects
      sec('.impact', 18),        // making modern wood work for everyone
      sec('.cta', -53),          // talk to an expert, the stippled lumber
      maxScroll,                 // the footer wordmark
    ];
    scroll = clamp(scroll, 0, maxScroll);
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; about 20 s round
    [2.3, 1.5], [1.5, 1.3], [1.1, 1.2], [1.1, 1.1], [0.9, 1.0], [1.1, 1.2], [0.9, 0.9], [1.4, 2.2],
  ];
  const TOUR = LEGS.reduce((a, [h, m]) => a + h + m, 0);
  const holdAt = LEGS.reduce((a, [h, m], i) => (a.push(i ? a[i - 1] + LEGS[i - 1][0] + LEGS[i - 1][1] : 0), a), []);
  /* the ambient clock starts over with every tour. What is in view as the tour comes round to the desk turns a
     whole number of times a tour, the nearest to its own pace: the species (one every 3.45 s, the site's 3.4,
     the first already settled at t = 0 and the next coming in as the tour leaves the desk), the tooltips'
     float, the spinner, the plant, the globe and the dashboard's tabs (one every 2.3 s, the site's 2.6). The
     customer belt is out of view by then and keeps its own pace. */
  const lap = (rate) => { const w = TAU / TOUR; return w * Math.max(1, Math.round(rate / w)); };
  const SP_PER = TOUR / (3 * Math.max(1, Math.round(TOUR / (3 * 3.4)))), SP_AT = 0.31;   // s a species; its share gone at t = 0
  const TAB_PER = TOUR / (3 * Math.max(1, Math.round(TOUR / (3 * 2.6)))), TAB_AT = 0.15;
  const BOB_W = lap(TAU / 3.9), SPIN_W = lap(TAU * 300 / 360) * 360 / TAU, GLOBE_W = lap(TAU / 9);
  const PLANT_W = [lap(0.85), lap(2.3), lap(1.3)];
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
    if (!still) amb = (amb + dt * V['motion.ambient']) % TOUR;
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

    render();
    rafId = requestAnimationFrame(frame);
  }

  function setT(o, el, str) { if (o.last !== str) { el.style.transform = str; o.last = str; } }

  function render() {
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

    /* ---- the page: scroll and Cambium's own choreography ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    for (const p of pins) {
      const st = PIN[p.name] ? PIN[p.name](scroll) : { x: 0, y: 0, k: 1, r: 0 };
      p.st = st;
      setT(p, p.el, `translate3d(${st.x.toFixed(2)}px, ${st.y.toFixed(2)}px, 0)` + (st.r ? ` rotate(${st.r.toFixed(3)}deg)` : '') + (st.k !== 1 ? ` scale(${st.k.toFixed(4)})` : ''));
    }

    /* ---- ambient motion, only where it can be seen ---- */
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;
    const heroOn = inView(0, heroH + 200);
    if (heroOn) {
      // the species: a new one every 3.45 s, everything that belongs to it crossfading in 0.45 s
      const f = amb / SP_PER + SP_AT, n = Math.floor(f), u = f - n;
      const cur = n % 3, prev = (n + 2) % 3, w = smooth(u, 0, 0.13);
      for (const e of spEls) {
        const op = e.i === cur ? w : e.i === prev ? 1 - w : 0;
        const str = op.toFixed(3);
        if (e.last !== str) { e.el.style.opacity = str; e.last = str; }
      }
      // the samples change places, the new species' board rising to the top slot
      const mv = ease(smooth(u, 0, 0.3));
      for (const sm of samples) {
        const to = SLOTS[SP_SLOTS[cur][sm.name]], from = SLOTS[SP_SLOTS[prev][sm.name]];
        const x = from[0] + (to[0] - from[0]) * mv, y = from[1] + (to[1] - from[1]) * mv;
        const moving = from !== to ? Math.sin(Math.PI * mv) : 0;
        setT(sm, sm.el, `translate3d(${x.toFixed(2)}px, ${(y - 6 * moving).toFixed(2)}px, 0) scale(${(1 + 0.05 * moving).toFixed(4)})`);
        const z = SP_SLOTS[cur][sm.name] === 'T' ? '3' : SP_SLOTS[cur][sm.name] === 'R' ? '2' : '1';
        if (sm.z !== z) { sm.el.style.zIndex = z; sm.z = z; }
      }
      for (const bb of bobs) setT(bb, bb.el, `translate3d(0, ${(3.5 * Math.sin(amb * BOB_W + bb.ph)).toFixed(2)}px, 0)`);
      for (const sp of spin) setT(sp, sp.el, `rotate(${((amb * SPIN_W) % 360).toFixed(1)}deg)`);
      for (const pl of plant) setT(pl, pl.el, `rotate(${(0.9 * Math.sin(amb * PLANT_W[0]) + 0.35 * Math.sin(amb * PLANT_W[1] + 1)).toFixed(3)}deg) scale(${(1 + 0.005 * Math.sin(amb * PLANT_W[2])).toFixed(4)})`);
    }
    const ip = pins.find((p) => p.name === 'ipad');
    if (ip && inView(0, IPAD.fy + 600)) {
      const p = ip.st.p || 0;
      const e1 = smooth(p, 0.45, 0.95), e2 = smooth(p, 0.6, 1);
      const dStr = e1.toFixed(3) + e2.toFixed(3);
      if (dStr !== dash.last) {
        dash.last = dStr;
        dash.side.style.transform = `translate3d(${(-138 * (1 - e1)).toFixed(2)}px, 0, 0)`;
        dash.top.style.transform = `translate3d(0, ${(-185 * (1 - e1)).toFixed(2)}px, 0)`;
        dash.leg.style.opacity = e2.toFixed(3);
        dash.leg.style.transform = `translate3d(0, ${(12 * (1 - e2)).toFixed(2)}px, 0)`;
      }
      // the globe's routes: two stills of the live globe, crossfading
      const gb = clamp(0.5 - 1.4 * Math.cos(amb * GLOBE_W), 0, 1).toFixed(3);
      if (globeB._op !== gb) { globeB.style.opacity = gb; globeB._op = gb; }
      // the dashboard's product tabs take turns
      const f = amb / TAB_PER + TAB_AT, n = Math.floor(f), w = smooth(f - n, 0, 0.14), cur = n % 3, prev = (n + 2) % 3;
      for (const t of tabs) {
        const op = (t.i === cur ? w : t.i === prev ? 1 - w : 0).toFixed(3);
        if (t.last !== op) { t.el.style.opacity = op; t.last = op; }
      }
    }
    if (inView(maxScroll, 1e9)) {
      const fs = (0.3 * clamp((maxScroll - scroll) / 600, 0, 1)).toFixed(3);
      if (footShade._op !== fs) { footShade.style.opacity = fs; footShade._op = fs; }
    }
    if (inView(beltTop - 40, beltBottom + 40)) {
      setT(beltCache, belt, `translate3d(${(-((741 + amb * 30) % BELT_LOOP)).toFixed(2)}px, 0, 0)`);
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
      let u2 = L.kind === 'card' ? 1 : s, xView = L.cx, yView = 0, rot = 0;
      if (L.kind === 'page') {
        let cx = L.cx, cy = L.cy, hk = 1;
        if (L.pin) {
          const st = L.pin.st, dx = cx - L.pin.cx, dy = cy - L.pin.cy;
          const cr = Math.cos(st.r * Math.PI / 180), sr = Math.sin(st.r * Math.PI / 180);
          cx = L.pin.cx + st.k * (dx * cr - dy * sr) + st.x;
          cy = L.pin.cy + st.k * (dx * sr + dy * cr) + st.y;
          u2 = s * st.k; hk = st.k; rot = st.r;
        }
        xView = cx; yView = cy - scroll;
        // far off the window: leave it be until it comes back into view
        if (yView + L.h * hk / 2 < -margin || yView - L.h * hk / 2 > VH + margin) { L.A = null; continue; }
      }
      const Q = L.kind === 'card' ? { x: L.cx - cardW / 2, y: L.cy - cardH / 2 }
        : { x: (xView - DW / 2) * s, y: ((L.kind === 'page' ? yView : L.cy) - VH / 2) * s };
      const project = (d, extra) => {
        const z = d * Zsep * hc;
        const t = E.z / Math.max(E.z * 0.25, E.z - z);
        return { Q, z, t, o: { x: (t - 1) * (spread * Q.x - par * E.x) + extra.x, y: (t - 1) * (spread * Q.y - par * E.y) + extra.y } };
      };
      L.A = project(L.d, { x: 0, y: 0 });
      const cr = Math.cos(-rot * Math.PI / 180), sr = Math.sin(-rot * Math.PI / 180);
      const write = (el, A, cache) => {
        let o = A.o, sc = A.t;
        const Pp = L.parent && L.parent.A;
        if (Pp) {
          o = { x: (A.Q.x - Pp.Q.x) * (1 / Pp.t - 1) + (A.o.x - Pp.o.x) / Pp.t, y: (A.Q.y - Pp.Q.y) * (1 / Pp.t - 1) + (A.o.y - Pp.o.y) / Pp.t };
          sc = A.t / Pp.t;
        }
        // into the layer's own axes: undo the page scale, and the pin's scale and turn
        const lx = (o.x * cr - o.y * sr) / u2, ly = (o.x * sr + o.y * cr) / u2;
        const str = quiet ? '' : `translate3d(${lx.toFixed(2)}px, ${ly.toFixed(2)}px, 0) scale(${sc.toFixed(5)})`;
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
      winShadow.style.opacity = (0.4 + 0.3 * h01 * shadowK).toFixed(3);
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
    // full bleed in a tile, the ruler's ink follows the section under the reading mark
    const yr = scroll + VH / 2;
    let tone = 'on-dark';
    for (const t of tones) if (yr >= t.y0 && yr < t.y1) tone = t.dark ? 'on-dark' : 'on-light';
    if (tone !== lastTone) { notchesIn.classList.remove('on-dark', 'on-light'); notchesIn.classList.add(tone); lastTone = tone; }
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
    const dy = e.clientY - down.y, dx = e.clientX - down.x;
    if (!dragging && (down.type !== 'touch' || TOUCH_DRAG) && Math.hypot(dx, dy) >= CLICK) {
      dragging = true; mode = 'manual'; bridge = null; coast = 0;
      persp.classList.add('is-dragging');
      down.x = down.px = e.clientX; down.y = down.py = e.clientY; down.samples = [];
    }
    if (dragging) {
      /* Both axes scroll the page. Up and down it sticks to the pointer, as on a phone (drag up,
         the page goes down); sideways it scrubs, drag right to go further down the page, about
         2.5 px of page per px. Whichever way the drag has moved more since it began wins, and
         each move is applied as a step, so changing axis mid-drag never jumps. */
      const sx = e.clientX - down.px, sy = e.clientY - down.py;
      down.px = e.clientX; down.py = e.clientY;
      const sideways = Math.abs(e.clientX - down.x) > Math.abs(e.clientY - down.y);
      scroll = clamp(scroll + (sideways ? sx * V['drag.scrub'] : -sy) * designPerScreen(), 0, maxScroll);
      const now = performance.now();
      down.samples.push([now, scroll]);
      while (down.samples.length > 2 && now - down.samples[0][0] > 90) down.samples.shift();
    }
  });
  persp.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, scroll, samples: [] };
    if (e.pointerType !== 'touch' || TOUCH_DRAG) {
      try { persp.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: fine */ }
    }
    if (e.pointerType === 'touch' && TOUCH_DRAG) { touchOn = true; setPointer(e); }
    if (mode === 'manual' && Math.abs(coast) > 4) { coast = 0; idle = 0; } // a press catches a flick, like a phone
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

  // the tour's own clock: the tour and the ambient motion, both at t seconds into a tour
  function seekTime(t) {
    t = ((t % TOUR) + TOUR) % TOUR;
    mode = 'tour'; bridge = null; phase = t; amb = t;
    scroll = tourAt(phase);
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
  reduced.addEventListener('change', () => { if (reduced.matches) seekTime(0); });

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
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    get ambient() { return amb; }, set ambient(t) { amb = t; }, get designPerScreen() { return designPerScreen(); },
    // the tour's length in seconds (the site records one tour as the tile's resting loop)
    get period() { return TOUR; },
    seek: seekTime,
    // for the verify script only: the miniature alone at 1:1, to lay over a capture of the live site
    flat(on) {
      flat = !!on;
      if (flat) { document.body.appendChild(vp); Object.assign(vp.style, { position: 'fixed', left: '0px', top: '0px', zIndex: 99 }); stage.style.visibility = 'hidden'; }
      layout();
    },
  };
  window.cambiumCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
