# Helix Phase 8 external adapter contract request

**Recipients:** ICF contract owner; Sigil contract owner  
**Sender:** Helix operator (Chris Sorensen)  
**Status:** Request for authoritative inputs; not an approval or protocol lock.

## Purpose

Helix Phase 8 requires authoritative, versioned, deterministic adapter contracts for ICF and Sigil. Helix cannot bind either adapter or close the Phase 8 contract gate until the required artifacts below are supplied and approved.

## Required deliverables

Each owner must provide all six categories.

### 1. Protocol specification

- Transport: HTTP, gRPC, named pipe, local process, or other.
- Endpoint/process model: URLs, ports, executable path, invocation flags, and streaming behavior.
- Authentication: mechanism, renewal, rotation, and missing/invalid credential behavior.
- Versioning: required version field, compatibility, downgrade/upgrade, mismatch, and deprecation rules.
- Identity propagation: operator, session, task, and correlation IDs; envelope fields; lineage anchors.

### 2. Request and response schemas

- Complete JSON Schema or equivalent for every request and response.
- Required and optional fields, types, constraints, and enumerations.
- Deterministic unknown-field behavior: reject, ignore, or preserve.
- Error taxonomy: malformed, unauthorized, unavailable, denied, timeout, version mismatch, and cancellation.
- Governance envelope rules: lineage, hash-chain, signatures, receipts, and redaction.

### 3. Runtime behavior rules

- Per-stage, total, and streaming timeouts.
- Retry permission, backoff, maximum attempts, and repeated-failure behavior.
- Cancellation propagation, cancellation receipts, partial-work behavior, and cancellation idempotency.
- Correlation-ID reuse, duplicate-request, deduplication, and replay semantics.
- Per-operator, per-session, and per-daemon rate limits and exhaustion behavior.

### 4. Identity and audit requirements

- Required identity fields and verification rules.
- Receipt fields, signatures, timestamps, and lineage anchors.
- Governance wrapping, redaction, and hashing rules.
- Failure-case receipts for timeout, cancellation, malformed, denied, unavailable, and version-mismatch outcomes.

### 5. Deterministic fixtures

Provide version-locked, reproducible CI fixtures for:

- success;
- timeout;
- unavailable;
- malformed;
- denied; and
- version mismatch.

Fixtures must not require live services.

### 6. Contract source declaration

- Canonical repository or package identity.
- Versioning discipline and compatibility guarantees.
- Change-control and deprecation policy.
- Authoritative owner or contact for future revisions.

## Required delivery format

1. Contract document containing protocol, schemas, runtime behavior, identity/audit rules, errors, and versioning.
2. Fixture package containing deterministic, version-locked CI fixtures.
3. Source declaration containing canonical identity and change-control rules.
4. Approval statement: “This is the authoritative contract for Helix Phase 8,” signed by the owner or designated authority.

## Gate rule

Until all required artifacts are supplied and approved, Helix will not:

- bind ICF or Sigil;
- infer or substitute schemas;
- emulate missing boundaries;
- downgrade contract versions; or
- claim a three-adapter contract lock or Phase 8 acceptance.

WhichLLM remains separately identified as the existing `@cic/whichllm-integration-pack` v1.0 integration authority. This request does not alter that decision.
