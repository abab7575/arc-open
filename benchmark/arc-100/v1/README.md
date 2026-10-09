# ARC-100 v1

A fixed, versioned public test set of 100 real online stores for measuring whether AI shopping agents can add a product to a cart (stopping before payment).

- Frozen: 2026-10-07. The stores in v1 never change; a new set gets a new version.
- Files: `arc-100.csv`, `arc-100.json` (one row per store: id, host, name, category, market, platform, platform_evidence, source, product_url, scan_slug), `selection-inputs.json` (every eligible candidate), `submission.schema.json` (submission format).
- Leaderboard: https://www.arcreport.ai/leaderboard (JSON: https://www.arcreport.ai/api/leaderboard)
- Submit a run: https://www.arcreport.ai/leaderboard/spec (POST https://www.arcreport.ai/api/leaderboard/submit, or MCP tool `submit_leaderboard_run` at https://www.arcreport.ai/api/ask)
- Selection code: `src/lib/benchmark/select.ts`, script `scripts/build-arc100.ts`.

Fields:
- `market` comes from the domain only (`.co.uk` = GB). `INTL` means a generic domain such as .com, which says nothing about where the store sells.
- `platform` is the homepage fingerprint when measured (`platform_evidence=measured`), `shopify` when the store answers a Shopify agent endpoint (`inferred`), else `not_detected`.
- `source` is `index` (ARC Agent Commerce Index store) or `directory` (ARC open directory store).

Licence: CC-BY-4.0. Cite as: ARC-100 v1, ARC (arcreport.ai), 2026.
