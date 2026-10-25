/* Rime work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops down the page, about 20 s round, never paused by
     hover; a drag (either axis) takes over, coasts, and the tour picks up
     again from wherever it was let go
   - the card: a spring tilt toward the pointer, every [data-depth] layer
     projected as if it sat at its own height above the card plane, shadow
     twins that fall further the higher the layer, one round bloom of light
   - Rime's own motion, only where it can be seen: the hero waveform (the live
     shader's maths, stepped through a sprite of column frames), the logo and
     review marquees, the orbiting play button, the call ring and its
     captions, the venn, the circle snake that chases the pointer over "Start
     the conversation", the footer's i-dot changing colour. All of it runs on
     the tour's own clock, so the tour is one seamless loop: the site rests the
     tile on this tour recorded and hands over to the live card with
     {type: "ks-card", at: seconds}

   window.rimeCard (and window.__rimeCard) is the handle the page's dials, the
   site and the verify scripts use. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const EMBED = qs.get('embed') === '1';
  const TOUCH_DRAG = !EMBED || qs.get('touchdrag') === '1';  // in a tile, a swipe scrolls the site
  const BLEED = EMBED ? Math.max(0, parseFloat(qs.get('bleed')) || 0) : 0;   // px of frame overhanging the tile
  const CLICK_PX = 6;                                         // a press that moves less than this is a click

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const easeOut3 = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeIO3 = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const mod = (v, m) => ((v % m) + m) % m;

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), nav = $('#nav'), navShift = $('#navShift');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rimLight = $('#rimLight'), rim = $('#rim');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = $$('.ruler-in .ticks');
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const IMG = 'rime-card-src/img/';

  const DW = 1440;                       // Rime's design width
  const MAX_VH = 1100;                   // a frame taller than this crops the sides instead of shrinking the page
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset on the card ground
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left
  const TICK_PER = 80;                   // design px of scroll per ruler notch
  const FRAME_COLORS = { yellow: '#ffd46f', pink: '#ffa0ff', aqua: '#2cc3e9', ink: '#24211d' };

  /* the dials' defaults; the page's defineParams writes over these */
  const DEFAULTS = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.72, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.62,
    'motion.tourSpeed': 1, 'motion.ambient': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.2,
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': 'yellow', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  const V = { ...DEFAULTS };

  /* ================= Rime's pieces, built once ================= */

  // the hero waveform: 46 columns of 15 circles, each column a window onto a
  // sprite of 121 frames, one per spread (0 to the live shader's 0.6)
  const WAVE = { cols: 46, frames: 121, amp: 0.6, speed: 0.25, w: 32 };
  const wave = $('#wave');
  const colW = DW / WAVE.cols;
  // (three more columns past each edge carry the wave on, so a tilt never shows where it ends)
  const WAVE_PAD = 3;
  wave.innerHTML = Array.from({ length: WAVE.cols + 2 * WAVE_PAD }, (_, k) =>
    `<div class="col" style="left:${((k - WAVE_PAD + 0.5) * colW - WAVE.w / 2).toFixed(2)}px"><img src="${IMG}wave-columns.webp" alt=""></div>`).join('');
  const waveCols = $$('.col img', wave).map((el, k) => ({ el, i: k - WAVE_PAD, f: -1 }));

  // the logo marquee under the hero
  const LOGOS = [['dialpad', 94, 33], ['slng', 144, 32], ['daily', 99, 32], ['livekit', 142, 32], ['mayoclinic', 32, 40], ['conversenow', 86, 32],
    ['revmo', 144, 32], ['togetherai', 144, 32], ['ylopo', 116, 32], ['callrail', 140, 32], ['dialog', 97, 32], ['omilia', 69, 32], ['outbound-ai', 144, 32], ['nlx', 32, 32]];
  const logos = $('#logos');
  const logoSet = LOGOS.map(([n, w, h]) => `<img src="${IMG}logo_${n}.svg" width="${w}" height="${h}" style="width:${w}px;height:${h}px" alt="">`).join('');
  logos.innerHTML = logoSet + logoSet + logoSet;
  const LOGO_PITCH = LOGOS.reduce((a, l) => a + l[1] + 80, 0);   // 2602, as on the live site

  // the play buttons: the playing one wears its orbit, as the live player does
  const PLAY = '<svg viewBox="0 0 12 15" fill="currentColor" class="play"><path d="M4.09114 0.434546C2.33171 -0.71399 0 0.548454 0 2.6496V11.4093C0 13.5104 2.3317 14.7729 4.09114 13.6244L10.8007 9.24449C12.3998 8.20065 12.3998 5.85818 10.8007 4.81439L4.09114 0.434546Z"/></svg>' +
    '<svg viewBox="0 0 14 16" fill="currentColor" class="pause"><rect x="2" y="1" width="3.4" height="14" rx="1.2"/><rect x="8.6" y="1" width="3.4" height="14" rx="1.2"/></svg>';
  const voices = $$('[data-voice]').map((v) => {
    const btn = $('.vbtn', v); btn.innerHTML = PLAY;
    const orbit = $('.orbit', v);
    const cols = orbit.dataset.c.split(',');
    const dots = $$('i', orbit);
    dots.forEach((d, i) => { d.style.background = `var(--${cols[i]})`; });
    return { orbit, dots: dots.map((el) => ({ el, last: '' })), play: $('.play', btn), pause: $('.pause', btn), op: '' };
  });

  // the call ring: 27 dots round a timer, a caption typed out beside it
  const RING = { count: 27, orbit: 109, amp: 3 };
  const RING_COLORS = ['var(--pink)', 'var(--yellow)', 'var(--aqua)'];
  const rotor = $('#rotor');
  rotor.innerHTML = Array.from({ length: RING.count }, (_, i) => `<i style="background:${RING_COLORS[i % 3]}"></i>`).join('');
  const ringDots = $$('i', rotor).map((el, i) => ({ el, a: i * 2 * Math.PI / RING.count, ph: (i * 2.399) % (Math.PI * 2), last: '', op: '' }));
  const MESSAGES = ['Thanks for calling', 'How can I help?', 'Sure, one moment', 'Can I get your name?', 'Thanks, Mr. Nguyen', "You're verified",
    'Checking Thursday at 7pm', 'Dr. Shah has an opening', 'Booked Thursday, 7pm', 'Confirmation text sent', 'Anything else?', 'Glad I could help'];
  const SPINS = [3, -2, 4, -5, 2, 6, -3, 4, -2, 5, -4, 3];
  // each caption: typed at 38 ms a letter, held 1.55 s, deleted twice as fast, then the ring spins (0.26 + 0.95 s)
  const MSG_LEN = MESSAGES.map((m) => m.length * 0.038 + 1.55 + m.length * 0.019 + 0.26 + 0.95);
  const MSG_CYCLE = MSG_LEN.reduce((x, y) => x + y, 0);
  const rpill = $('#rpill');
  rpill.innerHTML = '<i class="cap"></i><i class="mid"></i><i class="cap end"></i>' +
    MESSAGES.map((m) => `<div class="msg"><div class="clip" style="position:absolute;left:0;top:0;height:13px;overflow:hidden"><span style="position:absolute;left:0;top:0">${m}</span></div></div>`).join('');
  const pill = { capR: $('.cap.end', rpill), mid: $('.mid', rpill), msgs: $$('.msg', rpill).map((el) => ({ el, clip: $('.clip', el), span: $('span', el), w: 100, last: '', op: '' })), last: '', c: '' };
  const timer = $('#timer');
  const digits = (n) => `<span class="odo"><b>${Array.from({ length: n + 1 }, (_, i) => `<i>${i % n}</i>`).join('')}</b></span>`;
  timer.innerHTML = '<span>0</span>' + digits(10) + '<span>:</span>' + digits(6) + digits(10);
  const odo = $$('.odo b', timer).map((el) => ({ el, last: '' }));   // minutes, tens of seconds, seconds

  // the venn: four voices orbiting, their sizes changing with the tab
  const VENN = { cx: 232, cy: 268.8, orbit: 72, slow: 0.15, hold: 4, base: [3.74, 2.17, 0.6, 5.31] };
  const VENN_SIZES = [[176, 76, 248, 96], [248, 140, 108, 72], [100, 232, 76, 148]];   // banking, healthcare, food ordering
  const vennCircles = $$('#venn i').map((el) => ({ el, last: '' }));
  const vennLabels = $$('#vennLabels b').map((el) => ({ el, w: 80, last: '' }));
  const vInds = $$('.vind').map((el) => ({ el, fill: $('i', el), last: '', op: '' }));

  // the word search: words across and down the 20 x 20 grid, crossing where they share a letter
  const WS = {
    letters: 'FBUXHZELMGWKEWICHECCHESMMARNHHVSRLCDYHALHRUYAEDJXAUPCGGFZNFIMMIJCONVERSATIONAHMTVFTJNMYPKMAOVYWTDQHHDAADQPERSONALITYGOFXNLEMMPLOKNJDSLGLONVPEERKRVSNUYRCCCVPKHSXHLBBNFYUCJIYMKXRQDWTXOWCADENCETACYTKABLBSQWZTQDCEUJWZKLJGMXIPUSIUVSITNDZDCTKWFTTREVFRQEARTICULATEVCDRNSBAUNTZXANDDULFMNFFTDYLICIDJLUDOVNSMMOHDAINTSOUKEZEQUZRASCKTMRESONANCEDYQTPRXNAEVOSWEIIWTLMUHHRGASLIRHSBWHODAMVXSFDTSJADTNWACQPMDQHTKBSIKG',
    lit: '0000000000000000000000000000010000000000000000000100000000000000111111111111000000000001010000000000000001111111111100000000000101000000000001000001010000000000010010010000000000000101111111000000000001001001000000000000010010010010000000000100100111111111100001001001001000000000010010010010000000000000100100100000000000011111111100000000000010000010000000000000100000000000000000000000000000000000',
    pills: [[0, 16, 3, 9, 'yellow'], [1, 4, 8, 11, 'blue'], [0, 9, 3, 7, 'pink'], [1, 7, 4, 13, 'yellow'], [0, 3, 4, 12, 'blue'], [1, 10, 11, 7, 'pink'], [0, 5, 5, 11, 'yellow'], [1, 1, 7, 8, 'blue'], [0, 12, 7, 10, 'pink'], [1, 9, 1, 7, 'yellow']],
  };
  {
    const P = 20.937, X0 = 17.7, Y0 = 15.5;
    let grid = '', lit = '';
    for (let i = 0; i < 400; i++) {
      const r = Math.floor(i / 20), c = i % 20;
      const cell = `<span style="left:${(X0 + c * P - 7.5).toFixed(1)}px;top:${(Y0 + r * P - 7.5).toFixed(1)}px">${WS.letters[i]}</span>`;
      if (WS.lit[i] === '1') lit += cell; else grid += cell;
    }
    $('#wsGrid').innerHTML = grid;
    $('#wsLit').innerHTML = lit;
    $('#wsPills').innerHTML = WS.pills.map(([vert, lane, start, n, color]) => {
      const a = (vert ? lane : start), b = (vert ? start : lane);
      const left = X0 + a * P - 12.5, top = Y0 + b * P - 12.5;
      const w = vert ? 25 : (n - 1) * P + 25, h = vert ? (n - 1) * P + 25 : 25;
      return `<i class="${color}" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px"></i>`;
    }).join('');
  }

  // the reviews, two sets of five so the marquee never shows its end
  const REVIEWS = [
    ['pink', 'trillet', 89, '"Mist v3 on a co-located endpoint has been a 3x latency improvement for us. We\'re consistently seeing sub-100ms TTFB in production, and that\'s the difference between a conversation that feels human and one that doesn\'t."', 'Ali Mansoor', 'Founding Engineer, Trillet AI', 'ali-mansoor'],
    ['yellow', 'sigmamind', 142, '"The latency stays low even under heavy loads. It\'s a true enterprise production-grade system."', 'Pratik Mundra', 'Co-Founder, SigmaMind AI', 'pratik-mundra'],
    ['aqua', 'converse-now', 76, '"It was clear that the voice made a real impact on the phone. When guests feel comfortable right away, everything else goes more smoothly."', 'Rahul Aggarwal', 'Founder &amp; COO, ConverseNow', 'rahul-aggarwal'],
    ['pink', 'attune', 117, '"In healthcare, the voice is the first point of trust. Patients need to feel heard, not processed, and that starts with how the AI sounds and how fast it responds."', 'Jack Ryan', 'Co-Founder &amp; Chief Product Officer, Attune', 'jack-ryan', true],
    ['yellow', 'livekit-1', 119, '"Mist v3 is incredibly fast and deterministic pronunciation is a game-changer. When you\'re powering live conversations at scale, you can\'t have a model guessing brand names or proper nouns."', 'Tom Shapland', 'Product Manager, LiveKit', 'tom-shapland'],
  ];
  const REV_PITCH = 672, REV_SET = REV_PITCH * REVIEWS.length;
  const revTrack = $('#revTrack');
  revTrack.innerHTML = [...REVIEWS, ...REVIEWS].map(([c, logo, lw, q, name, title, face, two], i) =>
    `<div class="rev" style="left:${i * REV_PITCH}px;background:var(--${c})"><img class="logo" src="${IMG}logo_${logo}.svg" style="width:${lw}px" alt=""><blockquote>${q}</blockquote>` +
    `<div class="name${two ? ' two' : ''}">${name}</div><div class="title${two ? ' two' : ''}">${title}</div><div class="portrait"><img src="${IMG}portrait-${face}.webp" alt=""></div></div>`).join('');

  // the snake: thirteen circles, multiplied into the paper, that wander and follow the pointer
  const SNAKE = { count: 13, size: 177, overlap: 0.6, follow: 0.05, pace: 0.42, stagger: 0.22, W: 1280, H: 720, x: 80, y: 5483 };
  const snakeEl = $('#snake');
  const SNAKE_COLORS = ['var(--yellow)', 'var(--pink)', 'var(--aqua)'];
  snakeEl.innerHTML = Array.from({ length: SNAKE.count }, (_, i) => `<i style="background:${SNAKE_COLORS[i % 3]}"></i>`).reverse().join('');
  const snakeDots = $$('i', snakeEl).reverse().map((el) => ({ el, x: 0, y: 0, last: '' }));   // head first

  // the footer's i-dot changes colour every 1.2 s
  const iDots = $$('.wordmark i').map((el) => ({ el, op: '' }));

  /* ================= shadow twins ================= */
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(true);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-voice', 'id']) n.removeAttribute(a);
    tw.classList.add('twin');
    tw.setAttribute('aria-hidden', 'true');
    tw.style.setProperty('--blur', blur + 'px');
    el.before(tw);
    el._twin = { el: tw, surface, alpha, last: '', op: '' };
  }

  // the headline turns paper-coloured wherever a circle passes under it: a
  // paper copy of it inside a round lens that rides each circle (added after
  // the twins, so the shadow is the headline alone)
  const preH = $('#preH');
  const R = SNAKE.size / 2;
  preH.insertAdjacentHTML('beforeend', snakeDots.map(() => `<div class="lens"><span>${preH.firstChild.textContent}</span></div>`).join(''));
  const lenses = $$('.lens', preH).map((el) => ({ el, span: $('span', el), last: '', lastS: '' }));

  /* ================= layers ================= */
  const layers = $$('[data-depth]').map((el) => ({
    el, d: +el.dataset.depth, kind: el.dataset.kind || (nav.contains(el) ? 'vp' : 'page'),
    twin: el._twin || null, parent: null, cx: 0, cy: 0, hh: 0, A: null, last: '', skip: false,
  }));
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const winLayer = layers.find((L) => L.el === win);
  const snakeLayer = layers.find((L) => L.el === snakeEl), headLayer = layers.find((L) => L.el === preH);
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= state ================= */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, VW = DW, maxScroll = 5923, stops = [0, 0, 0, 0, 0, 0, 0];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const T = { mode: 'tour', j: 0, t: 0, from: 0, dur: 1, v: 0 };
  // clock: the springs' idle sway; tourT: the tour's own time; tt: the motion clock (everything of
  // Rime's that moves on its own), which never stops for a drag. tt and tourT are one and the same
  // until someone drags.
  let scroll = 0, clock = 0, tt = 0, tourT = 0, tone = 0, lift = 1, snapTone = true, settle = true;
  let hovered = false, touchActive = false, touchOn = false, pointerLive = false;
  const pointer = { x: 0, y: 0 }, bl = { x: 0, y: -0.2 };
  let down = null, dragging = false, samples = [];
  let running = false, parentVisible = true, raf = 0, tPrev = performance.now();
  let lastNav = '', lastTicks = '', lastTone = '', lastLogos = '', lastRev = '', lastRotor = '';
  let navY = 0, navDir = 1, navAcc = 0, prevScroll = 0, headHalf = { x: 720, y: 48 };
  const frameLog = [];

  /* the tour: [hold at the stop, then the move to the next], seconds at speed 1; about 20 s round */
  const LEGS = [[2.3, 1.4], [1.3, 1.3], [1.4, 1.4], [1.2, 1.3], [1.3, 1.3], [1.8, 1.1], [1.0, 2.4]];
  const PERIOD = LEGS.reduce((a, [h, m]) => a + h + m, 0);   // 20.5 s
  const STARTS = []; { let a = 0; for (const [h, m] of LEGS) { STARTS.push(a); a += h + m; } }
  const wrap = (t) => mod(t, PERIOD);
  // the page spans of Rime's moving parts (they run only while seen), and where each one's clock jumps back a tour
  const PARTS = { wave: [112, 592], logos: [1001, 1041], voices: [1113, 1653], ring: [1876, 2140], venn: [2178, 2780],
    reviews: [4256, 4672], snake: [5483, 6203], foot: [6160, 6823] };
  const wraps = {};
  const DARK = [[6203, 6785]];   // the footer: the ruler's ink turns light over it

  function layout() {
    const framed = MAT > 0 || (!!V['card.frame']);
    const [aw, ah] = String(V['card.aspect']).split(':').map(Number);
    stage.style.setProperty('--size', V['card.cardSize']);
    stage.style.setProperty('--ar', (aw / ah) || 1.6);
    const fc = FRAME_COLORS[V['card.frameColor']] || V['card.frameColor'] || FRAME_COLORS.yellow;
    card.style.setProperty('--frame-color', fc);
    card.classList.toggle('is-framed', framed);
    card.classList.toggle('ruler-inside', framed || EMBED);
    slot.classList.toggle('is-bleed', !framed && !EMBED);
    slot.classList.toggle('no-ruler', !V['card.ruler']);
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
    // fit the width; a frame taller than MAX_VH of page crops the sides instead (never letterboxed)
    s = Math.max(winW / DW, winH / MAX_VH);
    VW = winW / s; VH = winH / s;
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.transform = `translate3d(${(-(DW - VW) / 2 * s).toFixed(2)}px, 0, 0) scale(${s})`;
    persp.style.perspective = (V['tilt.perspective'] * cw) + 'px';
    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.hh = L.el.offsetHeight / 2;
      L.last = '_';
      if (L.twin) L.twin.last = '_';
    }
    maxScroll = Math.max(0, page.offsetHeight - VH);
    const mid = (y) => clamp(Math.round(y - VH / 2), 0, maxScroll);
    stops = [0, mid(1383), mid(2479), mid(3785), mid(4405), mid(5843), maxScroll];
    scroll = clamp(scroll, 0, maxScroll);
    // the sizes the moving parts need: caption widths, venn label widths
    for (const m of pill.msgs) m.w = m.span.offsetWidth || m.w;
    for (const l of vennLabels) l.w = l.el.offsetWidth || l.w;
    for (const m of pill.msgs) { m.clip.style.width = (m.w + 2) + 'px'; m.last = '_'; }
    headHalf = { x: preH.offsetWidth / 2, y: preH.offsetHeight / 2 };
    for (const k in PARTS) wraps[k] = hiddenMid(...PARTS[k]);
    snake.u = NaN;   // the snake is played again from its seed on the next frame
  }

  /* ---- the tour: a pure function of its own clock, so every loop closes exactly on the hero.
     A drag takes over (drag, coast, wait), then a glide hands back to the next stop and the
     tour clock picks up at that stop's hold. ---- */
  function tourAt(t) {
    t = wrap(t);
    for (let i = 0; i < LEGS.length; i++) {
      const [h, m] = LEGS[i], j = (i + 1) % LEGS.length;
      if (t < h) return { i, y: stops[i] };
      t -= h;
      if (t < m) return { i, y: stops[i] + (stops[j] - stops[i]) * ease(t / m) };
      t -= m;
    }
    return { i: 0, y: stops[0] };
  }
  // Rime's moving parts can't come round a whole number of times a tour at their own pace, so each
  // one's clock jumps back a tour at the middle of the longest stretch it spends out of the frame
  // (never seen); on the frame grid, so the snake played from there lands on the loop's frames
  const seenAt = (y, y0, y1) => y + VH > y0 - 40 - VH * 0.25 && y < y1 + 40 + VH * 0.25;
  function hiddenMid(y0, y1) {
    const N = 480;
    let best = 0, at = PERIOD / 2;
    for (let k = 0, run = 0; k < 2 * N; k++) {
      if (seenAt(tourAt((k % N) / N * PERIOD).y, y0, y1)) { run = 0; continue; }
      if (++run > best && run <= N) { best = run; at = (k - (run - 1) / 2) / N * PERIOD; }
    }
    return Math.round(wrap(at) * 60) / 60;
  }
  const local = (t, w) => w - PERIOD + wrap(t - w);   // t, running on through the seam and jumping back a tour at w
  function resume() {
    // the next stop at or below where it was let go; past the last one, glide home
    let j = stops.findIndex((y) => y >= scroll - 24);
    if (j < 0) j = 0;
    const dist = Math.abs(stops[j] - scroll);
    if (dist < 2) { T.mode = 'tour'; tourT = STARTS[j]; scroll = stops[j]; return; }
    T.mode = 'glide'; T.j = j; T.from = scroll; T.t = 0; T.dur = clamp(0.7 + dist / 1500, 0.9, 2.6);
  }
  // the site's resting loop is this tour recorded, so a hovered tile tells the card where
  // the loop is ({type: "ks-card", at}) and the live card picks up from that very frame
  function seekTime(t) {
    tt = tourT = wrap(t);
    T.mode = 'tour';
    scroll = prevScroll = tourAt(tourT).y;
    snapTone = settle = true;
    snake.u = NaN;
  }
  function advance(dt, still) {
    if (still) return;
    const tdt = dt * V['motion.tourSpeed'];
    tt = wrap(tt + tdt);
    if (dragging) return;
    if (T.mode === 'tour') { tourT = wrap(tourT + tdt); scroll = tourAt(tourT).y; return; }
    if (T.mode === 'coast') {
      const tau = 0.33 * V['drag.momentum'];
      if (tau <= 0.001) T.v = 0;
      scroll += T.v * dt;
      T.v *= Math.exp(-dt / Math.max(tau, 0.001));
      if (scroll <= 0 || scroll >= maxScroll) { scroll = clamp(scroll, 0, maxScroll); T.v = 0; }
      if (Math.abs(T.v) < 12) { T.mode = 'wait'; T.t = 0; }
      return;
    }
    if (T.mode === 'wait') { T.t += dt; if (T.t >= V['drag.resumeAfter']) resume(); return; }
    if (T.mode === 'glide') {
      T.t += tdt;
      const u = Math.min(1, T.t / T.dur);
      scroll = T.from + (stops[T.j] - T.from) * ease(u);
      if (u >= 1) { T.mode = 'tour'; tourT = STARTS[T.j]; }
    }
  }

  // the nav: it slides away as the page goes down and comes back (without the banner) as it goes up
  function navStep(y, dt, still) {
    const dS = y - prevScroll;
    prevScroll = y;
    if (dS !== 0) {
      if (Math.sign(dS) === navDir) navAcc = 0;
      else { navAcc += Math.abs(dS); if (navAcc > 24) { navDir = -navDir; navAcc = 0; } }
    }
    const navT = y < 60 ? 0 : (navDir < 0 ? -38 : -112);
    navY += (navT - navY) * (still ? 1 : 1 - Math.exp(-dt / 0.14));
  }
  // it remembers which way the page last went, so a jump in time (the first frame, or the site's
  // {at}) plays it through the tour before it, and it is just where the loop has it
  function navSettle(t) {
    const N = Math.round(PERIOD * 60);
    navY = 0; navDir = 1; navAcc = 0; prevScroll = tourAt(t - (N + 1) / 60).y;
    for (let m = N; m >= 1; m--) navStep(tourAt(t - m / 60).y, 1 / 60, false);
  }

  function step(S, target, k, c, dt) {
    const n = Math.ceil(dt / (1 / 240)), h = dt / n;
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
    const k = V['motion.stiffness'], c = V['motion.damping'], tiltMax = V['tilt.tiltMax'];
    const engaged = hovered || touchActive || touchOn || dragging || V['debug.hold'] || still;

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

    advance(dt, still);
    scroll = clamp(scroll, 0, maxScroll);
    if (settle && T.mode === 'tour' && !still) navSettle(tourT);
    settle = false;
    navStep(scroll, dt, still);

    render(dt, still);
    raf = requestAnimationFrame(frame);
  }

  function setT(o, el, str) { if (o.last !== str) { el.style.transform = str; o.last = str; } }
  function setO(o, el, v) { if (o.op !== v) { el.style.opacity = v; o.op = v; } }

  function render(dt, still) {
    const rx = spr.rx.x, ry = spr.ry.x;
    const hc = clamp(spr.h.x, -0.2, 1.2), h01 = clamp(spr.h.x, 0, 1);
    const depth = V['layers.depth'], par = V['layers.parallax'], spread = V['layers.spread'];
    const tiltMax = V['tilt.tiltMax'];
    // embedded, the frame is the limit: the card lifts only as far as the bleed allows once its
    // nearest corner has come forward with the tilt (with no bleed it shrinks a touch instead)
    const hoverLift = 1 + (V['tilt.hoverScale'] - 1) * hc;
    const ra = rx * Math.PI / 180, rb = ry * Math.PI / 180, Pc = V['tilt.perspective'] * cardW;
    lift = EMBED
      ? Math.min(hoverLift, Math.min((cw / 2 + BLEED) / (cw / 2), (ch / 2 + BLEED) / (ch / 2)) *
          (1 - (Math.abs(Math.sin(rb)) * cardW / 2 + Math.abs(Math.sin(ra)) * cardH / 2) / Pc))
      : hoverLift;
    const shadowK = V['light.shadow'];

    page.style.transform = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    const navStr = `translate3d(0, ${navY.toFixed(2)}px, 0)`;
    if (navStr !== lastNav) { navShift.style.transform = navStr; lastNav = navStr; }

    card.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${(lift / K).toFixed(5)})`;

    // the eye, in card space: the perspective distance in front of the card centre, rotated into the card's frame
    const P = V['tilt.perspective'] * cardW / lift;
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
        : { x: (L.cx - DW / 2) * s, y: (L.cy - (L.kind === 'page' ? scroll : -navY) - VH / 2) * s };
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
        const A = project(Tw.surface, { x: throwPx * LIGHT.x, y: throwPx * LIGHT.y });
        // the higher the layer, the further its shadow falls and the wider it spreads
        A.t *= 1 + throwPx / cardW * 0.35;
        write(Tw.el, A, Tw);
        // a layer that has left the window takes its shadow with it, so none smudges the edge
        const vis = L.kind !== 'page' ? 1 : clamp((Math.min(L.cy + L.hh, scroll + VH) - Math.max(L.cy - L.hh, scroll)) / Math.min(2 * L.hh, 80), 0, 1);
        const op = (Tw.alpha * shadowK * h01 * vis).toFixed(3);
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

    // the light: one round bloom under the pointer, a faint rim nearest it, and the card's own shadow
    const bxp = (bl.x + 1) / 2 * cardW, byp = (bl.y + 1) / 2 * cardH;
    bloom.style.transform = `translate3d(${bxp.toFixed(1)}px, ${byp.toFixed(1)}px, 0)`;
    bloom.style.opacity = (V['light.bloom'] * h01).toFixed(3);
    rimLight.style.transform = `translate3d(${bxp.toFixed(1)}px, ${byp.toFixed(1)}px, 0)`;
    rim.style.opacity = (V['light.rim'] * h01).toFixed(3);
    const ex = tiltMax ? ry / tiltMax : 0, ey = tiltMax ? -rx / tiltMax : 0;
    cshadow.style.transform = `translate3d(${(-ex * 0.035 * cw).toFixed(1)}px, ${((0.03 + 0.035 * h01 - ey * 0.02) * cw).toFixed(1)}px, 0) scale(${(0.96 + 0.06 * h01).toFixed(3)})`;
    // embedded, the card sits exactly on its tile at rest: its shadow only shows once it lifts
    cshadow.style.opacity = ((EMBED ? 0.42 * h01 : 0.18 + 0.42 * h01) * (0.4 + shadowK)).toFixed(3);

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
    if (card.classList.contains('is-framed')) dark = V['card.frameColor'] === 'ink' ? 1 : 0;
    else if (EMBED) { const yr = scroll + VH / 2; for (const [y0, y1] of DARK) if (yr >= y0 && yr < y1) dark = 1; }
    // (a jump in time, or the first frame, lands with the ink already right: no fade through)
    tone += (dark - tone) * (still || snapTone ? 1 : 1 - Math.exp(-dt / 0.18));
    snapTone = false;
    const ts = tone.toFixed(3);
    if (ts !== lastTone) { lastTone = ts; inkLight.style.opacity = ts; inkDark.style.opacity = (1 - tone).toFixed(3); }

    ambient(dt, still);
  }

  /* ================= Rime's own motion, only where it can be seen ================= */
  const seen = (y0, y1) => scroll + VH > y0 - 40 && scroll < y1 + 40;
  // each part's own time: the motion clock, jumping back a tour while the part is out of sight (times the ambient dial)
  const partT = (k) => local(tt, wraps[k]) * V['motion.ambient'];
  // the snake's path: the head's trail, newest last
  const trail = [];
  const head = { x: SNAKE.W * 0.5, y: SNAKE.H * 0.42, ang: 0.9 };
  let grab = 0, grabFrom = 0, grabGoal = 0, grabT = 99;
  const snake = { u: NaN };   // the snake's time its state is at

  function snakeTurn(time, dt, speed) {
    let wander = 0.45 * Math.sin(time * 0.4) + 0.25 * Math.sin(time * 0.17 + 2);
    const cap = speed / 420;
    wander = clamp(wander, -cap, cap);
    let wall = 0;
    const margin = Math.max(340, SNAKE.size * 1.6);
    const edge = Math.min(head.x, SNAKE.W - head.x, head.y, SNAKE.H - head.y);
    if (edge < margin) {
      let diff = Math.atan2(SNAKE.H / 2 - head.y, SNAKE.W / 2 - head.x) - head.ang;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const wcap = speed / 240;
      wall = clamp(diff * Math.min(1, (margin - edge) / margin) * 2, -wcap, wcap);
    }
    head.ang += (wander + wall) * dt;
  }
  function snakeStep(time, dt, target) {
    const speed = 160 * SNAKE.pace;
    snakeTurn(time, dt, speed);
    let vx = Math.cos(head.ang) * speed, vy = Math.sin(head.ang) * speed;
    if (grab > 0.001 && target) {
      const tx = clamp(target.x, R, SNAKE.W - R), ty = clamp(target.y, R, SNAKE.H - R);
      const cx = (tx - head.x) * SNAKE.follow * 60, cy = (ty - head.y) * SNAKE.follow * 60;
      vx += (cx - vx) * grab; vy += (cy - vy) * grab;
      if (grab > 0.05 && (vx || vy)) head.ang = Math.atan2(vy, vx);
    }
    head.x = clamp(head.x + vx * dt, R, SNAKE.W - R);
    head.y = clamp(head.y + vy * dt, R, SNAKE.H - R);
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(head.x - last.x, head.y - last.y) > 1) trail.push({ x: head.x, y: head.y });
    if (trail.length > 1800) trail.splice(0, trail.length - 1500);
  }
  function snakePoints() {
    const spacing = SNAKE.size * (1 - SNAKE.overlap);
    const pts = [{ x: trail[trail.length - 1].x, y: trail[trail.length - 1].y }];
    let prev = pts[0], acc = 0;
    for (let i = trail.length - 2; i >= 0 && pts.length < SNAKE.count; i--) {
      const cur = trail[i];
      let dx = cur.x - prev.x, dy = cur.y - prev.y, seg = Math.hypot(dx, dy);
      while (seg > 0 && acc + seg >= spacing && pts.length < SNAKE.count) {
        const t = (spacing - acc) / seg;
        prev = { x: prev.x + dx * t, y: prev.y + dy * t };
        pts.push({ x: prev.x, y: prev.y });
        dx = cur.x - prev.x; dy = cur.y - prev.y; seg = Math.hypot(dx, dy); acc = 0;
      }
      acc += seg; prev = cur;
    }
    while (pts.length < SNAKE.count) pts.push({ ...pts[pts.length - 1] });
    return pts;
  }
  // the circles ease after their points on the head's path, the tail a touch slower
  function snakeFollow(dt) {
    const pts = snakePoints();
    const n = SNAKE.count;
    for (let i = 0; i < n; i++) {
      const kk = 1 - Math.pow(1 - 0.55 * (1 - SNAKE.stagger * i / (n - 1)), dt * 60);
      snakeDots[i].x += (pts[i].x - snakeDots[i].x) * kk;
      snakeDots[i].y += (pts[i].y - snakeDots[i].y) * kk;
    }
  }
  // the snake wanders on its own, so it is told from a seed: laid out whole (the trail seeded the way
  // the live page does it) where its clock jumps back a tour, out of sight, and stepped on from there a
  // frame at a time. A jump in time (the first frame, the site's {at}) plays it again up to now.
  function snakeReplay(u) {
    const u0 = (wraps.snake - PERIOD) * V['motion.ambient'];
    trail.length = 0;
    Object.assign(head, { x: SNAKE.W * 0.5, y: SNAKE.H * 0.42, ang: 0.9 });
    grab = grabFrom = grabGoal = 0; grabT = 99;
    const speed = 160 * SNAKE.pace, n = Math.ceil(SNAKE.count * SNAKE.size * (1 - SNAKE.overlap) * 1.6 / speed * 60);
    for (let i = n; i >= 1; i--) snakeStep(u0 - i / 60, 1 / 60, null);
    snakePoints().forEach((p, i) => { snakeDots[i].x = p.x; snakeDots[i].y = p.y; });
    const N = Math.max(0, Math.round((u - u0) * 60));
    for (let i = 1; i <= N; i++) {
      snakeStep(u0 + i / 60, 1 / 60, null);
      if (i > N - 90) snakeFollow(1 / 60);   // the circles have caught up with the head well within a second and a half
    }
    snake.u = u0 + N / 60;
  }

  function ambient(dt, still) {
    // the hero waveform: each column steps to the frame for its spread
    if (seen(112, 592)) {
      const pos = partT('wave') * WAVE.speed;
      for (const C of waveCols) {
        const e = WAVE.amp * (0.5 + 0.5 * Math.sin(C.i / (WAVE.cols - 1) * Math.PI * 2 - pos));
        const fIdx = Math.round(e / WAVE.amp * (WAVE.frames - 1));
        if (fIdx !== C.f) { C.f = fIdx; C.el.style.transform = `translate3d(${-fIdx * WAVE.w}px, 0, 0)`; }
      }
    }
    if (seen(1001, 1041)) {
      const str = `translate3d(${(-mod(241 + partT('logos') * 40, LOGO_PITCH)).toFixed(2)}px, 0, 0)`;
      if (str !== lastLogos) { logos.style.transform = str; lastLogos = str; }
    }

    // the voices card: one voice plays at a time, its orbit circling behind the button
    if (seen(1113, 1653)) {
      const t = partT('voices');
      const per = 2.6, idx = mod(Math.floor(t / per), voices.length), ph = mod(t, per) / per;
      voices.forEach((v, i) => {
        const on = i === idx ? Math.min(1, ph / 0.12, (1 - ph) / 0.12) : 0;
        const op = on.toFixed(3);
        setO(v, v.orbit, op);
        if (v.play.style.opacity !== (1 - on).toFixed(2)) { v.play.style.opacity = (1 - on).toFixed(2); v.pause.style.opacity = on.toFixed(2); }
        if (on > 0) {
          const grow = 0.2 + 0.8 * easeIO3(Math.min(1, ph / 0.2));
          v.dots.forEach((d, j) => {
            const ang = 0.55 * t + j * Math.PI;
            const rr = 16 * (1 + (j ? 0.14 * Math.sin(t * 4.4 + 2.1) + 0.06 * Math.sin(t * 7.6) : 0.14 * Math.sin(t * 3.7) + 0.06 * Math.sin(t * 6.3 + 1.2)));
            setT(d, d.el, `translate3d(${(Math.cos(ang) * rr).toFixed(2)}px, ${(Math.sin(ang) * rr).toFixed(2)}px, 0) scale(${grow.toFixed(3)})`);
          });
        }
      });
    }

    // the call ring: a caption typed out at three o'clock, then the ring spins on and the next one comes
    if (seen(1876, 2140)) {
      const t = partT('ring');
      // which caption, and how far through it: type, hold, delete, pause, spin
      let tc = mod(t, MSG_CYCLE), mi = 0;
      while (tc > MSG_LEN[mi]) { tc -= MSG_LEN[mi]; mi = (mi + 1) % MESSAGES.length; }
      const m = MESSAGES[mi], typeD = m.length * 0.038, delD = m.length * 0.019;
      let shown;
      if (tc < typeD) shown = tc / typeD;
      else if (tc < typeD + 1.55) shown = 1;
      else if (tc < typeD + 1.55 + delD) shown = 1 - (tc - typeD - 1.55) / delD;
      else shown = 0;
      const live = tc < typeD + 1.55 + delD + 0.05;
      // the ring's angle: every spin before this caption, plus this one's as it happens
      let turns = 0;
      for (let i = 0; i < mi; i++) turns += SPINS[i];
      const spinStart = typeD + 1.55 + delD + 0.26;
      const spinU = clamp((tc - spinStart) / 0.9, 0, 1);
      const steps = turns + SPINS[mi] * easeIO3(spinU);
      const stepDeg = 360 / RING.count;
      const rStr = `rotate(${(steps * stepDeg).toFixed(3)}deg)`;
      if (rStr !== lastRotor) { rotor.style.transform = rStr; lastRotor = rStr; }
      const active = ((-Math.round(turns + (spinU >= 1 ? SPINS[mi] : 0))) % RING.count + RING.count) % RING.count;
      ringDots.forEach((d, i) => {
        const isActive = live && i === active;
        const rr = RING.orbit + (isActive ? 0 : Math.sin(t * 1.8 + d.ph) * RING.amp);
        setT(d, d.el, `translate3d(${(Math.cos(d.a) * rr).toFixed(2)}px, ${(Math.sin(d.a) * rr).toFixed(2)}px, 0)`);
        setO(d, d.el, isActive ? '0' : '1');
      });
      const col = RING_COLORS[active % 3];
      if (col !== pill.c) { rpill.style.setProperty('--c', col); pill.c = col; }
      const msg = pill.msgs[mi];
      const w = Math.max(0, msg.w * shown);
      const pw = Math.max(21, w + 14);
      const pOn = live ? 1 : 0;
      setT(pill, pill.mid, `scale(${((pw - 21) / 100).toFixed(4)}, ${pOn})`);
      pill.capR.style.transform = `translate3d(${(pw - 21).toFixed(2)}px, 0, 0) scale(${pOn})`;
      rpill.firstChild.style.transform = `scale(${pOn})`;
      pill.msgs.forEach((mm, i) => {
        const on = i === mi && live;
        setO(mm, mm.el, on ? '1' : '0');
        if (on) {
          // the typing: a window that opens left to right over the text
          const off = mm.w + 2 - w;
          setT(mm, mm.clip, `translate3d(${(-off).toFixed(2)}px, 0, 0)`);
          mm.span.style.transform = `translate3d(${off.toFixed(2)}px, 0, 0)`;
        }
      });
      // the call timer, a tick a second
      const secs = mod(Math.floor(t), 120), roll = easeOut3(((t - Math.floor(t)) - 0.86) / 0.14);
      const su = secs % 10, st = Math.floor(secs / 10) % 6, mu = Math.floor(secs / 60);
      const pos = [mu + (secs === 59 || secs === 119 ? roll : 0), st + (su === 9 ? roll : 0), su + roll];
      odo.forEach((o, i) => setT(o, o.el, `translate3d(0, ${(-pos[i] * 15).toFixed(2)}px, 0)`));
    }

    // the venn: the voices orbit slowly; every four seconds the tab changes, they spin round once and resize
    if (seen(2178, 2780)) {
      const t = partT('venn');
      const n = still ? 0 : Math.floor(t / VENN.hold), since = still ? 99 : t - n * VENN.hold;   // tab changes so far, s since the last
      const tab = mod(n, 3), was = mod(n - 1, 3);
      const su = easeOut3(since / 0.5), extra = Math.PI * 2 * (easeOut3(since / 0.7) - 1);
      vennCircles.forEach((cEl, i) => {
        const size = VENN_SIZES[was][i] + (VENN_SIZES[tab][i] - VENN_SIZES[was][i]) * su;
        const ang = VENN.base[i] + (still ? 0 : VENN.slow * t) + extra;
        const x = VENN.cx + Math.cos(ang) * VENN.orbit, y = VENN.cy + Math.sin(ang) * VENN.orbit;
        setT(cEl, cEl.el, `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${(size / 248).toFixed(4)})`);
        const lb = vennLabels[i];
        setT(lb, lb.el, `translate3d(${(x - lb.w / 2).toFixed(2)}px, ${(y - 7.2).toFixed(2)}px, 0)`);
      });
      const p = clamp(since / VENN.hold, 0, 1);
      vInds.forEach((ind, i) => {
        setO(ind, ind.el, i === tab ? '1' : '0');
        if (i === tab) setT(ind, ind.fill, `translate3d(${(-(1 - p) * 100).toFixed(2)}%, 0, 0)`);
      });
    }

    if (seen(4256, 4672)) {
      const str = `translate3d(${(-mod(618 + partT('reviews') * 40, REV_SET)).toFixed(2)}px, 0, 0)`;
      if (str !== lastRev) { revTrack.style.transform = str; lastRev = str; }
    }

    // the snake: it wanders on its own, and over the section it chases the pointer. It is stepped
    // every frame, seen or not, so it is always where its own clock says it is
    {
      let target = null;
      if (seen(5483, 6203) && pointerLive && (hovered || touchActive)) {
        const px = (pointer.x + 1) / 2 * VW + (DW - VW) / 2 - SNAKE.x;
        const py = scroll + (pointer.y + 1) / 2 * VH - SNAKE.y;
        if (px >= 0 && px <= SNAKE.W && py >= 0 && py <= SNAKE.H) target = { x: px, y: py };
      }
      const goal = target ? 1 : 0;
      if (goal !== grabGoal) { grabGoal = goal; grabFrom = grab; grabT = 0; }
      grabT += dt;
      grab = grabFrom + (grabGoal - grabFrom) * easeIO3(grabT / 2);
      const u = partT('snake'), du = u - snake.u;
      if (du > 0 && du < 0.25) { if (!still) { snakeStep(u, du, target); snakeFollow(du); snake.u = u; } }
      else if (du !== 0) snakeReplay(u);   // the first frame, a jump in time, or its clock's jump back (out of sight)
    }
    if (seen(5483, 6203)) {
      snakeDots.forEach((d) => setT(d, d.el, `translate3d(${d.x.toFixed(2)}px, ${d.y.toFixed(2)}px, 0)`));
      // the paper-coloured headline inside each circle, lined up with the headline wherever the tilt has moved it
      const A = snakeLayer.A, B = headLayer.A;
      if (A && B) {
        const kc = A.t / B.t;
        const hx = headHalf.x, hy = headHalf.y;
        lenses.forEach((ln, i) => {
          const d = snakeDots[i];
          const Px = A.Q.x + A.o.x + A.t * s * (d.x - SNAKE.W / 2), Py = A.Q.y + A.o.y + A.t * s * (d.y - SNAKE.H / 2);
          const qx = hx + (Px - B.Q.x - B.o.x) / (B.t * s), qy = hy + (Py - B.Q.y - B.o.y) / (B.t * s);
          const str = `translate3d(${qx.toFixed(2)}px, ${qy.toFixed(2)}px, 0) scale(${kc.toFixed(4)}) translate3d(${-R}px, ${-R}px, 0)`;
          if (str !== ln.last) {
            ln.el.style.transform = str; ln.last = str;
            ln.span.style.transform = `translate3d(${R}px, ${R}px, 0) scale(${(1 / kc).toFixed(4)}) translate3d(${(-qx).toFixed(2)}px, ${(-qy).toFixed(2)}px, 0)`;
          }
        });
      }
    }

    if (seen(6160, 6823)) {
      const idx = mod(Math.floor(partT('foot') / 1.2), 3);
      iDots.forEach((d, i) => setO(d, d.el, i === (idx + 1) % 3 ? '1' : '0'));
    }
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
      if (wasTouch && !EMBED) touchOn = !touchOn;   // on a phone, a tap shows the layers
      open();
    }
    if (dragging) {
      // momentum: the speed over the last tenth of a second, if the hand was still moving when it let go
      let v = 0;
      const tNow = e.timeStamp;
      const recent = samples.filter((p) => tNow - p[0] < 100);
      if (!cancelled && !reduced.matches && recent.length > 1 && tNow - recent[recent.length - 1][0] < 80) {
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
    const canDrag = e.pointerType !== 'touch' || TOUCH_DRAG;
    if (canDrag) { try { persp.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: fine */ } }
    if (e.pointerType === 'touch' && TOUCH_DRAG) touchActive = true;
    if (T.mode === 'coast') { T.v = 0; T.mode = 'wait'; T.t = 0; }   // a press catches a flick, like a phone
    if (e.pointerType !== 'touch') e.preventDefault();               // no text selection, no image ghost
    setPointer(e);
  });
  persp.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') hovered = true;
    if (e.pointerType !== 'touch' || TOUCH_DRAG) setPointer(e);
    if (!down || e.pointerId !== down.id) return;
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (!dragging && down.moved > 3 && (down.type !== 'touch' || TOUCH_DRAG)) {
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
      const stepPx = across ? ddx * V['drag.scrub'] : -ddy;
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

  /* ================= running, pausing ================= */
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
  reduced.addEventListener('change', () => { if (reduced.matches) seekTime(0); });

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
    get scroll() { return scroll; }, get mode() { return T.mode; }, get stop() { return tourAt(tourT).i; },
    get h() { return spr.h.x; }, get running() { return running; }, get layers() { return layers.length; },
    get stops() { return stops.slice(); }, get maxScroll() { return maxScroll; }, get VH() { return VH; },
    get frames() { return frameLog.slice(); }, get period() { return PERIOD; }, get tourTime() { return tourT; },
    seek(i, t = 0) { seekTime(STARTS[clamp(i | 0, 0, stops.length - 1)] + t); },
    seekTime,
    // park the page anywhere (the tour waits until resume())
    park(y) { scroll = clamp(y, 0, maxScroll); T.mode = 'wait'; T.t = -1e9; },
    resume() { T.t = 1e9; },
  };
  window.rimeCard = window.__rimeCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  wake();
})();
