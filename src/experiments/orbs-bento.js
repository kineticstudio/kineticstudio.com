/* Orb bento.

   Three rounded cards in a bento, a large one beside two small ones, each
   filled with its own slow mesh gradient: a deep shadow, a body colour and a
   bright band of highlight swept across the card on a diagonal, bent by
   noise, drifting, rocking a little on its angle, and lit by broad secondary
   blooms so it never reads as a plain linear gradient. Teal leads, orange and
   blue share the column; film grain sits over all three, and the teal card
   carries a fine dot lattice and the orange one a grid, both sharp to the
   pixel and clipped to the corners. Over the piece the gradients shift a
   little after the cursor. On a narrow stage the cards stack.

   Ported from a Creative Studio prototype (01-Orbs-Bento with
   orbs-src/renderer.js and layout.js): one WebGL context, the prototype's
   fragment shader unchanged, each card drawn in its own viewport with its
   own phase, at the prototype's defaults. The pointer, off in the
   prototype, is on a little here. The page never names the client. */

export const params = {
  layout: {
    featured: { type: "select", options: ["Teal", "Orange", "Blue"], default: "Teal" },
    gap: [20, 0, 64, 1],
    radius: [28, 0, 100, 1],
    hero: [0.57, 0.3, 0.7, 0.01],
  },
  motion: {
    speed: [0.58, 0, 2, 0.01],
    turbulence: [1.5, 0, 1.5, 0.01],
    pointer: [0.3, 0, 1, 0.01],
  },
  texture: {
    grain: [0.23, 0, 0.6, 0.01],
    patterns: { type: "toggle", labels: ["Plain", "Dots and grid"], default: true },
  },
  colour: { ground: "#e8e7e3" },
};

// the three materials (the prototype's orb() recipes)
const ORBS = {
  orange: { shadow: "#672109", body: "#ed410a", highlight: "#ff9347", angle: -18, bandPosition: 0.32, bandWidth: 0.48, phase: 0, speed: 1 },
  teal: { shadow: "#003b34", body: "#006166", highlight: "#56b5b2", angle: 34, bandPosition: 0, bandWidth: 0.48, phase: 2.1, speed: 1 },
  blue: { shadow: "#002b39", body: "#075296", highlight: "#4b9ccd", angle: -40, bandPosition: 0.12, bandWidth: 0.48, phase: 4.2, speed: 1 },
};
// each card's overlays: teal's dots, orange's grid (the prototype's enabled layers)
const DOTS = { teal: { size: 2.1, density: 24, opacity: 0.45, color: "#f5f5f0", rotation: 0 } };
const GRID = { orange: { lineWeight: 2, density: 16, opacity: 0.19, color: "#f5f5f0", rotation: 0 } };
// the rest of the prototype's defaults
const FIXED = {
  travel: 0.28, rotation: 0.16, meshScale: 1.16,
  grainSize: 0.6, coloredGrain: 0.54, contrast: 1.42, brightness: 1, seed: 28, edgeSoftness: 0.5,
  inset: 32, gradientScale: 1.42,
};

const VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position; gl_Position = vec4(a_position, 0.0, 1.0); }
`;
/* The prototype's fragment shader (orbs-src/renderer.js), unchanged. */
const FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform vec3 u_shadow, u_body, u_highlight, u_background;
uniform float u_time, u_phase, u_angle, u_position, u_width;
uniform float u_travel, u_rotation, u_turbulence, u_scale;
uniform float u_grain, u_grainSize, u_colored, u_grainTime, u_seed;
uniform float u_contrast, u_brightness, u_edge, u_diameter, u_dpr;
uniform vec2 u_pointer;
uniform vec2 u_viewSize;
uniform float u_bento, u_corner;
uniform vec4 u_dots, u_grid;
uniform vec3 u_dotColor, u_gridColor;
uniform vec2 u_overlayRotation;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33 + u_seed);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  return noise(p)*.57 + noise(p*2.03+7.1)*.28 + noise(p*4.09+13.4)*.15;
}
vec2 rotatePoint(vec2 p, float a) {
  return mat2(cos(a), -sin(a), sin(a), cos(a))*p;
}
void main() {
  // y increases down the artwork, so angle controls follow screen coordinates.
  vec2 p = vec2(v_uv.x, -v_uv.y) * u_viewSize / u_diameter;
  vec2 cornerPoint = abs(v_uv * u_viewSize * .5) - u_viewSize*.5 + u_corner;
  float tileDistance = length(max(cornerPoint, 0.0)) + min(max(cornerPoint.x, cornerPoint.y), 0.0) - u_corner;
  float tileMask = 1.0-smoothstep(-1.0, 0.0, tileDistance);
  vec3 ground = u_background;
  float feather = max(1.0, u_edge * u_dpr) * 2.0 / u_diameter;
  float mask = u_bento > .5 ? 1.0 : 1.0 - smoothstep(1.0-feather, 1.0, length(p));
  if (mask <= 0.0) { gl_FragColor = vec4(mix(u_background, ground, tileMask), 1.0); return; }
  float t = u_time;
  vec2 q = p + u_pointer;
  float angle = u_angle + sin(t*.43+u_phase)*u_rotation;
  vec2 axis = vec2(-sin(angle), cos(angle));
  vec2 drift = vec2(sin(t*.29+u_phase), cos(t*.37+u_phase))*.6;
  float warp = (fbm(q*u_scale + drift + u_phase)-.5)*u_turbulence;
  float sweep = dot(q, axis) + warp;
  float center = u_position + (sin(t*.61+u_phase)-sin(u_phase))*u_travel;
  float band = exp(-pow((sweep-center)/u_width, 2.0)*1.5);
  float body = smoothstep(-.95, .7, sweep) * .8 + .2;
  vec3 color = mix(u_shadow, u_body, body);
  color = mix(color, u_highlight, band*.94);
  // Broad secondary mesh lights keep the band from looking like a linear gradient.
  color *= .89 + .17*fbm(q*1.7-drift+4.0);
  color = (color-.5)*u_contrast+.5;
  color *= u_brightness;
  vec2 pixel = floor(gl_FragCoord.xy / (u_grainSize*u_dpr));
  float mono = hash(pixel+u_grainTime)-.5;
  vec3 rgb = vec3(hash(pixel+17.0+u_grainTime), hash(pixel+51.0+u_grainTime), hash(pixel+93.0+u_grainTime))-.5;
  vec3 grain = mix(vec3(mono), rgb, u_colored);
  color += grain*u_grain*(.4+sqrt(max(color, vec3(0.0))));
  // Screen-sharp, card-local overlays. Each layer has independent controls.
  vec2 localPixel = v_uv*u_viewSize*.5;
  vec2 dotCell = mod(rotatePoint(localPixel, u_overlayRotation.x)+u_dots.y*.5, u_dots.y)-u_dots.y*.5;
  float dotMask = 1.0-smoothstep(max(0.0,u_dots.x*.5-.6), u_dots.x*.5+.6, length(dotCell));
  vec2 gridCell = abs(mod(rotatePoint(localPixel, u_overlayRotation.y)+u_grid.y*.5,u_grid.y)-u_grid.y*.5);
  float lineMask = 1.0-smoothstep(max(0.0,u_grid.x*.5-.6), u_grid.x*.5+.6,min(gridCell.x,gridCell.y));
  color = mix(color, u_gridColor, lineMask*u_grid.z*u_grid.w);
  color = mix(color, u_dotColor, dotMask*u_dots.z*u_dots.w);
  vec3 orb = mix(ground, clamp(color, 0.0, 1.0), mask);
  gl_FragColor = vec4(mix(u_background, orb, tileMask), 1.0);
}
`;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/* The bento (orbs-src/layout.js bentoLayout): the featured card is the hero,
   the other two share the column beside it; a narrow stage stacks them, the
   hero still the larger. Rounded to device pixels as WebGL's viewport is. */
