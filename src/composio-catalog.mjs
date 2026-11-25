// Loop 2: compare the agent's auth findings with Composio's own toolkit catalog.
// Composio has already integrated many of these apps, so its catalog is an
// independent source for auth schemes, and it answers "do we already have this?".
//   node src/composio-catalog.mjs   (reads the public docs catalog; set COMPOSIO_API_KEY to use the API instead)
//   node src/composio-catalog.mjs [--in results/pass1] [--out results/composio-pass1.json]
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
  if (!KEY) return fromPublicDocs(cache);
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

// No key: Composio publishes the same catalog as a Markdown table in its docs.
async function fromPublicDocs(cache) {
  const url = "https://docs.composio.dev/toolkits.md";
  const md = await (await fetch(url)).text();
  const items = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\| \[(.+?)\]\(\/toolkits\/([^)]+?)\.md\) \| `([^`]+)` \| (\d+) \| (\d+) \| ([^|]*) \| ([^|]*) \|/);
    if (!m) continue;
    const auth = m[6].trim() === "—" ? [] : m[6].split(",").map((x) => x.trim()).filter(Boolean);
    items.push({ slug: m[3].toLowerCase(), name: m[1], doc: m[2], auth_schemes: auth.filter((a) => a !== "NO_AUTH"), no_auth: auth.includes("NO_AUTH") || auth.length === 0,
      tools: +m[4], triggers: +m[5], managed: m[7].trim() !== "—" && m[7].trim() !== "", categories: [] });
  }
  const out = { fetched_at: new Date().toISOString(), source: url, count: items.length, items };
  writeFileSync(cache, JSON.stringify(out, null, 1));
  return out;
}

const key = (s) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
// Names in the request list that differ from Composio's slug.
const ALIASES = { "lark-larksuite": ["lark", "larksuite"], "threads-meta": ["threads"], "meta-ads": ["metaads", "facebookads"],
  "magento-adobe-commerce": ["magento", "adobecommerce"], "amazon-selling-partner": ["amazonsellingpartner", "amazonsp", "amazonsellercentral"],
  "monday-com": ["monday", "mondaycom"], "whatsapp-business": ["whatsapp"], "zoho-crm": ["zohocrm", "zoho"], "otter-ai": ["otter", "otterai"],
  "help-scout": ["helpscout"], "google-ads": ["googleads"], "linkedin-ads": ["linkedinads", "linkedin"], "youtube-transcript": ["youtubetranscript", "transcriptapi"],
  "systeme-io": ["systemeio", "systeme"], "waterfall-io": ["waterfall", "waterfallio"], "mongodb-atlas": ["mongodbatlas", "mongodb"],
  "salesforce-commerce-cloud": ["salesforcecommercecloud", "commercecloud"], "se-ranking": ["seranking"], "bright-data": ["brightdata"], "mermaid-cli": ["mermaidcli"],
  // Composio wraps these vendors' own MCP servers as toolkits.
  pylon: ["pylon", "pylonmcp"], netlify: ["netlify", "netlifymcp"], devin: ["devin", "devinmcp"] , "otter-ai-x": [] };
ALIASES["otter-ai"].push("otteraimcp");

const MAP = { OAUTH2: "oauth2", OAUTH1: "oauth1", API_KEY: "api_key", BEARER_TOKEN: "bearer_token", BASIC: "basic", BASIC_WITH_JWT: "basic",
  S2S_OAUTH2: "oauth2", DCR_OAUTH: "oauth2", GOOGLE_SERVICE_ACCOUNT: "jwt_service_account", SERVICE_ACCOUNT: "jwt_service_account", NO_AUTH: "none" };

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
  const fam = (a) => (["bearer_token", "api_key", "bot_token"].includes(a) ? "key_or_token" : a);
  const oursF = new Set(ours.map(fam)), theirsF = new Set(composioAuth.map(fam));
  const missing = [...theirsF].filter((a) => a !== "none" && !oursF.has(a));
  out[rec.slug] = { in_composio: true, via_mcp: tk.slug.endsWith("_mcp"), managed_oauth: !!tk.managed, toolkit: tk.slug, tools: tk.tools, triggers: tk.triggers, composio_auth: composioAuth,
    agrees: missing.length === 0, missing_vs_composio: missing };
}
writeFileSync(opts.out, JSON.stringify({ catalog_size: catalog.count, apps: out }, null, 1));
const v = Object.values(out);
console.log(`Composio catalog: ${catalog.count} toolkits`);
console.log(`in Composio already: ${v.filter((o) => o.in_composio).length}/100 (${v.filter((o) => o.via_mcp).length} as wrappers of the vendor's MCP server)`);
console.log(`auth agrees with Composio: ${v.filter((o) => o.agrees).length}/${v.filter((o) => o.in_composio).length}`);
for (const [s, o] of Object.entries(out)) if (o.in_composio && !o.agrees) console.log(`  ${s}: Composio has ${o.missing_vs_composio.join(",")} that the agent missed`);
