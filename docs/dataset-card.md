---
license: cc-by-4.0
pretty_name: ARC Agent Commerce Index
language:
- en
tags:
- agentic-commerce
- ai-agents
- e-commerce
- benchmark
- mcp
- ucp
size_categories:
- n<1K
configs:
- config_name: stores
  data_files: latest/stores.csv
- config_name: rails_checks
  data_files: latest/rails_checks.csv
- config_name: adoption_history
  data_files: latest/adoption_history.csv
- config_name: personas
  data_files: latest/personas.csv
- config_name: protocol_matrix
  data_files: latest/protocol_matrix.csv
---

# ARC Agent Commerce Index

The open benchmark of whether AI agents can actually buy, for every store, agent and protocol. Published by [ARC](https://www.arcreport.ai) at [arcreport.ai/data](https://www.arcreport.ai/data). New dated snapshot every Monday.

Most trackers count what stores *declare* (a UCP profile, an MCP endpoint). This dataset also records what *happened* when shopping agents tried to put a real product in a real cart, per store and per agent, next to the protocol signals.

## Files

Each snapshot lives in its own immutable version folder and is copied to `latest/`. Every table comes as CSV and Parquet, with a `manifest.json` holding row counts, `snapshot_version`, `generated_at` (UTC) and `supersedes`.

### Versioning

- A version folder never changes once published. The first export on a date is `YYYY-MM-DD/`; any later export on the same date is published as `YYYY-MM-DD.r2/`, `YYYY-MM-DD.r3/` and so on. The exporter refuses to overwrite an existing version.
- `latest/` is a moving copy of the newest version. To cite exact numbers, cite the version folder (for example `/data/2026-10-07.r5/`), not `latest/`.
- `versions.json` lists every version with its `generated_at`, `supersedes`, method version, stores checked and row counts.
- Before this rule (7 Oct 2026), `/data/2026-10-07/` was regenerated four times during the day (rails_checks went from 607 to 647 to 1,044 rows). All five published versions are restored byte-for-byte from the commits that published them, as `2026-10-07/` (r1) to `2026-10-07.r5/`; their manifests carry `restored.source_commit`.

| Table | One row per | What it holds |
|---|---|---|
| `stores` | Index store | Latest completed ARC Index result: score, agents that carted, per-agent outcome, failure label |
| `rails_checks` | Store domain | Latest HTTP check: WebMCP, storefront MCP, UCP MCP, UCP profile, catalog tool, cart link |
| `adoption_history` | Week × source × metric | Weekly aggregate counts (long format) |
| `protocol_matrix` | Protocol × stage | Declared / Valid / Usable / Transacts counts with evidence label (Measured / Inferred / Not measured). Empty count = not measured, not zero. See arcreport.ai/protocols |

Every row has `snapshot_date`, `method_version` and `evidence` (`measured` or `inferred`).

### `stores`
| Field | Meaning |
|---|---|
| slug, store_name, domain, category | Store identity from ARC's public Index list |
| homepage_url, product_url | The store homepage and the one product the scan tries to buy (query strings removed) |
| score | ARC compatibility score, 0–100. Empty when a retest is pending |
| agents_chose, agents_total | How many ARC browser personas added the product to the cart, out of how many |
| failure_reason | Fixed label for where agents stopped (e.g. `Blocked at the size picker`), `Added to cart (stopped before payment)` when every shopper got the product into the cart (ARC never pays; older snapshots said `Finished the purchase`), or `other` |
| persona_a … persona_e | Per-persona outcome: `chose`, `missed` or `error`. These are ARC browser shopper personas run on ARC-chosen models, not named consumer agents. Legacy alias ids (muse, instinct, grok, openai-dots, openclaw) are in `personas.csv` (`legacy_alias_id`) |
| index_week, scanned_at | ISO week and UTC time of the scan |
| evidence | `measured` when all five shoppers ran and a score exists; `inferred` otherwise |

### `rails_checks`
| Field | Meaning |
|---|---|
| domain, slug, category, product_url | Store checked and the product page used (query strings removed; cart URLs are never stored) |
| status | `completed` or `failed` |
| webmcp, storefront_mcp, ucp_mcp | Whether each interface was detected. `webmcp` is empty (not measured) for checks before 18:00 UTC on 6 Oct 2026, when detection started |
| catalog_tool, catalog_found | Catalog tool exposed and whether it returned the product |
| cart_status | `link`, `unavailable`, `not_offered`, `error` or `skipped` |
| ucp_profile | `/.well-known/ucp`: `valid`, `invalid`, `absent`, `blocked` or `error` |
| mcp_blocked | The store blocked the MCP request |
| checked_at | UTC time of the check |
| evidence | `measured` for a clean completed check; `inferred` when blocked, errored or failed |
| source | `index` (ARC Index store), `directory` (curated list), `submitted` (added by the public via /agent-checkout/submit, the API or MCP, after validation) or `checked` (one-off check only) |

### `adoption_history`
`week` (ISO), `source` (`index` or `rails`), `metric` (e.g. `stores_scored`, `mean_score`, `stores_any_persona_carted`, `ucp_profile_valid`, `cart_link`, `webmcp`, `webmcp_measured`) and `value`.

One definition with `stores`: index metrics use the latest completed scan per published Index store within the week, so the current week matches `stores` exactly. Rails metrics count each host once per week (its latest attempt that week). `webmcp` counts only checks after detection began; its denominator is `webmcp_measured`.

### `personas`
`persona`, `label`, `style`, `legacy_alias_id`, `method_version`.

### `protocol_matrix`
See [arcreport.ai/protocols](https://www.arcreport.ai/protocols).

## Collection method
- **Index:** five ARC browser shopper personas (A to E) each try to add one real product to the cart. Runs **stop before payment**; nothing is ever bought. See [methodology](https://www.arcreport.ai/methodology).
- **Rails:** a plain HTTP check of each store's machine shopping interfaces, at most once per host per week, with an identifiable user agent and no model calls.
- Exported weekly from ARC's database with a read-only token by ARC's exporter.

## What is excluded
No scraped page text or product copy, no model-written prose (failure details, fixes, summaries), no raw evidence blobs, no costs or internal errors, no emails, accounts, users, sessions or visitor data. Only scores, signals, URLs and dates.

## Limits
- The store list is ARC's curated sample plus stores anyone submitted, not all of e-commerce, and leans toward Shopify-hosted DTC brands.
- Each snapshot is frozen on its date. Live pages on arcreport.ai update hourly, so their counts (n) differ from the snapshot's.
- The browser shoppers (ARC browser shoppers A to E) are ARC's own cart attempts, not live sessions of any consumer agent. They stop before payment.
- A detected interface does not prove an agent can complete a purchase; a failed cart attempt can be transient.
- Early weeks have short history.

## Licence and citation
[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Attribution: **ARC, arcreport.ai**. Citation file: [arcreport.ai/CITATION.cff](https://www.arcreport.ai/CITATION.cff).

```bibtex
@misc{arc_agent_commerce_index,
  title  = {ARC Agent Commerce Index: open dataset},
  author = {{ARC}},
  howpublished = {\url{https://www.arcreport.ai/data}},
  license = {CC-BY-4.0}
}
```

## Corrections and opt-out
Store owners can request a correction or removal at [arcreport.ai/contact](https://www.arcreport.ai/contact).
