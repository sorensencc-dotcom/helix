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

Build `IcfRetrievalAdapter` against kb-sync's real local endpoint and `WhichLlmSelectionAdapter` against the operator's real documented WhichLLM spec; wire local (non-domain) Windows auth against the existing native bridge. See `docs/contracts/helix-phase-8-local-authority-scope.md`.

## Blockers

- None external. ICF (kb-sync ops center), WhichLLM (operator-authored spec), and Sigil are all operator-owned systems on this machine — build the adapters, no owner contract to wait on. Sigil identity/receipt mapping still needs authoring (see scope doc appendix).
- Supply MSIX signing identity and release channel before packaging work (deferred — single-machine local use does not need packaging yet).

## Scope correction (2026-09-12)

Superseded the earlier four-external-owner delivery-packet framing (`docs/contracts/helix-phase-8-unified-authority-contract-request.md`, commits `3822a6d`, `3d418b0`). That framing was wrong: ICF, WhichLLM, and Sigil are systems the operator already owns on this machine, not external parties to petition, and Windows auth here is local-machine-only (single operator, no domain, foreseeable future is this PC). Corrected scope now lives in `docs/contracts/helix-phase-8-local-authority-scope.md`. Enterprise Windows Integrated Auth (Kerberos/NTLM domain fixtures, multi-machine rotation), MSIX signing, and production release gates remain explicitly out of scope until an actual second machine or domain exists.

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

