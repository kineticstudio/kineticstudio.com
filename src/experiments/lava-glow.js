/* Lava glow.

   Ported from a background study in the Creative Studio: a live emulation of
   a psychedelic "lava" print. One scalar field, 0 on the paper and 1 in the
   hottest pools, runs through a thirteen stop gradient map whose stops were
   sampled from the reference's own pixels. A heavy pool on the left, a narrow
   neck with one bead above it, a long pool sagging to the right, joined by a
   channel; each pool falls off steeply above and softly below, so the top
   edge reads as a thin black line and the underside as wide bands of black,
   navy and peach haze. The pools drift along the band together while each
   wanders and swells on its own clock, and the cursor adds heat where it
   rests. Paper fibre and grain on top.

   The headline preview and the brand presets of the study are not part of
   it; the page never names the client. The site's own `lava-field` is a
   different thing (glossy, lit, domain warped); this one stays flat and
   printed, as it was drawn. */

export const params = {
  colour: {
    ground: "#f1e9e0",
    fringe: "#1f2fb0",
    outline: "#030303",
    body: "#ef6f11",
    core: "#f190de",
  },
  shape: {
    scale: [1, 0.5, 2, 0.01],
    wobble: [0.5, 0, 3, 0.01],
  },
  motion: {
    speed: [1, 0, 4, 0.01],
    drift: [1, 0, 3, 0.01],
  },
  texture: {
    grain: [1, 0, 3, 0.01],
  },
  newShape: { type: "action", label: "New shape" },
};

const VERT = `#version 300 es
void main() {
  vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`;

// The study's lava.glsl, unchanged but for the dials the piece keeps (the
// rest are fixed at the reference's values).
const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uSeed;
uniform vec3  uMouse;
uniform float uScale;
uniform float uWobble;
uniform float uDrift;
uniform float uGrain;
uniform vec3  uCol[13];
uniform float uPos[13];

const float uRiver = 1.0;
const float uPools = 1.0;
const float uSag = 1.0;
const float uTilt = 1.0;
const float uHeight = 0.0;
const float uBreathe = 1.0;
const float uPaper = 1.0;

float hash11(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}

// the band's centreline: two slow meanders and a slope
float river(float x, float t) {
  return 0.078 + uHeight
       + 0.05 * sin(1.3 * x + 0.07 * t + 0.6)
       + 0.035 * sin(2.7 * x - 0.05 * t + 1.7)
       - 0.07 * uTilt * x;
}

// a soft pool: gaussian, stretched below its centre so the lava sags
float lump(vec2 p, vec2 c, vec2 r, float sag) {
  vec2 d = p - c;
  d /= vec2(r.x, d.y < 0.0 ? r.y * sag : r.y);
  return exp(-dot(d, d));
}

// the first frame is fitted to the reference; two more pools wait offscreen
const vec4 POOLS[8] = vec4[8](
  vec4(-0.704,  0.182, 0.173, 0.078),
  vec4(-0.595, -0.002, 0.432, 0.095),
  vec4( 0.004,  0.179, 0.143, 0.030),
  vec4( 0.353,  0.012, 0.213, 0.053),
  vec4( 0.572, -0.087, 0.154, 0.049),
  vec4( 0.759,  0.013, 0.171, 0.134),
  vec4( 1.150,  0.090, 0.180, 0.070),
  vec4(-1.150, -0.020, 0.200, 0.060)
);
const float AMPS[8] = float[8](3.000, 1.102, 0.750, 1.965, 2.973, 2.510, 2.600, 2.200);
const float SAGS[8] = float[8](2.265, 2.248, 1.941, 1.674, 1.947, 1.840, 2.200, 1.900);

