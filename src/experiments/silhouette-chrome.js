/* Silhouette chrome.

   From a client study (their round two, after a chrome flower Hunter
   sent): ten objects in real 3D liquid chrome, a butterfly, a rocket on its
   legs, a protein round its ion, a satellite with its solar wings, a portal,
   a capsule, a chip, a sail drone, a sapling and a dendrimer. Each is a
   signed distance function of rounded forms fused with a smooth minimum, so
   the joins flow like poured metal, raymarched in one fragment shader. The
   chrome mirrors a studio (a steel-blue sky, a hot horizon, softboxes, black
   flags, the pale wall behind the camera and the photographer's light) and
   itself once. It turns in 3D, holds, and melts into the next object: the
   two fields blended and swollen while they pass through each other.

   Drag to turn it; click for the next object. The source's company tabs,
   descriptions, verticals and the network drawn over it are left out: only
   the chrome. */

export const params = {
  object: {
    shape: { type: "select", options: ["Butterfly", "Rocket", "Protein", "Satellite", "Portal", "Capsule", "Chip", "Sail drone", "Tree", "Dendrimer"] },
  },
  sequence: {
    hold: [6, 2, 20, 0.1],
    morph: [2.2, 0.4, 5, 0.05],
    melt: [0.07, 0, 0.25, 0.005],
  },
  chrome: {
    size: [0.5, 0.15, 0.8, 0.01],
    spin: [0.24, 0, 2, 0.01],
    reflections: { type: "toggle", labels: ["Once", "Of itself too"], default: true },
  },
  colour: {
    tint: "#eef2f8",
    sky: "#6585b2",
    ground: "#e2e8ef",
  },
  next: { type: "action", label: "Next object" },
};

const SHAPES = params.object.shape.options;

