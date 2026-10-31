#!/usr/bin/env node
/* Phone cuts of the homepage tiles' resting loops.

     node scripts/phone-loops.mjs [--force]

   Hunter, Oct 31, on his phone: "Ideally, we would still have looped videos for each of the pieces of
   work." The loops recorded from each card (public/media/card-<slug>.mp4, scripts/record-card-loops.mjs)
   are 1280 x 800 at 60 fps, 1.4 to 5.4 MB each: a phone's tile is about 170 px wide. Beside each this
   writes card-<slug>-phone.mp4, 640 px wide at 30 fps, no sound, about a fifth of the size, which the
   homepage plays on phones and tablets (src/scripts/lite.js). Needs ffmpeg; only loops newer than
   their cut are cut again, unless --force. */

import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const loops = JSON.parse(readFileSync(join(ROOT, "src/data/card-loops.json"), "utf8"));
const stale = (src, out) => {
  try {
    return force || statSync(out).mtimeMs < statSync(src).mtimeMs;
  } catch {
    return true;
  }
};

let made = 0, before = 0, after = 0;
for (const slug of loops) {
  const src = join(ROOT, `public/media/card-${slug}.mp4`), out = join(ROOT, `public/media/card-${slug}-phone.mp4`);
  if (!stale(src, out)) continue;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-an", "-vf", "fps=30,scale=640:-2:flags=lanczos",
    "-c:v", "libx264", "-preset", "slow", "-crf", "31", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
  made++;
  before += statSync(src).size;
  after += statSync(out).size;
  console.log(`${slug.padEnd(20)} ${(statSync(src).size / 1e6).toFixed(1)} MB -> ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}
console.log(`phone-loops: ${made} cut${made ? `, ${(before / 1e6).toFixed(0)} MB -> ${(after / 1e6).toFixed(1)} MB` : ""}`);