float field(vec2 p, float t, float span) {
  vec2 w = vec2(fbm(p * 1.6 + vec2(0.021 * t, 3.1)), fbm(p * 1.6 + vec2(7.3, -0.017 * t))) - 0.5;
  p += w * 0.12 * uWobble;
  p /= uScale;

  float yc = river(p.x, t);
  float th = 0.068 * (0.8 + 0.35 * sin(1.7 * p.x - 0.04 * t + 1.0));
  float dy = p.y - yc;
  float ty = dy < 0.0 ? th * 2.223 * uSag : th;
  float s = 0.801 * uRiver * exp(-dy * dy / (ty * ty));

  // the pools travel along the band together, each wandering and swelling on its own clock
  float flow = 0.012 * uDrift * t;
  for (int i = 0; i < 8; i++) {
    vec4 b = POOLS[i];
    float fi = float(i);
    float w1 = 0.05 + 0.07 * hash11(fi + 7.0);
    float w2 = 0.04 + 0.06 * hash11(fi + 13.0);
    float w3 = 0.06 + 0.08 * hash11(fi + 19.0);
    float x0 = b.x + (uSeed > 0.0 ? (hash11(fi * 3.7 + uSeed) - 0.5) * span : 0.0);
    float x = mod(x0 + flow + 0.08 * uBreathe * sin(w1 * t) + span * 0.5, span) - span * 0.5;
    float swell = 1.0 + 0.1 * uBreathe * sin(w3 * t);
    float y = river(x, t) + (b.y - river(b.x, 0.0)) + 0.02 * uBreathe * sin(w2 * t);
    s += AMPS[i] * lump(p, vec2(x, y), b.zw * uPools * swell, SAGS[i] * uSag);
  }

  // the cursor adds heat where it rests
  s += uMouse.z * lump(p, uMouse.xy / uScale, vec2(0.13, 0.09), 2.0 * uSag);

  // soft union: pools merge instead of stacking
  return 1.0 - exp(-1.4 * s);
}

