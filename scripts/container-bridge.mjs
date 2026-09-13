import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const port = Number(process.argv[2] || process.env.HELIX_WINDOWS_BRIDGE_PORT || 8878);
const key = randomBytes(32);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/v1/principal") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          contract: "helix.windows-principal.v1",
          identity: {
            sid: "S-1-5-21-0000000000-0000000000-0000000000-1001",
            upn: "docker.operator@helix.local",
            groups: ["Helix-Operators"],
          },
        }),
      );
      return;
    }

    if (req.method === "POST" && req.url === "/v1/crypto/encrypt") {
      const body = JSON.parse(await readBody(req));
      if (!body.sessionId || typeof body.plaintext !== "string") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            contract: "helix.dpapi-crypto.v1",
            error: "REQUEST_INVALID",
          }),
        );
        return;
      }
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(body.sessionId, "utf8"));
      const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(body.plaintext, "base64")),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      const payload = Buffer.concat([iv, tag, ciphertext]).toString("base64");

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          contract: "helix.dpapi-crypto.v1",
          operation: "encrypt",
          ciphertext: payload,
        }),
      );
      return;
    }

    if (req.method === "POST" && req.url === "/v1/crypto/decrypt") {
      const body = JSON.parse(await readBody(req));
      if (!body.sessionId || typeof body.ciphertext !== "string") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            contract: "helix.dpapi-crypto.v1",
            error: "REQUEST_INVALID",
          }),
        );
        return;
      }
      const buffer = Buffer.from(body.ciphertext, "base64");
      if (buffer.length < 28) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            contract: "helix.dpapi-crypto.v1",
            error: "CRYPTO_FAILED",
          }),
        );
        return;
      }
      const iv = buffer.subarray(0, 12);
      const tag = buffer.subarray(12, 28);
      const data = buffer.subarray(28);

      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(body.sessionId, "utf8"));
      decipher.setAuthTag(tag);
      let decrypted;
      try {
        decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            contract: "helix.dpapi-crypto.v1",
            error: "CRYPTO_FAILED",
          }),
        );
        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          contract: "helix.dpapi-crypto.v1",
          operation: "decrypt",
          plaintext: decrypted.toString("utf8"),
        }),
      );
      return;
    }

    if (req.method === "DELETE" && req.url === "/v1/crypto/delete") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          contract: "helix.dpapi-crypto.v1",
          operation: "delete",
          deleted: true,
        }),
      );
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
  } catch {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`container-bridge listening on http://127.0.0.1:${port}`);
});

process.on("SIGINT", () => server.close());
process.on("SIGTERM", () => server.close());
