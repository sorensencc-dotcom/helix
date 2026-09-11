import { describe, expect, it } from "vitest";
import { createDaemon } from "../src/daemon/server.js";
import { ComposedSessionService } from "../src/application/composed-session-service.js";
import type { WindowsPrincipalResolver } from "../src/daemon/auth.js";

function fakeService(): ComposedSessionService {
  return new ComposedSessionService({
    retrieval: {
      retrieve: async () => ({
        contextPacket: { text: "context" },
        sourcesUsed: ["fixture:source"],
        state: "success",
      }),
    },
    models: {
      select: async () => ({
        selectedModel: "fixture-model",
        availableModels: ["fixture-model"],
        reason: "operator",
        overrideStatus: "operator",
      }),
    },
    responses: {
      respond: async (request) => ({
        correlationId: "corr_fixture" as never,
        answer: "answer",
        sourcesUsed: request.retrieval.sourcesUsed,
        modelUsed: request.modelDecision.selectedModel,
        stateDisclosures: {
          persistenceMode: "ram-only",
          sourceState: "success",
          overrideState: "operator",
        },
      }),
    },
    persistence: {
      save: async () => ({ stored: true, location: "fixture" }),
    },
    audit: {
      record: async () => {},
    },
  });
}

async function withDaemon(
  options: Parameters<typeof createDaemon>[1],
  run: (url: string) => Promise<void>,
): Promise<void> {
  const daemon = createDaemon(
    {
      host: "127.0.0.1",
      port: 0,
      version: "0.1.0",
      taskDatabasePath: ":memory:",
    },
    options,
  );
  const address = await new Promise<{ port: number }>((resolve) => {
    daemon.listen(0, "127.0.0.1", () =>
      resolve(daemon.address() as { port: number }),
    );
  });
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    daemon.close();
  }
}

describe("daemon task route with a wired ComposedSessionService", () => {
  it("executes the task through the service and stores response and metadata separately", async () => {
    await withDaemon({ sessionService: fakeService() }, async (url) => {
      await fetch(`${url}/v1/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "session_composed" }),
      });
      const task = await fetch(`${url}/v1/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "session_composed",
          instruction: "read the governed status",
        }),
      });
      expect(task.status).toBe(202);
      const body = await task.json();
      expect(body.state).toBe("COMPLETED");
      expect(body.response).toMatchObject({
        answer: "answer",
        modelUsed: "fixture-model",
      });
      expect(body.metadata).toMatchObject({
        taskId: body.id,
        sessionId: "session_composed",
        approvalState: "not-required",
      });
      expect(body.metadata.answer).toBeUndefined();
      expect(body.response.approvalState).toBeUndefined();

      const fetched = await fetch(`${url}/v1/tasks/${body.id}`);
      expect(await fetched.json()).toMatchObject({
        state: "COMPLETED",
        response: { answer: "answer" },
        metadata: { taskId: body.id },
      });
    });
  });

  it("returns 401 when the wired Windows principal resolver fails closed", async () => {
    const resolver: WindowsPrincipalResolver = {
      resolve: async () => undefined,
    };
    await withDaemon(
      { sessionService: fakeService(), resolvePrincipal: resolver },
      async (url) => {
        await fetch(`${url}/v1/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: "session_auth" }),
        });
        const task = await fetch(`${url}/v1/tasks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: "session_auth",
            instruction: "read the governed status",
          }),
        });
        expect(task.status).toBe(401);
      },
    );
  });
});
