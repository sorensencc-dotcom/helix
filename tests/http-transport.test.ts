import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createIdentityEnvelope } from "../src/domain/identity.js";
import { HttpAdapterTransport } from "../src/adapters/transport.js";

const identity = createIdentityEnvelope(
  { sid: "S-1-fixture", upn: "operator@example.test", groups: [] },
  {
    sessionId: "session_fixture",
    correlationId: "corr_fixture-001",
    createdAt: "2026-09-10T12:00:00.000Z",
    governed: true,
  },
);

describe("HTTP adapter transport", () => {
  it("posts the identity envelope and parses the response", async () => {
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body) as { identity: typeof identity };
      expect(payload.identity.helixSession.correlationId).toBe(
        "corr_fixture-001",
      );
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as { port: number };
    const transport = new HttpAdapterTransport(
      "http://127.0.0.1:" + address.port,
      (value) => value as { ok: boolean },
    );
    await expect(
      transport.send({ request: "fixture" }, identity),
    ).resolves.toEqual({ ok: true });
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
});
