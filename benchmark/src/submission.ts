// Open leaderboard submissions: format, validation and scoring. Pure; storage lives in submit-store.ts.
import { createHash } from "node:crypto";
import { ARC100, ARC100_LABEL, arc100ById, arc100ByHost } from "./arc100";
import { wilson } from "./stats";

export const SUBMISSION_SPEC = "arc-leaderboard-submission/v1";
export const SUBMISSION_PATHS = ["browser", "ucp", "mcp", "acp", "api", "other"] as const;
export const SUBMISSION_OUTCOMES = ["added_to_cart", "checkout_reached", "no_cart", "blocked", "error", "not_attempted"] as const;
export type SubmissionOutcome = (typeof SUBMISSION_OUTCOMES)[number];
export const SUCCESS_OUTCOMES: SubmissionOutcome[] = ["added_to_cart", "checkout_reached"];
/** Outcomes left out of n: the agent's own run broke or the store was skipped. */
export const EXCLUDED_OUTCOMES: SubmissionOutcome[] = ["error", "not_attempted"];
export const MIN_RESULTS = 10;
export const MAX_RUN_AGE_DAYS = 90;
export const LEADERBOARD_SUBMIT_CAPS = { perIp: 5, global: 200 } as const;

export class SubmissionError extends Error { constructor(message: string, public status = 400) { super(message); } }

export type SubmissionResult = { id: string; host: string; outcome: SubmissionOutcome; at: string | null; evidence_url: string | null; steps: number | null; seconds: number | null };
export type ValidSubmission = {
  spec: string; testSet: string;
  agent: { name: string; version: string | null; builder: string | null; url: string | null; path: (typeof SUBMISSION_PATHS)[number]; model: string | null };
  run: { startedAt: Date | null; finishedAt: Date | null; notes: string | null };
  results: SubmissionResult[]; n: number; successes: number; contact: string | null; fingerprint: string;
};

const text = (v: unknown, max: number, field: string, required = false): string | null => {
  if (v == null || v === "") { if (required) throw new SubmissionError(`${field} is required.`); return null; }
  if (typeof v !== "string") throw new SubmissionError(`${field} must be a string.`);
  // Plain text only: strip control characters and angle brackets, collapse whitespace.
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  if (required && !s) throw new SubmissionError(`${field} is required.`);
  if (s.length > max) throw new SubmissionError(`${field} must be at most ${max} characters.`);
  return s || null;
};
const httpsUrl = (v: unknown, field: string): string | null => {
  const s = text(v, 500, field);
  if (!s) return null;
  try { const u = new URL(s); if (u.protocol !== "https:" || u.username || u.password) throw 0; return u.toString(); }
  catch { throw new SubmissionError(`${field} must be an https URL.`); }
};
const when = (v: unknown, field: string, now: Date): Date | null => {
  if (v == null || v === "") return null;
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  if (!Number.isFinite(t)) throw new SubmissionError(`${field} must be an ISO 8601 timestamp.`);
  if (t > now.getTime() + 10 * 60_000) throw new SubmissionError(`${field} is in the future.`);
  if (t < now.getTime() - MAX_RUN_AGE_DAYS * 86_400_000) throw new SubmissionError(`${field} is older than ${MAX_RUN_AGE_DAYS} days. Re-run against ${ARC100_LABEL}.`);
  return new Date(t);
};

export function validateSubmission(body: unknown, now = new Date()): ValidSubmission {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SubmissionError("Send a JSON object. See /leaderboard/spec.");
  const b = body as Record<string, unknown>;
  if (b.spec !== SUBMISSION_SPEC) throw new SubmissionError(`spec must be "${SUBMISSION_SPEC}".`);
  if (b.test_set !== ARC100_LABEL) throw new SubmissionError(`test_set must be "${ARC100_LABEL}".`);
  const a = (b.agent && typeof b.agent === "object" ? b.agent : {}) as Record<string, unknown>;
  const path = typeof a.path === "string" ? a.path.trim().toLowerCase() : "";
  if (!(SUBMISSION_PATHS as readonly string[]).includes(path)) throw new SubmissionError(`agent.path must be one of ${SUBMISSION_PATHS.join(", ")}.`);
  const agent = { name: text(a.name, 60, "agent.name", true)!, version: text(a.version, 40, "agent.version"), builder: text(a.builder, 80, "agent.builder"),
    url: httpsUrl(a.url, "agent.url"), path: path as ValidSubmission["agent"]["path"], model: text(a.model, 80, "agent.model") };
  const r = (b.run && typeof b.run === "object" ? b.run : {}) as Record<string, unknown>;
  if (r.stopped_before_payment !== true) throw new SubmissionError("run.stopped_before_payment must be true. ARC-100 runs must stop before payment; never place real orders.");
  const run = { startedAt: when(r.started_at, "run.started_at", now), finishedAt: when(r.finished_at, "run.finished_at", now), notes: text(r.notes, 500, "run.notes") };
  if (!Array.isArray(b.results)) throw new SubmissionError("results must be an array.");
  if (b.results.length > ARC100.count) throw new SubmissionError(`At most ${ARC100.count} results (one per ARC-100 store).`);
  const seen = new Set<string>();
  const results: SubmissionResult[] = b.results.map((raw, i) => {
    const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const store = typeof x.id === "string" ? arc100ById(x.id.trim()) : typeof x.host === "string" ? arc100ByHost(x.host.trim()) : undefined;
    if (!store) throw new SubmissionError(`results[${i}]: id must be an ARC-100 v1 store id (arc100-v1-001 ... arc100-v1-100) or host.`);
    if (seen.has(store.id)) throw new SubmissionError(`results[${i}]: ${store.id} appears twice.`);
    seen.add(store.id);
    const outcome = typeof x.outcome === "string" ? x.outcome.trim().toLowerCase() : "";
    if (!(SUBMISSION_OUTCOMES as readonly string[]).includes(outcome)) throw new SubmissionError(`results[${i}].outcome must be one of ${SUBMISSION_OUTCOMES.join(", ")}.`);
    const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);
    return { id: store.id, host: store.host, outcome: outcome as SubmissionOutcome, at: when(x.at, `results[${i}].at`, now)?.toISOString() ?? null,
      evidence_url: httpsUrl(x.evidence_url, `results[${i}].evidence_url`), steps: num(x.steps, 10_000), seconds: num(x.seconds, 86_400) };
  });
  const counted = results.filter(x => !EXCLUDED_OUTCOMES.includes(x.outcome));
  if (counted.length < MIN_RESULTS) throw new SubmissionError(`Send at least ${MIN_RESULTS} results that are not error or not_attempted.`);
  const successes = counted.filter(x => SUCCESS_OUTCOMES.includes(x.outcome)).length;
  const contact = text(b.contact, 200, "contact");
  const fingerprint = createHash("sha256").update(JSON.stringify([agent.name.toLowerCase(), agent.version, agent.path, results.map(x => [x.id, x.outcome])])).digest("hex");
  return { spec: SUBMISSION_SPEC, testSet: ARC100_LABEL, agent, run, results, n: counted.length, successes, contact, fingerprint };
}