function bentoLayout(v, width, height, dpr) {
  const names = ["orange", "teal", "blue"];
  const featured = v["layout.featured"].toLowerCase();
  names.splice(names.indexOf(featured), 1);
  names.unshift(featured);
  const column = width < 650;
  const inset = Math.min(FIXED.inset, Math.min(width, height) * 0.1);
  const w = width - inset * 2, h = height - inset * 2;
  const gap = Math.min(v["layout.gap"], Math.min(w, h) * 0.12);
  const heroW = (w - gap) * v["layout.hero"];
  const heroH = (h - gap * 2) * v["layout.hero"];
  const round = (n) => Math.round(n * dpr) / dpr;
  return names.map((name, i) => {
    let x = inset, y = inset, tileW = w, tileH = h;
    if (column) {
      const small = (h - gap * 2 - heroH) / 2;
      tileH = i === 0 ? heroH : small;
      y += i === 0 ? 0 : heroH + gap + (i - 1) * (small + gap);
    } else {
      tileW = i === 0 ? heroW : w - gap - heroW;
      tileH = i === 0 ? h : (h - gap) / 2;
      x += i === 0 ? 0 : heroW + gap;
      y += i === 2 ? tileH + gap : 0;
    }
    const rw = round(tileW), rh = round(tileH);
    return { name, x: round(x), y: height - round(height - y - tileH) - rh, width: rw, height: rh };
  });
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y";
  host.append(canvas);

  let width = 1, height = 1, dpr = 1, raf = 0, last = 0, elapsed = 0, onScreen = true, tabVisible = !document.hidden;
  const pointer = [0, 0], target = [0, 0];

  const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
  let program = null, buffer = null, vs = null, fs = null, failed = !gl;
  const uniforms = {};
  const loc = (name) => (uniforms[name] ??= gl.getUniformLocation(program, `u_${name}`));
  const scalar = (name, value) => gl.uniform1f(loc(name), value);
  const colour = (name, value) => gl.uniform3fv(loc(name), rgb(value));
  if (gl) {
    try {
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      vs = compile(gl.VERTEX_SHADER, VERTEX);
      fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    } catch (error) {
      console.warn("orbs-bento: WebGL could not start.", error);
      failed = true;
    }
  }
  if (failed) host.style.background = v["colour.ground"];

  function draw() {
    if (failed || gl.isContextLost()) return;
    const ground = v["colour.ground"];
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(...rgb(ground), 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    colour("background", ground);
    scalar("travel", FIXED.travel);
    scalar("rotation", FIXED.rotation);
    scalar("turbulence", v["motion.turbulence"]);
    scalar("scale", FIXED.meshScale);
    scalar("grain", v["texture.grain"]);
    scalar("grainSize", FIXED.grainSize);
    scalar("colored", FIXED.coloredGrain);
    scalar("seed", FIXED.seed);
    scalar("contrast", FIXED.contrast);
    scalar("brightness", FIXED.brightness);
    scalar("edge", FIXED.edgeSoftness);
    scalar("dpr", dpr);
    scalar("grainTime", 0);
    scalar("bento", 1);
    gl.uniform2f(loc("pointer"), pointer[0] * v["motion.pointer"], pointer[1] * v["motion.pointer"]);
    const patterns = v["texture.patterns"];
    for (const card of bentoLayout(v, width, height, dpr)) {
      const o = ORBS[card.name], dots = DOTS[card.name], grid = GRID[card.name];
      const tileW = card.width, tileH = card.height;
      gl.viewport(Math.round(card.x * dpr), Math.round((height - card.y - tileH) * dpr), Math.round(tileW * dpr), Math.round(tileH * dpr));
      gl.uniform2f(loc("viewSize"), tileW * dpr, tileH * dpr);
      scalar("corner", Math.min(v["layout.radius"] * dpr, tileW * dpr * 0.5, tileH * dpr * 0.5));
      scalar("diameter", Math.max(1, Math.round(Math.min(tileW, tileH) * FIXED.gradientScale * dpr)));
      colour("shadow", o.shadow);
      colour("body", o.body);
      colour("highlight", o.highlight);
      scalar("time", elapsed * o.speed);
      scalar("phase", o.phase);
      scalar("angle", (o.angle * Math.PI) / 180);
      scalar("position", o.bandPosition);
      scalar("width", o.bandWidth);
      const shortSide = Math.min(tileW, tileH) * dpr;
      gl.uniform4f(loc("dots"), (dots?.size ?? 1.2) * dpr, shortSide / (dots?.density ?? 24), dots?.opacity ?? 0, patterns && dots ? 1 : 0);
      gl.uniform4f(loc("grid"), (grid?.lineWeight ?? 0.6) * dpr, shortSide / (grid?.density ?? 12), grid?.opacity ?? 0, patterns && grid ? 1 : 0);
      colour("dotColor", dots?.color ?? "#f5f5f0");
      colour("gridColor", grid?.color ?? "#f5f5f0");
      gl.uniform2f(loc("overlayRotation"), ((dots?.rotation ?? 0) * Math.PI) / 180, ((grid?.rotation ?? 0) * Math.PI) / 180);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    elapsed += dt * v["motion.speed"];
    // the gradients ease after the cursor (renderer.js: 1 - e^(-7 dt))
    const easing = 1 - Math.exp(-dt * 7);
    for (let i = 0; i < 2; i++) pointer[i] += (target[i] - pointer[i]) * easing;
    draw();
    if (onScreen && tabVisible && !still) raf = requestAnimationFrame(frame);
  }
  function loop() {
    if (!raf && !still && !failed && onScreen && tabVisible) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function resize() {
    const r = host.getBoundingClientRect();
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    draw();
  }

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    target[0] = (e.clientX - r.left) / r.width - 0.5;
    target[1] = (e.clientY - r.top) / r.height - 0.5;
  };
  const onLeave = () => target.fill(0);
  const onLost = (e) => {
    e.preventDefault();
    stop();
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("webglcontextlost", onLost);

  const ro = new ResizeObserver(resize);
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

  resize();
  loop();

  return {
    update(values) {
      Object.assign(v, values);
      if (failed) host.style.background = v["colour.ground"];
      draw();
    },
    action() {},
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      if (failed) host.style.background = "";
      if (gl && !failed) {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      canvas.remove();
    },
  };
}
