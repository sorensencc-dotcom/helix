import type { IdentityEnvelope } from "../domain/identity.js";
import type {
  ModelSelectionDecision,
  ModelSelectionRequest,
  RetrievalRequest,
  RetrievalResponse,
  ResponseRequest,
  ResponseResult,
} from "../application/composition-contract.js";
import {
  icfRequest,
  icfResponse,
  parseAdapterResponse,
  whichLlmRequest,
  whichLlmResponse,
} from "./contracts.js";
import type {
  AdapterTransport,
  HttpAdapterTransport,
  UnavailableAdapterTransport,
} from "./transport.js";

type IdentityProvider = (
  request: RetrievalRequest | ModelSelectionRequest,
) => IdentityEnvelope;

export class IcfRetrievalAdapter {
  public constructor(
    private readonly transport: AdapterTransport<
      Record<string, unknown>,
      unknown
    >,
    private readonly identity: IdentityProvider,
  ) {}

  public async retrieve(request: RetrievalRequest): Promise<RetrievalResponse> {
    const identity = this.identity(request);
    const candidate = icfRequest.safeParse({
      contract: "helix-adapter.v1",
      correlationId: identity.helixSession.correlationId,
      identity,
      query: JSON.stringify(request.payload),
      governed: request.constraints.scope === "governed",
    });
    if (!candidate.success) return this.failure(request);
    const result = await this.transport.send(candidate.data, identity);
    const parsed = parseAdapterResponse(icfResponse, result);
    if ("status" in parsed && parsed.status === "failure")
      return this.failure(request);
    return {
      contextPacket: parsed,
      sourcesUsed: parsed.sources,
      lineageRecord: parsed.lineageId,
      state: parsed.governed ? "success" : "degraded",
    };
  }

  private failure(request: RetrievalRequest): RetrievalResponse {
    return {
      contextPacket: null,
      sourcesUsed: [],
      state:
        request.constraints.scope === "governed" ? "fail-closed" : "degraded",
    };
  }
}

export class WhichLlmSelectionAdapter {
  public constructor(
    private readonly transport: AdapterTransport<
      Record<string, unknown>,
      unknown
    >,
    private readonly identity: IdentityProvider,
  ) {}

  public async select(
    request: ModelSelectionRequest,
  ): Promise<ModelSelectionDecision> {
    const identity = this.identity(request);
    const candidate = whichLlmRequest.safeParse({
      contract: "helix-adapter.v1",
      correlationId: identity.helixSession.correlationId,
      identity,
      taskClass:
        request.session.governanceState === "governed"
          ? "governed"
          : "conversation",
      cloudEnabled: false,
    });
    if (!candidate.success) throw new Error("MODEL_SELECTION_INVALID_REQUEST");
    const result = await this.transport.send(candidate.data, identity);
    const parsed = parseAdapterResponse(whichLlmResponse, result);
    if ("status" in parsed && parsed.status === "failure")
      throw new Error(parsed.code);
    if (request.requestedModel && parsed.model !== request.requestedModel) {
      throw new Error("MODEL_OVERRIDE_DENIED");
    }
    return {
      selectedModel: parsed.model,
      availableModels: [parsed.model],
      reason: "authority",
      overrideStatus: request.requestedModel ? "operator" : "auto",
    };
  }
}

export class UnavailableResponseAdapter {
  public async respond(_request: ResponseRequest): Promise<ResponseResult> {
    throw new Error("MODEL_EXECUTION_UNAVAILABLE");
  }
}
