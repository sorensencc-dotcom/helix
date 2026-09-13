# Helix Phase 8 unified authority contract request

**Recipients:** Windows HTTP Auth/Platform Owner, ICF Contract Owner, Sigil Contract Owner, and WhichLLM Contract Owner  
**Sender:** Helix Operator (Chris Sorensen)  
**Status:** Delivery packet; not an authority contract or implementation approval.

## Purpose

Helix Phase 8 requires authoritative, versioned, deterministic identity and authentication contracts before HTTP authentication, adapter identity binding, or contract-gate closure.

## Windows Integrated Authentication transport

Supply the Kerberos-preferred and NTLM-fallback handshake, required headers and negotiation flow, SID/UPN/group extraction, downgrade protection, expired/missing/failed-ticket behavior, Helix-envelope mapping, versioning, rotation rules, and deterministic fixtures for success, expired ticket, missing ticket, downgrade, and malformed negotiation.

## ICF identity and receipts

Supply required identity fields and envelope, validation rules, lineage anchors, audit-receipt identity fields, missing/invalid identity behavior, versioning, and deterministic identity/receipt success and failure fixtures.

## Sigil identity, approval, execution, and receipts

Supply required identity envelope and validation, approval and execution identity rules, receipt identity fields, missing/invalid identity behavior, versioning, and deterministic approval, execution, and receipt success and failure fixtures.

## WhichLLM model selection and routing authority

Supply required request/decision identity fields, model/provider/lineage/budget metadata shape, cloud-routing enablement gate (explicit operator opt-in per approved decision), approval and audit trail for model-selection decisions, missing/invalid identity behavior, versioning, and deterministic decision success and failure fixtures. State plainly whether the existing CIC WhichLLM adapter remains sole authority or whether Helix receives a separate authenticated decision endpoint.

## Required delivery format

Each owner supplies a contract document, version-locked CI fixture package, canonical source declaration, change-control and compatibility rules, deprecation policy, and an approval statement: “This is the authoritative contract for Helix Phase 8.”

## Gate rule

Helix will not implement HTTP authentication transport, bind adapter identities, propagate identity into ICF, Sigil, or WhichLLM, or close the Phase 8 contract gate until all four contracts are supplied and approved.

## Appendix: known concrete gaps (grounded in current code, 2026-09-12)

These are not decisions — they are specific mismatches found by inspecting the current Sigil and Helix repositories, included so each owner can answer against real shapes instead of a blank request.

- **Identity has no natural mapping.** Sigil's `sender.owner_id`/`endpoint_id` (`sigil/1` envelope, `sigil/contracts/v1/envelope.example.json`) are relay-registered agent identities bound to Ed25519 keys — they are not Windows accounts. Helix's identity envelope (`src/domain/identity.ts`) carries `{sid, upn, groups}`. There is no existing table linking a Windows SID to a registered Sigil `endpoint_id`; one must be supplied and owned by whoever registers Sigil endpoints. `helixSession.correlationId` (format `corr_[a-z0-9-]+`) and Sigil's plain-string `correlation_id` are already compatible — no mapping needed there.
- **Receipt shapes don't match.** Sigil only emits four terminal receipt states (`acknowledged`, `processed`, `processing_failed`, `dead_letter`; see `sigil/cli/send-with-receipt.mjs`) keyed by `message_id`/`conversation_id` plus the envelope's Ed25519 `signature`. Helix's adapter contract expects a receipt object carrying correlation ID, operator identity, timestamp, an integrity value, and a receipt ID. An adapter must synthesize the Helix shape from Sigil's terminal-state event and envelope signature — this is translation work, not a naming exercise.
- **Capability naming is already solved.** Helix's own `docs/contracts/sigil-v1.schema.json` already constrains `capability` to `^sigil\.[a-z0-9_.-]+$`, and Sigil's `sigil/relay/v1/validate-envelope.mjs` (`capabilityIsCovered`/`targetScopesFor`) enforces per-scope grants with no implicit coverage. No further negotiation needed on this point.
- **Governance-state vocabularies don't line up.** Helix models `governed: boolean` on session identity with fail-closed persistence when unset. Sigil models capability grants and approval state but has no `ordinary/governed` or `automatic/constrained` concept. A reconciliation mapping between the two vocabularies is still needed and is not covered elsewhere in this packet.
- **WhichLLM has no adapter code to inspect.** Only standalone reference docs exist at the Helix operator's workspace root (`whichllm-architecture-topology.html/png`, `whichllm-model-selection-evaluator.md`); no adapter matching CIC's WhichLLM was found in either the Helix or Sigil repositories. This section of the request is fully open, not partially answered by existing code.
