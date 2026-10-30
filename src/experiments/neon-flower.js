/* Neon flower.

   Ported from a shader study in the Creative Studio: a violet peony drawn
   entirely in one fragment shader. Four rings of petals, each its own count,
   pointiness and slow spin, lie on a plane the camera can tilt; every petal
   has its own length and shading, fibres run along it, and a zoom blur taken
   over a dozen scaled copies smears the whole flower outward like a long
   exposure. At the centre a warm core flickers with streaks and flecks, and a
   haze of bloom sits over it all, tone mapped and grained. The flower
   breathes and drifts on its own; the cursor pushes the petals aside like a
   lens and a click sends a ripple through them.

   The study's presets, loop modes and light ground are not part of it; the
   page never names the client. The colour dials set the petal and core hues
   (their brightness is the shader's own), and the ground lies under the glow. */

export const params = {
  colour: {
    ground: "#000000",
    petal: "#4226ff",
    core: "#ff7538",
    glow: [1, 0, 2.5, 0.01],
  },
  shape: {
    petals: [9, 4, 18, 1],
    pointiness: [1, 0.3, 3.5, 0.01],
    cleft: [0.47, 0, 1, 0.01],
  },
  view: {
    zoomBlur: [0.6, 0, 1, 0.01],
  },
  motion: {
    speed: [1, 0, 3, 0.01],
    spin: [1, 0, 4, 0.01],
  },
  randomBloom: { type: "action", label: "Random bloom" },
};

const VERT = `#version 300 es
void main() {
  vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`;

// The study's neon-flower.glsl, its core unchanged; the ground is screened
// under the result at the end.
const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

struct Params {
  vec2  res;
  float time;
  float phase;
  float loop;
  vec2  center;
  float zoom;
  float blur;
  float exposure;
  float grain;
  float samples;
  float petals;
  float sharp;
  float cleft;
  float twist;
  float ruffle;
  float asym;
  float rings;
  float spread;
  float lengthVar;
  float spin;
  float breath;
  float sway;
  float beat;
  float beatPhase;
  float hue;
  float sat;
  float edgeShift;
  float coreHue;
  float coreSat;
  float glow;
  float bloom;
  float coreSize;
  vec2  tilt;
  float cup;
  vec2  mouse;
  vec2  mouseVel;
  float mouseForce;
  float mouseMode;
  float mouseRadius;
  float mouseStrength;
  vec3  click;
  float ripple;
};
uniform Params u;
uniform vec3 uGround;

#define PI  3.14159265
#define TAU 6.2831853

vec3 C_DEEP, C_MID, C_LITE, C_HOT, C_CORAL, C_EMBER;
vec2 LV;
float T;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1, 0));
  float c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}
float fbm5(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}
vec3 hsv(float h, float s, float v) {
  vec3 k = abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return v * mix(vec3(1.0), clamp(k - 1.0, 0.0, 1.0), s);
}
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

vec2 drift(float rate, float seed) {
  return u.loop > 0.5 ? LV * rate * 4.0 + seed : vec2(T * rate + seed, seed * 0.7);
}
float spinAngle(float rate, float seed) {
  rate *= u.spin;
  return u.loop > 0.5 ? sin(u.phase + seed) * rate * 8.0 : T * rate;
}

vec2 untilt(vec2 sp, float h) {
  float amt = length(u.tilt);
  if (amt < 1e-4) return sp;
  float ang = min(amt, 1.0) * 1.15;
  vec2 dir = u.tilt / amt;
  float beta = PI * 0.5 - atan(dir.y, dir.x);
  mat2 R = rot2(beta);
  vec2 q = R * sp;
  float ct = cos(ang), st = sin(ang), D = 2.6;
  q.y += h * st;
  float Y = q.y / max(ct + q.y * st / D, 0.06);
  float X = q.x * (1.0 - Y * st / D);
  return rot2(-beta) * vec2(X, Y);
}

