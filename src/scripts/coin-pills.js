/* Craft, quality and story as three small made objects (Hunter, Oct 25:
   "Come up with your own designs for the craft, quality, and story pills.
   Right now, they just feel slightly lazy and unrealistic. I think you're
   looking too much at the original thing that I sent you"; before that,
   silver, scratched, hyper-realistic, moving less).

   Each keeps the logo's pill for its silhouette and its word in the page's
   display face, and is one of three designs (COIN_LOOK.design):

     Machined  solid aluminium, bead-blasted, a diamond-cut chamfer round the
               face that catches the strip light; the word engraved, its
               polished lip bright where it faces the light, its floor darker
     Enamel    polished, lightly brushed steel with a rolled edge; the word
               cut in and filled with black enamel a hair below the steel
     Ingot     a struck silver bar: a mirror field, soft rounded edges,
               drafted sides; the word stamped in and frosted, so it reads
               white against the dark the mirror holds

   What makes them read as photographs: a true section round the edge (no
   edge is infinitely sharp), the word as a distance field so its walls have
   a real profile at any size, roughness that varies across the surface, a
   few marks at low strength, all scaled to the pill; a product studio (soft
   boxes, a strip light, dark walls) for the metal to mirror; a contact
   shadow on the paper. Every setting is COIN_LOOK (src/data/coin-look.js).

     const coins = mountCoins(canvas, slots, look)   // slots: the pill elements, in order
     await coins.ready     // made (in steps, so the page never waits on it) and drawn
     coins.update(look)    // live: the studio, motion, quality
     coins.rebuild(look)   // the rest: the maps and the shape are made again
     coins.destroy() */

import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

const DEG = Math.PI / 180;
const INF = 1e20;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
// a hex as sRGB 0..1, for the colour maps
const srgb = (hex) => {
  const n = parseInt(String(hex).replace("#", "").slice(0, 6).padEnd(6, "0"), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// a seeded random, so every pill keeps its own marks
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- the shape -------------------------------------------------------- */

/* The logo's pill, walked round anticlockwise from the bottom of its right
   end: a point on its spine and the outward normal there, and u, how far
   round (0..1). The pill is W wide and 1 tall. */
function outline(W, steps = 96) {
  const R = 0.5, a = W / 2 - R, pts = [];
  for (let i = 0; i <= steps; i++) {
    const f = -Math.PI / 2 + (Math.PI * i) / steps;
    pts.push([a, Math.cos(f), Math.sin(f)]);
  }
  for (let i = 0; i <= steps; i++) {
    const f = Math.PI / 2 + (Math.PI * i) / steps;
    pts.push([-a, Math.cos(f), Math.sin(f)]);
  }
  pts.push(pts[0].slice());
  let len = 0;
  const u = [0];
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k - 1], q = pts[k];
    const dx = q[0] + q[1] * R - p[0] - p[1] * R, dy = (q[2] - p[2]) * R;
    len += Math.sqrt(dx * dx + dy * dy);
    u.push(len);
  }
  return pts.map((p, k) => [p[0], p[1], p[2], u[k] / len]);
}

/* A section through the edge, from the face out and down the side: corners
   [s, z] (s outward from the silhouette, z back from the face) and the
   radius each inner corner is rounded to. Gives [s, z, ns, nz] down it. */
function section(corners, radii, steps = 12) {
  const out = [];
  const dir = (p, q) => {
    const ds = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(ds, dz);
    return [ds / l, dz / l, l];
  };
  for (let i = 1; i < corners.length - 1; i++) {
    const P = corners[i], d1 = dir(corners[i - 1], P), d2 = dir(P, corners[i + 1]);
    const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
    let r = radii[i - 1] ?? 0;
    let t = Math.abs(Math.tan(turn / 2)) * r;
    const room = Math.min(d1[2], d2[2]) * 0.5;
    if (t > room) {
      r *= room / t;
      t = room;
    }
    if (r < 1e-6 || Math.abs(turn) < 1e-6) {
      out.push([P[0], P[1], -d1[1], d1[0]], [P[0], P[1], -d2[1], d2[0]]);
      continue;
    }
    const T1 = [P[0] - d1[0] * t, P[1] - d1[1] * t], sg = Math.sign(turn), a1 = Math.atan2(d1[1], d1[0]);
    const C = [T1[0] - sg * r * d1[1], T1[1] + sg * r * d1[0]];
    for (let k = 0; k <= steps; k++) {
      const a = a1 + (turn * k) / steps, ds = Math.cos(a), dz = Math.sin(a);
      out.push([C[0] + sg * r * dz, C[1] - sg * r * ds, -dz, ds]);
    }
  }
  const n = corners.length, d = dir(corners[n - 2], corners[n - 1]);
  out.push([corners[n - 1][0], corners[n - 1][1], -d[1], d[0]]);
  return out;
}

