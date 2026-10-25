/* Liquid glass: a soft lens of glass that drifts over the work and bends it.

   Two passes. The backdrop (a clip from the studio, or the Kinetic mark
   tiled, bold stripes or a slow gradient) is drawn into a texture with
   mipmaps; the glass pass then looks through a rounded, morphing blob,
   refracting that texture with real Snell bending off a bevelled profile,
   splitting the channels at the rim, frosting it with the mip chain and
   lighting the edge with a fresnel rim and a specular glint. */

export const params = {
  backdrop: { type: "select", options: ["Clip", "Mark", "Stripes", "Gradient"] },
  lens: {
    size: [0.3, 0.12, 0.55, 0.01],
    morphSpeed: [0.6, 0, 2, 0.01],
  },
  optics: {
    refraction: [1, 0, 2.5, 0.01],
    aberration: [0.4, 0, 1, 0.01],
    blur: [0.18, 0, 1, 0.01],
  },
  light: {
    rim: [1, 0, 2, 0.01],
    tint: "#d9e2d2",
    tintAmount: [0.18, 0, 1, 0.01],
  },
};

// The site's root, from <link rel="site-root">, so this also works framed from a folder
const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const CLIP = new URL("media/play/glass-source.mp4", ROOT).href;
const DPR_CAP = 2;
const MAX_PIXELS = 4.2e6;
const MODES = { Clip: 0, Mark: 1, Stripes: 2, Gradient: 3 };

// The Kinetic mark: a bar and four arcs, 387 × 368.
const MARK =
  "M328.41 0H387C321.357 36.0286 277.006 104.957 277.006 184C277.006 263.043 321.357 331.971 387 368H328.41C276.205 323.281 243.2 257.447 243.2 184C243.2 110.553 276.205 44.7195 328.41 0ZM236.937 0H276.319C237.67 51.4698 214.826 115.117 214.826 184C214.826 252.883 237.67 316.53 276.319 368H236.937C202.414 314.88 182.4 251.745 182.4 184C182.4 116.255 202.414 53.1203 236.937 0ZM154.647 0H189.359C166.555 56.9622 154.026 119.037 154.026 184C154.026 248.963 166.555 311.038 189.359 368H154.647C133.271 310.649 121.6 248.67 121.6 184C121.6 119.33 133.271 57.3504 154.647 0ZM78.023 0H111.038C99.3489 59.5565 93.2263 121.073 93.2263 184C93.2263 246.927 99.3489 308.443 111.038 368H78.023C66.7138 308.371 60.7997 246.867 60.7997 184C60.7997 121.133 66.7138 59.6286 78.023 0ZM3.26005e-05 0H32.4266L32.4266 368H0L3.26005e-05 0Z";

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const BACK = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uTexSize, uDrift;
uniform float uTime, uCell;
uniform int uMode;
out vec4 o;

float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

vec3 stripes(vec2 px) {
  float a = -0.2;
  vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * (px - 0.5 * uRes) / (uCell * 0.42);
  q.x += uTime * 0.12 + 0.35 * sin(q.y * 0.18 + uTime * 0.2);
  float i = floor(q.x), f = fract(q.x);
  float w = mix(0.3, 0.72, hash(i + 7.0));
  float aa = fwidth(q.x) * 0.75;
  float m = smoothstep(0.0, aa, f) * smoothstep(w + aa, w, f);
  float h = hash(i);
  vec3 ink = h < 0.1 ? vec3(0.659, 1.0, 0.4) : h < 0.32 ? vec3(0.098) : vec3(0.851, 0.886, 0.824);
  return mix(vec3(0.051), ink, m);
}

