/* The 3D work cards, loaded only when someone reaches for one.

   Hunter, Oct 24: "We're loading in way too much on the home page ... on
   hover, we convert to our 3D effect." So a tile is a still (or, for the top
   two, a short loop recorded from its own card) until the pointer comes onto
   it; then its live card loads in a frame and crossfades in over the still.
   When the pointer leaves, the card fades back to the still and pauses, and
   a few seconds later its frame is dropped. No more than two run at once.
   Touch screens never load one: the still and the link are the tile.

   A tile whose resting picture is a loop recorded from its own card
   (video[data-rest], scripts/record-card-loops.mjs) tells the card the loop's
   time as it comes in, {type: "ks-card", at}, so the miniature carries on
   from the same frame and only the depth and the tilt arrive.

   Markup, inside a tile:
     [data-card-src="…/index.html?embed=1&…"]  the tile (WorkCard, the wheel)
       [data-card-stage]                       where the frame goes
       a[data-card-link]                       the project link (the card's own clicks open it)
     [data-loop-src="…mp4"] instead of data-card-src: a project with no card
       yet, whose loop plays while hovered.

     armCards(root)   wire every tile under root (once each) */

import { HOME_LOOK } from "../data/home-look.js";

const MAX = 2;
// HOME_LOOK.hover: linger = s a left card's frame is kept, so a quick return is
// instant; fadeIn = ms after it loads that it shows; the rest the card's own dials
const H = HOME_LOOK.hover;
const canHover = matchMedia("(hover: hover) and (pointer: fine)");
const live = []; // { tile, frame, timer }

const post = (rec, visible) => rec.frame.contentWindow?.postMessage({ type: "ks-card", visible }, "*");
function handOver(rec) {
  const v = rec.tile.querySelector("video[data-rest]");
  if (v && v.currentTime > 0) rec.frame.contentWindow?.postMessage({ type: "ks-card", at: v.currentTime }, "*");
}

/* The card's own settings handle: every card page publishes one on its
   window (each under its own name), with its dials in `values` and set(). */
const handleOf = (frame) => {
  try {
    const w = frame.contentWindow;
    if (!w) return null;
    for (const k of Object.keys(w)) {
      const o = w[k];
      if (o && typeof o === "object" && typeof o.set === "function" && o.values && "tilt.tiltMax" in o.values) return o;
    }
  } catch {}
  return null;
};
// the hover dials, onto one card. The light is the card's own times the
// dial (Hunter, Oct 25: "I don't love the bloom nor the amount"), so each
// card keeps its balance; its own values are read once, before the first set
function tune(rec) {
  const h = handleOf(rec.frame);
  if (!h) return;
  rec.own ??= { bloom: h.values["light.bloom"], rim: h.values["light.rim"], shadow: h.values["light.shadow"] };
  const o = rec.own;
  h.set({
    "tilt.tiltMax": H.tilt, "tilt.hoverScale": H.scale, "tilt.perspective": H.perspective,
    "motion.stiffness": H.stiffness, "motion.damping": H.damping,
    ...(o.bloom != null && { "light.bloom": o.bloom * H.bloom, "light.bloomSize": H.bloomSize }),
    ...(o.rim != null && { "light.rim": o.rim * H.rim }),
    ...(o.shadow != null && { "light.shadow": o.shadow * H.shadow }),
  }, "tilt.perspective");
}
const frames = (n = 2) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
/* Show a card only once it has drawn the loop's own moment, its pictures
   decoded (Hunter, Oct 25: "a bit of a flicker on hover of the work.
   Probably has something to do with loading in the work itself"). */
async function reveal(rec) {
  try {
    const doc = rec.frame.contentDocument;
    await Promise.race([
      Promise.all([doc?.fonts?.ready, ...[...(doc?.images ?? [])].map((i) => i.decode().catch(() => {}))]),
      new Promise((r) => setTimeout(r, 900)),
    ]);
  } catch {}
  handOver(rec);
  await frames(3);
  if (rec.tile.classList.contains("is-hovered")) rec.tile.classList.add("is-live");
}
/** After HOME_LOOK.hover changes: every card that is up takes it. */
export function retuneCards() {
  for (const rec of live) tune(rec);
}

