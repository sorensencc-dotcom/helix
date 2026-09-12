import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A plain-HTTP stand-in for the native windows-bridge process, implementing
 * the same helix.windows-principal.v1 / helix.dpapi-crypto.v1 contracts.
 *
 * This is NOT Negotiate/SSPI-authenticated -- the real bridge is Windows
 * Integrated Auth only, which this sandbox cannot exercise without a
 * domain-joined host. It exists solely so integration tests can drive the
 * real production code paths (BridgeSupervisor, CurlNegotiateFetch,
 * WindowsBridgePrincipalResolver, WindowsBridgeCryptoProvider) end to end.
 */
export function fakeWindowsBridgeScript(port: number): string {
  return `
const http = require("node:http");

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/v1/principal") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          contract: "helix.windows-principal.v1",
          identity: {
            sid: "S-1-5-21-0000000000-0000000000-0000000000-1001",
            upn: "fixture.operator@helix.test",
            groups: ["Helix-Operators"],
          },
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/v1/crypto/encrypt") {
      const body = JSON.parse(await readBody(req));
      const ciphertext = Buffer.from(
        \`\${body.sessionId}::\${body.plaintext}\`,
      ).toString("base64");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          contract: "helix.dpapi-crypto.v1",
          operation: "encrypt",
          ciphertext,
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/v1/crypto/decrypt") {
      const body = JSON.parse(await readBody(req));
      const decoded = Buffer.from(body.ciphertext, "base64").toString("utf8");
      const marker = \`\${body.sessionId}::\`;
      if (!decoded.startsWith(marker)) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            contract: "helix.dpapi-crypto.v1",
            error: "SESSION_MISMATCH",
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          contract: "helix.dpapi-crypto.v1",
          operation: "decrypt",
          plaintext: decoded.slice(marker.length),
        }),
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
  } catch {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "FIXTURE_ERROR" }));
  }
});
function tryListen() {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
      setTimeout(tryListen, 50);
      return;
    }
    throw err;
  });
  server.listen(${port}, "127.0.0.1");
}
tryListen();
`;
}

export async function writeFakeWindowsBridge(
  port: number,
): Promise<{ command: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "helix-fake-bridge-"));
  const path = join(dir, "fake-bridge.js");
  await writeFile(path, fakeWindowsBridgeScript(port), "utf8");
  return {
    command: `"${process.execPath}" "${path}"`,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
