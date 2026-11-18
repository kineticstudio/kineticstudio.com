/* Click tracking for kineticstudio.com (Hunter, Nov 18 2026: "make sure we're tracking analytics for this
   page", then yes to tracking clicks on Visit site and the contact button). The site is otherwise static:
   Cloudflare serves dist/ and this script runs only for POST /e (wrangler.jsonc, run_worker_first), so page
   loads never touch it. Page views stay with Cloudflare Web Analytics (BaseHead.astro); this records the
   clicks it can't. Each click goes two places:
   - Workers Logs (Cloudflare dashboard > Workers & Pages > kineticstudio-com > Observability), searchable
     right away, kept for a few days;
   - Workers Analytics Engine, dataset ks_clicks, kept three months, read with scripts/clicks.mjs.
   No cookies, no IP or user agent stored: the event, the link, the page, the referrer, a country and
   phone or desktop. */
const ORIGINS = /^https:\/\/(www\.)?kineticstudio\.com$/;
const cut = (v, n = 200) => String(v ?? "").slice(0, n);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/e") return env.ASSETS.fetch(req);
    if (req.method !== "POST") return new Response(null, { status: 405 });
    if (!ORIGINS.test(req.headers.get("origin") ?? "")) return new Response(null, { status: 403 });
    let d = {};
    try {
      d = JSON.parse((await req.text()).slice(0, 4000));
    } catch {}
    const ev = {
      event: cut(d.e, 60) || "click",
      label: cut(d.l),
      href: cut(d.h, 300),
      page: cut(d.p),
      ref: cut(d.r, 300),
      country: cut(req.cf?.country, 4),
      device: /Mobi|Android|iPhone/i.test(req.headers.get("user-agent") ?? "") ? "phone" : "desktop",
    };
    console.log(JSON.stringify({ click: ev }));
    try {
      env.CLICKS?.writeDataPoint({ blobs: [ev.event, ev.label, ev.href, ev.page, ev.ref, ev.country, ev.device], doubles: [1], indexes: [ev.page.slice(0, 90)] });
    } catch {}
    return new Response(null, { status: 204 });
  },
};
