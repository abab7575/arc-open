# Contributing to ARC Open

Thanks for helping. ARC aims to be a neutral, honest public record of agentic commerce, so contributions are judged on accuracy and evidence first.

## Good contributions

- **Bug reports** in `arcreport-check` or the UCP validator: include the store or profile, the command you ran and the output.
- **Spec accuracy**: if a validator rule disagrees with the published UCP spec, open an issue citing the spec section.
- **New checks or protocols**: describe what is observable from outside (an HTTP endpoint, a well-known file, a marker) and how to tell *Measured* from *Inferred*.
- **Docs**: clearer wording is always welcome.
- **Benchmark**: ARC-100 v1 is frozen. Proposals for v2 (stores, categories, balance rules) are welcome as issues.

## Rules

1. **Neutral.** No favouring or disparaging a model, agent, protocol, platform or payment company. Name things only when the evidence is about them.
2. **Honest labels.** Every claim is Measured, Inferred or Not measured. Not measured is never shown as zero or "no".
3. **Never buy.** Tests and examples must stop before payment and never place real orders or enter payment details.
4. **No personal data or secrets.** No emails, tokens, keys, cookies or customer data in code, fixtures or issues.
5. **Tests pass.** Run `npm ci && npm test && npm run typecheck` before opening a PR. Keep `arcreport-check` dependency-free.

## Process

Open an issue for anything bigger than a small fix, then a pull request against `main`. By contributing you agree your code is released under MIT and your data/docs under CC-BY-4.0.

Questions or corrections about a specific store's results: <https://www.arcreport.ai/contact>.
