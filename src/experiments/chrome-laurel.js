/* Chrome laurel: the award laurel, in polished metal.

   The studio's Blender laurel rebuilt live (src/scripts/laurel.js): drag to
   turn it, dial its leaves and branches, and Explode it to watch every leaf
   fly off and spring home. */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildLaurel, createChromeEnvironment, createChromeMaterial } from "../scripts/laurel.js";

export const params = {
  leaves: {
    pairs: [11, 4, 18, 1],
    length: [1, 0.6, 1.5, 0.01],
    width: [1, 0.5, 1.8, 0.01],
    curl: [0.05, -0.08, 0.2, 0.005],
  },
  branch: {
    opening: [56, 12, 140, 1],
    spread: [1, 0.8, 1.25, 0.01],
  },
  metal: {
    roughness: [0.07, 0, 0.5, 0.01],
    tint: "#f6f6f9",
    environment: [1, 0.2, 2.5, 0.01],
  },
  motion: {
    rotationSpeed: [0.45, 0, 2, 0.01],
  },
  stage: {
    ground: "#0d0d0d",
  },
  explode: { type: "action", label: "Explode" },
};

const SHAPE = ["leaves.pairs", "leaves.length", "leaves.width", "leaves.curl", "branch.opening", "branch.spread"];
const DEG = Math.PI / 180;

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;";
  host.append(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    canvas.remove();
    const note = document.createElement("p");
    note.textContent = "This piece needs WebGL, which this browser has turned off.";
    note.style.cssText = "position:absolute;inset:auto 0 50% 0;margin:0;text-align:center;color:#d9e2d2;opacity:.7;";
    host.append(note);
    return { update() {}, action() {}, destroy: () => note.remove() };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const env = createChromeEnvironment(renderer);
  scene.environment = env.texture;
  scene.background = new THREE.Color(v["stage.ground"]);

  const material = createChromeMaterial({ roughness: v["metal.roughness"] });
  const rim = new THREE.DirectionalLight(0xeef3ea, 1.4);
  rim.position.set(-2, 2.5, -3);
  scene.add(rim);

  const pivot = new THREE.Group(); // the idle sway turns this
  scene.add(pivot);
  let laurel = null;
  let leaves = [];

  const camera = new THREE.PerspectiveCamera(15, 1, 0.1, 200);
  camera.position.set(0, 0, 8);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = !reduced;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.7;
  controls.minDistance = 5;
  controls.maxDistance = 40;

  const applyLook = () => {
    material.roughness = v["metal.roughness"];
    material.color.set(v["metal.tint"]);
    material.envMapIntensity = v["metal.environment"];
    rim.intensity = 1.4 * v["metal.environment"];
    scene.background.set(v["stage.ground"]);
  };

  const rebuild = () => {
    if (laurel) {
      pivot.remove(laurel);
      laurel.traverse((c) => c.isMesh && c.geometry.dispose());
    }
    laurel = buildLaurel({
      pairs: v["leaves.pairs"],
      length: v["leaves.length"],
      width: v["leaves.width"],
      curl: v["leaves.curl"],
      opening: v["branch.opening"],
      spread: v["branch.spread"],
      bow: 0.2, // a little crown curve, so it stays sculptural when turned edge-on
      merge: false,
      material,
    });
    pivot.add(laurel);
    leaves = laurel.userData.leaves.map((mesh) => ({
      mesh,
      // away from the wreath's centre, leaning the way the leaf points
      dir: mesh.userData.rest.position.clone().setZ(0).normalize().addScaledVector(mesh.userData.out, 0.35).normalize(),
      offset: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      spinVel: new THREE.Vector3(),
      delay: -1,
      kick: null,
    }));
    exploded = false;
  };

  // frame the wreath in the stage, whatever its shape
  let fitDistance = 8;
  const fit = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tan = Math.tan((camera.fov * DEG) / 2);
    const { halfWidth, halfHeight } = laurel.userData.extent;
    const fill = camera.aspect < 1 ? 0.9 : 0.78;
    fitDistance = Math.max(halfHeight / (tan * fill), halfWidth / (tan * camera.aspect * fill));
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, fitDistance);
    controls.maxDistance = Math.max(40, fitDistance * 2);
    controls.update();
  };

  // Explode: every leaf gets a kick outward (staggered from stem to tip),
  // then springs home with a little overshoot.
  let exploded = false; // reduced motion: a still toggle instead
  const explode = () => {
    if (reduced) {
      exploded = !exploded;
      for (const l of leaves) {
        if (exploded) {
          const o = l.dir;
          l.offset.set(o.x * 0.55, o.y * 0.55, 0.35 * Math.sin(l.mesh.userData.f * 9));
          l.spin.set(0.3, 0.4, 0.6).multiplyScalar(Math.sin(l.mesh.userData.f * 13 + o.x));
        } else {
          l.offset.set(0, 0, 0);
          l.spin.set(0, 0, 0);
        }
        place(l);
      }
      render();
      return;
    }
    for (const l of leaves) {
      const o = l.dir;
      const r = Math.random;
      l.delay = l.mesh.userData.f * 0.28 + r() * 0.05;
      l.kick = {
        vel: new THREE.Vector3(o.x, o.y, 0).multiplyScalar(5 + r() * 3).add(new THREE.Vector3(0, 0, (r() - 0.35) * 6)),
        spin: new THREE.Vector3((r() - 0.5) * 16, (r() - 0.5) * 16, (r() - 0.5) * 10),
      };
    }
    wake();
  };

  const place = (l) => {
    const { rest } = l.mesh.userData;
    l.mesh.position.copy(rest.position).add(l.offset);
    l.mesh.rotation.set(l.spin.x, l.spin.y, rest.rotation + l.spin.z);
  };

  const K = 46, C = 4.2; // spring stiffness, damping
  let settled = true;
  const stepLeaves = (dt) => {
    settled = true;
    for (const l of leaves) {
      if (l.kick) {
        l.delay -= dt;
        if (l.delay <= 0) {
          l.vel.add(l.kick.vel);
          l.spinVel.add(l.kick.spin);
          l.kick = null;
        }
        settled = false;
      }
      l.vel.addScaledVector(l.offset, -K * dt).multiplyScalar(Math.exp(-C * dt));
      l.offset.addScaledVector(l.vel, dt);
      l.spinVel.addScaledVector(l.spin, -K * dt).multiplyScalar(Math.exp(-C * dt));
      l.spin.addScaledVector(l.spinVel, dt);
      if (l.offset.lengthSq() + l.vel.lengthSq() + l.spin.lengthSq() + l.spinVel.lengthSq() > 1e-7) settled = false;
      place(l);
    }
  };

  let phase = 0;
  let raf = 0;
  let last = performance.now();
  let visible = document.visibilityState !== "hidden";
  let onscreen = true;

  const render = () => renderer.render(scene, camera);
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    phase += dt * v["motion.rotationSpeed"];
    pivot.rotation.y = Math.sin(phase) * 0.62;
    pivot.rotation.x = Math.sin(phase * 0.7 + 1.1) * 0.08;
    pivot.position.y = Math.sin(phase * 0.9) * 0.03;
    if (!settled || leaves.some((l) => l.kick)) stepLeaves(dt);
    controls.update();
    render();
    wake();
  };
  const wake = () => {
    if (raf || reduced || !visible || !onscreen) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const ro = new ResizeObserver(() => {
    fit();
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
  const onControls = () => reduced && render();
  controls.addEventListener("change", onControls);
  const onDown = () => (canvas.style.cursor = "grabbing");
  const onUp = () => (canvas.style.cursor = "grab");
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);

  rebuild();
  applyLook();
  if (reduced) pivot.rotation.set(0.04, -0.28, 0); // a settled three-quarter turn
  fit();
  render();
  wake();

  return {
    update(next, path) {
      Object.assign(v, next);
      if (path === null || SHAPE.includes(path)) {
        rebuild();
        fit();
      }
      applyLook();
      render();
    },
    action(name) {
      if (name === "explode") explode();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controls.removeEventListener("change", onControls);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      controls.dispose();
      laurel?.traverse((c) => c.isMesh && c.geometry.dispose());
      material.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
