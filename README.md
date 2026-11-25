<div align="center">

# composio-app-research

**An agent that researches apps for AI-agent toolkits, then checks its own work.**

Give it a list of apps. For each one it finds the auth method, whether a
developer can get credentials alone, the API surface, any MCP server, and a
buildability verdict, every answer tied to a quote from the page it came from.
Then three loops try to prove it wrong.

[![Case study](https://img.shields.io/badge/case%20study-live-2f4fd1.svg)](https://composio-app-research-391.netlify.app/)
[![Apps](https://img.shields.io/badge/apps-100-brightgreen.svg)](docs/data/apps.csv)
[![Accuracy](https://img.shields.io/badge/audited%20accuracy-78%25%E2%86%9288%25-brightgreen.svg)](#how-it-checks-itself)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)](package.json)
[![LLM](https://img.shields.io/badge/LLM-Claude%20Code%20headless-8957e5.svg)](#requirements)
[![Tools](https://img.shields.io/badge/tools-Composio-lightgrey.svg)](#how-it-checks-itself)

</div>

<table>
<tr>
  <th align="left" width="22%">stage</th>
  <th align="left" width="28%">what runs</th>
  <th align="left">what it produces</th>
</tr>
<tr>
  <td><b>1 · research</b></td>
  <td>one headless Claude Code session per app, web search + fetch</td>
  <td>a structured record per app, with evidence URLs, verbatim quotes and a trace of every tool call</td>
</tr>
<tr>
  <td><b>2 · evidence check</b></td>
  <td>plain Node, no LLM</td>
  <td>every cited URL re-fetched; is the quote really on the page, is the link dead, does the record contradict itself</td>
</tr>
<tr>
  <td><b>3 · Composio catalog</b></td>
  <td>Composio REST API</td>
  <td>the agent's auth findings compared with Composio's own toolkit catalog, and which apps Composio already ships</td>
</tr>
<tr>
  <td><b>4 · verifier</b></td>
  <td>a second, adversarial agent on a stronger model</td>
  <td>each record re-checked against primary sources, fed the flags from stages 2 and 3; every change logged with a reason</td>
</tr>
<tr>
  <td><b>5 · audit</b></td>
  <td>independent auditor agents + browser checks + a human</td>
  <td>ground truth for a seeded sample of 20 apps, used to grade stage 1 and stage 4</td>
</tr>
</table>

On the audited sample, the research agent alone was right on **78%** (124/160) of
fields. After the loops, **88%** (140/160). The
[case study](https://composio-app-research-391.netlify.app/) shows every
audited cell, hit or miss.

---

## Quick start

**Claude Code is the LLM.** There is no model API key: each research session
is `claude -p` running on your own Claude Code login, with structured output
enforced by a JSON schema.

<table>
<tr>
<td valign="top" width="50%">

**One app**

```sh
git clone https://github.com/khatriadbhut/composio-app-research
cd composio-app-research
node src/research.mjs --only notion --force
```

Writes `results/pass1/notion.json` in about a minute.

</td>
<td valign="top" width="50%">

**All 100, every loop**

```sh
npm run all
```

Research, evidence check, Composio
catalog, verifier, score, then the page.

</td>
</tr>
</table>

Then open `docs/index.html`, or the
[live copy](https://composio-app-research-391.netlify.app/).

<details>
<summary><b>More on running it</b> — one stage at a time, other apps, cost</summary>

<br>

Every stage reads and writes plain JSON under `results/`, so any of them can be
re-run alone. Each takes `--only slug,slug` and `--force`:

```sh
npm run research                     # stage 1    results/pass1/*.json
npm run check                        # stage 2    results/checks-pass1.json
npm run composio                     # stage 3    results/composio-pass1.json
npm run verify                       # stage 4    results/verify/*.json
node src/finalize.mjs                #            results/final/*.json  (+ data/human-fixes.json)
npm run score                        # stage 5    results/score.json
npm run build                        #            docs/index.html, docs/data/apps.{json,csv}, docs/llms.txt
```

**Your own list:** replace `data/apps.json`. Each entry needs a `slug`, `app`,
`category` and a `hint`, the docs URL or a few words that pin down which
product you mean.

**Cost:** the research pass used $9.06 of model usage (54 agent-minutes, 727 tool calls) and the Opus verifier $28.29, as API-equivalent prices. On a Claude Code subscription those come out of your plan's usage, and the full run took two limit resets. Every stage skips what is already on disk, so an interrupted run continues where it stopped.

Research sessions run with your user-level settings switched off
(`--setting-sources project`), so your own hooks and plugins don't fire a
hundred times, and with sub-agents disallowed, because they paraphrase what
they read and the quotes must come from pages directly.

</details>

---

**[Requirements](#requirements) · [What it records](#what-it-records) ·
[How it checks itself](#how-it-checks-itself) · [Where a human was needed](#where-a-human-was-needed) ·
[Findings](#findings) · [Files](#files)**

## Requirements

**Node ≥ 22** (no dependencies) and **Claude Code** logged in. That is the
whole list: no Anthropic or Composio API key is needed.

| stage | needs |
| --- | --- |
| research, verifier | `claude` on your PATH, logged in |
| evidence check, score, page | nothing beyond Node |
| Composio catalog | nothing: reads Composio's public toolkit list ([docs.composio.dev/toolkits.md](https://docs.composio.dev/toolkits.md)); uses the API instead if `COMPOSIO_API_KEY` is set |

## What it records

One record per app, defined in [`src/schema.json`](src/schema.json). The same
definitions are written out in plain words in
[`data/rubric.md`](data/rubric.md), so the agent, the verifier and the auditors
all label against the same rubric.

| field | values |
| --- | --- |
| `auth_methods`, `auth_primary` | `oauth2` · `api_key` · `bearer_token` · `basic` · `jwt_service_account` · `bot_token` · … |
| `access` | `self_serve_free` · `self_serve_trial` · `paid_plan_required` · `approval_required` · `partner_gated` · `contact_sales` · `no_public_api` |
| `api_styles`, `api_breadth` | REST / GraphQL / …, and broad · moderate · narrow |
| `openapi_spec`, `webhooks`, `sandbox` | yes · no · unknown |
| `mcp` | `official_remote` · `official_local` · `community_only` · `none_found` |
| `buildability` | `ready_now` · `ready_with_caveats` · `needs_partnership_or_sales` · `not_buildable` |
| `main_blocker` | `app_review` · `paid_plan` · `partnership` · `enterprise_sales` · `no_public_api` · … |
| `evidence[]` | `{ field, url, quote }`, at least three per app |
| `confidence`, `needs_human` | the agent's own doubt, per field |

## How it checks itself

Four checks, each built to catch a different kind of mistake. Numbers are from the run in `results/`.

| loop | catches | result |
| --- | --- | --- |
| **1 · evidence check** | invented or paraphrased quotes, dead links, records that contradict themselves | 348 of 462 quotes found on their page in pass 1; 75 records flagged, covering 14 of the 16 audited apps that had any error |
| **2 · Composio catalog** | auth methods the agent missed | 79 of the 100 are already Composio toolkits; auth agreed on 77/79 after pass 1, 79/79 after verification |
| **3 · verifier** | wrong facts, outdated MCP status, misread gates | changed a graded answer on 63 records; on the audit sample it fixed 18 cells and broke 2 |
| **4 · adjudication** | disagreements between the pipeline and the auditors | 27 disputed cells settled in a browser or by a human: auditor right 19, pipeline right 7, neither 1 |

**Measured accuracy** on the seeded sample of 20 apps × 8 fields: **78% → 88%**
(124/160 → 140/160), research agent alone versus after the automated loops.
The 20 cells still wrong were then settled by hand. That isn't counted as
accuracy, because a person fixed exactly those cells.

The misses left after loop 3 clustered in one place, the gate between building
and distributing: Front, Lark and Discord let anyone build, but other customers
can connect only after a review. That became a fifth, deterministic check, a
consistency rule in `src/finalize.mjs` and `src/check-evidence.mjs`, which
corrected 5 more records outside the sample.

<details>
<summary><b>How the audit stays independent</b></summary>

<br>

The sample is drawn by [`src/sample.mjs`](src/sample.mjs) with a fixed seed: two
apps per category, twenty in all, so anyone can reproduce it. The auditor agents
were started before the pipeline's results were read, were told never to open
`results/`, and labelled from primary sources against the same rubric. Fields
they could not confirm went to a browser check and then to a human.

Scoring is per field: `auth_methods` and `api_styles` must match as sets, and an
API key and a static bearer token count as the same family, since vendors use the
two names for one thing.

</details>

## Where a human was needed

Every place a person stepped in is logged, with the page that decided it, in
[`data/disputes.json`](data/disputes.json) and [`data/human-fixes.json`](data/human-fixes.json).

- **Judgment calls.** Some cells have no single fact behind them. Discord hosts an MCP
  endpoint it never documents (ruled official), and Discord's and Lark's app tokens are
  bot identities (ruled `bot_token`).
- **Pages only a browser renders.** Meta's Threads MCP docs, HubSpot's install limits
  and Front's publishing rules were read in Chrome. HubSpot's page settled a dispute
  against the auditor: OAuth apps are capped at 25 installs until marketplace review.
- **Product identity.** iPayX, Paygent Connect and Sherlock each matched more than one
  product. The hint in the request list decided it.
- **Login walls.** fanbasis issues API keys only after an admin approves a request,
  which can only be seen from inside its portal.

## Findings

- **94 of 100 can be toolkits today; 33 with no caveat.** 4 need a partnership or a
  sales conversation (DealCloud, Gladly, Salesforce Commerce Cloud, Ramp), and 2 have no
  API at all (Sherlock, Mermaid CLI).
- **OAuth2 dominates.** 78 apps offer it, and it is the primary method for 63. Most also
  accept an API key or a personal token, the quick path for a prototype.
- **The usual blocker is app review, not access.** 31 apps let a developer build for free
  but put a review between the app and other customers' accounts: Meta, Google Ads,
  LinkedIn, Intuit, Shopify, Zendesk, HubSpot. Composio's own docs note that its managed
  HubSpot OAuth app is still waiting on HubSpot's approval.
- **Vendors are shipping MCP servers.** 86 of the 100 publish an official one, most of
  them hosted with OAuth. Composio already wraps four of them (Pylon, Netlify, Otter, Devin).
- **79 are already Composio toolkits.** Of the 21 that aren't, the ones ready now are the
  easy wins. The partner- and sales-gated ones are a business-development list.

The full table, with the evidence for every cell, is in the
[case study](https://composio-app-research-391.netlify.app/#findings), and
as [JSON](docs/data/apps.json) and [CSV](docs/data/apps.csv).

## Files

| path | what |
| --- | --- |
| `data/apps.json` | the 100 apps, with category and hint |
| `data/rubric.md` | the label definitions |
| `data/audit/` | ground-truth labels for the audit sample, with evidence |
| `data/human-fixes.json` | field fixes from browser checks, each with a reason and URL |
| `prompts/` | the research and verifier prompts |
| `src/` | one script per stage, and the page template |
| `results/` | every intermediate output, kept so each step can be inspected |
| `docs/` | the case study page and its data exports |

## Licence

MIT. Findings describe third-party products as their public documentation stood
on the date of the run; vendors change plans and policies, and the evidence
links are there so any answer can be re-checked.
