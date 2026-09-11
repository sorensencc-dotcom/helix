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

## Mandatory integration gates

- Identity gate: one Helix-owned identity envelope maps the authenticated Windows operator to Helix session/correlation IDs and verified ICF/Sigil identities across HTTP, CLI, browser, retries, cancellation, SSE reconnects, and audit receipts.
- Vertical path gate: an authenticated client request reaches daemon policy, adapter ports, persistence or governed queue state, and the canonical client response without bypass paths.
- Failure-containment gate: adapter readiness is reported independently; ICF, WhichLLM, and Sigil failures block only their governed authority paths and never trigger silent substitution or local execution around the boundary.
- Durability gate: persist only non-sensitive governed task metadata and opaque authority references; keep prompts, context, lineage payloads, credentials, model inputs, and governed outputs in RAM.
- Receipt gate: Helix owns correlation/indexing, ICF owns knowledge/context/lineage receipts, and Sigil owns approval/execution receipts; persist only verified opaque references and require every applicable receipt before successful completion.
- Admission gate: every adapter call requires current ready state, negotiated contract, verified identity mapping, and no active rotation or shutdown; otherwise fail closed or queue explicitly by task policy.
- Cancellation gate: Helix owns cancellation state, propagates it to every active adapter, requires bounded acknowledgements and applicable receipts, and represents unacknowledged work as canceled-but-unconfirmed rather than successful.
- Model-execution gate: route every model request through WhichLLM; reject missing, stale, disallowed, or non-cloud-opted-in provider/model decisions, and never execute a client-supplied provider directly.
- Mutation gate: submit only typed proposals to Sigil; keep capability checks, approvals, sandboxing, execution, and mutation receipts in Sigil, with no direct Helix execution or client-confirmation shortcut.
- Client-contract gate: make the HTTP daemon API canonical; CLI and browser must use its authenticated schemas, identity/error envelopes, lifecycle, and event stream without independent semantics.
- Configuration gate: apply fixed precedence only to non-security settings; reject unauthorized overrides of identity, credentials, bind scope, adapter endpoints, and policy, and validate the merged configuration before startup.
- Logging gate: emit only allowlisted operational metadata and opaque receipt references; never log prompts, context, credentials, model content, governed outputs, or raw adapter payloads, and require bounded redacted diagnostics.
- Resource gate: bound request bodies, sessions, queues, adapter concurrency, stream buffers, and per-operator rates; reject or explicitly queue on capacity exhaustion, and never silently evict governed state.
- Boundary-validation gate: parse every adapter and daemon response through strict versioned schemas before client delivery; map invalid responses to stable contract or malformed-response errors.
- Idempotency gate: scope keys by authenticated operator, session, route, and operation target; bind each key to a canonical request fingerprint and return a stable conflict for mismatched reuse.
- Authentication gate: reject unauthenticated requests before session/task creation, enforce loopback unless explicitly permitted by validated Windows-authenticated configuration, and derive operator identity from authentication rather than client JSON.
- Authentication input: `docs/contracts/windows-http-auth-identity-mapping-draft.md` defines the proposed Windows Integrated Authentication and identity envelope; implementation remains blocked until Tier 1 and ICF/Sigil owner approval.
- Persistence gate: route the live daemon through `SessionService` and `SqliteSessionStore` before claiming recovery or encrypted-session guarantees; prove restart recovery, governed RAM-only enforcement, retention, deletion, and export on the live path, or label persistence scaffolding.
- Lifecycle gate: centralize exhaustive session/task transition tables; reject invalid transitions with stable errors, enforce expiry and closure, and expose state only from that service.
- Streaming gate: maintain ordered task event history, replay after `Last-Event-ID`, emit terminal state once, and return a stable expired/history-gone response when replay data is unavailable.
- Client-wiring gate: make CLI and browser readiness and task actions daemon-backed; derive status from authenticated health/status/task/event responses and show unavailable or unknown when readiness is unproven.
- Packaging gate: parse MSIX manifests as XML and validate identity, architecture, publisher, capabilities, entrypoint, and signature state against the packaging contract; fail closed on malformed or unsigned artifacts.
- Identity-contract test gate: add a deterministic fixture-backed suite covering HTTP, CLI, browser, ICF, and Sigil, and assert identity/correlation preservation across retries, cancellation, SSE replay, and terminal receipts.
- Persistence test gate: use a temporary SQLite database with the live daemon to prove ordinary recovery, governed payload exclusion, retention/deletion, and fail-closed behavior for unverifiable opaque authority references.
- Adapter-matrix test gate: parameterize all six cases—success, timeout, unavailable, malformed, denied, and version mismatch—for ICF, WhichLLM, and Sigil, asserting stable codes, strict success versions, unknown-field rules, and no false success.
- Security-readiness test gate: cover missing or invalid Windows identity, unsafe bind configuration, DPAPI rotation, startup negotiation, readiness expiry, isolated adapter failure, and fresh negotiation after recovery.
- Client E2E test gate: test CLI and browser against one authenticated temporary daemon, including real prompt submission, status truthfulness, stable error rendering, keyboard-accessible controls, cancellation, SSE replay, and unavailable-state rendering.
- Performance gate: define route and adapter-stage latency budgets, bound queue and stream memory, test cancellation under load, and publish p95/p99 evidence for focused and full suites before making performance claims.
- Isolation benchmark gate: measure each adapter independently and under combined load; enforce bulkheads, timeout propagation, and queue fairness, and prove adapter saturation cannot block unrelated paths.
- Authority configuration gate: validate one versioned per-user configuration, resolve secrets through DPAPI, negotiate each adapter before readiness, and test credential rotation plus safe shutdown.
- Readiness gate: expire negotiated readiness, probe authorities with bounded health checks, isolate failed dependencies, and require fresh negotiation before recovery.

## Stop conditions

- Missing or incompatible external contract: stop at adapter boundary.
- Missing signing identity or release channel: stop before signing or publishing.
- Any governed-content persistence or direct execution path: fail closed and remediate before proceeding.

## First implementation slice

Create schema modules and deterministic contract fixtures for all three adapters, then add contract tests before connecting live endpoints.

## GSTACK REVIEW REPORT

| Lens | Result | Required action |
|---|---|---|
| Architecture | Reviewed | Implement the recorded identity, authority, receipt, admission, lifecycle, client, configuration, logging, and resource gates. |
| Code quality | Reviewed | Wire the live daemon through services, enforce authentication, strict response validation, scoped idempotency, durable SSE, and XML packaging validation. |
| Tests | Reviewed | Add cross-surface, live persistence, adapter-matrix, security/readiness, and CLI/browser E2E suites. |
| Performance | Reviewed | Add measurable budgets, per-adapter bulkheads, fairness, load, persistence, DPAPI, and shutdown benchmarks. |

Verdict: CONDITIONAL — plan is coherent after review, but Phase 8 acceptance remains blocked until the recorded gates are implemented and evidenced. Current tree remains candidate scaffolding, not a protocol lock or release approval.

Unresolved decision status: none. User approved all review decisions; approval authorizes plan direction, not acceptance of implementation or external contracts.
