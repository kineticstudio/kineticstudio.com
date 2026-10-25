#!/usr/bin/env node
/* Bring the code-powered 3D work cards over from the Creative Studio.

     node scripts/sync-cards.mjs

   Each card is a prototype in the Studio repo (clients/kinetic/prototypes/3D-work-cards:
   the card's page plus its <slug>-card-src folder, built with the Studio's
   Params). This copies every one marked finished in scripts/cards-ready.json
   into public/cards/<slug>/ (the page
   becomes index.html, beside its -src folder, the downloaded reference
   files in raw/ left behind) and writes src/data/cards.json, which
   WorkCard reads to frame the card instead of the video loop. The site
   frames them with ?embed=1: no Params, no label, transparent. Hunter,
   Oct 23: these four lead the site, "make sure the 3D effect applies". */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openCard } from "./card-frames.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { WORK } = await import(new URL("../src/data/work.js", import.meta.url).href);
// the cards signed off as finished: a card still being built never reaches the site
const READY = JSON.parse(readFileSync(join(ROOT, "scripts/cards-ready.json"), "utf8"));
const STUDIO = process.env.STUDIO ?? join(homedir(), "Developer/kinetic/kinetic-creative-studio");
// Hunter, Oct 24: the cards sit in one folder of their own under Prototypes
const FROM = join(STUDIO, "clients/kinetic/prototypes/3D-work-cards");

// Every card in the prototypes folder: a <slug>-card-src folder (the slug is
// the project's, from src/data/work.js) and the page that loads from it.
const pages = readdirSync(FROM).filter((f) => f.endsWith(".html"));
const CARDS = readdirSync(FROM, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.endsWith("-card-src"))
  .map((d) => ({ slug: d.name.replace(/-card-src$/, ""), src: d.name }))
  .map((c) => ({ ...c, page: pages.find((f) => readFileSync(join(FROM, f), "utf8").includes(`${c.src}/`)) }))
  .filter((c) => c.page);

const synced = [];
for (const c of CARDS) {
  const page = join(FROM, c.page);
  if (!READY.includes(c.slug)) {
    rmSync(join(ROOT, "public/cards", c.slug), { recursive: true, force: true });
    console.log(`${c.slug.padEnd(16)} not on the site (scripts/cards-ready.json)`);
    continue;
  }
  // a card left over from a project that has since gone stays out
  if (!WORK.some((w) => w.slug === c.slug)) {
    console.log(`${c.slug.padEnd(14)} not a project in src/data/work.js`);
    continue;
  }
  const src = join(FROM, c.src);
  if (!existsSync(page) || !existsSync(src)) {
    console.log(`${c.slug.padEnd(14)} not built yet`);
    continue;
  }
  // a card the site can frame speaks the embed contract: ?embed=1, the
  // ks-card-open message, and &bleed= (WorkCard's frame overhangs the tile)
  const html = readFileSync(page, "utf8") + (existsSync(join(src, "js/card.js")) ? readFileSync(join(src, "js/card.js"), "utf8") : "");
  if (!html.includes("ks-card-open") || !/[?&]bleed|get\(["']bleed["']\)/.test(html)) {
    rmSync(join(ROOT, "public/cards", c.slug), { recursive: true, force: true });
    console.log(`${c.slug.padEnd(14)} no embed mode yet`);
    continue;
  }
  const out = join(ROOT, "public/cards", c.slug);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(page, join(out, "index.html"));
  cpSync(src, join(out, c.src), { recursive: true, filter: (p) => !p.split(/[\\/]/).includes("raw") });
  synced.push(c.slug);
  console.log(`${c.slug.padEnd(14)} public/cards/${c.slug}/`);
}
writeFileSync(join(ROOT, "src/data/cards.json"), `${JSON.stringify(synced, null, 2)}\n`);

/* Each card's own first frame as its tile's still, at both tile shapes:
   poster.jpg (16:10, the homepage wheel) and poster-4x3.jpg (the Work grid).
   Taken on the card's own clock at its start (scripts/card-frames.mjs), so
   it is exactly the first frame of a resting loop recorded from the card,
   through the dev server (some cards load their engine as a module, which a
   file:// page can't). */
const browser = synced.length ? await launch() : null;
if (browser) {
  for (const slug of synced) {
    for (const [name, height] of [["poster", 750], ["poster-4x3", 900]]) {
      const card = await openCard(browser, slug, { width: 1200, height });
      await card.tick(1000 / 60);
      await card.page.screenshot({ path: join(ROOT, "public/cards", slug, `${name}.jpg`), type: "jpeg", quality: 76 });
      await card.page.close();
    }
  }
  await browser.close();
  console.log(`sync-cards: stills for ${synced.length}`);
}
console.log(`sync-cards: ${synced.length} cards`);
