/* Lab report.

   From a client study (its round one, the lab report homepage): the hero was
   a path-traced dental sheet resting on black acrylic. Here it is live, the
   studio's real-time version of that sheet, drawn for the three things that
   made the photos read as real:

   - Translucency from thickness. A first pass adds up how much sheet each
     pixel's ray passes through (back faces add their distance, front faces
     take theirs away, so the sum is exact for a closed shell, in any order).
     Opacity follows that thickness (Beer-Lambert): a wall seen head-on is
     see-through, a wall seen edge-on, the cut rim and the cusps read white.
   - The layer lines. A thermoformed sheet takes the print steps of the model
     it was formed on: contours of constant height, rings around every cusp,
     drawn from the height in the shader so they stay sharp at any size.
     Where they would be finer than two pixels they fade into a satin sheen.
   - Softbox light. Four broad lights fixed to the studio, not the sheet, so
     the highlights travel across the lines as it turns.

   On top of that, the acrylic: the same two passes again, mirrored about the
   floor under the sheet and fading with depth, drawn first; the sheet itself
   is composited over it. It turns slowly on its own; drag to turn it (a
   finger only spins it). The page's copy, header and photos are left out,
   and the model's file carries no names (public/experiments/lab-report/). */

import * as THREE from "three";

export const params = {
  sheet: {
    translucency: [0.45, 0.05, 2, 0.01],
    body: [0.7, 0, 1.5, 0.01],
  },
  lines: {
    spacing: [0.36, 0.1, 1.2, 0.01],
    ridge: [0.5, 0, 1.5, 0.01],
  },
  light: {
    gloss: [0.24, 0.04, 0.8, 0.01],
    exposure: [1, 0.3, 2, 0.01],
  },
  motion: {
    speed: [9, 0, 40, 0.5],
    pitch: [46, -5, 80, 1],
  },
  stage: {
    reflection: [0.42, 0, 1, 0.01],
    ground: "#050606",
  },
  front: { type: "action", label: "Face front" },
};

const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const MODEL_URL = new URL("experiments/lab-report/sheet.glb", ROOT).href;

// the source's settings that stay put
const AMBIENT = 0.16, SCATTER = 0.14, YAW0 = -28, FALL = 3.2;
const LIGHTS = [
  // world direction (toward the light), intensity, size (widens the highlight like a softbox)
  { dir: [-0.45, 0.85, 0.35], k: 3.4, size: 0.07 }, // key, high front left
  { dir: [0.05, 1.0, -0.05], k: 1.8, size: 0.18 }, // overhead
  { dir: [0.3, 0.5, -0.85], k: 2.8, size: 0.05 }, // rim, behind
  { dir: [0.92, 0.22, 0.35], k: 1.0, size: 0.12 }, // fill, right
];

const THICK_VERT = /* glsl */ `
uniform float uRef;
varying float vDist;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz) - uRef;
  gl_Position = projectionMatrix * mv;
}`;
const THICK_FRAG = /* glsl */ `
varying float vDist;
void main() {
  gl_FragColor = vec4(gl_FrontFacing ? -vDist : vDist, 0.0, 0.0, 1.0);
}`;

const SHADE_VERT = /* glsl */ `
uniform mat3 uNormalWorld;
uniform mat4 uRest;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vHeight;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = uNormalWorld * normal;
  vHeight = (uRest * vec4(position, 1.0)).y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SHADE_FRAG = /* glsl */ `
uniform sampler2D uThick;
uniform vec2 uRes;
uniform vec3 uUp;
uniform float uSigma, uPeriod, uRidge, uRough, uBody, uExposure, uFlip, uAmbient, uScatter;
uniform float uMirror, uFloor, uFall, uRefl;
uniform vec3 uLightDir[4];
uniform float uLightK[4];
uniform float uLightSize[4];
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vHeight;

