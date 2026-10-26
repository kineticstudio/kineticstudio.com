/* Every loop and still the site shows, and where it is cut from.

   from   capture    a live experiment, recorded by scripts/capture-experiments.mjs
          portfolio  the swimlanes design's finished loops (kinetic-creative-studio
                     clients/kinetic/designs/01-Personal/portfolio-src/media), copied as is
          twitter    iCloud 💻 Kinetic/twitter, Hunter's recordings
          mirror     the Webflow mirror's portfolio hover videos and stills
                     (kineticstudio-webflow-mirror/assets)
   ss/dur where the loop starts and how long it runs, in seconds
   loop   'bounce' plays forward then back, for cuts where type or UI moves
   crop   [x, y, w, h] as fractions of the source frame
   still  true: a poster only, no video

   public/media/play/ holds plain copies that experiments read as their
   picture: glass-source.mp4 is rime-circles (Liquid glass), stipple-source.mp4
   is play-kinetic-shader (Stipple). Copy a different loop over either to
   change it.

   `node scripts/build-media.mjs [id ...]` writes public/media/<id>.mp4 and
   .jpg, and src/data/media.json (size and sampled ground of each). */

export const MEDIA = [
  // ------------------------------------------------ case studies and covers
  { id: "rime", from: "twitter", file: "rime-prefooter.mp4", ss: 1, dur: 5 },
  { id: "rime-voices", from: "twitter", file: "rime2.mp4", ss: 4, dur: 4.5, loop: "bounce" },
  { id: "rime-circles", from: "twitter", file: "snake-rime.mov", ss: 9, dur: 5 },
  { id: "rime-every", from: "twitter", file: "rime2.mp4", ss: 29, dur: 4, loop: "bounce" },

  { id: "dawn", from: "portfolio", file: "dawn" },
  { id: "dawn-home", from: "twitter", file: "dawn-home.mp4", ss: 2, dur: 4, loop: "bounce" },
  { id: "dawn-how", from: "twitter", file: "dawn-how-it-works.mp4", ss: 1.5, dur: 4.5, loop: "bounce" },
  { id: "dawn-clouds", from: "twitter", file: "dawn-clouds.mp4", ss: 4, dur: 5 },

  { id: "claude", from: "portfolio", file: "claude" },
  { id: "claude-home", from: "twitter", file: "claude.com-home.mp4", ss: 0.5, dur: 4, loop: "bounce" },
  { id: "claude-code", from: "twitter", file: "claude.com-code-mod.mp4", ss: 0.5, dur: 4, loop: "bounce" },
  { id: "claude-scroll", from: "mirror", file: "videos/claudecom-code-mod_smaller-transcode.mp4", ss: 4, dur: 5, loop: "bounce" },

  { id: "cambium", from: "portfolio", file: "cambium" },
  { id: "cambium-rings", from: "twitter", file: "growing-tree-cambium.mp4", ss: 1, dur: 5 },
  { id: "cambium-map", from: "twitter", file: "cambium-map.mp4", ss: 1, dur: 5 },
  { id: "cambium-stipple", from: "twitter", file: "cambum-stipple.mp4", ss: 8, dur: 4, loop: "bounce" },
  { id: "cambium-wordmark", from: "twitter", file: "cambum-start.mp4", ss: 13, dur: 4, loop: "bounce" },

  { id: "counsel", from: "portfolio", file: "counsel" },
  { id: "counsel-wave", from: "twitter", file: "counsel-hero-2.mp4", ss: 2, dur: 5 },
  { id: "counsel-mobile", from: "twitter", file: "counsel-hero-home.mp4", ss: 1, dur: 5 },

  { id: "wispr-flow", from: "portfolio", file: "wispr-flow" },
  // Hunter, Oct 24: three more on the homepage, from his own recordings
  { id: "claude-community", from: "twitter", file: "claude-community-globe.mp4", ss: 2, dur: 6 },
  { id: "superinterviews", from: "twitter", file: "superinterview-home.mp4", ss: 15.5, dur: 5, loop: "bounce" },
  { id: "rylo", from: "twitter", file: "rylo-home.mp4", ss: 0.5, dur: 5, loop: "bounce" },
  { id: "elio", from: "twitter", file: "elio-hero.mp4", ss: 0.8, dur: 5, loop: "bounce" },
  { id: "dorm-room-fund", from: "twitter", file: "dorm-room-fund-home.mp4", ss: 0.6, dur: 6, loop: "bounce" },
  // the client logos' hover loops (Hunter, Oct 24), for clients with no project of their own here
  { id: "client-buck-mason", from: "twitter", file: "buck.mov", ss: 0.5, dur: 5, loop: "bounce" },
  { id: "client-superhuman", from: "twitter", file: "superhuman-login.mp4", ss: 2, dur: 5 },
  // moses round two, Everything sheds (the Creative Studio design, recorded from the Studio on Oct 24)
  { id: "moses", from: "capture", file: "moses-home.mp4", ss: 4.8, dur: 6, loop: "bounce" },
  { id: "flow-hero", from: "mirror", file: "videos/flow2-transcode.mp4", ss: 0.5, dur: 5 },
  { id: "flow-notes", from: "mirror", file: "videos/flow3-transcode.mp4", ss: 1, dur: 5, loop: "bounce" },
  { id: "wispr-flow-brand", from: "portfolio", file: "wispr-flow-brand" },

  { id: "venus", from: "portfolio", file: "venus" },
  { id: "venus-site", from: "mirror", file: "videos/venus2-port_smaller-transcode.mp4", ss: 0.5, dur: 5 },
  { id: "venus-slant", from: "twitter", file: "venus-slant.mp4", ss: 1, dur: 5 },

  { id: "epirus", from: "portfolio", file: "epirus" },
  { id: "epirus-site", from: "mirror", file: "videos/epirus-transcode.mp4", ss: 0.3, dur: 5 },
  { id: "epirus-film", from: "twitter", file: "epirus-launch-4k-v32.mp4", ss: 2, dur: 5 },

  { id: "superorganism", from: "portfolio", file: "superorganism" },
  { id: "superorganism-site", from: "mirror", file: "videos/Superorganism-Portfolio-transcode.mp4", ss: 1, dur: 5 },
  { id: "superorganism-how", from: "twitter", file: "superorg-how-it-works.mp4", ss: 2, dur: 4.5, loop: "bounce" },

  { id: "new-era", from: "portfolio", file: "new-era" },
  { id: "new-era-hats", from: "twitter", file: "rotating-hats.mp4", ss: 1, dur: 5 },
  { id: "new-era-coins", from: "portfolio", file: "coins" },

  // -------------------------------------------------------- the rest of the work
  { id: "heygen", from: "portfolio", file: "heygen" },
  { id: "ethos", from: "mirror", file: "videos/ethos1-transcode.mp4", ss: 1, dur: 5 },
  { id: "ethos-brand", from: "portfolio", file: "ethos" },
  { id: "happy-droid", from: "mirror", file: "videos/happy-droid-transcode.mp4", ss: 1, dur: 5 },
  { id: "metamag", from: "mirror", file: "videos/metamag-port_smaller_mp4.mp4", ss: 1, dur: 5 },
  { id: "distributional", from: "mirror", file: "videos/distributional2-transcode.mp4", ss: 0.5, dur: 5 },
  { id: "way", from: "mirror", file: "videos/way-transcode.mp4", ss: 1, dur: 5 },
  { id: "range", from: "mirror", file: "videos/range-1-transcode.mp4", ss: 0.5, dur: 5 },
  { id: "ingredient", from: "mirror", file: "videos/ingredient-transcode.mp4", ss: 0.5, dur: 5 },
  { id: "roam", from: "mirror", file: "videos/roam-transcode.mp4", ss: 0.3, dur: 5 },
  { id: "para", from: "mirror", file: "videos/para-portfolio-transcode.mp4", ss: 0.5, dur: 5 },
  { id: "august-health", from: "mirror", file: "videos/august-health-transcode.mp4", ss: 0.3, dur: 5 },
  { id: "superlink", from: "mirror", file: "videos/superlink-portfolio-transcode.mp4", ss: 0.3, dur: 5 },
  { id: "konvoy", from: "mirror", file: "videos/konvoy-transcode.mp4", ss: 0.3, dur: 5 },
  { id: "reshape", from: "mirror", file: "videos/reshape-transcode.mp4", ss: 0.5, dur: 5 },
  { id: "tydo", from: "portfolio", file: "tydo" },
  { id: "baseten", from: "mirror", file: "images/baseten-dribbble-1.jpg", still: true },
  { id: "lemon-squeezy", from: "mirror", file: "images/lemonsqueezy.jpg", still: true },
  { id: "carter", from: "mirror", file: "images/carter-2.jpg", still: true },
  { id: "redesign-health", from: "mirror", file: "images/rh-2-p-1080.jpeg", still: true },
  { id: "cird", from: "mirror", file: "images/cird.jpg", still: true },

  { id: "kinetic-studio", from: "portfolio", file: "kinetic-studio" },

  // ------------------------------------------------- playground moments (clips)
  { id: "play-rings", from: "portfolio", file: "rings" },
  { id: "play-kinetic-lines", from: "portfolio", file: "kinetic-lines" },
  { id: "play-fade-ease", from: "portfolio", file: "fade-ease" },
  { id: "play-liquid-glass", from: "portfolio", file: "liquid-glass" },
  { id: "play-plantfield", from: "portfolio", file: "plantfield" },
  { id: "play-smart-animate", from: "portfolio", file: "smart-animate" },
  { id: "play-cloud-logo", from: "portfolio", file: "new-era-cloud" },
  { id: "play-terrain", from: "portfolio", file: "terrain" },
  { id: "play-fluidstack", from: "portfolio", file: "fluidstack" },
  { id: "play-mademarket", from: "portfolio", file: "mademarket" },
  { id: "play-kinetic-shader", from: "portfolio", file: "kinetic" },
  { id: "play-cube", from: "twitter", file: "superlink-cube.mp4", ss: 0.5, dur: 4 },
  { id: "play-jiko", from: "twitter", file: "jiko-3d.mp4", ss: 0.5, dur: 4 },
  { id: "play-cursor", from: "twitter", file: "parachute-cursor.mp4", ss: 0.3, dur: 4, loop: "bounce" },
  { id: "play-goat", from: "twitter", file: "happy-goat.mp4", ss: 0.5, dur: 4 },
  { id: "play-toast", from: "twitter", file: "toast.mp4", ss: 0.3, dur: 3.5, loop: "bounce" },
  { id: "play-cloud-gen", from: "twitter", file: "cloud-gen.mp4", ss: 0.5, dur: 4, loop: "bounce" },
  { id: "play-dripos", from: "twitter", file: "dripos-mode-3d.mp4", ss: 2, dur: 4 },
  { id: "play-sword", from: "twitter", file: "glode-sword.mp4", ss: 0.5, dur: 4 },
  { id: "play-stack-chroma", from: "twitter", file: "stack-chroma.mov", ss: 0.5, dur: 4 },
  { id: "play-shadow", from: "twitter", file: "shadow.mp4", ss: 0.5, dur: 4 },
  { id: "play-timer", from: "twitter", file: "timer.mp4", ss: 0.3, dur: 3.5, loop: "bounce" },

  // ------------------------------------- live experiments, recorded from /lab
  { id: "exp-kinetic-lines", from: "capture", file: "kinetic-lines.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-contour-rings", from: "capture", file: "contour-rings.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-liquid-glass", from: "capture", file: "liquid-glass.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-lava-field", from: "capture", file: "lava-field.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-terrain", from: "capture", file: "terrain.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-cloud-type", from: "capture", file: "cloud-type.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-stipple", from: "capture", file: "stipple.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-chrome-laurel", from: "capture", file: "chrome-laurel.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-bloom-orb", from: "capture", file: "bloom-orb.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-thread-button", from: "capture", file: "thread-button.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-thread-weave", from: "capture", file: "thread-weave.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-orb-tabs", from: "capture", file: "orb-tabs.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-object-stipple", from: "capture", file: "object-stipple.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-supply-network", from: "capture", file: "supply-network.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-topo-3d", from: "capture", file: "topo-3d.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-island", from: "capture", file: "island.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-agent-orbs", from: "capture", file: "agent-orbs.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-brushstrokes", from: "capture", file: "brushstrokes.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-cosmos-bloom", from: "capture", file: "cosmos-bloom.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-cloud-shader", from: "capture", file: "cloud-shader.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-hatch-shadow", from: "capture", file: "hatch-shadow.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-ink-world", from: "capture", file: "ink-world.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-glowing-arches", from: "capture", file: "glowing-arches.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-hero-stars", from: "capture", file: "hero-stars.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-glyph-morph", from: "capture", file: "glyph-morph.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-hero-ribbon", from: "capture", file: "hero-ribbon.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-prism-mark", from: "capture", file: "prism-mark.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-cloud-logo-live", from: "capture", file: "cloud-logo-live.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-extra-trace", from: "capture", file: "extra-trace.mp4", ss: 0.2, dur: 4.5 },
  { id: "exp-ease-grid", from: "capture", file: "ease-grid.mp4", ss: 0.2, dur: 4.5 },
];
