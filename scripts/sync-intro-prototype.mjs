#!/usr/bin/env node
/* Copy the homepage intro into the Creative Studio's Logo intro prototype.

     node scripts/sync-intro-prototype.mjs

   Hunter, Oct 25: "Let's actually make a prototype. It's just the intro
   sequence. I could replay it and play around with parameters ... Then I
   could copy what I love and then give it to you." The prototype
   (clients/kinetic/prototypes/02-Logo-intro.html in the Studio, with its own
   logo-intro-src/js/prototype.js) runs the site's own intro: logo-intro.js,
   logo-field.js and mark.js, the settings in home-look.js, the logo, and
   GSAP. Re-run after changing any of them. */

import { cpSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STUDIO = process.env.STUDIO ?? join(homedir(), "Developer/kinetic/kinetic-creative-studio");
const OUT = join(STUDIO, "clients/kinetic/prototypes/logo-intro-src");
const GSAP = join(ROOT, "node_modules/gsap");

const copies = [
  ["src/scripts/logo-intro.js", "js/logo-intro.js"],
  ["src/scripts/logo-field.js", "js/logo-field.js"],
  ["src/scripts/mark.js", "js/mark.js"],
  ["src/data/home-look.js", "js/home-look.js"],
  ["src/assets/brand/logo.svg", "img/logo.svg"],
  [join(GSAP, "index.js"), "vendor/gsap/index.js"],
  [join(GSAP, "gsap-core.js"), "vendor/gsap/gsap-core.js"],
  [join(GSAP, "CSSPlugin.js"), "vendor/gsap/CSSPlugin.js"],
];
for (const [from, to] of copies) {
  const dest = join(OUT, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(from.startsWith("/") ? from : join(ROOT, from), dest);
}
console.log(`sync-intro-prototype: ${copies.length} files -> ${OUT.replace(homedir(), "~")}`);
