// Loop 3: an adversarial verifier agent re-checks every record against primary
// sources, fed with the flags from loop 1 (evidence/logic) and loop 2 (Composio catalog).
//   node src/verify.mjs [--model opus] [--concurrency 6] [--only a,b] [--force]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { runClaude, pool, fill } from "./claude.mjs";
import { parseArgs } from "./args.mjs";

const opts = parseArgs(process.argv.slice(2), { concurrency: 6, model: "opus", in: "results/pass1", out: "results/verify" });
const apps = JSON.parse(readFileSync("data/apps.json", "utf8"));
const base = JSON.parse(readFileSync("src/schema.json", "utf8"));
const tpl = readFileSync("prompts/verify.md", "utf8");
const checks = existsSync("results/checks-pass1.json") ? JSON.parse(readFileSync("results/checks-pass1.json", "utf8")) : {};
const composio = existsSync("results/composio-pass1.json") ? JSON.parse(readFileSync("results/composio-pass1.json", "utf8")).apps : {};
mkdirSync(opts.out, { recursive: true });

const schema = structuredClone(base);
schema.required.push("changes");
schema.properties.changes = { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "old", "new", "why"],
  properties: { field: { type: "string" }, old: { type: "string" }, new: { type: "string" }, why: { type: "string" } } } };

function flagsFor(slug) {
  const f = [...(checks[slug]?.flags ?? [])];
  const c = composio[slug];
  if (c?.in_composio && !c.agrees) f.push(`Composio's own ${c.toolkit} toolkit supports auth [${c.composio_auth.join(", ")}]; the record lacks ${c.missing_vs_composio.join(", ")}. Check whether the vendor offers it.`);
  if (c?.in_composio) f.push(`Composio already ships a ${c.toolkit} toolkit (${c.tools ?? "?"} tools, auth: ${c.composio_auth.join(", ")}), so a public API certainly exists.`);
  return f.length ? f.map((x) => `- ${x}`).join("\n") : "- none";
}

const todo = apps.filter((a) => (!opts.only || opts.only.split(",").includes(a.slug))
  && existsSync(`${opts.in}/${a.slug}.json`) && (opts.force || !existsSync(`${opts.out}/${a.slug}.json`)));
console.log(`verify: ${todo.length} apps, model ${opts.model}`);
let done = 0;
await pool(todo, Number(opts.concurrency), async (app) => {
  const p1 = JSON.parse(readFileSync(`${opts.in}/${app.slug}.json`, "utf8"));
  const prompt = fill(tpl, { ...app, record: JSON.stringify(p1.record, null, 1), flags: flagsFor(app.slug) });
  let r;
  for (let attempt = 1; attempt <= 2; attempt++) { r = await runClaude({ prompt, schema, model: opts.model }); if (r.ok) break; }
  const rec = { ...app, pass: 2, at: new Date().toISOString(), ...r, record: r.output, flags_given: flagsFor(app.slug) };
  delete rec.output;
  writeFileSync(`${opts.out}/${app.slug}.json`, JSON.stringify(rec, null, 1));
  done++;
  console.log(`[${done}/${todo.length}] ${r.ok ? "ok  " : "FAIL"} ${app.app.padEnd(26)} ${r.ok ? r.output.changes.length + " changes: " + r.output.changes.map((c) => c.field).join(", ") : r.error?.slice(0, 100)}`);
});
