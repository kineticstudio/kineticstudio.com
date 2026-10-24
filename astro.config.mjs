// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE_URL } from "./src/consts.ts";
import { isNoindexRoute } from "./src/utils/seo.ts";

export default defineConfig({
  site: SITE_URL,
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
    {
      name: "Neue Montreal Mono",
      cssVariable: "--font-neue-montreal-mono",
      provider: fontProviders.local(),
      fallbacks: ["ui-monospace", "monospace"],
      options: {
        variants: [{ weight: 400, style: "normal", src: ["./src/assets/fonts/PPNeueMontrealMono-Book.woff2"] }],
      },
    },
  ],
  vite: { build: { cssTarget: "safari15.4" } },
});
