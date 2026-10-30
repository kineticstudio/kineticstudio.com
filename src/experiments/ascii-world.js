/* ASCII world.

   From a client study (their round two): footage plays full frame, as
   itself, and a liquid is poured into it. Through the liquid the same
   footage shows as a machine reads it, character by character: a ramp of
   glyphs for how bright each cell is, and strokes (- / | \) where an edge
   runs through it. The liquid refracts the picture at its rim, swirls a
   little on a slow noise and drains away; left alone, a drop wanders on a
   figure of eight, and the cursor pours more wherever it goes.

   The liquid lives in two half-resolution float textures it passes between
   (poured, advected, blurred, decayed); the picture is one pass that reads
   it. The characters are IBM Plex Mono Medium, cut down to the ramps' glyphs
   (public/experiments/ascii-world/); the footage is an aerial forest at
   sunset from Pexels (Alexander Mass), cut down to 720p. The page's drop a
   video of your own is left out. */

export const params = {
  liquid: {
    radius: [90, 20, 300, 1],
    linger: [2.6, 0.4, 10, 0.1],
    wobble: [0.55, 0, 2, 0.01],
    refraction: [1, 0, 3, 0.01],
  },
  characters: {
    ramp: { type: "select", options: ["Classic", "Math", "Binary"] },
    cell: [11, 6, 32, 1],
    edges: [1, 0, 3, 0.01],
    tint: { type: "select", options: ["Ink", "Footage"] },
  },
  colour: {
    ground: "#0a0b0b",
    ink: "#e0e6db",
  },
  pour: { type: "action", label: "Pour" },
};

const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const VIDEO_URL = new URL("experiments/ascii-world/forest.mp4", ROOT).href;
const FONT_URL = new URL("experiments/ascii-world/plex-mono-500.woff2", ROOT).href;
const FAMILY = "ks-ascii-world-mono";
const MONO = `"${FAMILY}", ui-monospace, Menlo, monospace`;
const RAMPS = { Classic: " .:-=+*#%@", Math: " ·∶∷+×≈≡∑∂∆", Binary: "  ..::0011" };

// the source's settings that stay put
const POUR = 1, FLOW = 0.5, SOFT = 0.25, GLOSS = 0.6, CONTRAST = 1.15, GAMMA = 0.55, WANDER_SPEED = 0.35;

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
const NOISE = `
vec3 permute(vec3 x) { return mod(((x * 34.) + 1.) * x, 289.); }
float snoise(vec2 v) {
  const vec4 C = vec4(.211324865405187, .366025403784439, -.577350269189626, .024390243902439);
  vec2 i = floor(v + dot(v, C.yy)), x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1., 0.) : vec2(0., 1.);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.);
  vec3 p = permute(permute(i.y + vec3(0., i1.y, 1.)) + i.x + vec3(0., i1.x, 1.));
  vec3 m = max(.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.); m = m * m; m = m * m;
  vec3 x = 2. * fract(p * C.www) - 1., h = abs(x) - .5, ox = floor(x + .5), a0 = x - ox;
  m *= 1.79284291400159 - .85373472095314 * (a0 * a0 + h * h);
  vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130. * dot(m, g);
}`;

