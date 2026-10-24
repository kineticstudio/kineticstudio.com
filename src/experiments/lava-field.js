/* Lava field: a slow field of molten colour.

   Pass one, at reduced resolution, folds fractal noise back into itself
   (domain warping) and keeps the result as a height field. Pass two, at full
   resolution, reads that height, finds its slopes, and shades it as glossy
   liquid: a three-colour ramp for the heat, a studio softbox in the
   reflections, a travelling key light, and a fine film grain on top. */

export const params = {
  field: {
    scale: [1.4, 0.4, 4, 0.01],
    speed: [0.35, 0, 1.5, 0.01],
    warp: [2.8, 0, 6, 0.01],
  },
  melt: {
    threshold: [0.5, 0.3, 0.75, 0.005],
    softness: [0.06, 0.01, 0.3, 0.005],
  },
  colour: {
    deep: "#0d0d0d",
    mid: "#d9e2d2",
    hot: "#a8ff66",
  },
  surface: {
    gloss: [0.7, 0, 1, 0.01],
    grain: [0.35, 0, 1, 0.01],
  },
};

const DPR_CAP = 2;
const MAX_PIXELS = 4.2e6;

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FIELD = `#version 300 es
precision highp float;
uniform vec2 uRes, uStir;
uniform float uTime, uScale, uWarp, uThresh, uSoft, uStirAmt;
out vec4 o;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash2(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash2(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
const mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * noise(p); p = M * p; a *= 0.5; }
  return s;
}
float fbm4(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = M * p; a *= 0.45; }
  return s;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  // The pointer, when there is one, stirs the melt.
  vec2 d = uv - uStir;
  uv += vec2(-d.y, d.x) * exp(-dot(d, d) / 0.05) * uStirAmt;

  vec2 p = uv * uScale;
  float t = uTime;
  vec2 q = vec2(fbm3(p + t * 0.11), fbm3(p + vec2(5.2, 1.3) - t * 0.09));
  vec2 r = vec2(fbm3(p + uWarp * q + vec2(1.7, 9.2) + t * 0.16),
                fbm3(p + uWarp * q + vec2(8.3, 2.8) - t * 0.13));
  float f = clamp(0.5 + 1.25 * fbm4(p + uWarp * r + t * 0.05), 0.0, 1.0);

  float m = smoothstep(uThresh - uSoft, uThresh + uSoft, f);
  float core = smoothstep(uThresh + uSoft * 0.6 + 0.12, uThresh + uSoft * 0.6 + 0.19, f);
  // Height: rounded molten islands with their hot cores swelling out of
  // them, and the raw field's ripples through it all.
  float h = m * 0.56 + core * 0.2 + f * 0.24;
  o = vec4(h, f, length(q), m);
}`;

