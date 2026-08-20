// @ts-check
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import react from "@astrojs/react";
import sanity from "@sanity/astro";

const { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET } = loadEnv(
	process.env.NODE_ENV || "development",
	process.cwd(),
	"",
);

// The Studio only mounts once a Sanity project exists, so the site builds
// and runs from src/data/*.ts before any of that is set up.
const sanityIntegrations = PUBLIC_SANITY_PROJECT_ID
	? [
			sanity({
				projectId: PUBLIC_SANITY_PROJECT_ID,
				dataset: PUBLIC_SANITY_DATASET || "production",
				useCdn: true,
				studioBasePath: "/admin",
			}),
			react(),
		]
	: [];

export default defineConfig({
	site: "https://www.kineticstudio.com",
	server: { port: 8758 },
	integrations: [...sanityIntegrations],
});
