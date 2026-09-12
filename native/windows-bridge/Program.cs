using System.Net;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

const string PrincipalContract = "helix.windows-principal.v1";
const string CryptoContract = "helix.dpapi-crypto.v1";
const int MaxSessionIdLength = 128;
const int MaxPayloadBase64Length = 1_398_200; // ~1 MiB decoded, base64-expanded

var prefix = Environment.GetEnvironmentVariable("HELIX_WINDOWS_BRIDGE_PREFIX")
    ?? "http://127.0.0.1:8792/";
using var listener = new HttpListener { AuthenticationSchemes = AuthenticationSchemes.Negotiate };
listener.Prefixes.Add(prefix);
listener.Start();
Console.WriteLine(prefix);

while (true)
{
    var context = await listener.GetContextAsync();
    _ = Task.Run(() => Handle(context));
}

static async Task Handle(HttpListenerContext context)
{
    try
    {
        var path = context.Request.Url?.AbsolutePath;
        if (context.Request.HttpMethod == "GET" && path == "/v1/principal")
        {
            HandlePrincipal(context);
            return;
        }
        if (context.Request.HttpMethod == "POST" && path == "/v1/crypto/encrypt")
        {
            await HandleCrypto(context, "encrypt");
            return;
        }
        if (context.Request.HttpMethod == "POST" && path == "/v1/crypto/decrypt")
        {
            await HandleCrypto(context, "decrypt");
            return;
        }
        if (context.Request.HttpMethod == "DELETE" && path == "/v1/crypto/delete")
        {
            await HandleCrypto(context, "delete");
            return;
        }

        context.Response.StatusCode = 404;
        context.Response.Close();
    }
    catch (PlatformNotSupportedException) { WriteError(context, PrincipalContract, 501, "UNSUPPORTED_MECHANISM"); }
    catch (UnauthorizedAccessException) { WriteError(context, PrincipalContract, 403, "ACCESS_DENIED"); }
    catch { WriteError(context, PrincipalContract, 400, "IDENTITY_INVALID"); }
}

static void HandlePrincipal(HttpListenerContext context)
{
    if (context.User?.Identity is not WindowsIdentity identity || !identity.IsAuthenticated)
    {
        WriteError(context, PrincipalContract, 401, "ACCESS_DENIED");
        return;
    }

    var sid = identity.User?.Value;
    var upn = identity.Name;
    if (string.IsNullOrWhiteSpace(sid) || string.IsNullOrWhiteSpace(upn))
    {
        WriteError(context, PrincipalContract, 403, "IDENTITY_INVALID");
        return;
    }

    var body = new
    {
        contract = PrincipalContract,
        identity = new
        {
            sid,
            upn,
            groups = identity.Groups?.Select(group => group.Value).Where(value => value is not null).ToArray() ?? []
        }
    };
    WriteJson(context, 200, body);
}

// DPAPI protects with DataProtectionScope.CurrentUser, keyed to the calling
// Windows account -- no key material ever crosses the process boundary. The
// session ID is bound in as DPAPI optional entropy so a blob issued for one
// session cannot be unprotected under another. The bridge holds no server-side
// session state, so "delete" has nothing to erase; it exists only to give
// callers a symmetric, authenticated lifecycle op and is a validated no-op.
static async Task HandleCrypto(HttpListenerContext context, string operation)
{
    if (context.User?.Identity is not WindowsIdentity identity || !identity.IsAuthenticated)
    {
        WriteError(context, CryptoContract, 401, "ACCESS_DENIED");
        return;
    }

    JsonElement request;
    try
    {
        using var reader = new StreamReader(context.Request.InputStream, context.Request.ContentEncoding);
        var raw = await reader.ReadToEndAsync();
        request = JsonSerializer.Deserialize<JsonElement>(raw);
    }
    catch
    {
        WriteError(context, CryptoContract, 400, "REQUEST_INVALID");
        return;
    }

    if (request.ValueKind != JsonValueKind.Object
        || !request.TryGetProperty("contract", out var contractValue)
        || contractValue.GetString() != CryptoContract
        || !request.TryGetProperty("sessionId", out var sessionIdValue)
        || sessionIdValue.GetString() is not { Length: > 0 and <= MaxSessionIdLength } sessionId)
    {
        WriteError(context, CryptoContract, 400, "REQUEST_INVALID");
        return;
    }

    var entropy = Encoding.UTF8.GetBytes(sessionId);

    try
    {
        switch (operation)
        {
            case "encrypt":
            {
                if (!request.TryGetProperty("plaintext", out var plaintextValue)
                    || plaintextValue.GetString() is not { Length: > 0 and <= MaxPayloadBase64Length } plaintextBase64)
                {
                    WriteError(context, CryptoContract, 400, "REQUEST_INVALID");
                    return;
                }
                var plaintext = Convert.FromBase64String(plaintextBase64);
                var protectedBytes = ProtectedData.Protect(plaintext, entropy, DataProtectionScope.CurrentUser);
                WriteJson(context, 200, new { contract = CryptoContract, operation, ciphertext = Convert.ToBase64String(protectedBytes) });
                return;
            }
            case "decrypt":
            {
                if (!request.TryGetProperty("ciphertext", out var ciphertextValue)
                    || ciphertextValue.GetString() is not { Length: > 0 and <= MaxPayloadBase64Length } ciphertextBase64)
                {
                    WriteError(context, CryptoContract, 400, "REQUEST_INVALID");
                    return;
                }
                var ciphertext = Convert.FromBase64String(ciphertextBase64);
                var plaintextBytes = ProtectedData.Unprotect(ciphertext, entropy, DataProtectionScope.CurrentUser);
                WriteJson(context, 200, new { contract = CryptoContract, operation, plaintext = Convert.ToBase64String(plaintextBytes) });
                return;
            }
            case "delete":
            {
                WriteJson(context, 200, new { contract = CryptoContract, operation, deleted = true });
                return;
            }
            default:
                WriteError(context, CryptoContract, 400, "REQUEST_INVALID");
                return;
        }
    }
    catch (FormatException) { WriteError(context, CryptoContract, 400, "REQUEST_INVALID"); }
    catch (CryptographicException) { WriteError(context, CryptoContract, 400, "CRYPTO_FAILED"); }
}

static void WriteError(HttpListenerContext context, string contract, int status, string code)
    => WriteJson(context, status, new { contract, error = code });

static void WriteJson(HttpListenerContext context, int status, object body)
{
    var bytes = JsonSerializer.SerializeToUtf8Bytes(body);
    context.Response.StatusCode = status;
    context.Response.ContentType = "application/json";
    context.Response.ContentLength64 = bytes.Length;
    context.Response.OutputStream.Write(bytes);
    context.Response.Close();
}
