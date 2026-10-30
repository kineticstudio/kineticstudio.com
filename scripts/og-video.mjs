#!/usr/bin/env node
/* Film the link preview's video (src/pages/og/[slot].astro) into public/og-video.mp4 and its first frame
   into public/og-image.jpg.

     node scripts/og-video.mjs            (needs the dev server: npm run dev, on PORT or 8758)

   Hunter, Oct 30: "Let's also work on an OG video ... the barrel effect, but with my actual pieces of
   work ... with the H1 captivating websites, etc., and all the awards, and then the logo somewhere." The
   page runs on a driven clock (requestAnimationFrame, performance.now and Date.now step 1/FPS a frame), so
   every frame is exact; it is filmed at twice its size and encoded at 1200 x 630, H.264, no sound, a
   loop of LOOP seconds. The barrel loops by itself; the laurels' light does not, so the last XF seconds
   are filmed on past the loop and laid over its start, fading in, and the seam goes. Needs playwright-core
   and ffmpeg; the frames are kept in a temporary folder. */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PW = process.env.PLAYWRIGHT_CORE ?? path.join(os.homedir(), "Developer/kinetic/creative-studio-supercut/node_modules/playwright-core/index.mjs");
const { chromium } = await import(pathToFileURL(PW).href);
const URL_ = `http://localhost:${process.env.PORT ?? 8758}/og/video/`;
const FPS = 30, LOOP = 10, XF = 0.6, SCALE = 2;
const frames = Math.round((LOOP + XF) * FPS), loopFrames = LOOP * FPS, xfFrames = Math.round(XF * FPS);
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "og-video-"));

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: SCALE });
await page.addInitScript((fps) => {
  let now = 0;
  const cbs = [], base = Date.now();
  performance.now = () => now;
  Date.now = () => base + now;
  window.requestAnimationFrame = (cb) => (cbs.push(cb), cbs.length);
  window.cancelAnimationFrame = () => {};
  window.__step = () => {
    now += 1000 / fps;
    for (const cb of cbs.splice(0)) {
      try {
        cb(now);
      } catch (e) {
        console.error(e);
      }
    }
  };
}, FPS);
await page.goto(URL_, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
// the laurels build their 3D, the posters decode, the reveals land: two seconds before the first frame
for (let i = 0; i < 2 * FPS; i++) await page.evaluate(() => window.__step());
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
const shot = (i) => path.join(dir, `f${String(i).padStart(4, "0")}.png`);
for (let i = 0; i < frames; i++) {
  await page.screenshot({ path: shot(i) });
  await page.evaluate(() => window.__step());
}
await browser.close();

// the tail laid over the head, fading in: frame i (i < xfFrames) = the film's frame i under loopFrames + i
const blended = path.join(dir, "loop");
await fs.mkdir(blended);
for (let i = 0; i < loopFrames; i++) {
  const out = path.join(blended, `f${String(i).padStart(4, "0")}.png`);
  if (i >= xfFrames) await fs.rename(shot(i), out);
  else {
    const w = (i / xfFrames).toFixed(4);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", shot(i), "-i", shot(loopFrames + i), "-filter_complex", `[0:v][1:v]blend=all_expr='A*${w}+B*(1-${w})'`, out]);
  }
}
const mp4 = path.join(ROOT, "public/og-video.mp4"), jpg = path.join(ROOT, "public/og-image.jpg");
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", path.join(blended, "f%04d.png"),
  "-vf", "scale=1200:630:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", "-an", mp4]);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(blended, "f0000.png"), "-vf", "scale=1200:630:flags=lanczos", "-q:v", "3", jpg]);
await fs.rm(dir, { recursive: true, force: true });
const size = async (f) => `${((await fs.stat(f)).size / 1e6).toFixed(2)} MB`;
console.log(`og-video: ${path.relative(ROOT, mp4)} (${await size(mp4)}, ${LOOP} s at ${FPS} fps), ${path.relative(ROOT, jpg)} (${await size(jpg)})`);
