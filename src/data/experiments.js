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
     `from` is whose work it came from, for us only: the page never names the client or shows
     their logo (Hunter, Oct 25: "for any of these, we remove logos and names of what client it
     was for"). */
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
  { slug: "cloud-logo-live", kind: "live", ground: ["colour.skyTop", "colour.skyBottom"], theme: "light", title: "Cloud generator", note: "Type a word or drop in a logo, and the sky grows it in cloud.", media: "exp-cloud-logo-live", from: "Rylo" },
  { slug: "extra-trace", kind: "live", theme: "dark", title: "Rise", note: "A line climbs a field of dots and lifts the ones it picks.", media: "exp-extra-trace", from: "Trace" },
  // the circles from under the liquid glass, on their own (Hunter, Oct 25: "find the rime one without the liquid glass thing")
  { slug: "circle-snake", kind: "live", theme: "light", ground: "colour.paper", title: "Circle snake", note: "Coloured circles multiplied into paper, wandering, and following your cursor.", media: "exp-circle-snake", from: "Rime" },
  // Oct 29, ticked in the Studio's Prototype picker (.studio/playground-picks.json); titles and notes set as each is ported
  { slug: "liquid-eyes", kind: "live", theme: "dark", themes: { "scene.backdrop": { Watercolor: "dark", Paper: "light" } }, title: "Liquid eyes", note: "A glass character with eyes cut through it, bobbing over a wallpaper and watching your cursor.", media: "exp-liquid-eyes", from: "Demi" },
  { slug: "bloom-cone", kind: "live", theme: "light", ground: "colour.ground", title: "Bloom cone", note: "Nested ovals radiating from a high apex, leaning toward your cursor.", media: "exp-bloom-cone", from: "Demi" },
  { slug: "hero-bloom", kind: "live", theme: "dark", ground: "colour.ground", title: "Bloom lift", note: "A dome of coloured rings rises off the horizon and lands as a pill of light.", media: "exp-hero-bloom", from: "Demi" },
  { slug: "bloom-rings", kind: "live", theme: "dark", ground: "colour.ground", title: "Bloom rings", note: "Hot concentric rings radiating outward, their core pulled after your cursor.", media: "exp-bloom-rings", from: "Demi" },
  { slug: "orbs-bento", kind: "live", theme: "light", ground: "colour.ground", title: "Gradient bento", note: "Three grainy mesh gradients drifting in a bento of rounded cards.", media: "exp-orbs-bento", from: "Planned" },
  { slug: "scene-inset", kind: "live", theme: "light", ground: "colour.ground", title: "Scene inset", note: "Four tiny torn-off worlds on a turntable, read by a machine-vision pass that glitches on every turn.", media: "exp-scene-inset", from: "Natural Capital" },
  { slug: "silhouette-chrome", kind: "live", theme: "light", ground: "colour.ground", title: "Liquid chrome", note: "Ten objects in raymarched liquid chrome, turning in a studio and melting into one another.", media: "exp-silhouette-chrome", from: "Natural Capital" },
  { slug: "ascii-world", kind: "live", theme: "dark", ground: "colour.ground", title: "ASCII world", note: "A liquid poured into footage, and through it the same world read character by character.", media: "exp-ascii-world", from: "Natural Capital" },
  { slug: "thinking-net", kind: "live", theme: "dark", title: "Thinking net", note: "A technical network that tracks footage as it plays, binding nodes, tiles and lock-ons to what it finds.", media: "exp-thinking-net", from: "Natural Capital" },
  { slug: "lab-report", kind: "live", theme: "dark", ground: "stage.ground", title: "Clear aligner", note: "A clear aligner on black acrylic, lit by softboxes, its print lines catching the light as it turns.", media: "exp-lab-report", from: "moses" },
  { slug: "sticker-wall", kind: "live", theme: "dark", ground: "colour.ground", title: "Sticker wall", note: "Foil stickers curl down onto the wall one by one and peel back off when it fills; click to stick your own.", media: "exp-sticker-wall", from: "59FIFTY" },
  { slug: "kern", kind: "live", theme: "dark", ground: "colour.ground", title: "Kern", note: "Sand pours between the letters, then the word kerns itself and the surplus grains sink into pink heaps below.", media: "exp-kern", from: "Kern.me" },
  { slug: "parachute", kind: "live", theme: "dark", ground: "colour.ground", title: "Parachute", note: "A canopy of nodes tethered to a drifting puck, which gathers them in and floods the screen with colour.", media: "exp-parachute", from: "Parachute" },
  { slug: "black-hole", kind: "live", theme: "dark", ground: "colour.ground", title: "Black hole", note: "Thousands of grains spiral inward and vanish into a ring, pushed aside by your cursor.", media: "exp-black-hole", from: "moses" },
  { slug: "lava-glow", kind: "live", theme: "light", ground: "colour.ground", title: "Lava glow", note: "A printed band of lava, its pools sagging and drifting along it, warmed by your cursor.", media: "exp-lava-glow", from: "Sidebar Talent" },
  { slug: "neon-flower", kind: "live", theme: "dark", ground: "colour.ground", title: "Neon flower", note: "A violet bloom drawn entirely in a shader, breathing and spinning under a long-exposure blur; click to ripple it.", media: "exp-neon-flower", from: "Sidebar Talent" },
  { slug: "diamond-mark", kind: "live", theme: "dark", ground: "colour.ground", title: "Diamond mark", note: "A diamond of cream bars whose two halves step past each other and lock back into register.", media: "exp-diamond-mark", from: "Metamag" },
  { slug: "sine-mark", kind: "live", theme: "dark", ground: "colour.ground", title: "Sine wave mark", note: "Any word you type, redrawn in stacked bars with block caps on its edges, swaying on a travelling sine wave.", media: "exp-sine-mark", from: "Metamag" },
  { slug: "coin", kind: "live", theme: "dark", ground: "colour.ground", title: "Coin", note: "A collector coin in polished metal, turning slowly under studio light.", media: "exp-coin", from: "New Era" },
  { slug: "spinning-cube", kind: "live", theme: "dark", ground: "colour.ground", title: "Dot cube", note: "A cube made only of dots, turning on a turntable, as a lattice, a surface or just its edges.", media: "exp-spinning-cube", from: "Trace" },
  { slug: "thread-line", kind: "live", theme: "light", ground: "colour.ground", title: "Thread line", note: "A coloured thread drifting on, its stitches stretching open into small cards.", media: "exp-thread-line", from: "Counsel" },
  { slug: "depth-engraving", kind: "live", theme: "light", title: "Depth engraving", note: "An engraving lifted into relief from its own depth map, drifting, following your cursor and flying in where you click.", media: "exp-depth-engraving", from: "Exe" },
  { slug: "wire-assembly", kind: "live", theme: "dark", ground: "colour.ground", title: "Wire assembly", note: "A wireframe truck turning while six parts fly in along dashed leads and settle on their mounts.", media: "exp-wire-assembly", from: "Overland" },
  { slug: "floating-islands", kind: "live", theme: "dark", ground: "colour.ground", title: "Islands", note: "Three islands of banded terrain, each crossed by a vehicle scanning it with lidar, the camera gliding down into the middle one.", media: "exp-floating-islands", from: "Overland" },
  { slug: "from-the-inside", kind: "live", theme: "light", ground: "colour.ground", title: "From the inside", note: "Dots rise into an arch, swell, and grow into one moving field of colour.", media: "exp-from-the-inside", from: "Arch" },
  { slug: "ab-test", kind: "live", theme: "dark", ground: "colour.ground", title: "A/B test", note: "A test card works through its variants, calls a winner and fires it out along the line.", media: "exp-ab-test", from: "Owner" },
  { slug: "combo-card", kind: "live", theme: "dark", ground: "colour.ground", title: "Combo card", note: "Two tiles that part, tilt and overlap into a second colour, shuffling through colour pairs.", media: "exp-combo-card", from: "Ramble" },
  { slug: "soft-hero", kind: "live", theme: "light", ground: "colour.ground", title: "Concrete pyramid", note: "A concrete pyramid that turns, slides and is built from the top, one red line at a time.", media: "exp-soft-hero", from: "Saphenia" },
  { slug: "membrane", kind: "live", theme: "light", ground: "colour.ground", title: "Membrane", note: "A head turning behind a stretched sheet that takes its shape, or a bust carved in stone.", media: "exp-membrane", from: "Kinetic" },

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

  // clips that showed a client's logo, product or copy in frame are out (Oct 25)
  { slug: "stacked-cards", kind: "clip", title: "Stacked cards", note: "A wallet of cards, fanned in 3D.", media: "play-cube", from: "Superlink" },
  { slug: "eclipse", kind: "clip", title: "Eclipse", note: "Colour slipping out from behind a disc.", media: "play-stack-chroma", from: "Motion study" },
  { slug: "coffee-bar", kind: "clip", title: "Order counter", note: "An isometric bar that takes your order.", media: "play-dripos", from: "Dripos" },
  { slug: "fan-cursor", kind: "clip", title: "Fan cursor", note: "A fan of points that follows you.", media: "play-cursor", from: "Motion study" },
  { slug: "blocks", kind: "clip", title: "Building blocks", note: "Steps that assemble as you read.", media: "play-jiko", from: "Jiko" },
  { slug: "timer", kind: "clip", title: "Timer glow", note: "Time, lit from the edge.", media: "play-timer", from: "Sidebar" },
  { slug: "smart-animate", kind: "clip", title: "Smart animate", note: "A heart that refuses to sit still.", media: "play-smart-animate", from: "Figma prototype" },
  { slug: "kinetic-shader", kind: "clip", title: "Kinetic shader", note: "The wordmark, through glass.", media: "play-kinetic-shader", from: "Kinetic" },
  { slug: "fade-ease", kind: "clip", title: "Fade and ease", note: "How a thing arrives.", media: "play-fade-ease", from: "Motion study" },
];
