# Helix project specification

**Status:** Canonical high-level project specification
**Date:** 2026-09-10
**Current phase:** Phase 8 integration and release readiness

## Project definition

Helix is a local, personal AI assistant for IronLedger and IronCommand Forge. Helix provides grounded reasoning, planning, synthesis, and controlled orchestration while preserving ICF and Sigil authority. Helix is not a replacement for either system and must never bypass either system.

Helix runs on one Windows machine as a standalone daemon with three clients from the beginning:

- HTTP API for automation and headless use.
- CLI for operator workflows.
- Browser UI for interactive chat.

All clients use the same daemon contracts and policy decisions.

## Core architecture

```text
CLI / browser / HTTP automation
              |
        Helix local daemon
       /        |        \
     ICF     WhichLLM     Sigil
 knowledge   model       action
 authority   authority   authority
```

ICF governs context packets, retrieval, truth, lineage, audit, policy constraints, and governed knowledge. WhichLLM governs model catalog, priority, capability matching, automatic routing, and explicit model availability. Sigil governs MCP and CLI execution, capabilities, approvals, sandboxing, and mutations. Helix orchestrates these authorities and exposes their state to the operator.

## Operator and trust model

Windows identity authenticates local access. ICF identity governs knowledge and governance operations. Sigil identity governs execution and approvals. These identities remain distinct in every request and audit envelope.

### Authoritative identity envelope

Every client request and adapter call uses one Helix-owned identity envelope containing `windowsOperatorIdentity`, `helixSessionId`, `helixCorrelationId`, `icfIdentity`, and `sigilIdentity`. Clients provide only the authenticated Windows identity and request context; Helix creates the session and correlation identifiers and resolves the ICF and Sigil identities through configured, verified mappings. Adapters consume this envelope and may not redefine, fabricate, downgrade, or silently omit identity fields.

The identity mapping contract is tested end to end across HTTP, CLI, browser, ICF, and Sigil. Tests prove identity preservation across retries, duplicate requests, cancellation, SSE reconnects, and audit receipts. Any missing, mismatched, or unverifiable mapping fails closed.

Helix begins read-only. Each capability is explicitly registered, scoped, identity-bound, classified, and audited. Model output, prompt content, endpoint registration, or user input cannot grant capabilities. Future write capabilities require a separate approved design and Sigil approval.

## Model policy

WhichLLM manages automatic model selection across local and cloud models using capability, quality, cost, and availability. Cloud routing is disabled unless the operator explicitly enables cloud use for a request or session. Governed content never goes to cloud providers.

The browser and CLI expose a model picker ordered by WhichLLM priority. It shows provider type, availability, and routing metadata. Explicit selection is valid only for a model WhichLLM reports available; Helix never silently substitutes an unavailable override.

## Knowledge and retrieval policy

Automatic retrieval is the default. Operators can constrain scope or explicitly select sources at any time. Helix must disclose every source used, the ICF context packet, lineage state, and whether the answer is governed or unverified.

Governed sources include IronLedger, CIC, Rewrite Labs, MCP governance, mutation ledgers, safe-mode policies, schema migrations, ingestion pipelines, lineage, valuation, connectors, audit replay, deterministic workflows, specification writing, and governance artifacts.

If ICF is unavailable, governed retrieval fails closed. Helix may continue ungoverned read-only reasoning in degraded mode, must disclose that state, and must queue governance-grade requests until ICF recovers.

Adapter readiness is independent and failure-containment is authority-specific: ICF failure blocks governed retrieval and evidence work; WhichLLM failure blocks model selection and execution; Sigil failure blocks every action proposal and execution path. Helix reports per-adapter readiness, never fabricates `READY`, never silently substitutes an authority, and never falls back around a failed governance boundary.

## Memory and persistence policy

Ordinary conversations persist locally in encrypted SQLite with configurable 30–90-day retention and operator-controlled deletion. No conversation history syncs to cloud services.

Governed content remains session-scoped in RAM and never enters ordinary history, long-term memory, logs, telemetry, crash reports, or model-routing metadata unless the operator explicitly exports or pins it. Exports use DPAPI-protected authenticated encryption, SHA-256 checksums, mutation logging, governed storage, and replacement-source preservation. Deletion is irreversible, logged, and cryptographically acknowledged.

Governed task recovery persists only non-sensitive task metadata: task ID, correlation ID, session ID, lifecycle state, timestamps, retryability, and opaque ICF/Sigil receipt references. Prompts, context packets, lineage payloads, credentials, model inputs, and governed outputs remain RAM-only. Recovery must rehydrate through verified authority references; missing references fail closed.

## Runtime guarantees

