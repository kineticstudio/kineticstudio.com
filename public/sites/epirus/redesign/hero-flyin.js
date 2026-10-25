/* Epirus homepage, round four hero study: the fly-in (Hunter, 7 October).
   One camera move, then the hero at rest:

     0 to 2 s     the camera is high up just under the drones, the swarm in
                  the upper half of the frame against the sky: the swarm comes in past it from the
                  sides and pulls ahead, so the camera ends up behind it.
                  The ground and the system stay below the frame, and
                  brackets lock on every drone
     2 to 5 s     as Leonidas fires the camera drops and pans down under the
                  swarm: the system comes into view low in the frame, its
                  rings running up to the drones high in it, and the drones
                  fall out of the sky in front of it (Hunter, 7 October:
                  unseen until the shot, seen as they fall)
     5 to 8.2 s   it swings round and settles into the drawings' isometric
                  angle (a long lens, so it lands close to it), the framed
                  size easing straight to the hero's, never zooming in on
                  the way (Hunter, 7 October); the headline fades in once,
                  while the drones are falling

   At rest the system keeps working: a smaller group comes in every nine
   seconds and is brought down the same way, and the camera keeps flying
   slowly round the site, a full circle every hundred seconds, the site
   holding its place on the screen (Hunter, 7 October). Once the move is
   done the scene can be spun by hand: drag across the hero (sideways on a
   phone, so the page still scrolls); let go and it carries on a little
   before the slow circling takes over again. With data-groups="follow" on
   the hero (round six; Hunter, 8 October: no launch button, the drones in
   more steadily and always in view) a group comes every seven and a half
   seconds, each from the side where the circling camera sees it come in,
   always over the open side, so Leonidas never fires back across the
   system. The ground is endless (iso-plane.js): a
   square grid on the site's axes, its lines fading away from the site and
   the ground into their black. Each piece of the platform stands on a low
   island of two by two squares, flush with the grid lines, one square of
   ground between islands (Hunter, 7 October).

     motion allowed           the move once, then the loop at rest
     reduced motion,          the hero at rest, a group mid-engagement, the
     ?motion=still            headline already in place
     no WebGL                 the copy on their black

   heroFly.at(seconds) holds any moment, for review; heroFly.replay() runs
   the move again. */
import * as THREE from 'three';
import {
  seg, lerp, easeOut, easeInOut, COL, DARK, iconMaterial, tint, tones, createIsoRenderer, dashUniforms, dashMaterial, dashGeometry,
  hairlineMaterial, buildLeonidas, buildRadar, buildOperatorStation, buildGenerator, buildHangar, buildTank, buildMast, boxAt, droneGeometry,
  createBrackets, NOCAST, buildCriticalPoint,
} from './iso-kit.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { createPlane, tuneGrid } from './iso-plane.js';

const hero = document.querySelector('.r4-fly');
const art = hero && hero.querySelector('.r2-hero-art');
const canvas = art && art.querySelector('canvas');
const still = () => document.documentElement.dataset.motion === 'still' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = () => matchMedia('(min-width: 992px)').matches;

// the site's own frame: u runs out toward the threat, v a quarter turn
// round. The camera rests REST_A degrees round from the threat axis (seen
// square on, Leonidas's rings would be edge-on), and the frame is turned so
// that resting view is the drawings' isometric one; at 45 degrees the grid
// runs along the world's axes, like the icons' tiles. The threat comes in
// from the lower right, the site sits up the screen
const REST_A = 45;
const ISO = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
const T = ISO.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(REST_A));
const V = new THREE.Vector3(-T.z, 0, T.x);
const Y = new THREE.Vector3(0, 1, 0);
const W = (u, v, y = 0) => new THREE.Vector3(u * T.x + v * V.x, y, u * T.z + v * V.z);
const XZ = (u, v) => { const p = W(u, v); return [p.x, p.z]; };
const yawTo = (d) => Math.atan2(d.x, d.z); // the turn that points local +z along d
const ALONG_T = Math.atan2(-T.z, T.x); // the turn that lays local +x along T

const INTRO = 8.2; // the move
const REVEAL = 3.7; // the headline fades in as the drones fall
const ORBIT = 360 / 100; // degrees a second round the site, once it settles
const REST0 = 9.0, CYCLE = 9; // the groups at rest
const STILL_AT = REST0 + 3.25; // a group with the rings on their way

// the ground's grid, and where things are, in (u, v): each piece of the
// platform in the middle of its own island of two by two squares, the
// islands a square apart, every run a straight hop to the next island
// (power from the generator beside Leonidas, tracks from the radar to the
// operator, authorization from the operator to Leonidas), and the site it
// protects beyond
const CELL = 8;
const ISLAND = 2 * CELL, STEP = 3 * CELL;
const STAGE = 1; // the islands stand this high, like a low stage (Hunter, 7 October)
// round six (data-site="point" on the hero; Jeff Morgan, 9 October: "Include
// generator with Leonidas island", "Replace this island with Critical Point
// island", "Have drones attack the point"): the generator rides on
// Leonidas's island, beside it, Leonidas a little to the other side; the
// generator's island is the critical point, the asset the system is there
// to protect; and each group comes in at the point, and is brought down on
// the way. Round five keeps its four pieces, one to an island.
const POINT = !!hero && hero.dataset.site === 'point';
const SITE = POINT ? {
  leo: [0.6, -2.6], pad: 10,
  gen: [0.6, 4.6],
  point: [0, -STEP],
  station: [-STEP, 0],
  radar: [-STEP, -STEP],
} : {
  leo: [0, 0], pad: 10,
  gen: [0, -STEP],
  station: [-STEP, 0],
  radar: [-STEP, -STEP],
};
const ISLANDS = [[0, 0], [0, -STEP], [-STEP, 0], [-STEP, -STEP]];
// where a group holds (if it ever got that far): round six's come closer,
// diving at the point, so they are plainly after it when they are hit
const HOLD = { u: POINT ? 23 : 29, y: 18 };
// where a group sets off and holds, in its own frame: round five's round
// Leonidas, round six's round the point, so a group heads straight for it
const ABOUT = POINT ? SITE.point : [0, 0];
// the bearings a group may come in on: inside the open side, and in round
// six never so far round that Leonidas fires across the point
const BEARINGS = POINT ? [-30, 50] : [-70, 70];

