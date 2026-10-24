/* The Playground. Two kinds of piece share the grid:

   live   code in src/experiments/<slug>.js, opened on /playground/<slug> with
          its Params panel
   clip   a moment from the Twitter folder (iCloud 💻 Kinetic/twitter), cut
          to public/media/<media>.mp4 by scripts/build-media.mjs; it opens
          in place

   `media` is the loop the grid shows before a piece is opened. For a live
   piece it is a capture of the experiment itself (public/media/exp-<slug>,
   made by scripts/capture-experiments.mjs), falling back to `fallback`. */

export const EXPERIMENTS = [
  { slug: "kinetic-lines", kind: "live", title: "Kinetic lines", note: "The mark's five lines as a field that bends.", media: "exp-kinetic-lines", fallback: "play-kinetic-lines" },
  { slug: "contour-rings", kind: "live", title: "Contour rings", note: "Concentric rings pushed around by noise.", media: "exp-contour-rings", fallback: "play-rings" },
  { slug: "liquid-glass", kind: "live", title: "Liquid glass", note: "A lens of refracting glass over the work.", media: "exp-liquid-glass", fallback: "play-liquid-glass" },
  { slug: "lava-field", kind: "live", title: "Lava field", note: "A slow field of molten colour.", media: "exp-lava-field", fallback: "play-plantfield" },
  { slug: "terrain", kind: "live", title: "Terrain", note: "Contour lines over a landscape that never ends.", media: "exp-terrain", fallback: "play-terrain" },
  { slug: "cloud-type", kind: "live", title: "Cloud type", note: "Letters made of weather.", media: "exp-cloud-type", fallback: "play-cloud-logo" },
  { slug: "stipple", kind: "live", title: "Stipple", note: "Moving pictures, redrawn in dots.", media: "exp-stipple", fallback: "cambium-stipple" },
  { slug: "chrome-laurel", kind: "live", title: "Chrome laurel", note: "The award laurel, in polished metal.", media: "exp-chrome-laurel", fallback: "play-mademarket" },
  { slug: "bloom-orb", kind: "live", title: "Bloom orb", note: "A soft light that breathes.", media: "exp-bloom-orb", fallback: "play-stack-chroma" },
  { slug: "ease-grid", kind: "live", title: "Ease grid", note: "Timing curves, felt instead of graphed.", media: "exp-ease-grid", fallback: "play-fade-ease" },

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
