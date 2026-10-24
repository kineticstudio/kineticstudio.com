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

## The 2026 redesign (branch `redesign-2026`)

Started 2026-10-23. Dark, in the same 2026 language as the proposals and
briefs (kinetic-contracts): **Panell Condensed** for display and headings,
**PP Neue Montreal** for text, **Neue Montreal Mono** for labels, ink
`#0d0d0d`, sage `#d9e2d2`, lime `#a8ff66`, and the brand-2026 striped mark
and italic KINETIC lockup (`src/assets/brand`).

| Page | What it is |
| --- | --- |
| `/` | Homepage direction one, **Portal**: work plays inside the mark's five lines (they load straight, then bend), scroll pushes through the gap between the last two arcs into a field of work flying past in 3D, then the selected work grid |
| `/directions/lines` | Direction two, **Lines**: the lockup builds itself (lines rise, bend into the mark, KINETIC slides out, the STUDIO pill draws), then rides up into the nav |
| `/directions/focus` | Direction three, **Focus**: one centred column, only the piece at the centre is sharp and playing; Catalog view maps every project as a tree |
| `/work` | Every project, with a floating filter (industry, discipline) and Grid / List views; list rows show a loop that follows the pointer |
| `/work/<slug>` | Case studies for the projects with `case: true` in `src/data/work.js` |
| `/about` | Hunter, the human + AI split, services, the studio tool, awards, clients |
| `/contact` | A four-step brief (what, when, budget, details) that opens a ready email |
| `/playground` | Experiments as a draggable barrel or a grid; live ones open on `/playground/<slug>` with a Params panel, clips open in place |
| `/lab/<slug>` | One experiment with no site chrome, for building it (`?bare` hides the panel too) |

A switcher pill on the three homepage directions flips between them; it is
for review and comes out once one is chosen.

**Content lives in `src/data`:** `work.js` (projects, clients, stats,
awards), `experiments.js` (the Playground) and `media.json` (generated).
**Media:** `scripts/media.config.mjs` lists every loop and where it is cut
from (Hunter's Twitter folder in iCloud, the swimlanes design's loops, the
Webflow mirror's hover videos); `node scripts/build-media.mjs [id ...]` cuts
them into `public/media`. Live experiments are recorded by
`node scripts/capture-experiments.mjs` (dev server running) and then cut the
same way as `exp-<slug>`.

**Experiments** follow `src/experiments/README.md`: each exports `params` in
the Creative Studio's ks-params shape and `mount(host, values, ctx)`, so a
studio prototype ports over. The panel is `src/scripts/params.js`; the
values live in the URL hash, so Copy link shares a tuned state.

**Hidden bits:** S toggles UI sound (synthesized, off by default, also the
bars in the nav), G flips a Work or Playground view, P hides the Params panel,
R randomizes it, number keys answer the contact steps, the footer address
copies itself, the console says hello, and clicking the Lines logo replays it.

## How the site is laid out

```
src/
  pages/index.astro           the homepage: composes the components below
  layouts/BaseLayout.astro    the page shell: <head>, the nav, the page
  components/content/         Kinetic's own blocks: WorkCard, KineticLogo, AwardsLaurels, ClientWall, Statement
  components/section/         HeroPortal, HeroLines, WorkFocus, WorkIndex, CaseStudy, AboutStudio, ContactFlow, Playground, ExperimentStage
  components/global/          Nav, Footer, DirectionSwitch (review only)
  data/                       work.js, experiments.js, media.json (generated)
  experiments/                one file per live Playground experiment
  scripts/                    site.js (loops, reveals, sound, keys), params.js, mark.js
  components/...              everything else is Lumos, used as is
  styles/base.css             the tokens: colours, fonts, spacing, radii
  consts.ts                   site name, description, URL, contact email
  assets/fonts/               Panell Condensed (trial), PP Neue Montreal, Neue Montreal Mono
  assets/brand/               the 2026 mark, lockup and Studio lockup
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

**Cloudflare builds this repo.** Every push to `main` rebuilds and deploys
<https://kineticstudio-com.hunter-938.workers.dev> in about a minute (Workers
Builds, connected 2026-10-17, Worker `kineticstudio-com` on Hunter's account).
Build command `npm run build`, deploy command `npx wrangler deploy`, build
variable `NODE_VERSION=24`; other branches get their own preview link. So a
push here publishes that address, though not kineticstudio.com.

kineticstudio.com itself still points at Webflow. Moving it is a route on the
Worker plus a DNS change, done only when the rest of the pages are rebuilt.

The earlier version of this rebuild (Astro, Sanity, Netlify) is still at
<https://kineticstudio-com.netlify.app>, with no git connection. The
pre-Lumos code is tagged `pre-lumos-2026-10-17`.

## Open items

- **Panell Condensed is a trial cut** (`src/assets/fonts`): it needs a real
  licence before this site replaces the Webflow one. GT Walsheim and Monument
  Extended are gone with the redesign.
- The Webflow site has more pages than the homepage. Only the homepage is
  rebuilt so far.
