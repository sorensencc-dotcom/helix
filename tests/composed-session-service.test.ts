import { describe, expect, it } from "vitest";
import { ComposedSessionService } from "../src/application/composed-session-service.js";
import type {
  RequestEnvelope,
  SessionContext,
} from "../src/application/composition-contract.js";

const session: SessionContext = {
  sessionId: "session_composed_fixture" as SessionContext["sessionId"],
  operator: { sid: "S-1-5-21-fixture", groups: [] },
  governanceState: "ordinary",
  persistenceClass: "encrypted-sqlite",
  icfAvailable: true,
  clientType: "HTTP",
};
const envelope: RequestEnvelope = {
  id: "00000000-0000-4000-8000-000000000001",
  operator: session.operator,
  sessionId: session.sessionId,
  payload: { prompt: "fixture" },
  scope: "ordinary",
  requestedModel: "fixture-model",
  requestedSources: ["fixture:source"],
  timestamp: "2026-09-11T12:00:00.000Z",
};

describe("ComposedSessionService", () => {
  it("forwards the local contract and projects a daemon response", async () => {
    const calls: string[] = [];
    const service = new ComposedSessionService({
      retrieval: {
        retrieve: async (request) => {
          calls.push("retrieval");
          expect(request.payload).toEqual(envelope.payload);
          return {
            contextPacket: { text: "context" },
            sourcesUsed: ["fixture:source"],
            state: "success",
          };
        },
      },
      models: {
        select: async (request) => {
          calls.push("model");
          expect(request.requestedModel).toBe("fixture-model");
          return {
            selectedModel: "fixture-model",
            availableModels: ["fixture-model"],
            reason: "operator",
            overrideStatus: "operator",
          };
        },
      },
      responses: {
        respond: async (request) => {
          calls.push("response");
          expect(request.retrieval.sourcesUsed).toEqual(["fixture:source"]);
          return {
            correlationId: "corr_fixture" as never,
            answer: "answer",
            sourcesUsed: request.retrieval.sourcesUsed,
            modelUsed: request.modelDecision.selectedModel,
            stateDisclosures: {
              persistenceMode: "encrypted-sqlite",
              sourceState: "success",
              overrideState: "operator",
            },
          };
        },
      },
      persistence: {
        save: async () => {
          calls.push("persistence");
          return { stored: true, location: "fixture" };
        },
      },
      audit: {
        record: async (event) => {
          calls.push("audit");
          expect(event.persistenceState.stored).toBe(true);
        },
      },
    });

    await expect(service.respond(envelope, session)).resolves.toMatchObject({
      answer: "answer",
      modelUsed: "fixture-model",
      persistenceMode: "encrypted-sqlite",
    });
    expect(calls).toEqual([
      "retrieval",
      "model",
      "response",
      "persistence",
      "audit",
    ]);
  });

  it("fails closed before model execution or persistence for governed retrieval", async () => {
    const calls: string[] = [];
    const governed = {
      ...session,
      governanceState: "governed" as const,
      persistenceClass: "ram-only" as const,
    };
    const service = new ComposedSessionService({
      retrieval: {
        retrieve: async () => {
          calls.push("retrieval");
          return { contextPacket: null, sourcesUsed: [], state: "fail-closed" };
        },
      },
      models: {
        select: async () => {
          calls.push("model");
          throw new Error("must not run");
        },
      },
      responses: {
        respond: async () => {
          calls.push("response");
          throw new Error("must not run");
        },
      },
      persistence: {
        save: async () => {
          calls.push("persistence");
          return { stored: true };
        },
      },
      audit: {
        record: async () => {
          calls.push("audit");
        },
      },
    });

    await expect(service.respond(envelope, governed)).rejects.toThrow(
      "RETRIEVAL_FAIL_CLOSED",
    );
    expect(calls).toEqual(["retrieval"]);
  });
});
