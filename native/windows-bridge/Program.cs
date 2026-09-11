using System.Net;
using System.Security.Principal;
using System.Text.Json;

const string Contract = "helix.windows-principal.v1";
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

static void Handle(HttpListenerContext context)
{
    try
    {
        if (context.Request.HttpMethod != "GET" || context.Request.Url?.AbsolutePath != "/v1/principal")
        {
            context.Response.StatusCode = 404;
            context.Response.Close();
            return;
        }

        if (context.User?.Identity is not WindowsIdentity identity || !identity.IsAuthenticated)
        {
            WriteError(context, 401, "ACCESS_DENIED");
            return;
        }

        var sid = identity.User?.Value;
        var upn = identity.Name;
        if (string.IsNullOrWhiteSpace(sid) || string.IsNullOrWhiteSpace(upn))
        {
            WriteError(context, 403, "IDENTITY_INVALID");
            return;
        }

        var body = new
        {
            contract = Contract,
            identity = new
            {
                sid,
                upn,
                groups = identity.Groups?.Select(group => group.Value).Where(value => value is not null).ToArray() ?? []
            }
        };
        WriteJson(context, 200, body);
    }
    catch (PlatformNotSupportedException) { WriteError(context, 501, "UNSUPPORTED_MECHANISM"); }
    catch (UnauthorizedAccessException) { WriteError(context, 403, "ACCESS_DENIED"); }
    catch { WriteError(context, 400, "IDENTITY_INVALID"); }
}

static void WriteError(HttpListenerContext context, int status, string code)
    => WriteJson(context, status, new { contract = Contract, error = code });

static void WriteJson(HttpListenerContext context, int status, object body)
{
    var bytes = JsonSerializer.SerializeToUtf8Bytes(body);
    context.Response.StatusCode = status;
    context.Response.ContentType = "application/json";
    context.Response.ContentLength64 = bytes.Length;
    context.Response.OutputStream.Write(bytes);
    context.Response.Close();
}
