// Draws the audit sample: 2 apps per category, seeded, so anyone can reproduce it.
import { readFileSync, writeFileSync } from "node:fs";
const SEED = 20261124, PER = 2;
let s = SEED; const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const apps = JSON.parse(readFileSync("data/apps.json", "utf8"));
const byCat = Object.groupBy(apps, (a) => a.category);
const sample = Object.values(byCat).flatMap((list) =>
  [...list].map((a) => [rand(), a]).sort((x, y) => x[0] - y[0]).slice(0, PER).map(([, a]) => a));
writeFileSync("data/audit-sample.json", JSON.stringify({ seed: SEED, per_category: PER, apps: sample.map((a) => a.slug) }, null, 1));
console.log(sample.map((a) => `${a.id} ${a.app}`).join("\n"));