/** Public view of a stored submission. Never includes contact or ip hash. */
export type PublicSubmission = { id: string; status: string; agent: string; version: string | null; builder: string | null; path: string; model: string | null;
  successes: number; n: number; rate: number | null; ci: { low: number; high: number } | null; submittedAt: string; runFinishedAt: string | null };
export function publicSubmission(row: { id: string; status: string; agentName: string; agentVersion: string | null; builder: string | null; path: string; model: string | null; successes: number; n: number; createdAt: Date | null; runFinishedAt: Date | null }): PublicSubmission {
  return { id: row.id, status: row.status, agent: row.agentName, version: row.agentVersion, builder: row.builder, path: row.path, model: row.model,
    successes: row.successes, n: row.n, rate: row.n ? Math.round((row.successes / row.n) * 1000) / 10 : null, ci: wilson(row.successes, row.n),
    submittedAt: (row.createdAt ?? new Date(0)).toISOString(), runFinishedAt: row.runFinishedAt ? row.runFinishedAt.toISOString() : null };
}

/** Agent name used only by the example; a POST that still carries it is rejected so the example never lands on the leaderboard. */
export const EXAMPLE_AGENT_NAME = "Example Shopper";
const EXAMPLE_OUTCOMES: SubmissionOutcome[] = ["added_to_cart", "added_to_cart", "blocked", "checkout_reached", "added_to_cart", "no_cart", "added_to_cart", "blocked", "added_to_cart", "added_to_cart", "error", "added_to_cart"];
/**
 * A complete run that passes validateSubmission: 12 ARC-100 stores, 11 counted (one error is excluded), so n meets MIN_RESULTS.
 * Timestamps are relative to `now` so the example never ages past MAX_RUN_AGE_DAYS.
 */
export function submissionExample(now = new Date()) {
  const finished = new Date(Math.floor((now.getTime() - 3_600_000) / 60_000) * 60_000);
  const started = new Date(finished.getTime() - EXAMPLE_OUTCOMES.length * 20 * 60_000);
  const iso = (d: Date) => d.toISOString().replace(".000Z", "Z");
  return {
    spec: SUBMISSION_SPEC,
    test_set: ARC100_LABEL,
    agent: { name: EXAMPLE_AGENT_NAME, version: "0.3.1", builder: "Example Labs", url: "https://example.com/agent", path: "browser", model: "optional model name" },
    run: { started_at: iso(started), finished_at: iso(finished), stopped_before_payment: true, notes: "Headless Chromium, default settings, one attempt per store." },
    results: EXAMPLE_OUTCOMES.map((outcome, i) => {
      const id = `arc100-v1-${String(i + 1).padStart(3, "0")}`;
      const at = iso(new Date(started.getTime() + (i * 20 + 4) * 60_000));
      return outcome === "added_to_cart" || outcome === "checkout_reached"
        ? { id, outcome, at, evidence_url: `https://example.com/runs/42/${id}.png`, steps: 10 + i, seconds: 60 + i * 7 }
        : { id, outcome, at };
    }),
    contact: "optional, private: an email or URL ARC can use to arrange verification",
  };
}
export const SUBMISSION_EXAMPLE = submissionExample();
/** The example passes validation; storing it is refused so a copy-paste never lands on the leaderboard. */
export function assertNotExample(v: ValidSubmission) {
  if (v.agent.name === EXAMPLE_AGENT_NAME && v.agent.builder === "Example Labs") throw new SubmissionError("This is the example run. It is valid, but replace agent and results with your own run against ARC-100 v1 before submitting.");
}
