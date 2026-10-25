/* The Dorm Room Fund work card: one spring-driven loop, transforms and opacity only.

   The miniature is the live homepage laid out in layers at its 1440px width.
   Every [data-depth] element is a layer; on hover the card tilts toward the
   pointer and each layer is projected as if it sat at its own height above the
   card plane, so the parallax matches the real 3D tilt. The tour never stops for
   the hover; a press and drag scrolls the miniature by hand (with momentum), and
   the tour picks up again from wherever it was let go.

   The page's own motion, rebuilt on the card's clock (requestAnimationFrame
   timestamps), so one recorded tour closes on itself and a seek lands on the
   recorded frame:
   - the hero's door: a CSS 3D rotateY on the page's door, hinged on its right
     edge in the page's 1800px perspective, opened by the miniature's scroll
     exactly as the page does it (-72deg x (1 - cubicOut(p)) over the hero's
     200vh), "The first yes." sliding away (75vw x p) and the numbers counting
     up (inOutCubic(2.5p)); the digits step by transform, never by text
     - "where you are": the founders' photos slide through, 30 to a tour
   - "The first door is the hardest": the words rise in, the cards fade up, and
     Cursor's card swings open on its left edge (rotateY 104deg) to the orange
     back, its founder and his words sliding in after it, the page's own
     timings
   - the network: the advisors fly in from the edges into the violet card,
     shrinking as they go, driven by the scroll through the section as on the
     page, the rings lighting up as each one lands and the count going up
   - the footer's door tile swings its panel open, orange, and back

   A classic script, so the card also runs opened straight from disk.
   window.__dormRoomFundCard is the handle for the dials, the site and the verify scripts. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const embed = document.documentElement.classList.contains('embed');

  const DW = 1440;                       // the page's design width
  const MAX_VH = 1100;                   // a frame taller than the page can fill crops the sides rather than shrinking the page
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset on the card ground
  // &mat=F (the site's border on every tile) draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height, light from above and a touch left
  const TICK_PER = 80;                   // design px of scroll per ruler notch
  const CLICK_PX = 6;                    // a press that moves less than this is a click
  const TAU = Math.PI * 2;

  /* the page at a screen height VH (boxes read off the live page at 1440 x 900): the hero is 300vh,
     "The first door" 854px, the network 140vh, the call 429px and the footer 360px, 12px apart */
  const geo = (VH) => {
    const btd = 3 * VH + 12, net = btd + 866, netH = 1.4 * VH, cta = net + netH + 12, foot = cta + 441;
    return { btd, net, netH, cta, foot, H: foot + 360 };
  };

  /* the tour: hold on a stop, glide to the next, every leg eased in and out (seconds at speed 1).
     The first leg is the door swinging open: the page turns it by cubicOut of the scroll, so this leg
     scrolls on the inverse of that, and the door's own angle eases in and out over the whole leg (the
     words slide off and the numbers count up in step with it, as on the page). The last leg glides
     home, the door closing behind it. */
  const SWING = (u) => 1 - Math.cbrt(1 - ease(u));
  const STOPS = [
    { id: 'hero', hold: 2.2, move: 2.6, curve: SWING, y: () => 0 },
    { id: 'door', hold: 1.5, move: 1.8, y: (VH) => 2 * VH },
    { id: 'companies', hold: 2.8, move: 1.9, y: (VH, g) => g.btd - 12 },
    { id: 'network', hold: 2.2, move: 1.8, y: (VH, g) => g.net + Math.round(0.035 * VH) },
    { id: 'footer', hold: 1.6, move: 2.6, y: (VH, g, max) => max },
  ];
  const PERIOD = STOPS.reduce((a, S) => a + S.hold + S.move, 0);
  const START = STOPS.reduce((a, S, i) => (a.push(i ? a[i - 1] + STOPS[i - 1].hold + STOPS[i - 1].move : 0), a), []);
  // the page's hover moments, played on the tour's clock: Cursor's card opens a beat into its stop and closes
  // once it has scrolled away; the footer's door tile opens a beat into the last stop and closes on the way home
  const FLIP = { on: START[2] + 0.35, off: START[3] + 0.6 };
  const TOGGLE = { on: START[4] + 0.35, off: START[4] + STOPS[4].hold + 0.9 };
  const PHOTO_T = PERIOD / 30;           // the page swaps a photo every 0.72 s; here 30 to a tour (three rounds of ten)
  const NET_T = START[3] + STOPS[3].hold / 2;

  const DEFAULTS = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.6, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.6,
    'motion.scrollSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'door.ajar': 72, 'door.perspective': 1800,
    'drag.momentum': 1, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.2,
    // the mat: DRF's own violet (--brand--purple, the door and the network card), so it reads on the site's near-black page
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': '#9378ee', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const c01 = (v) => clamp(v, 0, 1);
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * c01(t));
  const cOut = (t) => 1 - Math.pow(1 - t, 3);
  const ioC = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const p4Out = (t) => 1 - Math.pow(1 - c01(t), 4);
  // CSS cubic-bezier(x1, y1, x2, y2), solved for x
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (t) => ((ax * t + bx) * t + cx) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      x = c01(x);
      if (x === 0 || x === 1) return x;
      let t = x;
      for (let i = 0; i < 8; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= (X(t) - x) / d; }
      if (t < 0 || t > 1 || Math.abs(X(t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { if (X(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
      return ((ay * t + by) * t + cy) * t;
    };
  }
  const OUT = bezier(0.22, 1, 0.36, 1);      // the page's one ease for its doors, slides and wipes
  const CSS_EASE = bezier(0.25, 0.1, 0.25, 1);
  const SPRING = bezier(0.34, 1.3, 0.64, 1); // the footer tile's panel

  const $ = (s) => document.querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav');
  const door = $('#door'), doorScene = $('.door-scene');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rimLight = $('#rimLight'), rim = $('#rim');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = $$('.ruler-in .ticks');
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const V = { ...DEFAULTS };
  const get = (k) => V[k];
  // inside the site a finger scrolls the site, not the miniature, unless &touchdrag=1
  const touchDrag = !embed || qs.get('touchdrag') === '1';
  if (!touchDrag) persp.style.touchAction = 'pan-y';

  /* ---- the page's split headings: each word in its own mask, to rise in (the page's fd-h2) ---- */
  for (const el of $$('[data-split="words"]')) {
    const out = [];
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach((w) => { if (!w) return; out.push(/^\s+$/.test(w) ? document.createTextNode(' ') : Object.assign(document.createElement('span'), { className: 'w', innerHTML: `<i>${w}</i>` })); });
      } else out.push(n);
    }
    el.replaceChildren(...out);
  }

  /* ---- the counters: a column of digits per place, stepped by transform ---- */
  for (const el of $$('.odo')) el.innerHTML = '<span>' + '0123456789'.split('').map((d) => `<i>${d}</i>`).join('') + '<i></i></span>';

  /* ---- the network: twelve lanes of advisors, each with the faces it shows lap by lap (the page's own people, in its order) ---- */
  const PEOPLE = [
    ['Will_Manidis', 'Will Manidis', 'Founder, ScienceIO'], ['Toni_Oloko', 'Toni Oloko', 'Co-Founder, Dandy'],
    ['Talia_Goldberg', 'Talia Goldberg', 'Partner, Bessemer'], ['Shawn_Xu', 'Shawn Xu', 'GP, Lowercarbon Capital'],
    ['Sara_Du', 'Sara Du', 'Co-Founder, Alloy &amp; Ando'], ['Santiago_Hernandez', 'Santiago Hernandez', 'Research, OpenAI'],
    ['Sam_Broner', 'Sam Broner', 'Founder, The Better Money Company'], ['Nick_Kim', 'Nick Kim', 'Partner, Upfront Ventures'],
    ['michael_profile_500x500', 'Michael Truell', 'Founder, Cursor'], ['Mike_Annunziata', 'Mike Annunziata', 'Founder &amp; GP, Also Capital'],
    ['Matt_Piccolella', 'Matt Piccolella', 'Product, Anthropic'], ['Liu_Jiang', 'Liu Jiang', 'Founder &amp; GP, Sunflower Capital'],
    ['Lauren_Reeder', 'Lauren Reeder', 'Partner, Sequoia'], ['Lan_Jiang', 'Lan Jiang', 'Partner, Lux Capital'],
    ['Karina_Hsu', 'Karine Hsu', 'Founder, Slope Agency'], ['Jessica_Leao', 'Jéssica Leão', 'Partner, a16z'],
    ['Isabelle_Phelps', 'Isabelle Phelps', 'Partner, Lerer Hippeau'], ['Heston_Berkman', 'Heston Berkman', 'Founder &amp; GP, Banter Capital'],
    ['David_Mackanic', 'David Mackanic', 'Founder, Anthro Energy'], ['Claire_Smilow', 'Claire Smilow', 'Partner, BoxGroup'],
    ['Christine_Esserman', 'Christine Esserman', 'Partner, Accel'], ['Brent_Willess', 'Brent Willess', 'VP, General Flash'],
    ['Anjney_Mihda', 'Anjney Mihda', 'GP, a16z'], ['Amanda_Bradford', 'Amanda Bradford', 'Founder, The League'],
    ['Alex_Wendland', 'Alex Wendland', 'Founder, Adaptive Innovations'], ['Alex_Torrey', 'Alex Torrey', 'Founder, AIC &amp; The Rounds'],
    ['Alex_Immerman', 'Alex Immerman', 'GP, a16z'],
  ];
  const NET = { count: 12, cycles: 5.5, shrink: 0.55, base: 96, cycMin: -1, cycMax: 7 };
  const PHI = 0.6180339887;
  const avLayer = $('#netAvs');
  const avItems = [];
  for (let i = 0; i < NET.count; i++) {
    const el = document.createElement('div');
    el.className = 'avi';
    const faces = {};
    for (let cyc = NET.cycMin; cyc <= NET.cycMax; cyc++) {
      const [f, name, role] = PEOPLE[(((cyc * NET.count + i) % PEOPLE.length) + PEOPLE.length) % PEOPLE.length];
      const face = document.createElement('div');
      face.className = 'avf';
      face.innerHTML = `<img src="dorm-room-fund-card-src/img/people/${f}.webp" alt=""><p><b>${name}</b><small>${role}</small></p>`;
      el.appendChild(face);
      faces[cyc] = face;
    }
    avLayer.appendChild(el);
    avItems.push({ el, faces, phase: i / NET.count, lane: (i * PHI) % 1, jitter: ((i * 0.41) % 1) - 0.5, shown: null, last: '', op: '' });
  }
  const ringBox = $('#netRings');
  const RING_GAP = 14.4;                 // clamp(9px, 1vw, 15px) at 1440
  const rings = [];
  for (let i = 1; i <= 8; i++) {
    const geom = `left:${-RING_GAP * i}px;top:${-RING_GAP * i}px;width:${280 + 2 * RING_GAP * i}px;height:${375 + 2 * RING_GAP * i}px;border-radius:${20 + RING_GAP * i}px`;
    const base = document.createElement('i'); base.style.cssText = geom + `;opacity:${(1.08 - i * 0.13).toFixed(2)}`;
    const lit = document.createElement('i'); lit.className = 'lit'; lit.style.cssText = geom;
    ringBox.append(base, lit);
    rings.push({ lit, max: 1.08 - i * 0.13, last: '' });
  }

  /* ---- shadow twins: a darkened, blurred copy left on the surface under a lifted layer
     (data-twin="box": just its box, for the cards, whose faces turn) ---- */
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(el.dataset.twin !== 'box');
    for (const n of [tw, ...tw.querySelectorAll('*')]) {
      for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-twin', 'id']) n.removeAttribute(a);
    }
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }

  /* ---- the reveals: groups of words, lines and children that rise in as they come into view, on the
     page's own timings (power4.out), on the card's clock ---- */
  const RV = {
    btdh: { at: 0.8, y: 32, dur: 1.2, stagger: 0.05 },   // fd-h2
    arrows: { at: 0.7, y: 25, dur: 1.5, stagger: 0.12 }, // fd-fade-children
    cards: { at: 0.7, y: 25, dur: 1.5, stagger: 0.12 },
    neth: { at: 0.8, y: 32, dur: 1.2, stagger: 0.05 },
    netp: { at: 0.8, yp: 100, dur: 1, stagger: 0.1 },    // fd-paragraph
    ctah: { at: 0.8, y: 32, dur: 1.2, stagger: 0.05 },
    ctap: { at: 0.8, yp: 100, dur: 1, stagger: 0.1 },
    ctab: { at: 0.7, y: 32, dur: 1, stagger: 0 },        // fd-fade
  };
  const groups = Object.entries(RV).map(([name, o]) => {
    const els = $$(`[data-rv="${name}"]`);
    const items = [];
    if (els[0] && els[0].dataset.split === 'words') els.forEach((el) => $$('.w > i', el).forEach((w, k) => items.push({ el: w, k, last: '' })));
    else { let k = 0; const seen = new Map(); els.forEach((el) => { const key = el.closest('.twin') ? 't' : 'o'; k = seen.get(key) || 0; items.push({ el, k, last: '' }); seen.set(key, k + 1); }); }
    return { name, ...o, trig: els.find((el) => !el.closest('.twin')), top: 0, active: false, age: 0, table: null, items };
  });

  /* ---- layers ---- */
  const layers = $$('[data-depth]').map((el) => {
    const pins = [];
    for (let p = el.parentElement; p && p !== page; p = p.parentElement) if (p.dataset && p.dataset.pin) pins.push(p.dataset.pin);
    return {
      el, d: +el.dataset.depth, kind: el.dataset.kind || (page.contains(el) ? 'page' : 'vp'), edge: el.dataset.edge || '',
      twin: el._twin || null, parent: null, pins, cx: 0, cy: 0, hw: 0, hh: 0, A: null, last: '', skip: false,
    };
  });
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const winLayer = layers.find((L) => L.el === win);
  const pins = Object.fromEntries($$('[data-pin]').map((el) => [el.dataset.pin, { el, x: 0, y: 0, last: '' }]));
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }
  const tones = $$('[data-tone]').map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));

  /* ---- the counters: each digit a column of 0 to 9 (and a blank), the rest of the line after it. Satoshi's
     figures are proportional and kerned, so the card measures them in the page's own type and puts each
     digit, and the words after, where the page's text would set them, by transform ---- */
  const NUMS = { c: { from: 150, to: 339 }, b: { from: 2, to: 14 }, y: { from: 4, to: 12 }, n: { from: NET.base, to: NET.base } };   // n: the network's count, set from its laps
  for (const [k, N] of Object.entries(NUMS)) {
    N.cols = $$(`.odo[data-num="${k}"]`).map((el) => ({ el, stk: el.firstChild, place: +el.dataset.place, last: '' }))
      .sort((a, b) => b.place - a.place);
    N.lead = N.cols[0].place;
    N.tails = $$(`.tl[data-num="${k}"]`).map((el) => ({ el, last: '' }));
    const before = N.cols[0].el.previousSibling;
    N.prefix = before && before.nodeType === 3 ? before.textContent.slice(-1) : '';
    N.suffix = N.tails.length ? N.tails[0].el.textContent.charAt(0) : '';
    N.lh = 1; N.w0 = 1; N.center = false; N.adv = {}; N.kern = {}; N.val = -1;
  }
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:pre;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  function measureNum(N) {
    const cs = getComputedStyle(N.cols[0].el);
    for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'fontKerning', 'fontFeatureSettings', 'fontVariantNumeric', 'textRendering']) probe.style[p] = cs[p];
    const w = (t) => { probe.textContent = t; return probe.getBoundingClientRect().width; };
    const chars = '0123456789'.split('');
    N.adv = {}; N.kern = {};
    for (const c of chars.concat(N.prefix, N.suffix).filter(Boolean)) N.adv[c] = w(c);
    for (const x of chars.concat(N.prefix).filter(Boolean)) for (const y of chars.concat(N.suffix).filter(Boolean)) N.kern[x + y] = w(x + y) - N.adv[x] - N.adv[y];
    N.w0 = Math.max(...chars.map((c) => N.adv[c]));
    N.lh = parseFloat(cs.height) || 1;
    for (const c of N.cols) { c.el.style.width = N.w0 + 'px'; c.last = ''; }
    for (const t of N.tails) t.last = '';
    N.center = getComputedStyle(N.cols[0].el.parentElement).textAlign === 'center';
    N.val = -1;
  }
  function setNum(N, v) {
    if (v === N.val) return;
    N.val = v;
    const n = N.cols.length;
    const ds = N.cols.map((c) => (c.place === N.lead && v < Math.pow(10, N.lead) && c.place > 0 ? -1 : Math.floor(v / Math.pow(10, c.place)) % 10));
    const vis = ds.map((d, i) => [d, i]).filter(([d]) => d >= 0);
    const pos = [];
    let x = N.prefix && vis.length ? (N.kern[N.prefix + vis[0][0]] || 0) : 0;
    vis.forEach(([d, i], j) => {
      pos[i] = x;
      const next = j + 1 < vis.length ? String(vis[j + 1][0]) : N.suffix;
      x += N.adv[d] + (next ? (N.kern[d + next] || 0) : 0);
    });
    const delta = x - n * N.w0;              // the number set for real, against its columns as laid out
    const c0 = N.center ? -delta / 2 : 0;    // centred, the whole line re-centres on its real width
    N.cols.forEach((c, i) => {
      const str = ds[i] < 0 ? 'translate3d(0, ' + (-10 * N.lh).toFixed(2) + 'px, 0)'
        : `translate3d(${(pos[i] - i * N.w0 + c0).toFixed(2)}px, ${(-ds[i] * N.lh).toFixed(2)}px, 0)`;
      if (str !== c.last) { c.stk.style.transform = str; c.last = str; }
    });
    const tStr = `translate3d(${(delta + c0).toFixed(2)}px, 0, 0)`;
    for (const t of N.tails) if (tStr !== t.last) { t.el.style.transform = tStr; t.last = tStr; }
  }

  /* ---- the photos in the door, the card that opens, the footer tile ---- */
  const photos = $$('#doorPhoto img').map((el) => ({ el, last: '' }));
  const flipEls = { face: $('#flipFace'), top: $('#cbTop'), info: $('#cbInfo'), go: $('#cbGo'), av: $('#cbAv') };
  // [part, delay when opening, duration, easing]: the page's own transitions (.card-above, .card-behind_*)
  const FLIP_PARTS = [['face', 0, 0.85, OUT], ['topX', 0.12, 0.65, OUT], ['topO', 0.12, 0.45, CSS_EASE], ['infoX', 0.22, 0.65, OUT],
    ['infoO', 0.22, 0.45, CSS_EASE], ['goX', 0.3, 0.65, OUT], ['goO', 0.3, 0.45, CSS_EASE], ['av', 0.18, 0.7, OUT]];
  const TOG_PARTS = [['bg', 0, 0.7, OUT], ['fill', 0, 0.6, OUT], ['move', 0, 0.7, SPRING]];
  const togEls = { on: $('#togOn'), panel: $('#togPanel'), fill: $('#togPanelOn') };
  const makeSwitch = (parts, win0) => ({ parts, win: win0, dir: 0, t0: -1e9, from: Object.fromEntries(parts.map(([n]) => [n, 0])) });
  const flip = makeSwitch(FLIP_PARTS, FLIP), tog = makeSwitch(TOG_PARTS, TOGGLE);
  function switchValues(S, now) {
    const age = now - S.t0, o = {};
    for (const [n, delay, dur, fn] of S.parts) {
      const from = S.from[n];
      o[n] = S.dir ? from + (1 - from) * fn(c01((age - delay) / dur)) : from * (1 - fn(c01(age / dur)));
    }
    return o;
  }
  // ago: how long since the tour crossed the switch's time (a frame is late by up to its own length)
  function switchTo(S, dir, now, ago = 0) { if (dir === S.dir) return; S.from = switchValues(S, now - ago); S.dir = dir; S.t0 = now - ago; }
  const inWin = (W, t) => t >= W.on && t < W.off;
  function switchSeek(S, t, now) {
    if (inWin(S.win, t)) { S.dir = 1; S.t0 = now - (t - S.win.on); for (const k in S.from) S.from[k] = 0; }
    else { S.dir = 0; S.t0 = now - (((t - S.win.off) % PERIOD) + PERIOD) % PERIOD; for (const k in S.from) S.from[k] = 1; }
  }

  /* ---- state ---- */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, VW = DW, G = geo(900), maxScroll = 4000, stops = STOPS.map(() => 0);
  let AV_W = 184, AV_H = 337;
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  let mode = 'tour', phase = 0, bridge = null, coast = 0, idle = 0;
  let scroll = 0, clock = 0, amb = 0, tone = 0, lift = 1, prevBase = null, netRate = 0;
  let hovered = false, touchActive = false, touchOn = false, pointerLive = false;
  const pointer = { x: 0, y: 0 }, bl = { x: 0, y: -0.2 };
  let down = null, dragging = false, samples = [];
  let running = false, parentVisible = true, raf = 0, tPrev = performance.now();
  let lastTicks = '', lastTone = '', lastDoor = '', frameDark = false;
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
    persp.style.perspective = (get('tilt.perspective') * cw) + 'px';
    doorScene.style.perspective = get('door.perspective') + 'px';
    for (const N of Object.values(NUMS)) measureNum(N);   // first: it sets the digit columns' widths
    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.hw = L.el.offsetWidth / 2; L.hh = L.el.offsetHeight / 2;
      L.last = '';
      if (L.twin) L.twin.last = '';
    }
    for (const t of tones) { t.y0 = posIn(t.el, page)[1] - t.el.offsetHeight / 2; t.y1 = t.y0 + t.el.offsetHeight; }
    AV_W = avItems[0].el.offsetWidth || 184;
    AV_H = avItems[0].faces[0].offsetHeight || 337;
    for (const g of groups) if (g.trig) g.top = posIn(g.trig, page)[1] - g.trig.offsetHeight / 2;
    maxScroll = Math.max(0, page.offsetHeight - VH);
    stops = STOPS.map((S) => clamp(S.y(VH, G, maxScroll), 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    lastDoor = '';
    buildRevealTables();
  }

  /* ================= the tour ================= */
  function tourAt(t) {
    t = ((t % PERIOD) + PERIOD) % PERIOD;
    for (let i = 0; i < STOPS.length; i++) {
      const S = STOPS[i], j = (i + 1) % STOPS.length;
      if (t < S.hold) return stops[i];
      t -= S.hold;
      if (t < S.move) return stops[i] + (stops[j] - stops[i]) * (S.curve || ease)(t / S.move);
      t -= S.move;
    }
    return 0;
  }
  /* the reveals along one tour from the top (where every one of them has reset), so a seek lands on them exactly */
  const RV_HZ = 60;   // the loop's own frame rate: a seek reads exactly the frame that was recorded
  function stepReveal(g, y, dt) {
    if (!g.active && g.top < y + g.at * VH) { g.active = true; g.age = 0; }
    else if (g.active && g.top > y + VH) { g.active = false; g.age = 0; }
    if (g.active) g.age += dt;
  }
  function buildRevealTables() {
    const n = Math.ceil(PERIOD * RV_HZ) + 1;
    for (const g of groups) {
      g.table = new Float32Array(n);
      const st = { top: g.top, at: g.at, active: false, age: 0 };
      for (let k = 0; k < n; k++) { stepReveal(st, tourAt(k / RV_HZ), k ? 1 / RV_HZ : 0); g.table[k] = st.active ? st.age : -1; }
    }
  }
  // the tour's own clock: the site's resting loop is this tour recorded, so a hovered tile tells the card
  // where the loop is ({type: "ks-card", at}) and the live card picks up from that frame
  function seekTime(t) {
    t = ((t % PERIOD) + PERIOD) % PERIOD;
    mode = 'tour'; bridge = null; phase = t; amb = t;
    scroll = tourAt(phase);
    for (const g of groups) { const a = g.table ? g.table[Math.round(t * RV_HZ)] : -1; g.active = a >= 0; g.age = Math.max(0, a); }
    switchSeek(flip, t, amb); switchSeek(tog, t, amb);
    prevBase = null;
  }
  // after a drag: ease to the next stop at or below where it was let go (past the last one, glide home),
  // then carry on the tour from that stop
  function resumeTour() {
    let j = stops.findIndex((y) => y >= scroll - 24);
    if (j < 0) j = 0;
    glide(stops[j], START[j]);
  }
  function glide(to, ph) {
    const dist = Math.abs(to - scroll);
    if (dist < 2) { mode = 'tour'; phase = ph; bridge = null; return; }
    bridge = { from: scroll, to, phase: ph, t: 0, dur: clamp(0.7 + dist / 1500, 0.9, 2.6) };
    mode = 'bridge';
  }

  function step(S, target, k, c, dt) {
    const n = Math.ceil(dt / (1 / 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) { S.v += (-k * (S.x - target) - c * S.v) * h; S.x += S.v * h; }
  }

  /* ================= the frame ================= */
  function frame(now) {
    if (!running) return;
    const raw = (now - tPrev) / 1000;
    const dt = Math.min(0.05, Math.max(0, raw));
    tPrev = now; clock += dt;
    if (frameLog.length > 600) frameLog.shift();
    frameLog.push(raw * 1000);
    const still = reduced.matches;
    const k = get('motion.stiffness'), c = get('motion.damping'), tiltMax = get('tilt.tiltMax');
    const engaged = hovered || touchActive || touchOn || dragging || get('debug.hold') || still;

    let nx = 0, ny = 0;
    if (still) { nx = -0.38; ny = -0.3; }
    else if (engaged) {
      if (pointerLive && (hovered || touchActive)) { nx = pointer.x; ny = pointer.y; }
      else { nx = 0.42 * Math.sin(clock * 0.55); ny = 0.3 * Math.sin(clock * 0.77 + 1.1); }
    }
    if (still) { spr.rx.x = -ny * tiltMax; spr.ry.x = nx * tiltMax; spr.h.x = 1; spr.rx.v = spr.ry.v = spr.h.v = 0; }
    else {
      step(spr.rx, -ny * tiltMax, k, c, dt);
      step(spr.ry, nx * tiltMax, k, c, dt);
      step(spr.h, engaged ? 1 : 0, k * 0.8, c * 0.95, dt);
    }
    // the bloom chases the pointer a touch behind it, so it feels like light, not a cursor
    const bx = still ? -0.38 : (pointerLive ? pointer.x : nx), by = still ? -0.3 : (pointerLive ? pointer.y : ny);
    const f = still ? 1 : 1 - Math.exp(-dt / 0.08);
    bl.x += (bx - bl.x) * f; bl.y += (by - bl.y) * f;

    // the scroll: the tour, a drag and its coast, or the glide back into the tour. Hover never stops it.
    const speed = get('motion.scrollSpeed');
    if (!still) amb += dt;
    if (mode === 'tour') {
      if (!still) { phase += dt * speed; scroll = tourAt(phase); }
    } else if (mode === 'manual') {
      if (!dragging) {
        const tau = 0.33 * get('drag.momentum');
        if (Math.abs(coast) > 12 && tau > 0.001 && !still) {
          scroll += coast * dt;
          coast *= Math.exp(-dt / tau);
          if (scroll <= 0 || scroll >= maxScroll) { scroll = clamp(scroll, 0, maxScroll); coast = 0; }
        } else {
          coast = 0; idle += dt;
          if (idle >= get('drag.resumeAfter') && !still) resumeTour();
        }
      }
    } else if (mode === 'bridge') {
      bridge.t += dt * Math.max(0.1, speed);
      const u = clamp(bridge.t / bridge.dur, 0, 1);
      scroll = bridge.from + (bridge.to - bridge.from) * ease(u);
      if (u >= 1) { mode = 'tour'; phase = bridge.phase; bridge = null; }
    }
    scroll = clamp(scroll, 0, maxScroll);
    // the page's hover moments follow the tour's clock while touring, and hold while the hand has the page
    if (mode === 'tour' && !still) {
      const t = ((phase % PERIOD) + PERIOD) % PERIOD;
      const since = (W, on) => Math.min(dt * speed, ((t - (on ? W.on : W.off)) % PERIOD + PERIOD) % PERIOD) / Math.max(speed, 1e-3);
      for (const [S, W] of [[flip, FLIP], [tog, TOGGLE]]) { const on = inWin(W, t); switchTo(S, on ? 1 : 0, amb, since(W, on)); }
    }
    for (const g of groups) stepReveal(g, scroll, still ? 10 : dt);   // still: shown at once
    render(dt, still);
    raf = requestAnimationFrame(frame);
  }

  function renderPage(dt, still) {
    /* the hero: the screen pinned through 300vh, the door swinging open, the words sliding off, the numbers counting */
    const p = clamp(scroll / (2 * VH), 0, 1);
    pins.hero.y = clamp(scroll, 0, 2 * VH);
    pins.slide.x = -p * 0.75 * DW;
    for (const P of Object.values(pins)) {
      const str = `translate3d(${P.x.toFixed(2)}px, ${P.y.toFixed(2)}px, 0)`;
      if (str !== P.last) { P.el.style.transform = str; P.last = str; }
    }
    const inHero = scroll < 3 * VH;
    if (inHero) {
      const dStr = `rotateY(${(-get('door.ajar') * (1 - cOut(p))).toFixed(3)}deg)`;
      if (dStr !== lastDoor) { door.style.transform = dStr; lastDoor = dStr; }
      const e = ioC(Math.min(p * 2.5, 1));
      for (const key of ['c', 'b', 'y']) { const N = NUMS[key]; setNum(N, Math.round(N.from + (N.to - N.from) * e)); }
      // the founders slide through "where you are": hold, then the next one in from the left as this one leaves right
      const slotT = (still ? 0 : amb) / PHOTO_T, kk = Math.floor(slotT), fr = slotT - kk;
      const hold = 400 / 720, u = fr < hold ? 0 : OUT((fr - hold) / (1 - hold));
      const cur = ((kk % 10) + 10) % 10, nxt = (cur + 1) % 10;
      photos.forEach((P, i) => {
        const x = i === cur ? 110 * u : i === nxt ? -110 + 110 * u : -110;
        const str = `translate3d(${x.toFixed(2)}%, 0, 0)`;
        if (str !== P.last) { P.el.style.transform = str; P.last = str; }
      });
    }

    /* the reveals */
    for (const g of groups) {
      for (const it of g.items) {
        const e = g.active ? p4Out((g.age - it.k * g.stagger) / g.dur) : 0;
        const str = e >= 1 ? '1' : e.toFixed(3);
        if (str === it.last) continue;
        it.last = str;
        it.el.style.opacity = str;
        it.el.style.transform = e >= 1 ? 'none' : g.yp ? `translate3d(0, ${((1 - e) * g.yp).toFixed(2)}%, 0)` : `translate3d(0, ${((1 - e) * g.y).toFixed(2)}px, 0)`;
      }
    }

    /* Cursor's card: the light face swings open on its left edge, the orange back's founder slides in after it */
    const inBtd = scroll + VH > G.btd && scroll < G.btd + 854;
    if (inBtd) {
      const F = switchValues(flip, amb);
      setT(flipEls.face, 'face', `rotateY(${(104 * F.face).toFixed(3)}deg)`);
      setT(flipEls.top, 'top', `translate3d(${(88 * (1 - F.topX)).toFixed(2)}px, 0, 0)`); setO(flipEls.top, 'topO', F.topO);
      setT(flipEls.info, 'info', `translate3d(${(88 * (1 - F.infoX)).toFixed(2)}px, 0, 0)`); setO(flipEls.info, 'infoO', F.infoO);
      setT(flipEls.go, 'go', `translate3d(${(40 * (1 - F.goX)).toFixed(2)}px, 0, 0)`); setO(flipEls.go, 'goO', F.goO);
      setT(flipEls.av, 'av', `rotate(${(4 - 9 * F.av).toFixed(3)}deg)`);
    }

    /* the network: the advisors fly in to the card, shrinking, the rings light up as they land, the count goes up */
    const netTop = G.net, netH = G.netH;
    if (scroll + VH > netTop - 40 && scroll < netTop + netH + 40) {
      const A = 0.06 * PERIOD / TAU;   // the page's idle drift (0.06 laps a second), here a slow swell that closes on the tour
      const baseAt = (y, t) => c01((VH - (netTop - y)) / (VH + netH)) * NET.cycles + (still ? 0 : A * Math.sin(TAU * (t - NET_T) / PERIOD));
      const base = baseAt(scroll, amb);
      // how fast the advisors are coming in, laps a second: on the tour, read off the tour itself (so a seek lands
      // on the recorded frame); by hand, from the frames
      if (mode === 'tour' && !still) netRate = (base - baseAt(tourAt(phase - 1 / 60), amb - 1 / 60)) * 60;
      else if (prevBase !== null && dt > 0) netRate += ((base - prevBase) / dt - netRate) * (1 - Math.exp(-dt / 0.12));
      prevBase = base;
      const W = DW, H = netH, cx = DW / 2, cy = 0.62 * netH;
      let done = 0;
      const ago = [];
      for (let i = 0; i < avItems.length; i++) {
        const it = avItems[i];
        const r = base + it.phase, cyc = Math.floor(r), t = r - cyc;
        done += cyc;
        ago.push(netRate > 0.02 ? t / netRate : Infinity);   // seconds since this lane's advisor landed
        if (cyc !== it.shown) {
          if (it.shown !== null && it.faces[it.shown]) it.faces[it.shown].style.opacity = '0';
          const fc = it.faces[clamp(cyc, NET.cycMin, NET.cycMax)];
          if (fc) fc.style.opacity = '1';
          it.shown = cyc;
        }
        const e = Math.pow(t, 1.7), dir = i % 3;
        let sx, sy;
        if (dir === 0) { sx = -AV_W - 60 - it.lane * 140; sy = H * (0.25 + it.lane * 0.6) + it.jitter * 60; }
        else if (dir === 1) { sx = W + 60 + it.lane * 140; sy = H * (0.25 + ((it.lane + 0.37) % 1) * 0.6) + it.jitter * 60; }
        else { sx = W * (0.06 + it.lane * 0.88) + it.jitter * 80; sy = H + 60 + it.lane * 140; }
        const x = sx + (cx - AV_W / 2 - sx) * e, y = sy + (cy - AV_H / 2 - sy) * e, sc = 1 - NET.shrink * e;
        const str = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${sc.toFixed(3)})`;
        if (str !== it.last) { it.el.style.transform = str; it.last = str; }
        // the page fades its avatar layer out over 130px at the sides and the foot (a mask); here each one fades as it nears them
        const mx = x + AV_W / 2, my = y + AV_H / 2;
        const op = (c01(mx / 130) * c01((W - mx) / 130) * c01((H - my) / 130)).toFixed(2);
        if (op !== it.op) { it.el.style.opacity = op; it.op = op; }
      }
      setNum(NUMS.n, NET.base + Math.max(0, done));
      // the ripple: as an advisor lands the rings light from the outside in, 90 ms apart, each lit 260 ms
      // (in over .12 s, out over .7 s, the page's transitions)
      const env = (a) => (a < 0 ? 0 : a < 0.26 ? CSS_EASE(a / 0.12) : 1 - CSS_EASE((a - 0.26) / 0.7));
      rings.forEach((R, idx) => {
        const lag = (rings.length - 1 - idx) * 0.09;
        let v = 0;
        for (const a of ago) v = Math.max(v, env(a - lag));
        const str = (v * R.max).toFixed(3);
        if (str !== R.last) { R.lit.style.opacity = str; R.last = str; }
      });
    } else prevBase = null;

    /* the footer's door tile: the panel swings up into its frame, orange, on violet */
    if (scroll + VH > G.foot) {
      const T = switchValues(tog, amb);
      setO(togEls.on, 'tbg', T.bg);
      setO(togEls.fill, 'tfill', T.fill, true);
      const tStr = `translate(${(68 * T.move).toFixed(2)}px, ${(-46 * T.move).toFixed(2)}px)`;
      setT(togEls.panel, 'tmove', tStr);
    }
  }
  const setCache = {};
  function setT(el, key, str) { if (setCache[key] !== str) { el.style.transform = str; setCache[key] = str; } }
  function setO(el, key, v, attr) {
    const str = v.toFixed(3);
    if (setCache[key] === str) return;
    setCache[key] = str;
    if (attr) el.setAttribute('opacity', str); else el.style.opacity = str;
  }

  function render(dt, still) {
    const rx = spr.rx.x, ry = spr.ry.x;
    const hc = clamp(spr.h.x, -0.2, 1.2), h01 = clamp(spr.h.x, 0, 1);
    const depth = get('layers.depth'), par = get('layers.parallax'), spread = get('layers.spread');
    const tiltMax = get('tilt.tiltMax');
    lift = 1 + (get('tilt.hoverScale') - 1) * hc;
    const shadowK = get('light.shadow');

    page.style.transform = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    renderPage(dt, still);
    card.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${(lift / K).toFixed(5)})`;

    // the eye, in card space: the perspective distance in front of the card centre, rotated into the card's frame
    const P = get('tilt.perspective') * cardW / lift;
    const a = rx * Math.PI / 180, b = ry * Math.PI / 180;
    const E = { x: -P * Math.sin(b) * Math.cos(a), y: P * Math.sin(a), z: P * Math.cos(a) * Math.cos(b) };
    const Zsep = 0.16 * cardW * depth;
    const quiet = Math.abs(hc) < 0.0005 && Math.abs(rx) < 0.001 && Math.abs(ry) < 0.001;
    const reach = VH * 0.5 + VH * 0.6;

    for (const L of layers) {
      let px = 0, py = 0;
      for (const n of L.pins) { px += pins[n].x; py += pins[n].y; }
      if (L.kind === 'page') {
        L.skip = (L.parent && L.parent.skip) || Math.abs(L.cy + py - scroll - VH / 2) > reach + L.hh;
        if (L.skip) continue;
      }
      const u = L.kind === 'card' ? 1 : s;
      const Q = L.kind === 'card' ? { x: L.cx - cardW / 2, y: L.cy - cardH / 2 }
        : { x: (L.cx + px - DW / 2) * s, y: (L.cy + py - (L.kind === 'page' ? scroll : 0) - VH / 2) * s };
      const project = (d, extra) => {
        const z = d * Zsep * hc;
        const t = E.z / Math.max(E.z * 0.25, E.z - z);
        return { Q, z, t, o: { x: (t - 1) * (spread * Q.x - par * E.x) + extra.x, y: (t - 1) * (spread * Q.y - par * E.y) + extra.y } };
      };
      L.A = project(L.d, { x: 0, y: 0 });
      // a layer that hugs the page's edge only gives a few px toward that edge,
      // so lifting and sliding never cut it off at the window
      let ex = 0, ey = 0;
      if (L.edge) {
        const o = L.A.o, lim = 9 * s, gx = (L.A.t - 1) * L.hw * s, gy = (L.A.t - 1) * L.hh * s;
        const soft = (v) => lim * Math.tanh(v / lim);
        const x0 = o.x, y0 = o.y;
        if (L.edge.includes('l') && L.edge.includes('r')) o.x = soft(o.x);
        else if (L.edge.includes('l')) { if (o.x - gx < 0) o.x = soft(o.x - gx) + gx; }
        else if (L.edge.includes('r')) { if (o.x + gx > 0) o.x = soft(o.x + gx) - gx; }
        if (L.edge.includes('t') && o.y - gy < 0) o.y = soft(o.y - gy) + gy;
        else if (L.edge.includes('b') && o.y + gy > 0) o.y = soft(o.y + gy) - gy;
        ex = o.x - x0; ey = o.y - y0;
      }
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
        write(Tw.el, project(Tw.surface, { x: throwPx * LIGHT.x + ex, y: throwPx * LIGHT.y + ey }), Tw);
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
    // inside the card the ruler's ink follows the section under the reading mark (framed, it sits on the card ground)
    const darkAt = (y) => { for (const t of tones) if (y >= t.y0 && y < t.y1) return t.dark; return true; };
    const framedNow = card.classList.contains('is-framed');
    const dark = framedNow ? (frameDark ? 1 : 0) : embed ? (darkAt(scroll + VH / 2) ? 1 : 0) : 0;
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
      mode = 'manual'; coast = v; idle = 0;
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
    if (mode === 'manual' && Math.abs(coast) > 0) { coast = 0; idle = 0; }   // a press catches a flick, like a phone
    setPointer(e);
  });
  persp.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') hovered = true;
    if (e.pointerType !== 'touch' || touchDrag) setPointer(e);
    if (!down || e.pointerId !== down.id) return;
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (!dragging && down.moved > 3 && (down.type !== 'touch' || touchDrag)) {
      dragging = true; persp.classList.add('is-dragging');
      mode = 'manual'; coast = 0; idle = 0; bridge = null;
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
      idle = 0;
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
    if (typeof d.at === 'number' && isFinite(d.at) && !dragging && (mode === 'tour' || mode === 'bridge')) seekTime(d.at);
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
      if (!path || /^card\.|^tilt\.perspective|^tilt\.hoverScale|^light\.bloomSize|^door\./.test(path)) layout();
    },
    layout,
    // the tour's length in seconds (the site records one tour as the tile's resting loop)
    get period() { return PERIOD; },
    // a handle for the verify scripts
    get scroll() { return scroll; }, set scroll(y) { scroll = clamp(y, 0, maxScroll); mode = 'manual'; coast = 0; idle = -1e9; bridge = null; },
    get mode() { return mode; }, get phase() { return phase; },
    get h() { return spr.h.x; }, get running() { return running; }, get layers() { return layers.length; },
    get stops() { return stops.slice(); }, get start() { return START.slice(); }, get maxScroll() { return maxScroll; }, get VH() { return VH; },
    get frames() { return frameLog.slice(); },
    get count() { return NUMS.n.val; }, get door() { return door.style.transform; },
    seekTime,
    seek(i, t = 0) { seekTime(START[clamp(i | 0, 0, STOPS.length - 1)] + t); },
  };
  window.__dormRoomFundCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  if (document.fonts) document.fonts.ready.then(layout);
  // decode every picture up front (the faces that wait at opacity 0, the founders in the door), so the first
  // frame that shows one, after a seek from the site, already has it
  for (const img of document.images) if (img.decode) img.decode().catch(() => {});
  window.addEventListener('load', layout);
  layout();
  wake();
})();
