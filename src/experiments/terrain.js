/* Terrain: contour lines over a landscape that never ends.

   A slow flight down a winding valley through procedural mountains. The
   ground is never drawn as a mesh: every pixel works out its own height
   (fbm in the shader) and lights up where that height crosses a contour, so
   the lines stay crisp at any distance (fwidth keeps them a set number of
   pixels wide). Every fifth line is an index contour, the summits can glow
   lime, and the far hills fade into darkness under a low sun. */

import * as THREE from "three";

export const params = {
  land: {
    height: [5.5, 1, 12, 0.1],
    frequency: [0.085, 0.03, 0.2, 0.001],
  },
  contours: {
    spacing: [0.25, 0.08, 0.8, 0.01],
    lineWidth: [1.3, 0.5, 4, 0.1],
    lineColour: "#d9e2d2",
    peaks: true,
  },
  flight: {
    speed: [1.6, 0, 8, 0.1],
    cameraHeight: [4.2, 0.6, 9, 0.1],
  },
  atmosphere: {
    fog: [0.022, 0, 0.06, 0.001],
    sun: true,
    ground: "#0d0d0d",
  },
};

const LIME = "#a8ff66";
const CELL = 0.2; // grid spacing; the ground moves in whole cells so it never swims
const DEG = Math.PI / 180;

/* Simplex noise (Ashima / Gustavson), fbm, and the valley the camera flies. */
const NOISE = /* glsl */ `
  uniform float uHeight;
  uniform float uFreq;
  uniform float uSnap;
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    const mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      s += a * snoise(p);
      p = r * p * 1.93 + 17.1;
      a *= 0.44;
    }
    return s;
  }
  float pathX(float a) { return sin(a * 0.031) * 7.0 + sin(a * 0.0127 + 1.3) * 11.0; }
  // world xz -> height. a = distance along the flight, so the land is fixed
  // in the world while the camera flies through it.
  float terrain(vec2 xz) {
    float a = uSnap - xz.y;
    vec2 p = vec2(xz.x, a) * uFreq;
    vec2 w = vec2(snoise(p * 0.37 + 3.1), snoise(p * 0.37 - 8.3));
    float n = fbm(p + w * 0.55);
    float h = n * 0.95 + 0.42;
    h = log(1.0 + exp(7.0 * h)) / 7.0;               // a soft floor: no dead plateaus
    h = h * h * (1.5 - 0.5 * min(h, 1.4));
    float valley = smoothstep(1.0, 10.0, abs(xz.x - pathX(a)));
    return h * mix(0.28, 1.0, valley) * uHeight;
  }
`;

