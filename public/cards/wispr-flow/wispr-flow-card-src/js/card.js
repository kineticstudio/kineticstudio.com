/* The Wispr Flow work card: one spring-driven loop, transforms and opacity only.

   The miniature is the live site's 1440px page, laid out in layers. Every
   [data-depth] element is a layer; on hover the card tilts toward the pointer and
   each layer is projected as if it sat at its own height above the card plane, so
   the parallax matches the real 3D tilt. The tour never stops for the hover; a
   press and drag scrolls the miniature by hand (with momentum), and the tour picks
   up again from wherever it was let go.

   Everything that moves on its own (the voice pills' bars, the logo band) runs on
   the tour's own clock and comes round once a tour, so the tour is one seamless
   loop: the site rests the tile on this tour recorded and hands over to the live
   card with {type: "ks-card", at: seconds}. */

const DW = 1440;                       // Wispr Flow's design width
const MAX_VH = 1100;                   // a frame taller than the page can fill crops the sides rather than shrinking the page
const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset on the card ground
// the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
// &mat=F draws the card framed, its window inset F x the card's width on every side
const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height, light from above and a touch left
const TICK_PER = 80;                   // design px of scroll per ruler notch
const CLICK_PX = 6;                    // a press that moves less than this is a click
const NAV_DROP = 72;                   // the nav sits under the banner until the page scrolls past it

/* the tour: hold on a stop, glide to the next, every leg eased in and out (seconds at speed 1) */
const STOPS = [
  { id: 's-hero', off: 0, hold: 2.8, move: 2.0 },
  { id: 's-green', off: 0, hold: 1.8, move: 2.0 },
  { id: 's-how', off: 0, hold: 1.8, move: 2.0 },
  { id: 's-testi', off: 0, hold: 1.8, move: 2.0 },
  { id: 's-cta', off: -18, hold: 1.8, move: 2.6 },
];
const PERIOD = STOPS.reduce((a, S) => a + S.hold + S.move, 0);   // 20.6 s

