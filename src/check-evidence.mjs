// Loop 1: deterministic checks, no LLM.
//  a) Re-fetch every evidence URL and look for the quote on the page.
//  b) Internal-consistency rules a correct record can't break.
//   node src/check-evidence.mjs [--in results/pass1] [--out results/checks-pass1.json]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { pool } from "./claude.mjs";
import { parseArgs } from "./args.mjs";

const opts = parseArgs(process.argv.slice(2), { in: "results/pass1", out: "results/checks-pass1.json" });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const norm = (s) => s.toLowerCase()
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
  .replace(/[^a-z0-9$%./:@-]+/g, " ").replace(/\s+/g, " ").trim();

function htmlToText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

const pageCache = new Map();
async function fetchPage(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  const p = (async () => {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json,text/plain,*/*" }, redirect: "follow", signal: AbortSignal.timeout(25_000) });
      const raw = await res.text();
      // Many docs sites embed the page as JSON for hydration; keep that text too.
      const text = norm(htmlToText(raw) + " " + raw.replace(/\\n/g, " ").replace(/\\"/g, '"'));
      return { http: res.status, text, finalUrl: res.url };
    } catch (e) {
      return { http: 0, text: "", error: String(e.cause?.code ?? e.name ?? e) };
    }
  })();
  pageCache.set(url, p);
  return p;
}

function matchQuote(quote, text) {
  const q = norm(quote);
  if (!q) return { match: "empty", score: 0 };
  if (text.includes(q)) return { match: "verbatim", score: 1 };
  const w = q.split(" ");
  if (w.length < 3) return { match: text.includes(q) ? "verbatim" : "not_found", score: 0 };
  const grams = [];
  for (let i = 0; i + 3 <= w.length; i++) grams.push(w.slice(i, i + 3).join(" "));
  const hit = grams.filter((g) => text.includes(g)).length / grams.length;
  return { match: hit >= 0.6 ? "close" : hit >= 0.25 ? "partial" : "not_found", score: +hit.toFixed(2) };
}

function rules(r) {
  const f = [];
  const gatedAccess = ["partner_gated", "contact_sales", "no_public_api"];
  if (!r.auth_methods.includes(r.auth_primary)) f.push(`auth_primary "${r.auth_primary}" is not in auth_methods`);
  if (gatedAccess.includes(r.access) && r.buildability === "ready_now") f.push(`access is ${r.access} but buildability is ready_now`);
  if (r.buildability === "ready_now" && r.main_blocker !== "none") f.push(`ready_now but main_blocker is ${r.main_blocker}`);
  if (r.buildability !== "ready_now" && r.main_blocker === "none") f.push(`${r.buildability} but main_blocker is none`);
  if (r.access === "no_public_api" && r.api_breadth !== "none") f.push(`no_public_api but api_breadth is ${r.api_breadth}`);
  if (r.access === "paid_plan_required" && r.main_blocker === "none") f.push("paid plan required but no blocker named");
  if (r.mcp.startsWith("official") && !/https?:\/\/|@|github|npm|pypi|\//i.test(r.mcp_notes)) f.push("official MCP claimed with no URL or package named");
  for (const k of ["auth", "access", "api", "mcp", "buildability"]) {
    if (r.confidence[k] === "low") f.push(`agent marked ${k} confidence low`);
    // buildability is a judgment built on the other fields, so it needs no quote of its own
    if (k !== "buildability" && !r.evidence.some((e) => e.field === k || (k === "api" && e.field === "webhooks"))) f.push(`no evidence cited for ${k}`);
  }
  return f;
}

const files = readdirSync(opts.in).filter((f) => f.endsWith(".json"));
const out = {};
let urls = 0;
await pool(files, 6, async (file) => {
  const rec = JSON.parse(readFileSync(`${opts.in}/${file}`, "utf8"));
  if (!rec.record) { out[rec.slug] = { evidence: [], flags: ["no record: agent run failed"] }; return; }
  const ev = await Promise.all(rec.record.evidence.map(async (e) => {
    urls++;
    const page = await fetchPage(e.url);
    let status;
    if (page.http === 0) status = "unreachable";
    else if (page.http === 404 || page.http === 410) status = "dead";
    else if (page.http >= 400) status = "blocked";
    else if (page.text.length < 800) status = "js_only";
    else status = "ok";
    const m = status === "ok" ? matchQuote(e.quote, page.text) : { match: "unchecked", score: null };
    return { field: e.field, url: e.url, http: page.http, status, ...m };
  }));
  const flags = rules(rec.record);
  for (const e of ev) {
    if (e.status === "dead") flags.push(`dead link cited for ${e.field}: ${e.url}`);
    if (e.match === "not_found") flags.push(`quote for ${e.field} not found on ${e.url}`);
  }
  // The agent's own open questions go to the verifier too, but are not counted as failures.
  out[rec.slug] = { evidence: ev, flags, notes: rec.record.needs_human ? [`agent's open question: ${rec.record.needs_human.slice(0, 300)}`] : [] };
});

writeFileSync(opts.out, JSON.stringify(out, null, 1));
const all = Object.values(out).flatMap((o) => o.evidence);
const by = (k) => all.reduce((m, e) => ((m[e[k]] = (m[e[k]] ?? 0) + 1), m), {});
console.log(`${files.length} records, ${all.length} evidence links`);
console.log("link status:", by("status"));
console.log("quote match:", by("match"));
console.log("records with flags:", Object.values(out).filter((o) => o.flags.length).length);
console.log("flags:", Object.values(out).reduce((n, o) => n + o.flags.length, 0));
