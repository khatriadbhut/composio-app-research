// Loop 2: compare the agent's auth findings with Composio's own toolkit catalog.
// Composio has already integrated many of these apps, so its catalog is an
// independent source for auth schemes, and it answers "do we already have this?".
//   COMPOSIO_API_KEY=... node src/composio-catalog.mjs [--in results/pass1] [--out results/composio-pass1.json]
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { parseArgs } from "./args.mjs";

const opts = parseArgs(process.argv.slice(2), { in: "results/pass1", out: "results/composio-pass1.json" });
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KEY = process.env.COMPOSIO_API_KEY;
const BASE = "https://backend.composio.dev/api/v3.1";

async function listAll() {
  const cache = "data/composio-toolkits.json";
  if (existsSync(cache) && !opts.refresh) return JSON.parse(readFileSync(cache, "utf8"));
  if (!KEY) throw new Error("COMPOSIO_API_KEY missing: put it in .env");
  const items = []; let cursor;
  do {
    const u = new URL(`${BASE}/toolkits`);
    u.searchParams.set("limit", "1000"); u.searchParams.set("include_deprecated", "false");
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = await fetch(u, { headers: { "x-api-key": KEY } });
    if (!res.ok) throw new Error(`toolkits ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const page = await res.json();
    items.push(...page.items); cursor = page.next_cursor || undefined;
  } while (cursor);
  const slim = items.map((t) => ({ slug: t.slug, name: t.name, auth_schemes: t.auth_schemes ?? [], no_auth: !!t.no_auth,
    tools: t.meta?.tools_count ?? null, triggers: t.meta?.triggers_count ?? null, categories: (t.meta?.categories ?? []).map((c) => c.name ?? c) }));
  writeFileSync(cache, JSON.stringify({ fetched_at: new Date().toISOString(), count: slim.length, items: slim }, null, 1));
  return { count: slim.length, items: slim };
}

const key = (s) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
// Names in the request list that differ from Composio's slug.
const ALIASES = { "lark-larksuite": ["lark", "larksuite"], "threads-meta": ["threads"], "meta-ads": ["metaads", "facebookads"],
  "magento-adobe-commerce": ["magento", "adobecommerce"], "amazon-selling-partner": ["amazonsellingpartner", "amazonsp", "amazonsellercentral"],
  "monday-com": ["monday", "mondaycom"], "whatsapp-business": ["whatsapp"], "zoho-crm": ["zohocrm", "zoho"], "otter-ai": ["otter", "otterai"],
  "help-scout": ["helpscout"], "google-ads": ["googleads"], "linkedin-ads": ["linkedinads", "linkedin"], "youtube-transcript": ["youtubetranscript", "transcriptapi"],
  "systeme-io": ["systemeio", "systeme"], "waterfall-io": ["waterfall", "waterfallio"], "mongodb-atlas": ["mongodbatlas", "mongodb"],
  "salesforce-commerce-cloud": ["salesforcecommercecloud", "commercecloud"], "se-ranking": ["seranking"], "bright-data": ["brightdata"], "mermaid-cli": ["mermaid", "mermaidcli"] };

const MAP = { OAUTH2: "oauth2", OAUTH1: "oauth1", API_KEY: "api_key", BEARER_TOKEN: "bearer_token", BASIC: "basic", BASIC_WITH_JWT: "basic",
  GOOGLE_SERVICE_ACCOUNT: "jwt_service_account", SERVICE_ACCOUNT: "jwt_service_account", NO_AUTH: "none" };

const catalog = await listAll();
const index = new Map(catalog.items.map((t) => [key(t.slug), t]));
for (const t of catalog.items) if (!index.has(key(t.name))) index.set(key(t.name), t);

const out = {};
for (const file of readdirSync(opts.in).filter((f) => f.endsWith(".json"))) {
  const rec = JSON.parse(readFileSync(`${opts.in}/${file}`, "utf8"));
  const cands = [key(rec.app), key(rec.slug), ...(ALIASES[rec.slug] ?? [])];
  const tk = cands.map((c) => index.get(c)).find(Boolean);
  if (!tk) { out[rec.slug] = { in_composio: false }; continue; }
  const composioAuth = [...new Set(tk.auth_schemes.map((s) => MAP[s] ?? s.toLowerCase()))];
  if (tk.no_auth && !composioAuth.includes("none")) composioAuth.push("none");
  const ours = rec.record?.auth_methods ?? [];
  // bearer_token and api_key are the same thing to many vendors; count them as one family.
  const fam = (a) => (a === "bearer_token" || a === "api_key" ? "key_or_token" : a);
  const oursF = new Set(ours.map(fam)), theirsF = new Set(composioAuth.map(fam));
  const missing = [...theirsF].filter((a) => a !== "none" && !oursF.has(a));
  out[rec.slug] = { in_composio: true, toolkit: tk.slug, tools: tk.tools, triggers: tk.triggers, composio_auth: composioAuth,
    agrees: missing.length === 0, missing_vs_composio: missing };
}
writeFileSync(opts.out, JSON.stringify({ catalog_size: catalog.count, apps: out }, null, 1));
const v = Object.values(out);
console.log(`Composio catalog: ${catalog.count} toolkits`);
console.log(`in Composio already: ${v.filter((o) => o.in_composio).length}/100`);
console.log(`auth agrees with Composio: ${v.filter((o) => o.agrees).length}/${v.filter((o) => o.in_composio).length}`);
for (const [s, o] of Object.entries(out)) if (o.in_composio && !o.agrees) console.log(`  ${s}: Composio has ${o.missing_vs_composio.join(",")} that the agent missed`);
