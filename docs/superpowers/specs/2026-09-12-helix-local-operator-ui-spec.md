# Helix Local Operator UI Specification

Status: approved for implementation
Scope: first usable local operator UI

## Goal

Provide a local-only browser console that demonstrates the complete usable Helix
workflow through the canonical daemon API while making fixture mode, unavailable
authority, and fail-closed behavior unmistakable.

This UI does not establish live ICF, WhichLLM, Sigil, SSPI, receipt, signing, or
production evidence. Those remain separate contract-and-approval gates.

## Product posture

The console is a focused operator tool: conversation first, task state always
visible, trust and audit details available without implying authority that the
daemon has not reported.

Visual language follows Cast Iron Charlie: charcoal and warm paper surfaces,
ember actions, brass identity accents, editorial display type, condensed
operational labels, sharp rectangular geometry, and dark/light theme support.

## Canonical boundaries

- Browser uses `src/clients/daemon-client.ts` only.
- Browser does not call ICF, WhichLLM, Sigil, Windows bridge, or model endpoints.
- Browser does not invent identities, receipts, authority status, responses, or
  approval outcomes.
- Production defaults remain fail-closed and loopback-only.
- Fixture mode is a visible environment disclosure, never presented as live
  authority integration.

## User flows

### Startup

1. Load daemon status and session list.
2. Show local/read-only disclosure immediately.
3. Show each authority as fixture, unavailable, configured, or live only when
   supplied by the daemon contract.

### Session

1. List existing sessions from the daemon.
2. Create a session.
3. Select a session.
4. Preserve active session across refresh when the daemon still reports it.
5. Handle closed, expired, and missing sessions with safe recovery actions.

### Task

1. Submit instruction through the canonical task endpoint.
2. Render user input and task identity separately.
3. Track queued, active, completed, failed, denied, cancelled, unavailable, and
   disconnected states.
4. Display a response only when the daemon returns one.
5. Cancel eligible tasks through the canonical cancellation endpoint.

### Streaming and recovery

1. Subscribe to the daemon SSE stream.
2. Persist the last event ID in session memory and reconnect with `Last-Event-ID`.
3. Apply replayed events idempotently.
4. Poll `GET /v1/tasks/:id` after disconnect or missing terminal event.
5. Surface safe error code and recovery action; never expose raw payloads or
   stack traces.

## Required API/client work

- Add session listing route and strict client method.
- Add strict client cancellation method.
- Extend task schemas for all daemon-supported terminal states and response /
  metadata fields.
- Add a typed SSE stream helper with event ID replay support.
- Keep HTTP errors normalized to stable daemon error codes.

## UI structure

```text
OperatorConsole
  SessionRail
  TrustBanner
  ConversationThread
    TaskCard
    ResponseDisclosure
  Composer
  ConnectionStatus
```

The implementation may remain framework-free. Rendering and state transitions
should be separated from transport calls so fixture tests can exercise the UI
without a browser or network authority.

## Acceptance checklist

- [ ] Session creation, listing, selection, and safe closure.
- [ ] Task submission and status display.
- [ ] Response display only for canonical response data.
- [ ] SSE streaming, reconnect, replay, and polling fallback.
- [ ] Task cancellation and repeated-cancellation handling.
- [ ] Explicit local fixture/read-only indicator.
- [ ] Explicit per-authority unavailable/fixture state.
- [ ] No fabricated ICF, WhichLLM, Sigil, SSPI, or receipt behavior.
- [ ] Keyboard navigation, visible focus, semantic labels, live status text.
- [ ] WCAG 2.1 AA contrast in dark and light themes.
- [ ] Narrow-window layout and long-content handling.
- [ ] Real-daemon client tests and fixture failure-matrix coverage.
- [ ] Build, lint, formatting, docs audit, and full test suite pass.

## Evidence boundary

Local unit, contract, integration, and browser checks demonstrate candidate UI
behavior only. They do not prove live authority integration, authenticated
Windows hosting, signed packaging, remote delivery, or production readiness.
