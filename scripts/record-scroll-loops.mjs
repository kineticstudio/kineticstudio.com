#!/usr/bin/env node
/* A looping scroll-through of each homepage project's site, for its modal.

     node scripts/record-scroll-loops.mjs [slug ...] [--encode]

   Hunter, Oct 25: "For all of the work, instead of having the videos in the
   modal once you click it (or the actual code in the modal when you click
   it), let's have it be videos looping through the page. Keep the code,
   though." So each project's modal plays its page, top to bottom, in a loop
   (src/scripts/project-modal.js); the live page in an iframe stays behind a
   flag for later.

   The page is whatever the modal would open (src/data/sites.json: the copy
   hosted with us, through the dev server SITE, or the live page), at
   1600 x 1000 in a headless Chromium. Analytics, chat and consent scripts are
   blocked, so no cookie banner shows (any that still does is declined, then
   hidden). The page is scrolled end to end once so everything it loads lazily
   is in the cache, then loaded again and recorded in real time (the
   compositor's own frames, so its videos and motion run at their own speed)
   while it scrolls at one steady pace: a short hold at the top, an eased
   start, a constant speed, an eased stop, a hold at the bottom, then a
   crossfade back to the first frame, so the loop has no seam.

   Writes public/media/scroll/<slug>.mp4 (H.264, 1600 x 1000, 30 fps, no
   audio, faststart, under about 4 MB) and <slug>.jpg (its first frame), and
   records the pair in src/data/scroll-loops.json. A page in MOMENTS stops on
   the way down for a moment acted out with real pointer events and a drawn
   cursor (the Anthropic globe is grabbed and flung round). Each take is kept in
   SCROLL_TMP (the system temp folder by default), so --encode makes the loops
   again from them without recording. Needs ffmpeg and, for the copies, the dev server. */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, SITE } from "./card-frames.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/media/scroll");
const DATA = join(ROOT, "src/data/scroll-loops.json");
const SITES = JSON.parse(readFileSync(join(ROOT, "src/data/sites.json"), "utf8"));
const { WORK, HOME } = await import(new URL("../src/data/work.js", import.meta.url).href);
const args = process.argv.slice(2);
const ENCODE = args.includes("--encode"); // again from the kept takes, no recording
const only = args.filter((a) => !a.startsWith("--"));
const TMP = process.env.SCROLL_TMP ?? join(tmpdir(), "scroll-loops");

const W = 1600, H = 1000, FPS = 30;
// about 4 MB a loop; a page heavy with film and texture may take up to 6 MB rather than smear
const MAX_BYTES = 4.2e6, HEAVY_BYTES = 6.0e6, TARGET_BYTES = 5.8e6;
// the pace: px a second at full speed, the clip's scroll time kept in 12..22 s
const SPEED = 520, MIN_S = 12, MAX_S = 22;
const RAMP = 1.1; // s to reach full speed, and to stop
const HOLD_TOP = 1.2, HOLD_END = 1.4, FADE = 0.8; // s

/* Per site, where a page needs a nudge: url (a different page), wait (ms
   more to settle), css (more to hide), stop (px short of the very bottom). */
const TWEAKS = {
  // its background films stream from Vimeo, which turns a headless browser away with a notice
  // in the frame: hidden, the section shows the still the page itself keeps behind each one
  "new-era": { css: `iframe[src*="player.vimeo.com"] { visibility: hidden !important; }` },
};

/* Per site, a moment on the way down, where the page has a piece worth playing
   with: the scroll glides to `to` (a selector; align "end" puts its foot at the
   frame's foot, "start" its top under `offset` px), holds, and play(page, hand)
   acts it out with real pointer events, a cursor drawn in the frame; then the
   scroll carries on to the bottom at the usual pace. */
const MOMENTS = {
  // the globe Kinetic built for the page: the hand comes in, grabs it and flings it about a turn,
  // lets go and leaves while it coasts back into its slow turn (public/sites/anthropic-community/_kinetic)
  "anthropic-community": {
    to: ".kc-globe", align: "end",
    async play(page, hand) {
      const g = await page.evaluate(() => window.__kcGlobe?.sphere());
      if (!g) return;
      const top = g.y - g.r; // the sphere's top in the frame
      const sy = Math.min(H - 150, top + 0.42 * (H - top)), sx = g.x - 0.62 * g.r;
      await hand.show(sx - 170, sy + 120);
      await hand.wait(0.35);
      await hand.glide([sx, sy], 0.85);
      await hand.wait(0.2);
      await hand.down();
      await hand.wait(0.12);
      // the stroke: an eased start that is still going when it lets go, so the globe flies on
      const len = Math.min(W - 70 - sx, 1.4 * g.r);
      await hand.stroke([sx, sy], [sx + len, sy - 46], 0.82, 2.4);
      await hand.up();
      await hand.glide([sx + len + 60, sy - 52], 0.3, "out");
      await hand.wait(0.25);
      await hand.hide();
      await hand.wait(2.4); // it coasts round and settles into its slow turn
    },
  },
};

