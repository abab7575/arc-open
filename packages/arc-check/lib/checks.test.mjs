import { describe, expect, it } from "vitest";
import { CHECK_IDS, DEFAULT_REQUIRE, checkHost, evaluate, exitCode, formatMarkdown, formatText, githubAnnotations, normalizeHost, parseRequire, verdict } from "./checks.mjs";

const ready = { host: "allbirds.com", status: "completed", ucpProfile: "valid", catalogTool: "search_catalog", catalogFound: true, cartLink: true, storefrontMcp: true, webmcp: true, mcpBlocked: false,
  robots: { status: "measured", summary: { blocked: { answer: 0, search: 0, training: 2 }, blocksAnswerAgents: false } },
  productData: { status: "measured", score: 75, grade: "partial" }, policies: { status: "measured", returns: { found: true }, shipping: { found: true } }, checkedAt: "2026-10-07T08:41:40.000Z", cached: true, resultUrl: "https://www.arcreport.ai/agent-checkout/allbirds.com" };
const VALID = { valid: true, schema: { release: "2026-08-25" }, declaredVersion: "2026-08-25", counts: { errors: 0, warnings: 1, info: 0 }, errors: [], warnings: [{ level: "warning", path: "", message: "w" }] };
const INVALID = { valid: false, schema: { release: "2026-08-25" }, declaredVersion: null, counts: { errors: 2, warnings: 0, info: 0 }, errors: [{ level: "error", path: "ucp", message: 'Missing required field "services".' }, { level: "error", path: "ucp.version", message: "bad" }], warnings: [] };
const by = (checks) => Object.fromEntries(checks.map((c) => [c.id, c.status]));

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const hit = routes[new URL(url).pathname];
    if (!hit) return new Response("{}", { status: 404 });
    if (hit === "network") throw new Error("ECONNRESET");
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
  };
  fn.calls = calls;
  return fn;
}

describe("arc-check evaluate", () => {
  it("passes a store where agents reach checkout and warns on soft signals", () => {
    const s = by(evaluate(ready));
    expect(s).toMatchObject({ ucp: "pass", catalog: "pass", checkout: "pass", mcp: "pass", webmcp: "pass", robots: "pass", "product-data": "warn", policies: "pass" });
    expect(verdict(evaluate(ready), ["ucp", "checkout"]).ok).toBe(true);
  });
  it("fails a required check and treats missing evidence as not measured", () => {
    const r = { host: "x.com", status: "completed", ucpProfile: "absent", catalogFound: false, cartLink: false, storefrontMcp: false, webmcp: false, robots: null, productData: null, policies: null };
    const s = by(evaluate(r));
    expect(s).toMatchObject({ ucp: "fail", checkout: "fail", mcp: "warn", webmcp: "warn", robots: "not_measured", "product-data": "not_measured" });
    expect(verdict(evaluate(r)).failed).toEqual(["ucp", "webmcp"]);
    expect(verdict(evaluate(r), ["robots"]).ok).toBe(false);
    expect(verdict(evaluate(r), []).ok).toBe(true);
  });
  it("does not call a blocked check a fail", () => {
    expect(by(evaluate({ status: "completed", ucpProfile: "blocked", cartLink: false, mcpBlocked: true })).checkout).toBe("not_measured");
    expect(by(evaluate({ status: "completed", ucpProfile: "blocked" })).ucp).toBe("not_measured");
  });
  it("prefers the live UCP validation over the saved check", () => {
    const live = evaluate({ ...ready, ucpProfile: "valid" }, INVALID).find((c) => c.id === "ucp");
    expect(live.status).toBe("fail");
    expect(live.detail).toMatch(/2 errors \(live\): ucp: Missing required field/);
    expect(evaluate({ ...ready, ucpProfile: "absent" }, VALID).find((c) => c.id === "ucp").status).toBe("pass");
  });
  it("parses --require, hosts and rejects unknown ids", () => {
    expect(parseRequire(undefined)).toEqual(DEFAULT_REQUIRE);
    expect(DEFAULT_REQUIRE).toEqual(["ucp", "webmcp"]);
    expect(parseRequire("none")).toEqual([]);
    expect(parseRequire("all")).toEqual(CHECK_IDS);
    expect(parseRequire("ucp, checkout")).toEqual(["ucp", "checkout"]);
    expect(() => parseRequire("nope")).toThrow(/Unknown check/);
    expect(() => verdict([], ["nope"])).toThrow(/Unknown check/);
    expect(normalizeHost("https://WWW.Example.com/p/x")).toBe("www.example.com");
    expect(() => normalizeHost("localhost")).toThrow();
  });
  it("formats text, markdown and annotations", () => {
    const checks = evaluate(ready, VALID), v = verdict(checks, ["checkout"]);
    expect(formatText("allbirds.com", ready, checks, v, ["checkout"], null)).toContain("Result: PASS (checkout)");
    expect(formatMarkdown("allbirds.com", ready, checks, v, ["checkout"])).toContain("| ✅ pass | `checkout` (required)");
    const bad = evaluate({ ...ready, webmcp: false }, INVALID);
    const ann = githubAnnotations([{ host: "a.com", checks: bad }], ["ucp", "webmcp"]);
    expect(ann[0]).toMatch(/^::error title=ARC ucp: a\.com::fail/);
    expect(ann[1]).toMatch(/^::error title=ARC webmcp: a\.com::warn/);
  });
});

describe("arc-check checkHost", () => {
  it("calls both APIs and passes a good store", async () => {
    const fetch = fakeFetch({ "/api/agent-checkout": { body: ready }, "/api/ucp/validate": { body: VALID } });
    const r = await checkHost("allbirds.com", { fetch });
    expect(r.ok).toBe(true);
    expect(fetch.calls.length).toBe(2);
    expect(exitCode([r])).toBe(0);
  });
  it("fails on a broken live profile", async () => {
    const fetch = fakeFetch({ "/api/agent-checkout": { body: ready }, "/api/ucp/validate": { body: INVALID } });
    const r = await checkHost("allbirds.com", { fetch });
    expect(r.failed).toEqual(["ucp"]);
    expect(exitCode([r])).toBe(1);
  });
  it("falls back to the saved UCP check when the validator is down", async () => {
    const fetch = fakeFetch({ "/api/agent-checkout": { body: ready }, "/api/ucp/validate": "network" });
    const r = await checkHost("allbirds.com", { fetch });
    expect(r.ok).toBe(true);
    expect(r.checks.find((c) => c.id === "ucp").detail).toContain("ARC check");
  });
  it("reports network errors (2) and rate limits (3)", async () => {
    const down = await checkHost("a.com", { fetch: fakeFetch({ "/api/agent-checkout": "network", "/api/ucp/validate": "network" }) });
    expect(down.error).toMatch(/could not reach/);
    expect(exitCode([down])).toBe(2);
    const limited = await checkHost("a.com", { fetch: fakeFetch({ "/api/agent-checkout": { status: 429, body: { error: "limit" } }, "/api/ucp/validate": { status: 429, body: { error: "limit" } } }) });
    expect(limited.rateLimited).toBe(true);
    expect(exitCode([limited])).toBe(3);
  });
});
