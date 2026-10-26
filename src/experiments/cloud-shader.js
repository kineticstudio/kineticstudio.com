/* Cloud shader (The Academy).

   A fog deck rolling under the bridge at golden hour: the plate (a city
   over a photographed sea of cloud), a far fog that carries on the plate's
   own deck, the bridge, then a near fog that rises round its tower. Each
   fog is domain-warped fbm, stretched across so it layers like a deck,
   drifting and slowly boiling, lit from a low sun with warm gray pockets and
   rosy cream crowns. The pointer leaves a wake: the fog smears along the
   way it moves and parts a little, and a resting pointer leaves it alone.

   Ported from clients/the-academy/designs/03-elements/02-Cloud-Shader.html
   and cloud-shader-src/scene.js (Hunter's dialed defaults of 2026-08-31).
   One canvas instead of two: the bridge is drawn in the same context
   between the fogs. The plate is media/play/cloud-shader/plate.webp, the
   bridge bridge.webp (its masked-off foot cropped away). */

export const params = {
  backdrop: { type: "select", options: ["Bridge", "Plain"] },
  fog: {
    height: [0.73, 0.3, 1.1, 0.005],
    density: [0.15, 0, 1.2, 0.01],
    colour: { type: "color", default: "#F2E7D9", options: ["#F2E7D9", "#F4D6D2", "#DCE4EA"] },
  },
  motion: {
    drift: [0.28, 0, 2, 0.01],
    churn: [0.22, 0, 2, 0.01],
  },
  light: {
    angle: [150, 0, 360, 1],
    strength: [1.3, 0, 2, 0.01],
    warmth: [0.5, 0, 1, 0.01],
  },
};

const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const PLATE = new URL("media/play/cloud-shader/plate.webp", ROOT).href;
const BRIDGE = new URL("media/play/cloud-shader/bridge.webp", ROOT).href;
const PLATE_SIZE = [1600, 1582];
// the bridge as the prototype had it: 1800 by 915, its foot (below 90%, masked off) cropped to 824
const BRIDGE_W = 1800, BRIDGE_H = 915, BRIDGE_CROP = 824;
const TOWER_CX = 0.51389; // the tower's centreline, across both legs
const PLATE_FOG_FRAC = 0.6; // where the plate's own fog deck tops out
const PLATE_POS_Y = 0.42; // the crop anchor

// Hunter's dialed scene; the dials above reach the front fog, the motion and the light
const BACK = { scale: 1.65, offset: -0.01, density: 0.52, softness: 0.19, warp: 0.45, speed: 0.65, dim: 1 };
const FRONT = { scale: 1.5, softness: 0.27, warp: 0.75, speed: 1.05, dim: 0.93 };
const CURSOR = { push: 0.05, clear: 0.12, radius: 0.415, drag: 0.07 };
const SHADOW_DEPTH = 0.38, OPACITY = 0.96, BRIDGE_WIDTH = 102.5, BRIDGE_Y = 0.445;

const FOG_VERT = `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0., 1.); }`;
const FOG_FRAG = `precision highp float;
uniform vec2 uRes;
uniform float uT;
uniform vec2 uOff;
uniform float uScale, uDrift, uChurn, uLine, uDensity, uSoft, uDim, uWarp;
uniform vec2 uSunDir;
uniform float uSunI, uWarm, uShadow, uAlpha;
uniform vec2 uMouse, uVel;
uniform float uClear, uRadius;
uniform vec3 uFog;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0., a = .5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++) { v += a * vnoise(p); p = m * p; a *= .5; }
  return v;
}
// domain-warped fbm, drifting and slowly boiling; y stretched so it layers like a fog deck
float field(vec2 p, float t) {
  p.y *= 1.55;
  vec2 q = vec2(fbm(p + vec2(0., t * .35)), fbm(p + vec2(5.2, 1.3) - vec2(t * .27, 0.)));
  vec2 r = vec2(fbm(p + 1.6 * uWarp * q + vec2(1.7, 9.2) + vec2(t * .12, 0.)), fbm(p + 1.6 * uWarp * q + vec2(8.3, 2.8)));
  return fbm(p + 1.5 * uWarp * r);
}
// the plate's fog palette: warm gray shadow pockets to rosy cream crowns
vec3 ramp(float t, float warm) {
  vec3 deep = vec3(0.580, 0.525, 0.486);
  vec3 shad = vec3(0.710, 0.655, 0.608);
  vec3 mid = vec3(0.847, 0.784, 0.725);
  vec3 high = vec3(0.949, 0.906, 0.851);
  vec3 rim = vec3(0.992, 0.965, 0.918);
  vec3 c = mix(deep, shad, smoothstep(0.0, 0.35, t));
  c = mix(c, mid, smoothstep(0.30, 0.62, t));
  c = mix(c, high, smoothstep(0.58, 0.85, t));
  c = mix(c, rim, smoothstep(0.82, 1.0, t));
  c = mix(c, c * vec3(1.06, 0.98, 0.93), warm * smoothstep(0.45, 1.0, t));
  return c;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.) * uScale + uOff;
  float t = uT;
  p.x -= t * uDrift * .18;
  // the cursor is a wake, not a vortex: the field smears along the pointer's travel
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  vec2 dm = (uv - uMouse) * asp;
  float md = length(dm);
  float infl = exp(-(md * md) / (uRadius * uRadius));
  p -= uVel * infl;
  float f = field(p, t * uChurn);
  float line = 1. - uLine;
  float cov = smoothstep(line + .34, line - .22, uv.y);
  float d = f + uDensity * cov - (1. - cov) * .55 - infl * uClear * min(length(uVel) * 14., 1.);
  float cloud = smoothstep(.5 - uSoft * .5, .5 + uSoft * .5, d);
  float f2 = field(p + uSunDir * .28, t * uChurn);
  float lit = .60 + (f - f2) * (2.6 * uSunI);
  float depth = smoothstep(line + .42, 0., uv.y);
  lit = mix(lit, lit * (1. - uShadow * .55) + .05, depth);
  vec2 sunPos = vec2(.14, .72);
  float glow = exp(-1.6 * length((uv - sunPos) * vec2(1., 1.4)));
  lit += glow * .22 * uSunI;
  lit = clamp(lit, 0., 1.);
  vec3 col = ramp(lit, uWarm) * uDim;
  col *= mix(vec3(1.), vec3(1.09, 1.0, .88), glow * (0.4 + uWarm));
  // the fog's colour, as a tint of the crowns
  col = clamp(col * (uFog / vec3(0.949, 0.906, 0.851)), 0., 1.);
  float a = cloud * uAlpha;
  a = max(a, smoothstep(line + .26, line + .52, 1. - uv.y) * uAlpha * cov * (.55 + .45 * cloud));
  a = clamp(a, 0., 1.);
  gl_FragColor = vec4(col * a, a);
}`;

