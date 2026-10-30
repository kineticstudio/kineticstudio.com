/* Hunter's membrane (Hunter, Oct 25: "make my person
   into 3D, and then I want to poke through some sort of membrane ... this
   chrome reflective membrane that I'm pushing my head against, and then I'm
   rotating around it ... My head spins around it as the membrane stays the
   same"; then "I don't know if I always want it to be chrome. Sometimes it
   could be a flat material. I want to play around with the fidelity"), every
   setting in one place. It is tuned in the Creative Studio's Membrane
   prototype (clients/kinetic/prototypes/03-Membrane.html, filled by
   scripts/sync-membrane-prototype.mjs); it is not on the live site.

   His head is a stand-in made from the headshot (public/images/hunter-head.png,
   made by scripts/hunter-head: a depth model's read of the photo, the front
   true to him, the sides and back filled in round, so his profile is only
   approximately his). It turns behind
   a latex sheet that stays put (mirror chrome, or a lit material: matte,
   clay, plaster, rubber, glass); the sheet takes his shape where he presses
   into it.

   Params (the Studio's Params panel when it is framed there, P on the page
   by itself) change these live; Copy props hands back a new
   copy to paste over this object. A tuning is kept in this browser only,
   until Reset. Lengths are in sheet heights (the sheet is 1 tall). */

export const MEMBRANE_LOOK = {
  // which photo of him the bust is carved from (MEMBRANE_PORTRAITS; the turning head is always the headshot)
  portrait: { photo: "Headshot" },
  // the turn: speed (1 = a whole face, profile, face, other profile, face in 14 s),
  // how far round he turns (degrees; a relief reads best still, so 0), the share of
  // each leg spent holding still, how far the slab tilts toward the pointer
  // (degrees), and how far his head turns toward it (degrees)
  motion: { speed: 1, range: 90, hold: 0.18, lean: 4, look: 0 },
  // how far he comes through the sheet; follow: 1 keeps the same press at
  // every angle, 0 holds him at one depth (so a profile presses less); soft:
  // the sheet's thickness, rounding what it lies over; neck: how far his neck
  // sinks back (the turning head only)
  press: { depth: 0.135, follow: 1, soft: 0.35, neck: 0.15 },
  // the latex: spread (how wide the sheet is drawn up round him), smooth (how
  // gently it leaves him), spring (Hz) and damping of its give, pillow (the whole
  // sheet's slight belly), rim (the edge rolling away)
  latex: { spread: 0.01, smooth: 0, spring: 2.4, damping: 0.55, pillow: 0, rim: 0.15 },
  // the skin: a fine texture over everything (the stone's grain), its scale, the crease darkening (chrome)
  surface: { texture: 0.5, grain: 420, cavity: 0.5 },
  // what the sheet is made of (MEMBRANE_MATERIALS has each one's starting point):
  // its colour (the lit materials), roughness, gloss (highlight and reflection),
  // sheen (satin at grazing angles), ambient (the room's fill), occlusion in the
  // folds and carving, the strength of its shadow, and speckle (stone's flecks and mottling)
  // (Hunter's tuning, Oct 25: a cool grey stone with a satin gloss and a low, near-overhead light)
  material: { type: "Stone", color: "#bdbdbd", roughness: 1, gloss: 1.48, sheen: 1.5, ambient: 0.14, ao: 1.5, shadow: 1, speckle: 0.6 },
  // the studio light for the lit materials: its angle round the sheet (degrees, 0
  // from above, clockwise), its height over the sheet (degrees; low rakes), its
  // strength, how soft its shadow is, and how far (degrees) and how slowly (seconds) it rakes to and fro
  light: { angle: 16, height: 18, intensity: 0.78, softness: 0.34, sweep: 61, period: 18 },
  // the chrome: the matcap it mirrors (public/images/matcaps; the lit materials
  // reflect it too, blurred), a tint, exposure (all materials), contrast
  look: { matcap: "Gallery", tint: "#ffffff", exposure: 1.05, contrast: 1.1 },
  // the frame: how much of the box the sheet fills, its corner radius
  frame: { fill: 1, corner: 0.014 },
  glow: { bloom: 0, threshold: 0.9, radius: 0.7 },
  // fidelity: subject (Scan: his head from a scan, turning, the default; Bust: his carved relief, head to jacket; Head: the turning
  // stand-in), the sheet's mesh (segments a side), its height maps (texels a side),
  // the carving's own map (texels a side), the subject's mesh (1 full, 2 half, ...),
  // relief (how deep the bust's volumes are), the carving: strands (fine hair), locks
  // (the hair's carved locks), stubble (the beard's pits and short strands), carve (the
  // photo's fine lines: lids, lips, folds); detail: the turning head's facial depth
  fidelity: { subject: "Scan", segments: 640, maps: 1024, fine: 1536, head: 1, relief: 1, strands: 1, locks: 1, stubble: 1, carve: 1, detail: 1 },
  // quality: the pixel ratio (1 = the screen's, up to 2); tone: the tone mapping
  render: { quality: 1, tone: "Neutral" },
};

