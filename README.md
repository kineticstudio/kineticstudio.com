# kineticstudio.com

The studio site, rebuilt off Webflow as an Astro project. Content lives in
Sanity, hosting is Netlify.

**Live:** <https://kineticstudio-com.netlify.app> — this is the rebuild, not the
Webflow site. The real domain still points at Webflow and is untouched.

```bash
npm run dev      # local site at http://localhost:8758
npm run build    # production build into dist/
npm run preview  # serve dist/ exactly as Netlify will

npm run studio   # the Sanity content editor at http://localhost:3333
npm run seed     # re-import src/data/*.ts into Sanity (rarely needed)
```

---

## The three tools, and what each one actually does

They sound like they overlap. They don't — each owns one job.

| Tool | Owns | Think of it as |
| --- | --- | --- |
| **Astro** | Turning content + components into HTML | The page builder |
| **Sanity** | Storing the words, videos and links | The filing cabinet |
| **Netlify** | Running the build and serving the result | The printing press + storefront |

The flow: you edit content in **Sanity** → a build runs on **Netlify** → **Astro** generates fresh HTML → visitors get plain static files.

Webflow bundled all three into one product. Splitting them up is what buys the
control — but it does mean three accounts instead of one.

---

## How this project is laid out

### Seeing the components

There is no visual editor for Astro — it's files. The closest thing is the
**style guide at `/style-guide`** (http://localhost:4321/style-guide while
`npm run dev` is running). It renders the real components — not copies — beside
a panel of live sliders wired to the design tokens. Drag one and every component
on the page updates at once; **Copy CSS** gives you the changed tokens to paste
into `global.css`. It's `noindex`, so it never shows up in search.

```
src/
  pages/index.astro        the homepage — assembles the components
  pages/style-guide.astro  the component gallery + token playground
  layouts/BaseLayout.astro the <html> shell, meta tags, fonts
  components/              Button, Header, Hero, ProjectGrid, ProjectCard
  data/                    content as plain TypeScript (the fallback)
  lib/sanity.ts            fetches from Sanity, falls back to data/
  styles/global.css        design tokens: colours, fonts, spacing
studio/                    the Sanity Studio — its own app, own deps
studio/schemaTypes/        what a "Project" is allowed to contain
scripts/seed-sanity.ts     one-time import of data/ into Sanity
public/                    fonts and logos (videos live in Sanity)
```

**Astro components** are the useful idea to grab first. `ProjectCard.astro` is
one file holding the markup *and* the CSS for a single project card. The CSS is
scoped — styles written there cannot leak out and hit anything else. That is the
main thing Webflow's class system was trying to protect you from, done properly.

Everything above the `---` fence in a `.astro` file is JavaScript that runs
**at build time only**. It never reaches the browser. That's why the site ships
almost no JavaScript.

### The content fallback

`src/lib/sanity.ts` returns content from Sanity when it's configured, and from
`src/data/*.ts` when it isn't. So the site runs today with zero setup, and
switching to the CMS is a matter of filling in `.env` — not rewriting pages.

---

## Setup, when you're ready

### Sanity — already set up

Project `whpuamna`, dataset `production`, holding all 27 projects and their
videos.

**Edit content at <https://kineticstudio.sanity.studio>** (or `npm run studio`
to run it locally on port 3333). `npm run studio:deploy` republishes the hosted
one after a schema change.

The Studio lives in `studio/` as **its own app with its own `package.json`**,
rather than embedded in the site at `/admin`. Two reasons:

1. It keeps React and ~900 packages out of the site build. The site itself
   depends on exactly two things — `astro` and `@sanity/client`.
2. `sanity` 6.10.x pulls in `@sanity/sdk-react`, which ships unbundled JSX that
   Vite 8 refuses to parse — it breaks `sanity build` and `@sanity/astro` alike.
   So `sanity` is **pinned to 6.9.2**, the last release before that dependency
   appeared. Worth retrying the upgrade in a few months.

### Netlify — already set up

Site `kineticstudio-com`. Everything Kinetic owns lives on Netlify (60+ sites,
including every client share and the `*.kineticstudio.com` subdomains), so this
site sits with the rest rather than on its own island.

```bash
npm run build
netlify deploy --prod --dir dist
```

`netlify.toml` holds the build config, and `PUBLIC_SANITY_*` are set on the site
so a Netlify-run build finds the content.

Deploys are manual: the repo is not linked, so a `git push` does **not** publish.
To change that, link the repo under Build & deploy at
<https://app.netlify.com/projects/kineticstudio-com/configuration/deploys>.

There is still a dormant Vercel project (`kineticstudio-com`) from before the
move. Its git hook is disconnected so it cannot quietly serve a newer build than
Netlify. Delete it whenever.

Note that **content is baked in at build time** — editing text in Sanity does not
change the live site until a new build runs. That's the trade for shipping pure
static files, and it's what a webhook from Sanity to Netlify would automate later.

---

## Notes and open items

- **Fonts are trial versions.** `GT-Walsheim-*-Trial.woff2` needs a real licence
  before this goes live on the public domain.
- **Videos live in Sanity**, served from its CDN. They used to sit in
  `public/videos`, but once Sanity became the source of truth that was 21 MB of
  dead weight in every deploy — the build output went from 27 MB to 212 KB when
  it came out. Upload new ones through the Studio, not the repo.
- Because of that, the offline fallback in `src/data/` is **text-only**. If
  Sanity is unreachable the site still builds and lists every project, just
  without hover videos.
- **The tilt** on the projects panel is a CSS scroll-driven animation
  (`animation-timeline: view()`), not a JavaScript library. Browsers that don't
  support it get the panel flat, which is a perfectly good fallback.
- **Analytics were dropped** in the move off Webflow. Netlify Analytics is one
  toggle if you want it back.
- The old Webflow mirror is still in `✨AI Fun/kineticstudio.com` for reference.
