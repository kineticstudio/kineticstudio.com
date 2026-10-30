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
import { bendPush, createLogoField } from "./logo-field.js";

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
     than five lines"). It carries on past its place, pressing into them,
     and as it comes back they shrink to the logo's height, their bends
     becoming its arcs, and the page pulls the logo up into the nav's
     corner (HeroLines) as they land. The lines are
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
      L.p.removeAttribute("transform");
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
  const unit01 = (t) => Math.min(1, Math.max(0, t));
  /* The pill's way in (Hunter, Oct 29: "I want the pill to go over, and then maybe it undershoots or
     overshoots a little bit"; then "It needs to feel like the lines are catching the pill, and then it
     kind of settles back a little bit"; slowed before it got there, it bumped them). It glides in at
     full speed, and the lines catch it: from where it reaches them, a damped spring on its place takes
     it, its pull and its give in balance at the catch, so the pill is at its fastest there and only
     slows from then on, smoothly, out overshoot (logo units) past its place; back in recoil seconds,
     and a touch past the other way (pillBounce of the overshoot) before it rests.
     x(t), t from when it sets off, in logo units right of its place; at = the catch, at catchAt;
     turn = its far point; still = at rest. */
  const pillPath = (start) => {
    const over = Math.max(1, INTRO.overshoot), lr = Math.log(Math.min(0.6, Math.max(0.01, INTRO.pillBounce ?? 0.12)));
    const z = -lr / Math.hypot(Math.PI, lr), sq = Math.sqrt(1 - z * z);
    const wd = (Math.PI - Math.acos(z)) / Math.max(0.1, INTRO.recoil ?? 0.5), w = wd / sq, a = z * w;
    // from the catch, per unit of how far out it is: speed w / 2z there, so the pull and the give cancel
    const kappa = w / (2 * z), B = (a - kappa) / wd;
    const u = (tau) => Math.exp(-a * tau) * (Math.cos(wd * tau) + B * Math.sin(wd * tau));
    let far = 0, tFar = 0;
    for (let tau = 0; tau < 3; tau += 0.002) {
      const v = u(tau);
      if (v < far) (far = v), (tFar = tau);
    }
    const catchAt = over / -far, speed = kappa * catchAt, from = Math.max(start, catchAt);
    const Ta = (from - catchAt) / speed;
    return {
      over,
      catchAt,
      at: Ta,
      turn: Ta + tFar,
      still: Ta + Math.log((catchAt * Math.hypot(1, B)) / 0.2) / a,
      x: (t) => (t <= 0 ? from : t < Ta ? from - speed * t : catchAt * u(t - Ta)),
    };
  };

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
    // the pill from just past the window's right edge, and how far past its place it goes
    const start = Math.max(420, (W - box.left) / unit - (PILL.cx - PILL.r) + 40);
    const path = pillPath(start);
    Object.assign(canvas.style, { left: `${-wrap.left}px`, top: `${-wrap.top}px`, width: `${W}px`, height: `${Hh}px`, display: "block", opacity: "1" });
    /* Five lines, the logo's five strokes, each at its own weight. Each one
       starts where the pill's push, once the pill is in its place, bends it
       closest to its stroke over the logo's whole height (the push is the
       stream function X (1 - q^(k/2)), q = a^2 / (X^2 + Y^2 + s^2 a^2), as
       logo-field.js bends the lines), so cropped to the logo the bent lines
       already are the mark (Hunter, Oct 29: "I wonder if the lines need to be
       wider apart at the beginning ... If the far-right line was further off
       to the right at the beginning, then whenever they get collapsed in, it
       would look more like the mark if you were to crop it"; landing only the
       middles on the strokes left the arcs too flat at their ends). */
    const a = PILL.r + FIELD.clearance, k = 3.6 + (1.3 - 3.6) * FIELD.reach, sft = FIELD.softness;
    const mids = lines.map((L) => (L.e.left(L.H / 2) + L.e.right(L.H / 2)) / 2);
    const fitStart = (L) => {
      const S = [];
      for (let q = 0; q <= 20; q++) {
        const y = (q / 20) * L.H;
        S.push([y - PILL.cy, (L.e.left(y) + L.e.right(y)) / 2 - PILL.cx]);
      }
      const err = (X0) => S.reduce((e, [Y, T]) => e + (X0 + bendPush(X0, Y, a, k, sft) - T) ** 2, 0);
      let best = -4, be = Infinity;
      for (let X0 = -6 * a; X0 <= -4; X0 += 3) {
        const e = err(X0);
        if (e < be) (be = e), (best = X0);
      }
      for (let X0 = best - 3; X0 <= Math.min(-4, best + 3); X0 += 0.2) {
        const e = err(X0);
        if (e < be) (be = e), (best = X0);
      }
      return best;
    };
    const own = lines.map((L) => ({ x: box.left + (PILL.cx + fitStart(L)) * unit, w: (L.e.right(L.H / 2) - L.e.left(L.H / 2)) * unit }));
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
    // the lines let go at the pill's far point (give or take collapseAt), so they shrink as it comes back
    const collapseFrom = T.pillAt + path.turn + (T.collapseAt ?? 0);
    const endOf = collapseFrom + T.collapseFor + T.collapseSpread;
    /* The lines give way with the pill (Hunter, Oct 29: "If we overshoot, though, then the lines need
       to also overshoot"; "the lines are catching the pill"): once it is within GIVE of its place they
       go along with it, from still, more the further it presses (give), and on past its place and back
       with it; at rest they are the mark, so before the pill comes they wait that much to the right.
       The nearest goes all the way, held to it; each farther one a little less and a little later (a
       damped follower), so the stack squeezes as the pill presses in and springs back out with it.
       ride[i] in logo units from its place in the mark. */
    const GIVE = 60, SOFT = 25;
    const give = (x) => {
      const u = Math.max(0, GIVE - x);
      return u - SOFT * (1 - Math.exp(-u / SOFT)); // 0 and still at GIVE, then nearly the pill's own way
    };
    const g0 = give(0);
    const nL = lines.length, step = Math.min(0.15, 10 / path.over);
    const share = lines.map((_, i) => 1 - (nL - 1 - i) * step);
    const rate = lines.map((_, i) => 44 - (nL - 1 - i) * 7); // the followers, rad/s
    const ride = Float64Array.from(share, (f) => f * g0), rideV = new Float64Array(nL);
    const carry = (dt, tp) => {
      const o = g0 - give(path.x(tp));
      for (let i = 0; i < nL; i++) {
        if (i === nL - 1) {
          ride[i] = share[i] * o;
          continue;
        }
        const w = rate[i], h = dt / 4;
        for (let q = 0; q < 4; q++) {
          rideV[i] += (w * w * (share[i] * o - ride[i]) - 2 * w * rideV[i]) * h;
          ride[i] += rideV[i] * h;
        }
      }
    };
    const rest = () => {
      stopTick();
      slide.x = 0;
      pillAt();
      for (const L of lines) L.p.removeAttribute("transform");
    };
    // snap: at once, the pill in its place too (a replay, a resize, the page skipping it)
    const finish = (snap) => {
      if (snap) rest();
      if (done) return;
      done = true;
      exactly();
      // the SVG takes over from the field in one frame: by now the field draws
      // the strokes exactly (a crossfade dimmed both halfway through it); the
      // pill, the SVG's own all along, carries on to rest, the strokes with it
      for (const L of lines) gsap.set(L.p, { opacity: 1 });
      canvas.style.display = "none";
      built();
    };
    finishNow = () => finish(true);
    say("line", 1.1, 0.5);
    tick = (_now, ms) => {
      const dt = Math.min(0.05, ms / 1000);
      t += dt;
      // the pill: in, past its place, and back, and the lines with it
      slide.x = path.x(t - T.pillAt);
      pillAt();
      carry(dt, t - T.pillAt);
      if (done) {
        if (t - T.pillAt >= path.still + 0.2) return rest();
        lines.forEach((L, i) => L.p.setAttribute("transform", `translate(${ride[i]} 0)`));
        return;
      }
      if (t >= T.pillAt && !saidGlide) {
        saidGlide = true;
        say("glide", 1.05, 0.45);
      }
      const body = { x: box.left + (PILL.cx + slide.x) * unit, y: box.top + PILL.cy * unit, r: (PILL.r + FIELD.clearance) * unit };
      // the pill meets the field: the nearest line, plus the space the lines keep between them
      if (!saidPull && body.x - body.r < fieldEdge + 12) {
        saidPull = true;
        say("pull", 1, 0.5);
      }
      field.frame(dt, {
        body,
        color,
        shift: (i) => ride[i] * unit,
        // the lines rise in from the left, one after another
        rise: (i) => expoOut(unit01((t - (i / Math.max(1, n - 1)) * T.riseSpread) / T.riseFor)),
        // and collapse into the strokes from the pill outward
        collapse: (i) => unit01((t - collapseFrom - (1 - field.across(i)) * T.collapseSpread) / T.collapseFor),
      });
      // the page starts pulling the logo up into the corner as the lines land
      if (!saidBuilt && t >= endOf - T.dockLead) {
        saidBuilt = true;
        built();
      }
      if (t >= endOf) finish(false);
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
