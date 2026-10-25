/* Reshape Biotech work card: the engine (the Happy Droid and IngredientAI
   cards', from the Ethos card's).

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 21 s round, never paused by
     hover; a drag takes over (up and down like a phone, or sideways to scrub:
     right is further down the page), coasts, and the tour picks up from there
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: Reshape's own scroll choreography, measured on its archived
     page. The hero is pinned for its first 700px while the mint circle
     shrinks into the nav's pill (power1.out, as the site's GSAP timeline)
     and the copy lifts 50px and fades over the first 350; then the
     machine's frame sequence (the site's Lottie, 88 frames, scrubbed to 85%
     of it) plays under the window as the hero's 400vh goes by. Never miss a
     data point grows its circle from half size and turns the blue section
     lilac; the analysis tabs step every 4 s as the site's tabLoop; the three
     industries pin at the top as the next slides over (position: sticky);
     the splitter's handle sweeps; and at the end the page lifts off the
     footer waiting under it. The videos and GIFs are stills cross-faded.

   window.reshapeCard is the handle the page's dials and the verify script
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
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const out1 = (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); }; // GSAP's default ease, power1.out
  const frac = (x) => x - Math.floor(x);

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), main = $('#main');
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
  const PIN = 700;                       // px the hero is pinned for while the circle becomes the nav
  const LOT = [...Array.from({ length: 38 }, (_, i) => i * 2), 75]; // the Lottie frames kept, of 88: every other one, and 75
  const LOT_END = 74.8;                  // the site scrubs the sequence to 85%
  const FOOT_H = 546;

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.6, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.7,
    'motion.tourSpeed': 1, 'motion.loops': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.scrub': 2.5, 'drag.momentum': 1, 'drag.friction': 0.32, 'drag.resumeAfter': 1.1,
    'card.cardSize': 40, 'card.frame': false, 'card.frameColor': '#5750ee', 'card.notches': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  if (EMBED && (qs.get('frame') === '1' || qs.get('frame') === 'framed')) V['card.frame'] = true;
  card.style.setProperty('--r', RADIUS + 'px');

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
      el, d: +el.dataset.depth, kind: el === win ? 'card' : el.closest('.fixed') ? 'vp' : 'page',
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
  const pinY = { hero: 0, lottie: 0, s0: 0, s1: 0, s2: 0, foot: 0 };
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= the page's own motion ================= */
  // (collected after the twins exist, so a twin follows its layer)
  const box = (el) => ({ el, last: '', op: '' });
  const hero = {
    frames: $$('.h-frames img').map(box),
    circle: box($('#hCircle')),
    capA: box($('#cA')), capB: box($('#cB')), mid: box($('#cR')),
    copy: box($('#hCopy')),
  };
  const feat = {
    growth: box($('#fGrowth')),
    plates: $$('.fi:last-child .fi-ground img').map(box),
  };
  const expl = {
    sc: $$('.ex-sc').map(box),
    lilac: box($('#exLilac')), labB: box($('#exLabB')), labO: box($('.ex-lab .o')),
    mint: $$('.ex-h .m, .ex-p .m').map(box), ink: $$('.ex-h .d, .ex-p .d').map(box),
    cams: $$('.ex-clip').map((c) => $$('img', c).map(box)),
  };
  const tabs = $$('.an-tab').map((el) => ({
    el: box(el), on: box($('.hd.on', el)), bar: box($('.bar', el)), tx: box($('.tx', el)),
  }));
  const panes = $$('.an-pane').map((el) => ({ el: box(el), b: box($('.fx', el)) }));
  const scope = {
    lapses: $$('.sc-item .sc-dish').map((d) => [...$$('.sp-before', d).map((x) => $$('img', x).map(box)), ...$$('.sp-in', d).map((x) => $$('img', x).map(box)),
      ...(d.querySelector('.sp-before') ? [] : [$$(':scope > img', d).map(box)])]),
    after: box($('#spAfter')), inner: box($('#spIn')), moves: $$('.sp-move').map(box),
  };
  const contactImg = $$('.ct-img img').map(box);
  const sec = {};

  /* ================= state ================= */
  let cw = 576, ch = 432, K = 2.5, cardW = 1440, cardH = 1080;
  let s = 0.4, VH = 1080, maxScroll = 10000, LH = 1448, HS = 4320, SPAN = 3168, mainH = 14000;
  let stops = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, amb = 0, clock = 0, tone = 1, lastTone = '';
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', liftNow = 1;

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
    // the live page's heights that are shares of the window follow VH
    VH = Math.max(640, Math.round(DW * winH / winW));
    vp.style.setProperty('--vh', VH + 'px');
    // the machine's frames: 1440 square in a 1448 box, held 200px up the window; grown to cover a tall window
    LH = Math.max(1448, VH + 208);
    vp.style.setProperty('--lh', LH + 'px');
    vp.style.setProperty('--lw', Math.max(1440, LH - 8) + 'px');
    HS = 4 * VH;                                // the hero's 400vh
    SPAN = 2640 * VH / 900;                     // px of scroll the 88 frames are spread over (2640 at a 900 window)
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
    for (const el of $$('.main > [data-stop]')) sec[el.dataset.stop] = { y: el.offsetTop, h: el.offsetHeight };
    mainH = main.offsetHeight;
    maxScroll = Math.max(0, page.offsetHeight - VH);
    const S = sec;
    stops = [
      0,                                               // the hero: automate your visual experiments, in the circle
      Math.round(PIN + SPAN * 44 / 88),                // the machine open, its tray of plates out
      Math.round(PIN + SPAN * 72 / 88),                // a plate lifted under the camera, the colonies boxed
      S.features.y - 22,                               // unlock your lab's potential, the first row of the bento
      S.features.y + 954,                              // the bento's second and third rows
      S.imaging.y + 28,                                // never miss a data point: the circle full, the section turned lilac
      S.analysis.y + 19,                               // scalable data acquisition: the tabs and the plate
      S.industries.y + 1242,                           // industrials pinned at the top with the splitter
      S.testimonials.y - 40,                           // accelerating R&D for global companies
      S.contact.y - 20,                                // let's talk, the footer showing under the page
      maxScroll,                                       // the page lifted off the footer
    ].map((y) => clamp(y, 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    for (const L of layers) L.last = '_';
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; about 21 s round
    [1.4, 1.2], [0.8, 0.9], [0.9, 1.0], [1.0, 0.8], [0.8, 0.9], [1.0, 0.8], [1.3, 0.9], [1.0, 0.7], [1.0, 0.7], [0.8, 0.7], [0.9, 2.0],
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
    if (!still) amb += dt * V['motion.loops'];
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
      else scroll = stops[0]; // reduced motion: one still pose, the hero in its circle
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

  function setT(o, str) { if (o.last !== str) { o.el.style.transform = str; o.last = str; } }
  function setO(o, v) { const str = v.toFixed(3); if (o.op !== str) { o.el.style.opacity = str; o.op = str; } }
  /* a loop of stills cross-faded: n frames over a period, each held and then dissolving into the next;
     the first frame is the ground, and at the loop's end the rest fade off it again */
  function lapse(list, t, period, fade) {
    const n = list.length, u = frac(t / period) * n, i = Math.floor(u);
    const w = smooth(u - i, 1 - fade, 1);
    for (let j = 1; j < n; j++) setO(list[j], i === n - 1 ? 1 - w : j <= i ? 1 : j === i + 1 ? w : 0);
  }

  function choreography(still) {
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;
    const S = sec;

    /* ---- pins: the hero for 700px, the machine's frames held under the window, the industries stuck at the top,
            the footer at the window's bottom under the page ---- */
    pinY.hero = clamp(scroll, 0, PIN);
    pinY.lottie = Math.min(scroll, Math.max(PIN, scroll - 200), PIN + HS - LH);
    const sc0 = S.industries.y;
    for (let i = 0; i < 3; i++) pinY['s' + i] = clamp(scroll - (sc0 + 621 * i), 0, 1242 - 621 * i);
    pinY.foot = scroll - maxScroll;
    for (const p of pins) setT(p, `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)`);

    /* ---- the hero ---- */
    if (scroll < PIN + HS + 40) {
      // the circle shrinks into the nav's pill: 1520 x 1664 at -925 to 1264 x 92 at 16, power1.out over the pin
      const p = out1(scroll / PIN);
      const w = 1520 + (1264 - 1520) * p, h = 1664 + (92 - 1664) * p;
      const x = (DW - w) / 2, y = -924.8 + (16 + 924.8) * p, r = Math.min(w, h) / 2;
      const cap = (o, cx, cy) => setT(o, `translate3d(${(cx - r).toFixed(2)}px, ${(cy - r).toFixed(2)}px, 0) scale(${(2 * r / 1600).toFixed(5)})`);
      if (h >= w) {
        cap(hero.capA, x + r, y + r); cap(hero.capB, x + r, y + h - r);
        setT(hero.mid, `translate3d(${x.toFixed(2)}px, ${(y + r).toFixed(2)}px, 0) scale(${(w / 1000).toFixed(5)}, ${((h - 2 * r) / 1000).toFixed(5)})`);
      } else {
        cap(hero.capA, x + r, y + r); cap(hero.capB, x + w - r, y + r);
        setT(hero.mid, `translate3d(${(x + r).toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${((w - 2 * r) / 1000).toFixed(5)}, ${(h / 1000).toFixed(5)})`);
      }
      setO(hero.circle, scroll < PIN ? 1 : 0);
      // the copy lifts 50px and fades over the first 350
      const q = out1(scroll / (PIN / 2));
      setT(hero.copy, q < 0.0005 ? '' : `translate3d(0, ${(-50 * q).toFixed(2)}px, 0)`);
      setO(hero.copy, 1 - q);
      // the machine: the Lottie's frame for this scroll, two kept frames cross-fading
      const f = clamp((scroll - PIN) / SPAN * 88, 0, LOT_END);
      let a = 0; while (a < LOT.length - 2 && LOT[a + 1] <= f) a++;
      const wgt = clamp((f - LOT[a]) / (LOT[a + 1] - LOT[a]), 0, 1);
      hero.frames.forEach((o, i) => setO(o, i === a ? 1 : i === a + 1 ? wgt : 0));
    }

    /* ---- the bento's GIF and video, as stills ---- */
    if (inView(S.features.y + 1000, S.features.y + S.features.h)) {
      setO(feat.growth, smooth(frac(amb / 5), 0.25, 0.55) * (1 - smooth(frac(amb / 5), 0.9, 1)));
      const u = frac(amb / 2.4) * 4;                    // the plate formats, each a beat
      feat.plates.forEach((o, i) => { if (i) setO(o, i <= u ? smooth(u - i, 0, 0.25) : 0); });
    }

    /* ---- imaging: the circle grows from half size as it comes up the window, then shrinks to 0.8; the blue turns lilac ---- */
    if (inView(S.imaging.y - 40, S.imaging.y + S.imaging.h + 40)) {
      const cy = S.imaging.y + 648.8 - scroll;
      const g = clamp((VH + 647 - cy) / (647 + 0.289 * VH), 0, 1);
      const sh = clamp((0.157 * VH - cy) / 589, 0, 1);
      const sc = (0.5 + 0.5 * g) * (1 - 0.2 * sh);
      for (const o of expl.sc) setT(o, `scale(${sc.toFixed(5)})`);
      // the site's page colour trigger, measured: the blue goes lilac as the section's top crosses the
      // window's top 100px, then the copy turns from mint to ink (and the eyebrow from orange to blue)
      const tt = S.imaging.y - scroll;
      setO(expl.lilac, smooth(tt, 102, -3));
      const ink = smooth(tt, 30, 0);
      setO(expl.labB, ink); setO(expl.labO, 1 - ink);
      for (const o of expl.ink) setO(o, ink);
      for (const o of expl.mint) setO(o, 1 - ink);
      for (const list of expl.cams) lapse(list, amb, 8, 0.35);
    }

    /* ---- analysis: the tabs step every 4 s (the site's tabLoop), the open one's line and text coming in ---- */
    if (inView(S.analysis.y, S.analysis.y + S.analysis.h)) {
      const kk = still ? 0.95 : amb / 4;
      const idx = Math.floor(kk) % 4, prev = (idx + 3) % 4, u = frac(kk) * 4;
      const e = still ? 1 : ease(u / 0.45);
      tabs.forEach((t, i) => {
        const yA = 51.2 * i + (i > prev ? 52.8 : 0), yB = 51.2 * i + (i > idx ? 52.8 : 0);
        const y = yA + (yB - yA) * e;
        setT(t.el, y < 0.01 ? '' : `translate3d(0, ${y.toFixed(2)}px, 0)`);
        const on = i === idx ? e : i === prev ? 1 - e : 0;
        setO(t.on, on); setO(t.bar, on);
        const tx = i === idx ? smooth(e, 0.35, 1) : i === prev ? 1 - smooth(e, 0, 0.4) : 0;
        setO(t.tx, tx);
        setT(t.tx, `scale(${(0.9 + 0.1 * (i === idx ? e : 1 - e)).toFixed(4)})`);
      });
      panes.forEach((p, i) => {
        setO(p.el, i === idx ? smooth(u, 0, 0.3) : i === prev ? 1 - smooth(u, 0.15, 0.3) : 0);
        if (i === idx) setO(p.b, still ? 1 : smooth(u, 0.5, 3.6));
      });
    }

    /* ---- the industries: the time-lapses, the splitter's handle sweeping ---- */
    if (inView(S.industries.y, S.industries.y + S.industries.h + VH)) {
      const per = [4, 5, 4.2];
      scope.lapses.forEach((group, i) => { for (const list of group) lapse(list, amb + i * 0.7, per[Math.min(i, 2)], 0.45); });
      const d = (-0.28 * (0.5 - 0.5 * Math.cos(2 * Math.PI * amb / 7))) * 364; // 60% on the site, swept toward 32%
      setT(scope.after, `translate3d(${d.toFixed(2)}px, 0, 0)`);
      setT(scope.inner, `translate3d(${(-d).toFixed(2)}px, 0, 0)`);
      for (const o of scope.moves) setT(o, `translate3d(${d.toFixed(2)}px, 0, 0)`);
    }

    /* ---- let's talk: the machine settles 47px as the section comes up to the end of the page ---- */
    if (inView(S.contact.y, S.contact.y + S.contact.h)) {
      const a0 = S.contact.y - VH, pr = clamp((scroll - a0) / Math.max(1, maxScroll - a0), 0, 1);
      for (const o of contactImg) setT(o, `translate3d(0, ${(-47 * (1 - pr)).toFixed(2)}px, 0)`);
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

    /* ---- the page: scroll and the site's own choreography ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    choreography(still);

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
      } else if (L.kind === 'vp') yView = L.cy;
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

    // the ruler: its notches slide with the page as it moves on screen; inside the card its ink is
    // light over the site's dark sections and dark over its lilac, orange and mint ones
    const npIn = 6 * K, offIn = (scroll * s) % npIn;
    const inStr = `translate3d(0, ${(-offIn).toFixed(2)}px, 0)`;
    for (const tk of ticksIn) tk.style.transform = inStr;
    const offOut = (scroll * s * lift / K) % 6;
    ticksOut.style.transform = `translate3d(0, ${(-offOut).toFixed(2)}px, 0)`;
    const yr = scroll + VH / 2, S = sec;
    let dark = 1; // 1: a dark section under the ruler, so light ink
    if (mainH - scroll < VH / 2) dark = 1;
    else if (yr >= S.imaging.y && yr < S.imaging.y + S.imaging.h) dark = S.imaging.y - scroll > 50 ? 1 : 0;
    else if (yr >= S.analysis.y && yr < S.analysis.y + S.analysis.h) dark = 0;
    else if (yr >= S.testimonials.y) dark = 0;
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
  reduced.addEventListener('change', () => { if (reduced.matches) { scroll = stops[0]; mode = 'tour'; phase = 0; } });

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
    get maxScroll() { return maxScroll; },
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    seek(t) { mode = 'tour'; bridge = null; phase = t; },
    get amb() { return amb; }, set amb(t) { amb = t; },
  };
  window.reshapeCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