Helix uses versioned adapter contracts and JSON Schemas under `docs/contracts/`. Contracts define authentication, identity propagation, schemas, unknown-field behavior, version negotiation, timeouts, retries, cancellation, idempotency, rate limits, receipts, and failure states.

Receipt ownership is explicit: Helix owns correlation and receipt indexing; ICF owns knowledge, context, and lineage receipts; Sigil owns approval and execution receipts. Helix stores only verified opaque references to authority receipts. A task cannot enter a successful terminal state until every applicable authority receipt is present, valid, and mapped to the task identity envelope.

Every adapter call passes a Helix admission check. The target authority must be ready, contract negotiation must be current, identity mapping must be verified, and credential rotation or shutdown must not be active. Calls that fail admission fail closed or remain explicitly queued according to task policy; adapters cannot override this boundary.

Helix owns cancellation intent and task state. It propagates cancellation to every active adapter using the task correlation ID, waits for bounded acknowledgements, and records each applicable cancellation receipt. If an adapter does not acknowledge within the bound, Helix marks the task canceled-but-unconfirmed, never successful, and surfaces the unresolved authority.

WhichLLM is the authoritative model-execution policy boundary. Clients cannot select an executable provider directly. Helix sends every model request through WhichLLM, accepts only a current approved provider/model and execution policy, and rejects execution when that decision is missing, stale, disallowed, or lacks explicit cloud opt-in.

Sigil is authoritative for mutation safety. Helix submits only typed proposals to Sigil. Sigil owns capability checks, approval state, sandboxing, execution, and mutation receipts. Helix never executes mutations directly and never treats client confirmation as Sigil approval.

The HTTP daemon API is the sole canonical client contract. CLI and browser clients use the same authenticated endpoints, schemas, identity and error envelopes, task lifecycle, and event stream; they do not implement independent task or adapter semantics.

Configuration uses a fixed precedence order only for non-security settings. CLI and environment overrides cannot change identity, credentials, bind scope, adapter endpoints, or policy unless the versioned configuration schema explicitly permits that field. Helix validates the merged configuration before startup and fails closed on unsafe values.

Operational logs use an allowlist: event type, task/session/correlation IDs, adapter state, stable error code, timestamps, and opaque receipt references. Logs never contain prompts, context, credentials, model inputs, governed outputs, or raw adapter payloads. Diagnostic capture requires explicit redaction and bounded retention.

Helix enforces bounded limits for request bodies, active sessions, queued tasks, concurrent adapter calls, stream buffers, and per-operator rates. Capacity exhaustion returns stable `RESOURCE_*` errors or queues work only when capacity and task policy allow. Governed state is never silently evicted.

The daemon uses versioned SSE events for streaming, bounded request/retrieval/evidence/response sizes, per-session and daemon-wide concurrency limits, bounded governed queues, stage timeouts, cancellation propagation, backpressure, deterministic cleanup, correlation IDs, and stable error envelopes. Governed work never downgrades to ungoverned reasoning.

## Client experience

The browser is a focused operator console: conversation first, model and scope second, trust and audit details third. It includes model selection, source scope, persistence mode, source disclosure, lineage state, queued work, approval cards, and recovery actions. CLI exposes equivalent controls and machine-readable JSON. HTTP remains the canonical client contract.

Clients must handle first-run, empty results, loading, unavailable model catalog, ICF degradation, queued work, denial, failed requests, expired sessions, disconnects, long names, and large evidence sets. Browser behavior includes keyboard navigation, visible focus, screen-reader labels, text status equivalents, WCAG 2.1 AA contrast, and narrow-window layouts.

## Delivery phases

1. **Unified foundation:** daemon boundaries, contracts, sessions, policy, identity, persistence, adapters, model picker, and shared API.
2. **Governed knowledge:** ICF context packets, automatic retrieval, source scopes, disclosure, lineage, and evidence logging.
3. **Operator clients:** CLI, browser UI, SSE, cancellation, queue status, and client parity.
4. **Controlled orchestration:** Sigil proposals, approvals, receipts, and narrowly registered read capabilities.
5. **Domain slices:** IronLedger analyst, IronCommand Forge copilot, governed Q&A, lineage explorer, valuation, and audit replay.
6. **Phase 8 integration and release:** approved external contracts, platform persistence, complete daemon wiring, signed MSIX, clean-machine install/upgrade/rollback/uninstall, CI evidence, and release report.

Domain slices do not bypass the foundation. Write capabilities remain outside current scope until separately approved.

## Release and evidence standard

