/* The Kinetic mark as numbers, so it can be morphed.

   Each arc of the mark is two edges between a flat top and bottom. Pull every
   x on an edge back to where that edge starts and the arc becomes a straight
   bar, so one command list morphs between line and arc. */

const TOKENS = /[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g;

export const tokens = (d) => (d.match(TOKENS) ?? []).map((t) => (/[A-Za-z]/.test(t) ? t : Number(t)));

export function straighten(d) {
  const out = [];
  let edgeX = 0, mode = "", n = 0;
  for (const t of tokens(d)) {
    if (typeof t === "string") {
      mode = t;
      n = 0;
      out.push(t);
      continue;
    }
    let v = t;
    if (mode === "M" && n === 0) edgeX = v;
    if (mode === "H") edgeX = v;
    if (mode === "C" && n % 2 === 0) v = edgeX;
    out.push(v);
    n++;
  }
  return out;
}

/** A morph between the straight and the curved form; `at(t)` returns a d string. */
export function morph(d) {
  const subpaths = d.split("M").filter(Boolean).map((s) => "M" + s.trim());
  const pairs = subpaths.map((s) => ({ from: straighten(s), to: tokens(s) }));
  const one = ({ from, to }, t) =>
    from.map((f, i) => (typeof f === "number" ? (f + (to[i] - f) * t).toFixed(2) : f)).join(" ");
  return {
    count: pairs.length,
    /** t is one number for every stripe, or an array with one per stripe. */
    at: (t) => pairs.map((p, i) => one(p, Array.isArray(t) ? t[i] : t)).join(" "),
  };
}
