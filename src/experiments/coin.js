/* Coin.

   Ported from a collector coin built for a loyalty programme (a page in the
   AI Fun folder): a lathed disc with rounded bevels, its face a heightmap
   pressed into a dense mesh so the design is real relief rather than a
   decal, in metal tiers lit by a dim studio with round softboxes, tilted
   back and swaying as if a cursor drifted over it. The original's face
   carried the programme's logo, its tier and a member's name; none of that
   is here. Both faces are new and wordless: on the front a faceted star on
   a raised medallion inside a sunburst, on the back an engine turned
   rosette round a polished boss, each inside a beaded border and a raised
   rim, with a reeded edge.

   Toward real metal: it is finished as a proof is, the field polished to a
   mirror and the relief frosted, so the star holds the light while the
   field throws back the dark studio and flashes as it turns through a
   softbox. Hover to tip it toward the cursor; drag to spin it. */

import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

export const params = {
  metal: {
    finish: { type: "select", options: ["Gold", "Silver", "Bronze", "Onyx"] },
    frost: [0.4, 0.05, 0.8, 0.01],
    relief: [0.02, 0, 0.05, 0.001],
  },
  face: {
    points: [8, 3, 16, 1],
  },
  motion: {
    spin: { type: "select", options: ["Turntable", "Top", "Still"] },
    speed: [0.3, 0, 2.5, 0.01],
    wobble: [0.45, 0, 1, 0.01],
  },
  view: {
    tilt: [58, 0, 90, 1],
    zoom: [1, 0.6, 1.5, 0.01],
  },
  colour: {
    ground: "#0d0d0d",
  },
};

/* ---- the coin's measurements, radius 1 ---- */
const R = 1; // outer radius
const HALF_T = 0.075; // half the thickness at the rim
const RECESS = 0.02; // how far the field sits below the rim
const FIELD_R = 0.9; // the field's radius, inside the rim
const BEVEL = 0.024;
const REEDS = 150;
const REED_DEPTH = 0.0055;
const TEX = 1024; // the face maps
const BASE_DEPTH = 0.02; // the normal maps are drawn for this relief, then scaled
const REST_ROLL = -0.19;

