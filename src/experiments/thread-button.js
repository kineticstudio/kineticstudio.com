/* Thread button.

   Counsel's button hover, ported from the Creative Studio
   (clients/counsel/prototypes/thread-button.html and the shared engine it
   drives, shared/buttons/thread-sweep.js). On hover the corners ease out to
   a full pill and a train of colour blocks sweeps in from the left, butted
   edge to edge like segments of one thread; the last block glides to a stop
   and becomes the button's new colour. Leaving eases it back to navy, a
   click replays the ride. Counsel's own palette and proportions are the
   defaults; when nobody is pointing, the row demos itself one button at a
   time so the piece is alive untouched.

   GT America (Counsel's licensed face) is not ours to serve, so the label
   is set in the site's own grotesk, Neue Montreal. */

/* The rides, from the prototype's template dial: the colours that pass
   through, in order, and where each one lands. */
const RIDES = [
  { id: "full-thread", label: "Full thread", ride: ["#455E97", "#47AFFF"], settle: "#018150" },
  { id: "blues", label: "Blues", ride: ["#BBD6EA", "#47AFFF", "#97BCE6", "#455E97"], settle: "#018150" },
  { id: "greens", label: "Greens", ride: ["#DCEAD9", "#9ADB8F", "#018150", "#005434"], settle: "#132045" },
  { id: "light-to-dark", label: "Light to dark", ride: ["#DCEAD9", "#BBD6EA", "#97BCE6", "#455E97"], settle: "#132045" },
].map((t) => ({ ...t, colors: [...t.ride, t.settle] }));

// Counsel's design-system palette, offered as presets on the colour wells
const BRAND = ["#132045", "#455E97", "#47AFFF", "#97BCE6", "#BBD6EA", "#018150", "#005434", "#9ADB8F", "#DCEAD9", "#FADA78", "#FF93AD"];

const LABELS = ["Get started", "Book a demo", "Learn more"];

export const params = {
  sweep: {
    ride: { type: "swatches", label: "Ride", options: RIDES, default: "full-thread" },
    duration: [750, 300, 2000, 10],
    stagger: [220, 40, 600, 5],
    arrow: { type: "toggle", labels: ["No arrow", "Arrow"], default: false },
  },
  button: {
    size: [22, 12, 32, 1],
    corner: [12, 0, 28, 1],
    count: [3, 1, 3, 1],
    rest: { type: "color", default: "#132045", options: BRAND },
  },
  stage: {
    demo: { type: "toggle", labels: ["Hover only", "Idle demo"], default: true },
    ground: { type: "color", default: "#f8f9f4", options: ["#f8f9f4", "#ffffff", "#dcead9", "#003722", "#132045"] },
  },
};

// The site's own grotesk, bundled with it (found by pattern, like cloud-type.js)
const FACES = import.meta.glob("../assets/fonts/PPNeueMontreal-Regular.woff2", { query: "?url", import: "default", eager: true });
const FAMILY = "Thread Button Grotesk";
const STACK = `"${FAMILY}", "Helvetica Neue", Helvetica, Arial, sans-serif`;

/* dark colours carry white text, light colours carry navy (the engine's rule) */
function inkFor(hex, dark = "#132045", light = "#ffffff") {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? dark : light;
}

/* Hunter's arrow (arrow1.svg): 12px, round caps, ink via currentColor. */
const ARROW_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 6L9.5 6" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 2.5L9.5 6L6 9.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* The engine's stylesheet, scoped to this piece. */
const CSS = `
.ktb { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  transition: background-color .4s ease; }
.ktb-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--ktb-gap, 16px); padding: 24px; }
.ktb-btn { border: 0; cursor: pointer; font-family: ${STACK}; font-weight: 400; letter-spacing: 0;
  display: inline-flex; align-items: center; justify-content: center; white-space: nowrap;
  -webkit-tap-highlight-color: transparent; -webkit-font-smoothing: antialiased;
  transition: background .35s ease, transform .15s ease, border-radius .35s ease; }
.ktb-btn:active { transform: scale(0.985); }
.ktb-btn:focus-visible { outline: 2px solid #47AFFF; outline-offset: 3px; }
.ktb .ts-host { position: relative; overflow: hidden; isolation: isolate;
  transition: border-radius var(--ts-radius-ms, .35s) ease, transform .15s ease, padding .3s ease, background .35s ease; }
.ktb .ts-host.ts-live { transition: border-radius var(--ts-radius-ms, .35s) ease, transform .15s ease, padding var(--ts-arrow-ms, .3s) ease, background .35s ease; }
.ktb .ts-arrow { display: inline-flex; align-items: center; vertical-align: middle; flex: none; width: 0;
  height: var(--ts-disc, 24px); margin-right: 0; pointer-events: none; transition: width .3s ease, margin .3s ease; }
.ktb .ts-arrow-disc { flex: none; width: var(--ts-disc, 24px); height: var(--ts-disc, 24px); border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  transform: translateX(calc(var(--ts-disc, 24px) * -2)); transition: transform .3s ease; }
.ktb .ts-arrow-disc svg { width: 50%; height: 50%; }
.ktb .ts-host.ts-live .ts-arrow { width: var(--ts-disc, 24px); margin-right: calc(var(--ts-disc, 24px) * .42); transition-duration: var(--ts-arrow-ms, .3s); }
.ktb .ts-host.ts-live .ts-arrow-disc { transform: translateX(0); transition-duration: var(--ts-arrow-ms, .3s); }
.ktb .ts-train { position: absolute; top: 0; bottom: 0; left: 0; z-index: -1; display: flex; will-change: transform; pointer-events: none; }
.ktb .ts-train > div { height: 100%; }
`;

