/* Brushstrokes (Planned).

   The brand book's 1b paintstrokes, painted live. The book draws each as a
   90 by 64 SVG: a base colour and two shapes pushed through one fractal
   noise displacement (turbulence .04 across and .09 down, two octaves, blur
   1.6, displacement 12). Here the same shapes, colours and opacities are
   rasterised once into a mask and blurred as the book blurs them; the
   displacement and the brush that lays each stroke down run in a shader.

   Full bleed: the four recipes laid as broad strokes across the whole page,
   each running off both sides, top, bottom, upper, then the lead across the
   middle. The top and upper strokes lean apart and leave one wedge of the
   beige, as paper shows between strokes laid by hand. Each stroke is a base
   wash, then layer one, then layer two, each a sweep of the brush with a
   ragged front and bristles running ahead of it; then the wet edges drift.
   Keep painting lays the next lead over the last composition every few
   seconds, as picking a chip in the prototype's dock did.

   Ported from clients/planned/prototypes/06-Brushstrokes.html
   (brushstrokes-src/paint-gl.js and animations.js): recipes, layouts,
   supports and the shader are verbatim; one canvas instead of a shared one. */

// Verbatim from the book (04 Colour applications, 1b): base, then two layers [path, colour, opacity].
const THUMBS = [
  { base: "#4F9897", seed: 4, vertical: false, layers: [["M-10,-6 L100,-6 L100,16 C70,30 30,26 -10,20 Z", "#5FA8A2", 0.9], ["M-10,42 C30,32 60,50 100,38 L100,72 L-10,72 Z", "#39759A", 0.8]] },
  { base: "#39759A", seed: 8, vertical: false, layers: [["M-10,10 C30,0 60,26 100,12 L100,34 C60,46 30,24 -10,34 Z", "#4B909A", 0.8], ["M60,40 C80,34 95,44 100,50 L100,72 L50,72 C48,56 50,46 60,40 Z", "#294B4F", 0.7]] },
  { base: "#4B909A", seed: 15, vertical: false, layers: [["M-10,20 C30,10 70,30 100,18 L100,44 C60,54 30,34 -10,46 Z", "#4F9897", 0.85], ["M-10,-6 L40,-6 C30,8 10,14 -10,10 Z", "#2F6A92", 0.6]] },
  { base: "#4F9897", seed: 21, vertical: true, layers: [["M18,-6 C26,20 20,44 26,70 L44,70 C40,44 48,20 42,-6 Z", "#39759A", 0.75], ["M60,-6 C68,20 62,44 68,70 L82,70 C78,44 84,20 80,-6 Z", "#5FA8A2", 0.8]] },
];
const LEADS = ["One", "Two", "Three", "Four"];

export const params = {
  brush: {
    speed: [1, 0.3, 2.5, 0.05],
    texture: [1, 0, 2, 0.01],
    blur: [1.6, 0, 4, 0.1],
    bristles: [1, 0, 3, 0.05],
    drift: [1, 0, 3, 0.05],
  },
  strokes: {
    // the prototype's dock chips: the chosen recipe leads the composition
    lead: {
      type: "swatches",
      options: THUMBS.map((t, i) => ({ id: LEADS[i], label: LEADS[i], colors: [t.base, t.layers[0][1], t.layers[1][1]] })),
    },
    keepPainting: { type: "toggle", labels: ["Rest", "Keep painting"], default: true },
  },
  colour: {
    hue: [0, -180, 180, 1],
    ground: { type: "color", default: "#F1EDE3", options: ["#F1EDE3", "#FCFBF4", "#21333A"] },
  },
  repaint: { type: "action", label: "Paint again" },
};

const REGION = [-15, -12, 120, 88]; // the user-space area the masks cover, with room for displacement
const PX = 6; // mask pixels per user unit
const HOLD = 4.2; // seconds a finished composition rests before the next is laid over it

