/* An endless ground for the perspective drawings (hero-flyin.js): no island
   and no edge, a plane that runs off into the distance and fades into the
   page (Hunter, 7 October: not a discrete square island, an infinite plane),
   drawn as a square grid (Hunter, 7 October: a grid, not contours or dots).
   The grid is laid on the site's own axes with a set cell, so a drawing can
   put each of its pieces in the middle of its own square.

   The lines fade out away from the site (Hunter, 7 October), the ground's
   tone carries on. The ground takes the sun's shadows from the kit's pieces. One large quad
   follows the camera and the grid is in world units, so it never ends; as
   the lines get too close to draw they settle into an even tone, and the
   distance and the horizon fade the whole ground into the page.

   On the dark heroes tuneGrid(plane, color) gives the grid its colour.

   createPlane(surface, opts) -> { mesh, update(fade), configure(opts) }
     opts: axis ([x, z], the direction one set of lines runs), cell (world
     units), origin ([x, z], a cell centre), y (the ground's height), center ([x, z]) and reach ([full, gone] radius) of the lines,
     fill, line (hex), fade ([near, far] in world units from the
     camera; update() can take new ones). Lines fall halfway between cell
     centres, so a piece at a multiple of the cell sits mid-square. */
import * as THREE from 'three';
import { SHADOW } from './iso-kit.js';

const VERT = `
  uniform mat4 uShadowMatrix;
  varying vec3 vW; varying vec4 vShadow;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vShadow = uShadowMatrix * vec4(wp.xyz + vec3(0.0, 0.05, 0.0), 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const FRAG = `
  uniform vec3 uFill; uniform vec3 uLine; uniform vec3 uCam; uniform vec2 uAxis; uniform vec2 uOrigin; uniform float uCell; uniform vec2 uCenter; uniform vec2 uReach;
  uniform vec2 uFade; uniform float uLineA; uniform float uWidth; uniform float uShade;
  uniform vec3 uPool; uniform vec3 uPoolFill; uniform float uPoolA;
  uniform sampler2DShadow tShadow; uniform float uShadowOn; uniform vec2 uShadowTexel;
  varying vec3 vW; varying vec4 vShadow;

  float lit() {
    vec3 sc = vShadow.xyz / vShadow.w;
    if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
    float s = 0.0;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
      s += texture(tShadow, vec3(sc.xy + vec2(float(i), float(j)) * uShadowTexel, sc.z - 0.0006));
    return s / 9.0;
  }
  void main() {
    // the grid, in cells along the site's axes; lines halfway between centres
    vec2 q = vW.xz - uOrigin;
    vec2 g = vec2(dot(q, uAxis), dot(q, vec2(-uAxis.y, uAxis.x))) / uCell + 0.5;
    vec2 gw = max(fwidth(g), vec2(1e-5));
    vec2 px = abs(fract(g + 0.5) - 0.5) / gw;
    vec2 on = 1.0 - smoothstep(uWidth * 0.5 - 0.5, uWidth * 0.5 + 0.5, px);
    // too close together to draw: an even tone instead
    vec2 a = mix(on, min(vec2(1.0), uWidth * gw), smoothstep(0.08, 0.3, gw));
    float lineA = max(a.x, a.y) * uLineA;
    // strongest round the site, gone further out
    float r = 1.0 - smoothstep(uReach.x, uReach.y, length(vW.xz - uCenter));
    lineA *= r * r;
    // the ground: one flat tone, darker in shadow; shadows fade with the
    // lines, as what casts them far out fades too
    vec3 base = uFill;
    // a pool of light on the ground (off unless configured): round six's
    // Manta hero lights the radar's reach and leaves the rest in the dark
    float pool = uPoolA * (1.0 - smoothstep(uPool.z * 0.72, uPool.z, length(vW.xz - uPool.xy)));
    base = mix(base, uPoolFill, pool);
    lineA *= 1.0 + pool * 1.6;
    if (uShadowOn > 0.5) base *= mix(1.0, uShade, (1.0 - lit()) * r * r);
    // two fades: with distance, and toward the horizon, so a low camera
    // sees the ground go soft long before its edge
    vec3 ray = vW - uCam;
    float fade = 1.0 - smoothstep(uFade.x, uFade.y, length(ray));
    fade *= fade * smoothstep(0.02, 0.36, -ray.y / length(ray));
    gl_FragColor = vec4(uLine * lineA + base * (1.0 - lineA), fade);
    #include <colorspace_fragment>
  }`;

/** A dark hero's grid colour. The colour is the line's own, drawn solid
    where the grid is strongest and fading into the ground. */
export function tuneGrid(plane, color) {
  plane.configure({ line: color, lineA: 1 });
}

export function createPlane(surface, opts = {}) {
  const o = { axis: [1, 0], cell: 16, origin: [0, 0], y: 0, center: [0, 0], reach: [30, 120], fill: '#1b1a20', line: '#d5dfd6', fade: [120, 520], ...opts };
  const uniforms = {
    ...SHADOW,
    uFill: { value: new THREE.Color(o.fill) }, uLine: { value: new THREE.Color(o.line) }, uCam: { value: new THREE.Vector3() },
    uAxis: { value: new THREE.Vector2(...o.axis).normalize() }, uCell: { value: o.cell }, uOrigin: { value: new THREE.Vector2(...o.origin) }, uCenter: { value: new THREE.Vector2(...o.center) }, uReach: { value: new THREE.Vector2(...o.reach) }, uFade: { value: new THREE.Vector2(...o.fade) },
    uLineA: { value: 0.2 }, uWidth: { value: 1 }, uShade: { value: 0.55 },
    uPool: { value: new THREE.Vector3(0, 0, 1) }, uPoolFill: { value: new THREE.Color('#ffffff') }, uPoolA: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
  mesh.scale.set(9000, 1, 9000);
  mesh.frustumCulled = false;
  surface.overlay(mesh);
  mesh.renderOrder = -1; // under every ring and dash
  return {
    mesh,
    /** After the camera moves: the quad follows it, the fade can change. */
    update(fade) {
      const cam = surface.camera.position;
      mesh.position.set(cam.x, o.y, cam.z);
      uniforms.uCam.value.copy(cam);
      if (fade) uniforms.uFade.value.set(...fade);
      uniforms.uWidth.value = surface.renderer.getPixelRatio();
    },
    configure(c = {}) {
      if (c.fill) uniforms.uFill.value.set(c.fill);
      if (c.line) uniforms.uLine.value.set(c.line);
      if (c.lineA != null) uniforms.uLineA.value = c.lineA;
      if (c.cell != null) uniforms.uCell.value = c.cell;
      if (c.reach) uniforms.uReach.value.set(...c.reach);
      if (c.center) uniforms.uCenter.value.set(...c.center);
      if (c.shade != null) uniforms.uShade.value = c.shade;
      // pool: { at: [x, z], r, fill, a }, a lit disc on the ground
      if (c.pool) {
        if (c.pool.at) uniforms.uPool.value.set(c.pool.at[0], c.pool.at[1], c.pool.r ?? uniforms.uPool.value.z);
        else if (c.pool.r != null) uniforms.uPool.value.z = c.pool.r;
        if (c.pool.fill) uniforms.uPoolFill.value.set(c.pool.fill);
        if (c.pool.a != null) uniforms.uPoolA.value = c.pool.a;
      }
    },
  };
}
