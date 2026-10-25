#!/usr/bin/env node
/* Is a 3D card ready to rest on a loop recorded from itself?

     node scripts/card-loop-check.mjs [slug ...]     (all the cards when none given)

   Hunter, Oct 24: "looped video for all of the base view items, and then, on
   hover, wherever it's at, it will take over that spot of the 3D ... The
   looped video needs to know where it's at, and then it swaps out with the 3D
   at the right moment." A tile rests on a loop recorded from its card
   (scripts/record-card-loops.mjs) and, on hover, the live card is told the
   loop's time ({type: "ks-card", at}, src/scripts/card-hover.js) and must
   show exactly that frame. So every card must:

     1. publish a handle on its window with `values`, `set()` and `period`
        (the seconds of one whole loop at speed 1), and
     2. be a function of one clock: one period on, the card is exactly where
        it began (the tour AND every ambient animation, or the loop has a seam),
     3. on {type: "ks-card", at}, put everything where it is at that time.

   Each card is served straight from the Studio (clients/kinetic/prototypes/
   3D-work-cards), embedded and matted as the site frames it, on a virtual
   clock, and two pictures are compared for each test (mean difference per
   pixel, 0..255; under 1 passes):
     seam   the frame after one tick vs the frame one period later
     seek   the card played to 37% of its period vs a fresh card told {at} that time */

import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { extname, join, normalize } from "node:path";
import { launch } from "./card-frames.mjs";
import { MAT } from "../src/data/card-embed.js";

const STUDIO = process.env.STUDIO ?? join(homedir(), "Developer/kinetic/kinetic-creative-studio");
const FROM = join(STUDIO, "clients/kinetic/prototypes/3D-work-cards");
const sharp = createRequire(import.meta.url)("sharp");
const FPS = 60;

const pages = readdirSync(FROM).filter((f) => f.endsWith(".html"));
const cards = readdirSync(FROM, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.endsWith("-card-src"))
  .map((d) => ({ slug: d.name.replace(/-card-src$/, ""), page: pages.find((f) => readFileSync(join(FROM, f), "utf8").includes(`${d.name}/`)) }))
  .filter((c) => c.page);
const only = process.argv.slice(2);
const todo = only.length ? cards.filter((c) => only.includes(c.slug)) : cards;

// the Studio's own paths: /shared (Params), /fonts/<client> (its brand fonts), the cards folder for the rest
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".otf": "font/otf", ".ttf": "font/ttf", ".mp4": "video/mp4" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  let file;
  if (path.startsWith("/shared/")) file = join(STUDIO, path);
  else if (path.startsWith("/fonts/")) {
    const [, , client, ...rest] = path.split("/");
    file = join(STUDIO, "clients", client, "brand/fonts", ...rest);
  } else file = join(FROM, normalize(path));
  if (!existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, ok));
const BASE = `http://localhost:${server.address().port}`;

const CLOCK = () => {
  let now = 0, id = 0;
  const queue = new Map();
  const D0 = Date.now();
  performance.now = () => now;
  Date.now = () => D0 + now;
  window.requestAnimationFrame = (cb) => (queue.set(++id, cb), id);
  window.cancelAnimationFrame = (i) => queue.delete(i);
  // the same clock the loops are recorded on (scripts/card-frames.mjs): CSS animations ride it too
  window.__tick = (ms) => {
    now += ms;
    const due = [...queue.values()];
    queue.clear();
    for (const cb of due) cb(now);
    for (const a of document.getAnimations()) {
      if (!a.animationName) continue;
      const d = a.effect?.getTiming().duration;
      a.pause();
      a.currentTime = typeof d === "number" && d <= 10000 ? now : 0;
    }
  };
};
// the card's handle, whatever its page calls it
const HANDLE = `(() => { for (const k of Object.keys(window)) { const o = window[k]; if (o && typeof o === "object" && typeof o.set === "function" && o.values && typeof o.values === "object") return o; } return null; })()`;

const browser = await launch();
async function open(c) {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(CLOCK);
  await page.goto(`${BASE}/${c.page}?embed=1&radius=0&mat=${MAT}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "html, body { background: #0d0d0d !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const period = await page.evaluate(`(${HANDLE})?.period ?? 0`);
  const tick = (n = 1) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__tick(1000 / 60); }, n);
  const shot = async () => (await sharp(await page.screenshot({ type: "png" })).greyscale().raw().toBuffer());
  return { page, period, tick, shot, errors };
}
const diff = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

console.log("card                  period   seam   seek");
let pass = 0;
for (const c of todo) {
  const A = await open(c);
  if (!A.period) {
    console.log(`${c.slug.padEnd(20)}  no period on its handle${A.errors.length ? `  (${A.errors[0]})` : ""}`);
    await A.page.close();
    continue;
  }
  const N = Math.round(A.period * FPS);
  await A.tick(1);
  const first = await A.shot();
  await A.tick(N);
  const later = await A.shot();
  const seam = diff(first, later);
  if (process.env.KEEP) {
    const { width, height } = A.page.viewportSize();
    await sharp(first, { raw: { width, height, channels: 1 } }).png().toFile(`${process.env.KEEP}/${c.slug}-seam-a.png`);
    await sharp(later, { raw: { width, height, channels: 1 } }).png().toFile(`${process.env.KEEP}/${c.slug}-seam-b.png`);
  }
  await A.page.close();
  // seek: played to k ticks, vs told {at} and ticked once
  const k = Math.round(N * 0.37);
  const P = await open(c);
  await P.tick(k);
  const played = await P.shot();
  await P.page.close();
  const S = await open(c);
  await S.tick(1);
  await S.page.evaluate((at) => window.postMessage({ type: "ks-card", at }, "*"), (k - 1) / FPS);
  await S.page.waitForTimeout(50);
  await S.tick(1);
  const sought = await S.shot();
  const seek = diff(played, sought);
  await S.page.close();
  const ok = seam < 1 && seek < 1;
  if (ok) pass++;
  console.log(`${c.slug.padEnd(20)}  ${A.period.toFixed(2).padStart(6)}s  ${seam.toFixed(2).padStart(5)}  ${seek.toFixed(2).padStart(5)}  ${ok ? "ok" : "FIX"}`);
}
console.log(`${pass} of ${todo.length} ready`);
await browser.close();
server.close();
