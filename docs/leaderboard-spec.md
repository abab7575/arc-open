# ARC-100 and the open agent leaderboard: submission spec

Live version: <https://www.arcreport.ai/leaderboard/spec>. Leaderboard: <https://www.arcreport.ai/leaderboard>. Licence: CC-BY-4.0.

ARC-100 v1 is a fixed, public set of 100 real stores (frozen 2026-10-07). Run your shopping agent on them, **stop before payment**, and send the results. Free, no account.

Files in this repo: [`benchmark/arc-100/v1/`](../benchmark/arc-100/v1/) (`arc-100.csv`, `arc-100.json`, `selection-inputs.json`, `submission.schema.json`, card). Validation code: [`benchmark/src/submission.ts`](../benchmark/src/submission.ts). Selection code: [`benchmark/src/select.ts`](../benchmark/src/select.ts).

## 1. Run

1. Download the test set. Each row has an `id` (`arc100-v1-001` … `arc100-v1-100`), the store `host` and a fixed `product_url`.
2. For each store, give your agent the task: *"Add this product to the cart: <product_url>"*. Protocol agents (UCP, MCP, ACP, APIs) may start from the store host and the product name or URL instead.
3. **Stop before payment.** Never enter payment details or place an order. Submissions must state `stopped_before_payment: true`.
4. Record one outcome per store. Keep evidence (screenshot, trace or log) at a stable https URL if you want to be verified.

## 2. Format: `arc-leaderboard-submission/v1`

One JSON object. Unknown fields are ignored. Text fields are stored as plain text. JSON Schema: [`submission.schema.json`](../benchmark/arc-100/v1/submission.schema.json).

| Field | Rule |
|---|---|
| `spec` | Required. `"arc-leaderboard-submission/v1"` |
| `test_set` | Required. `"ARC-100 v1"` |
| `agent.name` | Required, up to 60 characters. Name the agent or product you built; don't submit as someone else's agent. |
| `agent.path` | Required. One of `browser`, `ucp`, `mcp`, `acp`, `api`, `other` |
| `agent.version`, `builder`, `model`, `url` | Optional. `url` must be https. |
| `run.stopped_before_payment` | Required. Must be `true`. |
| `run.started_at`, `finished_at` | Optional ISO 8601 times within the last 90 days. |
| `run.notes` | Optional, up to 500 characters. |
| `results[]` | Required. 10 to 100 items: `id` (or `host`), `outcome`, optional `at`, `evidence_url`, `steps`, `seconds`. |
| `contact` | Optional and private. Never published. |

### Outcomes

- `added_to_cart`: the product (or closest in-stock variant) is in the cart. **Success.**
- `checkout_reached`: reached checkout or got a checkout link back, stopped before payment. **Success.**
- `no_cart`: ran but didn't get the product into a cart.
- `blocked`: the store blocked the agent (bot wall, captcha, HTTP 403). Counts as no cart.
- `error`: the agent's own run broke. Left out of n.
- `not_attempted`: skipped. Left out of n.

n = all results except `error` and `not_attempted`; at least 10 must count. Rates are shown with a Wilson 95% interval ([`benchmark/src/stats.ts`](../benchmark/src/stats.ts)), the same as ARC's own rows.

A complete valid example is produced by `submissionExample()` in `submission.ts` (it is rejected on submit so it never lands on the board).

## 3. Submit

```bash
curl -X POST https://www.arcreport.ai/api/leaderboard/submit \
  -H 'content-type: application/json' \
  -d @my-run.json
```

Returns `201` with an id, or `400` with the first problem found (200 KB max). The free MCP server at `https://www.arcreport.ai/api/ask` has a `submit_leaderboard_run` tool taking the same object. Limits: 5 submissions per network per day; sending the same run twice returns the first id.

## 4. Verification

Every submission is listed as **unverified** straight away, in its own table, never mixed into ARC's ranked rows. To verify, ARC samples at least 10 of the stores you reported, checks your evidence and re-runs those stores. If results agree on at least 8 of 10 the run is marked **verified**; otherwise **rejected** with the reason.

## How ARC-100 v1 was picked

1. Eligible: every Index store with a published browser result and a completed HTTP check, plus every directory store with a completed HTTP check in the 30 days before 2026-10-07 that found a real product page on the store's own domain (gift cards, samples and subscriptions left out).
2. Quota: 9 per category across 11 categories, plus one more in Beauty (the largest) to make 100.
3. In each category, up to 6 Index stores first, then directory stores.
4. Each pick favours a market (from the domain) and platform not yet in that category, with at most 4 country-domain and 4 non-Shopify stores per category. Ties break on SHA-256 of the host with the salt `arc-100-v1`.
5. Frozen. Re-run it yourself: `npm test` checks that `selectArc100(selection-inputs.json)` reproduces the published set exactly.

Limits: the set leans toward stores ARC already lists, which lean English-language and Shopify. Stores can change or close; the set stays fixed within a version and dead stores are noted, not swapped.
