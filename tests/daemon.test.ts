import { afterAll, describe, expect, it } from "vitest";
import { createDaemon } from "../src/daemon/server.js";

const daemon = createDaemon({
  host: "127.0.0.1",
  port: 0,
  version: "0.1.0",
  taskDatabasePath: ":memory:",
  windowsBridgeUrl: "http://127.0.0.1:8792",
});
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
  it("rejects unsafe runtime bind configuration", () => {
    expect(() =>
      createDaemon({
        host: "0.0.0.0",
        port: 0,
        version: "0.1.0",
        taskDatabasePath: ":memory:",
        windowsBridgeUrl: "http://127.0.0.1:8792",
      }),
    ).toThrow("CONFIG_UNSAFE_BIND");
  });

  it("rejects invalid JSON shapes and idempotency keys", async () => {
    const invalidJson = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["not", "an", "object"]),
    });
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toMatchObject({ code: "INVALID_JSON" });

    const invalidKey = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "bad key",
      },
      body: JSON.stringify({}),
    });
    expect(invalidKey.status).toBe(400);
    expect(await invalidKey.json()).toMatchObject({
      code: "INVALID_IDEMPOTENCY_KEY",
    });
  });

  it("requires JSON content type for session creation", async () => {
    const response = await fetch(`${url}/v1/sessions`, { method: "POST" });
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("rejects unsafe session IDs and NUL-containing instructions", async () => {
    const session = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "unsafe id" }),
    });
    expect(session.status).toBe(400);
    expect(await session.json()).toMatchObject({ code: "INVALID_SESSION_ID" });

    const validSession = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "bounded_session" }),
    });
    const task = await fetch(`${url}/v1/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "bounded_session",
        instruction: "bad\u0000input",
      }),
    });
    expect(validSession.status).toBe(201);
    expect(task.status).toBe(400);
    expect(await task.json()).toMatchObject({ code: "INVALID_TASK_INPUT" });
  });

  it("creates an idempotent session and queues then cancels a task", async () => {
    const session = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "session-key",
      },
      body: JSON.stringify({
        sessionId: "session_http",
      }),
    });
    expect(session.status).toBe(201);
    expect(await session.json()).toEqual({
      sessionId: "session_http",
      status: "READY",
    });
    const duplicate = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "session_http" }),
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      code: "SESSION_ALREADY_EXISTS",
    });
    const replay = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "session-key",
      },
      body: JSON.stringify({ sessionId: "session_http" }),
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      sessionId: "session_http",
      status: "READY",
    });
    const conflict = await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "session-key",
      },
      body: JSON.stringify({ sessionId: "different" }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    const task = await fetch(`${url}/v1/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "session_http",
        instruction: "read the governed status",
      }),
    });
    expect(task.status).toBe(202);
    const taskBody = await task.json();
    expect(taskBody.correlationId).toMatch(/^corr_/);
    const fetched = await fetch(`${url}/v1/tasks/${taskBody.id}`);
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({ id: taskBody.id });
    const cancelled = await fetch(`${url}/v1/tasks/${taskBody.id}/cancel`, {
      method: "POST",
    });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({ state: "CANCELLED" });
    const repeated = await fetch(`${url}/v1/tasks/${taskBody.id}/cancel`, {
      method: "POST",
    });
    expect(repeated.status).toBe(409);
    expect(await repeated.json()).toMatchObject({
      code: "TASK_ALREADY_CANCELLED",
    });
    const closed = await fetch(`${url}/v1/sessions/session_http`, {
      method: "DELETE",
    });
    expect(closed.status).toBe(200);
    expect(await closed.json()).toEqual({
      sessionId: "session_http",
      status: "CLOSED",
    });
  });

  it("replays only newer SSE events", async () => {
    const response = await fetch(`${url}/v1/stream`, {
      headers: { "last-event-id": "1" },
    });
    expect(await response.text()).toContain("id: 2\nevent: done");
  });
});
