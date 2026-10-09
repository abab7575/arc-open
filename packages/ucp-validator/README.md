# UCP profile validator

The engine behind ARC's free [UCP validator](https://www.arcreport.ai/developers/ucp-validator) and the `GET /api/ucp/validate` endpoint.

It checks a Universal Commerce Protocol business profile (`/.well-known/ucp`) in three layers:

1. **JSON Schema** against the published UCP schema (`profile.json#/$defs/business_schema`, release 2026-08-25, vendored in `src/schema/`).
2. **Spec rules** the schema can't express (authority binding, https endpoints, orphaned extensions), each citing the UCP spec section.
3. **ARC interop hints**, clearly labelled as ARC guidance, not UCP requirements.

```ts
import { validateUcpProfile } from "./src/validate";
// Body as a string or parsed JSON. Optionally pass HttpFacts (status, redirects, headers) for hosting checks.
const report = validateUcpProfile(profileBody);
console.log(report.valid, report.errors, report.warnings, report.info);
```

Pure TypeScript with two dependencies (`ajv`, `ajv-formats`). Fetching is up to you (or use ARC's hosted endpoint). Tests: `npm test` from the repo root. Refresh schemas for a new UCP release: `python3 packages/ucp-validator/vendor-ucp-schemas.py <release>` and update `src/schemas.ts`.

Code: MIT. Vendored schemas: Apache-2.0 (see [NOTICE](NOTICE)).
