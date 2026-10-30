/* The homepage's tunable settings, in one place (Hunter, Oct 24: "Give me
   parameters on the home page itself to adjust the laurel and some other
   things ... Also, give me parameters for the hover effect").

   The homepage's Params (src/scripts/home-params.js: the Studio's Params
   panel when it is framed there, P on the page by itself) change these live,
   and Copy props hands back a new copy of this object (and of LAUREL_LOOK) to
   paste over the file. A tuning is kept in this browser only, until Reset. */

export const HOME_LOOK = {
  // the intro's rubber bands (src/scripts/logo-field.js) and its timing, seconds
  // (Hunter, Oct 24: "a little more fluid. Once it hits the lines, now we start shrinking"; "The
  // Kinetic logo looks a little too big"; Oct 25: "only have five lines"): logo = its width, rem
  // (Oct 29: "It should feel more like one fluid movement", and the logo starts up into the corner,
  // dockLead, as they land; "I want the pill to go over ... As it's coming back to its resting point, it
  // scales down"; "like rubber bands that are slowing down the pill"; "the right line could be almost
  // all the way to the right of the viewport", logo-intro.js pillPath; Oct 30: "Let's not have a bounce-back
  // effect either", so no overshoot and bounce 0; "give me parameters for: speed it comes in, speed it slows
  // down, the amount of elasticity in the rubber bands"; "give me a graphical curve to play with how the pill is
  // animated in and slows down"): pillFor = s from the window's edge to its place, pillCurve = how it goes, a
  // cubic-bezier of how far along against the time (Hunter's own, Oct 30); every band one bell, the Kinetic lines
  // tool's (Oct 30: "those had a curve. That's really what I want to emulate"; "these still look wildly off and
  // not like smooth curves"): reach = its width, times the one fitted to the strokes, curve = how soon it straightens;
  // lineWidth = the bands' width before they land, times the strokes' own ("wondering if it'll look better if they are smaller");
  // collapseAt = s from the stop that the bands let go; dockFor = the move into the nav's corner
  intro: {
    logo: 44,
    riseFor: 0.6, riseSpread: 0.35, pillAt: 0.2, pillFor: 0.96, pillCurve: [0.04, 0.48, 0.16, 1.01], reach: 1, curve: 1, lineWidth: 1, collapseAt: -0.4, collapseFor: 0.85, collapseSpread: 0, bounce: 0, dockLead: 0.5, dockFor: 1.15,
  },
  // a tile's 3D card under the pointer: tilt (degrees), lift, depth of the view,
  // the springs it moves on, and when it shows (ms after it loads) and is dropped (s after leaving)
  // bloom, rim, shadow = times each card's own (the light under the pointer, the lit
  // edge, the layers' shadows); bloomSize = the bloom's width in card widths
  hover: { tilt: 5, scale: 1.012, perspective: 2.4, stiffness: 110, damping: 21, fadeIn: 160, linger: 8, bloom: 0.45, bloomSize: 1, rim: 0.8, shadow: 1 },
  // the wheel: the right column's lead per degree of the curve and its drop (shares of a tile),
  // and the degrees of scroll the hero takes to turn into particles
  // curve = how tight the drum is (lower rolls the rows away and shrinks them sooner,
  // Oct 25: "the parallax kind of zoom-out effect be more aggressive"); depth = how far
  // back a row sinks as it leaves; fade = degrees over which it fades out
  wheel: { parallax: 0.018, zip: 0.22, dissolve: 22, curve: 0.72, depth: 1.4, fade: 30 },
};

/** Where a tuning made with the Params is kept, in this browser. */
export const TUNING_KEY = "ks-home-tuning";

export function storedTuning() {
  try {
    return JSON.parse(localStorage.getItem(TUNING_KEY) ?? "null");
  } catch {
    return null;
  }
}

/* A tuning kept in this browser goes over the file's values, key by key, but
   only where the file still says what it said when the tuning was kept: a
   value changed in this file since (Hunter's pasted props) wins over an old
   tuning (Hunter, Oct 25: "it doesn't look like you adopted the parameters I
   sent"). A tuning kept before this rule has no record of the file and is
   left out. */
export function applyTuning(look, tuned, base) {
  if (!tuned || !base) return;
  for (const g of Object.keys(look)) {
    if (!tuned[g] || !base[g]) continue;
    for (const k of Object.keys(tuned[g])) {
      if (k in look[g] && JSON.stringify(base[g][k]) === JSON.stringify(look[g][k])) look[g][k] = tuned[g][k];
    }
  }
}

// the file's own values, which a kept tuning records so it can tell when they change
export const HOME_FILE = structuredClone(HOME_LOOK);
const stored = storedTuning();
applyTuning(HOME_LOOK, stored?.home, stored?.base?.home);
