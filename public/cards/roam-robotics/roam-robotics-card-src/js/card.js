/* Roam Robotics work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, 20.25 s round, never paused by
     hover; a drag (either axis) takes over, coasts, and the tour picks up from
     the next stop down from where it was let go
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, one round bloom of light under the pointer
   - the page: Roam's own scroll choreography (the nav sliding away on the
     way down and back on the way up, the Forge sticky over the hero,
     Protecting and Do More while it turns from 20 to -22 degrees, the photos
     drifting at their own pace, the film held still behind its window, the
     site's fade-and-rise reveals, the knee render turning in) and its
     ambient motion (the cycling headers, the marching dashed rules, the
     photo carousel and the three films, as stills from their own files)

   It is a function of one clock, the tour's: the rules and the slideshows
   turn over a whole number of times in one tour, and what can't (the
   headers' beat, the Protecting carousel's tuned turn) reads the tour's
   clock, so a recording of one tour closes on itself, and the site's
   resting loop hands over to the live card on hover ({type: "ks-card", at},
   the loop's time) on exactly the frame it showed.

   window.roamCard is the handle the page's dials and the verify script use. */
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
  const easeIn = (t) => { t = clamp(t, 0, 1); return t * t; };            // the site's power1.in
  const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); }; // and power1.out
  const mod = (a, n) => ((a % n) + n) % n;

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = $$('.ruler-in .ticks');
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // Roam's design width
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left
  const NAV = 96;                        // the site's nav height at 1440
  const FORGE = { top: 103.2, h: 616.3, end: 96 + (DW - 48) * 1.45 + 48 }; // sticky top, height, the bottom of its track
  const BEAT = 4.5, SWAP = 0.667;        // the cycling headers: a new word every 4.5 s, out and in over 0.667 s each

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.62, 'light.bloomSize': 1.3, 'light.rim': 0.42, 'light.shadow': 0.7,
    'motion.tourSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.friction': 0.32, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.1,
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': '#e91404', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };

  /* ================= small marks, inline (nothing is fetched) ================= */
  const ICON = {
    play: '<svg viewBox="0 0 10 11" fill="#fff"><path d="M0 0.6v9.8l9.2-4.9z"/></svg>',
  };
  for (const el of $$('[data-icon]')) el.innerHTML = ICON[el.dataset.icon] || '';

  /* ================= shadow twins ================= */
  // data-shadow="surface,alpha,blur[,box]": box twins are a bare copy of the element (its own shape), the rest a full copy
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur, box] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(!box);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-pin', 'data-rv', 'data-slide', 'data-par', 'data-turn', 'id']) n.removeAttribute(a);
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
  const pinY = { nav: 0, forge: 0, video: 0 };
  const tones = $$('[data-tone]').map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= the site's own moving parts ================= */
  // the cycling headers (the shadow twins' words turn with them)
  const heads = [
    { boxes: $$('.h-left'), side: 'left', at: 0.4, start: 1 },   // "Reinventing" first, then a new word every beat
    { boxes: $$('.h-right'), side: 'right', at: 2.65, start: 1 }, // "Human Possibilities", half a beat behind, as on the site
  ].map((h) => ({ ...h, words: h.boxes.map((b) => $$('.w', b).map((w) => ({ w, t: $('.t', w), wo: '', to: '', tt: '' }))) }));
  // On the site each word sits on a swatch of the panel's black that hides the dashed rule behind it. Here
  // that swatch is a gap cut in the rule itself (on the rule's own layer), so the word floats clear above it
  // and no edge of a swatch ever shows as the layers part.
  const hRule = $('.h-rule');
  for (const H of heads) H.gaps = H.words[0].map(() => { const g = document.createElement('i'); g.className = 'gap'; g.style.opacity = '0'; hRule.appendChild(g); return { el: g, wo: '' }; });
  function placeGaps() {
    const rx = hRule.offsetLeft, rw = hRule.offsetWidth;
    for (const H of heads) H.words[H.words.length - 1].forEach((wd, i) => {
      const slot = wd.w.offsetParent, w = wd.t.offsetWidth;
      const x0 = H.side === 'left' ? slot.offsetLeft - rx : slot.offsetLeft + slot.offsetWidth - w - 18 - rx;
      const x1 = H.side === 'left' ? slot.offsetLeft + w + 18 - rx : rw;
      Object.assign(H.gaps[i].el.style, { left: Math.max(0, x0) + 'px', width: Math.max(0, Math.min(rw, x1) - Math.max(0, x0)) + 'px' });
    });
  }
  // the marching dashed rules
  const dashes = $$('.rule .dash').map((el) => ({ el, y: 0, last: '' }));
  // slideshows: the photo carousel and the three films, as stills from their own files
  const shows = [
    { name: 'thumb', period: 2.3, fade: 0.45, offset: 1.6 },
    { name: 'prot', period: 3.375, fade: 0.5, offset: 2.55, stop: 1 }, // the site's 3.5 s, tuned so it turns over on every pass
    { name: 'film', period: 2.6, fade: 0.5, offset: 1.4 },
    { name: 'contact', period: 2.4, fade: 0.5, offset: 0.9 },
  ].map((s) => ({ ...s, els: $$(`[data-slide="${s.name}"]`).map((el) => ({ el, op: '' })), y0: 0, y1: 0 }));
  // the photos that drift at their own pace inside their frames
  const pars = $$('[data-par]').map((el) => ({ el, kind: el.dataset.par, frame: el.parentElement, top: 0, h: 0, ih: 0, last: '' }));
  // the site's fade-and-rise: in as its centre passes 90% of the window, reset once it is below the window again
  const revs = $$('[data-rv]').map((el) => ({ el, delay: 0.2 * (+el.dataset.rv || 0), layer: null, cy: 0, h: 0, t: 0, last: '', op: '' }));
  for (const r of revs) r.layer = layers.find((L) => L.el === r.el) || null;
  // the Forge turning with the scroll, the knee render turning in
  const forgeRots = $$('.forge-rot').map((el) => ({ el, last: '' }));
  const kneeRots = $$('.kside-rot').map((el) => ({ el, last: '' }));
  const kneeEl = $('.kside');
  const knee = { top: 0, h: 0, t: 0 };

  /* ================= state ================= */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, maxScroll = 6500, framed = false;
  let protTop = 840, moreTop = 1560, modTop = 2196, dualTop = 3087, threeTop = 3931, vidTop = 4540, misTop = 5464, conTop = 6424;
  let stops = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, prevScroll = 0, phase = 0, ambT = 0, clock = 0, tone = 0, navHide = 0, navWant = 0, started = false;
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
    protTop = top('#s-prot'); moreTop = top('#s-more'); modTop = top('#s-mod'); dualTop = top('#s-dual');
    threeTop = top('#s-three'); vidTop = top('#s-vid'); misTop = top('#s-mis'); conTop = top('#s-con');
    for (const d of dashes) { d.y = posIn(d.el, page)[1]; d.last = "_"; }
    placeGaps();
    for (const sh of shows) {
      const box = sh.els[0].el.parentElement;
      sh.y0 = posIn(box, page)[1] - box.offsetHeight / 2; sh.y1 = sh.y0 + box.offsetHeight;
      if (sh.name === 'film') { sh.y0 = vidTop; sh.y1 = vidTop + VH; }
    }
    for (const p of pars) { p.top = posIn(p.frame, page)[1] - p.frame.offsetHeight / 2; p.h = p.frame.offsetHeight; p.ih = p.el.offsetHeight; p.last = '_'; }
    for (const r of revs) { r.cy = posIn(r.el, page)[1]; r.h = r.el.offsetHeight; r.last = r.op = '_'; }
    knee.top = posIn(kneeEl, page)[1] - kneeEl.offsetHeight / 2; knee.h = kneeEl.offsetHeight;
    for (const k of [...forgeRots, ...kneeRots]) k.last = '_';
    maxScroll = Math.max(0, page.offsetHeight - VH);
    const mid = (y0, y1) => (y0 + y1) / 2 - VH / 2; // the block centred in the window
    stops = [
      0,                                            // the hero, its headers turning over
      mid(protTop, protTop + 720),                  // Protecting Those Going, the Forge riding over the carousel
      mid(moreTop, FORGE.end),                      // Do More, Go Farther, the Forge turned and still riding
      mid(modTop, modTop + 867.2),                  // A Modular System
      mid(dualTop, dualTop + 819.6),                // Dual-Use Technology
      mid(threeTop, threeTop + 561.5),              // the three components
      mid(vidTop, vidTop + VH + 24),                // Unlock Your Potential, through its window
      mid(misTop + 24, misTop + 912.3),             // Enhanced Mission Assurance
      mid(conTop + 24, conTop + 720),               // Contact us
      maxScroll,                                    // the footer
    ].map((y) => clamp(Math.round(y), 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    lastScrollStr = lastTicks = lastTone = '_';
    for (const p of pins) p.last = '_';
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; 20.25 s round, 4.5 header beats
    [2.95, 0.9], [1.2, 0.8], [1.1, 0.7], [1.2, 0.75], [0.9, 0.65], [0.9, 0.7], [1.1, 0.7], [1.0, 0.65], [0.9, 0.5], [0.8, 1.85],
  ];
  const TOUR = LEGS.reduce((a, [h, m]) => a + h + m, 0);
  const holdAt = LEGS.reduce((a, [h, m], i) => (a.push(i ? a[i - 1] + LEGS[i - 1][0] + LEGS[i - 1][1] : 0), a), []);
  // the middle of a stop's hold, and a time on the tour's clock read within half a tour of one: it runs straight
  // through that stop (and the loop's seam) and starts over half a tour away, where the tour is far from it
  const holdMid = (i) => holdAt[i] + LEGS[i][0] / 2;
  const near = (t, c) => t - TOUR * Math.round((t - c) / TOUR);
  // the carousel and the films turn over a whole number of times a tour (within a tenth of their own pace), and
  // the rules march a whole number of dashes; the Protecting carousel keeps its tuned turn on the tour's clock
  for (const sh of shows) if (sh.stop == null) sh.period = TOUR / (sh.els.length * Math.max(1, Math.round(TOUR / (sh.els.length * sh.period))));
  const DASH = 8 * Math.round(TOUR / 0.5) / TOUR; // px/s: the site's 8 px every half second, 41 dashes a tour
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
  /* the tour's own clock: the tile's resting loop is this tour recorded, so a hovered tile tells the card where
     the loop is and everything goes there: the tour, the headers, rules and slideshows, and what carries over
     from frame to frame (the nav, the reveals' and the knee's timers, the ruler's ink), which is replayed over
     the tour before it at 60 fps, to land it as one whole tour on would have it */
  function seekTime(t) {
    t = ((t % TOUR) + TOUR) % TOUR;
    mode = 'tour'; bridge = null; coast = 0; phase = t; ambT = t;
    navWant = 0; navHide = 0; tone = 0; knee.t = 9;
    for (const r of revs) r.t = 9;
    const n = Math.round(TOUR * 60);
    prevScroll = scroll = tourAt(t - n / 60);
    for (let i = n; i >= 0; i--) { scroll = tourAt(t - i / 60); follow(1 / 60, false); }
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
    // the first frame is already the loop's: the copy in, the nav and the ink as the tour's last move up leaves them
    if (!started) { started = true; if (mode === 'tour') seekTime(phase); }
    if (!still) ambT = (ambT + dt) % TOUR;
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
    follow(dt, still);

    render(dt, still);
    rafId = requestAnimationFrame(frame);
  }

  /* what carries over from frame to frame, stepped on with the scroll */
  function follow(dt, still) {
    // the nav, as on the site: away once the page is heading down past it, back the moment it heads up
    const ds = scroll - prevScroll; prevScroll = scroll;
    if (ds > 0.5 && scroll > NAV) navWant = 1; else if (ds < -0.5 || scroll <= 0) navWant = 0;
    navHide += (navWant - navHide) * (still ? 1 : 1 - Math.exp(-dt / 0.085));
    // the site's fade-and-rise: in as its centre passes 90% of the window, reset once it is below the window again
    for (const r of revs) {
      const yv = r.cy - scroll;
      if (still) r.t = 9;
      else if (yv < 0.9 * VH) r.t += dt;
      else if (yv - r.h / 2 > VH) r.t = 0;
    }
    // the knee render turns in once its top is in the window
    const yk = knee.top - scroll;
    if (still) knee.t = 9; else if (yk < VH) knee.t += dt; else if (yk > VH + 40) knee.t = 0;
    // the ruler's ink inside the card follows what is under it: the section under the mark, or the frame's ground
    let dark = 0;
    if (framed) dark = luminance(V['card.frameColor']) < 0.35 ? 1 : 0;
    else if (EMBED) { const yr = scroll + VH / 2; for (const t of tones) if (yr >= t.y0 && yr < t.y1) dark = t.dark ? 1 : 0; }
    tone += (dark - tone) * (still ? 1 : 1 - Math.exp(-dt / 0.18));
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

    /* ---- the page: scroll and Roam's own choreography ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    const forgeRun = Math.max(0, FORGE.end - FORGE.h - FORGE.top);
    pinY.nav = scroll - NAV * navHide;
    pinY.forge = clamp(scroll, 0, forgeRun);
    pinY.video = clamp(scroll - vidTop, -1.5 * VH, 1.5 * VH);
    for (const p of pins) setT(p, p.el, `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)`);
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;

    // the Forge: 20 degrees at the top, turning to -22 as its track runs through the window (power1.in, scrubbed)
    if (inView(0, FORGE.end + 200)) {
      const run = Math.max(120, FORGE.end - VH - NAV);
      const deg = 20 - 42 * easeIn((scroll - NAV) / run);
      for (const f of forgeRots) setT(f, f.el, `rotate(${deg.toFixed(3)}deg)`);
    }
    // the cycling headers: out and up, then the next word in from below, a beat apart. 4.5 beats a tour (12 would
    // bring both lists round), so they read the tour's clock near the hero, the only place they're seen
    if (inView(0, 840)) {
      const hT = near(ambT, holdMid(0));
      for (const H of heads) {
        const n = H.words[0].length, tt = hT - H.at;
        let show = H.start, op = 1, y = 0;
        if (!still) {
          const j = Math.floor(tt / BEAT), u = tt - j * BEAT;
          // the word goes out up 0.667em, the swatch behind it changes, the next comes in from 0.667em below
          if (u < SWAP) { show = mod(H.start + j, n); op = 1 - easeIn(u / SWAP); y = -40 * easeIn(u / SWAP); }
          else { show = mod(H.start + j + 1, n); const e = easeOut((u - SWAP) / SWAP); op = e; y = 40 * (1 - e); }
        }
        const ty = `translate3d(0, ${y.toFixed(2)}px, 0)`, to = op.toFixed(3);
        H.gaps.forEach((g, i) => { const wo = i === show ? '1' : '0'; if (g.wo !== wo) { g.el.style.opacity = wo; g.wo = wo; } });
        for (const list of H.words) list.forEach((wd, i) => {
          const wo = i === show ? '1' : '0';
          if (wd.wo !== wo) { wd.w.style.opacity = wo; wd.wo = wo; }
          if (i !== show) return;
          if (wd.to !== to) { wd.t.style.opacity = to; wd.to = to; }
          if (wd.tt !== ty) { wd.t.style.transform = ty; wd.tt = ty; }
        });
      }
    }
    // the orange dashed rules march to the right, 8 px about every half second
    if (!still) {
      const off = `translate3d(${((ambT * DASH) % 8).toFixed(2)}px, 0, 0)`;
      for (const d of dashes) if (inView(d.y - 40, d.y + 40)) setT(d, d.el, off);
    }
    // the carousel and the films
    for (const sh of shows) if (inView(sh.y0, sh.y1)) slides(sh, still ? 0 : sh.stop == null ? ambT : near(ambT, holdMid(sh.stop)));
    // the photos drift inside their frames as they pass (dual-use -12% to 12%, the three renders 0 to -18%)
    for (const p of pars) {
      if (!inView(p.top - 100, p.top + p.h + 100)) continue;
      const q = clamp((scroll + VH - p.top) / (VH + p.h), 0, 1);
      setT(p, p.el, p.kind === 'dual'
        ? `translate3d(-50%, ${((-0.12 + 0.24 * q) * p.ih).toFixed(2)}px, 0) scale(1.1)`
        : `translate3d(0, ${(-0.18 * q * p.ih).toFixed(2)}px, 0)`);
    }
    // the site's fade-and-rise: 0.666 s in, each a fifth of a second behind the one before it in its group
    for (const r of revs) {
      const p = still ? 1 : ease((r.t - r.delay) / 0.666);
      const dy = (1 - p) * 0.01 * VH;
      setO(r, r.el, p);
      if (r.layer) { r.layer.fade = p; r.layer.dy = dy; }
      else setT(r, r.el, dy > 0.001 ? `translate3d(0, ${dy.toFixed(2)}px, 0)` : '');
    }
    // the knee render turns in (from -5 to 2.5 degrees, growing a tenth) once its top is in the window
    if (inView(knee.top - 60, knee.top + knee.h + 60)) {
      const e = easeOut(knee.t / 1);
      const str = `rotate(${(-5 + 7.5 * e).toFixed(3)}deg) scale(${(1 + 0.1 * e).toFixed(4)})`;
      for (const kr of kneeRots) setT(kr, kr.el, str);
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
    // inside the card its ink follows what is under it (follow eases it)
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
    if (e.source !== window.parent) return;
    const d = e.data;
    if (!d || d.type !== 'ks-card') return;
    // {at}: the resting loop's time as the tile hands over; the card carries on from that frame (not mid-drag)
    if (typeof d.at === 'number' && isFinite(d.at) && !dragging) seekTime(d.at);
    if (typeof d.visible === 'boolean') { parentVisible = d.visible; sync(); }
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
    // one whole loop in seconds at speed 1 (the site records one tour as the tile's resting loop)
    get period() { return TOUR; },
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    get ambient() { return ambT; }, set ambient(t) { ambT = mod(+t || 0, TOUR); },
    seek(t) { seekTime(+t || 0); },
    at(i) { seekTime(holdAt[clamp(i | 0, 0, LEGS.length - 1)] + 0.01); },
  };
  window.roamCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
