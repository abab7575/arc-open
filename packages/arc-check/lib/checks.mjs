// arcreport-check core. Zero dependencies, Node 18+ (global fetch). Shared by the CLI and the GitHub Action.
// Talks only to ARC's free public API:
//   GET /api/agent-checkout?url=  (ARC's HTTP agent check, cached up to 24h per store)
//   GET /api/ucp/validate?url=    (live /.well-known/ucp fetch, validated against the published UCP schema)

export const VERSION = "0.1.0";
export const DEFAULT_API = "https://www.arcreport.ai";

/** Every check the kit knows. `id` is what --require takes. */
export const CHECKS = [
  { id: "ucp", title: "UCP profile at /.well-known/ucp validates against the published UCP schema and spec rules" },
  { id: "catalog", title: "An agent catalog tool found the product" },
  { id: "checkout", title: "ARC's HTTP agent client got a checkout link back (stopped before payment)" },
  { id: "mcp", title: "Storefront MCP server answers at /api/mcp" },
  { id: "webmcp", title: "WebMCP storefront adapter in the page" },
  { id: "robots", title: "robots.txt lets answer agents (ChatGPT-User, Claude-User, Perplexity-User ...) fetch" },
  { id: "product-data", title: "Product structured data is complete enough for agents (score 80+)" },
  { id: "policies", title: "Return and shipping policies are findable" },
];
export const CHECK_IDS = CHECKS.map((c) => c.id);
/** The conformance default: fail when the store's UCP or WebMCP setup breaks. */
export const DEFAULT_REQUIRE = ["ucp", "webmcp"];

export class UsageError extends Error {}

export function parseRequire(raw) {
  if (raw === undefined || raw === null) return [...DEFAULT_REQUIRE];
  const list = String(raw).split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length || (list.length === 1 && list[0] === "none")) return [];
  if (list.includes("all")) return [...CHECK_IDS];
  const unknown = list.filter((id) => !CHECK_IDS.includes(id));
  if (unknown.length) throw new UsageError(`Unknown check: ${unknown.join(", ")}. Use: ${CHECK_IDS.join(", ")}, all or none`);
  return [...new Set(list)];
}

export function normalizeHost(raw) {
  const text = String(raw ?? "").trim();
  if (!text) throw new UsageError("Give a store host or URL, e.g. arc-check allbirds.com");
  let url;
  try { url = new URL(text.includes("://") ? text : `https://${text}`); } catch { throw new UsageError(`"${text}" is not a valid host or URL`); }
  if (!url.hostname.includes(".")) throw new UsageError(`"${text}" is not a public host`);
  return url.hostname.toLowerCase();
}

/** "pass" | "fail" | "warn" | "not_measured" */
function status(ok, measured = true, soft = false) {
  if (!measured) return "not_measured";
  if (ok) return "pass";
  return soft ? "warn" : "fail";
}

function ucpFromValidator(u) {
  const c = u.counts ?? { errors: 0, warnings: 0 };
  if (u.valid) {
    return { status: "pass", detail: `valid against UCP ${u.schema?.release ?? ""} (live)${u.declaredVersion ? `, declares ${u.declaredVersion}` : ""}${c.warnings ? `, ${c.warnings} warning${c.warnings === 1 ? "" : "s"}` : ""}` };
  }
  const first = u.errors?.[0];
  return { status: "fail", detail: `${c.errors} error${c.errors === 1 ? "" : "s"} (live)${first ? `: ${first.path ? `${first.path}: ` : ""}${first.message}` : ""}` };
}

/**
 * Turns the JSON from GET /api/agent-checkout?url= (and, when given, GET /api/ucp/validate) into checks.
 * Unknown or missing fields become "not_measured", never "fail".
 */