const METALS = {
  // linear base colours near measured reflectance, nudged warmer where the tone curve cools them
  Gold: { color: [1.0, 0.72, 0.3], metalness: 1 },
  Silver: { color: [0.95, 0.94, 0.92], metalness: 1 },
  Bronze: { color: [0.78, 0.53, 0.27], metalness: 1 },
  Onyx: { color: [0.012, 0.012, 0.013], metalness: 0, clearcoat: 1 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ridge = (x, c, w) => {
  const t = clamp(1 - Math.abs(x - c) / w, 0, 1);
  return t * t * (3 - 2 * t);
};
const tri = (a) => 1 - 2 * Math.abs(a - Math.floor(a) - 0.5);
// a seeded value noise, for the faint unevenness every real polish has
function valueNoise(size, cells, seed) {
  const grid = new Float32Array(cells * cells);
  let s = seed;
  for (let i = 0; i < grid.length; i++) {
    s = (s * 16807) % 2147483647;
    grid[i] = s / 2147483647;
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i, j) => grid[(j % cells) * cells + (i % cells)];
      const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
      out[y * size + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  return out;
}

/* ---- the faces, as height (0..1) and frost (0 polished .. 1 frosted) ---- */
function drawFace(kind, points) {
  const S = TEX;
  const height = new Float32Array(S * S), frost = new Float32Array(S * S);
  const beadStep = (Math.PI * 2) / 96, beadR = 0.0165, beadRing = 0.928;
  const beta = Math.PI / points;
  const ro = 0.255, ri = ro * (points === 3 ? 0.34 : points === 4 ? 0.38 : 0.42);
  for (let j = 0; j < S; j++) {
    const y = ((j + 0.5) / S) * 2 - 1;
    for (let i = 0; i < S; i++) {
      const x = ((i + 0.5) / S) * 2 - 1;
      const r = Math.hypot(x, y);
      if (r > 0.97) continue;
      const th = Math.atan2(y, x);
      let h = 0, f = 0;
      // the beaded border
      const bc = Math.round(th / beadStep) * beadStep;
      const bd = Math.hypot(x - beadRing * Math.cos(bc), y - beadRing * Math.sin(bc));
      if (bd < beadR) {
        h = 0.55 * Math.sqrt(1 - (bd / beadR) ** 2);
        f = 1;
      }
      // a fine raised line inside it
      const line = ridge(r, 0.878, 0.007);
      if (line > 0) {
        h = Math.max(h, 0.42 * line);
        f = Math.max(f, line);
      }
      if (kind === "star") {
        // the sunburst: fine prisms running out from the medallion
        const band = smooth(0.345, 0.37, r) * (1 - smooth(0.82, 0.845, r));
        if (band > 0) {
          h = Math.max(h, 0.13 * (0.5 - 0.5 * Math.cos(th * 112)) * band);
          f = Math.max(f, 0.45 * band);
        }
        // the medallion's border and its polished plateau
        const ring = ridge(r, 0.318, 0.019);
        if (ring > 0) {
          h = Math.max(h, 0.5 * ring);
          f = Math.max(f, ring);
        }
        if (r < 0.302) h = Math.max(h, 0.1 * smooth(0.302, 0.296, r));
        // the faceted star, a point straight up: one flat facet each side of every point
        let phi = (((th - Math.PI / 2) % (2 * beta)) + 2 * beta) % (2 * beta);
        if (phi > beta) phi = 2 * beta - phi;
        const rs = (ro * ri * Math.sin(beta)) / ((ro - ri * Math.cos(beta)) * Math.sin(phi) + ri * Math.sin(beta) * Math.cos(phi));
        if (r < rs) {
          h = Math.max(h, 0.2 + 0.8 * (1 - r / rs));
          f = 1;
        }
      } else {
        // engine turning: rings that ripple round, cut into the field
        const band = smooth(0.25, 0.275, r) * (1 - smooth(0.82, 0.845, r));
        if (band > 0) {
          h = Math.max(h, 0.12 * tri(r * 40 + 0.85 * Math.sin(th * 12)) * band);
          f = Math.max(f, 0.3 * band);
        }
        const ring = ridge(r, 0.218, 0.02);
        if (ring > 0) {
          h = Math.max(h, 0.6 * ring);
          f = Math.max(f, ring);
        }
        // the boss: a shallow polished dome
        if (r < 0.198) h = Math.max(h, 0.1 + 0.32 * Math.sqrt(1 - (r / 0.198) ** 2));
      }
      height[j * S + i] = h;
      frost[j * S + i] = f;
    }
  }
  blur(height, S);
  blur(height, S);
  blur(frost, S);
  return { height, frost };
}
// a 3x3 box, in place
function blur(a, S) {
  const t = new Float32Array(a.length);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const k = j * S + i;
      t[k] = (a[k] + (i > 0 ? a[k - 1] : a[k]) + (i < S - 1 ? a[k + 1] : a[k])) / 3;
    }
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const k = j * S + i;
      a[k] = (t[k] + (j > 0 ? t[k - S] : t[k]) + (j < S - 1 ? t[k + S] : t[k])) / 3;
    }
}

function faceTextures(face) {
  const S = TEX, { height } = face;
  const disp = new Uint8Array(S * S * 4), nrm = new Uint8Array(S * S * 4);
  const texel = (2 * FIELD_R) / S;
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const k = j * S + i;
      const hx = (height[j * S + Math.min(S - 1, i + 1)] - height[j * S + Math.max(0, i - 1)]) * BASE_DEPTH / (2 * texel);
      const hy = (height[Math.min(S - 1, j + 1) * S + i] - height[Math.max(0, j - 1) * S + i]) * BASE_DEPTH / (2 * texel);
      const l = Math.hypot(hx, hy, 1);
      nrm[k * 4] = Math.round(((-hx / l) * 0.5 + 0.5) * 255);
      nrm[k * 4 + 1] = Math.round(((-hy / l) * 0.5 + 0.5) * 255);
      nrm[k * 4 + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      nrm[k * 4 + 3] = 255;
      const d = Math.round(clamp(height[k], 0, 1) * 255);
      disp[k * 4] = disp[k * 4 + 1] = disp[k * 4 + 2] = d;
      disp[k * 4 + 3] = 255;
    }
  const make = (data, srgb) => {
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { displacement: make(disp), normal: make(nrm), rough: make(new Uint8Array(S * S * 4)) };
}

// the polish: a mirror field with the faint unevenness of a real one, and the frosted relief
const SMUDGE = valueNoise(256, 6, 7);
const GRAIN = valueNoise(256, 64, 11);
function paintRoughness(tex, face, frostLevel) {
  const S = TEX, data = tex.image.data;
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const k = j * S + i, n = ((j >> 2) & 255) * 256 + ((i >> 2) & 255);
      const field = 0.05 + 0.07 * SMUDGE[n];
      const top = frostLevel * (0.9 + 0.2 * GRAIN[n]);
      const r = field + (top - field) * face.frost[k];
      data[k * 4 + 1] = Math.round(clamp(r, 0.02, 1) * 255);
      data[k * 4 + 3] = 255;
    }
  tex.needsUpdate = true;
}

/* ---- the body: a lathed rim, recessed both sides, its edge reeded ---- */
function bodyGeometry() {
  const pts = [];
  const rimIn = FIELD_R, field = HALF_T - RECESS;
  const side = (s) => {
    const p = [];
    p.push([0, field - 0.003]);
    p.push([rimIn - 0.004, field - 0.003]);
    // the rim's inner wall, filleted at its foot and its lip
    p.push([rimIn, field - 0.001]);
    p.push([rimIn + 0.004, field + 0.004]);
    p.push([rimIn + 0.01, HALF_T - 0.006]);
    p.push([rimIn + 0.016, HALF_T - 0.0015]);
    p.push([rimIn + 0.024, HALF_T]);
    // the rim's flat, then the outer bevel down to the edge
    p.push([R - BEVEL, HALF_T]);
    for (let i = 1; i <= 8; i++) {
      const a = Math.PI / 2 - (i / 8) * (Math.PI / 2);
      p.push([R - BEVEL + Math.cos(a) * BEVEL, HALF_T - BEVEL + Math.sin(a) * BEVEL]);
    }
    return p.map(([r, y]) => [r, y * s]);
  };
  const bottom = side(-1), top = side(1).reverse();
  for (const [r, y] of [...bottom, ...top]) pts.push(new THREE.Vector2(r, y));
  const segs = REEDS * 5;
  const geo = new THREE.LatheGeometry(pts, segs);
  // the reeding: grooves round the edge, fading out over the bevels
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
    const w = clamp((r - (R - BEVEL * 0.9)) / (BEVEL * 0.9), 0, 1);
    if (w <= 0) continue;
    const a = Math.atan2(z, x);
    const groove = Math.pow(0.5 - 0.5 * Math.cos(a * REEDS), 1.5);
    const nr = r - REED_DEPTH * groove * w * w;
    pos.setX(i, (x / r) * nr);
    pos.setZ(i, (z / r) * nr);
  }
  geo.computeVertexNormals();
  return toCreasedNormals(geo, (50 * Math.PI) / 180);
}