const SHADE = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec2 uRes, uFieldRes, uLight;
uniform float uTime, uGloss, uGrain, uThresh, uSoft;
uniform vec3 uDeep, uMid, uHot;
out vec4 o;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// A studio for the liquid to reflect: a big soft key, a strip, a dim floor.
vec3 studio(vec3 r) {
  float key = exp(-pow((r.x - uLight.x) / 0.32, 2.0) - pow((r.y - uLight.y) / 0.22, 2.0));
  float strip = exp(-pow((r.x + 0.55) / 0.05, 2.0)) * smoothstep(-0.6, 0.2, r.y);
  float sky = smoothstep(-0.4, 0.9, r.y);
  return vec3(1.0) * key * 1.3 + vec3(0.85, 0.9, 0.85) * strip * 0.5 + vec3(0.12) * sky;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 tx = 1.0 / uFieldRes;
  vec4 F = texture(uField, uv);
  float hl = texture(uField, uv - vec2(tx.x, 0.0)).r;
  float hr = texture(uField, uv + vec2(tx.x, 0.0)).r;
  float hd = texture(uField, uv - vec2(0.0, tx.y)).r;
  float hu = texture(uField, uv + vec2(0.0, tx.y)).r;
  // Slopes in field units per screen fraction, so the relief holds at any size.
  float k = 0.07 * min(uFieldRes.x, uFieldRes.y) / 2.0;
  vec3 n = normalize(vec3((hl - hr) * k, (hd - hu) * k, 1.0));

  float h = F.r, f = F.g, q = F.b, m = F.a;

  // The heat ramp: deep where it has cooled, mid on the molten islands,
  // hot only in their cores.
  float core = smoothstep(uThresh + uSoft * 0.6 + 0.12, uThresh + uSoft * 0.6 + 0.19, f);
  float haze = smoothstep(uThresh - 0.32, uThresh - uSoft * 0.5, f);
  vec3 base = mix(uDeep, mix(uDeep, uMid, 0.16), haze * (0.6 + 0.4 * smoothstep(0.3, 1.2, q)));
  base = mix(base, uMid, m);
  base = mix(base, uHot, core * m * 0.92);

  // Light it: diffuse wrap, glossy key, reflections of the studio.
  vec3 L = normalize(vec3(uLight, 0.75));
  float diff = 0.55 + 0.45 * dot(n, L);
  vec3 col = base * diff;
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 R = reflect(-V, n);
  float fres = 0.04 + 0.96 * pow(1.0 - max(n.z, 0.0), 4.0);
  float power = mix(18.0, 260.0, uGloss * uGloss);
  float spec = pow(max(dot(n, normalize(L + V)), 0.0), power) * mix(0.15, 1.4, uGloss);
  vec3 env = studio(R);
  col += env * mix(0.05, 0.85, uGloss) * (0.25 + 0.75 * fres) * mix(0.6, 1.0, m);
  col += vec3(1.0) * spec;

  // Vignette and grain.
  vec2 c = uv - 0.5;
  col *= 1.0 - 0.35 * dot(c, c) * 1.6;
  float g = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 913.0) - 0.5;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col += g * uGrain * mix(0.16, 0.08, luma);
  o = vec4(max(col, 0.0), 1.0);
}`;

/* ---------- helpers ---------- */

function quiet(host, text) {
  const p = document.createElement("p");
  p.textContent = text;
  p.style.cssText =
    "position:absolute;inset:0;margin:0;display:grid;place-items:center;padding:2rem;text-align:center;" +
    "color:rgba(217,226,210,.5);font:13px/1.4 ui-monospace,monospace;";
  host.append(p);
  return { update() {}, action() {}, destroy() { p.remove(); } };
}

function program(gl, vs, fs) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      console.warn("[lava-field]", gl.getShaderInfoLog(s));
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

  let res = null;
  let W = 1, H = 1, FW = 1, FH = 1;
  let quality = 1;

  function build() {
    const field = program(gl, VERT, FIELD);
    const shade = program(gl, VERT, SHADE);
    if (!field || !shade) return null;
    const float = Boolean(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    return {
      field, shade, float,
      vao: gl.createVertexArray(),
      tex: gl.createTexture(),
      fbo: gl.createFramebuffer(),
      w: 0, h: 0,
    };
  }

  function sizeTargets() {
    if (!res || (res.w === FW && res.h === FH)) return;
    res.w = FW;
    res.h = FH;
    gl.bindTexture(gl.TEXTURE_2D, res.tex);
    if (res.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, FW, FH, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, FW, FH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, res.tex, 0);
    if (res.float && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      // Half float would not render here: fall back to bytes.
      res.float = false;
      res.w = 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      sizeTargets();
      return;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function resize() {
    const r = host.getBoundingClientRect();
    const cssW = Math.max(1, r.width);
    const cssH = Math.max(1, r.height);
    let scale = Math.min(window.devicePixelRatio || 1, DPR_CAP) * Math.min(1, quality * 1.4);
    const px = cssW * cssH * scale * scale;
    if (px > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / px);
    W = Math.max(1, Math.round(cssW * scale));
    H = Math.max(1, Math.round(cssH * scale));
    // The field itself is soft: about a CSS pixel per texel is plenty.
    FW = Math.max(1, Math.min(W, Math.round(cssW * 0.75 * quality)));
    FH = Math.max(1, Math.round((FW * H) / W));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    sizeTargets();
  }

  /* ----- motion state ----- */
  let time = 0;
  const stir = { x: 0, y: 0, amt: 0 };
  const pointer = { x: 0, y: 0, active: false, moved: 0 };
  let lightAngle = 0.6;

  function step(dt) {
    time += dt * v["field.speed"];
    lightAngle += dt * 0.05;
    const k = 1 - Math.exp(-dt * 3);
    stir.x += (pointer.x - stir.x) * k;
    stir.y += (pointer.y - stir.y) * k;
    // Stirring builds while the pointer moves and settles when it rests.
    const target = pointer.active ? Math.min(0.9, pointer.moved * 0.02) : 0;
    stir.amt += (target - stir.amt) * (1 - Math.exp(-dt * 1.5));
    pointer.moved *= Math.exp(-dt * 2.5);
  }

  function draw() {
    if (!res || gl.isContextLost()) return;
    sizeTargets();
    gl.bindVertexArray(res.vao);

    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo);
    gl.viewport(0, 0, FW, FH);
    const f = res.field;
    gl.useProgram(f.p);
    gl.uniform2f(f.u.uRes, FW, FH);
    gl.uniform2f(f.u.uStir, stir.x, stir.y);
    gl.uniform1f(f.u.uStirAmt, stir.amt);
    gl.uniform1f(f.u.uTime, time);
    gl.uniform1f(f.u.uScale, v["field.scale"]);
    gl.uniform1f(f.u.uWarp, v["field.warp"]);
    gl.uniform1f(f.u.uThresh, v["melt.threshold"]);
    gl.uniform1f(f.u.uSoft, v["melt.softness"]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    const s = res.shade;
    gl.useProgram(s.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, res.tex);
    gl.uniform1i(s.u.uField, 0);
    gl.uniform2f(s.u.uRes, W, H);
    gl.uniform2f(s.u.uFieldRes, FW, FH);
    gl.uniform2f(s.u.uLight, -0.45 + 0.25 * Math.cos(lightAngle), 0.5 + 0.15 * Math.sin(lightAngle * 1.3));
    gl.uniform1f(s.u.uTime, reduced ? 0 : performance.now() / 1000);
    gl.uniform1f(s.u.uGloss, v["surface.gloss"]);
    gl.uniform1f(s.u.uGrain, v["surface.grain"]);
    gl.uniform1f(s.u.uThresh, v["melt.threshold"]);
    gl.uniform1f(s.u.uSoft, v["melt.softness"]);
    gl.uniform3fv(s.u.uDeep, hex(v["colour.deep"]));
    gl.uniform3fv(s.u.uMid, hex(v["colour.mid"]));
    gl.uniform3fv(s.u.uHot, hex(v["colour.hot"]));
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

  const live = () => !reduced && visible && onscreen && res;

  function govern(ms) {
    if (ms > 250) return;
    if (ms > 26) slow++;
    else slow = Math.max(0, slow - 1);
    fast = ms < 12 ? fast + 1 : 0;
    if (slow > 24 && quality > 0.4) {
      quality = Math.max(0.4, quality * 0.8);
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

  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    const s = Math.min(r.width, r.height);
    const x = (e.clientX - r.left - r.width / 2) / s;
    const y = (r.height / 2 - (e.clientY - r.top)) / s;
    if (pointer.active) pointer.moved += Math.hypot(x - pointer.x, y - pointer.y) * 100;
    else {
      stir.x = x;
      stir.y = y;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
  };
  const onLeave = () => {
    pointer.active = false;
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
    // A settled moment of the flow, redrawn only when a dial moves.
    time = 14;
    lightAngle = 0.9;
    redraw();
  } else {
    time = 6;
    sync();
  }

  return {
    update(next) {
      v = { ...next };
      if (!raf) redraw();
    },
    action() {},
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
      if (res && !gl.isContextLost()) {
        gl.deleteProgram(res.field.p);
        gl.deleteProgram(res.shade.p);
        gl.deleteVertexArray(res.vao);
        gl.deleteTexture(res.tex);
        gl.deleteFramebuffer(res.fbo);
      }
      res = null;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.width = canvas.height = 1;
      canvas.remove();
    },
  };
}
