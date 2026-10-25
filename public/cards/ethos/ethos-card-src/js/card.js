/* Ethos work card: the engine.

   A classic script (not a module) so the card also runs opened straight from
   disk. One requestAnimationFrame loop drives everything, and it only ever
   writes transforms and opacity:

   - the tour: eased stops through the page, about 20 s round, never paused by
     hover; a drag takes over, coasts, and the tour picks up from there
   - the card: spring tilt toward the pointer, layers projected at their own
     heights above the card plane, shadow twins that fall further the higher
     the layer, a round bloom of light under the pointer
   - the page: Ethos's own scroll choreography (the nav docking, the report
     folding back, the sky pinned behind the features, the reputation tabs
     changing with the scroll) and its ambient motion (the slit-scan clouds,
     the fraud counter, the scam labels, the marquees), on the tour's own
     clock: it starts over with every tour, and the clouds, seen as the tour
     comes round, sway a whole number of times a tour, so a recording of one
     tour closes on itself

   The site rests a tile on that recording and, on hover, posts
   {type: "ks-card", at: seconds} so the live card carries on from the frame
   the loop was showing (the tour and the ambient motion both).

   window.ethosCard is the handle the page's dials, the site and the verify script use. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const EMBED = qs.has('embed') && qs.get('embed') !== '0';
  document.documentElement.classList.toggle('is-embed', EMBED);
  const BLEED = EMBED ? Math.max(0, parseFloat(qs.get('bleed')) || 0) : 0; // px of frame overhanging the tile
  const TOUCH_DRAG = !EMBED || qs.get('touchdrag') === '1';               // in a tile, a swipe scrolls the site
  const CLICK = 6;                                                        // px: less is a click, more a drag
  const SCRUB = 2.5;                                                      // sideways drag: px of page per px of drag

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  const stage = $('#stage'), slot = $('.slot'), persp = $('#persp'), card = $('#card'), win = $('#win');
  const vp = $('#vp'), page = $('#page'), cnav = $('#cnav'), rFold = $('#rFold');
  const cshadow = $('#cshadow'), winShadow = $('#winShadow'), bloom = $('#bloom'), rim = $('#rim'), rimLight = $('#rimLight');
  const ticksIn = $('.notches-in .ticks'), ticksOut = $('.notches-out .ticks');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const DW = 1440;                       // Ethos's design width
  const FRAME = { x: 0.045, y: 0.07 };   // framed: the window's inset, as a share of the card's width and height
  // the site's border (Hunter, Oct 24: "a border on all screen recordings and whatever we hover over"):
  // &mat=F draws the card framed, its window inset F x the card's width on every side
  const MAT = Math.min(0.3, Math.max(0, parseFloat(new URLSearchParams(location.search).get('mat')) || 0));
  const LIGHT = { x: 0.05, y: 0.2 };     // shadow throw per px of height: light from above, a touch left
  const TRACK = 1767;                    // the report's sticky track on the live site
  const FOLD = { start: 112, len: 700 }; // the report folds back over this much scroll
  const TAB = 420;                       // scroll per reputation tab
  const IMG = 'ethos-card-src/img/';

  /* the dials' defaults; the page's defineParams writes over these */
  const V = {
    'layers.depth': 1, 'layers.parallax': 1, 'layers.spread': 0.4,
    'tilt.tiltMax': 5, 'tilt.perspective': 2.4, 'tilt.hoverScale': 1.012,
    'light.bloom': 0.75, 'light.bloomSize': 1.3, 'light.rim': 0.45, 'light.shadow': 0.7,
    'motion.tourSpeed': 1, 'motion.stiffness': 110, 'motion.damping': 21,
    'drag.momentum': 1, 'drag.friction': 0.32, 'drag.resumeAfter': 1.2,
    'card.cardSize': 40, 'card.frame': true, 'card.frameColor': '#517fff', 'card.notches': true,
    'debug.outlines': false, 'debug.hold': false,
  };
  if (EMBED && qs.get('frame') === 'full') V['card.frame'] = false;

  /* ================= the site's own marks, inline (nothing is fetched) ================= */
  const MARK_D = 'M19.92 19.96C19.92 21.3282 19.8351 22.6765 19.6703 24H0V32H17.606C16.444 34.8973 14.875 37.5876 12.9697 40H40V32H17.606C18.6188 29.475 19.3225 26.7927 19.6703 24H40V16H19.6801C19.3395 13.208 18.6432 10.5257 17.638 8H40V0H13.0327C14.927 2.4141 16.4855 5.10421 17.638 8H0V16H19.6801C19.8385 17.2978 19.92 18.6194 19.92 19.96Z';
  const SVG = {
    logo: '<svg viewBox="0 0 168 43" fill="none" preserveAspectRatio="xMinYMid meet"><path d="M99.8862 2.83581C100.125 3.43282 100.244 4.38804 100.244 5.70148V38.4179C100.244 39.3731 100.105 40.0895 99.8265 40.5672C99.5877 41.005 99.1499 41.3035 98.5131 41.4627V42H105.916V41.4627C105.279 41.3035 104.822 40.9851 104.543 40.5075C104.264 40.0298 104.125 39.3333 104.125 38.4179V16.6279C104.815 15.7146 105.611 14.9979 106.513 14.4776C107.588 13.8806 108.722 13.5821 109.916 13.5821C111.866 13.5821 113.339 14.2786 114.334 15.6716C115.329 17.0249 115.827 19.0547 115.827 21.7612V38.4179C115.827 39.3333 115.687 40.0298 115.409 40.5075C115.13 40.9851 114.672 41.3035 114.035 41.4627V42H121.438V41.4627C120.802 41.3035 120.344 41.005 120.065 40.5672C119.827 40.0895 119.707 39.3731 119.707 38.4179V20.6866C119.707 17.7015 119.011 15.393 117.618 13.7612C116.225 12.0895 114.215 11.2537 111.588 11.2537C109.916 11.2537 108.364 11.7512 106.931 12.7463C105.776 13.5485 104.84 14.5707 104.125 15.8128V0.507446L98.5131 0.805954V1.34327C99.1897 1.70148 99.6474 2.19899 99.8862 2.83581Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M134.934 42.5971C132.745 42.5971 130.794 41.9404 129.083 40.627C127.411 39.3135 126.098 37.4827 125.143 35.1344C124.227 32.7464 123.77 30.0001 123.77 26.8956C123.77 23.7514 124.227 21.025 125.143 18.7165C126.058 16.3683 127.352 14.5374 129.023 13.224C130.735 11.9106 132.685 11.2538 134.874 11.2538C137.103 11.2538 139.053 11.9106 140.725 13.224C142.396 14.5374 143.69 16.3683 144.605 18.7165C145.561 21.025 146.038 23.7514 146.038 26.8956C146.038 30.0001 145.561 32.7464 144.605 35.1344C143.69 37.4827 142.396 39.3135 140.725 40.627C139.053 41.9404 137.123 42.5971 134.934 42.5971ZM134.874 12.5076C133.441 12.5076 132.207 13.0847 131.173 14.2389C130.138 15.3931 129.342 17.0449 128.784 19.1941C128.267 21.3036 128.008 23.8708 128.008 26.8956C128.008 29.8807 128.267 32.4678 128.784 34.6568C129.342 36.8061 130.138 38.4578 131.173 39.6121C132.247 40.7663 133.481 41.3434 134.874 41.3434C136.307 41.3434 137.541 40.7663 138.575 39.6121C139.61 38.4578 140.406 36.8061 140.964 34.6568C141.521 32.4678 141.799 29.8807 141.799 26.8956C141.799 23.8708 141.521 21.3036 140.964 19.1941C140.406 17.0449 139.61 15.3931 138.575 14.2389C137.541 13.0847 136.307 12.5076 134.874 12.5076Z" fill="currentColor"/><path d="M149.7 31.4329C150.735 34.7762 151.989 37.2638 153.461 38.8956C154.934 40.5275 156.705 41.3434 158.775 41.3434C160.287 41.3434 161.461 40.8857 162.297 39.9703C163.173 39.0548 163.61 37.8409 163.61 36.3285C163.61 34.7364 163.272 33.423 162.595 32.3882C161.919 31.3533 161.063 30.4578 160.028 29.7016C158.993 28.9454 157.879 28.229 156.685 27.5523C155.531 26.8757 154.416 26.1394 153.342 25.3434C152.307 24.5474 151.451 23.6121 150.775 22.5374C150.098 21.4628 149.76 20.1295 149.76 18.5374C149.76 17.1444 150.078 15.9106 150.715 14.8359C151.352 13.7215 152.227 12.8459 153.342 12.2091C154.456 11.5722 155.73 11.2538 157.163 11.2538C158.078 11.2538 158.854 11.3533 159.491 11.5523C160.168 11.7116 160.725 11.8907 161.163 12.0897C161.64 12.2489 162.038 12.3285 162.357 12.3285C163.073 12.3285 163.511 12.0698 163.67 11.5523H164.088L164.984 20.7464H164.446C163.61 17.9205 162.595 15.8509 161.401 14.5374C160.207 13.1842 158.775 12.5076 157.103 12.5076C155.75 12.5076 154.655 12.9056 153.819 13.7016C153.023 14.4976 152.625 15.5722 152.625 16.9255C152.625 18.1195 152.964 19.1344 153.64 19.9703C154.317 20.7663 155.173 21.4827 156.207 22.1195C157.282 22.7563 158.396 23.413 159.551 24.0897C160.745 24.7265 161.859 25.4827 162.894 26.3583C163.929 27.1941 164.785 28.229 165.461 29.4628C166.138 30.6966 166.476 32.229 166.476 34.0598C166.476 36.6071 165.76 38.6767 164.327 40.2688C162.894 41.821 161.003 42.5971 158.655 42.5971C157.62 42.5971 156.685 42.4976 155.849 42.2986C155.053 42.1394 154.337 41.9802 153.7 41.821C153.103 41.622 152.586 41.5225 152.148 41.5225C151.392 41.5225 150.834 41.7812 150.476 42.2986H150.118L149.222 31.4329H149.7Z" fill="currentColor"/><path d="M85.197 12.4711C86.5888 12.2579 88.3646 11.9859 89.1085 10.7462C89.9841 9.35317 90.3105 4.33526 90.3105 1.93117L91.6539 1.73088V12.4473H95.833V13.9399H91.6539V37.1638C91.6539 38.517 91.8728 39.512 92.3106 40.1488C92.7484 40.7458 93.5245 41.1837 94.639 41.4623V41.9996H85.9823V41.4623C86.6191 41.3031 87.0768 40.9847 87.3554 40.507C87.634 40.0294 87.7733 39.3329 87.7733 38.4175V17.3429C87.7733 14.3838 86.9047 13.0865 84.701 13.0865V12.5492C84.8586 12.523 85.025 12.4975 85.197 12.4711Z" fill="currentColor"/><path d="M78.958 1.99963H58.0625V2.59665C58.8187 2.75585 59.3361 3.09416 59.6147 3.61157C59.8933 4.08918 60.0326 4.8454 60.0326 5.88023V38.119C60.0326 39.1539 59.8933 39.93 59.6147 40.4474C59.3361 40.9648 58.8187 41.3031 58.0625 41.4623V41.9996H80.6297L81.9431 28.9847H81.3461C80.7889 31.4126 80.172 33.4026 79.4953 34.9549C78.8187 36.4673 78.0227 37.6414 77.1073 38.4772C76.2317 39.3131 75.2167 39.8902 74.0625 40.2086C72.9083 40.4872 71.5749 40.6265 70.0625 40.6265H64.2715V21.1041H67.3759C68.57 21.1041 69.6247 21.2633 70.5401 21.5817C71.4555 21.9001 72.2516 22.4772 72.9282 23.3131C73.6446 24.1489 74.2217 25.3429 74.6595 26.8952H75.1968V14.4175H74.6595C74.1023 16.4474 73.2665 17.8603 72.1521 18.6563C71.0376 19.4126 69.4456 19.7907 67.3759 19.7907H64.2715V3.37277H69.9431C71.3759 3.37277 72.6695 3.57177 73.8237 3.96978C74.9779 4.36779 75.9729 5.20361 76.8088 6.47724C77.6844 7.71108 78.4008 9.60162 78.958 12.1489H79.4356L78.958 1.99963Z" fill="currentColor"/><path d="M19.92 21.96C19.92 23.3282 19.8351 24.6765 19.6703 26H0V34H17.606C16.444 36.8973 14.875 39.5876 12.9697 42H40V34H17.606C18.6188 31.475 19.3225 28.7927 19.6703 26H40V18H19.6801C19.3395 15.208 18.6432 12.5257 17.638 10H40V2H13.0327C14.927 4.4141 16.4855 7.10421 17.638 10H0V18H19.6801C19.8385 19.2978 19.92 20.6194 19.92 21.96Z" fill="currentColor"/></svg>',
    mark: '<svg viewBox="0 0 40 40" fill="none"><path d="' + MARK_D + '" fill="currentColor"/></svg>',
    mini: '<svg viewBox="0 0 15 15" fill="none"><path d="M7.47 7.485C7.47 7.99806 7.43816 8.50368 7.37635 9H0V12H6.60227C6.16649 13.0865 5.57811 14.0953 4.86365 15H15V12H6.60227C6.98204 11.0531 7.24592 10.0473 7.37635 9H15V6H7.38005C7.2523 4.95299 6.9912 3.94716 6.61425 3H15V0H4.88726C5.59763 0.905288 6.18208 1.91408 6.61425 3H0V6H7.38005C7.43943 6.48669 7.47 6.98227 7.47 7.485Z" fill="currentColor"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none"><path d="M17.4033 3.5H20.2852L13.989 10.701L21.396 20.5H15.5964L11.054 14.557L5.85637 20.5H2.97269L9.70709 12.7977L2.60156 3.5H8.54839L12.6544 8.93215L17.4033 3.5ZM16.3918 18.7738H17.9887L7.68067 5.13549H5.96702L16.3918 18.7738Z" fill="currentColor"/></svg>',
    discord: '<svg viewBox="0 0 127.14 96.36"><path fill="currentColor" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>',
    // the dashed links between the platform diagram's rows, as on the live site
    lines9: '<svg viewBox="0 0 224 64" width="224" height="64" fill="none" stroke="#C1C0B6" stroke-dasharray="2 2"><path d="M0.6875 0.637207L9.34244 5.59066L111.434 64.0202"/><path d="M0.6875 0.637207L18.1396 5.58908L224 64"/><path d="M110.531 0.328613L119.399 5.3046L224 64"/><path d="M224 0L215.203 5.00325L111.441 64.0202"/><path d="M0.6875 63.3628L18.1396 58.4109L224 -6.04445e-06"/><path d="M111 0.328613L102.325 5.30499L-0.00866525 64.005"/><path d="M110.977 0L111.367 64"/><path d="M1 0L1.39062 64"/><path d="M223 0L223.391 64"/></svg>',
    lines3: '<svg viewBox="0 0 224 64" width="224" height="64" fill="none" stroke="#C1C0B6" stroke-dasharray="2 2"><path d="M0.6875 0.637207L9.34244 5.59066L111.434 64.0202"/><path d="M224 0L215.203 5.00325L111.441 64.0202"/><path d="M110.977 0L111.367 64"/></svg>',
  };
  for (const el of $$('[data-svg]')) el.innerHTML = SVG[el.dataset.svg] || '';

  /* ================= the cloud video, rebuilt ================= */
  /* The live hero plays a slit-scan cloud loop. Here it is its own poster
     frame, with seven bands cut across it that each show a slice of either the
     same frame or a later one, drifting sideways at their own pace. */
  const BANDS = [ // top, height (shares of the cloud box), drift px, rate rad/s, phase, which frame
    [0.055, 0.05, 46, 0.42, 0.0, 'slip'], [0.165, 0.066, -70, 0.31, 1.3, 'base'], [0.29, 0.04, 58, 0.55, 2.1, 'slip'],
    [0.43, 0.076, -38, 0.37, 0.6, 'slip'], [0.565, 0.036, 84, 0.26, 3.0, 'base'], [0.685, 0.05, -52, 0.48, 4.2, 'slip'],
    [0.835, 0.062, 32, 0.33, 5.1, 'base'],
  ];
  const cloudSets = $$('.clouds').map((box) => {
    box.innerHTML = `<img class="base" src="${IMG}clouds.webp" alt="">` + BANDS.map(([t, h, , , , src]) =>
      `<div class="band" style="top:${t * 100}%;height:${h * 100}%;--t:${t}"><img src="${IMG}${src === 'slip' ? 'clouds-slip' : 'clouds'}.webp" alt=""></div>`).join('');
    return { box, base: box.querySelector('.base'), bands: $$('.band img', box).map((el, i) => ({ el, b: BANDS[i], last: '' })), last: '' };
  });

  /* ================= the fraud report ================= */
  {
    // the scan strips: 24px rows every 48px, the live SVG's 984px block centred in the viewport
    let html = '';
    for (let k = -1; k < 24; k++) html += `<i style="top:calc((var(--vh) - 984px) / 2 + ${48 * k}px)"></i>`;
    $('#rStrips').innerHTML = html;
  }
  const TICKS = [ // x, strip row; some carry a scam label that lights up in turn
    [349, 4], [843, 4, 'OTC Scams'], [316, 5], [719, 5], [1122, 5], [632, 7], [806, 7], [226, 9],
    [1213, 9, 'Front-Running'], [314, 11], [1005, 12], [565, 13, 'Rug pulls'], [1089, 14], [430, 16], [874, 17, 'Phishing'],
  ];
  $('#rTicks').innerHTML = TICKS.map(([x, k]) => `<i style="left:${x - 1}px;top:calc((var(--vh) - 984px) / 2 + ${48 * k}px)"></i>`).join('');
  $('#rChips').innerHTML = TICKS.filter((t) => t[2]).map(([x, k, label]) =>
    `<b style="left:${x}px;top:calc((var(--vh) - 984px) / 2 + ${48 * k}px);transform:translateX(-50%)">${label}</b>`).join('');
  const tickEls = $$('#rTicks i').map((el, i) => ({ el, w: 0.55 + (i * 0.37) % 0.9, p: i * 1.7, last: '' }));
  const chipEls = $$('#rChips b').map((el) => ({ el, last: '' }));

  // the counter: the last four digits roll like an odometer
  const odo = $('#odo');
  odo.innerHTML = ['c', ',', 'c', 'c', 'c'].map((c) => c === ',' ? '<span>,</span>'
    : `<span class="col"><span>${'01234567890'.split('').map((d) => `<i>${d}</i>`).join('')}</span></span>`).join('');
  const odoCols = $$('.col > span', odo).reverse().map((el) => ({ el, last: '' })); // units first

  /* ================= the score marquees ================= */
  const LABELS = ['Wallet age', 'eth vouched for others', 'twitter followers', 'positive reviews', 'who invited you',
    'Eth vouched in you', 'slashes against you', 'negative reviews', 'attestations', 'credible vouchers', 'sybil likelihood'];
  const SCORES = ['score-276', 'score-274', 'score-275', 'score-277', 'score-273'];
  const marquees = $$('[data-mq]').map((row) => {
    const list = row.dataset.mq === 'labels'
      ? `<div class="mq-list">${LABELS.map((l) => SVG.mini + `<span>${l}</span>`).join('')}</div>`
      : `<div class="mq-list">${SCORES.map((s) => `<img src="${IMG}${s}.webp" alt="">`).join('')}</div>`;
    row.innerHTML = `<div class="mq-track">${list.repeat(3)}</div>`;
    return { row, track: row.firstChild, dir: +row.dataset.dir, speed: +row.dataset.speed, w: 1, last: '' };
  });

  /* ================= the reputation graphic (a lottie on the live site) ================= */
  const C = { bone: '#c1c0b6', ink: '#1f2125', g6: '#3f4142', green: '#1fc080', red: '#ff4000' };
  const svg = (inner) => `<svg viewBox="-380 -380 760 760" width="760" height="760" fill="none" aria-hidden="true">${inner}</svg>`;
  const ring = ([x, y]) => `<circle cx="${x}" cy="${y}" r="9" stroke="${C.g6}" stroke-width="2"/>`;
  const plus = (x, y, c, a, w) => `<path d="M${x - a} ${y}H${x + a}M${x} ${y - a}V${y + a}" stroke="${c}" stroke-width="${w}"/>`;
  const mark = (x, y, h, c) => `<path transform="translate(${x} ${y - h / 2}) scale(${h / 40})" fill="${c}" d="${MARK_D}"/>`;
  const xi = (x, y, h, c) => `<path d="M${x} ${y - h / 2}h${h * 0.72}M${x + h * 0.12} ${y}h${h * 0.48}M${x} ${y + h / 2}h${h * 0.72}" stroke="${c}" stroke-width="${h * 0.13}"/>`;
  const eth = (x, y, c, dotted) => `<g transform="translate(${x} ${y})"><path d="M0 -36L24 1L0 36L-24 1Z" fill="${C.ink}"/><g stroke="${c}" stroke-width="1.6" stroke-linejoin="round"${dotted ? ' stroke-dasharray="1.4 2.4"' : ''}><path d="M0 -33L21 1L0 13L-21 1Z"/><path d="M-21 1L0 -8L21 1"/><path d="M0 -33V13"/><path d="M-21 7L0 33L21 7L0 19Z"/></g></g>`;
  const num = (n, size, c, markH) => {
    const w = n.length * size * 0.6, gap = size * 0.12, x0 = -(w + gap + markH) / 2;
    return `<text x="${x0}" y="${size * 0.35}" font-family="Ethos Mono, monospace" font-weight="700" font-size="${size}" fill="${c}">${n}</text>` + mark(x0 + w + gap, 0, markH, c);
  };
  const label = (x, y, t) => `<text x="${x}" y="${y + 9}" font-family="Ethos Grotesk, sans-serif" font-weight="300" font-size="27" fill="${C.bone}">${t}</text>` +
    xi(x + [...t].reduce((w, ch) => w + (ch === '.' ? 7 : 16), 0) + 3, y, 19, C.bone);
  const RINGS = [[64, -335], [-135, -272], [37, -178], [166, -43], [-316, 193], [64, 306]];
  const RINGS_REVIEW = [[184, -220], [-152, -163], [267, -101], [-207, -45], [-207, 11], [-291, 98], [213, 99], [-152, 194], [187, 217], [248, 262]];
  const PLUSES = [[-162, 8], [-254, 81], [19, 152], [166, 191], [230, -86]];
  const MINUSES = [[-254, -60], [220, -253], [288, 291]];
  const SAT = [[-192, -220], [-198, 235], [278, 140]];
  const DIA = [[-118, -144, '2'], [-118, 140, '1'], [162, 70, '1.5']];
  const st = (html, on) => `<div class="st"${on ? '' : ' style="opacity:0"'}>${svg(html)}</div>`;
  $('#repDots').innerHTML =
    st(RINGS.map(ring).join(''), true) +
    st(RINGS_REVIEW.map(ring).join(''), true) +
    st(PLUSES.map(([x, y]) => plus(x, y, C.green, 8, 2.2)).join('') + MINUSES.map(([x, y]) => `<path d="M${x - 9} ${y}H${x + 9}" stroke="${C.red}" stroke-width="2.6"/>`).join(''), false);
  $('#repNet').innerHTML =
    st(`<circle cx="25" cy="181" r="15" stroke="${C.green}" stroke-width="2.2"/><path d="M20 176L30 186M30 176L20 186" stroke="${C.green}" stroke-width="2"/>`, true) +
    st(SAT.map(([x, y]) => `<path d="M0 0L${x} ${y}" stroke="${C.green}" stroke-width="3"/>`).join('') +
      DIA.map(([x, y, t]) => eth(x, y, C.bone) + label(x + 34, y, t)).join('') +
      SAT.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="35" fill="${C.ink}" stroke="${C.green}" stroke-width="2.5"/>` + plus(x, y, C.green, 15, 2.5)).join(''), false) +
    st(`<path d="M54 -62L150 -178" stroke="${C.red}" stroke-width="13" stroke-dasharray="2 5"/>` +
      SAT.map(([x, y]) => `<path d="M0 0L${x} ${y}" stroke="${C.red}" stroke-width="3"/>`).join('') +
      DIA.map(([x, y]) => eth(x, y, C.red, true)).join('') +
      SAT.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="34" fill="${C.red}"/><path d="M${x - 16} ${y}H${x - 5}M${x + 5} ${y}H${x + 16}M${x} ${y - 16}V${y - 5}M${x} ${y + 5}V${y + 16}" stroke="${C.ink}" stroke-width="2.6"/>`).join('') +
      [46, 39, 32].map((r) => `<circle cx="185" cy="-219" r="${r}" stroke="${C.red}" stroke-width="2"/>`).join('') +
      `<rect x="183" y="-235" width="4" height="18" fill="${C.red}"/><rect x="183" y="-212" width="4" height="4" fill="${C.red}"/>`, false);
  $('#repCore').innerHTML =
    st(`<circle r="102" stroke="${C.bone}" stroke-width="3"/><circle r="78" fill="${C.bone}"/>` + num('1463', 40, C.ink, 27), true) +
    st(`<circle r="124" fill="${C.green}"/>` + plus(-8, -58, C.ink, 11, 6) + plus(32, -48, C.ink, 11, 6) + num('1656', 64, C.ink, 42), false) +
    st(`<circle r="64" fill="${C.red}"/>` + num('586', 34, C.ink, 23), false);
  const repStates = {
    tabs: $$('#repTabs > .st'), net: $$('#repNet > .st'), core: $$('#repCore > .st'), dots: $$('#repDots > .st'),
    last: '',
  };

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
      el, d: +el.dataset.depth, kind: el === win ? 'card' : cnav.contains(el) ? 'vp' : 'page',
      pin: pinEl ? pinEl.dataset.pin : null, twin: el._twin || null, parent: null,
      cx: 0, cy: 0, h: 0, A: null, last: '',
    };
  });
  for (const L of layers) {
    let p = L.el.parentElement;
    while (p && !p.hasAttribute('data-depth')) p = p.parentElement;
    L.parent = p ? layers.find((x) => x.el === p) : null;
  }
  const pins = $$('[data-pin]').map((el) => ({ el, name: el.dataset.pin, y: 0, last: '' }));
  const pinY = { report: 0, clouds2: 0, rep: 0 };
  function posIn(el, root) {
    let x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
  }

  /* ================= state ================= */
  let cw = 576, ch = 432, K = 2.5, cardW = 1440, cardH = 1080;
  let s = 0.36, VH = 900, maxScroll = 5000;
  let trackTop = 888, repTop = 2655, scoreTop = 4400, credTop = 5100, footTop = 6000;
  let stops = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const spr = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, h: { x: 0, v: 0 } };
  const glow = { x: 0, y: 0 };
  let scroll = 0, phase = 0, amb = 0, clock = 0;
  let mode = 'tour', bridge = null, coast = 0, idle = 0;
  let hovered = false, touchOn = false, touchLatch = false, dragging = false, down = null;
  const pointer = { x: 0, y: 0 }; let pointerLive = false;
  let lastScrollStr = '', lastNav = '', lastFold = '', lastFoldOp = '', liftNow = 1;

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
    VH = Math.max(640, Math.round(DW * winH / winW));
    vp.style.setProperty('--vh', VH + 'px');
    vp.style.transform = `scale(${s})`;
    vp.classList.toggle('lo-res', s * 4 < 3); // the scan textures repeat every 4 design px
    persp.style.perspective = (V['tilt.perspective'] * cw) + 'px';
    card.style.transform = `scale(${1 / K})`;
    bloom.style.width = bloom.style.height = (V['light.bloomSize'] * cardW) + 'px';
    bloom.style.left = bloom.style.top = (-V['light.bloomSize'] * cardW / 2) + 'px';

    // the cloud boxes: their heights, so the bands can line their slices up
    for (const c of cloudSets) c.box.style.setProperty('--ch', c.box.offsetHeight + 'px');
    for (const m of marquees) m.w = m.track.firstChild.offsetWidth || 1;

    for (const L of layers) {
      const root = L.kind === 'card' ? card : L.kind === 'vp' ? vp : page;
      [L.cx, L.cy] = posIn(L.el, root);
      L.h = L.el.offsetHeight;
      // a pinned layer's own offset inside its pin is static; the pin moves it
      if (L.twin) [L.twin.cx, L.twin.cy] = [L.cx, L.cy];
    }
    const top = (sel) => { const el = $(sel); return el ? posIn(el, page)[1] - el.offsetHeight / 2 : 0; };
    trackTop = top('.track'); repTop = top('.rep'); scoreTop = top('.score'); credTop = top('.cred'); footTop = top('.foot');
    maxScroll = Math.max(0, page.offsetHeight - VH);
    const below = 92; // the docked nav covers the top 92px
    stops = [
      0,                                                     // the hero
      trackTop,                                              // the fraud report, pinned
      trackTop + Math.min(822, 1733 - VH),                   // the features over the sky
      repTop, repTop + TAB, repTop + 2 * TAB,                // review, vouch, slash
      Math.round(scoreTop + 369 - (below + (VH - below) / 2)), // the score and its marquees, centred under the nav
      Math.round(credTop + 472 - (below + (VH - below) / 2)),  // proof of credibility
      maxScroll,                                             // the footer
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
    [2.0, 1.3], [0.9, 1.5], [1.5, 1.1], [0.6, 0.7], [0.6, 0.7], [0.6, 0.9], [1.0, 0.9], [1.2, 0.9], [1.1, 2.8],
  ];
  const TOUR = LEGS.reduce((a, [h, m]) => a + h + m, 0);
  const holdAt = LEGS.reduce((a, [h, m], i) => (a.push(i ? a[i - 1] + LEGS[i - 1][0] + LEGS[i - 1][1] : 0), a), []);
  // the ambient clock starts over with every tour, so the clouds (in view as the tour comes round to the hero)
  // sway a whole number of times a tour, the nearest to their own pace; the report's counter, ticks and labels
  // and the marquees are out of view by then and keep theirs
  const lap = (rate) => { const w = 2 * Math.PI / TOUR; return w * Math.max(1, Math.round(rate / w)); };
  const CLOUD_RATE = lap(0.08);
  for (const cs of cloudSets) for (const bd of cs.bands) bd.rate = lap(bd.b[3]);
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
    if (!still) amb = (amb + dt) % TOUR;
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
        if (Math.abs(coast) > 25 && !still) { // below 25 design px/s the coast is done
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

    render();
    rafId = requestAnimationFrame(frame);
  }

  function setT(o, el, str) { if (o.last !== str) { el.style.transform = str; o.last = str; } }

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

    /* ---- the page: scroll and Ethos's own choreography ---- */
    const sStr = `translate3d(0, ${(-scroll).toFixed(2)}px, 0)`;
    if (sStr !== lastScrollStr) { page.style.transform = sStr; lastScrollStr = sStr; }
    pinY.report = clamp(scroll - trackTop, 0, FOLD.start + FOLD.len + 200);
    pinY.clouds2 = clamp(scroll - trackTop, 0, TRACK - VH);
    pinY.rep = clamp(scroll - repTop, 0, 2 * TAB);
    for (const p of pins) setT(p, p.el, `translate3d(0, ${pinY[p.name].toFixed(2)}px, 0)`);
    // the report folds back on its top edge, as the live page does it
    const u = clamp((scroll - trackTop - FOLD.start) / FOLD.len, 0, 1);
    const theta = 90 * (1 - (1 - u) * (1 - u));
    const fStr = `perspective(1000px) rotateX(${(-theta).toFixed(3)}deg)`; // the bottom edge falls away
    if (fStr !== lastFold) { rFold.style.transform = fStr; lastFold = fStr; }
    const fOp = theta > 89.6 ? '0' : '1';
    if (fOp !== lastFoldOp) { rFold.style.opacity = fOp; lastFoldOp = fOp; }
    // the nav docks at the top once the hero's own nav row reaches it
    const nav = smooth(scroll, VH - 160, VH - 90).toFixed(3);
    if (nav !== lastNav) { cnav.style.opacity = nav; lastNav = nav; }
    // reputation: the tab and its graphic follow the scroll through the pinned section
    const pr = clamp((scroll - repTop) / TAB, 0, 2);
    const w1 = smooth(pr, 0.35, 0.65), w2 = smooth(pr, 1.35, 1.65);
    const W = [1 - w1, w1 - w2, w2];
    const wStr = W.map((x) => x.toFixed(3)).join();
    if (wStr !== repStates.last) {
      repStates.last = wStr;
      for (const key of ['tabs', 'net', 'core']) repStates[key].forEach((el, i) => { el.style.opacity = W[i].toFixed(3); });
      repStates.dots[1].style.opacity = W[0].toFixed(3);
      repStates.dots[2].style.opacity = (W[1] + W[2]).toFixed(3);
    }

    /* ---- ambient motion, only where it can be seen ---- */
    const inView = (y0, y1) => scroll + VH > y0 && scroll < y1;
    const cloudsOn = [inView(0, trackTop + 60), inView(trackTop, trackTop + TRACK)];
    cloudSets.forEach((cs, i) => {
      if (!cloudsOn[i]) return;
      setT(cs, cs.base, `translate3d(${(18 * Math.sin(amb * CLOUD_RATE + i)).toFixed(2)}px, 0, 0)`);
      for (const bd of cs.bands) {
        const [, , amp, , ph] = bd.b;
        setT(bd, bd.el, `translate3d(${(amp * Math.sin(amb * bd.rate + ph + i * 0.9)).toFixed(2)}px, 0, 0)`);
      }
    });
    if (inView(trackTop - 10, trackTop + FOLD.start + FOLD.len) && theta < 89.6) {
      // the counter: a step every ~0.4 s, each rolling in quickly
      const n = Math.floor(amb * 2.6), f = amb * 2.6 - n;
      const v = 2586 + n + ease(Math.min(1, f / 0.45));
      for (let i = 0; i < odoCols.length; i++) {
        const p10 = Math.pow(10, i);
        const d = Math.floor(v / p10) % 10;
        const carry = Math.max(0, (v % p10) - (p10 - 1));
        const pos = i === 0 ? v % 10 : d + carry;
        setT(odoCols[i], odoCols[i].el, `translate3d(0, ${(-pos * 120 - 17).toFixed(2)}px, 0)`);
      }
      tickEls.forEach((t, i) => {
        const o = Math.sin(amb * t.w + t.p) > -0.35 ? '1' : '0';
        if (o !== t.last) { t.el.style.opacity = o; t.last = o; }
      });
      const per = 1.9, idx = Math.floor(amb / per) % chipEls.length, f2 = (amb % per) / per;
      chipEls.forEach((cEl, i) => {
        const o = (i === idx ? Math.min(1, f2 / 0.08, (1 - f2) / 0.1) : 0).toFixed(2);
        if (o !== cEl.last) { cEl.el.style.opacity = o; cEl.last = o; }
      });
    }
    if (inView(scoreTop + 420, scoreTop + 660)) {
      for (const m of marquees) {
        const off = (amb * m.speed) % m.w;
        setT(m, m.track, `translate3d(${(m.dir < 0 ? -off : -m.w + off).toFixed(2)}px, 0, 0)`);
      }
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
        const T = L.twin;
        const zs = T.surface * Zsep * hc;
        const throwPx = Math.max(0, L.A.z - zs);
        const A = project(T.surface, { x: throwPx * LIGHT.x, y: throwPx * LIGHT.y });
        // the higher the layer, the further its shadow falls and the wider it spreads
        A.t *= 1 + throwPx / cardW * 0.35;
        write(T.el, A, T);
        const op = (T.alpha * shadowK * h01).toFixed(3);
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
  persp.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { hovered = true; setPointer(e); } });
  persp.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch' && !down) { hovered = false; pointerLive = false; }
  });
  persp.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || (down && down.id === e.pointerId)) setPointer(e);
    if (e.pointerType !== 'touch') hovered = true;
    if (!down || down.id !== e.pointerId) return;
    const dy = e.clientY - down.y, dx = e.clientX - down.x;
    if (!dragging && (down.type !== 'touch' || TOUCH_DRAG) && Math.hypot(dx, dy) >= CLICK) {
      dragging = true; mode = 'manual'; bridge = null; coast = 0;
      persp.classList.add('is-dragging');
      down.x = down.px = e.clientX; down.y = down.py = e.clientY; down.samples = [];
    }
    if (dragging) {
      /* Both axes scroll the page. Up and down it sticks to the pointer, as on a phone (drag up,
         the page goes down); sideways it scrubs, drag right to go further down the page, about
         2.5 px of page per px. Whichever way the drag has moved more since it began wins, and
         each move is applied as a step, so changing axis mid-drag never jumps. */
      const sx = e.clientX - down.px, sy = e.clientY - down.py;
      down.px = e.clientX; down.py = e.clientY;
      const sideways = Math.abs(e.clientX - down.x) > Math.abs(e.clientY - down.y);
      scroll = clamp(scroll + (sideways ? sx * SCRUB : -sy) * designPerScreen(), 0, maxScroll);
      const now = performance.now();
      down.samples.push([now, scroll]);
      while (down.samples.length > 2 && now - down.samples[0][0] > 90) down.samples.shift();
    }
  });
  persp.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, scroll, samples: [] };
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

  // the tour's own clock: the tour and the ambient motion, both at t seconds into a tour
  function seekTime(t) {
    t = ((t % TOUR) + TOUR) % TOUR;
    mode = 'tour'; bridge = null; phase = t; amb = t;
    scroll = tourAt(phase);
  }

  /* ================= running, pausing ================= */
  let parentVisible = true;
  function sync() {
    const want = !document.hidden && parentVisible;
    if (want && !running) { running = true; tPrev = performance.now(); rafId = requestAnimationFrame(frame); }
    else if (!want && running) { running = false; cancelAnimationFrame(rafId); }
  }
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('message', (e) => {
    if (e.source && e.source !== window.parent && e.source !== window) return;
    const d = e.data;
    if (!d || d.type !== 'ks-card') return;
    // {at}: the resting loop's time as the tile hands over; the card carries on from that frame (not mid-drag)
    if (typeof d.at === 'number' && isFinite(d.at) && !dragging && (mode === 'tour' || mode === 'bridge')) seekTime(d.at);
    if (typeof d.visible === 'boolean') { parentVisible = d.visible; sync(); }
  });
  reduced.addEventListener('change', () => { if (reduced.matches) seekTime(0); });

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
    get layers() { return layers.length; }, get frames() { return frameLog.slice(); },
    // the tour's length in seconds (the site records one tour as the tile's resting loop)
    get period() { return TOUR; },
    seek: seekTime,
  };
  window.ethosCard = api;

  new ResizeObserver(() => layout()).observe(persp);
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);
  sync();
})();
