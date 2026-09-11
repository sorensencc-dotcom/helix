# Windows HTTP authentication and identity mapping

**Status:** Approved Helix-side input. Native SSPI transport and ICF/Sigil owner-specific fields remain runtime/authority dependencies.

## Scope

This draft defines the proposed identity boundary for Helix local HTTP clients, CLI, browser, ICF, and Sigil.

## Authentication

Use Windows Integrated Authentication for local HTTP clients: Kerberos preferred, NTLM fallback only when Kerberos is unavailable. Permit local-machine access only. Reject anonymous and password-based login. Do not use bearer tokens for local clients.

The SSPI implementation uses `AcquireCredentialsHandle`, `InitializeSecurityContext`/`AcceptSecurityContext`, and `QueryContextAttributes`. Negotiate is the package choice; token framing, maximum token size, chunking, and status mapping must be explicit in the runtime adapter. Extract UPN through `SECPKG_ATTR_NAMES`, SID through the context/access token, and group SIDs from the access token. Host-integrated HTTP is preferred; a custom named-pipe or TCP loop requires the same handshake contract.

The authenticated Windows principal is the authoritative operator identity. Extract SID as the immutable anchor, UPN as the display identity, and group membership only for local policy decisions.

## Helix identity envelope

Every accepted request creates one envelope containing:

- Windows operator identity: SID, UPN, and optional groups.
- Helix session identity: session ID, request correlation ID, creation timestamp, and governed mode.
- ICF identity: owner-supplied ID, version, and contract-defined fields when the ICF contract is locked.
- Sigil identity: owner-supplied ID, version, and contract-defined fields when the Sigil contract is locked.

Helix creates session and correlation identities. Clients cannot supply or replace Windows identity. Adapters consume the envelope and cannot fabricate, downgrade, or omit required identity fields.

## Propagation and consistency

Helix propagates Windows and Helix session identity to ICF and Sigil. Governed retrieval fails closed when ICF identity validation fails. Action proposals fail closed when Sigil identity validation fails, and execution still requires Sigil approval.

Identity remains stable across HTTP, CLI, browser, SSE, retries, cancellation, reconnect, and queue recovery. A mid-session identity change invalidates the session.

ICF and Sigil transport messages carry receipt ID, this identity envelope, channel, timestamp, and integrity flags. A receipt is accepted only when its identity SID equals the SSPI-derived SID; headers, query parameters, and user payloads cannot override that value. Missing or invalid tokens map to `Identity.NegotiationFailed`, unsupported packages to `Identity.UnsupportedMechanism`, and local policy denial to `Identity.AccessDenied`.

## Contract test

The Phase 8 identity test must deterministically cover Windows identity extraction, envelope creation, ICF and Sigil propagation, retries, cancellation, SSE reconnect, audit receipts, failure receipts, and degraded mode.

## Approval boundary

Tier 1 must approve the authentication mechanism and identity source. ICF and Sigil owners must approve their envelope fields, validation rules, and versions. Until those approvals exist, Helix must not implement HTTP authentication, bind adapter identities, or close the contract gate.
