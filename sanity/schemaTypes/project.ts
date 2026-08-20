import { defineField, defineType } from "sanity";

export const project = defineType({
	name: "project",
	title: "Project",
	type: "document",
	fields: [
		defineField({
			name: "title",
			title: "Client name",
			type: "string",
			description: 'Shown in caps under the video, e.g. "Wispr Flow".',
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "services",
			title: "Services",
			type: "string",
			description: 'The small grey line, e.g. "Web design, Webflow dev".',
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "url",
			title: "Live site URL",
			type: "url",
			validation: (rule) =>
				rule.required().uri({ scheme: ["http", "https"] }),
		}),
		defineField({
			name: "video",
			title: "Hover video",
			type: "file",
			description:
				"Silent MP4 that plays when someone hovers the card. Leave empty to show this project as a text-only credit.",
			options: { accept: "video/mp4" },
		}),
		defineField({
			name: "order",
			title: "Sort order",
			type: "number",
			description: "Lower numbers appear first.",
			validation: (rule) => rule.required().integer(),
		}),
	],
	orderings: [
		{
			title: "Display order",
			name: "displayOrder",
			by: [{ field: "order", direction: "asc" }],
		},
	],
	preview: {
		select: { title: "title", subtitle: "services", order: "order" },
		prepare: ({ title, subtitle, order }) => ({
			title: `${order}. ${title}`,
			subtitle,
		}),
	},
});
