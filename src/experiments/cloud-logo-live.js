/* Cloud logo (Rylo), live.

   The Cloud Logo Generator from the AI Fun folder (rylo/cloud-logo-
   generator), on dials. Its trick is one SVG filter, after Balint Ferenczy's
   Cloud Generator: the mark is thickened, blurred and pushed around by
   fractal noise into the cloud's body, then four more copies of it are
   shifted, eroded, smeared downwards and displaced again in pale blue and
   black at low opacity, which reads as the cloud's lit top and grey belly.
   The noise's frequency wanders slowly, so the cloud billows.

   As the tool opens, a parade of marks drifts across the sky (the tool's
   own onboarding, here with marks made for it rather than famous logos);
   pick one and it holds in the middle, as an uploaded logo does, and the
   cloud dissolves and reforms between them. Drag across the sky to paint
   more cloud, as the tool's sketch mode (cloud-draw.html) did. */

export const params = {
  cloud: {
    thickness: [25, 0, 100, 1],
    cloudiness: [25, 0, 100, 1],
    shadow: [94, 0, 150, 1],
  },
  marks: {
    // Oct 25: "make sure we have the cloud generator": your own word, or your own logo
    // (Upload, or drop an image on the sky), grown into cloud as the tool did
    mark: { type: "select", options: ["All", "Your word", "Your logo", "Bolt", "Heart", "Star", "Moon", "Smile", "Spark", "Drop", "Arrow"] },
    word: "Kinetic",
    size: [0.4, 0.2, 0.75, 0.01],
    speed: [1, 0, 3, 0.05],
  },
  colour: {
    skyTop: "#4988cb",
    skyBottom: "#879fb7",
    cloud: "#ffffff",
  },
  upload: { type: "action", label: "Upload a logo" },
  clear: { type: "action", label: "Clear sky" },
};

/* A logo as cloud wants a silhouette: the picture's own transparency when it
   has some, or else everything that differs from its corners' colour (a dark
   mark on a light card, or the reverse), as white on clear. */
function silhouette(img) {
  const max = 640, r = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * r)), h = Math.max(1, Math.round((img.naturalHeight || img.height) * r));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h), px = d.data;
  let clear = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 200) clear++;
  const useAlpha = clear > (w * h) / 20;
  const corner = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4].map((i) => [px[i], px[i + 1], px[i + 2]]);
  const bg = [0, 1, 2].map((k) => corner.reduce((a, c2) => a + c2[k], 0) / 4);
  for (let i = 0; i < px.length; i += 4) {
    const a = useAlpha ? px[i + 3] : Math.min(255, Math.max(0, (Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]) - 40) * 4));
    px[i] = px[i + 1] = px[i + 2] = 255;
    px[i + 3] = a;
  }
  g.putImageData(d, 0, 0);
  return { href: c.toDataURL("image/png"), w, h };
}

const NS = "http://www.w3.org/2000/svg";
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const star = (cx, cy, R, r, n, turn = -Math.PI / 2) => {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const a = turn + (i * Math.PI) / n, k = i % 2 ? r : R;
    d += `${i ? "L" : "M"}${(cx + Math.cos(a) * k).toFixed(2)} ${(cy + Math.sin(a) * k).toFixed(2)}`;
  }
  return `${d}z`;
};
/* Bold, simple silhouettes on a 24 grid: the shapes clouds hold best. */
const MARKS = {
  Bolt: "M8.6 0.8h9.8l-4.2 8.4h6.4L6.4 23.4l3.8-10H3.8z",
  Heart: "M12 21.8C5.4 16.5 1.4 12.8 1.4 8.3 1.4 4.9 4 2.3 7.3 2.3c2 0 3.7 1 4.7 2.5 1-1.5 2.7-2.5 4.7-2.5 3.3 0 5.9 2.6 5.9 6 0 4.5-4 8.2-10.6 13.5z",
  Star: star(12, 12.9, 11.6, 4.7, 5),
  Moon: "M15.2 1.6A10.6 10.6 0 1 0 22.6 16 8.4 8.4 0 0 1 15.2 1.6z",
  Smile: circle(12, 12, 11.2) + circle(8, 8.8, 2.1) + circle(16, 8.8, 2.1) + "M5.9 13.2a6.1 6.1 0 0 0 12.2 0h-2.9a3.2 3.2 0 0 1-6.4 0z",
  Spark: star(12, 12, 11.8, 3.1, 4),
  Drop: "M12 1.2C7.6 7.3 4.6 11.2 4.6 15.3a7.4 7.4 0 0 0 14.8 0c0-4.1-3-8-7.4-14.1z",
  Arrow: "M3.2 17.6 13.4 7.4H6.6V2.8h14.6v14.6h-4.6v-6.8L6.4 20.8z",
};
const NAMES = Object.keys(MARKS);