vec2 cursorWarp(vec2 p) {
  int mode = int(u.mouseMode + 0.5);
  if (mode > 0 && u.mouseForce > 0.001) {
    vec2 dm = p - u.mouse;
    float md = length(dm) + 1e-4;
    float R = max(u.mouseRadius, 0.02);
    float bell = exp(-md * md / (R * R));
    float k = u.mouseForce * u.mouseStrength;
    if (mode == 1)      p = u.mouse + dm * (1.0 - min(k * 0.8, 0.95) * bell);
    else if (mode == 2) p = u.mouse + dm * (1.0 + k * 0.8 * bell);
    else if (mode == 3) p = u.mouse + rot2(k * bell * 2.4) * dm;
    else if (mode == 4) p -= u.mouseVel * k * bell * 0.55;
  }
  if (u.ripple > 0.0 && u.click.z < 4.0) {
    vec2 dc = p - u.click.xy;
    float cd = length(dc) + 1e-4;
    float wr = u.click.z * 1.1;
    float w = sin((cd - wr) * 22.0) * exp(-u.click.z * 1.6) * exp(-(cd - wr) * (cd - wr) * 28.0);
    p -= dc / cd * w * 0.09 * u.ripple;
  }
  return p;
}

float petalValue(float x, float n) {
  float id = floor(x), fx = fract(x);
  float v0 = hash21(vec2(id, n * 3.1));
  float vm = hash21(vec2(id - 1.0, n * 3.1));
  float vp = hash21(vec2(id + 1.0, n * 3.1));
  v0 = mix(v0, vm, smoothstep(0.18, 0.0, fx));
  v0 = mix(v0, vp, smoothstep(0.82, 1.0, fx));
  return v0;
}

vec4 petalRing(vec2 p, float n, float rotA, float scale, float sharp, float warm, float fib, out float dOut) {
  float r = length(p) / scale;
  float a = atan(p.y, p.x) + rotA + u.twist * r * 1.5;
  vec2 ring = vec2(cos(a), sin(a));

  float x  = a * n * 0.5 / PI + 0.5;
  float pv = petalValue(x, n);
  float pl = petalValue(x + 37.0, n + 0.7);

  float wob = fbm3(ring * 2.6 + drift(0.06, n * 1.7)) - 0.5;
  wob += u.ruffle * (fbm3(ring * 9.0 + drift(0.04, n * 3.3)) - 0.5) * 1.3;

  float ph = a * n * 0.5;
  ph += u.asym * 0.7 * sin(2.0 * ph);
  float lobe  = pow(abs(cos(ph)), sharp);
  float base  = 1.0 - 0.72 * u.cleft;
  float edgeR = (base + (1.0 - base) * lobe) * (1.0 - u.lengthVar * 0.5 + u.lengthVar * pl) + 0.14 * wob;
  float d     = r / edgeR;
  dOut = d;

  float feather = mix(0.14, 0.30, lobe);
  float mask = 1.0 - smoothstep(1.0 - feather, 1.0 + 0.03, d);

  float rim   = smoothstep(0.30, 1.0, d);
  float cleft = 1.0 - smoothstep(0.0, 0.45, lobe);
  float shade = (0.40 + 0.60 * lobe) * (0.65 + 0.70 * fib) * (0.70 + 0.6 * pv);
  shade *= 1.0 - 0.60 * cleft;

  vec3 col = mix(C_DEEP, C_MID, clamp(shade, 0.0, 1.3));
  col = mix(col, C_LITE, rim * rim * (0.25 + 0.75 * fib) * (0.55 + 0.8 * pv));
  col = mix(col, C_HOT,  pow(rim, 5.0) * fib * fib * 0.9 * pv);

  float spill = exp(-r * r * 3.0) * warm;
  col = mix(col, C_CORAL * 0.9, spill * 0.7);
  return vec4(col, mask);
}

void over(inout vec4 acc, vec4 L, float d, float gain) {
  float shadow = smoothstep(1.45, 1.03, d) * (1.0 - L.a) * 0.45;
  acc.rgb *= 1.0 - shadow;
  acc = vec4(mix(acc.rgb, L.rgb * gain, L.a), max(acc.a, L.a));
}

vec4 flower(vec2 sp, float fib) {
  float n0 = u.petals + 3.0;
  float n1 = u.petals;
  float n2 = max(u.petals - 2.0, 4.0);
  float n3 = max(u.petals - 4.0, 3.0);
  float s0 = pow(1.38, u.spread), s1 = pow(1.06, u.spread), s2 = pow(0.72, u.spread), s3 = pow(0.42, u.spread);
  int first = 4 - int(u.rings + 0.5);

  vec4 acc = vec4(0.0); vec4 L; float d;
  if (first <= 0) { L = petalRing(untilt(sp, u.cup * 0.00), n0,  spinAngle(0.020, 0.0) + 0.35, s0, 0.9 * u.sharp, 0.00, fib, d); over(acc, L, d, 0.62); }
  if (first <= 1) { L = petalRing(untilt(sp, u.cup * 0.12), n1, -spinAngle(0.032, 1.3) + 1.90, s1, 1.2 * u.sharp, 0.12, fib, d); over(acc, L, d, 0.88); }
  if (first <= 2) { L = petalRing(untilt(sp, u.cup * 0.26), n2,  spinAngle(0.048, 2.1) + 0.80, s2, 1.5 * u.sharp, 0.40, fib, d); over(acc, L, d, 1.05); }
  if (first <= 3) { L = petalRing(untilt(sp, u.cup * 0.38), n3, -spinAngle(0.060, 3.7) + 2.60, s3, 1.9 * u.sharp, 0.80, fib, d); over(acc, L, d, 1.15); }
  return acc;
}

