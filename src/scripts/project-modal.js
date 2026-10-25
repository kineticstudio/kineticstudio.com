/* A project, opened: its site's best page full screen and fully working,
   grown out of the tile it was clicked on (Hunter, Oct 24: "let's open a
   modal for each project. It's just a full-screen grab of the best page ...
   and it's fully interactive. It needs to tween from the index card to the
   modal perfectly clearly").

   A link carries data-project and what the modal needs:
     data-site    the page to open in it: a copy hosted with us (/sites/<slug>/),
                  or the live page where the site allows framing; none = its loop
     data-url     the live site, for Visit site
     data-name    the project's name
     data-still   the picture the tween grows: the page's own still
                  (scripts/site-stills.mjs), or the tile's first frame
     data-still-mat  set when that still is the tile's, mat and all
     data-loop    the tile's loop, shown when there is no page to open
     data-inset   the share of the tile's width its mat takes on each side,
                  so the tween starts from the site's window, not the mat

   The tile's window grows into a modal over the page (Hunter, Oct 24: "I
   don't want it to open full screen. I want it to open in a modal"),
   showing its still; the page loads behind and crossfades in once both are
   ready. Close (the button, Escape, a click outside) shrinks it back into
   the tile it came from.

   Hunter, Oct 25: "instead of having the videos in the modal once you click
   it (or the actual code in the modal when you click it), let's have it be
   videos looping through the page. Keep the code, though." With SCROLL_LOOPS
   on, a project in src/data/scroll-loops.json (scripts/record-scroll-loops.mjs)
   plays its page scrolling top to bottom, on a loop; the tween grows that
   video's first frame, so the handover is the same picture. A project without
   one, or everything with the flag off, opens as before: its page, or its loop. */

import { gsap } from "gsap";
import SCROLLS from "@/data/scroll-loops.json";
import { WORK } from "@/data/work.js";

// false: the modal opens the page itself again (data-site), as on Oct 24
const SCROLL_LOOPS = true;
// the site's root, so the loops' root paths also resolve where the site is served
// from a folder (the Creative Studio frames the build at /designs/kinetic/kineticstudio-src/)
const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const fromRoot = (p) => (p?.startsWith("/") ? new URL(p.slice(1), ROOT).href : p);
/* What Kinetic did on it, in pills beside its name (Hunter, Oct 25: "little
   pills that are next to each other that say what we did, like web design,
   creative direction, brand, web development"): every project is directed by
   hand, then its disciplines from src/data/work.js. */
const DID = { Development: "Web development" };
const didOn = (slug) => {
  const w = WORK.find((x) => x.slug === slug);
  return w ? ["Creative direction", ...(w.does ?? []).map((d) => DID[d] ?? d)] : [];
};
const scrollOf = (slug) => {
  const s = SCROLL_LOOPS && slug ? SCROLLS[slug] : null;
  return s ? { ...s, video: fromRoot(s.video), poster: fromRoot(s.poster) } : null;
};

let ui = null;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function build() {
  const root = document.createElement("div");
  root.className = "pm_wrap theme-dark";
  root.hidden = true;
  root.innerHTML = `
    <div class="pm_veil"></div>
    <div class="pm_frame" role="dialog" aria-modal="true">
      <div class="pm_still"></div>
      <video class="pm_loop" muted loop playsinline preload="none" aria-hidden="true"></video>
      <video class="pm_scroll" muted loop playsinline preload="auto" hidden></video>
      <iframe class="pm_site" title="" allow="autoplay; fullscreen; clipboard-write" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </div>
    <div class="pm_bar">
      <span class="pm_name text-style-label"></span>
      <span class="pm_did"></span>
      <a class="pm_visit pill is-primary" target="_blank" rel="noopener">Visit site <span aria-hidden="true">↗</span></a>
      <button class="pm_close" type="button" aria-label="Close"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>
    </div>`;
  document.body.append(root);
  const q = (s) => root.querySelector(s);
  ui = { root, veil: q(".pm_veil"), frame: q(".pm_frame"), still: q(".pm_still"), loop: q(".pm_loop"), scroll: q(".pm_scroll"), site: q(".pm_site"), bar: q(".pm_bar"), name: q(".pm_name"), did: q(".pm_did"), visit: q(".pm_visit"), close: q(".pm_close") };
  // the scroll-through: a click holds it still, another plays it on
  ui.scroll.addEventListener("click", () => (ui.scroll.paused ? ui.scroll.play().catch(() => {}) : ui.scroll.pause()));
  ui.scroll.addEventListener("playing", () => {
    if (!state || !state.scroll) return;
    state.ready = true;
    reveal();
  });
  ui.close.addEventListener("click", close);
  ui.veil.addEventListener("click", close);
  addEventListener("keydown", (e) => e.key === "Escape" && state && close());
  // a new window size: the modal keeps its place in it
  addEventListener("resize", () => {
    if (!state) return;
    M = modalRect();
    Object.assign(ui.frame.style, { left: `${M.x}px`, top: `${M.y}px`, width: `${M.w}px`, height: `${M.h}px` });
    ui.bar.style.top = `${M.y + M.h + 14}px`;
    fitScroll(state.framed ? Number(state.link.dataset.inset || 0) : 0);
  });
  return ui;
}