/* The thread sweep, as the shared engine has it, with the reduced-motion
   answer handed in and the arrow disc sized from the button. */
function attachThreadSweep(el, opts, still) {
  const o = { duration: 600, stagger: 220, pass: [], settle: "#018150", arrow: true, arrowCircle: "#F8F9F4", arrowInk: "#1C3A69", radiusMs: 600, ...opts };
  const doc = el.ownerDocument;
  el.classList.add("ts-host");
  let arrowEl = null;
  let disc = 24;

  function syncArrow() {
    if (o.arrow && !arrowEl) {
      arrowEl = doc.createElement("span");
      arrowEl.className = "ts-arrow";
      arrowEl.setAttribute("aria-hidden", "true");
      const d = doc.createElement("span");
      d.className = "ts-arrow-disc";
      d.innerHTML = ARROW_SVG;
      arrowEl.appendChild(d);
      el.insertBefore(arrowEl, el.firstChild);
    }
    if (!o.arrow && arrowEl) {
      arrowEl.remove();
      arrowEl = null;
    }
    if (arrowEl) {
      const d = arrowEl.firstElementChild;
      d.style.background = o.arrowCircle;
      d.style.color = o.arrowInk;
      // the arrow rides the whole sweep, arriving with the settle
      el.style.setProperty("--ts-arrow-ms", `${o.pass.length * o.stagger + o.duration}ms`);
    }
    el.style.setProperty("--ts-radius-ms", `${o.radiusMs}ms`);
  }
  syncArrow();

  let restRadius = null;
  let restPadding = null;
  let live = false;
  const clear = () => {
    for (const s of el.querySelectorAll(":scope > .ts-train")) s.remove();
  };

  function settleOn(color) {
    // snap, don't transition: the settle block already shows this colour
    el.style.transition = "none";
    el.style.background = color;
    el.style.color = inkFor(color);
    void el.offsetWidth;
    el.style.transition = "";
    clear();
  }

  function sweep() {
    clear();
    if (still) {
      settleOn(o.settle);
      return;
    }
    if (!el.classList.contains("ts-live")) {
      restRadius = el.style.borderRadius;
      if (arrowEl) {
        restPadding = el.style.paddingLeft;
        el.style.paddingLeft = `${Math.max((el.offsetHeight - disc) / 2, 0)}px`;
      }
      el.classList.add("ts-live");
      // the pill target is the real half-height: easing to 999px reads as a snap
      el.style.borderRadius = `${el.offsetHeight / 2}px`;
    }
    live = true;
    // one block per ride colour, then the settle; the first ride colour
    // enters first (the train's right end), the settle glides to a stop
    const seq = [...o.pass, o.settle];
    const n = seq.length;
    const train = doc.createElement("div");
    train.className = "ts-train";
    train.style.width = `${n * 100}%`;
    for (let i = n - 1; i >= 0; i--) {
      const s = doc.createElement("div");
      s.style.background = seq[i];
      s.style.width = `${100 / n}%`;
      train.appendChild(s);
    }
    const total = (n - 1) * o.stagger + o.duration;
    train.style.transform = "translateX(-100%)";
    train.style.transition = `transform ${total}ms cubic-bezier(0.22, 0.61, 0.2, 1)`;
    train.addEventListener("transitionend", () => settleOn(o.settle), { once: true });
    el.appendChild(train);
    void train.offsetWidth;
    train.style.transform = "translateX(0)";
  }

  function reset() {
    clear();
    live = false;
    el.classList.remove("ts-live");
    if (restRadius !== null) {
      el.style.borderRadius = restRadius;
      restRadius = null;
    }
    if (restPadding !== null) {
      el.style.paddingLeft = restPadding;
      restPadding = null;
    }
    el.style.background = "";
    el.style.color = "";
  }

  el.addEventListener("pointerenter", sweep);
  el.addEventListener("pointerleave", reset);
  el.addEventListener("click", sweep);

  return {
    sweep,
    reset,
    get live() {
      return live;
    },
    total: () => o.pass.length * o.stagger + o.duration,
    update(next, discPx) {
      Object.assign(o, next);
      disc = discPx;
      syncArrow();
    },
    detach() {
      reset();
      arrowEl?.remove();
      el.removeEventListener("pointerenter", sweep);
      el.removeEventListener("pointerleave", reset);
      el.removeEventListener("click", sweep);
    },
  };
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);

  const root = document.createElement("div");
  root.className = "ktb";
  const style = document.createElement("style");
  style.textContent = CSS;
  const row = document.createElement("div");
  row.className = "ktb-row";
  root.append(style, row);
  host.append(root);

  // the face, once; the buttons fall back to Helvetica until it lands
  let face = null;
  const faceUrl = Object.values(FACES)[0];
  if (faceUrl) {
    face = new FontFace(FAMILY, `url(${faceUrl}) format("woff2")`, { weight: "400" });
    document.fonts.add(face);
    face.load().catch(() => {});
  }

  /** @type {{ el: HTMLButtonElement, sweep: ReturnType<typeof attachThreadSweep> }[]} */
  let buttons = [];

  const ride = () => RIDES.find((r) => r.id === v["sweep.ride"]) ?? RIDES[0];
  const opts = () => {
    const r = ride();
    return { pass: r.ride.slice(), settle: r.settle, duration: v["sweep.duration"], stagger: v["sweep.stagger"], arrow: v["sweep.arrow"], radiusMs: 600 };
  };

  function style1(el) {
    const s = v["button.size"];
    el.style.fontSize = `${s}px`;
    el.style.minHeight = `${Math.round(s * 2.5)}px`;
    el.style.padding = `0 ${s}px`;
    el.style.borderRadius = `${v["button.corner"]}px`;
    el.style.setProperty("--ts-disc", `${Math.round(s * 1.5)}px`);
  }

  function build() {
    for (const b of buttons) {
      b.sweep.detach();
      b.el.remove();
    }
    buttons = [];
    const n = Math.round(v["button.count"]);
    for (let i = 0; i < n; i++) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "ktb-btn";
      el.textContent = LABELS[i % LABELS.length];
      style1(el);
      row.append(el);
      const sweep = attachThreadSweep(el, opts(), still);
      sweep.update(opts(), Math.round(v["button.size"] * 1.5));
      buttons.push({ el, sweep });
    }
    paint();
  }

  function paint() {
    root.style.backgroundColor = v["stage.ground"];
    row.style.setProperty("--ktb-gap", `${Math.round(v["button.size"] * 0.8)}px`);
    const rest = v["button.rest"];
    // the resting colour is the stylesheet's, so reset() eases back to it
    style.textContent = `${CSS}\n.ktb-btn { background: ${rest}; color: ${inkFor(rest)}; }`;
    for (const b of buttons) {
      style1(b.el);
      b.sweep.update(opts(), Math.round(v["button.size"] * 1.5));
    }
  }

  /* ---- the idle demo: one button at a time, ride in, hold, ease back ---- */
  let onScreen = true;
  let tabVisible = !document.hidden;
  let pointerIn = false;
  let timer = 0;
  let turn = 0;
  let demoed = null;

  const canDemo = () => !still && v["stage.demo"] && onScreen && tabVisible && !pointerIn && buttons.length > 0;
  const wait = (ms, fn) => {
    clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
  function stopDemo() {
    clearTimeout(timer);
    timer = 0;
    if (demoed && !pointerIn) demoed.sweep.reset();
    demoed = null;
  }
  function step() {
    if (!canDemo()) return stopDemo();
    const b = buttons[turn % buttons.length];
    turn++;
    demoed = b;
    b.sweep.sweep();
    wait(b.sweep.total() + 1500, () => {
      if (!canDemo()) return stopDemo();
      b.sweep.reset();
      demoed = null;
      wait(buttons.length > 1 ? 700 : 1300, step);
    });
  }
  function sync(delay = 700) {
    if (!canDemo()) return stopDemo();
    if (!timer) wait(delay, step);
  }

  const onEnter = () => {
    pointerIn = true;
    clearTimeout(timer);
    timer = 0;
    // the visitor takes over: whatever the demo had out goes home
    if (demoed && !demoed.el.matches(":hover")) demoed.sweep.reset();
    demoed = null;
  };
  const onLeave = () => {
    pointerIn = false;
    sync(1400);
  };
  root.addEventListener("pointerenter", onEnter);
  root.addEventListener("pointerleave", onLeave);

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

  // Size follows the host: on a narrow stage a row of three stacks.
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth;
    row.style.flexDirection = w < 560 && buttons.length > 1 ? "column" : "row";
  });
  ro.observe(host);

  build();
  sync(600);

  return {
    update(values, path) {
      Object.assign(v, values);
      if (path == null || path === "button.count") {
        stopDemo();
        build();
        row.style.flexDirection = host.clientWidth < 560 && buttons.length > 1 ? "column" : "row";
      } else {
        paint();
      }
      // a dial that changes the ride shows it straight away
      if (!still && path && path.startsWith("sweep.") && !pointerIn) {
        stopDemo();
        turn = 0;
        sync(120);
      } else sync();
    },
    action() {},
    destroy() {
      clearTimeout(timer);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointerleave", onLeave);
      for (const b of buttons) b.sweep.detach();
      if (face) document.fonts.delete(face);
      root.remove();
    },
  };
}
