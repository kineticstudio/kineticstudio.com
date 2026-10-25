/* Runs one Playground experiment on Hunter's own Params (ks-params).

   The experiment's `params` declaration goes straight to defineParams, and
   ks-params draws its standalone panel in the page (P opens and closes it),
   framed in the Creative Studio or not: the dials live in the site itself.
   The Studio still finds window.__ksParams if its own panel is opened too;
   either way the values are one set.

   On top of that, only site conveniences: the changed values live in the URL
   hash so a tuned state is a link, and Randomize / Reset.

   And the panel takes the piece's look (Hunter, Oct 25: "Looks like many of
   them are in dark mode, but we have light mode parameters"): dark over a
   dark piece, light over a light one, from its `theme` in
   src/data/experiments.js and then its ground dial as that is dialled. Only
   the colours change; ks-params.js stays as vendored, so the dark set is a
   stylesheet of its own below, keyed off <html data-ksp-theme>. */

import { defineParams } from "./ks-params.js";
import { EXPERIMENTS } from "../data/experiments.js";

const readHash = () => {
  try {
    const raw = new URLSearchParams(location.hash.slice(1)).get("p");
    return raw ? JSON.parse(decodeURIComponent(raw)) : {};
  } catch {
    return {};
  }
};

const decimals = (step) => (String(step).split(".")[1] ?? "").length;

/* ---- the panel's look ---- */

