// Merges the verified records with human/browser fixes into results/final/.
//   verifier output (results/verify)  ->  falls back to pass 1 if the verifier failed
//   + data/human-fixes.json           ->  field patches from browser checks, each with a reason and URL
//   node src/finalize.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const apps = JSON.parse(readFileSync("data/apps.json", "utf8"));
const fixes = existsSync("data/human-fixes.json") ? JSON.parse(readFileSync("data/human-fixes.json", "utf8")) : {};
mkdirSync("results/final", { recursive: true });
let fromVerify = 0, fromPass1 = 0, patched = 0, ruled = 0;
for (const app of apps) {
  const v = existsSync(`results/verify/${app.slug}.json`) ? JSON.parse(readFileSync(`results/verify/${app.slug}.json`, "utf8")) : null;
  const p1 = JSON.parse(readFileSync(`results/pass1/${app.slug}.json`, "utf8"));
  const base = v?.record ? v : p1;
  if (v?.record) fromVerify++; else fromPass1++;
  const record = structuredClone(base.record);
  const human = [];
  for (const f of fixes[app.slug] ?? []) {
    human.push({ field: f.field, old: JSON.stringify(record[f.field]), new: JSON.stringify(f.value), why: f.why, url: f.url, by: f.by ?? "browser check" });
    record[f.field] = f.value;
    patched++;
  }
  // Consistency rule: a record that names app review as its main blocker is approval_required by the rubric.
  if (record.access.startsWith("self_serve") && record.main_blocker === "app_review") {
    human.push({ field: "access", old: JSON.stringify(record.access), new: '"approval_required"', why: `the record names app review as its main blocker, which the rubric labels approval_required`, url: record.evidence[0]?.url, by: "consistency rule" });
    record.access = "approval_required"; ruled++;
  }
  writeFileSync(`results/final/${app.slug}.json`, JSON.stringify({ ...app, source: v?.record ? "verify" : "pass1", record, human_fixes: human }, null, 1));
}
console.log(`final: ${fromVerify} from verifier, ${fromPass1} fell back to pass 1, ${patched} human/browser field fixes, ${ruled} consistency-rule fixes`);
