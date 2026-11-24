<div align="center">

# composio-app-research

**An agent that researches apps for AI-agent toolkits, then checks its own work.**

Give it a list of apps. For each one it finds the auth method, whether a
developer can get credentials alone, the API surface, any MCP server, and a
buildability verdict, every answer tied to a quote from the page it came from.
Then three loops try to prove it wrong.

[![Case study](https://img.shields.io/badge/case%20study-live-2f4fd1.svg)](https://khatriadbhut.github.io/composio-app-research/)
[![Apps](https://img.shields.io/badge/apps-100-brightgreen.svg)](docs/data/apps.csv)
[![Accuracy](https://img.shields.io/badge/audited%20accuracy-{{ACC_BADGE}}-brightgreen.svg)](#how-it-checks-itself)
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

On the audited sample, the research agent alone was right on **{{ACC_P1}}** of
fields. After the loops, **{{ACC_FINAL}}**. The
[case study](https://khatriadbhut.github.io/composio-app-research/) shows every
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
echo 'COMPOSIO_API_KEY=...' > .env
npm run all
```

Research, evidence check, Composio
catalog, verifier, score, then the page.

</td>
</tr>
</table>

Then open `docs/index.html`, or the
[live copy](https://khatriadbhut.github.io/composio-app-research/).

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

**Cost:** {{COST_LINE}}

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

**Node ≥ 22** (no dependencies), **Claude Code** logged in, and a
**Composio API key** for stage 3. That is the whole list.

| stage | needs |
| --- | --- |
| research, verifier | `claude` on your PATH, logged in |
| evidence check, score, page | nothing beyond Node |
| Composio catalog | `COMPOSIO_API_KEY` in `.env` |

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

{{LOOPS_SECTION}}

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

{{HUMAN_SECTION}}

## Findings

{{FINDINGS_SECTION}}

The full table, with the evidence for every cell, is in the
[case study](https://khatriadbhut.github.io/composio-app-research/#findings), and
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
