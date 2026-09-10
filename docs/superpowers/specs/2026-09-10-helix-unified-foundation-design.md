# Helix unified foundation design

**Status:** Design approved in conversation; implementation not started
**Date:** 2026-09-10

## Purpose

Helix is a personal, local-first AI assistant for IronLedger and IronCommand Forge. It runs as a standalone local daemon and exposes one governed application surface to an HTTP API, CLI, and browser UI. Helix provides reasoning and orchestration while preserving the authority boundaries of ICF and Sigil.

## Goals

- Provide one stable API shared by HTTP automation, CLI, and browser clients.
- Delegate automatic model selection to Toolforge WhichLLM.
- Offer a model picker ordered by WhichLLM priority, with local and cloud availability visible.
- Retrieve automatically from governed sources, while allowing operator scope constraints and explicit source selection.
- Disclose sources, model choice, persistence mode, governance state, and lineage state in every response.
- Keep ordinary conversations locally encrypted with configurable retention.
- Keep governance-sensitive content session-scoped in RAM unless explicitly exported or pinned.
- Establish a foundation for later read and write capabilities without granting implicit authority.

## Non-goals for the foundation

- Domain-specific IronLedger workflows.
- Autonomous mutations or unrestricted tool execution.
- Cloud synchronization of history or governed content.
- Replacing ICF retrieval, lineage, policy, or audit authority.
- Replacing Sigil execution, approval, capability, or sandbox authority.

## Authority boundaries

ICF is the knowledge authority. It supplies context packets, governed retrieval, lineage, audit records, world-model context, and policy constraints. Helix must not treat its own memory or model output as a replacement for ICF truth.

Sigil is the action authority. It handles MCP calls, CLI orchestration, file and environment interaction, capability checks, approvals, mutation gates, and sandbox boundaries. Helix may propose an action, but it cannot execute around Sigil.

Windows identity establishes local operator access. ICF identity governs knowledge and governance operations. Sigil identity governs execution and approvals. These identities must remain distinct in request and audit envelopes.

## Runtime architecture

Helix uses a modular monolith daemon with explicit internal boundaries:

```text
CLI / browser UI / HTTP automation
              |
        Helix HTTP API
              |
     session and policy layer
       /          |          \
     ICF       WhichLLM       Sigil
 knowledge     model choice   execution
 authority                     authority
```

The daemon owns sessions, policy decisions, retrieval orchestration, model decisions, response assembly, and client-neutral audit metadata. ICF, WhichLLM, and Sigil integrations are adapters with versioned contracts so their implementations can change without changing clients.

Internal modules must follow one-way dependency rules: transport clients depend on application services; application services depend on domain contracts; infrastructure adapters implement those contracts; domain code never imports transport or adapter implementations. Keep session policy, retrieval orchestration, model selection, action proposal, response/disclosure assembly, persistence, and audit projection as separate modules with narrow interfaces. Domain features may compose these services but may not reach around them to call ICF, WhichLLM, Sigil, storage, or client code directly.

## Integration contract requirements

Before implementation, each adapter must have a versioned contract document and contract tests covering schemas, authentication, identity propagation, timeout limits, retry policy, idempotency, version negotiation, and failure states. Adapter contracts must define what data may cross the boundary and must reject unknown or over-broad capabilities by default.

The ICF adapter must define context-packet requests, retrieval requests, source and lineage response fields, evidence logging, queue submission, and fail-closed behavior. The WhichLLM adapter must define catalog discovery, priority ordering, capability filtering, automatic decisions, explicit override validation, provider classification, and unavailable-model behavior. The Sigil adapter must define proposed-task envelopes, capability checks, approval requests, approval outcomes, execution receipts, sandbox identity, and the rule that Helix never executes an action directly.

The Windows access layer must define how the daemon authenticates local clients and how the authenticated operator maps to ICF and Sigil identities. Tokens and credentials must remain outside persisted sessions and audit payloads. Every remote or local adapter call must have bounded timeouts, structured error codes, and correlation IDs shared with the Helix response and relevant ICF or Sigil record.

## Request lifecycle

1. A client submits a prompt with optional model, source, and scope overrides.
2. Helix authenticates the Windows operator.
3. Helix creates or validates an ICF context packet containing module, document, pipeline, scope, and lineage metadata.
4. Helix performs automatic retrieval unless the operator constrains or explicitly selects sources.
5. Helix records source identities and lineage state.
6. WhichLLM selects a model unless the operator selected an available override.
7. The model produces a response or a proposed Sigil task.
8. Helix returns the answer with source, model, persistence, governance, and execution state.
9. ICF receives evidence and lineage metadata. Sigil receives executable work only through its approval and capability boundary.

## Core contracts

The versioned Helix API centers on four objects:

