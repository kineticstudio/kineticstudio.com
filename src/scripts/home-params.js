/* The homepage's Params (Hunter, Oct 24: "Give me parameters on the home
   page itself to adjust the laurel and some other things ... Also, give me
   parameters for the hover effect").

   Framed in the Creative Studio, its Params panel draws these dials; on the
   page by itself, P opens the same panel (src/scripts/ks-params.js). Every
   dial starts at the files' settings (src/data/home-look.js, laurel-look.js)
   and changes the page live: the laurels (rebuilt when their leaves or the
   wreath change), the 3D cards that are up, the wheel. The intro's dials
   take effect on Replay intro. A tuning is kept in this browser until Reset;
   Copy props hands back both objects to paste over the files. */

import { defineParams } from "./ks-params.js";
import { HOME_FILE, HOME_LOOK, TUNING_KEY } from "../data/home-look.js";
import { LAUREL_FILE, LAUREL_LOOK } from "../data/laurel-look.js";
import { retuneCards } from "./card-hover.js";

const LOOKS = ["Polished", "Mirror", "Studio", "Blender"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const I = HOME_LOOK.intro, Hv = HOME_LOOK.hover, Wh = HOME_LOOK.wheel, L = LAUREL_LOOK;

const schema = {
  // first, beside the intro's dials (Hunter, Oct 30: "a button to replay")
  replayIntro: { type: "action", label: "Replay intro" },
  intro: {
    logo: [I.logo, 24, 64, 0.5], // the logo's width while it plays, rem
    pillAt: [I.pillAt, 0, 1.5, 0.05],
    inSpeed: [I.inSpeed, 0.5, 10, 0.1], // how fast the pill comes in, logo widths a second
    catchFor: [I.catchFor, 0.2, 2, 0.05], // how long the bands take to slow it to a stop, s
    reach: [I.reach, 30, 500, 1], // how far along each band the pill's push spreads, logo units (more: wider, softer bends)
    curve: [I.curve, 0.3, 4, 0.05], // how soon each band straightens again (more: tighter round the pill, upright sooner)
    lineWidth: [I.lineWidth, 0.1, 1.5, 0.01], // the bands' width before they land, times the logo's strokes (lower: thinner, nearer their docked size)
    collapseAt: [I.collapseAt, -0.5, 1, 0.05], // s from the pill's stop that the bands let go
    dockFor: [I.dockFor, 0.3, 3, 0.05], // the move up into the nav's corner
    collapseFor: [I.collapseFor, 0.2, 2, 0.05], // s from a line's release until its ends are at rest on the stroke
    bounce: [I.bounce, 0, 0.6, 0.01], // how far the released ends spring past the stroke and back
  },
  hover: {
    tilt: [Hv.tilt, 0, 20, 0.5], // degrees the card leans toward the pointer
    scale: [Hv.scale, 1, 1.1, 0.001], // how much it lifts
    perspective: [Hv.perspective, 0.8, 6, 0.1], // the depth of the view
    stiffness: [Hv.stiffness, 20, 400, 1],
    damping: [Hv.damping, 2, 60, 0.5],
    fadeIn: [Hv.fadeIn, 0, 800, 10], // ms after the card loads that it takes over from the still
    linger: [Hv.linger, 0, 30, 0.5], // s a card is kept after the pointer leaves
    bloom: [Hv.bloom, 0, 2, 0.01], // the light under the pointer, times each card's own
    bloomSize: [Hv.bloomSize, 0.4, 2.4, 0.01], // its width, in card widths
    rim: [Hv.rim, 0, 2, 0.01], // the lit edge nearest the pointer, times the card's own
    shadow: [Hv.shadow, 0, 2, 0.01], // the layers' shadows, times the card's own
  },
  wheel: {
    parallax: [Wh.parallax, 0, 0.04, 0.001], // how far the right column runs ahead of the left
    zip: [Wh.zip, 0, 0.6, 0.01], // how much lower the right tile sits
    dissolve: [Wh.dissolve, 4, 60, 1], // degrees of scroll the hero takes to turn into particles
    curve: [Wh.curve, 0.35, 1.6, 0.01], // how tight the drum is: lower rolls rows away sooner
    depth: [Wh.depth, 0, 3, 0.05], // how far back a row sinks as it leaves
    fade: [Wh.fade, 8, 60, 1], // degrees over which a leaving row fades out
  },
  laurelLayout: {
    size: [L.layout.size, 5, 20, 0.1],
    gap: [L.layout.gap, 0, 14, 0.1],
    logo: [L.layout.logo, 0.3, 1.6, 0.01],
    caption: [L.layout.caption, 0.5, 1.5, 0.0125],
  },
  laurelLeaves: {
    pairs: [L.leaves.pairs, 2, 18, 1],
    length: [L.leaves.length, 0.4, 2, 0.01],
    width: [L.leaves.width, 0.4, 2.5, 0.01],
    plump: [L.leaves.plump, 0, 1, 0.01],
    thickness: [L.leaves.thickness, 0.05, 0.9, 0.01],
    crease: [L.leaves.crease, 0, 1, 0.01],
    curl: [L.leaves.curl, -0.12, 0.3, 0.005],
    taper: [L.leaves.taper, 0, 1.6, 0.01],
    stem: [L.leaves.stem, 0.005, 0.08, 0.001],
  },
  laurelWreath: {
    opening: [L.wreath.opening, 10, 170, 1],
    spread: [L.wreath.spread, 0.7, 2.2, 0.01],
    base: [L.wreath.base, -130, -30, 1],
    fit: [L.wreath.fit, 0.4, 1.4, 0.01],
    apart: [L.wreath.apart ?? 0, -0.3, 0.8, 0.005],
  },
  laurelMetal: {
    reflect: [L.metal.reflect, 0, 3, 0.01],
    roughness: [L.metal.roughness, 0, 0.6, 0.005],
    clearcoat: [L.metal.clearcoat, 0, 1, 0.01],
    tint: L.metal.tint,
  },
  laurelWorld: {
    look: { type: "select", options: LOOKS, default: cap(L.world.look) },
    horizon: [L.world.horizon, -60, 50, 0.5],
    exposure: [L.world.exposure, 0.2, 2.5, 0.01],
    lights: [L.world.lights ?? 1, 0.5, 6, 0.05],
  },
  laurelBloom: {
    strength: [L.bloom.strength, 0, 3, 0.01],
    threshold: [L.bloom.threshold, 0.1, 8, 0.01],
    radius: [L.bloom.radius, 0.2, 1, 0.01],
    halo: [L.bloom.halo ?? 0, 0, 3, 0.01],
  },
  laurelMotion: {
    wind: [L.motion.wind, 0, 4, 0.01],
    windSpeed: [L.motion.windSpeed, 0, 4, 0.01],
    turn: [L.motion.turn, 0, 40, 0.5],
    lean: [L.motion.lean, 0, 4, 0.01],
    twist: [L.motion.twist ?? 1, 0, 2, 0.01],
    flutter: [L.motion.flutter ?? 1, 0, 1, 0.01],
  },
  laurelFlash: {
    every: [L.flash.every, 0, 12, 0.1],
    count: [L.flash.count, 1, 6, 1],
    sweep: [L.flash.sweep, 5, 180, 1],
    pass: [L.flash.pass, 0.1, 3, 0.01],
    glow: [L.flash.glow, 0, 4, 0.01],
  },
  laurelRender: {
    quality: [L.render?.quality ?? 1.5, 1, 2.5, 0.05],
    steady: [L.render?.steady ?? 0.6, 0, 0.9, 0.01],
  },
  flashLaurels: { type: "action", label: "Flash laurels" },
  copyProps: { type: "action", label: "Copy props" },
  reset: { type: "action", label: "Reset" },
};

// a dial's path -> where it lives
const LAUREL_GROUPS = { laurelLayout: "layout", laurelLeaves: "leaves", laurelWreath: "wreath", laurelMetal: "metal", laurelWorld: "world", laurelBloom: "bloom", laurelMotion: "motion", laurelFlash: "flash", laurelRender: "render" };
const HOME_GROUPS = { intro: "intro", hover: "hover", wheel: "wheel" };
// a change that needs the laurels built again (their shape, or the world they mirror)
const REBUILD = /^(laurelLeaves\.|laurelWreath\.(opening|spread|base|apart)|laurelWorld\.(look|horizon|lights))/;

const save = () => {
  try {
    localStorage.setItem(TUNING_KEY, JSON.stringify({ home: HOME_LOOK, laurel: LAUREL_LOOK, base: { home: HOME_FILE, laurel: LAUREL_FILE } }));
  } catch {}
};
const laurelRow = () => document.querySelector("[data-awards]");
let rebuildTimer = 0;
function applyLaurels(rebuild) {
  const row = laurelRow();
  if (!row?.__laurelLook) return;
  if (!rebuild) return row.__laurelLook(LAUREL_LOOK, false);
  // a rebuild waits for the dial to rest
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => row.__laurelLook(LAUREL_LOOK, true), 90);
}

