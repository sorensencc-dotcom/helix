# Helix Phase 8 implementation plan

**Design:** `docs/superpowers/specs/2026-09-10-helix-phase-8-integration-release-readiness-design.md`
**Status:** Approved for implementation by operator on 2026-09-10.

## Work sequence

1. Lock versioned ICF, WhichLLM, and Sigil schemas, fixtures, and failure matrices.
2. Implement Windows identity envelopes, adapter authentication, and contract negotiation.
3. Replace storage primitives with SQLite persistence, DPAPI `CurrentUser` key protection, retention, deletion, and RAM-only governed sessions.
4. Complete daemon routes, request limits, idempotency, cancellation, queue state, and reconnectable SSE.
5. Add CLI and browser integration tests against the real daemon.
6. Add MSIX build metadata and run unsigned package validation; pause signing until certificate and release channel are supplied.
7. Run focused, full-suite, live, remote, and production gates as separate evidence classes.

## Stop conditions

- Missing or incompatible external contract: stop at adapter boundary.
- Missing signing identity or release channel: stop before signing or publishing.
- Any governed-content persistence or direct execution path: fail closed and remediate before proceeding.

## First implementation slice

Create schema modules and deterministic contract fixtures for all three adapters, then add contract tests before connecting live endpoints.
