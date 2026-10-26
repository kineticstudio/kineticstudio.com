#!/usr/bin/env node
/* Record each live experiment so the Playground can show it moving.

     node scripts/capture-experiments.mjs              all of them
     node scripts/capture-experiments.mjs terrain      just these

   Needs the dev server (npm run dev) and playwright-core. It is not a
   dependency of the site; point PLAYWRIGHT_CORE at any install of it (the
   default is the one in the studio reel's repo beside this one). Each piece
   is recorded at 1280x800 from /lab/<slug>?bare into scripts/.captures, then
   `node scripts/build-media.mjs exp-<slug>` cuts the loop like any other. */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXPERIMENTS } from "../src/data/experiments.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "scripts/.captures");
const PW = process.env.PLAYWRIGHT_CORE ?? path.join(os.homedir(), "Developer/kinetic/creative-studio-supercut/node_modules/playwright-core/index.mjs");
const BASE = process.env.SITE ?? "http://localhost:8758";
const { chromium } = await import(pathToFileURL(PW).href);

const only = process.argv.slice(2);
// seconds to wait before the clip starts, for pieces that open on an intro or load slowly
const LEAD = { "ink-world": 8, "hero-ribbon": 10, island: 4, "glyph-morph": 3, "object-stipple": 3 };
const todo = EXPERIMENTS.filter((e) => e.kind === "live" && (!only.length || only.includes(e.slug)));
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });

for (const e of todo) {
  const dir = await fs.mkdtemp(path.join(OUT, `${e.slug}-`));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir, size: { width: 1280, height: 800 } } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/lab/${e.slug}?bare`, { waitUntil: "networkidle" });
  // most pieces are alive within 2 s; a few open on an intro or a slow load
  const lead = LEAD[e.slug] ?? 2;
  await page.waitForTimeout((lead + 5) * 1000);
  await ctx.close();
  const [webm] = (await fs.readdir(dir)).filter((f) => f.endsWith(".webm"));
  // Drop the lead (page load, an intro), keep the next 5 s.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(lead), "-t", "5", "-i", path.join(dir, webm), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", path.join(OUT, `${e.slug}.mp4`)]);
  await fs.rm(dir, { recursive: true });
  console.log(`${e.slug} captured`);
}
await browser.close();
