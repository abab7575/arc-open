#!/usr/bin/env node
// arc-check <host|url>...: free agent-commerce conformance check using ARC's public API.
// Zero dependencies. Node 18+.
import { appendFileSync } from "node:fs";
import { CHECK_IDS, DEFAULT_API, DEFAULT_REQUIRE, UsageError, VERSION, checkHost, exitCode, formatMarkdown, formatText, githubAnnotations, parseRequire, verdict } from "../lib/checks.mjs";

const HELP = `Usage: arc-check <host|url> [more hosts...] [options]

Free conformance check for agentic commerce, using ARC's public API. No account, no
model call, no purchase. The UCP profile is fetched live and validated against the
published UCP schema; the other checks come from ARC's HTTP agent check (cached up to 24h).

Options:
  --require <ids>   Checks that must pass (default: ${DEFAULT_REQUIRE.join(",")}).
                    One or more of: ${CHECK_IDS.join(", ")}; or all, or none (report only).
  --json            Print JSON (checks, verdict and the raw ARC results).
  --summary <file>  Also append a Markdown summary to <file> (e.g. $GITHUB_STEP_SUMMARY).
  --no-live-ucp     Use ARC's saved UCP check instead of a live schema validation.
  --api <origin>    API origin (default: ${DEFAULT_API}).
  --timeout <sec>   Request timeout in seconds (default: 30).
  -v, --version     Print the version.  -h, --help  Show this help.

Exit codes: 0 required checks pass, 1 a required check failed, 2 usage or network error, 3 rate limited.
Checked stores join ARC's free open directory (CC-BY-4.0). Docs: ${DEFAULT_API}/developers`;

function parse(argv) {
  const o = { hosts: [], require: undefined, json: false, summary: null, api: DEFAULT_API, timeout: 30, liveUcp: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined) throw new UsageError(`${a} needs a value`); return v; };
    if (a === "-h" || a === "--help") return { help: true };
    if (a === "-v" || a === "--version") return { version: true };
    else if (a === "--json") o.json = true;
    else if (a === "--no-live-ucp") o.liveUcp = false;
    else if (a === "--require") o.require = next();
    else if (a.startsWith("--require=")) o.require = a.slice(10);
    else if (a === "--summary") o.summary = next();
    else if (a === "--api") o.api = next().replace(/\/$/, "");
    else if (a === "--timeout") o.timeout = Number(next()) || 30;
    else if (a.startsWith("-")) throw new UsageError(`Unknown option ${a}`);
    else o.hosts.push(...a.split(",").map((s) => s.trim()).filter(Boolean));
  }
  if (!o.hosts.length) throw new UsageError("Give a store host or URL, e.g. arc-check allbirds.com");
  if (o.hosts.length > 25) throw new UsageError("Up to 25 hosts per run");
  o.require = parseRequire(o.require);
  return o;
}

async function main() {
  let o;
  try { o = parse(process.argv.slice(2)); } catch (e) { if (!(e instanceof UsageError)) throw e; console.error(`arc-check: ${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { console.log(HELP); return 0; }
  if (o.version) { console.log(VERSION); return 0; }
  const results = [];
  for (const host of o.hosts) {
    try { results.push(await checkHost(host, { api: o.api, require: o.require, timeoutMs: o.timeout * 1000, liveUcp: o.liveUcp })); }
    catch (e) { if (!(e instanceof UsageError)) throw e; console.error(`arc-check: ${e.message}`); return 2; }
  }
  const code = exitCode(results);
  if (o.json) {
    console.log(JSON.stringify({ version: VERSION, required: o.require, ok: code === 0, results: results.map((r) => (o.hosts.length === 1 ? r : { ...r, result: undefined })) }, null, 2));
  } else {
    for (const r of results) {
      if (r.error) console.error(`arc-check: ${r.host}: ${r.error}`);
      else console.log(formatText(r.host, r.result, r.checks, verdict(r.checks, o.require), o.require, r.ucp));
      if (results.length > 1) console.log("");
    }
  }
  const md = results.filter((r) => !r.error).map((r) => formatMarkdown(r.host, r.result, r.checks, verdict(r.checks, o.require), o.require)).join("\n");
  if (o.summary && md) { try { appendFileSync(o.summary, md); } catch (e) { console.error(`arc-check: could not write summary (${e.message})`); } }
  if (process.env.GITHUB_ACTIONS === "true") {
    for (const line of githubAnnotations(results, o.require)) console.log(line);
    if (process.env.GITHUB_OUTPUT) {
      try { appendFileSync(process.env.GITHUB_OUTPUT, `ok=${code === 0}\nexit-code=${code}\nreport<<ARC_EOF\n${JSON.stringify(results.map((r) => ({ host: r.host, ok: r.ok, failed: r.failed, error: r.error ?? null, checks: r.checks.map(({ id, status: s, detail }) => ({ id, status: s, detail })) })))}\nARC_EOF\n`); }
      catch (e) { console.error(`arc-check: could not write outputs (${e.message})`); }
    }
  }
  return code;
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(`arc-check: ${e && e.stack ? e.stack : e}`); process.exitCode = 2; });
