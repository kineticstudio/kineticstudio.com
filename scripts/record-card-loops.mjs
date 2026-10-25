#!/usr/bin/env node
/* The resting loops for the tiles that lead the site.

     node scripts/record-card-loops.mjs [slug ...]

   Hunter, Oct 24: "I want to create a looped video on the top scroll for each
   site, and then on hover, we convert to our 3D effect", first for the top
   two, then every homepage tile. For each project in src/data/card-loops.json (or the
   slugs given), this records one whole tour of its 3D card, flat, at the two
   tile shapes: public/media/card-<slug>.mp4 (16:10, the homepage wheel) and
   card-<slug>-4x3.mp4 (the Work grid). The tour ends where it began, so the
   loop has no seam, and the live card picks up from the loop's time on hover
   (src/scripts/card-hover.js). A card must pass scripts/card-loop-check.mjs
   first. Needs the dev server (SITE) and ffmpeg. */

import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openCard } from "./card-frames.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : JSON.parse(readFileSync(join(ROOT, "src/data/card-loops.json"), "utf8"));
const FPS = 60;
// css px at 2x: about the tile's size on a 1440 screen
const SHAPES = [
  { suffix: "", width: 640, height: 400 },
  { suffix: "-4x3", width: 480, height: 360 },
];

const browser = await launch();
if (!browser) throw new Error("record-card-loops: playwright-core not found (PLAYWRIGHT_CORE)");
for (const slug of slugs) {
  for (const S of SHAPES) {
    const card = await openCard(browser, slug, { width: S.width, height: S.height, dpr: 2 });
    if (!card.period) {
      console.log(`${slug.padEnd(14)} no tour period on its card handle, skipped`);
      await card.page.close();
      continue;
    }
    const out = join(ROOT, "public/media", `card-${slug}${S.suffix}.mp4`);
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out], { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise((ok, fail) => ff.on("close", (code) => (code ? fail(new Error(`ffmpeg ${code}`)) : ok())));
    const frames = Math.round(card.period * FPS);
    for (let i = 0; i < frames; i++) {
      await card.tick(1000 / FPS);
      const jpg = await card.shot();
      if (!ff.stdin.write(jpg)) await new Promise((ok) => ff.stdin.once("drain", ok));
    }
    ff.stdin.end();
    await done;
    await card.page.close();
    console.log(`${slug.padEnd(14)} ${out.replace(ROOT + "/", "")}  ${card.period.toFixed(1)} s, ${(statSync(out).size / 1e6).toFixed(1)} MB`);
  }
}
await browser.close();
