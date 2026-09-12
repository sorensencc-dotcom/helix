# Authority stub (local dev only)

Not a real ICF/WhichLLM/Sigil authority. Implements the `helix-adapter.v1`
response shapes from `src/adapters/contracts.ts` so Helix can be pointed at a
real `HttpAdapterTransport` during local docker development, ahead of the
real authorities described in
`docs/contracts/helix-phase-8-authority-lock.md`.

## Run

```
docker compose -f dev/authority-stub/docker-compose.yml up -d
```

## Point Helix at it

```
HELIX_ICF_RESOLVE_URL=http://localhost:4180/icf/resolve
HELIX_WHICHLLM_URL=http://localhost:4180/whichllm/route
HELIX_SIGIL_EXECUTE_URL=http://localhost:4180/sigil/execute
```

Every response is a fixed success payload — no failure-path simulation. For
that, use `tests/fixture-adapter-matrix.test.ts` (in-process, covers
timeout/unavailable/malformed/denied/version-mismatch).
