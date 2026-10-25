#!/usr/bin/env node
/* Keep a working copy of a project's site with us, for its modal.

     node scripts/capture-site.mjs <slug> <url> [--from <archive url>]

   Hunter, Oct 24: each project opens "a full-screen grab of the best page
   ... fully interactive ... we want to make sure we do have the best code for
   all of the sites hosted with us". Live sites change, go away (elio.com is
   for sale) or refuse to be framed, so the page is captured once and served
   from public/sites/<slug>/.

   The page is loaded in a headless Chromium at 1440 x 900 and scrolled end to
   end, slowly, so everything it loads lazily loads; every file it fetched is
   saved: its own under its own path, other hosts' under _ext/<host>/. Then
   the HTML, CSS and scripts are rewritten to point at the copies, absolute
   URLs and root-relative paths alike (a script that builds a URL at run time
   can still reach for the original, so check the copy works before using it:
   the script prints what it saved and what it could not). The original
   document is kept, not the rendered DOM, so the site's own scripts run as
   they did. Analytics and tag managers are left out.

   --from takes an archive capture (web.archive.org/web/<stamp>id_/<url>) when
   the live site is no longer Kinetic's version. */

import { mkdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [slug, url] = process.argv.slice(2);
const from = process.argv.includes("--from") ? process.argv[process.argv.indexOf("--from") + 1] : null;
// --static: the page as it stands once rendered and scrolled, without its scripts. For
// sites whose scripts need their own server (a Next.js app router asks it for every
// view): the look holds, the motion that ran on scripts is frozen where it ended.
const STATIC = process.argv.includes("--static");
// --as-root: the page is told it is at "/" before its scripts start, so a router
// that only knows the site's own routes (Next.js) wakes up on its home route
const AS_ROOT = process.argv.includes("--as-root");
if (!slug || !url) throw new Error("usage: node scripts/capture-site.mjs <slug> <url> [--from <archive url>]");
const PW = process.env.PLAYWRIGHT_CORE ?? join(homedir(), "Developer/kinetic/creative-studio-supercut/node_modules/playwright-core/index.mjs");
const { chromium } = await import(pathToFileURL(PW).href);

const OUT = join(ROOT, "public/sites", slug);
const BASE = `/sites/${slug}/`;
const origin = new URL(url).origin;
const SKIP = /(a\.claude\.com|antalytics|analytics\.tiktok|pixel-config\.reddit|alb\.reddit|pixels?\.(by)?spotify|rmp\.rakuten|hubspotonwebflow|google-analytics|googletagmanager|gtag\/js|segment\.(com|io)|hotjar|clarity\.ms|doubleclick|facebook\.net|connect\.facebook|hs-scripts|hs-analytics|hsforms|intercom|posthog|plausible|vercel-insights|vitals\.vercel|sentry|datadog|fullstory|mixpanel|amplitude|linkedin\.com\/px|snap\.licdn|ads-twitter|t\.co\/|bat\.bing)/i;
const TEXT = /^(text\/|application\/(javascript|x-javascript|json|xml|manifest\+json)|image\/svg)/;
// not kept, and left pointing where they were: streamed video (signed segments that
// expire; a Vimeo embed streams from Vimeo as on the real page) and a store's widgets
const LEAVE = /(vimeocdn\.com|player\.vimeo\.com|vimeo\.com|youtube\.com|ytimg\.com|gorgias|klaviyo|postscript\.io|attentive|web-pixels|shopifycloud\/(web-pixels|privacy-banner|consent)|monorail|trekkie)/i;

// where a fetched URL lives in the copy
const local = (u) => {
  const x = new URL(u);
  // decoded, except a segment's encoded slashes, which the page asks for as they are
  let path = x.pathname.split("/").map((seg) => (/%2f/i.test(seg) ? seg : decodeURIComponent(seg))).join("/");
  if (path.endsWith("/")) path += "index.html";
  if (!extname(path)) path += x.pathname.endsWith("/") ? "" : "/index.html";
  if (x.search) {
    const h = createHash("sha1").update(x.search).digest("hex").slice(0, 8);
    const e = extname(path);
    path = `${path.slice(0, path.length - e.length)}.${h}${e}`;
  }
  const host = x.origin === origin ? "" : `_ext/${x.host}`;
  return join(host, path).replace(/^\/+/, "");
};

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" });
const page = await context.newPage();
const files = new Map(); // url -> { type, body }
const partial = new Set(); // media the page streamed in pieces (206): fetched whole after
let doc = null;
await page.route("**/*", (route) => (SKIP.test(route.request().url()) ? route.abort() : route.continue()));
page.on("response", async (res) => {
  const req = res.request();
  const u = res.url();
  if (req.method() !== "GET" || !/^https?:/.test(u)) return;
  if (res.status() === 206) return void partial.add(u);
  if (res.status() !== 200) return;
  try {
    const body = await res.body();
    const type = (res.headers()["content-type"] ?? "").split(";")[0].trim();
    if (req.resourceType() === "document" && req.frame() === page.mainFrame() && !doc) doc = { url: u, body };
    else files.set(u, { type, body });
  } catch {}
});
// loaded, then a while for the network to settle (a store keeps polling, so not forever)
await page.goto(from ?? url, { waitUntil: "load", timeout: 90000 });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
// scroll it end to end so every lazy thing loads, then back to the top
await page.evaluate(async () => {
  const step = innerHeight * 0.6;
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
    scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 350));
  }
  scrollTo(0, 0);
});
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
// for --static: each picture pinned to the file it actually loaded, then the page as drawn
const rendered = STATIC
  ? await page.evaluate(() => {
      for (const img of document.querySelectorAll("img")) {
        if (img.currentSrc) img.setAttribute("src", img.currentSrc);
        img.removeAttribute("srcset");
        img.removeAttribute("sizes");
        img.removeAttribute("loading");
      }
      for (const src of document.querySelectorAll("picture source")) src.remove();
      for (const v of document.querySelectorAll("video")) if (v.currentSrc) v.setAttribute("src", v.currentSrc);
      // a cookie or consent bar frozen in place would never go away: drop the fixed ones
      for (const el of [...document.body.querySelectorAll("*")]) {
        const name = `${el.id} ${el.className?.baseVal ?? el.className}`;
        if (!/osano|onetrust|cookie|consent|gdpr|\bcmp\b/i.test(name)) continue;
        if (/fixed|sticky/.test(getComputedStyle(el).position)) el.remove();
      }
      return "<!doctype html>\n" + document.documentElement.outerHTML;
    })
  : null;
