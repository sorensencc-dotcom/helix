# Helix Phase 8: Integration and release readiness

**Status:** Proposed design; requires approval before implementation.

## Purpose

Turn the Phase 1–7 foundation into a verifiable local release by wiring approved ICF, WhichLLM, and Sigil contracts, completing platform-backed persistence, and proving the daemon, CLI, browser, and package behave consistently on a clean Windows machine.

Phase 8 does not introduce write capabilities. It does not replace ICF or Sigil authority, and it does not permit cloud routing without explicit operator enablement.

## Requirements

### Functional

- Connect only to versioned, explicitly configured adapter contracts.
- Preserve Windows, ICF, and Sigil identities as separate envelope fields.
- Persist ordinary sessions through SQLite protected by DPAPI `CurrentUser`.
- Keep governed content RAM-only unless an operator explicitly exports it.
- Complete HTTP, SSE, CLI, and browser flows against the same daemon policy.
- Produce signed, installable, upgradeable, and removable MSIX artifacts.

### Reliability and security

- Fail closed on missing, malformed, unauthorized, or version-incompatible adapter responses.
- Bound request size, response size, queue depth, retries, timeouts, and stream lifetime.
- Make external work idempotent and cancellation-aware.
- Keep secrets, credentials, governed payloads, and raw prompts out of logs and crash artifacts.
- Make every release artifact reproducible from a tagged commit and publish checksums.

## Architecture

```text
Windows operator
      |
  CLI / browser
      |
  local HTTP daemon -- policy + session orchestration
      |                 |
  encrypted SQLite     RAM-only governed state
      |
  versioned adapters
    /       |       \
   ICF   WhichLLM   Sigil
```

The daemon remains the sole application boundary. Clients never call adapters directly. Adapter implementations depend on infrastructure ports; application services depend on domain contracts; domain code has no transport, storage, or adapter dependency.

## Contract gate

Implementation starts only after each external owner supplies:

1. Endpoint or process protocol, authentication mechanism, and supported version.
2. Request and response schemas with unknown-field behavior.
3. Timeout, retry, cancellation, idempotency, and rate-limit rules.
4. Identity propagation and audit receipt requirements.
5. Deterministic fixtures for success, timeout, unavailable, malformed, denied, and version-mismatch cases.

Unknown or unapproved contracts produce `CONTRACT_UNAVAILABLE`; Helix must not silently downgrade, substitute, or execute locally around the boundary.

## Delivery slices

1. **Contract lock:** approve ICF, WhichLLM, and Sigil contract documents and fixtures.
2. **Platform persistence:** wire SQLite, DPAPI `CurrentUser`, retention, deletion, recovery states, and explicit encrypted exports.
3. **Daemon completion:** add session, catalog, task, status, cancellation, export, deletion, and reconnectable SSE routes.
4. **Client parity:** exercise CLI and browser clients against the real daemon and compare policy outcomes.
5. **Release proof:** build the MSIX, sign it with the supplied identity, install on a clean Windows machine, test upgrade/rollback/uninstall, and publish checksums.

## Acceptance criteria

- Unit, contract, integration, security, and client E2E suites pass in CI.
- A governed request cannot produce an ungoverned response when ICF is unavailable.
- Helix cannot execute an action without a Sigil approval and execution receipt.
- Cloud model selection is impossible without explicit request/session enablement.
- Restart preserves encrypted ordinary history and does not persist governed content.
- Duplicate requests return the original correlation ID and outcome.
- Client disconnect cancels ungoverned work and cancels or retains governed work according to queue policy.
- Clean-machine install, upgrade, failed-start rollback, uninstall, and data-preservation checks pass.
- Release report separates focused tests, full CI, live adapter evidence, remote delivery, and production approval.

## Risks and trade-offs

- **Native Windows integration versus portability:** DPAPI and MSIX provide the required local security and lifecycle behavior, but need Windows-specific test runners. Keep ports portable and adapters native.
- **Real adapters versus deterministic tests:** live services prove wiring but create availability and data risks. Keep contract fixtures authoritative for CI and run live tests opt-in against disposable environments.
- **Single daemon versus service decomposition:** one process minimizes local operational cost and preserves policy visibility. Revisit decomposition only after measured concurrency or isolation requirements exceed the modular-monolith boundary.

## Explicit blockers

- ICF, WhichLLM, and Sigil protocol owners must provide the contract inputs.
- Operator must provide MSIX signing identity and release channel.
- Tier 1 approval is required before this proposed phase becomes an implementation plan.
