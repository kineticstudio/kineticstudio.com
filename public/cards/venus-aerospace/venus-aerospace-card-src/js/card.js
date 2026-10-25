/* Venus Aerospace work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 20 s round, never paused by
     hover; a drag (up and down like a phone, or sideways to scrub) takes over,
     coasts, and the tour picks up from where it was left
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: the site's own scroll choreography (the hero video sinking at
     half speed, the headline tipping back, the nav sliding away on the way
     down and back on the way up, its bar darkening past the headline, copy
     rising in as it arrives) and light stand-ins for its videos (the plumes
     flicker, the RDRE engine turns a little, the team light breathes)

   It is a function of one clock, the tour's: every flicker and drift turns a
   whole number of times in one tour, so a recording of one tour closes on
   itself, and the site's resting loop hands over to the live card on hover
   ({type: "ks-card", at}, the loop's time) on exactly the frame it showed.

   window.venusCard is the handle the page's dials and the verify script use. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const EMBED = qs.has('embed') && qs.get('embed') !== '0';
  document.documentElement.classList.toggle('is-embed', EMBED);
  const BLEED = EMBED ? Math.max(0, parseFloat(qs.get('bleed')) || 0) : 0; // px of frame overhanging the tile
  const RADIUS = EMBED && qs.has('radius') ? Math.max(0, parseFloat(qs.get('radius')) || 0) : 6; // the card's corners, CSS px
  const TOUCH_DRAG = !EMBED || qs.get('touchdrag') === '1';               // in a tile, a swipe scrolls the site
  const CLICK = 6;                                                        // px: less is a click, more a drag

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav'), navIn = $('#navIn'), navBg = $('#navBg');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksIn = $('.notches-in .ticks'), ticksOut = $('.notches-out .ticks');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // the site's design width
  const HERO_REF = 900;                  // the window height the hero video was captured at
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left
  const SEC = { rdre: 2323, vdr: 1964, team: 900, foot: 798 }; // section heights, as on the live page

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.7, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.75,
    'motion.tourSpeed': 1, 'motion.flicker': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.scrub': 2.5, 'drag.momentum': 1, 'drag.friction': 0.32, 'drag.resumeAfter': 1.2,
    'card.cardSize': 40, 'card.frame': false, 'card.frameColor': '#4a1a08', // Hunter, Oct 25: "Venus Aerospace should have a darker background" (was #f2551c) 'card.notches': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  if (EMBED && qs.get('frame') === 'framed') V['card.frame'] = true;
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
      el, d: +el.dataset.depth, kind: el === win ? 'card' : nav.contains(el) ? 'vp' : 'page',
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
  const pinY = { hero: 0 };
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= the page's own motion ================= */
  // copy rises in as it arrives, as on the live page (twins included, so shadows match)
  const reveals = $$('.rv[data-reveal]').map((el) => ({ el, y: 0, last: '', op: '' }));
  // the hero headline tips back as the hero scrolls away (the live page blurs it too; here it fades)
  const h1s = $$('.h1 .rv').map((el) => ({ el, last: '', op: '' }));
  // stand-ins for the site's videos, each an inner element so the layer's own transform stays the engine's
  const amb = {
    flame: { el: $('#flame'), last: '', op: '' },
    plume: { el: $('#plumeGlow'), last: '', op: '' },
    rdre: { el: $('#rdreEng'), last: '' },
    vdr: { el: $('#vdrImg'), last: '' },
    vdrGlow: { el: $('#vdrGlow'), op: '' },
    team: { el: $('#teamImg'), last: '' },
    fGlow: { el: $('#fGlow'), op: '' },
  };
  const noise = (t, a, b, c) => (Math.sin(t * cyc(a)) + Math.sin(t * cyc(b) + 1.7) * 0.6 + Math.sin(t * cyc(c) + 4.1) * 0.35) / 1.95;
  // a rate (rad/s) moved to the nearest that turns a whole number of times in one tour, so the stand-ins loop with it
  const cyc = (w) => 2 * Math.PI * Math.max(1, Math.round(w * TOUR / (2 * Math.PI))) / TOUR;

  /* ================= state ================= */
  let cw = 576, ch = 432, K = 2.5, cardW = 1440, cardH = 1080;
  let s = 0.36, VH = 900, maxScroll = 5000, hs = 1;
  let rdreTop = 900, vdrTop = 3223, teamTop = 5187, footTop = 6087;
  let stops = [0, 0, 0, 0, 0, 0, 0];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, prevScroll = 0, phase = 0, ambT = 0, clock = 0, started = false;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let navShow = 1, navDir = 1, navBgT = 0, lastNav = '', lastNavBg = '', lastScrollStr = '', liftNow = 1;

  function layout() {
    stage.style.setProperty('--size', V['card.cardSize']);
    const framed = MAT > 0 || (!!V['card.frame']);
    card.classList.toggle('is-framed', framed);
    card.style.setProperty('--frame-color', V['card.frameColor']);
    card.classList.toggle('is-light-frame', luminance(V['card.frameColor']) > 0.55);
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
    // fit by cropping, never letterbox: the page is always 1440 wide and as tall as the window allows
    VH = Math.max(640, Math.round(DW * winH / winW));
    // the hero video covers its box as the live page's does: it grows with a taller window
    hs = Math.max(0.9, VH / HERO_REF);
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.setProperty('--hs', hs.toFixed(4));
    vp.style.transform = `scale(${s})`;
    persp.style.perspective = (V['tilt.perspective'] * cw) + 'px';
    card.style.transform = `scale(${1 / K})`;
    bloom.style.width = bloom.style.height = (V['light.bloomSize'] * cardW) + 'px';
    bloom.style.left = bloom.style.top = (-V['light.bloomSize'] * cardW / 2) + 'px';

    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.h = L.el.offsetHeight;
      if (L.twin) [L.twin.cx, L.twin.cy] = [L.cx, L.cy];
    }
    for (const r of reveals) r.y = posIn(r.el, page)[1] - r.el.offsetHeight / 2;
    rdreTop = VH; vdrTop = rdreTop + SEC.rdre; teamTop = vdrTop + SEC.vdr; footTop = teamTop + SEC.team;
    maxScroll = Math.max(0, page.offsetHeight - VH);
    stops = [
      0,                                            // the hero: the engine firing, the headline
      Math.round(rdreTop + 557 - VH / 2),           // RDRE: the headline and the engine
      Math.round(rdreTop + 1812 - VH / 2),          // the first high-thrust flight
      Math.round(vdrTop + 40),                      // VDR: the headline
      Math.round(vdrTop + 960 - VH / 2),            // the cutaway, in flight
      Math.round(teamTop + 450 - VH / 2),           // built by the best
      maxScroll,                                    // the footer
    ].map((y) => clamp(y, 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    for (const L of layers) L.last = '_';
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; about 20 s round
    [2.3, 1.3], [1.5, 1.2], [1.6, 1.2], [0.9, 0.9], [1.5, 1.2], [1.6, 1.2], [1.8, 2.6],
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
  /* the tour's own clock: the tile's resting loop is this tour recorded, so a hovered tile tells the card where
     the loop is and everything goes there: the tour, the stand-ins, and the nav, whose easing carries the last few
     frames, so those are replayed (4 s of the tour at 60 fps) to land it as one whole tour on would have it */
  function seekTime(t) {
    t = ((t % TOUR) + TOUR) % TOUR;
    mode = 'tour'; bridge = null; coast = 0; phase = t; ambT = t;
    navDir = 1; navShow = 1; navBgT = 0; prevScroll = scroll = tourAt(t - 4);
    for (let i = 240; i >= 0; i--) { scroll = tourAt(t - i / 60); navStep(1 / 60, false); }
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
    // the first frame is already the loop's: the nav as the tour's last move up leaves it
    if (!started) { started = true; if (mode === 'tour') seekTime(phase); }
    if (!still) ambT = (ambT + dt) % TOUR;
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

    navStep(dt, still);

    render(dt);
    rafId = requestAnimationFrame(frame);
  }

  // the smart nav: away on the way down, back on the way up or near the top
  function navStep(dt, still) {
    const ds = scroll - prevScroll; prevScroll = scroll;
    if (ds > 0.5) navDir = -1; else if (ds < -0.5) navDir = 1;
    const navWant = still || scroll < 120 || navDir > 0 ? 1 : 0;
    const gn = 1 - Math.exp(-dt / 0.14);
    navShow += (navWant - navShow) * gn;
    navBgT += ((scroll > VH / 2 - 54 ? 1 : 0) - navBgT) * (1 - Math.exp(-dt / 0.12));
  }

  function setT(o, el, str) { if (o.last !== str) { el.style.transform = str; o.last = str; } }
  function setO(o, el, str) { if (o.op !== str) { el.style.opacity = str; o.op = str; } }

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

    /* ---- the page: scroll and the site's own choreography ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    // the hero video sinks at half speed as the hero leaves
    pinY.hero = clamp(scroll, 0, VH) * 0.5;
    for (const p of pins) setT(p, p.el, `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)`);
    // the headline tips back on its middle
    if (scroll < VH + 10) {
      const u = clamp(scroll / VH, 0, 1);
      for (const h of h1s) {
        setT(h, h.el, u < 0.001 ? '' : `perspective(10000px) rotateX(${(90 * u).toFixed(2)}deg)`);
        setO(h, h.el, (1 - smooth(u, 0.15, 0.85)).toFixed(3));
      }
    }
    // the nav slides up out of the way, and its bar darkens once the headline reaches it
    const nStr = `translate3d(0, ${(-74 * (1 - navShow)).toFixed(2)}px, 0)`;
    if (nStr !== lastNav) { navIn.style.transform = nStr; lastNav = nStr; }
    const nb = navBgT.toFixed(3);
    if (nb !== lastNavBg) { navBg.style.opacity = nb; lastNavBg = nb; }
    // copy rises in as it comes up into the window
    for (const r of reveals) {
      const yv = r.y - scroll;
      if (yv < -200 || yv > VH + 80) continue;
      const t = smooth(VH * 0.98 - yv, 0, VH * 0.2);
      setT(r, r.el, t > 0.999 ? '' : `translate3d(0, ${(32 * (1 - t)).toFixed(2)}px, 0)`);
      setO(r, r.el, t.toFixed(3));
    }

    /* ---- light stand-ins for the site's videos, only where they can be seen ---- */
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;
    const fk = V['motion.flicker'], T = ambT;
    if (inView(0, VH)) {
      const n1 = noise(T, 41, 67, 23), n2 = noise(T, 53, 29, 83), n3 = noise(T, 37, 71, 19);
      setT(amb.flame, amb.flame.el, `scale(${(1 + 0.03 * fk * n2).toFixed(4)}, ${(1 + 0.02 * fk * n1).toFixed(4)})`);
      setO(amb.flame, amb.flame.el, (1 - 0.08 * fk * (0.5 + 0.5 * n3)).toFixed(3));
      setO(amb.plume, amb.plume.el, (0.8 + 0.2 * fk * n1).toFixed(3));
    }
    if (inView(rdreTop + 300, rdreTop + 1000)) {
      setT(amb.rdre, amb.rdre.el, `translate3d(0, ${(9 * Math.sin(T * cyc(0.62))).toFixed(2)}px, 0) rotate(${(2.6 * Math.sin(T * cyc(0.41) + 0.6)).toFixed(3)}deg)`);
    }
    if (inView(vdrTop + 350, vdrTop + 1770)) {
      setT(amb.vdr, amb.vdr.el, `translate3d(${(7 * Math.sin(T * cyc(0.33))).toFixed(2)}px, ${(5 * Math.sin(T * cyc(0.47) + 1)).toFixed(2)}px, 0)`);
      setO(amb.vdrGlow, amb.vdrGlow.el, (0.75 + 0.25 * fk * noise(T, 47, 31, 79)).toFixed(3));
    }
    if (inView(teamTop, teamTop + 900)) {
      setT(amb.team, amb.team.el, `scale(${(1.006 + 0.006 * Math.sin(T * cyc(0.21))).toFixed(4)})`);
    }
    if (inView(footTop + 80, footTop + 480)) {
      setO(amb.fGlow, amb.fGlow.el, (0.75 + 0.25 * fk * noise(T, 43, 61, 27)).toFixed(3));
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
  reduced.addEventListener('change', () => { if (reduced.matches) { scroll = 0; mode = 'tour'; phase = 0; } });

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
    // one whole loop in seconds at speed 1 (the site records one tour as the tile's resting loop)
    get period() { return TOUR; },
    get maxScroll() { return maxScroll; },
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    seek: seekTime,
  };
  window.venusCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
