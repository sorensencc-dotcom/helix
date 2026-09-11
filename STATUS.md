# Helix status

## Current goal

Build the unified foundation for Helix, a local personal AI assistant serving IronLedger and IronCommand Forge.

## Approved decisions

- Local Windows daemon with HTTP API, CLI, and browser UI from the first release.
- ICF owns knowledge, retrieval, context, lineage, audit, and governance.
- Sigil owns execution, approvals, capabilities, and environment interaction.
- Windows identity controls local access; ICF and Sigil identities remain distinct.
- WhichLLM manages model selection; cloud routing requires explicit operator enablement.
- Automatic retrieval is default; operators can constrain or explicitly select sources.
- Governed content fails closed when ICF is unavailable; ungoverned reasoning may degrade read-only; governance-grade work queues.
- Ordinary conversations persist in encrypted local storage; governed content remains RAM-only unless explicitly exported or pinned.
- Foundation begins read-only; future mutations require registered capabilities and Sigil approval.

## Artifacts

- Design: `docs/superpowers/specs/2026-09-10-helix-unified-foundation-design.md`
- Implementation plan: `docs/superpowers/plans/2026-09-10-helix-unified-foundation-implementation-plan.md`
- Proposed Phase 8 design: `docs/superpowers/specs/2026-09-10-helix-phase-8-integration-release-readiness-design.md`

## Commits

- `6f3e0a6` — foundation design
- `e1f6dab` — client design completion
- `7279be8` — engineering design completion
- `83471c6` — runtime contract hardening
- `8b111d7` — implementation plan
- `aabf48a` — Phase 8 authority lock: canonical `HELIX_*_URL` endpoints and
  identity/receipt field mappings for ICF, Sigil, WhichLLM; no credentials
  recorded, live activation still gated on reachable DNS and owner-verified
  integration evidence

## Next action

Obtain concrete ICF, WhichLLM, and Sigil owner protocols before implementing live adapter transport. No live endpoint tests are possible yet — the authority lock records approved URLs but activation is still gated on reachable DNS and Windows-authenticated integration evidence.

## Blockers

- Confirm concrete ICF, WhichLLM, and Sigil adapter protocols before integration work.
- Supply MSIX signing identity and release channel before packaging work.

## Audits (2026-09-11)

- Doc link audit: all `.md` cross-references in `README.md` and `docs/` resolve. Found and fixed two real defects from the authority-lock commit: a literal `` `r`n `` escape sequence leaked into `docs/contracts/README.md` (merged two list items onto one line), and a stale filename in `README.md` pointing at a non-dated `helix-phase-8-implementation-plan.md` instead of the actual `2026-09-10-helix-phase-8-implementation-plan.md`.
- Diagram: `docs/diagrams/helix-architecture.html`/`.svg` existed but had no PNG per the Cathryn Lavery diagram-design standard. Rendered `helix-architecture.png` via headless Chrome and repointed the `README.md` embed from `.svg` to `.png`.
- `npm run check`: 13 test files, 44 tests, all pass.

## Working state

Branch `main`, six commits ahead of `origin/main`. Uncommitted implementation now includes Phase 6 CLI/browser placeholders and Phase 7 CI/package dry-run scaffolding. `npm run check` passes with 24 tests; `npm run cli -- status` returns machine-readable READY status.

## Phase 8 slice