The project is not production-ready until unit, contract, integration, security, CLI E2E, browser E2E, and performance suites pass; signed Windows packaging and clean-machine lifecycle tests pass; live adapter behavior is verified; remote delivery is recorded; and production approval is explicit. Local candidate tests do not prove live integration, remote delivery, or production readiness.

## Session lifecycle

Sessions are created only after Windows operator authentication and receive a unique session ID, creation time, client identity, persistence class, governance state, retention policy, and inactivity deadline. A session may be `NEW`, `ACTIVE`, `IDLE`, `EXPIRED`, `CLOSED`, or `PURGED`. `NEW` becomes `ACTIVE` after authentication; `ACTIVE` may become `IDLE`, `CLOSED`, or `EXPIRED`; `IDLE` may return to `ACTIVE` after reauthentication; `EXPIRED` and `CLOSED` reject new work; `PURGED` has no recoverable session content.

Session close, expiry, and purge remove governed content from RAM, cancel or queue work according to task policy, and emit non-sensitive lifecycle records. Ordinary history follows retention policy. Governed content never becomes persistent through session renewal, background activity, crash recovery, or client reconnect.

## Task lifecycle

Every prompt or automation request receives a task ID, correlation ID, session ID, idempotency key, submitted time, effective scope, model decision, persistence class, and governance state. Tasks use explicit states: `ACCEPTED`, `CONTEXT_PENDING`, `RETRIEVAL_PENDING`, `MODEL_PENDING`, `STREAMING`, `PROPOSED`, `APPROVAL_REQUIRED`, `QUEUED`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `DENIED`, and `EXPIRED`.

Only legal state transitions are accepted. Duplicate idempotency keys return the original task and outcome. Client cancellation cancels ungoverned work; governed work cancels or remains queued and never downgrades. Disconnects do not erase durable governed task status. Every terminal task state includes a safe, non-secret reason, correlation ID, and ICF or Sigil receipt when applicable.

## Configuration model

Configuration is per-user and local-only. Precedence is explicit: built-in safe defaults, versioned configuration file, operator environment overrides, then command-line or per-session overrides. Secrets are resolved only through Windows DPAPI-protected storage and are never accepted from committed files, ordinary history, prompts, logs, telemetry, or process snapshots.

Configuration covers daemon bind address, allowed local clients, ICF/WhichLLM/Sigil endpoints and versions, timeout and retry limits, model cloud permission, request and evidence limits, concurrency and queue limits, retention window, data/export directories, logging redaction, and release channel. Startup validates configuration against a versioned schema, rejects unknown or unsafe values, reports field-level safe errors, and refuses to start when authority endpoints or key settings are ambiguous. Runtime changes require explicit validation and an audit record; security-sensitive settings require restart.

One Helix-owned per-user authority configuration supplies all adapter endpoints, contract versions, readiness policy, and secret references. Secrets resolve through DPAPI-protected storage and never through committed files, ordinary environment snapshots, or persisted sessions. Startup negotiates each authority before reporting readiness; rotation validates the replacement before retiring the previous credential, and shutdown stops new work before releasing adapter resources.

Readiness expires and is renewed through bounded per-authority health probes. A failed probe transitions only the affected authority to unavailable, blocks its dependent paths, and emits a non-sensitive state change. Recovery requires fresh negotiation before that authority returns to ready; stale startup state never authorizes work.

## Error taxonomy

Errors use stable versioned codes grouped by boundary: `AUTH_*` for Windows or identity failures, `CONFIG_*` for invalid or unsafe configuration, `CONTRACT_*` for schema or version failures, `POLICY_*` for capability or scope denial, `CONTEXT_*` for ICF context and lineage failures, `RETRIEVAL_*` for governed source failures, `MODEL_*` for catalog, routing, or execution failures, `SIGIL_*` for proposal, approval, or execution failures, `SESSION_*` for lifecycle failures, `TASK_*` for invalid state or idempotency failures, `STORAGE_*` for encryption, key, migration, or deletion failures, `RESOURCE_*` for limits and concurrency, and `INTERNAL_*` for unexpected faults.

Every error includes code, summary, correlation ID, task or session ID when available, current state, retryability, and safe recovery action. Error responses never include secrets, credentials, raw prompts, governed payloads, stack traces, or provider-sensitive data. Retryable errors require bounded retry policy; authentication, policy, contract, key-loss, and unsafe-configuration errors are non-retryable until operator action changes state.

## Current blockers

- ICF, WhichLLM, and Sigil owners must supply and approve concrete endpoint, authentication, schema, retry, identity, and receipt contracts.
- Operator must provide MSIX signing identity and release channel.
- Phase 8 candidate implementation remains uncommitted in the working tree and must retain separate evidence for local tests, live integrations, remote delivery, and production approval.
