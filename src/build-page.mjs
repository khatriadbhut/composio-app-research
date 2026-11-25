// Builds docs/index.html (the case study) plus machine-readable exports from the
// final records, the loop outputs and the audit score. Narrative text lives in
// data/narrative.json; every number is computed here.
//   node src/build-page.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const J = (p, d = null) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const apps = J("data/apps.json");
const checks = J("results/checks-pass1.json", {});
const composio = J("results/composio-pass1.json", { apps: {}, catalog_size: null });
const score = J("results/score.json");
const sample = J("data/audit-sample.json");
const N = J("data/narrative.json");
const meta = J("data/run-meta.json", {});

const L = {
  build: { ready_now: "Ready now", ready_with_caveats: "Ready, with caveats", needs_partnership_or_sales: "Needs partnership / sales", not_buildable: "Not buildable" },
  access: { self_serve_free: "Self-serve, free", self_serve_trial: "Self-serve, trial only", paid_plan_required: "Paid plan required", approval_required: "Approval / app review", partner_gated: "Partner program", contact_sales: "Contact sales", no_public_api: "No public API" },
  auth: { oauth2: "OAuth2", oauth1: "OAuth1", api_key: "API key", bearer_token: "Token", basic: "Basic", jwt_service_account: "Service account/JWT", aws_sigv4: "AWS SigV4", hmac_signature: "HMAC", bot_token: "Bot token", none: "None", other: "Other" },
  api: { rest: "REST", graphql: "GraphQL", soap: "SOAP", grpc: "gRPC", websocket: "WebSocket", sdk_only: "SDK only", cli_only: "CLI only", library_only: "Library", none: "None" },
  breadth: { broad: "broad", moderate: "moderate", narrow: "narrow", none: "no API" },
  mcp: { official_remote: "Official, hosted", official_local: "Official, local", community_only: "Community only", none_found: "None found" },
  blocker: { none: "—", app_review: "App review", paid_plan: "Paid plan", partnership: "Partnership", enterprise_sales: "Enterprise sales", no_public_api: "No public API", local_only_tool: "Local-only tool", narrow_api: "Narrow API", tos_or_rate_limits: "ToS / rate limits", other: "Other" },
  field: { auth_primary: "Primary auth", auth_methods: "All auth methods", access: "Access", api_styles: "API style", api_breadth: "API breadth", mcp: "MCP", buildability: "Verdict", main_blocker: "Main blocker" },
  fieldShort: { auth_primary: "auth", auth_methods: "auth set", access: "access", api_styles: "api", api_breadth: "breadth", mcp: "mcp", buildability: "verdict", main_blocker: "blocker" },
  cat: {},
};

const rows = apps.map((app) => {
  const f = J(`results/final/${app.slug}.json`);
  const p1 = J(`results/pass1/${app.slug}.json`);
  const v = J(`results/verify/${app.slug}.json`);
  const r = f.record;
  const ck = checks[app.slug]?.evidence ?? [];
  // Evidence checks were run on pass-1 URLs; reuse them where the final record cites the same page.
  const fc = J("results/checks-final.json", {})[app.slug]?.evidence ?? [];
  const look = (url) => fc.find((e) => e.url === url) ?? ck.find((e) => e.url === url) ?? {};
  const c = composio.apps[app.slug];
  return {
    id: app.id, slug: app.slug, app: app.app, category: app.category, hint: app.hint,
    what: r.what_it_does, sub: r.subcategory,
    auth: r.auth_methods, authPrimary: r.auth_primary, authNotes: r.auth_notes,
    access: r.access, accessNotes: r.access_notes,
    api: r.api_styles, breadth: r.api_breadth, breadthNotes: r.api_breadth_notes, openapi: r.openapi_spec, webhooks: r.webhooks, sandbox: r.sandbox,
    mcp: r.mcp, mcpNotes: r.mcp_notes, build: r.buildability, blocker: r.main_blocker, blockerNotes: r.blocker_notes,
    conf: r.confidence, needsHuman: r.needs_human,
    evidence: r.evidence.map((e) => ({ ...e, status: look(e.url).status ?? null, match: look(e.url).match ?? null })),
    composio: c?.in_composio ? { toolkit: c.toolkit, tools: c.tools, auth: c.composio_auth } : null,
    changes: [...(v?.record?.changes ?? []), ...(f.human_fixes ?? []).map((h) => ({ ...h, why: `${h.by}: ${h.why}` }))],
    pass1: { access: p1.record?.access, build: p1.record?.buildability },
    graded: ["auth_methods", "auth_primary", "access", "api_styles", "api_breadth", "mcp", "buildability", "main_blocker"]
      .filter((k) => JSON.stringify(p1.record?.[k]) !== JSON.stringify(r[k])),
    trace: p1.trace ?? [],
  };
});

