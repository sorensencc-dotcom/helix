import { describe, expect, it } from "vitest";
import {
  IcfRetrievalAdapter,
  UnavailableResponseAdapter,
  WhichLlmSelectionAdapter,
} from "../src/adapters/local-authority-adapters.js";
import { UnavailableAdapterTransport } from "../src/adapters/transport.js";
import type { IdentityEnvelope } from "../src/domain/identity.js";
import type { SessionContext } from "../src/application/composition-contract.js";

const identity: IdentityEnvelope = {
  windows: { sid: "S-1-5-21-test", upn: "operator@example.test", groups: [] },
  helixSession: {
    sessionId: "session_adapter_test",
    correlationId: "corr_adapter-test",
    createdAt: "2026-09-11T12:00:00.000Z",
    governed: false,
  },
};
const session: SessionContext = {
  sessionId: identity.helixSession.sessionId as SessionContext["sessionId"],
  operator: identity.windows,
  governanceState: "ordinary",
  persistenceClass: "encrypted-sqlite",
  icfAvailable: false,
  clientType: "HTTP",
};
const transport = new UnavailableAdapterTransport<
  Record<string, unknown>,
  unknown
>("ICF");

describe("local authority adapters", () => {
  it("degrades ordinary retrieval when ICF is unavailable", async () => {
    const adapter = new IcfRetrievalAdapter(transport, () => identity);
    await expect(
      adapter.retrieve({
        session,
        payload: { prompt: "x" },
        constraints: { scope: "ordinary" },
      }),
    ).resolves.toMatchObject({
      state: "degraded",
      sourcesUsed: [],
    });
  });

  it("fails closed for governed retrieval when ICF is unavailable", async () => {
    const adapter = new IcfRetrievalAdapter(transport, () => identity);
    await expect(
      adapter.retrieve({
        session: {
          ...session,
          governanceState: "governed",
          persistenceClass: "ram-only",
        },
        payload: { prompt: "x" },
        constraints: { scope: "governed" },
      }),
    ).resolves.toMatchObject({
      state: "fail-closed",
    });
  });

  it("fails closed when WhichLLM is unavailable", async () => {
    const adapter = new WhichLlmSelectionAdapter(transport, () => identity);
    await expect(
      adapter.select({
        session,
        retrieval: { contextPacket: null, sourcesUsed: [], state: "degraded" },
      }),
    ).rejects.toThrow("UNAVAILABLE");
  });

  it("never executes a response locally when no execution authority exists", async () => {
    await expect(
      new UnavailableResponseAdapter().respond({
        session,
        retrieval: { contextPacket: null, sourcesUsed: [], state: "success" },
        modelDecision: {
          selectedModel: "x",
          availableModels: ["x"],
          reason: "test",
          overrideStatus: "auto",
        },
        payload: { prompt: "x" },
      }),
    ).rejects.toThrow("MODEL_EXECUTION_UNAVAILABLE");
  });
});