export function evaluate(r, ucpReport = null) {
  const has = (k) => r && r[k] !== undefined && r[k] !== null;
  const completed = r && r.status === "completed";
  const robots = r && r.robots && r.robots.status === "measured" ? r.robots : null;
  const pd = r && r.productData && r.productData.status === "measured" ? r.productData : null;
  const pol = r && r.policies && r.policies.status === "measured" ? r.policies : null;
  const liveUcp = ucpReport && typeof ucpReport.valid === "boolean" ? ucpFromValidator(ucpReport) : null;
  const out = {
    ucp: liveUcp ?? { status: has("ucpProfile") ? status(r.ucpProfile === "valid", r.ucpProfile !== "blocked" && r.ucpProfile !== "error") : "not_measured", detail: has("ucpProfile") ? `profile: ${r.ucpProfile} (ARC check)` : null },
    catalog: { status: completed && has("catalogFound") ? status(r.catalogFound === true) : "not_measured", detail: r && r.catalogTool ? `tool: ${r.catalogTool}` : null },
    checkout: { status: completed && has("cartLink") ? status(r.cartLink === true, !(r.mcpBlocked === true && r.cartLink !== true)) : "not_measured", detail: r && r.summary ? r.summary : null },
    mcp: { status: completed && has("storefrontMcp") ? status(r.storefrontMcp === true, true, true) : "not_measured", detail: null },
    webmcp: { status: completed && has("webmcp") ? status(r.webmcp === true, true, true) : "not_measured", detail: completed && has("webmcp") ? (r.webmcp ? "Shopify WebMCP adapter found in homepage HTML" : "no WebMCP adapter in homepage HTML") : null },
    robots: { status: robots ? status(!(robots.summary && robots.summary.blocksAnswerAgents), true) : "not_measured", detail: robots && robots.summary && robots.summary.blocked ? `blocked: answer ${robots.summary.blocked.answer ?? 0}, search ${robots.summary.blocked.search ?? 0}, training ${robots.summary.blocked.training ?? 0}` : null },
    "product-data": { status: pd ? status((pd.score ?? 0) >= 80, true, true) : "not_measured", detail: pd ? `score ${pd.score}/100 (${pd.grade ?? "?"})` : null },
    policies: { status: pol ? status(!!(pol.returns && pol.returns.found) && !!(pol.shipping && pol.shipping.found), true, true) : "not_measured", detail: pol ? `returns ${pol.returns && pol.returns.found ? "found" : "missing"}, shipping ${pol.shipping && pol.shipping.found ? "found" : "missing"}` : null },
  };
  return CHECKS.map((c) => ({ ...c, ...out[c.id] }));
}

/** Required checks must pass. "not_measured" or "warn" on a required check fails too: the kit cannot vouch for it. */
export function verdict(checks, require = DEFAULT_REQUIRE) {
  const unknown = require.filter((id) => !CHECK_IDS.includes(id));
  if (unknown.length) throw new UsageError(`Unknown check: ${unknown.join(", ")}. Use: ${CHECK_IDS.join(", ")}`);
  const failed = checks.filter((c) => require.includes(c.id) && c.status !== "pass");
  return { ok: failed.length === 0, failed: failed.map((c) => c.id) };
}

async function getJson(fetchImpl, url, timeoutMs) {
  try {
    const res = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": `arcreport-check/${VERSION} (+https://www.arcreport.ai/developers)` }, signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: null, error: e && e.name === "TimeoutError" ? "timed out" : String(e && e.message ? e.message : e) };
  }
}

/**
 * Check one store. Never throws for API problems: returns { error, rateLimited } instead.
 * The UCP check is live when the validator answers; otherwise it falls back to ARC's saved check.
 */
export async function checkHost(rawHost, { api = DEFAULT_API, require = DEFAULT_REQUIRE, fetch: fetchImpl = globalThis.fetch, timeoutMs = 30_000, liveUcp = true } = {}) {
  const host = normalizeHost(rawHost);
  const origin = api.replace(/\/$/, "");
  const [checkout, ucp] = await Promise.all([
    getJson(fetchImpl, `${origin}/api/agent-checkout?url=${encodeURIComponent(host)}`, timeoutMs),
    liveUcp ? getJson(fetchImpl, `${origin}/api/ucp/validate?url=${encodeURIComponent(host)}`, timeoutMs) : null,
  ]);
  const ucpReport = ucp && ucp.status === 200 && ucp.body && typeof ucp.body.valid === "boolean" ? ucp.body : null;
  const result = checkout.status === 200 && checkout.body && typeof checkout.body === "object" ? checkout.body : null;
  if (!result && !ucpReport) {
    const rateLimited = checkout.status === 429 || (ucp && ucp.status === 429);
    const error = checkout.status === 0 ? `could not reach ${origin} (${checkout.error})` : rateLimited ? `rate limited by ARC. ${checkout.body?.error ?? ucp?.body?.error ?? "Try again later."}` : `ARC returned HTTP ${checkout.status}. ${checkout.body?.error ?? ""}`.trim();
    return { host, ok: false, error, rateLimited, checks: [], failed: [], result: null, ucp: null };
  }
  const checks = evaluate(result, ucpReport);
  const v = verdict(checks, require);
  return {
    host: result?.host ?? host,
    ok: v.ok,
    failed: v.failed,
    checks,
    result,
    ucp: ucpReport ? { valid: ucpReport.valid, release: ucpReport.schema?.release ?? null, declaredVersion: ucpReport.declaredVersion ?? null, counts: ucpReport.counts, errors: ucpReport.errors ?? [], warnings: ucpReport.warnings ?? [] } : null,
    validatorUrl: `${origin}/developers/ucp-validator?url=${encodeURIComponent(host)}`,
    ...(result ? {} : { note: "ARC's agent check was unavailable; only the live UCP check ran." }),
  };
}

