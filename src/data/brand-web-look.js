/* The look of /primary's brand-to-website rows (src/components/section/PartnerBrandToWeb.astro), one place for
   every dial. Its Params (src/scripts/brand-web-params.js): framed in the Creative Studio the Studio draws
   them; on the page by itself P opens the panel. A tuning is kept in this browser until Reset; Copy props
   hands back this object to paste over it. */
export const BRAND_WEB_FILE = "src/data/brand-web-look.js";
export const BRAND_WEB_KEY = "ks-brand-web-look-6"; // new key Nov 17: older tunings (with the blur and insets) are dropped

export const BRAND_WEB_LOOK = {
  // the guideline pages, on the inside of a barrel whose axis runs through the laptop's screen: the further
  // left a page is, the nearer and more stretched; evenly spaced round it, so they never overlap
  barrel: {
    reach: 38, // degrees round the barrel at the page's left edge (more: stronger skew on the left)
    page: 0.2, // a page's height at the screen, times the laptop's height
    gap: 0.06, // between pages along a line, times a page's height
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
  // light into dark toward the bottom right of the screen, a glow on the edge between, like the Primary
  // proposal's cover, but curved and soft (Hunter, Nov 17: "This gradient needs to be non-linear ... have a
  // curve to it and be softer, and then change color based on the client we're showing off"). An ellipse
  // centred off the bottom right corner; the dark, the glow and the light ease into each other. The glow
  // takes the colour of the client on screen (Primary's neon over the hero). It is the screen's, not the
  // section's: it stays put behind the hero and the rows as they scroll
  gradient: {
    x: 96, // the ellipse's centre, % across the screen
    y: 150, // % down (below the screen, so the edge rises as an arch from the left)
    width: 140, // its radius across, % of the screen's width
    height: 125, // its radius down, % of the screen's height
    dark: 0.36, // where the dark starts to lift, along the radius
    glow: 0.6, // where the glow is strongest
    light: 0.92, // where it is all light
    glowMix: 0.7, // how much of the client's colour, against the light
    hero: "#c8ff54", // Primary's neon, over the hero
    exe: "#3e6c76", // exe's teal (its site)
    owner: "#25983f", // Owner's green (its brand book)
    ramble: "#eeff83", // Ramble's lime (its brand book)
  },
};
