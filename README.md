# ARC Open

**ARC** ([arcreport.ai](https://www.arcreport.ai)) is a free, public database and benchmark for agentic commerce: it measures whether AI shopping agents can actually find, cart and check out at real online stores, across protocols (UCP, ACP, WebMCP, MCP and agent payment programmes) and platforms. It is neutral: not tied to any model, protocol, platform or payment company.

This repository holds the reusable parts of ARC, free for anyone to use, copy and build on:

| Folder | What it is | Licence |
|---|---|---|
| [`packages/arc-check`](packages/arc-check) | `arcreport-check`: a zero-dependency CLI, library and GitHub Action that checks a store's agent-commerce readiness (UCP profile, WebMCP, catalog, checkout link, MCP, robots, product data, policies) | MIT |
| [`packages/ucp-validator`](packages/ucp-validator) | The UCP business-profile validator: published JSON Schema + spec rules + clearly labelled interop hints | MIT (vendored UCP schemas Apache-2.0) |
| [`benchmark/`](benchmark) | **ARC-100 v1**, a fixed set of 100 real stores for comparing shopping agents, the selection code that reproduces it, and the leaderboard submission validator | Data CC-BY-4.0, code MIT |
| [`docs/`](docs) | Methodology and scoring, leaderboard submission spec, dataset schema/card, OpenAPI for ARC's public API, MCP server entry | CC-BY-4.0 |
| [`scripts/publish_hf.py`](scripts/publish_hf.py) | Mirrors the weekly open dataset to Hugging Face | MIT |

## Quickstart

Check any store (Node 18+, no account, no key):

```bash
npx arcreport-check yourstore.com
npx arcreport-check yourstore.com --require checkout   # can agents reach checkout?
npx arcreport-check a.com b.com --require all --json
```

No npm? Same tool as one file: `curl -fsSLO https://www.arcreport.ai/arc-check.mjs && node arc-check.mjs yourstore.com`

In CI (fails the job if your UCP profile or WebMCP breaks):

```yaml
- uses: abab7575/arc-open/packages/arc-check@v0.1.0
  with:
    host: yourstore.com
    require: ucp,webmcp
```

Benchmark your shopping agent: run it on the 100 stores in [`benchmark/arc-100/v1/arc-100.csv`](benchmark/arc-100/v1/arc-100.csv), stop before payment, and submit using the [spec](docs/leaderboard-spec.md).

## The data

- **Open dataset** (weekly snapshots, CSV and Parquet, CC-BY-4.0): <https://www.arcreport.ai/data>. Field reference: [`docs/dataset-card.md`](docs/dataset-card.md).
- **Developer hub** (free API, MCP server, UCP validator): <https://www.arcreport.ai/developers>
- **Method**: [`docs/methodology.md`](docs/methodology.md) and <https://www.arcreport.ai/methodology>
- **Leaderboard**: <https://www.arcreport.ai/leaderboard>

ARC labels every result **Measured**, **Inferred** or **Not measured**, and never claims more than the evidence shows. ARC never places real orders: every test stops before payment.

## Develop

```bash
npm ci
npm test         # CLI, UCP validator and ARC-100 reproducibility tests
npm run typecheck
```

## Cite

See [`CITATION.cff`](CITATION.cff). Short form: *ARC (2026). ARC Agent Commerce Index. https://www.arcreport.ai/data*

## Contributing and contact

Issues and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Store owners can request a correction or opt-out at <https://www.arcreport.ai/contact>.

## Licence

Code: [MIT](LICENSE). Data and docs: [CC-BY-4.0](DATA_LICENSE), attribution "ARC (arcreport.ai)".
