/* The homepage intro, on its own, so the site's logo (KineticLogo) and the
   Creative Studio's Logo intro prototype (clients/kinetic/prototypes/
   02-Logo-intro.html, copied there by scripts/sync-intro-prototype.mjs) play
   exactly the same thing (Hunter, Oct 25: "make a prototype ... just the
   intro sequence. I could replay it and play around with parameters ...
   then I could copy what I love and then give it to you").

     const intro = mountLogoIntro(root, { look, say, onBuilt })
     intro.build()    // play it (again)
     intro.pulled()   // the logo as it is, no intro

   root holds the logo's SVG as KineticLogo draws it (.kinetic-logo_stripe
   paths with data-d, .kinetic-logo_pill); look is HOME_LOOK.intro (src/data/
   home-look.js), read afresh on every build; say(name, rate, gain) plays a
   sound; onBuilt() fires once a build, as the lines land (the page docks the
   logo then). */

import { gsap } from "gsap";
import { morphAll } from "./mark.js";
import { createLogoField } from "./logo-field.js";

export function mountLogoIntro(root, { look, say = () => {}, onBuilt = () => {} }) {
  const INTRO = look;
  const FIELD = { count: 5, weight: 0.32, gap: 0.3, reach: 0.45, softness: 0.1, clearance: 16, response: 0.55, wobble: 0.3, ripple: 0.2, bounce: 0.2, settle: 0.95 };
  const fieldFrom = () => Object.assign(FIELD, {
    reach: INTRO.reach, softness: INTRO.softness,
    clearance: INTRO.clearance, response: INTRO.response, wobble: INTRO.wobble, ripple: INTRO.ripple,
    // the lines let go like stretched bands: their ends at rest on the strokes collapseFor after each goes
    bounce: INTRO.bounce ?? 0.2, settle: INTRO.collapseFor,
  });
  const stripes = [...root.querySelectorAll(".kinetic-logo_stripe")];
  const bars = morphAll(stripes.map((p) => p.dataset.d));
  const shapes = stripes.map((p, i) => ({ p, m: bars[i] }));
  const pill = root.querySelector(".kinetic-logo_pill");
  let builtThisRun = false;
  const built = () => {
    if (builtThisRun) return;
    builtThisRun = true;
    onBuilt();
  };

  /* The intro (Hunter, Oct 24-25). The logo's five strokes rise in from the
     left as lines as tall as the window; KINETIC, in its pill, slides in from
     the right and they stream round its end the way lines stream round the
     cursor in the Studio's Kinetic lines tool: never crossing, the nearest
     bending most, ringing after the push ("only have five lines, not more
     than five lines"). As the pill meets them they shrink to the logo's
     height, their bends becoming its arcs, and the page pulls the logo up
     into the nav's corner (HeroLines) as they land. The lines are
     src/scripts/logo-field.js; the timing is the look (HOME_LOOK.intro). */
  const svg = root.querySelector("svg");
  const vbH = svg.viewBox.baseVal.height || 201;
  // the logo's own lines, measured off the drawing: left and right edges as x at any height
  const TOKENS = /[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g;
  const edgesOf = (d) => {
    const t = (d.match(TOKENS) ?? []).map((v) => (/^[A-Za-z]$/.test(v) ? v : Number(v)));
    const pts = [];
    let cmd = "", x = 0, y = 0;
    for (let i = 0; i < t.length; ) {
      if (typeof t[i] === "string") {
        cmd = t[i++];
        if (cmd === "Z") break;
        continue;
      }
      const n = (k) => t[i + k];
      if (cmd === "M" || cmd === "L") (x = n(0)), (y = n(1)), (i += 2), pts.push([x, y]);
      else if (cmd === "H") (x = n(0)), (i += 1), pts.push([x, y]);
      else if (cmd === "V") (y = n(0)), (i += 1), pts.push([x, y]);
      else if (cmd === "C") {
        const [x1, y1, x2, y2, x3, y3] = [n(0), n(1), n(2), n(3), n(4), n(5)];
        for (let k = 1; k <= 32; k++) {
          const u = k / 32, v = 1 - u;
          pts.push([v * v * v * x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3]);
        }
        (x = x3), (y = y3), (i += 6);
      } else i++;
    }
    const bottom = Math.max(...pts.map((p) => p[1]));
    const br = pts.findIndex((p) => p[1] >= bottom - 1e-6);
    const lookup = (edge) => (yy) => {
      if (yy <= edge[0][1]) return edge[0][0];
      for (let k = 1; k < edge.length; k++) {
        if (yy <= edge[k][1]) {
          const [x0, y0] = edge[k - 1], [x1, y1] = edge[k];
          return y1 - y0 < 1e-6 ? x1 : x0 + ((x1 - x0) * (yy - y0)) / (y1 - y0);
        }
      }
      return edge[edge.length - 1][0];
    };
    // the outline runs top left, top right, down the right edge, bottom left, up the left edge
    return { right: lookup(pts.slice(1, br + 1)), left: lookup(pts.slice(br + 1).reverse()), bottom };
  };
  const xs0 = shapes.map((sh) => Number(sh.p.dataset.d.match(/^M\s*([-\d.]+)/)?.[1] ?? 0));
  const rank = xs0.map((x) => xs0.filter((y) => y < x).length);
  // the five strokes from the left, each with its edges measured off the logo
  const lines = shapes
    .map((sh, i) => {
      const e = edgesOf(sh.m.at(1));
      return { ...sh, r: rank[i], e, H: e.bottom };
    })
    .sort((a, b) => a.r - b.r);

  const exactly = () => {
    for (const L of lines) {
      L.p.setAttribute("d", L.p.dataset.d); // the logo's own drawing
      gsap.set(L.p, { clearProps: "transform,opacity" });
    }
  };

  // the pill's round end, in logo units: the body the lines stream round
  const rect = pill.querySelector("rect");
  const num = (k) => Number(rect.getAttribute(k));
  const PILL = { cx: num("x") + num("rx"), cy: num("y") + num("height") / 2, r: num("rx") + num("stroke-width") / 2 };
  const strokes = lines.map((L) => ({ left: L.e.left, right: L.e.right, H: L.H }));
  const canvas = document.createElement("canvas");
  canvas.className = "kinetic-logo_field";
  canvas.setAttribute("aria-hidden", "true");
  root.prepend(canvas);
  const field = createLogoField(canvas, FIELD);

  const slide = { x: 0 }; // the pill, in logo units right of its place
  const pillAt = () => pill.setAttribute("transform", `translate(${slide.x} 0)`);
  const expoOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
  const backOut = (t, s) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
  const unit01 = (t) => Math.min(1, Math.max(0, t));

  let tick = null;
  const stopTick = () => {
    if (tick) gsap.ticker.remove(tick);
    tick = null;
  };
  let finishNow = null;
  const build = () => {
    finishNow?.();
    builtThisRun = false;
    stopTick();
    fieldFrom();
    let fieldEdge = 0;
    const box = svg.getBoundingClientRect(), wrap = root.getBoundingClientRect();
    const unit = (box.height || 1) / vbH;
    const W = innerWidth, Hh = innerHeight;
    // the pill from just past the window's right edge, and how far past its place it springs
    const start = Math.max(420, (W - box.left) / unit - (PILL.cx - PILL.r) + 40);
    let peak = 1;
    for (let k = 0; k <= 200; k++) peak = Math.max(peak, backOut(k / 200, INTRO.overshoot));
    const past = start * (peak - 1);
    Object.assign(canvas.style, { left: `${-wrap.left}px`, top: `${-wrap.top}px`, width: `${W}px`, height: `${Hh}px`, display: "block", opacity: "1" });
    /* Five lines, the logo's five strokes, each at its own weight. Each one
       starts where the pill's push, once the pill is in its place, carries
       its middle exactly onto the logo stroke's middle: the push is the
       stream function X (1 - q^(k/2)), q = a^2 / (X^2 + s^2 a^2), run from
       the stroke's middle X to where its line has to start. So the lines
       land on the mark and the collapse is only the shrink to its height. */
    const a = PILL.r + FIELD.clearance, k = 3.6 + (1.3 - 3.6) * FIELD.reach, sft = FIELD.softness;
    const mids = lines.map((L) => (L.e.left(L.H / 2) + L.e.right(L.H / 2)) / 2);
    const own = lines.map((L, i) => {
      const X = mids[i] - PILL.cx;
      const X0 = X * (1 - Math.pow((a * a) / (X * X + sft * sft * a * a), k / 2));
      // (and never past where the pill's centre gets to as it springs past, or the line would flip round inside it)
      const x = Math.min(PILL.cx + X0, PILL.cx - past - 3 - (lines.length - 1 - i) * 2);
      return { x: box.left + x * unit, w: (L.e.right(L.H / 2) - L.e.left(L.H / 2)) * unit };
    });
    let pitchMid = Infinity;
    for (let i = 1; i < mids.length; i++) pitchMid = Math.min(pitchMid, mids[i] - mids[i - 1]);
    fieldEdge = own[own.length - 1].x;
    field.layout({
      width: W, height: Hh,
      fieldLeft: own[0].x, fieldRight: fieldEdge,
      logo: { left: box.left, top: box.top, unit }, strokes,
      lines: own, keep: pitchMid * unit * 0.98,
    });
    field.reset();
    for (const L of lines) gsap.set(L.p, { opacity: 0 });
    slide.x = start;
    pillAt();
    const n = field.count();
    const color = getComputedStyle(root).color;
    const T = INTRO;
    let t = 0, saidGlide = false, saidPull = false, saidBuilt = false, done = false;
    // when the collapse starts: the moment the pill meets the lines
    let collapseFrom = T.collapseAt;
    const endOf = () => collapseFrom + T.collapseFor + T.collapseSpread;
    const finish = () => {
      if (done) return;
      done = true;
      stopTick();
      slide.x = 0;
      pillAt();
      exactly();
      // the SVG takes over from the field in one frame: by now the field draws
      // the strokes exactly (a crossfade dimmed both halfway through it)
      for (const L of lines) gsap.set(L.p, { opacity: 1 });
      canvas.style.display = "none";
      built();
    };
    finishNow = finish;
    say("line", 1.1, 0.5);
    tick = (_now, ms) => {
      const dt = Math.min(0.05, ms / 1000);
      t += dt;
      // the pill: in fast, a touch past its place, and back
      const p = unit01((t - T.pillAt) / T.pillFor);
      slide.x = start * (1 - backOut(p, T.overshoot));
      if (t >= T.pillAt && !saidGlide) {
        saidGlide = true;
        say("glide", 1.05, 0.45);
      }
      pillAt();
      const body = { x: box.left + (PILL.cx + slide.x) * unit, y: box.top + PILL.cy * unit, r: (PILL.r + FIELD.clearance) * unit };
      // the pill meets the field: the nearest line, plus the space the lines keep between them
      if (!saidPull && body.x - body.r < fieldEdge + 12) {
        saidPull = true;
        collapseFrom = Math.min(T.collapseAt, t + T.collapseAfter);
        say("pull", 1, 0.5);
      }
      field.frame(dt, {
        body,
        color,
        // the lines rise in from the left, one after another
        rise: (i) => expoOut(unit01((t - (i / Math.max(1, n - 1)) * T.riseSpread) / T.riseFor)),
        // and collapse into the strokes from the pill outward
        collapse: (i) => unit01((t - collapseFrom - (1 - field.across(i)) * T.collapseSpread) / T.collapseFor),
      });
      // the page starts pulling the logo up into the corner as the lines land
      if (!saidBuilt && t >= endOf() - T.dockLead) {
        saidBuilt = true;
        built();
      }
      if (t >= endOf()) finish();
    };
    gsap.ticker.add(tick);
  };
  const pulled = () => {
    finishNow?.();
    stopTick();
    canvas.style.display = "none";
    slide.x = 0;
    pillAt();
    exactly();
  };
  addEventListener("resize", () => finishNow?.());

  return { build, pulled };
}
