import { afterAll, describe, expect, it } from "vitest";
import { createDaemon } from "../src/daemon/server.js";
import { createDaemonClient } from "../src/clients/daemon-client.js";

const daemon = createDaemon({ host: "127.0.0.1", port: 0, version: "0.1.0" });
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
    const task = await client.createTask(session.sessionId, "client-task-key");
    expect(task).toMatchObject({
      state: "QUEUED",
      sessionId: "client_session",
    });
  });
});
