/* What a tile's link carries so a click opens the project's modal (src/scripts/project-modal.js):
   the same data the wheel and the Work grid put on theirs. A project with a code-powered card shows
   that card's poster; one without shows its cover on a mat of the cover's own ground. */
import MEDIA from "@/data/media.json";
import CARDS from "@/data/cards.json";
import LOOPS from "@/data/card-loops.json";
import SITES from "@/data/sites.json";
import { MAT } from "@/data/card-embed.js";

export function projectLink(w) {
  const m = MEDIA[w.cover];
  const card = CARDS.includes(w.slug);
  const site = SITES[w.slug];
  const still = card ? `/cards/${w.slug}/poster.jpg` : `/media/${w.cover}.jpg`;
  return {
    href: w.case ? `/work/${w.slug}` : w.url,
    ...(w.case ? {} : { target: "_blank", rel: "noopener" }),
    "data-project": w.slug,
    "data-name": w.name,
    "data-url": w.url,
    "data-site": site?.hosted ?? (site?.live ? w.url : undefined),
    "data-still": site?.still ?? still,
    "data-still-mat": site?.still ? undefined : "1",
    "data-loop": m?.video ? `/media/${w.cover}.mp4` : undefined,
    "data-inset": MAT,
    "data-framed": card ? `/cards/${w.slug}/poster.jpg` : undefined,
    "data-mat-color": card ? undefined : m?.ground,
  };
}

/* The tile's resting loop: its card's (recorded with the card's own mat), else its cover's on a mat. */
export function restLoop(w) {
  const m = MEDIA[w.cover];
  const card = CARDS.includes(w.slug) && LOOPS.includes(w.slug);
  if (card) return { src: `/media/card-${w.slug}.mp4`, poster: `/cards/${w.slug}/poster.webp`, matted: false, ground: m?.ground };
  if (m?.video) return { src: `/media/${w.cover}.mp4`, poster: `/media/${w.cover}.webp`, matted: true, ground: m.ground };
  return null;
}