const literal = (name, o) => `export const ${name} = ${JSON.stringify(o, null, 2).replace(/"(\w+)":/g, "$1:")};\n`;

defineParams("Homepage", schema, {
  onChange(values, path) {
    if (!path) return; // the first announce: the files already hold these
    const [group, key] = path.split(".");
    const value = values[path];
    if (HOME_GROUPS[group]) {
      HOME_LOOK[group][key] = value;
      if (group === "hover") retuneCards();
      if (group === "wheel") dispatchEvent(new CustomEvent("ks:home-look"));
    } else if (LAUREL_GROUPS[group]) {
      const g = LAUREL_GROUPS[group];
      LAUREL_LOOK[g][key] = group === "laurelWorld" && key === "look" ? String(value).toLowerCase() : value;
      applyLaurels(REBUILD.test(path));
    }
    save();
  },
  onAction(name) {
    if (name === "replayIntro") {
      // the intro plays again on a fresh arrival, with these settings (kept in this browser)
      save();
      try {
        sessionStorage.removeItem("ks-internal");
        sessionStorage.removeItem("ks-pill");
      } catch {}
      scrollTo(0, 0);
      location.reload();
    } else if (name === "flashLaurels") laurelRow()?.__laurels?.flash?.();
    else if (name === "copyProps") return `${literal("HOME_LOOK", HOME_LOOK)}\n${literal("LAUREL_LOOK", LAUREL_LOOK)}`;
    else if (name === "reset") {
      try {
        localStorage.removeItem(TUNING_KEY);
      } catch {}
      location.reload();
    }
    return undefined;
  },
});
