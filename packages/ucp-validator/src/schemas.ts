// Published UCP JSON Schemas, vendored byte-for-byte (re-indented) from
// https://ucp.dev/2026-08-25/schemas/ — the transitive closure of profile.json.
// Source of truth: github.com/Universal-Commerce-Protocol/ucp, tag v2026-08-25
// (source/schemas/*, published with absolute versioned $id/$ref). Apache-2.0.
// Refresh: packages/ucp-validator/vendor-ucp-schemas.py <release>.
import capability from "./schema/2026-08-25/capability.json";
import availablePaymentInstrument from "./schema/2026-08-25/common/types/available_payment_instrument.json";
import constraintExpression from "./schema/2026-08-25/common/types/constraint_expression.json";
import requestConstraints from "./schema/2026-08-25/common/types/request_constraints.json";
import reverseDomainName from "./schema/2026-08-25/common/types/reverse_domain_name.json";
import paymentHandler from "./schema/2026-08-25/payment_handler.json";
import profile from "./schema/2026-08-25/profile.json";
import service from "./schema/2026-08-25/service.json";
import embeddedConfig from "./schema/2026-08-25/transports/embedded_config.json";
import ucp from "./schema/2026-08-25/ucp.json";

export const UCP_RELEASE = "2026-08-25";
export const UCP_SCHEMA_BASE = `https://ucp.dev/${UCP_RELEASE}/schemas/`;
export const UCP_PROFILE_SCHEMA_ID = `${UCP_SCHEMA_BASE}profile.json`;
export const UCP_BUSINESS_SCHEMA_REF = `${UCP_PROFILE_SCHEMA_ID}#/$defs/business_schema`;
export const UCP_SPEC_URL = `https://ucp.dev/${UCP_RELEASE}/specification/overview/`;
export const UCP_SOURCE_REPO = "https://github.com/Universal-Commerce-Protocol/ucp";
export const UCP_SOURCE_TAG = `${UCP_SOURCE_REPO}/tree/v${UCP_RELEASE}/source/schemas`;

export const UCP_SCHEMAS: readonly object[] = [
  profile,
  ucp,
  service,
  capability,
  paymentHandler,
  reverseDomainName,
  requestConstraints,
  constraintExpression,
  availablePaymentInstrument,
  embeddedConfig,
];
