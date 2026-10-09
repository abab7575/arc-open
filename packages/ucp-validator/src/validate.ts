// Free UCP business-profile validator. Pure: runs in the browser and on the server.
// 1) JSON Schema check against the published UCP schema (profile.json#/$defs/business_schema).
// 2) Spec rules the schema cannot express (authority binding, https, orphaned extensions),
//    each citing the UCP specification section it comes from.
// 3) ARC interop hints, labelled as ARC guidance, not UCP requirements.
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { UCP_BUSINESS_SCHEMA_REF, UCP_RELEASE, UCP_SCHEMAS, UCP_SPEC_URL } from "./schemas";

export type Level = "error" | "warning" | "info";
export type Source = "ucp-schema" | "ucp-spec" | "arc";
export type Finding = {
  level: Level;
  /** Stable rule id, e.g. schema.required, spec.authority-binding. */
  rule: string;
  /** Readable location such as ucp.services["dev.ucp.shopping"][0].endpoint, or "" for the document. */
  path: string;
  message: string;
  source: Source;
  /** Where the rule is written down. */
  ref?: string;
};

export type HttpFacts = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  redirects: { from: string; to: string; status: number }[];
  contentType: string | null;
  cacheControl: string | null;
  etag: boolean;
  lastModified: boolean;
  bytes: number;
  truncated?: boolean;
};

export type ValidationReport = {
  valid: boolean;
  schema: { release: string; ref: string; spec: string };
  declaredVersion: string | null;
  counts: { errors: number; warnings: number; info: number };
  errors: Finding[];
  warnings: Finding[];
  info: Finding[];
  summary: {
    services: string[];
    transports: string[];
    capabilities: string[];
    paymentHandlers: string[];
    keys: number;
  } | null;
  http?: HttpFacts;
};

const SPEC = {
  authority: `${UCP_SPEC_URL}#authority-binding`,
  naming: `${UCP_SPEC_URL}#naming-convention`,
  endpoint: `${UCP_SPEC_URL}#endpoint-resolution`,
  hosting: `${UCP_SPEC_URL}#hosting`,
  fetching: `${UCP_SPEC_URL}#fetching`,
  intersection: `${UCP_SPEC_URL}#intersection-algorithm`,
  business: `${UCP_SPEC_URL}#business-profile`,
  versioned: `${UCP_SPEC_URL}#versioned-profiles`,
  governance: `${UCP_SPEC_URL}#governance-model`,
};

export const MAX_PROFILE_BYTES = 262_144;

let compiled: ValidateFunction | null = null;

function validator(): ValidateFunction {
  if (compiled) return compiled;
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv);
  for (const schema of UCP_SCHEMAS) ajv.addSchema(schema);
  const fn = ajv.getSchema(UCP_BUSINESS_SCHEMA_REF);
  if (!fn) throw new Error("UCP business schema failed to load");
  compiled = fn;
  return fn;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;
const REVERSE_DOMAIN = /^[a-z](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9_-]*[a-z0-9_])?)+$/;

/** JSON pointer → ucp.services["dev.ucp.shopping"][0].endpoint */
export function readablePath(pointer: string): string {
  if (!pointer) return "";
  const parts = pointer.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let out = "";
  for (const part of parts) {
    if (/^\d+$/.test(part)) out += `[${part}]`;
    else if (IDENT.test(part)) out += out ? `.${part}` : part;
    else out += `[${JSON.stringify(part)}]`;
  }
  return out;
}

function join(path: string, key: string | number): string {
  if (typeof key === "number") return `${path}[${key}]`;
  if (IDENT.test(key)) return path ? `${path}.${key}` : key;
  return `${path}[${JSON.stringify(key)}]`;
}

function show(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function valueAt(doc: unknown, pointer: string): unknown {
  let node: unknown = doc;
  for (const raw of pointer.split("/").slice(1)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node && typeof node === "object") node = (node as Record<string, unknown>)[key];
    else return undefined;
  }
  return node;
}