await browser.close();
if (!doc) throw new Error("no document captured");
for (const u of partial) {
  if (files.has(u)) continue;
  try {
    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/130" } });
    if (r.ok) files.set(u, { type: (r.headers.get("content-type") ?? "").split(";")[0], body: Buffer.from(await r.arrayBuffer()) });
  } catch {}
}

// the original page and everything it fetched, rewritten to point at the copy
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const u of [...files.keys()]) if (LEAVE.test(u)) files.delete(u);
const all = [...files.keys()];
const hosts = [...new Set(all.map((u) => new URL(u).origin))];
// root-relative paths the site's own files sit under ("/_next/", "/assets/" ...)
const roots = [...new Set(all.filter((u) => new URL(u).origin === origin).map((u) => new URL(u).pathname.split("/")[1]).filter(Boolean))];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rewrite = (text) => {
  let t = text;
  for (const h of hosts) {
    const to = h === origin ? BASE : `${BASE}_ext/${new URL(h).host}/`;
    t = t.replace(new RegExp(`${esc(h)}/`, "g"), to).replace(new RegExp(`${esc(h.replace(/^https?:/, ""))}/`, "g"), to);
  }
  for (const r of roots) t = t.replace(new RegExp(`(["'(\\s=,])/${esc(r)}/`, "g"), `$1${BASE}${r}/`);
  return t;
};
let bytes = 0, count = 0;
const put = (path, body, type) => {
  // a name with encoded characters is kept both ways, as hosts differ in which they ask for
  if (/%[0-9a-f]{2}/i.test(path)) {
    const plainName = path.split("/").map((seg) => { try { return decodeURIComponent(seg); } catch { return seg; } }).join("/");
    if (plainName !== path && !plainName.includes("..")) write(plainName, body, type);
  }
  write(path, body, type);
};
const write = (path, body, type) => {
  const file = join(OUT, path);
  mkdirSync(dirname(file), { recursive: true });
  const text = TEXT.test(type) || /\.(html|css|js|mjs|json|svg)$/.test(path);
  const out = text ? pin(rewrite(body.toString("utf8"))) : body;
  writeFileSync(file, out);
  bytes += statSync(file).size;
  count++;
};
// the page itself, with the analytics gone
// files the page asked for with a query string, where their copies sit
const queried = all.filter((u) => u.includes("?")).map((u) => [rewrite(u), BASE + local(u)]);
const pin = (text) => {
  let t = text;
  for (const [a, b] of queried) t = t.split(a.replace(/&/g, "&amp;")).join(b).split(a).join(b);
  return t;
};
let html = pin(rewrite(STATIC ? rendered : doc.body.toString("utf8")));
if (AS_ROOT) html = html.replace(/<head([^>]*)>/i, `<head$1><script>history.replaceState(history.state, "", "/" + location.hash)</script>`);
if (STATIC) {
  // only a video embed keeps its frame; chat, pixels and bot checks go, with any link to a widget's host
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (tag) => (/player\.vimeo\.com|youtube(-nocookie)?\.com\/embed/i.test(tag) ? tag : ""));
  html = html.replace(/<(link|img)\b[^>]*>/gi, (tag) => (/https?:\/\/[^"']*(klaviyo|gorgias|postscript|yotpo|osano|clarity|snapchat|bing\.com|tapad|rakuten|rise-ai|revy|kiwisizing|nice-team|isenselabs|consentmo|zen\.ai|challenges\.cloudflare|shopifysvc|shop\.app)/i.test(tag) ? "" : tag));
  html = html.replace(/<link\b[^>]*rel="(preconnect|dns-prefetch)"[^>]*>/gi, "");
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<link\b[^>]*rel="(modulepreload|preload)"[^>]*as="script"[^>]*>/gi, "").replace(/<link\b[^>]*as="script"[^>]*rel="preload"[^>]*>/gi, "");
}
// the rewrite changes the files, so their integrity pins would block them
html = html.replace(/\sintegrity="[^"]*"/gi, "");
const TRACK = /googletagmanager|google-analytics|gtag\(|hotjar|clarity\.ms|segment\.(com|io)|posthog|plausible|intercom|hs-scripts|fbq\(|connect\.facebook|snap\.licdn|linkedin\.com\/px|_linkedin_partner|twq\(|ads-twitter|termly|cookieyes|onetrust/i;
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => (TRACK.test(tag) ? "" : tag));
html = html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, (tag) => (TRACK.test(tag) ? "" : tag));
const plain = (u) => local(u.split("?")[0]);
const byPath = new Map();
for (const u of files.keys()) byPath.set(plain(u), (byPath.get(plain(u)) ?? 0) + 1);
for (const [u, { type, body }] of files) {
  put(local(u), body, type);
  if (u.includes("?") && byPath.get(plain(u)) === 1) put(plain(u), body, type);
}
// the page last, so a prefetch of the same address never writes over it
writeFileSync(join(OUT, "index.html"), html);
const big = [...files].filter(([, f]) => f.body.length > 20e6).map(([u]) => u);
console.log(`capture-site: ${slug} ${count + 1} files, ${(bytes / 1e6).toFixed(1)} MB -> public/sites/${slug}/ (open /sites/${slug}/)`);
if (big.length) console.log(`  over 20 MB (the host's limit is 25): ${big.join(", ")}`);