// the cursor drawn in the frame for a moment (a headless screencast has none): the system arrow
const CURSOR = () => {
  const c = document.createElement("div");
  c.id = "__ks-cursor";
  c.innerHTML = `<svg width="30" height="30" viewBox="0 0 26 26" aria-hidden="true"><path d="M6 3.2v17.6l4.25-4.05 2.75 6.45 3.15-1.35-2.75-6.35h6.05z" fill="#141413" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", opacity: "0", transition: "opacity .28s ease", filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,.28))", transformOrigin: "6px 3px", willChange: "transform, opacity" });
  document.documentElement.appendChild(c);
  let x = 0, y = 0, s = 1;
  const put = () => { c.style.transform = `translate3d(${x - 6}px, ${y - 3}px, 0) scale(${s})`; };
  addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; put(); }, true);
  addEventListener("pointerdown", () => { s = 0.9; put(); }, true);
  addEventListener("pointerup", () => { s = 1; put(); }, true);
  window.__ksCursor = (on) => { c.style.opacity = on ? "1" : "0"; };
};

// a hand for a moment: the mouse moved in real time, at the frame rate, along eased paths
function handFor(page) {
  let at = [W / 2, H / 2];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = { inout: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u), out: (u) => 1 - (1 - u) ** 3 };
  async function path(fn, s) {
    const t0 = performance.now(), dur = s * 1000;
    for (;;) {
      const u = Math.min(1, (performance.now() - t0) / dur);
      at = fn(u);
      await page.mouse.move(at[0], at[1]);
      if (u >= 1) return;
      await sleep(Math.max(0, 1000 / 60 - ((performance.now() - t0) % (1000 / 60))));
    }
  }
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  return {
    wait: (s) => sleep(s * 1000),
    async show(x, y) { at = [x, y]; await page.mouse.move(x, y); await page.evaluate(() => window.__ksCursor?.(true)); },
    // gone, and off the page, so nothing under it stays hovered as the page scrolls on
    async hide() { await page.evaluate(() => window.__ksCursor?.(false)); await sleep(300); await page.mouse.move(-40, -40); },
    glide(to, s, how = "inout") { const from = at; return path((u) => lerp(from, to, ease[how](u)), s); },
    // pressed, from a to b: u^p, so it speeds up all the way and lets go at full speed
    stroke(a, b, s, p = 2) { return path((u) => lerp(a, b, u ** p), s); },
    down: () => page.mouse.down(),
    up: () => page.mouse.up(),
  };
}

const BLOCK = /(antalytics|analytics\.tiktok|tiktok\.com\/i18n\/pixel|isolated-segment|google-analytics|googletagmanager|gtag\/js|segment\.(com|io)|hotjar|clarity\.ms|doubleclick|facebook\.net|connect\.facebook|hs-scripts|hs-analytics|hs-banner|hsforms|hubspot|intercom|posthog|plausible|vercel-insights|vitals\.vercel|sentry|datadog|fullstory|mixpanel|amplitude|linkedin\.com\/px|snap\.licdn|ads-twitter|bat\.bing|cookielaw|onetrust|cookiebot|consentmanager|osano|termly|cookieyes|cookie-script|iubenda|usercentrics|didomi|quantcast|trustarc|cookiehub|klaro|cookiefirst|crisp\.chat|drift\.com|tawk\.to|zdassets|zendesk|livechat|tidio|gorgias|klaviyo|attentive|postscript|privacy-banner|shopifycloud\/consent|rb2b|apollo\.io|clearbit|6sc\.co|g2crowd|reb2b|leadfeeder|vwo|optimizely|mutiny|qualified\.com|chilipiper|userway|accessibe)/i;

// banners that slip through, and floating widgets: hidden
const HIDE = `
  #onetrust-consent-sdk, #onetrust-banner-sdk, #CybotCookiebotDialog, #usercentrics-root, .osano-cm-window, #termly-code-snippet-support,
  .cky-consent-container, .cky-overlay, #cookiescript_injected, .iubenda-cs-container, #didomi-host, .qc-cmp2-container, #truste-consent-track,
  .cc-window, .cc-banner, #cc-main, .cookie-banner, .cookie-consent, .cookies-banner, .cookie-notice, #cookie-notice, #cookie-banner, #cookie-law-info-bar,
  [fs-cc="banner"], [fs-consent-element="banner"], [data-cookie-banner], [aria-label*="cookie" i][role="dialog"], [class*="CookieBanner"], [id*="cookie-banner" i],
  #hubspot-messages-iframe-container, .intercom-lightweight-app, #intercom-container, #crisp-chatbox, .drift-frame-controller, #launcher, [id^="tidio"],
  a[data-cookie-settings], [aria-label="Cookie preferences" i], [aria-label="Cookie settings" i],
  .grecaptcha-badge, #vercel-live-feedback, vercel-live-feedback, [data-nextjs-toast], nextjs-portal, astro-dev-toolbar
  { display: none !important; visibility: hidden !important; }
  html { scroll-behavior: auto !important; }
  ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  html, body { scrollbar-width: none !important; }
`;

const urlFor = (slug) => {
  if (TWEAKS[slug]?.url) return TWEAKS[slug].url;
  const s = SITES[slug];
  const w = WORK.find((x) => x.slug === slug);
  if (s?.hosted) return s.hosted.startsWith("/") ? SITE + s.hosted : s.hosted;
  return w?.url;
};

const ffmpeg = (a) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a], { encoding: "utf8", maxBuffer: 1e8 });
  if (r.status) throw new Error(`ffmpeg: ${r.stderr}`);
};

async function settle(page, ms) {
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(ms);
}

// decline any consent prompt that showed anyway (non-essential off), then hide what's left
async function quiet(page, css) {
  await page.addStyleTag({ content: HIDE + (css ?? "") }).catch(() => {});
  await page.evaluate(() => {
    const words = /^(reject( all)?|decline( all)?|deny( all)?|only (necessary|essential)|necessary only|essential only|refuse( all)?|no,? thanks)$/i;
    for (const b of document.querySelectorAll("button, a[role=button], [role=button]")) {
      if (words.test((b.textContent ?? "").trim())) b.click();
    }
  }).catch(() => {});
}

// the page's scroller: the document, or the one element that scrolls in its place
const SCROLLER = () => {
  const doc = document.scrollingElement ?? document.documentElement;
  let best = doc, room = doc.scrollHeight - innerHeight;
  if (room < 50) {
    for (const el of document.querySelectorAll("body *")) {
      const st = getComputedStyle(el);
      if (!/(auto|scroll|overlay)/.test(st.overflowY)) continue;
      const r = el.scrollHeight - el.clientHeight;
      if (r > room && el.clientHeight > innerHeight * 0.6) (best = el), (room = r);
    }
  }
  window.__scroller = best;
  return room;
};

async function warm(page) {
  // end to end at a brisk pace, so lazy images and sections load into the cache
  const room = await page.evaluate(SCROLLER);
  for (let y = 0; y <= room + 1000; y += 500) {
    await page.evaluate((v) => window.__scroller.scrollTo({ top: v, behavior: "instant" }), y);
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(800);
  return page.evaluate(SCROLLER);
}

async function record(browser, slug) {
  const url = urlFor(slug);
  const tw = TWEAKS[slug] ?? {};
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "no-preference" });
  await ctx.route("**/*", (r) => (BLOCK.test(r.request().url()) ? r.abort() : r.continue()));
  const page = await ctx.newPage();
  const go = async () => {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    } catch {
      await page.waitForTimeout(3000);
    }
    await quiet(page, tw.css);
    await settle(page, 1500 + (tw.wait ?? 0));
  };
  await go();
  await warm(page);
  await page.evaluate(() => window.__scroller.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(400);
  // fresh, so its reveals play as the scroll reaches them, now from the cache
  await go();
  const room = Math.max(0, (await page.evaluate(SCROLLER)) - (tw.stop ?? 0));
  await page.evaluate(() => window.__scroller.scrollTo({ top: 0, behavior: "instant" }));
  await quiet(page, tw.css);
  await page.waitForTimeout(1200);

  // a moment on the way down: where the scroll stops for it
  const mo = MOMENTS[slug];
  let stopAt = 0;
  if (mo) {
    await page.evaluate(CURSOR);
    stopAt = await page.evaluate(({ to, align, offset }) => {
      const el = document.querySelector(to);
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.round(align === "end" ? r.bottom + scrollY - innerHeight : r.top + scrollY - (offset ?? 0)));
    }, { to: mo.to, align: mo.align, offset: mo.offset });
    stopAt = Math.min(stopAt, room);
  }

  // the pace: a trapezoid of speed, RAMP s up and down, as long as the page needs
  // (with a moment: a short eased glide down to it, then the rest of the page at that pace)
  const rest = room - stopAt;
  const S = Math.min(MAX_S, Math.max(MIN_S, rest / SPEED + RAMP));
  const v = rest / (S - RAMP); // full speed, px/s
  const S0 = stopAt ? Math.max(0.9, Math.min(2.4, stopAt / SPEED + RAMP)) : 0;

  const dir = join(TMP, slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    frames.push({ file, t: metadata.timestamp });
    writeFileSync(file, Buffer.from(data, "base64"));
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await page.waitForTimeout(150);
  const t0 = Date.now() / 1000;
  // from y0 to y1 after a delay: a trapezoid of speed (full speed v, RAMP s each end), or, for a
  // short glide (v 0), one cosine ease over S
  const glide = (o) => page.evaluate(({ y0, y1, S, v, RAMP, delay }) => new Promise((done) => {
    const el = window.__scroller;
    const d = y1 - y0, a = v / RAMP; // accel
    const at = (t) => {
      if (t <= 0) return y0;
      if (t >= S) return y1;
      if (!v) return y0 + d * (0.5 - 0.5 * Math.cos((Math.PI * t) / S));
      if (t < RAMP) return y0 + 0.5 * a * t * t;
      if (t > S - RAMP) return y1 - 0.5 * a * (S - t) ** 2;
      return y0 + 0.5 * a * RAMP * RAMP + v * (t - RAMP);
    };
    const start = performance.now() + delay * 1000;
    const step = () => {
      const t = (performance.now() - start) / 1000;
      el.scrollTo({ top: Math.round(at(t)), behavior: "instant" });
      if (t < S) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  }), o);
  if (mo) {
    await glide({ y0: 0, y1: stopAt, S: S0, v: 0, RAMP, delay: HOLD_TOP });
    await mo.play(page, handFor(page));
    await glide({ y0: stopAt, y1: room, S, v, RAMP, delay: 0.1 });
  } else {
    await glide({ y0: 0, y1: room, S, v, RAMP, delay: HOLD_TOP });
  }
  await page.waitForTimeout(HOLD_END * 1000 + 100);
  const total = Date.now() / 1000 - 0.1 - t0; // as long as it took, to the end of the bottom hold
  await cdp.send("Page.stopScreencast");
  await page.waitForTimeout(200);
  await ctx.close();

  // the frames on their own clock, from the one on screen at t0 (a still page sends no
  // new frames until it moves): the concat list holds each until the next
  const lead = Math.max(0, frames.findLastIndex((f) => f.t <= t0));
  const list = frames.slice(lead);
  if (list.length < 30) throw new Error(`${slug}: only ${list.length} frames`);
  const intervals = list.slice(1).map((f, i) => f.t - list[i].t).sort((x, y) => x - y);
  const med = intervals[Math.floor(intervals.length / 2)];
  const p95 = intervals[Math.floor(intervals.length * 0.95)];
  let txt = "";
  for (let i = 0; i < list.length; i++) {
    const end = i + 1 < list.length ? list[i + 1].t : t0 + total;
    const d = Math.max(0.001, end - Math.max(list[i].t, t0));
    txt += `file '${list[i].file}'\nduration ${d.toFixed(4)}\n`;
  }
  txt += `file '${list.at(-1).file}'\n`;
  writeFileSync(join(dir, "list.txt"), txt);

  // the take, at an even 30 fps, then the crossfade from the bottom back to its first frame
  // (the screenshots are full-range BT.601 JPEGs: the video is BT.709, TV range, tagged so)
  const take = join(dir, "take.mp4");
  const tv = `scale=${W}:${H}:flags=lanczos:in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p`;
  const tags = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
  ffmpeg(["-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", `fps=${FPS},${tv}`, "-t", total.toFixed(3), "-c:v", "libx264", "-preset", "medium", "-crf", "12", ...tags, take]);
  // the frames go; the take stays, so a new encode needs no new recording (--encode)
  for (const f of list.concat(frames)) rmSync(f.file, { force: true });
  const meta = { url, room, S, v, total, frames: list.length, median: med, p95 };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta));
  return meta;
}

/* The loop from its take: the bottom crossfades back to the first frame, so it closes on
   itself. CRF 24 when that fits MAX_BYTES, else CRF 27 when that fits HEAVY_BYTES, else two
   passes at the bitrate that fills TARGET_BYTES (bits spent where the page moves). */
function encode(slug, { total }) {
  const take = join(TMP, slug, "take.mp4");
  const loop = join(OUT, `${slug}.mp4`);
  const graph = [
    `[0:v]fps=${FPS},settb=1/${FPS},setsar=1,split[m][b]`,
    `[b]trim=end_frame=1,loop=loop=${Math.ceil((FADE + 0.5) * FPS)}:size=1:start=0,setpts=N/${FPS}/TB,settb=1/${FPS}[f]`,
    `[m][f]xfade=transition=fade:duration=${FADE}:offset=${(total - FADE).toFixed(3)},format=yuv420p`,
  ].join(";");
  const tags = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
  const base = ["-i", take, "-filter_complex", graph, "-t", total.toFixed(3), "-an", "-c:v", "libx264", "-preset", "veryslow", "-profile:v", "high", "-pix_fmt", "yuv420p", ...tags, "-g", String(FPS * 2)];
  ffmpeg([...base, "-crf", "24", "-movflags", "+faststart", loop]);
  let how = "crf 24";
  if (statSync(loop).size > MAX_BYTES) {
    ffmpeg([...base, "-crf", "27", "-movflags", "+faststart", loop]);
    how = "crf 27";
  }
  if (statSync(loop).size > HEAVY_BYTES) {
    const kbps = Math.floor((TARGET_BYTES * 8) / total / 1000);
    const log = join(TMP, slug, "x264");
    ffmpeg([...base, "-b:v", `${kbps}k`, "-pass", "1", "-passlogfile", log, "-f", "mp4", "/dev/null"]);
    ffmpeg([...base, "-b:v", `${kbps}k`, "-maxrate", `${Math.round(kbps * 2)}k`, "-bufsize", `${kbps * 4}k`, "-pass", "2", "-passlogfile", log, "-movflags", "+faststart", loop]);
    how = `2-pass ${kbps} kb/s`;
  }
  ffmpeg(["-i", loop, "-frames:v", "1", "-q:v", "3", join(OUT, `${slug}.jpg`)]);
  return { mb: statSync(loop).size / 1e6, how };
}

mkdirSync(OUT, { recursive: true });
const data = existsSync(DATA) ? JSON.parse(readFileSync(DATA, "utf8")) : {};
const browser = ENCODE ? null : await launch();
if (!browser && !ENCODE) throw new Error("record-scroll-loops: playwright-core not found (PLAYWRIGHT_CORE)");
for (const slug of only.length ? only : HOME) {
  try {
    const meta = ENCODE ? JSON.parse(readFileSync(join(TMP, slug, "meta.json"), "utf8")) : await record(browser, slug);
    const { mb, how } = encode(slug, meta);
    const { url, room, S, v, total, frames, median, p95 } = meta;
    console.log(`${slug.padEnd(20)} ${url}\n${"".padEnd(20)} ${room}px in ${S.toFixed(1)}s (${Math.round(v)} px/s), ${total.toFixed(1)}s loop, ${mb.toFixed(2)} MB (${how}), ${frames} frames, median ${(1000 * median).toFixed(1)}ms, p95 ${(1000 * p95).toFixed(1)}ms`);
    data[slug] = { video: `/media/scroll/${slug}.mp4`, poster: `/media/scroll/${slug}.jpg`, duration: Number(total.toFixed(2)), from: url.replace(SITE, "") };
    // in the homepage order
    const sorted = Object.fromEntries(Object.entries(data).sort(([x], [y]) => (HOME.indexOf(x) + 1 || 99) - (HOME.indexOf(y) + 1 || 99)));
    writeFileSync(DATA, `${JSON.stringify(sorted, null, 2)}\n`);
  } catch (e) {
    console.log(`${slug.padEnd(20)} failed: ${e.message.split("\n")[0]}`);
  }
}
await browser?.close();
