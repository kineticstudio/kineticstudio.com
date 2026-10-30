/* Vendored, unchanged, from kinetic-creative-studio shared/params/params.js (9aec2087 + hooks.panel "always").
   Hunter's own Params: framed in the Creative Studio, the Studio draws these
   dials in its own panel; on the site, the standalone panel below draws them.
   Copy the file over again to take a change; do not edit it here. */

/*! ks-params v1 — a tool's dials, published for the studio to render.

   A design tool declares what it can be tweaked by, and nothing about how
   that looks. The studio reads the declaration and draws the panel in its
   own right-hand slot, so params sits beside comments and the inspector and
   is chrome the studio owns end to end.

   Opened by itself in a browser tab there is no studio, so this file draws a
   minimal panel of its own. It stays hidden until P is pressed: a tool must
   never carry a params button on the design.

   Usage:

     import { defineParams } from "/shared/params/params.js";

     const p = defineParams("thread button", {
       ground: true,                                  // Dark / Light
       viewport: { type: 'toggle',                    // two tabs, your words
                   labels: ['Desktop', 'Mobile'] },
       sweep: {                                       // a group
         blocks:   [3, 1, 6, 1],                      // [value, min, max, step]
         duration: [900, 300, 2000, 10],
       },
       color: {
         sequence: { type: "select", options: ["Blue to green", "Warm"] },
       },
       copyProps: { type: "action", label: "Copy props" },
     }, {
       onChange: (values, path) => render(values),
       onAction: (name) => { if (name === "copyProps") copy(); },
     });

   `p.values` is always the current set. */

const VERSION = 1;
const KEY = "__ksParams";

/* Copy in the document that has focus. The async API is refused outright by
   an unfocused document, which is exactly the state a framed tool is in when
   the studio's own panel fired the action, so fall back to the legacy
   selection copy before giving up. */
