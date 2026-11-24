// Grades each pass against the hand-audited sample (data/audit/*.json).
// A human verdict in an audit file's "human" block overrides the auditor's label.
//   node src/score.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const sample = JSON.parse(readFileSync("data/audit-sample.json", "utf8")).apps;
const FIELDS = ["auth_primary", "auth_methods", "access", "api_styles", "api_breadth", "mcp", "buildability", "main_blocker"];
const fam = (a) => (a === "bearer_token" || a === "api_key" ? "key_or_token" : a);
const setEq = (a, b, f = (x) => x) => { const A = new Set(a.map(f)), B = new Set(b.map(f)); return A.size === B.size && [...A].every((x) => B.has(x)); };

function same(field, got, want) {
  if (got == null) return false;
  if (field === "auth_methods") return setEq(got, want, fam);
  if (field === "auth_primary") return fam(got) === fam(want);
  if (field === "api_styles") return setEq(got.filter((s) => s !== "websocket"), want.filter((s) => s !== "websocket"));
  return got === want;
}

function truth(slug) {
  const a = JSON.parse(readFileSync(`data/audit/${slug}.json`, "utf8"));
  const t = { ...a.labels };
  for (const [k, v] of Object.entries(a.human?.overrides ?? {})) t[k] = v;
  return t;
}

const passes = [["pass1", "results/pass1"], ["pass2", "results/verify"], ["final", "results/final"]].filter(([, d]) => existsSync(d));
const result = { sample_size: 0, fields: FIELDS, passes: {}, cells: [] };
const have = sample.filter((s) => existsSync(`data/audit/${s}.json`));
result.sample_size = have.length;

for (const [name, dir] of passes) {
  const per = Object.fromEntries(FIELDS.map((f) => [f, { right: 0, total: 0 }]));
  for (const slug of have) {
    if (!existsSync(`${dir}/${slug}.json`)) continue;
    const rec = JSON.parse(readFileSync(`${dir}/${slug}.json`, "utf8")).record;
    const t = truth(slug);
    for (const f of FIELDS) {
      if (t[f] == null) continue;
      const ok = same(f, rec?.[f], t[f]);
      per[f].total++; if (ok) per[f].right++;
      result.cells.push({ pass: name, slug, field: f, ok, got: rec?.[f] ?? null, want: t[f] });
    }
  }
  const right = Object.values(per).reduce((s, x) => s + x.right, 0), total = Object.values(per).reduce((s, x) => s + x.total, 0);
  result.passes[name] = { right, total, accuracy: total ? +(right / total).toFixed(3) : null, per_field: per };
}
writeFileSync("results/score.json", JSON.stringify(result, null, 1));
console.log(`audit sample: ${have.length} apps x ${FIELDS.length} fields`);
for (const [n, p] of Object.entries(result.passes)) {
  console.log(`${n.padEnd(6)} ${(p.accuracy * 100).toFixed(1)}%  (${p.right}/${p.total})   ` +
    FIELDS.map((f) => `${f}:${p.per_field[f].right}/${p.per_field[f].total}`).join("  "));
}
