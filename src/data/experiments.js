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
  /* Oct 25: the Playground leans on the client work (Hunter: "I want it to look all like fun
     client work, like the Counsel Studio button hover effect"), each piece ported from its
     prototype in the Creative Studio (or the older AI Fun folder) onto the standard Params.
     `from` is whose work it came from. Their themes are set once each piece is built. */
  { slug: "thread-button", kind: "live", theme: "light", title: "Thread button", note: "Coloured blocks sweep through the button and settle as its new colour.", media: "exp-thread-button", from: "Counsel" },
  { slug: "thread-weave", kind: "live", theme: "dark", title: "Thread weave", note: "A woven thread whose stitches stretch open into cards.", media: "exp-thread-weave", from: "Counsel" },
  { slug: "orb-tabs", kind: "live", theme: "light", title: "Orb tabs", note: "A glass lens that travels between coloured tabs.", media: "exp-orb-tabs", from: "Demi" },
  { slug: "object-stipple", kind: "live", theme: "light", title: "Object stipple", note: "Turning objects drawn in ink stipple on warm paper.", media: "exp-object-stipple", from: "Cambium" },
  { slug: "supply-network", kind: "live", theme: "dark", title: "Supply network", note: "A national supply map in dots, its hubs fanning out to sawmills and programs.", media: "exp-supply-network", from: "Cambium" },
  { slug: "topo-3d", kind: "live", theme: "dark", title: "Topography", note: "Banded terrain lifted into 3D, crossed by a vehicle scanning it with lidar.", media: "exp-topo-3d", from: "Overland" },
  { slug: "island", kind: "live", theme: "dark", title: "Island", note: "Three hardware islands land in turn, then defend against two drone swarms.", media: "exp-island", from: "Epirus" },
  { slug: "agent-orbs", kind: "live", theme: "light", title: "Agent orbs", note: "Five agent orbs as glass marbles, thinking.", media: "exp-agent-orbs", from: "Planned" },
  { slug: "brushstrokes", kind: "live", theme: "light", title: "Brushstrokes", note: "The brand book's paintstrokes, laid down stroke by stroke.", media: "exp-brushstrokes", from: "Planned" },
  { slug: "cosmos-bloom", kind: "live", ground: ["colour.skyTop", "colour.skyBottom"], theme: "dark", title: "Cosmos bloom", note: "A single bloom whose rings open from the middle out.", media: "exp-cosmos-bloom", from: "Sidebar Talent" },
  { slug: "cloud-shader", kind: "live", theme: "light", title: "Cloud shader", note: "A fog deck rolling under the bridge at golden hour.", media: "exp-cloud-shader", from: "The Academy" },
  { slug: "hatch-shadow", kind: "live", theme: "light", title: "Hatch shadow", note: "Drop shadows drawn as grain, cast by a lamp.", media: "exp-hatch-shadow", from: "Exe" },
  { slug: "ink-world", kind: "live", theme: "light", title: "Ink world", note: "Three ink drawings rebuilt in depth and flown through, from the city to the reef.", media: "exp-ink-world", from: "Exe" },
  { slug: "glowing-arches", kind: "live", theme: "dark", title: "Glowing arches", note: "Broad arches of soft light, floating out of step.", media: "exp-glowing-arches", from: "Arch" },
  { slug: "hero-stars", kind: "live", theme: "light", title: "Hero stars", note: "Rings of a four-pointed star that open and lean toward the cursor.", media: "exp-hero-stars", from: "Owner" },
  { slug: "glyph-morph", kind: "live", ground: "colour.paper", theme: "light", title: "Glyph morph", note: "Notation characters on a mirrored grid, building one object after another.", media: "exp-glyph-morph", from: "Natural Capital" },
  { slug: "hero-ribbon", kind: "live", theme: "light", title: "Hero ribbon", note: "Rambling speech goes in, a clean tape of text comes out.", media: "exp-hero-ribbon", from: "Wispr Flow" },
  { slug: "prism-mark", kind: "live", theme: "dark", title: "Prism", note: "A packet of light split into colour by a turning glass prism.", media: "exp-prism-mark", from: "Rime" },
  { slug: "cloud-logo-live", kind: "live", ground: ["colour.skyTop", "colour.skyBottom"], theme: "light", title: "Cloud logo", note: "A logo grown from weather, live.", media: "exp-cloud-logo-live", from: "Rylo" },
  { slug: "extra-trace", kind: "live", theme: "dark", title: "Rise", note: "A line climbs a field of dots and lifts the ones it picks.", media: "exp-extra-trace", from: "Trace" },

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
