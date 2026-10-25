/* How the site frames a 3D work card, and how its stills and loops are
   recorded (scripts/card-frames.mjs), so the two always match.

   MAT is the border round every tile (Hunter, Oct 24: "we need to have a
   border on all screen recordings and whatever we hover over. Dawn looks
   pretty good, but it could even have more of a border"), as a share of the
   tile's width on every side. A card draws it itself (&mat=, its own ground
   colour), so the border tilts with it; a tile with no card yet gets the
   same mat in CSS. */

export const MAT = 0.06;

/** @param {string} slug @param {{ bleed?: number, radius?: number }} [o] */
export const cardSrc = (slug, { bleed = 0, radius = 6 } = {}) => `/cards/${slug}/index.html?embed=1&bleed=${bleed}&radius=${radius}&mat=${MAT}`;
