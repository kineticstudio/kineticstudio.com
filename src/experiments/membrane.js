/* Membrane.

   Hunter pressing through a sheet (the Creative Studio's Membrane prototype,
   clients/kinetic/prototypes/03-Membrane.html, ticked for the Playground in
   the Prototype picker, Oct 29): his head, scanned from a selfie video,
   turning behind a stretched membrane that stays put and takes his shape
   where he presses into it; or his bust, carved in relief from one of his
   photos. It runs the site's own membrane (src/scripts/hunter-membrane.js,
   every setting in src/data/membrane-look.js) at the file's settings, with
   the dials below over them. A new material starts from its own settings,
   and a new subject from its own turn (the relief stays still). */

import { MEMBRANE_DEFAULTS, MEMBRANE_MATCAPS, MEMBRANE_MATERIALS, MEMBRANE_PORTRAITS, MEMBRANE_SUBJECTS } from "../data/membrane-look.js";

const L0 = MEMBRANE_DEFAULTS;

export const params = {
  subject: {
    who: { type: "select", options: ["Scan", "Bust", "Head"], value: L0.fidelity.subject },
    photo: { type: "select", options: Object.keys(MEMBRANE_PORTRAITS), value: L0.portrait.photo },
  },
  material: {
    type: { type: "select", options: Object.keys(MEMBRANE_MATERIALS), value: L0.material.type },
    color: L0.material.color,
  },
  light: {
    angle: [L0.light.angle, 0, 360, 1],
    height: [L0.light.height, 5, 90, 1],
  },
  motion: {
    speed: [L0.motion.speed, 0, 3, 0.01],
    range: [L0.motion.range, 0, 180, 1],
  },
  press: {
    depth: [L0.press.depth, 0, 0.3, 0.001],
  },
  colour: {
    ground: "#f4f6f1",
  },
  replay: { type: "action", label: "Replay" },
};

const ROOT = () => document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`;
const at = (p) => new URL(p, ROOT()).href;

export function mount(host, values, ctx = {}) {
  const reduced = Boolean(ctx.reducedMotion);
  const L = structuredClone(L0);
  let v = { ...values };

  host.style.background = v["colour.ground"];
  const box = document.createElement("div");
  box.style.cssText = "position:absolute;left:50%;top:50%;translate:-50% -50%;aspect-ratio:1;width:min(82%, 82vmin);max-height:86%;";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  box.append(canvas);
  host.append(box);
  // the box stays square inside whatever the stage is
  const fitBox = () => {
    const r = host.getBoundingClientRect();
    const s = Math.min(r.width * 0.82, r.height * 0.86);
    box.style.width = `${Math.max(1, s)}px`;
  };
  const ro = new ResizeObserver(fitBox);
  ro.observe(host);
  fitBox();

  // the dials into the look
  const lay = () => {
    L.fidelity.subject = v["subject.who"];
    L.portrait.photo = v["subject.photo"];
    L.material.type = v["material.type"];
    L.material.color = v["material.color"];
    L.light.angle = v["light.angle"];
    L.light.height = v["light.height"];
    L.motion.speed = v["motion.speed"];
    L.motion.range = v["motion.range"];
    L.press.depth = v["press.depth"];
  };
  lay();

  let m = null;
  let alive = true;
  (async () => {
    const { mountMembrane } = await import("../scripts/hunter-membrane.js");
    if (!alive) return;
    m = mountMembrane(canvas, L, {
      matcaps: MEMBRANE_MATCAPS,
      portraits: MEMBRANE_PORTRAITS,
      headUrl: at("images/hunter-head.png"),
      scanUrl: at("images/hunter-scan.png"),
      reliefBase: at("images/"),
      matcapBase: at("images/matcaps/"),
      reduced,
      mobile: !matchMedia("(hover: hover) and (pointer: fine)").matches,
    });
  })();

  // a preset's values onto the look, and onto the panel's dials where it has them
  let quiet = false;
  const setDial = (path, value) => {
    v[path] = value;
    quiet = true;
    try {
      window.__ksParams?.set?.(path, value);
    } catch {}
    quiet = false;
  };
  const preset = (p) => {
    for (const [g, group] of Object.entries(p ?? {})) for (const [k, x] of Object.entries(group)) if (g in L && k in L[g]) L[g][k] = x;
    if (p?.material?.color) setDial("material.color", p.material.color);
    if (p?.light?.height != null) setDial("light.height", p.light.height);
    if (p?.motion?.range != null) setDial("motion.range", p.motion.range);
  };

  let timer = 0;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => m?.rebuild(L), 160);
  };

  return {
    update(values, path) {
      if (quiet) return;
      v = { ...v, ...values };
      if (path === "colour.ground" || path === null) host.style.background = v["colour.ground"];
      lay();
      if (path === "material.type") preset(MEMBRANE_MATERIALS[v["material.type"]]);
      if (path === "subject.who") preset(MEMBRANE_SUBJECTS[v["subject.who"]]);
      // the photos are the carved bust's: picking one shows the bust, still
      if (path === "subject.photo" && L.fidelity.subject !== "Bust") {
        setDial("subject.who", "Bust");
        L.fidelity.subject = "Bust";
        preset(MEMBRANE_SUBJECTS.Bust);
      }
      if (path === null || path === "subject.who" || path === "subject.photo" || path === "material.type") rebuild();
      else m?.update(L);
    },
    action(name) {
      if (name === "replay") m?.seek(0);
    },
    destroy() {
      alive = false;
      clearTimeout(timer);
      ro.disconnect();
      m?.dispose();
      box.remove();
    },
  };
}
