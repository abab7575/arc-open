import { describe, expect, it } from "vitest";
import { ARC100, ARC100_STORES, ARC100_EXTRA_SCAN_SLUGS, arc100ByScanSlug, arc100Csv } from "./arc100";
import { marketFromHost, platformOf, selectArc100, type Arc100Candidate } from "./select";
import { wilson } from "./stats";
import { SubmissionError, validateSubmission, submissionExample, assertNotExample, MIN_RESULTS } from "./submission";
import { readFileSync } from "node:fs";

describe("ARC-100 v1", () => {
  it("is 100 unique stores with stable ids, balanced across 11 categories", () => {
    expect(ARC100.count).toBe(100);
    expect(new Set(ARC100_STORES.map(s => s.host)).size).toBe(100);
    expect(ARC100_STORES[0].id).toBe("arc100-v1-001");
    const perCat = new Map<string, number>();
    for (const s of ARC100_STORES) perCat.set(s.category, (perCat.get(s.category) ?? 0) + 1);
    expect(perCat.size).toBe(11);
    expect(Math.max(...perCat.values()) - Math.min(...perCat.values())).toBeLessThanOrEqual(1);
    expect(ARC100_STORES.every(s => s.productUrl.startsWith("https://"))).toBe(true);
  });
  it("benchmark-only scan slugs are prefixed and come from the directory", () => {
    expect(ARC100_EXTRA_SCAN_SLUGS.length).toBeGreaterThan(0);
    for (const slug of ARC100_EXTRA_SCAN_SLUGS) { expect(slug.startsWith("arc100-")).toBe(true); expect(arc100ByScanSlug(slug)?.source).toBe("directory"); }
  });
  it("published CSV matches the frozen set", () => {
    expect(readFileSync("benchmark/arc-100/v1/arc-100.csv", "utf8")).toBe(arc100Csv(ARC100_STORES));
    const pub = JSON.parse(readFileSync("benchmark/arc-100/v1/arc-100.json", "utf8"));
    expect(pub.stores.map((s: { id: string; host: string }) => `${s.id} ${s.host}`)).toEqual(ARC100_STORES.map(s => `${s.id} ${s.host}`));
  });
  it("re-running the selection on the published inputs gives the same set", () => {
    const inputs = JSON.parse(readFileSync("benchmark/arc-100/v1/selection-inputs.json", "utf8")).candidates as Arc100Candidate[];
    expect(selectArc100(inputs).map(s => s.host)).toEqual(ARC100_STORES.map(s => s.host));
  });
  it("derives market from the domain only and platform with evidence", () => {
    expect(marketFromHost("crewclothing.co.uk")).toBe("GB");
    expect(marketFromHost("example.com")).toBe("INTL");
    expect(marketFromHost("shop.example.ie")).toBe("IE");
    expect(platformOf({ platformId: "woocommerce", storefrontMcp: false, ucpMcp: false })).toEqual({ platform: "woocommerce", evidence: "measured" });
    expect(platformOf({ platformId: null, storefrontMcp: true, ucpMcp: false })).toEqual({ platform: "shopify", evidence: "inferred" });
    expect(platformOf({ platformId: "unknown", storefrontMcp: false, ucpMcp: false })).toEqual({ platform: "not_detected", evidence: "measured" });
  });
});

describe("wilson interval", () => {
  it("matches a known interval", () => {
    expect(wilson(8, 10)).toEqual({ low: 49, high: 94.3 });
    expect(wilson(0, 0)).toBeNull();
  });
});

describe("submission", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const example = submissionExample(now);
  const body = (results: { id: string; outcome: string }[], extra: Record<string, unknown> = {}) => ({ ...example, run: { ...example.run }, results, ...extra });
  const ten = ARC100_STORES.slice(0, 12).map((s, i) => ({ id: s.id, outcome: i < 7 ? "added_to_cart" : i < 10 ? "blocked" : "error" }));
  it("accepts a valid run and scores it like ARC's own rows", () => {
    const v = validateSubmission(body(ten), now);
    expect([v.n, v.successes]).toEqual([10, 7]);
    expect(v.agent.name).toBe("Example Shopper");
  });
  it("rejects runs that did not stop before payment, unknown stores, duplicates and too few results", () => {
    expect(() => validateSubmission(body(ten, { run: { stopped_before_payment: false } }), now)).toThrow(/stopped_before_payment/);
    expect(() => validateSubmission(body([...ten, { id: "arc100-v1-999", outcome: "no_cart" }]), now)).toThrow(SubmissionError);
    expect(() => validateSubmission(body([...ten, ten[0]]), now)).toThrow(/twice/);
    expect(() => validateSubmission(body(ten.slice(0, 5)), now)).toThrow(/at least 10/);
    expect(() => validateSubmission(body(ten, { test_set: "ARC-100 v2" }), now)).toThrow(/test_set/);
  });
  it("the published example is itself a valid run, but is never stored", () => {
    const v = validateSubmission(submissionExample(now), now);
    expect(v.n).toBeGreaterThanOrEqual(MIN_RESULTS);
    expect([v.results.length, v.n]).toEqual([12, 11]);
    expect(() => assertNotExample(v)).toThrow(/example run/);
    expect(() => assertNotExample(validateSubmission(body(ten, { agent: { name: "My Agent", path: "browser" } }), now))).not.toThrow();
    // Relative timestamps: still valid when served months later.
    const later = new Date("2027-06-01T00:00:00Z");
    expect(validateSubmission(submissionExample(later), later).n).toBe(11);
  });
  it("strips markup from text fields", () => {
    const v = validateSubmission(body(ten, { agent: { name: "<b>Bot</b>", path: "browser", url: "https://x.example" } }), now);
    expect(v.agent.name).toBe("b Bot /b");
    expect(() => validateSubmission(body(ten, { agent: { name: "Bot", path: "browser", url: "javascript:alert(1)" } }), now)).toThrow(/https/);
  });
});