const float PI = 3.14159265;
float ggx(float NoH, float a) { float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float smith(float NoV, float NoL, float a) { float k = a * 0.5; return 0.25 / ((NoV * (1.0 - k) + k) * (NoL * (1.0 - k) + k)); }

void main() {
  vec3 N = normalize(vWorldNormal) * uFlip;
  vec3 V = normalize(cameraPosition - vWorldPos);

  // the layer lines: rings of constant height, a soft terrace profile
  float h = vHeight / uPeriod;
  float fw = fwidth(h);
  float vis = 1.0 - smoothstep(0.38, 0.72, fw);
  float ph = fract(h);
  float s = sin(6.2831853 * ph) + 0.4 * sin(12.566371 * ph);
  vec3 g = uUp - N * dot(N, uUp);
  vec3 Nl = normalize(N - uRidge * vis * s * g);

  // the sheet's body: light scattered inside a milky sheet, opacity from thickness
  float t = abs(texture2D(uThick, gl_FragCoord.xy / uRes).r);
  float alpha = 1.0 - exp(-uSigma * t);
  vec3 body = vec3(uAmbient);
  for (int i = 0; i < 4; i++) {
    float w = clamp((dot(N, uLightDir[i]) + 0.55) / 1.55, 0.0, 1.0);
    body += vec3(uScatter * uLightK[i] * w);
  }
  body *= uBody * (1.0 + 0.05 * vis * s * length(g));

  // the coat: broad softbox highlights, broken up by the lines
  float NoV = max(dot(Nl, V), 1e-3);
  vec3 spec = vec3(0.0);
  float a0 = uRough * uRough;
  for (int i = 0; i < 4; i++) {
    vec3 L = uLightDir[i];
    vec3 H = normalize(L + V);
    float NoL = max(dot(Nl, L), 0.0);
    float NoH = max(dot(Nl, H), 0.0);
    float VoH = max(dot(V, H), 0.0);
    float a = clamp(sqrt(a0 * a0 + uLightSize[i] * uLightSize[i]), 0.02, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - VoH, 5.0);
    spec += vec3(uLightK[i] * ggx(NoH, a) * smith(NoV, NoL, a) * NoL * F);
  }
  spec += vec3(0.05 * pow(1.0 - NoV, 3.0));

  // premultiplied
  float sp = max(spec.r, max(spec.g, spec.b));
  float A = clamp(alpha + (1.0 - alpha) * sp, 0.0, 1.0);
  vec3 c = (body * alpha + spec) / max(A, 1e-4);
  c *= uExposure;
  c = c / (1.0 + 0.18 * c);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  // in the acrylic: the mirrored sheet, fading with its depth under the floor
  float k = uMirror > 0.5 ? uRefl * exp(-max(uFloor - vHeight, 0.0) / uFall) : 1.0;
  gl_FragColor = vec4(c * A, A) * k;
}`;

const DEG = Math.PI / 180;

/* The sheet is one small binary glTF (quantized positions and normals,
   two primitives), read here directly rather than through three's loader. */
async function loadGLB(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const bin = 20 + jsonLen + 8;
  const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const views = new Map();
  const accessor = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], T = TYPES[a.componentType], n = SIZE[a.type], B = T.BYTES_PER_ELEMENT;
    const start = bin + (bv.byteOffset || 0);
    if (!views.has(a.bufferView)) views.set(a.bufferView, new T(buf.slice(start, start + bv.byteLength)));
    const arr = views.get(a.bufferView);
    if (bv.byteStride && bv.byteStride !== n * B) {
      const ib = new THREE.InterleavedBuffer(arr, bv.byteStride / B);
      return new THREE.InterleavedBufferAttribute(ib, n, (a.byteOffset || 0) / B, Boolean(a.normalized));
    }
    const off = (a.byteOffset || 0) / B;
    return new THREE.BufferAttribute(arr.subarray(off, off + a.count * n), n, Boolean(a.normalized));
  };
  const nodes = json.nodes.map((nd) => {
    const o = new THREE.Object3D();
    if (nd.matrix) new THREE.Matrix4().fromArray(nd.matrix).decompose(o.position, o.quaternion, o.scale);
    if (nd.translation) o.position.fromArray(nd.translation);
    if (nd.rotation) o.quaternion.fromArray(nd.rotation);
    if (nd.scale) o.scale.fromArray(nd.scale);
    if (nd.mesh !== undefined) for (const pr of json.meshes[nd.mesh].primitives) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", accessor(pr.attributes.POSITION));
      if (pr.attributes.NORMAL !== undefined) g.setAttribute("normal", accessor(pr.attributes.NORMAL));
      if (pr.indices !== undefined) g.setIndex(accessor(pr.indices));
      o.add(new THREE.Mesh(g));
    }
    return o;
  });
  json.nodes.forEach((nd, i) => (nd.children || []).forEach((c) => nodes[i].add(nodes[c])));
  const root = new THREE.Group();
  for (const i of json.scenes[json.scene || 0].nodes) root.add(nodes[i]);
  return root;
}

const clampPitch = (p) => Math.min(80, Math.max(-5, p));

/* Is the mesh wound so its front faces point the way its normals do? Checked
   on a sample of triangles; -1 means draw the back faces as the outside. */
function windingFlip(mesh) {
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), f = new THREE.Vector3();
  let vote = 0;
  const tris = idx ? idx.count / 3 : pos.count / 3;
  for (let i = 0; i < tris; i += Math.max(1, Math.floor(tris / 400))) {
    const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    f.subVectors(b, a).cross(c.clone().sub(a));
    n.fromBufferAttribute(nor, i0);
    vote += Math.sign(f.dot(n));
  }
  return vote >= 0 ? 1 : -1;
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;background:${v["stage.ground"]}`;
  host.append(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  } catch {
    return { update() {}, action() {}, destroy: () => canvas.remove() };
  }
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(20, 1, 10, 2000);
  const spin = new THREE.Object3D();
  const mirror = new THREE.Object3D();
  mirror.matrixAutoUpdate = false;
  scene.add(spin, mirror);

  const thickRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4, depthBuffer: false });
  const sheetRT = new THREE.WebGLRenderTarget(2, 2, { samples: 4 });
  const thickMat = new THREE.ShaderMaterial({
    vertexShader: THICK_VERT,
    fragmentShader: THICK_FRAG,
    uniforms: { uRef: { value: 0 } },
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  const shadeMat = new THREE.ShaderMaterial({
    vertexShader: SHADE_VERT,
    fragmentShader: SHADE_FRAG,
    uniforms: {
      uThick: { value: thickRT.texture },
      uRes: { value: new THREE.Vector2() },
      uUp: { value: new THREE.Vector3() },
      uNormalWorld: { value: new THREE.Matrix3() },
      uRest: { value: new THREE.Matrix4() },
      uSigma: { value: 0 }, uPeriod: { value: 0 }, uRidge: { value: 0 }, uRough: { value: 0 },
      uBody: { value: 0 }, uExposure: { value: 0 }, uFlip: { value: 1 },
      uAmbient: { value: AMBIENT }, uScatter: { value: SCATTER },
      uMirror: { value: 0 }, uFloor: { value: 0 }, uFall: { value: FALL }, uRefl: { value: 0 },
      uLightDir: { value: LIGHTS.map((l) => new THREE.Vector3(...l.dir).normalize()) },
      uLightK: { value: LIGHTS.map((l) => l.k) },
      uLightSize: { value: LIGHTS.map((l) => l.size) },
    },
    blending: THREE.NoBlending,
  });
  // the sheet laid over its reflection, premultiplied
  const overMat = new THREE.ShaderMaterial({
    uniforms: { tSheet: { value: sheetRT.texture } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: "uniform sampler2D tSheet; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSheet, vUv); }",
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const overScene = new THREE.Scene();
  const overCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const overQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), overMat);
  overQuad.frustumCulled = false;
  overScene.add(overQuad);

  let meshes = [], mirrorMeshes = [], span = null, floorY = 0, dead = false, ready = false;
  let yaw = YAW0, pitch = clampPitch(v["motion.pitch"]), vyaw = 0, vpitch = 0, dragging = null, lastInput = -1e9;
  let raf = 0, last = -1, onScreen = true, tabVisible = !document.hidden;
  const size = { w: 1, h: 1 };
  const _inv = new THREE.Matrix4(), _refl = new THREE.Matrix4(), _t = new THREE.Matrix4();

  function applyUniforms() {
    const u = shadeMat.uniforms;
    u.uSigma.value = v["sheet.translucency"];
    u.uBody.value = v["sheet.body"];
    u.uPeriod.value = v["lines.spacing"];
    u.uRidge.value = v["lines.ridge"];
    u.uRough.value = v["light.gloss"];
    u.uExposure.value = v["light.exposure"];
    u.uRefl.value = v["stage.reflection"];
    canvas.style.background = v["stage.ground"];
  }
  applyUniforms();

  loadGLB(MODEL_URL).then((model) => {
    if (dead) return;
    const holder = new THREE.Object3D();
    holder.scale.setScalar(1000); // metres to millimetres: world units are mm
    holder.rotation.z = Math.PI; // crowns up: the outside of the sheet faces the camera
    holder.add(model);
    spin.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    holder.position.sub(box.getCenter(new THREE.Vector3()));
    holder.updateMatrixWorld(true);
    model.traverse((o) => o.isMesh && meshes.push(o));
    span = box.getSize(new THREE.Vector3());
    floorY = -span.y / 2;
    shadeMat.uniforms.uFlip.value = windingFlip(meshes[0]);
    shadeMat.side = shadeMat.uniforms.uFlip.value > 0 ? THREE.FrontSide : THREE.BackSide;
    shadeMat.uniforms.uFloor.value = floorY;
    // the reflection: the same meshes (shared geometry) under a mirrored parent
    const twin = holder.clone(true);
    mirror.add(twin);
    twin.traverse((o) => o.isMesh && mirrorMeshes.push(o));
    for (const o of [...meshes, ...mirrorMeshes]) o.frustumCulled = false;
    ready = true;
    resize();
    loop();
  }).catch(() => {});

  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    size.w = w;
    size.h = h;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    thickRT.setSize(bw, bh);
    sheetRT.setSize(bw, bh);
    shadeMat.uniforms.uRes.value.set(bw, bh);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frame();
    draw();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // the camera sits where the arch fits through a whole turn at this tilt, with room under it for the acrylic
  function frame() {
    if (!span) return;
    const R = 0.5 * Math.hypot(span.x, span.z);
    const tilt = Math.abs(pitch) * DEG;
    const across = R * 1.06;
    const tall = (R * Math.sin(tilt) + 0.5 * span.y * Math.cos(tilt)) * 1.25;
    const vfov = camera.fov * DEG;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const d = Math.max(across / Math.tan(hfov / 2), tall / Math.tan(vfov / 2)) + 0.2 * R;
    // the sheet a touch above the middle, so its reflection has somewhere to go
    spin.position.set(0, 0.16 * R * Math.cos(tilt) + 0.1 * span.y, 0);
    camera.position.set(0, 0, d);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    thickMat.uniforms.uRef.value = d;
  }

  function pass(list, target, isMirror) {
    const u = shadeMat.uniforms, m = list[0];
    _inv.copy(spin.matrixWorld).invert();
    u.uRest.value.multiplyMatrices(_inv, m.matrixWorld);
    u.uNormalWorld.value.getNormalMatrix(m.matrixWorld);
    u.uMirror.value = isMirror ? 1 : 0;
    spin.visible = !isMirror;
    mirror.visible = isMirror;
    // pass one: how much sheet each pixel looks through
    for (const o of list) o.material = thickMat;
    renderer.setRenderTarget(thickRT);
    renderer.clear(true, false, false);
    renderer.render(scene, camera);
    // pass two: the sheet itself
    for (const o of list) o.material = shadeMat;
    renderer.setRenderTarget(target);
    if (target) renderer.clear(true, true, false);
    else renderer.clear(false, true, false);
    renderer.render(scene, camera);
  }

  function draw() {
    renderer.setRenderTarget(null);
    renderer.clear(true, true, false);
    if (!ready) return;
    spin.rotation.set(pitch * DEG, yaw * DEG, 0, "XYZ");
    spin.updateMatrixWorld(true);
    shadeMat.uniforms.uUp.value.set(0, 1, 0).applyQuaternion(spin.quaternion);
    // the mirror: the sheet reflected about the floor under it, in the sheet's own upright frame
    _refl.makeTranslation(0, floorY, 0).multiply(_t.makeScale(1, -1, 1)).multiply(_t.makeTranslation(0, -floorY, 0));
    mirror.matrix.multiplyMatrices(spin.matrixWorld, _refl);
    mirror.matrixWorldNeedsUpdate = true;
    mirror.updateMatrixWorld(true);
    if (v["stage.reflection"] > 0.001) pass(mirrorMeshes, null, true);
    pass(meshes, sheetRT, false);
    spin.visible = mirror.visible = true;
    renderer.setRenderTarget(null);
    renderer.render(overScene, overCam);
  }

  function tick(now) {
    raf = 0;
    const dt = last < 0 ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!dragging) {
      if (Math.abs(vyaw) > 0.01 || Math.abs(vpitch) > 0.01) {
        yaw += vyaw * dt;
        pitch = clampPitch(pitch + vpitch * dt);
        const k = Math.exp(-dt * 3.5);
        vyaw *= k;
        vpitch *= k;
        if (Math.abs(vpitch) > 0.01) frame();
      } else if (!reduced && now - lastInput > 2500) {
        yaw += v["motion.speed"] * dt;
      }
    }
    draw();
    if (running()) raf = requestAnimationFrame(tick);
  }
  // reduced motion: no turning on its own, but a drag still turns it, and its glide plays out
  const running = () => ready && onScreen && tabVisible && (!reduced || dragging || Math.abs(vyaw) > 0.01 || Math.abs(vpitch) > 0.01);
  function loop() {
    if (!raf && running()) {
      last = -1;
      raf = requestAnimationFrame(tick);
    }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // drag to turn: sideways spins it, up and down tilts it (mouse and pen; a finger only spins, so the page still scrolls)
  const onDown = (e) => {
    if (!ready) return;
    dragging = { x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType === "touch" };
    vyaw = vpitch = 0;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
    loop();
  };
  const onMove = (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    const dts = Math.max(0.001, (now - dragging.t) / 1000);
    const k = 360 / Math.max(320, size.w);
    yaw += dx * k;
    if (!dragging.touch) pitch = clampPitch(pitch + dy * k * 0.6);
    vyaw = ((dx * k) / dts) * 0.5 + vyaw * 0.5;
    vpitch = dragging.touch ? 0 : ((dy * k * 0.6) / dts) * 0.5 + vpitch * 0.5;
    dragging.x = e.clientX;
    dragging.y = e.clientY;
    dragging.t = now;
    lastInput = now;
    if (!dragging.touch) frame();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = null;
    lastInput = performance.now();
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

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

  return {
    update(values, path) {
      Object.assign(v, values);
      applyUniforms();
      if (path === null || path === "motion.pitch") {
        pitch = clampPitch(v["motion.pitch"]);
        vpitch = 0;
        frame();
      }
      if (!raf) draw();
    },
    action(name) {
      if (name !== "front") return;
      yaw = YAW0;
      pitch = clampPitch(v["motion.pitch"]);
      vyaw = vpitch = 0;
      lastInput = performance.now();
      frame();
      if (!raf) draw();
    },
    destroy() {
      dead = true;
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      const geos = new Set();
      for (const o of [...meshes, ...mirrorMeshes]) geos.add(o.geometry);
      for (const g of geos) g.dispose();
      thickRT.dispose();
      sheetRT.dispose();
      thickMat.dispose();
      shadeMat.dispose();
      overMat.dispose();
      overQuad.geometry.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