vec3 gradient(vec2 px) {
  vec2 q = (px - 0.5 * uRes) / min(uRes.x, uRes.y);
  float t = uTime * 0.07;
  vec3 c = vec3(0.045, 0.05, 0.045);
  vec2 a = vec2(0.42 * sin(t * 1.1), 0.22 * cos(t * 0.8));
  vec2 b = vec2(0.5 * cos(t * 0.7 + 2.0), 0.25 * sin(t * 1.3 + 1.0));
  vec2 d = vec2(0.3 * sin(t * 0.9 + 4.0), 0.3 * cos(t * 0.6 + 3.0));
  c += vec3(0.851, 0.886, 0.824) * 0.85 * exp(-dot(q - a, q - a) / 0.09);
  c += vec3(0.659, 1.0, 0.4) * 0.55 * exp(-dot(q - b, q - b) / 0.035);
  c += vec3(0.35, 0.42, 0.33) * 0.6 * exp(-dot(q - d, q - d) / 0.12);
  // A fine grid of dots so the bending reads.
  vec2 g = px / (uCell * 0.16);
  vec2 f = fract(g) - 0.5;
  float r = length(f), aa = fwidth(g.x) * 0.8;
  c = mix(c, c * 0.35 + vec3(0.85, 0.89, 0.82) * 0.5, smoothstep(0.14 + aa, 0.14, r) * 0.6);
  return c;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec3 c;
  if (uMode == 0) {
    float s = max(uRes.x / uTexSize.x, uRes.y / uTexSize.y);
    c = texture(uTex, (px - 0.5 * uRes) / (s * uTexSize) + 0.5).rgb;
  } else if (uMode == 1) {
    c = texture(uTex, px / (uCell * 4.0) + uDrift).rgb;
  } else if (uMode == 2) {
    c = stripes(px);
  } else {
    c = gradient(px);
  }
  o = vec4(c, 1.0);
}`;

const GLASS = `#version 300 es
precision highp float;
uniform sampler2D uBack;
uniform vec2 uRes, uCenter, uStretch;
uniform float uR, uMorph, uRefract, uAberr, uBlur, uRim, uTintAmt, uMaxLod, uPx;
uniform vec3 uTint;
out vec4 o;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// The lens in its own units (1 = the size dial): three soft circles that
// orbit and melt into each other, stretched a little along the motion.
float shape(vec2 p) {
  float sp = length(uStretch);
  if (sp > 1e-4) {
    vec2 d = uStretch / sp;
    vec2 q = vec2(dot(p, d), dot(p, vec2(-d.y, d.x)));
    q.x /= 1.0 + sp;
    q.y *= 1.0 + sp * 0.45;
    p = q;
  }
  float t = uMorph;
  vec2 a = vec2(cos(t * 0.71), sin(t * 0.93)) * 0.16;
  vec2 b = vec2(cos(t * 0.53 + 2.1), sin(t * 0.61 + 1.3)) * 0.42;
  vec2 c = vec2(cos(t * 0.43 + 4.0), sin(t * 0.37 + 3.1)) * 0.4;
  float d = length(p - a) - 0.62;
  d = smin(d, length(p - b) - 0.42, 0.42);
  d = smin(d, length(p - c) - 0.36, 0.42);
  return d;
}