// ---------- aggregates ----------
const count = (arr, k) => arr.reduce((m, x) => ((m[k(x)] = (m[k(x)] ?? 0) + 1), m), {});
const by = (k) => count(rows, (r) => r[k]);
const names = (pred) => rows.filter(pred).map((r) => r.app);
const cats = [...new Set(apps.map((a) => a.category))];
const accessOrder = ["self_serve_free", "self_serve_trial", "paid_plan_required", "approval_required", "partner_gated", "contact_sales", "no_public_api"];
const authAny = {}; for (const r of rows) for (const m of new Set(r.auth)) (authAny[m] ??= []).push(r.app);
const authPrim = {}; for (const r of rows) (authPrim[r.authPrimary] ??= []).push(r.app);
const blockers = {}; for (const r of rows) if (r.blocker !== "none") (blockers[r.blocker] ??= []).push(r.app);
const mcpBy = {}; for (const r of rows) (mcpBy[r.mcp] ??= []).push(r.app);
const inComposio = rows.filter((r) => r.composio);
const stats = {
  n: rows.length, build: by("build"), access: by("access"),
  oauthAny: authAny.oauth2?.length ?? 0, oauthPrimary: authPrim.oauth2?.length ?? 0,
  keyAny: new Set([...(authAny.api_key ?? []), ...(authAny.bearer_token ?? [])]).size,
  mcpOfficial: (mcpBy.official_remote?.length ?? 0) + (mcpBy.official_local?.length ?? 0), mcpRemote: mcpBy.official_remote?.length ?? 0,
  inComposio: inComposio.length, catalogSize: composio.catalog_size,
  webhooks: rows.filter((r) => r.webhooks === "yes").length,
  selfServe: rows.filter((r) => r.access.startsWith("self_serve")).length,
};
stats.easyWins = rows.filter((r) => r.build === "ready_now" && !r.composio).map((r) => r.app);
stats.outreach = rows.filter((r) => ["needs_partnership_or_sales", "not_buildable"].includes(r.build) || ["partner_gated", "contact_sales"].includes(r.access)).map((r) => r.app);
stats.topBlocker = Object.entries(blockers).sort((a, b) => b[1].length - a[1].length)[0] ?? ["none", []];
stats.topBlockerName = (L.blocker[stats.topBlocker[0]] ?? stats.topBlocker[0]).toLowerCase();
stats.topBlockerN = stats.topBlocker[1].length;
stats.blocked = rows.filter((r) => r.blocker !== "none").length;
const catSelf = cats.map((c) => { const rs = rows.filter((r) => r.category === c); return { c, n: rs.filter((r) => r.access.startsWith("self_serve")).length, t: rs.length }; }).sort((a, b) => b.n - a.n);
stats.mostSelfServe = catSelf.filter((x) => x.n === catSelf[0].n).map((x) => `${x.c} (${x.n}/${x.t})`).join(", ");
stats.leastSelfServe = catSelf.filter((x) => x.n === catSelf.at(-1).n).map((x) => `${x.c} (${x.n}/${x.t})`).join(", ");
stats.approval = stats.access.approval_required ?? 0;
stats.paid = (stats.access.paid_plan_required ?? 0) + (stats.access.self_serve_trial ?? 0);
stats.gated = (stats.access.partner_gated ?? 0) + (stats.access.contact_sales ?? 0) + (stats.access.no_public_api ?? 0);
stats.readyNow = stats.build.ready_now ?? 0; stats.caveats = stats.build.ready_with_caveats ?? 0;
stats.needsDeal = stats.build.needs_partnership_or_sales ?? 0; stats.notBuildable = stats.build.not_buildable ?? 0;
stats.buildableToday = stats.readyNow + stats.caveats;
stats.oauthOnly = rows.filter((r) => r.auth.length === 1 && r.auth[0] === "oauth2").length;
stats.oauthPlusKey = rows.filter((r) => r.auth.includes("oauth2") && (r.auth.includes("api_key") || r.auth.includes("bearer_token"))).length;
stats.keyOnly = rows.filter((r) => !r.auth.includes("oauth2") && (r.auth.includes("api_key") || r.auth.includes("bearer_token") || r.auth.includes("basic"))).length;
stats.mcpCommunity = mcpBy.community_only?.length ?? 0; stats.mcpNone = mcpBy.none_found?.length ?? 0;
stats.mcpLocal = mcpBy.official_local?.length ?? 0;
stats.easyWinsN = stats.easyWins.length; stats.outreachN = stats.outreach.length;
stats.notInComposio = rows.length - inComposio.length;
for (const [k, v] of Object.entries(meta)) stats[k] ??= v;