function schemaMessage(e: ErrorObject, doc: unknown): string {
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case "required":
      return `Missing required field "${p.missingProperty}".`;
    case "type":
      return `Must be ${p.type === "object" ? "an object" : p.type === "array" ? "an array" : `a ${p.type}`}, got ${show(valueAt(doc, e.instancePath))}.`;
    case "pattern": {
      const value = valueAt(doc, e.instancePath);
      if (String(p.pattern).includes("\\d{4}-\\d{2}-\\d{2}")) return `${show(value)} is not a YYYY-MM-DD version.`;
      return `${show(value)} does not match ${p.pattern}.`;
    }
    case "enum":
      return `Must be one of ${(p.allowedValues as unknown[]).map((v) => show(v)).join(", ")}; got ${show(valueAt(doc, e.instancePath))}.`;
    case "const":
      return `Must be ${show(p.allowedValue)}.`;
    case "format":
      return `${show(valueAt(doc, e.instancePath))} is not a valid ${p.format === "uri" ? "absolute URI" : p.format}.`;
    case "minItems":
      return `Needs at least ${p.limit} item(s).`;
    case "not":
      return "Contains a field that is not allowed here.";
    default:
      return e.message ? `${e.message[0].toUpperCase()}${e.message.slice(1)}.` : `Fails ${e.keyword}.`;
  }
}

