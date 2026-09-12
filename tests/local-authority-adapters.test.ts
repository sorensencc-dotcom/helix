import { describe, expect, it } from "vitest";
import {
  IcfRetrievalAdapter,
  SigilExecutionAdapter,
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

  it("returns a failure when Sigil is unavailable", async () => {
    const adapter = new SigilExecutionAdapter(transport, () => identity);
    await expect(
      adapter.propose("sigil.example.capability", {}, session),
    ).resolves.toMatchObject({ status: "failure", code: "UNAVAILABLE" });
  });

  it("returns a proposal when Sigil accepts the capability request", async () => {
    const mockTransport = {
      send: async () => ({
        contract: "helix-adapter.v1",
        status: "success",
        proposalId: "proposal_fixture-001",
        state: "APPROVAL_REQUIRED",
      }),
    };
    const adapter = new SigilExecutionAdapter(mockTransport, () => identity);
    await expect(
      adapter.propose("sigil.example.capability", { arg: 1 }, session),
    ).resolves.toEqual({
      proposalId: "proposal_fixture-001",
      state: "APPROVAL_REQUIRED",
    });
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

  it("resolves valid ICF success payloads and attaches lineage ID in governed scope", async () => {
    const mockTransport = {
      send: async () => ({
        contract: "helix-adapter.v1",
        status: "success",
        sources: [
          "upstream:google/sam@674af93",
          "upstream:trailhq/Graft@65c2966",
        ],
        governed: true,
        lineageId: "lin_drift_20260912_063500",
      }),
    };
    const adapter = new IcfRetrievalAdapter(mockTransport, () => ({
      ...identity,
      helixSession: { ...identity.helixSession, governed: true },
    }));

    const result = await adapter.retrieve({
      session: {
        ...session,
        governanceState: "governed",
        persistenceClass: "ram-only",
      },
      payload: { query: "upstream_drift_evaluation" },
      constraints: { scope: "governed" },
    });

    expect(result.state).toBe("success");
    expect(result.sourcesUsed).toEqual([
      "upstream:google/sam@674af93",
      "upstream:trailhq/Graft@65c2966",
    ]);
    expect(result.lineageRecord).toBe("lin_drift_20260912_063500");
  });

  it("selects provider and model when WhichLLM returns success", async () => {
    const mockTransport = {
      send: async () => ({
        contract: "helix-adapter.v1",
        status: "success",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        cloudEnabled: true,
      }),
    };
    const adapter = new WhichLlmSelectionAdapter(mockTransport, () => identity);

    const result = await adapter.select({
      session,
      retrieval: { contextPacket: null, sourcesUsed: [], state: "success" },
    });

    expect(result.selectedModel).toBe("claude-3-5-sonnet");
    expect(result.overrideStatus).toBe("auto");
    expect(result.availableModels).toContain("claude-3-5-sonnet");
  });
});
