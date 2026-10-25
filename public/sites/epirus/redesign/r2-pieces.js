/* Round two's homepage: the four layers, each on its own small island,
   drawn live and dark (iso-layers.js). One drawing surface off the page
   draws each layer in turn at the size its box shows and copies the frame
   into that box's own canvas, 30 times a second while a box is on screen.
   Reduced motion (or ?motion=still) gets one composed frame of each. Without
   WebGL the boxes stay empty. */
import { createIsoRenderer, DARK } from './iso-kit.js';
import { buildLayer, darkPalette, LAYER_VIEW } from './iso-layers.js';

const boxes = [...document.querySelectorAll('.r2b-piece[data-piece]')];
// the moment each layer is shown at when it holds still
const STILL = { plan: 5.4, sense: 4.6, decide: 3.4, effect: 2.4 };
const still = () => document.documentElement.dataset.motion === 'still' || matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

if (boxes.length && hasWebGL()) {
  const gl = document.createElement('canvas');
  const surface = createIsoRenderer(gl, { baseHeight: 40, maxDpr: 2, stills: true, shadows: 22, shadowSize: 1024, transparent: true });
  surface.configure(DARK);
  const pal = darkPalette();
  const layers = {};
  for (const kind of new Set(boxes.map((b) => b.dataset.piece))) {
    const layer = buildLayer(kind, surface, pal);
    layer.group.visible = false;
    surface.scene.add(layer.group);
    layers[kind] = layer;
  }
  // every box takes the frame's shape, so the islands sit alike in a row
  boxes.forEach((b) => b.style.setProperty('--r2-piece-aspect', LAYER_VIEW.aspect.toFixed(4)));
  const items = boxes.map((box) => {
    const canvas = box.querySelector('canvas') || box.appendChild(document.createElement('canvas'));
    return { box, kind: box.dataset.piece, canvas, ctx: canvas.getContext('2d'), visible: false };
  });

  let W = 0, H = 0, view = null;
  const size = () => {
    const r = boxes[0].getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h || (w === W && h === H)) return false;
    W = w; H = h;
    surface.setSize(w, h);
    const f = LAYER_VIEW;
    view = { focus: f.focus, zoom: Math.min(40 / f.height, (40 * (w / h)) / (f.height * f.aspect)) };
    const pr = surface.renderer.getPixelRatio();
    items.forEach((it) => { it.canvas.width = Math.round(w * pr); it.canvas.height = Math.round(h * pr); });
    return true;
  };
  const draw = (it, t) => {
    const layer = layers[it.kind];
    if (!layer || !view) return;
    for (const o of Object.values(layers)) o.group.visible = o === layer;
    surface.setView(view);
    layer.update(t);
    surface.render();
    it.ctx.clearRect(0, 0, it.canvas.width, it.canvas.height);
    it.ctx.drawImage(gl, 0, 0, it.canvas.width, it.canvas.height);
  };
  const drawStills = () => items.forEach((it) => draw(it, STILL[it.kind] || 3));

  // drawn 30 times a second, only the boxes on screen, only while any is
  let raf = 0, running = false, start = 0, tick = -1, held = false;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const t = (now - start) / 1000;
    if (Math.floor(t * 30) === tick) return;
    tick = Math.floor(t * 30);
    items.forEach((it) => { if (it.visible) draw(it, t); });
  };
  const sync = () => {
    if (held) return;
    const any = items.some((it) => it.visible);
    if (any && !still() && !running) { running = true; start = performance.now() - tick * 33; raf = requestAnimationFrame(frame); }
    if ((!any || still()) && running) { running = false; cancelAnimationFrame(raf); }
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { const it = items.find((x) => x.box === e.target); if (it) it.visible = e.isIntersecting; });
    sync();
  }, { rootMargin: '100px 0px' });
  items.forEach((it) => io.observe(it.box));
  new ResizeObserver(() => { if (size()) { if (still() || !running) drawStills(); } }).observe(boxes[0]);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { sync(); if (still()) drawStills(); });
  size();
  drawStills();
  // for review: r2Layers.at(seconds) holds every layer at one moment
  window.r2Layers = { at: (t) => { held = true; running = false; cancelAnimationFrame(raf); items.forEach((it) => draw(it, t)); } };
}