// The composition: [centre, thickness, tilt in degrees, brush direction, shift along in user units], in surface heights.
const LAYOUTS = {
  wide: [[0.07, 0.3, -2.6, 1, 10], [0.9, 0.42, 1.8, -1, -14], [0.38, 0.26, 1.8, 1, 22], [0.64, 0.46, -1.2, -1, 0]],
  tall: [[0.05, 0.28, -6, 1, 10], [0.91, 0.3, -2, -1, -14], [0.33, 0.22, 5, 1, 22], [0.6, 0.48, 2, -1, 0]],
};
// Who supports each lead, in the top, bottom and upper slots.
const SUPPORT = [[1, 2, 3], [2, 3, 0], [1, 3, 0], [1, 2, 0]];
const DRAG = 1.5; // a stroke is dragged: its recipe stretches this much along it

function compose(lead, w, h) {
  return LAYOUTS[w >= h ? "wide" : "tall"].map(([pos, size, deg, dir, shift], i) => {
    const thumb = i === 3 ? lead : SUPPORT[lead][i], vertical = THUMBS[thumb].vertical;
    const angle = (deg * Math.PI) / 180, ax = Math.cos(angle), ay = Math.sin(angle), cx = w / 2, cy = pos * h;
    const len = 2.08 * Math.max(...[[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => Math.abs((x - cx) * ax + (y - cy) * ay)));
    return { thumb, vertical, cx, cy, angle, len, thick: size * h, dir, shift };
  });
}

/* A stroke's frame: U and V are the screen vectors of one user unit along u
   and v, O the user point at the stroke's centre, a and n its along and across directions. */
function frameOf(s) {
  const a = [Math.cos(s.angle), Math.sin(s.angle)], n = s.vertical ? [a[1], -a[0]] : [-a[1], a[0]];
  const S = s.thick / (s.vertical ? 90 : 64), Sa = S * DRAG;
  return s.vertical
    ? { a, n, U: n.map((k) => k * S), V: a.map((k) => k * Sa), O: [45, 32 + s.shift] }
    : { a, n, U: a.map((k) => k * Sa), V: n.map((k) => k * S), O: [45 + s.shift, 32] };
}

// A Gaussian blur, as three box passes, so the shader needs one tap per mask.
function boxes(sigma) {
  let lo = Math.floor(Math.sqrt(4 * sigma * sigma + 1));
  if (lo % 2 === 0) lo--;
  const m = Math.round((12 * sigma * sigma - 3 * lo * lo - 12 * lo - 9) / (-4 * lo - 4));
  return [0, 1, 2].map((i) => (i < m ? lo : lo + 2));
}
function box(src, dst, w, h, r, across) {
  const n = across ? w : h, lines = across ? h : w, step = across ? 1 : w, line = across ? w : 1, k = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const o = l * line;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[o + Math.min(Math.max(i, 0), n - 1) * step];
    for (let i = 0; i < n; i++) {
      dst[o + i * step] = acc * k;
      acc += src[o + Math.min(i + r + 1, n - 1) * step] - src[o + Math.max(i - r, 0) * step];
    }
  }
}
function gauss(src, w, h, sigma) {
  if (sigma < 0.3) return src;
  const out = src.slice(), tmp = new Float32Array(src.length);
  for (const size of boxes(sigma)) {
    const r = (size - 1) / 2;
    box(out, tmp, w, h, r, true);
    box(tmp, out, w, h, r, false);
  }
  return out;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2); // power2.inOut