vec3 frost(vec2 uv, float lod) {
  vec2 r = exp2(lod) * 0.85 / uRes;
  vec3 c = textureLod(uBack, uv + vec2( r.x,  0.3 * r.y), lod).rgb;
  c += textureLod(uBack, uv + vec2(-0.3 * r.x,  r.y), lod).rgb;
  c += textureLod(uBack, uv + vec2(-r.x, -0.3 * r.y), lod).rgb;
  c += textureLod(uBack, uv + vec2( 0.3 * r.x, -r.y), lod).rgb;
  return c * 0.25;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  vec2 p = (frag - uCenter) / uR;
  float d = shape(p);
  float dpx = d * uR;

  vec3 col = textureLod(uBack, uv, 0.0).rgb;

  // A soft shadow under the glass, and a little light gathered beside it.
  float ds = shape(p + vec2(-0.04, 0.12));
  col *= 1.0 - 0.38 * (1.0 - smoothstep(-0.2, 0.5, ds));
  float dc = shape(p + vec2(-0.1, 0.2));
  col += uTint * 0.05 * uRim * exp(-max(dc, 0.0) * 9.0) * step(0.0, d);

  if (dpx < 2.0) {
    vec2 e = vec2(0.0025, 0.0);
    vec2 g = vec2(shape(p + e.xy) - shape(p - e.xy), shape(p + e.yx) - shape(p - e.yx));
    g /= max(length(g), 1e-5);                      // outward
    float s = max(-d, 0.0);
    float k = clamp(s / 0.36, 0.0, 1.0);            // 0 at the rim, 1 on the plateau
    float u = 1.0 - k;
    float theta = 1.15 * u * u * (3.0 - 2.0 * u);
    vec2 tilt = g * sin(theta) + p * 0.07 * k;       // a gentle dome in the middle
    vec3 n = normalize(vec3(tilt, cos(theta)));

    // Snell through the top surface down onto the backdrop.
    vec3 T = refract(vec3(0.0, 0.0, -1.0), n, 1.0 / 1.5);
    vec2 dpx2 = T.xy / max(-T.z, 0.25) * uRefract * uR * 0.3;
    vec2 disp = dpx2 / uRes;
    // The channels part a few pixels at most, more where the glass is steep.
    vec2 sep = dpx2 * uAberr * 0.16;
    float sl = length(sep), cap = uR * 0.035 * uAberr + 0.5;
    sep = (sl > cap ? sep * (cap / sl) : sep) / uRes;

    float lod = min(uBlur * 5.5 + u * u * 1.2 * uBlur, uMaxLod);
    vec3 refr;
    refr.r = frost(uv + disp - sep, lod).r;
    refr.g = frost(uv + disp, lod).g;
    refr.b = frost(uv + disp + sep, lod).b;

    // Glass body: a touch of tint, a darker inner bevel on the shade side.
    vec2 Ld = normalize(vec2(-0.62, 0.78));
    float facing = dot(g, Ld) * 0.5 + 0.5;
    vec3 glass = mix(refr, refr * uTint * 1.08 + uTint * 0.035, uTintAmt);
    glass *= 1.0 - 0.18 * u * u * (1.0 - facing);
    glass *= 1.04;

    vec3 L = normalize(vec3(Ld * 0.75, 0.62));
    float fres = pow(1.0 - n.z, 2.5);
    float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 70.0);
    // The rim line and the bright band inside it, sized in CSS pixels.
    float edge = exp(-pow(s * uR / (1.4 * uPx), 2.0));
    float inner = exp(-pow((s * uR - 3.5 * uPx) / (2.2 * uPx), 2.0));
    float light = edge * (0.25 + 1.1 * pow(facing, 2.0) + 0.55 * pow(1.0 - facing, 5.0))
                + inner * 0.22 * pow(facing, 3.0)
                + fres * (0.12 + 0.3 * pow(facing, 2.0))
                + spec * 0.85;
    glass += mix(vec3(1.0), uTint, 0.25) * light * uRim;

    float alpha = clamp(0.5 - dpx, 0.0, 1.0);
    col = mix(col, glass, alpha);
  }

  // A hair of dither against banding.
  float n0 = fract(sin(dot(frag, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(col + (n0 - 0.5) / 255.0, 1.0);
}`;

/* ---------- helpers ---------- */

function quiet(host, text) {
  const p = document.createElement("p");
  p.textContent = text;
  p.style.cssText =
    "position:absolute;inset:0;margin:0;display:grid;place-items:center;padding:2rem;text-align:center;" +
    "color:rgba(217,226,210,.5);font:13px/1.4 var(--primary-family, sans-serif);";
  host.append(p);
  return { update() {}, action() {}, destroy() { p.remove(); } };
}

function program(gl, vs, fs) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      console.warn("[liquid-glass]", gl.getShaderInfoLog(s));
    }
    return s;
  };
  const p = gl.createProgram();
  const a = make(gl.VERTEX_SHADER, vs);
  const b = make(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, a);
  gl.attachShader(p, b);
  gl.linkProgram(p);
  gl.deleteShader(a);
  gl.deleteShader(b);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

const hex = (h) => {
  const s = h.replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(f, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

function markTile(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#0d0d0d";
  g.fillRect(0, 0, size, size);
  const mark = new Path2D(MARK);
  const cell = size / 4;
  const s = (cell * 0.7) / 368;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * cell + (row % 2) * cell * 0.5 + (cell - 387 * s) / 2;
      const y = row * cell + (cell - 368 * s) / 2;
      const flip = row % 2 === 1;
      g.fillStyle = row === 2 && col === 1 ? "#a8ff66" : (row + col) % 3 === 0 ? "#3a4237" : "#d9e2d2";
      for (const dx of [-size, 0, size]) {
        g.save();
        g.translate(x + dx + (flip ? 387 * s : 0), y);
        g.scale(flip ? -s : s, s);
        g.fill(mark);
        g.restore();
      }
    }
  }
  return c;
}

/* ---------- mount ---------- */

export function mount(host, values, ctx = {}) {
  const reduced = Boolean(ctx.reducedMotion);
  let v = { ...values };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;";
  host.append(canvas);

  let gl = null;
  try {
    gl = canvas.getContext("webgl2", {
      antialias: false, alpha: false, depth: false, stencil: false,
      premultipliedAlpha: false, powerPreference: "high-performance",
    });
  } catch {
    gl = null;
  }
  if (!gl) {
    canvas.remove();
    return quiet(host, "This piece needs WebGL 2.");
  }

  let res = null; // GL resources
  let W = 1, H = 1, cssW = 1, cssH = 1;
  let quality = 1;
  let tile = null;

  // The clip, if the studio has cut one.
  let video = null;
  let clipReady = false;
  let clipFresh = false;
  const probe = new AbortController();

  function build() {
    const back = program(gl, VERT, BACK);
    const glass = program(gl, VERT, GLASS);
    if (!back || !glass) return null;
    const vao = gl.createVertexArray();
    tile = tile ?? markTile(1600);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const tileTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tileTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tile);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    const clipTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, clipTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([13, 13, 13, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const backTex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    clipFresh = clipReady;
    return { back, glass, vao, tileTex, clipTex, backTex, fbo, w: 0, h: 0, lods: 0 };
  }

  function sizeTargets() {
    if (!res || (res.w === W && res.h === H)) return;
    res.w = W;
    res.h = H;
    res.lods = Math.floor(Math.log2(Math.max(W, H)));
    gl.bindTexture(gl.TEXTURE_2D, res.backTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, res.backTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function resize() {
    const r = host.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    let scale = Math.min(window.devicePixelRatio || 1, DPR_CAP) * quality;
    const px = cssW * cssH * scale * scale;
    if (px > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / px);
    W = Math.max(1, Math.round(cssW * scale));
    H = Math.max(1, Math.round(cssH * scale));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    sizeTargets();
  }

  // The lens radius in pixels: by area, so a phone gets a proper lens too.
  const radius = (w, h) => Math.min(v["lens.size"] * 0.85 * Math.sqrt(w * h), 0.62 * Math.min(w, h));

  /* ----- motion state ----- */
  let time = 0;
  let morph = 2.2;
  const pos = { x: 0.54, y: 0.49 };
  const stretch = { x: 0, y: 0 };
  const pointer = { x: 0.5, y: 0.5, active: false };

  // Wander the stage, keeping the lens mostly in frame.
  function autoPath(t) {
    const R = radius(cssW, cssH);
    const ax = Math.max(0.04, 0.5 - (R * 0.95) / cssW);
    const ay = Math.max(0.04, 0.5 - (R * 0.95) / cssH);
    return {
      x: 0.5 + ax * (0.78 * Math.sin(t * 0.11 + 0.15) + 0.22 * Math.sin(t * 0.29)),
      y: 0.5 + ay * (0.75 * Math.sin(t * 0.083 - 0.1) + 0.25 * Math.sin(t * 0.23)),
    };
  }

  function step(dt) {
    time += dt;
    morph += dt * v["lens.morphSpeed"];
    const target = pointer.active ? pointer : autoPath(time);
    const k = 1 - Math.exp(-dt * (pointer.active ? 2.4 : 0.9));
    const px = pos.x, py = pos.y;
    pos.x += (target.x - pos.x) * k;
    pos.y += (target.y - pos.y) * k;
    const R = radius(cssW, cssH);
    const vx = ((pos.x - px) * cssW) / Math.max(dt, 1e-3) / R;
    const vy = ((py - pos.y) * cssH) / Math.max(dt, 1e-3) / R; // GL y is up
    const sp = Math.hypot(vx, vy);
    const amt = Math.min(0.32, sp * 0.12);
    const tx = sp > 1e-4 ? (vx / sp) * amt : 0;
    const ty = sp > 1e-4 ? (vy / sp) * amt : 0;
    const ks = 1 - Math.exp(-dt * 5);
    stretch.x += (tx - stretch.x) * ks;
    stretch.y += (ty - stretch.y) * ks;
  }

  function draw() {
    if (!res || gl.isContextLost()) return;
    sizeTargets();
    let mode = MODES[v.backdrop] ?? 1;
    if (mode === 0 && !clipReady) mode = 1;

    if (mode === 0 && clipFresh && video) {
      gl.bindTexture(gl.TEXTURE_2D, res.clipTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      clipFresh = false;
    }

    const cell = 0.34 * Math.sqrt(W * H);
    gl.bindVertexArray(res.vao);

    // Pass 1: the backdrop.
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo);
    gl.viewport(0, 0, W, H);
    const b = res.back;
    gl.useProgram(b.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, mode === 0 ? res.clipTex : res.tileTex);
    gl.uniform1i(b.u.uTex, 0);
    gl.uniform2f(b.u.uRes, W, H);
    gl.uniform2f(b.u.uTexSize, video?.videoWidth || 16, video?.videoHeight || 9);
    gl.uniform2f(b.u.uDrift, time * 0.008, time * 0.0035);
    gl.uniform1f(b.u.uTime, time);
    gl.uniform1f(b.u.uCell, cell);
    gl.uniform1i(b.u.uMode, mode);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindTexture(gl.TEXTURE_2D, res.backTex);
    gl.generateMipmap(gl.TEXTURE_2D);

    // Pass 2: the glass.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    const g = res.glass;
    gl.useProgram(g.p);
    gl.uniform1i(g.u.uBack, 0);
    gl.uniform2f(g.u.uRes, W, H);
    gl.uniform2f(g.u.uCenter, pos.x * W, (1 - pos.y) * H);
    gl.uniform2f(g.u.uStretch, stretch.x, stretch.y);
    gl.uniform1f(g.u.uR, radius(W, H));
    gl.uniform1f(g.u.uMorph, morph);
    gl.uniform1f(g.u.uRefract, v["optics.refraction"]);
    gl.uniform1f(g.u.uAberr, v["optics.aberration"]);
    gl.uniform1f(g.u.uBlur, v["optics.blur"]);
    gl.uniform1f(g.u.uMaxLod, Math.max(0, res.lods - 1));
    gl.uniform1f(g.u.uPx, W / cssW);
    gl.uniform1f(g.u.uRim, v["light.rim"]);
    gl.uniform3fv(g.u.uTint, hex(v["light.tint"]));
    gl.uniform1f(g.u.uTintAmt, v["light.tintAmount"]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ----- loop ----- */
  let raf = 0;
  let last = 0;
  let visible = !document.hidden;
  let onscreen = true;
  let slow = 0;
  let fast = 0;
  let pending = 0;

  const live = () => !reduced && visible && onscreen && res;

  function govern(ms) {
    if (ms > 250) return;
    if (ms > 26) slow++;
    else slow = Math.max(0, slow - 1);
    fast = ms < 12 ? fast + 1 : 0;
    if (slow > 24 && quality > 0.5) {
      quality = Math.max(0.5, quality * 0.82);
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
      if (video && v.backdrop === "Clip") video.play().catch(() => {});
      else video?.pause();
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      video?.pause();
    }
  }

  function redraw() {
    if (raf || pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      draw();
    });
  }

  function settle() {
    // The still that reduced motion gets: the lens resting just off centre.
    time = 9;
    morph = 2.2;
    pos.x = 0.56;
    pos.y = 0.48;
    stretch.x = stretch.y = 0;
  }

  /* ----- wiring ----- */
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
    pointer.x = (e.clientX - r.left) / r.width;
    pointer.y = (e.clientY - r.top) / r.height;
    pointer.active = true;
  };
  const onLeave = () => {
    pointer.active = false;
  };
  if (!reduced) {
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerdown", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointercancel", onLeave);
  }

  const onLost = (e) => {
    e.preventDefault();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    res = null;
  };
  const onRestored = () => {
    res = build();
    resize();
    if (reduced) redraw();
    sync();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  res = build();
  if (!res) {
    canvas.remove();
    return quiet(host, "This piece could not start its shaders.");
  }
  resize();
  if (reduced) {
    settle();
    redraw();
  } else {
    sync();
  }

  // Look for the clip without making a fuss if it is not there.
  fetch(CLIP, { method: "HEAD", signal: probe.signal })
    .then((r) => {
      const type = r.headers.get("content-type") || "";
      if (!r.ok || !/video|mp4|octet-stream/i.test(type)) return;
      video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      const fresh = () => {
        clipFresh = true;
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(fresh);
      };
      video.addEventListener("loadeddata", () => {
        clipReady = true;
        clipFresh = true;
        if (reduced) {
          video.currentTime = Math.min(1, (video.duration || 2) / 2);
          video.addEventListener("seeked", () => { clipFresh = true; redraw(); }, { once: true });
        }
        redraw();
      }, { once: true });
      video.addEventListener("error", () => { clipReady = false; }, { once: true });
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(fresh);
      else video.addEventListener("timeupdate", () => (clipFresh = true));
      video.src = CLIP;
      if (!reduced) sync();
    })
    .catch(() => {});

  return {
    update(next, path) {
      v = { ...next };
      if (path === "backdrop" || path === null) sync();
      if (!raf) redraw();
    },
    action() {},
    destroy() {
      probe.abort();
      if (raf) cancelAnimationFrame(raf);
      if (pending) cancelAnimationFrame(pending);
      raf = pending = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video = null;
      }
      if (res && !gl.isContextLost()) {
        gl.deleteProgram(res.back.p);
        gl.deleteProgram(res.glass.p);
        gl.deleteVertexArray(res.vao);
        gl.deleteTexture(res.tileTex);
        gl.deleteTexture(res.clipTex);
        gl.deleteTexture(res.backTex);
        gl.deleteFramebuffer(res.fbo);
      }
      res = null;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.width = canvas.height = 1;
      canvas.remove();
    },
  };
}
