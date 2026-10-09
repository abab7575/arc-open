// ARC-100 selection. Pure and deterministic: the same inputs always give the same set.
// The published set is frozen in arc-100-v1.json; this code documents how it was picked
// and lets anyone re-run the selection against the inputs in benchmark/arc-100/v1/.
import { createHash } from "node:crypto";

export const ARC100_VERSION = "v1";
export const ARC100_SALT = "arc-100-v1";

const CC_TLD: Record<string, string> = {
  "co.uk": "GB", uk: "GB", ie: "IE", "com.au": "AU", au: "AU", de: "DE", fr: "FR", ca: "CA", nl: "NL", se: "SE", it: "IT", dk: "DK",
  es: "ES", pt: "PT", fi: "FI", cz: "CZ", mc: "MC", "co.nz": "NZ", nz: "NZ", us: "US", eu: "EU", be: "BE", at: "AT", ch: "CH", no: "NO",
  pl: "PL", "co.jp": "JP", jp: "JP", "com.br": "BR", "co.za": "ZA", in: "IN", sg: "SG", "com.mx": "MX",
};

/** Market from the domain only. Generic TLDs (.com, .net, .co, .shop ...) are "INTL": the domain does not say where the store sells. */
export function marketFromHost(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  const two = parts.slice(-2).join(".");
  return CC_TLD[two] ?? CC_TLD[parts.at(-1) ?? ""] ?? "INTL";
}

export type PlatformGuess = { platform: string; evidence: "measured" | "inferred" | "none" };
/** Homepage fingerprint when measured; else Shopify inferred from a Shopify agent endpoint; else not detected. */
export function platformOf(input: { platformId: string | null; storefrontMcp: boolean; ucpMcp: boolean }): PlatformGuess {
  if (input.platformId && input.platformId !== "unknown") return { platform: input.platformId, evidence: "measured" };
  if (input.storefrontMcp || input.ucpMcp) return { platform: "shopify", evidence: "inferred" };
  return { platform: "not_detected", evidence: input.platformId === "unknown" ? "measured" : "none" };
}

export type Arc100Candidate = {
  host: string; name: string; category: string; productUrl: string; source: "index" | "directory"; indexSlug: string | null;
  platform: string; platformEvidence: PlatformGuess["evidence"];
};
export type Arc100Store = Arc100Candidate & { id: string; market: string; scanSlug: string };

export const ARC100_CATEGORIES = ["apparel", "footwear", "beauty", "supplements", "home", "food-drink", "outdoor", "jewelry", "kids", "pets", "electronics"] as const;
/** 9 per category (99) plus one more in the largest directory category = 100. */
export const ARC100_QUOTA: Record<string, number> = Object.fromEntries(ARC100_CATEGORIES.map(c => [c, c === "beauty" ? 10 : 9]));
/** Index stores already have browser results, so up to this many per category come from the Index. */
export const INDEX_PER_CATEGORY = 6;
/** Caps that keep a category from being all one market or all one platform. */
export const MAX_NON_INTL = 4;
export const MAX_NON_SHOPIFY = 4;

export const GIFTISH = /gift|e-?card|voucher|subscri|sample|donat|warranty|insurance|protection|membership|swatch|test-product|bundle-builder/i;

const rank = (host: string) => createHash("sha256").update(`${ARC100_SALT}:${host}`).digest("hex");
export const scanSlugFor = (host: string) => `arc100-${host.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

function pick(pool: Arc100Candidate[], n: number, taken: Arc100Candidate[]): Arc100Candidate[] {
  const out: Arc100Candidate[] = [];
  const left = pool.slice().sort((a, b) => rank(a.host).localeCompare(rank(b.host)));
  while (out.length < n && left.length) {
    const chosen = [...taken, ...out];
    const markets = new Set(chosen.map(c => marketFromHost(c.host)));
    const platforms = new Set(chosen.map(c => c.platform));
    const nonIntl = chosen.filter(c => marketFromHost(c.host) !== "INTL").length;
    const nonShopify = chosen.filter(c => c.platform !== "shopify").length;
    let best = -1, bestScore = -Infinity;
    left.forEach((c, i) => {
      const m = marketFromHost(c.host);
      if (m !== "INTL" && nonIntl >= MAX_NON_INTL) return;
      if (c.platform !== "shopify" && nonShopify >= MAX_NON_SHOPIFY) return;
      const score = (m !== "INTL" && !markets.has(m) ? 2 : 0) + (m !== "INTL" ? 1 : 0) + (!platforms.has(c.platform) ? 2 : 0) + (c.platform !== "shopify" ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = i; } // ties keep the earlier hash rank
    });
    if (best < 0) best = 0; // caps hit: fall back to hash order
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}

/** Picks ARC-100: per category, Index stores first (diverse), then directory stores for market and platform spread. */
export function selectArc100(candidates: Arc100Candidate[]): Arc100Store[] {
  const seen = new Set<string>();
  const unique = candidates.filter(c => !seen.has(c.host) && seen.add(c.host));
  const out: Arc100Store[] = [];
  for (const cat of ARC100_CATEGORIES) {
    const inCat = unique.filter(c => c.category === cat);
    const index = pick(inCat.filter(c => c.source === "index"), Math.min(INDEX_PER_CATEGORY, ARC100_QUOTA[cat]), []);
    const rest = pick(inCat.filter(c => c.source === "directory"), ARC100_QUOTA[cat] - index.length, index);
    const chosen = [...index, ...rest].sort((a, b) => a.host.localeCompare(b.host));
    for (const c of chosen) out.push({ ...c, id: "", market: marketFromHost(c.host), scanSlug: c.indexSlug ?? scanSlugFor(c.host) });
  }
  return out.map((s, i) => ({ ...s, id: `arc100-v1-${String(i + 1).padStart(3, "0")}` }));
}