const ATMOS = /* glsl */ `
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunOn;
  vec3 atmosphere(vec3 d) {
    float s = max(dot(d, uSunDir), 0.0);
    float horizon = exp(-abs(d.y - uSunDir.y + 0.012) * 38.0);
    float glow = pow(s, 900.0) * 0.55 + pow(s, 110.0) * 0.15 + pow(s, 12.0) * horizon * 0.09;
    return uGround + uSunColor * glow * uSunOn;
  }
`;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  host.append(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch {
    canvas.remove();
    const note = document.createElement("p");
    note.textContent = "This piece needs WebGL, which this browser has turned off.";
    note.style.cssText = "position:absolute;inset:auto 0 50% 0;margin:0;text-align:center;color:#d9e2d2;opacity:.7;";
    host.append(note);
    return { update() {}, action() {}, destroy: () => note.remove() };
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

  const uniforms = {
    uHeight: { value: v["land.height"] },
    uFreq: { value: v["land.frequency"] },
    uSnap: { value: 0 },
    uSpacing: { value: v["contours.spacing"] },
    uWidth: { value: v["contours.lineWidth"] * dpr },
    uLine: { value: new THREE.Color(v["contours.lineColour"]) },
    uPeak: { value: new THREE.Color(LIME) },
    uPeaks: { value: v["contours.peaks"] ? 1 : 0 },
    uFog: { value: v["atmosphere.fog"] },
    uGround: { value: new THREE.Color(v["atmosphere.ground"]) },
    uSunColor: { value: new THREE.Color(v["contours.lineColour"]) },
    uSunDir: { value: new THREE.Vector3(0, 0.035, -1).normalize() },
    uSunOn: { value: v["atmosphere.sun"] ? 1 : 0 },
  };

  // The ground: a grid that rides with the camera, rows laid near to far so
  // the depth test throws away the hidden hills early.
  const W = 104, D = 84, NEAR = 5;
  const nx = Math.round(W / CELL), nz = Math.round(D / CELL);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  let p = 0;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      pos[p++] = -W / 2 + i * CELL;
      pos[p++] = 0;
      pos[p++] = NEAR - j * CELL;
    }
  }
  const index = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const groundGeo = new THREE.BufferGeometry();
  groundGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  groundGeo.setIndex(index);

  const groundMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      ${NOISE}
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y = terrain(wp.xz);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${ATMOS}
      uniform float uSpacing;
      uniform float uWidth;
      uniform vec3 uLine;
      uniform vec3 uPeak;
      uniform float uPeaks;
      uniform float uFog;
      varying vec3 vWorld;
      void main() {
        // The grid only roughly follows the land, and on steep slopes its
        // facets would put a zigzag in every line. So take one secant step
        // along this pixel's view ray onto the true surface; where the ray
        // only grazes a ridge and the step runs away, keep the grid's height.
        vec3 ro = cameraPosition;
        vec3 ray = vWorld - ro;
        float t0 = length(ray);
        vec3 rd = ray / t0;
        float hGrid = terrain(vWorld.xz);
        float f0 = vWorld.y - hGrid;
        float t1 = t0 * 1.01;
        vec3 p1 = ro + rd * t1;
        float f1 = p1.y - terrain(p1.xz);
        float df = f1 - f0;
        float ts = abs(df) > 1e-6 ? t0 - f0 * (t1 - t0) / df : t0;
        float trust = 1.0 - smoothstep(0.03, 0.08, abs(ts - t0) / t0);
        float t = mix(t0, clamp(ts, t0 * 0.92, t0 * 1.08), trust);
        float h = mix(hGrid, (ro + rd * t).y, trust);
        float v = h / uSpacing + 0.5;                    // levels sit between, not on, the floor
        float dv = max(fwidth(v), 1e-4);
        float px = abs(fract(v + 0.5) - 0.5) / dv;      // pixels to the nearest line
        float major = 1.0 - step(0.5, mod(floor(v + 0.5), 5.0));
        float w = uWidth * mix(1.0, 1.8, major);
        float core = 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.8, px);
        float glow = exp(-px / (w * 1.4 + 1.0)) * 0.14;
        float crowd = 1.0 - smoothstep(0.1, 0.38, dv);  // lines closer than a few px fade out
        // where a near slope cuts across a far one, let the lines stop short
        // of the edge instead of sparkling along it
        float edge = smoothstep(0.015, 0.06, fwidth(t0) / t0);
        float ink = (core + glow) * mix(0.5, 1.0, major) * crowd * (1.0 - edge);

        float peak = smoothstep(0.74, 0.78, h / max(uHeight, 1e-3)) * uPeaks;
        vec3 line = mix(uLine, uPeak, peak);
        ink *= 1.0 + peak * 0.5;
        // a faint fill on the summits, so lime reads as a place, not a stroke
        vec3 col = uGround + line * ink + uPeak * peak * 0.008;

        float fog = 1.0 - exp(-pow(t * uFog, 1.6));
        col = mix(col, atmosphere(rd), clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.frustumCulled = false;
  scene.add(ground);

  // The sky: darkness, and a low sun on the horizon ahead.
  const skyGeo = new THREE.SphereGeometry(300, 48, 24);
  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${ATMOS}
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = atmosphere(d) * mix(1.0, 0.85, smoothstep(0.0, 0.5, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  const pathX = (a) => Math.sin(a * 0.031) * 7 + Math.sin(a * 0.0127 + 1.3) * 11;
  let travel = 40; // distance flown
  let look = { x: 0, y: 0 }; // pointer look offset, eased
  let pointer = null;

  const place = () => {
    const snap = Math.floor(travel / CELL) * CELL;
    uniforms.uSnap.value = snap;
    const camZ = -(travel - snap);
    const camX = pathX(travel);
    const height = v["land.height"] * 0.3 + v["flight.cameraHeight"];
    camera.position.set(camX, height, camZ);
    sky.position.copy(camera.position);
    // look down the valley, a little below the horizon
    const ahead = 14;
    const tx = pathX(travel + ahead);
    const yaw = Math.atan2(tx - camX, ahead) + look.x;
    // slide the grid (in whole cells) toward where the camera is looking
    ground.position.set(Math.round((camX + Math.sin(yaw) * D * 0.4) / CELL) * CELL, 0, 0);
    const pitch = -Math.atan2(height * 0.42 + (camera.aspect < 0.8 ? 2.6 : 0.6), ahead) + look.y;
    camera.rotation.set(0, 0, 0);
    camera.rotation.order = "YXZ";
    camera.rotation.y = -yaw;
    camera.rotation.x = pitch;
    // the sun stays put in the world, low and dead ahead of the valley's run
    uniforms.uSunDir.value.set(-0.12, 0.012, -1).normalize();
  };

  const apply = () => {
    uniforms.uHeight.value = v["land.height"];
    uniforms.uFreq.value = v["land.frequency"];
    uniforms.uSpacing.value = v["contours.spacing"];
    uniforms.uWidth.value = v["contours.lineWidth"] * renderer.getPixelRatio();
    uniforms.uLine.value.set(v["contours.lineColour"]);
    uniforms.uSunColor.value.set(v["contours.lineColour"]);
    uniforms.uPeaks.value = v["contours.peaks"] ? 1 : 0;
    uniforms.uFog.value = v["atmosphere.fog"];
    uniforms.uGround.value.set(v["atmosphere.ground"]);
    uniforms.uSunOn.value = v["atmosphere.sun"] ? 1 : 0;
  };

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 64 : 50; // a phone held upright sees a little wider
    camera.updateProjectionMatrix();
  };

  const render = () => {
    place();
    renderer.render(scene, camera);
  };

  let raf = 0;
  let last = performance.now();
  let visible = document.visibilityState !== "hidden";
  let onscreen = true;
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    travel += dt * v["flight.speed"];
    const k = 1 - Math.exp(-dt * 2.5);
    const tx = pointer ? pointer.x * 5 * DEG : 0;
    const ty = pointer ? -pointer.y * 2.5 * DEG : 0;
    look.x += (tx - look.x) * k;
    look.y += (ty - look.y) * k;
    render();
    wake();
  };
  const wake = () => {
    if (raf || reduced || !visible || !onscreen) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const ro = new ResizeObserver(() => {
    resize();
    render();
  });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => {
    onscreen = e.isIntersecting;
    wake();
  });
  io.observe(host);
  const onVisibility = () => {
    visible = document.visibilityState !== "hidden";
    wake();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onPointer = (e) => {
    const r = host.getBoundingClientRect();
    pointer = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 };
  };
  const onLeave = () => (pointer = null);
  host.addEventListener("pointermove", onPointer);
  host.addEventListener("pointerleave", onLeave);

  apply();
  resize();
  render();
  wake();

  return {
    update(next) {
      Object.assign(v, next);
      apply();
      render();
    },
    action() {},
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onPointer);
      host.removeEventListener("pointerleave", onLeave);
      groundGeo.dispose();
      groundMat.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