- Wired `ComposedSessionService` into `createDaemon`'s `POST /v1/tasks` route as an injectable option (`sessionService`), alongside an optional `resolvePrincipal` (`WindowsPrincipalResolver`) that authenticates the request via `authenticateRequest` before execution and fails closed with 401 on an unresolved principal. When a service is wired, task handling now runs the real retrieval/model/response/persistence/audit pipeline instead of returning a bare `QUEUED` stub, and the daemon returns `COMPLETED`/`FAILED` task state with the `DaemonResponse` and a separately computed `TaskMetadata` record stored under distinct `response`/`metadata` fields (never merged into one object). Extended `TaskStore`/`SqliteTaskStore`/`MemoryTaskStore` to persist `COMPLETED`/`FAILED` states plus JSON-serialized `response`/`metadata` columns (with an `ALTER TABLE` fallback for pre-existing databases). No `sessionService` is wired in `src/index.ts` yet — live ICF/WhichLLM/Sigil ports remain blocked pending owner-supplied protocols, so production activation is still gated on that blocker; the daemon's existing unauthenticated `QUEUED`-only behavior is preserved when no service is injected, keeping all prior tests green. Full check passes: 16 files, 50 tests.
 Added `createSessionService()` composition-root factory (`src/application/composition-root.ts`): construction fails closed with `SESSION_KEY_PROVIDER_REQUIRED` when no `SessionKeyProvider` is supplied; wires `IcfRetrievalAdapter`/`WhichLlmSelectionAdapter` over `HttpAdapterTransport` when `icfResolveUrl`/`whichLlmUrl` are configured, falling back to `UnavailableAdapterTransport`/`UnavailableResponseAdapter` (no network calls) otherwise; adds encrypted-SQLite persistence via `SqliteSessionStore` for ordinary sessions, RAM-only in-memory persistence for governed sessions, and append-only JSONL audit via `AppendOnlyAudit`. `src/index.ts` production wiring, the native Windows IIS/HTTP.sys identity resolver, and real response/model execution authority remain intentionally unwired pending owner-supplied contracts. Build, lint, format, and full check pass: 18 files, 56 tests.
 Added `WindowsBridgePrincipalResolver` in `src/adapters/windows-principal.ts` implementing `WindowsPrincipalResolver` against the native `windows-bridge` `GET /v1/principal` contract (`helix.windows-principal.v1`, see `native/windows-bridge/README.md`): requires an injected authenticated fetch function and fails closed with `WINDOWS_AUTH_REQUIRED` when absent, when the injected fetch throws, or when the bridge responds non-ok; parses the body through the existing `parseWindowsBridgeResponse` (rejecting any non-`v1` contract or malformed identity as `WINDOWS_IDENTITY_INVALID`) and rejects non-JSON bodies the same way. Never reads request headers or fabricates identity -- the native bridge remains the sole authenticator. `src/index.ts` wiring and the C#/.NET bridge process lifecycle remain unaddressed. Full check passes: 18 files, 62 tests.

 Migrated `SessionKeyProvider.getKey()` to async (`Promise<Uint8Array>`) across `SqliteSessionStore.save`/`list`, `composition-root.ts`, and their tests: native key retrieval (DPAPI) is inherently async, so the interface can no longer promise a synchronous key. Added `src/platform/windows-integrations.ts` Windows integration boundaries: `WindowsDpapiSessionKeyProvider` (fails closed with `DPAPI_BRIDGE_REQUIRED` without an injected native DPAPI bridge; unimplemented key storage otherwise throws `DPAPI_KEY_STORAGE_UNIMPLEMENTED`, never fabricates or derives a key) and `CurlNegotiateFetch` (spawns `curl.exe --negotiate` as the SSPI-capable authenticated-fetch implementation for `WindowsBridgePrincipalResolver`, since Node fetch/undici has no Negotiate support; bounded timeout/output, temp cookie jar cleanup, Windows-only guard). Both are boundary shells only -- no native DPAPI protect/unprotect call and no live bridge process supervision yet. `src/index.ts` wiring remains blocked on those two native contracts plus supervised bridge process start/stop. Full check passes: 19 files, 65 tests.

 Implemented the native bridge DPAPI crypto endpoints in `native/windows-bridge/Program.cs`: `POST /v1/crypto/encrypt`, `POST /v1/crypto/decrypt`, `DELETE /v1/crypto/delete`, all Negotiate-only on the existing loopback listener. `helix.dpapi-crypto.v1` payloads are strictly validated (contract literal, `sessionId` 1-128 chars, base64 plaintext/ciphertext bounded to ~1 MiB decoded) and rejected as `REQUEST_INVALID` otherwise. `ProtectedData.Protect`/`Unprotect` run under `DataProtectionScope.CurrentUser` with the session ID as DPAPI optional entropy, so a ciphertext issued for one session cannot be unprotected under another; no key material crosses the process boundary. The bridge holds no server-side session state, so `delete` is a validated, authenticated no-op. Added `native/windows-bridge/dpapi-crypto.schema.json` (removed a stale, field-mismatched `crypto-contract.schema.json` draft left from an earlier attempt), documented the endpoints in `native/windows-bridge/README.md`, and extended `tests/windows-bridge.integration.ps1` with an encrypt/decrypt/delete round trip. `dotnet build` verified clean with redirected `-o`/intermediate paths outside the repo; no `bin`/`obj` committed. The TypeScript side (`WindowsDpapiSessionKeyProvider`/`NativeDpapiBridge`) still is not wired against this contract, and `src/index.ts` remains unwired. Full check passes: 19 files, 65 tests.

 Migrated `SqliteSessionStore` to a transitional dual-path encryption model: `SessionCryptoProvider` (`encrypt`/`decrypt` against opaque native ciphertext, no key material ever seen by Helix) is now accepted alongside the legacy `SessionKeyProvider`, discriminated at runtime via `isCryptoProvider`. Stored records are wrapped in a `StoredEnvelope` (`version: 1` = legacy local AES-GCM `EncryptedRecord`, `version: 2` = opaque native-bridge ciphertext); `save` writes whichever format matches the injected provider, `list` decodes per-row by envelope version and fails closed (`NATIVE_RECORD_REQUIRES_CRYPTO_PROVIDER` / `LEGACY_RECORD_REQUIRES_KEY_PROVIDER`) rather than silently skip a mismatched record, so legacy AES-GCM history remains readable until every row is migrated. Added `WindowsBridgeCryptoProvider` in `src/platform/windows-integrations.ts` implementing `SessionCryptoProvider` against the native `POST /v1/crypto/encrypt`/`decrypt` `helix.dpapi-crypto.v1` endpoints via an injected `AuthenticatedRequestFetch`; extended `CurlNegotiateFetch` to support POST/DELETE with a JSON body (`RequestInitLike`) so it can serve as that fetch. Added `tests/session-store-crypto.test.ts` (native round trip, fail-closed cross-format reads, mixed-history fail-closed behavior) and `WindowsBridgeCryptoProvider` unit tests with an injected fetch mock -- no real bridge process required. `src/index.ts` remains unwired. Full check passes: 20 files, 74 tests.
