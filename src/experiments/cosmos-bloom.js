/* Cosmos bloom (Sidebar Talent).

   The Neon flower's single bloom, coloured with the hanging cosmos' palette
   and set on the hero's sky: ivory petals with warm folds and rims lit
   through from behind, a gold disc a little greener at its heart, a zoom
   blur through the layers, fixed grain like a print. Rings are born small
   under the disc and open outward, one size step per ring, then fade at the
   edge. Moving the pointer round the bloom winds it like a dial: inner
   layers follow fast, outer ones lag, and they settle back into one flower.

   Ported from clients/sidebar-talent/prototypes/04-Cosmos-bloom.html and
   cosmos-bloom.glsl (Hunter's tuned look of October 1 as the defaults).
   Picked over 01-Neon-flower: the same shader, round two (no petal seam,
   rings that grow, the cursor's turn), in the client's own colours. The
   colour dials still reach the neon look: violet petals on a black sky.
   Trimmed of what the defaults never used: loop modes, beat, cursor push
   and ripple. Form is the prototype's presets, shape only. */

const SHAPE = {
  petals: 9, sharp: 1.08, cleft: 0.47, notch: 0, lengthVar: 0.28, twist: 0, ruffle: 0, asym: 0, spread: 1,
  tiltX: 0, tiltY: 0, cup: 0.49, coreSize: 0.61, glow: 1, bloom: 1.16, exposure: 1.6, spin: 1,
};
// the prototype's presets, shape and light only (the rest are dials here)
const FORMS = {
  Peony: {},
  Cosmos: { petals: 10, spread: 1.2, sharp: 0.55, cleft: 0.5, notch: 0.06, lengthVar: 0.12, coreSize: 0.55, ruffle: 0.2, cup: 0.3 },
  Anemone: { petals: 12, sharp: 1.6, cleft: 0.7, glow: 1.2, bloom: 1.3, exposure: 1.7 },
  Dahlia: { petals: 14, sharp: 1.2, cleft: 0.55, spread: 0.8, ruffle: 0.5, glow: 0.9 },
  Lotus: { petals: 7, sharp: 0.8, cleft: 0.6, tiltY: 0.65, cup: 0.8, glow: 0.7, spread: 1.15, exposure: 1.25 },
  Starburst: { petals: 16, sharp: 2.6, cleft: 0.95, lengthVar: 0.5, twist: 0.6, glow: 0.9, bloom: 1.2, exposure: 1.45 },
  Marigold: { petals: 11, sharp: 1.1, cleft: 0.5, ruffle: 0.8, spread: 0.7, glow: 0.7, exposure: 1.5 },
  Chrysanthemum: { petals: 16, sharp: 2.2, cleft: 0.8, lengthVar: 0.45, spread: 0.75, glow: 0.5, bloom: 0.8 },
  Spiral: { petals: 8, sharp: 1.3, cleft: 0.7, twist: 1.6, tiltX: 0.35, tiltY: 0.4, cup: 0.5, glow: 1.3, bloom: 1.5, spin: 1.8 },
  "Side view": { petals: 6, sharp: 0.9, cleft: 0.75, asym: 0.5, tiltX: -0.7, tiltY: 0.3, cup: 1.0, spread: 1.2 },
};

export const params = {
  bloom: {
    form: { type: "select", options: Object.keys(FORMS) },
    rings: [4, 1, 4, 1],
    grow: [0.16, 0, 1, 0.01],
  },
  lens: {
    zoom: [0.5, 0.4, 2, 0.01],
    blur: [0.27, 0, 1, 0.01],
  },
  motion: {
    speed: [1.02, 0, 3, 0.01],
  },
  colour: {
    // the hanging flowers' colours, with the neon flower's and the pink cosmos as presets
    petal: { type: "color", default: "#FFEAC0", options: ["#FFEAC0", "#F4B9C8", "#8C7BFF"] },
    centre: { type: "color", default: "#E0B83E", options: ["#E0B83E", "#FF9A7A"] },
    // the grounds: soft sky, hero sky, night, maroon
    skyTop: { type: "color", label: "Sky top", default: "#4F6B79", options: ["#4F6B79", "#000000", "#3A1420"] },
    skyBottom: { type: "color", label: "Sky bottom", default: "#668CA3", options: ["#668CA3", "#304959", "#000000", "#2E0E16"] },
  },
};

