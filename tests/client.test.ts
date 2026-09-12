import { afterAll, describe, expect, it, vi } from "vitest";
import { createDaemon } from "../src/daemon/server.js";
import { createDaemonClient } from "../src/clients/daemon-client.js";

const daemon = createDaemon({
  host: "127.0.0.1",
  port: 0,
  version: "0.1.0",
  taskDatabasePath: ":memory:",
  windowsBridgeUrl: "http://127.0.0.1:8792",
  windowsBridgeCommand: "true",
});
const address = await new Promise<{ port: number }>((resolve) => {
  daemon.listen(0, "127.0.0.1", () =>
    resolve(daemon.address() as { port: number }),
  );
});
const client = createDaemonClient(`http://127.0.0.1:${address.port}`);
afterAll(() => daemon.close());

describe("daemon client", () => {
  it("uses the same HTTP contracts as the browser flow", async () => {
    expect((await client.status()).status).toBe("READY");
    const session = await client.createSession("client_session");
    const task = await client.createTask(
      session.sessionId,
      "read the governed status",
      "client-task-key",
    );
    expect(task).toMatchObject({
      state: "QUEUED",
      sessionId: "client_session",
    });
    expect(await client.getTask(task.id)).toMatchObject({
      id: task.id,
      correlationId: expect.stringMatching(/^corr_/),
    });
    await expect(client.closeSession(session.sessionId)).rejects.toThrow(
      "SESSION_HAS_ACTIVE_TASKS",
    );
  });

  it("rejects malformed successful task responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "task_bad",
            state: "NOT_A_PHASE",
            sessionId: "client_session",
            correlationId: "corr_bad",
            extra: true,
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
    );
    try {
      await expect(
        createDaemonClient("http://invalid").createTask(
          "client_session",
          "test",
        ),
      ).rejects.toThrow("CONTRACT_INVALID_RESPONSE");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
