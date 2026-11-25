// Applies adjudicated disputes (data/disputes.json) in both directions:
//   - where the auditor was wrong, the audit label is overridden (data/audit/<slug>.json "human" block),
//     which changes the ground truth for pass 1 and pass 2 alike;
//   - where the pipeline was wrong, a fix goes into data/human-fixes.json for the published table only.
// Scored accuracy always uses the automated pass-2 records, never these fixes.
//   node src/apply-disputes.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const disputes = JSON.parse(readFileSync("data/disputes.json", "utf8"));
const fixes = {};
let auditFixed = 0, pipelineFixed = 0;
for (const d of disputes) {
  const path = `data/audit/${d.slug}.json`;
  if (existsSync(path)) {
    const a = JSON.parse(readFileSync(path, "utf8"));
    a.human ??= { overrides: {}, notes: {} };
    if (JSON.stringify(a.labels[d.field]) !== JSON.stringify(d.decided)) {
      a.human.overrides[d.field] = d.decided; a.human.notes[d.field] = `${d.by}: ${d.note} (${d.url})`; auditFixed++;
    }
    writeFileSync(path, JSON.stringify(a, null, 1));
  }
  if (!existsSync(`results/verify/${d.slug}.json`)) continue;
  const fin = JSON.parse(readFileSync(`results/verify/${d.slug}.json`, "utf8")).record;
  if (JSON.stringify(fin[d.field]) !== JSON.stringify(d.decided)) {
    (fixes[d.slug] ??= []).push({ field: d.field, value: d.decided, why: d.note, url: d.url, by: d.by });
    pipelineFixed++;
  }
}
writeFileSync("data/human-fixes.json", JSON.stringify(fixes, null, 1));
console.log(`${disputes.length} rulings: ${auditFixed} audit labels corrected, ${pipelineFixed} published-table fixes`);
