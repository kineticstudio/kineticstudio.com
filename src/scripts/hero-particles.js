/* The homepage hero turning into particles as you scroll (Hunter, Oct 24:
   "as i scroll, i want all of this to turn into particles": the headline,
   the laurels and their lines, the client logos).

   The moment the scroll starts to take the hero away, it is drawn once into
   a small offscreen canvas exactly where it sits: the words in their own
   fonts (one Range per word, so wrapped lines land right), the award logos
   with their CSS filters, the 3D laurels straight off their canvas, and the
   logo strip where it has run to. Every lit pixel of that becomes a point at
   the same place, so the handover from the real hero is invisible. From
   there the scroll drives them: each point lets go on its own beat, the
   bottom of the hero first, and drifts up and out on a little swirl,
   fading as it goes. The hero's frames are drawn only when the scroll
   moves it.

   Then they come back between the sets of work (Hunter, Oct 24: "What if,
   between those sets, particles come back in and then assemble to create
   some sort of small headline, and then particleize, go off the other way,
   and come back in?"): a short line, set in the headline's own face, is
   spelled out of grains that stream in from one edge of the screen, left of
   the line first, rides up with its gap, and lets go toward the other edge
   as the gap nears the top. The canvas sits over the rows, so the stream
   stays in sight as it crosses the work; while grains are in the air they
   drift on their own, between scrolls too.

     const p = heroParticles(head, stage)   // null without WebGL
     p.lines(["119 Websites built", ...])   // the lines for the gaps, in order
     p.update({ hero, line })               // hero: 0 = the hero .. 1 = all gone;
                                            // line: { k, x, y, a, d } the kth line at x, y
                                            // (stage px), a = how far in, d = how far gone
     p.domOpacity(progress)                 // what the real hero's opacity should be */

import * as THREE from "three";

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const VERT = /* glsl */ `
  attribute vec4 aColor;
  attribute vec3 aRand;
  uniform float uP, uDpr, uSize, uShow;
  uniform vec2 uView;
  varying vec4 vColor;
  void main() {
    vec2 aOrigin = position.xy; // css px from the stage's top left
    // every grain starts to go at the first scroll, the bottom of the hero a little ahead
    // (Hunter, Oct 24: it "goes to particles way too late")
    float delay = (1.0 - aOrigin.y / uView.y) * 0.14 + aRand.x * 0.1;
    float t = clamp((uP * 1.3 - delay) / 0.7, 0.0, 1.0);
    float e = t * t * (3.0 - 2.0 * t);
    // straight away a fizz, each grain shaking loose on its own, so the hero
    // never reads as a still copy of itself before it goes
    float fizz = smoothstep(0.0, 0.12, uP) * (1.0 - e);
    vec2 jitter = (aRand.yz - 0.5) * 2.0 * fizz * 2.2;
    // up and out, on a swirl that turns as it goes
    vec2 drift = vec2((aRand.y - 0.5) * 240.0 + sin(aOrigin.y * 0.031 + aRand.x * 6.2832) * 70.0, -(150.0 + aRand.z * 380.0));
    float a = (aRand.x - 0.5) * 2.4 * e;
    drift = mat2(cos(a), -sin(a), sin(a), cos(a)) * drift;
    vec2 pos = aOrigin + drift * e + jitter;
    gl_Position = vec4(pos.x / uView.x * 2.0 - 1.0, 1.0 - pos.y / uView.y * 2.0, 0.0, 1.0);
    gl_PointSize = uSize * uDpr * (1.0 + e * (0.6 + aRand.z * 1.2));
    vColor = vec4(aColor.rgb, aColor.a * uShow * (1.0 - smoothstep(0.35, 1.0, t)));
  }`;
const FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() {
    // a round, soft grain
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = vColor.a * (1.0 - smoothstep(0.18, 0.5, d));
    gl_FragColor = vec4(vColor.rgb * a, a);
  }`;

// a line between the sets: grains stream in from one edge of the screen to
// spell it and away past the other (Hunter, Oct 24: "amplify the particle
// effect that goes down the page. I kind of lose it on the side, and let's
// make it a little bit more fluid"): they fly over the work, on screen the
// whole way, each on its own bow, and drift while they are in the air
const LINE_VERT = /* glsl */ `
  attribute vec4 aColor;
  attribute vec3 aRand;
  uniform float uIn, uOut, uDpr, uSize, uDir, uTime;
  uniform vec2 uView, uCenter, uSpan;
  varying vec4 vColor;
  void main() {
    vec2 home = uCenter + position.xy; // its place in the line, riding up with the gap
    float across = clamp(position.x / max(uSpan.x, 1.0) + 0.5, 0.0, 1.0);
    // in: on its own beat, the left of the line first, so it spells itself out; fast, then settling
    float tin = clamp(uIn * 1.6 - (across * 0.4 + aRand.x * 0.2), 0.0, 1.0);
    float ein = 1.0 - pow(1.0 - tin, 3.0);
    // out: the same order, slow to let go, then away
    float tout = clamp(uOut * 1.6 - (across * 0.35 + aRand.y * 0.25), 0.0, 1.0);
    float eout = tout * tout * (3.0 - 2.0 * tout);
    // from just past one side of the screen, about level with the gap, to just past the other, rising
    float from = uDir > 0.0 ? -1.0 : 1.0;
    vec2 start = vec2((0.5 + from * (0.54 + aRand.y * 0.1)) * uView.x, home.y + (aRand.z - 0.3) * 0.6 * uView.y);
    vec2 end = vec2((0.5 - from * (0.54 + aRand.z * 0.1)) * uView.x, home.y - (0.12 + aRand.x * 0.5) * uView.y);
    vec2 inDir = normalize(home - start + 1e-4), outDir = normalize(end - home + 1e-4);
    vec2 pos = mix(start, home, ein) + vec2(-inDir.y, inDir.x) * sin(3.14159 * ein) * (aRand.z - 0.5) * 0.5 * uView.y;
    pos = mix(pos, end, eout) + vec2(-outDir.y, outDir.x) * sin(3.14159 * eout) * (aRand.x - 0.5) * 0.5 * uView.y;
    // in the air they drift, so the stream keeps moving between scrolls
    float fly = clamp(1.0 - ein + eout, 0.0, 1.0);
    pos += fly * 18.0 * vec2(sin(uTime * 1.3 + aRand.x * 6.2832 + home.y * 0.013), cos(uTime * 1.05 + aRand.y * 6.2832 + home.x * 0.011));
    gl_Position = vec4(pos.x / uView.x * 2.0 - 1.0, 1.0 - pos.y / uView.y * 2.0, 0.0, 1.0);
    gl_PointSize = uSize * uDpr * (1.0 + fly * (0.8 + aRand.z * 1.4));
    vColor = vec4(aColor.rgb, aColor.a * smoothstep(0.0, 0.25, tin) * (1.0 - smoothstep(0.6, 1.0, tout)));
  }`;

/** @param {HTMLElement} head the hero's content @param {HTMLElement} stage what it sits in */
export function heroParticles(head, stage) {
  const canvas = document.createElement("canvas");
  canvas.className = "hero-particles";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", zIndex: "4", pointerEvents: "none", display: "none" });
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true });
  } catch {
    return null;
  }
  head.after(canvas);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uP: { value: 0 }, uDpr: { value: dpr }, uSize: { value: 2 }, uShow: { value: 0 }, uView: { value: new THREE.Vector2(1, 1) } },
  });
  const geometry = new THREE.BufferGeometry();
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  // the lines between the sets: one geometry, refilled with whichever line is up
  const lineMaterial = new THREE.ShaderMaterial({
    vertexShader: LINE_VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uIn: { value: 0 }, uOut: { value: 0 }, uDpr: { value: dpr }, uSize: { value: 1.7 }, uDir: { value: 1 }, uTime: { value: 0 },
      uView: { value: new THREE.Vector2(1, 1) }, uCenter: { value: new THREE.Vector2() }, uSpan: { value: new THREE.Vector2(1, 1) },
    },
  });
  const lineGeometry = new THREE.BufferGeometry();
  const linePoints = new THREE.Points(lineGeometry, lineMaterial);
  linePoints.frustumCulled = false;
  linePoints.visible = false;
  scene.add(linePoints);
  let texts = [];
  const spelled = new Map(); // k -> { origin, color, rand, span }
  let showing = -1;
  /* A line in grains: set in the hero headline's face at a little over half
     its size, wrapped to the stage, every lit pixel a grain, centred on 0. */
  const spell = (k) => {
    if (spelled.has(k)) return spelled.get(k);
    const heading = head.querySelector("h1, h2") ?? head;
    const cs = getComputedStyle(heading);
    const px = Math.max(18, parseFloat(cs.fontSize) * 0.78);
    const off = document.createElement("canvas");
    const ctx = off.getContext("2d", { willReadFrequently: true });
    const font = `${cs.fontStyle} ${cs.fontWeight} ${px}px ${cs.fontFamily}`;
    ctx.font = font;
    const spacing = cs.letterSpacing === "normal" ? "0px" : `${(parseFloat(cs.letterSpacing) || 0) * 0.78}px`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = spacing;
    const raw = String(texts[k] ?? "");
    const text = cs.textTransform === "uppercase" ? raw.toUpperCase() : raw;
    // wrapped to the stage
    const max = stage.clientWidth * 0.86;
    const rows = [];
    for (const word of text.split(/\s+/)) {
      const tryRow = rows.length ? `${rows[rows.length - 1]} ${word}` : word;
      if (rows.length && ctx.measureText(tryRow).width <= max) rows[rows.length - 1] = tryRow;
      else rows.push(word);
    }
    const lead = px * 1.05;
    const w = Math.ceil(Math.max(...rows.map((r) => ctx.measureText(r).width))) + 4;
    const h = Math.ceil(lead * rows.length + px * 0.3);
    off.width = w;
    off.height = h;
    ctx.font = font;
    if ("letterSpacing" in ctx) ctx.letterSpacing = spacing;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    const ascent = ctx.measureText("H").actualBoundingBoxAscent;
    rows.forEach((r, i) => ctx.fillText(r, w / 2, px * 0.1 + i * lead + ascent + (lead - px) / 2));
    const { data } = ctx.getImageData(0, 0, w, h);
    const origin = [], color = [], rand = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = data[i + 3];
        if (a < 22) continue;
        // two grains a pixel, so the stream is thick enough to follow
        for (let twin = 0; twin < 2; twin++) {
          origin.push(x + 0.5 + (Math.random() - 0.5) * 0.9 - w / 2, y + 0.5 + (Math.random() - 0.5) * 0.9 - h / 2, 0);
          color.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, a / 255);
          rand.push(Math.random(), Math.random(), Math.random());
        }
      }
    }
    const made = { origin, color, rand, span: [w, h] };
    spelled.set(k, made);
    return made;
  };
  const showLine = (k) => {
    if (k === showing) return;
    showing = k;
    if (k < 0) return;
    const { origin, color, rand, span } = spell(k);
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(origin, 3));
    lineGeometry.setAttribute("aColor", new THREE.Float32BufferAttribute(color, 4));
    lineGeometry.setAttribute("aRand", new THREE.Float32BufferAttribute(rand, 3));
    lineGeometry.setDrawRange(0, origin.length / 3);
    lineMaterial.uniforms.uSpan.value.set(span[0], span[1]);
    // every other line comes in from the other side
    lineMaterial.uniforms.uDir.value = k % 2 ? -1 : 1;
  };

  // the logo strip's marks as images, coloured as they are drawn on the page
  const marks = new Map();
  const markFor = (svg) => {
    const key = svg.getAttribute("aria-label") ?? svg.outerHTML.length;
    if (!marks.has(key)) {
      const copy = svg.cloneNode(true);
      copy.setAttribute("style", `color:${getComputedStyle(svg).color}`);
      const r = svg.getBoundingClientRect();
      copy.setAttribute("width", String(Math.max(1, r.width)));
      copy.setAttribute("height", String(Math.max(1, r.height)));
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
      marks.set(key, img);
    }
    return marks.get(key);
  };
  const prepare = () => head.querySelectorAll(".logos_item svg").forEach(markFor);
  document.fonts.ready.then(prepare);

  // how see-through an element is, everything between it and the hero counted
  const opacityOf = (el) => {
    let a = 1;
    for (let n = el; n && n !== head; n = n.parentElement) a *= Number(getComputedStyle(n).opacity);
    return a;
  };

  let captured = false, size = "";
  function capture() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const base = stage.getBoundingClientRect();
    const step = 1; // css px per particle: every pixel a grain
    const k = 1 / step;
    const off = document.createElement("canvas");
    off.width = Math.ceil(W * k);
    off.height = Math.ceil(H * k);
    const ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.scale(k, k);
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    };

    // the 3D laurels, drawn fresh so their canvas still holds the frame
    const laurels = head.querySelector(".awards_canvas");
    const handle = head.querySelector("[data-awards]")?.__laurels;
    if (laurels && handle?.render) {
      handle.render();
      const b = box(laurels);
      ctx.drawImage(laurels, b.x, b.y, b.w, b.h);
    }
    // the award logos, filtered as they are on the page
    for (const img of head.querySelectorAll("img.awards_logo")) {
      if (!img.complete) continue;
      const b = box(img);
      ctx.save();
      ctx.filter = getComputedStyle(img).filter || "none";
      ctx.globalAlpha = opacityOf(img);
      ctx.drawImage(img, b.x, b.y, b.w, b.h);
      ctx.restore();
    }
    // every word of the headline and the award lines, in its own font
    const walker = document.createTreeWalker(head, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent.trim() && !n.parentElement.closest(".logos_wrap, .film-card_wrap") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      ctx.fillStyle = cs.color;
      ctx.globalAlpha = opacityOf(el);
      ctx.textBaseline = "alphabetic";
      const text = node.textContent;
      for (const m of text.matchAll(/\S+/g)) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const r = range.getClientRects()[0];
        if (!r || !r.width) continue;
        const word = cs.textTransform === "uppercase" ? m[0].toUpperCase() : m[0];
        const ascent = ctx.measureText(word).fontBoundingBoxAscent;
        ctx.fillText(word, r.left - base.left, r.top - base.top + ascent);
      }
    }
    ctx.globalAlpha = 1;
    // the logo strip where it has run to, its ends fading as they do on the page
    const wrap = head.querySelector(".logos_wrap");
    if (wrap) {
      const wb = wrap.getBoundingClientRect();
      for (const item of wrap.querySelectorAll(".logos_item")) {
        const svg = item.querySelector("svg");
        const img = svg && markFor(svg);
        if (!img?.complete || !img.naturalWidth) continue;
        const r = svg.getBoundingClientRect();
        if (r.right < wb.left || r.left > wb.right) continue;
        const mid = r.left + r.width / 2;
        const edge = Math.min(1, Math.max(0, Math.min(mid - wb.left, wb.right - mid) / (wb.width * 0.04)));
        ctx.globalAlpha = opacityOf(item) * edge;
        ctx.drawImage(img, r.left - base.left, r.top - base.top, r.width, r.height);
      }
      ctx.globalAlpha = 1;
    }

    // every lit pixel, a point
    const { data, width, height } = ctx.getImageData(0, 0, off.width, off.height);
    const origin = [], color = [], rand = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const a = data[i + 3];
        if (a < 22) continue;
        // off the grid a little, so they read as grains, not squares
        origin.push((x + 0.5 + (Math.random() - 0.5) * 0.9) * step, (y + 0.5 + (Math.random() - 0.5) * 0.9) * step, 0);
        color.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, a / 255);
        rand.push(Math.random(), Math.random(), Math.random());
      }
    }
    // three draws nothing without a position, so the origins ride in it
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(origin, 3));
    geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(color, 4));
    geometry.setAttribute("aRand", new THREE.Float32BufferAttribute(rand, 3));
    geometry.setDrawRange(0, origin.length / 3);
    material.uniforms.uView.value.set(W, H);
    material.uniforms.uSize.value = step * 1.45;
    renderer.setSize(W, H, false);
    captured = true;
    size = `${W}x${H}`;
    return origin.length / 3;
  }

  const fit = () => {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (`${W}x${H}` === sized) return;
    sized = `${W}x${H}`;
    renderer.setSize(W, H, false);
    material.uniforms.uView.value.set(W, H);
    lineMaterial.uniforms.uView.value.set(W, H);
    spelled.clear(); // wrapped to the stage, so spelled again
    const k = showing;
    showing = -1;
    if (k >= 0) showLine(k);
  };
  let sized = "";
  document.fonts.ready.then(() => spelled.clear());

  /* The line's progress eases toward where the scroll puts it, and while
     grains are in the air they are drawn every frame so they keep drifting;
     the hero's dissolve follows the scroll as it is. */
  const st = { hero: 0, k: -1, x: 0, y: 0, ta: 0, td: 0, a: 0, d: 0 };
  let raf = 0, prev = 0, clock = 0;
  const draw = () => {
    const live = st.k >= 0 && st.a > 0.001 && st.d < 0.999 && st.k < texts.length;
    const on = (st.hero > 0 && st.hero < 1) || live;
    canvas.style.display = on ? "block" : "none";
    if (!on) return false;
    fit();
    points.visible = st.hero > 0 && st.hero < 1;
    material.uniforms.uP.value = st.hero;
    material.uniforms.uShow.value = smooth(0, 0.012, st.hero);
    linePoints.visible = live;
    if (live) {
      showLine(st.k);
      lineMaterial.uniforms.uIn.value = st.a;
      lineMaterial.uniforms.uOut.value = st.d;
      lineMaterial.uniforms.uCenter.value.set(st.x, st.y);
      lineMaterial.uniforms.uTime.value = clock;
    }
    renderer.render(scene, camera);
    return live && ((st.a > 0.001 && st.a < 0.999) || (st.d > 0.001 && st.d < 0.999));
  };
  const frame = (now) => {
    raf = 0;
    const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
    prev = now;
    clock += dt;
    const f = 1 - Math.exp(-dt / 0.22);
    st.a += (st.ta - st.a) * f;
    st.d += (st.td - st.d) * f;
    const flying = draw();
    const settling = Math.abs(st.ta - st.a) > 1e-3 || Math.abs(st.td - st.d) > 1e-3;
    if (flying || settling) raf = requestAnimationFrame(frame);
    else prev = 0;
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const handle = {
    ok: true,
    /** How many points the last snapshot made. */
    count: 0,
    /** The lines the gaps between the sets spell, in order. */
    lines(list) {
      texts = [...list];
      spelled.clear();
      showing = -1;
    },
    update({ hero = 0, line = null } = {}) {
      if (hero <= 0) {
        // back at the top: the real hero, and a fresh snapshot next time
        captured = false;
      } else if (!captured || size !== `${stage.clientWidth}x${stage.clientHeight}`) this.count = capture();
      st.hero = hero;
      if (line && line.k >= 0) {
        // a new line starts where the scroll has it, the same line eases there
        if (line.k !== st.k) Object.assign(st, { k: line.k, a: line.a, d: line.d });
        Object.assign(st, { x: line.x, y: line.y, ta: line.a, td: line.d });
      } else st.k = -1;
      draw();
      kick();
    },
    /** The hero alone (0 = the hero, 1 = all gone). */
    set(p) {
      this.update({ hero: p });
    },
    /** The real hero fades as its particles take over. */
    domOpacity: (p) => 1 - smooth(0.002, 0.02, p),
  };
  return handle;
}
