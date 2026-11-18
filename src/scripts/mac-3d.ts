/* A live 3D MacBook (Hunter, Nov 17: "Is there some world where there's a 3D MacBook mockup that makes this more
   interactive, so we're not doing a Blender model?"; then "Try it on exe"). The same laptop as the renders:
   devices.py builds it in Blender, exported once to public/models/macbook.glb (no outside model, nothing to
   license). three.js draws it live, the site's own recording playing on its screen as a video texture, lit by
   a soft room so the aluminium reads; it turns a little toward the pointer and swings round as the row scrolls
   by. Everything loads when the row nears the screen; a phone, reduced motion or no WebGL keeps the still
   render underneath, which stays in place until the 3D is drawing. */
import type * as T from "three";

type Opts = { model: string; video: HTMLVideoElement; yaw?: number; pitch?: number; screen?: RegExp; turn?: number };

export async function mountMac3D(host: HTMLElement, { model, video, yaw = -0.5, pitch = 0.42, screen = /display|sfCQkHOWyrsLmor/, turn = 0 }: Opts) {
  const [THREE, { GLTFLoader }] = await Promise.all([import("three"), import("three/addons/loaders/GLTFLoader.js")]);
  const canvas = document.createElement("canvas");
  canvas.className = "mac3d";
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);
  let renderer: T.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch {
    canvas.remove();
    return null;
  }
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  // a product-shot room (Hunter, Nov 17, the PROLED XDR mockup): light from above fading to dark below, a big
  // softbox on the right, nothing on the left, so the aluminium reads bright on top and falls off to the left
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec3 vP; void main(){ float y = vP.y * 0.5 + 0.5; float side = smoothstep(-0.6, 0.9, vP.x); vec3 c = mix(vec3(0.05), vec3(0.95), pow(y, 1.6)) * mix(0.35, 1.0, side); gl_FragColor = vec4(c, 1.0); }",
    }),
  );
  room.add(dome);
  const softbox = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  softbox.material.color.multiplyScalar(3.2);
  softbox.position.set(7, 4, 2);
  softbox.lookAt(0, 0, 0);
  room.add(softbox);
  scene.environment = pmrem.fromScene(room, 0.03).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 5, 2);
  scene.add(key);

  const gltf = await new GLTFLoader().loadAsync(model);
  const mac = gltf.scene;
  // the screen plays the site; the glass over it is left off so nothing dims the picture
  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  mac.traverse((o) => {
    const m = o as T.Mesh;
    if (!m.isMesh) return;
    const matName = (m.material as T.Material)?.name ?? "";
    if (screen.test(m.name) || screen.test(matName)) {
      // the screen plays the site, its picture fitted to the screen mesh's own UVs (an atlas may use only part)
      const uv = m.geometry.getAttribute("uv");
      if (uv) {
        let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
        for (let i = 0; i < uv.count; i++) {
          u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i));
          v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i));
        }
        const t = tex.clone();
        // this model's screen runs its v the other way up, so the picture is turned upright here
        t.repeat.set(1 / (u1 - u0 || 1), -1 / (v1 - v0 || 1));
        t.offset.set(-u0 / (u1 - u0 || 1), v1 / (v1 - v0 || 1));
        m.material = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
      } else m.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      return;
    }
    if (/display/.test(m.name)) m.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    // the glass: almost clear, just enough to catch the room's reflections across the screen
    else if (/glass/.test(m.name))
      m.material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.07, envMapIntensity: 2.2, depthWrite: false });
    else {
      // Blender's procedural materials come over as flat colours: set them to read like the render's space-grey
      const name = ((m.material as T.Material)?.name ?? "").toLowerCase();
      const look: Record<string, [number, number, number]> = {
        metal_space: [0x6b6e73, 1, 0.34],
        trackpad: [0x55575b, 0.7, 0.32],
        grille: [0x1c1d1f, 0.4, 0.8],
        keys: [0x101112, 0.1, 0.55],
        well: [0x18191a, 0.2, 0.7],
        gap: [0x0c0c0d, 0, 0.9],
        hinge: [0x2a2b2d, 0.6, 0.5],
        rubber: [0x0e0e0f, 0, 0.9],
      };
      const hit = Object.keys(look).find((k) => name.includes(k));
      if (hit) {
        const [color, metalness, roughness] = look[hit];
        // anodised aluminium: fully metal with a faint clear coat; the rest plain
        m.material =
          hit === "metal_space"
            ? new THREE.MeshPhysicalMaterial({ color, metalness, roughness, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 1.5 })
            : new THREE.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity: 1.1 });
      }
    }
  });
  // centred on its own box, so it turns about its middle
  const box = new THREE.Box3().setFromObject(mac);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  mac.position.sub(mid);
  const pivot = new THREE.Group();
  pivot.rotation.y = turn; // the model's own facing, so its front faces the camera at yaw 0
  pivot.add(mac);
  const turnG = new THREE.Group();
  turnG.add(pivot);
  scene.add(turnG);

  // a soft shadow on the ground under it
  const sh = document.createElement("canvas");
  sh.width = sh.height = 128;
  const g = sh.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.42)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.25, size.z * 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -size.y / 2 + 0.0005;
  turnG.add(shadow);

  // an orthographic camera from above and to the side (Hunter, Nov 17: "i like the isometric look"), no
  // perspective, so it reads like the product mockups
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  const radius = size.length() / 2;
  const place = () => {
    const w = canvas.clientWidth || host.clientWidth, h = canvas.clientHeight || host.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h, half = radius * 0.98;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.position.set(0, Math.sin(pitch) * radius * 6, Math.cos(pitch) * radius * 6);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(place).observe(canvas);
  place();

  // turns: a little toward the pointer over the row, and round from the right to facing the pages as the
  // row scrolls up the screen
  const row = host.closest<HTMLElement>(".brand-web_row") ?? host;
  let px = 0, py = 0, ry = yaw, rx = 0, on = false, raf = 0;
  row.addEventListener("pointermove", (e) => {
    const r = row.getBoundingClientRect();
    px = (e.clientX - r.left) / r.width - 0.5;
    py = (e.clientY - r.top) / r.height - 0.5;
  });
  row.addEventListener("pointerleave", () => ((px = 0), (py = 0)));
  const frame = () => {
    raf = 0;
    if (!on) return;
    const r = row.getBoundingClientRect();
    const through = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height))); // 0 entering, 1 leaving
    const wantY = yaw + (0.5 - through) * 0.5 + px * 0.35, wantX = py * 0.04;
    ry += (wantY - ry) * 0.08;
    rx += (wantX - rx) * 0.08;
    turnG.rotation.set(rx, ry, 0);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => {
    on = e.isIntersecting;
    if (on && !raf) raf = requestAnimationFrame(frame);
  }).observe(host);
  renderer.render(scene, camera);
  host.classList.add("is-3d");
  return { renderer };
}