// the section swept round the outline: the pill's edge and side
function ringGeometry(ol, sec) {
  const R = 0.5, J = sec.length, pos = [], nor = [], uv = [], idx = [];
  for (const [cx, nx, ny, u] of ol) {
    sec.forEach(([s, z, ns, nz], j) => {
      pos.push(cx + nx * (R + s), ny * (R + s), z);
      nor.push(nx * ns, ny * ns, nz);
      uv.push(u, (j + 0.5) / J);
    });
  }
  for (let k = 0; k < ol.length - 1; k++) {
    for (let j = 0; j < J - 1; j++) {
      const a = k * J + j, b = a + J;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// the flat face inside the edge, its uv the pill's box (the face maps cover it)
function capGeometry(ol, s0, W) {
  const R = 0.5, pos = [0, 0, 0], uv = [0.5, 0.5], idx = [];
  ol.forEach(([cx, nx, ny]) => {
    const x = cx + nx * (R + s0), y = ny * (R + s0);
    pos.push(x, y, 0);
    uv.push(x / W + 0.5, y + 0.5);
  });
  for (let k = 1; k < ol.length; k++) idx.push(0, k, k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ---- the word, as a distance field ----------------------------------- */

function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k], qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}

/* The word set in the display face (the browser does the type, so it is the
   page's own) and turned into its signed distance in texels, + outside the
   letters, sub-texel from the antialiasing. Over the pill's box, tw x th. */
function wordField(word, tw, th, font, size, tracking) {
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.font = `500 100px ${font}`;
  const cap = x.measureText("H").actualBoundingBoxAscent / 100 || 0.7;
  let px = (size * th) / cap;
  const set = () => {
    x.font = `500 ${px}px ${font}`;
    if ("letterSpacing" in x) x.letterSpacing = `${(tracking * px).toFixed(2)}px`;
  };
  set();
  let m = x.measureText(word);
  // clear of the round ends
  const room = tw - th * 1.05, ink = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  if (ink > room) {
    px *= room / ink;
    set();
    m = x.measureText(word);
  }
  x.fillStyle = "#fff";
  x.fillText(word, tw / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, th / 2 + (cap * px) / 2);
  const a = x.getImageData(0, 0, tw, th).data;
  const n = tw * th, outer = new Float32Array(n), inner = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const al = a[i * 4 + 3] / 255;
    if (al >= 1) {
      outer[i] = 0;
      inner[i] = INF;
    } else if (al <= 0) {
      outer[i] = INF;
      inner[i] = 0;
    } else {
      const d = 0.5 - al;
      outer[i] = d > 0 ? d * d : 0;
      inner[i] = d < 0 ? d * d : 0;
    }
  }
  const L = Math.max(tw, th), f = new Float32Array(L), v = new Uint16Array(L), z = new Float32Array(L + 1);
  for (const g of [outer, inner]) {
    for (let xx = 0; xx < tw; xx++) edt1d(g, xx, tw, th, f, v, z);
    for (let y = 0; y < th; y++) edt1d(g, y * tw, 1, tw, f, v, z);
  }
  const sd = new Float32Array(n);
  for (let i = 0; i < n; i++) sd[i] = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
  // softened a texel or so, so the walls sit smooth down a diagonal (they came out stepped);
  // its gradient, which turns the walls' normals, from a copy softened a little more
  const tmp = new Float32Array(n);
  const soften = (f, passes) => {
    for (let pass = 0; pass < passes; pass++) {
      for (let y = 0; y < th; y++) {
        const o = y * tw;
        for (let xx = 0; xx < tw; xx++) tmp[o + xx] = (f[o + Math.max(0, xx - 1)] + f[o + xx] + f[o + Math.min(tw - 1, xx + 1)]) / 3;
      }
      for (let y = 0; y < th; y++) {
        const a0 = Math.max(0, y - 1) * tw, a1 = y * tw, a2 = Math.min(th - 1, y + 1) * tw;
        for (let xx = 0; xx < tw; xx++) f[a1 + xx] = (tmp[a0 + xx] + tmp[a1 + xx] + tmp[a2 + xx]) / 3;
      }
    }
    return f;
  };
  soften(sd, 2);
  const flow = soften(sd.slice(), 3), gx = new Float32Array(n), gy = new Float32Array(n);
  for (let y = 0; y < th; y++) {
    for (let xx = 0; xx < tw; xx++) {
      const i = y * tw + xx;
      let ax = flow[xx < tw - 1 ? i + 1 : i] - flow[xx > 0 ? i - 1 : i], ay = flow[y < th - 1 ? i + tw : i] - flow[y > 0 ? i - tw : i];
      const l = Math.sqrt(ax * ax + ay * ay);
      if (l > 1e-4) {
        ax /= l;
        ay /= l;
      }
      gx[i] = ax;
      gy[i] = ay;
    }
  }
  return { sd, gx, gy };
}

/* ---- surfaces --------------------------------------------------------- */

// smooth value noise, features about cx by cy texels, -0.5..0.5
function noise(tw, th, cx, cy, r) {
  const gw = Math.ceil(tw / cx) + 2, gh = Math.ceil(th / cy) + 2, g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = r() - 0.5;
  const out = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) {
    const fy = y / cy, y0 = fy | 0, ty = fy - y0, sy = ty * ty * (3 - 2 * ty), r0 = y0 * gw, r1 = r0 + gw;
    for (let x = 0; x < tw; x++) {
      const fx = x / cx, x0 = fx | 0, tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
      const a = g[r0 + x0], b = g[r0 + x0 + 1], c = g[r1 + x0], d = g[r1 + x0 + 1];
      out[y * tw + x] = a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy;
    }
  }
  return out;
}

// marks drawn on a canvas (white on black), read back 0..1
function marks(tw, th, draw) {
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#000";
  x.fillRect(0, 0, tw, th);
  x.strokeStyle = x.fillStyle = "#fff";
  x.lineCap = "round";
  draw(x);
  const d = x.getImageData(0, 0, tw, th).data, out = new Float32Array(tw * th);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

// hairline scratches: mostly short, a few long, every way; widths in texels
const scratching = (count, r, tw, th, width = 0.7) => (x) => {
  for (let i = 0; i < count; i++) {
    const len = th * (0.04 + r() ** 2 * 0.5), px = r() * tw, py = r() * th, a = r() * Math.PI * 2, bend = (r() - 0.5) * 0.4;
    x.globalAlpha = 0.25 + r() * 0.6;
    x.lineWidth = width * (0.6 + r() * 0.8);
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(a + bend) * len * 0.5, py + Math.sin(a + bend) * len * 0.5, px + Math.cos(a) * len, py + Math.sin(a) * len);
    x.stroke();
  }
};

// fingerprints and smudges: soft patches with the ridges of a print in some
const smudging = (count, r, tw, th) => (x) => {
  for (let i = 0; i < count; i++) {
    const cx = r() * tw, cy = th * (0.15 + r() * 0.7), rx = th * (0.16 + r() * 0.14), ry = rx * (1.2 + r() * 0.3), rot = (r() - 0.5) * 1.6;
    x.save();
    x.translate(cx, cy);
    x.rotate(rot);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, ry);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.scale(rx / ry, 1);
    x.beginPath();
    x.arc(0, 0, ry, 0, Math.PI * 2);
    x.fill();
    // a print's ridges, about a fiftieth of the pill apart: broken, wandering, faint
    if (r() < 0.5) {
      x.strokeStyle = "#fff";
      x.lineWidth = th * 0.005;
      const gap = th * 0.02;
      for (let k = 2; k < ry / gap; k++) {
        const rad = k * gap;
        for (let a = r() * 0.6; a < Math.PI * 2; ) {
          const len = 0.3 + r() * 0.9, wob = (r() - 0.5) * gap * 0.6;
          x.globalAlpha = (0.12 + r() * 0.2) * (1 - rad / ry);
          x.beginPath();
          x.ellipse(wob, -k * th * 0.003, rad + wob, (rad + wob) * 1.18, 0, a, a + len);
          x.stroke();
          a += len + 0.1 + r() * 0.5;
        }
      }
      x.globalAlpha = 1;
    }
    x.restore();
  }
};

/* ---- the three designs -------------------------------------------------

   Each gives its edge section, the edge's finish down it, and the face: the
   word's profile H (height against the distance field, in pill heights) and
   per texel the colour, roughness, metalness, occlusion, and a fine height
   for the grain and the marks. */

