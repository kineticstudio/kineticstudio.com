/**
 * One-time import of the hard-coded site content into Sanity.
 *
 *   node --env-file=.env scripts/seed-sanity.ts
 *
 * Safe to re-run: documents use deterministic IDs and Sanity de-duplicates
 * uploaded assets by checksum, so nothing piles up.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@sanity/client";

import { projects } from "../src/data/projects.ts";
import { site, awards } from "../src/data/site.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const projectId = process.env.PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.PUBLIC_SANITY_DATASET ?? "production";
const token = process.env.SANITY_API_WRITE_TOKEN;

if (!projectId || !token) {
	console.error(
		"Missing config. Set PUBLIC_SANITY_PROJECT_ID and SANITY_API_WRITE_TOKEN in .env",
	);
	process.exit(1);
}

const client = createClient({
	projectId,
	dataset,
	token,
	apiVersion: "2026-01-01",
	useCdn: false,
});

const slugify = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

async function uploadFromPublic(
	kind: "file" | "image",
	publicPath: string,
): Promise<string | null> {
	const abs = join(root, "public", publicPath.replace(/^\//, ""));
	try {
		await stat(abs);
	} catch {
		console.warn(`  ! missing ${publicPath} — skipping`);
		return null;
	}
	const asset = await client.assets.upload(kind, createReadStream(abs), {
		filename: publicPath.split("/").pop(),
	});
	return asset._id;
}

async function seedProjects() {
	console.log(`\nImporting ${projects.length} projects…`);
	for (const [index, project] of projects.entries()) {
		const _id = `project-${slugify(project.title)}`;
		let videoAssetId: string | null = null;

		if (project.video) {
			videoAssetId = await uploadFromPublic("file", project.video);
		}

		await client.createOrReplace({
			_id,
			_type: "project",
			title: project.title,
			services: project.services,
			url: project.url,
			order: index + 1,
			...(videoAssetId
				? { video: { _type: "file", asset: { _type: "reference", _ref: videoAssetId } } }
				: {}),
		});

		console.log(
			`  ${String(index + 1).padStart(2)}. ${project.title}${project.video ? " (+ video)" : ""}`,
		);
	}
}

async function seedSettings() {
	console.log("\nImporting site settings…");
	const awardEntries = [];
	for (const award of awards) {
		const logoAssetId = await uploadFromPublic("image", award.logo);
		awardEntries.push({
			_type: "award",
			_key: slugify(award.label),
			label: award.label,
			logoAlt: award.logoAlt,
			...(award.url ? { url: award.url } : {}),
			...(logoAssetId
				? { logo: { _type: "image", asset: { _type: "reference", _ref: logoAssetId } } }
				: {}),
		});
	}

	await client.createOrReplace({
		_id: "siteSettings",
		_type: "siteSettings",
		heroHeading: site.heroHeading,
		description: site.description,
		contactEmail: site.contactEmail,
		awards: awardEntries,
	});
	console.log(`  ${awardEntries.length} awards`);
}

await seedProjects();
await seedSettings();
console.log("\nDone. Open the Studio at /admin to see the content.\n");
