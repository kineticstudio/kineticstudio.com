import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
	api: {
		projectId: process.env.PUBLIC_SANITY_PROJECT_ID || "whpuamna",
		dataset: process.env.PUBLIC_SANITY_DATASET || "production",
	},
	studioHost: "kineticstudio",
	deployment: {
		appId: "m4mrne247pccrzebzycje1gv",
	},
});