vec3 ramp(float f) {
  vec3 c = uCol[0];
  for (int i = 1; i < 13; i++) {
    float a = clamp((f - uPos[i - 1]) / max(uPos[i] - uPos[i - 1], 1e-4), 0.0, 1.0);
    c = mix(c, uCol[i], a);
  }
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float span = max(aspect, 1.5) / uScale + 1.4;
  float f = field(p, uTime, span);

  // grain, measured off the reference; part of it dithers the field so the ramp never bands
  vec2 gp = gl_FragCoord.xy;
  float g1 = hash21(gp) - 0.5;
  float g2 = hash21(gp * 1.31 + 71.3) - 0.5;
  f = clamp(f + g1 * 0.035 * uGrain, 0.0, 1.0);

  vec3 col = ramp(f);

  // paper: faint horizontal fibre and a little mottling
  float fibre = fbm(vec2(uv.x * aspect * 3.0, uv.y * 90.0)) - 0.5;
  float mottle = fbm(uv * vec2(aspect, 1.0) * 5.0 + 11.0) - 0.5;
  col *= 1.0 + (fibre * 0.02 + mottle * 0.025) * uPaper;
  col += g2 * 0.06 * uGrain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/* ---------- the gradient map, from the colour dials ---------- */

const hex = (h) => {
  const s = String(h).replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(f, 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

// The study's map: the in-between stops are derived the way the reference's
// pixels read (lavender and periwinkle between the haze and the navy, oxblood
// between the black and the ember, gold and salmon between the orange and the
// pink). Its haze and ember were their own colours; here they come from the
// ground and the body, measured so the defaults land on the study's values.
const EDGE = 0.39, WIDTH = 0.07, CORE_START = 0.88, HALO = 1;
function gradientMap(v) {
  const G = hex(v["colour.ground"]), F = hex(v["colour.fringe"]), K = hex(v["colour.outline"]);
  const O = hex(v["colour.body"]), P = hex(v["colour.core"]);
  const H = mix(G, O, 0.11);
  const E = [O[0] * 0.76, O[1] * 0.52, O[2] * 0.9];
  const gold = mix(O, [1, 1, 1], 0.18);
  const cols = [G, H, mix(mix(H, P, 0.35), F, 0.12), mix(F, H, 0.3), mix(F, K, 0.5), K, mix(K, E, 0.06),
    mix(E, K, 0.5), E, O, gold, mix(gold, P, 0.55), P];
  const e = EDGE, w = WIDTH;
  const hot = e + w + 0.19;
  const c = Math.max(CORE_START, hot + 0.04);
  const pos = [0, 0.1 * HALO, e - 0.19, e - 0.12, e - 0.06, e, e + w, e + w + 0.06, e + w + 0.12,
    hot, hot + (c - hot) * 0.35, hot + (c - hot) * 0.7, c];
  for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + 0.001);
  return { cols: new Float32Array(cols.flat()), pos: new Float32Array(pos) };
}

function quiet(host, text) {
  const p = document.createElement("p");
  p.textContent = text;
  p.style.cssText =
    "position:absolute;inset:0;margin:0;display:grid;place-items:center;padding:2rem;text-align:center;" +
    "color:rgba(25,25,25,.5);font:13px/1.4 var(--primary-family, sans-serif);";
  host.append(p);
  return { update() {}, action() {}, destroy() { p.remove(); } };
}

/* ---------- mount ---------- */

export function mount(host, values, ctx = {}) {
  const reduced = Boolean(ctx.reducedMotion);
  let v = { ...values };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;";
  host.append(canvas);

  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false });
  if (!gl) {
    canvas.remove();
    return quiet(host, "This piece needs WebGL 2.");
  }

  let prog = null, vao = null, U = {};
  function build() {
    const make = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) console.warn("[lava-glow]", gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    const a = make(gl.VERTEX_SHADER, VERT), b = make(gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(p, a);
    gl.attachShader(p, b);
    gl.linkProgram(p);
    gl.deleteShader(a);
    gl.deleteShader(b);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      gl.deleteProgram(p);
      return false;
    }
    prog = p;
    vao = gl.createVertexArray();
    U = {};
    for (const n of ["uRes", "uTime", "uSeed", "uMouse", "uScale", "uWobble", "uDrift", "uGrain", "uCol", "uPos"]) {
      U[n] = gl.getUniformLocation(p, n) ?? gl.getUniformLocation(p, n + "[0]");
    }
    return true;
  }

  // The study ran at its medium quality: a device pixel per CSS pixel, so the
  // grain is the size it was measured at.
  let W = 1, H = 1;
  function resize() {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1);
    W = Math.max(1, Math.floor(r.width * dpr));
    H = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
  }

  let simTime = 0, seed = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0, heat: 0, inside: false };
  let map = gradientMap(v);

  function step(dt) {
    simTime += dt * v["motion.speed"];
    const k = 1 - Math.exp(-dt * 6);
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    mouse.heat += ((mouse.inside ? 0.7 : 0) - mouse.heat) * (1 - Math.exp(-dt * 2.5));
  }

  function draw() {
    if (!prog || gl.isContextLost()) return;
    gl.viewport(0, 0, W, H);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uTime, simTime);
    gl.uniform1f(U.uSeed, seed);
    gl.uniform3f(U.uMouse, mouse.x, mouse.y, mouse.heat);
    gl.uniform1f(U.uScale, v["shape.scale"]);
    gl.uniform1f(U.uWobble, v["shape.wobble"]);
    gl.uniform1f(U.uDrift, v["motion.drift"]);
    gl.uniform1f(U.uGrain, v["texture.grain"]);
    gl.uniform3fv(U.uCol, map.cols);
    gl.uniform1fv(U.uPos, map.pos);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ----- loop: about 30 fps, as the study ran ----- */
  let raf = 0, pending = 0, last = 0, lastDraw = -1e9;
  let visible = !document.hidden, onscreen = true;
  const live = () => !reduced && visible && onscreen && prog;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (now - lastDraw < 1000 / 30 - 2) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    lastDraw = now;
    step(dt);
    draw();
  }
  function sync() {
    if (live()) {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  function redraw() {
    if (raf || pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      draw();
    });
  }

  const ro = new ResizeObserver(() => {
    resize();
    if (!raf) redraw();
  });
  ro.observe(host);
  const io = new IntersectionObserver((entries) => {
    onscreen = entries[entries.length - 1].isIntersecting;
    sync();
  });
  io.observe(host);
  const onVisibility = () => {
    visible = !document.hidden;
    sync();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * (r.width / r.height);
    mouse.ty = 0.5 - (e.clientY - r.top) / r.height;
    if (!mouse.inside) {
      mouse.x = mouse.tx;
      mouse.y = mouse.ty;
    }
    mouse.inside = true;
  };
  const onLeave = () => {
    mouse.inside = false;
  };
  if (!reduced) {
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointercancel", onLeave);
  }

  const onLost = (e) => {
    e.preventDefault();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    prog = null;
  };
  const onRestored = () => {
    build();
    resize();
    redraw();
    sync();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  if (!build()) {
    canvas.remove();
    return quiet(host, "This piece could not start its shader.");
  }
  resize();
  if (reduced) {
    simTime = 9;
    redraw();
  } else {
    sync();
    draw();
  }

  return {
    update(next) {
      v = { ...next };
      map = gradientMap(v);
      if (!raf) redraw();
    },
    action(name) {
      if (name === "newShape") {
        seed = 1 + Math.random() * 97;
        if (!raf) redraw();
      }
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      if (pending) cancelAnimationFrame(pending);
      raf = pending = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (prog && !gl.isContextLost()) {
        gl.deleteProgram(prog);
        gl.deleteVertexArray(vao);
      }
      prog = null;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.width = canvas.height = 1;
      canvas.remove();
    },
  };
}
