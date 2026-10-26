/* Agent orbs.

   Planned's agent orbs as marbles (clients/planned/prototypes/04-Agent-Orb-
   Marble): the brand book's five orbs, each a conic of the book's colours
   swirled through the depth of a glass sphere, with a small pearl heart,
   nacre toward the edge, a quiet sheen and a soft shadow, on the book's
   paper. Thinking quickens the swirl and beats the pearl; done blooms it
   once. Hover an orb and it listens, leans toward the pointer and lifts.

   The shader is the prototype's (orb-gl.js), verbatim; the five recipes are
   the book's. One WebGL canvas draws every orb, each in its own viewport. */

export const params = {
  orbs: {
    size: [132, 48, 240, 1],
    state: { type: "select", options: ["Idle", "Thinking", "Done"], default: "Thinking" },
  },
  material: {
    fluidity: [0.5, 0, 1, 0.01],
    swirl: [1, 0, 2, 0.01],
    gloss: [0.75, 0, 1.6, 0.01],
    nacre: [0.4, 0, 1, 0.01],
    core: [0.45, 0, 1.6, 0.01],
  },
  motion: { speed: [1, 0, 3, 0.05] },
  colour: { ground: "#FCFBF4" },
  shuffle: { type: "action", label: "Shuffle colours" },
};

// the book's five sample orbs: three body colours and the light ray
const RECIPES = [
  { colors: ["#4F9897", "#A8D8CD", "#4B909A"], ray: "#E8D3A8" },
  { colors: ["#4F9897", "#6478BD", "#A8D8CD"], ray: "#C2E0E1" },
  { colors: ["#6478BD", "#39759A", "#4F9897"], ray: "#FFDBA6" },
  { colors: ["#D6A55C", "#F5A00A", "#5FA8A2"], ray: "#FFDBA6" },
  { colors: ["#4B909A", "#A8D8CD", "#39759A"], ray: "#F4F1E8" },
];
// the mixer's range: the editor's twelve colours, ordered so neighbours blend
const SPECTRUM = ["#294B4F", "#2F6A92", "#6478BD", "#39759A", "#4B909A", "#4F9897", "#5FA8A2", "#A8D8CD", "#C2E0E1", "#FFDBA6", "#D6A55C", "#F5A00A"];
const LIGHTS = ["#F4F1E8", "#C2E0E1", "#E8D3A8", "#FFDBA6", "#F5A00A"];
const PAPER = "#F4F1E8";
const ENERGY = { Idle: 0, Thinking: 1, Done: 0, listening: 0.3 };

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const toHex = (c) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("").toUpperCase();
function along(stops, t) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), k = x - i;
  const a = rgb(stops[i]).map((n) => n * 255), b = rgb(stops[i + 1]).map((n) => n * 255);
  return toHex(a.map((n, j) => n + (b[j] - n) * k));
}
// two picks along the range: first, the colour halfway between, last
const mixOf = (a, b) => [along(SPECTRUM, a), along(SPECTRUM, (a + b) / 2), along(SPECTRUM, b)];

const VERT = `attribute vec2 aPos; varying vec2 vUv;
void main() { vUv = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5); gl_Position = vec4(aPos, 0., 1.); }`;