/** Turn raw Ajv output into one clear finding per real problem. */
export function schemaFindings(errors: ErrorObject[], doc: unknown): Finding[] {
  // Unions (anyOf/oneOf): keep only the branch the document was aiming at.
  const unions = errors.filter((e) => e.keyword === "anyOf" || e.keyword === "oneOf");
  const dropped = new Set<ErrorObject>();
  const added: Finding[] = [];
  for (const u of unions) {
    const prefix = `${u.schemaPath}/`;
    const branches = new Map<number, ErrorObject[]>();
    for (const e of errors) {
      if (e === u || !e.schemaPath.startsWith(prefix) || !e.instancePath.startsWith(u.instancePath)) continue;
      const idx = Number(e.schemaPath.slice(prefix.length).split("/")[0]);
      if (!Number.isFinite(idx)) continue;
      branches.set(idx, [...(branches.get(idx) ?? []), e]);
      dropped.add(e);
    }
    dropped.add(u);
    const matching = [...branches.values()].filter((list) => !list.some((e) => e.keyword === "const" || e.keyword === "enum"));
    if (matching.length) {
      const best = matching.sort((a, b) => a.length - b.length)[0];
      for (const e of best) dropped.delete(e);
      continue;
    }
    const allowed = [...branches.values()].flat().filter((e) => e.keyword === "const").map((e) => (e.params as { allowedValue: unknown }).allowedValue);
    const at = allowed.length ? errors.find((e) => e.keyword === "const" && e.schemaPath.startsWith(prefix)) : undefined;
    if (at && allowed.length) {
      added.push({
        level: "error", rule: "schema.anyOf", source: "ucp-schema", path: readablePath(at.instancePath),
        message: `Must be one of ${[...new Set(allowed.map((v) => show(v)))].join(", ")}; got ${show(valueAt(doc, at.instancePath))}.`,
      });
    } else if (u.keyword === "oneOf" && branches.size === 0) {
      added.push({ level: "error", rule: "schema.oneOf", source: "ucp-schema", path: readablePath(u.instancePath), message: "Matches more than one allowed shape." });
    } else {
      added.push({ level: "error", rule: `schema.${u.keyword}`, source: "ucp-schema", path: readablePath(u.instancePath), message: "Does not match any allowed shape for this field." });
    }
  }
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const e of errors) {
    if (dropped.has(e) || e.keyword === "if" || e.keyword === "propertyNames" || e.keyword === "false schema") continue;
    let path = readablePath(e.instancePath);
    let message = schemaMessage(e, doc);
    const name = (e as { propertyName?: string }).propertyName ?? (e.params as { propertyName?: string }).propertyName;
    if (name !== undefined) {
      path = path ? `${path} key` : "key";
      message = `"${name}" is not a reverse-domain name (for example dev.ucp.shopping or com.example.loyalty).`;
    }
    if (e.keyword === "not" && /keys/.test(e.instancePath)) message = "Private key material (d, p, q, dp, dq, qi, oth or k) must never be published in a profile. Rotate this key now.";
    const key = `${path}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ level: "error", rule: `schema.${e.keyword}`, source: "ucp-schema", path, message });
  }
  for (const f of added) {
    const key = `${f.path}|${f.message}`;
    if (!seen.has(key)) { seen.add(key); out.push(f); }
  }
  return out;
}

type Entity = { kind: "services" | "capabilities" | "payment_handlers"; name: string; index: number; path: string; value: Record<string, unknown> };

function entities(ucp: Record<string, unknown>): Entity[] {
  const out: Entity[] = [];
  for (const kind of ["services", "capabilities", "payment_handlers"] as const) {
    const registry = ucp[kind];
    if (!registry || typeof registry !== "object" || Array.isArray(registry)) continue;
    for (const [name, list] of Object.entries(registry as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      list.forEach((value, index) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          out.push({ kind, name, index, path: join(join(join("ucp", kind), name), index), value: value as Record<string, unknown> });
        }
      });
    }
  }
  return out;
}

function parseHttps(raw: unknown): { ok: true; url: URL } | { ok: false; why: string } {
  if (typeof raw !== "string") return { ok: false, why: "is not a string" };
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, why: "is not a valid URL" }; }
  if (url.protocol !== "https:") return { ok: false, why: "must use https" };
  if (url.username || url.password) return { ok: false, why: "must not contain user:pass@" };
  return { ok: true, url };
}

/** UCP authority binding: reversed schema host must equal the name or be a label-aligned prefix of it. */
export function authorityBinding(name: string, schemaUrl: string): { ok: boolean; why?: string } {
  const parsed = parseHttps(schemaUrl);
  if (!parsed.ok) return { ok: false, why: `schema URL ${parsed.why}` };
  const host = parsed.url.hostname.toLowerCase().replace(/\.$/, "");
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith("[")) return { ok: false, why: "schema host is an IP address" };
  const labels = host.split(".");
  if (labels.length < 2) return { ok: false, why: "schema host must have at least two labels" };
  const prefix = labels.reverse().join(".");
  if (name === prefix || name.startsWith(`${prefix}.`)) return { ok: true };
  return { ok: false, why: `schema host ${host} reverses to ${prefix}, which does not own ${name}` };
}

function specFindings(doc: Record<string, unknown>): Finding[] {
  const out: Finding[] = [];
  const ucp = doc.ucp;
  if (!ucp || typeof ucp !== "object" || Array.isArray(ucp)) return out;
  const u = ucp as Record<string, unknown>;
  const list = entities(u);
  const capabilityNames = new Set(list.filter((e) => e.kind === "capabilities").map((e) => e.name));
  for (const e of list) {
    const { value, path, name } = e;
    if (typeof value.schema === "string" && REVERSE_DOMAIN.test(name)) {
      const binding = authorityBinding(name, value.schema);
      if (!binding.ok) {
        out.push({
          level: "error", rule: "spec.authority-binding", source: "ucp-spec", path: join(path, "schema"), ref: SPEC.authority,
          message: `${binding.why}. Platforms MUST NOT fetch this schema and MUST treat "${name}" as not present.${name.startsWith("dev.ucp.") ? " dev.ucp.* schemas live on ucp.dev." : ""}`,
        });
      }
    }
    if (value.spec !== undefined) {
      const spec = parseHttps(value.spec);
      if (!spec.ok) out.push({ level: "error", rule: "spec.spec-https", source: "ucp-spec", path: join(path, "spec"), ref: SPEC.authority, message: `spec URL ${spec.why}. A spec URL MUST be a valid https URL.` });
    }
    if (value.endpoint !== undefined) {
      const endpoint = parseHttps(value.endpoint);
      if (!endpoint.ok) out.push({ level: "error", rule: "spec.endpoint-https", source: "ucp-spec", path: join(path, "endpoint"), ref: SPEC.endpoint, message: `endpoint ${endpoint.why}. endpoint MUST be a valid https URL.` });
      else if (endpoint.url.pathname.length > 1 && endpoint.url.pathname.endsWith("/")) {
        out.push({ level: "warning", rule: "spec.endpoint-trailing-slash", source: "ucp-spec", path: join(path, "endpoint"), ref: SPEC.endpoint, message: "endpoint SHOULD NOT have a trailing slash; operation paths are appended directly." });
      }
    }
    if (e.kind === "capabilities" && value.extends !== undefined) {
      const parents = (Array.isArray(value.extends) ? value.extends : [value.extends]).filter((p): p is string => typeof p === "string");
      if (parents.length && !parents.some((p) => capabilityNames.has(p))) {
        out.push({
          level: "warning", rule: "spec.orphaned-extension", source: "ucp-spec", path: join(path, "extends"), ref: SPEC.intersection,
          message: `Extends ${parents.join(" or ")}, which this profile does not declare. Negotiation prunes orphaned extensions, so "${name}" will never be active.`,
        });
      }
    }
  }
  const version = typeof u.version === "string" ? u.version : null;
  const supported = u.supported_versions;
  if (version && supported && typeof supported === "object" && !Array.isArray(supported)) {
    for (const [v, uri] of Object.entries(supported as Record<string, unknown>)) {
      const at = join(join("ucp", "supported_versions"), v);
      if (v === version) out.push({ level: "warning", rule: "spec.supported-versions", source: "ucp-spec", path: at, ref: SPEC.versioned, message: `Lists the current version ${v}. supported_versions is for previous versions; the current one is ucp.version.` });
      const parsed = parseHttps(uri);
      if (typeof uri === "string" && !parsed.ok) out.push({ level: "error", rule: "spec.supported-versions-https", source: "ucp-spec", path: at, ref: SPEC.hosting, message: `Profile URI ${parsed.why}. Published artifacts MUST be served over HTTPS.` });
    }
  }
  return out;
}

function arcFindings(doc: Record<string, unknown>): Finding[] {
  const out: Finding[] = [];
  const u = doc.ucp && typeof doc.ucp === "object" && !Array.isArray(doc.ucp) ? (doc.ucp as Record<string, unknown>) : null;
  if (!u) return out;
  const version = typeof u.version === "string" ? u.version : null;
  if (version && /^\d{4}-\d{2}-\d{2}$/.test(version) && version !== UCP_RELEASE) {
    out.push({
      level: version < UCP_RELEASE ? "info" : "warning", rule: "arc.release", source: "arc", path: "ucp.version", ref: "https://ucp.dev/versioning/",
      message: version < UCP_RELEASE
        ? `Declares ${version}. Checked against the current published release ${UCP_RELEASE}; older releases can differ slightly. Agents on ${UCP_RELEASE} negotiate with this profile only through supported_versions or a shared version.`
        : `Declares ${version}, newer than the latest release ARC knows (${UCP_RELEASE}). Results may lag the spec.`,
    });
  }
  const list = entities(u);
  const shopping = list.filter((e) => e.kind === "services" && e.name === "dev.ucp.shopping");
  if (!shopping.length) {
    out.push({ level: "warning", rule: "arc.shopping-service", source: "arc", path: "ucp.services", message: "No dev.ucp.shopping service. Shopping agents look for it to find catalog, cart and checkout, and ARC's directory counts a profile as valid UCP only when it is present." });
  } else if (!shopping.some((e) => e.value.transport === "mcp" || e.value.transport === "rest")) {
    out.push({ level: "info", rule: "arc.shopping-transport", source: "arc", path: join(join("ucp", "services"), "dev.ucp.shopping"), message: "dev.ucp.shopping has no mcp or rest binding. Agents that call tools over HTTP need one of those; embedded alone is for in-page checkout." });
  }
  const caps = new Set(list.filter((e) => e.kind === "capabilities").map((e) => e.name));
  if (!caps.has("dev.ucp.shopping.checkout") && !caps.has("dev.ucp.shopping.cart")) {
    out.push({ level: "info", rule: "arc.no-checkout", source: "arc", path: "ucp.capabilities", message: "Declares neither dev.ucp.shopping.checkout nor dev.ucp.shopping.cart, so agents can browse but cannot build a cart or check out over UCP." });
  }
  const handlers = u.payment_handlers;
  if (handlers && typeof handlers === "object" && !Array.isArray(handlers) && Object.keys(handlers).length === 0 && caps.has("dev.ucp.shopping.checkout")) {
    out.push({ level: "info", rule: "arc.no-payment-handlers", source: "arc", path: "ucp.payment_handlers", message: "Checkout is declared but payment_handlers is empty, so agents must hand off to your checkout page to pay." });
  }
  return out;
}

export function summarize(doc: unknown): ValidationReport["summary"] {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const u = (doc as Record<string, unknown>).ucp;
  if (!u || typeof u !== "object" || Array.isArray(u)) return null;
  const list = entities(u as Record<string, unknown>);
  const names = (kind: Entity["kind"]) => [...new Set(list.filter((e) => e.kind === kind).map((e) => e.name))];
  const keys = (doc as Record<string, unknown>).keys;
  return {
    services: names("services"),
    transports: [...new Set(list.filter((e) => e.kind === "services").map((e) => String(e.value.transport ?? "?")))],
    capabilities: names("capabilities"),
    paymentHandlers: names("payment_handlers"),
    keys: Array.isArray(keys) ? keys.length : 0,
  };
}

/** Findings about how the profile is served (URL mode only). */
export function httpFindings(http: HttpFacts): Finding[] {
  const out: Finding[] = [];
  for (const hop of http.redirects) {
    const sameSite = (() => {
      try {
        const a = new URL(hop.from), b = new URL(hop.to);
        const bare = (h: string) => h.replace(/^www\./, "");
        return bare(a.hostname) === bare(b.hostname) && a.pathname === b.pathname;
      } catch { return false; }
    })();
    out.push({
      level: sameSite ? "warning" : "error", rule: "spec.no-redirects", source: "ucp-spec", path: "", ref: SPEC.hosting,
      message: `${hop.from} redirects (${hop.status}) to ${hop.to}. Profile endpoints MUST NOT use redirects, and platforms MUST NOT follow them${sameSite ? ". Agents that start from the other hostname may never see your profile" : ""}.`,
    });
  }
  if (!http.finalUrl.startsWith("https://")) out.push({ level: "error", rule: "spec.https", source: "ucp-spec", path: "", ref: SPEC.hosting, message: "The profile is not served over HTTPS. Platforms MUST reject it." });
  if (http.status !== 200) {
    out.push({ level: "error", rule: "http.status", source: "ucp-spec", path: "", ref: SPEC.business, message: http.status === 404 ? "No profile at /.well-known/ucp (HTTP 404)." : `HTTP ${http.status || "error"} instead of 200.` });
    return out;
  }
  if (!http.contentType || !/json/i.test(http.contentType)) {
    out.push({ level: "warning", rule: "http.content-type", source: "arc", path: "", message: `Content-Type is ${http.contentType ? `"${http.contentType}"` : "missing"}. Serve application/json so every client parses it.` });
  }
  const cc = (http.cacheControl ?? "").toLowerCase();
  const maxAge = /(?:^|,)\s*max-age\s*=\s*(\d+)/.exec(cc);
  if (!cc) out.push({ level: "error", rule: "spec.cache-control", source: "ucp-spec", path: "", ref: SPEC.hosting, message: "No Cache-Control header. Published artifacts MUST send Cache-Control with public and max-age of at least 60." });
  else {
    const banned = ["private", "no-store", "no-cache"].filter((d) => new RegExp(`(?:^|[,\\s])${d}(?:$|[,\\s=])`).test(cc));
    if (banned.length) out.push({ level: "error", rule: "spec.cache-control", source: "ucp-spec", path: "", ref: SPEC.hosting, message: `Cache-Control "${http.cacheControl}" uses ${banned.join(", ")}. Profiles MUST NOT be served with private, no-store or no-cache.` });
    if (!/(?:^|[,\s])public(?:$|[,\s])/.test(cc)) out.push({ level: "error", rule: "spec.cache-control", source: "ucp-spec", path: "", ref: SPEC.hosting, message: `Cache-Control "${http.cacheControl}" is missing public. Profiles MUST be cacheable by shared caches.` });
    if (!maxAge || Number(maxAge[1]) < 60) out.push({ level: "error", rule: "spec.cache-control", source: "ucp-spec", path: "", ref: SPEC.hosting, message: `Cache-Control "${http.cacheControl}" needs max-age of at least 60 seconds.` });
  }
  if (!http.etag && !http.lastModified) out.push({ level: "warning", rule: "spec.validator-header", source: "ucp-spec", path: "", ref: SPEC.hosting, message: "No ETag or Last-Modified. Published artifacts SHOULD include one so clients can revalidate cheaply." });
  if (http.truncated) out.push({ level: "error", rule: "http.size", source: "arc", path: "", message: `The profile is larger than ${MAX_PROFILE_BYTES / 1024} KB. Keep it small; agents fetch it often.` });
  return out;
}

function lineCol(text: string, message: string): string {
  const pos = /position (\d+)/.exec(message);
  if (!pos) return "";
  const before = text.slice(0, Number(pos[1]));
  const line = before.split("\n").length;
  const col = before.length - before.lastIndexOf("\n");
  return ` (line ${line}, column ${col})`;
}

function report(findings: Finding[], declaredVersion: string | null, summary: ValidationReport["summary"], http?: HttpFacts): ValidationReport {
  const errors = findings.filter((f) => f.level === "error");
  const warnings = findings.filter((f) => f.level === "warning");
  const info = findings.filter((f) => f.level === "info");
  return {
    valid: errors.length === 0,
    schema: { release: UCP_RELEASE, ref: UCP_BUSINESS_SCHEMA_REF, spec: UCP_SPEC_URL },
    declaredVersion,
    counts: { errors: errors.length, warnings: warnings.length, info: info.length },
    errors,
    warnings,
    info,
    summary,
    ...(http ? { http } : {}),
  };
}

/** Validate a UCP business profile given as JSON text or an already-parsed value. */
export function validateUcpProfile(input: string | unknown, http?: HttpFacts): ValidationReport {
  const httpIssues = http ? httpFindings(http) : [];
  if (http && http.status !== 200) return report(httpIssues, null, null, http);
  let doc: unknown = input;
  // When the body is not a profile at all, header advice is noise: keep only where the fetch went.
  const fetchOnly = httpIssues.filter((f) => f.rule === "spec.no-redirects" || f.rule === "spec.https" || f.rule === "http.status");
  if (typeof input === "string") {
    const text = input.replace(/^\uFEFF/, "").trim();
    if (!text) return report([...fetchOnly, { level: "error", rule: "json.empty", source: "ucp-schema", path: "", message: "The profile is empty." }], null, null, http);
    if (text.startsWith("<")) return report([...fetchOnly, { level: "error", rule: "json.html", source: "ucp-schema", path: "", message: "Got HTML, not JSON. The URL may be a storefront page, a bot challenge or a login wall." }], null, null, http);
    try {
      doc = JSON.parse(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid JSON";
      return report([...fetchOnly, { level: "error", rule: "json.parse", source: "ucp-schema", path: "", message: `Not valid JSON: ${msg}${lineCol(text, msg)}.` }], null, null, http);
    }
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return report([...httpIssues, { level: "error", rule: "schema.type", source: "ucp-schema", path: "", message: "A profile must be a JSON object with a ucp member." }], null, null, http);
  }
  const validate = validator();
  const ok = validate(doc);
  const schema = ok ? [] : schemaFindings(validate.errors ?? [], doc);
  const record = doc as Record<string, unknown>;
  const u = record.ucp && typeof record.ucp === "object" ? (record.ucp as Record<string, unknown>) : null;
  const declared = u && typeof u.version === "string" ? u.version : null;
  const findings = [...httpIssues, ...schema, ...specFindings(record), ...arcFindings(record)];
  return report(findings, declared, summarize(doc), http);
}

export const UCP_EXAMPLE_PROFILE = {
  ucp: {
    version: UCP_RELEASE,
    services: {
      "dev.ucp.shopping": [
        {
          version: UCP_RELEASE,
          spec: `https://ucp.dev/${UCP_RELEASE}/specification/overview/`,
          transport: "mcp",
          endpoint: "https://shop.example.com/api/ucp/mcp",
          schema: `https://ucp.dev/${UCP_RELEASE}/services/shopping/mcp.openrpc.json`,
        },
      ],
    },
    capabilities: {
      "dev.ucp.shopping.checkout": [
        { version: UCP_RELEASE, spec: `https://ucp.dev/${UCP_RELEASE}/specification/shopping/checkout/`, schema: `https://ucp.dev/${UCP_RELEASE}/schemas/shopping/checkout.json` },
      ],
      "dev.ucp.shopping.cart": [
        { version: UCP_RELEASE, spec: `https://ucp.dev/${UCP_RELEASE}/specification/shopping/cart/`, schema: `https://ucp.dev/${UCP_RELEASE}/schemas/shopping/cart.json` },
      ],
    },
    payment_handlers: {},
  },
};

export const UCP_BROKEN_EXAMPLE = {
  ucp: {
    version: "2026-8-25",
    services: {
      "dev.ucp.shopping": [{ version: UCP_RELEASE, transport: "mcp", endpoint: "http://shop.example.com/api/ucp/mcp/" }],
    },
    capabilities: {
      "dev.ucp.shopping.checkout": [{ version: UCP_RELEASE, schema: "https://cdn.example.com/checkout.json" }],
      "com.example.gift_wrap": [{ version: UCP_RELEASE, schema: "https://example.com/ucp/gift_wrap.json", extends: "dev.ucp.shopping.cart" }],
    },
  },
};