/* The generator's filter, as written for a 355px mark: [primitive, attributes]. */
const BASE = { size: 355, gap: 215, freq: 0.018, wobble: 0.0035, dilate: 22 };
const SHADOWS = [
  // the flood colour, its opacity, the shift, the erosion, the blur, the push, the noise
  { color: "rgb(215,215,215)", opacity: 0, dx: -10, dy: -3, erode: [20, 20], blur: 20, push: 100, noise: "noise1" },
  { color: "rgb(66,105,146)", opacity: 0.1, dx: -10, dy: 40, erode: [0, 40], blur: 20, push: 80, noise: "noise2" },
  { color: "rgb(0,0,0)", opacity: 0.2, dx: 20, dy: 60, erode: [0, 65], blur: 30, push: 100, noise: "noise2" },
  { color: "rgb(0,0,0)", opacity: 0.2, dx: 20, dy: 70, erode: [0, 200], blur: 30, push: 100, noise: "noise2" },
];

let uid = 0;
const el = (name, attrs = {}, parent) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
};
const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (v) => "#" + v.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const id = `cloud-logo-${++uid}`;

  const root = document.createElement("div");
  root.style.cssText = "position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:crosshair;user-select:none;-webkit-user-select:none";
  root.setAttribute("aria-hidden", "true");
  const sky = document.createElement("div");
  sky.style.cssText = "position:absolute;inset:0";
  root.append(sky);

  // the filter, built once; its numbers are set from the dials and the stage
  const defs = el("svg", { width: "0", height: "0", style: "position:absolute;width:0;height:0" });
  const filter = el("filter", { id, x: "0", y: "0", width: "1", height: "1", "color-interpolation-filters": "sRGB" }, defs);
  const turb1 = el("feTurbulence", { type: "fractalNoise", seed: "462", baseFrequency: BASE.freq, numOctaves: "5", result: "noise1" }, filter);
  const turb2 = el("feTurbulence", { type: "fractalNoise", seed: "462", baseFrequency: BASE.freq, numOctaves: "2", result: "noise2" }, filter);
  const dilate = el("feMorphology", { in: "SourceGraphic", operator: "dilate", radius: "5", result: "thickened" }, filter);
  const bodyBlur = el("feGaussianBlur", { in: "thickened", stdDeviation: "20" }, filter);
  const bodyPush = el("feDisplacementMap", { scale: "100", in2: "noise1", result: "cloud1" }, filter);
  const layers = SHADOWS.map((s, i) => {
    const flood = el("feFlood", { "flood-color": s.color, "flood-opacity": s.opacity }, filter);
    el("feComposite", { operator: "in", in2: "thickened" }, filter);
    const offset = el("feOffset", { dx: s.dx, dy: s.dy }, filter);
    const erode = el("feMorphology", { radius: s.erode.join(" ") }, filter);
    const blur = el("feGaussianBlur", { stdDeviation: s.blur }, filter);
    const push = el("feDisplacementMap", { scale: s.push, in2: s.noise, result: `cloud${i + 2}` }, filter);
    return { s, flood, offset, erode, blur, push };
  });
  const merge = el("feMerge", {}, filter);
  for (let i = 1; i <= 5; i++) el("feMergeNode", { in: `cloud${i}` }, merge);
  root.append(defs);

  // everything inside the stage is weather
  const stage = document.createElement("div");
  stage.style.cssText = `position:absolute;inset:0;filter:url(#${id});pointer-events:none`;
  root.append(stage);
  const puffLayer = document.createElement("div");
  puffLayer.style.cssText = "position:absolute;inset:0";
  stage.append(puffLayer);
  host.append(root);

  // the word is set in the site's display face, as the headlines are
  const face = getComputedStyle(document.documentElement).getPropertyValue("--display-family").trim() || "sans-serif";
  const makeMark = () => {
    const svg = el("svg", { viewBox: "0 0 24 24", preserveAspectRatio: "xMidYMid meet", style: "position:absolute;left:0;top:0;overflow:visible;will-change:transform" });
    const path = el("path", { "fill-rule": "evenodd" }, svg);
    const text = el("text", { x: "0", y: "0", "text-anchor": "middle", "dominant-baseline": "central", "font-size": "100", style: `font-family:${face};text-transform:uppercase;display:none` }, svg);
    const image = el("image", { x: "0", y: "0", style: "display:none" }, svg);
    stage.append(svg);
    return { svg, path, text, image, name: null, slot: null };
  };
  let logo = null; // an uploaded logo's silhouette: { href, w, h }
  let picked = null; // "Your logo" right after an upload, until the Mark dial moves
  const pool = [];
  const held = [makeMark(), makeMark()]; // the one on show and the one leaving

  let W = 1, H = 1, k = 1, px = BASE.size, raf = 0, last = 0, time = 0, offset = 0;
  let onScreen = true, tabVisible = !document.hidden;
  let current = null, leaving = null, swap = 1; // the hold's cross-fade, 0..1

  const markName = () => picked ?? v["marks.mark"];
  const mode = () => (markName() === "All" ? "drift" : "hold");

  function paintSky() {
    const top = v["colour.skyTop"], bottom = v["colour.skyBottom"];
    // the tool's horizon: a stop a shade under the bottom colour, as #708aa4 sits under #879fb7
    const mid = toHex(hex2(bottom).map((c, i) => c - [23, 21, 19][i]));
    sky.style.background = `linear-gradient(180deg, ${top} 29%, ${mid} 87%, ${bottom} 100%)`;
    for (const m of [...pool, ...held]) {
      m.path.setAttribute("fill", v["colour.cloud"]);
      m.text?.setAttribute("fill", v["colour.cloud"]);
    }
    for (const p of puffs) p.el.style.background = v["colour.cloud"];
  }

  /* Every number in the filter was tuned for a 355px mark; here it follows the mark. */
  function tune() {
    const mult = 0.2 + (v["cloud.cloudiness"] / 100) * 1.8;
    const shade = v["cloud.shadow"] / 100;
    dilate.setAttribute("radius", ((v["cloud.thickness"] / 100) * BASE.dilate * k).toFixed(2));
    bodyBlur.setAttribute("stdDeviation", (20 * mult * k).toFixed(2));
    bodyPush.setAttribute("scale", (100 * mult * k).toFixed(1));
    for (const { s, flood, offset: o, erode, blur, push } of layers) {
      flood.setAttribute("flood-opacity", Math.min(1, s.opacity * shade).toFixed(3));
      o.setAttribute("dx", (s.dx * k).toFixed(2));
      o.setAttribute("dy", (s.dy * k).toFixed(2));
      erode.setAttribute("radius", s.erode.map((r) => (r * k).toFixed(2)).join(" "));
      blur.setAttribute("stdDeviation", (s.blur * mult * k).toFixed(2));
      push.setAttribute("scale", (s.push * mult * k).toFixed(1));
    }
  }

  function wisp() {
    const f = BASE.freq / k, w = BASE.wobble / k;
    turb1.setAttribute("baseFrequency", (f + Math.sin(time * 0.08) * w).toFixed(5));
    turb2.setAttribute("baseFrequency", (f + Math.cos(time * 0.06) * w).toFixed(5));
  }

  function place(m, x, y, size, opacity = 1) {
    m.svg.style.width = m.svg.style.height = `${size}px`;
    m.svg.style.transform = `translate(${x}px, ${y}px)`;
    m.svg.style.opacity = opacity;
    m.svg.style.display = opacity > 0.001 ? "" : "none";
  }
  const setMark = (m, name) => {
    const key = name === "Your word" ? `word:${v["marks.word"]}` : name === "Your logo" ? `logo:${logo?.href.length ?? 0}` : name;
    if (m.name === key) return;
    m.name = key;
    const word = name === "Your word", pic = name === "Your logo" && logo;
    m.path.style.display = word || pic ? "none" : "";
    m.text.style.display = word ? "" : "none";
    m.image.style.display = pic ? "" : "none";
    if (word) {
      m.text.textContent = (v["marks.word"] || "Kinetic").slice(0, 18);
      m.text.setAttribute("fill", v["colour.cloud"]);
      // the box fits the word, so a long word sits as wide as a short one
      const n = m.text.textContent.length;
      m.svg.setAttribute("viewBox", `${-n * 30} -70 ${n * 60} 140`);
    } else if (pic) {
      m.image.setAttribute("href", logo.href);
      m.image.setAttribute("width", logo.w);
      m.image.setAttribute("height", logo.h);
      m.svg.setAttribute("viewBox", `0 0 ${logo.w} ${logo.h}`);
    } else {
      m.svg.setAttribute("viewBox", "0 0 24 24");
      m.path.setAttribute("d", MARKS[name] ?? MARKS.Bolt);
      m.path.setAttribute("fill", v["colour.cloud"]);
    }
  };

  /* The parade: slots a mark's width and a gap apart, each keeping its mark as it travels. */
  function layoutDrift() {
    const spacing = px + (BASE.gap / BASE.size) * px;
    const need = Math.ceil(W / spacing) + 2;
    while (pool.length < need) pool.push(makeMark());
    const first = Math.floor(offset / spacing);
    const y = (H - px) / 2;
    pool.forEach((m, j) => {
      if (j >= need) return place(m, 0, 0, px, 0);
      const slot = first + j;
      setMark(m, NAMES[((slot % NAMES.length) + NAMES.length) % NAMES.length]);
      place(m, slot * spacing - offset + spacing * 0.35, y, px);
    });
    for (const m of held) place(m, 0, 0, px, 0);
  }

  function layoutHold() {
    for (const m of pool) place(m, 0, 0, px, 0);
    // as an uploaded logo sits: big, in the middle
    const size = Math.min(W * 0.86, H * 0.82, px * 1.75);
    const x = (W - size) / 2, y = (H - size) / 2;
    const e = swap * swap * (3 - 2 * swap);
    place(held[0], x, y, size, current ? e : 0);
    place(held[1], x, y, size, leaving ? 1 - e : 0);
  }

  function choose() {
    if (mode() !== "hold") {
      current = leaving = null;
      return;
    }
    const name = markName();
    const key = name === "Your word" ? `word:${v["marks.word"]}` : name === "Your logo" ? `logo:${logo?.href.length ?? 0}` : name;
    if (current === key) return;
    // the old mark fades out of the cloud as the new one fades in
    if (current) {
      [held[0], held[1]] = [held[1], held[0]];
      leaving = current;
      swap = reduced ? 1 : 0;
    } else swap = 1;
    current = key;
    setMark(held[0], name);
    if (leaving) setMark(held[1], leaving.split(":")[0] === "word" ? "Your word" : leaving.split(":")[0] === "logo" ? "Your logo" : leaving);
  }

  /* Painted cloud, from the tool's sketch mode: puffs of soft rounded
     rectangles, dropped every few px along the drag, fading in. */
  const puffs = [];
  let drawing = false, lastX = 0, lastY = 0, acc = 0, next = 7;
  function puff(x, y) {
    const n = document.createElement("div");
    const s = Math.max(0.45, px / BASE.size);
    const w = (12 + Math.pow(Math.random(), 2.4) * 280) * s, h = (10 + Math.pow(Math.random(), 2.4) * 220) * s;
    const r = Array.from({ length: 8 }, () => 25 + Math.random() * 50);
    const p = { el: n, x: x - w / 2 + (Math.random() - 0.5) * 90 * s, y: y - h / 2 + (Math.random() - 0.5) * 90 * s, w, h, born: time, max: 0.25 + Math.random() * 0.75 };
    n.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:${v["colour.cloud"]};opacity:0;border-radius:${r[0]}% ${r[1]}% ${r[2]}% ${r[3]}% / ${r[4]}% ${r[5]}% ${r[6]}% ${r[7]}%`;
    puffLayer.append(n);
    puffs.push(p);
    if (puffs.length > 500) puffs.shift().el.remove();
  }
  function placePuffs() {
    for (const p of puffs) {
      const a = reduced ? 1 : Math.min(1, (time - p.born) / 0.4);
      p.el.style.opacity = (a * p.max).toFixed(3);
      p.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    }
  }
  const local = (e) => {
    const r = root.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onDown = (e) => {
    drawing = true;
    [lastX, lastY] = local(e);
    acc = 0;
    root.setPointerCapture?.(e.pointerId);
    puff(lastX, lastY);
    if (!raf) draw();
  };
  const onMove = (e) => {
    if (!drawing) return;
    const [x, y] = local(e), dx = x - lastX, dy = y - lastY, len = Math.hypot(dx, dy) || 1;
    acc += len;
    while (acc >= next) {
      const t = (acc - next) / len;
      const qx = x - dx * t, qy = y - dy * t;
      puff(qx, qy);
      if (Math.random() < 0.28) {
        const a = Math.random() * Math.PI * 2, d = (60 + Math.random() * 180) * Math.max(0.45, px / BASE.size);
        puff(qx + Math.cos(a) * d, qy + Math.sin(a) * d);
      }
      acc -= next;
      next = 7 * (0.5 + Math.random());
    }
    lastX = x;
    lastY = y;
    if (!raf) draw();
  };
  const onUp = () => (drawing = false);
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/*,.svg";
  file.style.display = "none";
  root.append(file);
  const useFile = (f) => {
    if (!f || !/^image\//.test(f.type)) return;
    const img = new Image();
    img.onload = () => {
      logo = silhouette(img);
      URL.revokeObjectURL(img.src);
      picked = "Your logo";
      choose();
      draw();
    };
    img.src = URL.createObjectURL(f);
  };
  file.addEventListener("change", () => useFile(file.files?.[0]));
  const onDragOver = (e) => e.preventDefault();
  const onDrop = (e) => {
    e.preventDefault();
    useFile(e.dataTransfer?.files?.[0]);
  };
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("drop", onDrop);
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onUp);

  function draw() {
    wisp();
    if (mode() === "drift") layoutDrift();
    else layoutHold();
    placePuffs();
  }

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    px = v["marks.size"] * Math.min(W * 1.6, H);
    k = px / BASE.size;
    tune();
  }

  /* The filter is the whole cost and the weather is slow, so it is redrawn
     at 30 frames a second, which is plenty for cloud. */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (last && now - last < 1000 / 30 - 4) return;
    const dt = last ? Math.min(0.08, (now - last) / 1000) : 0;
    last = now;
    const sp = v["marks.speed"];
    time += dt * sp;
    // the tool's marquee crossed 355px marks at about 46px a second
    const drift = dt * sp * 46 * k;
    if (mode() === "drift") offset += drift;
    for (const p of puffs) p.x -= mode() === "drift" ? drift : 0;
    while (puffs.length && puffs[0].x + puffs[0].w < -px) puffs.shift().el.remove();
    if (swap < 1) swap = Math.min(1, swap + dt / 1.4);
    draw();
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

  const ro = new ResizeObserver(() => {
    resize();
    draw();
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

  // a still opens a little way into the parade, so a mark sits whole in view
  if (reduced) time = 6;
  paintSky();
  resize();
  choose();
  draw();
  sync();

  return {
    update(values, path) {
      Object.assign(v, values);
      if (path === "marks.mark" || path == null) picked = null;
      paintSky();
      resize();
      choose();
      draw();
    },
    action(name) {
      if (name === "upload") return file.click();
      if (name !== "clear") return;
      for (const p of puffs) p.el.remove();
      puffs.length = 0;
      draw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      root.removeEventListener("dragover", onDragOver);
      root.removeEventListener("drop", onDrop);
      root.remove();
    },
  };
}
