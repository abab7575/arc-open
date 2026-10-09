---
license: cc-by-4.0
pretty_name: "ARC: can AI shopping agents buy from these stores?"
---

# Online stores checked: can AI shopping agents buy from them?

A free, open, per-store answer to one question: **can an AI shopping agent find products and reach checkout at this store?** Published by [ARC](https://www.arcreport.ai) at [arcreport.ai/data](https://www.arcreport.ai/data) under CC-BY-4.0. A new dated snapshot every Monday.

**Start with `store_answers`**: one row per store, plain yes/no answers, a one-sentence verdict, the single most useful fix, and a link to the store's page on ARC with the details.

## Column dictionary: `store_answers`

| Column | What it means |
|---|---|
| `domain` | The store's website, without www. |
| `store_name` | Store name from ARC's curated list. Empty for stores added by the public. |
| `category` | What the store sells (ARC's label). Empty when ARC has not labelled it. |
| `platform` | Shop software detected from the homepage (for example Shopify). "Not detected" means no known fingerprint (often a custom site). Empty means the homepage could not be read. |
| `market` | Where the storefront sells (ARC's curated label, not measured). Empty when not labelled. |
| `checked_at` | Date (UTC) of the latest automated check. |
| `can_agents_find_products` | Could an AI agent search the store's products through a machine-readable agent connection and get a product back (the specific product, for the ~90 Index stores where ARC tests one)? yes / no / blocked (bot protection returned a block page to ARC's check) / not_tested (the check did not finish). "no" is about agent connections only: an agent may still click through the website like a person. |
| `can_agents_read_price_and_stock` | Does the product page ARC opened list price and stock in structured data agents can read (schema.org Product)? yes / no / not_tested (no product page could be opened). |
| `can_agents_get_checkout_link` | Did the agent connection hand back a checkout link for a product it returned? yes / no / not_tested. ARC stops there: it never pays or places an order, so "yes" means an agent can reach checkout, not that a purchase was completed. |
| `agent_catalog_type` | Which agent connection answered with a product search tool: Shopify UCP MCP, Shopify Storefront MCP, or none. |
| `ucp_profile_valid` | Does the store publish a valid Universal Commerce Protocol profile at /.well-known/ucp? yes / no / unknown (blocked or errored). |
| `webmcp` | Does the homepage declare WebMCP tools for in-browser agents? yes / no / not_tested (checks before 6 Oct 2026). |
| `blocks_ai_crawlers` | Does robots.txt disallow at least one of the AI crawlers ARC tracks (answer, search or training bots) from the homepage or tested product? yes / no / unknown (robots.txt could not be read). A rule in a file, not an observed block. |
| `blocks_ai_answer_agents` | Same, but only for AI assistants fetching pages for a user (for example ChatGPT-User, Perplexity-User). yes / no / unknown. |
| `browser_cart_test` | Result of ARC's separate browser cart test, where it exists (about 90 stores): for example "2 of 5 added to cart". Empty means no browser test. |
| `verdict` | A plain answer to "can AI agents buy from this store?", the same sentence as the store's ARC page. "Can buy" means ARC's agent got a checkout link (or browser test shoppers got the product into the cart); ARC always stops before paying. |
| `top_fix` | The most useful change for the store, in plain words, the same as the first fix on its ARC page. Empty when nothing is needed. |
| `checked_by` | How the answer was measured: "automated HTTP check" or "automated HTTP check + browser cart test". |
| `evidence_url` | The store's page on ARC with the full details. |
| `tested_url` | The page the check started from: the homepage for most stores, one product page for Index stores (query string removed). |
| `source` | How the store got into ARC: index (weekly browser Index), directory (ARC's curated list), submitted (added by the public) or checked (one-off check). |
| `snapshot_date` | Date of this snapshot. |
| `method_version` | Version of ARC's method used. |

## How it is measured

Two separate methods. Every row says which one it comes from (`checked_by`).

1. **Automated HTTP check (every store).** A plain program, not an AI model and not a browser, requests the store's machine-readable shopping interfaces the way an agent would: the Universal Commerce Protocol profile at `/.well-known/ucp`, Shopify's agent catalog endpoints (`/api/ucp/mcp`, `/api/mcp`), a product search, and the cart step that returns a checkout link. It also reads the homepage (platform fingerprint, WebMCP tags) and robots.txt. It identifies itself, runs at most about once per host per week, and never pays or places an order.
2. **Browser cart test (fewer than 100 Index stores only).** Five ARC browser test shoppers each try to put one real product in the cart through the normal website, stopping before payment. Shown in `browser_cart_test`. These are ARC's own test runs, not sessions of any named consumer AI product.

## Limitations (please read before citing)

- **A checkout link is not a purchase.** ARC stops at the link. "yes" means an agent could reach checkout through the store's agent connection on the check date, not that an order would succeed.
- **"no" is about agent connections only.** A store without one can still be used by an agent that clicks through the website like a person. Our browser cart test covers that, but only for fewer than 100 stores.
- **One check, one moment.** Each answer is the store's latest check (dates in `checked_at`). Stores, bot protection and stock change; a single failed check can be temporary.
- **"blocked" means ARC's own request got a block page.** Real agents may or may not be treated the same way.
- **robots.txt is a rule in a file, not an observed block.** Bots may ignore it, and firewalls may block bots that robots.txt allows.
- **The store list is a sample, not all of e-commerce.** It is ARC's curated directory plus stores the public submitted. It leans toward English-language, direct-to-consumer brands and toward Shopify.
- **Labels such as `category` and `market` are ARC's curated labels**, not measurements.
- `not_tested` and `unknown` are used only where there is genuinely no result; they never mean "no".

## Other tables

The full technical detail stays available alongside `store_answers`:

| Table | One row per | What it holds |
|---|---|---|
| `rails_checks` | Store | The raw fields of the automated HTTP check (UCP profile status, MCP endpoints, catalog tool, cart status, WebMCP, platform id, evidence label) |
| `stores` | Index store | Browser cart test results: score, test shoppers that added to cart, failure label, per-persona outcome |
| `adoption_history` | Week × source × metric | Weekly counts |
| `protocol_matrix` | Protocol × stage | Declared / Valid / Usable / Transacts counts per protocol |
| `personas` | Browser test shopper | The five browser test personas |

Field reference for the technical tables: [arcreport.ai/data/README.md](https://www.arcreport.ai/data/README.md). Method and changelog: [arcreport.ai/methodology](https://www.arcreport.ai/methodology).

## What is excluded

No scraped page text or product copy, no model-written prose, no costs, no emails, accounts or visitor data. Only ARC's own answers, signals, URLs and dates.

## Licence, citation, corrections

[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Attribution: **ARC, arcreport.ai**. Store owners can ask for a correction or removal at [arcreport.ai/contact](https://www.arcreport.ai/contact).