- `Session`: operator identity, persistence class, retention, governance state, and client.
- `ContextPacket`: ICF module, document, pipeline, scope, and lineage metadata.
- `ModelDecision`: WhichLLM recommendation, available models, selected model, reason, provider type, and override status.
- `HelixResponse`: answer, sources used, model used, state disclosures, lineage ID, and proposed actions.

Every response must disclose whether selection was automatic or overridden, which sources were used, whether content is persistent or session-only, whether ICF is authoritative and available, and whether an action is proposed, queued, pending approval, denied, or executed.

## Client experience

The HTTP API is the canonical client contract. The CLI and browser UI must not implement separate policy logic; they render the same session, model, source, and execution states returned by the daemon.

The browser UI is a focused operator console rather than a generic dashboard. The primary hierarchy is conversation first, current model and scope second, and trust/audit details third. The composer exposes automatic model selection, the WhichLLM-prioritized model picker, source scope controls, and a visible persistence mode. A response presents answer, sources, model decision, governance state, lineage ID, and any proposed action in that order. Sensitive actions use an explicit Sigil approval card with action summary, capability, scope, and approval state.

Required client states are: first-run with no sessions, empty search results, loading retrieval, model catalog unavailable, ICF degraded, queued governance request, denied request, unavailable model override, failed response, and expired session. Each state must explain what happened, show the next safe operator action, and never imply that an unverified answer is governed. Long model names, long source names, no-source answers, and large evidence sets must remain readable without breaking layout.

The browser UI must support keyboard-only operation, visible focus, screen-reader labels for model and scope controls, text equivalents for status icons, minimum WCAG 2.1 AA contrast, and responsive layouts for desktop and narrow windows. The CLI must expose equivalent controls and machine-readable JSON output. HTTP clients must receive stable error codes and disclosure fields rather than UI-specific strings.

## Windows distribution and lifecycle

The foundation targets Windows x64 first and must be usable without a development checkout. A release must provide a versioned package containing the daemon, CLI, and browser assets, with a documented install directory, per-user configuration directory, local encrypted data directory, and governed export directory. Installation must register a per-user daemon lifecycle without requiring administrator privileges unless a future operator explicitly chooses a machine-wide install.

The CLI must provide start, stop, status, doctor, and uninstall operations. The browser client must launch against the local daemon and show a clear unavailable-daemon recovery path. Configuration must identify ICF, WhichLLM, and Sigil endpoints without storing secrets in the repository or ordinary session database. Updates must preserve encrypted ordinary history, never overwrite governed exports, verify package checksums, and support rollback after failed startup or migration. CI must build the package, run contract and smoke tests, and publish versioned artifacts through the chosen release channel.

## Retrieval policy

Automatic retrieval is the default. Operators can constrain scope at any time or explicitly select a source for governance-grade work. Helix must disclose all sources used and send retrieval lineage to ICF. Source selection must not bypass ICF policy or lineage checks.

If ICF is unavailable, governed retrieval fails closed. Helix may continue ungoverned read-only reasoning in degraded mode, must label that state, and must queue governance-grade requests until ICF recovers.

## Model policy

WhichLLM is authoritative for automatic model selection across local and cloud providers. The browser and CLI model pickers display the available catalog in WhichLLM priority order, including provider type, availability, and relevant capability or routing metadata.

An operator may override automatic selection only with a model WhichLLM reports as available. Helix must not silently substitute another model when an explicit override is unavailable; it returns `MODEL_UNAVAILABLE`.

## Persistence and memory policy

Ordinary conversations persist in a local encrypted SQLite store, with a configurable 30–90-day retention window, local-only storage, and operator-controlled deletion.

Governance-sensitive content is session-scoped and held in RAM by default. This includes IronLedger, CIC, Rewrite Labs, MCP governance, mutation ledgers, safe-mode policies, schema migrations, operator tokens, secrets, ingestion pipelines, lineage, valuation, connectors, audit replay, deterministic workflows, specification writing, and governance artifacts. Helix must not place this content in ordinary history or long-term memory.

The operator may explicitly export or pin governed content. Exports must be encrypted, checksum-verified, mutation-logged, and stored in a governed directory such as `C:\dev\Helix\operator_exports`. Deletion of history or governed exports is irreversible, mutation-logged, and cryptographically acknowledged. Helix never syncs history or uploads governed content to cloud services.

## Storage and key-management requirements

The first Windows implementation must use per-user key protection backed by Windows DPAPI or Windows Credential Manager; keys must never be stored beside the database, in configuration files, logs, prompts, or environment snapshots. Conversation records use authenticated envelope encryption with a documented algorithm and key version. The database must use a schema version and migration policy that preserves ordinary history while rejecting unsafe or partial migrations.

