/* Magnetic underlines for the contact form.

   Every field is just a line, and the line is pulled up toward the caret the
   way the logo's lines are pulled toward the pill: a soft hump that rides
   along under the character being typed, lifting a touch on each key and
   easing to wherever you click, slowly and without a wobble. Hovering a field pulls a softer
   hump toward the pointer. A textarea is ruled, one line per row, and only
   the caret's row is pulled.

     magnetize(root) -> { destroy() }

   Markup: a [data-magnet] wrapper holding one input, select or textarea and
   an empty <svg class="contact_line">. Each keystroke plays the kit's "key"
   sound through ks:sound, pitched a touch differently every time. */

const ctx = document.createElement("canvas").getContext("2d");
let mirror = null;

const STEP = 3; // px between path samples
const LIFT = { focus: 7, hover: 3.5 };

function fontOf(cs) {
  return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}

// where the caret is inside an input (or the end of a select's text)
function caretX(el) {
  const cs = getComputedStyle(el);
  ctx.font = fontOf(cs);
  if ("letterSpacing" in ctx) ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
  let text;
  if (el.tagName === "SELECT") text = el.selectedOptions[0]?.text ?? "";
  else {
    let end = el.value.length;
    try {
      end = el.selectionEnd ?? end;
    } catch {}
    text = el.value.slice(0, end);
  }
  return parseFloat(cs.paddingLeft) + ctx.measureText(text).width - (el.scrollLeft || 0);
}