// the drones: the opening swarm comes from out past the camera, spread wide,
// and closes into a loose block where it holds; each group at rest comes in
// from beyond the right of the frame
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
const SWARM = (() => {
  const r = rng(11), out = [];
  for (let row = 0; row < 6; row++) for (let col = 0; col < 8; col++) {
    const side = col < 4 ? -1 : 1;
    out.push({
      from: [150 + r() * 48, side * (5 + r() * 26), 66 + r() * 13],
      hold: [45 + (row - 2.5) * 2.7 + (r() - 0.5) * 1.6, (col - 3.5) * 2.9 + (r() - 0.5) * 1.6, 50 + (r() - 0.5) * 5],
      lag: r(), phase: r() * 6.28, side: side < 0 ? 0 : 1,
    });
  }
  return out;
})();
const GROUP = (() => {
  const r = rng(29), out = [];
  for (let i = 0; i < 16; i++) {
    const row = Math.floor(i / 4), col = i % 4;
    out.push({
      from: [150 + r() * 24, (col - 1.5) * 6 + (r() - 0.5) * 8, 20 + r() * 8],
      hold: [HOLD.u - 2 + row * 2.8 + (r() - 0.5) * 1.4, (col - 1.5) * 3.1 + (r() - 0.5) * 1.4, HOLD.y + (r() - 0.5) * 5],
      lag: r(), phase: r() * 6.28, side: col < 2 ? 0 : 1,
    });
  }
  return out;
})();
// the beats of one engagement, in seconds from when the drones set off
const BEATS = {
  swarm: { arrive: 4.4, ping: 1.2, lock: 1.35, tracks: 1.55, authorize: 1.9, fire: 2.25, drop: 2.95 },
  group: { arrive: 3.6, ping: 1.5, lock: 1.65, tracks: 1.85, authorize: 2.45, fire: 2.85, drop: 3.2 },
};

// the camera: keys of a target (u, v, y), the angle round from the threat
// axis toward the resting side (deg), the height angle (deg), the distance
// and the lens (vertical fov, deg). The last key is the hero at rest, fitted
// to the screen. The opening keys are written as where the camera is and
// how far it looks up: high enough, and the lens narrow enough, that the
// system stays below the frame until the drones are hit
const up = (t, [cu, cv, cy], pitch, fov, D = 70) => {
  const r = THREE.MathUtils.degToRad(pitch);
  return { t, L: [cu - D * Math.cos(r), cv, cy + D * Math.sin(r)], a: 0, e: -pitch, D, fov };
};
const KEYS = [
  up(0, [176, 3, 50], 9, 34),
  up(1.6, [150, 2, 48], 9, 34),
  up(2.5, [138, 1, 30], 10, 46),
  { t: 4.3, L: [40, 0, 14], a: 4, e: 18, fov: 46, holdRest: true },
  { t: INTRO, L: [0, 0, 0], a: REST_A, e: 32, D: 260, fov: 15 },
];
const REST = KEYS[KEYS.length - 1];
// what the hero at rest frames: the system and the group where it holds
const E = ISLAND / 2;
const FRAME = [
  [0, 0, 9 + STAGE], [E, E, 0], [E, -STEP - E, 0], [-STEP - E, E, 0], [-STEP - E, -STEP - E, 0], [...SITE.radar, 5 + STAGE],
  [-2 * STEP - 6, -STEP - 4, 4.2], [-STEP - 4, -2 * STEP - 4, 4.2],
  [ABOUT[0] + HOLD.u + 9, ABOUT[1] + 9, HOLD.y + 5], [ABOUT[0] + HOLD.u + 9, ABOUT[1] - 9, HOLD.y + 5], [ABOUT[0] + HOLD.u - 6, ABOUT[1], HOLD.y - 4],
];

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

// cubic Hermite through the keys, Catmull-Rom slopes, moving at the start
// (the camera is already flying) and settling at the end
// (flat: no slope through a key marked holdRest, so a value held from there
// on never overshoots)
function spline(get, t, flat = false) {
  const n = KEYS.length;
  if (t <= KEYS[0].t) return get(KEYS[0]);
  if (t >= KEYS[n - 1].t) return get(KEYS[n - 1]);
  let i = 0;
  while (t > KEYS[i + 1].t) i++;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
  const slope = (j) => {
    if (j === n - 1 || (flat && KEYS[j].holdRest)) return 0;
    if (j === 0) return (get(KEYS[1]) - get(KEYS[0])) / (KEYS[1].t - KEYS[0].t);
    return (get(KEYS[j + 1]) - get(KEYS[j - 1])) / (KEYS[j + 1].t - KEYS[j - 1].t);
  };
  const h = k1.t - k0.t, s = (t - k0.t) / h;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
  return h00 * get(k0) + h10 * h * slope(i) + h01 * get(k1) + h11 * h * slope(i + 1);
}
const offset = (a, e, D) => {
  const ar = THREE.MathUtils.degToRad(a), er = THREE.MathUtils.degToRad(e);
  return T.clone().multiplyScalar(Math.cos(er) * Math.cos(ar) * D).addScaledVector(V, Math.cos(er) * Math.sin(ar) * D).addScaledVector(Y, Math.sin(er) * D);
};

