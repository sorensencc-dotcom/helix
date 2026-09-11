# ICF adapter v1

Status: Helix candidate specification. It is not an external owner approval or live endpoint contract.

## Authority and transport

ICF owns knowledge, retrieval, context, lineage, evidence, and governance. Helix calls ICF through an explicitly configured adapter. Candidate transport is loopback or configured HTTP with bearer authentication; the endpoint, credential lifecycle, and owner process remain deployment inputs.

## Request and response

Requests use [`icf-v1.schema.json`](icf-v1.schema.json). Responses use the shared versioned envelope: success includes `contract: helix-adapter.v1`, `status: success`, `sources`, `governed`, and `lineageId`; failures include `status: failure`, a stable error code, and a safe message. Unknown fields reject. Raw prompts, governed payloads, and credentials never enter logs or ordinary persistence.

## Behavior

ICF retrieval is automatic unless policy constrains sources. Governed retrieval fails closed when ICF is unavailable. Ungoverned read-only work may degrade, but must disclose degraded status. Requests carry the Helix-owned Windows and session identity envelope; negotiated ICF and Sigil authority claims are optional until those authorities are locked. Retries apply only to owner-declared retryable failures, remain bounded, and preserve correlation identity. Duplicate requests return the original outcome.

## Failure matrix

CI fixtures cover `success`, `timeout`, `unavailable`, `malformed`, `denied`, and `version mismatch`. Malformed, unauthorized, unavailable, and version-incompatible responses never produce a governed answer. Cancellation returns a terminal failure or queued state with the original correlation ID.

## Compatibility

Additive changes require fixture and contract-test updates. Breaking changes require a new major contract identifier and explicit migration. Owner approval is required before this candidate becomes authoritative.
