/* The Params panel on an experiment page.

   An experiment declares its dials in the same shape the Creative Studio's
   ks-params uses (shared/params/params.js in kinetic-creative-studio), so a
   studio prototype ports over without rewriting its declaration:

     {
       count:   [12, 1, 40, 1],                 // slider: [value, min, max, step]
       glow:    true,                            // on / off
       ink:     "#a8ff66",                       // colour (any hex string)
       mode:    { type: "select", options: ["Waves", "Spiral"] },
       view:    { type: "toggle", labels: ["Flat", "Depth"] },
       motion:  { speed: [1, 0, 4, 0.01] },      // a group
       shuffle: { type: "action", label: "Shuffle" },
     }

   Values are flat, keyed by path ("motion.speed"). The current set is kept in
   the URL hash, so a tuned state can be shared as a link. */

const isSlider = (v) => Array.isArray(v) && typeof v[0] === "number";
const isControl = (v) =>
  isSlider(v) || typeof v === "boolean" || typeof v === "string" ||
  (v && typeof v === "object" && typeof v.type === "string");

const labelFor = (key) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());

function flatten(schema, prefix = "", group = null, out = []) {
  for (const [key, raw] of Object.entries(schema)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isControl(raw)) out.push(normalise(path, key, group, raw));
    else if (raw && typeof raw === "object") flatten(raw, path, labelFor(key), out);
  }
  return out;
}

function normalise(path, key, group, raw) {
  const label = raw?.label ?? labelFor(key);
  if (isSlider(raw)) {
    const [value, min, max, step = 1] = raw;
    return { path, label, group, kind: "range", value, min, max, step };
  }
  if (typeof raw === "boolean") return { path, label, group, kind: "toggle", value: raw };
  if (typeof raw === "string") {
    const kind = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? "color" : "text";
    return { path, label, group, kind, value: raw };
  }
  if (raw.type === "toggle") return { path, label, group, kind: "toggle", labels: raw.labels, value: raw.default ?? false };
  if (raw.type === "select") return { path, label, group, kind: "select", options: raw.options, value: raw.default ?? raw.options[0] };
  if (raw.type === "color") return { path, label, group, kind: "color", value: raw.default ?? "#ffffff" };
  if (raw.type === "action") return { path, label, group, kind: "action" };
  return { path, label, group, kind: "text", value: raw.default ?? "" };
}

const decimals = (step) => (String(step).split(".")[1] ?? "").length;

function readHash() {
  try {
    const raw = new URLSearchParams(location.hash.slice(1)).get("p");
    return raw ? JSON.parse(decodeURIComponent(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Draw the panel into `root` and keep `values` current.
 * hooks.onChange(values, path) runs on every change (and once at the start
 * with path null); hooks.onAction(name) runs for action buttons.
 */
export function createParams(root, schema, hooks = {}) {
  const controls = flatten(schema);
  const defaults = {};
  for (const c of controls) if (c.kind !== "action") defaults[c.path] = c.value;
  const values = { ...defaults, ...(readHash() ?? {}) };
  const inputs = new Map();

  const writeHash = () => {
    const changed = {};
    for (const [k, v] of Object.entries(values)) if (v !== defaults[k]) changed[k] = v;
    const hash = Object.keys(changed).length ? `#p=${encodeURIComponent(JSON.stringify(changed))}` : " ";
    history.replaceState(null, "", hash === " " ? location.pathname : hash);
  };

  const set = (path, value, { silent = false } = {}) => {
    values[path] = value;
    inputs.get(path)?.(value);
    if (!silent) {
      writeHash();
      hooks.onChange?.(values, path);
    }
  };

  const list = document.createElement("div");
  list.className = "params_list";
  let lastGroup = null;

  for (const c of controls) {
    if (c.group && c.group !== lastGroup) {
      const g = document.createElement("p");
      g.className = "params_group";
      g.textContent = c.group;
      list.append(g);
    }
    lastGroup = c.group;

    const row = document.createElement("div");
    row.className = `params_row is-${c.kind}`;

    if (c.kind === "action") {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "params_action";
      b.textContent = c.label;
      b.addEventListener("click", () => hooks.onAction?.(c.path.split(".").pop(), c.path));
      row.append(b);
      list.append(row);
      continue;
    }

    const name = document.createElement("label");
    name.className = "params_label";
    name.textContent = c.label;
    const id = `param-${c.path.replace(/\W/g, "-")}`;
    name.htmlFor = id;
    row.append(name);

    if (c.kind === "range") {
      const out = document.createElement("output");
      out.className = "params_value";
      const input = document.createElement("input");
      input.type = "range";
      input.id = id;
      Object.assign(input, { min: c.min, max: c.max, step: c.step });
      const show = (v) => {
        input.value = v;
        out.textContent = Number(v).toFixed(decimals(c.step));
        input.style.setProperty("--fill", `${((v - c.min) / (c.max - c.min)) * 100}%`);
      };
      input.addEventListener("input", () => set(c.path, Number(input.value)));
      inputs.set(c.path, show);
      row.append(out, input);
    } else if (c.kind === "toggle") {
      const wrap = document.createElement("div");
      wrap.className = "params_toggle";
      wrap.id = id;
      const labels = c.labels ?? ["Off", "On"];
      const buttons = labels.map((text, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.addEventListener("click", () => set(c.path, i === 1));
        wrap.append(b);
        return b;
      });
      inputs.set(c.path, (v) => buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(Boolean(v) === (i === 1)))));
      row.append(wrap);
    } else if (c.kind === "select") {
      const sel = document.createElement("select");
      sel.id = id;
      for (const o of c.options) sel.add(new Option(o, o));
      sel.addEventListener("change", () => set(c.path, sel.value));
      inputs.set(c.path, (v) => (sel.value = v));
      row.append(sel);
    } else if (c.kind === "color") {
      const input = document.createElement("input");
      input.type = "color";
      input.id = id;
      const hex = document.createElement("output");
      hex.className = "params_value";
      input.addEventListener("input", () => set(c.path, input.value));
      inputs.set(c.path, (v) => {
        input.value = v;
        hex.textContent = v.toUpperCase();
      });
      row.append(hex, input);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.id = id;
      input.addEventListener("input", () => set(c.path, input.value));
      inputs.set(c.path, (v) => (input.value = v));
      row.append(input);
    }
    list.append(row);
  }

  root.append(list);
  for (const [path, show] of inputs) show(values[path]);

  const api = {
    values,
    controls,
    set,
    reset() {
      for (const [k, v] of Object.entries(defaults)) set(k, v, { silent: true });
      writeHash();
      hooks.onChange?.(values, null);
    },
    /** Pick a random value for every slider and colour, keeping the rest. */
    randomize() {
      for (const c of controls) {
        if (c.kind === "range") {
          const steps = Math.round((c.max - c.min) / c.step);
          set(c.path, Number((c.min + Math.round(Math.random() * steps) * c.step).toFixed(decimals(c.step))), { silent: true });
        } else if (c.kind === "select") {
          set(c.path, c.options[Math.floor(Math.random() * c.options.length)], { silent: true });
        }
      }
      writeHash();
      hooks.onChange?.(values, null);
    },
  };
  hooks.onChange?.(values, null);
  return api;
}
