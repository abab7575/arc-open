# arc-check

Free conformance check for agentic commerce. **Is a store's UCP profile valid, is WebMCP live, and can AI agents actually reach checkout?**

```
npx arcreport-check allbirds.com
```

> If `npx` can't find it yet, it hasn't been published to npm (see [PUBLISHING.md](PUBLISHING.md)). It works today as a single file:
> `curl -fsSLO https://www.arcreport.ai/arc-check.mjs && node arc-check.mjs allbirds.com`
>
> The npm name `arc-check` belongs to an unrelated package, so this one publishes as `arcreport-check`. Installed globally (`npm i -g arcreport-check`), the command is `arc-check`.

No account, no API key, no model call, no purchase, zero dependencies (Node 18+). Neutral across models, protocols and platforms. It calls ARC's open API:

- `GET https://www.arcreport.ai/api/ucp/validate?url=`: fetches `/.well-known/ucp` **live** and validates it against the published [UCP JSON Schema](https://ucp.dev/2026-08-25/schemas/profile.json) and spec rules (authority binding, https, hosting headers). Same engine as the [UCP validator](https://www.arcreport.ai/developers/ucp-validator).
- `GET https://www.arcreport.ai/api/agent-checkout?url=`: ARC's HTTP agent check of the store, the one behind [arcreport.ai/agent-checkout](https://www.arcreport.ai/agent-checkout). Cached by ARC for up to 24 hours per store.

## Checks

| id | Passes when | Default |
|---|---|---|
| `ucp` | `/.well-known/ucp` validates against the published UCP schema and spec rules, fetched live (falls back to ARC's saved check if the validator is unreachable) | **required** |
| `webmcp` | Shopify's WebMCP storefront adapter is in the homepage HTML | **required** |
| `catalog` | An agent catalog tool (UCP or storefront MCP) returned the tested product | report |
| `checkout` | ARC's HTTP agent client got a checkout link back (stopped before payment) | report |
| `mcp` | The storefront MCP server at `/api/mcp` answers | report (warn) |
| `robots` | robots.txt does not block answer agents (ChatGPT-User, Claude-User, Perplexity-User ...) | report |
| `product-data` | Product structured data scores 80+ of 100 | report (warn) |
| `policies` | Return and shipping policies are findable | report (warn) |

Statuses: `PASS`, `FAIL`, `WARN` (soft signal) and `N/A` (not measured: ARC has no saved evidence, which is not the same as a fail). A **required** check that is not `PASS` fails, because the kit cannot vouch for it.

## CLI

```
arc-check <host|url> [more hosts...] [--require ucp,webmcp] [--json] [--summary file] [--no-live-ucp] [--api origin] [--timeout sec]
```

- `--require`: checks that must pass (default `ucp,webmcp`; `all`; `none` = report only).
- `--json`: machine-readable output, including the raw ARC result.
- `--summary`: append a Markdown table to a file (the Action uses `$GITHUB_STEP_SUMMARY`).
- `--no-live-ucp`: skip the live schema validation and use ARC's saved UCP check.
- Up to 25 hosts per run.

Exit codes: `0` pass, `1` a required check failed, `2` usage or network error, `3` rate limited.

In GitHub Actions the CLI also prints `::error` annotations for failed required checks and writes `ok`, `exit-code` and `report` to `$GITHUB_OUTPUT`.

## GitHub Action

```yaml
- uses: abab7575/arc-open/packages/arc-check@v0.1.0
  with:
    host: your-store.com      # several allowed, space or comma separated
    require: ucp,webmcp
```

Writes a summary table to the job, annotates failures and sets the outputs `ok`, `exit-code` and `report`. If ARC's API can't be reached or is rate-limited, the step warns and passes unless `strict: "true"`. See [`examples/arc-check.yml`](examples/arc-check.yml) for a workflow that runs after pushes and daily. Node 18+ must be on the runner (GitHub-hosted runners have it).

Works today, before the action is published: `run: curl -fsSLO https://www.arcreport.ai/arc-check.mjs && node arc-check.mjs your-store.com`.

## Library

```js
import { checkHost } from "arcreport-check";
const r = await checkHost("allbirds.com", { require: ["ucp", "checkout"] });
console.log(r.ok, r.checks);
```

## What it is and isn't

- A live HTTP check of the store's public agent endpoints. It is **not** a browser shopper run, not a real consumer agent session, and not a certification by Google, Shopify, OpenAI or anyone else. A valid UCP profile does not prove the endpoints work; `catalog` and `checkout` are the closer test.
- WebMCP is detected from server HTML. ARC can't see tools registered in a live browser session.
- `webmcp`, `catalog`, `checkout` and the rest come from ARC's latest check (cached up to 24 hours), so a fix can take a day to show. `ucp` is live.
- Checked stores join ARC's free open directory and CC-BY-4.0 dataset, like any check on arcreport.ai.
- Free use limits from ARC's API apply: about 50 checkout reads and 10 fresh checks, and 300 UCP profile fetches, per network per day. Shared CI runners share those limits, so prefer scheduled runs for many stores.

## Related

- Developer hub (API, MCP config for Claude, Cursor, ChatGPT): https://www.arcreport.ai/developers
- Open agent leaderboard and the ARC-100 test set: https://www.arcreport.ai/leaderboard
- Protocol Matrix: https://www.arcreport.ai/protocols
- Free MCP server (tools `validate_ucp_profile`, `can_agent_checkout` and more): https://www.arcreport.ai/api/ask

MIT licensed. Data from ARC is CC-BY-4.0.