const rgbOf = (hex) => {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => c / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// the same line the Playground modal draws between dark and light ink
const LIGHT_FROM = 0.32;

/** What decides the look: the piece's entry, and the dials that paint its ground. */
function lookOf(api, entry, defaults) {
  const named = entry?.ground ? [].concat(entry.ground) : null;
  const grounds = (named ?? api.controls.filter((c) => c.kind === "color" && /(^|\.)(ground|background|bg)$/i.test(c.path)).map((c) => c.path)).filter(
    (p) => p in api.values,
  );
  const picks = Object.entries(entry?.themes ?? {}).filter(([p]) => p in api.values);
  const watch = new Set([...grounds, ...picks.map(([p]) => p)]);
  const decide = () => {
    // a backdrop picked from a list knows its own look
    for (const [path, map] of picks) if (map[api.values[path]]) return { theme: map[api.values[path]] };
    const rgbs = grounds.map((p) => rgbOf(api.values[p])).filter(Boolean);
    if (!rgbs.length) return { theme: entry?.theme ?? "dark" };
    const mean = [0, 1, 2].map((i) => Math.round(rgbs.reduce((sum, c) => sum + c[i], 0) / rgbs.length));
    const ground = `#${mean.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    // as it opens, the eye's call; once the ground is dialled, the ground's
    const dialled = grounds.some((p) => api.values[p] !== defaults[p]);
    const theme = !dialled && entry?.theme ? entry.theme : luminance(mean) > LIGHT_FROM ? "light" : "dark";
    return { theme, ground };
  };
  return { watch, decide };
}

/* The dark set, and the light one's ground tint. ks-params already reads
   --ksp-bg / --ksp-ink / --ksp-card; the rest of its greys are black at a few
   percent, which vanish on a dark panel, so they are redrawn in the ink. */
const LOOK_CSS = `
:root[data-ksp-theme] .ksp { transition: background-color .3s ease, color .3s ease, box-shadow .3s ease; }
:root[data-ksp-theme] .ksp-head kbd { font-family: inherit; }
:root[data-ksp-theme="light"] { --ksp-bg: color-mix(in srgb, var(--ksp-ground, #fbfbf9) 22%, #fbfbf9); }
:root[data-ksp-theme="dark"] {
  --ksp-ink: #eef1ea;
  --ksp-bg: color-mix(in srgb, var(--ksp-ground, #0d0d0d) 55%, #222);
  --ksp-card: color-mix(in srgb, var(--ksp-ink) 16%, var(--ksp-bg));
  --ksp-line: color-mix(in srgb, var(--ksp-ink) 9%, transparent);
  --ksp-well: color-mix(in srgb, var(--ksp-ink) 7%, transparent);
}
:root[data-ksp-theme="dark"] .ksp { color-scheme: dark;
  background: color-mix(in srgb, var(--ksp-bg) 90%, transparent);
  -webkit-backdrop-filter: blur(20px) saturate(1.3); backdrop-filter: blur(20px) saturate(1.3);
  box-shadow: inset 0 0 0 1px var(--ksp-line), 0 16px 48px rgba(0,0,0,.45); }
:root[data-ksp-theme="dark"] :is(.ksp-dial, .ksp-pill, .ksp-seg) { background: var(--ksp-well); }
:root[data-ksp-theme="dark"] :is(.ksp-section, .ksp-foot) { border-top-color: var(--ksp-line); }
:root[data-ksp-theme="dark"] .ksp-gh:hover { background: var(--ksp-well); }
:root[data-ksp-theme="dark"] .ksp-head kbd { border-color: color-mix(in srgb, var(--ksp-ink) 22%, transparent); }
:root[data-ksp-theme="dark"] .ksp-fill { box-shadow: 0 1px 2px rgba(0,0,0,.35); }
:root[data-ksp-theme="dark"] .ksp-seg-thumb { box-shadow: 0 1px 3px rgba(0,0,0,.45); }
:root[data-ksp-theme="dark"] .ksp-dot:not([data-on="true"]) { outline-color: color-mix(in srgb, var(--ksp-ink) 22%, transparent); }
:root[data-ksp-theme="dark"] .ksp-tile:not([data-on="true"], :hover) { outline-color: color-mix(in srgb, var(--ksp-ink) 16%, transparent); }
:root[data-ksp-theme="dark"] .ksp-tile:hover:not([data-on="true"]) { outline-color: color-mix(in srgb, var(--ksp-ink) 45%, transparent); }
:root[data-ksp-theme="dark"] .ksp-menu { color-scheme: dark; box-shadow: 0 12px 32px rgba(0,0,0,.5); }
`;

/**
 * @param {HTMLElement} stage the element the experiment fills
 * @param {{ params: object, mount: Function }} mod the experiment module
 * @param {{ title: string, slug?: string, open?: boolean }} options
 */
export function hostExperiment(stage, mod, { title, slug, open = false }) {
  let handle;
  let ready = false;
  const api = defineParams(title, mod.params, {
    panel: "always",
    onChange: (values, path) => {
      if (!ready) return;
      handle?.update(values, path);
      writeHash();
    },
    onAction: (name) => handle?.action?.(name),
  });
  const defaults = { ...api.values };

  function writeHash() {
    const changed = {};
    for (const [k, v] of Object.entries(api.values)) if (v !== defaults[k]) changed[k] = v;
    const hash = Object.keys(changed).length ? `#p=${encodeURIComponent(JSON.stringify(changed))}` : "";
    history.replaceState(null, "", location.pathname + location.search + hash);
  }

  for (const [k, v] of Object.entries(readHash())) if (k in api.values) api.set(k, v);
  handle = mod.mount(stage, { ...api.values }, { reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches });
  ready = true;

  const framed = window.top !== window.self;
  const panel = () => /** @type {HTMLElement | null} */ (document.querySelector(".ksp"));
  // the dials open in the site's own panel, framed in the Studio or not
  // (Hunter, Oct 23: "I want the parameters for the playground to live in the site itself")
  if (open) requestAnimationFrame(() => panel()?.setAttribute("data-open", "true"));

  // the word in full (Hunter, Oct 25: "People don't know what params are")
  const head = panel()?.querySelector(".ksp-head b");
  if (head) head.textContent = "Parameters";

  // the look, set now and again whenever a dial that paints the ground moves
  if (!document.querySelector("style[data-ksp-look]")) {
    const style = document.createElement("style");
    style.setAttribute("data-ksp-look", "");
    style.textContent = LOOK_CSS;
    document.head.appendChild(style);
  }
  const root = document.documentElement;
  const look = lookOf(api, EXPERIMENTS.find((x) => x.slug === slug), defaults);
  const paint = () => {
    const { theme, ground } = look.decide();
    root.dataset.kspTheme = theme;
    if (ground) root.style.setProperty("--ksp-ground", ground);
    else root.style.removeProperty("--ksp-ground");
  };
  paint();
  const unwatch = api.subscribe((_, path) => (path == null || look.watch.has(path)) && paint());

  return {
    api,
    framed,
    destroy() {
      unwatch();
      delete root.dataset.kspTheme;
      root.style.removeProperty("--ksp-ground");
      handle?.destroy();
    },
    togglePanel() {
      const p = panel();
      if (p) p.dataset.open = p.dataset.open === "true" ? "false" : "true";
    },
    /** A random value for every slider and list, keeping colours and switches. */
    randomize() {
      for (const c of api.controls) {
        if (c.kind === "range") {
          const steps = Math.round((c.max - c.min) / c.step);
          api.set(c.path, Number((c.min + Math.round(Math.random() * steps) * c.step).toFixed(decimals(c.step))));
        } else if (c.kind === "select") {
          api.set(c.path, c.options[Math.floor(Math.random() * c.options.length)]);
        }
      }
    },
    reset() {
      for (const [k, v] of Object.entries(defaults)) api.set(k, v);
    },
  };
}
