import set from "./arc-100-v1.json";
import type { Arc100Store } from "./select";

export const ARC100 = set as { name: string; version: string; frozen: string; method: string; license: string; count: number; stores: Arc100Store[] };
export const ARC100_STORES: Arc100Store[] = ARC100.stores;
export const ARC100_LABEL = `ARC-100 ${ARC100.version}`;
export const ARC100_FILES = { csv: "/data/arc-100/v1/arc-100.csv", json: "/data/arc-100/v1/arc-100.json", inputs: "/data/arc-100/v1/selection-inputs.json" } as const;

const byScanSlug = new Map(ARC100_STORES.map(s => [s.scanSlug, s]));
const byId = new Map(ARC100_STORES.map(s => [s.id, s]));
const byHost = new Map(ARC100_STORES.map(s => [s.host, s]));
export const arc100ByScanSlug = (slug: string) => byScanSlug.get(slug);
export const arc100ById = (id: string) => byId.get(id);
export const arc100ByHost = (host: string) => byHost.get(host.toLowerCase().replace(/\.$/, "").replace(/^www\./, ""));

/** ARC-100 stores that are not in the Index. They join the capped Index scan queue as benchmark-only rows. */
export const ARC100_EXTRA_SCAN_SLUGS: string[] = ARC100_STORES.filter(s => s.source === "directory").map(s => s.scanSlug);
export const isArc100ExtraSlug = (slug: string) => slug.startsWith("arc100-");

export const ARC100_COLUMNS = ["id", "host", "name", "category", "market", "platform", "platform_evidence", "source", "product_url", "scan_slug"] as const;
const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function arc100Csv(stores: Arc100Store[]): string {
  const rows = stores.map(s => [s.id, s.host, s.name, s.category, s.market, s.platform, s.platformEvidence, s.source, s.productUrl, s.scanSlug].map(cell).join(","));
  return [ARC100_COLUMNS.join(","), ...rows].join("\n") + "\n";
}
