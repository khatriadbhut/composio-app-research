// Runs one headless Claude Code session and returns its structured output plus a
// trace of every tool call it made. Claude Code is the LLM; no API key is needed
// beyond the user's own Claude Code login.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const BIN = process.env.CLAUDE_BIN
  || ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find(existsSync)
  || "claude";

export function runClaude({ prompt, schema, model = "sonnet", tools = ["WebSearch", "WebFetch"],
  mcpConfig = null, timeoutMs = 15 * 60_000, effort = null }) {
  const args = [
    "-p", prompt,
    "--model", model,
    "--output-format", "stream-json", "--verbose",
    "--json-schema", JSON.stringify(schema),
    "--allowedTools", tools.join(","),
    // Sub-agents paraphrase what they read; the evidence quotes must come from pages directly.
    "--disallowedTools", "Agent,Task,Bash,Edit,Write,NotebookEdit",
    "--permission-mode", "dontAsk",
    // Skip user-level settings so personal hooks and plugins don't fire 100 times.
    "--setting-sources", "project",
    "--no-session-persistence",
    "--strict-mcp-config",
  ];
  if (mcpConfig) args.push("--mcp-config", JSON.stringify(mcpConfig));
  if (effort) args.push("--effort", effort);

  return new Promise((resolve) => {
    const child = spawn(BIN, args, { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let buf = "", stderr = "";
    const trace = [];
    let result = null;
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);

    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "assistant") {
          for (const c of ev.message?.content ?? []) {
            if (c.type === "tool_use" || c.type === "server_tool_use") {
              const i = c.input ?? {};
              trace.push({ tool: c.name, arg: i.query ?? i.url ?? i.prompt?.slice(0, 120) ?? JSON.stringify(i).slice(0, 160) });
            }
          }
        }
        if (ev.type === "result") result = ev;
      }
    });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: !!result?.structured_output && !result.is_error,
        output: result?.structured_output ?? null,
        trace,
        cost_usd: result?.total_cost_usd ?? null,
        duration_ms: result?.duration_ms ?? null,
        turns: result?.num_turns ?? null,
        model,
        error: result?.is_error ? (result.result ?? "error") : (result ? null : `exit ${code}: ${stderr.slice(-400)}`),
      });
    });
  });
}

// Minimal promise pool.
export async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export function fill(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}