- Added candidate `helix-adapter.v1` schemas for ICF, WhichLLM, and Sigil with strict unknown-field rejection.
- Added deterministic success, timeout, unavailable, malformed, denied, and version-mismatch contract fixtures in `tests/adapters-contracts.test.ts`.
- Added fail-closed response parsing that normalizes malformed responses to `MALFORMED_RESPONSE`.
- Added candidate boundary negotiation and timing-safe bearer authentication primitives.
- Added candidate SQLite-backed ordinary-session persistence with encrypted records and injected key provider; not wired into `createDaemon`.
- Persistence now fails closed unless `context.governed === false`; DPAPI `CurrentUser` provider remains a Windows-specific follow-up.
- Added bounded daemon request parsing, catalog/status routes, session/task creation, cancellation, and idempotency replay.
- Added real-daemon route tests and stable SSE event IDs with `Last-Event-ID` replay.
- Added candidate shared daemon client and browser Send flow using session/task HTTP contracts; daemon storage and adapter wiring remain incomplete.
- Added client integration coverage against the real daemon.
- Added explicitly unsigned AppX/MSIX manifest metadata and deterministic manifest validation.
- `npm run package:validate` and `npm run package` pass; signing, installation, and publishing remain unverified.
- `npm run check` passes: 7 test files, 24 tests.
- External protocol lock remains blocked pending owner-supplied endpoint, authentication, schema, retry, identity, and receipt contracts.
- Review remediation applied: strict offer parsing, genuine malformed fixture, valid-version unknown-field coverage, bounded correlation IDs and Sigil arguments, and candidate contract documentation.
- Second-look remediation applied: persistence fails closed without explicit ordinary context, named ICF failure fixtures restored, success envelopes versioned, and unused daemon wiring labeled as candidate scaffolding.
- Created `docs/contracts/helix-phase-8-external-adapter-contract-request.md` for ICF and Sigil owner delivery.
- Added candidate ICF and Sigil v1 Markdown behavior specifications and JSON Schemas under `docs/contracts/`; these use existing project decisions and remain pending owner/operator approval.
- Candidate schema JSON validation and `npm run check` pass: 7 files, 24 tests.
- Release gate evidence: repository preflight passed; focused/full local checks passed (7 files, 24 tests); unsigned manifest validation and npm package dry-run passed. These are local candidate-slice checks only.
- Evidence not established: live adapter endpoints, remote delivery, signed MSIX, clean-machine install/upgrade/rollback/uninstall, and production approval.
- Plan-eng review completed: architecture, code quality, test, and performance decisions recorded in `docs/superpowers/plans/2026-09-10-helix-phase-8-implementation-plan.md`; verdict remains conditional pending implementation and evidence.
- Approved next gates: authenticated live vertical path, authoritative identity/receipt flow, daemon-wired persistence, full lifecycle and SSE replay, client E2E, adapter failure matrix, security/readiness tests, packaging XML validation, and performance isolation benchmarks.
- Implemented next slice: idempotency entries now bind to method/route/body fingerprints and conflicting key reuse returns `IDEMPOTENCY_CONFLICT`; focused/full local check remains green at 7 files and 24 tests.
- Implemented task admission hardening: daemon task creation now requires a non-empty instruction capped at 32,000 characters, and the shared client sends the instruction through the canonical HTTP contract.
- Implemented two additional slices: daemon client success responses now pass strict Zod schemas, and configuration rejects non-loopback bind hosts by default. Full check passes with 25 tests.
- Implemented two more slices: daemon JSON bodies must be objects, and idempotency keys are bounded and character-validated; invalid inputs receive stable errors. Full check passes with 26 tests.
- Implemented two more slices: session IDs now have bounded safe syntax, task instructions reject NUL input, and daemon client schema failures normalize to `CONTRACT_INVALID_RESPONSE`. Full check passes with 27 tests.
- Implemented two more slices: queued tasks now receive daemon-generated correlation IDs, and duplicate explicit session IDs return `SESSION_ALREADY_EXISTS`. Full check passes with 27 tests.
- Implemented two lifecycle slices: added canonical `GET /v1/tasks/:id` retrieval through the shared client, and repeated cancellation now returns `TASK_ALREADY_CANCELLED` instead of silently mutating state. Full check passes with 27 tests.
- Implemented two session-lifecycle slices: added `DELETE /v1/sessions/:id` through the shared client, and closure now rejects sessions with queued tasks using `SESSION_HAS_ACTIVE_TASKS`. Full check passes with 27 tests.
- Implemented two boundary slices: session/task creation now requires `application/json`, and shared-client tests prove active-session closure is rejected until queued work is resolved. Full check passes with 28 tests.
- Implemented contract-validation slice: daemon client task responses now use strict schemas and canonical task states; malformed successful responses fail as `CONTRACT_INVALID_RESPONSE`. Full check passes with 29 tests.
- Team review blocker: auth sidecar confirmed HTTP Windows-identity authentication and adapter identity mapping remain undefined; no invented header or identity source will be implemented until that contract is supplied.
- Added `docs/contracts/windows-http-auth-identity-mapping-draft.md` from the operator-provided proposal. It remains a draft pending Tier 1 approval and ICF/Sigil owner approval; no HTTP auth or adapter identity binding was implemented.
- Implemented identity-envelope foundation in `src/domain/identity.ts`: strict Windows operator and Helix session identities, optional owner-supplied ICF/Sigil identities, and fail-closed unknown/missing-claim validation. Full check passes with 31 tests; transport integration remains contract-gated.
- Added runtime loopback enforcement inside `createDaemon`, closing the direct-construction bypass around config validation. Full check passes with 34 tests.
- Aligned adapter request schemas with the Helix identity envelope: Windows and Helix session identity are mandatory; ICF/Sigil authority identities remain optional until owner fields are locked. Full check passes with 34 tests.
- Synchronized `docs/contracts/icf-v1.schema.json` and `sigil-v1.schema.json` with the runtime identity envelope; contract JSON parsing and full check pass with 34 tests.
- Team slice completed: packaging manifest validation now parses XML, rejects unsafe declarations/duplicate attributes, and validates required Identity/Application fields; ICF/Sigil Markdown contracts now document optional negotiated authority claims. `npm run package:validate` and full check pass with 34 tests.
- Persistence wiring started: added `TaskStore`, `MemoryTaskStore`, and `SqliteTaskStore`; daemon routes now use the injected store, and `src/index.ts` selects file-backed SQLite with shutdown closure via `HELIX_TASK_DATABASE_PATH`. Full check passes with 34 tests.
- Remaining requested integration: real Windows Integrated Authentication resolver and ICF/Sigil transport plus receipt binding. These require concrete runtime endpoint/SSPI implementation details; no insecure header substitute was added.
- Integrated persistence restart coverage from team work: SQLite-backed daemon session/task recovery is tested. Full check now passes with 11 files and 37 tests.
- Added adapter transport foundations in `src/adapters/transport.ts`: explicit unavailable behavior, strict authority receipts, and SID/correlation binding. Native SSPI and live ICF/Sigil calls remain unimplemented pending runtime integration.
- Hardened SQLite task recovery: decrypted task rows now pass strict schema validation before entering daemon state. Full check passes with 37 tests.
- Added `HttpAdapterTransport` with bounded timeouts, identity propagation, injected strict response parsing, and explicit `TIMEOUT`/`UNAVAILABLE` mapping; deterministic local transport coverage passes. Full check passes with 38 tests.
- Added unified delivery packet `docs/contracts/helix-phase-8-unified-authority-contract-request.md` for Windows HTTP Auth, ICF, and Sigil owners. Packet is prepared but not externally sent.
- Added injectable `TaskStore` foundation to `createDaemon`, including `SqliteTaskStore` and `MemoryTaskStore`; added restart-recovery coverage proving session/task metadata survives daemon recreation. Adapter and authentication protocols remain untouched.
- Added fail-closed `WindowsPrincipalResolver`/`authenticateRequest` boundary with deterministic identity mapping tests. Runtime SSPI/Kerberos/NTLM resolver remains to be wired after transport implementation.
- Added `IisHttpSysPrincipalResolver` host adapter boundary with injected IIS/HTTP.sys principal reader, strict Windows identity validation, and fail-closed missing-bridge behavior. Native SSPI extraction and live Windows hosting remain unverified. Full check passes with 13 files and 41 tests.

- SessionService fixture coverage added: ordered retrieval, model selection, response, persistence, audit, and fail-closed retrieval. Build, lint, formatting, and 46 tests across 14 files pass. Live ICF/Sigil/WhichLLM, SSPI, signed MSIX, and clean-machine evidence remain blocked by environment prerequisites.

- Added deterministic docs:audit tooling: local Markdown-link validation, Cathryn Lavery diagram triplet checks, Mermaid-details checks, and PNG-embed checks. Wired docs:audit into npm run check. Audit and full check pass: 14 Markdown files, 1 diagram, 14 test files, 46 tests.

- Locked local composition contract in src/application/composition-contract.ts: request/session envelopes, retrieval, model decision, response, persistence, audit, and separate task metadata types. Remote adapter schemas remain external-authority gated.

- Added ComposedSessionService using the locked local composition contract. It forwards typed retrieval, model, response, persistence, and append-only audit requests, rejects governed fail-closed retrieval, and returns DaemonResponse without mixing TaskMetadata.

- Added ComposedSessionService contract tests: typed request propagation, ordered persistence/audit, response projection, and governed fail-closed short-circuit. Full check passes: 15 files, 48 tests.