const DESIGNS = {
  /* Chrome (Hunter, Oct 25: "maybe we try a reflective chrome matcap then
     have bloom and flares"; "I want them to have a shine around the edges,
     like a light is rotating around them"). Shaded by a matcap rather than
     the studio: the face domed a little so it runs through the matcap's
     reflections, the edge rolled, the word raised in rounded chrome on a
     smoked field so it reads; a light circles each pill's edge (see
     chromeMaterial), the hot part blooms (Hunter, Oct 25, of the lens
     flares: "They don't look realistic", so there are none). */
  chrome: {
    matcap: true,
    section: ({ edge: e }) => [
      // the section starts at the dome's own slope, so face and edge meet without a crease
      [[-0.4, 0.4 * e.crown], [0, 0], [0, -e.thick], [-0.2, -e.thick]],
      [e.round, e.round * 0.3],
    ],
    edge: () => ({ color: [1, 1, 1], rough: 0, metal: 1 }),
    /* Hunter, Oct 25: "I don't like how these look embossed. They should
       look the other way, like extruded." So the word stands up out of the
       face: each stroke rounded over its shoulders (bevel wide), so its sides
       catch the matcap and the light going round, on a smoked, darker field
       (field, fill: both live); the field shadowed close round the letters' feet, and a
       touch more below them, where the light from above would throw it. */
    face({ word: w, edge: e, wear: wr }, sd, tw, th, o, r) {
      const u = 1 / th, F = srgb(w.fill), W = tw / th, a = W / 2 - 0.5;
      const sh = Math.max(w.bevel, 2 / o.px), hgt = sh * w.height;
      // a quarter-round shoulder up to the letter's top
      const H = (s) => (s >= 0 ? 0 : hgt * (1 - (1 - Math.min(-s / sh, 1)) ** 2));
      // the dome: highest along the pill's spine, its slope at the edge = crown
      const A = e.crown / 4, drop = Math.max(1, Math.round(th * 0.018));
      const scr = marks(tw, th, scratching(wr.scratches, r, tw, th, 0.6));
      for (let y = 0; y < th; y++) {
        const Y = 0.5 - (y + 0.5) / th, above = Math.max(0, y - drop) * tw;
        for (let x = 0; x < tw; x++) {
          const i = y * tw + x, X = (x + 0.5) / th - W / 2;
          const dx = Math.max(0, Math.abs(X) - a), rr = Math.min(1.05, Math.sqrt(dx * dx + Y * Y) / 0.5);
          const s = sd[i] * u;
          o.sl[i] = (H(s + u / 2) - H(s - u / 2)) / u;
          const field = clamp01(s / u + 0.5);
          for (let c = 0; c < 3; c++) o.col[i * 3 + c] = mix(1, F[c], field);
          // (chrome has no roughness: its channel carries where the field is; how smoked, and its colour, are live)
          o.rough[i] = field;
          const below = Math.max(0, sd[above + x] * u);
          o.ao[i] = 1 - field * (0.5 * Math.exp(-Math.max(0, s) / 0.016) + 0.3 * Math.exp(-below / 0.03));
          o.hx[i] = A * (1 - rr * rr) - scr[i] * 0.0005 * field;
        }
      }
    },
  },
  machined: {
    // the soft box close by, up and to the left: a gentle fall of light across the blast
    box: { pos: [-1.6, 2.4, 3], size: [4.5, 2.2] },
    section: ({ edge: e }) => [
      [[-0.4, 0], [-e.chamfer, 0], [0, -e.chamfer], [0, -e.thick], [-0.2, -e.thick]],
      [e.round, e.round, e.round * 2],
    ],
    // the chamfer is cut bright; the side is blasted like the face
    edge: ({ metal: m }, [, , ns, nz]) => {
      const cut = smooth(0.995, 0.93, Math.max(nz, Math.abs(ns)));
      const A = srgb(m.anodize), C = srgb(m.cut);
      return { color: A.map((a, i) => mix(a, C[i], cut)), rough: mix(m.blast, 0.05, cut), metal: 1 };
    },
    face({ metal: m, word: w, wear: e }, sd, tw, th, o, r) {
      // no feature under a pixel and a half on screen (o.px: pixels per pill height), or it glitters
      const u = 1 / th, A = srgb(m.anodize), C = srgb(m.cut), px = 1 / o.px;
      const lw = Math.max(w.lip, 1.5 * px), dp = Math.max(w.depth, lw + 0.004), ws = Math.max((dp - lw) * 0.2, 1.2 * px);
      // the lip at 45 degrees, a steep wall, the flat floor
      const H = (s) => (s >= 0 ? 0 : s > -lw ? s : s > -(lw + ws) ? -lw + ((s + lw) * (dp - lw)) / ws : -dp);
      const mott = noise(tw, th, th * 0.22, th * 0.22, r), mott2 = noise(tw, th, th * 0.05, th * 0.05, r), grain = noise(tw, th, 1.6, 1.6, r);
      const scr = marks(tw, th, scratching(e.scratches, r, tw, th, 0.8));
      const smu = marks(tw, th, smudging(Math.round(e.smudge * 4), r, tw, th));
      const cov = (t, edge) => clamp01((t - edge) / u + 0.5);
      // the lip polished, a little less so when it is only a pixel or two wide (a mirror that thin glitters)
      const lipR = 0.05 + 0.2 * clamp01(2.5 / (lw * o.px) - 1);
      for (let i = 0; i < tw * th; i++) {
        const s = sd[i] * u, t = -s;
        o.sl[i] = (H(s + u / 2) - H(s - u / 2)) / u;
        const cut = cov(t, 0), wall = cov(t, lw), floor = cov(t, lw + ws);
        const mo = (mott[i] + mott2[i] * 0.5) * m.mottle;
        // the blast, its mottle, fingerprints a touch shinier, hairlines shinier still
        const blast = m.blast + mo * 0.12 + grain[i] * 0.05 - smu[i] * 0.16 * e.smudge - scr[i] * 0.18;
        let rough = mix(blast, lipR, cut);
        rough = mix(rough, 0.16 + lipR, wall);
        rough = mix(rough, w.floor, floor);
        o.rough[i] = rough;
        const tone = 1 + mo * 0.035 - smu[i] * 0.04 * e.smudge;
        for (let c = 0; c < 3; c++) o.col[i * 3 + c] = mix(A[c] * tone, C[c] * mix(1, 0.94, floor), cut);
        // the floor shadowed against its walls
        const aoF = 1 - 0.5 * Math.exp(-Math.max(0, t - lw - ws) / (dp * 0.9));
        o.ao[i] = mix(mix(1, 0.82, wall), aoF, floor);
        o.hx[i] = (1 - cut) * (grain[i] * 0.00018 - scr[i] * 0.0012);
      }
    },
  },

  enamel: {
    // a long strip close in front, just above the middle: polished steel mirrors it as a band (box; a faint sheen by default)
    box: { pos: [0, 0.3, 3], size: [14, 0.24] },
    section: ({ edge: e }) => [
      [[-0.4, 0], [0, 0], [0, -e.thick], [-0.2, -e.thick]],
      [e.round, e.round * 0.25],
    ],
    edge: ({ metal: m }) => ({ color: srgb(m.tint), rough: m.polish * 0.6, metal: 1 }),
    // brushed: the highlight drawn out across the grain
    brushed: true,
    material: ({ metal: m }) => ({ anisotropy: m.brush * 0.6, anisotropyRotation: Math.PI / 2 }),
    face({ metal: m, word: w, wear: e }, sd, tw, th, o, r) {
      const u = 1 / th, S = srgb(m.tint), E = srgb(w.enamel);
      const lw = Math.max(w.lip, 1.2 / o.px), mn = 0.003, mw = 0.012;
      // a polished lip, then the enamel: it climbs the wall and dips in the middle
      const H = (s) => (s >= 0 ? 0 : s > -lw ? s : -lw - mn * (1 - Math.exp((s + lw) / mw)));
      const brush = noise(tw, th, tw * 0.35, 0.9, r), brush2 = noise(tw, th, tw * 0.06, 0.7, r), haze = noise(tw, th, th * 0.3, th * 0.3, r);
      const swirl = marks(tw, th, (x) => {
        for (let i = 0; i < 260 * e.swirls; i++) {
          const rad = th * (0.3 + r() * 2.4), cx = r() * tw, cy = r() * th, a = r() * Math.PI * 2;
          x.globalAlpha = 0.15 + r() * 0.35;
          x.lineWidth = 0.6;
          x.beginPath();
          x.arc(cx, cy, rad, a, a + (th * (0.05 + r() * 0.2)) / rad);
          x.stroke();
        }
      });
      const scr = marks(tw, th, scratching(e.scratches, r, tw, th, 0.7));
      const smu = marks(tw, th, smudging(Math.round(e.smudge * 5), r, tw, th));
      const cov = (t, edge) => clamp01((t - edge) / u + 0.5);
      for (let i = 0; i < tw * th; i++) {
        const s = sd[i] * u, t = -s;
        o.sl[i] = (H(s + u / 2) - H(s - u / 2)) / u;
        const lip = cov(t, 0), en = cov(t, lw);
        const b = (brush[i] + brush2[i] * 0.6) * m.brush;
        const steel = m.polish + b * 0.06 + haze[i] * 0.03 + swirl[i] * 0.1 + scr[i] * 0.12 + smu[i] * 0.22 * e.smudge;
        let rough = mix(steel, 0.04, lip);
        rough = mix(rough, w.gloss + smu[i] * 0.12 * e.smudge + haze[i] * 0.02, en);
        o.rough[i] = rough;
        o.metal[i] = 1 - en;
        const tone = 1 + b * 0.05;
        for (let c = 0; c < 3; c++) o.col[i * 3 + c] = mix(S[c] * tone, E[c], en);
        o.ao[i] = 1 - en * 0.25 * Math.exp(-Math.max(0, t - lw) / 0.006);
        o.hx[i] = (1 - lip) * (b * 0.00012 - swirl[i] * 0.0003 - scr[i] * 0.0008);
      }
    },
  },

  ingot: {
    box: { pos: [-1.6, 2.4, 3], size: [4.5, 2.2] },

    section: ({ edge: e }) => [
      [[-0.4, 0], [-e.draft, 0], [0, -e.thick], [-0.2, -e.thick]],
      [e.round, 0.015],
    ],
    // the mirror round the edge too, the drafted side left from the die a little duller
    edge: ({ metal: m }, [, , ns, nz]) => {
      const side = smooth(0.6, 0.95, Math.abs(ns)) * (nz < 0.4 ? 1 : 0);
      return { color: srgb(m.tint), rough: mix(m.polish, m.polish + 0.14, side), metal: 1 };
    },
    face({ metal: m, word: w, wear: e }, sd, tw, th, o, r) {
      const u = 1 / th, T = srgb(m.tint), dp = w.depth, sw = Math.max(w.soft, u * 2, 2 / o.px);
      // struck: soft walls into a frosted floor
      const H = (s) => (s >= 0 ? 0 : -dp * smooth(0, sw, -s));
      // the mirror is never quite flat: a slow waviness, a faint haze
      const f1 = noise(tw, th, th * 0.7, th * 0.3, r), f2 = noise(tw, th, th * 0.22, th * 0.12, r);
      const haze = noise(tw, th, th * 0.35, th * 0.35, r), grain = noise(tw, th, 1.6, 1.6, r), tarnN = noise(tw, th, th * 0.4, th * 0.4, r);
      const dings = marks(tw, th, (x) => {
        for (let i = 0; i < e.dings; i++) {
          const cx = r() * tw, cy = r() < 0.6 ? (r() < 0.5 ? r() * th * 0.18 : th * (0.82 + r() * 0.18)) : r() * th, rad = th * (0.008 + r() * 0.02);
          const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
          g.addColorStop(0, "rgba(255,255,255,0.9)");
          g.addColorStop(1, "rgba(255,255,255,0)");
          x.fillStyle = g;
          x.beginPath();
          x.arc(cx, cy, rad, 0, Math.PI * 2);
          x.fill();
        }
      });
      const scr = marks(tw, th, scratching(e.scratches, r, tw, th, 0.6));
      const smu = marks(tw, th, smudging(Math.round(e.smudge * 4), r, tw, th));
      for (let i = 0; i < tw * th; i++) {
        const s = sd[i] * u, t = -s;
        o.sl[i] = (H(s + u / 2) - H(s - u / 2)) / u;
        const sunk = smooth(0, sw, t), floor = smooth(sw * 0.5, sw * 1.05, t);
        // the mirror, hazed a touch and by fingers, hairlines catching; the struck word frosted
        const field = m.polish + Math.max(0, haze[i]) * 0.05 + smu[i] * 0.2 * e.smudge + scr[i] * 0.12;
        o.rough[i] = mix(field, m.frost + grain[i] * 0.08, smooth(0.15, 0.85, sunk));
        const tarn = e.tarnish * clamp01(sunk * (1 - floor) * 0.8 + floor * 0.12 + dings[i] * 0.2 + Math.max(0, tarnN[i]) * 0.3);
        o.col[i * 3] = T[0] * (1 - tarn * 0.28);
        o.col[i * 3 + 1] = T[1] * (1 - tarn * 0.32);
        o.col[i * 3 + 2] = T[2] * (1 - tarn * 0.42);
        o.ao[i] = 1 - 0.3 * sunk * (1 - floor);
        const wave = (f1[i] + f2[i] * 0.4) * m.ripple * (1 - sunk);
        o.hx[i] = wave * 0.004 + grain[i] * 0.0002 * floor - dings[i] * 0.0025 - scr[i] * 0.0006 * (1 - sunk);
      }
    },
  },
};