vec3 neonFlower(vec2 fragCoord) {
  T  = u.time;
  LV = vec2(cos(u.phase), sin(u.phase));
  bool loop = u.loop > 0.5;

  float s = u.sat;
  C_DEEP  = hsv(u.hue - 0.007, min(1.0, s * 1.13), 0.24);
  C_MID   = hsv(u.hue, s, 1.0);
  C_LITE  = hsv(u.hue - 0.015 + u.edgeShift, s * 0.61, 1.0);
  C_HOT   = hsv(u.hue + 0.030 + u.edgeShift, s * 0.24, 1.0);
  C_CORAL = hsv(u.coreHue, u.coreSat, 1.0);
  C_EMBER = hsv(u.coreHue - 0.04, u.coreSat * 0.95, 0.95);

  vec2 uv = fragCoord / u.res;
  float aspect = u.res.x / u.res.y;
  vec2 p = (uv - u.center) * 2.0 * vec2(aspect, 1.0) / u.zoom;

  float beatPulse = exp(-u.beatPhase * 5.0) * u.beat;
  float pulse = loop
    ? 1.0 + u.breath * (0.025 * sin(u.phase) + 0.012 * sin(2.0 * u.phase + 1.0))
    : 1.0 + u.breath * (0.025 * sin(T * 0.55) + 0.012 * sin(T * 1.31 + 1.0));
  pulse += 0.045 * beatPulse;
  p /= pulse;
  p += 0.015 * u.breath * (loop ? LV * 0.8 : vec2(sin(T * 0.21), cos(T * 0.17)));
  if (u.sway > 0.0) {
    vec2 sw = loop ? vec2(sin(u.phase + p.y * 2.0), cos(u.phase + p.x * 2.0))
                   : vec2(sin(T * 0.7 + p.y * 2.0), cos(T * 0.5 + p.x * 2.0));
    p += u.sway * 0.05 * sw;
  }

  p = cursorWarp(p);

  vec2 pp = untilt(p, u.cup * 0.42);
  float rr = length(pp);
  float aa = atan(pp.y, pp.x);
  vec2 ring = vec2(cos(aa), sin(aa));

  float fib = fbm5(ring * 16.0 + rr * 1.8 + drift(0.03, 0.0));
  fib = 0.5 + 1.1 * (fib - 0.5);

  float spread = u.blur * 0.30;
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  int N = int(clamp(u.samples, 1.0, 24.0) + 0.5);
  float fN = float(N);
  for (int i = 0; i < N; i++) {
    float f = (float(i) + 0.5) / fN;
    float j = (hash21(fragCoord + float(i) * 7.3) - 0.5) / fN;
    float sc = 1.0 + spread * ((f + j) * 2.0 - 1.0);
    float ang = (f - 0.5) * u.blur * 0.05;
    vec2 q = rot2(ang) * p * sc;
    float w = 1.0 - abs(f * 2.0 - 1.0) * 0.4;
    acc += flower(q, fib) * w;
    wsum += w;
  }
  acc /= wsum;
  vec3 col = acc.rgb * acc.a;

  vec2 ldir = normalize(vec2(-0.6, 0.35) + u.tilt * 0.8);
  float light = 0.85 + 0.35 * dot(normalize(pp + 1e-4), ldir);
  col *= light;

  float glow = u.glow * (1.0 + 0.9 * beatPulse);
  float streak  = fbm5(ring * 24.0 * smoothstep(0.0, 0.09, rr) + rr * 5.0 + (loop ? sin(u.phase) * 0.6 : -T * 0.35));
  float streak2 = fbm3(ring * 9.0 + rr * 2.0 + drift(0.2, 5.0));
  float coreR   = (0.23 + 0.05 * streak2) * u.coreSize;
  float core    = exp(-pow(rr / coreR, 2.0) * 1.6) * (0.45 + 0.9 * streak);
  float ember   = exp(-rr * rr * 5.0 / (u.coreSize * u.coreSize));
  float fleck   = smoothstep(0.62, 0.95, vnoise(ring * 20.0 * smoothstep(0.0, 0.06, rr) + rr * 30.0 + drift(0.2, 9.0)));
  float fil     = fleck * exp(-pow(rr / (0.17 * u.coreSize), 2.0) * 1.2);
  float flicker = loop ? 0.93 + 0.07 * sin(7.0 * u.phase) * sin(3.0 * u.phase)
                       : 0.93 + 0.07 * sin(T * 6.3 + fib * 4.0) * sin(T * 2.7);

  col = mix(col, C_EMBER * 0.85, ember * acc.a * 0.7 * glow);
  col += C_CORAL * core * 0.85 * glow * flicker;
  col += mix(C_CORAL, vec3(1.0), 0.45) * fil * 0.45 * glow;

  col += C_MID   * exp(-rr * rr * 2.0) * 0.16 * u.bloom;
  col += C_LITE  * exp(-rr * rr * 0.8) * 0.03 * u.bloom;
  col += C_CORAL * exp(-rr * rr * 6.0) * 0.10 * u.bloom * glow;

  vec2 vuv = (uv - 0.5) * vec2(aspect, 1.0);
  col *= smoothstep(1.45, 0.55, length(vuv));

  float g = hash21(fragCoord + fract(T) * 91.7) - 0.5;
  col += g * u.grain * 0.06 * (0.4 + 0.6 * (1.0 - acc.a));

  col = 1.0 - exp(-col * u.exposure);
  col = pow(max(col, 0.0), vec3(1.0 / 1.1));
  return col;
}

