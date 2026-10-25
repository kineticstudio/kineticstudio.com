/* Distributional work card: the engine (from the Epirus and Ethos cards').

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 20 s round, never paused by
     hover; a drag takes over (up and down like a phone, or sideways to scrub:
     right is further down the page), coasts, and the tour picks up from there
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: Distributional's own behaviour, the sticky stack (Problem holds
     at -70% of the window while Solution slides over it, Solution holds at
     -50% while the Product card slides over that), and its moving pictures:
     the hero cube (WebGL on the site, CSS 3D here) turning with its coloured
     blocks running the lattice and trailing copies of themselves; the
     Problem shapes coming and going on their own lottie keyframes; the
     Solution grid lighting a cell at a time, blue, green, pink, the colour
     running out along the grid; the Product insights, the Workflow squares
     and the testing squares under the last call drifting a touch.

   window.distributionalCard is the handle the page's dials and the verify
   script use. The embed contract (?embed=1, &bleed=N, &radius=N,
   &touchdrag=1, the ks-card pause message and the ks-card-open click) is the
   same as the other cards'. */
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
  const lerp = (a, b, t) => a + (b - a) * t;
  const mod = (a, n) => ((a % n) + n) % n;

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksIn = $$('.notches-in .ticks'), ticksOut = $('.notches-out .ticks');
  const inkDark = $('.notches-in .dark'), inkLight = $('.notches-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // Distributional's design width
  const NAVH = 56;                       // its sticky nav
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
    'motion.tourSpeed': 1, 'motion.cube': 1, 'motion.lotties': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.friction': 0.32, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.1,
    'card.cardSize': 40, 'card.frame': false, 'card.frameColor': '#6464f1', 'card.notches': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  const V = Object.assign({}, DEFAULTS);
  if (EMBED && qs.get('frame') === '1') V['card.frame'] = true;
  card.style.setProperty('--r', RADIUS + 'px');

  /* ================= the hero cube, in CSS 3D ================= */
  /* A 7 x 7 x 7 lattice 420 px on a side (60 px cells) seen through an 890 px
     perspective, the proportions of the site's WebGL cube in its 1307 x 650
     frame (front face about 543 px across, the back about 337): planes of hairlines across z and x (the six faces brighter, with
     their vertex dots front and back), and coloured blocks a cell big that
     run the lattice's rows, each trailed by three fading copies of where it
     just was, as the WebGL blocks are. The lattice and the blocks are two
     layers at their own depths, turned together. */
  const CELL = 60, HALF = 210;
  const cubeL = $('#cubeL'), cubeB = $('#cubeB');
  {
    let h = '';
    for (let k = 0; k <= 7; k++) {
      const v = -HALF + CELL * k, edge = k === 0 || k === 7;
      h += `<i class="pl z${edge ? ' edge' : ''}" style="transform:translateZ(${v}px)"></i>`;
      h += `<i class="pl ${edge ? 'z edge' : 'x'}" style="transform:translateX(${v}px) rotateY(90deg)"></i>`;
    }
    h += `<i class="pl z edge" style="transform:translateY(${-HALF}px) rotateX(90deg)"></i><i class="pl z edge" style="transform:translateY(${HALF}px) rotateX(90deg)"></i>`;
    cubeL.innerHTML = h;
  }
  const cellAt = (i) => -HALF + CELL / 2 + CELL * i;
  // each block's loop through the lattice, in cells (x right, y down, z toward the eye), and its colour as the WebGL draws it
  const BLOCKS = [
    { c: '#5b5bea', path: [[1, 1, 1], [1, 1, 5], [2, 1, 5], [2, 1, 1]], ph: 0.0 },
    { c: '#93df77', path: [[5, 3, 0], [5, 3, 4], [5, 2, 4], [5, 2, 0]], ph: 1.7 },
    { c: '#ef5d55', path: [[0, 5, 6], [0, 5, 2], [1, 5, 2], [1, 5, 6]], ph: 3.1 },
    { c: '#dfdc7a', path: [[3, 5, 1], [3, 5, 5], [3, 4, 5], [3, 4, 1]], ph: 4.4 },
    { c: '#e76ae6', path: [[2, 3, 2], [2, 3, 6], [4, 3, 6], [4, 3, 2]], ph: 2.3 },
  ];
  const GHOST = [{ lag: 0, o: 0.95 }, { lag: 0.075, o: 0.34 }, { lag: 0.15, o: 0.2 }, { lag: 0.225, o: 0.1 }];
  const SEG = 0.5; // s per cell
  {
    let h = '';
    for (const b of BLOCKS) for (let g = GHOST.length - 1; g >= 0; g--) h += `<div class="blk" style="--c:${b.c};--o:${GHOST[g].o}"><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
    cubeB.innerHTML = h;
  }
  const blkEls = $$('.blk', cubeB);
  for (const b of BLOCKS) {
    b.segs = b.path.map((p, i) => { const q = b.path[(i + 1) % b.path.length]; return { p, q, d: SEG * Math.max(1, Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2])) }; });
    b.T = b.segs.reduce((a, s) => a + s.d, 0);
  }
  BLOCKS.forEach((b, bi) => { b.els = GHOST.map((g, gi) => ({ el: blkEls[bi * GHOST.length + (GHOST.length - 1 - gi)], lag: g.lag, last: '' })); });
  function blockAt(b, t) {
    t = mod(t + b.ph, b.T);
    for (const s of b.segs) {
      if (t < s.d) { const u = ease(t / s.d); return [lerp(cellAt(s.p[0]), cellAt(s.q[0]), u), lerp(cellAt(s.p[1]), cellAt(s.q[1]), u), lerp(cellAt(s.p[2]), cellAt(s.q[2]), u)]; }
      t -= s.d;
    }
    return [cellAt(b.path[0][0]), cellAt(b.path[0][1]), cellAt(b.path[0][2])];
  }
  const cubeT = { L: '', B: '' };

  /* ================= the Problem lottie, its own keyframes ================= */
  const PD = window.DIST_PROBLEM;
  const pShapes = $('#pShapes');
  const PSC = 1149 / 1152; // the lottie drawn at the box's width
  let shapes = [];
  if (PD && pShapes) {
    // lottie layer 0 is drawn on top: build bottom up
    shapes = PD.shapes.slice().reverse().map((s) => {
      const img = document.createElement('img');
      img.src = `distributional-card-src/img/problem/${s.src}.svg`; img.alt = '';
      Object.assign(img.style, { left: (s.box[0] * PSC).toFixed(2) + 'px', top: (s.box[1] * PSC).toFixed(2) + 'px', width: (s.box[2] * PSC).toFixed(2) + 'px', height: (s.box[3] * PSC).toFixed(2) + 'px' });
      pShapes.appendChild(img);
      return { el: img, s, last: '', op: '' };
    });
  }
  const P_STILL = 150; // reduced motion: the frame held

  /* ================= the Solution grid ================= */
  const SOL = [
    { solid: $('#sqBlue'), light: $('#sqBlueL'), spread: $('#spreadBlue'), at: 0 },
    { solid: $('#sqGreen'), light: $('#sqGreenL'), spread: $('#spreadGreen'), at: 1 / 3 },
    { solid: $('#sqPink'), light: $('#sqPinkL'), spread: $('#spreadPink'), at: 2 / 3 },
  ].map((e) => ({ ...e, o: { a: '', b: '', c: '' } }));
  const lifted = [
    { el: $('#stackGreen'), amp: 5, f: 0.9, ph: 0 }, { el: $('#stackPink'), amp: 5, f: 0.9, ph: 1.6 },
    { el: $('#wfImprove'), amp: 4, f: 0.8, ph: 0.4 }, { el: $('#wfUnderstand'), amp: 3, f: 0.8, ph: 2.1 },
    { el: $('#ctaSquares'), amp: 6, f: 0.55, ph: 0.9 },
  ].filter((x) => x.el).map((x) => ({ ...x, last: '' }));

  /* ================= shadow twins ================= */
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(true);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-stop', 'data-tone', 'data-pin', 'id']) n.removeAttribute(a);
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
      el, d: +el.dataset.depth, kind: el === win ? 'card' : nav.contains(el) ? 'vp' : 'page',
      pin: pinEl ? pinEl.dataset.pin : null, twin: el._twin || null, parent: null, cx: 0, cy: 0, h: 0, A: null, last: '', vis: 1, op: '',
    };
  });
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  function topIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x, y];
  }
  function posIn(el, root) { const [x, y] = topIn(el, root); return [x + el.offsetWidth / 2, y + el.offsetHeight / 2]; }
  const tones = $$('.page > [data-tone]').map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));
  // the sticky stack: each pinned section holds at its own top (a share of the window, negative: above it) inside its parent
  const PIN_TOP = { problem: -0.7, solution: -0.5 };
  const pins = $$('[data-pin]').map((el) => ({ el, name: el.dataset.pin, y0: 0, h: 0, max: 0, last: '' }));
  const pinY = { problem: 0, solution: 0 };
  // what slides over each pinned section: anything of it that has gone under that card is let go, so the
  // parallax never lifts a covered line out from under the card's edge (on the site it is simply hidden)
  const coverTop = () => ({ problem: at.solution[0] + pinY.solution, solution: at.product[0] });

  /* ================= state ================= */
  let cw = 576, ch = 432, K = 2.5, cardW = 1440, cardH = 1080;
  let s = 0.4, VH = 1080, maxScroll = 6900;
  let stops = [0, 0, 0, 0, 0, 0, 0];
  const at = {};
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, amb = 0, clock = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', liftNow = 1, tone = 1, lastTone = '';

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
    for (const t of tones) { t.y0 = t.el.offsetTop; t.y1 = t.y0 + t.el.offsetHeight; }
    for (const p of pins) {
      p.y0 = topIn(p.el, page)[1]; p.h = p.el.offsetHeight;
      const par = p.el.parentElement;
      p.max = Math.max(0, topIn(par, page)[1] + par.offsetHeight - (p.y0 + p.h));
      p.last = '_';
    }
    const top = (sel) => topIn($(sel), page)[1], bot = (sel) => top(sel) + $(sel).offsetHeight;
    Object.assign(at, {
      problem: [top('.problem'), bot('.problem')], solution: [top('.solution'), bot('.solution')], product: [top('.product'), bot('.product')],
      hero: [0, $('.hero').offsetHeight], cta: [top('.cta'), bot('.cta')], work: [top('.work'), bot('.work')],
    });
    maxScroll = Math.max(0, page.offsetHeight - VH);
    // each stop puts a section's best part in the middle of the window under the nav
    const centre = (a, b) => Math.round((a + b) / 2 - (NAVH + (VH - NAVH) / 2));
    stops = [
      0,                                                         // the hero and its cube
      centre(top('.p-h'), bot('.p-lot')),                        // the problem: headline and the shapes
      centre(top('.s-h'), bot('.s-cols') + 100),                 // the solution: the grid lighting up
      centre(top('.o-h'), bot('.o-lot')),                        // the product: the platform and its insights
      centre(top('.w-eye'), top('.w-ben') + 124),                // the workflow loop
      centre(top('.u-eye'), bot('.c-btn')),                      // the use cases and the last call
      maxScroll,                                                 // the testing squares and the footer
    ].map((y) => clamp(y, 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    for (const L of layers) L.last = '_';
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; about 20 s round
    [3.2, 1.1], [1.8, 0.9], [2.0, 0.9], [1.8, 0.9], [1.8, 0.9], [1.6, 0.9], [1.2, 1.8],
  ];
  const TOUR = LEGS.reduce((a, [h, m]) => a + h + m, 0);
  const holdAt = LEGS.reduce((a, [h, m], i) => (a.push(i ? a[i - 1] + LEGS[i - 1][0] + LEGS[i - 1][1] : 0), a), []);
  // the Solution grid runs its blue, green, pink twice a lap, a cell lighting just as the tour arrives there
  const SOL_CYCLE = TOUR / 2, SOL_AT = holdAt[2] - 0.35;
  function tourAt(t) {
    t = mod(t, TOUR);
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
    const at0 = stops.findIndex((y) => Math.abs(y - scroll) <= 3);
    if (at0 >= 0) { mode = 'tour'; phase = holdAt[at0] + LEGS[at0][0] * 0.35; return; }
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
    if (!still) amb += dt;
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

    // the sticky stack, as position: sticky does it on the site
    for (const p of pins) pinY[p.name] = clamp(scroll + PIN_TOP[p.name] * VH - p.y0, 0, p.max);

    render(dt, still);
    rafId = requestAnimationFrame(frame);
  }

  function setT(o, el, str) { if (o.last !== str) { el.style.transform = str; o.last = str; } }
  function setO(o, el, v, key) { const str = v.toFixed(3); if (o[key || 'op'] !== str) { el.style.opacity = str; o[key || 'op'] = str; } }

  /* the cube at time t: its turn, and every block with its trail */
  function drawCube(t, still) {
    const rx = still ? -14 : -13 + 6 * Math.sin(t * 0.21 + 0.6);
    const ry = still ? -26 : -20 + 30 * Math.sin(t * 0.12);
    const str = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;
    if (cubeT.L !== str) { cubeL.style.transform = str; cubeB.style.transform = str; cubeT.L = str; }
    for (const b of BLOCKS) for (const g of b.els) {
      const [x, y, z] = blockAt(b, (still ? 2.2 : t) - g.lag);
      setT(g, g.el, `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px)`);
    }
  }

  /* the Problem shapes at frame f of their 8 s loop */
  function drawProblem(f) {
    for (const sh of shapes) {
      const S = sh.s, n = S.o.length, kf = f / PD.step, k0 = Math.floor(kf) % n, k1 = (k0 + 1) % n, u = kf - Math.floor(kf);
      const o = lerp(S.o[k0], S.o[k1], u) / 100;
      setO(sh, sh.el, o);
      if (o > 0.004) setT(sh, sh.el, `translate3d(${(lerp(S.dx[k0], S.dx[k1], u) * PSC).toFixed(2)}px, ${(lerp(S.dy[k0], S.dy[k1], u) * PSC).toFixed(2)}px, 0)`);
    }
  }

  /* the Solution grid at time u into its cycle: each colour lights its cell, runs out along the lines, then settles to an outline */
  function drawSolution(u) {
    const C = SOL_CYCLE, part = C / 3, end = 1 - smooth(u, C - 0.45, C - 0.05);
    for (const e of SOL) {
      const t = u - e.at * C;
      setO(e.o, e.solid, smooth(t, 0, 0.18) * (1 - smooth(t, part * 0.55, part * 0.72)), 'a');
      setO(e.o, e.light, smooth(t, part * 0.55, part * 0.72) * end, 'b');
      setO(e.o, e.spread, 0.95 * smooth(t, 0.05, 0.45) * (1 - smooth(t, part * 0.3, part * 0.62)), 'c');
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

    /* ---- the page, and the sticky stack inside it ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    for (const p of pins) setT(p, p.el, `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)`);

    /* ---- the moving pictures, only where they can be seen ---- */
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;
    const lot = V['motion.lotties'];
    if (inView(at.hero[0], at.hero[1])) drawCube(amb * V['motion.cube'], still || V['motion.cube'] === 0);
    if (shapes.length && inView(at.problem[0] + pinY.problem, at.problem[1] + pinY.problem)) {
      drawProblem(still || lot === 0 ? P_STILL : mod(amb * lot * PD.fps, PD.frames));
    }
    if (inView(at.solution[0] + pinY.solution, at.solution[1] + pinY.solution)) {
      drawSolution(still || lot === 0 ? 0.9 : mod((amb - SOL_AT) * lot, SOL_CYCLE));
    }
    if (inView(at.product[0], at.cta[1])) {
      for (const x of lifted) setT(x, x.el, `translate3d(0, ${(still ? 0 : -x.amp * Math.sin(amb * lot * x.f + x.ph)).toFixed(2)}px, 0)`);
    }

    /* ---- the card tilts toward the pointer ---- */
    card.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${(lift / K).toFixed(5)})`;

    // the eye in card space: straight in front of the card centre, rotated into the card's frame
    const P = Pc / lift;
    const E = { x: -P * Math.sin(b) * Math.cos(a), y: P * Math.sin(a), z: P * Math.cos(a) * Math.cos(b) };
    const Zsep = 0.16 * cardW * depth;
    const quiet = Math.abs(hc) < 0.0005 && Math.abs(rx) < 0.001 && Math.abs(ry) < 0.001;
    const margin = VH * 0.75;
    const covers = coverTop();

    for (const L of layers) {
      if (L.pin) {
        const vis = 1 - smooth(L.cy - L.h / 2 + pinY[L.pin] - covers[L.pin], -4, 24);
        if (vis !== L.vis) { L.vis = vis; const str = vis.toFixed(3); if (str !== L.op) { L.el.style.opacity = vis > 0.999 ? '' : str; L.op = str; } }
        if (vis < 0.001) { if (L.twin && L.twin.op !== '0.000') { L.twin.el.style.opacity = 0; L.twin.op = '0.000'; } continue; }
      }
      const u2 = L.kind === 'card' ? 1 : s;
      let yView = 0;
      if (L.kind === 'page') {
        yView = L.cy + (L.pin ? pinY[L.pin] : 0) - scroll;
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
        const T = L.twin;
        const zs = T.surface * Zsep * hc;
        const throwPx = Math.max(0, L.A.z - zs);
        const A = project(T.surface, { x: throwPx * LIGHT.x, y: throwPx * LIGHT.y });
        // the higher the layer, the further its shadow falls and the wider it spreads
        A.t *= 1 + throwPx / cardW * 0.35;
        write(T.el, A, T);
        const op = (T.alpha * shadowK * h01 * L.vis).toFixed(3);
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
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); }, get pins() { return { ...pinY }; },
    seek(t) { mode = 'tour'; bridge = null; phase = t; },
    ambAt(t) { amb = t; },
  };
  window.distributionalCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
