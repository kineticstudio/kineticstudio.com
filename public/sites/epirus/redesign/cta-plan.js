/* Epirus, round four: the briefing's drawing (Hunter, 7 October: the
   briefing full bleed, with a graphic to the right). "Design the
   architecture for your mission", drawn: the grid from the fly-in hero
   (iso-plane.js) on their yellow, its lines fading out from the middle, and
   the platform set out on it a square at a time, the way a site is planned:

     the grid comes up and four of its squares rise into a stage
     the radar, the operator station, the generator and Leonidas drop into
     their squares in turn
     the runs between them draw in: tracks from the radar to the operator,
     authorization from the operator to Leonidas, power from the generator
     then it holds, the runs marching and Leonidas turning slowly on its
     turntable, watching the open side

   In the icon system's isometric view, the pieces white with ink lines (on
   their yellow, Epirus's own yellow would vanish). It plays once, when it
   comes into view; reduced motion (or ?motion=still) shows it set out.

   Round six (data-site="point" on the drawing; Jeff Morgan, 9 October, as
   on the homepage's hero): Leonidas and its generator share a square, the
   critical point it protects has the one beside it, with its protection
   marching round it, and the operator sits at their three-screen display. */
import * as THREE from 'three';
import {
  seg, easeOut, easeInOut, COL, INK, iconMaterial, createIsoRenderer, frameView, dashUniforms, dashMaterial, dashGeometry,
  buildLeonidas, buildRadar, buildOperatorStation, buildGenerator, buildCriticalPoint,
} from './iso-kit.js';
import { createPlane } from './iso-plane.js';

const art = document.querySelector('.r4-cta-art');
const canvas = art && art.querySelector('canvas');
const still = () => document.documentElement.dataset.motion === 'still' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const CELL = 16;
const POINT = !!art && art.dataset.site === 'point';
// the same squares as the fly-in hero: Leonidas facing the open side (+x),
// the generator beside it, the operator behind it, the radar behind that
// (round six: the generator on Leonidas's square, the critical point beside)
const PIECES = POINT ? [
  { key: 'radar', at: [-CELL, -CELL], square: [-CELL, -CELL] },
  { key: 'station', at: [-CELL, 0], square: [-CELL, 0] },
  { key: 'point', at: [0, -CELL], square: [0, -CELL] },
  { key: 'gen', at: [0.5, 4.3], square: null },
  { key: 'leo', at: [0.5, -2.4], square: [0, 0] },
] : [
  { key: 'radar', at: [-CELL, -CELL] },
  { key: 'station', at: [-CELL, 0] },
  { key: 'gen', at: [0, -CELL] },
  { key: 'leo', at: [0, 0] },
];
const STAGE = 1.8; // the squares stand this high, as in the fly-in hero
const LAND = 1.3, STEP = 0.42, RUNS = LAND + STEP * PIECES.length + 0.2;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