const dataTexture = (data, w, h, srgbSpace = false, mips = true) => {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgbSpace ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mips;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
};

/* The face's surface from the design, then its maps: colour (sRGB), normals,
   and occlusion, roughness and metalness packed as three's ORM (R, G, B). */
function faceSurface(spec, D, field, tw, th, seed, px) {
  const n = tw * th;
  const o = { px, sl: new Float32Array(n), hx: new Float32Array(n), col: new Float32Array(n * 3), rough: new Float32Array(n), metal: new Float32Array(n).fill(1), ao: new Float32Array(n).fill(1) };
  spec.face(D, field.sd, tw, th, o, rng(seed));
  return o;
}
function faceMaps(spec, o, field, tw, th) {
  const n = tw * th;
  const nrm = new Uint8Array(n * 4), clr = new Uint8Array(n * 4), orm = new Uint8Array(n * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const i = y * tw + x, q = ((th - 1 - y) * tw + x) * 4;
      const l = x > 0 ? i - 1 : i, rr = x < tw - 1 ? i + 1 : i, up = y > 0 ? i - tw : i, dn = y < th - 1 ? i + tw : i;
      // the word's profile along its field's gradient, the fine height by differences
      const s = o.sl[i], fx = (o.hx[rr] - o.hx[l]) * 0.5 * th, fy = (o.hx[dn] - o.hx[up]) * 0.5 * th;
      const vx = -(s * field.gx[i] + fx), vy = s * field.gy[i] + fy, len = Math.sqrt(vx * vx + vy * vy + 1);
      nrm[q] = (vx / len * 0.5 + 0.5) * 255;
      nrm[q + 1] = (vy / len * 0.5 + 0.5) * 255;
      nrm[q + 2] = (1 / len * 0.5 + 0.5) * 255;
      nrm[q + 3] = 255;
      clr[q] = clamp01(o.col[i * 3]) * 255;
      clr[q + 1] = clamp01(o.col[i * 3 + 1]) * 255;
      clr[q + 2] = clamp01(o.col[i * 3 + 2]) * 255;
      clr[q + 3] = 255;
      orm[q] = clamp01(o.ao[i]) * 255;
      orm[q + 1] = Math.min(1, Math.max(0.02, o.rough[i])) * 255;
      orm[q + 2] = clamp01(o.metal[i]) * 255;
      orm[q + 3] = 255;
    }
  }
  const maps = { normal: dataTexture(nrm, tw, th), color: dataTexture(clr, tw, th, true), orm: dataTexture(orm, tw, th) };
  // the brushing's direction and strength, only where it is metal (the enamel is glass)
  if (spec.brushed) {
    const an = new Uint8Array(n * 4);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) an.set([255, 128, o.metal[y * tw + x] * 255, 255], ((th - 1 - y) * tw + x) * 4);
    maps.aniso = dataTexture(an, tw, th);
  }
  return maps;
}