The threat model covers copied database files, another local Windows account, crash recovery files, temporary export files, logs, backups, and accidental cloud sync. Helix must exclude governance-sensitive content from persistent transactions, telemetry, crash reports, and model-routing metadata. Explicit exports use authenticated encryption and SHA-256 checksums, retain the previous valid export until replacement succeeds, and record only non-secret metadata in the mutation ledger. Deletion tests must verify removal from active records, indexes, temporary files, and application caches; cryptographic acknowledgment must identify the deleted object, operator, timestamp, and resulting state without retaining deleted content.

## Capability and safety policy

The foundation enables read-only capabilities only. Each capability must be registered, scoped, identity-bound, and auditable. Future write capabilities require explicit registration and Sigil approval. Model output, prompt content, and endpoint registration must never grant capabilities.

The capability registry is deny-by-default and versioned. Each entry defines a stable capability name, operation class, resource-scope grammar, required Windows/ICF/Sigil identity, approval requirement, data-classification limit, and canonical allow or deny audit event. The initial registry is limited to context retrieval, source listing, status inspection, and evidence reading. It excludes mutations, secret and credential access, arbitrary filesystem access, raw ingestion payloads, and unrestricted ledger export. Authorization decisions include the request correlation ID, capability, normalized scope, identity result, policy result, and reason without copying sensitive payloads.

## Operational states

- `READY`: ICF and WhichLLM are available.
- `DEGRADED`: governed retrieval is unavailable; ungoverned read-only reasoning only.
- `QUEUED`: governance-grade work awaits ICF or approval.
- `APPROVAL_REQUIRED`: Sigil requires operator confirmation.
- `MODEL_UNAVAILABLE`: selected override is unavailable.
- `DENIED`: identity, capability, scope, or policy check failed.
- `EXPORT_REQUIRED`: governed content requires explicit export before persistence.

States and errors are versioned contracts, not client-local interpretations. Every error envelope contains a stable code, human-readable summary, correlation ID, retryability, current state, and safe recovery action; it never contains secrets or raw governed payloads. The daemon defines legal transitions, including `QUEUED` to completed, denied, expired, cancelled, or failed, and rejects invalid transitions. Requests that can queue or trigger external work require an idempotency key. Retries are bounded and apply only to errors marked retryable; duplicate submissions return the original correlation ID and outcome.

## Verification requirements

The foundation is ready for implementation only when tests prove Windows authentication across all clients, ICF fail-closed behavior, Sigil-only execution, WhichLLM consultation and override rules, complete response disclosures, encrypted ordinary history, RAM-only governed sessions, safe explicit exports and deletion, secret non-leakage, and equivalent policy outcomes across HTTP, CLI, and browser clients.

Implementation must establish a TypeScript test framework and CI before feature work. Unit tests cover policy classification, capability decisions, state transitions, disclosure assembly, scope normalization, idempotency, retention, and export checksums. Contract tests use deterministic fixtures for ICF, WhichLLM, Sigil, and Windows identity mappings; each adapter owns its schema and failure matrix. Integration tests exercise the daemon with encrypted storage and disposable adapter doubles. Browser E2E tests cover first run, model and scope controls, source disclosure, degraded mode, queue recovery, approval states, retry, and session expiry. CLI E2E tests cover equivalent commands and JSON output. Security tests cover copied databases, crash files, logs, temporary exports, secret redaction, unauthorized scopes, replayed requests, and deletion. CI must run linting, type checks, unit, contract, integration, security, and client E2E suites on every change.

## Runtime behavior and safety requirements

The system MUST:

- Stream responses over HTTP to the CLI, browser, and daemon-integrated clients.
- Propagate client cancellation to the model adapter, ICF, Sigil, retrieval, and toolchain.
- Enforce hard limits on request payloads, prompts, attachments, retrieval volume, token count, object count, per-item and aggregate evidence, response bytes, response tokens, and streaming duration.
- Enforce per-session and daemon-wide concurrency limits; excess work is rejected deterministically or placed in bounded, governed queues.
- Maintain bounded queues for governance-grade work with durable `pending`, `running`, `succeeded`, `failed`, `cancelled`, and `expired` status for audit.
- Define and enforce stage timeouts for client ingress, ICF/retrieval, model execution, Sigil/post-processing, and client egress.
- Apply backpressure when a client disconnects or stops reading; cancel or downgrade work without an active consumer and deterministically release buffers, model slots, and retrieval handles.
- Emit metrics for per-stage and end-to-end latency, queue depth and age, model duration and token throughput, retrieval size, failures by type, and cancellations by source and stage.
- Maintain repeatable performance tests for normal and above-normal concurrency, slow adapters, evidence near configured limits, and repeated transient failures and retries.

## Future extension seams

Later slices may add IronLedger analyst workflows, IronCommand Forge copilot behavior, governed Q&A, lineage exploration, valuation, audit replay, and controlled mutations through the same session, retrieval, model, and Sigil contracts.
