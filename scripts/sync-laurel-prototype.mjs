#!/usr/bin/env node
/* Copy the award laurel's engine into its Creative Studio prototype.

     node scripts/sync-laurel-prototype.mjs

   Hunter, Oct 24: "Let's work on the laurels on our own prototype tab inside
   of the creative studio. I just want to see one of them, like the Webby one."
   The prototype (Studio clients/kinetic/prototypes/01-Award-laurel.html and
   its award-laurel-src/js/prototype.js) is written there; this copies in what
   it runs on, from here, so the laurel it shows is the site's own: the
   engine (laurel.js, chrome.js), the settings (src/data/laurel-look.js),
   three.js and the addons they use, the body font and the Webby logo. Run it
   again after changing any of them. */

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STUDIO = process.env.STUDIO ?? join(homedir(), "Developer/kinetic/kinetic-creative-studio");
const OUT = join(STUDIO, "clients/kinetic/prototypes/award-laurel-src");
const THREE = join(ROOT, "node_modules/three");

const copies = [
  ["src/scripts/laurel.js", "js/laurel.js"],
  ["src/scripts/chrome.js", "js/chrome.js"],
  ["src/data/laurel-look.js", "js/laurel-look.js"],
  ["src/data/home-look.js", "js/home-look.js"], // laurel-look reads a homepage tuning through it
  ["src/assets/fonts/PPNeueMontreal-Regular.woff2", "fonts/PPNeueMontreal-Regular.woff2"],
  ["src/assets/fonts/PPNeueMontrealMono-Book.woff2", "fonts/PPNeueMontrealMono-Book.woff2"],
  ["public/images/awards/webby.svg", "img/webby.svg"],
  ["public/images/awards/awwwards.svg", "img/awwwards.svg"],
  ["public/images/awards/sxsw.svg", "img/sxsw.svg"],
  [join(THREE, "build/three.module.js"), "vendor/three/three.module.js"],
  [join(THREE, "build/three.core.js"), "vendor/three/three.core.js"],
  [join(THREE, "examples/jsm/environments/RoomEnvironment.js"), "vendor/three/addons/environments/RoomEnvironment.js"],
  [join(THREE, "examples/jsm/utils/BufferGeometryUtils.js"), "vendor/three/addons/utils/BufferGeometryUtils.js"],
  [join(THREE, "examples/jsm/postprocessing/Pass.js"), "vendor/three/addons/postprocessing/Pass.js"],
];
for (const [from, to] of copies) {
  const src = from.startsWith("/") ? from : join(ROOT, from);
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  mkdirSync(dirname(join(OUT, to)), { recursive: true });
  cpSync(src, join(OUT, to));
}
console.log(`sync-laurel-prototype: ${copies.length} files -> ${OUT.replace(homedir(), "~")}`);