/* The bust's photos, each its own relief in public/images (scripts/hunter-head: relief.py for the headshot,
   and for it made to smile by smile.py; portraits.py for the others, from scripts/hunter-head/photos). Hunter, Oct 25:
   "Let's try this for the membrane. as an option in params". */
export const MEMBRANE_PORTRAITS = {
  // the headshot as it is, the default again (Hunter, Oct 25: "bring back the old image without me smiling as the default")
  Headshot: "hunter-relief.png",
  // the headshot warped into a closed smile (smile.py)
  "Headshot, smiling": "hunter-relief-headshot-smile.png",
  Smile: "hunter-relief-smile.png",
  "Close-up": "hunter-relief-close-up.png",
  "Arms crossed": "hunter-relief-arms-crossed.png",
};

export const MEMBRANE_MATCAPS = {
  // photographed rooms, in grey (from the Cosmolabs matcap bundle): a dark gallery, an atrium, daylight, overcast
  Gallery: "gallery",
  Atrium: "atrium",
  Daylight: "daylight",
  Overcast: "overcast",
  // light rooms made for this sheet (bright behind the viewer, a dark floor, black flags, softboxes)
  Silver: "silver-room",
  Steel: "steel-room",
  // the site's chrome matcaps
  Hall: "chrome-hall",
  Horizon: "chrome-horizon",
  Room: "chrome-room",
  Soft: "chrome-soft",
  "Studio dome": "studio-dome",
  "Studio rings": "studio-rings",
};

/* Each subject's starting point, as a material's: the scan and the stand-in turn (face, profile, face, the
   other profile), the relief stays still. */
export const MEMBRANE_SUBJECTS = {
  Scan: { motion: { range: 90 } },
  Bust: { motion: { range: 0 } },
  Head: { motion: { range: 90 } },
};

/* Each material's starting point: picking one in Params sets these (and the tone
   mapping, and for some the grain and the light's height), then every dial is free. */
export const MEMBRANE_MATERIALS = {
  // limestone: matte, flecked and mottled, a fine pitted grain, the carving darker in its cuts, a low raking light
  Stone: { material: { color: "#bdbdbd", roughness: 1, gloss: 1.48, sheen: 1.5, ambient: 0.14, ao: 1.5, shadow: 1, speckle: 0.6 }, surface: { texture: 0.5, grain: 420 }, light: { height: 18 }, render: { tone: "Neutral" } },
  Chrome: { material: { color: "#d9dad5", roughness: 0.85, gloss: 0.08, sheen: 0, ambient: 0.45, ao: 0.8, shadow: 0.7, speckle: 0 }, surface: { texture: 0.12, grain: 140 }, render: { tone: "ACES" } },
  // soft grey, one light, deep occlusion
  Matte: { material: { color: "#c9cbc6", roughness: 0.9, gloss: 0.06, sheen: 0.05, ambient: 0.28, ao: 0.9, shadow: 0.6, speckle: 0 }, surface: { texture: 0.12, grain: 140 }, light: { height: 36 }, render: { tone: "Neutral" } },
  // warm modelling clay, a little waxy
  Clay: { material: { color: "#b49a86", roughness: 0.75, gloss: 0.12, sheen: 0.12, ambient: 0.26, ao: 1, shadow: 0.65, speckle: 0.12 }, surface: { texture: 0.25, grain: 180 }, light: { height: 32 }, render: { tone: "Neutral" } },
  // white plaster or paper: bright, chalky, a soft long shadow
  Plaster: { material: { color: "#f1f0eb", roughness: 1, gloss: 0, sheen: 0.04, ambient: 0.32, ao: 0.75, shadow: 0.7, speckle: 0.05 }, surface: { texture: 0.25, grain: 260 }, light: { height: 30 }, render: { tone: "Neutral" } },
  // black latex: satin, a tight highlight, a bright sheen where it turns away
  Rubber: { material: { color: "#1c1d1f", roughness: 0.42, gloss: 0.55, sheen: 0.7, ambient: 0.35, ao: 0.6, shadow: 0.55, speckle: 0 }, surface: { texture: 0.08, grain: 140 }, light: { height: 40 }, render: { tone: "ACES" } },
  // clear-ish: the page through it, the room at grazing angles
  Glass: { material: { color: "#dfe6e8", roughness: 0.05, gloss: 1, sheen: 0.3, ambient: 0.5, ao: 0.3, shadow: 0, speckle: 0 }, surface: { texture: 0.05, grain: 140 }, render: { tone: "ACES" } },
};

