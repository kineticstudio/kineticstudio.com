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
  // Kinetic's two faces. GT Walsheim is still the TRIAL cut: a real licence
  // is needed before this site goes public on kineticstudio.com.
  fonts: [
    {
      name: "GT Walsheim",
      cssVariable: "--font-gt-walsheim",
      provider: fontProviders.local(),
      options: {
        variants: [
          { weight: 400, style: "normal", src: ["./src/assets/fonts/GT-Walsheim-Regular-Trial.woff2"] },
          { weight: 500, style: "normal", src: ["./src/assets/fonts/GT-Walsheim-Medium-Trial.woff2"] },
          { weight: 700, style: "normal", src: ["./src/assets/fonts/GT-Walsheim-Bold-Trial.woff2"] },
        ],
      },
    },
    {
      name: "Monument Extended",
      cssVariable: "--font-monument",
      provider: fontProviders.local(),
      options: {
        variants: [
          { weight: "100 900", style: "normal", src: ["./src/assets/fonts/PPMonumentExtended-Variable.ttf"] },
        ],
      },
    },
  ],
  vite: { build: { cssTarget: "safari15.4" } },
});
