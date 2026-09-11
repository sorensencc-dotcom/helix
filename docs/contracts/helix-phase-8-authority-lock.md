# Helix Phase 8 authority lock

**Status:** operator-approved contract metadata, no credentials
**Effective date:** 2026-09-11
**Authority:** Chris Sorensen, Helix operator

## Canonical endpoints

| Authority | Operation | Environment label | Approved URL |
|---|---|---|---|
| ICF | resolve | `HELIX_ICF_RESOLVE_URL` | `https://helix.internal.corp/icf/resolve` |
| ICF | receipt | `HELIX_ICF_RECEIPT_URL` | `https://helix.internal.corp/icf/receipt` |
| Sigil | execute | `HELIX_SIGIL_EXECUTE_URL` | `https://helix.internal.corp/sigil/execute` |
| Sigil | receipt | `HELIX_SIGIL_RECEIPT_URL` | `https://helix.internal.corp/sigil/receipt` |
| WhichLLM | route | `HELIX_WHICHLLM_URL` | `https://helix.internal.corp/whichllm/route` |

All endpoints use `POST` and `application/json`. Authentication is Windows Integrated Authentication through IIS/HTTP.sys. No credentials are stored in this repository.

## Canonical identity mapping

The native bridge provides the flat authority fields. Helix maps them into the existing runtime envelope:

| Authority field | Helix field |
|---|---|
| `sid` | `identity.windows.sid` |
| `upn` | `identity.windows.upn` |
| `groups` | `identity.windows.groups` |
| `session_id` | `identity.helixSession.sessionId` |
| `issued_at` | `identity.helixSession.createdAt` |
| `logon_type`, `claims` | retained by the host bridge until the Helix session contract adds them |

Helix creates `correlationId` and `governed`; callers cannot override either value. Unknown identity fields fail strict validation.

## Receipt mapping

Authority receipts normalize `receipt_id` to `receiptId`, `issued_at` to `timestamp`, and carry the Helix correlation ID plus authenticated SID. A receipt is accepted only when both match the active envelope. Missing, malformed, denied, or mismatched receipts fail closed.

## Activation gate

This document records configuration and mapping metadata only. Live activation requires reachable DNS, Windows-authenticated integration evidence, owner response fixtures, and deployment verification. Until those exist, unavailable transports remain the default.

No private key, password, API token, cookie, or bearer credential belongs in this document or the Wiki.