/* Every dial Params shows, by group: [min, max, step], "color", or a list to choose from. */
export const MEMBRANE_DIALS = {
  portrait: { photo: Object.keys(MEMBRANE_PORTRAITS) },
  motion: { speed: [0, 3, 0.01], range: [0, 180, 1], hold: [0, 0.8, 0.01], lean: [0, 15, 0.1], look: [0, 20, 0.1] },
  press: { depth: [0, 0.3, 0.001], follow: [0, 1, 0.01], soft: [0, 10, 0.05], neck: [0, 0.3, 0.001] },
  latex: { spread: [0, 1, 0.01], smooth: [0, 10, 0.05], spring: [0.3, 6, 0.01], damping: [0.05, 1.5, 0.01], pillow: [-0.05, 0.1, 0.001], rim: [0, 2, 0.01] },
  surface: { texture: [0, 2, 0.01], grain: [5, 800, 1], cavity: [0, 2, 0.01] },
  material: { type: Object.keys(MEMBRANE_MATERIALS), color: "color", roughness: [0, 1, 0.01], gloss: [0, 1.5, 0.01], sheen: [0, 1.5, 0.01], ambient: [0, 1.2, 0.01], ao: [0, 1.5, 0.01], shadow: [0, 1, 0.01], speckle: [0, 1.5, 0.01] },
  light: { angle: [0, 360, 1], height: [5, 90, 1], intensity: [0, 3, 0.01], softness: [0.05, 2, 0.01], sweep: [0, 90, 1], period: [3, 60, 0.5] },
  look: { matcap: Object.keys(MEMBRANE_MATCAPS), tint: "color", exposure: [0.3, 2.5, 0.01], contrast: [0.5, 2, 0.01] },
  frame: { fill: [0.5, 1, 0.005], corner: [0, 0.2, 0.001] },
  glow: { bloom: [0, 2, 0.01], threshold: [0.2, 2, 0.01], radius: [0, 1.5, 0.01] },
  fidelity: { subject: ["Scan", "Bust", "Head"], segments: [24, 800, 1], maps: [64, 1024, 16], fine: [256, 2048, 64], head: [1, 6, 1], relief: [0, 2.5, 0.01], strands: [0, 3, 0.01], locks: [0, 3, 0.01], stubble: [0, 3, 0.01], carve: [0, 3, 0.01], detail: [0, 2.5, 0.01] },
  render: { quality: [0.4, 1, 0.05], tone: ["ACES", "Neutral", "AgX", "None"] },
};

/** Where a tuning made with the About page's Params is kept, in this browser. */
export const MEMBRANE_TUNING_KEY = "ks-membrane-tuning-4"; // -4: the scan as the subject (Oct 25), so an older tuning does not hide it

/** The defaults as this file has them, before a stored tuning (for Reset). */
export const MEMBRANE_DEFAULTS = JSON.parse(JSON.stringify(MEMBRANE_LOOK));

// a stored tuning, laid over the defaults key by key
const lay = (into, from) => {
  for (const k of Object.keys(into)) {
    if (!(k in from)) continue;
    if (into[k] && typeof into[k] === "object") {
      if (from[k] && typeof from[k] === "object") lay(into[k], from[k]);
    } else if (typeof from[k] === typeof into[k]) into[k] = from[k];
  }
};
try {
  const stored = JSON.parse(localStorage.getItem(MEMBRANE_TUNING_KEY) ?? "null");
  if (stored && typeof stored === "object") lay(MEMBRANE_LOOK, stored);
} catch {}
