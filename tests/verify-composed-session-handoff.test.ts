import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteSessionStore } from "../src/infrastructure/session-store.js";
import { ComposedSessionService } from "../src/application/composed-session-service.js";
import type {
  AssistantResponse,
  CorrelationId,
  SessionId,
} from "../src/domain/contracts.js";
import type {
  RequestEnvelope,
  SessionContext,
} from "../src/application/composition-contract.js";

describe("ComposedSessionService & SessionStore cross-subshell verification", () => {
  let tmpDir: string;
  let dbPath: string;
  const keyProvider = {
    getKey: async () => new Uint8Array(32).fill(7),
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "helix-session-test-"));
    dbPath = join(tmpDir, "test-session.db");
  });

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("persists and rehydrates state across agent subshell handoffs", async () => {
    const parentStore = new SqliteSessionStore(dbPath, keyProvider);
    const sessionId = "sess_handoff_01" as SessionId;

    const parentResponse: AssistantResponse = {
      sessionId,
      correlationId: "corr_parent_01" as AssistantResponse["correlationId"],
      text: "parent initialized step 1",
      context: { sources: ["manifest.json"], governed: false },
    };
    await parentStore.save(parentResponse);

    // Verify parent can run ComposedSessionService
    const composedService = new ComposedSessionService({
      retrieval: {
        retrieve: async () => ({
          contextPacket: { text: "parent context" },
          sourcesUsed: ["manifest.json"],
          state: "success",
        }),
      },
      models: {
        select: async () => ({
          selectedModel: "default-model",
          availableModels: ["default-model"],
          reason: "operator",
          overrideStatus: "operator",
        }),
      },
      responses: {
        respond: async () => ({
          correlationId: "corr_parent_resp" as CorrelationId,
          answer: "parent answer",
          sourcesUsed: ["manifest.json"],
          modelUsed: "default-model",
          stateDisclosures: {
            persistenceMode: "encrypted-sqlite",
            sourceState: "success",
            overrideState: "operator",
          },
        }),
      },
      persistence: {
        save: async () => ({ stored: true }),
      },
      audit: {
        record: async () => {},
      },
    });

    const envelope: RequestEnvelope = {
      id: "00000000-0000-4000-8000-000000000001",
      operator: { sid: "S-1-5-21-fixture", groups: [] },
      sessionId,
      payload: { prompt: "run step 1" },
      scope: "ordinary",
      requestedModel: "default-model",
      requestedSources: ["manifest.json"],
      timestamp: new Date().toISOString(),
    };

    const sessionCtx: SessionContext = {
      sessionId,
      operator: envelope.operator,
      governanceState: "ordinary",
      persistenceClass: "encrypted-sqlite",
      icfAvailable: true,
      clientType: "HTTP",
    };

    const daemonRes = await composedService.respond(envelope, sessionCtx);
    expect(daemonRes.modelUsed).toBe("default-model");
    parentStore.close();

    // Spawn subshell to mutate session state
    const subshellCode = `
      import { SqliteSessionStore } from './src/infrastructure/session-store.ts';
      const keyProvider = { getKey: async () => new Uint8Array(32).fill(7) };
      const store = new SqliteSessionStore(process.env.SESSION_DB, keyProvider);
      
      const records = await store.list(process.env.SESSION_ID);
      if (records.length !== 1 || records[0].correlationId !== 'corr_parent_01') {
        process.exit(2);
      }

      await store.save({
        sessionId: process.env.SESSION_ID,
        correlationId: 'corr_subshell_worker_01',
        text: 'worker completed step 2',
        context: { sources: ['worker-sub-1'], governed: false }
      });
      store.close();
      process.exit(0);
    `;

    const subshell = spawn(
      process.execPath,
      ["--import", "tsx", "--eval", subshellCode],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SESSION_DB: dbPath,
          SESSION_ID: sessionId,
        },
      },
    );

    const exitCode = await new Promise<number>((resolve) =>
      subshell.on("close", resolve),
    );
    expect(exitCode).toBe(0);

    // Rehydrate in parent and verify event continuity
    const rehydratedStore = new SqliteSessionStore(dbPath, keyProvider);
    const history = await rehydratedStore.list(sessionId);
    expect(history.length).toBe(2);
    expect(history[0]?.correlationId).toBe("corr_parent_01");
    expect(history[1]?.correlationId).toBe("corr_subshell_worker_01");
    expect(history[1]?.text).toBe("worker completed step 2");
    rehydratedStore.close();
  });

  it("handles concurrent subshell writers under SQLite without dropped records", async () => {
    const sessionId = "sess_concurrent_01" as SessionId;
    const initStore = new SqliteSessionStore(dbPath, keyProvider);
    initStore.close();

    const spawnWorker = (workerId: string, writeCount: number) => {
      const code = `
        import { SqliteSessionStore } from './src/infrastructure/session-store.ts';
        const keyProvider = { getKey: async () => new Uint8Array(32).fill(7) };
        const store = new SqliteSessionStore(process.env.SESSION_DB, keyProvider);
        const count = parseInt(process.env.WRITE_COUNT, 10);
        const workerId = process.env.WORKER_ID;

        for (let i = 0; i < count; i++) {
          await store.save({
            sessionId: process.env.SESSION_ID,
            correlationId: 'corr_' + workerId + '_' + i,
            text: 'heartbeat ' + i + ' from ' + workerId,
            context: { sources: [workerId], governed: false }
          });
        }
        store.close();
        process.exit(0);
      `;

      const child = spawn(
        process.execPath,
        ["--import", "tsx", "--eval", code],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            SESSION_DB: dbPath,
            SESSION_ID: sessionId,
            WORKER_ID: workerId,
            WRITE_COUNT: String(writeCount),
            // Node 22 emits SQLite ExperimentalWarning on worker stderr; keep asserts on real failures.
            NODE_OPTIONS: [process.env.NODE_OPTIONS, "--disable-warning=ExperimentalWarning"]
              .filter(Boolean)
              .join(" "),
          },
        },
      );

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      const exitPromise = new Promise<{ code: number | null; stderr: string }>(
        (resolve) => {
          child.on("close", (code) => resolve({ code, stderr }));
        },
      );

      return { child, exitPromise };
    };

    const workerA = spawnWorker("worker-A", 15);
    const workerB = spawnWorker("worker-B", 15);

    const [resA, resB] = await Promise.all([
      workerA.exitPromise,
      workerB.exitPromise,
    ]);

    expect(resA.stderr).toBe("");
    expect(resA.code).toBe(0);
    expect(resB.stderr).toBe("");
    expect(resB.code).toBe(0);

    const store = new SqliteSessionStore(dbPath, keyProvider);
    const records = await store.list(sessionId);
    expect(records.length).toBe(30);
    store.close();
  });

  it("recovers session from latest high-water checkpoint following subshell SIGKILL", async () => {
    const sessionId = "sess_sigkill_recovery" as SessionId;
    const initialStore = new SqliteSessionStore(dbPath, keyProvider);

    await initialStore.save({
      sessionId,
      correlationId: "cp-01" as AssistantResponse["correlationId"],
      text: "checkpoint_highwater_1",
      context: { sources: ["checkpoint"], governed: false },
    });
    initialStore.close();

    // Spawn doomed worker that hangs indefinitely
    const doomedWorker = spawn(
      process.execPath,
      ["--import", "tsx", "--eval", "setInterval(() => {}, 1000);"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SESSION_DB: dbPath,
          SESSION_ID: sessionId,
        },
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 300));
    doomedWorker.kill("SIGKILL");
    await new Promise((resolve) => doomedWorker.on("close", resolve));

    // Spawn successor subshell to verify recovery from checkpoint
    const successorCode = `
      import { SqliteSessionStore } from './src/infrastructure/session-store.ts';
      const keyProvider = { getKey: async () => new Uint8Array(32).fill(7) };
      const store = new SqliteSessionStore(process.env.SESSION_DB, keyProvider);
      
      const records = await store.list(process.env.SESSION_ID);
      const latestCheckpoint = records.find(r => r.correlationId === 'cp-01');
      if (!latestCheckpoint) {
        process.exit(3);
      }

      await store.save({
        sessionId: process.env.SESSION_ID,
        correlationId: 'recovery_resumed_01',
        text: 'resumed execution from cp-01',
        context: { sources: ['recovery'], governed: false }
      });
      store.close();
      process.exit(0);
    `;

    const successor = spawn(
      process.execPath,
      ["--import", "tsx", "--eval", successorCode],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SESSION_DB: dbPath,
          SESSION_ID: sessionId,
        },
      },
    );

    const successorExit = await new Promise<number>((resolve) =>
      successor.on("close", resolve),
    );
    expect(successorExit).toBe(0);

    const recoveryStore = new SqliteSessionStore(dbPath, keyProvider);
    const finalHistory = await recoveryStore.list(sessionId);
    expect(finalHistory.length).toBe(2);
    expect(finalHistory[1]?.correlationId).toBe("recovery_resumed_01");
    expect(finalHistory[1]?.text).toBe("resumed execution from cp-01");
    recoveryStore.close();
  });
});