// the edge's finish down its section, as two one-texel-wide maps
function edgeMaps(spec, D, sec) {
  const J = sec.length, clr = new Uint8Array(J * 4), orm = new Uint8Array(J * 4);
  sec.forEach((p, j) => {
    const f = spec.edge(D, p);
    clr.set([f.color[0] * 255, f.color[1] * 255, f.color[2] * 255, 255], j * 4);
    orm.set([255, Math.max(0.02, f.rough) * 255, f.metal * 255, 255], j * 4);
  });
  return { color: dataTexture(clr, 1, J, true, false), orm: dataTexture(orm, 1, J, false, false) };
}

/* The shadow on the paper: a wide soft one from the overhead light, falling
   a little down the page, and the dark contact right under the edge. */
function shadowTexture(W) {
  const m = 0.6, ppu = 160, c = document.createElement("canvas");
  c.width = Math.ceil((W + 2 * m) * ppu);
  c.height = Math.ceil((1 + 2 * m) * ppu);
  const x = c.getContext("2d");
  x.fillStyle = "#000";
  const pill = (inset, blur, dy, alpha) => {
    x.filter = `blur(${(blur * ppu).toFixed(1)}px)`;
    x.globalAlpha = alpha;
    x.beginPath();
    x.roundRect((m + inset) * ppu, (m + inset + dy) * ppu, (W - 2 * inset) * ppu, (1 - 2 * inset) * ppu, (0.5 - inset) * ppu);
    x.fill();
  };
  pill(0.02, 0.14, 0.09, 0.42);
  pill(0.015, 0.03, 0.02, 0.75);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { texture: t, w: W + 2 * m, h: 1 + 2 * m };
}

/* ---- the studio ------------------------------------------------------- */

const softbox = () => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "#000";
  x.fillRect(0, 0, 128, 128);
  x.filter = "blur(4px)";
  x.fillStyle = "#fff";
  x.fillRect(8, 8, 112, 112);
  return new THREE.CanvasTexture(c);
};
/* The scrim behind the camera: brighter on one side, and the black card round
   the lens (flag) that a polished face, and the engraving's floor, mirror;
   moved off the lens (at), its soft edge falls across a mirror as a gradient. */
const scrim = (flag, at = 0) => {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 192;
  const x = c.getContext("2d");
  x.fillStyle = "#000";
  x.fillRect(0, 0, 256, 192);
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, "#fff");
  g.addColorStop(1, "#8c8c8c");
  x.filter = "blur(4px)";
  x.fillStyle = g;
  x.fillRect(6, 6, 244, 180);
  if (flag > 0) {
    x.filter = "blur(10px)";
    x.fillStyle = `rgba(0,0,0,${Math.min(1, flag)})`;
    x.beginPath();
    x.roundRect(128 - 30 + at * 256, 96 - 26, 60, 52, 12);
    x.fill();
  }
  return new THREE.CanvasTexture(c);
};

/* A product studio over the paper: a dark room; a long strip straight
   overhead (toward the top of the page), which the top of every edge mirrors;
   tall strips either side for the round ends; a big scrim behind the camera
   for the flat faces, with a black card round the lens; a low card bouncing
   a little back into the bottom edges. */
function studioEnv(renderer, S, paper = "#f4f6f1") {
  const scene = new THREE.Scene();
  const room = new THREE.SphereGeometry(30, 32, 16), p = room.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const v = mix(0.006, 0.05, smooth(-1, 1, p.getY(i) / 30)) * (S.room ?? 1);
    col.push(v, v, v);
  }
  room.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const disposables = [room];
  const roomMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  disposables.push(roomMat);
  scene.add(new THREE.Mesh(room, roomMat));
  /* The paper they lie on (the page), lit just round them and falling off
     into the dark: what their steep sides mirror; the edges, which look out
     low across it, still see the strips and the dark. */
  if (S.paper > 0) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d"), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.05, "#eee");
    g.addColorStop(0.12, "#555");
    g.addColorStop(0.25, "#000");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c), geo = new THREE.PlaneGeometry(70, 70);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(paper).multiplyScalar(S.paper), side: THREE.DoubleSide });
    disposables.push(tex, geo, mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.z = -0.6;
    scene.add(m);
  }
  const rig = new THREE.Group();
  rig.rotation.y = S.turn * DEG;
  scene.add(rig);
  const soft = softbox(), grad = scrim(S.flag ?? 0, S.flagAt ?? 0);
  disposables.push(soft, grad);
  const box = (w, h, v, pos, map) => {
    if (v <= 0) return;
    const g = new THREE.PlaneGeometry(w, h), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v), map, side: THREE.DoubleSide });
    disposables.push(g, mat);
    const m = new THREE.Mesh(g, mat);
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    rig.add(m);
  };
  box(22, 5, S.key, [0, 10, 0.3], soft);
  box(4.6, 16, S.sides, [-10, 1.5, 0], soft);
  box(4.6, 16, S.sides * 0.6, [10, 0.5, 0], soft);
  box(24, 18, S.front, [0, 0, 13], grad);
  box(18, 4, S.floor, [0, -10, 0.3], soft);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0, 0.1, 100);
  pmrem.dispose();
  for (const d of disposables) d.dispose();
  return target;
}

/* ---- chrome: matcap and bloom ----------------------------------------- */

/** The matcaps (public/images/matcaps), by the name the Params panel shows. */
export const MATCAPS = {
  Hall: "chrome-hall",
  Horizon: "chrome-horizon",
  Room: "chrome-room",
  Soft: "chrome-soft",
  "Studio dome": "studio-dome",
  "Studio rings": "studio-rings",
};
const matcapCache = new Map();
// from the site's root, so the matcaps also load where the site is served from a folder (the Creative
// Studio frames the build at /designs/kinetic/kineticstudio-src/): from "/images/..." they 404 there and
// the chrome, with nothing to mirror, goes black (Hunter, Oct 25: "what happened to these guys?")
const ROOT = document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
function loadMatcap(name) {
  const slug = MATCAPS[name] ?? MATCAPS.Hall;
  if (!matcapCache.has(slug)) {
    matcapCache.set(slug, new THREE.TextureLoader().loadAsync(new URL(`images/matcaps/${slug}.jpg`, ROOT).href).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }));
  }
  return matcapCache.get(slug);
}