Wired `src/index.ts` production composition root: adds required `HELIX_WINDOWS_BRIDGE_URL` config (fails boot with `WINDOWS_BRIDGE_URL_REQUIRED` when absent), constructs `CurlNegotiateFetch`, `WindowsBridgeCryptoProvider`, and `WindowsBridgePrincipalResolver` against it, passes the crypto provider into `createSessionService` (now accepting `SessionEncryption` instead of only `SessionKeyProvider`), and injects both `sessionService` and `resolvePrincipal` into `createDaemon`. Shutdown now closes the composition root (`composition.close()`) alongside the task store. Full check passes: 20 files, 75 tests.

Wired and validated the daemon against a supervised bridge process. Added `BridgeSupervisor` (`src/platform/bridge-supervisor.ts`): spawns the configured `HELIX_WINDOWS_BRIDGE_COMMAND`, polls the loopback TCP listener for readiness (the native bridge's `HttpListener` is Negotiate-only on every route, so there is no unauthenticated health endpoint to probe), and reports unexpected exits via `onExit` so `src/index.ts` fails closed rather than keep serving against a dead bridge. `loadConfig()` now requires `HELIX_WINDOWS_BRIDGE_COMMAND` (fails boot with `WINDOWS_BRIDGE_COMMAND_REQUIRED`). `src/index.ts` starts the supervisor before constructing the crypto/principal adapters and stops it on shutdown. Extended `createSessionService()` with an optional `SessionServicePortOverrides` parameter (retrieval/models/responses) so test code can substitute deterministic ports without touching the unchanged production defaults -- live ICF, WhichLLM, Sigil, and model execution remain unwired pending owner contracts. Added `tests/support/deterministic-local-ports.ts` (test-only fixture, explicitly not production) and `tests/support/fake-windows-bridge.ts`, a plain-HTTP (non-Negotiate) stand-in implementing the real `helix.windows-principal.v1`/`helix.dpapi-crypto.v1` JSON contracts, enabling `tests/bridge-lifecycle.integration.test.ts` to drive the real `CurlNegotiateFetch`/`WindowsBridgePrincipalResolver`/`WindowsBridgeCryptoProvider` code end to end on a non-domain-joined sandbox (`curl --negotiate` behaves as a plain request against a server that never issues a `WWW-Authenticate: Negotiate` challenge). That suite proves authenticated `POST /v1/tasks` reaches the resolver and DPAPI-backed SQLite persistence, fails closed with 401 the instant the bridge process exits, and recovers persisted session history across a bridge stop/restart cycle. Added `tests/bridge-supervisor.test.ts` for supervisor unit coverage (ready-on-listen, exit-before-ready, unexpected-exit reporting, deliberate-stop suppression, stop/restart cycling).

Fixed two bugs found by the restart-recovery test: (1) `BridgeSupervisor`'s `child.on("exit"/"error", ...)` handlers unconditionally nulled `this.child`; a late-firing event from a killed old process could clobber the reference to an already-respawned child, surfacing as a spurious `BRIDGE_EXITED_BEFORE_READY`. Fixed by capturing the specific `child` instance in the closure and only clearing `this.child` when it still points at that instance. (2) The deterministic response fixture generated a `correlationId` derived only from `sessionId`, so two tasks in the same session collided on `ordinary_sessions`' `correlation_id` PRIMARY KEY and the second `INSERT OR REPLACE` silently overwrote the first persisted record; fixed by appending `randomUUID()` to the fixture's correlation ID. Full check passes: 22 files, 86 tests. Live ICF, WhichLLM, Sigil, and model execution remain blocked pending owner-supplied contracts and reachable endpoints.

## ICF adapter wired to real local authority (2026-09-12)

Sub-project 1 of the local-authority build (see `docs/contracts/helix-phase-8-local-authority-scope.md`) is done: `KbSyncContextCacheTransport` (`src/adapters/transport.ts`) reads kb-sync's live SQLite FTS5 context cache (`.kb_cache/knowledge.db`) directly, and the composition root (`src/application/composition-root.ts`) now defaults the ICF port to it instead of `UnavailableAdapterTransport`. `HELIX_ICF_RESOLVE_URL` still takes precedence if a real HTTP authority ever exists; `HELIX_KB_SYNC_DB_PATH` overrides the cache path. Commits `db83bcb`, `1a9561f`. Full suite green (135/135). Next: WhichLLM adapter (sub-project 2), then local auth wiring (sub-project 3).

## GUI next-phase execution (2026-09-12)

- Manual approval received for the Helix GUI next-phase plan.
- Locked response disclosure contracts in `src/application/composition-contract.ts` and `src/application/composed-session-service.ts`; committed as `a829bbe`.
- Added GUI disclosure rendering and browser-boundary assertions for model decision, effective scope, source state, lineage, governance, persistence, override, approval, and receipt state; committed as `f02246f`.
- Fixed formatter gate failure in `src/adapters/local-authority-adapters.ts`.
- Full local gate passes: build, lint, formatting, docs audit, package validation, 27 test files, and 132 tests.
- Added `.npmignore` to prevent `.ijfw/`, `AGENTS.md`, and `CLAUDE.md` from entering npm packages. Dry-run confirmed zero internal metadata entries.
- Focused security/browser checks pass: 7 tests.
- Live authority, signed MSIX, clean-machine lifecycle, remote delivery, and production approval remain unverified.

## Code review remediation (2026-09-13)

- Converted task ID generation from sequential list count to atomic `task_${randomUUID()}` in `src/daemon/server.ts`, preventing task ID collisions during concurrent requests.
- Implemented TTL-based eviction (1 hour) and capacity bounding on the in-memory idempotency map to prevent memory leaks in long-running daemon sessions.
- Added request body stream read timeout (30 seconds) in `readJson()` returning 408 `REQUEST_TIMEOUT` to prevent connection stalls.
- Hardened `serveWebAsset` against path traversal across Windows and POSIX by using `resolve` and checking against `webRoot + path.sep`.
- Hardened URL-decoded parameter validation for session and task routes (`DELETE /v1/sessions/:id`, `GET /v1/sessions/:id/tasks`, `GET /v1/tasks/:id`, and `POST /v1/tasks/:id/cancel`).
- Hardened daemon shutdown sequence in `src/index.ts` to ensure `composition.close()` and `taskStore.close()` always run even if `server.close()` encounters an error callback.
- Added test coverage for concurrent task ID generation, URL parameter validation, and static asset path traversal prevention.
- Full local gate passes: build, lint, formatting, docs audit, 29 test files, and 150 tests.

## Model selection & browser E2E invariant defense (2026-09-13)

- Implemented accessible model selection dropdown in `web/index.html` allowing explicit operator model selection across local and cloud providers.
- Hardened prompt retention invariant: composer prompt text clears ONLY upon confirmed HTTP 201/202 task admission, retaining prompt content across network and model execution failures.
- Defended zero-automated-cloud-failover invariant: local execution failure preserves prompt in UI without issuing background cloud dispatches; cloud execution requires explicit user dropdown selection and resubmit.
- Gated all test fixture control routes (`/__fixture/*`) behind `fixtureMode` configuration and verified production daemon isolates and returns HTTP 404 for all fixture endpoints.
- Added injectable `DaemonLogger` in `src/daemon/server.ts` filtering out expected simulated fixture failures while preserving unexpected runtime errors.
- Added Playwright browser E2E test suite (`tests/e2e/model-selection.spec.ts`) validating 6 scenarios: UI dropdown rendering, prompt retention on failure, zero automated cloud dispatch, explicit operator resubmit via button click, explicit multi-provider routing and dispatch isolation (Gemini, Codex, Grok), and keyboard Enter-key resubmission with dispatch-counter invariant assertions.
## Continuous Docker deployment (2026-09-13)

- Implemented standalone container execution stack (`Dockerfile`, `docker-compose.yml`) running continuously with `restart: unless-stopped`.
- Published GUI and HTTP API to host port `8877` (`http://127.0.0.1:8877/`), leaving port `8787` isolated for existing Headroom container.
- Added container-native bridge script (`scripts/container-bridge.mjs`) implementing `helix.windows-principal.v1` and `helix.dpapi-crypto.v1` encryption over loopback in container runtime.
- Added container-aware fetch and 0.0.0.0 bind host handling in `src/platform/windows-integrations.ts` and `src/infrastructure/config.ts` when `HELIX_CONTAINER_MODE` is enabled.
- Hardened static web asset handler in `src/daemon/server.ts` to support both `GET` and `HEAD` HTTP methods.
- Mounted named volume `helix_data:/data` to persist encrypted SQLite sessions and tasks across container rebuilds and host restarts.
- Unified with `authority-stub` service in `docker-compose.yml` with host-gateway resolution (`host.docker.internal`).
- Full local test suite passes: `npm run check` (29 test files, 152 tests, build, lint, formatting, and docs audit).




