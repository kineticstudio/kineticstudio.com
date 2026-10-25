/* The Kinetic mark as numbers, so it can be morphed.

   Each arc of the mark is two edges between a flat top and bottom. Pull every
   x on an edge back to where that edge starts and the arc becomes a straight
   bar, so one command list morphs between line and arc. */

const TOKENS = /[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g;

// a command is one letter; "1.77e-05" is a number, not a command
export const tokens = (d) => (d.match(TOKENS) ?? []).map((t) => (/^[A-Za-z]$/.test(t) ? t : Number(t)));

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

/* The five stripes together. Straightening each arc on its own keeps its
   width at the top, and the outer arcs are widest there, so the last line
   came out twice as heavy as the first (Hunter, Oct 23: "the last one is
   thicker than the others ... it feels like something's changing"). Here
   every straight bar is the plain first bar's width, and the bars are spaced
   evenly from the first to where the last arc's outer edge starts. */
export function morphAll(ds) {
  const parsed = ds.map((d) => {
    const t = tokens(d);
    const h = t.indexOf("H");
    return { t, x0: t[1], x1: t[h + 1] };
  });
  const w = Math.min(...parsed.map((p) => p.x1 - p.x0));
  const order = parsed.map((p, i) => i).sort((a, b) => parsed[a].x0 - parsed[b].x0);
  const first = parsed[order[0]].x0;
  const last = parsed[order[order.length - 1]].x1 - w;
  const left = [];
  order.forEach((i, k) => (left[i] = first + ((last - first) * k) / Math.max(1, order.length - 1)));

  return parsed.map(({ t }, i) => {
    const L = left[i], R = left[i] + w;
    const from = [];
    let mode = "", n = 0, hs = 0, edge = L;
    for (const v of t) {
      if (typeof v === "string") {
        mode = v;
        n = 0;
        from.push(v);
        continue;
      }
      let x = v;
      if (mode === "M" && n === 0) x = L;
      if (mode === "H") {
        edge = hs++ % 2 ? L : R;
        x = edge;
      }
      if ((mode === "C" || mode === "L") && n % 2 === 0) x = edge;
      from.push(x);
      n++;
    }
    const at = (k) => from.map((f, j) => (typeof f === "number" ? (f + (t[j] - f) * k).toFixed(2) : f)).join(" ");
    return { count: 1, at: (k) => at(Array.isArray(k) ? k[0] : k) };
  });
}

