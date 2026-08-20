# kineticstudio.com

The studio site, rebuilt off Webflow as an Astro project. Content lives in
Sanity, hosting is Vercel.

**Live:** <https://kineticstudio-com.vercel.app> — this is the rebuild, not the
Webflow site. The real domain still points at Webflow and is untouched.

```bash
npm run dev      # local site at http://localhost:8758
npm run build    # production build into dist/
npm run preview  # serve dist/ exactly as Vercel will
```

---

## The three tools, and what each one actually does

They sound like they overlap. They don't — each owns one job.

| Tool | Owns | Think of it as |
| --- | --- | --- |
| **Astro** | Turning content + components into HTML | The page builder |
| **Sanity** | Storing the words, videos and links | The filing cabinet |
| **Vercel** | Running the build and serving the result | The printing press + storefront |

The flow: you edit content in **Sanity** → **Vercel** notices and re-runs the
build → **Astro** generates fresh HTML → visitors get plain static files.

Webflow bundled all three into one product. Splitting them up is what buys the
control — but it does mean three accounts instead of one.

---

## How this project is laid out

```
src/
  pages/index.astro        the homepage — assembles the components
  layouts/BaseLayout.astro the <html> shell, meta tags, fonts
  components/              Header, Hero, ProjectGrid, ProjectCard
  data/                    content as plain TypeScript (the fallback)
  lib/sanity.ts            fetches from Sanity, falls back to data/
  styles/global.css        design tokens: colours, fonts, spacing
sanity/schemaTypes/        what a "Project" is allowed to contain
scripts/seed-sanity.ts     one-time import of data/ into Sanity
public/                    fonts, logos, and the 19 hover videos
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

### 1. Sanity

Needs a free account at [sanity.io](https://www.sanity.io).

```bash
npx sanity login
npx sanity init --create-project "Kinetic Studio" --dataset production
```

Put the project ID it prints into `.env` (copy `.env.example` first). Then create
an editor token in **Manage → API → Tokens**, add it as
`SANITY_API_WRITE_TOKEN`, and import the existing content:

```bash
node --env-file=.env scripts/seed-sanity.ts
```

Restart `npm run dev` and the Studio appears at
[localhost:8758/admin](http://localhost:8758/admin).

### 2. Vercel

Needs a free account at [vercel.com](https://vercel.com), and the code pushed to
GitHub. Vercel watches the repo: every `git push` triggers a build, and every
pull request gets its own preview URL.

Add the same `PUBLIC_SANITY_*` variables in Vercel's project settings, or the
production build won't find the content.

---

## Notes and open items

- **Fonts are trial versions.** `GT-Walsheim-*-Trial.woff2` needs a real licence
  before this goes live on the public domain.
- **Videos are MP4 only** (21 MB total), served as static files. The original
  Webflow build also shipped WebM duplicates, which doubled the weight for no
  practical gain — every current browser plays the MP4.
- **The tilt** on the projects panel is a CSS scroll-driven animation
  (`animation-timeline: view()`), not a JavaScript library. Browsers that don't
  support it get the panel flat, which is a perfectly good fallback.
- **Analytics were dropped** in the move off Webflow. Vercel Analytics is one
  toggle if you want it back.
- The old Webflow mirror is still in `✨AI Fun/kineticstudio.com` for reference.
