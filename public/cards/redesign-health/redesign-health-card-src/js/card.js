/* Redesign Health work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, 20.2 s round, never paused by
     hover; a drag (either axis) takes over, coasts, and the tour picks up from
     the next stop down from where it was let go
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, one round bloom of light under the pointer
   - the page: the site's own moving parts (the nav fixed in its black fade,
     the prism film as six of its own stills cross-fading and drifting, the
     step in view turning to the italic heart pink, the companies sliding in
     from their own sides as they come into view)

   window.redesignCard is the handle the page's dials and the verify script use. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const EMBED = qs.has('embed') && qs.get('embed') !== '0';
  document.documentElement.classList.toggle('is-embed', EMBED);
  const BLEED = EMBED ? Math.max(0, parseFloat(qs.get('bleed')) || 0) : 0; // px of frame overhanging the tile
  const RADIUS = EMBED ? Math.max(0, parseFloat(qs.get('radius')) || 0) : 6; // the card's corners, CSS px
  const TOUCH_DRAG = !EMBED || qs.get('touchdrag') === '1';               // in a tile, a swipe scrolls the site
  const CLICK = 6;                                                        // px: less is a click, more a drag

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = $$('.ruler-in .ticks');
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
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
    'light.bloom': 0.62, 'light.bloomSize': 1.3, 'light.rim': 0.42, 'light.shadow': 0.7,
    'motion.tourSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.friction': 0.32, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.1,
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': '#b9f94e', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };

  /* ================= shadow twins ================= */
  // data-shadow="surface,alpha,blur[,box]": box twins are a bare copy of the element (its own shape), the rest a full copy
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur, box] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(!box);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-pin', 'data-slide', 'data-step', 'data-dir', 'id']) n.removeAttribute(a);
    tw.classList.add('twin');
    if (box) tw.classList.add('box');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }

  /* ================= layers ================= */
  const layers = $$('[data-depth]').map((el) => {
    const pinEl = el.closest('[data-pin]');
    return {
      el, d: +el.dataset.depth, kind: el === win ? 'card' : 'page',
      pin: pinEl ? pinEl.dataset.pin : null, twin: el._twin || null, parent: null,
      cx: 0, cy: 0, h: 0, A: null, last: '', fade: 1, dy: 0, op: '',
    };
  });
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const winLayer = layers[0];
  const pins = $$('[data-pin]').map((el) => ({ el, name: el.dataset.pin, last: '' }));
  const pinY = { nav: 0 };
  const tones = $$('[data-tone]').map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= the site's own moving parts ================= */
  // the prism film: six stills from its own file, each in over the one before, the lot drifting slowly as the film does
  const prism = { name: 'prism', period: 1.5, fade: 0.55, offset: 0.9, els: $$('[data-slide="prism"]').map((el) => ({ el, op: '', last: '' })), y0: 0, y1: 790 };
  // Ideate, Build, Scale: the step in view takes the site's italic heart pink (the archive keeps the first one so)
  // (its shadow twin turns with it, so the shadow always has the word's own shape)
  const steps = $$('[data-step]').map((el) => ({
    el, up: [$('.up', el), $('.up', el._twin.el)], it: [$('.it', el), $('.it', el._twin.el)],
    top: 0, a: +el.dataset.step === 0 ? 1 : 0, uo: '', io: '',
  }));
  // the companies: each slides in from its own side (40px, 1 s) once it is in the window, and resets below it
  const cos = $$('.co').map((el) => ({ el, dir: +el.dataset.dir || 1, top: 0, h: 0, t: 0, last: '', op: '' }));

  /* ================= state ================= */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, maxScroll = 6938, framed = false;
  let modelTop = 1580, cosTop = 3437, shapeTop = 6215, headTop = 495, btnBottom = 1291;
  let stops = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, ambT = 0, clock = 0, tone = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', lastTicks = '', lastTone = '', liftNow = 1;

  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  function layout() {
    const [aw, ah] = String(V['card.aspect']).split(':').map(Number);
    stage.style.setProperty('--size', V['card.cardSize']);
    stage.style.setProperty('--ar', (aw / ah) || 1.6);
    framed = MAT > 0 || (!EMBED && !!V['card.frame']);
    card.classList.toggle('is-framed', framed);
    card.classList.toggle('ruler-inside', framed || EMBED);
    slot.classList.toggle('is-bleed', !framed && !EMBED);
    slot.classList.toggle('no-ruler', !V['card.ruler']);
    card.style.setProperty('--frame-color', V['card.frameColor']);
    card.style.setProperty('--r', RADIUS + 'px');
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
    card.style.setProperty('--bloom-d', (cardW * V['light.bloomSize']) + 'px');
    winLayer.d = framed ? 0.1 : 0;
    const winW = cardW - 2 * mx, winH = cardH - 2 * my;
    // the design viewport follows the frame's aspect; past a sane range it crops (cover), never letterboxes
    VH = Math.round(clamp(DW * winH / winW, 560, 1200));
    s = Math.max(winW / DW, winH / VH);
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.transform = `translate(${((winW - DW * s) / 2).toFixed(2)}px, ${((winH - VH * s) / 2).toFixed(2)}px) scale(${s})`;
    persp.style.perspective = (V['tilt.perspective'] * cw) + 'px';
    card.style.transform = `scale(${1 / K})`;

    for (const L of layers) {
      const root = L.kind === 'card' ? card : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.h = L.el.offsetHeight;
      L.last = '_';
      if (L.twin) L.twin.last = '_';
    }
    for (const t of tones) { t.y0 = posIn(t.el, page)[1] - t.el.offsetHeight / 2; t.y1 = t.y0 + t.el.offsetHeight; }
    const top = (el) => posIn(el, page)[1] - el.offsetHeight / 2;
    modelTop = top($('#s-model')); cosTop = top($('#s-cos')); shapeTop = top($('#s-shape'));
    headTop = top($('.h-head')); btnBottom = top($('.h-btn')) + $('.h-btn').offsetHeight;
    for (const st of steps) { st.top = top(st.el); st.uo = st.io = '_'; }
    for (const c of cos) { c.top = top(c.el); c.h = c.el.offsetHeight; c.last = c.op = '_'; }
    for (const m of prism.els) m.last = m.op = '_';
    maxScroll = Math.max(0, page.offsetHeight - VH);
    const mid = (y0, y1) => (y0 + y1) / 2 - VH / 2; // the block centred in the window
    stops = [
      0,                                            // the hero, its prism film turning over
      mid(headTop - 65, btnBottom + 40),            // Health matters to absolutely everyone, over the spectrum
      mid(modelTop + 120, modelTop + 880),          // the Redesign Health model and Ideate
      mid(modelTop + 580, modelTop + 1480),         // Build, in italic
      mid(modelTop + 890, modelTop + 1790),         // and Scale, the italic passing down to it
      mid(cosTop, cosTop + 900),                    // Built at Redesign, Anomaly coming in
      mid(cosTop + 880, cosTop + 1780),             // Jasper and Ever/Body
      mid(cosTop + 1585, cosTop + 2485),            // Calibrate
      mid(shapeTop, shapeTop + 998),                // Shape the future of health
      maxScroll,                                    // the footer
    ].map((y) => clamp(Math.round(y), 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    lastScrollStr = lastTicks = lastTone = '_';
    for (const p of pins) p.last = '_';
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; 20.2 s round
    [2.8, 0.9], [1.3, 0.8], [1.2, 0.7], [0.9, 0.5], [1.2, 0.75], [1.1, 0.7], [0.9, 0.7], [0.8, 0.65], [1.3, 0.6], [0.8, 1.6],
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
    if (!still) ambT += dt;
    const k = V['motion.stiffness'], c = V['motion.damping'], tiltMax = V['tilt.tiltMax'];

    // what the hover wants
    const engaged = hovered || touchOn || touchLatch || dragging || V['debug.hold'] || still;
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
      // the bloom chases the pointer a touch behind it, so it reads as light, not a cursor
      const g = 1 - Math.exp(-dt / 0.07);
      glow.x += (nx - glow.x) * g; glow.y += (ny - glow.y) * g;
    }

    // the scroll: the tour, a drag and its coast, or the bridge back into the tour. Hover never stops it.
    const speed = V['motion.tourSpeed'];
    if (mode === 'tour') {
      // reduced motion: no tour, the hero held still (a drag can still look round)
      if (!still) { phase += dt * speed; scroll = tourAt(phase); }
    } else if (mode === 'manual') {
      if (!dragging) {
        if (Math.abs(coast) > 30 && !still) {
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
  function setO(o, el, v) { const str = v.toFixed(3); if (o.op !== str) { el.style.opacity = str; o.op = str; } }
  /* a slideshow at time t: the next still comes in over the one before it (on top in the page's own order,
     or the last one going out over the first), so it never dips through the ground behind them */
  function slides(sh, t) {
    const n = sh.els.length, tt = t + sh.offset;
    const kk = Math.floor(tt / sh.period), cur = ((kk % n) + n) % n, prev = (cur - 1 + n) % n;
    const x = ease((tt - kk * sh.period) / sh.fade);
    sh.els.forEach((m, j) => setO(m, m.el, cur > prev ? (j === cur ? x : j === prev ? 1 : 0) : (j === cur ? 1 : j === prev ? 1 - x : 0)));
  }

  function render(dt, still) {
    const rx = spr.rx.x, ry = spr.ry.x;
    const hc = clamp(spr.h.x, -0.2, 1.2), h01 = clamp(spr.h.x, 0, 1);
    const depth = V['layers.depth'], par = V['layers.parallax'], spread = V['layers.spread'];
    const tiltMax = V['tilt.tiltMax'], shadowK = V['light.shadow'];
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

    /* ---- the page: scroll and the site's own moving parts ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    pinY.nav = scroll; // the nav is fixed at the window's top
    for (const p of pins) setT(p, p.el, `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)`);
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;

    // the prism film: the stills turn over, and drift and breathe a little as the film's mirrors do
    if (inView(prism.y0, prism.y1)) {
      slides(prism, still ? 0 : ambT);
      const t = still ? 0 : ambT;
      const str = `translate3d(${(14 * Math.sin(t * 0.42)).toFixed(2)}px, ${(6 * Math.sin(t * 0.31 + 0.8)).toFixed(2)}px, 0) scale(${(1.045 + 0.025 * Math.sin(t * 0.6)).toFixed(4)})`;
      for (const m of prism.els) if (m.op !== '0.000') setT(m, m.el, str);
    }
    // Ideate, Build, Scale: the last word whose top has passed 58% of the window is the one in italic pink
    if (inView(modelTop, modelTop + 1857)) {
      let on = 0;
      steps.forEach((st, i) => { if (st.top - scroll < VH * 0.58) on = i; });
      const g = still ? 1 : 1 - Math.exp(-dt / 0.14);
      steps.forEach((st, i) => {
        st.a += ((i === on ? 1 : 0) - st.a) * g;
        const io = st.a.toFixed(3), uo = (1 - st.a).toFixed(3);
        if (st.io !== io) { for (const e of st.it) e.style.opacity = io; st.io = io; }
        if (st.uo !== uo) { for (const e of st.up) e.style.opacity = uo; st.uo = uo; }
      });
    }
    // the companies slide in from their own side over a second once their top is in the window, and reset below it
    for (const co of cos) {
      const yv = co.top - scroll;
      if (still) co.t = 9;
      else if (yv < 0.85 * VH) co.t += dt;
      else if (yv > VH) co.t = 0;
      if (!inView(co.top - 200, co.top + co.h + 200)) continue;
      const p = still ? 1 : easeOut(co.t / 1);
      setO(co, co.el, p);
      setT(co, co.el, p > 0.999 ? '' : `translate3d(${(co.dir * 40 * (1 - p)).toFixed(2)}px, 0, 0)`);
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
      const dy = L.dy;
      const write = (el, A, cache) => {
        let o = A.o, sc = A.t;
        const Pp = L.parent && L.parent.A;
        if (Pp) {
          o = { x: (A.Q.x - Pp.Q.x) * (1 / Pp.t - 1) + (A.o.x - Pp.o.x) / Pp.t, y: (A.Q.y - Pp.Q.y) * (1 / Pp.t - 1) + (A.o.y - Pp.o.y) / Pp.t };
          sc = A.t / Pp.t;
        }
        const str = quiet && dy < 0.001 ? '' : `translate3d(${(o.x / u2).toFixed(2)}px, ${(o.y / u2 + dy).toFixed(2)}px, 0) scale(${sc.toFixed(5)})`;
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
        const op = (T.alpha * shadowK * h01 * L.fade).toFixed(3);
        if (op !== T.op) { T.el.style.opacity = op; T.op = op; }
      }
    }

    // the framed window's own shadow on the card ground
    if (framed && winLayer.A) {
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
    const ex = tiltMax ? ry / tiltMax : 0, ey = tiltMax ? -rx / tiltMax : 0;
    cshadow.style.transform = `translate3d(${(-ex * 0.035 * cw).toFixed(1)}px, ${((0.03 + 0.035 * h01 - ey * 0.02) * cw).toFixed(1)}px, 0) scale(${(0.96 + 0.06 * h01).toFixed(3)})`;
    // embedded, the card sits exactly on its tile at rest: its shadow only shows once it lifts
    cshadow.style.opacity = ((EMBED ? 0.36 * h01 : 0.18 + 0.42 * h01) * (0.4 + shadowK)).toFixed(3);

    // the ruler: its notches slide with the page as it moves on screen, the reading mark stays put
    const tk = scroll.toFixed(1);
    if (tk !== lastTicks) {
      lastTicks = tk;
      const offIn = (scroll * s) % (6 * K);
      for (const el of ticksIn) el.style.transform = `translate3d(0, ${(-offIn).toFixed(2)}px, 0)`;
      ticksOut.style.transform = `translate3d(0, ${(-((scroll * s * lift / K) % 6)).toFixed(2)}px, 0)`;
    }
    // inside the card its ink follows what is under it: the section under the mark, or the frame's ground
    let dark = 0;
    if (framed) dark = luminance(V['card.frameColor']) < 0.35 ? 1 : 0;
    else if (EMBED) { const yr = scroll + VH / 2; for (const t of tones) if (yr >= t.y0 && yr < t.y1) dark = t.dark ? 1 : 0; }
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
  /* Drag either way. Up and down is a phone (drag up, page down, 1:1); left and right
     scrubs (drag right, further down the page) at drag.scrub page px per px. The axis
     that moves more takes the drag; if the hand turns and the other axis clearly
     takes over, the drag hands across from where it is, so the page never jumps. */
  function dragTo(e) {
    const dx = e.clientX - down.ax, dy = e.clientY - down.ay;
    if (down.axis === 'y' && Math.abs(dx) > 2 * Math.abs(dy) + 24) { down.axis = 'x'; rebase(e); return; }
    if (down.axis === 'x' && Math.abs(dy) > 2 * Math.abs(dx) + 24) { down.axis = 'y'; rebase(e); return; }
    const delta = down.axis === 'x' ? dx * V['drag.scrub'] : -dy;
    scroll = clamp(down.scroll + delta * designPerScreen(), 0, maxScroll);
  }
  function rebase(e) { down.ax = e.clientX; down.ay = e.clientY; down.scroll = scroll; }
  persp.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { hovered = true; setPointer(e); } });
  persp.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch' && !down) { hovered = false; pointerLive = false; }
  });
  persp.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || (down && down.id === e.pointerId && TOUCH_DRAG)) setPointer(e);
    if (e.pointerType !== 'touch') hovered = true;
    if (!down || down.id !== e.pointerId) return;
    const dx = e.clientX - down.x0, dy = e.clientY - down.y0;
    if (!dragging && (down.type !== 'touch' || TOUCH_DRAG) && Math.hypot(dx, dy) >= CLICK) {
      dragging = true; mode = 'manual'; bridge = null; coast = 0;
      persp.classList.add('is-dragging');
      down.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      rebase(e); down.samples = [];
    }
    if (dragging) {
      dragTo(e);
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
    if (mode === 'manual' && Math.abs(coast) > 30) { coast = 0; idle = 0; } // a press catches a flick, like a phone
    if (e.pointerType !== 'touch') e.preventDefault(); // no text selection, no image ghost
  });
  function release(e, cancelled) {
    if (!down || down.id !== e.pointerId) return;
    if (dragging) {
      const sm = down.samples;
      if (sm.length >= 2 && !reduced.matches) {
        const [t0, y0] = sm[0], [t1, y1] = sm[sm.length - 1];
        const v = (t1 - t0) > 8 ? (y1 - y0) / ((t1 - t0) / 1000) : 0;
        // a hand lifted after a pause does not fling
        coast = performance.now() - t1 > 60 ? 0 : clamp(v * V['drag.momentum'], -12000, 12000);
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
    if (window.parent === window || e.source !== window.parent) return;
    const d = e.data;
    if (d && d.type === 'ks-card' && typeof d.visible === 'boolean') { parentVisible = d.visible; sync(); }
  });
  reduced.addEventListener('change', () => { if (reduced.matches) { scroll = 0; mode = 'tour'; phase = 0; bridge = null; } });

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
    get stops() { return stops.slice(); }, get tour() { return TOUR; }, get holds() { return holdAt.slice(); }, get VH() { return VH; }, get maxScroll() { return maxScroll; },
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    get ambient() { return ambT; }, set ambient(t) { ambT = +t || 0; },
    seek(t) { mode = 'tour'; bridge = null; phase = +t || 0; ambT = phase; },
    at(i) { mode = 'tour'; bridge = null; phase = holdAt[clamp(i | 0, 0, LEGS.length - 1)] + 0.01; ambT = phase; },
  };
  window.redesignCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