// the face: a dense disc the height map pushes up; the vertices past the field are pulled onto its edge
function faceGeometry() {
  const n = 400;
  const geo = new THREE.PlaneGeometry(2 * FIELD_R, 2 * FIELD_R, n, n);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), d = Math.hypot(x, y);
    if (d > FIELD_R) {
      const k = FIELD_R / d;
      pos.setXY(i, x * k, y * k);
      uv.setXY(i, (x * k) / (2 * FIELD_R) + 0.5, (y * k) / (2 * FIELD_R) + 0.5);
    }
  }
  return geo;
}

/* ---- the studio: a dim room, softboxes and strips, a faint horizon ---- */
function studio(renderer) {
  const boxes = [
    // [direction, half width, half height, intensity]: a big key up and to the left, strips either side, a rim
    // behind, a soft top, and a bounce card low in front for the face that turns down (the back, as it spins)
    [[-0.5, 0.78, 0.4], 0.5, 0.34, 7],
    [[0.86, 0.42, -0.1], 0.07, 0.5, 5],
    [[-0.9, 0.3, -0.25], 0.06, 0.45, 3.2],
    [[0.15, 0.45, -1], 0.5, 0.1, 2.4],
    [[0.2, 0.98, -0.1], 0.55, 0.55, 2.2],
    [[0.1, -0.25, 1], 0.6, 0.18, 0.35],
    [[0.3, -0.85, 0.42], 0.55, 0.32, 3.2],
  ];
  const v3 = (a) => `vec3(${a.map((n) => n.toFixed(4)).join(",")})`;
  const glsl = boxes
    .map(([d, w, h, k]) => {
      const c = new THREE.Vector3(...d).normalize();
      const right = new THREE.Vector3(0, 1, 0).cross(c).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const up = c.clone().cross(right).normalize();
      return `{ float f = dot(n, ${v3(c.toArray())});
        if (f > 0.0) {
          vec2 q = vec2(dot(n, ${v3(right.toArray())}), dot(n, ${v3(up.toArray())})) / f;
          vec2 e = vec2(${w.toFixed(3)}, ${h.toFixed(3)});
          float m = (1.0 - smoothstep(e.x * 0.82, e.x, abs(q.x))) * (1.0 - smoothstep(e.y * 0.82, e.y, abs(q.y)));
          c += vec3(${k.toFixed(2)}) * m * (1.0 - 0.3 * dot(q / e, q / e));
        } }`;
    })
    .join("\n");
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec3 n = normalize(vDir);
        // floor near black, a soft lift at the horizon, a dim ceiling
        vec3 c = mix(vec3(0.01), vec3(0.06), smoothstep(-0.6, 0.0, n.y));
        float hz = n.y / 0.06;
        c += vec3(0.35) * exp(-hz * hz);
        c = mix(c, vec3(0.16), smoothstep(0.05, 0.9, n.y));
        ${glsl}
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 96, 64), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0, 0.1, 100);
  scene.children[0].geometry.dispose();
  mat.dispose();
  pmrem.dispose();
  return target;
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);

  // the ground: a flat colour with a little light pooled behind the coin
  const ground = document.createElement("div");
  ground.style.cssText = "position:absolute;inset:0";
  host.append(ground);
  const paintGround = () => {
    const c = new THREE.Color(v["colour.ground"]);
    const lift = c.clone().lerp(new THREE.Color(c.getHSL({}).l > 0.5 ? "#000" : "#fff"), 0.035);
    ground.style.background = `radial-gradient(ellipse 75% 70% at 50% 45%, #${lift.getHexString()} 0%, ${v["colour.ground"]} 70%)`;
  };
  paintGround();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:pan-y";
  host.append(canvas);

  const scene = new THREE.Scene();
  const env = studio(renderer);
  scene.environment = env.texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-3, 5, 4);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(5, 2, -3);
  scene.add(key, rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  /* ---- the coin ---- */
  const front = faceTextures({ height: new Float32Array(TEX * TEX) });
  const back = faceTextures({ height: new Float32Array(TEX * TEX) });
  let frontFace = null, backFace = null;
  const metal = () => METALS[v["metal.finish"]] ?? METALS.Gold;
  const makeMaterial = (maps) =>
    new THREE.MeshPhysicalMaterial({
      metalness: 1,
      roughness: 1,
      roughnessMap: maps?.rough ?? null,
      normalMap: maps?.normal ?? null,
      displacementMap: maps?.displacement ?? null,
      displacementScale: 0,
      envMapIntensity: 1,
    });
  const bodyMat = makeMaterial(null);
  const frontMat = makeMaterial(front);
  const backMat = makeMaterial(back);
  const mats = [bodyMat, frontMat, backMat];
  function applyMaterial() {
    const m = metal();
    for (const mat of mats) {
      mat.color.setRGB(...m.color, THREE.LinearSRGBColorSpace);
      mat.metalness = m.metalness;
      mat.clearcoat = m.clearcoat ?? 0;
      mat.clearcoatRoughness = 0.04;
      mat.envMapIntensity = m.metalness ? 1 : 1.6;
    }
    bodyMat.roughness = m.metalness ? 0.12 : 0.18;
    const k = v["metal.relief"];
    for (const mat of [frontMat, backMat]) {
      mat.displacementScale = k;
      mat.normalScale.setScalar(k / BASE_DEPTH);
    }
  }

  const body = new THREE.Mesh(bodyGeometry(), bodyMat);
  const faceGeo = faceGeometry();
  const field = HALF_T - RECESS;
  const frontMesh = new THREE.Mesh(faceGeo, frontMat);
  frontMesh.rotation.x = -Math.PI / 2;
  frontMesh.position.y = field;
  const backMesh = new THREE.Mesh(faceGeo, backMat);
  backMesh.rotation.x = Math.PI / 2;
  backMesh.position.y = -field;
  const coin = new THREE.Group();
  coin.add(body, frontMesh, backMesh);
  const spinGroup = new THREE.Group();
  spinGroup.add(coin);
  scene.add(spinGroup);

  // the faces are drawn off the main beat, so a dial never stalls a frame for long
  let builtPoints = -1, builtFrost = -1, pending = 0;
  function rebuild() {
    pending = 0;
    const points = Math.round(v["face.points"]);
    if (!backFace) {
      backFace = drawFace("rosette", 8);
      const t = faceTextures(backFace);
      for (const k of ["displacement", "normal"]) {
        back[k].image.data.set(t[k].image.data);
        back[k].needsUpdate = true;
        t[k].dispose();
      }
      t.rough.dispose();
      builtFrost = -1;
    }
    if (points !== builtPoints) {
      builtPoints = points;
      frontFace = drawFace("star", points);
      const t = faceTextures(frontFace);
      for (const k of ["displacement", "normal"]) {
        front[k].image.data.set(t[k].image.data);
        front[k].needsUpdate = true;
        t[k].dispose();
      }
      t.rough.dispose();
      builtFrost = -1;
    }
    if (v["metal.frost"] !== builtFrost) {
      builtFrost = v["metal.frost"];
      paintRoughness(front.rough, frontFace, builtFrost);
      paintRoughness(back.rough, backFace, builtFrost);
    }
    render();
  }
  const schedule = () => {
    if (!pending) pending = setTimeout(rebuild, 0);
  };

  /* ---- the pose ---- */
  let W = 1, H = 1, raf = 0, last = 0, clock = 0, onScreen = true, tabVisible = !document.hidden;
  let spin = -0.85, spinVel = 0; // the turn, and a push from a drag on top of the dial's speed
  const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
  let hover = null, drag = null;

  function pose() {
    const tilt = (v["view.tilt"] * Math.PI) / 180;
    coin.rotation.set(tilt + mouse.y * 0.45, 0, REST_ROLL);
    spinGroup.rotation.set(0, 0, 0);
    if (v["motion.spin"] === "Top") {
      coin.rotation.y = mouse.x * 0.35 + spin;
      spinGroup.rotation.y = spin * 0.6;
    } else {
      coin.rotation.y = mouse.x * 0.35;
      spinGroup.rotation.y = spin;
    }
  }

  function fitCamera() {
    const aspect = W / H;
    // the coin a little under two thirds of the short side, whatever the shape of the stage
    const halfH = 1.55 / v["view.zoom"] / Math.min(1, aspect);
    camera.aspect = aspect;
    camera.position.set(0, 0, halfH / Math.tan((camera.fov * Math.PI) / 360));
    camera.updateProjectionMatrix();
  }

  function render() {
    pose();
    renderer.render(scene, camera);
  }

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H, false);
    fitCamera();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    // untouched, it sways as if a cursor drifted lazily over it; over it, it follows the cursor
    const wob = v["motion.wobble"];
    if (hover) {
      mouse.tx = hover.x;
      mouse.ty = hover.y;
    } else {
      mouse.tx = Math.sin(clock * 0.45) * wob;
      mouse.ty = Math.cos(clock * 0.62) * wob * 0.7;
    }
    const ease = 1 - Math.pow(1 - 0.08, dt * 60);
    mouse.x += (mouse.tx - mouse.x) * ease;
    mouse.y += (mouse.ty - mouse.y) * ease;
    const base = v["motion.spin"] === "Still" ? 0 : v["motion.speed"];
    if (!drag) {
      spinVel *= Math.pow(0.12, dt); // a flick dies away over a second or two
      spin += (base + spinVel) * dt;
    }
    render();
  }

  function sync() {
    const run = !reduced && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  /* ---- the pointer ---- */
  const local = (e) => {
    const r = host.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 };
  };
  const onMove = (e) => {
    if (e.pointerType === "mouse") hover = local(e);
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const t = performance.now();
    spin += dx * 0.008;
    spinVel = clamp((dx * 0.008) / Math.max(0.008, (t - drag.t) / 1000), -12, 12);
    drag.x = e.clientX;
    drag.t = t;
    if (!raf) render();
  };
  const onDown = (e) => {
    drag = { x: e.clientX, t: performance.now() };
    spinVel = 0;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onUp = () => {
    drag = null;
    canvas.style.cursor = "grab";
  };
  const onLeave = () => (hover = null);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  const ro = new ResizeObserver(() => {
    resize();
    render();
    sync();
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

  applyMaterial();
  resize();
  rebuild();
  sync();

  return {
    update(values, path) {
      Object.assign(v, values);
      if (path === null || path === "colour.ground") paintGround();
      if (path === null || path?.startsWith("metal.")) applyMaterial();
      if (path === null || path === "view.zoom") fitCamera();
      if (path === null || path === "face.points" || path === "metal.frost") schedule();
      if (!raf) render();
    },
    action() {},
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(pending);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      body.geometry.dispose();
      faceGeo.dispose();
      for (const m of mats) m.dispose();
      for (const t of [front, back]) for (const k of ["displacement", "normal", "rough"]) t[k].dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      ground.remove();
    },
  };
}
