/* Cloud type: letters made of weather.

   The word is set in the studio's display face on a hidden 2D canvas, three
   times over (sharp, softened, and widely blurred, one per colour channel),
   and that becomes a coverage map for a cloud field. Fractal noise drifts
   through it on the wind; where the letters are, the sky is allowed to fill
   in, so the word billows into being, frays downwind, thins out and forms
   again. Each point is lit by marching a few steps toward the sun, which is
   what gives the clouds their lit tops and grey undersides. */

export const params = {
  text: "KINETIC",
  cloud: {
    density: [1, 0.2, 1.6, 0.01],
    softness: [0.35, 0.05, 1, 0.01],
    dissolve: [0.55, 0, 1, 0.01],
  },
  wind: {
    speed: [0.6, 0, 2, 0.01],
    direction: [12, 0, 360, 1],
  },
  colour: {
    skyTop: "#0d0d0d",
    skyBottom: "#26301f",
    cloud: "#d9e2d2",
  },
};

const DPR_CAP = 2;
const MAX_PIXELS = 4.2e6;
const CYCLE = 24; // seconds for the word to dissolve and form again
const TRACK = 0.06; // extra letter spacing, in ems, so billows do not bridge letters

// The studio face, bundled with the site. Found by pattern so a renamed or
// licensed cut does not break this file.
const FACES = import.meta.glob("../assets/fonts/Panell*.woff2", { query: "?url", import: "default", eager: true });
const FALLBACK_STACK = '"Arial Narrow", "Helvetica Neue Condensed", Impact, sans-serif';

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const CLOUD = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform vec2 uRes, uDrift, uWindDir;
uniform float uTime, uDensity, uSoft, uForm, uBlow, uLetter;
uniform vec3 uSkyTop, uSkyBottom, uCloud;
out vec4 o;

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x),
                 mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x),
                 mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
float fbm(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    n += a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.56;
  }
  return s / n;
}

float aspect;
vec2 toUV;