export async function copyToClipboard(text, doc = document) {
  try {
    const view = doc.defaultView || window;
    await view.navigator.clipboard.writeText(text);
    return true;
  } catch { /* not focused, or no permission: try the old way */ }
  try {
    const ta = doc.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
    doc.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = doc.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

const isSlider = (v) => Array.isArray(v) && typeof v[0] === "number";
const isControl = (v) =>
  isSlider(v) || typeof v === "boolean" || typeof v === "string" ||
  (v && typeof v === "object" && typeof v.type === "string");

/* The declaration is a shape the tool finds natural to write. Flatten it once
   into an ordered list the renderer can walk without re-deriving structure. */
function flatten(schema, prefix = "", group = null, out = []) {
  for (const [key, raw] of Object.entries(schema)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isControl(raw)) {
      out.push(normalise(path, key, group, raw));
    } else if (raw && typeof raw === "object") {
      flatten(raw, path, key, out);
    }
  }
  return out;
}

function normalise(path, key, group, raw) {
  const label = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

  if (isSlider(raw)) {
    const [value, min, max, step = 1] = raw;
    return { path, label, group, kind: "range", value, min, max, step };
  }
  if (typeof raw === "boolean") {
    /* Every tool calls its light/dark switch `ground`, and it is never really
       an on/off: it is the theme. Give it its own kind so the studio can draw
       the proper toggle rather than a pair of buttons reading Off and On.
       `{ type: "theme" }` says the same thing explicitly. */
    const kind = key === "ground" ? "theme" : "toggle";
    return { path, label, group, kind, value: raw };
  }
  if (raw && typeof raw === "object" && raw.type === "toggle") {
    /* The same two-tab control, with the tool's own words on the two halves:
       Desktop / Mobile, Signed out / Signed in. A plain boolean still reads
       Off / On, so nothing that already exists changes. `labels` is
       [offLabel, onLabel]; the value is still a boolean, false being the
       first label. */
    return { path, label: raw.label ?? label, group, kind: "toggle",
             labels: raw.labels, value: raw.default ?? raw.value ?? false };
  }
  if (typeof raw === "string") {
    /* A tool writes a colour as the hex it already stores. Asking it to say
       { type: "color" } as well would be ceremony: the value says it. */
    const kind = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? "color" : "text";
    return { path, label, group, kind, value: raw };
  }
  const t = raw.type;
  if (t === "gradient") {
    return { path, label: raw.label ?? label, group, kind: "gradient",
             value: raw.default ?? raw.value ?? [] };
  }
  if (t === "select") {
    return { path, label: raw.label ?? label, group, kind: "select",
             options: raw.options ?? [], value: raw.default ?? raw.value ?? (raw.options ?? [])[0] };
  }
  if (t === "swatches") {
    /* A set of looks to pick between, drawn as tiles rather than named in a
       dropdown, because the whole point is judging them by eye. Each option is
       { id, label, colors: [...] }; the value is the id. */
    const options = raw.options ?? [];
    return { path, label: raw.label ?? label, group, kind: "swatches", options,
             previewOnHover: raw.actionPalette ? false : raw.previewOnHover,
             actionPalette: raw.actionPalette === true,
             value: raw.default ?? raw.value ?? options[0]?.id };
  }
  if (t === "theme") {
    return { path, label, group, kind: "theme", value: raw.default ?? raw.value ?? true };
  }
  if (t === "action") {
    return { path, label: raw.label ?? label, group, kind: "action" };
  }
  if (t === "color") {
    /* `options` is a list of preset hexes (a design system's colors),
       drawn as clickable dots under the well. */
    return { path, label: raw.label ?? label, group, kind: "color",
             value: raw.default ?? raw.value ?? "#000000", options: raw.options };
  }
  return { path, label, group, kind: "text", value: raw.default ?? raw.value ?? "" };
}

export function defineParams(tool, schema, hooks = {}) {
  const controls = flatten(schema);
  const values = {};
  for (const c of controls) if (c.kind !== "action") values[c.path] = c.value;

  const listeners = new Set();
  const announce = (path) => {
    hooks.onChange?.(values, path);
    for (const fn of listeners) fn(values, path);
  };

  const api = {
    version: VERSION,
    tool,
    controls,
    values,
    get: (path) => values[path],
    set(path, value) {
      if (!(path in values)) return;
      values[path] = value;
      announce(path);
    },
    /* Returns whatever the tool's onAction returned. A tool that returns a
       STRING is asking for it to be copied, and the copy has to happen in the
       document that owns the click: inside the studio the panel is in the
       parent, so a framed tool calling navigator.clipboard itself fails with
       "Document is not focused" every time. Both renderers do the copying. */
    act(path) {
      return hooks.onAction?.(path.split(".").pop(), path);
    },
    /** the studio subscribes so its panel follows changes made in the tool */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  window[KEY] = api;
  window.dispatchEvent(new CustomEvent("ks-params-ready", { detail: api }));

  // No studio around it? Then this file is the only way in, and P is the key.
  // A page that wants its dials in the page itself even when framed (the
  // kineticstudio.com Playground, Hunter 2026-10-23) passes hooks.panel "always".
  if (window.top === window.self || hooks.panel === "always") standalonePanel(api);

  hooks.onChange?.(values, null);
  return api;
}

/* ---- standalone ------------------------------------------------------- */

/* The same kit, drawn without the studio. Inside the studio this never runs
   (the studio's ParamsPanel is the renderer there); this is for a tool opened
   in its own tab. The two renderers are kept in step BY HAND: if a control
   changes in app/src/components/ParamsPanel.tsx, it changes here too. One
   look, two hosts, zero dependencies.

   Hidden until P is pressed. Esc closes. No params chrome ever sits on the
   design itself. */

const R = "var(--ksp-radius, 12px)";       /* base radius, matches the studio */
/* the site's own type (Hunter, Oct 30: "the parameters should use the main typeface for both headline and
   for subcopy and body"; "All of the buttons on the site and the parameters need to be centered and use our
   main Kinetic typeface"): the text face for every word, the display face for the buttons, as the site's pills */
const TEXT = `var(--primary-family, Inter, ui-sans-serif, -apple-system, "Segoe UI", sans-serif)`;
const CSS = `
.ksp { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 300px;
  z-index: 2147483000; display: none; flex-direction: column;
  background: var(--ksp-bg, #fbfbf9); color: var(--ksp-ink, #23231f);
  border-radius: 20px; box-shadow: 0 12px 40px rgba(0,0,0,.18);
  font: 13px/1.4 ${TEXT};
  padding: 14px; }
.ksp[data-open="true"] { display: flex; }
.ksp * { box-sizing: border-box; }
.ksp-head { flex: 0 0 auto; display: flex; align-items: center;
  justify-content: space-between; padding-bottom: 10px; }
.ksp-head b { font-weight: 600; }
.ksp-head kbd { font: 11px ${TEXT}; opacity: .45;
  border: 1px solid rgba(0,0,0,.18); border-radius: 5px; padding: 1px 5px; }
.ksp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto;
  display: grid; gap: 10px; align-content: start; }
.ksp-section { border-top: 1px solid rgba(0,0,0,.07); padding-top: 2px; }
.ksp-section:first-child { border-top: 0; padding-top: 0; }
.ksp-gh { display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 9px 8px 7px; border: 0; border-radius: 8px;
  font: 600 13px inherit; font-family: inherit; color: inherit;
  background: transparent; cursor: pointer; transition: background .15s ease; }
.ksp-gh:hover { background: rgba(0,0,0,.04); }
.ksp-gh svg { transition: transform .18s ease; opacity: .45; }
.ksp-section[data-shut="true"] .ksp-gh svg { transform: rotate(-90deg); }
.ksp-gb { display: grid; grid-template-rows: 1fr; transition: grid-template-rows
  .22s cubic-bezier(.3,1,.4,1); }
.ksp-section[data-shut="true"] .ksp-gb { grid-template-rows: 0fr; }
.ksp-gb > div { overflow: hidden; display: grid; gap: 6px; padding-bottom: 8px; }
.ksp-dial { position: relative; height: 34px; border-radius: ${R};
  background: rgba(0,0,0,.05); overflow: hidden; display: flex;
  align-items: center; cursor: ew-resize; touch-action: none;
  user-select: none; -webkit-user-select: none; }
.ksp-fill { position: absolute; left: 3px; top: 3px; bottom: 3px;
  background: var(--ksp-card, #fff); border-radius: calc(${R} - 3px);
  box-shadow: 0 1px 2px rgba(0,0,0,.10); }
.ksp-notch { position: absolute; top: 50%; width: 1px; height: 6px;
  margin-top: -3px; background: currentColor; opacity: .18; pointer-events: none; }
.ksp-dial > b { position: relative; padding-left: 13px; font-weight: 400;
  white-space: nowrap; }
.ksp-dial > output { position: relative; margin-left: auto; padding-right: 13px;
  opacity: .55; font-variant-numeric: tabular-nums; }
.ksp-pill { height: 34px; border-radius: ${R}; background: rgba(0,0,0,.05);
  display: flex; align-items: center; padding: 0 13px; gap: 8px; }
.ksp-pill input, .ksp-pill output { margin-left: auto; border: 0;
  background: none; font: inherit; color: inherit; opacity: .65;
  text-align: right; max-width: 60%; outline: none; }
.ksp-seg { position: relative; height: 34px; border-radius: ${R};
  background: rgba(0,0,0,.05); display: grid; grid-template-columns: 1fr 1fr;
  padding: 3px; cursor: pointer; user-select: none; }
.ksp-seg-thumb { position: absolute; top: 3px; bottom: 3px;
  width: calc(50% - 3px); left: 3px; border-radius: calc(${R} - 3px);
  background: var(--ksp-card, #fff); box-shadow: 0 1px 3px rgba(0,0,0,.16);
  transition: left .22s cubic-bezier(.3,1.3,.4,1); }
.ksp-seg[data-on="true"] .ksp-seg-thumb { left: 50%; }
.ksp-seg > span { position: relative; display: flex; align-items: center;
  justify-content: center; gap: 6px; font-size: 12.5px; opacity: .5;
  transition: opacity .18s ease; }
.ksp-seg > span svg { transition: transform .25s cubic-bezier(.3,1.3,.4,1); }
.ksp-seg > span[data-active="true"] { opacity: 1; }
.ksp-seg > span:not([data-active="true"]) svg { transform: rotate(90deg) scale(.8); }
.ksp-sw-head { display: flex; align-items: baseline;
  justify-content: space-between; padding-left: 2px; }
.ksp-sw-head output { opacity: .55; }
.ksp-dots { display: flex; flex-wrap: wrap; gap: 7px; padding: 7px 6px 3px; }
.ksp-dot { width: 18px; height: 18px; border-radius: 999px; border: 0;
  cursor: pointer; outline: 1px solid rgba(0,0,0,.15); outline-offset: 2px; }
.ksp-dot[data-on="true"] { outline: 2px solid var(--ksp-ink, #23231f); }
.ksp-swatches { display: grid; grid-template-columns: repeat(8, 1fr);
  gap: 6px; padding: 5px; }
.ksp-tile { display: flex; aspect-ratio: 1; border-radius: 5px; overflow: hidden;
  padding: 0; cursor: pointer; border: 0;
  outline: 1px solid rgba(0,0,0,.14); outline-offset: -1px;
  transition: outline-color .12s ease; }
.ksp-tile span { flex: 1; }
.ksp-tile[data-on="true"], .ksp-tile:hover { outline-width: 2px;
  outline-offset: 2px; outline-color: var(--ksp-ink, #23231f); }
.ksp-tile:hover:not([data-on="true"]) { outline-color: rgba(0,0,0,.35); }
.ksp-combo { position: relative; }
.ksp-menu { position: fixed; z-index: 2147483001; margin: 0; padding: 5px; font: 13px/1.4 ${TEXT};
  list-style: none; max-height: 220px; overflow-y: auto; border-radius: ${R};
  /* The panel's own ground, not a hardcoded white. The menu is appended to
     the body rather than the panel, so it never inherits anything: hardcoding
     white meant a dark-themed panel opened a white menu carrying light ink,
     which is what the studio's twin of this control did on Trace. */
  background: color-mix(in srgb, var(--ksp-bg, #fbfbf9) 82%, transparent);
  color: var(--ksp-ink, #23231f);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  border: 1px solid color-mix(in srgb, var(--ksp-ink, #000) 10%, transparent);
  box-shadow: 0 12px 32px rgba(0,0,0,.18); }
.ksp-menu li { display: flex; align-items: center; gap: 7px; padding: 7px 9px;
  cursor: pointer; border-radius: calc(${R} - 5px); }
.ksp-menu li[data-active="true"] {
  background: color-mix(in srgb, var(--ksp-ink, #000) 8%, transparent); }
.ksp-menu li b { font-weight: 600; }
.ksp-menu li i { width: 10px; display: flex; font-style: normal; }
.ksp-foot { flex: 0 0 auto; padding-top: 12px; margin-top: 4px;
  display: grid; gap: 6px; border-top: 1px solid rgba(0,0,0,.08); }
.ksp-cta { display: flex; align-items: center; justify-content: center; height: 38px; width: 100%;
  padding: 1px 12px 0; border-radius: ${R}; border: 0; cursor: pointer; text-align: center;
  font: 400 15px/1 var(--display-family, ${TEXT}); letter-spacing: 0; text-transform: uppercase;
  background: var(--ksp-ink, #23231f); color: var(--ksp-bg, #fff); }
.ksp-cta:active { transform: scale(.97); }
@media (prefers-reduced-motion: reduce) {
  .ksp, .ksp * { transition: none !important; }
}
`;

const svg = (d, extra = "") =>
  `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" ${extra}>${d}</svg>`;
const CHEVRON = svg('<path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>');
const CHECK = svg('<path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 'width="10" height="10"');
const SUN = svg('<circle cx="8" cy="8" r="3.1" stroke="currentColor" stroke-width="1.5"/>' +
  [0,45,90,135,180,225,270,315].map(a =>
    `<line x1="8" y1="1.4" x2="8" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" transform="rotate(${a} 8 8)"/>`).join(""),
  'width="13" height="13"');
const MOON = svg('<path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>', 'width="13" height="13"');

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

const prettify = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/* The panel stays as it was left, open or shut and each group open or folded, through a reload or a
   replay (Hunter, Oct 30: "for testing purposes, let's not collapse the parameter or close the parameters
   when I refresh or replay"): kept in this browser per page. */
const uiKey = () => `ksp-ui:${location.pathname}`;
const readUi = () => {
  try {
    return JSON.parse(localStorage.getItem(uiKey()) ?? "null");
  } catch {
    return null;
  }
};
const writeUi = (panel) => {
  try {
    const shut = [...panel.querySelectorAll('.ksp-section[data-shut="true"]')].map((sec) => sec.dataset.group);
    localStorage.setItem(uiKey(), JSON.stringify({ open: panel.dataset.open === "true", shut }));
  } catch {}
};

function standalonePanel(api) {
  const boot = () => {
    /* A tool may redefine its dials mid-life (a control list that grows or
       shrinks, like a color sequence). Replace the previous panel rather
       than stacking a second one, keep its open state, and re-bind the one
       key listener. */
    const prev = document.querySelector(".ksp");
    const wasOpen = prev?.dataset.open === "true";
    prev?.remove();
    if (!document.querySelector("style[data-ksp]")) {
      const style = document.createElement("style");
      style.setAttribute("data-ksp", "");
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const panel = el("div", "ksp");
    const ui = readUi();
    panel.dataset.open = wasOpen || ui?.open ? "true" : "false";
    panel.appendChild(el("div", "ksp-head", "<b>Params</b><kbd>P</kbd>"));

    /* light/dark rides above everything, exactly as it does in the studio */
    for (const c of api.controls.filter((x) => x.kind === "theme")) {
      panel.appendChild(themeControl(api, c));
    }

    const body = el("div", "ksp-body");
    let section = null, currentGroup = Symbol();
    for (const c of api.controls) {
      if (c.kind === "action" || c.kind === "theme") continue;
      if (c.group !== currentGroup) {
        currentGroup = c.group;
        section = el("section", "ksp-section");
        if (c.group) {
          const head = el("button", "ksp-gh", `<span>${prettify(c.group)}</span>${CHEVRON}`);
          head.type = "button";
          const groupSection = section;
          groupSection.dataset.group = c.group;
          const folded = Boolean(ui?.shut?.includes(c.group));
          groupSection.dataset.shut = String(folded);
          head.setAttribute("aria-expanded", String(!folded));
          head.onclick = () => {
            const shut = groupSection.dataset.shut !== "true";
            groupSection.dataset.shut = String(shut);
            head.setAttribute("aria-expanded", String(!shut));
            writeUi(panel);
          };
          section.appendChild(head);
        }
        const gb = el("div", "ksp-gb");
        gb.appendChild(el("div"));
        section.appendChild(gb);
        body.appendChild(section);
      }
      section.querySelector(".ksp-gb > div").appendChild(control(api, c));
    }
    panel.appendChild(body);

    const actions = api.controls.filter((x) => x.kind === "action");
    if (actions.length) {
      const foot = el("div", "ksp-foot");
      for (const a of actions) {
        const b = el("button", "ksp-cta", a.label);
        b.type = "button";
        b.onclick = async () => {
          const was = b.textContent;
          const out = api.act(a.path);
          let label = "Done";
          if (typeof out === "string") label = (await copyToClipboard(out, document)) ? "Copied" : "Copy failed";
          b.textContent = label;
          setTimeout(() => { b.textContent = was; }, 1300);
        };
        foot.appendChild(b);
      }
      panel.appendChild(foot);
    }

    document.body.appendChild(panel);

    if (window.__kspKeys) removeEventListener("keydown", window.__kspKeys);
    window.__kspKeys = (e) => {
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === "p" || e.key === "P") {
        panel.dataset.open = panel.dataset.open === "true" ? "false" : "true";
        writeUi(panel);
      }
      if (e.key === "Escape" && panel.dataset.open === "true") {
        panel.dataset.open = "false";
        writeUi(panel);
      }
    };
    addEventListener("keydown", window.__kspKeys);
  };
  if (document.body) boot();
  else addEventListener("DOMContentLoaded", boot);
}

function control(api, c) {
  if (c.kind === "range") return dial(api, c);
  if (c.kind === "gradient") return gradientControl(api, c);
  if (c.kind === "toggle")
    return segmented(api, c, c.labels?.[0] ?? "Off", c.labels?.[1] ?? "On", "", "");
  if (c.kind === "swatches") return swatches(api, c);
  if (c.kind === "select") return combo(api, c);
  if (c.kind === "color") {
    const wrap = el("div");
    const row = el("div", "ksp-pill", `<b style="font-weight:400">${c.label}</b>`);
    const input = document.createElement("input");
    input.type = "color";
    input.setAttribute('aria-label', c.label);
    input.value = String(api.values[c.path]);
    input.style.cssText = "margin-left:auto;width:22px;height:22px;padding:0;border:0;background:none;cursor:pointer";
    row.appendChild(input);
    wrap.appendChild(row);
    /* preset dots: the design system's own colors, one click each */
    let dots = null;
    if (Array.isArray(c.options) && c.options.length) {
      dots = el("div", "ksp-dots");
      for (const hex of c.options) {
        const b = el("button", "ksp-dot");
        b.type = "button";
        b.title = hex;
        b.style.background = hex;
        b.dataset.on = String(String(api.values[c.path]).toLowerCase() === String(hex).toLowerCase());
        b.onclick = () => {
          api.set(c.path, hex);
          input.value = hex;
          for (const d of dots.children) d.dataset.on = String(d === b);
        };
        dots.appendChild(b);
      }
      wrap.appendChild(dots);
    }
    input.oninput = () => {
      api.set(c.path, input.value);
      if (dots) for (const d of dots.children) d.dataset.on = "false";
    };
    api.subscribe(() => {
      input.value = String(api.values[c.path]);
      if (dots) for (const d of dots.children) d.dataset.on = String(d.title.toLowerCase() === input.value.toLowerCase());
    });
    return wrap;
  }
  const row = el("div", "ksp-pill", `<b style="font-weight:400">${c.label}</b>`);
  const input = document.createElement("input");
  input.value = String(api.values[c.path] ?? "");
  input.oninput = () => api.set(c.path, input.value);
  row.appendChild(input);
  return row;
}

/* Same 2..8 editable stops as the Studio renderer. Keep rows stable while a
   slider is dragged so a live update never interrupts pointer/keyboard focus. */
function gradientControl(api, c) {
  const wrap = el('div');
  wrap.style.cssText = 'display:grid;gap:7px';
  const label = el('span'); label.textContent = c.label;
  const preview = el('div');
  preview.style.cssText = 'height:24px;border-radius:12px';
  const rows = el('div'); rows.style.cssText = 'display:grid;gap:7px';
  const add = el('button','ksp-pill','Add stop'); add.type = 'button';
  wrap.append(label,preview,rows,add);
  let signature = '';
  const stops = () => Array.isArray(api.values[c.path]) ? api.values[c.path] : [];
  const update = (id, patch) => api.set(c.path, stops().map(s => s.id === id ? {...s,...patch} : s));
  const paint = () => {
    const items = stops();
    preview.style.background = `linear-gradient(90deg, ${[...items].sort((a,b)=>a.position-b.position).map(s=>`${s.color} ${s.position}%`).join(', ')})`;
    const next = items.map(s=>s.id).join('|');
    if (next !== signature) {
      signature = next; rows.replaceChildren();
      items.forEach((s,i) => {
        const row = el('div'); row.dataset.id = s.id;
        row.style.cssText = 'display:grid;grid-template-columns:24px 1fr 38px 24px;gap:7px;align-items:center';
        const color = el('input'); color.type = 'color'; color.setAttribute('aria-label',`${c.label} stop ${i+1} color`);
        color.style.cssText = 'width:24px;height:24px;border:0;padding:0;background:none';
        color.oninput = () => update(s.id,{color:color.value});
        const position = el('input'); position.type = 'range'; position.min = 0; position.max = 100; position.step = 1;
        position.style.width = '100%'; position.setAttribute('aria-label',`${c.label} stop ${i+1} position`);
        position.oninput = () => update(s.id,{position:Number(position.value)});
        const out = el('output');
        const remove = el('button','','×'); remove.type = 'button'; remove.setAttribute('aria-label',`Delete gradient stop ${i+1}`);
        remove.style.cssText = 'border:0;background:none;color:inherit;cursor:pointer';
        remove.onclick = () => { if(stops().length>2) api.set(c.path,stops().filter(item=>item.id!==s.id)); };
        row.append(color,position,out,remove); rows.append(row);
      });
    }
    [...rows.children].forEach((row,i)=>{
      const [color,position,out,remove] = row.children, s = items[i];
      color.value=s.color; position.value=s.position; out.textContent=`${s.position}%`; remove.disabled=items.length<=2;
    });
    add.disabled=items.length>=8;
  };
  add.onclick=()=>{if(stops().length<8)api.set(c.path,[...stops(),{id:`stop-${Date.now()}`,position:50,color:'#7c91a5'}]);};
  paint(); api.subscribe(paint); return wrap;
}

/* the fill IS the value; drag anywhere on the row. Same rules as the studio:
   a notch per step while steps are countable, a scale of six once not. */
function dial(api, c) {
  const min = c.min ?? 0, max = c.max ?? 100, step = c.step ?? 1;
  const dp = (String(step).split(".")[1] ?? "").length;
  const row = el("div", "ksp-dial");
  row.setAttribute("role", "slider");
  row.setAttribute("aria-label", c.label);
  row.setAttribute("aria-valuemin", String(min));
  row.setAttribute("aria-valuemax", String(max));
  row.tabIndex = 0;
  const fill = el("div", "ksp-fill");
  row.appendChild(fill);
  const steps = Math.round((max - min) / step);
  const marks = steps > 0 && steps <= 12 ? steps : 6;
  for (let i = 1; i < marks; i++) {
    const n = el("span", "ksp-notch");
    n.style.left = (i / marks) * 100 + "%";
    row.appendChild(n);
  }
  row.appendChild(el("b", "", c.label));
  const out = el("output");
  row.appendChild(out);

  const paint = () => {
    const pct = Math.max(0, Math.min(1, (Number(api.values[c.path]) - min) / (max - min || 1)));
    fill.style.width = `max(0px, calc(${pct * 100}% - 6px))`;
    out.textContent = String(api.values[c.path]);
    row.setAttribute("aria-valuenow", String(api.values[c.path]));
  };
  const setFrom = (clientX) => {
    const r = row.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    api.set(c.path, Number((Math.round((min + t * (max - min)) / step) * step).toFixed(dp)));
    paint();
  };
  row.onpointerdown = (e) => {
    /* capture can throw if the pointer lifted between event and capture;
       the value still applies either way */
    try { row.setPointerCapture(e.pointerId); } catch { /* fine */ }
    setFrom(e.clientX);
  };
  row.onpointermove = (e) => { if (row.hasPointerCapture(e.pointerId)) setFrom(e.clientX); };
  row.onkeydown = (e) => {
    const v = Number(api.values[c.path]);
    if (e.key === "ArrowLeft") { api.set(c.path, Number(Math.max(min, v - step).toFixed(dp))); paint(); }
    if (e.key === "ArrowRight") { api.set(c.path, Number(Math.min(max, v + step).toFixed(dp))); paint(); }
  };
  paint();
  /* a tool can move its own dials (a randomize button rolling the seed);
     the row follows so the panel never lies about the state on screen */
  api.subscribe(paint);
  return row;
}

function segmented(api, c, offLabel, onLabel, offIcon, onIcon) {
  const row = el("div", "ksp-seg");
  row.setAttribute("role", "switch");
  row.tabIndex = 0;
  row.innerHTML = `<div class="ksp-seg-thumb"></div>` +
    `<span>${offIcon}${offLabel}</span><span>${onIcon}${onLabel}</span>`;
  const paint = () => {
    const on = !!api.values[c.path];
    row.dataset.on = String(on);
    const [a, b] = row.querySelectorAll("span");
    a.dataset.active = String(!on);
    b.dataset.active = String(on);
    row.setAttribute("aria-checked", String(on));
  };
  const flip = () => { api.set(c.path, !api.values[c.path]); paint(); };
  row.onclick = flip;
  row.onkeydown = (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } };
  paint();
  api.subscribe(paint);
  return row;
}

function themeControl(api, c) {
  const wrap = el("div");
  wrap.style.cssText = "flex:0 0 auto;padding-bottom:10px";
  wrap.appendChild(segmented(api, c, "Dark", "Light", MOON, SUN));
  return wrap;
}

/* hover previews on the design, leaving reverts, clicking commits */
function swatches(api, c) {
  const wrap = el("div");
  wrap.style.cssText = "display:grid;gap:4px";
  const head = el("div", "ksp-sw-head", `<span>${c.label}</span><output></output>`);
  const name = head.querySelector("output");
  const grid = el("div", "ksp-swatches");
  wrap.append(head, grid);
  let committed = api.values[c.path];
  let previewing = false;
  const labelOf = (id) =>
    (c.options.find((o) => o.id === id) || {}).label ?? id;
  const paint = () => {
    if (!c.actionPalette) name.textContent = labelOf(api.values[c.path]);
    for (const b of grid.children) b.dataset.on = String(!c.actionPalette && b.dataset.id === committed);
  };
  for (const o of c.options) {
    const tile = el("button", "ksp-tile",
      (o.colors?.length ? o.colors : ["#eee"]).map((col) => `<span style="background:${col}"></span>`).join(""));
    tile.type = "button";
    tile.dataset.id = o.id;
    tile.title = o.label ?? o.id;
    tile.setAttribute('aria-label', o.label ?? o.id);
    tile.onpointerenter = () => { if (c.actionPalette) name.textContent = o.label ?? o.id; if (c.previewOnHover === false) return; previewing = true; api.set(c.path, o.id); paint(); };
    tile.onpointerleave = () => { if (c.previewOnHover === false) return; previewing = false; api.set(c.path, committed); paint(); };
    tile.onclick = async () => {
      if (c.actionPalette) {
        const result = await api.act(`${c.path}.${o.id}`);
        name.textContent = typeof result === 'string' ? (await copyToClipboard(result, document) ? 'Copied' : 'Copy failed') : (o.label ?? o.id);
      } else { committed = o.id; api.set(c.path, o.id); paint(); }
    };
    grid.appendChild(tile);
  }
  paint();
  api.subscribe(() => {
    if (!previewing && !c.actionPalette) committed = api.values[c.path];
    paint();
  });
  return wrap;
}

/* our dropdown: the menu is appended to the body and placed from the trigger,
   because the panel body scrolls and a scroll container clips both axes */
function combo(api, c) {
  const wrap = el("div", "ksp-combo");
  const trigger = el("div", "ksp-pill",
    `<b style="font-weight:400">${c.label}</b><output></output>${CHEVRON}`);
  trigger.style.cursor = "pointer";
  trigger.tabIndex = 0;
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-label", c.label);
  const out = trigger.querySelector("output");
  const paint = () => { out.textContent = String(api.values[c.path]); };
  paint();
  api.subscribe(paint);
  wrap.appendChild(trigger);

  let menu = null, active = 0, cleanupMenu = () => {};
  const close = () => { menu?.remove(); menu = null; cleanupMenu(); cleanupMenu = () => {}; };
  const openMenu = () => {
    close();
    const r = trigger.getBoundingClientRect();
    menu = el("ul", "ksp-menu");
    menu.style.top = r.bottom + 6 + "px";
    menu.style.left = r.left + "px";
    menu.style.width = r.width + "px";
    active = Math.max(0, c.options.findIndex((o) => String(o) === String(api.values[c.path])));
    c.options.forEach((o, i) => {
      const chosen = String(o) === String(api.values[c.path]);
      const li = el("li", "", `<i>${chosen ? CHECK : ""}</i>${chosen ? `<b>${o}</b>` : o}`);
      li.dataset.active = String(i === active);
      li.onpointerenter = () => { active = i; paintActive(); };
      li.onclick = () => { api.set(c.path, String(o)); paint(); close(); };
      menu.appendChild(li);
    });
    document.body.appendChild(menu);
    const menuHeight = menu.getBoundingClientRect().height;
    menu.style.top = (r.bottom + 6 + menuHeight > innerHeight - 8
      ? Math.max(8, r.top - menuHeight - 6) : r.bottom + 6) + "px";
    const away = (e) => {
      if (!menu?.contains(e.target) && e.target !== trigger) { close(); cleanup(); }
    };
    // Scrolling a long option list must not dismiss that same list.
    const shut = (e) => { if (menu?.contains(e.target)) return; close(); };
    const cleanup = () => {
      document.removeEventListener("pointerdown", away);
      removeEventListener("scroll", shut, true);
      removeEventListener("resize", shut);
    };
    cleanupMenu = cleanup;
    document.addEventListener("pointerdown", away);
    addEventListener("scroll", shut, true);
    addEventListener("resize", shut);
  };
  const paintActive = () => {
    if (menu) [...menu.children].forEach((li, i) => { li.dataset.active = String(i === active); });
  };
  trigger.onclick = () => (menu ? close() : openMenu());
  trigger.onkeydown = (e) => {
    if (!menu && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
      e.preventDefault(); openMenu(); return;
    }
    if (!menu) return;
    const n = c.options.length;
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % n; paintActive(); }
    if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + n) % n; paintActive(); }
    if (e.key === "Enter") { e.preventDefault(); api.set(c.path, String(c.options[active])); paint(); close(); }
    if (e.key === "Escape") { e.preventDefault(); close(); }
  };
  return wrap;
}