const FS = `#version 300 es
precision highp float;
out vec4 fragColor;
struct Params {
  vec2 res; float time; vec2 center; float zoom; float blur; float exposure; float grain; float grainSize; float samples;
  float petals; float sharp; float cleft; float twist; float ruffle; float asym; float rings; float spread; float lengthVar; float notch;
  float grow; float growPhase; vec2 turn; float spin; float breath; float sway;
  vec3 petal; vec3 centre; vec3 sepal; float outer; vec3 skyTop; vec3 skyBottom; float vignette;
  float foldLight; float shadowCut; float outerLight; float glow; float bloom; float coreSize;
  vec2 tilt; float cup;
};
uniform Params u;
#define PI 3.14159265
#define TAU 6.2831853
vec3 C_DEEP, C_MID, C_LITE, C_HOT, C_CORAL, C_EMBER;
float T, GP;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1, 0)), c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm3(vec2 p) { float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; } return v; }
float fbm5(vec2 p) { float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; } return v; }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec2 drift(float rate, float seed) { return vec2(T * rate + seed, seed * 0.7); }
float spinAngle(float rate, float seed) { return T * rate * u.spin; }

// map a screen point onto the tilted flower plane; h = how high this content sits above it
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

// per-petal random value, blended across the cleft so the outline has no seam
float petalValue(float x, float n, float seed) {
  float id = floor(x), fx = fract(x);
  float v0 = hash21(vec2(mod(id, n), seed));
  float vm = hash21(vec2(mod(id - 1.0, n), seed));
  float vp = hash21(vec2(mod(id + 1.0, n), seed));
  float v = v0;
  v = mix(v, 0.5 * (v0 + vm), smoothstep(0.3, 0.0, fx));
  v = mix(v, 0.5 * (v0 + vp), smoothstep(0.7, 1.0, fx));
  return v;
}

vec4 petalRing(vec2 p, float n, float rotA, float scale, float sharp, float warm, float fib, float id, out float dOut) {
  float r = length(p) / scale;
  float a = atan(p.y, p.x) + rotA + u.twist * r * 1.5;
  vec2 ring = vec2(cos(a), sin(a));
  float x = a * n * 0.5 / PI + 0.5;
  float pv = petalValue(x, n, id * 3.1);
  float pl = petalValue(x + 37.0, n, (id + 0.7) * 3.1);
  float wob = fbm3(ring * 2.6 + drift(0.06, id * 1.7)) - 0.5;
  wob += u.ruffle * (fbm3(ring * 9.0 + drift(0.04, id * 3.3)) - 0.5) * 1.3;
  float ph = a * n * 0.5;
  ph += u.asym * 0.7 * sin(2.0 * ph);
  float lobe = pow(abs(cos(ph)), sharp);
  // cosmos notches: three small teeth across the end of every petal
  float local = mod(ph + PI * 0.5, PI) - PI * 0.5;
  float teeth = (0.5 - 0.5 * cos(local * 15.7)) * smoothstep(0.5, 0.95, abs(cos(ph)));
  float base = 1.0 - 0.72 * u.cleft;
  float edgeR = (base + (1.0 - base) * lobe) * (1.0 - u.lengthVar * 0.5 + u.lengthVar * pl) + 0.14 * wob - u.notch * teeth;
  float d = r / edgeR;
  dOut = d;
  float feather = mix(0.14, 0.30, lobe);
  float mask = 1.0 - smoothstep(1.0 - feather, 1.0 + 0.03, d);
  float rim = smoothstep(0.30, 1.0, d);
  float cleft = 1.0 - smoothstep(0.0, 0.45, lobe);
  float shade = (0.40 + 0.60 * lobe) * (0.65 + 0.70 * fib) * (0.70 + 0.6 * pv);
  shade *= 1.0 - 0.60 * cleft;
  vec3 col = mix(C_DEEP, C_MID, clamp(shade, 0.0, 1.3));
  col = mix(col, C_LITE, rim * rim * (0.25 + 0.75 * fib) * (0.55 + 0.8 * pv));
  col = mix(col, C_HOT, pow(rim, 5.0) * fib * fib * 0.9 * pv);
  float spill = exp(-r * r * 3.0) * warm;
  col = mix(col, C_CORAL * 0.9, spill * 0.7);
  return vec4(col, mask);
}

void over(inout vec4 acc, vec4 L, float d, float gain, float fade) {
  L.a *= fade;
  float shadow = smoothstep(1.45, 1.03, d) * (1.0 - L.a) * 0.45 * fade * (1.0 - clamp(u.shadowCut, 0.0, 1.0));
  acc.rgb *= 1.0 - shadow;
  gain = mix(gain, max(gain, 1.0), clamp(u.outerLight, 0.0, 1.0));
  acc = vec4(mix(acc.rgb, L.rgb * gain, L.a), max(acc.a, L.a));
}
float layerTurn(float outer) { return mix(u.turn.x, u.turn.y, outer); }

// the four fixed rings, when nothing grows
vec4 flower(vec2 sp, float fib) {
  float n0 = u.petals + 3.0, n1 = u.petals, n2 = max(u.petals - 2.0, 4.0), n3 = max(u.petals - 4.0, 3.0);
  float s0 = pow(1.38, u.spread), s1 = pow(1.06, u.spread), s2 = pow(0.72, u.spread), s3 = pow(0.42, u.spread);
  int first = 4 - int(u.rings + 0.5);
  vec4 acc = vec4(0.0); vec4 L; float d;
  if (first <= 0) {
    vec3 sD = C_DEEP, sM = C_MID, sL = C_LITE, sH = C_HOT;
    C_DEEP = mix(sD, u.sepal * vec3(0.3, 0.36, 0.2), u.outer);
    C_MID = mix(sM, u.sepal * 0.82, u.outer);
    C_LITE = mix(sL, mix(u.sepal, vec3(1.0), 0.3), u.outer);
    C_HOT = mix(sH, mix(u.sepal, vec3(1.0), 0.55), u.outer);
    L = petalRing(untilt(sp, u.cup * 0.00), n0, spinAngle(0.020, 0.0) + 0.35 + layerTurn(1.0), s0, 0.9 * u.sharp, 0.00, fib, n0, d); over(acc, L, d, 0.62, 1.0);
    C_DEEP = sD; C_MID = sM; C_LITE = sL; C_HOT = sH;
  }
  if (first <= 1) { L = petalRing(untilt(sp, u.cup * 0.12), n1, -spinAngle(0.032, 1.3) + 1.90 + layerTurn(0.667), s1, 1.2 * u.sharp, 0.12, fib, n1, d); over(acc, L, d, 0.88, 1.0); }
  if (first <= 2) { L = petalRing(untilt(sp, u.cup * 0.26), n2, spinAngle(0.048, 2.1) + 0.80 + layerTurn(0.333), s2, 1.5 * u.sharp, 0.40, fib, n2, d); over(acc, L, d, 1.05, 1.0); }
  if (first <= 3) { L = petalRing(untilt(sp, u.cup * 0.38), n3, -spinAngle(0.060, 3.7) + 2.60 + layerTurn(0.0), s3, 1.9 * u.sharp, 0.80, fib, n3, d); over(acc, L, d, 1.15, 1.0); }
  return acc;
}

// growing: rings born small under the disc, opening outward, fading at the edge
vec4 growingFlower(vec2 sp, float fib) {
  float q = pow(1.6, u.spread);
  float alive = clamp(u.rings, 1.0, 4.0) + 1.0;
  float newest = floor(GP);
  vec4 acc = vec4(0.0); vec4 L; float d;
  vec3 sD = C_DEEP, sM = C_MID, sL = C_LITE, sH = C_HOT;
  for (int j = 4; j >= 0; j--) {
    float fj = float(j);
    if (fj >= alive) continue;
    float k = newest - fj;
    float age = GP - k;
    float t = clamp(age / alive, 0.0, 1.0);
    float fade = smoothstep(0.0, 0.9, age) * (1.0 - smoothstep(alive - 0.9, alive, age));
    if (fade < 0.002) continue;
    float id = k;
    float side = mod(id, 2.0) < 0.5 ? 1.0 : -1.0;
    float rot = side * spinAngle(0.035, id) + id * 2.39996 + layerTurn(t);
    float g = u.outer * smoothstep(0.55, 1.0, t);
    C_DEEP = mix(sD, u.sepal * vec3(0.3, 0.36, 0.2), g);
    C_MID = mix(sM, u.sepal * 0.82, g);
    C_LITE = mix(sL, mix(u.sepal, vec3(1.0), 0.3), g);
    C_HOT = mix(sH, mix(u.sepal, vec3(1.0), 0.55), g);
    L = petalRing(untilt(sp, u.cup * mix(0.38, 0.0, t)), u.petals, rot, 0.2 * pow(q, age), u.sharp * mix(1.9, 0.9, t), mix(0.8, 0.0, t), fib, id + 11.0, d);
    over(acc, L, d, mix(1.15, 0.62, t), fade);
  }
  C_DEEP = sD; C_MID = sM; C_LITE = sL; C_HOT = sH;
  return acc;
}

vec3 bloomAt(vec2 fragCoord) {
  T = u.time;
  GP = u.growPhase;
  bool growing = u.grow > 0.0;
  // ivory petals with warm folds; on the sky the folds stay a warm tan, on a dark ground they go deep
  float groundLum = dot(mix(u.skyBottom, u.skyTop, 0.5), vec3(0.2126, 0.7152, 0.0722));
  C_MID = u.petal;
  C_DEEP = u.petal * mix(vec3(0.42, 0.33, 0.19), vec3(0.7, 0.58, 0.38), smoothstep(0.05, 0.3, groundLum));
  C_LITE = mix(u.petal, vec3(1.0), 0.55);
  C_HOT = mix(u.petal, vec3(1.0), 0.9);
  C_CORAL = u.centre * vec3(1.0, 0.78, 0.36);
  C_EMBER = u.centre * vec3(0.95, 0.68, 0.24);
  C_DEEP = mix(C_DEEP, u.petal * 0.92, clamp(u.foldLight, 0.0, 1.0));

  vec2 uv = fragCoord / u.res;
  float aspect = u.res.x / u.res.y;
  vec2 p = (uv - u.center) * 2.0 * vec2(aspect, 1.0) / u.zoom;
  if (aspect < 1.0) p /= aspect; // a phone held upright still shows the whole bloom

  float pulse = 1.0 + u.breath * (0.025 * sin(T * 0.55) + 0.012 * sin(T * 1.31 + 1.0));
  p /= pulse;
  p += 0.015 * u.breath * vec2(sin(T * 0.21), cos(T * 0.17));
  if (u.sway > 0.0) p += u.sway * 0.05 * vec2(sin(T * 0.7 + p.y * 2.0), cos(T * 0.5 + p.x * 2.0));

  vec2 pp = untilt(p, u.cup * 0.42);
  float rr = length(pp);
  float aa = atan(pp.y, pp.x);
  vec2 ring = vec2(cos(aa), sin(aa));
  float flow = growing ? GP * 0.5 : 0.0;
  float fib = fbm5(ring * 16.0 + (rr * 1.8 - flow) + drift(0.03, 0.0));
  fib = 0.5 + 1.1 * (fib - 0.5);

  // zoom-blurred petal body
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
    acc += (growing ? growingFlower(q, fib) : flower(q, fib)) * w;
    wsum += w;
  }
  acc /= wsum;

  vec2 ldir = normalize(vec2(-0.6, 0.35) + u.tilt * 0.8);
  float light = 0.85 + 0.35 * dot(normalize(pp + 1e-4), ldir);

  // the sky, worked back through the tone curve so it lands on exactly these colours
  vec3 skyD = mix(u.skyBottom, u.skyTop, smoothstep(0.0, 1.0, uv.y));
  vec3 skyL = -log(max(1.0 - pow(clamp(skyD, 0.0, 0.995), vec3(1.1)), 1e-4)) / max(u.exposure, 0.05);
  vec3 col = skyL * (1.0 - acc.a) + acc.rgb * acc.a * light;

  // the warm core
  float glow = u.glow;
  float streak = fbm5(ring * 24.0 * smoothstep(0.0, 0.09, rr) + rr * 5.0 - T * 0.35);
  float streak2 = fbm3(ring * 9.0 + rr * 2.0 + drift(0.2, 5.0));
  float coreR = (0.23 + 0.05 * streak2) * u.coreSize;
  float core = exp(-pow(rr / coreR, 2.0) * 1.6) * (0.45 + 0.9 * streak);
  float ember = exp(-rr * rr * 5.0 / (u.coreSize * u.coreSize));
  float fleck = smoothstep(0.62, 0.95, vnoise(ring * 20.0 * smoothstep(0.0, 0.06, rr) + rr * 30.0 + drift(0.2, 9.0)));
  float fil = fleck * exp(-pow(rr / (0.17 * u.coreSize), 2.0) * 1.2);
  float flicker = 0.93 + 0.07 * sin(T * 6.3 + fib * 4.0) * sin(T * 2.7);
  col = mix(col, C_EMBER * 0.85, ember * acc.a * 0.7 * glow);
  col += C_CORAL * core * 0.85 * glow * flicker;
  col += mix(C_CORAL, vec3(1.0), 0.45) * fil * 0.45 * glow;

  // bloom haze, warmed toward the disc so it glows rather than fogs
  col += mix(C_MID, C_CORAL, 0.3) * exp(-rr * rr * 2.0) * 0.16 * u.bloom;
  col += C_LITE * exp(-rr * rr * 0.8) * 0.03 * u.bloom;
  col += C_CORAL * exp(-rr * rr * 6.0) * 0.10 * u.bloom * glow;

  vec2 vuv = (uv - 0.5) * vec2(aspect, 1.0);
  col *= mix(1.0, smoothstep(1.45, 0.55, length(vuv)), u.vignette);

  col = 1.0 - exp(-col * u.exposure);
  col = pow(max(col, 0.0), vec3(1.0 / 1.1));

  // grain, fixed like a print: soft clumps, strongest in the midtones, a trace of colour
  vec2 gp = fragCoord / max(u.grainSize, 0.3);
  float n = (vnoise(gp) + 0.6 * vnoise(gp * 1.9 + 7.3)) / 1.6 - 0.5;
  vec3 nc = vec3(n) + 0.12 * (vec3(vnoise(gp + 31.0), vnoise(gp + 57.0), vnoise(gp + 83.0)) - 0.5);
  float lu = clamp(dot(col, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  col += nc * u.grain * 0.65 * (0.35 + 2.6 * lu * (1.0 - lu));
  return col;
}

void main() { fragColor = vec4(bloomAt(gl_FragCoord.xy), 1.0); }`;

