/* /primary's Params (Hunter, Nov 17: "Give me parameters to play around with this section"): the brand-to-
   website rows' barrel, lens, laptop and gradient. Framed in the Creative Studio, its Params panel draws
   these dials; on the page by itself, P opens the same panel (src/scripts/ks-params.js). Every dial starts at
   src/data/brand-web-look.js and changes the rows live. A tuning is kept in this browser until Reset; Copy
   props hands back the object to paste over the file. */

import { defineParams } from "./ks-params.js";
import { BRAND_WEB_LOOK, BRAND_WEB_KEY } from "../data/brand-web-look.js";

const L = BRAND_WEB_LOOK;
try {
  const saved = JSON.parse(localStorage.getItem(BRAND_WEB_KEY) || "null");
  if (saved) for (const g of Object.keys(L)) Object.assign(L[g], saved[g] ?? {});
} catch {}
// the rows may have drawn with the file's look before this ran: tell them to take the kept tuning
queueMicrotask(() => dispatchEvent(new CustomEvent("ks:brand-web-look")));
const save = () => {
  try {
    localStorage.setItem(BRAND_WEB_KEY, JSON.stringify(L));
  } catch {}
};

const schema = {
  barrel: {
    reach: [L.barrel.reach, 20, 75, 1],
    page: [L.barrel.page, 0.1, 0.4, 0.005],
    gap: [L.barrel.gap, 0, 0.5, 0.01],
    rowGap: [L.barrel.rowGap, 0, 0.6, 0.01],
    lapTop: [L.barrel.lapTop, 6, 90, 1],
    lapBottom: [L.barrel.lapBottom, 6, 90, 1],
  },
  lens: {
    blur: [L.lens.blur, 0, 24, 0.5],
    curve: [L.lens.curve, 0.5, 5, 0.1],
  },
  laptop: {
    width: [L.laptop.width, 40, 90, 1],
    insetX: [L.laptop.insetX, 0, 0.06, 0.001],
    insetTop: [L.laptop.insetTop, 0, 0.08, 0.001],
    insetBottom: [L.laptop.insetBottom, 0, 0.08, 0.001],
    radius: [L.laptop.radius, 0, 0.06, 0.001],
  },
  gradient: {
    angle: [L.gradient.angle, 90, 225, 1],
    start: [L.gradient.start, 0, 1, 0.01],
    end: [L.gradient.end, 0, 1.2, 0.01],
    accentAt: [L.gradient.accentAt, 0, 1, 0.01],
    accentMix: [L.gradient.accentMix, 0, 1, 0.01],
  },
  copyProps: { type: "action", label: "Copy props" },
  reset: { type: "action", label: "Reset" },
};

defineParams("Primary page", schema, {
  onChange(values, path) {
    if (!path) return;
    const [group, key] = path.split(".");
    if (!L[group]) return;
    L[group][key] = values[path];
    save();
    dispatchEvent(new CustomEvent("ks:brand-web-look"));
  },
  onAction(name) {
    if (name === "copyProps") return `export const BRAND_WEB_LOOK = ${JSON.stringify(L, null, 2).replace(/"(\w+)":/g, "$1:")};\n`;
    if (name === "reset") {
      try {
        localStorage.removeItem(BRAND_WEB_KEY);
      } catch {}
      location.reload();
    }
    return undefined;
  },
});
