import { NOINDEX_ROUTES } from "../consts.ts";

const normalize = (path: string) => `/${path.replace(/^\/+|\/+$/g, "")}`;

const excluded = new Set(NOINDEX_ROUTES.map(normalize));

/** Checks whether a route should be hidden from search. Used by BaseHead. A route ending in `/*` hides everything under it. */
export function isNoindexRoute(pathname: string): boolean {
  const path = normalize(pathname);
  return excluded.has(path) || [...excluded].some((r) => r.endsWith("/*") && path.startsWith(r.slice(0, -1)));
}
