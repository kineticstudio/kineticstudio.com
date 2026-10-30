#!/usr/bin/env node
/* Copy Hunter's membrane into its Creative Studio prototype.

     node scripts/sync-membrane-prototype.mjs

   Hunter, Oct 25: "Let me play around with the chrome membrane thing. I don't
   know if I always want it to be chrome. Sometimes it could be a flat
   material. I want to play around with the fidelity ... give me parameters
   for this. They could live on a prototype. Don't ship it live." The
   prototype (Studio clients/kinetic/prototypes/03-Membrane.html and its
   membrane-src/js/prototype.js) is written there; this copies in what it runs
   on, from here, so the membrane it shows is the site's own: the engine
   (hunter-membrane.js, and chrome.js for the bloom), the settings
   (src/data/membrane-look.js), his head and his relief, the matcaps, and three.js. Run it
   again after changing any of them. */

import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STUDIO = process.env.STUDIO ?? join(homedir(), "Developer/kinetic/kinetic-creative-studio");
const OUT = join(STUDIO, "clients/kinetic/prototypes/membrane-src");
const THREE = join(ROOT, "node_modules/three");

const copies = [
  ["src/scripts/hunter-membrane.js", "js/hunter-membrane.js"],
  ["src/scripts/chrome.js", "js/chrome.js"],
  ["src/data/membrane-look.js", "js/membrane-look.js"],
  ["public/images/hunter-head.png", "img/hunter-head.png"],
  ["public/images/hunter-scan.png", "img/hunter-scan.png"],
  // the bust's reliefs, one per photo (MEMBRANE_PORTRAITS)
  ...readdirSync(join(ROOT, "public/images"))
    .filter((f) => /^hunter-relief.*\.png$/.test(f))
    .map((f) => [`public/images/${f}`, `img/${f}`]),
  ...readdirSync(join(ROOT, "public/images/matcaps"))
    .filter((f) => f.endsWith(".jpg"))
    .map((f) => [`public/images/matcaps/${f}`, `img/matcaps/${f}`]),
  [join(THREE, "build/three.module.js"), "vendor/three/three.module.js"],
  [join(THREE, "build/three.core.js"), "vendor/three/three.core.js"],
  [join(THREE, "examples/jsm/postprocessing/Pass.js"), "vendor/three/addons/postprocessing/Pass.js"],
];
for (const [from, to] of copies) {
  const src = from.startsWith("/") ? from : join(ROOT, from);
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  mkdirSync(dirname(join(OUT, to)), { recursive: true });
  cpSync(src, join(OUT, to));
}
console.log(`sync-membrane-prototype: ${copies.length} files -> ${OUT.replace(homedir(), "~")}`);