const VERT = `attribute vec2 aPos; varying vec2 vUv;
void main() { vUv = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5); gl_Position = vec4(aPos, 0., 1.); }`;
// One stroke per pass, premultiplied, laid over what is there.
const FRAG = `precision highp float;
varying vec2 vUv;
uniform sampler2D uMask;
uniform vec2 uSize, uC, uX, uY, uO, uAlong, uAcross, uBand, uOp;
uniform vec3 uBase, uA, uB, uProg;
uniform float uTime, uSeed, uRough, uBlur, uBristle, uVertical, uDrift, uDir, uHue, uFade;
const vec4 REGION = vec4(${REGION.map((n) => n.toFixed(1)).join(", ")});
vec2 hash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return -1. + 2. * fract(sin(p) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash2(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash2(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { return noise(p) + .5 * noise(p * 2.03 + 7.1); }
// the palette turned round the colour wheel, keeping each colour's lightness
vec3 hue(vec3 c, float a) {
  const mat3 toYIQ = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312);
  const mat3 toRGB = mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703);
  vec3 q = toYIQ * c;
  float h = atan(q.z, q.y) + a, ch = length(q.yz);
  return clamp(toRGB * vec3(q.x, ch * cos(h), ch * sin(h)), 0., 1.);
}
void main() {
  vec2 px = vUv * uSize - uC;
  vec2 user = uO + vec2(dot(px, uX), dot(px, uY));
  float t = uTime * uDrift;
  // feDisplacementMap: x and y both read alpha, 12 x (A - .5), drifting slowly
  vec2 f = user * vec2(.04, .09) + vec2(uSeed * 3.1, uSeed * 1.7);
  vec2 q = user + 6. * uRough * vec2(fbm(f + vec2(t * .05, t * .02)));
  // the shapes run on past the view's ends, as the book's paths overshoot it
  vec2 mq = mix(vec2(clamp(q.x, -5., 95.), q.y), vec2(q.x, clamp(q.y, -1., 65.)), uVertical);
  vec2 m = texture2D(uMask, (mq - REGION.xy) / REGION.zw).rg;
  // the stroke's band: the base colour, its edges blurred and displaced like the shapes
  float e = max(uBlur, .05) * 2., c = mix(q.y, q.x, uVertical);
  float body = smoothstep(uBand.x - e, uBand.x + e, c) * (1. - smoothstep(uBand.y - e, uBand.y + e, c));
  float along = dot(px, uAlong) + .5, across = dot(px, uAcross) + .5;
  along = mix(along, 1. - along, step(uDir, 0.));
  // the brush front: ragged, with bristles that run ahead of it
  float rag = .05 * noise(vec2(across * 4. + uSeed, 0.)) + .03 * noise(vec2(across * 26. + uSeed, 3.));
  float ragU = .05 * noise(vec2(across * 4. + uSeed, 9.)) + .03 * noise(vec2(across * 26. + uSeed, 5.));
  float r0 = 1. - smoothstep(-.012, .012, along - uProg.x + ragU);
  float rA = 1. - smoothstep(-.012, .012, along - uProg.y + rag);
  float rB = 1. - smoothstep(-.012, .012, along - uProg.z + rag * 1.2);
  vec3 col = uBase;
  col = mix(col, uA, clamp(m.r * uOp.x * rA, 0., 1.));
  col = mix(col, uB, clamp(m.g * uOp.y * rB, 0., 1.));
  col *= 1. + uBristle * (.045 * noise(vec2(along * 2.5, across * 38. + uSeed)) + .03 * noise(vec2(along * 1.3, across * 9. - uSeed)));
  // paint pools a touch darker right at the brush front while it moves
  col *= 1. - .05 * exp(-pow((along - uProg.y + rag) / .012, 2.)) * step(uProg.y, 1.) * m.r;
  if (abs(uHue) > .001) col = hue(col, uHue);
  float a = body * r0 * uFade;
  gl_FragColor = vec4(col * a, a);
}`;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);

  // the ground: the book's warm beige with its grid, kept to the middle
  const ground = document.createElement("div");
  ground.setAttribute("aria-hidden", "true");
  ground.style.cssText = "position:absolute;inset:0;pointer-events:none";
  const grid = document.createElement("div");
  grid.style.cssText =
    "position:absolute;inset:0;background:linear-gradient(rgb(41 75 79 / .09) 1px,transparent 1px) 50% 50%/100% 168px,linear-gradient(90deg,rgb(41 75 79 / .09) 1px,transparent 1px) 50% 50%/168px 100%;" +
    "-webkit-mask-image:radial-gradient(ellipse 60% 62% at 50% 46%,#000 35%,transparent 85%);mask-image:radial-gradient(ellipse 60% 62% at 50% 46%,#000 35%,transparent 85%)";
  ground.append(grid);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.append(ground, canvas);

  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  let destroyed = false, lost = false;
  let W = 1, H = 1;
  let raf = 0, last = 0, paused = 0, onScreen = true, tabVisible = !document.hidden;
  let time = 0; // the wet edges' drift clock

  const paintGround = () => {
    ground.style.background = v["colour.ground"];
  };
  paintGround();

  if (!gl) {
    return { update(nv) { Object.assign(v, nv); paintGround(); }, action() {}, destroy() { ground.remove(); canvas.remove(); } };
  }

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  gl.useProgram(program);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const U = Object.fromEntries(
    ["uMask", "uSize", "uC", "uX", "uY", "uO", "uAlong", "uAcross", "uBand", "uOp", "uBase", "uA", "uB", "uProg", "uTime", "uSeed", "uRough", "uBlur", "uBristle", "uVertical", "uDrift", "uDir", "uHue", "uFade"].map((n) => [n, gl.getUniformLocation(program, n)]),
  );
  gl.uniform1i(U.uMask, 0);

  // One mask per recipe: layer one in red, layer two in green, blurred when the blur changes.
  const masks = THUMBS.map((thumb) => {
    const c = document.createElement("canvas");
    const w = (c.width = REGION[2] * PX), h = (c.height = REGION[3] * PX);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    g.setTransform(PX, 0, 0, PX, -REGION[0] * PX, -REGION[1] * PX);
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "#ff0000";
    g.fill(new Path2D(thumb.layers[0][0]));
    g.fillStyle = "#00ff00";
    g.fill(new Path2D(thumb.layers[1][0]));
    const { data } = g.getImageData(0, 0, w, h);
    const r = new Float32Array(w * h), gg = new Float32Array(w * h);
    for (let i = 0; i < r.length; i++) {
      r[i] = data[i * 4];
      gg[i] = data[i * 4 + 1];
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { w, h, r, g: gg, tex };
  });
  let blurred = null;
  function blurMasks(blur) {
    blurred = blur;
    for (const mask of masks) {
      const r = gauss(mask.r, mask.w, mask.h, blur * PX), g = gauss(mask.g, mask.w, mask.h, blur * PX);
      const px = new Uint8Array(mask.w * mask.h * 4);
      for (let i = 0; i < r.length; i++) {
        px[i * 4] = r[i];
        px[i * 4 + 1] = g[i];
        px[i * 4 + 3] = 255;
      }
      gl.bindTexture(gl.TEXTURE_2D, mask.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mask.w, mask.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
  }

  /* ---- the brush ----
     A paint: each stroke in the order it lies, its base wash, then layer one,
     then layer two, staggered. Over a last composition, that one stays
     underneath until the new one is down, then fades. */
  const leadOf = () => Math.max(0, LEADS.indexOf(v["strokes.lead"]));
  let lead = leadOf();
  let paint = null; // { start, k, under }
  let under = null; // { lead, alpha }
  let restUntil = 0;
  const STAGGER = 0.32;
  const paintLength = (k) => (3 * STAGGER + 0.72 + 0.9) * k;
  const seeds = [0, 1.37, 2.74, 4.11];

  function startPaint(next, over, now = performance.now()) {
    if (over) under = { lead, alpha: 1 };
    else under = null;
    lead = next;
    if (reduced) {
      paint = null;
      under = null;
      return;
    }
    paint = { start: now, k: 1 / v["brush.speed"] };
  }

  // [base, layer one, layer two] for stroke i at time now, -.1 (not yet) to 1.2 (down)
  function progressOf(i, now) {
    if (!paint) return [1.2, 1.2, 1.2];
    const { k } = paint, t = (now - paint.start) / 1000, at = i * STAGGER * k;
    const p = (o, d) => -0.1 + 1.3 * ease((t - at - o * k) / (d * k));
    return [p(0, 1.05), p(0.38, 0.95), p(0.72, 0.9)];
  }

  function drawComposition(which, now, fade, done) {
    const w = canvas.width, h = canvas.height;
    compose(which, w, h).forEach((s, i) => {
      const t = THUMBS[s.thumb], p = done ? [1.2, 1.2, 1.2] : progressOf(i, now);
      const { a, n, U: Su, V: Sv, O } = frameOf(s);
      const inv = (vec) => {
        const q = vec[0] * vec[0] + vec[1] * vec[1];
        return [vec[0] / q, vec[1] / q];
      };
      gl.bindTexture(gl.TEXTURE_2D, masks[s.thumb].tex);
      gl.uniform3fv(U.uBase, hex(t.base));
      gl.uniform3fv(U.uA, hex(t.layers[0][1]));
      gl.uniform3fv(U.uB, hex(t.layers[1][1]));
      gl.uniform2f(U.uOp, t.layers[0][2], t.layers[1][2]);
      gl.uniform2f(U.uC, s.cx, s.cy);
      gl.uniform2fv(U.uX, inv(Su));
      gl.uniform2fv(U.uY, inv(Sv));
      gl.uniform2fv(U.uO, O);
      gl.uniform2f(U.uAlong, a[0] / s.len, a[1] / s.len);
      gl.uniform2f(U.uAcross, n[0] / s.thick, n[1] / s.thick);
      gl.uniform2f(U.uBand, 0, s.vertical ? 90 : 64);
      gl.uniform3f(U.uProg, p[0], p[1], p[2]);
      gl.uniform1f(U.uSeed, t.seed * 0.37 + seeds[i]);
      gl.uniform1f(U.uVertical, t.vertical ? 1 : 0);
      gl.uniform1f(U.uDir, s.dir);
      gl.uniform1f(U.uFade, fade);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  }

  function draw(now = performance.now()) {
    if (lost || destroyed) return;
    if (blurred !== v["brush.blur"]) blurMasks(v["brush.blur"]);
    const w = canvas.width, h = canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(U.uSize, w, h);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uRough, v["brush.texture"]);
    gl.uniform1f(U.uBlur, v["brush.blur"]);
    gl.uniform1f(U.uBristle, v["brush.bristles"]);
    gl.uniform1f(U.uDrift, v["brush.drift"]);
    gl.uniform1f(U.uHue, (v["colour.hue"] * Math.PI) / 180);
    if (under && under.alpha > 0) drawComposition(under.lead, now, under.alpha, true);
    drawComposition(lead, now, 1, false);
  }

  function step(now, dt) {
    time += dt;
    if (paint) {
      const t = (now - paint.start) / 1000, end = paintLength(paint.k);
      if (t >= end) {
        if (under) under.alpha = Math.max(0, 1 - (t - end) / 0.5);
        if (!under || under.alpha <= 0) {
          paint = null;
          under = null;
          restUntil = now + HOLD * 1000;
        }
      }
    } else if (v["strokes.keepPainting"] && now >= restUntil) {
      startPaint((lead + 1) % THUMBS.length, true, now);
    }
  }

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    // the paint is soft, so a big stage paints at a lower ratio, as the prototype did
    const dpr = Math.min(2, window.devicePixelRatio || 1, W > 600 ? 1.25 : 2);
    canvas.width = Math.max(8, Math.round(W * dpr));
    canvas.height = Math.max(8, Math.round(H * dpr));
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    step(now, dt);
    draw(now);
  }

  function sync() {
    const run = !reduced && !lost && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      // time away is not painting time: the brush picks up where it was
      const now = performance.now();
      if (paused && paint) paint.start += now - paused;
      if (paused && restUntil) restUntil += now - paused;
      paused = 0;
      last = now;
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      paused = performance.now();
    }
  }

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
    sync();
  });

  const ro = new ResizeObserver(() => {
    resize();
    draw();
    sync();
  });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    sync();
  });
  io.observe(host);
  const onVis = () => {
    tabVisible = !document.hidden;
    sync();
  };
  document.addEventListener("visibilitychange", onVis);

  resize();
  startPaint(lead, false);
  draw();
  sync();

  return {
    update(nv, path) {
      Object.assign(v, nv);
      paintGround();
      // a new lead is painted over the last composition, not onto a bare page
      if ((path === "strokes.lead" || path == null) && leadOf() !== lead) startPaint(leadOf(), true);
      if (path === "strokes.keepPainting" && v["strokes.keepPainting"] && !paint) restUntil = performance.now() + 900;
      draw();
    },
    action(name) {
      if (name === "repaint") {
        startPaint(leadOf(), false);
        draw();
      }
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      for (const m of masks) gl.deleteTexture(m.tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
      ground.remove();
    },
  };
}
