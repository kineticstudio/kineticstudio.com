/* Baseten work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, 20.2 s round, never paused by
     hover; a drag (either axis) takes over, coasts, and the tour picks up from
     the next stop down from where it was let go
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, one round bloom of light under the pointer
   - the page: Baseten's own scroll choreography (the header held at the top,
     the hero sinking under the next section, its app screen rising while the
     notebook and flow cards turn straight over the first fifth of the page,
     the Serve cards' parallax, the fade-and-rise reveals) and its ambient
     motion (the Serve, Integrate,
     Design, Ship marquee and the strip of quote cards sliding left, the
     playhead's slow pulse)

   The embed contract (?embed=1, &bleed=N, &radius=N, &touchdrag=1, the
   ks-card pause message and the ks-card-open click) is the same as the other
   cards. window.basetenCard is the handle the page's dials and the verify
   script use. */
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
  const easeOut3 = (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t) * (1 - t); };

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = $$('.ruler-in .ticks');
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // Baseten's design width
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left
  const HEAD = 88;                       // the sticky header's bottom edge (16px off the top, 72px tall)
  const HERO_RUN = 0.2008;               // the hero's choreography runs over the first fifth of the page's scroll
  const HERO_SINK = 500;                 // over which the hero section sinks 500px (the next section rises over it)
  const MARQUEE = { w: 1395.5, speed: 22, at: 90 };       // the Serve marquee: one set's width, px/s, offset at load
  const QUOTES = { w: 1843.2, speed: 24.6, at: 118 };     // the quote strip, the same
  const PULSE = 5.8;                     // the playhead breathes from 1 to 1.15 and back every 5.8 s

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.62, 'light.bloomSize': 1.3, 'light.rim': 0.42, 'light.shadow': 0.7,
    'motion.tourSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.friction': 0.32, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.1,
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': '#009b5c', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };

  /* ================= the quote strip, two sets of the site's four cards ================= */
  const IMG = 'baseten-card-src/img/';
  const CARDS = [
    { av: 'daniel', logo: 'sil', lw: 29, lh: 33, q: '“Baseten provides us with all of the speed and control of self-serving our model deployment, without any of the annoying config, infra, and health checks.” ', who: 'Daniel Whitenack<br>Data Scientist at SIL' },
    { av: 'ryan', logo: 'primer', lw: 88, lh: 30, q: '“Baseten allows us to take any need that we have and build a custom SaaS solution for that very specific use case, it’s amazing.”', who: 'Ryan Delk<br>CEO &amp; Co-Founder at Primer' },
    { av: 'faaez', logo: 'pipe', lw: 87, lh: 24, q: '“Baseten provides an easy way for us to host our models, iterate on them, and experiment without worrying about any of the DevOps involved.”', who: 'Faaez Ul Haq<br>Head of Data Science at Pipe' },
    { av: 'andre', logo: 'patreon', lw: 129, lh: 19, q: '"The Baseten ecosystem, which combines the ability to write Python objects to connect my database to draggable UI components without worrying about JavaScript, hits the sweet spot for me as a generalist Data Scientist.”', who: 'Andre Bach<br>Staff Data Scientist at Patreon' },
  ];
  $('#tmStrip').innerHTML = [...CARDS, ...CARDS].map((c, i) =>
    `<div class="tc" style="left:${(14.4 + i * 460.8).toFixed(1)}px"><img class="av" src="${IMG}${c.av}.webp" alt=""><img class="lg" src="${IMG}${c.logo}.svg" alt="" style="width:${c.lw}px;height:${c.lh}px"><p>${c.q}</p><p class="who">${c.who}</p></div>`).join('');

  /* ================= shadow twins ================= */
  // data-shadow="surface,alpha,blur[,box]": box twins are a bare copy of the element (its own shape), the rest a full copy
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur, box] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(!box);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-pin', 'data-rv', 'data-hero', 'data-par', 'id']) n.removeAttribute(a);
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
      cx: 0, cy: 0, h: 0, A: null, last: '', fade: 1,
      dx: 0, dy: 0, rot: 0, rdy: 0, // the site's own motion on top of the projection: choreography and reveal
    };
  });
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const winLayer = layers[0];
  const layerOf = (el) => layers.find((L) => L.el === el) || null;
  const pins = $$('[data-pin]').map((el) => ({ el, name: el.dataset.pin, last: '' }));
  const pinY = { nav: 0, hero: 0 };
  const tones = $$('[data-tone]').map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= the site's own moving parts ================= */
  // the hero: at the top of the page the notebook and flow cards sit turned and raised; over the first fifth
  // of the page's scroll they turn straight and settle as the app screen rises 72px (the site's scroll keyframes)
  const HERO = {
    screen: { x: 0, y: 0, r: 0, ey: -72.135 },
    flow: { x: 42.75, y: -107.644, r: 6 },
    m1: { x: -90, y: -40.678, r: 7 },
    m2: { x: -45, y: -30.509, r: -5 },
  };
  const hero = $$('[data-hero]').map((el) => ({ L: layerOf(el), k: HERO[el.dataset.hero] }));
  // the Serve cards drift at their own pace while the feature passes through the window
  const PAR = { code: [9.666, -9.666], model: [107.256, -107.241], response: [-31.327, 15.66] };
  const pars = $$('[data-par]').map((el) => ({ L: layerOf(el), k: PAR[el.dataset.par] }));
  const serve = { top: 0, h: 640 };
  // the marquee and the quote strip (the marquee's shadow twin slides with it)
  const mqStrips = $$('.mq-strip').map((el) => ({ el, last: '' }));
  const tmStrip = { el: $('#tmStrip'), last: '' };
  // the playhead, breathing
  const pulses = $$('[data-pulse]').map((el) => ({ el, last: '' }));
  // the site's fade-and-rise: up 15% of its own height and in, as its top comes into the window; reset once below it again
  const revs = $$('[data-rv]').map((el) => ({ el, delay: 0.2 * (+el.dataset.rv || 0), layer: null, top: 0, h: 0, t: 0, last: '', op: '' }));
  for (const r of revs) r.layer = layerOf(r.el);

  /* ================= state ================= */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, maxScroll = 6686, framed = false;
  let heroTop = 0, withTop = 1088, featTop = 2196.8, usesTop = 4687.7, testiTop = 5684.5, preTop = 6530.8, footTop = 7042.8;
  let stops = [0, 0, 0, 0, 0, 0, 0, 0, 0];
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
    const top = (sel) => { const el = $(sel); return posIn(el, page)[1] - el.offsetHeight / 2; };
    heroTop = top('#s-hero'); withTop = top('#s-with'); featTop = top('#s-feat'); usesTop = top('#s-uses');
    testiTop = top('#s-testi'); preTop = top('#s-pre'); footTop = top('#s-foot');
    serve.top = featTop + 225.2;
    for (const r of revs) { r.h = r.el.offsetHeight; r.top = posIn(r.el, page)[1] - r.h / 2; r.last = r.op = '_'; }
    for (const m of [...mqStrips, tmStrip, ...pulses]) m.last = '_';
    maxScroll = Math.max(0, page.offsetHeight - VH);
    // a block in the window: centred in what the header leaves, or, when it is taller, its top just under the header
    const show = (y0, y1) => (y1 - y0 <= VH - HEAD - 40 ? (y0 + y1) / 2 - HEAD - (VH - HEAD) / 2 : y0 - HEAD - 8);
    stops = [
      0,                                              // the hero, its cards turned
      show(withTop + 96, withTop + 1012.8),           // Less hoop jumping, without and with
      show(featTop + 32, featTop + 801.7),            // the marquee and Serve
      show(featTop + 929.2, featTop + 1499.8),        // Integrate
      show(featTop + 1627.8, featTop + 2395),         // Design
      show(usesTop + 96, usesTop + 900.8),            // Ship apps, drive outcomes
      show(testiTop + 96, testiTop + 782.3),          // the customers
      show(preTop, preTop + 512),                     // No more abandoned models
      maxScroll,                                      // the footer
    ].map((y) => clamp(Math.round(y), 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    lastScrollStr = lastTicks = lastTone = '_';
    for (const p of pins) p.last = '_';
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; 20.2 s round
    [2.4, 0.95], [1.4, 0.8], [1.5, 0.75], [1.2, 0.75], [1.3, 0.8], [1.3, 0.75], [1.4, 0.7], [1.0, 0.6], [0.9, 1.7],
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

    /* ---- the page: scroll and Baseten's own choreography ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    pinY.nav = scroll; // the header is sticky: it never leaves the top of the window
    const heroLeft = 1 - clamp(scroll / Math.max(1, HERO_RUN * maxScroll), 0, 1);
    pinY.hero = HERO_SINK * (1 - heroLeft);
    for (const p of pins) setT(p, p.el, `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)`);
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;

    // the hero's cards: turned and raised at the top, straight and settled a fifth of the way down the page
    {
      const left = heroLeft;
      for (const H of hero) {
        if (!H.L) continue;
        const k = H.k;
        H.L.dx = k.x * left; H.L.dy = k.ey !== undefined ? k.ey * (1 - left) : k.y * left; H.L.rot = k.r * left;
      }
    }
    // the Serve cards' parallax, while their feature is in the window
    {
      const q = clamp((scroll - (serve.top - VH)) / (VH + serve.h), 0, 1);
      for (const P of pars) if (P.L) P.L.dy = P.k[0] + (P.k[1] - P.k[0]) * q;
    }
    // the marquee and the quote strip slide left on their own clock
    if (inView(featTop, featTop + 200)) {
      const x = -((MARQUEE.at + MARQUEE.speed * ambT) % MARQUEE.w);
      for (const m of mqStrips) setT(m, m.el, `translate3d(${x.toFixed(2)}px, 0, 0)`);
    }
    if (inView(testiTop + 480, testiTop + 790)) {
      const x = -((QUOTES.at + QUOTES.speed * ambT) % QUOTES.w);
      setT(tmStrip, tmStrip.el, `translate3d(${x.toFixed(2)}px, 0, 0)`);
    }
    // the playhead breathes
    if (inView(600, 1100 + pinY.hero)) {
      const sc = still ? 1.075 : 1.075 + 0.075 * Math.cos(2 * Math.PI * (ambT + 0.5) / PULSE);
      for (const p of pulses) setT(p, p.el, `scale(${sc.toFixed(4)})`);
    }
    // the site's fade-and-rise: 0.6 s in, ease out, as its top comes into the window
    for (const r of revs) {
      const off = Math.min(0.15 * r.h, 120), yTop = r.top - scroll + off; // where it waits, lowered by its rise
      if (still) r.t = 9;
      else if (yTop < VH) r.t += dt;
      else if (yTop > VH + 40) r.t = 0;
      const p = still ? 1 : easeOut3((r.t - r.delay) / 0.6);
      const rdy = (1 - p) * off;
      setO(r, r.el, p);
      if (r.layer) { r.layer.fade = p; r.layer.rdy = rdy; }
      else setT(r, r.el, rdy > 0.001 ? `translate3d(0, ${rdy.toFixed(2)}px, 0)` : '');
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
      const ox = L.dx, oy = L.dy + L.rdy, rot = L.rot;
      const own = Math.abs(ox) > 0.001 || Math.abs(oy) > 0.001 || Math.abs(rot) > 0.0001;
      const write = (el, A, cache) => {
        let o = A.o, sc = A.t;
        const Pp = L.parent && L.parent.A;
        if (Pp) {
          o = { x: (A.Q.x - Pp.Q.x) * (1 / Pp.t - 1) + (A.o.x - Pp.o.x) / Pp.t, y: (A.Q.y - Pp.Q.y) * (1 / Pp.t - 1) + (A.o.y - Pp.o.y) / Pp.t };
          sc = A.t / Pp.t;
        }
        const str = quiet && !own ? '' :
          `translate3d(${(o.x / u2 + ox).toFixed(2)}px, ${(o.y / u2 + oy).toFixed(2)}px, 0) scale(${sc.toFixed(5)})` +
          (Math.abs(rot) > 0.0001 ? ` rotate(${rot.toFixed(3)}deg)` : '');
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
  window.basetenCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
