#!/usr/bin/env node
/* A still of each project's modal page, as it first appears at 1440 x 900.

     node scripts/site-stills.mjs [slug ...]

   The project modal (src/scripts/project-modal.js) grows this picture out of
   the tile, then crossfades it into the page itself, so the handover is the
   same picture both sides (Hunter, Oct 24: "It needs to tween from the index
   card to the modal perfectly clearly"). Shot from whatever the modal opens
   (src/data/sites.json: the copy hosted with us, or the live page), through
   the dev server (SITE) for the copies. Writes public/sites/stills/<slug>.jpg
   and records it in sites.json. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, SITE } from "./card-frames.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "src/data/sites.json");
const sites = JSON.parse(readFileSync(FILE, "utf8"));
const { WORK } = await import(new URL("../src/data/work.js", import.meta.url).href);
const only = process.argv.slice(2);
mkdirSync(join(ROOT, "public/sites/stills"), { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const [slug, s] of Object.entries(sites)) {
  if (only.length && !only.includes(slug)) continue;
  const url = s.hosted ? (s.hosted.startsWith("/") ? SITE + s.hosted : s.hosted) : s.live ? WORK.find((w) => w.slug === slug)?.url : null;
  if (!url) continue;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  } catch {}
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(ROOT, "public/sites/stills", `${slug}.jpg`), type: "jpeg", quality: 80 });
  s.still = `/sites/stills/${slug}.jpg`;
  console.log(`${slug.padEnd(20)} ${url}`);
}
await browser.close();
writeFileSync(FILE, `${JSON.stringify(sites, null, 2)}\n`);