export const DEFAULTS = {
  'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
  'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
  'light.bloom': 0.7, 'light.bloomSize': 1.3, 'light.rim': 0.5, 'light.shadow': 0.6,
  'motion.scrollSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
  'drag.momentum': 1, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.2,
  'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.ruler': true,
  'debug.outlines': false, 'debug.hold': false,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const TAU = Math.PI * 2;
const wrap = (t) => ((t % PERIOD) + PERIOD) % PERIOD;
// an angular speed (rad/s) moved to the nearest one that turns a whole number of times a tour
const perTour = (w) => Math.max(1, Math.round(w * PERIOD / TAU)) * TAU / PERIOD;

export function startCard({ embed = false } = {}) {
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav'), navShift = $('#navShift');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rimLight = $('#rimLight'), rim = $('#rim');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = [...document.querySelectorAll('.ruler-in .ticks')];
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
  const marquee = $('#marquee');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const V = { ...DEFAULTS };
  const get = (k) => V[k];
  // inside the site a finger scrolls the site, not the miniature, unless &touchdrag=1
  const touchDrag = !embed || new URLSearchParams(location.search).get('touchdrag') === '1';
  if (!touchDrag) persp.style.touchAction = 'pan-y';

  /* ---- shadow twins: a darkened, blurred copy left on the surface under a lifted layer ---- */
  for (const el of document.querySelectorAll('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(true);
    for (const n of [tw, ...tw.querySelectorAll('*')]) {
      for (const a of ['data-layer', 'data-depth', 'data-shadow', 'id']) n.removeAttribute(a);
    }
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }

  /* ---- layers ---- */
  const layers = [...document.querySelectorAll('[data-depth]')].map((el) => ({
    el, d: +el.dataset.depth, kind: el.dataset.kind || (nav.contains(el) ? 'vp' : 'page'),
    twin: el._twin || null, parent: null, cx: 0, cy: 0, hh: 0, A: null, last: '', skip: false,
  }));
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

  /* ---- things that move on their own (transform only), all on the motion clock so a tour is one seamless loop ---- */
  // each bar breathes at its own speed, nudged (by at most a few percent) to a whole number of breaths a tour
  const BREATH = perTour(1.3);
  const barSets = [...document.querySelectorAll('.bars')].map((b) => ({
    y: posIn(b, page)[1], nav: false,
    bars: [...b.children].map((el, i) => ({ el, w: perTour((1.7 + ((i * 7919) % 13) / 5) * 2.2), p: (i * 2.399) % (Math.PI * 2), last: '' })),
  }));
  const logosSec = $('#s-logos');
  const tones = [...document.querySelectorAll('[data-tone]')].map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));

  /* ---- state ---- */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, VW = DW, maxScroll = 5000, stops = STOPS.map(() => 0), marqueeW = 1452;
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const T = { mode: 'tour', j: 0, t: 0, from: 0, dur: 1, v: 0 };
  // clock: the springs' idle sway; tourT: the tour's own time; tt: the motion clock (bars, logos),
  // which never stops for a drag. tt and tourT are one and the same until someone drags.
  let scroll = 0, clock = 0, tt = 0, tourT = 0, tone = 0, lift = 1, logosWrap = PERIOD / 2;
  let hovered = false, touchActive = false, touchOn = false, pointerLive = false;
  const pointer = { x: 0, y: 0 }, bl = { x: 0, y: -0.2 };
  let down = null, dragging = false, samples = [];
  let running = false, parentVisible = true, raf = 0, tPrev = performance.now();
  let lastNav = '', lastTicks = '', lastTone = '', snapTone = true;

  function layout() {
    const framed = MAT > 0 || (!embed && get('card.frame'));
    const [aw, ah] = String(get('card.aspect')).split(':').map(Number);
    stage.style.setProperty('--size', get('card.cardSize'));
    stage.style.setProperty('--ar', (aw / ah) || 1.6);
    card.classList.toggle('is-framed', framed);
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
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.transform = `translate3d(${(-(DW - VW) / 2 * s).toFixed(2)}px, 0, 0) scale(${s})`;
    persp.style.perspective = (get('tilt.perspective') * cw) + 'px';
    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.hh = L.el.offsetHeight / 2;
      L.last = '';
      if (L.twin) L.twin.last = '';
    }
    for (const B of barSets) B.y = nav.contains(B.bars[0]?.el) ? -1 : posIn(B.bars[0].el.parentElement, page)[1];
    for (const t of tones) { t.y0 = posIn(t.el, page)[1] - t.el.offsetHeight / 2; t.y1 = t.y0 + t.el.offsetHeight; }
    maxScroll = Math.max(0, page.offsetHeight - VH);
    stops = STOPS.map((S) => { const el = document.getElementById(S.id); return clamp(posIn(el, page)[1] - el.offsetHeight / 2 + S.off, 0, maxScroll); });
    marqueeW = marquee ? marquee.scrollWidth / 2 : 1452;
    logosWrap = hiddenMid(posIn(logosSec, page)[1] - logosSec.offsetHeight / 2, posIn(logosSec, page)[1] + logosSec.offsetHeight / 2);
    scroll = clamp(scroll, 0, maxScroll);
  }

  /* ---- the tour: a pure function of its own clock, so every loop closes exactly on the hero.
     A drag takes over (drag, coast, wait), then a glide hands back to the next stop and the
     tour clock picks up at that stop's hold. The site's resting loop is this tour recorded,
     so a hovered tile tells the card where the loop is ({type: "ks-card", at}) and the live
     card picks up from that very frame. ---- */
  const STARTS = []; { let a = 0; for (const S of STOPS) { STARTS.push(a); a += S.hold + S.move; } }
  function tourAt(t) {
    t = wrap(t);
    for (let i = 0; i < STOPS.length; i++) {
      const S = STOPS[i], j = (i + 1) % STOPS.length;
      if (t < S.hold) return { i, y: stops[i] };
      t -= S.hold;
      if (t < S.move) return { i, y: stops[i] + (stops[j] - stops[i]) * ease(t / S.move) };
      t -= S.move;
    }
    return { i: 0, y: stops[0] };
  }
  // the logo band can't run a whole number of times a tour at its own pace, so its clock jumps
  // back a tour at the middle of the longest stretch it spends out of the frame (never seen)
  function hiddenMid(y0, y1) {
    const N = 480, seen = (k) => { const y = tourAt(k / N * PERIOD).y; return y1 > y - VH * 0.25 && y0 < y + VH * 1.25; };
    let best = 0, at = PERIOD / 2;
    for (let k = 0, run = 0; k < 2 * N; k++) {
      if (seen(k % N)) { run = 0; continue; }
      if (++run > best && run <= N) { best = run; at = (k - (run - 1) / 2) / N * PERIOD; }
    }
    return wrap(at);
  }
  const local = (t, w) => w - PERIOD + wrap(t - w);   // t, running on through the seam and jumping back at w
  function resume() {
    // the next stop at or below where it was let go; past the last one, glide home
    let j = stops.findIndex((y) => y >= scroll - 24);
    if (j < 0) j = 0;
    const dist = Math.abs(stops[j] - scroll);
    if (dist < 2) { T.mode = 'tour'; tourT = STARTS[j]; scroll = stops[j]; return; }
    T.mode = 'glide'; T.j = j; T.from = scroll; T.t = 0; T.dur = clamp(0.7 + dist / 1500, 0.9, 2.6);
  }
  function seekTime(t) {
    tt = tourT = wrap(t);
    T.mode = 'tour';
    scroll = tourAt(tourT).y;
    snapTone = true;
  }
  function advance(dt, still) {
    if (still) return;
    const tdt = dt * get('motion.scrollSpeed');
    tt = wrap(tt + tdt);
    if (dragging) return;
    if (T.mode === 'tour') { tourT = wrap(tourT + tdt); scroll = tourAt(tourT).y; return; }
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

  /* ---- the frame ---- */
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (now - tPrev) / 1000));
    tPrev = now; clock += dt;
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
    render(dt, still);
    raf = requestAnimationFrame(frame);
  }

  function render(dt, still) {
    const rx = spr.rx.x, ry = spr.ry.x;
    const hc = clamp(spr.h.x, -0.2, 1.2), h01 = clamp(spr.h.x, 0, 1);
    const depth = get('layers.depth'), par = get('layers.parallax'), spread = get('layers.spread');
    const tiltMax = get('tilt.tiltMax');
    lift = 1 + (get('tilt.hoverScale') - 1 + 0) * hc;
    const shadowK = get('light.shadow');

    page.style.transform = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    const navStr = `translate3d(0, ${Math.max(0, NAV_DROP - scroll).toFixed(2)}px, 0)`;
    if (navStr !== lastNav) { navShift.style.transform = navStr; lastNav = navStr; }

    card.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${(lift / K).toFixed(5)})`;

    // the eye, in card space: the perspective distance in front of the card centre, rotated into the card's frame
    const P = get('tilt.perspective') * cardW / lift;
    const a = rx * Math.PI / 180, b = ry * Math.PI / 180;
    const E = { x: -P * Math.sin(b) * Math.cos(a), y: P * Math.sin(a), z: P * Math.cos(a) * Math.cos(b) };
    const Zsep = 0.16 * cardW * depth;
    const quiet = Math.abs(hc) < 0.0005 && Math.abs(rx) < 0.001 && Math.abs(ry) < 0.001;
    const reach = VH * 0.5 + VH * 0.6;

    for (const L of layers) {
      if (L.kind === 'page') {
        L.skip = (L.parent && L.parent.skip) || Math.abs(L.cy - scroll - VH / 2) > reach + L.hh;
        if (L.skip) continue;
      }
      const u = L.kind === 'card' ? 1 : s;
      const Q = L.kind === 'card' ? { x: L.cx - cardW / 2, y: L.cy - cardH / 2 }
        : { x: (L.cx - DW / 2) * s, y: (L.cy - (L.kind === 'page' ? scroll : 0) - VH / 2) * s };
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
    if (embed && !card.classList.contains('is-framed')) {
      const yr = scroll + VH / 2;
      for (const t of tones) if (yr >= t.y0 && yr < t.y1) dark = t.dark ? 1 : 0;
    }
    // (a jump in time, or the first frame, lands with the ink already right: no fade through)
    tone += (dark - tone) * (still || snapTone ? 1 : 1 - Math.exp(-dt / 0.18));
    snapTone = false;
    const ts = tone.toFixed(3);
    if (ts !== lastTone) { lastTone = ts; inkLight.style.opacity = ts; inkDark.style.opacity = (1 - tone).toFixed(3); }

    // the voice pills breathe and the logo band runs, only while they are on screen
    if (!still) {
      for (const B of barSets) {
        const y = B.y < 0 ? scroll + VH / 2 : B.y;
        if (Math.abs(y - scroll - VH / 2) > VH) continue;
        for (const bar of B.bars) {
          const v = 0.55 + 0.45 * Math.sin(tt * bar.w + bar.p) * Math.sin(tt * BREATH + bar.p * 0.7);
          const str = `scaleY(${(0.35 + 0.85 * Math.abs(v)).toFixed(3)})`;
          if (str !== bar.last) { bar.el.style.transform = str; bar.last = str; }
        }
      }
      if (marquee && scroll < 2400) {
        const x = ((local(tt, logosWrap) * 34) % marqueeW + marqueeW) % marqueeW;
        marquee.style.transform = `translate3d(${(-x).toFixed(2)}px, 0, 0)`;
      }
    }
  }

  /* ---- input ---- */
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
    if (canDrag) { try { persp.setPointerCapture(e.pointerId); } catch {} }
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
      const step = across ? ddx * get('drag.scrub') : -ddy;
      scroll = clamp(scroll + step * pxPerScreen(), 0, maxScroll);
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

  /* ---- pausing: hidden tab, or the framing page says the tile is off screen ---- */
  function wake() {
    const run = !document.hidden && parentVisible;
    if (run && !running) { running = true; tPrev = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!run && running) { running = false; cancelAnimationFrame(raf); }
  }
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'ks-card') return;
    if (typeof d.at === 'number' && !dragging) seekTime(d.at);   // never mid-drag
    if (typeof d.visible === 'boolean') { parentVisible = d.visible; wake(); }
  });

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  layout();
  wake();

  const api = {
    set(values, path) {
      Object.assign(V, values);
      card.classList.toggle('show-layers', !!V['debug.outlines']);
      if (!path || /^card\.|^tilt\.perspective|^light\.bloomSize/.test(path)) layout();
    },
    values: V,
    layout,
    // a handle for the verify scripts
    get scroll() { return scroll; }, get mode() { return T.mode; }, get stop() { return tourAt(tourT).i; },
    get h() { return spr.h.x; }, get running() { return running; }, get layers() { return layers.length; },
    get stops() { return stops.slice(); }, get maxScroll() { return maxScroll; }, get period() { return PERIOD; },
    seek(i, t = 0) { seekTime(STARTS[clamp(i | 0, 0, stops.length - 1)] + t); },
    seekTime,
  };
  return api;
}