let state = null; // { link, ready, grown, scroll }

// the tile's site window on screen: the tile less its mat (or, whole, the tile)
function windowOf(link, whole = false) {
  const tile = link.closest("[data-card-src], [data-loop-src], .work-card_media, .wheel_card") ?? link;
  const r = tile.getBoundingClientRect();
  const m = whole ? 0 : Number(link.dataset.inset || 0) * r.width;
  return { x: r.left + m, y: r.top + m, w: Math.max(1, r.width - 2 * m), h: Math.max(1, r.height - 2 * m) };
}
// the modal: the site's own 16:10, as big as the screen allows with room round it for the veil and the bar
function modalRect() {
  const w = Math.min(innerWidth * (innerWidth < 640 ? 0.94 : 0.86), 1360, (innerHeight - 150) * 1.6);
  const h = Math.min(w / 1.6, innerHeight - 150);
  return { x: (innerWidth - w) / 2, y: Math.max(16, (innerHeight - h) / 2 - 22), w, h };
}
let M = { x: 0, y: 0, w: 1, h: 1 };
// the scroll-through in the mat's window (inset = the mat's share of the width), its
// corners a little tighter than the tile's; with no mat, the whole frame
function fitScroll(inset) {
  const m = inset * M.w;
  Object.assign(ui.scroll.style, inset
    ? { inset: "auto", left: `${m}px`, top: `${m}px`, width: `${M.w - 2 * m}px`, height: `${M.h - 2 * m}px`, borderRadius: "calc(var(--radius-media, 0.75rem) * 0.75)" }
    : { inset: "", left: "", top: "", width: "", height: "", borderRadius: "" });
}
const fromRect = (b) => ({ x: b.x - M.x, y: b.y - M.y, scaleX: b.w / M.w, scaleY: b.h / M.h });

function reveal() {
  // the page (or its scroll-through) takes over once it has loaded and the frame has grown
  if (!state || !state.ready || !state.grown) return;
  gsap.to(state.scroll ? ui.scroll : ui.site, { opacity: 1, duration: state.scroll ? 0.25 : 0.45, ease: "power1.out" });
}

