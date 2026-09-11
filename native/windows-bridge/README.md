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
