/* Glowing arches.

   From Arch (their prototype 02): broad arches of light on a blue-grey
   ground, drawn as analytic parabolas in one fragment shader, no image.
   Each arch has a lit face that falls away below its rim and a halo
   above it; every other arch turns its light outward instead, so a stack
   reads as bands folding in and out. Distances are measured across each
   curve's normal so the glow keeps its width to the edges. The crowns
   float slowly out of step with one another, and the pointer leans the
   stack's centre a little toward it. */

export const params = {
  shape: {
    arches: [2, 1, 8, 1],
    spread: [50, 8, 90, 1],
    curve: [94, 15, 220, 1],
    face: [17, 2, 45, 1],
  },
  light: {
    halo: [8, 0.5, 20, 0.5],
    strength: [82, 0, 100, 1],
  },
  motion: {
    speed: [30, 0, 100, 1],
    drift: [3, 0, 12, 0.5],
  },
  colour: {
    ground: "#87969f",
    glow: "#f5f4f5",
  },
};

const VERTEX = `attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.,1.);}`;
const FRAGMENT = `precision highp float;
uniform vec2 resolution;
uniform float span;
uniform vec3 ground,glowColor;
uniform float count,spacing,position,center,curve,faceDepth,alternateFaces;
uniform float rimWidth,glowSpread,glowStrength,brightness,softness,grain,phase,amplitude,grainScale;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 uv=vec2(gl_FragCoord.x/resolution.x,1.-gl_FragCoord.y/resolution.y);
  // across in units of the long side, so a tall screen sees the middle of the arches, not a squeezed copy
  float dx=(uv.x-center)*resolution.x/span;
  vec3 color=ground;
  // the reference's quiet, slightly luminous blue-grey atmosphere
  float atmosphere=exp(-pow((uv.x-.52)*1.8,2.))*exp(-pow((uv.y-.38)*1.6,2.));
  color+=vec3(.016,.012,.013)*atmosphere;
  for(int i=0;i<8;i++){
    if(float(i)>=count)break;
    float drift=sin(phase+float(i)*.55)*amplitude;
    float crown=position+float(i)*spacing/max(count-1.,1.)+drift;
    float line=crown+curve*dx*dx;
    // measure across the local normal so the glow doesn't widen toward the edges
    float slope=2.*curve*dx*resolution.y/span;
    float d=(uv.y-line)/sqrt(1.+slope*slope);
    float reverse=mod(float(i),2.)*alternateFaces;
    float side=smoothstep(-softness,softness,d);
    float face=exp(-pow(max(d,0.)/faceDepth,1.45))*side;
    float haloWidth=mix(glowSpread,glowSpread*.31,reverse);
    float outer=exp(-pow(abs(min(d,0.))/haloWidth,1.6))*(1.-side);
    float rim=exp(-pow(d/rimWidth,2.));
    float light=max(face*mix(.89,.10,reverse),rim*mix(.87,.78,reverse));
    light=max(light,outer*mix(.32,.88,reverse)*glowStrength);
    light=clamp(light*brightness,0.,.97);
    color=mix(color,glowColor,light);
  }
  color+=(hash(floor(gl_FragCoord.xy/grainScale))-.5)*grain*.021;
  gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`;

// the reference's settings that stay put
const FIXED = { position: 36, center: 54, alternateFaces: 88, rimWidth: 0.55, brightness: 95, softness: 0.22, grain: 14 };
const rgb = (hex) => {
  const s = String(hex).replace("#", "");
  const n = s.length === 3 ? s.replace(/./g, "$&$&") : s;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
};

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;background:${v["colour.ground"]}`;
  host.append(canvas);

  let gl = canvas.getContext("webgl", { alpha: false, depth: false, antialias: false, powerPreference: "low-power" });
  let program = null, buffer = null, U = {};
  let lost = false;

  function shader(kind, src) {
    const s = gl.createShader(kind);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function setup() {
    const vs = shader(gl.VERTEX_SHADER, VERTEX), fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    U = Object.fromEntries(
      ["resolution", "ground", "glowColor", "count", "spacing", "position", "center", "curve", "faceDepth", "alternateFaces", "rimWidth", "glowSpread", "glowStrength", "brightness", "softness", "grain", "phase", "amplitude", "grainScale", "span"].map((n) => [n, gl.getUniformLocation(program, n)]),
    );
  }
  try {
    if (gl) setup();
  } catch (e) {
    console.warn("glowing-arches:", e);
    gl = null;
  }

  let W = 1, H = 1, scale = 1;
  let phase = 0, raf = 0, last = 0, acc = 0;
  let onScreen = true, tabVisible = !document.hidden;
  // the pointer leans the stack's centre; it eases back when the pointer leaves
  const lean = { x: 0, tx: 0 };

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    // a soft field: the prototype's own cap (1.5, and 1700 px on the long side) loses nothing
    scale = Math.min(window.devicePixelRatio || 1, 1.5, 1700 / Math.max(W, H));
    canvas.width = Math.max(1, Math.round(W * scale));
    canvas.height = Math.max(1, Math.round(H * scale));
  }

  function draw() {
    if (!gl || lost) return;
    const w = canvas.width, h = canvas.height;
    gl.useProgram(program);
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.resolution, w, h);
    gl.uniform1f(U.span, Math.max(w, h));
    gl.uniform3fv(U.ground, rgb(v["colour.ground"]));
    gl.uniform3fv(U.glowColor, rgb(v["colour.glow"]));
    gl.uniform1f(U.count, Math.round(v["shape.arches"]));
    gl.uniform1f(U.phase, reduced ? 0 : phase);
    gl.uniform1f(U.spacing, v["shape.spread"] / 100);
    gl.uniform1f(U.curve, v["shape.curve"] / 100);
    gl.uniform1f(U.faceDepth, v["shape.face"] / 100);
    gl.uniform1f(U.glowSpread, v["light.halo"] / 100);
    gl.uniform1f(U.glowStrength, v["light.strength"] / 100);
    gl.uniform1f(U.center, FIXED.center / 100 + lean.x * 0.08);
    for (const k of ["position", "alternateFaces", "rimWidth", "brightness", "softness", "grain"]) gl.uniform1f(U[k], FIXED[k] / 100);
    gl.uniform1f(U.amplitude, reduced ? 0 : v["motion.drift"] / 100);
    // the grain keeps its size in CSS pixels whatever the render scale
    gl.uniform1f(U.grainScale, Math.max(1, scale));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // the prototype's float: a slow phase, drawn at 30 frames a second
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.06, Math.max(0, (now - last) / 1000));
    last = now;
    acc += dt;
    const moving = Math.abs(lean.tx - lean.x) > 0.0005;
    if (acc < 1 / 30) return;
    phase += acc * (v["motion.speed"] / 100);
    lean.x += (lean.tx - lean.x) * (1 - Math.exp(-acc * 3));
    acc = 0;
    if (v["motion.speed"] > 0 && v["motion.drift"] > 0) draw();
    else if (moving) draw();
  }

  function sync() {
    const run = !reduced && onScreen && tabVisible && !!gl;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const onMove = (e) => {
    if (reduced) return;
    const r = host.getBoundingClientRect();
    lean.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
  };
  const onLeave = () => (lean.tx = 0);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);

  const onLost = (e) => {
    e.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    lost = false;
    try {
      setup();
      draw();
    } catch {
      gl = null;
    }
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  const ro = new ResizeObserver(() => {
    resize();
    draw();
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
      canvas.style.background = v["colour.ground"];
      draw();
    },
    action() {},
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (gl) {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      canvas.remove();
    },
  };
}
