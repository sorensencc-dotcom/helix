import { afterAll, describe, expect, it } from "vitest";
import { createDaemon } from "../src/daemon/server.js";

const daemon = createDaemon({ host: "127.0.0.1", port: 0, version: "0.1.0" });
const address = await new Promise<{ port: number }>((resolve) => {
  daemon.listen(0, "127.0.0.1", () =>
    resolve(daemon.address() as { port: number }),
  );
});
const url = `http://127.0.0.1:${address.port}`;

afterAll(() => {
  daemon.close();
});

describe("daemon routes", () => {
  it("creates an idempotent session and queues then cancels a task", async () => {
    const session = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "session-key",
      },
      body: JSON.stringify({ sessionId: "session_http" }),
    });
    expect(session.status).toBe(201);
    expect(await session.json()).toEqual({
      sessionId: "session_http",
      status: "READY",
    });
    const replay = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: { "idempotency-key": "session-key" },
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      sessionId: "session_http",
      status: "READY",
    });
    const task = await fetch(`${url}/v1/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "session_http" }),
    });
    expect(task.status).toBe(202);
    const taskBody = await task.json();
    const cancelled = await fetch(`${url}/v1/tasks/${taskBody.id}/cancel`, {
      method: "POST",
    });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({ state: "CANCELLED" });
  });

  it("replays only newer SSE events", async () => {
    const response = await fetch(`${url}/v1/stream`, {
      headers: { "last-event-id": "1" },
    });
    expect(await response.text()).toContain("id: 2\nevent: done");
  });
});
