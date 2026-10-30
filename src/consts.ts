/** Site name. Appended to every page title and used as `og:site_name`. */
export const SITE_NAME = "Kinetic Studio";
/** Fallback meta description for pages that don't set their own. */
export const SITE_DESCRIPTION =
  "Kinetic Studio designs and builds award-winning websites and brands for the companies building what's next, from AI and health to defense and climate.";
/** Canonical origin. Resolves canonical URLs, social images, and the sitemap. */
export const SITE_URL = "https://www.kineticstudio.com";
/** BCP 47 locale tag used to format dates and numbers. */
export const SITE_LOCALE = "en-US";
/** Routes excluded from search and the sitemap. Surrounding slashes are ignored. */
export const NOINDEX_ROUTES: string[] = ["/404", "/lab/*", "/lab-laurels", "/directions/*"];
/** Where every Contact button sends people. */
export const CONTACT_EMAIL = "hunter@kineticstudio.com";
/** The contact form's Web3Forms access key (it is meant to be public: it only lets the form send to CONTACT_EMAIL). */
export const WEB3FORMS_KEY = "5ee14a91-6389-4831-9646-5d077182d4e5";

/** Hunter's own profiles, as icons in the footer (Oct 25). */
export const SOCIAL = [
  { name: "X", href: "https://x.com/hunterthompson" },
  { name: "LinkedIn", href: "https://www.linkedin.com/in/hunterthompson/" },
];