const heat = { type: "heat", cols: accessOrder.filter((a) => stats.access[a]), rows: cats.map((c) => ({
  label: c, cells: accessOrder.filter((a) => stats.access[a]).map((a) => { const ap = rows.filter((r) => r.category === c && r.access === a).map((r) => r.app); return { n: ap.length, apps: ap }; }) })) };
const barRows = (obj, labels) => Object.entries(obj).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => ({ label: labels[k] ?? k, v: v.length, tip: v.join(", ") }));

const fillT = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => {
  const v = stats[k] ?? meta[k];
  return Array.isArray(v) ? v.length : v ?? `{{${k}}}`;
});
const vizFor = {
  auth: { type: "bars", rows: barRows(authAny, L.auth) },
  access_heat: heat,
  blockers: { type: "bars", rows: barRows(blockers, L.blocker) },
  mcp: { type: "bars", rows: barRows(mcpBy, L.mcp), alt: true },
  buildability_cat: { type: "heat", cols: ["ready_now", "ready_with_caveats", "needs_partnership_or_sales", "not_buildable"], rows: cats.map((c) => ({ label: c,
    cells: ["ready_now", "ready_with_caveats", "needs_partnership_or_sales", "not_buildable"].map((b) => { const ap = rows.filter((r) => r.category === c && r.build === b).map((r) => r.app); return { n: ap.length, apps: ap }; }) })) },
  wins: { type: "lists", lists: [
    { title: "Easy wins: ready now, not in Composio yet", items: stats.easyWins },
    { title: "Needs outreach: partnership, sales or no API", items: stats.outreach }] },
  composio: { type: "lists", lists: [
    { title: "Already a Composio toolkit", items: inComposio.map((r) => r.app) },
    { title: "Not in the catalog yet", items: rows.filter((r) => !r.composio).map((r) => r.app) }] },
};
const patterns = N.patterns.map((p) => ({ title: fillT(p.title), body: fillT(p.body), wide: !!p.wide, viz: vizFor[p.viz] ?? null }));
// heat for buildability uses build labels for its columns
for (const p of patterns) if (p.viz?.cols?.[0] === "ready_now") p.viz = { ...p.viz, cols: p.viz.cols };