function start() {
  if (!art || !hasWebGL()) return;
  const pts = [];
  for (const x of [-1.6 * CELL, 0.6 * CELL]) for (const z of [-1.6 * CELL, 0.6 * CELL]) pts.push([x, 0, z]);
  pts.push([0, 9 + STAGE, 0], [-CELL, 6 + STAGE, -CELL]);
  const FULL = frameView(pts, 2);
  // kept simple beside a plain yellow band (Hunter, 7 October: too much
  // fidelity): no cast shadows, outlines with few inner lines, no marked
  // squares, no pad under Leonidas
  const surface = createIsoRenderer(canvas, { baseHeight: FULL.height, maxDpr: 2, shadows: false, transparent: true, lines: { silhouette: 0.42, crease: 0.12 } });
  const { scene, overlay } = surface;
  const yellow = getComputedStyle(document.documentElement).getPropertyValue('--base-color-brand--yellow').trim() || '#ffd748';
  const plane = createPlane(surface, { axis: [1, 0], cell: CELL, center: [-CELL / 2, -CELL / 2], reach: [1.3 * CELL, 3.1 * CELL], fill: yellow, line: '#0f0e12', fade: [1e4, 2e4] });
  plane.configure({ lineA: 0.22, shade: 0.8 });

  const white = iconMaterial(COL.tile), sand = iconMaterial(COL.sand);
  const squares = PIECES.filter((p) => p.square !== null).map(({ at, square = at }) => {
    const [x, z] = square;
    const sq = new THREE.Mesh(new THREE.BoxGeometry(CELL - 1.2, STAGE, CELL - 1.2).translate(0, STAGE / 2, 0), sand);
    sq.position.set(x, 0, z);
    scene.add(sq);
    return sq;
  });
  const built = {
    radar: () => { const r = buildRadar(white); r.scale.setScalar(1.25); return r; },
    station: () => { const s = buildOperatorStation(white, white, POINT ? { screens: 3, person: white } : {}); s.rotation.y = -Math.PI / 2; s.scale.setScalar(POINT ? 1.45 : 1.25); return s; },
    point: () => buildCriticalPoint(white),
    gen: () => { const g = buildGenerator(white); g.scale.setScalar(1.05); return g; },
    leo: () => {
      const n = new THREE.Group();
      const leo = buildLeonidas(white);
      leo.scale.setScalar(1.1);
      n.add(leo);
      n.userData.turn = leo.userData.turn;
      return n;
    },
  };
  const pieces = PIECES.map((p, i) => {
    const obj = built[p.key]();
    obj.position.set(p.at[0], STAGE, p.at[1]);
    scene.add(obj);
    return { ...p, obj, t: LAND + i * STEP };
  });
  const leoTurn = pieces.find((p) => p.key === 'leo').obj.userData.turn;

  // each square marked out, then the runs between the pieces
  const dash = dashUniforms(0.26, 2);
  const line = (pts2, opacity) => {
    const m = dashMaterial(dash, INK, opacity);
    const g = dashGeometry(pts2, STAGE + 0.08);
    m.uniforms.uLen.value = g.userData.length;
    m.uniforms.uDraw.value = 0;
    overlay(new THREE.Mesh(g, m));
    return m;
  };
  const runs = POINT ? [
    line([[-CELL, -CELL + 2.4], [-CELL, -3.2]], 0.9),
    line([[-CELL + 1.4, -2.4], [0.5 - 5.6, -2.4]], 0.9),
    line([[0.5, 3.05], [0.5, -0.25]], 0.9),
  ] : [
    line([[-CELL, -CELL + 2.4], [-CELL, -3.2]], 0.9),
    line([[-CELL + 1.4, 0], [-5.3, 0]], 0.9),
    line([[0, -CELL + 1.3], [0, -5.3]], 0.9),
  ];
  // the critical point's protection, drawn in with the runs
  if (POINT) {
    const ring = [];
    for (let i = 0; i <= 120; i++) ring.push([Math.cos((i / 120) * Math.PI * 2) * 6.6, -CELL + Math.sin((i / 120) * Math.PI * 2) * 6.6]);
    runs.push(line(ring, 0.6));
  }

  function apply(t) {
    plane.configure({ lineA: 0.22 * easeOut(seg(t, 0, 0.9)) });
    squares.forEach((sq, i) => { sq.scale.y = Math.max(0.001, easeOut(seg(t, 0.2 + i * 0.1, 0.9 + i * 0.1))); });
    pieces.forEach(({ obj, t: at }) => {
      const k = seg(t, at, at + 0.55);
      obj.visible = k > 0;
      obj.position.y = STAGE + 13 * (1 - easeOut(k));
    });
    runs.forEach((m, i) => {
      m.uniforms.uDraw.value = easeInOut(seg(t, RUNS + i * 0.25, RUNS + 0.6 + i * 0.25));
      m.uniforms.uShift.value = t * 1.4;
    });
    // Leonidas faces the open side, then watches it
    leoTurn.rotation.y = Math.PI / 2 + Math.sin(Math.max(0, t - RUNS - 1) * 0.45) * 0.4;
  }

  let w = 0, h = 0, view = FULL;
  const size = () => {
    const bw = art.clientWidth, bh = art.clientHeight;
    if (!bw || !bh || (bw === w && bh === h)) return false;
    w = bw; h = bh;
    surface.setSize(w, h);
    const px = Math.min(w / (FULL.height * FULL.aspect), h / FULL.height);
    view = { focus: FULL.focus, zoom: (px * FULL.height) / h };
    return true;
  };
  const SET = RUNS + 1.2;
  let clock = still() ? SET : 0, running = false, raf = 0, last = 0, tick = -1;
  const paint = (t) => { surface.setView(view); plane.update(); apply(t); surface.render(); };
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    if (Math.floor(clock * 30) === tick) return;
    tick = Math.floor(clock * 30);
    paint(clock);
  };
  const play = () => { if (!running && !still()) { running = true; last = 0; raf = requestAnimationFrame(frame); } };
  const pause = () => { if (running) { running = false; cancelAnimationFrame(raf); } };

  size();
  paint(clock);
  new ResizeObserver(() => { if (size()) paint(clock); }).observe(art);
  window.ctaPlan = { at: (s) => { pause(); clock = s; paint(s); } };
  if (still()) return;
  // it starts once most of it is on screen, and rests when it scrolls away
  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) play(); else pause();
  }, { threshold: 0.45 }).observe(art);
}

start();
