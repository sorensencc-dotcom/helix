# Review: Helix Phase 8 current tree

Reviewed: 2026-09-10
Repo: `C:\dev\helix` (`main`)
Scope: current candidate implementation, contract documents, and project-spec alignment.

## Verdict

**FAIL — candidate scaffolding; not a protocol lock or Phase 8 acceptance.**

The high-level project specification is directionally consistent with the Phase 8 implementation plan. It is more complete: it defines session/task lifecycles, configuration precedence, error taxonomy, persistence rules, client states, performance limits, and release evidence that the plan only summarizes. Treat the project spec as the guidance source and expand the implementation plan with traceability before claiming completion.

## Current findings

- `src/daemon/server.ts:45-48`: **BLOCK** daemon uses in-memory `Set`/`Map`; `SqliteSessionStore` and `SessionService` are not wired, so project-spec persistence and task lifecycle guarantees are not live.
- `src/daemon/server.ts:89-92`: **FLAG** idempotency keys are global across routes and sessions; namespace by authenticated operator, session, method, and route.
- `src/daemon/server.ts:49-84`: **FLAG** no Windows/operator authentication or loopback enforcement; reject non-loopback bind addresses until the access layer exists.
- `src/daemon/server.ts:116-124`: **FLAG** task payload is not validated and the daemon does not implement the project-spec task states, correlation ID, or durable governance status.
- `src/daemon/server.ts:76-82`: **FLAG** SSE replay is a fixed two-event response, not reconnectable task streaming with correlation identity, cancellation, backpressure, or stream lifetime limits.
- `src/infrastructure/config.ts:3-8`: **FLAG** configuration covers only host, port, and version; project spec requires versioned validation for endpoints, identity, limits, retention, queues, secrets, and release settings.
- `src/adapters/contracts.ts:70-76`: **FLAG** Sigil arguments still accept arbitrary nested unknown values; define capability-specific schemas and data-classification limits.
- `docs/contracts/icf-v1.schema.json:1-31`: **FLAG** schema defines the request only; add response, failure, lineage, evidence, and receipt schemas or label the document request-only.
- `docs/contracts/sigil-v1.schema.json:1-24`: **FLAG** schema defines the proposal request only; add approval, execution-receipt, and failure schemas.
- `src/clients/daemon-client.ts:20-36`: **FLAG** client trusts successful JSON without schema validation; validate status/session/task responses before exposing them to clients.
- `web/index.html:153-155`: **FLAG** browser displays “ICF Connected” and “Sigil Connected” statically while no adapters are wired; derive connection state from daemon readiness and fail closed on unknown state.
- `src/cli.ts:4-22`: **FLAG** CLI reports local configuration as `READY` without contacting the daemon or checking adapter readiness; distinguish configured, reachable, and ready states.
- `packaging/validate-manifest.mjs:1-13`: **NIT** manifest validation uses substring checks and named logo paths have no assets; parse XML and validate referenced assets before package claims.

## Project spec versus implementation plan

Aligned:

- Both preserve ICF, WhichLLM, and Sigil as separate authorities behind adapters.
- Both require versioned contracts, deterministic fixtures, fail-closed governance, encrypted ordinary history, RAM-only governed content, client parity, and separate release evidence.
- Both block signing and publishing until release inputs exist.

Plan gaps exposed by the project spec:

- Add explicit work items for Windows authentication, loopback enforcement, and identity-to-ICF/Sigil mapping.
- Add session and task lifecycle implementation with legal transitions, durable identifiers, receipts, expiry, and purge behavior.
- Add configuration schema, precedence, secret storage, endpoint validation, and unsafe-bind rejection.
- Add the project-spec error taxonomy and complete stable error envelope fields.
- Add retention, deletion, export, DPAPI key-loss, crash-file, and copied-database tests.
- Add client-state, accessibility, performance, backpressure, and disconnect behavior to the Phase 8 test plan.
- Add JSON Schema response/receipt coverage and trace each candidate schema to executable fixtures.

## Evidence

- Local candidate checks previously recorded: `npm run check` — 7 files, 24 tests.
- Candidate JSON schemas parse as JSON.
- No live adapter endpoints, remote delivery, signed MSIX, clean-machine lifecycle, or production approval were established.
- Current working tree contains uncommitted implementation and unrelated generated/scaffold files; preserve scope before staging or delivery.

## Required next gate

Do not close the contract gate or call Phase 8 accepted. First decide whether to:

1. wire the daemon to authenticated, durable services and complete the project-spec traceability items; or
2. keep this as candidate scaffolding and label every unimplemented guarantee accordingly.
