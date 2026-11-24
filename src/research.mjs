// Pass 1: one research agent per app.
//   node src/research.mjs                 all 100, skipping ones already done
//   node src/research.mjs --only notion,stripe --force
//   node src/research.mjs --concurrency 6 --model sonnet
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { runClaude, pool, fill } from "./claude.mjs";
import { parseArgs } from "./args.mjs";

const opts = parseArgs(process.argv.slice(2), { concurrency: 6, model: "sonnet", out: "results/pass1" });
const apps = JSON.parse(readFileSync("data/apps.json", "utf8"));
const schema = JSON.parse(readFileSync("src/schema.json", "utf8"));
const tpl = readFileSync("prompts/research.md", "utf8");
mkdirSync(opts.out, { recursive: true });

const todo = apps.filter((a) => (!opts.only || opts.only.split(",").includes(a.slug))
  && (opts.force || !existsSync(`${opts.out}/${a.slug}.json`)));
console.log(`pass1: ${todo.length} apps, model ${opts.model}, concurrency ${opts.concurrency}`);

let done = 0;
await pool(todo, Number(opts.concurrency), async (app) => {
  const t0 = Date.now();
  let r;
  for (let attempt = 1; attempt <= 2; attempt++) {
    r = await runClaude({ prompt: fill(tpl, app), schema, model: opts.model });
    if (r.ok) break;
  }
  const rec = { ...app, pass: 1, at: new Date().toISOString(), ...r, record: r.output };
  delete rec.output;
  writeFileSync(`${opts.out}/${app.slug}.json`, JSON.stringify(rec, null, 1));
  done++;
  console.log(`[${done}/${todo.length}] ${r.ok ? "ok  " : "FAIL"} ${app.app.padEnd(26)} ${((Date.now() - t0) / 1000).toFixed(0)}s  ${r.trace.length} tool calls  ${r.ok ? r.output.access + " / " + r.output.buildability : r.error?.slice(0, 120)}`);
});
