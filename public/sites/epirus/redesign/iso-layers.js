/* The four layers of Epirus Point Defense, each on its own small island,
   drawn live in the icon system's style (iso-kit.js) for the homepage's
   layers (r2-pieces.js). Dark, like every drawing of the system in round two,
   and each with its own short loop:

     plan     Mission Suite: the site as a terrain model; a scan passes over
              it and colours each cell by its probability of kill from the
              planned Leonidas, the far side of the ridge staying dark; then
              the radar, the operator station and Leonidas are placed,
              dashed footprints first, yellow squares after
     sense    the radar on its little stand, its four panels facing every
              way, with EO/IR, passive RF and acoustic sensors round it; each
              draws a track to the same group of drones, and the brackets
              close once all four agree
     decide   the operator station, joined to the command and control
              already on site (grey: not Epirus); tracks arrive, the laptops
              light as the operator authorizes, and the order goes on to the
              effector
     effect   Leonidas on its trailer, power running to it from its
              generator, turns to one swarm and defeats it with one pulse,
              rings running out to it, then turns to a second and does the
              same

   The Epirus pieces follow their Critical Point Defense Kit render
   (6 October), in iso-kit.js.

   buildLayer(kind, surface, pal) -> { group, update(t) }: the island centred
   on the origin; update takes seconds and loops by itself. LAYER_VIEW frames
   every island the same, so in a row they sit at one size and height. A
   pure painter: nothing here touches the page. */
import * as THREE from 'three';
import {
  clamp, seg, lerp, easeOut, easeInOut, COL, iconMaterial, tint, tones, hairlineMaterial, dashUniforms, dashMaterial,
  dashGeometry, frameView, buildLeonidas, buildMast, buildRadar, buildOperatorStation, buildGenerator, droneGeometry, createBrackets,
  boxAt, NOCAST, DIR, DARK,
} from './iso-kit.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

export const TILE = 20, THICK = 2.4;
const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };

/** One frame for all four: the island, headroom over its tallest piece and
    the air where the drones fly, on both sides. */
export const LAYER_VIEW = (() => {
  const pts = [];
  for (const x of [-TILE / 2, TILE / 2]) for (const z of [-TILE / 2, TILE / 2]) pts.push([x, 0, z], [x, -THICK, z]);
  pts.push([-4.5, 13.6, -4.5], [-12, 12, 3], [3, 12, -12], [9, 12, -9]);
  return frameView(pts, 1.2);
})();

/** The dark set as tones and mark colours, for buildLayer. */
export function darkPalette() {
  return {
    tile: tones('#36353c'), site: tones('#4a4950'), yellow: COL.yellow.map((c) => c.clone()), drone: tones('#a7aaae'),
    hot: tones('#8f7420'), lampOff: COL.lampOff.map((c) => c.clone()), lampOn: COL.lampOn.map((c) => c.clone()),
    air: 0xffffff, route: 0xffd748, guide: 0xe9e7de, dash: [DARK.dashWidth, DARK.dashGap],
  };
}

// a dashed line between two moving points, in the drawing's one dash weight
function liveLine(dash, color, parent, overlay) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(new Float32Array(4), 1));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  const m = dashMaterial(dash, color, 0.95);
  const mesh = overlay(new THREE.Mesh(g, m), parent);
  mesh.frustumCulled = false;
  const along = new THREE.Vector3(), across = new THREE.Vector3();
  return {
    mesh,
    material: m,
    set(from, to, k, shift) {
      mesh.visible = k > 0.001;
      if (!mesh.visible) return;
      along.subVectors(to, from);
      const len = along.length();
      along.normalize();
      across.crossVectors(along, DIR).normalize();
      const pa = g.attributes.position, sa = g.attributes.aSide, ua = g.attributes.aU;
      [from, from, to, to].forEach((p, i) => {
        const s = i % 2 ? -1 : 1;
        pa.setXYZ(i, p.x, p.y, p.z);
        sa.setXYZ(i, across.x * s, across.y * s, across.z * s);
        ua.setX(i, i < 2 ? 0 : len);
      });
      pa.needsUpdate = sa.needsUpdate = ua.needsUpdate = true;
      m.uniforms.uLen.value = len;
      m.uniforms.uDraw.value = k;
      m.uniforms.uShift.value = shift;
    },
  };
}

