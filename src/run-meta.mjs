// Collects run statistics for the page and README into data/run-meta.json.
//   node src/run-meta.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const J = (p, d = null) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const dirRecs = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => J(`${d}/${f}`)) : []);
const p1 = dirRecs("results/pass1"), p2 = dirRecs("results/verify");
const checks = J("results/checks-pass1.json", {});
const composio = J("results/composio-pass1.json");
const score = J("results/score.json");
const disputes = J("data/disputes.json", []);
const usd = (x) => "$" + x.toFixed(2);
const sum = (a, k) => a.reduce((s, r) => s + (r[k] ?? 0), 0);

const GRADED = ["auth_methods", "auth_primary", "access", "api_styles", "api_breadth", "mcp", "buildability", "main_blocker"];
const p1BySlug = Object.fromEntries(p1.map((r) => [r.slug, r.record]));
const changedGraded = p2.filter((r) => r.record && GRADED.some((f) => JSON.stringify(r.record[f]) !== JSON.stringify(p1BySlug[r.slug]?.[f])));
const fieldChanges = {};
for (const r of p2) if (r.record) for (const f of GRADED) if (JSON.stringify(r.record[f]) !== JSON.stringify(p1BySlug[r.slug]?.[f])) fieldChanges[f] = (fieldChanges[f] ?? 0) + 1;

const ev = Object.values(checks).flatMap((o) => o.evidence ?? []);
const found = ev.filter((e) => e.match === "verbatim" || e.match === "close").length;
const checked = ev.filter((e) => e.status === "ok").length;
const comp = composio ? Object.values(composio.apps) : [];
const inC = comp.filter((c) => c.in_composio);
const pct = (x) => (x == null ? "?" : (x * 100).toFixed(0) + "%");
const after = score?.passes?.pass2;

const meta = {
  run_date: (p1.map((r) => r.at).sort()[0] ?? new Date().toISOString()).slice(0, 10),
  p1_calls: sum(p1, "turns") && p1.reduce((s, r) => s + (r.trace?.length ?? 0), 0),
  p1_min: Math.round(sum(p1, "duration_ms") / 60000),
  p1_cost: usd(sum(p1, "cost_usd")),
  p2_cost: usd(sum(p2, "cost_usd")),
  p2_ok: p2.filter((r) => r.record).length,
  l1_links: ev.length, l1_checked: checked, l1_found: found,
  l1_notfound: ev.filter((e) => e.match === "not_found").length, l1_dead: ev.filter((e) => e.status === "dead").length,
  l1_blocked: ev.filter((e) => ["blocked", "js_only", "unreachable"].includes(e.status)).length,
  l1_flagged: Object.values(checks).filter((o) => o.flags?.length).length,
  l1_flags: Object.values(checks).reduce((n, o) => n + (o.flags?.length ?? 0), 0),
  l2_line: composio ? `${inC.length} already in Composio · auth agrees on ${inC.filter((c) => c.agrees).length}/${inC.length}` : "not run: no Composio key",
  l2_in: inC.length, l2_agree: inC.filter((c) => c.agrees).length, l2_size: composio?.catalog_size ?? null,
  l3_changed: changedGraded.length, l3_field_changes: fieldChanges,
  audit_n: score?.sample_size ?? 0, disputes: disputes.length,
  acc_p1: pct(score?.passes?.pass1?.accuracy), acc_after: pct(after?.accuracy),
  acc_p1_n: `${score?.passes?.pass1?.right}/${score?.passes?.pass1?.total}`, acc_after_n: `${after?.right}/${after?.total}`,
};
writeFileSync("data/run-meta.json", JSON.stringify(meta, null, 1));
console.log(meta);
