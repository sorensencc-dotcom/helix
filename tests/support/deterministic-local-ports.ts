import { randomUUID } from "node:crypto";
import type {
  ModelSelectionDecision,
  ModelSelectionRequest,
  ResponseRequest,
  ResponseResult,
  RetrievalRequest,
  RetrievalResponse,
} from "../../src/application/composition-contract.js";
import type { CorrelationId } from "../../src/domain/contracts.js";
import type { LocalCompositionPorts } from "../../src/application/composed-session-service.js";

/**
 * Deterministic stand-ins for the retrieval, model-selection, and response
 * authorities (ICF, WhichLLM, Sigil/model execution). These remain
 * intentionally unimplemented in production per the owner-contract blocker;
 * this module exists ONLY so integration tests can exercise the real
 * auth + DPAPI-backed persistence pipeline end to end without depending on
 * those unavailable external services.
 */
export function createDeterministicLocalPorts(): Pick<
  LocalCompositionPorts,
  "retrieval" | "models" | "responses"
> {
  return {
    retrieval: {
      async retrieve(request: RetrievalRequest): Promise<RetrievalResponse> {
        return {
          contextPacket: { echo: request.payload },
          sourcesUsed: ["integration-test-fixture"],
          state: "success",
        };
      },
    },
    models: {
      async select(
        _request: ModelSelectionRequest,
      ): Promise<ModelSelectionDecision> {
        return {
          selectedModel: "integration-test-model",
          availableModels: ["integration-test-model"],
          reason: "deterministic integration test fixture",
          overrideStatus: "auto",
        };
      },
    },
    responses: {
      async respond(request: ResponseRequest): Promise<ResponseResult> {
        return {
          correlationId:
            `corr_${request.session.sessionId}_${randomUUID()}` as CorrelationId,
          answer: { fixture: true, payload: request.payload },
          sourcesUsed: request.retrieval.sourcesUsed,
          modelUsed: request.modelDecision.selectedModel,
          stateDisclosures: {
            persistenceMode: request.session.persistenceClass,
            sourceState: request.retrieval.state,
            overrideState: request.modelDecision.overrideStatus,
          },
        };
      },
    },
  };
}
