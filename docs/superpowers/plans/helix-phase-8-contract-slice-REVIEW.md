# Review: Helix Phase 8 working tree (second look)

Reviewed: 2026-09-10T17:25:00Z
Reviewer: ijfw-review
Domain: software
Repo: `C:\dev\helix` (`main` @ `3e2de47`, implementation still untracked)

## Summary

The contract slice absorbed several first-pass FLAGs (`offerSchema.strict()`, unknown-field test split, `correlationId` max 128, STATUS count now 24). The tree then grew into persistence, daemon routes, a client, and unsigned MSIX metadata. That is more than slice 1, and it is not wired: `SqliteSessionStore` and `SessionService` are unused by `createDaemon`; CLI still prints local READY; the browser Send button ignores the prompt. Success envelopes remain unversioned. Governed persistence fail-closed is bypassed when `context` is omitted.

Live: `vitest run` → **7 files, 24 tests passed**.

## Prior FLAGS — status

| Finding | Now |
|---|---|
| STATUS 8 vs 19 | **Fixed** (working state and Phase 8 both say 24; matches vitest) |
| Unknown-field test bundled with v0 | **Fixed** (`adapterVersion` + `extra: true`) |
| `negotiateAdapter` not `.strict()` | **Fixed** (`offerSchema` `.strict()`) |
| `correlationId` unbounded | **Fixed** (`.max(128)`) |
| Malformed fixture was a valid failure object | **Regressed** — ICF `it.each` now sends `{ not: "a response" }` for *every* named failure code and always expects `MALFORMED_RESPONSE` |
| Success envelopes unversioned | **Open** |
| `arguments: z.record(z.unknown())` | **Partial** (≤64 keys; values still unknown) |
| `docs/contracts/` JSON Schema | **Partial** (README only, labeled candidate) |
| Distinct identity *values* | **Open** |
| `git diff --check` vs untracked tree | **Open** (src/tests still `??`) |

## BLOCK findings (must-fix)

- `src/infrastructure/session-store.ts:32-34`: [BLOCK] `if (response.context?.governed === true)` lets a response with **no `context`** persist. `AssistantResponse.context` is optional. Governed text without a context packet is written to SQLite. Fail closed unless `context.governed === false` (or an explicit ordinary marker).

## FLAG findings (should-discuss)

- `tests/adapters-contracts.test.ts:63-78`: [FLAG] ICF deterministic matrix no longer round-trips TIMEOUT / UNAVAILABLE / DENIED / VERSION_MISMATCH. All non-success cases assert `MALFORMED_RESPONSE` on `{ not: "a response" }`. Keep a real malformed payload *and* valid failure envelopes for each code (WhichLLM/Sigil loop still does the latter).
- `src/adapters/contracts.ts:42-49` / `58-65` / `76-82`: [FLAG] Success documents still have no `contract` field. Version-compatible-looking JSON from another revision parses as success. Add `contract: z.literal(adapterVersion)` to success.
- `src/daemon/server.ts` + `src/index.ts`: [FLAG] Daemon has no Windows/auth check. `loadConfig` accepts any `HELIX_HOST`. Default is 127.0.0.1; `0.0.0.0` is a no-auth bind. Allowlist loopback; reject non-loopback hosts until an access layer exists.
- `src/daemon/server.ts:88-93`: [FLAG] Idempotency map is keyed only by header value, shared across `/v1/sessions`, `/v1/tasks`, and cancel. Reusing a key on another route returns the first route’s body. Key by `method + path + key`.
- `src/daemon/server.ts` vs `session-store.ts` / `session-service.ts`: [FLAG] Persistence and `SessionService` are not used by the daemon. In-memory `Set`/`Map` only. STATUS reads like the running server encrypts sessions. Wire the store or say “library + tests, not daemon-backed.”
- `src/cli.ts` / `web/index.html`: [FLAG] CLI never calls the daemon. Browser Send creates a session/task and **never reads `#prompt`**. Client tests hit HTTP; operator surfaces do not share that path.
- `src/adapters/contracts.ts:71-73`: [FLAG] Sigil `arguments` still `z.unknown()` values. Cap is key count only.
- `docs/contracts/README.md`: [FLAG] Pointer file, not versioned JSON Schema. Fine as a candidate label; not a contract lock.

## NIT findings (polish)

- `packaging/validate-manifest.mjs`: [NIT] Substring checks (`"<Identity "`, `"UNSIGNED-HELIX"`). Does not parse XML or require `Assets\` logos that the manifest names.
- `src/adapters/boundary.ts:35-44`: [NIT] Non-object arrays still take the `contract !== adapterVersion` branch → `VERSION_MISMATCH` instead of `MALFORMED_RESPONSE`. Guard `!Array.isArray` / use Zod only.
- `src/infrastructure/session-store.ts:53-67`: [NIT] `list()` `JSON.parse`s decrypted bytes with no schema. Reject malformed records fail-closed.

## Verification (this look)

```
npm test → 7 files, 24 passed
SqliteSessionStore.save skips only context.governed === true
createDaemon does not import session-store or SessionService
web Send handler never reads textarea#prompt
CLI prints local JSON READY; no fetch
```

## Assessment

**Ready to merge: No** (candidate scaffolding; not Phase 8 acceptance).

Fix the governed persist hole, restore named ICF failure fixtures, version success envelopes, and either wire persistence/auth into the daemon or stop describing them as if the process had them. External protocol lock is still correctly blocked.
