/* The S32 work card: one spring-driven loop, transforms and opacity only.

   The miniature is the live homepage (www.s32.com) laid out in layers at its
   1440px width. Every [data-depth] element is a layer; on hover the card tilts
   toward the pointer and each layer is projected as if it sat at its own height
   above the card plane, so the parallax matches the real 3D tilt. The tour never
   stops for the hover; a press and drag scrolls the miniature by hand (with
   momentum), and the tour picks up again from wherever it was let go.

   The page's own motion is all tied to its scroll, so here it is a pure function
   of the miniature's scroll, with the page's own ranges (read off its scripts and
   checked against the live page at 1440 x 900):
   - the hero: the headline drifts down 1em and the beige card rises its own
     overhang as the hero scrolls away
   - "What makes S32 different" waits pinned under the hero for 80vh: the S32 mark
     rises into place, its box draws itself round from the top left corner, and
     "different" slides in from the right, all over the hero's last 85vh
   - the three rows' panel slides in 100px from the right, each row rising 100px
     and fading up as it comes in
   - "Where we invest": the six cards rise 100px, column by column from the right
   - "Fewer Bets / Full Conviction" pins at the top and drifts up 100px while the
     white panel rises over it and slides across to the left edge, and every
     company row comes in 100px from the right as it climbs to mid screen, so the
     list is a staircase at the bottom of the screen
   - the footer's card rises its overhang and its links slide in
   The headings' lines and words slide in on the page's own timings (power4.out,
   1.2 s) once their trigger is passed; on the live page those triggers sit 80vh
   early (they are measured before the pin's spacer is added), and so do the
   footer's; both are kept as the live page has them. They run on the tour's clock
   and reset out of sight, so the tour is one seamless loop: the site rests the
   tile on this tour recorded and hands over with {type: "ks-card", at: seconds}.

   A classic script, so the card also runs opened straight from disk.
   window.__s32Card is the handle for the dials, the site and the verify scripts. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const embed = document.documentElement.classList.contains('embed');

  const DW = 1440;                       // S32's design width
  const MAX_VH = 1100;                   // a frame taller than the page can fill crops the sides rather than shrinking the page
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset on the card ground
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height, light from above and a touch left
  const TICK_PER = 80;                   // design px of scroll per ruler notch
  const CLICK_PX = 6;                    // a press that moves less than this is a click

  /* the page at a screen height VH (boxes read off the live page at 1440 x 900, 826, 1031 and 700): the hero
     is 100vh, its bottom row (the links and the card) 50vh less 10px, "What makes" (70vh + 133px tall) sits under its bottom and is pinned for 80vh, then the
     rows' panel (822.8), "Where we invest" (1061.6), the companies (482.4 + 160 + 3675.8) and the footer (527.4) */
  const geo = (VH) => {
    const hero = VH, cardH = 0.5 * VH - 10.1;
    const dTopH = 0.7 * VH + 133.2;
    const dBot = hero + 0.8 * VH + 1;
    const inv = dBot + 822.8;
    const comp = inv + 1061.6;
    const wrap = comp + 642.4;
    const foot = wrap + 3675.8;
    return { hero, cardH, dTopH, diff: hero - dTopH, pin0: hero - VH, dBot, inv, comp, wrap, foot, H: foot + 527.4 };
  };

  /* the tour: hold on a stop, glide to the next, every leg eased in and out (seconds at speed 1) */
  const STOPS = [
    { id: 'hero', hold: 1.8, move: 1.9, y: () => 0 },
    { id: 'different', hold: 1.1, move: 1.5, y: (VH, g) => g.pin0 + 0.85 * VH + 20 },     // the mark drawn, "different" home
    { id: 'rows', hold: 1.1, move: 1.6, y: (VH, g) => g.dBot + 649.2 - 0.7 * VH },        // Depth, Talent, Concentration all in
    { id: 'invest', hold: 1.3, move: 1.6, y: (VH, g) => g.inv + 512.8 - 0.4 * VH },       // where we invest, the cards up
    { id: 'fewer', hold: 1.0, move: 1.2, y: (VH, g) => g.comp + 0.217 * VH },             // fewer bets, the white panel coming over
    { id: 'select', hold: 1.2, move: 2.1, y: (VH, g) => g.wrap + 0.17 * VH },             // select companies, the staircase
    { id: 'footer', hold: 1.3, move: 2.9, y: (VH, g, max) => max },                       // the footer, then home
  ];
  const PERIOD = STOPS.reduce((a, S) => a + S.hold + S.move, 0);   // 21.6 s
  const STARTS = []; { let a = 0; for (const S of STOPS) { STARTS.push(a); a += S.hold + S.move; } }

  const DEFAULTS = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.62, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.6,
    'motion.scrollSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.2,
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': '#d8d5c8', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const c01 = (v) => clamp(v, 0, 1);
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * c01(t));
  const p4Out = (t) => 1 - Math.pow(1 - c01(t), 4);   // the page's power4.out
  const p1Out = (t) => 1 - Math.pow(1 - c01(t), 2);   // and power1.out, its default
  const wrapT = (t) => ((t % PERIOD) + PERIOD) % PERIOD;

  const $ = (s) => document.querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rimLight = $('#rimLight'), rim = $('#rim');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = $$('.ruler-in .ticks');
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const V = { ...DEFAULTS };
  const get = (k) => V[k];
  // inside the site a finger scrolls the site, not the miniature, unless &touchdrag=1
  const touchDrag = !embed || qs.get('touchdrag') === '1';
  if (!touchDrag) persp.style.touchAction = 'pan-y';

  /* ---- the headings' reveals: each line (or word) in its own span, sliding in as on the page ---- */
  for (const el of $$('[data-split="words"]')) {
    const out = [];
    for (const n of [...el.childNodes]) {
      if (n.nodeType !== 3) { out.push(n); continue; }
      n.textContent.split(/(\s+)/).forEach((w) => {
        if (!w) return;
        out.push(/^\s+$/.test(w) ? document.createTextNode(' ') : Object.assign(document.createElement('i'), { className: 'wd rv', textContent: w }));
      });
    }
    el.replaceChildren(...out);
  }

  /* ---- shadow twins: a darkened, blurred copy left on the surface under a lifted layer ---- */
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(true);
    for (const n of [tw, ...tw.querySelectorAll('*')]) {
      for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-anim', 'id']) n.removeAttribute(a);
    }
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }

  /* ---- the page's scroll-tied motion: wrappers moved by transform (and opacity), the layers inside them ---- */
  const A = {};
  for (const el of $$('[data-anim]')) A[el.dataset.anim] = { el, x: 0, y: 0, o: 1, last: '', lastO: '' };
  for (const a of Object.values(A)) a.el._anim = a;
  const items = $$('[data-anim^="item"]').map((el) => el._anim);
  const invTop = [0, 1, 2].map((c) => A['inv' + c + 't']), invBot = [0, 1, 2].map((c) => A['inv' + c + 'b']);
  const rows = $$('[data-anim^="cl"]').map((el) => el._anim);
  const fls = $$('[data-anim^="fl"]').map((el) => el._anim);
  // (the mark's shadow twin has its own four bars, drawn in step)
  const bars = $$('.d-rect i').map((el) => ({ el, k: [...el.parentElement.children].indexOf(el), last: '' }));
  const SEG = [317.7, 211.8, 317.7, 211.8];   // the box's path, in its own units: top, right, bottom, left
  const SEG_L = SEG.reduce((a, b) => a + b, 0);
  const SEG_AT = SEG.map((_, k) => SEG.slice(0, k).reduce((a, b) => a + b, 0));   // where along the path each bar starts

  /* ---- the reveals (the page's fd-h2 lines, fd-paragraph words, fd-slide and fd-clip), on the tour's clock ---- */
  const RV = [
    { sel: '#rvInv', kind: 'line', y: (g) => g.inv + 212 },
    { sel: '#rvFewer', kind: 'line', y: (g) => g.comp + 144 },
    { sel: '#rvText', kind: 'word', y: (g) => g.comp + 332.8 },
    { sel: '#rvSel', kind: 'line', y: (g) => g.wrap + 176 },
    { sel: '#rvPrior', kind: 'slide', y: (g) => g.wrap + 208 },
    { sel: '#rvSq', kind: 'clip', y: (g) => g.wrap + 215.2 },
  ];
  const KIND = {
    line: { x: 100, stagger: 0.1 }, word: { x: 10, stagger: 0.04 }, slide: { x: 0, stagger: 0 }, clip: { x: 0, stagger: 0 },
  };
  const groups = RV.map((R) => {
    const root = $(R.sel);
    const els = R.kind === 'line' || R.kind === 'word' ? $$('.rv', root) : [root];
    return { ...R, ...KIND[R.kind], items: els.map((el, k) => ({ el, k, last: '', lastO: '' })), trig: 0, fired: false, age: 0, w: 0 };
  });
  const RV_DUR = 1.2;

  /* ---- layers ---- */
  const layers = $$('[data-depth]').map((el) => {
    const anims = [];
    for (let p = el.parentElement; p && p !== page && p !== vp; p = p.parentElement) if (p._anim) anims.push(p._anim);
    return { el, d: +el.dataset.depth, kind: el.dataset.kind || (nav.contains(el) ? 'vp' : 'page'), anims,
      twin: el._twin || null, parent: null, cx: 0, cy: 0, hh: 0, A: null, last: '', skip: false };
  });
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const winLayer = layers.find((L) => L.el === win);
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }
  const tones = $$('[data-tone]').map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));
  const secs = { diff: $('#s-diff'), inv: $('#s-inv'), comp: $('#s-comp'), foot: $('#s-foot') };
  // the nav and the scroll bar, in white and in black: what lies under each sets the mix
  const inks = [
    { x: 44, y0: 16, y1: 65.7, w: $('.n-logo .ink-w'), k: $('.n-logo .ink-k'), last: '' },
    { x: 1392, y0: 27.8, y1: 53.8, w: $('.n-burger .ink-w'), k: $('.n-burger .ink-k'), last: '' },
  ];
  const sbarW = $('.sbar .ink-w'), sbarK = $('.sbar .ink-k');

  /* ---- state ---- */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, VW = DW, maxScroll = 7000, stops = STOPS.map(() => 0), G = geo(900);
  let frameDark = false;
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const T = { mode: 'tour', j: 0, t: 0, from: 0, dur: 1, v: 0 };
  // clock: the springs' idle sway; tourT: the tour's own time
  let scroll = 0, clock = 0, tourT = 0, tone = 0, lift = 1;
  let hovered = false, touchActive = false, touchOn = false, pointerLive = false;
  const pointer = { x: 0, y: 0 }, bl = { x: 0, y: -0.2 };
  let down = null, dragging = false, samples = [];
  let running = false, parentVisible = true, raf = 0, tPrev = performance.now();
  let lastTicks = '', lastTone = '', lastBar = '', snapTone = true;
  const frameLog = [];

  /* ================= layout ================= */
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }
  function layout() {
    const framed = MAT > 0 || (!embed && get('card.frame'));
    const [aw, ah] = String(get('card.aspect')).split(':').map(Number);
    stage.style.setProperty('--size', get('card.cardSize'));
    stage.style.setProperty('--ar', (aw / ah) || 1.6);
    card.classList.toggle('is-framed', framed);
    card.style.setProperty('--frame-color', get('card.frameColor'));
    frameDark = luminance(get('card.frameColor')) < 0.35;
    card.classList.toggle('ruler-inside', framed || embed);
    slot.classList.toggle('is-bleed', !framed && !embed);
    slot.classList.toggle('no-ruler', !get('card.ruler'));
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
    card.style.setProperty('--bloom-d', (cardW * get('light.bloomSize')) + 'px');
    winLayer.d = framed ? 0.1 : 0;
    const winW = cardW - 2 * mx, winH = cardH - 2 * my;
    // fit the width; a frame tall enough to show more than MAX_VH of page crops the sides instead (never letterboxed)
    s = Math.max(winW / DW, winH / MAX_VH);
    VW = winW / s; VH = winH / s;
    G = geo(VH);
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.transform = `translate3d(${(-(DW - VW) / 2 * s).toFixed(2)}px, 0, 0) scale(${s})`;
    secs.diff.style.top = G.diff + 'px'; secs.diff.style.height = (G.inv - G.diff) + 'px';
    secs.inv.style.top = G.inv + 'px';
    secs.comp.style.top = G.comp + 'px';
    secs.foot.style.top = G.foot + 'px';
    page.style.height = G.H + 'px';
    persp.style.perspective = (get('tilt.perspective') * cw) + 'px';
    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.hh = L.el.offsetHeight / 2;
      L.last = '';
      if (L.twin) L.twin.last = '';
    }
    for (const t of tones) { t.y0 = posIn(t.el, page)[1] - t.el.offsetHeight / 2; t.y1 = t.y0 + t.el.offsetHeight; }
    for (const g of groups) { g.trig = g.y(G) - 1.6 * VH; g.w = g.kind === 'slide' ? g.items[0].el.offsetWidth : 0; }
    maxScroll = Math.max(0, G.H - VH);
    stops = STOPS.map((S) => clamp(S.y(VH, G, maxScroll), 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    for (const a of Object.values(A)) { a.last = ''; a.lastO = ''; }
    if (T.mode === 'tour') seekTime(tourT, true);   // the stops have moved with the screen height: back on the tour's own frame
  }

  /* ================= the page's motion, from the scroll ================= */
  function pageAt(y) {
    const g = G;
    // the hero: the headline drifts down 1em, the card rises its overhang (card height less the links' height)
    const ph = c01(y / g.hero);
    A.h1.y = 86.4 * ph;
    A.card.y = (g.cardH - 278) * (1 - ph);
    // what makes S32 different: pinned for 80vh while the hero's bottom climbs from the screen's bottom to 20%;
    // the mark rises, its box draws, "different" slides in, while it climbs to 15%
    A.dtop.y = clamp(y - g.pin0, 0, 0.8 * VH);
    const pd = c01((y - g.pin0) / (0.85 * VH));
    A.logo.y = 133.2 * (1 - pd);
    A.diff.x = 444.9 * (1 - pd);
    const drawn = pd * SEG_L;
    for (const b of bars) {
      const u = c01((drawn - SEG_AT[b.k]) / SEG[b.k]);
      const str = b.k % 2 ? `scaleY(${u.toFixed(4)})` : `scaleX(${u.toFixed(4)})`;
      if (str !== b.last) { b.el.style.transform = str; b.last = str; }
    }
    // the rows' panel slides in 100px as its top climbs the screen's bottom tenth; each row rises 100px and fades up
    A.dbot.x = 100 * (1 - c01((y - (g.dBot - VH)) / (0.1 * VH)));
    items.forEach((a, k) => {
      const q = c01((y - (g.dBot + k * 274.6 + 100 - VH)) / (0.3 * VH));
      a.y = 100 * (1 - q); a.o = q;
    });
    // where we invest: the top cards, then the bottom ones, rise 100px, the right column first (a tenth apart)
    const tA = c01((y - (g.inv + 293.3 - VH)) / 592.9) * 1.2, tB = c01((y - (g.inv + 568.7 - VH)) / 592.9) * 1.2;
    for (let c = 0; c < 3; c++) {
      const off = (2 - c) * 0.1;
      invTop[c].y = 100 * (1 - c01(tA - off));
      invBot[c].y = 100 * (1 - c01(tB - off));
    }
    // fewer bets: pinned at the top from its own top until the panel's top reaches it, drifting up 100px;
    // the panel slides from the third column to the left edge over the last three quarters of that
    const span = g.wrap - g.comp;
    A.ch.y = y < g.comp ? 0 : y <= g.wrap ? (y - g.comp) - 100 * c01((y - g.comp) / span) : -100;
    A.wrap.x = 205.8 * (1 - c01((y - (g.comp + 0.2593 * span)) / (0.7407 * span)));
    // each company comes in 100px from the right while its top climbs from the screen's bottom to its middle
    // (the page leaves this one on its default ease, power1.out)
    rows.forEach((a, k) => { a.x = 100 * (1 - p1Out((y - (g.wrap + 326.4 + k * 104.53 - VH)) / (0.5 * VH))); });
    // the footer (its triggers 80vh early, as on the live page): the card rises its overhang, the links slide in 64px
    const early = 0.8 * VH;
    A.fc.y = -233.2 * c01((y - (g.foot - VH - early)) / 527.4);
    fls.forEach((a, k) => {
      const top = g.foot + k * 59.4;
      a.x = 64 * (1 - p4Out((y - (top - VH - early)) / Math.max(1, 59.4 + 0.1 * VH)));
    });
    for (const a of Object.values(A)) {
      const str = a.x || a.y ? `translate3d(${a.x.toFixed(2)}px, ${a.y.toFixed(2)}px, 0)` : 'translate3d(0, 0, 0)';
      if (str !== a.last) { a.el.style.transform = str; a.last = str; }
      const o = a.o.toFixed(3);
      if (o !== a.lastO) { a.el.style.opacity = o; a.lastO = o; }
    }
  }

  /* the reveals: a group fires once its trigger is passed and resets once the page is back above it
     (always out of sight: the triggers sit 80vh below the screen) */
  function stepReveals(y, dt) {
    for (const g of groups) {
      if (!g.fired && y >= g.trig) { g.fired = true; g.age = 0; }
      else if (g.fired && y < g.trig - 40) g.fired = false;
      else if (g.fired) g.age += dt;
    }
  }
  function renderReveals() {
    for (const g of groups) {
      for (const it of g.items) {
        const p = g.fired ? p4Out((g.age - it.k * g.stagger) / RV_DUR) : 0;
        let str;
        if (g.kind === 'clip') str = `scaleX(${p.toFixed(4)})`;
        else str = `translate3d(${((g.kind === 'slide' ? g.w : g.x) * (1 - p)).toFixed(2)}px, 0, 0)`;
        if (str !== it.last) { it.el.style.transform = str; it.last = str; }
        const o = g.kind === 'clip' ? '1' : p.toFixed(3);
        if (o !== it.lastO) { it.el.style.opacity = o; it.lastO = o; }
      }
    }
  }

  /* ================= the tour: a pure function of its own clock, so every loop closes exactly on the hero.
     A drag takes over (drag, coast, wait), then a glide hands back to the next stop and the tour clock
     picks up at that stop's hold. ================= */
  function tourAt(t) {
    t = wrapT(t);
    for (let i = 0; i < STOPS.length; i++) {
      const S = STOPS[i], j = (i + 1) % STOPS.length;
      if (t < S.hold) return { i, y: stops[i] };
      t -= S.hold;
      if (t < S.move) return { i, y: stops[i] + (stops[j] - stops[i]) * ease(t / S.move) };
      t -= S.move;
    }
    return { i: 0, y: stops[0] };
  }
  function resume() {
    // the next stop at or below where it was let go; past the last one, glide home
    let j = stops.findIndex((y) => y >= scroll - 24);
    if (j < 0) j = 0;
    const dist = Math.abs(stops[j] - scroll);
    if (dist < 2) { T.mode = 'tour'; tourT = STARTS[j]; scroll = stops[j]; return; }
    T.mode = 'glide'; T.j = j; T.from = scroll; T.t = 0; T.dur = clamp(0.7 + dist / 1500, 0.9, 2.6);
  }
  // put the tour at time t: the scroll from the tour, the reveals replayed from the loop's start (the hero,
  // where none has fired) at a fixed step, so a seek lands on the frame the tour itself plays
  function seekTime(t, keepMode) {
    tourT = wrapT(t);
    if (!keepMode) T.mode = 'tour';
    for (const g of groups) { g.fired = false; g.age = 0; }
    const h = 1 / 120;
    for (let u = 0; u < tourT; u += h) stepReveals(tourAt(u).y, Math.min(h, tourT - u));
    if (T.mode === 'tour') scroll = tourAt(tourT).y;
    snapTone = true;
  }
  function advance(dt, still) {
    if (still) return;
    const tdt = dt * get('motion.scrollSpeed');
    if (dragging) return;
    if (T.mode === 'tour') { tourT = wrapT(tourT + tdt); scroll = tourAt(tourT).y; return; }
    if (T.mode === 'coast') {
      const tau = 0.33 * get('drag.momentum');
      if (tau <= 0.001) T.v = 0;
      scroll += T.v * dt;
      T.v *= Math.exp(-dt / Math.max(tau, 0.001));
      if (scroll <= 0 || scroll >= maxScroll) { scroll = clamp(scroll, 0, maxScroll); T.v = 0; }
      if (Math.abs(T.v) < 12) { T.mode = 'wait'; T.t = 0; }
      return;
    }
    if (T.mode === 'wait') { T.t += dt; if (T.t >= get('drag.resumeAfter')) resume(); return; }
    if (T.mode === 'glide') {
      T.t += tdt;
      const u = Math.min(1, T.t / T.dur);
      scroll = T.from + (stops[T.j] - T.from) * ease(u);
      if (u >= 1) { T.mode = 'tour'; tourT = STARTS[T.j]; }
    }
  }

  function step(S, target, k, c, dt) {
    const n = Math.ceil(dt / (1 / 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) { S.v += (-k * (S.x - target) - c * S.v) * h; S.x += S.v * h; }
  }

  /* ================= the frame ================= */
  function frame(now) {
    if (!running) return;
    const raw = Math.max(0, (now - tPrev) / 1000);
    const dt = Math.min(0.05, raw);
    tPrev = now; clock += dt;
    frameLog.push(raw * 1000); if (frameLog.length > 600) frameLog.shift();
    const still = reduced.matches;
    const k = get('motion.stiffness'), c = get('motion.damping'), tiltMax = get('tilt.tiltMax');
    const engaged = hovered || touchActive || touchOn || dragging || get('debug.hold') || still;

    let nx = 0, ny = 0;
    if (still) { nx = -0.38; ny = -0.3; }
    else if (engaged) {
      if (pointerLive && (hovered || touchActive)) { nx = pointer.x; ny = pointer.y; }
      else { nx = 0.42 * Math.sin(clock * 0.55); ny = 0.3 * Math.sin(clock * 0.77 + 1.1); }
    }
    const hT = engaged ? 1 : 0;
    if (still) { spr.rx.x = -ny * tiltMax; spr.ry.x = nx * tiltMax; spr.h.x = 1; spr.rx.v = spr.ry.v = spr.h.v = 0; }
    else {
      step(spr.rx, -ny * tiltMax, k, c, dt);
      step(spr.ry, nx * tiltMax, k, c, dt);
      step(spr.h, hT, k * 0.8, c * 0.95, dt);
    }
    // the bloom chases the pointer a touch behind it, so it feels like light, not a cursor
    const bx = still ? -0.38 : (pointerLive ? pointer.x : nx), by = still ? -0.3 : (pointerLive ? pointer.y : ny);
    const f = still ? 1 : 1 - Math.exp(-dt / 0.08);
    bl.x += (bx - bl.x) * f; bl.y += (by - bl.y) * f;

    advance(dt, still);
    scroll = clamp(scroll, 0, maxScroll);
    if (!still) stepReveals(scroll, dt * get('motion.scrollSpeed'));
    render(dt, still);
    raf = requestAnimationFrame(frame);
  }

  // how much of a nav mark's height lies over the page's light parts (white and beige)
  function lightUnder(I) {
    const y0 = scroll + I.y0, y1 = scroll + I.y1, g = G, spans = [];
    spans.push([g.inv, g.comp]);                                   // where we invest (white, over everything above it)
    if (I.x >= A.wrap.x) spans.push([g.wrap, g.foot]);             // the select companies panel
    if (I.x >= 822.9) { const t = g.hero - g.cardH + A.card.y; spans.push([t, Math.min(t + g.cardH, g.inv)]); }   // the hero's card
    let lit = 0;
    for (const [a, b] of spans) lit += Math.max(0, Math.min(b, y1) - Math.max(a, y0));
    return c01(lit / (y1 - y0));
  }

  function render(dt, still) {
    const rx = spr.rx.x, ry = spr.ry.x;
    const hc = clamp(spr.h.x, -0.2, 1.2), h01 = clamp(spr.h.x, 0, 1);
    const depth = get('layers.depth'), par = get('layers.parallax'), spread = get('layers.spread');
    const tiltMax = get('tilt.tiltMax');
    lift = 1 + (get('tilt.hoverScale') - 1) * hc;
    const shadowK = get('light.shadow');

    page.style.transform = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    pageAt(scroll);
    renderReveals();

    // the nav's marks and the scroll bar: white over the dark, black over the light
    for (const I of inks) {
      const v = lightUnder(I).toFixed(3);
      if (v !== I.last) { I.last = v; I.k.style.opacity = v; I.w.style.opacity = (1 - v).toFixed(3); }
    }
    const pb = (maxScroll ? scroll / maxScroll : 0).toFixed(4);
    if (pb !== lastBar) {
      lastBar = pb;
      const lb = lightUnder({ x: 1439, y0: 0, y1: VH * +pb || 1 });
      sbarW.style.transform = sbarK.style.transform = `scaleY(${pb})`;
      sbarK.style.opacity = lb.toFixed(3); sbarW.style.opacity = (1 - lb).toFixed(3);
    }

    card.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${(lift / K).toFixed(5)})`;

    // the eye, in card space: the perspective distance in front of the card centre, rotated into the card's frame
    const P = get('tilt.perspective') * cardW / lift;
    const a = rx * Math.PI / 180, b = ry * Math.PI / 180;
    const E = { x: -P * Math.sin(b) * Math.cos(a), y: P * Math.sin(a), z: P * Math.cos(a) * Math.cos(b) };
    const Zsep = 0.16 * cardW * depth;
    const quiet = Math.abs(hc) < 0.0005 && Math.abs(rx) < 0.001 && Math.abs(ry) < 0.001;
    const reach = VH * 0.5 + VH * 0.6;

    for (const L of layers) {
      let ox = 0, oy = 0;
      for (const an of L.anims) { ox += an.x; oy += an.y; }
      if (L.kind === 'page') {
        L.skip = (L.parent && L.parent.skip) || Math.abs(L.cy + oy - scroll - VH / 2) > reach + L.hh;
        if (L.skip) continue;
      }
      const u = L.kind === 'card' ? 1 : s;
      const Q = L.kind === 'card' ? { x: L.cx - cardW / 2, y: L.cy - cardH / 2 }
        : { x: (L.cx + ox - DW / 2) * s, y: (L.cy + oy - (L.kind === 'page' ? scroll : 0) - VH / 2) * s };
      const project = (d, extra) => {
        const z = d * Zsep * hc;
        const t = E.z / Math.max(E.z * 0.25, E.z - z);
        return { Q, z, t, o: { x: (t - 1) * (spread * Q.x - par * E.x) + extra.x, y: (t - 1) * (spread * Q.y - par * E.y) + extra.y } };
      };
      L.A = project(L.d, { x: 0, y: 0 });
      const write = (el, Ap, cache) => {
        let o = Ap.o, sc = Ap.t;
        const Pp = L.parent && L.parent.A;
        if (Pp) {
          o = { x: (Ap.Q.x - Pp.Q.x) * (1 / Pp.t - 1) + (Ap.o.x - Pp.o.x) / Pp.t, y: (Ap.Q.y - Pp.Q.y) * (1 / Pp.t - 1) + (Ap.o.y - Pp.o.y) / Pp.t };
          sc = Ap.t / Pp.t;
        }
        const str = quiet ? '' : `translate3d(${(o.x / u).toFixed(2)}px, ${(o.y / u).toFixed(2)}px, 0) scale(${sc.toFixed(5)})`;
        if (str !== cache.last) { el.style.transform = str; cache.last = str; }
      };
      write(L.el, L.A, L);
      if (L.twin) {
        const Tw = L.twin;
        const throwPx = Math.max(0, L.A.z - Tw.surface * Zsep * hc);
        write(Tw.el, project(Tw.surface, { x: throwPx * LIGHT.x, y: throwPx * LIGHT.y }), Tw);
        const op = (Tw.alpha * shadowK * h01).toFixed(3);
        if (op !== Tw.op) { Tw.el.style.opacity = op; Tw.op = op; }
      }
    }

    // the framed window's own shadow on the card ground
    if (card.classList.contains('is-framed')) {
      const W = winLayer.A;
      const throwPx = Math.max(0, W.z) + cardW * 0.012;
      winShadow.style.transform = `translate3d(${(W.o.x + throwPx * LIGHT.x * 1.4).toFixed(2)}px, ${(W.o.y + throwPx * LIGHT.y * 1.4).toFixed(2)}px, 0) scale(${(0.985 + 0.01 * h01).toFixed(4)})`;
      winShadow.style.opacity = (0.4 + 0.3 * h01 * shadowK).toFixed(3);
    }

    // the light: a round bloom under the pointer, a faint rim nearest it, and the card's own shadow
    const bxp = (bl.x + 1) / 2 * cardW, byp = (bl.y + 1) / 2 * cardH;
    bloom.style.transform = `translate3d(${bxp.toFixed(1)}px, ${byp.toFixed(1)}px, 0)`;
    bloom.style.opacity = (get('light.bloom') * h01).toFixed(3);
    rimLight.style.transform = `translate3d(${bxp.toFixed(1)}px, ${byp.toFixed(1)}px, 0)`;
    rim.style.opacity = (get('light.rim') * h01).toFixed(3);
    const ex = tiltMax ? ry / tiltMax : 0, ey = tiltMax ? -rx / tiltMax : 0;
    cshadow.style.transform = `translate3d(${(-ex * 0.035 * cw).toFixed(1)}px, ${((0.03 + 0.035 * h01 - ey * 0.02) * cw).toFixed(1)}px, 0) scale(${(0.96 + 0.06 * h01).toFixed(3)})`;
    // embedded, the card sits exactly on its tile at rest: its shadow only shows once it lifts
    cshadow.style.opacity = ((embed ? 0.42 * h01 : 0.18 + 0.42 * h01) * (0.4 + shadowK)).toFixed(3);

    // the ruler: notches slide with the scroll, the reading mark stays put
    const frac = ((scroll / TICK_PER) % 1 + 1) % 1;
    const tk = frac.toFixed(4);
    if (tk !== lastTicks) {
      lastTicks = tk;
      ticksOut.style.transform = `translate3d(0, ${(-frac * 6).toFixed(2)}px, 0)`;
      for (const el of ticksIn) el.style.transform = `translate3d(0, ${(-frac * 6 * K).toFixed(2)}px, 0)`;
    }
    // inside the card its ink follows the section under the reading mark (framed, it sits on the card ground)
    let dark = 0;
    if (card.classList.contains('is-framed')) dark = frameDark ? 1 : 0;
    else if (embed) {
      const yr = scroll + VH / 2;
      for (const t of tones) if (yr >= t.y0 && yr < t.y1) dark = t.dark ? 1 : 0;
    }
    // (a jump in time, or the first frame, lands with the ink already right: no fade through)
    tone += (dark - tone) * (still || snapTone ? 1 : 1 - Math.exp(-dt / 0.18));
    snapTone = false;
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
  const pxPerScreen = () => K / (s * lift);   // design px under one screen px
  function open() {
    // the site frames the card and decides what opening means; the card never navigates itself
    if (window.parent !== window) window.parent.postMessage({ type: 'ks-card-open' }, '*');
    window.dispatchEvent(new CustomEvent('ks-card-open'));
  }
  function endPress(e, cancelled) {
    if (!down || e.pointerId !== down.id) return;
    const wasTouch = down.type === 'touch';
    if (!cancelled && down.moved < CLICK_PX) {
      if (wasTouch && !embed) { touchOn = !touchOn; }
      open();
    }
    if (dragging) {
      // momentum: the speed over the last tenth of a second, if the hand was still moving when it let go
      let v = 0;
      const tNow = e.timeStamp;
      const recent = samples.filter((p) => tNow - p[0] < 100);
      if (!cancelled && recent.length > 1 && tNow - recent[recent.length - 1][0] < 80) {
        const [t0, s0] = recent[0], [t1, s1] = recent[recent.length - 1];
        if (t1 > t0) v = clamp((s1 - s0) / ((t1 - t0) / 1000), -9000, 9000);
      }
      T.mode = 'coast'; T.v = v;
    }
    dragging = false; persp.classList.remove('is-dragging');
    down = null; samples = [];
    if (wasTouch) { touchActive = false; pointerLive = false; }
  }
  persp.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { hovered = true; setPointer(e); } });
  persp.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && !down) { hovered = false; pointerLive = false; } });
  persp.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, moved: 0, lx: 0, ly: 0 };
    const canDrag = e.pointerType !== 'touch' || touchDrag;
    if (canDrag) { try { persp.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } }
    if (e.pointerType === 'touch' && touchDrag) touchActive = true;
    if (T.mode === 'coast') { T.v = 0; T.mode = 'wait'; T.t = 0; }   // a press catches a flick, like a phone
    setPointer(e);
  });
  persp.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') hovered = true;
    if (e.pointerType !== 'touch' || touchDrag) setPointer(e);
    if (!down || e.pointerId !== down.id) return;
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (!dragging && down.moved > 3 && (down.type !== 'touch' || touchDrag)) {
      dragging = true; persp.classList.add('is-dragging');
      T.mode = 'drag'; T.v = 0;
      down.lx = e.clientX; down.ly = e.clientY; samples = [];
    }
    if (dragging) {
      // either way: drag up and the page scrolls down, like a phone (1:1); drag right and it
      // scrubs further down, left back up (drag.scrub px of page per px). The axis that has
      // moved more since the press wins, applied as a step so a change of axis never jumps.
      const ddx = e.clientX - down.lx, ddy = e.clientY - down.ly;
      down.lx = e.clientX; down.ly = e.clientY;
      const across = Math.abs(e.clientX - down.x) > Math.abs(e.clientY - down.y);
      const stepPx = across ? ddx * get('drag.scrub') : -ddy;
      scroll = clamp(scroll + stepPx * pxPerScreen(), 0, maxScroll);
      samples.push([e.timeStamp, scroll]);
      if (samples.length > 24) samples.shift();
    }
  });
  persp.addEventListener('pointerup', (e) => {
    endPress(e, false);
    if (e.pointerType !== 'touch') {
      const r = persp.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { hovered = false; pointerLive = false; }
    }
  });
  persp.addEventListener('pointercancel', (e) => endPress(e, true));
  persp.addEventListener('dragstart', (e) => e.preventDefault());

  /* ================= pausing: hidden tab, or the framing page says the tile is off screen ================= */
  function wake() {
    const run = !document.hidden && parentVisible;
    if (run && !running) { running = true; tPrev = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!run && running) { running = false; cancelAnimationFrame(raf); }
  }
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'ks-card') return;
    if (typeof d.at === 'number' && isFinite(d.at) && !dragging) seekTime(d.at);   // never mid-drag
    if (typeof d.visible === 'boolean') { parentVisible = d.visible; wake(); }
  });
  reduced.addEventListener('change', () => { if (reduced.matches) seekTime(0); });

  /* ================= the handle ================= */
  const api = {
    embed,
    defaults: DEFAULTS,
    values: V,
    set(values, path) {
      Object.assign(V, values);
      card.classList.toggle('show-layers', !!V['debug.outlines']);
      if (!path || /^card\.|^tilt\.perspective|^light\.bloomSize/.test(path)) layout();
    },
    layout,
    // the tour's length in seconds (the site records one tour as the tile's resting loop)
    get period() { return PERIOD; },
    // a handle for the verify scripts
    get scroll() { return scroll; }, set scroll(y) { scroll = clamp(y, 0, maxScroll); T.mode = 'wait'; T.t = -1e9; },
    get mode() { return T.mode; }, get stop() { return tourAt(tourT).i; }, get tourT() { return tourT; },
    get h() { return spr.h.x; }, get running() { return running; }, get layers() { return layers.length; },
    get stops() { return stops.slice(); }, get start() { return STARTS.slice(); }, get maxScroll() { return maxScroll; }, get VH() { return VH; },
    get frames() { return frameLog.slice(); },
    seekTime,
    seek(i, t = 0) { seekTime(STARTS[clamp(i | 0, 0, STOPS.length - 1)] + t); },
  };
  window.__s32Card = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  layout();
  wake();
})();