/** One layer's island. surface: from createIsoRenderer; pal: darkPalette(). */
export function buildLayer(kind, surface, pal) {
  const { solid, overlay, renderer } = surface;
  const group = new THREE.Group();
  const dash = dashUniforms(...(pal.dash || [0.32, 1]));
  const tileMat = iconMaterial(pal.tile), site = iconMaterial(pal.site), yellow = iconMaterial(pal.yellow);
  const droneMat = iconMaterial(pal.drone);
  const hairlines = [];
  const quad = new THREE.PlaneGeometry(2, 2);
  const ring = (color, flat) => {
    const m = overlay(new THREE.Mesh(quad, hairlineMaterial(color)), group);
    if (flat) m.rotation.x = -Math.PI / 2;
    m.visible = false;
    hairlines.push(m.material);
    return m;
  };
  const dashed = (pts, color, y = 0.07, opacity = 0.95) => {
    const geo = dashGeometry(pts, y);
    const m = dashMaterial(dash, color, opacity);
    m.uniforms.uLen.value = geo.userData.length;
    overlay(new THREE.Mesh(geo, m), group);
    return m;
  };
  const square = (x, z, w, d) => [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x - w / 2, z - d / 2]];
  const swarm = (n) => {
    const mesh = new THREE.InstancedMesh(droneGeometry(), droneMat, n);
    mesh.frustumCulled = false;
    mesh.layers.set(NOCAST);
    group.add(mesh);
    const brackets = createBrackets(surface, n, pal.air);
    group.add(brackets.mesh);
    return { mesh, brackets };
  };
  const tmp = new THREE.Object3D();
  const v = new THREE.Vector3();
  const lines = () => hairlines.forEach((m) => { m.uniforms.uWidth.value = 1.1 * surface.pxScale; m.uniforms.uDpr.value = renderer.getPixelRatio(); });
  const island = () => solid(new THREE.BoxGeometry(TILE, THICK, TILE), tileMat, 0, -THICK / 2, 0, group);
  let update = () => {};

  if (kind === 'plan') {
    /* ---- Mission Suite: terrain, probability of kill, placement ---- */
    const N = 14, CELL = TILE / N, STEP = 0.4;
    const heat = iconMaterial(pal.tile, pal.hot);
    const cells = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), heat, N * N);
    group.add(cells);
    const at = (i) => -TILE / 2 + CELL * (i + 0.5);
    // a ridge at the back left, a low mound at the back right, flat ground
    // at the front where the nodes go
    const bump = (x, z, cx, cz, r, h) => Math.max(0, 1 - Math.hypot(x - cx, z - cz) / r) ** 1.4 * h;
    const H = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = at(i), z = at(j);
      const f = Math.max(bump(x, z, -6, -5, 8.5, 2.9), bump(x, z, 6, -7.5, 5, 1.3));
      H.push(Math.round(f / STEP) * STEP);
    }
    const height = (x, z) => {
      const i = Math.min(N - 1, Math.max(0, Math.floor((x + TILE / 2) / CELL))), j = Math.min(N - 1, Math.max(0, Math.floor((z + TILE / 2) / CELL)));
      return H[i * N + j];
    };
    // the planned Leonidas, its reach, and what the ridge hides from it
    const P = [3.6, 3.6], EYE = 2.2, REACH = 15;
    const PK = H.map((h, k) => {
      const x = at(Math.floor(k / N)), z = at(k % N);
      const d = Math.hypot(x - P[0], z - P[1]);
      let seen = 1;
      for (let s = 1; s < 24; s++) {
        const u = s / 24, px = lerp(P[0], x, u), pz = lerp(P[1], z, u);
        if (height(px, pz) > lerp(EYE, h + 0.2, u) + 0.05) { seen = 0.12; break; }
      }
      return smooth(REACH, 2.5, d) * seen;
    });
    for (let k = 0; k < N * N; k++) {
      const h = H[k];
      tmp.position.set(at(Math.floor(k / N)), (h - THICK) / 2, at(k % N));
      tmp.scale.set(CELL, h + THICK, CELL);
      tmp.updateMatrix();
      cells.setMatrixAt(k, tmp.matrix);
      cells.setColorAt(k, new THREE.Color(0, 0, 0));
    }
    // the placements: Leonidas on the flat, the radar on the ridge for its
    // view, the operator station behind Leonidas
    const places = [
      { x: P[0], z: P[1], w: 4.6, d: 4.6 },
      { x: -5.7, z: -5, w: 2.6, d: 2.6 },
      { x: -3.6, z: 6, w: 4.2, d: 2.4 },
    ].map((p) => {
      const y = height(p.x, p.z);
      const foot = dashed(square(p.x, p.z, p.w, p.d), pal.route, y + 0.08);
      const pad = solid(new THREE.BoxGeometry(p.w - 1, 0.5, p.d - 1), yellow, p.x, y + 0.25, p.z, group);
      pad.userData.y = y;
      return { foot, pad };
    });
    const color = new THREE.Color();
    update = (time) => {
      const t = time % 8;
      lines();
      const fade = 1 - seg(t, 6.9, 7.8);
      // the scan crosses from the back left corner to the front right
      const front = lerp(-1.25, 1.25, easeInOut(seg(t, 0.4, 3.2)));
      for (let k = 0; k < N * N; k++) {
        const u = (at(Math.floor(k / N)) + at(k % N)) / TILE;
        const shown = easeOut(seg(front - u, 0, 0.3));
        cells.setColorAt(k, color.setRGB(PK[k] * shown * fade, 0, 0));
      }
      cells.instanceColor.needsUpdate = true;
      places.forEach((p, i) => {
        const k = easeInOut(seg(t, 3.0 + i * 0.35, 3.9 + i * 0.35)) * fade;
        p.foot.uniforms.uDraw.value = k;
        p.foot.uniforms.uShift.value = time * 1.6;
        const up = easeOut(seg(t, 4.0 + i * 0.3, 4.6 + i * 0.3)) * fade;
        p.pad.visible = up > 0.01;
        p.pad.scale.set(1, Math.max(0.01, up), 1);
        p.pad.position.y = p.pad.userData.y + 0.25 * up;
      });
    };
  } else if (kind === 'sense') {
    /* ---- AI-Enabled Sense: four sensors, one track ---- */
    island();
    // the radar on its stand, the first sensor; it sees all round, so it
    // does not turn
    const mast = buildRadar(yellow);
    mast.position.set(-4.5, 0, -4.5);
    mast.scale.setScalar(1.6);
    mast.userData.head.scale.setScalar(1.1);
    group.add(mast);
    // EO/IR: a turret on a post, panning with the track
    const eo = new THREE.Group();
    eo.position.set(5, 0, 1);
    group.add(eo);
    solid(new THREE.BoxGeometry(1.5, 0.2, 1.5), yellow, 0, 0.1, 0, eo);
    solid(new THREE.BoxGeometry(0.3, 3.2, 0.3), yellow, 0, 1.8, 0, eo);
    const pan = new THREE.Group();
    pan.position.y = 3.75;
    pan.scale.setScalar(1.35);
    eo.add(pan);
    solid(new THREE.BoxGeometry(1.0, 0.8, 0.9), yellow, 0, 0, 0, pan);
    solid(new THREE.CylinderGeometry(0.26, 0.26, 0.36, 18).rotateX(Math.PI / 2), yellow, 0, 0.06, 0.62, pan);
    // passive RF: a thin mast with crossed dipoles
    const rf = new THREE.Group();
    rf.position.set(-6, 0, 5);
    group.add(rf);
    solid(new THREE.BoxGeometry(1.3, 0.2, 1.3), yellow, 0, 0.1, 0, rf);
    solid(mergeGeometries([boxAt(0.16, 6.4, 0.16, 0, 3.3, 0), boxAt(1.6, 0.08, 0.08, 0, 5.0, 0), boxAt(0.08, 0.08, 1.6, 0, 5.8, 0), boxAt(1.1, 0.08, 0.08, 0, 6.4, 0)]), yellow, 0, 0, 0, rf);
    // acoustic: a small array on three legs
    const ac = new THREE.Group();
    ac.position.set(2, 0, 6.5);
    ac.scale.setScalar(1.3);
    group.add(ac);
    solid(new THREE.BoxGeometry(1.5, 0.2, 1.5), yellow, 0, 0.1, 0, ac);
    solid(mergeGeometries([0, 1, 2].map((i) => boxAt(0.1, 1.3, 0.1, Math.cos((i * TAU) / 3) * 0.45, 0.85, Math.sin((i * TAU) / 3) * 0.45))), yellow, 0, 0, 0, ac);
    solid(new THREE.CylinderGeometry(0.7, 0.7, 0.18, 28), yellow, 0, 1.55, 0, ac);
    // a group of drones off the back right, one track for all four sensors
    const { mesh: drones, brackets } = swarm(4);
    const OFF = [[0, 0, 0], [-1.8, 0.7, 1.2], [1.6, -0.5, 1.4], [0.3, 1.2, -1.6]];
    const center = new THREE.Vector3();
    const tracks = [0, 1, 2, 3].map(() => liveLine(dash, pal.route, group, overlay));
    const tops = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    update = (time) => {
      const t = time % 8;
      lines();
      center.set(6.5 + Math.sin(time * 0.35) * 1.4, 10.6 + Math.sin(time * 0.8) * 0.4, -8 + Math.cos(time * 0.35) * 1.2);
      group.updateMatrixWorld(true);
      // the EO/IR turret follows the group
      eo.getWorldPosition(v);
      pan.rotation.y = Math.atan2(center.x - v.x, center.z - v.z);
      pan.rotation.x = -0.35;
      const lock = easeOut(seg(t, 2.6, 3.3)) * (1 - seg(t, 6.6, 7.2));
      OFF.forEach(([ox, oy, oz], i) => {
        const x = center.x + ox, y = center.y + oy + Math.sin(time * 1.7 + i * 1.9) * 0.25, z = center.z + oz;
        tmp.position.set(x, y, z);
        tmp.rotation.set(0, time * 0.3 + i, 0);
        tmp.scale.setScalar(0.55);
        tmp.updateMatrix();
        drones.setMatrixAt(i, tmp.matrix);
        brackets.set(i, x, y, z, 0.35 + 0.65 * lock, lock, time);
      });
      drones.instanceMatrix.needsUpdate = true;
      brackets.commit();
      // each sensor draws its track in turn, then all four let go together
      mast.userData.head.localToWorld(tops[0].set(0, 0.4, 0));
      pan.getWorldPosition(tops[1]);
      rf.localToWorld(tops[2].set(0, 6.4, 0));
      ac.localToWorld(tops[3].set(0, 1.65, 0));
      tracks.forEach((tr, i) => tr.set(tops[i], center, easeInOut(seg(t, 0.5 + i * 0.5, 1.3 + i * 0.5)) * (1 - easeInOut(seg(t, 6.5, 7.3))), time * 1.6));
    };
  } else if (kind === 'decide') {
    /* ---- Compatible C2: the operator, the C2 already there ---- */
    island();
    // the operator's two tables, turned so the operator faces the far side
    // where the drones come from (Hunter, 7 October); their screens are the
    // lamp
    const lampMat = iconMaterial(pal.lampOff);
    const shelter = buildOperatorStation(yellow, lampMat);
    shelter.rotation.y = Math.PI / 2;
    shelter.position.set(-3.5, 0, 2);
    shelter.scale.setScalar(2);
    group.add(shelter);
    // the C2 already on site, in grey: a command vehicle with its dish and a
    // generator beside it
    const c2 = new THREE.Group();
    c2.position.set(4.2, 0, -5.2);
    c2.scale.setScalar(1.3);
    group.add(c2);
    const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 18).rotateX(Math.PI / 2);
    solid(mergeGeometries([boxAt(4.6, 2.1, 2.2, -0.4, 1.55, 0), boxAt(1.5, 1.5, 2.0, 2.6, 1.25, 0), boxAt(6.2, 0.3, 1.8, 0.2, 0.55, 0),
      ...[-1.9, -0.6, 2.4].flatMap((x) => [wheel.clone().translate(x, 0.42, 0.95), wheel.clone().translate(x, 0.42, -0.95)])]), site, 0, 0, 0, c2);
    const dish = new THREE.Group();
    dish.position.set(-1.2, 2.6, 0);
    c2.add(dish);
    solid(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8), site, 0, 0.4, 0, dish);
    solid(new THREE.CylinderGeometry(1.05, 0.25, 0.4, 28).rotateZ(-0.7), site, 0.2, 1.05, 0, dish);
    const comms = buildMast(site);
    comms.position.set(-6.5, 0, -5.5);
    comms.scale.setScalar(0.62);
    comms.userData.head.visible = false;
    group.add(comms);
    solid(mergeGeometries([boxAt(0.06, 1.6, 0.06, 0, 0.8, 0), boxAt(1.2, 0.06, 0.06, 0, 1.2, 0)]), site, -6.5, 6.4, -5.5, group);
    // tracks come in from the C2 on the ground; the order goes out to the
    // effector, off the island's right edge
    const inLink = dashed([[1.4, -5.2], [-0.9, -0.2]], pal.route);
    const outLink = dashed([[-1.9, 2], [9.4, 2]], pal.route);
    const pulse = ring(pal.route, true);
    update = (time) => {
      const t = time % 7;
      lines();
      dish.rotation.y = Math.sin(time * 0.4) * 0.6;
      inLink.uniforms.uDraw.value = easeInOut(seg(t, 0.3, 1.2)) * (1 - easeInOut(seg(t, 6.0, 6.8)));
      inLink.uniforms.uShift.value = time * 1.6;
      const on = seg(t, 2.2, 2.5) * (1 - seg(t, 5.4, 5.9));
      tint(lampMat, pal.lampOff, pal.lampOn, on);
      const k = seg(t, 2.3, 3.6);
      pulse.visible = k > 0 && k < 1;
      if (pulse.visible) {
        pulse.position.set(-3.5, 0.1, 2);
        pulse.scale.setScalar(3 + easeOut(k) * 6);
        pulse.material.uniforms.uOpacity.value = (1 - k) * 0.8;
      }
      outLink.uniforms.uDraw.value = easeInOut(seg(t, 2.8, 3.8)) * (1 - easeInOut(seg(t, 5.8, 6.6)));
      outLink.uniforms.uShift.value = time * 1.6;
    };
  } else if (kind === 'effect') {
    /* ---- Leonidas: one swarm, then another, each with one pulse, both
       coming in over the far side, the rings running out to them away from
       everything behind it (Epirus, 6 October call: it never fires back
       across the system) ---- */
    island();
    // its pad toward the far corner, the trailer square to the grid and
    // centred on it, the array resting toward the far side
    const PAD = { x: -1, z: -1, size: 9 };
    solid(new THREE.BoxGeometry(PAD.size, 0.6, PAD.size), yellow, PAD.x, 0.3, PAD.z, group);
    const leo = buildLeonidas(yellow);
    leo.position.set(PAD.x + 0.85 * 1.05, 0.6, PAD.z);
    leo.scale.setScalar(1.05);
    leo.userData.turn.rotation.y = Math.PI;
    group.add(leo);
    // its generator at the island's near corner: Leonidas is electric, so a
    // standard generator is its magazine; the power line runs out from
    // behind it to the pad, its dashes marching to Leonidas
    const gen = buildGenerator(yellow);
    gen.position.set(7.8, 0, 7.8);
    gen.rotation.y = Math.PI / 4;
    gen.scale.setScalar(0.8);
    group.add(gen);
    const corner = PAD.x + PAD.size / 2 + 0.25;
    const power = dashed([[7.1, 7.1], [corner, corner]], pal.route);
    const SW = [{ hold: [-8.7, 7.4, -5] }, { hold: [-5, 8, -8.7] }];
    const OFF = [[0, 0, 0], [-1.6, 0.8, 1.3], [1.5, -0.4, 1.5], [0.4, 1.3, -1.6], [-1.2, -0.7, -1.3]];
    const { mesh: drones, brackets } = swarm(SW.length * OFF.length);
    // the rings: they run out from the array to the swarm it answers,
    // widening as they go, a cone of circles
    const waves = [0, 1, 2].map(() => ring(pal.air, false));
    const centers = SW.map(() => new THREE.Vector3());
    const target = new THREE.Vector3(), emitter = new THREE.Vector3(), seen = new THREE.Vector3();
    const wrap = (a) => ((((a % TAU) + TAU * 1.5) % TAU) - Math.PI);
    // round six (data-r6 on the page): each swarm keeps one speed and is
    // brought down on the move, never slowed to a hover first (Jeff Morgan,
    // 10 October); earlier rounds keep theirs
    const STEADY = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-r6');
    update = (time) => {
      const t = time % 10;
      lines();
      group.updateMatrixWorld(true);
      // each swarm: in, tracked, one pulse, down; the second five seconds on
      let aimAt = -1, firing = 0;
      SW.forEach((sw, k) => {
        const c = t - k * 5;
        // steady: reaches where it was held at the moment it is hit
        const arrive = STEADY ? seg(Math.min(c, 2.6), -0.4, 2.6) : easeOut(seg(c, -0.4, 1.4));
        const out = c < -0.4 || c > 4.4;
        const down = easeInOut(seg(c, 2.6, 3.5));
        centers[k].set(lerp(sw.hold[0] * 1.8, sw.hold[0], arrive), sw.hold[1] + Math.sin(time * 0.9 + k) * 0.3, lerp(sw.hold[2] * 1.8, sw.hold[2], arrive));
        // and carries on its way a little as it falls
        const fall = seg(c, 2.6, 3.5), carry = STEADY ? -0.8 * 0.45 * (0.9 / 3.0) * (fall - (fall * fall) / 2) : 0;
        const lock = easeOut(seg(c, 0.8, 1.6));
        OFF.forEach(([ox, oy, oz], j) => {
          const i = k * OFF.length + j;
          const x = centers[k].x + ox + sw.hold[0] * carry, z = centers[k].z + oz + sw.hold[2] * carry;
          const y = centers[k].y + oy + Math.sin(time * 1.6 + i * 1.3) * 0.25 - down * 7;
          tmp.position.set(x, y, z);
          tmp.rotation.set(down * 1.2 * Math.sin(i), time * 0.3 + i, down * 0.9 * Math.cos(i));
          tmp.scale.setScalar(out ? 0 : 0.55 * (1 - seg(down, 0.45, 1)));
          tmp.updateMatrix();
          drones.setMatrixAt(i, tmp.matrix);
          brackets.set(i, x, y, z, out ? 0 : lock * (1 - seg(down, 0, 0.35)), lock, time);
        });
        if (c > 0.6 && c < 4.6) aimAt = k;
        firing = Math.max(firing, seg(c, 2.0, 2.3) * (1 - seg(c, 3.0, 3.4)));
      });
      drones.instanceMatrix.needsUpdate = true;
      brackets.commit();
      power.uniforms.uShift.value = time * 1.6;
      power.uniforms.uOpacity.value = lerp(0.6, 0.95, firing);
      // Leonidas turns on its turntable to the swarm it is answering, and
      // back to rest after
      const rest = Math.PI;
      const toA = Math.atan2(centers[0].x - leo.position.x, centers[0].z - leo.position.z);
      const toB = Math.atan2(centers[1].x - leo.position.x, centers[1].z - leo.position.z);
      const a = easeInOut(seg(t, 0.6, 1.6)), b = easeInOut(seg(t, 5.6, 6.6)), back = easeInOut(seg(t, 8.6, 9.6));
      let yaw = rest + wrap(toA - rest) * a;
      yaw += wrap(toB - yaw) * b;
      yaw += wrap(rest - yaw) * back;
      leo.userData.turn.rotation.y = yaw;
      leo.updateMatrixWorld(true);
      leo.userData.tilt.localToWorld(emitter.copy(leo.userData.emitter));
      target.copy(centers[Math.max(0, aimAt)]);
      // the rings, in the island's own space, while it fires
      group.worldToLocal(emitter);
      group.localToWorld(seen.copy(target));
      waves.forEach((wv, i) => {
        const u = ((time / 0.9 + i / 3) % 1 + 1) % 1;
        wv.visible = firing > 0;
        if (!wv.visible) return;
        wv.position.lerpVectors(emitter, target, u);
        wv.lookAt(seen);
        wv.scale.setScalar(lerp(1.4, 5.5, u));
        wv.material.uniforms.uOpacity.value = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.7 * firing;
      });
    };
  }

  return { group, update };
}