// Cloud density at uv. Distances are in letter heights (uLetter is the cap
// height as a share of the stage), so a phone gets the same billows as a
// wide screen. The coverage map (the word) decides where the noise may
// become cloud; the noise decides the billows at its edges. The light pass
// reads a softer version so the shading has no hard echoes of the outline.
float density(vec2 uv, vec2 warp, int oct, float lightPass) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  float n = fbm(vec3(p / uLetter * 2.9 - uDrift, uTime * 0.06), oct);

  vec2 muv = uv + warp - uWindDir * toUV * (uBlow * 0.17 * uLetter);
  vec3 m = texture(uMask, muv).rgb;
  float trail = texture(uMask, muv - uWindDir * toUV * ((0.11 + 0.22 * uBlow) * uLetter)).b;

  float e = uSoft * 0.14 + lightPass * 0.16;
  float shape = mix(m.g * 0.7 + m.b * 0.35, m.g * 0.35 + m.b * 0.8, lightPass);
  float letters = smoothstep(0.42 - e, 0.58 + e, shape + (n - 0.5) * (1.2 + 0.9 * uBlow)) * uForm;
  letters *= smoothstep(0.02, 0.12, m.b + trail * 0.5);
  float wisps = smoothstep(0.4 - e, 0.95 + e, trail + (n - 0.5) * 1.5) * (0.25 + 0.6 * uBlow);

  // Loose weather across the whole sky, kept clear of the word.
  vec2 wd = uDrift * (0.92 * uLetter);
  float w = fbm(vec3(p * 2.2 - wd, uTime * 0.02 + 4.0), 3);
  // The light pass skips the weather's fine detail: it only needs the mass.
  float wn = lightPass > 0.5 ? 0.5 : fbm(vec3(p * 10.0 - wd * 4.5, uTime * 0.05 + 9.0), 3);
  float weather = smoothstep(0.6, 0.84, w + (wn - 0.5) * 0.45) * smoothstep(0.46, 0.6, w);
  weather *= 0.38 * (1.0 - 0.85 * m.b);

  float c = max(max(letters, wisps), weather);
  // Lumps inside the cloud so the light has something to model.
  return c * (0.38 + 0.8 * smoothstep(0.32, 0.72, n));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  aspect = uRes.x / uRes.y;
  toUV = vec2(1.0 / aspect, 1.0);

  // Wisps: the lookup into the word is pushed around by the wind.
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec3 wq = vec3(p / uLetter * 1.1 - uDrift * 0.45, uTime * 0.04);
  vec2 warp = (vec2(fbm(wq, 3), fbm(wq + vec3(5.2, 1.3, 2.7), 3)) - 0.5) * ((0.11 + 0.18 * uBlow) * uLetter) * toUV;
  warp += uWindDir * toUV * ((fbm(wq * 1.7 + 3.0, 2) - 0.4) * 0.09 * uLetter);

  float d = density(uv, warp, 5, 0.0) * uDensity;

  vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 1.0, pow(uv.y, 0.85)));
  sky += uSkyBottom * 0.35 * exp(-pow((uv.y - 0.05) / 0.35, 2.0)) * (1.0 - 0.4 * abs(uv.x - 0.5));

  // A little of the clouds' light hangs in the air around the word.
  sky += uCloud * 0.05 * texture(uMask, uv + warp).b * uForm;

  vec3 col = sky;
  if (d > 0.002) {
    // March toward the sun. Steps grow as they go: the near ones model each
    // billow, the far ones put the undersides in shadow.
    vec2 sun = normalize(vec2(-0.3, 1.0)) * toUV * uLetter;
    float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float acc = 0.0, t = 0.012 * (1.0 + 0.5 * j), dt = 0.016;
    for (int i = 0; i < 5; i++) {
      acc += density(uv + sun * t, warp, 4, 1.0) * dt;
      t += dt;
      dt *= 1.6;
    }
    float light = exp(-acc * 8.6 * uDensity);
    vec3 under = mix(uSkyBottom, uCloud, 0.26) * 0.62;
    vec3 c = mix(under, uCloud * 1.1, pow(light, 0.8));
    // Thin edges glow where they face the light.
    c += uCloud * 0.18 * light * (1.0 - smoothstep(0.0, 0.45, d));
    float alpha = smoothstep(0.0, 0.25 + uSoft * 0.45, d);
    col = mix(sky, c, alpha);
  }
  o = vec4(col, 1.0);
}`;

const FINISH = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform vec2 uRes;
uniform float uSeed;
out vec4 o;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uImage, uv).rgb;
  vec2 v = uv - 0.5;
  c *= 1.0 - 0.28 * dot(v, v);
  c += (hash(gl_FragCoord.xy + uSeed) - 0.5) * 0.035;
  o = vec4(c, 1.0);
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
      console.warn("[cloud-type]", gl.getShaderInfoLog(s));
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
  const s = String(h).replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(f, 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** The family to set the word in: the site's Panell if the page has it,
    else the bundled file loaded here, else a heavy condensed system face. */
async function findFace(signal) {
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
  const site = getComputedStyle(document.documentElement).getPropertyValue("--font-panell").trim();
  for (const family of [site, '"Panell Condensed"']) {
    if (!family) continue;
    try {
      const faces = await document.fonts.load(`500 120px ${family}`, "KINETIC");
      if (faces.length) return { family, face: null };
    } catch {
      /* try the next */
    }
  }
  const url = Object.values(FACES)[0];
  if (url && !signal.aborted && typeof FontFace === "function") {
    try {
      const face = new FontFace("Cloud Type Panell", `url(${url})`, { weight: "500" });
      await face.load();
      if (signal.aborted) return null;
      document.fonts.add(face);
      return { family: `"Cloud Type Panell", ${FALLBACK_STACK}`, face };
    } catch {
      /* fall through */
    }
  }
  return null;
}

/* ---------- mount ---------- */

export function mount(host, values, ctx = {}) {
  const reduced = Boolean(ctx.reducedMotion);
  let v = { ...values };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  host.append(canvas);

  // The word, for anyone who cannot see the canvas.
  const label = document.createElement("span");
  label.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;";
  host.append(label);

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
    label.remove();
    return quiet(host, "This piece needs WebGL 2.");
  }

  let res = null;
  let W = 1, H = 1, FW = 1, FH = 1, cssW = 1, cssH = 1;
  let quality = 1;
  let family = FALLBACK_STACK;
  let fontWeight = "700";
  let ownFace = null;
  const fonts = new AbortController();

  const mask = document.createElement("canvas");
  const mctx = mask.getContext("2d");
  let maskDirty = true;
  let letter = 0.25; // cap height as a share of the stage height

  function build() {
    const cloud = program(gl, VERT, CLOUD);
    const finish = program(gl, VERT, FINISH);
    if (!cloud || !finish) return null;
    const mk = (filter) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    maskDirty = true;
    return {
      cloud, finish,
      vao: gl.createVertexArray(),
      maskTex: mk(gl.LINEAR),
      image: mk(gl.LINEAR),
      fbo: gl.createFramebuffer(),
      w: 0, h: 0,
    };
  }

  function sizeTargets() {
    if (!res || (res.w === FW && res.h === FH)) return;
    res.w = FW;
    res.h = FH;
    gl.bindTexture(gl.TEXTURE_2D, res.image);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, FW, FH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, res.image, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function resize() {
    const r = host.getBoundingClientRect();
    const changed = Math.round(r.width) !== Math.round(cssW) || Math.round(r.height) !== Math.round(cssH);
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    let scale = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const px = cssW * cssH * scale * scale;
    if (px > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / px);
    W = Math.max(1, Math.round(cssW * scale));
    H = Math.max(1, Math.round(cssH * scale));
    // The clouds are soft: render them near CSS resolution and lift them.
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    FW = Math.max(1, Math.min(W, Math.round(Math.max(cssW * 0.72, cssW * dpr * 0.55) * quality)));
    FH = Math.max(1, Math.round((FW * H) / W));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    if (changed) maskDirty = true;
    sizeTargets();
  }

  /* ----- the word ----- */
  function layout(text, w, h) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const ref = 100;
    mctx.font = `${fontWeight} ${ref}px ${family}`;
    if ("letterSpacing" in mctx) mctx.letterSpacing = `${ref * TRACK}px`;
    const metric = (s) => mctx.measureText(s).width;
    const options = [[words.join(" ")]];
    if (words.length > 1 && h > w * 0.9) options.push(words);
    let best = null;
    for (const lines of options) {
      const widest = Math.max(...lines.map(metric));
      const lead = 0.86;
      const size = Math.min((w * 0.86 * ref) / Math.max(widest, 1), (h * 0.6) / (0.72 + (lines.length - 1) * lead));
      if (!best || size > best.size) best = { lines, size, lead };
    }
    return best;
  }

  function drawMask() {
    maskDirty = false;
    if (!res) return;
    const text = String(v.text ?? "");
    label.textContent = text;
    const mw = Math.round(Math.min(2048, Math.max(1024, FW * 1.5)));
    const mh = Math.max(64, Math.round((mw * FH) / FW));
    mask.width = mw;
    mask.height = mh;
    mctx.globalCompositeOperation = "source-over";
    mctx.fillStyle = "#000";
    mctx.fillRect(0, 0, mw, mh);
    const set = layout(text, mw, mh);
    if (set) {
      const { lines, size, lead } = set;
      mctx.font = `${fontWeight} ${size}px ${family}`;
      mctx.textAlign = "center";
      mctx.textBaseline = "alphabetic";
      if ("letterSpacing" in mctx) mctx.letterSpacing = `${(size * TRACK).toFixed(2)}px`;
      const m = mctx.measureText(lines[0]);
      const cap = m.actualBoundingBoxAscent || size * 0.72;
      const block = cap + (lines.length - 1) * size * lead;
      const top = mh / 2 - block / 2 + cap;
      letter = Math.max(0.02, cap / mh);
      const passes = [
        { color: "#ff0000", blur: 0 },
        { color: "#00ff00", blur: size * 0.05 },
        { color: "#0000ff", blur: size * 0.16 },
      ];
      mctx.globalCompositeOperation = "lighter";
      const away = mw * 4;
      for (const pass of passes) {
        lines.forEach((line, i) => {
          const y = top + i * size * lead;
          if (!pass.blur) {
            mctx.shadowBlur = 0;
            mctx.shadowColor = "transparent";
            mctx.fillStyle = pass.color;
            mctx.fillText(line, mw / 2, y);
          } else {
            // Draw it far off the canvas and keep only its blurred shadow.
            mctx.shadowColor = pass.color;
            mctx.shadowBlur = pass.blur;
            mctx.shadowOffsetX = away;
            mctx.fillStyle = "#000";
            mctx.fillText(line, mw / 2 - away, y);
          }
        });
      }
      mctx.shadowBlur = 0;
      mctx.shadowOffsetX = 0;
      mctx.shadowColor = "transparent";
      mctx.globalCompositeOperation = "source-over";
    }
    gl.bindTexture(gl.TEXTURE_2D, res.maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
  }

  /* ----- motion state ----- */
  let time = 0;
  let phase = 0;
  const drift = { x: 0, y: 0 };

  const windDir = () => {
    const a = (v["wind.direction"] * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)];
  };

  function step(dt) {
    time += dt;
    phase += dt / CYCLE;
    const [wx, wy] = windDir();
    const s = v["wind.speed"];
    drift.x += wx * s * dt * 0.35;
    drift.y += wy * s * dt * 0.35;
  }

  function draw() {
    if (!res || gl.isContextLost()) return;
    sizeTargets();
    if (maskDirty) drawMask();
    gl.bindVertexArray(res.vao);

    // Formed (and held a while), then fraying downwind, then formed again.
    const raw = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    const k = Math.min(1, Math.max(0, (raw - 0.15) / 0.85));
    const wave = k * k * (3 - 2 * k);
    const amount = v["cloud.dissolve"];
    const form = 1 - amount * 0.85 * wave;
    const blow = amount * wave;
    const [wx, wy] = windDir();

    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo);
    gl.viewport(0, 0, FW, FH);
    const c = res.cloud;
    gl.useProgram(c.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, res.maskTex);
    gl.uniform1i(c.u.uMask, 0);
    gl.uniform2f(c.u.uRes, FW, FH);
    gl.uniform2f(c.u.uDrift, drift.x, drift.y);
    gl.uniform2f(c.u.uWindDir, wx, wy);
    gl.uniform1f(c.u.uTime, time);
    gl.uniform1f(c.u.uDensity, v["cloud.density"]);
    gl.uniform1f(c.u.uSoft, v["cloud.softness"]);
    gl.uniform1f(c.u.uForm, form);
    gl.uniform1f(c.u.uBlow, blow);
    gl.uniform1f(c.u.uLetter, letter);
    gl.uniform3fv(c.u.uSkyTop, hex(v["colour.skyTop"]));
    gl.uniform3fv(c.u.uSkyBottom, hex(v["colour.skyBottom"]));
    gl.uniform3fv(c.u.uCloud, hex(v["colour.cloud"]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    const f = res.finish;
    gl.useProgram(f.p);
    gl.bindTexture(gl.TEXTURE_2D, res.image);
    gl.uniform1i(f.u.uImage, 0);
    gl.uniform2f(f.u.uRes, W, H);
    gl.uniform1f(f.u.uSeed, reduced ? 0 : (time * 60) % 997);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ----- loop ----- */
  let raf = 0;
  let last = 0;
  let pending = 0;
  let visible = !document.hidden;
  let onscreen = true;
  let slow = 0;
  let fast = 0;
  let maskTimer = 0;

  const live = () => !reduced && visible && onscreen && res;

  function govern(ms) {
    if (ms > 250) return;
    if (ms > 26) slow++;
    else slow = Math.max(0, slow - 1);
    fast = ms < 12 ? fast + 1 : 0;
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
    label.remove();
    return quiet(host, "This piece could not start its shaders.");
  }
  resize();
  if (reduced) {
    // Fully formed, mid-drift, still.
    time = 30;
    phase = 0;
    drift.x = 3.1;
    drift.y = 0.7;
    redraw();
  } else {
    time = 12;
    sync();
  }

  // Swap in the studio face once it is ready.
  findFace(fonts.signal).then((found) => {
    if (!found || fonts.signal.aborted) return;
    family = found.family;
    fontWeight = "500";
    ownFace = found.face;
    maskDirty = true;
    if (!raf) redraw();
  });

  return {
    update(next, path) {
      const textChanged = path === "text" || path === null;
      v = { ...next };
      if (textChanged) {
        clearTimeout(maskTimer);
        maskTimer = setTimeout(() => {
          maskDirty = true;
          if (!raf) redraw();
        }, path === null ? 0 : 90);
      }
      if (!raf) redraw();
    },
    action() {},
    destroy() {
      fonts.abort();
      clearTimeout(maskTimer);
      if (raf) cancelAnimationFrame(raf);
      if (pending) cancelAnimationFrame(pending);
      raf = pending = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (ownFace) document.fonts.delete(ownFace);
      if (res && !gl.isContextLost()) {
        gl.deleteProgram(res.cloud.p);
        gl.deleteProgram(res.finish.p);
        gl.deleteVertexArray(res.vao);
        gl.deleteTexture(res.maskTex);
        gl.deleteTexture(res.image);
        gl.deleteFramebuffer(res.fbo);
      }
      res = null;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.width = canvas.height = 1;
      mask.width = mask.height = 1;
      canvas.remove();
      label.remove();
    },
  };
}
