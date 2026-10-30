/* Sitewide behaviour, loaded once by BaseLayout.

   - Loops: every <video data-loop> plays only while it is on screen.
   - Reveals: [data-reveal] fades up the first time it enters the view.
   - Sound: a small kit made in code (earshot), on by default but quiet, and
     kept to clicks and a few moments (no hover ticks); S mutes it and the
     choice is remembered.
   - Hidden keys: G flips a Work view between grid and list, S toggles sound,
     and the console says hello. */

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- loops ---------------------------------------------------------- */

const loopObserver = new IntersectionObserver(
  (entries) => {
    for (const { target, isIntersecting } of entries) {
      const v = /** @type {HTMLVideoElement} */ (target);
      if (isIntersecting && !reduced) {
        if (!v.src && v.dataset.src) v.src = v.dataset.src;
        v.play().catch(() => {});
      } else v.pause();
    }
  },
  { rootMargin: "20% 0px" },
);

/** @param {ParentNode} [root] */
export function watchLoops(root = document) {
  root.querySelectorAll("video[data-loop]").forEach((v) => {
    if (v.dataset.watched) return;
    v.dataset.watched = "1";
    v.muted = true;
    loopObserver.observe(v);
  });
}

/* ---- reveals -------------------------------------------------------- */

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      target.classList.add("is-in");
      revealObserver.unobserve(target);
    }
  },
  { rootMargin: "0px 0px -8% 0px" },
);

/** @param {ParentNode} [root] */
export function watchReveals(root = document) {
  root.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => {
    if (reduced) el.classList.add("is-in");
    else revealObserver.observe(el);
  });
}

/* ---- sound ---------------------------------------------------------- */

/* A sound kit made in code: earshot's bank (github.com/Leonxlnx/earshot),
   rendered by scripts/build-sounds.py into public/sfx/<role>.m4a. On by
   default; the nav's bars (or S) mute it, and the choice is remembered.
   Browsers only allow audio after a click or key, so nothing plays before. */

const KEY = "ks-sound";
const ROLES = ["hover", "click", "toggle", "line", "glide", "pull", "open", "close", "detent", "confirm", "key"];
const ALIAS = { tick: "click" };
const RUMBLE = new Set(["glide", "pull", "open", "close"]);
const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
let ctx = null;
let master = null;
const buffers = new Map();
let soundOn = true;
try {
  soundOn = localStorage.getItem(KEY) !== "off";
} catch {}

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.45;
  master.connect(ctx.destination);
  for (const role of ROLES) {
    fetch(new URL(`sfx/${role}.m4a`, ROOT))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => buffers.set(role, buf))
      .catch(() => {});
  }
  return ctx;
}

let lastHover = 0;
export function sound(name, { rate = 1, gain = 1 } = {}) {
  if (!soundOn) return;
  const role = ALIAS[name] ?? name;
  if (role === "hover") {
    const now = performance.now();
    if (now - lastHover < 45) return;
    lastHover = now;
  }
  // nothing can sound before the visitor's first click or key, so the audio isn't set up until then:
  // setting it up took the homepage intro a 170 ms stutter and eleven downloads (Oct 30)
  if (!ctx && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  const c = audio();
  if (!c || c.state !== "running") return;
  if (role === "thud") return thud(c, gain);
  const buf = buffers.get(role);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  // the whooshes (the nav's pill moving, a piece opening or closing) sit low, a rumble more
  // than a swish (Hunter, Oct 25: "need to be more of a rumble, like a lower bass feel")
  const rumble = RUMBLE.has(role);
  src.playbackRate.value = rate * (rumble ? 0.55 : 1);
  const g = c.createGain();
  g.gain.value = gain * (rumble ? 1.5 : 1);
  if (rumble) {
    const low = c.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 520;
    low.Q.value = 0.9;
    const body = c.createBiquadFilter();
    body.type = "lowshelf";
    body.frequency.value = 140;
    body.gain.value = 9;
    src.connect(low).connect(body).connect(g).connect(master);
  } else src.connect(g).connect(master);
  src.start();
}

/* The homepage intro's pill hitting the bands (Hunter, Oct 29: "it needs to be much deeper, more like a
   bass. when the pill hits"): made here, a sine falling from about 95 Hz to 45 in a third of a second,
   with its octave quietly over it so small speakers carry it, struck fast and let ring out. */
function thud(c, gain) {
  const t = c.currentTime, out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.9 * gain, t + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  out.connect(master);
  for (const [mul, level] of [[1, 1], [2, 0.28]]) {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(95 * mul, t);
    o.frequency.exponentialRampToValueAtTime(45 * mul, t + 0.35);
    g.gain.value = level;
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.75);
  }
}

// for checking from a console: is the audio awake, how many sounds loaded
Object.defineProperty(window, "__ksSound", { get: () => ({ on: soundOn, state: ctx?.state ?? "asleep", loaded: buffers.size }) });

