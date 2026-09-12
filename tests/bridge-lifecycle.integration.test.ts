import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createDaemon } from "../src/daemon/server.js";
import { createSessionService } from "../src/application/composition-root.js";
import { WindowsBridgePrincipalResolver } from "../src/adapters/windows-principal.js";
import {
  CurlNegotiateFetch,
  WindowsBridgeCryptoProvider,
} from "../src/platform/windows-integrations.js";
import { BridgeSupervisor } from "../src/platform/bridge-supervisor.js";
import { SqliteSessionStore } from "../src/infrastructure/session-store.js";
import { SqliteTaskStore } from "../src/infrastructure/task-store.js";
import { writeFakeWindowsBridge } from "./support/fake-windows-bridge.js";
import { createDeterministicLocalPorts } from "./support/deterministic-local-ports.js";
import type { HelixConfig } from "../src/infrastructure/config.js";
import type { SessionId } from "../src/domain/contracts.js";

const describeIfWindows =
  process.platform === "win32" ? describe : describe.skip;

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

describeIfWindows(
  "Helix daemon wired against the (fake) Windows bridge",
  () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
      while (cleanups.length > 0) {
        const cleanup = cleanups.pop();
        if (cleanup) await cleanup();
      }
    });

    async function setUp() {
      const bridgePort = await freePort();
      const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
      const fakeBridge = await writeFakeWindowsBridge(bridgePort);
      cleanups.push(fakeBridge.cleanup);

      const supervisor = new BridgeSupervisor({
        command: fakeBridge.command,
        readyUrl: bridgeUrl,
        readyTimeoutMs: 5000,
        readyPollIntervalMs: 50,
      });
      cleanups.push(() => supervisor.stop());
      await supervisor.start();

      const dbDir = await mkdtemp(join(tmpdir(), "helix-bridge-lifecycle-"));
      cleanups.push(() => rm(dbDir, { recursive: true, force: true }));
      const taskDatabasePath = join(dbDir, "helix.sqlite");

      const config: HelixConfig = {
        host: "127.0.0.1",
        port: 0,
        version: "0.1.0",
        taskDatabasePath,
        windowsBridgeUrl: bridgeUrl,
        windowsBridgeCommand: fakeBridge.command,
      };

      const negotiateFetch = new CurlNegotiateFetch();
      const cryptoProvider = new WindowsBridgeCryptoProvider(
        bridgeUrl,
        (url, init) => negotiateFetch.fetch(url, init),
      );
      const principalResolver = new WindowsBridgePrincipalResolver(
        `${bridgeUrl}/v1/principal`,
        (url) => negotiateFetch.fetch(url),
      );
      const composition = createSessionService(
        config,
        cryptoProvider,
        createDeterministicLocalPorts(),
      );
      cleanups.push(() => composition.close());

      const taskStore = new SqliteTaskStore(taskDatabasePath);
      cleanups.push(() => taskStore.close());

      const daemon = createDaemon(config, {
        taskStore,
        sessionService: composition.service,
        resolvePrincipal: principalResolver,
      });
      cleanups.push(() => {
        daemon.close();
      });
      const address = await new Promise<{ port: number }>((resolve) => {
        daemon.listen(0, "127.0.0.1", () =>
          resolve(daemon.address() as { port: number }),
        );
      });
      const daemonUrl = `http://127.0.0.1:${address.port}`;

      return {
        bridgeUrl,
        bridgePort,
        fakeBridge,
        supervisor,
        config,
        cryptoProvider,
        daemon,
        daemonUrl,
      };
    }

    it("routes an authenticated POST /v1/tasks through the resolver into DPAPI-backed persistence", async () => {
      const { daemonUrl, config, cryptoProvider } = await setUp();

      const session = await fetch(`${daemonUrl}/v1/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "bridge_session" }),
      });
      expect(session.status).toBe(201);

      const task = await fetch(`${daemonUrl}/v1/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "bridge_session",
          instruction: "summarize the governed status",
        }),
      });
      expect(task.status).toBe(202);
      const taskBody = await task.json();
      expect(taskBody.state).toBe("COMPLETED");
      expect(taskBody.metadata.receiptState).toBe("persisted");
      expect(taskBody.metadata.operator).toMatchObject({
        upn: "fixture.operator@helix.test",
      });

      const store = new SqliteSessionStore(
        config.taskDatabasePath,
        cryptoProvider,
      );
      try {
        const records = await store.list("bridge_session" as SessionId);
        expect(records).toHaveLength(1);
        expect(records[0]?.context?.governed).toBe(false);
      } finally {
        store.close();
      }
    });

    it("fails closed on the next request once the bridge process exits unexpectedly", async () => {
      const { daemonUrl, supervisor } = await setUp();

      await fetch(`${daemonUrl}/v1/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "bridge_exit_session" }),
      });

      supervisor.stop();

      const task = await fetch(`${daemonUrl}/v1/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "bridge_exit_session",
          instruction: "should fail closed without the bridge",
        }),
      });
      expect(task.status).toBe(401);
      expect(await task.json()).toMatchObject({
        code: "WINDOWS_AUTH_REQUIRED",
      });
    });

    it("recovers persisted session data across a bridge restart", async () => {
      const { daemonUrl, config, cryptoProvider, supervisor, fakeBridge } =
        await setUp();

      await fetch(`${daemonUrl}/v1/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "restart_session" }),
      });
      await fetch(`${daemonUrl}/v1/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "restart_session",
          instruction: "persist before restart",
        }),
      });

      supervisor.stop();
      await supervisor.start();

      const task = await fetch(`${daemonUrl}/v1/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "restart_session",
          instruction: "still governed by the same operator after restart",
        }),
      });
      expect(task.status).toBe(202);
      expect((await task.json()).state).toBe("COMPLETED");

      const store = new SqliteSessionStore(
        config.taskDatabasePath,
        cryptoProvider,
      );
      try {
        const records = await store.list("restart_session" as SessionId);
        expect(records).toHaveLength(2);
      } finally {
        store.close();
      }
      void fakeBridge;
    });
  },
);
