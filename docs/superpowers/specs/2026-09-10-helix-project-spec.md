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

Helix begins read-only. Each capability is explicitly registered, scoped, identity-bound, classified, and audited. Model output, prompt content, endpoint registration, or user input cannot grant capabilities. Future write capabilities require a separate approved design and Sigil approval.

## Model policy

WhichLLM manages automatic model selection across local and cloud models using capability, quality, cost, and availability. Cloud routing is disabled unless the operator explicitly enables cloud use for a request or session. Governed content never goes to cloud providers.

The browser and CLI expose a model picker ordered by WhichLLM priority. It shows provider type, availability, and routing metadata. Explicit selection is valid only for a model WhichLLM reports available; Helix never silently substitutes an unavailable override.

## Knowledge and retrieval policy

Automatic retrieval is the default. Operators can constrain scope or explicitly select sources at any time. Helix must disclose every source used, the ICF context packet, lineage state, and whether the answer is governed or unverified.

Governed sources include IronLedger, CIC, Rewrite Labs, MCP governance, mutation ledgers, safe-mode policies, schema migrations, ingestion pipelines, lineage, valuation, connectors, audit replay, deterministic workflows, specification writing, and governance artifacts.

If ICF is unavailable, governed retrieval fails closed. Helix may continue ungoverned read-only reasoning in degraded mode, must disclose that state, and must queue governance-grade requests until ICF recovers.

## Memory and persistence policy

Ordinary conversations persist locally in encrypted SQLite with configurable 30–90-day retention and operator-controlled deletion. No conversation history syncs to cloud services.

Governed content remains session-scoped in RAM and never enters ordinary history, long-term memory, logs, telemetry, crash reports, or model-routing metadata unless the operator explicitly exports or pins it. Exports use DPAPI-protected authenticated encryption, SHA-256 checksums, mutation logging, governed storage, and replacement-source preservation. Deletion is irreversible, logged, and cryptographically acknowledged.

## Runtime guarantees

Helix uses versioned adapter contracts and JSON Schemas under `docs/contracts/`. Contracts define authentication, identity propagation, schemas, unknown-field behavior, version negotiation, timeouts, retries, cancellation, idempotency, rate limits, receipts, and failure states.

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

## Current blockers

- ICF, WhichLLM, and Sigil owners must supply and approve concrete endpoint, authentication, schema, retry, identity, and receipt contracts.
- Operator must provide MSIX signing identity and release channel.
- Phase 8 candidate implementation remains uncommitted in the working tree and must retain separate evidence for local tests, live integrations, remote delivery, and production approval.