/** 0 pass · 1 a required check failed · 2 usage or network error · 3 rate limited. */
export function exitCode(results) {
  if (results.some((r) => !r.error && !r.ok)) return 1;
  if (results.some((r) => r.error && !r.rateLimited)) return 2;
  if (results.some((r) => r.rateLimited)) return 3;
  return 0;
}

const MARK = { pass: "PASS", fail: "FAIL", warn: "WARN", not_measured: "N/A " };
export function formatText(host, r, checks, v, require, ucp = null) {
  const lines = [`ARC conformance check: ${host}`, ""];
  for (const c of checks) lines.push(`${MARK[c.status]}  ${c.id.padEnd(13)} ${c.title}${require.includes(c.id) ? "  [required]" : ""}${c.detail ? `\n      ${c.detail}` : ""}`);
  if (ucp && ucp.errors && ucp.errors.length > 1) for (const e of ucp.errors.slice(1, 8)) lines.push(`      ${e.path ? `${e.path}: ` : ""}${e.message}`);
  lines.push("", v.ok ? `Result: PASS (${require.length ? require.join(", ") : "report only"})` : `Result: FAIL (${v.failed.join(", ")})`);
  if (r && r.checkedAt) lines.push(`Checked: ${r.checkedAt}${r.cached ? " (ARC cache, up to 24h old)" : ""}${ucp ? "; UCP fetched live just now" : ""}`);
  if (r && r.fix) lines.push(`Fix: ${r.fix}`);
  if (ucp && !ucp.valid) lines.push(`UCP report: ${DEFAULT_API}/developers/ucp-validator?url=${encodeURIComponent(host)}`);
  if (r && r.resultUrl) lines.push(`Details: ${r.resultUrl}`);
  lines.push("", "Free HTTP check by ARC (arcreport.ai). No model call, no purchase. Not a certification.");
  return lines.join("\n");
}

const ICON = { pass: "✅", fail: "❌", warn: "⚠️", not_measured: "➖" };
export function formatMarkdown(host, r, checks, v, require) {
  const rows = checks.map((c) => `| ${ICON[c.status]} ${c.status.replace("_", " ")} | \`${c.id}\`${require.includes(c.id) ? " (required)" : ""} | ${c.title} | ${(c.detail ?? "").replace(/\|/g, "\\|")} |`);
  return [`### ARC conformance: \`${host}\` ${v.ok ? "✅ pass" : "❌ fail"}`, "", "| Status | Check | What it means | Detail |", "|---|---|---|---|", ...rows, "",
    r && r.checkedAt ? `Checked ${r.checkedAt}${r.cached ? " (ARC cache, up to 24h old)" : ""}. UCP is validated live when the validator answers.` : "", r && r.resultUrl ? `Details: ${r.resultUrl}` : "",
    "", "_Free HTTP check by [ARC](https://www.arcreport.ai/developers). No model call, no purchase. Not a certification._", ""].join("\n");
}

/** GitHub Actions workflow commands: an error per failed required check, a warning per API problem. */
export function githubAnnotations(results, require) {
  const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const out = [];
  for (const r of results) {
    if (r.error) { out.push(`::warning title=${esc(`ARC check: ${r.host}`)}::${esc(r.error)}`); continue; }
    for (const c of r.checks) {
      if (!require.includes(c.id) || c.status === "pass") continue;
      out.push(`::error title=${esc(`ARC ${c.id}: ${r.host}`)}::${esc(`${c.status.replace("_", " ")}: ${c.title}${c.detail ? `. ${c.detail}` : ""}`)}`);
    }
  }
  return out;
}
