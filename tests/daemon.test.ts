import { afterAll, describe, expect, it } from "vitest";
import { createDaemon } from "../src/daemon/server.js";

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
const url = `http://127.0.0.1:${address.port}`;

afterAll(() => {
  daemon.close();
});

describe("daemon routes", () => {
  it("serves the web GUI and stylesheets", async () => {
    const page = await fetch(`${url}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("content-security-policy")).toContain(
      "object-src 'none'",
    );
    expect(await page.text()).toContain("Helix");

    const index = await fetch(`${url}/index.html`);
    expect(index.status).toBe(200);
    expect(await index.text()).toContain("fetch('/v1/stream?follow=1'");

    const styles = await fetch(`${url}/styles/cast-iron-charlie.css`);
    expect(styles.status).toBe(200);
    expect(styles.headers.get("content-type")).toContain("text/css");
  });

  it("rejects unsafe runtime bind configuration", () => {
    expect(() =>
      createDaemon({
        host: "0.0.0.0",
        port: 0,
        version: "0.1.0",
        taskDatabasePath: ":memory:",
        windowsBridgeUrl: "http://127.0.0.1:8792",
        windowsBridgeCommand: "true",
      }),
    ).toThrow("CONFIG_UNSAFE_BIND");
  });

  it("exposes versioned, fail-closed readiness states", async () => {
    const response = await fetch(`${url}/v1/status`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "READY",
      contract: "helix.status.v1",
      version: "0.1.0",
      readiness: {
        windowsBridge: { state: "configured" },
        icf: { state: "unavailable" },
        sigil: { state: "unavailable" },
        whichLlm: { state: "unavailable" },
        persistence: { state: "ready", kind: "ram-only" },
        local: { state: "ready", mode: "local" },
        fixture: { state: "unknown" },
      },
    });
  });

  it("reports configured authority endpoints without claiming live readiness", async () => {
    const configured = createDaemon({
      host: "127.0.0.1",
      port: 0,
      version: "0.1.0",
      taskDatabasePath: ":memory:",
      windowsBridgeUrl: "http://127.0.0.1:8792",
      windowsBridgeCommand: "true",
      icfResolveUrl: "https://icf.example.test/resolve",
      sigilExecuteUrl: "https://sigil.example.test/execute",
      whichLlmUrl: "https://whichllm.example.test/route",
    });
    const configuredUrl = await new Promise<string>((resolve) => {
      configured.listen(0, "127.0.0.1", () => {
        const address = configured.address() as { port: number };
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
    try {
      const response = await fetch(`${configuredUrl}/v1/status`);
      const body = await response.json();
      expect(body.readiness).toMatchObject({
        windowsBridge: { state: "configured" },
        icf: { state: "configured" },
        sigil: { state: "configured" },
        whichLlm: { state: "configured" },
      });
      for (const authority of ["windowsBridge", "icf", "sigil", "whichLlm"]) {
        expect(body.readiness[authority].state).not.toBe("ready");
      }
    } finally {
      configured.close();
    }
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

  it("retrieves task history scoped to a session", async () => {
    for (const sessionId of ["history_one", "history_two"]) {
      const response = await fetch(`${url}/v1/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      expect(response.status).toBe(201);
    }
    const createTask = async (sessionId: string, instruction: string) =>
      fetch(`${url}/v1/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, instruction }),
      });
    const first = await createTask("history_one", "first");
    const second = await createTask("history_two", "second");
    const third = await createTask("history_one", "third");
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(third.status).toBe(202);
    const firstTask = await first.json();
    const thirdTask = await third.json();

    const history = await fetch(`${url}/v1/sessions/history_one/tasks`);
    expect(history.status).toBe(200);
    expect(await history.json()).toEqual({
      sessionId: "history_one",
      tasks: [firstTask, thirdTask],
    });
  });

  it("rejects task history requests for unknown sessions", async () => {
    const response = await fetch(`${url}/v1/sessions/missing/tasks`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: "SESSION_NOT_FOUND",
    });
  });

  it("replays only newer SSE events", async () => {
    const response = await fetch(`${url}/v1/stream`, {
      headers: { "last-event-id": "1" },
    });
    expect(await response.text()).toContain("id: 2\nevent: done");
  });

  it("publishes task lifecycle events to a live follow stream", async () => {
    const response = await fetch(`${url}/v1/stream?follow=1`);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader!.read();
    expect(new TextDecoder().decode(first.value)).toContain("event: metadata");

    await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "sse_session" }),
    });
    await fetch(`${url}/v1/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "sse_session",
        instruction: "observe",
      }),
    });

    const second = await reader!.read();
    expect(new TextDecoder().decode(second.value)).toContain('"id":"task_');
    await reader!.cancel();
  });

  it("strictly isolates and returns 404 for all /__fixture/* endpoints in production composition", async () => {
    const getCounters = await fetch(`${url}/__fixture/counters`);
    expect(getCounters.status).toBe(404);
    expect(await getCounters.json()).toEqual({
      code: "NOT_FOUND",
      message: "Route not found",
      retryable: false,
    });

    const postFaults = await fetch(`${url}/__fixture/faults`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ failLocalDispatch: true }),
    });
    expect(postFaults.status).toBe(404);
    expect(await postFaults.json()).toEqual({
      code: "NOT_FOUND",
      message: "Route not found",
      retryable: false,
    });

    const postReset = await fetch(`${url}/__fixture/reset`, {
      method: "POST",
    });
    expect(postReset.status).toBe(404);
    expect(await postReset.json()).toEqual({
      code: "NOT_FOUND",
      message: "Route not found",
      retryable: false,
    });
  });

  it("generates unique atomic task IDs under concurrent task submissions", async () => {
    await fetch(`${url}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "concurrent_session" }),
    });

    const tasks = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        fetch(`${url}/v1/tasks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: "concurrent_session",
            instruction: `task ${i}`,
          }),
        }).then((res) => res.json() as Promise<{ id: string }>),
      ),
    );

    const ids = tasks.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(10);
    ids.forEach((id) => expect(id).toMatch(/^task_[0-9a-f-]{36}$/));
  });

  it("rejects path traversal attempts on static asset requests", async () => {
    const res1 = await fetch(`${url}/..%2fpackage.json`);
    expect(res1.status).toBe(404);

    const res2 = await fetch(`${url}/sub/../../package.json`);
    expect(res2.status).toBe(404);
  });

  it("validates URL decoded parameters across session and task routes", async () => {
    const badSessionTasks = await fetch(
      `${url}/v1/sessions/bad%20session%20id!/tasks`,
    );
    expect(badSessionTasks.status).toBe(400);
    expect(await badSessionTasks.json()).toMatchObject({
      code: "INVALID_SESSION_ID",
    });

    const badTaskLookup = await fetch(`${url}/v1/tasks/bad%20task%20id!`);
    expect(badTaskLookup.status).toBe(400);
    expect(await badTaskLookup.json()).toMatchObject({
      code: "INVALID_TASK_ID",
    });

    const badTaskCancel = await fetch(
      `${url}/v1/tasks/bad%20task%20id!/cancel`,
      { method: "POST" },
    );
    expect(badTaskCancel.status).toBe(400);
    expect(await badTaskCancel.json()).toMatchObject({
      code: "INVALID_TASK_ID",
    });
  });
});
