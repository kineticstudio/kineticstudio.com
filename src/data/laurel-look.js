/* The award laurels: every setting in one place. The homepage's award row
   (AwardsLaurels) reads it, and so does the Creative Studio's Award laurel
   prototype (Prototypes > Award laurel, copied there by
   scripts/sync-laurel-prototype.mjs), whose Copy props hands back a new copy
   of this object to paste over it.

   Hunter, Oct 24: "Give me something I can prototype so I could play around
   with the setup: how many leaves, how reflective, how bloomy, how many
   times they flash, the size, the spacing ... Everything." */

import { applyTuning, storedTuning } from "./home-look.js";

// Hunter's own tuning from the laurel Params, Oct 25 (the homepage and About)
export const LAUREL_LOOK = {
  // the row: wreath width and the gap between awards (rem), the award logo
  // against its usual size, the line under each award (rem)
  layout: { size: 8.6, gap: 5.7, logo: 0.85, caption: 0.8125 },
  // leaf pairs per branch and their shape: plump = how full the underside
  // is (1 = round both ways), crease = a midrib down each leaf
  leaves: { pairs: 9, length: 0.86, width: 1.39, plump: 0.51, thickness: 0.68, crease: 0.88, curl: 0.05, taper: 1.04, stem: 0.035 },
  // the gap at the top (degrees), how much wider than tall, where the stems
  // start (degrees round the ring, -90 = the bottom), the fit in its slot
  // apart = the space between the two branches (ring units; below 0 brings them in)
  wreath: { opening: 90, spread: 1.41, base: -60, fit: 0.93, apart: 0 },
  // reflect = how much of the world the metal mirrors
  metal: { reflect: 1.25, roughness: 0, clearcoat: 0.22, tint: "#f2f2f4" },
  // what the metal mirrors (polished, mirror, studio, blender) and where its
  // horizon lands (degrees: higher puts more of the dark ground on the leaves)
  // lights = how big and soft its lights are (1 = pinpoints that wink; bigger glide)
  world: { look: "mirror", horizon: -21.5, exposure: 0.91, lights: 2.95 },
  // halo = how much the whole laurel glows, not just the parts past the threshold
  bloom: { strength: 3, threshold: 1.62, radius: 0.7, halo: 0.02 },
  // multipliers on the wind and the lean toward the pointer; turn = the slow
  // side to side sway, degrees
  // twist = how far each leaf turns on its stem; flutter = how much each leaf
  // moves on its own (0 = the branch moves as one wave)
  motion: { wind: 2.79, windSpeed: 0.82, turn: 9, lean: 1, twist: 1.34, flutter: 1 },
  // every = seconds between flashes (0 = none), count = passes per flash,
  // sweep = how far the lights slide (degrees), pass = seconds a pass takes,
  // glow = how much brighter the metal gets at the height of a pass
  flash: { every: 1.6, count: 2, sweep: 71, pass: 1.76, glow: 3.54 },
  // on a light page (About) the horizon sits higher, so the metal reads dark on paper
  light: { horizon: -27, bloom: 1.35 },
  // quality = drawn at this many times the screen's pixels, so thin highlights hold still;
  // steady = how much of the last frame each frame keeps, so glints glide instead of blinking
  render: { quality: 1.25, steady: 0.6 },
};

// the file's own values; a tuning from the homepage's Params, kept in this browser,
// goes over them only where they are unchanged since (applyTuning, src/data/home-look.js)
export const LAUREL_FILE = structuredClone(LAUREL_LOOK);
const stored = storedTuning();
applyTuning(LAUREL_LOOK, stored?.laurel, stored?.base?.laurel);

/** mountLaurels options for a look, on a dark or a light page. */
export function laurelOptions(look = LAUREL_LOOK, { light = false } = {}) {
  const { leaves: l, wreath: w, metal: m, world: g, bloom: b, motion: mo, flash: f } = look;
  return {
    scale: w.fit,
    laurel: {
      pairs: l.pairs, length: l.length, width: l.width, under: l.plump, thickness: l.thickness, ridge: l.crease, curl: l.curl, taper: l.taper, stem: l.stem,
      opening: w.opening, spread: w.spread, base: w.base, apart: w.apart ?? 0,
    },
    roughness: m.roughness,
    metal: { envMapIntensity: m.reflect, clearcoat: m.clearcoat, tint: m.tint },
    world: { look: g.look, tilt: light ? look.light.horizon : g.horizon, soft: g.lights ?? 1 },
    exposure: g.exposure,
    bloom: { strength: light ? look.light.bloom : b.strength, threshold: b.threshold, radius: b.radius, halo: b.halo ?? 0 },
    turn: mo.turn,
    motion: { wind: mo.wind, windSpeed: mo.windSpeed, lean: mo.lean, twist: mo.twist ?? 1, flutter: mo.flutter ?? 1 },
    flash: { ...f },
    quality: look.render?.quality ?? 1.5,
    steady: look.render?.steady ?? 0.6,
  };
}

/** The row's sizes as CSS custom properties, for the award row's style. */
export const laurelLayoutVars = ({ layout: a } = LAUREL_LOOK) =>
  `--laurel-w:${a.size}rem;--awards-gap:${a.gap}rem;--logo-scale:${a.logo};--line-size:${a.caption}rem`;