function drop(rec) {
  clearTimeout(rec.timer);
  rec.frame.remove();
  rec.tile.classList.remove("is-live", "is-hovered");
  live.splice(live.indexOf(rec), 1);
}

function wake(tile) {
  let rec = live.find((r) => r.tile === tile);
  if (!rec) {
    const frame = document.createElement("iframe");
    rec = { tile, frame, timer: 0 };
    frame.className = "card-frame";
    frame.src = tile.dataset.cardSrc;
    frame.title = tile.dataset.cardTitle ?? "A live miniature of the site";
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    // the card shows only once it has drawn a few frames, so the handover is
    // the same picture (Hunter, Oct 24: hover "really jittery ... it just
    // doesn't feel like it's the same card")
    frame.addEventListener(
      "load",
      () => {
        tune(rec);
        handOver(rec);
        post(rec, true);
        setTimeout(() => reveal(rec), H.fadeIn);
      },
      { once: true },
    );
    (tile.querySelector("[data-card-stage]") ?? tile).append(frame);
    live.push(rec);
    // keep only the newest few: drop the oldest that nobody is pointing at
    while (live.length > MAX) {
      const old = live.find((r) => r !== rec && !r.tile.classList.contains("is-hovered"));
      if (!old) break;
      drop(old);
    }
  }
  clearTimeout(rec.timer);
  const back = tile.classList.contains("is-live") && !tile.classList.contains("is-hovered");
  tile.classList.add("is-hovered");
  post(rec, true);
  // a card kept from before: hidden while it catches up to the loop, then shown again
  if (back) {
    tile.classList.remove("is-live");
    handOver(rec);
    frames(3).then(() => tile.classList.contains("is-hovered") && tile.classList.add("is-live"));
  }
}

function rest(tile) {
  const rec = live.find((r) => r.tile === tile);
  tile.classList.remove("is-hovered");
  if (!rec) return;
  post(rec, false);
  rec.timer = setTimeout(() => drop(rec), H.linger * 1000);
}

function armLoop(tile) {
  const video = document.createElement("video");
  video.className = "card-loop";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "none";
  video.setAttribute("aria-hidden", "true");
  let added = false;
  tile.addEventListener("pointerenter", () => {
    if (!added) {
      video.src = tile.dataset.loopSrc;
      (tile.querySelector("[data-card-stage]") ?? tile).append(video);
      video.addEventListener("playing", () => tile.classList.add("is-live"), { once: true });
      added = true;
    }
    tile.classList.add("is-hovered");
    video.play().catch(() => {});
  });
  tile.addEventListener("pointerleave", () => {
    tile.classList.remove("is-hovered");
    video.pause();
  });
}

/** @param {ParentNode} [root] */
export function armCards(root = document) {
  if (!canHover.matches) return;
  root.querySelectorAll("[data-card-src], [data-loop-src]").forEach((tile) => {
    if (tile.dataset.armed) return;
    tile.dataset.armed = "1";
    if (tile.dataset.cardSrc) {
      tile.addEventListener("pointerenter", () => wake(tile));
      tile.addEventListener("pointerleave", () => rest(tile));
    } else armLoop(tile);
  });
}

// a click on a card (one that isn't a drag) opens the project through its link
addEventListener("message", (e) => {
  if (e.data?.type !== "ks-card-open") return;
  const rec = live.find((r) => r.frame.contentWindow === e.source);
  rec?.tile.querySelector("a[data-card-link]")?.click();
});
document.addEventListener("visibilitychange", () => {
  for (const rec of live) post(rec, !document.hidden && rec.tile.classList.contains("is-hovered"));
});