function start() {
  // the copy starts hidden in the markup (is-intro), so nothing shows and
  // then hides; without a drawing it comes straight in
  if (!art || !hasWebGL()) { if (hero) hero.classList.remove('is-intro'); return; }
  const surface = createIsoRenderer(canvas, { perspective: 50, maxDpr: 1.75, shadows: 100, shadowSize: 4096, transparent: true });
  const { scene, solid, overlay, renderer } = surface;
  surface.configure(DARK);
  // lines on every multiple of the cell, so an island's edges sit on them
  const plane = createPlane(surface, { axis: [T.x, T.z], cell: CELL, origin: XZ(CELL / 2, CELL / 2), center: XZ(-STEP / 2, -STEP / 2), reach: [26, 112] });
  // a darker grid than at first (Hunter, 7 October: too bright); ?grid= or
  // ?tune to try others
  tuneGrid(plane, '#2c2b31');
  // and what is not the platform fades the way the grid does: the base, the
  // runway into the distance (Hunter, 7 October); the platform sits inside
  // the first radius, the drones fly above the fade
  surface.setFade({ center: XZ(-STEP / 2, -STEP / 2), reach: [26, 112], below: [12, 16] });

  const pal = { site: tones(DARK.site), drone: tones(DARK.drones), yellow: COL.yellow.map((c) => c.clone()) };
  const site = iconMaterial(pal.site), yellow = iconMaterial(pal.yellow), droneMat = iconMaterial(pal.drone);
  const lamp = iconMaterial(COL.lampOff);
  // round six: the critical point in the icon family's sage, and the
  // operator at the station
  const sage = POINT ? iconMaterial(COL.sage.map((c) => c.clone())) : null;
  const person = POINT ? iconMaterial(tones('#8a8b91')) : null;
  const place = (obj, [u, v], y = 0, turn = 0) => { obj.position.copy(W(u, v, y)); obj.rotation.y = turn; scene.add(obj); return obj; };

  // the base it protects, in the squares behind the platform, so at rest it
  // sits up the screen and clear of the headline, all in the site's grey:
  // hangars, tanks, a runway with its centre line, low buildings, a motor
  // pool of trucks and a comms mast (Hunter, 7 October: more in the back)
  const C = STEP;
  for (const [u, v] of [[-2, -1], [-2, -2], [-3, -2]]) place(buildHangar(site, 12, 4.2, 4), [u * C, v * C], 0, ALONG_T);
  for (const [u, v] of [[-3, -3], [3, -3], [0, 2.6]]) place(buildTank(site, 2, 4.2), [u - C, v - 2 * C]);
  // the runway quieter than the buildings: a step up from the ground
  const runway = solid(new THREE.BoxGeometry(5 * C, 0.24, 6), iconMaterial(tones('#2c2b31')));
  runway.position.copy(W(-1.5 * C, -80, 0.12));
  runway.rotation.y = ALONG_T;
  const centre = dashMaterial(dashUniforms(0.3, 6), 0xd5dfd6, 0.28);
  const centreGeo = dashGeometry([XZ(-3.9 * C, -80), XZ(0.9 * C, -80)], 0.26);
  centre.uniforms.uLen.value = centreGeo.userData.length;
  overlay(new THREE.Mesh(centreGeo, centre));
  const block = (w, d, h) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mergeGeometries([boxAt(w, h, d, 0, h / 2, 0), boxAt(w + 0.3, 0.3, d + 0.3, 0, h + 0.15, 0)]), site));
    g.add(new THREE.Mesh(mergeGeometries([boxAt(1.8, 1, 1.4, w / 4, h + 0.8, 0), boxAt(1.2, 0.7, 1.2, -w / 4, h + 0.65, d / 5)]), site));
    return g;
  };
  place(block(11, 7, 4.5), [0, -2 * C], 0, ALONG_T);
  place(block(10, 5, 3.4), [-4 * C, -2 * C], 0, ALONG_T);
  // a truck: cab, box and wheels, along local x
  const truck = () => {
    const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 18).rotateX(Math.PI / 2);
    return new THREE.Mesh(mergeGeometries([
      boxAt(6.2, 0.35, 2, 0, 0.85, 0), boxAt(1.7, 1.7, 2.1, 2.2, 1.85, 0), boxAt(3.9, 2.3, 2.2, -0.9, 2.2, 0),
      ...[[2.2, -1], [2.2, 1], [-1.3, -1], [-1.3, 1], [-2.4, -1], [-2.4, 1]].map(([x, z]) => wheel.clone().translate(x, 0.5, z)),
    ].map((g) => g.toNonIndexed())), site);
  };
  for (const k of [-1, 0, 1]) place(truck(), [C, -2 * C + k * 3.6], 0, ALONG_T);
  place(buildMast(site), [-3 * C, -C]).scale.setScalar(1.1);

  // the platform's four islands stand up out of the grid like a low stage,
  // two by two squares each, edge to edge with the grid lines, a square of
  // ground between them, each piece in the middle of its own: Leonidas
  // facing the threat, the generator beside it, the operator station
  // behind it and the radar behind that (round six: Leonidas and its
  // generator share the first island, the critical point has the second)
  const stage = iconMaterial(tones(DARK.island));
  for (const at of ISLANDS) {
    const sq = solid(new THREE.BoxGeometry(ISLAND, STAGE, ISLAND), stage);
    sq.position.copy(W(...at, STAGE / 2));
    sq.rotation.y = ALONG_T;
  }
  const leo = place(buildLeonidas(yellow), SITE.leo, STAGE, ALONG_T);
  leo.scale.setScalar(1.1);
  place(buildGenerator(yellow), SITE.gen, STAGE, ALONG_T);
  place(buildRadar(yellow), SITE.radar, STAGE).scale.setScalar(1.2);
  // round six: their three-screen display, and the operator seated at it
  // (Jeff Morgan, 9 October: "Can we add an operator this island?", "we
  // have a 3 GUI display")
  // (drawn a third larger there, so the operator and the three screens read
  // at the hero's size; the station has its island to itself)
  place(buildOperatorStation(yellow, lamp, POINT ? { screens: 3, person } : {}), SITE.station, STAGE, yawTo(T.clone().negate())).scale.setScalar(POINT ? 1.6 : 1.2);
  // the critical point, inside its protection: a ring of fine dashes on its
  // island, marching slowly, as the icon family draws a critical asset
  let guard = null;
  if (POINT) {
    place(buildCriticalPoint(sage), SITE.point, STAGE, ALONG_T);
    const R = 6.9, ring = [];
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      ring.push(XZ(SITE.point[0] + Math.cos(a) * R, SITE.point[1] + Math.sin(a) * R));
    }
    guard = dashMaterial(dashUniforms(DARK.dashWidth * 0.8, DARK.dashGap), 0xd5dfd6, 0.55);
    const g = dashGeometry(ring, STAGE + 0.08);
    guard.uniforms.uLen.value = g.userData.length;
    overlay(new THREE.Mesh(g, guard));
  }

  // the runs on the ground: power, tracks, authorization
  // the kit's dark weight for the dots, a touch finer (Hunter, 7 October:
  // the runs read thick)
  const dash = dashUniforms(DARK.dashWidth * 0.8, DARK.dashGap);
  const run = (pts, opacity = 0.9) => {
    const m = dashMaterial(dash, 0xffd748, opacity);
    const g = dashGeometry(pts.map((p) => XZ(...p)), STAGE + 0.08);
    m.uniforms.uLen.value = g.userData.length;
    overlay(new THREE.Mesh(g, m));
    return m;
  };
  // (round six: power is a short hop across Leonidas's own island, and
  // authorization runs straight in to where Leonidas stands on it)
  const power = POINT ? run([[SITE.gen[0], SITE.gen[1] - 1.25], [SITE.leo[0], SITE.leo[1] + 2.15]]) : run([[0, -STEP + 1.3], [0, -SITE.pad / 2 - 0.3]]);
  const tracks = run([[-STEP, -STEP + 2.3], [-STEP, -3]]);
  const authorize = POINT ? run([[-STEP + 1.2, SITE.leo[1]], [SITE.leo[0] - 5.6, SITE.leo[1]]]) : run([[-STEP + 1.2, 0], [-SITE.pad / 2 - 0.3, 0]]);

  // the drones, their brackets, the radar's ping, Leonidas's rings
  const ALL = SWARM.length + GROUP.length;
  const drones = new THREE.InstancedMesh(droneGeometry(), droneMat, ALL);
  drones.frustumCulled = false;
  drones.layers.set(NOCAST);
  scene.add(drones);
  // a drone that is hit moves to this copy, which can fade: it is gone well
  // before the ground (Hunter, 7 October: they never sit on the ground). An
  // overlay, so it is drawn without the ink lines; the instance colour's red
  // is its opacity
  const falling = new THREE.InstancedMesh(droneGeometry(), new THREE.ShaderMaterial({
    uniforms: { uTop: { value: pal.drone[0] }, uLeft: { value: pal.drone[1] }, uRight: { value: pal.drone[2] } },
    vertexShader: `varying vec3 vN; varying float vA;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        vA = 1.0;
        #ifdef USE_INSTANCING_COLOR
          vA = instanceColor.r;
        #endif
        vN = normalize(mat3(m) * normal);
        gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uLeft; uniform vec3 uRight; varying vec3 vN; varying float vA;
      void main() {
        if (vA <= 0.004) discard;
        vec3 n = normalize(vN), w = max(vec3(n.y, n.z, n.x), 0.0) + 0.001;
        gl_FragColor = vec4((uTop * w.x + uLeft * w.y + uRight * w.z) / (w.x + w.y + w.z), vA);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  }), ALL);
  const fade = new THREE.Color();
  for (let i = 0; i < ALL; i++) falling.setColorAt(i, fade.setRGB(0, 0, 0));
  falling.frustumCulled = false;
  overlay(falling);
  falling.renderOrder = 3;
  const brackets = createBrackets(surface, ALL, 0xffffff);
  const quad = new THREE.PlaneGeometry(2, 2);
  const ping = overlay(new THREE.Mesh(quad, hairlineMaterial(0xffffff)));
  ping.rotation.x = -Math.PI / 2;
  ping.position.copy(W(...SITE.radar, STAGE + 0.1));
  const RINGS = [0, 0.2, 0.4, 0.6], RUN = 0.75;
  const rings = RINGS.map(() => overlay(new THREE.Mesh(quad, hairlineMaterial(0xffffff))));
  // the radar's tracks: a hairline from its head to each of the two groups
  // it has found, fine dashes drawn out from the radar and marching, the
  // same thinness at any distance (Hunter, 7 October: one thick line read
  // oddly, aimed at the gap between the groups)
  const head = W(...SITE.radar, STAGE + 3.55 * 1.2 + 0.45), end = new THREE.Vector3();
  const trackLines = [0, 1].map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    g.setAttribute('lineDistance', new THREE.Float32BufferAttribute(new Float32Array(2), 1));
    const l = overlay(new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xffd748, transparent: true, opacity: 0.9, dashSize: 0.7, gapSize: 1.3, depthWrite: false })));
    l.frustumCulled = false;
    return l;
  });
  function trackTo(line, c, k, time) {
    line.visible = k > 0.001;
    if (!line.visible) return;
    end.lerpVectors(head, c, k);
    const g = line.geometry, pa = g.attributes.position, da = g.attributes.lineDistance, shift = -time * 3;
    pa.setXYZ(0, head.x, head.y, head.z);
    pa.setXYZ(1, end.x, end.y, end.z);
    da.setX(0, shift);
    da.setX(1, shift + head.distanceTo(end));
    pa.needsUpdate = da.needsUpdate = true;
  }

  const tmp = new THREE.Object3D(), p = new THREE.Vector3(), center = new THREE.Vector3(), emitter = new THREE.Vector3();
  const travel = yawTo(T.clone().negate());

  // one engagement: the drones of a set, `tau` seconds after they set off,
  // into slots from `slot`; returns where they hold and how far along it is
  const halves = [new THREE.Vector3(), new THREE.Vector3()], counts = [0, 0];
  function engage(set, beats, tau, time, slot, hidden, groups, turn = 0, about = [0, 0]) {
    const cs = Math.cos(turn), sn = Math.sin(turn);
    center.set(0, 0, 0);
    halves.forEach((h) => h.set(0, 0, 0));
    counts[0] = counts[1] = 0;
    let live = 0;
    set.forEach((d, i) => {
      const k = slot + i;
      if (hidden || tau < -1) {
        tmp.scale.setScalar(0); tmp.updateMatrix();
        drones.setMatrixAt(k, tmp.matrix); falling.setMatrixAt(k, tmp.matrix); brackets.set(k, 0, 0, 0, 0, 0, time);
        return;
      }
      // a steady flight (Jeff Morgan, 10 October: found and defeated while
      // moving, not slowed to a stop first): the drone keeps one speed and
      // is where it always was when it is hit, at the moment it always was
      const t0 = beats.drop + d.lag * 0.45;
      const span = beats.arrive + d.lag * 0.7;
      const goHit = seg(t0, -d.lag * 0.3, beats.arrive + d.lag * 0.4);
      const gd = 1 - (1 - goHit) ** 2, rate = gd / Math.max(goHit, 1e-3);
      const go = seg(tau, -d.lag * 0.3, beats.arrive + d.lag * 0.4);
      // (earlier rounds ease in to where they hold, as they were)
      const g = POINT ? Math.min(go * rate, 1) : 1 - (1 - go) * (1 - go);
      const close = easeInOut(seg(go, 0.05, 0.9));
      const u = lerp(d.from[0], d.hold[0], g), v = lerp(d.from[1], d.hold[1], close);
      let y = lerp(d.from[2], d.hold[2], g) + Math.sin(time * 1.7 + d.phase) * 0.45;
      // brought down: it drops from wherever it was hit, carried on by its
      // own way (slowing as it falls), tumbling, and fades out on the way down
      const y0 = lerp(d.from[2], d.hold[2], gd), fall = Math.sqrt((2 * y0) / 30);
      const f = seg(tau, t0, t0 + fall), down = f > 0;
      const speed = Math.abs(d.from[0] - d.hold[0]) * rate / span;
      const carry = POINT ? speed * fall * 0.45 * (f - (f * f) / 2) : easeOut(f) * 5;
      let at = u;
      if (down) { y = Math.max(0.35, y0 * (1 - f * f)); at = lerp(d.from[0], d.hold[0], gd); }
      const pu = at - carry;
      p.copy(W(about[0] + pu * cs - v * sn, about[1] + pu * sn + v * cs)).setY(y);
      tmp.position.copy(p);
      const bank = Math.sin(time * 1.3 + d.phase) * 0.12 * (1 - f);
      tmp.rotation.set(-0.18 * (1 - g) + f * 1.6 * Math.sin(i * 1.7), travel + f * 3 * Math.cos(i), bank + f * 1.2 * Math.cos(i * 2.3));
      tmp.scale.setScalar(0.5);
      tmp.updateMatrix();
      falling.setMatrixAt(k, tmp.matrix);
      falling.setColorAt(k, fade.setRGB(down ? 1 - easeInOut(seg(f, 0.05, 0.75)) : 0, 0, 0));
      if (down) { tmp.scale.setScalar(0); tmp.updateMatrix(); }
      drones.setMatrixAt(k, tmp.matrix);
      const lock = easeOut(seg(tau, beats.lock + d.lag * 0.6, beats.lock + 0.6 + d.lag * 0.6));
      brackets.set(k, p.x, p.y, p.z, lock * (1 - seg(f, 0, 0.3)) * 0.7, lock, time, 1.2);
      if (!down) { center.add(p); live++; halves[d.side].add(p); counts[d.side]++; }
    });
    if (live) center.divideScalar(live);
    else center.copy(W(about[0] + HOLD.u * cs, about[1] + HOLD.u * sn, HOLD.y));
    if (groups) halves.forEach((h, i) => groups[i].copy(counts[i] ? h.divideScalar(counts[i]) : center));
    return center;
  }

  // where Leonidas points when it fires on a set (the set's middle at that
  // moment; nothing has dropped yet), worked out without drawing anything
  const mid = new THREE.Vector3(), one = new THREE.Vector3();
  function middleAt(set, beats, tau, turn, about) {
    const cs = Math.cos(turn), sn = Math.sin(turn);
    mid.set(0, 0, 0);
    set.forEach((d) => {
      const t0 = beats.drop + d.lag * 0.45;
      const goHit = seg(t0, -d.lag * 0.3, beats.arrive + d.lag * 0.4);
      const rate = (1 - (1 - goHit) ** 2) / Math.max(goHit, 1e-3);
      const go = seg(tau, -d.lag * 0.3, beats.arrive + d.lag * 0.4), g = Math.min(go * rate, 1);
      const u = lerp(d.from[0], d.hold[0], g), v = lerp(d.from[1], d.hold[1], easeInOut(seg(go, 0.05, 0.9)));
      mid.add(one.copy(W(about[0] + u * cs - v * sn, about[1] + u * sn + v * cs)));
    });
    return mid.divideScalar(set.length);
  }
  const yawAt = (c) => yawTo(c.clone().sub(W(...SITE.leo)).setY(0));
  const swarmFireYaw = yawAt(middleAt(SWARM, BEATS.swarm, BEATS.swarm.fire, 0, [0, 0]));
  const fireYaws = new Map();
  const fireYaw = (turn) => {
    if (!fireYaws.has(turn)) fireYaws.set(turn, yawAt(middleAt(GROUP, BEATS.group, BEATS.group.fire, turn, ABOUT)));
    return fireYaws.get(turn);
  };

  let view = { L: W(...REST.L.slice(0, 2), REST.L[2]), D: REST.D };
  const PIVOT = W(-STEP / 2, -STEP / 2);
  // the spin by hand, in degrees, on top of the circling
  let spin = 0, spinVel = 0, dragging = false;
  // the groups at rest: when the current one set off, and from which side
  let restBase = REST0, groupTurn = 0, groupW = -1, prevTurn = 0;
  // round six (data-groups="follow"): steadier groups, each from the side
  // that keeps it in view: of the bearings inside the open side, the one
  // whose holding point the circling camera will see in the upper right of
  // the frame, clear of the headline, as it holds
  const follow = hero.dataset.groups === 'follow', cycle = follow ? 7.5 : CYCLE;
  const DEG = THREE.MathUtils.degToRad(1), seen = new THREE.Vector3();
  const turnedAt = (t) => {
    const since = Math.max(0, t - KEYS[KEYS.length - 2].t), RAMP = 2;
    return ORBIT * (since < RAMP ? (since * since) / (2 * RAMP) : since - RAMP / 2) + spin;
  };
  function sideFor(t0) {
    camera(t0 + BEATS.group.arrive);
    let best = 0, score = Infinity;
    for (let b = BEARINGS[0] * DEG; b <= BEARINGS[1] * DEG + 1e-6; b += 4 * DEG) {
      seen.copy(W(ABOUT[0] + HOLD.u * Math.cos(b), ABOUT[1] + HOLD.u * Math.sin(b), HOLD.y)).project(surface.camera);
      if (seen.z > 1) continue;
      const out = Math.max(0, 0.05 - seen.x) + Math.max(0, seen.x - 0.72) + Math.max(0, -0.15 - seen.y) + Math.max(0, seen.y - 0.75);
      const s = out * 10 + Math.hypot(seen.x - 0.42, seen.y - 0.35);
      if (s < score) { score = s; best = b; }
    }
    return best;
  }
  const cam = new THREE.Vector3(), look = new THREE.Vector3();
  function camera(t) {
    const r = (key) => (key === REST ? view : null);
    const L = new THREE.Vector3(
      spline((k) => (r(k) ? r(k).L.x : W(k.L[0], k.L[1]).x), t),
      spline((k) => (r(k) ? r(k).L.y : k.L[2]), t),
      spline((k) => (r(k) ? r(k).L.z : W(k.L[0], k.L[1]).z), t),
    );
    // the framed size (the height of the view at the target) eases from key
    // to key and the distance follows the lens, so the long lens arrives
    // without a zoom in and back out
    const rad = (deg) => THREE.MathUtils.degToRad(deg) / 2;
    const fov = spline((k) => k.fov, t);
    // from the moment the drones fall, the framed size is the hero's own
    const restH = 2 * view.D * Math.tan(rad(REST.fov));
    const H = spline((k) => (r(k) || k.holdRest ? restH : 2 * k.D * Math.tan(rad(k.fov))), t, true);
    const D = H / (2 * Math.tan(rad(fov)));
    // round the site: the circling starts under the swing, once the drones
    // are down, and is at full speed before the swing settles, so the swing
    // eases straight into it and never stops (Hunter, 7 October); the target
    // turns with the camera about the site's centre, so the site keeps its
    // place on the screen
    const turned = turnedAt(t);
    L.sub(PIVOT).applyAxisAngle(Y, -THREE.MathUtils.degToRad(turned)).add(PIVOT);
    const a = spline((k) => k.a, t) + turned, e = spline((k) => k.e, t);
    look.copy(L);
    cam.copy(L).add(offset(a, e, D));
    surface.setCamera({ position: cam.toArray(), target: look.toArray(), fov });
    // the ground fades from close in when the camera is low, and over the
    // top of the frame at rest
    const s = seg(e, 0, REST.e);
    plane.update([lerp(400, D * 0.8, s * s), lerp(3000, D * 1.5, s * s)]);
  }

  const g1 = [new THREE.Vector3(), new THREE.Vector3()], g2 = [new THREE.Vector3(), new THREE.Vector3()];
  function apply(t, time = t) {
    // the opening swarm, then a group every cycle seconds at rest
    const rest = t - restBase, w = Math.floor(rest / cycle), tau = rest - w * cycle;
    if (follow && rest >= 0 && w !== groupW) {
      // the group before this one, for where Leonidas was left aiming
      prevTurn = w > 0 ? (w === groupW + 1 ? groupTurn : sideFor(restBase + (w - 1) * cycle)) : 0;
      groupW = w; groupTurn = sideFor(restBase + w * cycle);
    }
    camera(t);
    const swarmDone = t > REST0 + 2;
    const c1 = engage(SWARM, BEATS.swarm, t, time, 0, swarmDone, g1).clone();
    const c2 = engage(GROUP, BEATS.group, rest >= 0 ? tau : -9, time, SWARM.length, rest < 0, g2, groupTurn, ABOUT);
    drones.instanceMatrix.needsUpdate = true;
    falling.instanceMatrix.needsUpdate = true;
    falling.instanceColor.needsUpdate = true;
    brackets.commit();
    // which engagement is on: the opening one until it is done
    const on = t < REST0 ? { b: BEATS.swarm, tau: t, c: c1, g: g1 } : { b: BEATS.group, tau, c: c2, g: g2 };
    // Leonidas keeps the array on the group once the radar has found it,
    // the trailer still, and holds its aim after the pulse until the next
    // group is found (Jeff Morgan, 10 October: "it should stay aiming in the
    // same direction after defeat"); power marches in
    const leoAt = W(...SITE.leo);
    const yawOf = (c) => yawTo(c.clone().sub(leoAt).setY(0));
    let aim = yawOf(on.c);
    if (!POINT) { /* earlier rounds: always on the group, as they were */ }
    else if (on.tau > on.b.fire) aim = t < REST0 ? swarmFireYaw : fireYaw(groupTurn);
    else if (t >= REST0) {
      const held = groupW > 0 ? fireYaw(prevTurn) : swarmFireYaw;
      const k = easeInOut(seg(on.tau, on.b.lock, on.b.lock + 0.8));
      aim = held + Math.atan2(Math.sin(aim - held), Math.cos(aim - held)) * k;
    }
    leo.userData.turn.rotation.y = aim - ALONG_T;
    leo.updateMatrixWorld(true);
    leo.userData.tilt.localToWorld(emitter.copy(leo.userData.emitter));
    power.uniforms.uShift.value = time * 1.6;
    if (guard) guard.uniforms.uShift.value = time * 0.5;
    // the radar's ping, the tracks to the operator, the operator's lamp and
    // authorization to Leonidas
    const pu = seg(on.tau, on.b.ping, on.b.ping + 1.1);
    ping.visible = pu > 0 && pu < 1;
    ping.scale.setScalar(lerp(1, 22, easeOut(pu)));
    ping.material.uniforms.uOpacity.value = Math.sin(Math.PI * pu) * 0.8;
    const cleared = 1 - seg(on.tau, on.b.drop + 1.6, on.b.drop + 2.4);
    tracks.uniforms.uDraw.value = easeInOut(seg(on.tau, on.b.tracks, on.b.tracks + 0.6)) * cleared;
    tracks.uniforms.uShift.value = time * 1.6;
    authorize.uniforms.uDraw.value = easeInOut(seg(on.tau, on.b.authorize, on.b.authorize + 0.45)) * cleared;
    authorize.uniforms.uShift.value = time * 1.6;
    tint(lamp, COL.lampOff, COL.lampOn, seg(on.tau, on.b.authorize - 0.2, on.b.authorize) * cleared);
    rings.forEach((m, i) => {
      const u = seg(on.tau, on.b.fire + RINGS[i], on.b.fire + RINGS[i] + RUN);
      m.visible = u > 0 && u < 1;
      if (!m.visible) return;
      m.position.lerpVectors(emitter, on.c, u);
      m.lookAt(on.c);
      m.scale.setScalar(lerp(2.5, 14, u));
      m.material.uniforms.uWidth.value = 1.2;
      m.material.uniforms.uDpr.value = renderer.getPixelRatio();
      m.material.uniforms.uOpacity.value = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.75;
    });
    ping.material.uniforms.uDpr.value = renderer.getPixelRatio();
    // the track, from when the brackets lock until the drones drop
    const kept = 1 - seg(on.tau, on.b.drop, on.b.drop + 0.4);
    trackLines.forEach((line, i) => trackTo(line, on.g[i], easeOut(seg(on.tau, on.b.lock + i * 0.15, on.b.lock + 0.5 + i * 0.15)) * kept, time));
  }

  // the hero at rest: the system and the group, to the right of the headline
  // on wide screens, above it on phones
  let w = 0, h = 0;
  const size = () => {
    const bw = art.clientWidth, bh = art.clientHeight;
    if (!bw || !bh || (bw === w && bh === h)) return false;
    w = bw; h = bh;
    surface.setSize(w, h);
    const nav = document.querySelector('.navbar_component');
    const top = (nav ? nav.getBoundingClientRect().bottom - art.getBoundingClientRect().top : 80) + 16;
    const copy = hero.querySelector('.hero_content.is-home > div');
    const left = wide() && copy ? copy.getBoundingClientRect().right - art.getBoundingClientRect().left + 24 : 16;
    const region = wide() ? { x0: Math.max(left, w * 0.4), x1: w - w * 0.03, y0: top, y1: h - 40 } : { x0: 12, x1: w - 12, y0: top, y1: h * 0.5 };
    const d = offset(REST.a, REST.e, 1).normalize();
    const right = new THREE.Vector3().crossVectors(Y, d).normalize(), up = new THREE.Vector3().crossVectors(d, right);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [u, v, y] of FRAME) {
      const q = W(u, v, y);
      const sx = q.dot(right), sy = q.dot(up);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const k = Math.min((region.x1 - region.x0) / (x1 - x0), (region.y1 - region.y0) / (y1 - y0)); // pixels per unit
    const half = h / 2 / k, D = half / Math.tan(THREE.MathUtils.degToRad(REST.fov) / 2);
    const cx = (x0 + x1) / 2 - ((region.x0 + region.x1) / 2 - w / 2) / k;
    const cy = (y0 + y1) / 2 + ((region.y0 + region.y1) / 2 - h / 2) / k;
    const L = right.clone().multiplyScalar(cx).addScaledVector(up, cy);
    L.addScaledVector(d, -L.y / d.y);
    // that guess treats the long lens as flat; refine it with the real
    // projection, since what is nearer the camera draws a little larger
    const probe = new THREE.PerspectiveCamera(REST.fov, w / h, 1, 6000), q = new THREE.Vector3();
    let dist = D;
    for (let i = 0; i < 4; i++) {
      probe.position.copy(L).addScaledVector(d, dist);
      probe.lookAt(L);
      probe.updateMatrixWorld();
      let px0 = Infinity, px1 = -Infinity, py0 = Infinity, py1 = -Infinity;
      for (const [u, v, y] of FRAME) {
        q.copy(W(u, v, y)).project(probe);
        const px = ((q.x + 1) / 2) * w, py = ((1 - q.y) / 2) * h;
        px0 = Math.min(px0, px); px1 = Math.max(px1, px); py0 = Math.min(py0, py); py1 = Math.max(py1, py);
      }
      const grow = Math.min((region.x1 - region.x0) / (px1 - px0), (region.y1 - region.y0) / (py1 - py0));
      const upp = (2 * Math.tan(THREE.MathUtils.degToRad(REST.fov) / 2) * dist) / h; // units per pixel at the target
      L.addScaledVector(right, ((px0 + px1) / 2 - (region.x0 + region.x1) / 2) * upp).addScaledVector(up, ((region.y0 + region.y1) / 2 - (py0 + py1) / 2) * upp);
      L.addScaledVector(d, -L.y / d.y);
      dist /= grow;
    }
    view = { L, D: dist };
    return true;
  };

  // the headline comes in as the camera settles
  const reveal = (on) => hero.classList.toggle('is-intro', !on);
  let clock = 0, running = false, raf = 0, last = 0, tick = -1, held = false;
  const paint = (t) => { apply(t); surface.render(); };
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    if (clock > REVEAL) reveal(true);
    if (clock > INTRO) hero.classList.add('is-spinnable');
    // held by hand, the circling waits; let go, the spin carries on and fades
    if (dragging) spin -= ORBIT * dt;
    else if (spinVel) {
      spin += spinVel * dt;
      spinVel *= Math.exp(-dt * 2.5);
      if (Math.abs(spinVel) < 0.3) spinVel = 0;
    }
    // drawn 30 times a second during the move would stutter; it runs at the
    // screen's rate until it settles, then 30 (unless it is being spun)
    if (clock > INTRO + 4 && !dragging && !spinVel) {
      if (Math.floor(clock * 30) === tick) return;
      tick = Math.floor(clock * 30);
    }
    paint(clock);
  };
  const play = () => { if (!running && !still() && !held) { running = true; last = 0; raf = requestAnimationFrame(frame); } };
  const pause = () => { if (running) { running = false; cancelAnimationFrame(raf); } };

  size();
  if (still()) { reveal(true); hero.classList.add('is-spinnable'); paint(STILL_AT); } else paint(0);

  // the spin by hand, once the move is done: drag sideways across the hero
  // (not on its links); about a third of a degree a pixel
  // (no label for it, Hunter, 7 October: the grab cursor is the cue)
  const SPIN = 0.32;
  let lastX = 0, lastT = 0;
  hero.addEventListener('pointerdown', (e) => {
    if (!hero.classList.contains('is-spinnable') || e.button !== 0 || e.target.closest('a, button, input, label')) return;
    dragging = true; spinVel = 0; lastX = e.clientX; lastT = performance.now();
    hero.classList.add('is-spinning');
    hero.setPointerCapture(e.pointerId);
  });
  hero.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now(), d = -(e.clientX - lastX) * SPIN;
    spin += d;
    // the speed it is let go at, smoothed over the last few moves
    spinVel = spinVel * 0.6 + (d / Math.max(8, now - lastT)) * 1000 * 0.4;
    lastX = e.clientX; lastT = now;
    if (!running) paint(still() ? STILL_AT : clock);
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    hero.classList.remove('is-spinning');
    // a pause before letting go means no throw
    if (performance.now() - lastT > 90 || still()) spinVel = 0;
  };

  hero.addEventListener('pointerup', release);
  hero.addEventListener('pointercancel', release);
  new ResizeObserver(() => { if (size()) paint(still() ? STILL_AT : clock); }).observe(art);
  window.heroFly = {
    at: (s) => { held = true; pause(); reveal(s > REVEAL); paint(s); },
    replay: () => { held = false; clock = 0; reveal(false); pause(); play(); },
    camera: (s) => { apply(s); const c = surface.camera; return { t: s, p: c.position.toArray().map((v) => +v.toFixed(1)), fov: +c.fov.toFixed(1) }; },
    // for review: how much of the platform is in frame at a moment, 0 to 1
    seen: (s) => {
      apply(s);
      const q = new THREE.Vector3(), pts = [];
      for (const [u, v] of ISLANDS) for (const [du, dv] of [[-E, -E], [E, -E], [-E, E], [E, E], [0, 0]]) pts.push(W(u + du, v + dv, STAGE));
      pts.push(W(0, 0, 9 + STAGE));
      // and the base behind it: hangars, tanks, buildings, trucks, the mast, the runway
      for (const [u, v, y] of [[-48, -24, 4.2], [-48, -48, 4.2], [-72, -48, 4.2], [-24, -48, 4.2], [0, -48, 5], [-96, -48, 4], [24, -48, 3], [-72, -24, 11], [-96, -80, 0], [24, -80, 0]]) pts.push(W(u, v, y));
      return pts.filter((w) => { q.copy(w).project(surface.camera); return q.z < 1 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1; }).length / pts.length;
    },
  };
  if (still()) return;
  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) play(); else pause();
  }, { rootMargin: '80px 0px' }).observe(art);
}

start();