/* Chrome as a matcap: the view-space normal (the face's from its relief map,
   the edge's from the mesh) looks up the matcap, turned round the view axis
   as the light goes round (spin); and the light itself, a bright lobe on the
   part of the edge that faces it, so a shine travels round the pill. Writes
   linear light, over 1 where it is hot, for the bloom. */
function chromeMaterial(maps) {
  return new THREE.ShaderMaterial({
    defines: maps ? { FACE: "" } : {},
    uniforms: {
      matcap: { value: null },
      nmap: { value: maps?.normal ?? null },
      cmap: { value: maps?.color ?? null },
      orm: { value: maps?.orm ?? null },
      tint: { value: new THREE.Color(1, 1, 1) },
      fill: { value: new THREE.Color(0, 0, 0) },
      smoke: { value: 0.85 },
      spin: { value: 0 },
      light: { value: new THREE.Vector2(1, 0) },
      highlight: { value: 1 },
      tight: { value: 6 },
      exposure: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN, vT, vB, vZ;
      void main() {
        vUv = uv;
        vN = normalMatrix * normal;
        vT = normalMatrix * vec3(1.0, 0.0, 0.0);
        vB = normalMatrix * vec3(0.0, 1.0, 0.0);
        vZ = normalMatrix * vec3(0.0, 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D matcap, nmap, cmap, orm;
      uniform vec3 tint, fill;
      uniform vec2 light;
      uniform float spin, highlight, tight, exposure, smoke;
      varying vec2 vUv;
      varying vec3 vN, vT, vB, vZ;
      void main() {
        vec3 base = vec3(1.0);
        float ao = 1.0, inked = 0.0;
        #ifdef FACE
          vec3 m = texture2D(nmap, vUv).xyz * 2.0 - 1.0;
          vec3 n = normalize(vT * m.x + vB * m.y + vZ * m.z);
          vec3 o = texture2D(orm, vUv).rgb;
          ao = o.r;
          // the field (o.g) smoked to its fill, live; the letters bare chrome
          base = mix(vec3(1.0), fill, o.g);
          inked = o.g * smoke;
        #else
          vec3 n = normalize(vN);
        #endif
        float c = cos(spin), s = sin(spin);
        vec2 q = mat2(c, s, -s, c) * n.xy;
        vec3 mc = texture2D(matcap, q * 0.49 + 0.5).rgb * tint;
        // the light round the edge: strongest where the edge turns to face it
        float edge = smoothstep(0.25, 0.95, length(n.xy));
        float lobe = pow(max(dot(normalize(n.xy + 1e-5), light), 0.0), tight) * edge;
        float lum = dot(mc, vec3(0.299, 0.587, 0.114));
        vec3 col = mc * (1.0 + lobe * highlight * 3.0) + lobe * highlight * (0.25 + lum) * vec3(1.0, 0.985, 0.96);
        // the smoked field: its own dark colour, mirroring only faintly
        col = mix(col, base * (0.6 + mc * 0.5) + mc * 0.05, inked);
        col *= ao * exposure;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

const QUAD_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const quadMat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });

/* The bloom: what is over the threshold, blurred at three sizes and added
   back; then laid on the page with its own alpha, so the glow spills a
   little past each pill's edge instead of greying the paper. */
function makePost(renderer) {
  const opts = { type: THREE.HalfFloatType, depthBuffer: false };
  const scene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const levels = [0, 1, 2].map(() => [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)]);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bright = quadMat(/* glsl */ `
    uniform sampler2D src; uniform float threshold; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(src, vUv).rgb;
      float l = max(c.r, max(c.g, c.b));
      float k = smoothstep(threshold, threshold + 0.6, l);
      gl_FragColor = vec4(c * k, 1.0);
    }`, { src: { value: null }, threshold: { value: 1 } });
  const blur = quadMat(/* glsl */ `
    uniform sampler2D src; uniform vec2 step; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(src, vUv).rgb * 0.227;
      c += (texture2D(src, vUv + step * 1.385).rgb + texture2D(src, vUv - step * 1.385).rgb) * 0.316;
      c += (texture2D(src, vUv + step * 3.231).rgb + texture2D(src, vUv - step * 3.231).rgb) * 0.070;
      gl_FragColor = vec4(c, 1.0);
    }`, { src: { value: null }, step: { value: new THREE.Vector2() } });
  const comp = quadMat(/* glsl */ `
    uniform sampler2D src, b0, b1, b2; uniform float strength, radius, spill; varying vec2 vUv;
    vec3 enc(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec4 sc = texture2D(src, vUv);
      vec3 b = texture2D(b0, vUv).rgb + texture2D(b1, vUv).rgb * radius + texture2D(b2, vUv).rgb * radius * radius;
      b *= strength;
      // a soft shoulder, so the hottest chrome rolls into white rather than clipping flat
      vec3 rgb = sc.rgb + b;
      rgb = rgb / (1.0 + max(rgb - 0.85, 0.0) * 0.6);
      float a = max(sc.a, clamp(max(b.r, max(b.g, b.b)) * spill, 0.0, 1.0));
      rgb = min(rgb, vec3(a));
      // premultiplied: encode the colour, not the alpha
      vec3 straight = rgb / max(a, 1e-4);
      gl_FragColor = vec4(enc(clamp(straight, 0.0, 1.0)) * a, a);
    }`, { src: { value: null }, b0: { value: null }, b1: { value: null }, b2: { value: null }, strength: { value: 1 }, radius: { value: 0.6 }, spill: { value: 0.5 } });
  comp.premultipliedAlpha = true;
  comp.blending = THREE.CustomBlending;
  comp.blendSrc = THREE.OneFactor;
  comp.blendDst = THREE.OneMinusSrcAlphaFactor;
  const pass = (mat, target) => {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quad, cam);
  };
  let w = 0, h = 0;
  return {
    target: scene,
    size(W, H) {
      if (W === w && H === h) return;
      w = W;
      h = H;
      scene.setSize(W, H);
      levels.forEach(([a, b], i) => {
        const d = 2 ** (i + 1);
        a.setSize(Math.max(1, Math.round(W / d)), Math.max(1, Math.round(H / d)));
        b.setSize(Math.max(1, Math.round(W / d)), Math.max(1, Math.round(H / d)));
      });
    },
    // bloom the scene target and lay it on the canvas
    finish(G) {
      const on = G.bloom > 0;
      if (on) {
        bright.uniforms.src.value = scene.texture;
        bright.uniforms.threshold.value = G.threshold;
        pass(bright, levels[0][0]);
        levels.forEach(([a, b], i) => {
          if (i > 0) {
            blur.uniforms.src.value = levels[i - 1][0].texture;
            blur.uniforms.step.value.set(0, 0);
            pass(blur, a);
          }
          for (let k = 0; k < 2; k++) {
            blur.uniforms.src.value = a.texture;
            blur.uniforms.step.value.set(1 / a.width, 0);
            pass(blur, b);
            blur.uniforms.src.value = b.texture;
            blur.uniforms.step.value.set(0, 1 / a.height);
            pass(blur, a);
          }
        });
      }
      comp.uniforms.src.value = scene.texture;
      comp.uniforms.b0.value = levels[0][0].texture;
      comp.uniforms.b1.value = levels[1][0].texture;
      comp.uniforms.b2.value = levels[2][0].texture;
      comp.uniforms.strength.value = on ? G.bloom : 0;
      comp.uniforms.radius.value = G.radius;
      comp.uniforms.spill.value = G.spill;
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      const full = renderer.getSize(new THREE.Vector2());
      renderer.setViewport(0, 0, full.x, full.y);
      renderer.clear();
      quad.material = comp;
      renderer.render(quad, cam);
    },
    dispose() {
      scene.dispose();
      for (const [a, b] of levels) a.dispose(), b.dispose();
      quad.geometry.dispose();
      for (const m of [bright, blur, comp]) m.dispose();
    },
  };
}

/* ---- mount ------------------------------------------------------------ */

/** Three made pills drawn over their slots. */
export function mountCoins(canvas, slots, look, { font = getComputedStyle(slots[0]).fontFamily } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return null;
  }
  const dpr = devicePixelRatio || 1;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.toneMapping = THREE.NeutralToneMapping;
  RectAreaLightUniformsLib.init();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const host = canvas.parentElement;
  // the paper's colour: the page's own ground
  const paper = (() => {
    const c = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
    return c && c.length >= 3 && (c[3] === undefined || +c[3] > 0) ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : "#f4f6f1";
  })();
  let L = look;
  let coins = [], env = null, envKey = "", post = null;
  const fields = new Map(); // the words' fields, kept for the next build while the type is the same

  const keyOf = () => {
    const k = String(L.design).toLowerCase();
    return DESIGNS[k] ? k : "machined";
  };

  // the canvas just over the pills (with room for their shadows), not the whole line
  const fit = () => {
    const base = host.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of slots) {
      const r = s.getBoundingClientRect();
      if (!r.width) continue;
      const pad = r.height * 0.6;
      x0 = Math.min(x0, r.left - pad);
      y0 = Math.min(y0, r.top - pad);
      x1 = Math.max(x1, r.right + pad);
      y1 = Math.max(y1, r.bottom + pad);
    }
    if (x0 === Infinity) return;
    Object.assign(canvas.style, { inset: "auto", left: `${x0 - base.left}px`, top: `${y0 - base.top}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
  };

  const refreshEnv = () => {
    if (DESIGNS[keyOf()].matcap) return; // chrome mirrors its matcap, not the studio
    const S = L[keyOf()].studio, k = [S.room, S.key, S.sides, S.front, S.flag, S.flagAt, S.floor, S.paper, S.turn, paper].join();
    if (k === envKey) return;
    env?.dispose();
    env = studioEnv(renderer, S, paper);
    envKey = k;
    for (const c of coins) for (const m of c.mats) m.envMap = env.texture;
  };

  /* One pill, made in steps (its word's field, its maps, the rest), a yield
     between each so making three never holds the page up for long. */
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  async function* makeCoin(slot, i, spec, D) {
    const box = slot.getBoundingClientRect();
    const W = Math.max(1.6, box.width / Math.max(1, box.height));
    // about twice the pill's pixels on screen, so the word's walls stay crisp (chrome, all bevel and no grain, needs less)
    const over = spec.matcap ? 1.5 : 2, most = spec.matcap ? 1536 : 2048;
    const tw = Math.min(most, Math.max(768, Math.ceil((box.width * dpr * over) / 128) * 128)), th = Math.round(tw / W);
    const word = slot.textContent.trim().toUpperCase();
    const fk = [word, tw, th, D.word.size, D.word.tracking, font].join("|");
    if (!fields.has(fk)) {
      fields.set(fk, wordField(word, tw, th, font, D.word.size, D.word.tracking));
      yield;
    }
    const surface = faceSurface(spec, D, fields.get(fk), tw, th, D.wear.seed * 7919 + i * 131 + 17, Math.max(24, box.height * Math.min(dpr * L.render.quality, 3)));
    yield;
    const maps = faceMaps(spec, surface, fields.get(fk), tw, th);
    yield;
    const [corners, radii] = spec.section(D);
    const sec = section(corners, radii), ol = outline(W), edge = edgeMaps(spec, D, sec);
    const scene = new THREE.Scene(), group = new THREE.Group();
    scene.add(group);
    const extra = spec.material?.(D) ?? {};
    const metal = (opts) => {
      const m = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 1, envMap: env.texture, envMapIntensity: D.studio.reflect, ...extra, ...opts });
      m.envMapRotation = new THREE.Euler();
      return m;
    };
    const faceMat = spec.matcap
      ? chromeMaterial(maps)
      : metal({ map: maps.color, normalMap: maps.normal, roughnessMap: maps.orm, metalnessMap: maps.orm, aoMap: maps.orm, aoMapIntensity: 1, ...(maps.aniso && { anisotropyMap: maps.aniso }) });
    const ringMat = spec.matcap ? chromeMaterial(null) : metal({ map: edge.color, roughnessMap: edge.orm, metalnessMap: edge.orm });
    const cap = capGeometry(ol, sec[0][0], W), ring = ringGeometry(ol, sec);
    group.add(new THREE.Mesh(cap, faceMat), new THREE.Mesh(ring, ringMat));
    // the shadow stays on the paper while the pill drifts
    const sh = shadowTexture(W), shGeo = new THREE.PlaneGeometry(sh.w, sh.h);
    const shMat = new THREE.MeshBasicMaterial({ map: sh.texture, transparent: true, depthWrite: false, opacity: D.studio.shadow, toneMapped: false });
    const shadow = new THREE.Mesh(shGeo, shMat);
    const back = D.edge.thick + 0.02;
    shadow.position.z = -back;
    scene.add(shadow);
    // a long lens, as a product is shot: the ends barely off the axis, so their edges mirror the side strips
    const camera = new THREE.PerspectiveCamera(6, 1, 0.1, 100);
    // the soft box close by, fixed in the studio: the pill drifts under it, so its light slides across the face
    let lamp = null;
    if (spec.box) {
      lamp = new THREE.RectAreaLight(0xffffff, D.studio.box, spec.box.size[0], spec.box.size[1]);
      lamp.position.set(...spec.box.pos);
      lamp.lookAt(0, 0, 0);
      scene.add(lamp);
    }
    const texs = [...Object.values(maps), edge.color, edge.orm, sh.texture];
    // up to the GPU now, rather than in the first frame that draws it
    for (const t of texs) renderer.initTexture(t);
    return {
      slot, scene, group, camera, shadow, lamp, back, W, field: fk, matcap: D.metal?.matcap, mats: [faceMat, ringMat], phase: i * 2.1 + 0.4, lx: 0, ly: 0,
      dispose() {
        for (const g of [cap, ring, shGeo]) g.dispose();
        for (const m of [faceMat, ringMat, shMat]) m.dispose();
        for (const t of texs) t.dispose();
      },
    };
  }
  // all three made, then swapped in together; a newer build (or destroy) drops an older one
  let gen = 0;
  const build = async () => {
    const my = ++gen, key = keyOf(), spec = DESIGNS[key], D = L[key], next = [];
    const drop = () => {
      for (const k of next) k.dispose();
      return false;
    };
    for (let i = 0; i < slots.length; i++) {
      const steps = makeCoin(slots[i], i, spec, D);
      for (;;) {
        await yieldNow();
        if (my !== gen) {
          await steps.return();
          return drop();
        }
        const { value, done } = await steps.next();
        if (done) {
          next.push(value);
          break;
        }
      }
    }
    if (spec.matcap) {
      const mc = await loadMatcap(D.metal.matcap).catch(() => null);
      for (const k of next) for (const m of k.mats) m.uniforms.matcap.value = mc;
      post ??= makePost(renderer);
    }
    // the shaders compiled off the main thread where the browser can, before the first frame needs them
    await renderer.compileAsync?.(next[0].scene, next[0].camera).catch(() => {});
    if (my !== gen) return drop();
    for (const k of coins) k.dispose();
    coins = next;
    // keep only the fields these three use (a few megabytes each)
    for (const k of fields.keys()) if (!next.some((c) => c.field === k)) fields.delete(k);
    apply();
    redraw();
    return true;
  };

  const apply = () => {
    const D = L[keyOf()], S = D.studio, chrome = DESIGNS[keyOf()].matcap;
    renderer.setPixelRatio(Math.min(dpr * L.render.quality, 3));
    renderer.toneMappingExposure = S.exposure;
    refreshEnv();
    for (const k of coins) {
      k.shadow.material.opacity = S.shadow;
      if (k.lamp) k.lamp.intensity = S.box;
      for (const m of k.mats) {
        if (!chrome) m.envMapIntensity = S.reflect;
        else if (m.uniforms) {
          m.uniforms.tint.value.set(D.metal.tint);
          m.uniforms.highlight.value = D.light.highlight;
          m.uniforms.tight.value = D.light.tight;
          m.uniforms.exposure.value = S.exposure;
          m.uniforms.fill.value.set(D.word.fill);
          m.uniforms.smoke.value = D.word.field;
        }
      }
    }
    // a new matcap, swapped in live once it has loaded
    if (chrome && coins.length && coins[0].matcap !== D.metal.matcap) {
      const name = D.metal.matcap, set = coins;
      for (const k of set) k.matcap = name;
      loadMatcap(name).then((mc) => {
        for (const k of set) for (const m of k.mats) m.uniforms && (m.uniforms.matcap.value = mc);
        redraw();
      }, () => {});
    }
  };
  fit();
  refreshEnv();
  apply();
  const ready = build();

  const pointer = { x: innerWidth / 2, y: innerHeight / 2, on: false };
  const onMove = (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.on = true;
  };
  addEventListener("pointermove", onMove, { passive: true });

  let raf = 0, last = 0, t = 0, orbit = 0, on = true;
  const draw = (now) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const mo = L.motion, D = L[keyOf()], chrome = DESIGNS[keyOf()].matcap && post;
    t += reduced ? 0 : dt * mo.speed;
    const c = canvas.getBoundingClientRect();
    const cw = canvas.clientWidth, ch = canvas.clientHeight, pr = renderer.getPixelRatio();
    if (canvas.width !== Math.round(cw * pr) || canvas.height !== Math.round(ch * pr)) renderer.setSize(cw, ch, false);
    const rt = chrome ? post.target : null;
    if (rt) {
      post.size(canvas.width, canvas.height);
      rt.scissorTest = false;
      renderer.setRenderTarget(rt);
      renderer.clear();
      // the light goes round: turns a second; held still, it stays up and to the left
      orbit += reduced ? 0 : dt * D.light.orbit;
    } else {
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
    }
    const ease = 1 - Math.exp(-dt * 2.2);
    coins.forEach((k, i) => {
      const r = k.slot.getBoundingClientRect();
      if (!r.width) return;
      const pad = r.height * 0.5;
      const x = r.left - c.left - pad, y = ch - (r.bottom - c.top) - pad, w = r.width + pad * 2, h = r.height + pad * 2;
      if (rt) {
        rt.viewport.set(x * pr, y * pr, w * pr, h * pr);
        rt.scissor.copy(rt.viewport);
        rt.scissorTest = true;
        renderer.setRenderTarget(rt);
      } else {
        renderer.setViewport(x, y, w, h);
        renderer.setScissor(x, y, w, h);
      }
      renderer.clearDepth();
      k.camera.aspect = w / h;
      // the pill a touch inside its slot, so the comma beside it keeps its place
      const dist = (h / r.height) / 0.95 / 2 / Math.tan((k.camera.fov * DEG) / 2);
      k.camera.position.set(0, 0, dist);
      k.camera.updateProjectionMatrix();
      // the shadow sized back up to the face's silhouette, from behind it
      k.shadow.scale.setScalar((dist + k.back) / dist);
      // a lean toward the pointer, from where it is against this pill
      if (!reduced && pointer.on) {
        const tx = Math.max(-1, Math.min(1, (pointer.x - (r.left + r.width / 2)) / (innerWidth * 0.5)));
        const ty = Math.max(-1, Math.min(1, (pointer.y - (r.top + r.height / 2)) / (innerHeight * 0.5)));
        k.lx += (tx - k.lx) * ease;
        k.ly += (ty - k.ly) * ease;
      }
      // and a slow drift, each its own
      k.group.rotation.set(
        (Math.sin(t * 0.9 + k.phase) * mo.drift * 0.5 + k.ly * mo.lean * 0.6) * DEG,
        (Math.sin(t * 0.63 + k.phase * 1.3) * mo.drift + k.lx * mo.lean) * DEG,
        Math.sin(t * 0.41 + k.phase) * mo.drift * 0.08 * DEG,
      );
      if (rt) {
        // one light round all three: each pill a little behind the one before it
        const a = (reduced ? 0.62 : orbit * Math.PI * 2) - i * D.light.lag;
        for (const m of k.mats) {
          m.uniforms.light.value.set(Math.cos(a), Math.sin(a));
          m.uniforms.spin.value = (a - 0.62) * D.light.spin;
        }
      }
      renderer.render(k.scene, k.camera);
    });
    if (rt) {
      post.finish(D.glow);
    }
    if (on && !reduced) raf = requestAnimationFrame(draw);
  };
  const io = new IntersectionObserver(([e]) => {
    on = e.isIntersecting;
    if (on && !raf) {
      last = 0;
      raf = requestAnimationFrame(draw);
    }
  });
  io.observe(canvas);
  raf = requestAnimationFrame(draw);
  const redraw = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };
  // refit when the line reflows or its words finish rising; held still, draw again
  let sized = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(sized);
    sized = requestAnimationFrame(() => {
      fit();
      redraw();
    });
  });
  ro.observe(host);
  const settle = () => {
    fit();
    redraw();
  };
  host.addEventListener("animationend", settle);

  return {
    /** resolves once the pills are made and drawn */
    ready,
    update(next) {
      L = next;
      apply();
      redraw();
    },
    rebuild(next) {
      L = next;
      refreshEnv();
      apply();
      return build();
    },
    destroy() {
      gen++;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      host.removeEventListener("animationend", settle);
      removeEventListener("pointermove", onMove);
      for (const k of coins) k.dispose();
      env?.dispose();
      post?.dispose();
      renderer.dispose();
    },
  };
}
