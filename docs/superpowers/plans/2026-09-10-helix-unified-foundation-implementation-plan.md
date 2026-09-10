# Helix unified foundation implementation plan

**Design source:** `docs/superpowers/specs/2026-09-10-helix-unified-foundation-design.md`
**Status:** Draft; implementation not started

## Delivery strategy

Build a Windows-first TypeScript modular monolith. Establish contracts and policy before adapters, then wire the daemon, clients, persistence, distribution, and CI. Keep all external integrations behind ports and deterministic test doubles.

## Phase 1: Repository and runtime foundation

- Add `package.json`, TypeScript configuration, linting, formatting, test configuration, and CI workflow.
- Define `src/domain/` contracts for sessions, context packets, model decisions, responses, capabilities, errors, states, and correlation IDs.
- Define `src/application/` services for session policy, retrieval orchestration, model selection, action proposal, disclosure assembly, persistence, and audit projection.
- Define `src/infrastructure/` ports and adapter boundaries without connecting external systems yet.
- Add startup configuration validation and a daemon health/status endpoint.

Acceptance: type checks, lint, unit tests, and daemon startup pass; dependency direction is enforced by tests or lint rules.

## Phase 2: Identity, capability, and state policy

- Implement Windows `CurrentUser` identity authentication.
- Implement distinct Windows, ICF, and Sigil identity fields in request envelopes.
- Implement the versioned deny-by-default capability registry.
- Implement normalized scopes, authorization decisions, stable error envelopes, legal state transitions, retryability, and idempotency keys.
- Add redaction utilities and ensure secrets and governed payloads cannot enter logs or telemetry.

Acceptance: unauthorized scopes, identity mismatch, replay, invalid transitions, duplicate requests, and secret-redaction tests pass.

## Phase 3: ICF, WhichLLM, and Sigil contracts

- Add versioned JSON Schemas and behavior specifications under `docs/contracts/`.
- Implement adapter ports and deterministic fixtures for ICF context packets, retrieval, lineage, evidence logging, and queue submission.
- Implement WhichLLM catalog discovery, priority ordering, capability filtering, automatic selection, cloud opt-in, and explicit override validation.
- Implement Sigil task proposals, capability checks, approval outcomes, execution receipts, and cancellation propagation.
- Add contract tests for success, timeout, malformed response, unavailable service, retry, and version mismatch.

Acceptance: adapters cannot bypass policy, unknown capabilities are rejected, governed retrieval fails closed, cloud use requires opt-in, and Helix never executes directly.

## Phase 4: Persistence and governed memory

- Implement encrypted ordinary-chat storage using SQLite and DPAPI `CurrentUser` key protection.
- Add schema versioning, authenticated envelope encryption, key-version handling, retention, deletion, and recovery states.
- Keep governed content in RAM-only session structures excluded from ordinary persistence, logs, crash reports, and routing metadata.
- Implement explicit encrypted exports with SHA-256 checksums, replacement-source preservation, mutation logging, and cryptographic deletion acknowledgment.
- Test copied databases, crash files, temporary files, backups, key loss, deletion completeness, and secret leakage.

Acceptance: ordinary history survives restart encrypted; governed content does not persist unless explicitly exported; failed replacement preserves the prior valid export.

## Phase 5: HTTP daemon and streaming

- Implement versioned HTTP routes for health, sessions, model catalog, task submission, streaming responses, status, cancellation, export, and deletion.
- Use SSE events `delta`, `metadata`, `error`, and terminal `done` with correlation-ID reconnect semantics.
- Enforce request, evidence, response, timeout, concurrency, queue, and streaming-duration bounds.
- Implement cancellation, backpressure, client disconnect cleanup, durable governed queue status, and metrics.

Acceptance: integration tests cover normal, degraded, queued, cancelled, expired, denied, duplicate, and disconnected-client flows.

## Phase 6: CLI and browser clients

- Implement CLI commands `start`, `stop`, `status`, `doctor`, `uninstall`, session operations, model selection, source scope, streaming, cancellation, export, deletion, and machine-readable JSON.
- Implement focused browser operator console with conversation-first hierarchy, model picker, scope controls, persistence indicator, source disclosure, lineage state, error states, and Sigil approval cards.
- Support keyboard navigation, visible focus, screen-reader labels, text status equivalents, WCAG 2.1 AA contrast, narrow-window layouts, and long-name/evidence handling.
- Add CLI and browser E2E tests against the real local daemon.

Acceptance: CLI and browser produce equivalent policy outcomes and expose all required state disclosures.

## Phase 7: Packaging and delivery

- Produce a signed Windows x64 MSIX containing daemon, CLI, and browser assets.
- Register per-user lifecycle without administrator privileges.
- Define configuration, data, export, logs, and cache locations.
- Implement checksum verification, upgrade preservation, failed-start rollback, and uninstall safeguards.
- CI builds, tests, signs, and publishes versioned artifacts through the selected release channel.

Acceptance: clean-machine install, start, upgrade, rollback, uninstall, and history/export preservation tests pass.

## Required test matrix

- Unit: policy, scopes, capabilities, states, disclosures, idempotency, retention, encryption metadata, and checksums.
- Contract: ICF, WhichLLM, Sigil, and identity schemas plus all failure matrices.
- Integration: daemon with encrypted storage and disposable adapters.
- Security: authorization, replay, redaction, copied database, crash artifacts, key loss, and deletion.
- E2E: HTTP, CLI, and browser flows across ready, degraded, queued, denied, approval, cancellation, and expiry states.
- Performance: concurrent clients, slow adapters, large evidence, bounded queues, disconnects, and repeated transient failures.
- Evaluation: model-routing and response-grounding checks once real prompt templates and tool definitions exist.

## Delivery gates

1. Do not implement domain-specific IronLedger or IronCommand Forge workflows until Phases 1–6 pass.
2. Do not enable write capabilities until a separate capability registration and Sigil approval design is approved.
3. Do not claim standalone usability until Phase 7 passes on a clean Windows machine.
4. Do not claim production readiness from local tests alone; report focused, full-suite, live, remote, and production evidence separately.

## Known blockers

- ICF, WhichLLM, and Sigil production contract details must be confirmed before adapter implementation.
- The new repository has no manifest yet, so the shared repository preflight cannot pass until Phase 1 adds one.
- Signing identity and release channel for the MSIX must be supplied before packaging work.
