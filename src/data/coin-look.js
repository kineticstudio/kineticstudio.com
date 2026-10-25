/* The About headline's pills (craft, quality, story), every setting in one
   place (Hunter, Oct 25: "Come up with your own designs for the craft,
   quality, and story pills. Right now, they just feel slightly lazy and
   unrealistic. I think you're looking too much at the original thing that I
   sent you"; before that, silver, scratched, hyper-realistic, moving less).

   Four designs, each with its own settings; `design` picks the one shown:
     Chrome    a mirror-chrome pill from a matcap, raised letters, a light circling its edge, bloom
     Machined  solid aluminium, bead-blasted, a diamond-cut chamfer, the word engraved
     Enamel    polished, lightly brushed steel, the word filled with black enamel
     Ingot     a struck silver bar, a mirror field, soft edges, the word stamped in and frosted

   The About page's Params (the Studio's Params panel when it is framed
   there, P on the page by itself) change these live; Copy props hands back a
   new copy to paste over this object. A tuning is kept in this browser only,
   until Reset. src/scripts/coin-pills.js draws them; lengths are in pill
   heights (the pill is 1 tall). */

export const COIN_LOOK = {
  design: "Chrome",
  // Hunter, Oct 25: "maybe we try a reflective chrome matcap then have bloom
  // and flares?"; "a shine around the edges, like a light is rotating around them"
  chrome: {
    // the matcap it mirrors (public/images/matcaps), a tint over it
    metal: { matcap: "Studio dome", tint: "#ffffff" },
    // the word, raised (Hunter, Oct 25: "like extruded"): cap height, tracking
    // (em), how wide its rounded shoulders are and how high it stands (x the
    // shoulder), the field's smoked colour and how smoked it is
    word: { size: 0.5, tracking: 0.03, bevel: 0.05, height: 1, fill: "#101114", field: 0.85 },
    // the edge: the rolled radius, how domed the face is (its slope at the edge), the thickness
    edge: { round: 0.14, crown: 0.55, thick: 0.22 },
    // the light round the edge: turns a second, how bright and how tight its shine,
    // how much the matcap turns with it, how far each pill lags the one before (radians)
    light: { orbit: 0.1, highlight: 1.6, tight: 7, spin: 0.35, lag: 0.7 },
    // bloom on what is over the threshold, how wide, how far it spills onto the paper
    // (no lens flares: Hunter, Oct 25, "They don't look realistic")
    glow: { bloom: 0.5, threshold: 1.5, radius: 0.6, spill: 0.5 },
    // a few hairlines in the polish
    wear: { scratches: 10, seed: 5 },
    studio: { exposure: 1.3, shadow: 0.5 },
  },
  machined: {
    // anodize = the body's colour (natural, or dyed), cut = the bare metal the
    // cutter exposes; blast = the bead-blast's roughness, mottle = how uneven it is
    metal: { anodize: "#cdcfd1", cut: "#eef0f2", blast: 0.5, mottle: 0.25 },
    // the word: cap height, tracking (em), how deep it is cut, the polished lip
    // round its edge, the floor's roughness (lower reflects more of the dark room)
    word: { size: 0.5, tracking: 0.03, depth: 0.035, lip: 0.007, floor: 0.2 },
    // the edge: the diamond-cut chamfer's width, the round on its two edges, the thickness
    edge: { chamfer: 0.045, round: 0.006, thick: 0.22 },
    // a few hairlines and fingerprints, at low strength
    wear: { scratches: 26, smudge: 0.25, seed: 7 },
    // the studio: exposure, how much it mirrors, how light its walls are (1 a
    // dark room, more a light tent), the soft box close by, the lights round
    // it (overhead strip, side strips, the scrim behind the camera, the black
    // card round its lens and how far it is moved off it, a low bounce), how
    // bright the paper under it is (what the sides mirror), its turn, the shadow
    studio: { exposure: 1, reflect: 1, room: 1, box: 6, key: 7, sides: 3.2, front: 0.95, flag: 1, flagAt: 0, floor: 0.6, paper: 0.6, turn: 0, shadow: 0.55 },
  },
  enamel: {
    // the steel's colour, its polish (roughness), how much of a brushed grain it carries
    metal: { tint: "#c3c6c9", polish: 0.1, brush: 0.3 },
    // the word: cap height, tracking (em), the enamel's colour and gloss, the steel lip round it
    word: { size: 0.5, tracking: 0.02, enamel: "#0d0d0e", gloss: 0.08, lip: 0.006 },
    // the edge: the rolled radius round the face, the thickness
    edge: { round: 0.085, thick: 0.2 },
    // polishing swirls, hairlines and fingerprints
    wear: { swirls: 0.5, scratches: 20, smudge: 0.45, seed: 3 },
    // the black card's edge across the steel grades it, the strip close in front only a faint sheen
    studio: { exposure: 1, reflect: 1, room: 1, box: 1.2, key: 6, sides: 3, front: 1.8, flag: 0.7, flagAt: 0.1, floor: 0.6, paper: 0.8, turn: 0, shadow: 0.55 },
  },
  ingot: {
    // the silver's colour, the field's polish (roughness), how far the mirror
    // is from flat, the frosting of the struck word (roughness)
    metal: { tint: "#e6e4e0", polish: 0.05, ripple: 0.3, frost: 0.6 },
    // the word: cap height, tracking (em), how deep it is struck, how soft its walls are
    word: { size: 0.5, tracking: 0.04, depth: 0.03, soft: 0.018 },
    // the edge: the round over the face, how far the sides draft out, the thickness
    edge: { round: 0.13, draft: 0.05, thick: 0.26 },
    // dings, hairlines, fingerprints, and tarnish in the hollows
    wear: { dings: 4, scratches: 34, smudge: 0.3, tarnish: 0.35, seed: 11 },
    // a black card just off the lens: the mirror falls from light into dark across it
    studio: { exposure: 1, reflect: 1, room: 4, box: 5, key: 5, sides: 3, front: 2.4, flag: 0.85, flagAt: 0.055, floor: 1.2, paper: 1.2, turn: 0, shadow: 0.5 },
  },
  // how they move: degrees of slow drift, how fast, how far they lean toward the pointer
  motion: { drift: 1.6, speed: 0.35, lean: 3 },
  // drawn at this many times the screen's pixels (capped at 3)
  render: { quality: 1.25 },
};

/** The designs, as the Params panel names them. */
export const COIN_DESIGNS = ["Chrome", "Enamel", "Machined", "Ingot"];

/** Where a tuning made with the About page's Params is kept, in this browser. */
export const COIN_TUNING_KEY = "ks-coin-tuning";

// a stored tuning, laid over the defaults key by key (one from before the
// designs, without `design`, is for the old coins and is ignored)
const lay = (into, from) => {
  for (const k of Object.keys(into)) {
    if (!(k in from)) continue;
    if (into[k] && typeof into[k] === "object") {
      if (from[k] && typeof from[k] === "object") lay(into[k], from[k]);
    } else if (typeof from[k] === typeof into[k]) into[k] = from[k];
  }
};
try {
  const stored = JSON.parse(localStorage.getItem(COIN_TUNING_KEY) ?? "null");
  if (stored?.design && COIN_DESIGNS.includes(stored.design)) lay(COIN_LOOK, stored);
} catch {}
