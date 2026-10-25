/* The Playground. Two kinds of piece share the grid:

   live   code in src/experiments/<slug>.js, opened on /playground/<slug> with
          its Params panel
   clip   a moment from the Twitter folder (iCloud 💻 Kinetic/twitter), cut
          to public/media/<media>.mp4 by scripts/build-media.mjs; it opens
          in place

   `media` is the loop the grid shows before a piece is opened. For a live
   piece it is a capture of the experiment itself (public/media/exp-<slug>,
   made by scripts/capture-experiments.mjs), falling back to `fallback`.

   The Params panel takes the look of the piece it drives (Hunter, Oct 25:
   "The parameters in the playground need to adapt to the actual thing that
   is happening"), worked out in src/scripts/experiment-host.js from:

   theme   "dark" or "light": the piece as it opens, judged by eye
   ground  the colour dial(s) that paint its background, when they are not
           simply called ground; once a visitor dials them the panel follows
           (a dial named ground, background or bg is found by itself)
   themes  for a piece whose ground is picked from a list: the look of each
           option, keyed by the dial's path */

export const EXPERIMENTS = [
  { slug: "kinetic-lines", kind: "live", theme: "dark", title: "Kinetic lines", note: "The mark's five lines as a field that bends.", media: "exp-kinetic-lines", fallback: "play-kinetic-lines" },
  { slug: "contour-rings", kind: "live", theme: "dark", title: "Contour rings", note: "Concentric rings pushed around by noise.", media: "exp-contour-rings", fallback: "play-rings" },
  // the Clip backdrop is the studio's cream; the mark, stripes and gradient sit on the black
  { slug: "liquid-glass", kind: "live", theme: "light", themes: { backdrop: { Clip: "light", Mark: "dark", Stripes: "dark", Gradient: "dark" } }, title: "Liquid glass", note: "A lens of refracting glass over the work.", media: "exp-liquid-glass", fallback: "play-liquid-glass" },
  { slug: "lava-field", kind: "live", theme: "dark", ground: "colour.deep", title: "Lava field", note: "A slow field of molten colour.", media: "exp-lava-field", fallback: "play-plantfield" },
  { slug: "terrain", kind: "live", theme: "dark", title: "Terrain", note: "Contour lines over a landscape that never ends.", media: "exp-terrain", fallback: "play-terrain" },
  { slug: "cloud-type", kind: "live", theme: "dark", ground: ["colour.skyTop", "colour.skyBottom"], title: "Cloud type", note: "Letters made of weather.", media: "exp-cloud-type", fallback: "play-cloud-logo" },
  { slug: "stipple", kind: "live", theme: "dark", title: "Stipple", note: "Moving pictures, redrawn in dots.", media: "exp-stipple", fallback: "cambium-stipple" },
  { slug: "chrome-laurel", kind: "live", theme: "dark", title: "Chrome laurel", note: "The award laurel, in mirror chrome.", media: "exp-chrome-laurel", fallback: "play-mademarket" },
  { slug: "bloom-orb", kind: "live", theme: "dark", title: "Bloom orb", note: "A soft light that breathes.", media: "exp-bloom-orb", fallback: "play-stack-chroma" },
  { slug: "ease-grid", kind: "live", theme: "dark", title: "Ease grid", note: "Timing curves, felt instead of graphed.", media: "exp-ease-grid", fallback: "play-fade-ease" },

  { slug: "cloud-logo", kind: "clip", title: "Cloud logo generator", note: "A logo, grown from weather.", media: "play-cloud-gen", from: "Rylo" },
  { slug: "stacked-cards", kind: "clip", title: "Stacked cards", note: "A wallet of cards, fanned in 3D.", media: "play-cube", from: "Superlink" },
  { slug: "eclipse", kind: "clip", title: "Eclipse", note: "Colour slipping out from behind a disc.", media: "play-stack-chroma", from: "Motion study" },
  { slug: "drop-shadow", kind: "clip", title: "Drop shadow", note: "A design panel, live on the page.", media: "play-shadow", from: "HeyGen" },
  { slug: "particle-type", kind: "clip", title: "Particle bloom", note: "A headline held in a cloud of points.", media: "play-sword", from: "Motion study" },
  { slug: "coffee-bar", kind: "clip", title: "Order counter", note: "An isometric bar that takes your order.", media: "play-dripos", from: "Dripos" },
  { slug: "goat", kind: "clip", title: "Goat ears", note: "Ears that flop when you scroll.", media: "play-goat", from: "Happy Goat" },
  { slug: "fan-cursor", kind: "clip", title: "Fan cursor", note: "A fan of points that follows you.", media: "play-cursor", from: "Motion study" },
  { slug: "blocks", kind: "clip", title: "Building blocks", note: "Steps that assemble as you read.", media: "play-jiko", from: "Jiko" },
  { slug: "breakout", kind: "clip", title: "Breakout toast", note: "An invitation that glows its way in.", media: "play-toast", from: "Sidebar" },
  { slug: "timer", kind: "clip", title: "Timer glow", note: "Time, lit from the edge.", media: "play-timer", from: "Sidebar" },
  { slug: "smart-animate", kind: "clip", title: "Smart animate", note: "A heart that refuses to sit still.", media: "play-smart-animate", from: "Figma prototype" },
  { slug: "coins", kind: "clip", title: "59FIFTY coins", note: "Collectable coins, spun in 3D.", media: "new-era-coins", from: "New Era" },
  { slug: "kinetic-shader", kind: "clip", title: "Kinetic shader", note: "The wordmark, through glass.", media: "play-kinetic-shader", from: "Kinetic" },
  { slug: "fluid-mark", kind: "clip", title: "Fluid mark", note: "A mark poured, not drawn.", media: "play-fluidstack", from: "Fluidstack" },
  { slug: "fade-ease", kind: "clip", title: "Fade and ease", note: "How a thing arrives.", media: "play-fade-ease", from: "Motion study" },
];
