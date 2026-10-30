#!/usr/bin/env node
/* Light copies of the work's stills, for the pages that show many at once.

     node scripts/webp-stills.mjs [--force]

   Hunter, Oct 30: "Look at Cloudflare Analytics ... Looks like we have some performance issues." The
   homepage and the Playground showed every still at its full 1200-1280 px JPEG, phones included,
   about 60-120 KB each. Beside each card poster (public/cards/<slug>/poster*.jpg) and each media still
   (public/media/*.jpg) this writes <name>.webp at the still's own size and <name>-640.webp, 640 px
   wide, for the pages' srcset; a phone takes the small one, a retina laptop the full one. It runs
   before every build (npm run build), so a new still always has its copies; a still newer than its
   copies by more than a few seconds (one recorded again) is made again, all of them with --force.
   The slack is for a fresh checkout, where every file is written at about the same moment. */

import { globSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// the copies are in the repo, so a machine without sharp (a build server) builds with those
const sharp = await import("sharp").then((m) => m.default).catch(() => null);
if (!sharp) {
  console.warn("webp-stills: sharp isn't here, so the copies in the repo stand");
  process.exit(0);
}
const force = process.argv.includes("--force");
const stills = [...globSync("public/cards/*/poster*.jpg", { cwd: ROOT }), ...globSync("public/media/*.jpg", { cwd: ROOT })];
const stale = (src, out) => {
  try {
    return force || statSync(out).mtimeMs < statSync(src).mtimeMs - 5000;
  } catch {
    return true;
  }
};

let made = 0, before = 0, after = 0;
for (const rel of stills) {
  const src = join(ROOT, rel);
  const base = src.replace(/\.jpg$/, "");
  for (const [out, width] of [[`${base}.webp`, null], [`${base}-640.webp`, 640]]) {
    if (!stale(src, out)) continue;
    const img = sharp(src);
    if (width) img.resize({ width, withoutEnlargement: true });
    await img.webp({ quality: 74, effort: 6 }).toFile(out);
    made++;
    if (!width) (before += statSync(src).size), (after += statSync(out).size);
  }
}
console.log(`webp-stills: ${made} copies made of ${stills.length} stills${before ? `, full size ${(before / 1e6).toFixed(1)} MB as JPEG, ${(after / 1e6).toFixed(1)} MB as WebP` : ""}`);
