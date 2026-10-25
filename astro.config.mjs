// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE_URL } from "./src/consts.ts";
import { isNoindexRoute } from "./src/utils/seo.ts";

export default defineConfig({
  site: SITE_URL,
  // no Astro toolbar over the pages, in the Studio frame or on localhost
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      filter: (page) => !isNoindexRoute(new URL(page).pathname),
    }),
  ],
  // Kinetic's 2026 faces, the same as the proposals and briefs. Panell
  // Condensed is still the TRIAL cut: it needs a real licence before this
  // site goes public on kineticstudio.com.
  fonts: [
    {
      name: "Panell Condensed",
      cssVariable: "--font-panell",
      provider: fontProviders.local(),
      fallbacks: ["Arial Narrow", "sans-serif"],
      options: {
        variants: [{ weight: 500, style: "normal", src: ["./src/assets/fonts/PanellCondensed-TRIAL-Medium.woff2"] }],
      },
    },
    {
      name: "Neue Montreal",
      cssVariable: "--font-neue-montreal",
      provider: fontProviders.local(),
      options: {
        variants: [
          { weight: 400, style: "normal", src: ["./src/assets/fonts/PPNeueMontreal-Regular.woff2"] },
          { weight: 500, style: "normal", src: ["./src/assets/fonts/PPNeueMontreal-Medium.woff2"] },
        ],
      },
    },
  ],
  // The Creative Studio's build (npm run build:studio) is served from a
  // folder, where Vite's preload helper would ask for /_astro/ at the root.
  vite: {
    build: { cssTarget: "safari15.4", ...(process.env.KS_STUDIO_BUILD ? { modulePreload: false } : {}) },
    // bundled up front, so the first experiment to load three.js does not
    // make the dev server re-optimize mid-request
    optimizeDeps: {
      include: [
        "gsap",
        "gsap/ScrollTrigger",
        "three",
        "three/addons/controls/OrbitControls.js",
        "three/addons/environments/RoomEnvironment.js",
        "three/addons/utils/BufferGeometryUtils.js",
      ],
    },
  },
});