// the first click or key wakes the audio up
const wake = () => {
  const c = audio();
  c?.resume?.();
};
addEventListener("pointerdown", wake, { capture: true });
addEventListener("keydown", wake, { capture: true });

function setSound(on) {
  soundOn = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  document.querySelectorAll("[data-sound-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(on)));
  if (on) {
    wake();
    setTimeout(() => sound("toggle"), 30);
  }
}

document.querySelectorAll("[data-sound-toggle]").forEach((b) => {
  b.setAttribute("aria-pressed", String(soundOn));
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    setSound(!soundOn);
  });
});
window.addEventListener("ks:sound", (e) => {
  const d = e.detail;
  typeof d === "string" ? sound(d) : sound(d?.name, d);
});

// a soft note as the pointer finds something to press (Hunter, Oct 25: "I
// also feel like we lost the sound effects"): once per thing, mouse only
let hovered = null;
document.addEventListener("pointerover", (e) => {
  if (e.pointerType && e.pointerType !== "mouse") return;
  const el = e.target.closest?.("a, button, .contact_chip, [data-sound]");
  if (el && el !== hovered) sound("hover", { gain: 0.55 });
  hovered = el;
});

document.addEventListener("click", (e) => {
  const el = e.target.closest?.("a, button");
  if (!el || el.matches("[data-sound-toggle]")) return;
  sound(el.matches("[aria-pressed], [aria-selected], [role=tab]") ? "toggle" : "click", { gain: 0.6 });
});

/* ---- page to page --------------------------------------------------- */

/* The browser crossfades the old page into the new one from a snapshot it
   takes as the old page goes, and a WebGL canvas (the laurels, the hero's
   particles, an experiment) or a playing video comes out white in it:
   every page change flashed white. They sit out the snapshot (a tile's
   still shows under its loop); a 2D canvas is kept, it is drawn fine. (A
   canvas with a WebGL context has no 2D one to give.) */
const sittingOut = [];
addEventListener("pageswap", () => {
  for (const c of document.querySelectorAll("canvas, video")) {
    if (c.tagName === "CANVAS") {
      let flat = null;
      try {
        flat = c.getContext("2d");
      } catch {}
      if (flat) continue;
    }
    c.style.visibility = "hidden";
    sittingOut.push(c);
  }
});
addEventListener("pageshow", (e) => {
  if (e.persisted) for (const c of sittingOut.splice(0)) c.style.visibility = "";
});

/* ---- cursor label -------------------------------------------------- */

if (matchMedia("(hover: hover)").matches) {
  const tag = document.createElement("div");
  tag.className = "cursor-tag";
  tag.setAttribute("aria-hidden", "true");
  document.body.append(tag);
  let x = 0, y = 0, tx = 0, ty = 0, raf = 0;
  const follow = () => {
    x += (tx - x) * 0.22;
    y += (ty - y) * 0.22;
    tag.style.transform = `translate(${x}px, ${y}px)`;
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(follow) : 0;
  };
  document.addEventListener("pointermove", (e) => {
    tx = e.clientX + 14;
    ty = e.clientY + 14;
    const el = e.target.closest?.("[data-cursor]");
    tag.classList.toggle("is-on", Boolean(el));
    if (el) tag.textContent = el.dataset.cursor;
    if (!raf) raf = requestAnimationFrame(follow);
  });
}

/* ---- keys ----------------------------------------------------------- */

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (e.key === "s") setSound(!soundOn);
  if (e.key === "g") window.dispatchEvent(new CustomEvent("ks:view-toggle"));
});

console.log(
  "%c|||(( KINETIC %c\nYou found the back room. Press S for sound, G to flip a work view.\nhunter@kineticstudio.com",
  "font: 700 14px monospace; color: #a8ff66",
  "font: 12px monospace; color: #d9e2d2",
);

/* ---- button hovers ------------------------------------------------- */

// every text-only button gets the rolling label (styles/hover.css); the nav's links lean toward the pill instead (Nav.astro)
const ROLL = ".nav_contact,.contact_submit, .exp_btn, .work-index_view, .work-index_chip, .play_caption-actions > *, .footer_link, .copy-email_button";

/** @param {ParentNode} [root] */
export function rollLabels(root = document) {
  root.querySelectorAll(ROLL).forEach((el) => {
    if (el.dataset.rolled || el.children.length || !el.textContent.trim()) return;
    const text = el.textContent.trim();
    el.dataset.rolled = "1";
    const roll = document.createElement("span");
    roll.className = "roll";
    const a = document.createElement("span");
    a.className = "roll_a";
    a.textContent = text;
    const b = document.createElement("span");
    b.className = "roll_b";
    b.setAttribute("aria-hidden", "true");
    b.textContent = text;
    roll.append(a, b);
    el.replaceChildren(roll);
  });
}

watchLoops();
watchReveals();
rollLabels();
