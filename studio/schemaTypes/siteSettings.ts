import { defineArrayMember, defineField, defineType } from "sanity";

export const siteSettings = defineType({
	name: "siteSettings",
	title: "Site settings",
	type: "document",
	fields: [
		defineField({
			name: "heroHeading",
			title: "Hero heading",
			type: "string",
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "description",
			title: "Meta description",
			type: "text",
			rows: 2,
			description: "Used by Google and link previews.",
			validation: (rule) => rule.required().max(200),
		}),
		defineField({
			name: "contactEmail",
			title: "Contact email",
			type: "string",
			validation: (rule) => rule.required().email(),
		}),
		defineField({
			name: "awards",
			title: "Awards row",
			type: "array",
			of: [
				defineArrayMember({
					type: "object",
					name: "award",
					fields: [
						defineField({
							name: "label",
							title: "Label",
							type: "string",
							validation: (rule) => rule.required(),
						}),
						defineField({
							name: "logo",
							title: "Logo",
							type: "image",
							validation: (rule) => rule.required(),
						}),
						defineField({ name: "logoAlt", title: "Logo alt text", type: "string" }),
						defineField({ name: "url", title: "Link (optional)", type: "url" }),
					],
					preview: { select: { title: "label", media: "logo" } },
				}),
			],
		}),
	],
	preview: {
		prepare: () => ({ title: "Site settings" }),
	},
});
