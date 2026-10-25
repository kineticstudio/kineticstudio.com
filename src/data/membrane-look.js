/* The About founder row's chrome membrane (Hunter, Oct 25: "make my person
   into 3D, and then I want to poke through some sort of membrane ... this
   chrome reflective membrane that I'm pushing my head against, and then I'm
   rotating around it ... My head spins around it as the membrane stays the
   same"), every setting in one place.

   His head is a stand-in made from the headshot (public/images/hunter-head.png,
   made by scripts/hunter-head: a depth model's read of the photo, the front
   true to him, the sides and back filled in round, so his profile is only
   approximately his). It turns behind
   a mirror-chrome latex sheet that stays put; the sheet takes his shape where
   he presses into it.

   The About page's Params (the Studio's Params panel when it is framed there,
   P on the page by itself) change these live; Copy props hands back a new
   copy to paste over this object. A tuning is kept in this browser only,
   until Reset. Lengths are in sheet heights (the sheet is 1 tall). */

export const MEMBRANE_LOOK = {
  // the turn: speed (1 = a whole face, profile, face, other profile, face in 14 s),
  // how far round he turns (degrees), the share of each leg spent holding still,
  // how far he and the view lean toward the pointer (degrees)
  motion: { speed: 1, range: 72, hold: 0.18, lean: 6 },
  // how far his face comes through the sheet; follow: 1 keeps the same press at
  // every angle, 0 holds the head at one depth (so a profile presses less); soft:
  // the sheet's thickness, rounding what it lies over; neck: how far his neck sinks back
  press: { depth: 0.2, follow: 0.55, soft: 4, neck: 0.15 },
  // the latex: spread (how wide the sheet is drawn up round him), smooth (how
  // gently it leaves him), spring (Hz) and damping of its give, pillow (the whole
  // sheet's slight belly), rim (the edge rolling away)
  latex: { spread: 0.55, smooth: 3, spring: 2.4, damping: 0.55, pillow: 0.03, rim: 0.4 },
  // the skin: a fine orange-peel texture, its grain, the crease darkening
  surface: { texture: 0.12, grain: 140, cavity: 0.5 },
  // the chrome: the matcap it mirrors (public/images/matcaps), a tint, exposure
  look: { matcap: "Gallery", tint: "#ffffff", exposure: 1.05, contrast: 1.1 },
  // the frame: how much of the box the sheet fills, its corner radius
  frame: { fill: 1, corner: 0.014 },
  glow: { bloom: 0.25, threshold: 0.9, radius: 0.7 },
  // quality: scales the sheet's mesh, the height maps and the pixel ratio
  render: { quality: 1 },
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

/** Where a tuning made with the About page's Params is kept, in this browser. */
export const MEMBRANE_TUNING_KEY = "ks-membrane-tuning";

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
