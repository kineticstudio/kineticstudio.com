/* Bloom orb: a soft light that breathes.

   One fragment shader. The orb is a sphere of light: its inside is 3D noise
   sampled on the sphere and twisted about its centre, so the swirl turns
   like weather on a small planet; a hot core sits under it, a bright limb
   around it, and two falloffs of bloom spill out into the room and pool on
   the floor beneath. Everything swells and settles on a slow breath, and
   the whole body leans a little toward the pointer. Film grain on top. */

export const params = {
  orb: {
    size: [0.3, 0.12, 0.5, 0.005],
    breathing: [1, 0, 3, 0.01],
    swirl: [0.8, 0, 2, 0.01],
  },
  light: {
    glow: [1, 0, 2, 0.01],
    core: "#e4ecdd",
    halo: "#a8ff66",
  },
  finish: {
    grain: [0.4, 0, 1, 0.01],
    ground: "#0d0d0d",
  },
};

const DPR_CAP = 2;
const MAX_PIXELS = 3.6e6;
const BREATH = 7; // seconds per breath at speed 1

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes, uCenter, uLean;
uniform float uR, uTime, uSpin, uBreath, uSwirl, uGlow, uGrain, uSeed;
uniform vec3 uCore, uHalo, uGround;
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
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.02 + 7.13; a *= 0.5; }
  return s / 0.9375;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float grain(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// The swirl, read at a point inside the sphere: smoke folded on itself,
// twisted more toward the centre, turning slowly about the vertical axis.
float swirlAt(vec3 s, float r) {
  s.xz *= rot(uSpin);
  s.xy *= rot((1.0 - r) * 1.7 * uSwirl + uSpin * 0.5);
  vec3 w = vec3(fbm(s * 1.1 + vec3(0.0, uTime * 0.04, 0.0)), fbm(s * 1.1 + 5.2), fbm(s * 1.1 - 3.7));
  float n = fbm(s * 1.25 + (w - 0.5) * 2.2 * (0.4 + uSwirl * 0.6));
  return n;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  float R = 1.0 + 0.05 * uBreath;
  vec2 p = (frag - uCenter) / uR;

  // Lean: the body shifts toward the pointer and draws out a little.
  float L = length(uLean);
  vec2 ld = L > 1e-4 ? uLean / L : vec2(0.0, 1.0);
  vec2 q = p - uLean * 0.45;
  float along = dot(q, ld);
  q = (q - along * ld) * (1.0 + 0.08 * L) + ld * along / (1.0 + 0.22 * L);
  float r = length(q);

  // The room: the ground colour, a floor below, light pooled on it.
  float floorY = -(R + 0.62);
  float fy = p.y - floorY;
  vec3 col = uGround * (1.0 + 0.35 * smoothstep(-0.2, 1.0, uv.y));
  float pool = exp(-pow((p.x - uLean.x * 0.7) / (0.85 + 0.12 * uBreath), 2.0) - pow(fy / 0.14, 2.0));
  float wash = exp(-pow((p.x - uLean.x * 0.7) / 1.7, 2.0) - pow(fy / 0.45, 2.0)) * smoothstep(0.35, -0.2, fy);
  col += uHalo * (pool * 0.1 + wash * 0.035) * uGlow * (0.7 + 0.5 * uBreath);

  // Bloom: tight, then a little wider; it stays in the room's middle.
  float out1 = max(r - R, 0.0);
  float bloom = exp(-out1 * 6.0) * 0.32 + exp(-out1 * 2.2) * 0.09 + exp(-out1 * 0.8) * 0.025;
  bloom *= uGlow * (0.7 + 0.45 * uBreath);
  col += mix(uHalo, uCore, 0.15) * bloom;

  if (r < R + 0.03) {
    float rr = min(r / R, 1.0);
    float z = sqrt(max(1.0 - rr * rr, 0.0));
    vec3 s = vec3(q / R, z);
    float near = swirlAt(s * 1.1, rr);
    float deep = swirlAt(vec3(s.xy * 0.7, z * 0.2) + 2.3, rr);

    // Light from within: a bright core, luminous currents turning around
    // it (the far side dimmer than the near), a lit limb and a glass sheen.
    // Between the currents the sphere stays dark, so it reads as a volume.
    float core = exp(-rr * rr / (0.07 + 0.05 * uBreath));
    float inner = exp(-rr * rr / 0.45);
    // Ribbons follow the folded noise's middle line, so they curl with it.
    float cur = pow(1.0 - abs(2.0 * near - 1.0), 3.0);
    float far = pow(1.0 - abs(2.0 * deep - 1.0), 2.5);
    float vein = pow(1.0 - abs(2.0 * near - 1.0), 14.0);
    float limb = pow(rr, 4.0);

    vec3 body = mix(uGround, uHalo, 0.05) * (0.6 + 0.4 * z) + uHalo * 0.05 * inner;
    body += uHalo * far * 0.2 * (0.3 + 0.7 * inner);
    body += mix(uHalo, uCore, 0.2 + 0.6 * inner) * cur * (0.22 + 0.9 * inner) * (0.4 + 0.6 * z);
    body += mix(uHalo, uCore, 0.6) * vein * 0.32 * (0.3 + 0.7 * inner) * min(uSwirl + 0.3, 1.5);
    body += uCore * core * (1.0 + 0.6 * uBreath);
    body += mix(uHalo, uCore, 0.3) * limb * (0.55 + 0.25 * cur);
    vec2 hp = (s.xy - vec2(-0.36, 0.44)) * vec2(1.0, 1.7);
    body += vec3(1.0) * exp(-dot(hp, hp) / 0.022) * 0.16 * z;
    body *= 0.55 + 0.45 * uGlow;

    float a = smoothstep(R + 0.03, R - 0.05, r);
    col = mix(col, body + mix(uHalo, uCore, 0.15) * bloom * 0.4 * smoothstep(0.55, 1.0, rr), a);
  }

  // Soft roll-off so the bright parts bloom rather than clip.
  col = 1.0 - exp(-col * 1.3);
  vec2 v = uv - 0.5;
  col *= 1.0 - 0.35 * dot(v, v);
  col += (grain(frag + uSeed) - 0.5) * uGrain * 0.1;
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
      console.warn("[bloom-orb]", gl.getShaderInfoLog(s));
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
  let W = 1, H = 1, cssW = 1, cssH = 1;
  let quality = 1;

  function build() {
    const prog = program(gl, VERT, FRAG);
    if (!prog) return null;
    return { prog, vao: gl.createVertexArray() };
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
  }

  // Radius by area so a phone gets a proper orb, kept clear of the edges.
  const radius = (w, h) => Math.min(v["orb.size"] * 0.78 * Math.sqrt(w * h), 0.4 * Math.min(w, h));

  /* ----- motion state ----- */
  let time = 0;
  let spin = 0;
  let breathPhase = 0;
  const lean = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0, active: false };

  function step(dt) {
    time += dt;
    spin += dt * (0.05 + 0.1 * v["orb.swirl"]);
    breathPhase += (dt * v["orb.breathing"]) / BREATH;
    // Lean toward the pointer; sway a little on its own.
    let tx = 0.05 * Math.sin(time * 0.31);
    let ty = 0.04 * Math.cos(time * 0.23);
    if (pointer.active) {
      const R = radius(cssW, cssH);
      const dx = (pointer.x - cssW / 2) / (R * 3);
      const dy = (cssH * 0.47 - pointer.y) / (R * 3);
      const d = Math.hypot(dx, dy);
      const k = d > 0.4 ? 0.4 / d : 1;
      tx = dx * k;
      ty = dy * k;
    }
    const e = 1 - Math.exp(-dt * 2.2);
    lean.x += (tx - lean.x) * e;
    lean.y += (ty - lean.y) * e;
  }

  // Breath: in a little quicker than out.
  const breath = () => {
    const f = breathPhase % 1;
    const s = f < 0.42 ? f / 0.42 : 1 - (f - 0.42) / 0.58;
    return s * s * (3 - 2 * s);
  };

  function draw() {
    if (!res || gl.isContextLost()) return;
    gl.bindVertexArray(res.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    const { p, u } = res.prog;
    gl.useProgram(p);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform2f(u.uCenter, W / 2, H * 0.53);
    gl.uniform2f(u.uLean, lean.x, lean.y);
    gl.uniform1f(u.uR, radius(W, H));
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uSpin, spin);
    gl.uniform1f(u.uBreath, breath());
    gl.uniform1f(u.uSwirl, v["orb.swirl"]);
    gl.uniform1f(u.uGlow, v["light.glow"]);
    gl.uniform1f(u.uGrain, v["finish.grain"]);
    gl.uniform1f(u.uSeed, reduced ? 0 : (time * 61.7) % 1000);
    gl.uniform3fv(u.uCore, hex(v["light.core"]));
    gl.uniform3fv(u.uHalo, hex(v["light.halo"]));
    gl.uniform3fv(u.uGround, hex(v["finish.ground"]));
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
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
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
    // Held mid-breath, still.
    time = 8;
    spin = 1.2;
    breathPhase = 0.3;
    redraw();
  } else {
    time = 4;
    spin = 0.6;
    breathPhase = 0.2;
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
      host.removeEventListener("pointerdown", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (res && !gl.isContextLost()) {
        gl.deleteProgram(res.prog.p);
        gl.deleteVertexArray(res.vao);
      }
      res = null;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.width = canvas.height = 1;
      canvas.remove();
    },
  };
}
