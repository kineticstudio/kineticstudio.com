/* Counts link clicks (Hunter, Nov 18 2026, for /primary: Visit site, the contact button, every link on the
   page). Each click sends a tiny beacon to /e on the site's own Worker (worker/index.js), which logs it. No
   cookies, nothing about the visitor. The label is the link's data-track, else its aria-label or text, after
   the section it sits in, e.g. "brand-web: Visit site, exe". Only on the live site. */
const send = (label: string, href: string) => {
  const body = JSON.stringify({ e: "click", l: label, h: href, p: location.pathname, r: document.referrer });
  // text/plain keeps it a simple request; sendBeacon survives the page unloading as the link opens
  if (!navigator.sendBeacon?.("/e", new Blob([body], { type: "text/plain" })))
    fetch("/e", { method: "POST", body, keepalive: true }).catch(() => {});
};

if (import.meta.env.PROD && /(^|\.)kineticstudio\.com$/.test(location.hostname)) {
  document.addEventListener(
    "click",
    (ev) => {
      const a = (ev.target as Element | null)?.closest<HTMLElement>("a[href], [data-track]");
      if (!a) return;
      const name = (a.dataset.track || a.getAttribute("aria-label") || a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
      const where = a.closest<HTMLElement>("[data-track-section]")?.dataset.trackSection || a.closest("section, header, nav, footer")?.classList[0] || "page";
      send(`${where}: ${name}`, (a as HTMLAnchorElement).href || "");
    },
    { capture: true, passive: true },
  );
}