// the source's settings that stay put
const TILT = 12, WOBBLE = 0.5, ENV_TURN = 0.04, GRAIN = 0.5, STEPS = 96, MAX_PIXELS = 2.8e6;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 R; uniform float T, CAMD, TANH, MELT, KS, K, ENVA, GRAIN, BOUNCE;
uniform int A, B, STEPS; uniform mat3 ROT; uniform vec3 TINT, BGT, BGB; uniform float FLAP;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.) / k; return min(a, b) - h * h * k * .25; }
float sdSph(vec3 p, float r) { return length(p) - r; }
float sdEll(vec3 p, vec3 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.) / max(k1, 1e-5); }
float sdCap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float sdRBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }
float sdTor(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
// a round cone along y, radius r1 at y = 0 and r2 at y = h
float sdRCone(vec3 p, float r1, float r2, float h) {
  vec2 q = vec2(length(p.xz), p.y); float b = (r1 - r2) / h, a = sqrt(1. - b * b), k = dot(q, vec2(-b, a));
  if (k < 0.) return length(q) - r1; if (k > a * h) return length(q - vec2(0., h)) - r2; return dot(q, vec2(a, b)) - r1;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float sdButterfly(vec3 p) {
  float d = smin(sdCap(p, vec3(0, -.34, 0), vec3(0, .24, 0), .045), sdSph(p - vec3(0, .31, 0), .058), .05);
  vec3 q = p; q.x = abs(q.x); q.xz = rot(FLAP) * q.xz;
  vec3 a = q - vec3(.34, .13, 0); a.xy = rot(-.32) * a.xy;
  vec3 b = q - vec3(.23, -.17, 0); b.xy = rot(.5) * b.xy;
  float w = smin(sdEll(a, vec3(.33, .22, .055)), sdEll(b, vec3(.21, .18, .05)), .07);
  d = smin(d, w, .06);
  vec3 e = p; e.x = abs(e.x);
  d = smin(d, sdCap(e, vec3(.02, .33, 0), vec3(.12, .55, .03), .009), .03);
  return smin(d, sdSph(e - vec3(.12, .55, .03), .026), .02);
}
float sdRocket(vec3 p) {
  p.y += .04; float r = .1;
  float d = smin(sdCap(p, vec3(0, -.6, 0), vec3(0, .36, 0), r), sdEll(p - vec3(0, .4, 0), vec3(r, .3, r)), .07);
  d = min(d, sdTor(p - vec3(0, .12, 0), vec2(r + .002, .013)));
  vec3 q = p; q.xz = abs(q.xz);
  float fin = min(sdRBox(q - vec3(r + .045, .05, 0), vec3(.042, .036, .006), .004), sdRBox(q - vec3(0, .05, r + .045), vec3(.006, .036, .042), .004));
  d = smin(d, fin, .02);
  float leg = min(sdCap(q, vec3(r * .7, -.42, 0), vec3(r + .15, -.8, 0), .014), sdCap(q, vec3(0, -.42, r * .7), vec3(0, -.8, r + .15), .014));
  d = smin(d, leg, .03);
  float bells = 1e3;
  for (int i = 0; i < 3; i++) { float a = float(i) * 2.0944; bells = min(bells, sdRCone(p - vec3(cos(a) * .052, -.84, sin(a) * .052), .042, .022, .13)); }
  return smin(d, bells, .025);
}
float sdProtein(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < 30; i++) { float t = float(i) / 29., a = t * 12.566 + T * .4; d = smin(d, sdSph(p - vec3(cos(a) * .3, mix(-.6, .6, t), sin(a) * .3), .075), .07); }
  return smin(d, sdSph(p, .14), .03);
}
float sdSatellite(vec3 p) {
  float d = sdRBox(p, vec3(.13, .17, .13), .035);
  vec3 q = p; q.x = abs(q.x);
  float panel = sdRBox(q - vec3(.53, 0, 0), vec3(.33, .17, .009), .008);
  // the cells of the solar wing, as shallow grooves
  vec3 g = q - vec3(.53, 0, 0); g.x -= .11 * clamp(floor(g.x / .11 + .5), -2., 2.);
  panel = max(panel, -sdRBox(g, vec3(.006, .2, .02), .002));
  d = smin(d, smin(panel, sdCap(q, vec3(.13, 0, 0), vec3(.21, 0, 0), .016), .02), .03);
  d = smin(d, sdEll(p - vec3(0, -.25, 0), vec3(.09, .04, .09)), .04);
  return smin(d, sdCap(p, vec3(0, .17, 0), vec3(0, .36, 0), .009), .02);
}
float sdPortal(vec3 p) {
  vec3 q = p - vec3(0, .02, 0);
  float ring = max(sdTor(vec3(q.x, q.z, q.y - .12), vec2(.26, .07)), .12 - q.y);
  float pil = sdCap(vec3(abs(q.x), q.y, q.z), vec3(.26, .12, 0), vec3(.26, -.5, 0), .07);
  float d = smin(ring, pil, .03);
  return smin(d, sdRBox(q - vec3(0, -.6, 0), vec3(.5, .05, .22), .035), .05);
}
float sdCapsule(vec3 p) {
  p.xy = rot(.25) * p.xy;
  float d = sdRCone(p - vec3(0, -.26, 0), .33, .11, .5);
  d = smin(d, sdEll(p - vec3(0, -.3, 0), vec3(.37, .09, .37)), .05);
  return smin(d, sdCap(p, vec3(0, .24, 0), vec3(0, .32, 0), .065), .04);
}
float sdChip(vec3 p) {
  float d = smin(sdRBox(p, vec3(.42, .42, .045), .025), sdRBox(p - vec3(0, 0, .055), vec3(.22, .22, .025), .012), .03);
  vec3 a = p; a.y = abs(a.y) - .47; a.x -= .09 * clamp(floor(a.x / .09 + .5), -4., 4.);
  vec3 b = p; b.x = abs(b.x) - .47; b.y -= .09 * clamp(floor(b.y / .09 + .5), -4., 4.);
  return min(d, min(sdRBox(a, vec3(.018, .05, .012), .005), sdRBox(b, vec3(.05, .018, .012), .005)));
}
float sdSail(vec3 p) {
  float d = sdEll(p - vec3(0, -.3, 0), vec3(.56, .07, .11));
  d = smin(d, sdRBox(p - vec3(.03, .14, 0), vec3(.16, .42, .025), .025), .05);
  d = smin(d, sdRBox(p - vec3(0, -.5, 0), vec3(.035, .16, .012), .01), .03);
  d = smin(d, sdEll(p - vec3(0, -.68, 0), vec3(.16, .045, .045)), .03);
  return smin(d, sdRBox(p - vec3(-.5, -.17, 0), vec3(.05, .09, .012), .01), .03);
}
float sdTree(vec3 p) {
  float d = sdRCone(p - vec3(0, -.66, 0), .085, .04, .66);
  vec3 q = p; q.x = abs(q.x);
  d = smin(d, sdCap(q, vec3(0, -.15, 0), vec3(.2, .1, .02), .03), .06);
  float c = sdSph(p - vec3(0, .18, 0), .29);
  c = smin(c, sdSph(p - vec3(-.25, .05, .05), .2), .12);
  c = smin(c, sdSph(p - vec3(.25, .08, -.05), .21), .12);
  c = smin(c, sdSph(p - vec3(.04, .42, .02), .19), .12);
  c = smin(c, sdSph(p - vec3(0, .07, .22), .17), .12);
  return smin(d, c, .08);
}
float sdDendrimer(vec3 p) {
  float d = sdSph(p, .11);
  for (int i = 0; i < 6; i++) {
    float fi = float(i), y = 1. - (fi + .5) / 3., r = sqrt(max(0., 1. - y * y)), th = fi * 2.39996;
    vec3 dir = normalize(vec3(cos(th) * r, y, sin(th) * r)), mid = dir * .26;
    d = smin(d, sdCap(p, vec3(0), mid, .032), .05);
    vec3 pe = normalize(cross(dir, vec3(.3, 1, .2)));
    for (int j = 0; j < 2; j++) {
      vec3 tip = mid + normalize(dir + pe * (j == 0 ? .8 : -.8)) * .22;
      d = smin(d, sdCap(p, mid, tip, .022), .04);
      d = smin(d, sdSph(p - tip, .055), .03);
    }
  }
  return d;
}
float obj(int i, vec3 p) {
  if (i == 0) return sdButterfly(p); if (i == 1) return sdRocket(p); if (i == 2) return sdProtein(p);
  if (i == 3) return sdSatellite(p); if (i == 4) return sdPortal(p); if (i == 5) return sdCapsule(p);
  if (i == 6) return sdChip(p); if (i == 7) return sdSail(p); if (i == 8) return sdTree(p); return sdDendrimer(p);
}
// the two objects melt into each other: blended, and swollen while they pass through
float map(vec3 p) {
  vec3 q = ROT * p;
  float a = obj(A, q);
  if (K > 0.) a = mix(a, obj(B, q), KS) - MELT * sin(3.14159265 * K);
  return a;
}
vec3 nrm(vec3 p, float t) {
  vec2 e = vec2(.0007 + t * .0002, -.0007 - t * .0002);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}
float ao(vec3 p, vec3 n) { float o = 0., w = 1.; for (int i = 1; i <= 4; i++) { float h = .025 * float(i); o += (h - map(p + n * h)) * w; w *= .6; } return clamp(1. - o * 5., 0., 1.); }
float box(float az, float el, float a0, float e0, float wa, float we) {
  float da = abs(atan(sin(az - a0), cos(az - a0))) / wa, de = abs(el - e0) / we;
  return (1. - smoothstep(.75, 1., da)) * (1. - smoothstep(.75, 1., de));
}
// the studio it mirrors
vec3 env(vec3 r) {
  vec3 rr = r; rr.xz = rot(ENVA) * rr.xz;
  float y = rr.y, az = atan(rr.x, -rr.z), el = asin(clamp(y, -1., 1.));
  // sky above (the backdrop itself), a hot horizon, a grey-blue floor going dark below
  vec3 c = y > 0. ? mix(BGB * 1.12, BGT * 1.05, smoothstep(-.02, .7, y)) : mix(vec3(.5, .55, .62), vec3(.07, .08, .1), smoothstep(-.02, -.6, y));
  c = mix(c, vec3(1.1), exp(-abs(y + .01) * 30.) * .9);
  // softboxes: a big key up left, a strip right, a bar overhead
  c += box(az, el, -.95, .5, .42, .26) * 1.6;
  c += box(az, el, 1.2, .15, .13, .6) * 1.3;
  c += box(az, el, .1, 1.05, .9, .12) * 1.;
  // black flags at the sides, the thin black lines chrome is drawn with
  c *= 1. - .85 * box(az, el, 2.05, .05, .12, .9) - .85 * box(az, el, -2.2, .0, .1, .9);
  // behind the camera, a pale studio wall going dark toward the floor, and the photographer's light
  vec3 rz = normalize(r); float back = smoothstep(.3, .9, rz.z);
  vec3 wall = mix(vec3(.1, .115, .14), vec3(.86, .9, .96), smoothstep(-.4, .5, rz.y));
  c = mix(c, wall, back * .9);
  c += vec3(1.1) * smoothstep(.86, .97, dot(rz, normalize(vec3(-.4, .5, .77))));
  return c;
}
vec3 shade(vec3 p, vec3 rd, float t) {
  vec3 n = nrm(p, t), r = reflect(rd, n), c = env(r);
  if (BOUNCE > .5) {
    float s = .015; bool hit = false;
    for (int i = 0; i < 36; i++) { float d = map(p + r * s); if (d < .0012) { hit = true; break; } s += d; if (s > 2.2) break; }
    if (hit) { vec3 p2 = p + r * s; c = env(reflect(r, nrm(p2, t))) * .62; }
  }
  float f = .88 + .12 * pow(1. - max(dot(n, -rd), 0.), 5.);
  return c * TINT * f * (.5 + .5 * ao(p, n));
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * R) / R.y * 2.;
  vec3 bg = mix(BGB, BGT, smoothstep(0., 1., fc.y / R.y));
  bg += (h12(fc + fract(T * 7.13) * 512.) - .5) * .03 * GRAIN;
  vec3 ro = vec3(0, 0, CAMD), rd = normalize(vec3(uv * TANH, -1.));
  // only march inside the sphere that holds the object
  float bb = dot(ro, rd), cc = dot(ro, ro) - 1.3, hh = bb * bb - cc;
  if (hh < 0.) { outColor = vec4(bg, 1.); return; }
  float t = max(-bb - sqrt(hh), 0.), t1 = -bb + sqrt(hh), px = 2. * TANH / R.y;
  float best = 1e9, tb = t; bool hit = false;
  for (int i = 0; i < 160; i++) {
    if (i >= STEPS) break;
    float d = map(ro + rd * t);
    float k = d / (t * px); if (k < best) { best = k; tb = t; }
    if (d < .0004 * t) { hit = true; break; }
    t += d * .9; if (t > t1) break;
  }
  vec3 col = bg;
  if (hit) col = shade(ro + rd * t, rd, t);
  else if (best < 1.5) col = mix(shade(ro + rd * tb, rd, tb), bg, clamp(best / 1.5, 0., 1.));
  outColor = vec4(col, 1.);
}`;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (k) => ((k = clamp(k, 0, 1)), k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const rad = (d) => (d * Math.PI) / 180;
const hex3 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const flapAt = (t) => 0.12 + 0.6 * (0.5 + 0.5 * Math.sin(t * 5.2)) * (0.55 + 0.45 * Math.sin(t * 0.37) ** 2);
// object space to world: turn about y, tip about x (M = Ry(a) * Rx(b), as rows)
function rotation(a, b) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  return [ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb];
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;background:${v["colour.ground"]}`;
  host.append(canvas);
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) return { update() {}, action() {}, destroy: () => canvas.remove() };

  let ok = true;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); ok = false; }
    return s;
  };
  const prog = gl.createProgram();
  const vs = sh(gl.VERTEX_SHADER, "#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }"), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "p");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); ok = false; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ["R", "T", "CAMD", "TANH", "MELT", "KS", "K", "ENVA", "GRAIN", "BOUNCE", "A", "B", "STEPS", "ROT", "TINT", "BGT", "BGB", "FLAP"]) U[n] = gl.getUniformLocation(prog, n);

  // the sequence: hold one, melt into the next
  const seq = { ix: Math.max(0, SHAPES.indexOf(v["object.shape"])), to: -1, k: 0, holdT0: 0, queue: -1, fast: false };
  let now = 0, W = 1, H = 1, spinA = -0.5, vspin = 0, tiltD = 0, vtilt = 0, morphK = 0, morphE = 0;
  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden, dragging = null;
  const N = SHAPES.length, wrap = (j) => ((j % N) + N) % N;

  function startMorph(j, fast = false) {
    j = wrap(j);
    if (reduced) {
      // a still piece jumps straight there
      seq.ix = j; seq.to = -1; seq.queue = -1;
      draw();
      return;
    }
    if (seq.to >= 0) { if (j !== seq.to) seq.queue = j; return; }
    if (j === seq.ix) return;
    seq.to = j; seq.k = 0; seq.fast = fast;
  }
  const advance = (d = 1, fast = false) => startMorph((seq.to >= 0 ? seq.to : seq.ix) + d, fast);

  function draw() {
    if (!ok) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    // the dpr, capped again so a big screen never marches more than a few million pixels
    const sc = Math.min(dpr, Math.sqrt(MAX_PIXELS / (W * H)));
    const w = Math.max(2, Math.round(W * sc)), h = Math.max(2, Math.round(H * sc));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    // the camera frames the object at the size asked for (a unit object, half its height)
    const tanH = Math.tan(rad(13)), camD = 0.82 / Math.min(v["chrome.size"] * Math.min(1, (W / H) * 1.15), 0.9) / tanH;
    const rotM = rotation(spinA, rad(TILT + tiltD) + WOBBLE * 0.12 * Math.sin(now * 0.5));
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.R, w, h);
    gl.uniform1f(U.T, now);
    gl.uniform1f(U.CAMD, camD);
    gl.uniform1f(U.TANH, tanH);
    gl.uniform1f(U.MELT, v["sequence.melt"]);
    gl.uniform1f(U.K, morphK);
    gl.uniform1f(U.KS, morphE);
    gl.uniform1f(U.ENVA, now * ENV_TURN);
    gl.uniform1f(U.GRAIN, GRAIN);
    gl.uniform1f(U.BOUNCE, v["chrome.reflections"] ? 1 : 0);
    gl.uniform1f(U.FLAP, flapAt(now));
    gl.uniform1i(U.A, seq.ix);
    gl.uniform1i(U.B, seq.to >= 0 ? seq.to : seq.ix);
    gl.uniform1i(U.STEPS, STEPS);
    // the shader takes world to object, the transpose of the rotation (GL reads columns)
    gl.uniformMatrix3fv(U.ROT, false, rotM);
    gl.uniform3fv(U.TINT, hex3(v["colour.tint"]));
    gl.uniform3fv(U.BGT, hex3(v["colour.sky"]));
    gl.uniform3fv(U.BGB, hex3(v["colour.ground"]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(ms) {
    raf = 0;
    const dt = last ? Math.min(0.05, (ms - last) / 1000) : 0;
    last = ms;
    now += dt;
    if (seq.to < 0 && now - seq.holdT0 > v["sequence.hold"]) advance(1);
    let k = 0;
    if (seq.to >= 0) {
      // clicks run faster, and a morph with another waiting behind it hurries
      seq.k = Math.min(1, seq.k + (dt / Math.max(0.3, v["sequence.morph"])) * (seq.queue >= 0 ? 3 : seq.fast ? 1.6 : 1));
      k = seq.k;
      if (k >= 1) {
        seq.ix = seq.to; seq.to = -1; seq.holdT0 = now; k = 0;
        if (seq.queue >= 0) { const q = seq.queue; seq.queue = -1; startMorph(q, true); }
        else seq.fast = false;
      }
    }
    morphK = k;
    morphE = seq.to >= 0 ? ease(k) : 0;
    // its own turn, plus whatever a drag threw at it
    if (!dragging) {
      spinA += dt * (v["chrome.spin"] + vspin);
      vspin *= Math.exp(-dt * 2.2);
      tiltD += vtilt * dt;
      vtilt *= Math.exp(-dt * 2.2);
      tiltD *= Math.exp(-dt * 0.8); // the tilt eases back to the studio's
    }
    draw();
    if (running()) raf = requestAnimationFrame(frame);
  }
  const running = () => !reduced && onScreen && tabVisible;
  function loop() {
    if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // drag to turn it (a finger only spins it, so the page still scrolls); a click without a drag moves on
  const onDown = (e) => {
    dragging = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: false, touch: e.pointerType === "touch" };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!dragging) return;
    const t = performance.now(), dts = Math.max(0.001, (t - dragging.t) / 1000);
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    if (Math.hypot(e.clientX - dragging.x0, e.clientY - dragging.y0) > 5) dragging.moved = true;
    const k = (Math.PI * 2) / Math.max(320, W);
    spinA += dx * k;
    if (!dragging.touch) tiltD = clamp(tiltD + dy * k * 40, -40, 40);
    vspin = ((dx * k) / dts) * 0.5 + vspin * 0.5;
    vtilt = dragging.touch ? 0 : ((dy * k * 40) / dts) * 0.5 + vtilt * 0.5;
    dragging.x = e.clientX;
    dragging.y = e.clientY;
    dragging.t = t;
    if (reduced) draw();
  };
  const onUp = () => {
    if (!dragging) return;
    const click = !dragging.moved;
    dragging = null;
    canvas.style.cursor = "grab";
    if (click) advance(1, true);
    else if (reduced) vspin = vtilt = 0;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  const ro = new ResizeObserver(() => !raf && draw());
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    onScreen ? loop() : stop();
  });
  io.observe(host);
  const onVis = () => {
    tabVisible = !document.hidden;
    tabVisible ? loop() : stop();
  };
  document.addEventListener("visibilitychange", onVis);
  draw();
  loop();

  return {
    update(values, path) {
      Object.assign(v, values);
      canvas.style.background = v["colour.ground"];
      if (path === "object.shape") startMorph(SHAPES.indexOf(v["object.shape"]), true);
      if (!raf) draw();
    },
    action(name) {
      if (name === "next") advance(1, true);
    },
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      gl.deleteBuffer(buf);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
