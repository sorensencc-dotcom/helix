import { describe, expect, it } from "vitest";
import { SessionService } from "../src/application/session-service.js";
import type {
  AssistantResponse,
  ContextPacket,
  CorrelationId,
  ModelDecision,
  SessionId,
} from "../src/domain/contracts.js";

const sessionId = "session_fixture" as SessionId;
const correlationId = "corr_fixture-001" as CorrelationId;
const context: ContextPacket = {
  sources: ["fixture:icf-001"],
  governed: true,
  lineageId: "lineage-fixture-001",
};
const model: ModelDecision = {
  provider: "whichllm-local-fixture",
  model: "fixture-model-1",
  cloudEnabled: false,
};

describe("SessionService local adapter wiring", () => {
  it("connects retrieval, model selection, response, persistence, and audit in order", async () => {
    const calls: string[] = [];
    const response: AssistantResponse = {
      correlationId,
      sessionId: "response-session-placeholder" as SessionId,
      text: "fixture response",
      context,
      model,
    };
    const service = new SessionService(
      {
        retrieve: async (query) => {
          calls.push(`retrieve:${query}`);
          return context;
        },
      },
      {
        select: async () => {
          calls.push("select");
          return model;
        },
      },
      {
        respond: async (input, receivedContext, receivedModel) => {
          calls.push(`respond:${input}`);
          expect(receivedContext).toBe(context);
          expect(receivedModel).toBe(model);
          return response;
        },
      },
      {
        save: async (saved) => {
          calls.push(`save:${saved.sessionId}`);
          expect(saved.sessionId).toBe(sessionId);
        },
      },
      {
        record: async (event, recordedCorrelationId) => {
          calls.push(`audit:${event}:${recordedCorrelationId}`);
        },
      },
    );

    await expect(
      service.respond(sessionId, "fixture question"),
    ).resolves.toMatchObject({
      sessionId,
      text: "fixture response",
    });
    expect(calls).toEqual([
      "retrieve:fixture question",
      "select",
      "respond:fixture question",
      "save:session_fixture",
      "audit:response.created:corr_fixture-001",
    ]);
  });

  it("does not persist or audit when retrieval fails closed", async () => {
    const calls: string[] = [];
    const service = new SessionService(
      {
        retrieve: async () => {
          calls.push("retrieve");
          throw new Error("UNAVAILABLE");
        },
      },
      {
        select: async () => {
          calls.push("select");
          return model;
        },
      },
      {
        respond: async () => {
          calls.push("respond");
          return {} as AssistantResponse;
        },
      },
      {
        save: async () => {
          calls.push("save");
        },
      },
      {
        record: async () => {
          calls.push("audit");
        },
      },
    );

    await expect(
      service.respond(sessionId, "governed question"),
    ).rejects.toThrow("UNAVAILABLE");
    expect(calls).toEqual(["retrieve"]);
  });
});