// where the caret is inside a textarea: a hidden copy, wrapped the same way
function caretXY(ta) {
  const cs = getComputedStyle(ta);
  if (!mirror) {
    mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    Object.assign(mirror.style, { position: "absolute", top: "0", left: "-9999px", visibility: "hidden", whiteSpace: "pre-wrap", overflowWrap: "break-word" });
    document.body.append(mirror);
  }
  for (const p of ["boxSizing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "textTransform", "wordSpacing", "textIndent"]) {
    mirror.style[p] = cs[p];
  }
  mirror.style.width = `${ta.clientWidth}px`;
  const end = ta.selectionEnd ?? ta.value.length;
  mirror.textContent = ta.value.slice(0, end);
  const mark = document.createElement("span");
  mark.textContent = "​";
  mirror.append(mark);
  return { x: mark.offsetLeft, y: mark.offsetTop - ta.scrollTop };
}

export function magnetize(root) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const fields = [];
  let raf = 0;
  let last = 0;

  for (const wrap of root.querySelectorAll("[data-magnet]")) {
    const el = wrap.querySelector("input, select, textarea");
    const svg = wrap.querySelector(".contact_line");
    if (!el || !svg) continue;
    fields.push({ wrap, el, svg, kind: el.tagName.toLowerCase(), rows: [], w: 0, h: 0, lh: 0, pad: 0, focus: false, hover: null, row: 0 });
  }

  const row = () => ({ path: null, cx: 0, v: 0, a: 0, av: 0, goal: 0, lift: 0 });

  const layout = (f) => {
    f.w = f.el.clientWidth;
    f.h = f.el.offsetHeight;
    f.svg.setAttribute("viewBox", `0 0 ${f.w} ${f.h}`);
    const cs = getComputedStyle(f.el);
    f.lh = parseFloat(cs.lineHeight) || 32;
    f.pad = parseFloat(cs.paddingTop) || 0;
    const count = f.kind === "textarea" ? Math.max(1, Math.floor((f.h - f.pad) / f.lh)) : 1;
    while (f.rows.length < count) f.rows.push(row());
    f.rows.length = count;
    f.svg.replaceChildren(
      ...f.rows.map((r) => {
        r.path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        return r.path;
      }),
    );
  };

  // the line under row i, in svg px; a textarea's rules scroll with its text
  const baseY = (f, i) => {
    if (f.kind !== "textarea") return f.h - 0.75;
    const shift = f.el.scrollTop % f.lh;
    return f.pad + (i + 1) * f.lh - 0.75 - shift;
  };

  const aim = (f) => {
    if (f.focus) {
      if (f.kind === "textarea") {
        const { x, y } = caretXY(f.el);
        f.row = Math.max(0, Math.min(f.rows.length - 1, Math.floor((y - f.pad + f.lh * 0.5) / f.lh)));
        f.rows.forEach((r, i) => {
          r.goal = i === f.row ? x : r.goal;
          r.lift = i === f.row ? LIFT.focus : 0;
        });
      } else {
        f.rows[0].goal = Math.min(f.w, caretX(f.el));
        f.rows[0].lift = LIFT.focus;
      }
    } else if (f.hover) {
      const i = f.kind === "textarea" ? Math.max(0, Math.min(f.rows.length - 1, Math.floor((f.hover.y - f.pad) / f.lh))) : 0;
      f.rows.forEach((r, j) => {
        if (j === i) r.goal = f.hover.x;
        r.lift = j === i ? LIFT.hover : 0;
      });
    } else for (const r of f.rows) r.lift = 0;
  };

  const draw = (f) => {
    f.rows.forEach((r, i) => {
      const y0 = baseY(f, i);
      const width = 22 + Math.min(14, Math.abs(r.v) * 0.02); // a broad pull, a little longer as it travels
      let d = "";
      for (let x = 0; x <= f.w + STEP - 1; x += STEP) {
        const xx = Math.min(x, f.w);
        const u = (xx - r.cx) / width;
        // the pull, plus a faint give either side of it, as a magnet would
        const y = y0 - r.a * (Math.exp(-u * u) - 0.14 * Math.exp(-((Math.abs(u) - 1.7) ** 2) * 1.6));
        d += `${x ? "L" : "M"}${xx.toFixed(1)} ${y.toFixed(2)}`;
      }
      r.path.setAttribute("d", d);
    });
  };

  const tick = (now) => {
    raf = 0;
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;
    let moving = false;
    for (const f of fields) {
      for (const r of f.rows) {
        if (reduce.matches) {
          r.cx = r.goal;
          r.a = r.lift;
          r.v = r.av = 0;
        } else {
          // both critically damped and slow: the hump glides and settles,
          // it never wobbles (Hunter, Oct 23: "slow, fluid, and intentional")
          r.v += ((r.goal - r.cx) * 70 - r.v * 16.7) * dt;
          r.cx += r.v * dt;
          r.av += ((r.lift - r.a) * 36 - r.av * 12) * dt;
          r.a += r.av * dt;
        }
        if (Math.abs(r.goal - r.cx) > 0.1 || Math.abs(r.v) > 0.5 || Math.abs(r.lift - r.a) > 0.02 || Math.abs(r.av) > 0.1) moving = true;
      }
      draw(f);
    }
    if (moving) raf = requestAnimationFrame(tick);
  };

  const wake = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const play = (name, rate = 1, gain = 1) => window.dispatchEvent(new CustomEvent("ks:sound", { detail: { name, rate, gain } }));

  const offs = [];
  const on = (t, type, fn, opts) => {
    t.addEventListener(type, fn, opts);
    offs.push(() => t.removeEventListener(type, fn, opts));
  };

  for (const f of fields) {
    const { el, wrap } = f;
    const refresh = () => {
      aim(f);
      wake();
    };
    on(el, "focus", () => {
      f.focus = true;
      wrap.classList.add("is-focus");
      // start the hump where the pointer was, so it slides to the caret
      if (f.hover) for (const r of f.rows) r.cx = f.hover.x;
      requestAnimationFrame(refresh);
    });
    on(el, "blur", () => {
      f.focus = false;
      wrap.classList.remove("is-focus");
      refresh();
    });
    on(el, "input", (e) => {
      const erase = e.inputType?.startsWith("delete");
      aim(f);
      const r = f.rows[f.kind === "textarea" ? f.row : 0];
      if (r) r.av += erase ? -10 : 8;
      if (f.kind !== "select") play("key", (erase ? 0.82 : 0.94) + Math.random() * 0.14, 0.45);
      wake();
    });
    on(el, "change", () => {
      if (f.kind === "select") {
        play("detent", 1, 0.6);
        refresh();
      }
    });
    on(el, "keyup", refresh);
    on(el, "click", refresh);
    on(el, "scroll", refresh, { passive: true });
    on(wrap, "pointermove", (e) => {
      const b = el.getBoundingClientRect();
      f.hover = { x: Math.max(0, Math.min(b.width, e.clientX - b.left)), y: e.clientY - b.top };
      if (!f.focus) refresh();
    });
    on(wrap, "pointerleave", () => {
      f.hover = null;
      refresh();
    });
  }
  // arrow keys, shift-selects and the like move the caret without an input
  on(document, "selectionchange", () => {
    const f = fields.find((x) => x.el === document.activeElement);
    if (f) {
      aim(f);
      wake();
    }
  });

  const ro = new ResizeObserver(() => {
    for (const f of fields) {
      layout(f);
      aim(f);
      draw(f);
    }
  });
  for (const f of fields) {
    layout(f);
    draw(f);
    ro.observe(f.el);
  }
  // the brand fonts change every width once they land
  document.fonts?.ready.then(() => fields.forEach((f) => (aim(f), draw(f))));

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      offs.forEach((off) => off());
    },
  };
}
