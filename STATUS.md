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

## Next action

Obtain concrete ICF, WhichLLM, and Sigil owner protocols before implementing live adapter transport.

## Blockers

- Confirm concrete ICF, WhichLLM, and Sigil adapter protocols before integration work.
- Supply MSIX signing identity and release channel before packaging work.

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
