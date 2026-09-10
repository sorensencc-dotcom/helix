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

## Capability and safety policy

The foundation enables read-only capabilities only. Each capability must be registered, scoped, identity-bound, and auditable. Future write capabilities require explicit registration and Sigil approval. Model output, prompt content, and endpoint registration must never grant capabilities.

## Operational states

- `READY`: ICF and WhichLLM are available.
- `DEGRADED`: governed retrieval is unavailable; ungoverned read-only reasoning only.
- `QUEUED`: governance-grade work awaits ICF or approval.
- `APPROVAL_REQUIRED`: Sigil requires operator confirmation.
- `MODEL_UNAVAILABLE`: selected override is unavailable.
- `DENIED`: identity, capability, scope, or policy check failed.
- `EXPORT_REQUIRED`: governed content requires explicit export before persistence.

## Verification requirements

The foundation is ready for implementation only when tests prove Windows authentication across all clients, ICF fail-closed behavior, Sigil-only execution, WhichLLM consultation and override rules, complete response disclosures, encrypted ordinary history, RAM-only governed sessions, safe explicit exports and deletion, secret non-leakage, and equivalent policy outcomes across HTTP, CLI, and browser clients.

## Future extension seams

Later slices may add IronLedger analyst workflows, IronCommand Forge copilot behavior, governed Q&A, lineage exploration, valuation, audit replay, and controlled mutations through the same session, retrieval, model, and Sigil contracts.
