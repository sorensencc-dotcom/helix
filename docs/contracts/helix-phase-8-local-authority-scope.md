# Helix Phase 8 local authority scope record

**Scope:** Single operator (Chris Sorensen), single machine, no domain, indefinite.
**Status:** Supersedes the earlier four-owner external delivery-packet framing (2026-09-12). That framing was wrong: ICF, WhichLLM, and Sigil are all systems the operator already owns on this machine, not external parties to petition. Windows auth here is local-machine, not enterprise domain auth.

## Purpose

Get Helix running locally against the real systems it already has, so the operator can use and test it in real operations. Each adapter below is self-authored and self-approved against the real target system — no external contract request is needed for ICF, WhichLLM, or Sigil. Enterprise-grade Windows Integrated Authentication (Kerberos/NTLM domain fixtures, downgrade protection, multi-machine rotation) is explicitly out of scope until there is an actual second machine or domain to support.

## Windows auth (local-machine only)

Real need: authenticate requests from this one Windows account on this one PC. No domain join, no multi-machine plan, foreseeable future is this PC only.

- Existing scaffolding already targets this: `native/windows-bridge/` (C#/.NET Negotiate-only `HttpListener`), `WindowsBridgePrincipalResolver`, `CurlNegotiateFetch` (`curl.exe --negotiate`), `IisHttpSysPrincipalResolver`.
- NTLM/Negotiate against loopback on a single local account does not require a domain — approve wiring these against the real local bridge process on this box, not against an enterprise fixture matrix.
- Drop the expired/downgrade/multi-realm Kerberos fixture requirement until a second machine or domain actually exists.

## ICF (operations center: kb-sync, TRM, graft, drift)

Real system, operator-owned. Dashboard: `http://127.0.0.1:8080/modules/wiki/dashboard.html`. Backing repo: `C:\dev\kb-sync`.

- Identify the real local query/read surface kb-sync already exposes (wiki dashboard, `.catalog.json`, sync scripts) and adapt Helix's `IcfRetrievalAdapter` to call it directly.
- Identity/receipt/lineage fields come from what kb-sync actually returns today, not an invented external schema — read the real endpoint and shape the adapter to match, then document that shape here.

## WhichLLM (model selection, already documented)

Real spec, operator-authored: `sorensencc-dotcom/toolforge` wiki, `whichllm-model-selection-evaluator.md` (mirrored locally via kb-sync ingestion into `C:\dev\whichllm-model-selection-evaluator.md`). BFCL gate, model registry, OpenRouter provider adapter concepts are real and documented there.

- Build `WhichLlmSelectionAdapter` against that real spec's fields (composite BFCL score, model registry, rate cards) rather than requesting a new contract.
- Confirm which process actually executes model selection today (standalone script, TorqueQuery, or not yet wired) before assuming a live endpoint exists to call.

## Sigil (execution, approvals, capabilities)

Real repo, operator-owned: `C:\dev\sigil-repo`. Unchanged from the original request — this is the one system where a genuine identity/receipt mapping gap exists (see appendix) because Sigil's registered-agent identity model doesn't map to a Windows account. Self-approvable: author the mapping and receipt-translation doc there since the operator owns both sides.

## Local approval rule

Each adapter above is approved by the operator wiring it against the real target system on this machine and confirming it behaves correctly — not by a separate signed contract document from an external party. Production/multi-machine/domain concerns remain out of scope until that future actually arrives.

## Local response execution (Ollama)

WhichLLM selects the local model from the operator-triggered artifact at
`C:\dev\trm\_integration\model_selection.json`. Helix sends that selected model
to the fixed loopback endpoint `http://127.0.0.1:11434/api/chat` with
`stream: false`. The user payload and ICF context are sent as the user message.

Helix accepts only a non-empty string at `message.content`. HTTP failures,
timeouts, malformed responses, and missing content fail closed. No fallback
model, cloud provider, or fabricated answer is permitted. This is local model
execution evidence, not production or cloud-routing approval.

## Appendix: known concrete gaps (grounded in current code, 2026-09-12)

- **Sigil identity has no natural mapping.** Sigil's `sender.owner_id`/`endpoint_id` (`sigil/1` envelope, `sigil/contracts/v1/envelope.example.json`) are relay-registered agent identities bound to Ed25519 keys — they are not Windows accounts. Helix's identity envelope (`src/domain/identity.ts`) carries `{sid, upn, groups}`. Needs an operator-maintained table linking this PC's Windows SID to a registered Sigil `endpoint_id`. `helixSession.correlationId` (format `corr_[a-z0-9-]+`) and Sigil's plain-string `correlation_id` are already compatible — no mapping needed there.
- **Sigil receipt shapes don't match Helix's adapter contract.** Sigil only emits four terminal receipt states (`acknowledged`, `processed`, `processing_failed`, `dead_letter`; see `sigil/cli/send-with-receipt.mjs`) keyed by `message_id`/`conversation_id` plus the envelope's Ed25519 `signature`. Helix's adapter contract expects a receipt object carrying correlation ID, operator identity, timestamp, an integrity value, and a receipt ID. An adapter must synthesize the Helix shape from Sigil's terminal-state event and envelope signature.
- **Capability naming is already solved.** Helix's own `docs/contracts/sigil-v1.schema.json` already constrains `capability` to `^sigil\.[a-z0-9_.-]+$`, and Sigil's `sigil/relay/v1/validate-envelope.mjs` (`capabilityIsCovered`/`targetScopesFor`) enforces per-scope grants with no implicit coverage. Nothing further needed here.
- **Governance-state vocabularies don't line up.** Helix models `governed: boolean` on session identity with fail-closed persistence when unset. Sigil models capability grants and approval state but has no `ordinary/governed` or `automatic/constrained` concept. A reconciliation mapping between the two is still needed.
- **ICF and WhichLLM adapter code doesn't exist yet.** Both target systems are real and identified above, but Helix has no `IcfRetrievalAdapter`/`WhichLlmSelectionAdapter` implementation wired against their real shapes yet — that is the actual next build task, not a documentation gap.
