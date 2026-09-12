# Helix Windows principal bridge

The bridge terminates Windows Integrated Authentication with `HttpListener` and
Negotiate SSPI. It exposes `GET /v1/principal` on loopback only.

Success response:

```json
{
  "contract": "helix.windows-principal.v1",
  "identity": { "sid": "S-1-5-...", "upn": "DOMAIN\\user", "groups": ["S-1-5-..."] }
}
```

The bridge owns authentication. Helix must validate the contract, use `sid` as
the immutable anchor, and reject missing, unknown, or mismatched identity data.
No request header can override these fields.

## DPAPI crypto endpoints

Also Negotiate-only, on the same loopback listener. `sessionId` is bound in as
DPAPI optional entropy (`DataProtectionScope.CurrentUser`), so a ciphertext
issued for one session cannot be unprotected under another. No key material
ever crosses the process boundary; the bridge holds no server-side session
state, so `DELETE /v1/crypto/delete` is a validated, authenticated no-op with
nothing to erase.

`POST /v1/crypto/encrypt`

```json
{ "contract": "helix.dpapi-crypto.v1", "sessionId": "session_...", "plaintext": "<base64>" }
```

```json
{ "contract": "helix.dpapi-crypto.v1", "operation": "encrypt", "ciphertext": "<base64>" }
```

`POST /v1/crypto/decrypt`

```json
{ "contract": "helix.dpapi-crypto.v1", "sessionId": "session_...", "ciphertext": "<base64>" }
```

```json
{ "contract": "helix.dpapi-crypto.v1", "operation": "decrypt", "plaintext": "<base64>" }
```

`DELETE /v1/crypto/delete`

```json
{ "contract": "helix.dpapi-crypto.v1", "sessionId": "session_..." }
```

```json
{ "contract": "helix.dpapi-crypto.v1", "operation": "delete", "deleted": true }
```

Errors: `{ "contract": "helix.dpapi-crypto.v1", "error": "ACCESS_DENIED" | "REQUEST_INVALID" | "CRYPTO_FAILED" }`.
`sessionId` is bounded to 1-128 characters; `plaintext`/`ciphertext` base64 is bounded to ~1 MiB decoded.