// the bridge: one textured quad, faded out toward its foot as the prototype's mask did
const BRIDGE_VERT = `attribute vec2 aPos; uniform vec4 uRect; uniform vec2 uRes; varying vec2 vUv;
void main() {
  vUv = aPos;
  vec2 px = uRect.xy + aPos * uRect.zw;
  gl_Position = vec4(px.x / uRes.x * 2. - 1., 1. - px.y / uRes.y * 2., 0., 1.);
}`;
const BRIDGE_FRAG = `precision mediump float;
uniform sampler2D uTex; varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  float y = vUv.y * ${(BRIDGE_CROP / BRIDGE_H).toFixed(5)};
  gl_FragColor = c * clamp((0.90 - y) / 0.28, 0., 1.);
}`;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);

  const plate = document.createElement("div");
  plate.setAttribute("aria-hidden", "true");
  plate.style.cssText = `position:absolute;inset:0;background:#efe3d2 url("${PLATE}") 50% ${PLATE_POS_Y * 100}%/cover no-repeat`;
  const plain = document.createElement("div");
  plain.setAttribute("aria-hidden", "true");
  plain.style.cssText = "position:absolute;inset:0;display:none;background:linear-gradient(180deg,#f5ddb6 0%,#f3d9bb 38%,#eed3c2 58%,#e8c9bd 100%)";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.append(plate, plain, canvas);

  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  const setBackdrop = () => {
    const isPlain = v.backdrop === "Plain";
    plate.style.display = isPlain ? "none" : "";
    plain.style.display = isPlain ? "" : "none";
  };
  setBackdrop();
  if (!gl) return { update(nv) { Object.assign(v, nv); setBackdrop(); }, action() {}, destroy() { plate.remove(); plain.remove(); canvas.remove(); } };

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
    return s;
  };
  const link = (vs, fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    return p;
  };
  const fog = link(FOG_VERT, FOG_FRAG);
  const brg = link(BRIDGE_VERT, BRIDGE_FRAG);
  const triBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
  const FU = {};
  for (const n of ["uRes", "uT", "uOff", "uScale", "uDrift", "uChurn", "uLine", "uDensity", "uSoft", "uDim", "uWarp", "uSunDir", "uSunI", "uWarm", "uShadow", "uAlpha", "uMouse", "uVel", "uClear", "uRadius", "uFog"])
    FU[n] = gl.getUniformLocation(fog, n);
  const BU = { uRect: gl.getUniformLocation(brg, "uRect"), uRes: gl.getUniformLocation(brg, "uRes"), uTex: gl.getUniformLocation(brg, "uTex") };
  const fogPos = gl.getAttribLocation(fog, "aPos"), brgPos = gl.getAttribLocation(brg, "aPos");
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let bridgeTex = null, destroyed = false, lost = false;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    if (destroyed || lost) return;
    bridgeTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, bridgeTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    draw();
  };
  img.src = BRIDGE;

  let W = 1, H = 1, ratio = 1;
  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  let t = 12;

  // everything anchors to the plate's cover-crop, so the composition holds at every size
  function cover() {
    const [iw, ih] = PLATE_SIZE;
    const sc = Math.max(W / iw, H / ih);
    return { drawnW: iw * sc, drawnH: ih * sc, cropTop: (ih * sc - H) * PLATE_POS_Y };
  }
  const plateFracToUv = (frac) => {
    const c = cover();
    return (frac * c.drawnH - c.cropTop) / H;
  };
  const clampUv = (x) => Math.min(Math.max(x, 0.02), 0.98);

  // the wake's pointer, doubly smoothed
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, vx: 0, vy: 0, on: 0, ton: 0 };
  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    mouse.tx = (e.clientX - r.left) / r.width;
    mouse.ty = 1 - (e.clientY - r.top) / r.height;
    mouse.ton = 1;
  };
  const onLeave = () => (mouse.ton = 0);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);

  function drawFog(layer, time, off, line, density, cursorMul) {
    gl.useProgram(fog);
    gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
    gl.enableVertexAttribArray(fogPos);
    gl.vertexAttribPointer(fogPos, 2, gl.FLOAT, false, 0, 0);
    const ang = (v["light.angle"] * Math.PI) / 180, cm = mouse.on * cursorMul;
    gl.uniform2f(FU.uRes, canvas.width, canvas.height);
    gl.uniform1f(FU.uT, time);
    gl.uniform2f(FU.uOff, off[0], off[1]);
    gl.uniform1f(FU.uScale, layer.scale);
    gl.uniform1f(FU.uDrift, v["motion.drift"]);
    gl.uniform1f(FU.uChurn, v["motion.churn"]);
    gl.uniform1f(FU.uLine, line);
    gl.uniform1f(FU.uDensity, density);
    gl.uniform1f(FU.uSoft, layer.softness);
    gl.uniform1f(FU.uWarp, layer.warp);
    gl.uniform1f(FU.uDim, layer.dim);
    gl.uniform2f(FU.uSunDir, Math.cos(ang), Math.sin(ang));
    gl.uniform1f(FU.uSunI, v["light.strength"]);
    gl.uniform1f(FU.uWarm, v["light.warmth"]);
    gl.uniform1f(FU.uShadow, SHADOW_DEPTH);
    gl.uniform1f(FU.uAlpha, OPACITY);
    gl.uniform2f(FU.uMouse, mouse.x, mouse.y);
    gl.uniform2f(FU.uVel, mouse.vx * CURSOR.push * 1.6 * cm, mouse.vy * CURSOR.push * 1.6 * cm);
    gl.uniform1f(FU.uClear, CURSOR.clear * cm);
    gl.uniform1f(FU.uRadius, CURSOR.radius);
    const c = v["fog.colour"];
    gl.uniform3f(FU.uFog, parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawBridge() {
    if (!bridgeTex || v.backdrop === "Plain") return;
    const c = cover();
    const bw = (BRIDGE_WIDTH / 100) * c.drawnW, bh = bw * (BRIDGE_CROP / BRIDGE_W);
    const x = W / 2 - TOWER_CX * bw, y = BRIDGE_Y * c.drawnH - c.cropTop;
    gl.useProgram(brg);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(brgPos);
    gl.vertexAttribPointer(brgPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bridgeTex);
    gl.uniform1i(BU.uTex, 0);
    gl.uniform2f(BU.uRes, W, H);
    gl.uniform4f(BU.uRect, x, y, bw, bh);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function draw() {
    if (lost || destroyed) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawFog(BACK, t * BACK.speed, [0, 0], clampUv(plateFracToUv(PLATE_FOG_FRAC) + BACK.offset), BACK.density, 0.35);
    drawBridge();
    drawFog(FRONT, t * FRONT.speed, [37.2, 11.8], clampUv(plateFracToUv(v["fog.height"])), v["fog.density"], 1);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(now - last, 64) / 1000;
    last = now;
    t += dt;
    // per frame at 60, as the prototype ran
    const k = Math.min(1, dt * 60);
    const drag = CURSOR.drag * k;
    mouse.vx += (mouse.tx - mouse.x - mouse.vx) * drag * 1.6;
    mouse.vy += (mouse.ty - mouse.y - mouse.vy) * drag * 1.6;
    mouse.x += (mouse.tx - mouse.x) * drag;
    mouse.y += (mouse.ty - mouse.y) * drag;
    mouse.on += (mouse.ton - mouse.on) * drag * 0.7;
    draw();
  }

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    // the fog is soft: the prototype's own cap, 1.5 and three million pixels
    ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(3_000_000 / (W * H)));
    canvas.width = Math.max(1, Math.floor(W * ratio));
    canvas.height = Math.max(1, Math.floor(H * ratio));
  }

  function sync() {
    const run = !reduced && !lost && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
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
  draw();
  sync();

  return {
    update(nv) {
      Object.assign(v, nv);
      setBackdrop();
      draw();
    },
    action() {},
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      img.onload = null;
      if (bridgeTex) gl.deleteTexture(bridgeTex);
      gl.deleteBuffer(triBuf);
      gl.deleteBuffer(quadBuf);
      gl.deleteProgram(fog);
      gl.deleteProgram(brg);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      plate.remove();
      plain.remove();
      canvas.remove();
    },
  };
}