// the liquid: a field poured by the cursor, drifting on a slow swirl, spreading a little and draining away
const SIM = `#version 300 es
precision highp float; out vec4 o;
uniform sampler2D PREV; uniform vec2 RES; uniform float T, DECAY, FLOW, ASP;
uniform vec4 SPL[24]; uniform int NS;
${NOISE}
void main(){
  vec2 uv = gl_FragCoord.xy / RES, px = 1. / RES;
  vec2 w = vec2(snoise(uv * 2.2 + vec2(T * .05, 0.)), snoise(uv * 2.2 + vec2(7.3, -T * .05)));
  vec2 back = uv - w * FLOW * px * 1.6;
  float c = texture(PREV, back).r;
  float b = (texture(PREV, back + vec2(px.x, 0.)).r + texture(PREV, back - vec2(px.x, 0.)).r + texture(PREV, back + vec2(0., px.y)).r + texture(PREV, back - vec2(0., px.y)).r) * .25;
  float f = mix(c, b, .35) * DECAY;
  for (int i = 0; i < 24; i++) {
    if (i >= NS) break;
    vec2 d = (uv - SPL[i].xy) * vec2(ASP, 1.);
    f += SPL[i].z * exp(-dot(d, d) / (SPL[i].w * SPL[i].w));
  }
  o = vec4(min(f, 1.6), 0., 0., 1.);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 R; uniform float T;
uniform sampler2D VID; uniform vec2 VSZ;
uniform sampler2D ATL; uniform float NG; uniform float NR; uniform float GAMMA; uniform float EDGES;
uniform vec2 CELL; uniform float CONTRAST; uniform float PAPER; uniform int COLOR; uniform vec3 BG, INK;
uniform sampler2D LIQ; uniform float WOB, SOFT, REFR, GLOSS;
${NOISE}

vec2 cover(vec2 uv){
  float ar = R.x/R.y, vr = VSZ.x/VSZ.y;
  vec2 s = ar > vr ? vec2(1., vr/ar) : vec2(ar/vr, 1.);
  return (uv - .5)*s + .5;
}
vec3 vid(vec2 frag, float lod) { vec2 uv = frag / R; return textureLod(VID, cover(vec2(uv.x, 1. - uv.y)), lod).rgb; }

// the world as the machine reads it: one character per cell
vec3 typeAt(vec2 frag){
  vec2 cell = floor(frag/CELL), cuv = (cell + .5)*CELL;
  float lod = max(log2(max(CELL.x, CELL.y)*VSZ.y/R.y), 0.);
  vec3 src = vid(cuv, lod);
  float L = pow(dot(src, vec3(.2126,.7152,.0722)), GAMMA);
  L = clamp((L - .5)*CONTRAST + .5, 0., 1.);
  float k = PAPER > .5 ? 1. - L : L;
  float g = min(floor(k*NR), NR - 1.);
  float lx = dot(vid(cuv + vec2(CELL.x, 0.), lod) - vid(cuv - vec2(CELL.x, 0.), lod), vec3(.333));
  float ly = dot(vid(cuv + vec2(0., CELL.y), lod) - vid(cuv - vec2(0., CELL.y), lod), vec3(.333));
  if (EDGES > 0. && length(vec2(lx, ly)) > .2/EDGES) { float ang = atan(ly, lx) + 1.5708; g = NR + mod(floor((ang + .3927)/.7854), 4.); }
  vec2 local = fract(frag/CELL);
  float a = texture(ATL, vec2((g + local.x)/NG, 1. - local.y)).r;
  vec3 fg = COLOR == 1 ? (PAPER > .5 ? src*.7 : src*1.25 + .05) : INK;
  return mix(BG, fg, a);
}

// the liquid's level here, with an edge that is never a circle
float level(vec2 frag) {
  float f = texture(LIQ, frag / R).r;
  return f + WOB * .09 * (snoise(frag / R.y * 6. + vec2(T * .25, -T * .2)) * .75 + snoise(frag / R.y * 15. - T * .3) * .25) * smoothstep(.22, .5, f);
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  float th = .42, w = .03 + SOFT * .12;
  float f = level(frag);
  // the slope of the liquid: its rim bends the picture like a lens
  float e = 2.5;
  vec2 g = vec2(level(frag + vec2(e, 0.)) - level(frag - vec2(e, 0.)), level(frag + vec2(0., e)) - level(frag - vec2(0., e))) / (2. * e);
  float rimK = exp(-pow((f - th) / (w * 2.2), 2.)) * smoothstep(.12, .3, f);
  vec2 bend = -g * R.y * .9 * REFR * (.35 + rimK);
  float m = smoothstep(th - w, th + w, f);

  // outside, the footage as itself, a little bent where the liquid rises
  vec3 real = vid(frag + bend * (1. - m) * .6, 0.);
  // inside, the characters, bent at the rim; at the very edge a swirl of both
  vec3 type = typeAt(frag + bend * m);
  vec3 col = mix(real, type, m);
  vec3 smear = vid(frag + bend * 2.2 + vec2(snoise(frag / R.y * 9. + T * .4), snoise(frag / R.y * 9. - T * .4)) * R.y * .01, 0.);
  col = mix(col, smear, rimK * .5 * REFR);
  // light on the rim, as on a meniscus
  vec3 n = normalize(vec3(-g * R.y * .6, 1.));
  float spec = pow(max(dot(n, normalize(vec3(-.45, .6, .66))), 0.), 40.);
  col += GLOSS * (spec * .55 + rimK * .08) * vec3(1.);
  col -= GLOSS * .08 * exp(-pow((f - (th - w * 1.6)) / (w * 1.2), 2.)) * (1. - m);
  o = vec4(col, 1.);
}`;

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y";
  host.append(canvas);
  const video = document.createElement("video");
  Object.assign(video, { muted: true, loop: true, playsInline: true, preload: "auto" });
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.style.display = "none";
  host.append(video);

  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) return { update() {}, action() {}, destroy: () => (canvas.remove(), video.remove()) };
  const hasF = gl.getExtension("EXT_color_buffer_float");

  let ok = true;
  const shaders = [];
  function prog(fs, names) {
    const sh = (t, src) => {
      const s = gl.createShader(t);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); ok = false; }
      shaders.push(s);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "p");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); ok = false; }
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }
  const P = prog(FRAG, ["R", "T", "VID", "VSZ", "ATL", "NG", "NR", "GAMMA", "EDGES", "CELL", "CONTRAST", "PAPER", "COLOR", "BG", "INK", "LIQ", "WOB", "SOFT", "REFR", "GLOSS"]);
  const S = prog(SIM, ["PREV", "RES", "T", "DECAY", "FLOW", "ASP", "SPL", "NS"]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const vtex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, vtex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([40, 44, 36, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const atex = gl.createTexture();
  let hasVideo = false;

  // the liquid lives at half resolution, in two textures it passes between
  let liq = null;
  const dropLiquid = () => {
    if (!liq) return;
    for (const x of [liq.a, liq.b]) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); }
    liq = null;
  };
  function liquidTargets(w, h) {
    if (liq && liq.w === w && liq.h === h) return;
    dropLiquid();
    const mk = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, hasF ? gl.R16F : gl.RGBA8, w, h, 0, hasF ? gl.RED : gl.RGBA, hasF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { t, f };
    };
    liq = { w, h, a: mk(), b: mk() };
    seeded = false;
  }

  // the glyphs: the ramp, then the four edge strokes, side by side in one strip
  let atlasKey = "", ng = 10, nr = 10, fontReady = false;
  function buildAtlas(px) {
    const chars = [...RAMPS[v["characters.ramp"]], "-", "/", "|", "\\"], key = v["characters.ramp"] + px + fontReady;
    if (key === atlasKey) return;
    atlasKey = key;
    ng = chars.length;
    nr = ng - 4;
    const gh = Math.max(8, Math.round(px * 2)), gw = Math.round(gh * 0.6);
    const c = document.createElement("canvas");
    c.width = gw * ng;
    c.height = gh;
    const x = c.getContext("2d");
    x.fillStyle = "#000";
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#fff";
    x.font = `500 ${Math.round(gh * 0.82)}px ${MONO}`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    chars.forEach((ch, i) => x.fillText(ch, gw * i + gw / 2, gh * 0.54));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  const face = new FontFace(FAMILY, `url(${FONT_URL})`, { weight: "500" });
  face.load().then((f) => {
    document.fonts.add(f);
    fontReady = true;
    if (!raf) draw(0);
  }).catch(() => {});

  // the footage
  video.src = VIDEO_URL;
  const onData = () => {
    hasVideo = true;
    if (running()) video.play().catch(() => {});
    else if (!raf) draw(0);
  };
  video.addEventListener("loadeddata", onData);
  video.addEventListener("seeked", onData);

  // the pour: the cursor leaves drops along its path, more when it moves; left alone, a drop wanders by itself
  const ptr = { x: 0.5, y: 0.5, in: false, px: null, py: null, idle: 99 };
  const SPL = new Float32Array(24 * 4);
  let wanderT = 0, wprev = null, burst = null, seeded = false;
  function pour(dt, W, H) {
    let n = 0;
    const add = (x, y, amt, r) => {
      if (n >= 24) return;
      SPL.set([x / W, 1 - y / H, amt, r / H], n * 4);
      n++;
    };
    const R = v["liquid.radius"];
    if (burst) {
      for (const [x, y, a, r] of burst) add(x * W, y * H, a, r * R);
      burst = null;
    }
    if (reduced) {
      // a still pool in the middle, poured once
      if (!seeded) { add(W * 0.5, H * 0.5, 0.8, R * 2.2); add(W * 0.38, H * 0.56, 0.6, R * 1.4); add(W * 0.62, H * 0.44, 0.6, R * 1.5); seeded = true; }
      return n;
    }
    ptr.idle += dt;
    if (ptr.in) {
      if (ptr.px === null) { ptr.px = ptr.x; ptr.py = ptr.y; }
      const dx = ptr.x - ptr.px, dy = ptr.y - ptr.py, d = Math.hypot(dx, dy), steps = Math.min(16, Math.ceil(d / (R * 0.3)));
      for (let i = 1; i <= steps; i++) add(ptr.px + (dx * i) / steps, ptr.py + (dy * i) / steps, 0.22 * POUR, R * (0.8 + Math.min(1, d / 200) * 0.4));
      add(ptr.x, ptr.y, 0.05 * POUR, R * 0.9); // a resting cursor keeps a small pool
      ptr.px = ptr.x;
      ptr.py = ptr.y;
    }
    if (!ptr.in || ptr.idle > 2.5) {
      wanderT += dt * WANDER_SPEED;
      const x = W * (0.5 + 0.3 * Math.sin(wanderT * 1.3) + 0.06 * Math.sin(wanderT * 3.1)), y = H * (0.5 + 0.22 * Math.sin(wanderT * 2.1 + 0.7) + 0.05 * Math.cos(wanderT * 4.3));
      if (wprev) {
        const dx = x - wprev[0], dy = y - wprev[1], d = Math.hypot(dx, dy), steps = Math.min(8, Math.ceil(d / (R * 0.3)) || 1);
        for (let i = 1; i <= steps; i++) add(wprev[0] + (dx * i) / steps, wprev[1] + (dy * i) / steps, 0.16, R * 1.05);
      } else add(x, y, 0.5, R * 1.2); // the first drop lands with a little more, so it opens with a pool
      wprev = [x, y];
    } else wprev = null;
    return n;
  }
  const toLocal = (e) => {
    const b = host.getBoundingClientRect();
    ptr.x = e.clientX - b.left;
    ptr.y = e.clientY - b.top;
  };
  const onMove = (e) => {
    toLocal(e);
    ptr.in = true;
    ptr.idle = 0;
  };
  const onLeave = () => {
    ptr.in = false;
    ptr.px = ptr.py = null;
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerdown", onMove);
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("pointercancel", onLeave);

  let raf = 0, last = 0, t = 0, onScreen = true, tabVisible = !document.hidden;
  function draw(dt) {
    if (!ok) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = host.getBoundingClientRect(), W = Math.max(2, r.width), H = Math.max(2, r.height);
    const w = Math.max(2, Math.floor(W * dpr)), h = Math.max(2, Math.floor(H * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    liquidTargets(Math.max(2, Math.round(W / 2)), Math.max(2, Math.round(H / 2)));
    const cellH = v["characters.cell"] * dpr, cellW = cellH * 0.6;
    buildAtlas(cellH);

    // pour, then drain (a still frame neither drains nor drifts)
    const ns = pour(dt, W, H);
    if (!reduced || ns) {
      gl.useProgram(S.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, liq.b.f);
      gl.viewport(0, 0, liq.w, liq.h);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, liq.a.t);
      gl.uniform1i(S.u.PREV, 2);
      gl.uniform2f(S.u.RES, liq.w, liq.h);
      gl.uniform1f(S.u.T, t);
      gl.uniform1f(S.u.ASP, W / H);
      gl.uniform1f(S.u.DECAY, reduced ? 1 : Math.exp((-dt / Math.max(0.2, v["liquid.linger"])) * 1.6));
      gl.uniform1f(S.u.FLOW, reduced ? 0 : FLOW);
      gl.uniform4fv(S.u.SPL, SPL);
      gl.uniform1i(S.u.NS, ns);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      [liq.a, liq.b] = [liq.b, liq.a];
    }

    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, vtex);
    if (hasVideo && video.readyState >= 2) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, liq.a.t);
    const bg = rgb(v["colour.ground"]), paper = lum(bg) > 0.5 ? 1 : 0;
    gl.uniform1i(P.u.VID, 0);
    gl.uniform1i(P.u.ATL, 1);
    gl.uniform1i(P.u.LIQ, 2);
    gl.uniform2f(P.u.R, w, h);
    gl.uniform1f(P.u.T, t);
    gl.uniform2f(P.u.VSZ, video.videoWidth || 16, video.videoHeight || 9);
    gl.uniform1f(P.u.NG, ng);
    gl.uniform1f(P.u.NR, nr);
    gl.uniform1f(P.u.GAMMA, GAMMA);
    gl.uniform1f(P.u.EDGES, v["characters.edges"]);
    gl.uniform2f(P.u.CELL, cellW, cellH);
    gl.uniform1f(P.u.CONTRAST, CONTRAST);
    gl.uniform1f(P.u.PAPER, paper);
    gl.uniform1i(P.u.COLOR, v["characters.tint"] === "Footage" ? 1 : 0);
    gl.uniform3fv(P.u.BG, bg);
    gl.uniform3fv(P.u.INK, rgb(v["colour.ink"]));
    gl.uniform1f(P.u.WOB, v["liquid.wobble"]);
    gl.uniform1f(P.u.SOFT, SOFT);
    gl.uniform1f(P.u.REFR, v["liquid.refraction"]);
    gl.uniform1f(P.u.GLOSS, GLOSS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    t += dt;
    draw(dt);
    if (running()) raf = requestAnimationFrame(frame);
  }
  const running = () => !reduced && onScreen && tabVisible;
  function loop() {
    if (!running()) return;
    if (hasVideo) video.play().catch(() => {});
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    video.pause();
  }
  const ro = new ResizeObserver(() => !raf && draw(0));
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
  draw(0);
  loop();

  return {
    update(values) {
      Object.assign(v, values);
      if (!raf) draw(0);
    },
    action(name) {
      if (name !== "pour") return;
      // a big splash somewhere near the middle, with a few drops round it
      const cx = 0.3 + Math.random() * 0.4, cy = 0.3 + Math.random() * 0.4;
      burst = [[cx, cy, 0.9, 2.4]];
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, d = 0.08 + Math.random() * 0.12;
        burst.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.5, 0.6 + Math.random() * 0.6]);
      }
      if (reduced) {
        // a still frame keeps what it is given
        draw(0);
      }
    },
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      video.removeEventListener("loadeddata", onData);
      video.removeEventListener("seeked", onData);
      video.removeAttribute("src");
      video.load();
      dropLiquid();
      gl.deleteTexture(vtex);
      gl.deleteTexture(atex);
      gl.deleteBuffer(buf);
      for (const s of shaders) gl.deleteShader(s);
      gl.deleteProgram(P.p);
      gl.deleteProgram(S.p);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
      video.remove();
    },
  };
}
