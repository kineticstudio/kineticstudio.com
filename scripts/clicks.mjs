// Clicks on kineticstudio.com from the last N days (default 30), counted by page and link, from the
// Workers Analytics Engine dataset ks_clicks (worker/index.js). Needs an API token with
// "Account Analytics: Read" in ~/.config/kinetic-cf.env as CLOUDFLARE_ANALYTICS_TOKEN, plus
// CLOUDFLARE_ACCOUNT_ID. Usage: node scripts/clicks.mjs [days]
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
const env = Object.fromEntries(
  readFileSync(`${homedir()}/.config/kinetic-cf.env`, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const days = Number(process.argv[2] ?? 30);
const sql = `SELECT blob4 AS page, blob2 AS link, SUM(_sample_interval) AS clicks FROM ks_clicks WHERE timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY page, link ORDER BY clicks DESC LIMIT 200`;
const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}` },
  body: sql,
});
if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
const { data } = await r.json();
console.table(data);
