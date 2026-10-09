# How ARC measures agent buyability

Method version `arc-method-2026.10`. The live, canonical version is at <https://www.arcreport.ai/methodology>; every change is logged at <https://www.arcreport.ai/methodology/changelog>. Licence: CC-BY-4.0.

ARC asks one question two ways: **can a personal agent buy from this store?**

## Two lanes

- **Browser lane**: ARC's own browser cart test. This produces the published score.
- **Agent-catalog lane**: a real HTTP check of the store's agent endpoints (UCP, storefront MCP, WebMCP). It never changes the score.

The buy verdict uses both: agents can buy when the catalog returned a checkout link **or** a browser cart shopper added the product to the cart.

## The browser cart test

For each store on the ARC Index, ARC opens one named product page in a real headless browser. Five ARC browser cart shoppers (personas A to E) then try to add that product to the cart.

- Each shopper is an ARC persona with its own instructions (for example social and visual, price-driven, or a scripted crawler that struggles with JavaScript-heavy pages). They are ARC personas, not live sessions of any consumer shopping agent. No one's account or app is used.
- Shoppers behave like a careful visitor: they pick the first in-stock size or colour, dismiss cookie and country pop-ups, stay on the store's own site, never log in, never attempt a CAPTCHA or one-time code, and **stop before any payment details**. Nothing is bought.
- A shopper "chose you" when the product verifiably landed in the cart. "5 of 5" means all five did.
- When shoppers stop, ARC classifies where (size picker, cookie banner, human check, add-to-cart button, blocked at the door) and publishes it with HTTP or screenshot evidence.
- If ARC can't stand behind a result (for example a problem on ARC's side), the store shows *Retest pending*. It is not ranked, and a missing score is not a zero.

## Score

Each shopper's journey gets a depth from 0 to 5: blocked at the door (0), reached the store (1), navigated (2), opened the product (3), added to cart (4), reached checkout (5).

- **Breadth (B)** = average depth across shoppers ÷ 5. A shopper that failed because of an error on ARC's side is left out.
- **Machine readability (M)** = 0 to 100 check of the product page's raw HTML (JSON-LD, schema.org, Open Graph), read without rendering.
- **Score = 100 × (0.7 × B + 0.3 × M)**, then capped so completion dominates:
  - no shopper added to cart → scaled into 0 to 49
  - fewer than half did → capped at 59
  - fewer than three quarters did → capped at 74
  - no shopper reached the store → capped at 25
- Index tests end at add-to-cart, so the highest Index score today is 86.
- Letter bands on older one-off reports (A ≥ 90, B 75–89, C 50–74, D 25–49, F < 25) are a reading aid on the same score, not a separate measure.

## Agent-catalog check (HTTP)

A real HTTP request identified as ARCBot. ARC lists the tools on the store's UCP MCP endpoint (`/api/ucp/mcp`) and storefront MCP endpoint (`/api/mcp`), searches the catalog for the tested product, and asks the cart tool for a checkout link, **stopping before payment**. It reads the UCP profile at `/.well-known/ucp` (an HTML page or bot block is not counted as a profile) and detects the WebMCP storefront adapter. No model call, no order, no score change, and the checkout link itself is not stored. The check is Shopify-shaped, so "no agent catalog" on another platform does not prove agents can't buy.

### Checkout WebMCP (from 2026-10-08)

Shopify stores get a GET-only checkout HTML check using an available variant and isolated cookies. Checkout exposes WebMCP tools (get/update/complete, buyer approval required) when initialisation markers appear; declared tool names are recorded. This is HTML detection, not a live browser session or proof every tool works. ARC never executes JavaScript or checkout tools, supplies buyer data or purchases anything. Checkout tokens and query strings are never saved. Unknown failures and not-checked stores are kept separate from a measured "no".

## Evidence labels

Every published cell carries one of:

- **Measured**: observed by an ARC check (HTTP catalog check, a returned checkout link, a blocked endpoint, or the browser cart test).
- **Inferred**: a reasonable reading of indirect evidence, for example a valid UCP profile *may* enable discovery and checkout on UCP surfaces. ARC does not claim it was tested live.
- **Not measured**: no evidence either way. No block evidence does not mean a store allows agents. An empty count means not measured, not zero.

A detected rail is not a promise that any consumer agent can use it.

## Protocol Matrix stages

For each protocol: **Declared** (a discovery document or marker is present), **Valid** (it passed validation), **Usable** (a tool or catalog answered), **Transacts** (a cart or checkout link came back, or the Index browser cart succeeded). Stages ARC can't see from outside are labelled Not checked rather than counted as no. Per-protocol definitions and what ARC cannot check are listed at <https://www.arcreport.ai/protocols>.

## Personal Agent Protocol watch

The PAP v0.1 spec isn't published yet, so ARC claims PAP support for no store. ARC looks for PAP-shaped links or meta tags and a short list of candidate well-known paths; a match is a watch signal only.

## Dataset definitions

- *Scored store*: a published Index store whose latest completed scan has a score. *Any persona carted*: at least one of the five personas got the product into the cart in that scan. `stores.csv` and the `index` rows of `adoption_history.csv` use the same definition (latest completed scan per store per ISO week).
- Rails rates count each host once, using its latest check. WebMCP is counted only for checks after detection began (18:00 UTC, 6 Oct 2026).
- Definition changes are logged in the method changelog before numbers built on them are published.

## Limits

- Each Index store is tested on one product; a result is a snapshot of that product on that day.
- The Index is a curated list of direct-to-consumer brands, weighted toward apparel and Shopify.
- ARC is independent and neutral across models, protocols and platforms, and is not affiliated with or endorsed by any protocol owner, platform or agent maker.
