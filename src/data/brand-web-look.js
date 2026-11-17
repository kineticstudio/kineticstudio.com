/* The look of /primary's brand-to-website rows (src/components/section/PartnerBrandToWeb.astro), one place for
   every dial. Its Params (src/scripts/brand-web-params.js): framed in the Creative Studio the Studio draws
   them; on the page by itself P opens the panel. A tuning is kept in this browser until Reset; Copy props
   hands back this object to paste over it. */
export const BRAND_WEB_FILE = "src/data/brand-web-look.js";
export const BRAND_WEB_KEY = "ks-brand-web-look-2"; // new key Nov 17: older tunings (with the blur and insets) are dropped

export const BRAND_WEB_LOOK = {
  // the guideline pages, on the inside of a barrel whose axis runs through the laptop's screen: the further
  // left a page is, the nearer and more stretched; evenly spaced round it, so they never overlap
  barrel: {
    reach: 58, // degrees round the barrel at the page's left edge (more: stronger skew on the left)
    page: 0.22, // a page's height at the screen, times the laptop's height
    gap: 0.08, // between pages along a line, times a page's height
    rowGap: 0.1, // between the two lines, times a page's height
    lapTop: 34, // seconds for a page to cross, top line (slower)
    lapBottom: 24, // bottom line
  },
  // the lens: pages blur as they come nearer on the left
  lens: {
    blur: 0, // px at the page's left edge (Hunter, Nov 17: "let's not blur it on the left")
    curve: 2.6, // how late it sets in (more: only the nearest pages)
  },
  // the laptop and the site on it
  laptop: {
    width: 68, // % of the row
    // the render's screen is the glass itself, bezel already drawn round it (checked Nov 17 with a test grid
    // in Blender), so the site fills it edge to edge; these trim it in if ever wanted
    insetX: 0, // times the glass's width
    insetTop: 0, // times its height
    insetBottom: 0,
    radius: 0.004, // the glass's top corners, times its width (the bottom ones a third of that)
  },
  // light into dark toward the bottom right of the screen, the neon glowing on the light side of the edge, as
  // on the Primary proposal's cover (briefs/migration/kinetic.mjs desk(): bright accent at 0.7, mixed 0.55).
  // It is the screen's, not the section's: it stays put behind the hero and the rows as they scroll
  gradient: {
    angle: 140, // degrees, CSS (180 straight down, 135 to the bottom right)
    start: 0.46, // where the light starts to turn, across the screen
    end: 0.64, // where it is dark
    accentAt: 0.72, // where the neon peaks between them
    accentMix: 0.6, // how much neon
  },
};
