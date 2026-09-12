/**
 * LOCAL CONTRACT EVIDENCE ONLY.
 *
 * This suite runs an in-process HTTP fixture on an ephemeral port and drives
 * ICF/WhichLLM adapters through the real HttpAdapterTransport against it. It
 * proves the adapter/transport contract holds against an HTTP server; it is
 * not a live authority integration test and says nothing about the real ICF,
 * WhichLLM, Sigil, or Windows Bridge services.
 */
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIdentityEnvelope } from "../src/domain/identity.js";
import {
  IcfRetrievalAdapter,
  WhichLlmSelectionAdapter,
} from "../src/adapters/local-authority-adapters.js";
import { HttpAdapterTransport } from "../src/adapters/transport.js";
import type { SessionContext } from "../src/application/composition-contract.js";

type FailureScenario =
  | "timeout"
  | "unavailable"
  | "malformed"
  | "denied"
  | "version-mismatch";

const identity = createIdentityEnvelope(
  { sid: "S-1-fixture-matrix", upn: "operator@example.test", groups: [] },
  {
    sessionId: "session_fixture_matrix",
    correlationId: "corr_fixture-matrix",
    createdAt: "2026-09-12T00:00:00.000Z",
    governed: true,
  },
);

function session(scope: "ordinary" | "governed"): SessionContext {
  return {
    sessionId: identity.helixSession.sessionId as SessionContext["sessionId"],
    operator: identity.windows,
    governanceState: scope,
    persistenceClass: scope === "governed" ? "ram-only" : "encrypted-sqlite",
    icfAvailable: true,
    clientType: "HTTP",
  };
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const [, domain, scenario] = url.pathname.split("/");
    const model = url.searchParams.get("model") ?? "claude-fixture-model";

    if (scenario === "timeout") {
      // Never respond within the adapter's timeout window; end late so the
      // socket doesn't leak past the test.
      setTimeout(() => {
        if (!response.writableEnded) response.end();
      }, 300);
      return;
    }
    if (scenario === "unavailable") {
      response.writeHead(503).end();
      return;
    }
    if (scenario === "malformed") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ unexpected: "shape" }));
      return;
    }
    if (scenario === "denied") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          status: "failure",
          code: "DENIED",
          message: "Fixture denied the request.",
        }),
      );
      return;
    }
    if (scenario === "version-mismatch") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          status: "failure",
          code: "VERSION_MISMATCH",
          message: "Fixture reports a contract version mismatch.",
        }),
      );
      return;
    }

    // success
    response.writeHead(200, { "content-type": "application/json" });
    if (domain === "icf") {
      response.end(
        JSON.stringify({
          contract: "helix-adapter.v1",
          status: "success",
          sources: ["upstream:fixture/source@abc123"],
          governed: true,
          lineageId: "lin_fixture_matrix",
        }),
      );
    } else {
      response.end(
        JSON.stringify({
          contract: "helix-adapter.v1",
          status: "success",
          provider: "fixture-provider",
          model,
          cloudEnabled: false,
        }),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

function icfAdapter(scenario: "success" | FailureScenario) {
  const transport = new HttpAdapterTransport<Record<string, unknown>, unknown>(
    `${baseUrl}/icf/${scenario}`,
    (value) => value as never,
    50,
  );
  return new IcfRetrievalAdapter(transport, () => identity);
}

function whichLlmAdapter(
  scenario: "success" | FailureScenario,
  model?: string,
) {
  const suffix = model ? `?model=${encodeURIComponent(model)}` : "";
  const transport = new HttpAdapterTransport<Record<string, unknown>, unknown>(
    `${baseUrl}/whichllm/${scenario}${suffix}`,
    (value) => value as never,
    50,
  );
  return new WhichLlmSelectionAdapter(transport, () => identity);
}

const failureScenarios: FailureScenario[] = [
  "timeout",
  "unavailable",
  "malformed",
  "denied",
  "version-mismatch",
];

describe("fixture adapter matrix (local contract evidence only)", () => {
  it("resolves ICF success through the real HTTP transport", async () => {
    const result = await icfAdapter("success").retrieve({
      session: session("governed"),
      payload: { prompt: "fixture" },
      constraints: { scope: "governed" },
    });
    expect(result.state).toBe("success");
    expect(result.sourcesUsed).toEqual(["upstream:fixture/source@abc123"]);
    expect(result.lineageRecord).toBe("lin_fixture_matrix");
  });

  it("selects the fixture model through the real HTTP transport", async () => {
    const result = await whichLlmAdapter("success").select({
      session: session("ordinary"),
      retrieval: { contextPacket: null, sourcesUsed: [], state: "success" },
    });
    expect(result.selectedModel).toBe("claude-fixture-model");
    expect(result.overrideStatus).toBe("auto");
  });

  it("rejects a model override the fixture did not honor", async () => {
    await expect(
      whichLlmAdapter("success").select({
        session: session("ordinary"),
        retrieval: { contextPacket: null, sourcesUsed: [], state: "success" },
        requestedModel: "operator-requested-model",
      }),
    ).rejects.toThrow("MODEL_OVERRIDE_DENIED");
  });

  describe.each(failureScenarios)("ICF %s", (scenario) => {
    it("degrades ordinary retrieval", async () => {
      const result = await icfAdapter(scenario).retrieve({
        session: session("ordinary"),
        payload: { prompt: "fixture" },
        constraints: { scope: "ordinary" },
      });
      expect(result.state).toBe("degraded");
      expect(result.sourcesUsed).toEqual([]);
    });

    it("fails closed for governed retrieval", async () => {
      const result = await icfAdapter(scenario).retrieve({
        session: session("governed"),
        payload: { prompt: "fixture" },
        constraints: { scope: "governed" },
      });
      expect(result.state).toBe("fail-closed");
    });
  });

  describe.each(failureScenarios)("WhichLLM %s", (scenario) => {
    it("throws rather than selecting a model", async () => {
      await expect(
        whichLlmAdapter(scenario).select({
          session: session("ordinary"),
          retrieval: {
            contextPacket: null,
            sourcesUsed: [],
            state: "degraded",
          },
        }),
      ).rejects.toThrow();
    });
  });
});
