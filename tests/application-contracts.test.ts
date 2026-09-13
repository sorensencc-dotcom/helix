import { describe, expect, it } from "vitest";
import {
  approvalMetadataSchema,
  daemonResponseSchema,
  responseResultSchema,
} from "../src/application/contract-schemas.js";

const response = {
  correlationId: "corr_fixture",
  answer: "answer",
  sourcesUsed: ["fixture:source"],
  modelUsed: "fixture-model",
  stateDisclosures: {
    persistenceMode: "encrypted-sqlite",
    sourceState: "success",
    overrideState: "operator",
  },
};

const daemonResponse = {
  correlationId: "corr_fixture",
  answer: "answer",
  sourcesUsed: ["fixture:source"],
  modelUsed: "fixture-model",
  governanceState: "ordinary",
  persistenceMode: "encrypted-sqlite",
  modelDecision: {
    selectedModel: "fixture-model",
    availableModels: ["fixture-model"],
    reason: "operator",
    overrideStatus: "operator",
  },
  effectiveScope: {
    governanceState: "ordinary",
    sourceSelection: "automatic",
    sourcesUsed: ["fixture:source"],
    sourceState: "success",
  },
  responseDisclosure: {
    governed: false,
    governanceState: "ordinary",
    persistenceMode: "encrypted-sqlite",
    sourceState: "success",
    overrideState: "operator",
    sourcesUsed: ["fixture:source"],
  },
};

describe("local composition response contracts", () => {
  it("accepts source-backed model, scope, and disclosure fields", () => {
    expect(responseResultSchema.parse(response)).toMatchObject(response);
    expect(daemonResponseSchema.parse(daemonResponse)).toMatchObject(
      daemonResponse,
    );
  });

  it("rejects unknown fields and unsupported approval states", () => {
    expect(
      responseResultSchema.safeParse({ ...response, unexpected: true }).success,
    ).toBe(false);
    expect(
      daemonResponseSchema.safeParse({
        ...daemonResponse,
        modelDecision: {
          ...daemonResponse.modelDecision,
          unexpected: true,
        },
      }).success,
    ).toBe(false);
    expect(
      approvalMetadataSchema.safeParse({
        approvalState: "approved",
        receiptState: "unknown",
      }).success,
    ).toBe(false);
  });
});