const afterKey = "pass2"; // the scored number is always the automated pipeline, never human-fixed records
const DATA = {
  meta: { generated: new Date().toISOString(), links: N.links, footer: fillT(N.footer) },
  labels: { ...L, access: { ...L.access, ...L.build } },
  hero: { headline: fillT(N.hero.headline), thesis: fillT(N.hero.thesis), stats: N.hero.stats.map((s) => ({ v: fillT(s.v), k: fillT(s.k) })) },
  patterns, apps: rows,
  agent: { lede: fillT(N.agent.lede), steps: N.agent.steps.map((s) => ({ ...s, body: fillT(s.body), out: fillT(s.out) })), human: N.agent.human.map(fillT), cost: N.agent.cost.map(fillT) },
  verification: { lede: fillT(N.verification.lede), note: fillT(N.verification.note), loops: N.verification.loops.map(fillT), misses: N.verification.misses.map(fillT), defeats: N.verification.defeats.map(fillT) },
  score: { sample: sample.apps, sample_size: score.sample_size, fields: score.fields, pass1: score.passes.pass1, after: score.passes[afterKey], afterKey, cells: score.cells },
  proof: { cmd: N.proof.cmd, agentLinks: N.proof.agentLinks },
};

mkdirSync("docs/data", { recursive: true });
const tpl = readFileSync("src/page-template.html", "utf8");
const page = tpl.replace("/*__DATA__*/", JSON.stringify(DATA).replace(/</g, "\\u003c"));
writeFileSync("docs/index.html", `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${page.split("<style>")[0]}<style>${page.split("<style>")[1].split("</style>")[0]}</style>\n</head>\n<body>\n${page.split("</style>")[1]}\n</body>\n</html>\n`);
writeFileSync("docs/artifact.html", page);

// machine-readable exports
const exportRows = rows.map(({ trace, ...r }) => r);
writeFileSync("docs/data/apps.json", JSON.stringify({ generated: DATA.meta.generated, schema: "see src/schema.json in the repo", accuracy: { sample_size: score.sample_size, pass1: score.passes.pass1.accuracy, after_loops: score.passes[afterKey].accuracy }, apps: exportRows }, null, 1));
const cols = ["id", "app", "category", "what", "authPrimary", "auth", "access", "api", "breadth", "openapi", "webhooks", "mcp", "mcpNotes", "build", "blocker", "blockerNotes", "composio"];
const csvCell = (v) => { const s = Array.isArray(v) ? v.join("|") : v && typeof v === "object" ? v.toolkit : v ?? ""; return /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s); };
writeFileSync("docs/data/apps.csv", [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n"));
writeFileSync("docs/llms.txt", [
  `# ${fillT(N.hero.headline)}`, "", `> ${fillT(N.hero.thesis).replace(/<[^>]+>/g, "")}`, "",
  "## Data", "- [apps.json](data/apps.json): all 100 verified records with evidence URLs and quotes", "- [apps.csv](data/apps.csv): the same as a flat table", "",
  "## Patterns", ...patterns.map((p) => `- **${p.title}** ${p.body.replace(/<[^>]+>/g, "")}`), "",
  "## Accuracy", `- Hand-audited sample: ${score.sample_size} apps x ${score.fields.length} fields. Research agent alone: ${(score.passes.pass1.accuracy * 100).toFixed(1)}%. After verification loops: ${(score.passes[afterKey].accuracy * 100).toFixed(1)}%.`, "",
  "## Records", ...rows.map((r) => `- ${r.app} (${r.category}): ${L.build[r.build]}; auth ${r.auth.join("/")}, primary ${r.authPrimary}; access ${r.access}; MCP ${r.mcp}; blocker ${r.blocker}.`),
].join("\n"));
console.log(`docs/index.html written: ${rows.length} apps, ${patterns.length} patterns, accuracy ${score.passes.pass1.accuracy} -> ${score.passes[afterKey].accuracy}`);