const VS = `#version 300 es
void main() {
  vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`;

const hex = (h) => {
  const n = parseInt(String(h).replace("#", ""), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
// Hunter's tuned look: what no dial reaches stays as he set it
const FIXED = { breath: 1, sway: 0, vignette: 0.6, grain: 0.1, grainSize: 1.3, outer: 0, foldLight: 0, shadowCut: 0, outerLight: 0, sepal: "#B4C266" };
const SAMPLES = 12, MAX_DPR = 1.5; // the prototype's High quality

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y";
  host.append(canvas);
  host.style.background = v["colour.skyBottom"];
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false });
  if (!gl) return { update() {}, action() {}, destroy() { canvas.remove(); } };

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const U = {};
  for (const n of ["res", "time", "center", "zoom", "blur", "exposure", "grain", "grainSize", "samples", "petals", "sharp", "cleft", "twist", "ruffle", "asym", "rings", "spread", "lengthVar", "notch", "grow", "growPhase", "turn", "spin", "breath", "sway", "petal", "centre", "sepal", "outer", "skyTop", "skyBottom", "vignette", "foldLight", "shadowCut", "outerLight", "glow", "bloom", "coreSize", "tilt", "cup"])
    U[n] = gl.getUniformLocation(prog, `u.${n}`);

  // the form eases from one preset to the next; the petal count steps
  const formOf = () => ({ ...SHAPE, ...(FORMS[v["bloom.form"]] ?? {}) });
  let target = formOf();
  const cur = { ...target };

  let W = 1, H = 1, dpr = 1;
  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden, lost = false;
  let simTime = reduced ? 6 : 0; // the settled frame: a ring just opened

  // the turn: moving round the bloom winds it like a dial, inner layers fast, outer slow
  const turn = { target: 0, fast: 0, slow: 0, last: null };
  const centre = () => [W < H ? 0.5 : 0.44, 0.52];
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    const [cx, cy] = centre();
    const dx = e.clientX - (r.left + cx * r.width), dy = r.top + (1 - cy) * r.height - e.clientY;
    const ang = Math.atan2(dy, dx), dist = Math.hypot(dx, dy);
    if (turn.last !== null) {
      const d = Math.atan2(Math.sin(ang - turn.last), Math.cos(ang - turn.last));
      const near = Math.min(1, Math.max(0, (dist - 16) / 110));
      turn.target -= Math.max(-0.5, Math.min(0.5, d)) * near * 0.6;
    }
    turn.last = ang;
    if (reduced) {
      turn.fast = turn.slow = turn.target;
      draw();
    }
  };
  const onLeave = () => (turn.last = null);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  function draw() {
    if (lost) return;
    const w = canvas.width, h = canvas.height;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.res, w, h);
    gl.uniform1f(U.time, simTime);
    gl.uniform2fv(U.center, centre());
    gl.uniform1f(U.zoom, v["lens.zoom"]);
    gl.uniform1f(U.blur, v["lens.blur"]);
    gl.uniform1f(U.samples, SAMPLES);
    gl.uniform1f(U.grain, FIXED.grain);
    gl.uniform1f(U.grainSize, FIXED.grainSize * dpr);
    gl.uniform1f(U.rings, v["bloom.rings"]);
    gl.uniform1f(U.grow, v["bloom.grow"]);
    gl.uniform1f(U.growPhase, simTime * v["bloom.grow"]);
    gl.uniform2f(U.turn, turn.fast, turn.slow);
    for (const k of ["exposure", "sharp", "cleft", "twist", "ruffle", "asym", "spread", "lengthVar", "notch", "spin", "glow", "bloom", "coreSize", "cup"]) gl.uniform1f(U[k], cur[k]);
    gl.uniform1f(U.petals, target.petals);
    gl.uniform2f(U.tilt, cur.tiltX, cur.tiltY);
    for (const k of ["breath", "sway", "vignette", "outer", "foldLight", "shadowCut", "outerLight"]) gl.uniform1f(U[k], FIXED[k]);
    gl.uniform3fv(U.sepal, hex(FIXED.sepal));
    gl.uniform3fv(U.petal, hex(v["colour.petal"]));
    gl.uniform3fv(U.centre, hex(v["colour.centre"]));
    gl.uniform3fv(U.skyTop, hex(v["colour.skyTop"]));
    gl.uniform3fv(U.skyBottom, hex(v["colour.skyBottom"]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    simTime += dt * v["motion.speed"];
    const k = 1 - Math.exp(-dt * 4);
    for (const key in target) cur[key] += (target[key] - cur[key]) * k;
    turn.fast += (turn.target - turn.fast) * (1 - Math.exp(-dt * 3.5));
    turn.slow += (turn.target - turn.slow) * (1 - Math.exp(-dt * 0.8));
    draw();
  }

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
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
      host.style.background = v["colour.skyBottom"];
      target = formOf();
      if (reduced) Object.assign(cur, target);
      draw();
    },
    action() {},
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
      host.style.background = "";
    },
  };
}
