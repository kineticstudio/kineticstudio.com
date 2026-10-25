#!/usr/bin/env node
/* Make a build work from any folder, not just a domain root.

     node scripts/relativize.mjs dist-studio

   `npm run build:studio` runs it on its own build (dist-studio), which the
   Creative Studio frames in the Kinetic project's Production stage at
   /designs/kinetic/kineticstudio-src/. kineticstudio.com keeps its clean,
   root-absolute URLs: the normal build is never touched.

   Adapted from the Elio site's scripts/relativize.mjs. Every root-absolute
   URL in an attribute (href, src, poster, and the data-src / data-preview the
   loops load from) and in a CSS url(), in .css files and in the font CSS
   Astro inlines into each page, becomes relative to the file it sits in. A
   link to a page gets an explicit index.html, because the Studio's file
   server does not resolve directory indexes. Externals (http, //, #, data:)
   are left alone. Runtime paths built in scripts read <link rel="site-root">,
   which this rewrites like any other href. */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const DIST = resolve(process.argv[2] ?? "dist-studio");

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// Every page route this build emits: any folder holding an index.html.
const PAGES = new Set(
  [...walk(DIST)]
    .filter((file) => file.endsWith("index.html"))
    .map((file) => relative(DIST, file).replace(/index\.html$/, "").replace(/[\\/]+$/, "")),
);

const toRel = (depth, path) => {
  const boundary = path.search(/[?#]/);
  const pathname = boundary < 0 ? path : path.slice(0, boundary);
  const suffix = boundary < 0 ? "" : path.slice(boundary);
  const clean = pathname.replace(/\/+$/, "");
  const target = PAGES.has(clean) ? (clean ? `${clean}/index.html` : "index.html") : clean;
  return (depth === 0 ? "./" : "../".repeat(depth)) + target + suffix;
};

const cssUrls = (depth, src) =>
  src.replace(/url\((['"]?)\/(?!\/)([^'")]*)\1\)/g, (_, q, path) => `url(${q}${toRel(depth, path)}${q})`);

let files = 0;
for (const file of walk(DIST)) {
  const depth = relative(DIST, file).split(sep).length - 1;
  let src, out;
  if (file.endsWith(".html")) {
    src = readFileSync(file, "utf8");
    out = src.replace(
      /(href|src|poster|data-src|data-preview)=("|')\/(?!\/)([^"']*)\2/g,
      (_, attr, q, path) => `${attr}=${q}${toRel(depth, path)}${q}`,
    );
    out = out.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (_, a, css) => `<style${a}>${cssUrls(depth, css)}</style>`);
  } else if (file.endsWith(".js") && /preload-helper/.test(file)) {
    // Vite's preload helper asks for its chunks at the root ("/" + dep);
    // from a folder, a chunk sits beside the helper in _astro/
    src = readFileSync(file, "utf8");
    out = src.replace(/function\((\w)\)\{return`\/`\+\1\}/, (_, v) => `function(${v}){return new URL("../"+${v},import.meta.url).href}`);
  } else if (file.endsWith(".css")) {
    src = readFileSync(file, "utf8");
    out = cssUrls(depth, src);
  } else continue;
  if (out !== src) {
    writeFileSync(file, out);
    files++;
  }
}
console.log(`relativize: rewrote ${files} files in ${relative(process.cwd(), DIST) || DIST}`);
