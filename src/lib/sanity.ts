import { createClient, type SanityClient } from "@sanity/client";
import type { Project } from "../data/projects";
import { projects as localProjects } from "../data/projects";
import { site as localSite, awards as localAwards, type Award } from "../data/site";

const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID;
const dataset = import.meta.env.PUBLIC_SANITY_DATASET ?? "production";

/**
 * Null until a Sanity project is configured, which lets the site build and
 * run from src/data/*.ts alone. Every getter below falls back to that data.
 */
export const sanityClient: SanityClient | null = projectId
	? createClient({
			projectId,
			dataset,
			apiVersion: "2026-01-01",
			useCdn: true,
		})
	: null;

type SanityProject = {
	title: string;
	services: string;
	url: string;
	videoUrl: string | null;
};

const PROJECTS_QUERY = `*[_type == "project"] | order(order asc) {
	title,
	services,
	url,
	"videoUrl": video.asset->url
}`;

const SETTINGS_QUERY = `*[_type == "siteSettings"][0] {
	heroHeading,
	description,
	contactEmail,
	awards[] {
		label,
		logoAlt,
		url,
		"logo": logo.asset->url
	}
}`;

export async function getProjects(): Promise<Project[]> {
	if (!sanityClient) return localProjects;

	const docs = await sanityClient.fetch<SanityProject[]>(PROJECTS_QUERY);
	if (!docs?.length) return localProjects;

	return docs.map(({ title, services, url, videoUrl }) => ({
		title,
		services,
		url,
		...(videoUrl ? { video: videoUrl } : {}),
	}));
}

export async function getSiteSettings(): Promise<{
	site: typeof localSite;
	awards: Award[];
}> {
	if (!sanityClient) return { site: localSite, awards: localAwards };

	const doc = await sanityClient.fetch<{
		heroHeading?: string;
		description?: string;
		contactEmail?: string;
		awards?: Award[];
	} | null>(SETTINGS_QUERY);

	if (!doc) return { site: localSite, awards: localAwards };

	return {
		site: {
			...localSite,
			heroHeading: doc.heroHeading ?? localSite.heroHeading,
			description: doc.description ?? localSite.description,
			contactEmail: doc.contactEmail ?? localSite.contactEmail,
		},
		awards: doc.awards?.length ? doc.awards : localAwards,
	};
}
