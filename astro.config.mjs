// @ts-check
import { defineConfig } from "astro/config";

// The Sanity Studio runs as its own app (npm run studio), not embedded here.
// That keeps React entirely out of the site build — the published pages ship
// only the small hover-video script.
export default defineConfig({
	site: "https://www.kineticstudio.com",
	server: { port: 8758 },
});
