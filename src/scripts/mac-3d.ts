/* A live 3D MacBook (Hunter, Nov 17: "Is there some world where there's a 3D MacBook mockup that makes this more
   interactive, so we're not doing a Blender model?"; then "Try it on exe"). The same laptop as the renders:
   devices.py builds it in Blender, exported once to public/models/macbook.glb (no outside model, nothing to
   license). three.js draws it live, the site's own recording playing on its screen as a video texture, lit by
   a soft room so the aluminium reads; it turns a little toward the pointer and swings round as the row scrolls
   by. Everything loads when the row nears the screen; a phone, reduced motion or no WebGL keeps the still
   render underneath, which stays in place until the 3D is drawing. */
import type * as T from "three";

type Opts = { model: string; video: HTMLVideoElement; yaw?: number; pitch?: number };

export async function mountMac3D(host: HTMLElement, { model, video, yaw = 0.21, pitch = 0.14 }: Opts) {
  const [THREE, { GLTFLoader }, { RoomEnvironment }] = await Promise.all([
    import("three"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/environments/RoomEnvironment.js"),
  ]);
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-2, 4, 3);
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
    if (/display/.test(m.name)) m.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    else if (/glass/.test(m.name)) m.visible = false;
    else {
      // Blender's procedural materials come over as flat colours: set them to read like the render's space-grey
      const name = ((m.material as T.Material)?.name ?? "").toLowerCase();
      const look: Record<string, [number, number, number]> = {
        metal_space: [0x4b4d51, 0.85, 0.38],
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
        m.material = new THREE.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity: 1.1 });
      }
    }
  });
  // centred on its own box, so it turns about its middle
  const box = new THREE.Box3().setFromObject(mac);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  mac.position.sub(mid);
  const turn = new THREE.Group();
  turn.add(mac);
  scene.add(turn);

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
  turn.add(shadow);

  const camera = new THREE.PerspectiveCamera(18, 1, 0.01, 50);
  const radius = size.length();
  const place = () => {
    const w = canvas.clientWidth || host.clientWidth, h = canvas.clientHeight || host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // far enough that the laptop fills about the frame the render did
    const dist = (radius * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect) * 0.86;
    camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(0, -size.y * 0.05, 0);
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
    const wantY = yaw + (0.5 - through) * 0.5 + px * 0.35, wantX = py * 0.12;
    ry += (wantY - ry) * 0.08;
    rx += (wantX - rx) * 0.08;
    turn.rotation.set(rx, ry, 0);
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