void main() {
  vec3 c = clamp(neonFlower(gl_FragCoord.xy), 0.0, 1.0);
  // the ground, screened under the glow
  fragColor = vec4(1.0 - (1.0 - c) * (1.0 - uGround), 1.0);
}`;

/* ---------- helpers ---------- */

const hex = (h) => {
  const s = String(h).replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(f, 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
// a colour dial's hue and saturation (its brightness is the shader's own)
function hueSat(h) {
  const [r, g, b] = hex(h);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hue = 0;
  if (d > 0) {
    if (max === r) hue = ((g - b) / d + 6) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
  }
  return [hue / 6, max > 0 ? d / max : 0];
}
const toHex = (r, g, b) => "#" + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("");
function hsvHex(h, s) {
  const k = (n) => {
    const x = (n + h * 6) % 6;
    return 1 - s * Math.max(0, Math.min(1, Math.min(x, 4 - x)));
  };
  return toHex(k(5), k(3), k(1));
}

function quiet(host, text) {
  const p = document.createElement("p");
  p.textContent = text;
  p.style.cssText =
    "position:absolute;inset:0;margin:0;display:grid;place-items:center;padding:2rem;text-align:center;" +
    "color:rgba(217,226,210,.5);font:13px/1.4 var(--primary-family, sans-serif);";
  host.append(p);
  return { update() {}, action() {}, destroy() { p.remove(); } };
}

// The study's defaults for everything the piece does not dial.
const FIXED = {
  exposure: 1.55, grain: 0.35, coreSat: 0.78, sat: 0.85, edgeShift: 0, bloom: 1, coreSize: 1,
  lengthVar: 0.28, twist: 0, ruffle: 0, asym: 0, rings: 4, spread: 1,
  zoom: 0.92, cup: 0.4, breath: 1, sway: 0, beat: 0,
  mouseMode: 1, mouseRadius: 0.55, mouseStrength: 1, ripple: 1,
};
// the study framed a landscape window: the flower a little left of centre,
// sized to the height. In portrait it is centred and sized to the width.
const frame = (w, h) => {
  const aspect = w / Math.max(1, h);
  return aspect >= 1 ? { cx: 0.44, cy: 0.52, zoom: FIXED.zoom } : { cx: 0.5, cy: 0.5, zoom: FIXED.zoom * Math.min(1, aspect * 1.35) };
};
const TAPS = 12, DPR_CAP = 1.5;

/* ---------- mount ---------- */

export function mount(host, values, ctx = {}) {
  const reduced = Boolean(ctx.reducedMotion);
  let v = { ...values };
  // the random bloom's choices for the dials the piece does not show
  let extra = {};

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;";
  host.append(canvas);

  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" });
  if (!gl) {
    canvas.remove();
    return quiet(host, "This piece needs WebGL 2.");
  }

  const NAMES = ["res", "time", "phase", "loop", "center", "zoom", "blur", "exposure", "grain", "samples", "petals", "sharp", "cleft",
    "twist", "ruffle", "asym", "rings", "spread", "lengthVar", "spin", "breath", "sway", "beat", "beatPhase", "hue", "sat", "edgeShift",
    "coreHue", "coreSat", "glow", "bloom", "coreSize", "tilt", "cup", "mouse", "mouseVel", "mouseForce", "mouseMode", "mouseRadius",
    "mouseStrength", "click", "ripple"];
  let prog = null, vao = null, U = {}, uGround = null;
  function build() {
    const make = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) console.warn("[neon-flower]", gl.getShaderInfoLog(s));
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
    for (const n of NAMES) U[n] = gl.getUniformLocation(p, "u." + n);
    uGround = gl.getUniformLocation(p, "uGround");
    return true;
  }

  // the study's high quality: twelve blur taps at up to 1.5 device pixels;
  // a governor drops the resolution if frames run long
  let W = 1, H = 1, quality = 1;
  function resize() {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP) * quality;
    W = Math.max(1, Math.floor(r.width * dpr));
    H = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
  }

  /* ----- motion and the cursor, in flower space ----- */
  let simTime = 0;
  const mouse = { target: [0, 0], pos: [0, 0], vel: [0, 0], force: 0, forceTarget: 0, inside: false, down: false };
  const click = { pos: [0, 0], t: 99 };
  const lerp = (a, b, t) => a + (b - a) * t;
  const toFlower = (cx, cy) => {
    const r = host.getBoundingClientRect();
    const aspect = r.width / r.height;
    const f = frame(r.width, r.height);
    return [
      ((cx - r.left) / r.width - f.cx) * 2 * aspect / f.zoom,
      (1 - (cy - r.top) / r.height - f.cy) * 2 / f.zoom,
    ];
  };

  function step(dt) {
    simTime += dt * v["motion.speed"];
    click.t += dt;
    const k = 1 - Math.exp(-dt * 10);
    const px = mouse.pos[0], py = mouse.pos[1];
    mouse.pos[0] = lerp(px, mouse.target[0], k);
    mouse.pos[1] = lerp(py, mouse.target[1], k);
    const vx = (mouse.pos[0] - px) / Math.max(dt, 1e-3), vy = (mouse.pos[1] - py) / Math.max(dt, 1e-3);
    const kv = 1 - Math.exp(-dt * 6);
    mouse.vel[0] = lerp(mouse.vel[0], Math.max(-4, Math.min(4, vx)), kv);
    mouse.vel[1] = lerp(mouse.vel[1], Math.max(-4, Math.min(4, vy)), kv);
    mouse.force = lerp(mouse.force, mouse.forceTarget, 1 - Math.exp(-dt * 5));
  }

  function draw() {
    if (!prog || gl.isContextLost()) return;
    const s = { ...FIXED, ...extra };
    const [hue, sat] = hueSat(v["colour.petal"]);
    const [coreHue, coreSat] = hueSat(v["colour.core"]);
    gl.viewport(0, 0, W, H);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(U.res, W, H);
    gl.uniform1f(U.time, simTime);
    gl.uniform1f(U.phase, 0);
    gl.uniform1f(U.loop, 0);
    const f = frame(W, H);
    gl.uniform2f(U.center, f.cx, f.cy);
    gl.uniform1f(U.samples, TAPS);
    gl.uniform1f(U.beatPhase, 0);
    gl.uniform2f(U.tilt, s.tiltX ?? 0, s.tiltY ?? 0);
    gl.uniform2f(U.mouse, mouse.pos[0], mouse.pos[1]);
    gl.uniform2f(U.mouseVel, mouse.vel[0], mouse.vel[1]);
    gl.uniform1f(U.mouseForce, mouse.force);
    gl.uniform3f(U.click, click.pos[0], click.pos[1], click.t);
    const set = {
      ...s,
      hue, sat, zoom: f.zoom,
      coreHue, coreSat,
      glow: v["colour.glow"],
      petals: v["shape.petals"], sharp: v["shape.pointiness"], cleft: v["shape.cleft"],
      blur: v["view.zoomBlur"], spin: v["motion.spin"],
    };
    for (const n of ["zoom", "blur", "exposure", "grain", "petals", "sharp", "cleft", "twist", "ruffle", "asym", "rings", "spread", "lengthVar",
      "spin", "breath", "sway", "beat", "hue", "sat", "edgeShift", "coreHue", "coreSat", "glow", "bloom", "coreSize", "cup",
      "mouseMode", "mouseRadius", "mouseStrength", "ripple"]) {
      gl.uniform1f(U[n], set[n]);
    }
    gl.uniform3fv(uGround, hex(v["colour.ground"]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ----- loop ----- */
  let raf = 0, pending = 0, last = 0, slow = 0, fast = 0;
  let visible = !document.hidden, onscreen = true;
  const live = () => !reduced && visible && onscreen && prog;

  function govern(ms) {
    if (ms > 250) return;
    if (ms > 26) slow++;
    else slow = Math.max(0, slow - 1);
    fast = ms < 13 ? fast + 1 : 0;
    if (slow > 24 && quality > 0.45) {
      quality = Math.max(0.45, quality * 0.8);
      slow = 0;
      resize();
    } else if (fast > 240 && quality < 1) {
      quality = Math.min(1, quality * 1.12);
      fast = 0;
      resize();
    }
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const ms = now - last;
    last = now;
    govern(ms);
    step(Math.min(ms, 100) / 1000);
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
    mouse.target = toFlower(e.clientX, e.clientY);
    if (!mouse.inside) mouse.pos = [...mouse.target];
    mouse.inside = true;
    mouse.forceTarget = mouse.down ? 1 : 0.55;
  };
  const onLeave = () => {
    mouse.inside = false;
    mouse.down = false;
    mouse.forceTarget = 0;
  };
  const onDown = (e) => {
    mouse.down = true;
    mouse.forceTarget = 1;
    click.pos = toFlower(e.clientX, e.clientY);
    click.t = 0;
    mouse.target = click.pos;
    mouse.pos = [...click.pos];
  };
  const onUp = () => {
    mouse.down = false;
    mouse.forceTarget = mouse.inside ? 0.55 : 0;
  };
  if (!reduced) {
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointercancel", onLeave);
    host.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
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
    simTime = 6;
    redraw();
  } else {
    simTime = 2;
    sync();
    draw();
  }

  // A random bloom writes its picks back to the dials through the panel, and
  // keeps the rest (rings, ruffle, tilt and the like) for itself.
  function randomBloom() {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const hue = Math.random();
    const complement = (hue + rnd(0.35, 0.65)) % 1;
    const coreHue = Math.random() < 0.7 ? complement : (hue + rnd(-0.08, 0.08) + 1) % 1;
    extra = {
      exposure: rnd(1.2, 2.2), bloom: rnd(0.6, 1.8), coreSize: rnd(0.6, 1.5), edgeShift: rnd(-0.06, 0.06),
      lengthVar: rnd(0.05, 0.6), twist: Math.random() < 0.4 ? rnd(-1.6, 1.6) : 0, ruffle: Math.random() < 0.5 ? rnd(0, 1) : 0,
      asym: Math.random() < 0.4 ? rnd(-0.8, 0.8) : 0, rings: [2, 3, 4, 4][Math.floor(Math.random() * 4)], spread: rnd(0.65, 1.35),
      tiltX: Math.random() < 0.5 ? rnd(-0.7, 0.7) : 0, tiltY: Math.random() < 0.5 ? rnd(-0.7, 0.7) : 0,
      cup: rnd(0, 1), breath: rnd(0.5, 1.6),
    };
    const next = {
      "colour.petal": hsvHex(hue, rnd(0.6, 1)),
      "colour.core": hsvHex(coreHue, rnd(0.3, 0.95)),
      "colour.glow": +rnd(0.5, 1.6).toFixed(2),
      "shape.petals": Math.round(rnd(5, 17)),
      "shape.pointiness": +rnd(0.6, 2.8).toFixed(2),
      "shape.cleft": +rnd(0.25, 0.98).toFixed(2),
      "view.zoomBlur": +rnd(0.25, 0.9).toFixed(2),
      "motion.spin": +rnd(0.4, 2).toFixed(2),
    };
    const api = window.__ksParams;
    if (api?.set) for (const [p, val] of Object.entries(next)) api.set(p, val);
    else Object.assign(v, next);
    if (!raf) redraw();
  }

  return {
    update(next) {
      v = { ...next };
      if (!raf) redraw();
    },
    action(name) {
      if (name === "randomBloom") randomBloom();
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
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
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
