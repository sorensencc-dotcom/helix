import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { createDaemon } from "../../src/daemon/server.js";
import { createSessionService } from "../../src/application/composition-root.js";
import { WindowsBridgePrincipalResolver } from "../../src/adapters/windows-principal.js";
import {
  CurlNegotiateFetch,
  WindowsBridgeCryptoProvider,
} from "../../src/platform/windows-integrations.js";
import { BridgeSupervisor } from "../../src/platform/bridge-supervisor.js";
import { SqliteTaskStore } from "../../src/infrastructure/task-store.js";
import { writeFakeWindowsBridge } from "../../tests/support/fake-windows-bridge.js";
import type { HelixConfig } from "../../src/infrastructure/config.js";
import type {
  ResponseRequest,
  ResponseResult,
} from "../../src/application/composition-contract.js";
import type { CorrelationId } from "../../src/domain/contracts.js";
import { randomUUID } from "node:crypto";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

const bridgePort = await freePort();
const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
const fakeBridge = await writeFakeWindowsBridge(bridgePort);

const supervisor = new BridgeSupervisor({
  command: fakeBridge.command,
  readyUrl: bridgeUrl,
  readyTimeoutMs: 5000,
  readyPollIntervalMs: 50,
});
await supervisor.start();

const dbDir = await mkdtemp(join(tmpdir(), "helix-daemon-smoke-"));
const taskDatabasePath = join(dbDir, "helix.sqlite");

const config: HelixConfig = {
  host: "127.0.0.1",
  port: 0,
  version: "0.1.0",
  taskDatabasePath,
  windowsBridgeUrl: bridgeUrl,
  windowsBridgeCommand: fakeBridge.command,
  icfResolveUrl: "http://localhost:4180/icf/resolve",
  whichLlmUrl: "http://localhost:4180/whichllm/route",
  sigilExecuteUrl: "http://localhost:4180/sigil/execute",
};

const negotiateFetch = new CurlNegotiateFetch();
const cryptoProvider = new WindowsBridgeCryptoProvider(bridgeUrl, (url, init) =>
  negotiateFetch.fetch(url, init),
);
const principalResolver = new WindowsBridgePrincipalResolver(
  `${bridgeUrl}/v1/principal`,
  (url) => negotiateFetch.fetch(url),
);

// Only the response/model-execution port is synthetic: there is no real
// execution authority to call regardless of ICF/WhichLLM wiring. Retrieval
// and model-selection are left as the real HTTP-backed adapters, so they hit
// the live docker authority stub.
const composition = createSessionService(config, cryptoProvider, {
  responses: {
    async respond(request: ResponseRequest): Promise<ResponseResult> {
      return {
        correlationId: `corr_${request.session.sessionId}_${randomUUID()}` as CorrelationId,
        answer: { echoedPayload: request.payload },
        sourcesUsed: request.retrieval.sourcesUsed,
        modelUsed: request.modelDecision.selectedModel,
        stateDisclosures: {
          persistenceMode: request.session.persistenceClass,
          sourceState: request.retrieval.state,
          overrideState: request.modelDecision.overrideStatus,
        },
      };
    },
  },
});

const taskStore = new SqliteTaskStore(taskDatabasePath);
const daemon = createDaemon(config, {
  taskStore,
  sessionService: composition.service,
  resolvePrincipal: principalResolver,
});
const address = await new Promise<{ port: number }>((resolve) => {
  daemon.listen(0, "127.0.0.1", () =>
    resolve(daemon.address() as { port: number }),
  );
});
const daemonUrl = `http://127.0.0.1:${address.port}`;

try {
  const session = await fetch(`${daemonUrl}/v1/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "daemon_smoke_session" }),
  });
  console.log("session status:", session.status);

  const task = await fetch(`${daemonUrl}/v1/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: "daemon_smoke_session",
      instruction: "prove the authority stub flows through the full daemon",
    }),
  });
  console.log("task status:", task.status);
  const taskBody = await task.json();
  console.log("task response:", JSON.stringify(taskBody.response, null, 2));
} finally {
  daemon.close();
  composition.close();
  taskStore.close();
  await supervisor.stop();
  await fakeBridge.cleanup();
  await rm(dbDir, { recursive: true, force: true });
}
