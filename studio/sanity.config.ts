import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./schemaTypes";

export default defineConfig({
	name: "kineticstudio",
	title: "Kinetic Studio",
	projectId: process.env.PUBLIC_SANITY_PROJECT_ID || "whpuamna",
	dataset: process.env.PUBLIC_SANITY_DATASET || "production",
	plugins: [
		structureTool({
			structure: (S) =>
				S.list()
					.title("Content")
					.items([
						S.listItem()
							.title("Site settings")
							.id("siteSettings")
							.child(
								S.document().schemaType("siteSettings").documentId("siteSettings"),
							),
						S.divider(),
						S.documentTypeListItem("project").title("Projects"),
					]),
		}),
		visionTool(),
	],
	schema: { types: schemaTypes },
});
