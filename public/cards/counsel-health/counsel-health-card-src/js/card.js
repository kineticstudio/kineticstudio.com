/* Counsel Health work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 20 s round, never paused by
     hover; a drag (either axis) takes over, coasts, and the tour picks up from
     the next stop down from where it was let go
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, one round bloom of light under the pointer
   - the page: Counsel's own scroll choreography (the hero riding up off the
     held "one place" ring as it draws in, the phone held still through the
     walkthrough while its screen follows the steps) and its ambient motion
     (the hero's health card cycling, the thread breathing, the members' notes
     drifting by)

   window.counselCard is the handle the page's dials and the verify script use. */
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
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksOut = $('.ruler-out .ticks'), ticksIn = $$('.ruler-in .ticks');
  const inkDark = $('.ruler-in .dark'), inkLight = $('.ruler-in .light');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // Counsel's design width
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left
  const STEP = 640;                      // design px of scroll between the walkthrough's steps
  const NS = 'http://www.w3.org/2000/svg';
  const C = { navy: '#132045', mist: '#BBD6EA', pink: '#FF93AD', yellow: '#FADA78', leaf: '#9ADB8F', blue: '#47AFFF', green: '#018150', forest: '#005434' };

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.72, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.65,
    'motion.tourSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.friction': 0.32, 'drag.scrub': 2.5, 'drag.resumeAfter': 1.1,
    'card.cardSize': 40, 'card.aspect': '16:10', 'card.frame': false, 'card.frameColor': '#bbd6ea', 'card.ruler': true,
    'debug.outlines': false, 'debug.hold': false,
  };

  /* ================= small marks, inline (nothing is fetched) ================= */
  const ICON = {
    chev: '<svg viewBox="0 0 10 10" fill="none"><path d="M2 3.6L5 6.6L8 3.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 12H19M13 6l6 6-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock: '<svg viewBox="0 0 13 14" fill="none"><path d="M3.5 6.2V4.6a3 3 0 0 1 6 0v1.6" stroke="currentColor" stroke-width="1.5"/><rect x="1.5" y="6" width="10" height="7.5" rx="2" fill="currentColor"/></svg>',
    status: '<svg viewBox="0 0 62 14" fill="#132045"><rect x="0" y="9" width="3" height="4" rx=".7"/><rect x="4.5" y="6.5" width="3" height="6.5" rx=".7"/><rect x="9" y="4" width="3" height="9" rx=".7"/><rect x="13.5" y="1.5" width="3" height="11.5" rx=".7"/><path d="M29 12.6l-2.4-2.6a3.4 3.4 0 0 1 4.8 0zM24.7 8a6.3 6.3 0 0 1 8.6 0l-1.3 1.4a4.4 4.4 0 0 0-6 0zM22.4 5.6a9.6 9.6 0 0 1 13.2 0l-1.3 1.4a7.7 7.7 0 0 0-10.6 0z"/><rect x="40.5" y="1.5" width="18" height="10.5" rx="3" fill="none" stroke="#132045" stroke-opacity=".45"/><rect x="42.2" y="3.2" width="14.6" height="7.1" rx="1.6"/><rect x="59.5" y="5" width="1.6" height="3.6" rx=".8" fill-opacity=".45"/></svg>',
    menu: '<svg viewBox="0 0 13 13" fill="none" stroke="#132045" stroke-width="1.3" stroke-linecap="round"><path d="M1.5 3h10M1.5 6.5h10M1.5 10h6"/></svg>',
    person: '<svg viewBox="0 0 13 13" fill="none" stroke="#132045" stroke-width="1.2"><circle cx="6.5" cy="4.2" r="2.4"/><path d="M2 12c.4-2.6 2.2-4 4.5-4s4.1 1.4 4.5 4"/></svg>',
    wave: '<svg viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><path d="M1 4.5v2M3 3v5M5 1.5v8M7 3v5M9 4.5v2"/></svg>',
    globe: '<svg viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width=".9"><circle cx="5.5" cy="5.5" r="4.6"/><path d="M.9 5.5h9.2M5.5.9c-2.6 2.9-2.6 6.3 0 9.2M5.5.9c2.6 2.9 2.6 6.3 0 9.2"/></svg>',
    copy: '<svg viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width=".9"><rect x="3.3" y="3.3" width="6.4" height="6.4" rx="1.2"/><path d="M7.4 1.3H2.5a1.2 1.2 0 0 0-1.2 1.2v4.9"/></svg>',
    clip: '<svg viewBox="0 0 13 14" fill="none" stroke="#6c6862" stroke-width="1.1" stroke-linecap="round"><path d="M11 6.6L6.6 11a3 3 0 0 1-4.3-4.3L7.2 1.9a2 2 0 0 1 2.9 2.9L5.3 9.6a1 1 0 0 1-1.4-1.4l4.3-4.3"/></svg>',
    up: '<svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10V2.5M2.8 5.5L6 2.3l3.2 3.2"/></svg>',
    check: '<svg viewBox="0 0 14 14" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.4l2.4 2.4 4.6-5.3"/></svg>',
    tick: '<svg viewBox="0 0 9 9" fill="none" stroke="#132045" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 4.7l1.8 1.8 3.6-4"/></svg>',
    doc: '<svg viewBox="0 0 18 20" fill="none" stroke="#005434" stroke-width="1.4"><rect x="1.5" y="1.5" width="15" height="17" rx="3"/><path d="M5.5 7h7M5.5 10.5h7M5.5 14h4" stroke-linecap="round"/></svg>',
    in: '<svg viewBox="0 0 17 17" fill="currentColor"><rect x="1.5" y="6" width="3" height="9.5"/><circle cx="3" cy="2.8" r="1.8"/><path d="M6.5 6h2.9v1.4c.5-.9 1.6-1.7 3.2-1.7 3 0 3.4 2 3.4 4.4v5.4h-3v-4.8c0-1.2 0-2.6-1.6-2.6s-1.9 1.2-1.9 2.5v4.9h-3z"/></svg>',
    fb: '<svg viewBox="0 0 17 17" fill="currentColor"><path d="M9.6 16.5V9.3h2.3l.4-2.7H9.6V4.9c0-.8.3-1.3 1.4-1.3h1.4V1.2c-.3 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v2H4.8v2.7H7v7.2z"/></svg>',
    ig: '<svg viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="1.5" width="14" height="14" rx="4"/><circle cx="8.5" cy="8.5" r="3.3"/><circle cx="12.8" cy="4.2" r=".6" fill="currentColor" stroke="none"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.4 3.5h2.9l-6.3 7.2 7.4 9.8h-5.8l-4.5-5.9-5.2 5.9H3l6.7-7.7-7.1-9.3h5.9l4.1 5.4zm-1 15.3H18L7.7 5.1H6z"/></svg>',
  };
  for (const el of $$('[data-icon]')) el.innerHTML = ICON[el.dataset.icon] || '';

  /* a smooth line through points (Catmull-Rom as cubic beziers) */
  function curve(P) {
    let d = `M${P[0][0]} ${P[0][1]}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
    }
    return d;
  }
  /* a thread: one curve, cut into coloured runs by x (static dashes, drawn once) */
  function thread(svg, pts, runs, width) {
    const probe = document.createElementNS(NS, 'path');
    const d = curve(pts);
    probe.setAttribute('d', d);
    svg.appendChild(probe);
    const L = probe.getTotalLength();
    // where along the line each x falls
    const N = 400, xs = [];
    for (let i = 0; i <= N; i++) xs.push([probe.getPointAtLength(L * i / N).x, L * i / N]);
    const at = (x) => { for (let i = 1; i < xs.length; i++) if (xs[i][0] >= x) return xs[i - 1][1] + (xs[i][1] - xs[i - 1][1]) * (x - xs[i - 1][0]) / Math.max(0.001, xs[i][0] - xs[i - 1][0]); return L; };
    probe.remove();
    svg.innerHTML = runs.map(([x0, x1, c]) => {
      const a = at(x0), b = at(x1);
      return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${width}" stroke-dasharray="0 ${a.toFixed(1)} ${(b - a).toFixed(1)} ${(L + 10).toFixed(0)}"/>`;
    }).join('');
  }

  /* ================= the hero ================= */
  // the drawn thread under the health card (scripted on the live site; here a still curve that breathes)
  thread($('#heroThread'),
    [[-40, 76], [0, 82], [340, 145], [563, 186], [720, 206], [834, 186], [980, 157], [1080, 136], [1200, 124], [1320, 130], [1480, 155]],
    [[-40, 340, C.mist], [340, 352, C.forest], [352, 470, C.green], [470, 486, C.leaf], [486, 720, C.blue],
     [720, 950, C.pink], [950, 964, C.forest], [964, 1075, C.yellow], [1075, 1090, C.leaf], [1090, 1480, C.forest]], 8);
  // the chronic care card's blood pressure week, drawn the live card's way
  {
    const vals = [120, 112, 126, 117, 129, 145], lo = 80, hi = 160, a = 244, r = 116, top = 10, bot = 24;
    const y = (t) => r - bot - (t - lo) / (hi - lo) * (r - bot - top);
    const P = vals.map((t, i) => [28 + i / (vals.length - 1) * (a - 40), +y(t).toFixed(1)]);
    const line = curve(P);
    const guides = [80, 120, 160].map((t) => `<path d="M28 ${y(t)}H${a - 12}" stroke="rgba(19,32,69,.12)"/><text x="0" y="${y(t) + 4}">${t}</text>`).join('');
    const days = ['Mon', 'Wed', 'Fri', 'Today'].map((t, i) => `<text x="${28 + [0, 0.4, 0.72, 1][i] * (a - 40)}" y="${r - 4}" text-anchor="${i === 3 ? 'end' : 'middle'}">${t}</text>`).join('');
    const dots = P.map(([px, py], i) => i === P.length - 1
      ? `<circle cx="${px}" cy="${py}" r="7" fill="${C.navy}"/><circle cx="${px}" cy="${py}" r="4" fill="${C.yellow}"/>`
      : `<circle cx="${px}" cy="${py}" r="4" fill="${C.navy}"/>`).join('');
    $('#mcChart').innerHTML = `<defs><linearGradient id="mcWarm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.yellow}" stop-opacity=".45"/><stop offset="1" stop-color="${C.yellow}" stop-opacity="0"/></linearGradient></defs>${guides}${days}` +
      `<path d="${line} L${P[P.length - 1][0]} ${r - bot + 6} L${P[0][0]} ${r - bot + 6} Z" fill="url(#mcWarm)"/>` +
      `<path d="${line}" fill="none" stroke="${C.navy}" stroke-width="2.5" stroke-linecap="round"/>${dots}`;
  }

  /* ================= the "one place" ring ================= */
  const RC = [720, 411], RR = 306;
  const onRing = (deg, rr = RR) => { const t = deg * Math.PI / 180; return [RC[0] + rr * Math.sin(t), RC[1] - rr * Math.cos(t)]; };
  const CHIPS = [['Chronic care', -29, C.yellow, 134], ['Prescriptions', 43, C.leaf, 139], ['Lab results', 115, C.blue, 120], ['Primary care', 187, C.mist, 134], ['Urgent care', 259, C.pink, 126]];
  {
    let arcs = '';
    CHIPS.forEach(([, a0, color], i) => {
      const a1 = i < CHIPS.length - 1 ? CHIPS[i + 1][1] : CHIPS[0][1] + 360;
      const p0 = onRing(a0), p1 = onRing(a1);
      arcs += `<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}A${RR} ${RR} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" fill="none" stroke="${color}" stroke-width="6"/>`;
    });
    $('#ring').innerHTML = `<svg viewBox="0 0 1440 900" aria-hidden="true">${arcs}</svg>`;
    $('#uChips').innerHTML = CHIPS.map(([name, a, color, w]) => {
      const [x, y] = onRing(a);
      return `<div class="u-chip" style="left:${(x - w / 2).toFixed(0)}px;top:${(y - 19).toFixed(0)}px;width:${w}px;background:${color}" data-layer="chip" data-depth="0.62" data-shadow="0.1,0.3,10,1">${name}</div>`;
    }).join('');
  }
  const NEEDS = [['Cancer screenings', 702, 47], ['Medication refills', 835, 61], ['Nutrition', 532, 77], ['Care navigation', 629, 77], ['Med side effects', 910, 91],
    ['Wearable data review', 495, 107], ['Birth control', 946, 121], ['Weight management', 1034, 151], ['Health results review', 412, 157], ['Chronic disease', 409, 202],
    ['Hair loss', 1036, 246], ['Skincare', 1132, 294], ['Back pain', 303, 322], ['Pink eye', 344, 395], ['Annual wellness', 1097, 401], ['Headache & migraines', 272, 455],
    ['Cardiometabolic', 1144, 462], ['Rashes', 370, 508], ['Thyroid', 1065, 504], ['Men’s health', 1096, 600], ['Cough & sore throat', 334, 560], ['Women’s health', 1007, 650],
    ['Cold, flu & COVID-19', 392, 619], ['Urinalysis', 990, 691], ['Vaccinations', 494, 717], ['Second opinions', 843, 738], ['Preventive care', 570, 754],
    ['Provider suggestions', 705, 752], ['Work absence notes', 626, 779], ['Specialist referrals', 773, 779]];
  const needEls = [];
  {
    const near = [], far = [];
    for (const [t, x, y] of NEEDS) {
      const dx = x - RC[0], dy = y - RC[1], r = Math.hypot(dx, dy);
      // they come in round the ring in the order it draws, from the top
      const ang = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 29 + 360) % 360;
      (r < 372 ? near : far).push({ t, x, y, ux: dx / r, uy: dy / r, ang });
    }
    const make = (box, list) => { box.innerHTML = list.map((n) => `<span style="left:${n.x}px;top:${n.y}px">${n.t.replace(/&/g, '&amp;')}</span>`).join(''); $$('span', box).forEach((el, i) => needEls.push({ el, ...list[i], last: '', op: '' })); };
    make($('#uLabelsNear'), near); make($('#uLabelsFar'), far);
    needEls.sort((a, b) => a.ang - b.ang).forEach((n, i, all) => { n.at = 0.12 + 0.62 * i / all.length; });
  }
  const ringSvg = $('#ring svg');

  /* ================= one place to start: the thread behind her ================= */
  thread($('#breathThread'),
    [[-20, 178], [0, 182], [130, 208], [330, 305], [505, 405], [700, 490], [860, 530], [930, 555], [1080, 640], [1200, 745], [1290, 860], [1340, 940]],
    [[-20, 420, C.leaf], [420, 930, C.pink], [930, 1340, C.yellow]], 6);

  /* ================= the phone's lab map ================= */
  $('#labMap').innerHTML = '<path d="M0 17h285v20H0zM0 79h285v20H0zM48 0h20v147H48zM204 0h20v147h-20z" fill="#fff"/>' +
    `<path d="M22 89H58V27H180" fill="none" stroke="${C.forest}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="22" cy="89" r="5" fill="${C.forest}"/>` +
    `<path d="M214 105s-21-23-21-37a21 21 0 0 1 42 0c0 14-21 37-21 37z" fill="${C.forest}"/><circle cx="214" cy="67" r="7.5" fill="#e5f7e1"/>`;

  /* ================= the members' notes ================= */
  const NOTES = [
    ['Counsel has been extremely helpful. I’m not able to discuss medical concerns like this with any of my in-person doctors!', 'Robert H.', 'Male, 70 to 79'],
    ['Thank you for the support and to the physicians! I’ve been trying for weeks to find an in-person provider who can help me based on my individual needs and Counsel helped me right away.', 'Sofia B.', 'Female, 40 to 49'],
    ['Dr. Whitehead helped me feel more reassured in an hour than a primary care doctor and a cardiologist have made me feel in months. So thank you for this, you have no idea how much that means.', 'Elena K.', 'Female, 40 to 49'],
    ['Thanks for your help! I received great support and feel like I’m headed in the right direction. Counsel also helped me book an in-person appointment without any issues.', 'Marcus T.', 'Male, 30 to 39'],
    ['Counsel is a lifesaver. I start a new chat every time I’m unsure of what to do, and I get instant answers with extremely helpful advice!', 'Daniela R.', 'Female, 30 to 39'],
    ['Dr. Rishi took the time to explain the reasons behind my symptoms and the possible treatments. There was so much reassurance.', 'Priya S.', 'Female, 18 to 29'],
    ['During a holiday, I ran out of medication unexpectedly and my usual PCP was closed. Counsel responded to my request and had my prescription written within minutes!', 'Jordan M.', 'Male, 18 to 29'],
  ];
  const mqTrack = $('#mqTrack'), MQ_GAP = 363, MQ_W = NOTES.length * MQ_GAP;
  mqTrack.innerHTML = [...NOTES, ...NOTES, ...NOTES.slice(0, 3)].map(([q, name, who], i) =>
    `<div class="q" style="left:${i * MQ_GAP}px"><p>${q}</p><span class="chip">${ICON.tick}Verified</span><span class="who"><b>${name}</b>${who}</span></div>`).join('');
  const mq = { last: '' };

  /* ================= the footer's thread round the field ================= */
  {
    const L = 2 * 584 + 2 * 56 + 2 * Math.PI * 26;
    const d = 'M30 4H614A26 26 0 0 1 640 30V86A26 26 0 0 1 614 112H30A26 26 0 0 1 4 86V30A26 26 0 0 1 30 4Z';
    const runs = [[0, 144, C.blue], [144, 430, C.mist], [430, 723.7, C.pink], [723.7, 1009.7, C.yellow], [1009.7, 1296.7, C.leaf], [1296.7, L, C.blue]];
    $('#ftRing').innerHTML = runs.map(([a, b, c]) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="8" stroke-dasharray="0 ${a.toFixed(1)} ${(b - a).toFixed(1)} ${(L + 10).toFixed(0)}"/>`).join('');
  }

  /* ================= things that move on their own ================= */
  const mcStates = $$('[data-mc]').map((el) => ({ el, op: '' }));
  const phs = $$('[data-ph]').map((el) => ({ el, op: '' }));
  const phStates = $$('[data-ps]').map((el) => ({ el, op: '' }));
  const heroThread = $('#heroThread'), breathThread = $('#breathThread');
  const amb = { hero: { last: '' }, breath: { last: '' }, ring: { last: '', op: '' } };

  /* ================= shadow twins ================= */
  // data-shadow="surface,alpha,blur[,box]": box twins are a bare copy of the element (its own shape), the rest a full copy
  for (const el of $$('[data-shadow]')) {
    const [surface, alpha, blur, box] = el.dataset.shadow.split(',').map(Number);
    const tw = el.cloneNode(!box);
    for (const n of [tw, ...tw.querySelectorAll('*')]) for (const a of ['data-layer', 'data-depth', 'data-shadow', 'data-pin', 'data-mc', 'data-ph', 'data-ps', 'data-step', 'id']) n.removeAttribute(a);
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
      cx: 0, cy: 0, h: 0, A: null, last: '', fade: 1, op: '',
    };
  });
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const winLayer = layers[0];
  const phoneLayer = layers.find((L) => L.el.classList.contains('phone'));
  const chipLayers = layers.filter((L) => L.el.classList.contains('u-chip'));
  const pins = $$('[data-pin]').map((el) => ({ el, name: el.dataset.pin, last: '' }));
  const pinY = { under: 0, phone: 0 };
  const tones = $$('[data-tone]').map((el) => ({ el, y0: 0, y1: 0, dark: el.dataset.tone === 'dark' }));
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= state ================= */
  let cw = 576, ch = 360, K = 2.5, cardW = 1440, cardH = 900;
  let s = 0.4, VH = 900, maxScroll = 8000, framed = false;
  let stackH = 2000, breathTop = 1880, walkTop = 2740, prTop = 5520, whyTop = 6380, memTop = 7215;
  let stops = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, ambT = 0, clock = 0, tone = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', lastTicks = '', lastTone = '', liftNow = 1, snapTone = false;

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
    stackH = $('#s-stack').offsetHeight;
    breathTop = top('#s-breath'); walkTop = top('#s-walk'); prTop = top('#s-pricing'); whyTop = top('#s-why'); memTop = top('#s-members');
    maxScroll = Math.max(0, page.offsetHeight - VH);
    const mid = (y) => y + Math.max(0, (900 - VH) / 2); // a short frame centres the section's 900px
    stops = [
      0,                                   // the hero
      stackH - VH,                         // the ring, held, just as the next section shows its edge
      mid(breathTop),                      // one place to start
      walkTop, walkTop + STEP, walkTop + 2 * STEP, walkTop + 3 * STEP, // chat, doctor, action, follow-up
      mid(prTop),                          // pricing
      mid(whyTop),                         // why members stay
      mid(memTop) + 10,                    // the members' notes
      maxScroll,                           // the footer
    ].map((y) => clamp(Math.round(y), 0, maxScroll));
    scroll = clamp(scroll, 0, maxScroll);
    lastScrollStr = lastTicks = lastTone = '_';
    for (const p of pins) p.last = '_';
  }

  /* ================= the tour ================= */
  const LEGS = [ // [hold at the stop, then the move to the next] in seconds at speed 1; about 20 s round
    [2.0, 1.1], [1.3, 0.9], [1.0, 0.8], [0.8, 0.65], [0.6, 0.65], [0.6, 0.65], [0.7, 0.8], [1.1, 0.75], [0.9, 0.75], [0.8, 0.75], [1.3, 1.9],
  ];
  const TOUR = LEGS.reduce((a, [h, m]) => a + h + m, 0);
  const holdAt = LEGS.reduce((a, [h, m], i) => (a.push(i ? a[i - 1] + LEGS[i - 1][0] + LEGS[i - 1][1] : 0), a), []);
  /* the ambient motion closes on the tour too, so one tour is a seamless loop: the homepage tile rests on a
     recording of it and the live card takes over at the recording's time (Hunter, Oct 31: loops for every
     piece of work). Each sway turns a whole number of times a tour, as near its own pace as it can, and the
     health card goes round its states a whole number of times. */
  const wave = (w) => (2 * Math.PI * Math.max(1, Math.round((w * TOUR) / (2 * Math.PI)))) / TOUR;
  const W31 = wave(0.31), W47 = wave(0.47), W42 = wave(0.42), W38 = wave(0.38);
  const MC_PER = TOUR / (mcStates.length * Math.max(1, Math.round(TOUR / (4.4 * mcStates.length))));
  // the card at time t of its tour, exactly as a recording of it shows that moment
  function seekTime(t) {
    const w = ((t % TOUR) + TOUR) % TOUR;
    mode = 'tour'; bridge = null; coast = 0; phase = w; ambT = w; scroll = tourAt(w); snapTone = true;
  }
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

    /* ---- the page: scroll and Counsel's own choreography ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    pinY.under = clamp(scroll, 0, Math.max(0, stackH - VH));
    pinY.phone = clamp(scroll - walkTop, 0, 3 * STEP);
    for (const p of pins) setT(p, p.el, `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)`);
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;

    // the ring draws in round from the top as the hero rides up off it, the needs coming in after it
    if (inView(0, stackH)) {
      const p = smooth(scroll, VH * 0.25, Math.max(VH * 0.3, stackH - VH - 60));
      const e = ease(clamp(p / 0.55, 0, 1));
      setT(amb.ring, ringSvg, `rotate(${(-14 * (1 - e)).toFixed(3)}deg) scale(${(0.94 + 0.06 * e).toFixed(4)})`);
      setO(amb.ring, ringSvg, e);
      // the five care chips land on the ring in turn, from the top
      chipLayers.forEach((L, i) => { L.fade = smooth(p, 0.06 + 0.09 * i, 0.26 + 0.09 * i); setO(L, L.el, L.fade); });
      for (const n of needEls) {
        const o = smooth(p, n.at, n.at + 0.22), d = 16 * (1 - o);
        setT(n, n.el, `translate(-50%, -50%) translate(${(-n.ux * d).toFixed(2)}px, ${(-n.uy * d).toFixed(2)}px)`);
        setO(n, n.el, o);
      }
    }
    // the hero: the health card cycles (primary care, urgent care, chronic care) and the ask follows it
    if (inView(0, 1000)) {
      const per = MC_PER, n = mcStates.length, tt = still ? 0 : ambT / per;
      const i = Math.floor(tt) % n, f = tt - Math.floor(tt);
      const x = smooth(f, 0.86, 1); // the last ~0.6 s of each beat crossfades into the next
      const W = mcStates.map((_, j) => (j === i ? 1 - x : j === (i + 1) % n ? x : 0));
      mcStates.forEach((m, j) => setO(m, m.el, W[j]));
      phs.forEach((m, j) => setO(m, m.el, W[j]));
      if (!still) setT(amb.hero, heroThread, `translate3d(${(10 * Math.sin(ambT * W31)).toFixed(2)}px, ${(4 * Math.sin(ambT * W47 + 1)).toFixed(2)}px, 0) scaleY(${(1 + 0.08 * Math.sin(ambT * W42)).toFixed(4)})`);
    }
    if (!still && inView(breathTop, breathTop + 900)) {
      setT(amb.breath, breathThread, `translate3d(0, ${(6 * Math.sin(ambT * W38)).toFixed(2)}px, 0)`);
    }
    // the phone comes in as the walkthrough arrives, then its screen follows the step at the centre
    phoneLayer.fade = smooth(scroll, walkTop - VH * 0.6, walkTop - VH * 0.12);
    setO(phoneLayer, phoneLayer.el, phoneLayer.fade);
    if (inView(walkTop, walkTop + 3 * STEP + VH)) {
      const q = (scroll - walkTop) / STEP;
      phStates.forEach((m, k) => {
        const o = (k === 0 ? 1 : smooth(q, k - 0.62, k - 0.38)) - (k === phStates.length - 1 ? 0 : smooth(q, k + 0.38, k + 0.62));
        setO(m, m.el, o);
      });
    }
    // the members' notes drift by
    if (!still && inView(memTop, memTop + 917)) setT(mq, mqTrack, `translate3d(${(-60 - (ambT * 26) % MQ_W).toFixed(2)}px, 0, 0)`);

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
    const d = e.data;
    if (!d || d.type !== 'ks-card') return;
    // the homepage hands over from the recorded loop: be exactly where it was (never mid-drag)
    if (typeof d.at === 'number' && isFinite(d.at) && !dragging) seekTime(d.at);
    if (window.parent === window || e.source !== window.parent) return;
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
    get stops() { return stops.slice(); }, get tour() { return TOUR; }, get VH() { return VH; }, get maxScroll() { return maxScroll; },
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    seek(t) { seekTime(+t || 0); },
    get period() { return TOUR; },
    at(i) { mode = 'tour'; bridge = null; phase = holdAt[clamp(i | 0, 0, LEGS.length - 1)] + 0.01; },
  };
  window.counselCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