// orb-gl.js's fragment shader, as the prototype has it
const FRAG = `precision highp float;
varying vec2 vUv;
uniform float uTime, uSeed, uPx, uN, uRayOn, uEnergy, uPulse, uSteps, uRad, uLift;
uniform float uRefract, uGloss, uNacre, uDepth, uSwirl, uCore, uShadow, uFlow;
uniform vec3 uC0, uC1, uC2, uRay, uPaper, uLight;
uniform vec2 uTilt;

vec3 mod289(vec3 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec4 mod289(vec4 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec4 permute(vec4 x) { return mod289(((x * 34.) + 1.) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - .85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1. / 6., 1. / 3.);
  const vec4 D = vec4(0., .5, 1., 2.);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1. - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0., i1.z, i2.z, 1.)) + i.y + vec4(0., i1.y, i2.y, 1.)) + i.x + vec4(0., i1.x, i2.x, 1.));
  float n_ = .142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49. * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7. * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1. - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2. + 1.;
  vec4 s1 = floor(b1) * 2. + 1.;
  vec4 sh = -step(h, vec4(0.));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.);
  m = m * m;
  return 42. * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

mat3 turn(float yaw, float pitch) {
  float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch);
  return mat3(cy, 0., -sy, 0., 1., 0., sy, 0., cy) * mat3(1., 0., 0., 0., cp, sp, 0., -sp, cp);
}

vec3 pal(float x) {
  x = fract(x);
  if (uN < 1.5) return uC0;
  if (uN < 2.5) return mix(uC0, uC1, .5 - .5 * cos(6.2831853 * x));
  float s = x * 3.;
  float k = smoothstep(0., 1., fract(s));
  if (s < 1.) return mix(uC0, uC1, k);
  if (s < 2.) return mix(uC1, uC2, k);
  return mix(uC2, uC0, k);
}

vec3 inside(vec3 q, mat3 R, float t, out float band) {
  vec3 w = R * q;
  float detail = mix(.6, 1., clamp(uPx / 48., 0., 1.));
  float f = mix(.38, .58, uFlow) * detail;
  float amp = (mix(.16, .34, uFlow) + .22 * uEnergy) * uSwirl;
  vec3 p = w * f;
  w += amp * vec3(snoise(p + vec3(0., 0., t * .1)), snoise(p + vec3(4.1, 1.7, -t * .09)), snoise(p + vec3(8.3, 3.9, t * .08)));
  vec3 p2 = w * f * 2.;
  w.xy += amp * .14 * uFlow * vec2(snoise(p2 + vec3(1.3, 0., t * .07)), snoise(p2 + vec3(5.7, 2.2, -t * .06)));
  band = 2. * (atan(w.y, w.x) / 6.2831853 + .5) + .7 * w.z + .25 * length(w.xy) + uSeed + t * .035;
  vec3 c = pal(band);
  float fb = fract(band);
  float hw = mix(.075, .05, uFlow), soft = mix(.07, .035, uFlow);
  float ray = smoothstep(.455 - hw - soft, .455 - hw + soft, fb) * (1. - smoothstep(.455 + hw - soft, .455 + hw + soft, fb));
  c = mix(c, uRay, ray * uRayOn * .38);
  vec3 pearl = mix(uPaper, (uC0 + uC1 + uC2) / 3., .55);
  return mix(pearl, c, smoothstep(.0, .12, length(w.xy)));
}

void main() {
  vec2 p = vec2(vUv.x * 2. - 1., 1. - vUv.y * 2.);
  vec2 sp = (p - vec2(0., uLift)) / uRad;
  float r = length(sp);
  float aa = 1.4 / max(uPx, 1.);
  float t = uTime;

  vec2 sq = (p - vec2(.06, uLift - uRad * 1.04)) / vec2(uRad * .8, uRad * .16);
  float shade = uShadow * .16 * exp(-dot(sq, sq) * 2.);
  vec3 under = vec3(.13, .2, .23) * shade;
  if (r > 1. + aa) { gl_FragColor = vec4(under, shade); return; }

  float z = sqrt(max(0., 1. - r * r));
  vec3 N = normalize(vec3(sp, z));
  vec3 V = vec3(0., 0., 1.);
  float ndv = clamp(dot(N, V), 0., 1.);
  vec3 Dir = refract(-V, N, 1. / (1. + uRefract));
  float chord = max(-2. * dot(N, Dir), 0.);
  mat3 R = turn(.32 * sin(t * .11 + uSeed * 6.) + uTilt.x * .6, .22 * cos(t * .09 + uSeed * 4.) - uTilt.y * .5);

  vec3 acc = vec3(0.); float a = 0.; float band = 0.;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uSteps) break;
    vec3 q = N + Dir * chord * ((float(i) + .5) / uSteps);
    float b;
    vec3 c = inside(q, R, t, b);
    if (i == 0) band = b;
    float da = 1. - exp(-uDepth * 2.2 * chord / uSteps);
    acc += (1. - a) * da * c;
    a += (1. - a) * da;
  }
  vec3 col = acc + (1. - a) * pal(.5 + uSeed) * .6;
  col = mix(vec3(dot(col, vec3(.299, .587, .114))), col, 1.14);
  col *= 1. + .05 * snoise(N * 1.3 + vec3(0., 0., t * .05));

  vec3 cc = vec3(-.08 + .05 * sin(t * .23), .08 + .04 * cos(t * .19), .12);
  vec3 qc = N + Dir * chord * .45 - cc;
  float beat = .85 + .15 * sin(t * .8) + uEnergy * .45 * (.5 + .5 * sin(t * 2.6)) + uPulse * 1.2;
  float core = exp(-dot(qc, qc) * mix(11., 7., clamp(uPx / 90., 0., 1.))) * uCore * beat;
  col = mix(col, uPaper, clamp(core, 0., 1.));

  col = mix(col, pal(band + .25 + (1. - ndv) * .6), uNacre * .5 * smoothstep(.3, 1., 1. - ndv));

  vec3 Rf = reflect(-V, N);
  float fres = .04 + .96 * pow(1. - ndv, 5.);
  vec3 env = mix(vec3(.84, .86, .86), vec3(1., .99, .97), smoothstep(-.5, .9, Rf.y));
  col = mix(col, env, clamp(fres * uGloss * .45, 0., 1.));
  float facing = max(dot(Rf, uLight), 0.);
  col += (pow(facing, 12.) * .1 + pow(facing, 150.) * .22) * uGloss * (1. + uPulse * .5);
  col *= 1. - .08 * smoothstep(.1, -.95, N.y);

  float alpha = 1. - smoothstep(1. - aa, 1. + aa, r);
  gl_FragColor = vec4(col * alpha + under * (1. - alpha), alpha + shade * (1. - alpha));
}`;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const power3Out = (k) => 1 - (1 - k) ** 3;
const elasticOut = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 2 ** (-10 * k) * Math.sin(((k * 10 - 0.75) * 2 * Math.PI) / 3.6) + 1);

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
  host.append(canvas);
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = gl && compile(gl.VERTEX_SHADER, VERT), fs = gl && compile(gl.FRAGMENT_SHADER, FRAG);
  if (!gl || !vs || !fs) {
    canvas.remove();
    const note = document.createElement("p");
    note.textContent = "This piece needs WebGL, which this browser has turned off.";
    note.style.cssText = "position:absolute;inset:auto 0 50% 0;margin:0;text-align:center;color:#51605F;";
    host.append(note);
    return { update() {}, action() {}, destroy: () => note.remove() };
  }
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ["uTime", "uSeed", "uPx", "uN", "uRayOn", "uEnergy", "uPulse", "uSteps", "uRad", "uLift", "uRefract", "uGloss", "uNacre", "uDepth", "uSwirl", "uCore", "uShadow", "uFlow",
    "uC0", "uC1", "uC2", "uRay", "uPaper", "uLight", "uTilt"].forEach((n) => { U[n] = gl.getUniformLocation(program, n); });
  let lost = false;
  const onLost = (e) => { e.preventDefault(); lost = true; };
  canvas.addEventListener("webglcontextlost", onLost);

  // the five orbs, each with its own clock, energy, pulse, tilt and pose
  const orbs = RECIPES.map((r, i) => {
    const seed = 0.17 + i * 0.23;
    return {
      colors: [...r.colors], ray: r.ray, seed, clock: 6 + seed * 20,
      energy: ENERGY[v["orbs.state"]] ?? 0, pulse: 0, tilt: { x: 0, y: 0 }, aim: { x: 0, y: 0 },
      lift: 0, press: 1e9, hover: false, cx: 0, cy: 0, box: 0,
    };
  });

  let W = 0, H = 0, dpr = 1, size = v["orbs.size"];
  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  let stateAt = 0, time = 0; // when the state last changed, on the piece's clock

  /* The orbs in balanced rows (3 and 2, never 4 and 1), centred. Each orb
     is drawn in a box a quarter larger than itself, for its shadow. */
  function layout() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    let s = v["orbs.size"];
    const gapFor = (x) => [clamp(x * 0.32, 8, 72), clamp(x * 0.42, 12, 96)];
    let rows, perRow;
    for (let tries = 0; tries < 40; tries++) {
      const [rowGap, colGap] = gapFor(s);
      const fit = Math.max(1, Math.floor((W - 32 + colGap) / (s + colGap)));
      rows = Math.ceil(orbs.length / fit);
      perRow = Math.ceil(orbs.length / rows);
      const tall = rows * s + (rows - 1) * rowGap;
      if (tall <= H * 0.82 && perRow * s <= W - 32) break;
      s *= 0.94; // a big orb on a small stage comes down until the rows fit
    }
    size = s;
    const [rowGap, colGap] = gapFor(s);
    const top = (H - (rows * s + (rows - 1) * rowGap)) / 2;
    orbs.forEach((o, i) => {
      const row = Math.floor(i / perRow), inRow = Math.min(perRow, orbs.length - row * perRow), col = i - row * perRow;
      const rowW = inRow * s + (inRow - 1) * colGap;
      o.cx = (W - rowW) / 2 + col * (s + colGap) + s / 2;
      o.cy = top + row * (s + rowGap) + s / 2;
      o.box = s * 1.25;
    });
  }

  function drawOrb(o, scale) {
    const n = Math.max(8, Math.round(o.box * scale * dpr));
    const x = Math.round((o.cx * dpr) - n / 2), y = Math.round(canvas.height - ((o.cy + o.lift) * dpr + n / 2));
    gl.viewport(x, y, n, n);
    gl.scissor(x, y, n, n);
    const c = (i) => rgb(o.colors[Math.min(i, o.colors.length - 1)]);
    const rad = 0.8, pxRadius = (n / 2) * rad;
    const a = (-38 * Math.PI) / 180;
    const L = [Math.sin(a) * 0.62, 0.62, 0.48], l = Math.hypot(...L);
    gl.uniform1f(U.uTime, o.clock);
    gl.uniform1f(U.uSeed, o.seed);
    gl.uniform1f(U.uPx, pxRadius);
    gl.uniform1f(U.uN, o.colors.length);
    gl.uniform1f(U.uRayOn, o.ray ? 1 : 0);
    gl.uniform1f(U.uEnergy, o.energy);
    gl.uniform1f(U.uPulse, o.pulse);
    gl.uniform1f(U.uSteps, pxRadius < 14 ? 2 : pxRadius < 40 ? 3 : 5);
    gl.uniform1f(U.uRad, rad);
    gl.uniform1f(U.uLift, 0.12);
    gl.uniform1f(U.uRefract, 0.35);
    gl.uniform1f(U.uGloss, v["material.gloss"]);
    gl.uniform1f(U.uNacre, v["material.nacre"]);
    gl.uniform1f(U.uDepth, 0.9);
    gl.uniform1f(U.uSwirl, v["material.swirl"]);
    gl.uniform1f(U.uCore, v["material.core"]);
    gl.uniform1f(U.uShadow, 1);
    gl.uniform1f(U.uFlow, v["material.fluidity"]);
    gl.uniform3fv(U.uC0, c(0));
    gl.uniform3fv(U.uC1, c(1));
    gl.uniform3fv(U.uC2, c(2));
    gl.uniform3fv(U.uRay, rgb(o.ray || PAPER));
    gl.uniform3fv(U.uPaper, rgb(PAPER));
    gl.uniform3f(U.uLight, L[0] / l, L[1] / l, L[2] / l);
    gl.uniform2f(U.uTilt, o.tilt.x, o.tilt.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function draw() {
    if (lost) return;
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const [r, g, b] = rgb(v["colour.ground"]);
    gl.clearColor(r, g, b, 1); // the paper
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    orbs.forEach((o, i) => {
      // thinking: each orb breathes, a little out of step with the next
      const breathe = v["orbs.state"] === "Thinking" && !reduced ? 1 + 0.0125 * (1 - Math.cos(((time + i * 0.37) / 1.6) * Math.PI)) : 1;
      const pk = clamp((time - o.press) / 0.9);
      const press = o.press > time ? 1 : 0.95 + 0.05 * elasticOut(pk);
      drawOrb(o, breathe * press);
    });
  }

  /* Motion: every orb's clock runs at its own pace (faster while it thinks),
     and its energy, pulse, tilt and lift ease toward where they should be. */
  function step(dt) {
    time += dt;
    const mode = v["orbs.state"];
    orbs.forEach((o, i) => {
      const want = Math.max(ENERGY[mode] ?? 0, o.hover ? ENERGY.listening : 0);
      o.energy += (want - o.energy) * (1 - Math.exp(-dt / 0.3));
      o.clock += dt * v["motion.speed"] * (1 + o.energy * 1.4);
      // done: one bloom of the pearl each, a little after the one before
      if (mode === "Done") {
        const k = clamp((time - stateAt - i * 0.08) / 1.6);
        o.pulseDone = time - stateAt < i * 0.08 ? 0 : 1.1 * (1 - power3Out(k));
      } else o.pulseDone = 0;
      const pk = clamp((time - o.press) / 1.4);
      const pressPulse = o.press > time ? 0 : 1 - power3Out(pk);
      o.pulse = Math.max(o.pulseDone, pressPulse);
      o.tilt.x += (o.aim.x - o.tilt.x) * (1 - Math.exp(-dt / 0.3));
      o.tilt.y += (o.aim.y - o.tilt.y) * (1 - Math.exp(-dt / 0.3));
      o.lift += ((o.hover ? -6 : 0) - o.lift) * (1 - Math.exp(-dt / 0.2));
    });
  }

  // still: thinking shows a livelier swirl, frozen; done holds a little bloom
  function still() {
    const mode = v["orbs.state"];
    orbs.forEach((o) => {
      o.energy = Math.max(ENERGY[mode] ?? 0, o.hover ? ENERGY.listening : 0);
      o.pulse = mode === "Done" ? 0.4 : 0;
      o.tilt.x = o.aim.x;
      o.tilt.y = o.aim.y;
    });
    draw();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt);
    draw();
  }
  function sync() {
    const run = !reduced && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  /* The pointer: hover an orb and it listens, leans and lifts; press blooms it. */
  const orbAt = (e) => {
    const r = host.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const o = orbs.find((q) => Math.hypot(x - q.cx, y - q.cy) <= size / 2);
    return { o, x, y };
  };
  const onMove = (e) => {
    const { o, x, y } = orbAt(e);
    orbs.forEach((q) => {
      q.hover = q === o;
      if (q === o) {
        q.aim.x = ((x - q.cx) / q.box) * 2;
        q.aim.y = ((y - q.cy) / q.box) * 2;
      } else q.aim.x = q.aim.y = 0;
    });
    canvas.style.cursor = o ? "pointer" : "";
    if (reduced) still();
  };
  const onLeave = () => {
    orbs.forEach((q) => { q.hover = false; q.aim.x = q.aim.y = 0; });
    canvas.style.cursor = "";
    if (reduced) still();
  };
  const onDown = (e) => {
    const { o } = orbAt(e);
    if (o && !reduced) o.press = time;
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointerdown", onDown);

  const ro = new ResizeObserver(() => {
    layout();
    if (reduced) still(); else draw();
  });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
  io.observe(host);
  const onVis = () => { tabVisible = !document.hidden; sync(); };
  document.addEventListener("visibilitychange", onVis);

  layout();
  if (reduced) still(); else draw();
  sync();

  return {
    update(values, path) {
      const prevState = v["orbs.state"];
      Object.assign(v, values);
      if (v["orbs.state"] !== prevState) stateAt = time;
      if (path == null || path === "orbs.size") layout();
      if (reduced) still(); else if (!raf) draw();
    },
    action(name) {
      if (name !== "shuffle") return;
      // the dock's shuffle, for every orb: two picks along the range, and a
      // light ray four times in ten
      orbs.forEach((o) => {
        o.colors = mixOf(Math.random(), Math.random());
        o.ray = Math.random() < 0.4 ? along(LIGHTS, Math.random()) : "";
        o.press = time;
      });
      if (reduced) still(); else if (!raf) draw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
