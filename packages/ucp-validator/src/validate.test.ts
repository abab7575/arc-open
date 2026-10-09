import { describe, expect, it } from "vitest";
import allbirds from "./fixture-allbirds.json";
import { authorityBinding, readablePath, UCP_BROKEN_EXAMPLE, UCP_EXAMPLE_PROFILE, validateUcpProfile, type HttpFacts } from "./validate";

const okHttp: HttpFacts = {
  requestedUrl: "https://shop.example.com/.well-known/ucp",
  finalUrl: "https://shop.example.com/.well-known/ucp",
  status: 200,
  redirects: [],
  contentType: "application/json",
  cacheControl: "public, max-age=300",
  etag: true,
  lastModified: false,
  bytes: 900,
};

describe("validateUcpProfile", () => {
  it("passes the minimal example and a real Shopify profile", () => {
    const example = validateUcpProfile(UCP_EXAMPLE_PROFILE);
    expect(example.errors).toEqual([]);
    expect(example.valid).toBe(true);
    const real = validateUcpProfile(JSON.stringify(allbirds));
    expect(real.errors).toEqual([]);
    expect(real.summary?.services).toContain("dev.ucp.shopping");
  });

  it("explains the broken example without union noise", () => {
    const r = validateUcpProfile(UCP_BROKEN_EXAMPLE);
    expect(r.valid).toBe(false);
    const rules = r.errors.map((e) => `${e.rule} ${e.path}`);
    expect(rules).toContain("schema.pattern ucp.version");
    expect(rules).toContain("schema.required ucp");
    expect(rules).toContain(`spec.authority-binding ucp.capabilities["dev.ucp.shopping.checkout"][0].schema`);
    expect(rules).toContain(`spec.endpoint-https ucp.services["dev.ucp.shopping"][0].endpoint`);
    expect(r.warnings.map((w) => w.rule)).toContain("spec.orphaned-extension");
    expect(r.errors.some((e) => e.message.includes("Must be \"rest\""))).toBe(false);
    for (const e of r.errors) expect(e.message.length).toBeGreaterThan(5);
  });

  it("reports a missing endpoint for an mcp binding", () => {
    const doc = structuredClone(UCP_EXAMPLE_PROFILE) as { ucp: { services: Record<string, Record<string, unknown>[]> } };
    delete doc.ucp.services["dev.ucp.shopping"][0].endpoint;
    const r = validateUcpProfile(doc);
    expect(r.errors.map((e) => e.message)).toContain('Missing required field "endpoint".');
  });

  it("reports an unknown transport once", () => {
    const doc = structuredClone(UCP_EXAMPLE_PROFILE) as { ucp: { services: Record<string, Record<string, unknown>[]> } };
    doc.ucp.services["dev.ucp.shopping"][0].transport = "grpc";
    const r = validateUcpProfile(doc);
    expect(r.errors.filter((e) => e.path.endsWith(".transport") || e.path.endsWith("transport")).length).toBeGreaterThanOrEqual(1);
    expect(r.errors.some((e) => e.message.includes('"grpc"'))).toBe(true);
  });

  it("flags bad registry keys and private keys", () => {
    const r = validateUcpProfile({
      ...UCP_EXAMPLE_PROFILE,
      ucp: { ...UCP_EXAMPLE_PROFILE.ucp, capabilities: { Checkout: [{ version: "2026-08-25", schema: "https://example.com/x.json" }] } },
      keys: [{ kid: "k1", kty: "OKP", crv: "Ed25519", x: "abc", d: "secret" }],
    });
    expect(r.errors.some((e) => e.message.includes('"Checkout" is not a reverse-domain name'))).toBe(true);
    expect(r.errors.some((e) => e.message.includes("Private key material"))).toBe(true);
  });

  it("handles bad JSON, HTML and non-objects", () => {
    expect(validateUcpProfile('{"ucp": ').errors[0].rule).toBe("json.parse");
    expect(validateUcpProfile("<!doctype html><html>").errors[0].rule).toBe("json.html");
    expect(validateUcpProfile("[]").errors[0].rule).toBe("schema.type");
    expect(validateUcpProfile("").errors[0].rule).toBe("json.empty");
  });

  it("notes an older declared release", () => {
    const doc = structuredClone(UCP_EXAMPLE_PROFILE) as { ucp: Record<string, unknown> };
    doc.ucp.version = "2026-04-08";
    expect(validateUcpProfile(doc).info.map((f) => f.rule)).toContain("arc.release");
  });
});

describe("http findings", () => {
  it("accepts good hosting", () => {
    const r = validateUcpProfile(UCP_EXAMPLE_PROFILE, okHttp);
    expect(r.valid).toBe(true);
    expect(r.warnings.filter((w) => w.rule.startsWith("spec.") || w.rule.startsWith("http."))).toEqual([]);
  });

  it("flags redirects, cache headers and 404", () => {
    const r = validateUcpProfile(UCP_EXAMPLE_PROFILE, {
      ...okHttp,
      redirects: [{ from: "https://example.com/.well-known/ucp", to: "https://www.example.com/.well-known/ucp", status: 301 }],
      cacheControl: "private, no-store",
      etag: false,
    });
    expect(r.warnings.map((w) => w.rule)).toContain("spec.no-redirects");
    expect(r.errors.filter((e) => e.rule === "spec.cache-control").length).toBe(3);
    expect(r.warnings.map((w) => w.rule)).toContain("spec.validator-header");
    const missing = validateUcpProfile("", { ...okHttp, status: 404 });
    expect(missing.errors[0].message).toContain("404");
    const cross = validateUcpProfile(UCP_EXAMPLE_PROFILE, { ...okHttp, redirects: [{ from: "https://a.com/.well-known/ucp", to: "https://b.com/x", status: 302 }] });
    expect(cross.errors.map((e) => e.rule)).toContain("spec.no-redirects");
  });
});

describe("helpers", () => {
  it("authority binding follows the spec table", () => {
    expect(authorityBinding("dev.ucp.shopping.checkout", "https://ucp.dev/x.json").ok).toBe(true);
    expect(authorityBinding("dev.ucp.shopping.checkout", "https://shopping.ucp.dev/x.json").ok).toBe(true);
    expect(authorityBinding("com.example.pay", "https://pay.example.com/x.json").ok).toBe(true);
    expect(authorityBinding("com.example.pay", "https://example.com/x.json").ok).toBe(true);
    expect(authorityBinding("com.example.pay", "https://evil.example/x.json").ok).toBe(false);
    expect(authorityBinding("com.examplecorp.pay", "https://example.com/x.json").ok).toBe(false);
    expect(authorityBinding("com.example.pay", "https://cdn.example.com/x.json").ok).toBe(false);
    expect(authorityBinding("dev.ucp.shopping.checkout", "https://ucp.dev@evil.example/x.json").ok).toBe(false);
    expect(authorityBinding("dev.ucp.x", "http://ucp.dev/x.json").ok).toBe(false);
  });

  it("renders readable paths", () => {
    expect(readablePath("/ucp/services/dev.ucp.shopping/0/endpoint")).toBe('ucp.services["dev.ucp.shopping"][0].endpoint');
    expect(readablePath("")).toBe("");
  });
});
