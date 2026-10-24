/* Sitewide behaviour, loaded once by BaseLayout.

   - Loops: every <video data-loop> plays only while it is on screen.
   - Reveals: [data-reveal] fades up the first time it enters the view.
   - Sound: off by default. The nav's bars turn on soft synthesized ticks for
     hovers and clicks (no audio files); the choice is remembered.
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

const KEY = "ks-sound";
let ctx = null;
let soundOn = false;
try {
  soundOn = localStorage.getItem(KEY) === "on";
} catch {}

function tone(freq, dur = 0.06, gain = 0.035, type = "sine") {
  if (!soundOn) return;
  ctx ??= new AudioContext();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SOUNDS = {
  hover: () => tone(1800, 0.035, 0.018),
  tick: () => tone(1200, 0.05, 0.03, "triangle"),
  open: () => {
    tone(660, 0.12, 0.03);
    setTimeout(() => tone(990, 0.14, 0.025), 60);
  },
};
export const sound = (name) => SOUNDS[name]?.();

function setSound(on) {
  soundOn = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  document.querySelectorAll("[data-sound-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(on)));
  if (on) sound("open");
}

document.querySelectorAll("[data-sound-toggle]").forEach((b) => {
  b.setAttribute("aria-pressed", String(soundOn));
  b.addEventListener("click", () => setSound(!soundOn));
});
window.addEventListener("ks:sound", (e) => sound(e.detail));

let lastHover = null;
document.addEventListener("pointerover", (e) => {
  const el = e.target.closest?.("a, button, [data-sound]");
  if (el && el !== lastHover) sound("hover");
  lastHover = el;
});
document.addEventListener("click", (e) => {
  if (e.target.closest?.("a, button")) sound("tick");
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

watchLoops();
watchReveals();