export function openProject(link) {
  const u = ui ?? build();
  const d = link.dataset;
  const scroll = scrollOf(d.project);
  /* A scroll-through plays in the tile's own border (Hunter, Oct 25: "The video
     that plays once you click a piece of work should have the same border as
     the thumbnail"): the whole tile grows, mat and all, from its still, and
     the video sits in its window. */
  const inset = Number(d.inset || 0);
  const framed = !!(scroll && inset > 0);
  state = { link, ready: false, grown: false, scroll, framed };
  u.root.hidden = false;
  u.name.textContent = d.name ?? "";
  u.did.replaceChildren(...didOn(d.project).map((t) => Object.assign(document.createElement("span"), { className: "pill is-chip pm_tag", textContent: t })));
  u.visit.href = d.url ?? "#";
  u.visit.hidden = !d.url;
  u.frame.setAttribute("aria-label", d.name ?? "Project");
  u.site.title = `${d.name ?? "The project"}, its site`;
  // the scroll-through starts on its own first frame: that is the still the tween grows
  const still = framed ? (fromRoot(d.framed) ?? scroll.poster) : (scroll?.poster ?? d.still);
  // a tile with no card draws its mat in CSS: the frame takes its colour, the still sits in the window
  u.frame.style.background = framed && !d.framed ? (d.matColor ?? "") : "";
  u.still.style.backgroundImage = still ? `url("${still}")` : "none";
  // the page's own still fills the frame; a tile's still (mat and all) is cropped to its window,
  // or, framed, shown whole
  const b = windowOf(link, framed);
  const tile = { w: b.w / (1 - 2 * inset), h: b.h + 2 * inset * (b.w / (1 - 2 * inset)) };
  const mat = d.stillMat && !scroll;
  u.still.style.backgroundSize = framed ? (d.framed ? "100% 100%" : `${(1 - 2 * inset) * 100}% auto`) : mat ? `${(tile.w / b.w) * 100}% ${(tile.h / b.h) * 100}%` : "cover";
  u.still.style.backgroundPosition = mat || framed ? "center" : "top center";
  gsap.set([u.site, u.scroll], { opacity: 0 });
  u.scroll.hidden = !scroll;
  if (scroll) {
    // its page, scrolling top to bottom on a loop: loaded now, played from the top once grown
    u.site.hidden = true;
    u.loop.hidden = true;
    u.scroll.poster = scroll.poster;
    u.scroll.src = scroll.video;
    u.scroll.setAttribute("aria-label", `${d.name ?? "The project"}, its site scrolling top to bottom`);
  } else if (d.site) {
    u.loop.hidden = true;
    u.site.hidden = false;
    u.site.onload = () => {
      if (!state || state.link !== link) return;
      state.ready = true;
      reveal();
    };
    u.site.src = d.site;
  } else {
    // nothing to open yet: its loop, full screen
    u.site.hidden = true;
    u.loop.hidden = false;
    u.loop.src = d.loop ?? "";
    u.loop.play().catch(() => {});
  }
  M = modalRect();
  Object.assign(u.frame.style, { left: `${M.x}px`, top: `${M.y}px`, width: `${M.w}px`, height: `${M.h}px` });
  fitScroll(framed ? inset : 0);
  u.bar.style.top = `${M.y + M.h + 14}px`;
  const dur = reduced() ? 0 : 0.85;
  gsap.fromTo(u.frame, { ...fromRect(b), transformOrigin: "0 0" }, {
    x: 0, y: 0, scaleX: 1, scaleY: 1, duration: dur, ease: "expo.inOut",
    onComplete: () => {
      if (!state) return;
      state.grown = true;
      // with reduced motion it holds on its first frame until clicked
      if (state.scroll && !reduced()) u.scroll.play().catch(() => {});
      reveal();
    },
  });
  gsap.fromTo(u.veil, { opacity: 0 }, { opacity: 1, duration: dur * 0.7 });
  gsap.fromTo(u.bar, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.4, delay: dur * 0.8 });
  document.documentElement.classList.add("pm-open");
  u.close.focus({ preventScroll: true, focusVisible: false });
}

export function close() {
  if (!state || !ui) return;
  const { link, framed } = state;
  state = null;
  const dur = reduced() ? 0 : 0.75;
  // back to the still, then into the tile; a scroll-through holds where it was instead
  gsap.killTweensOf([ui.site, ui.scroll]);
  gsap.set(ui.site, { opacity: 0 });
  ui.loop.pause();
  ui.scroll.pause();
  gsap.to(ui.bar, { opacity: 0, duration: 0.15 });
  gsap.to(ui.veil, { opacity: 0, duration: dur, ease: "power1.in" });
  gsap.to(ui.frame, {
    ...fromRect(windowOf(link, framed)), duration: dur, ease: "expo.inOut",
    onComplete: () => {
      ui.root.hidden = true;
      ui.site.removeAttribute("src");
      ui.site.onload = null;
      ui.loop.removeAttribute("src");
      ui.scroll.removeAttribute("src");
      ui.scroll.load();
      document.documentElement.classList.remove("pm-open");
      link.focus({ preventScroll: true, focusVisible: false });
    },
  });
}

/** Opens a project from any click on a[data-project] (not a new-tab click). */
export function armProjects() {
  if (armProjects.done) return;
  armProjects.done = true;
  document.addEventListener("click", (e) => {
    const link = e.target instanceof Element ? e.target.closest("a[data-project]") : null;
    if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    openProject(link);
  });
  // a hovered tile's scroll-through first frame is fetched ahead, so the tween grows a picture, not black
  const warmed = new Set();
  document.addEventListener("pointerover", (e) => {
    const slug = e.target instanceof Element ? e.target.closest("a[data-project]")?.dataset.project : null;
    const poster = scrollOf(slug)?.poster;
    if (!poster || warmed.has(poster)) return;
    warmed.add(poster);
    new Image().src = poster;
  });
}
