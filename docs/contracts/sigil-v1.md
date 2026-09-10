# Sigil adapter v1

Status: Helix candidate specification. It is not an external owner approval or live endpoint contract.

## Authority and transport

Sigil owns execution, approvals, capabilities, and environment interaction. Helix never executes actions directly. Helix submits proposed work through an explicitly configured adapter. Candidate transport is loopback or configured HTTP with bearer authentication; endpoint, credential lifecycle, and owner process remain deployment inputs.

## Request and response

Requests use [`sigil-v1.schema.json`](sigil-v1.schema.json). A proposal includes a namespaced capability, bounded arguments, separate Windows/ICF/Sigil identities, and a correlation ID. Success includes `contract: helix-adapter.v1`, `status: success`, `proposalId`, and `state` (`APPROVAL_REQUIRED` or `DENIED`). Helix may not treat approval-required as execution. Unknown fields reject.

## Behavior

Every proposed action requires capability validation, scope validation, identity verification, and Sigil approval before execution. Execution results require a Sigil receipt; absence of a receipt is failure. Retries and cancellation preserve proposal and correlation identity and follow owner-declared rules. Duplicate submissions return the original proposal/outcome.

## Failure matrix

CI fixtures cover `success`, `timeout`, `unavailable`, `malformed`, `denied`, and `version mismatch`. No failure or missing receipt authorizes local execution. Cancellation returns a terminal receipt or a deterministic retained/queued state.

## Compatibility

Additive changes require fixture and contract-test updates. Breaking changes require a new major contract identifier and explicit migration. Owner approval is required before this candidate becomes authoritative.
