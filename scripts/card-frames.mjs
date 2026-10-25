/* Frames of a 3D work card on a clock we drive, for the tile stills
   (scripts/sync-cards.mjs) and the resting loops (scripts/record-card-loops.mjs).

   The card's page runs with requestAnimationFrame and performance.now
   replaced, so nothing moves until tick(ms) steps it: every frame is exact
   however long a screenshot takes, and a recording of one whole tour closes
   on itself. Its CSS animations step with the same clock when they're short
   (Dawn's typing dots) and hold still when they're long (Dawn's drifting
   clouds), so the loop has no seam. The card is shown as the site frames it
   at rest: embed mode, flat, on its mat (src/data/card-embed.js), square
   corners (the tile rounds them). */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MAT } from "../src/data/card-embed.js";

export const SITE = process.env.SITE ?? "http://localhost:8758";
const PW = process.env.PLAYWRIGHT_CORE ?? join(homedir(), "Developer/kinetic/creative-studio-supercut/node_modules/playwright-core/index.mjs");

const CLOCK = () => {
  let now = 0, id = 0;
  const queue = new Map();
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => (queue.set(++id, cb), id);
  window.cancelAnimationFrame = (i) => queue.delete(i);
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

export async function launch() {
  if (!existsSync(PW)) return null;
  const { chromium } = await import(pathToFileURL(PW).href);
  return chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
}

/** A card's page at a size, settled and on our clock (at 0). */
export async function openCard(browser, slug, { width, height, dpr = 1 }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  await page.addInitScript(CLOCK);
  await page.goto(`${SITE}/cards/${slug}/index.html?embed=1&radius=0&mat=${MAT}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "html, body { background: #0d0d0d !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600); // the card lays itself out again once its fonts are in
  // the card's handle, whatever its page calls it (an object with its dials and set())
  const period = await page.evaluate(() => {
    const handle = Object.keys(window).map((k) => window[k]).find((o) => o && typeof o === "object" && typeof o.set === "function" && o.values && typeof o.values === "object" && o.period);
    return handle?.period ?? 0;
  });
  return {
    page,
    period,
    tick: (ms) => page.evaluate((m) => window.__tick(m), ms),
    shot: (opts = {}) => page.screenshot({ type: "jpeg", quality: 90, ...opts }),
  };
}
