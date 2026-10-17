# kineticstudio.com

Kinetic Studio's own website, built the way every Kinetic site is now built:
**Astro**, on **Lumos for Astro**, edited visually in the **Kinetic Studio
editor**, hosted on **Cloudflare**. It is also the first site on that setup,
so it doubles as the reference for client builds.

The real domain still points at Webflow and is untouched. Nothing here changes
what visitors to kineticstudio.com see until the DNS is moved on purpose.

```bash
npm install
npm run dev      # the site at http://localhost:8758
npm run edit     # the visual editor at http://localhost:4351/studio
npm run build    # production build into dist/
npm run preview  # serve dist/ exactly as it will be hosted
npm run check    # Astro's type check
```

The editor needs its own folder beside this one,
`~/Developer/kinetic/kinetic-site-editor`, built once (its `KINETIC.md` has the
three commands). In the Kinetic Creative Studio, this site is the **Kinetic
Studio** project and its **Website** stage opens the same editor.

---

## The pieces, and what each one does

| Piece | Owns | Think of it as |
| --- | --- | --- |
| **Astro** | Turning components into plain HTML | The page builder |
| **Lumos for Astro** | The base system: tokens, Section, Grid, Button, type | The house style kit |
| **Kinetic Studio editor** | Editing pages and components visually, then publishing | Webflow's Designer |
| **Cloudflare** | Serving the built files | The storefront |

There is no CMS. The words, videos and links live in the page files, and the
editor edits those files directly, so what you change is exactly what ships.
Publishing from the editor commits to GitHub, and Cloudflare rebuilds from
that commit.

## How the site is laid out

```
src/
  pages/index.astro           the homepage: composes the components below
  layouts/BaseLayout.astro    the page shell: <head>, the nav, the page
  components/content/         Kinetic's own blocks: HeroAwards, Award, ProjectCard
  components/section/         WorkPanel, the white panel that rises over the hero
  components/global/          Nav, Footer (the footer is not used on this site)
  components/...              everything else is Lumos, used as is
  styles/base.css             the tokens: colours, fonts, spacing, radii
  consts.ts                   site name, description, URL, contact email
  assets/fonts/               GT Walsheim and Monument Extended
  assets/logo/logo.svg        the Kinetic wordmark
LUMOS.md                      the rules for writing components (read before adding one)
.agents/skills/               Lumos's own skills, including lumos-upgrade-version
wrangler.jsonc                the Cloudflare hosting config
```

Two Lumos rules worth knowing before touching a component:

- **A Section's padding props are utilities, and utilities beat component CSS.**
  That is why the hero's padding lives on its inner layout, not on the section.
- **Lumos lives in this repo**, copied in rather than installed. Updating it is
  the `lumos-upgrade-version` skill, which merges a new Lumos release into
  these files.

## Hosting

`wrangler.jsonc` is ready for Cloudflare: the built `dist/` served as an
assets-only Worker named `kineticstudio-com`. Connecting it (Workers Builds on
this repo, then a route for the domain) is an account step only Hunter can do,
and it is listed in the Studio's `docs/kinetic-stack.md`.

Until then the earlier version of this rebuild (Astro, Sanity, Netlify) is
still at <https://kineticstudio-com.netlify.app>. That Netlify site has no git
connection, so pushing here does not change it. `netlify.toml` is kept so a
manual Netlify preview still works. The pre-Lumos code is tagged
`pre-lumos-2026-10-17`.

## Open items

- **GT Walsheim is a trial cut.** The files in `src/assets/fonts` are the trial
  release and need a real licence before this site replaces the Webflow one.
- The Webflow site has more pages than the homepage. Only the homepage is
  rebuilt so far.
