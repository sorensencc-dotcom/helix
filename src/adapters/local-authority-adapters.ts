import type { IdentityEnvelope } from "../domain/identity.js";
import type {
  ModelSelectionDecision,
  ModelSelectionRequest,
  RetrievalRequest,
  RetrievalResponse,
  ResponseRequest,
  ResponseResult,
  SessionContext,
} from "../application/composition-contract.js";
import {
  icfRequest,
  icfResponse,
  parseAdapterResponse,
  sigilRequest,
  sigilResponse,
  whichLlmRequest,
  whichLlmResponse,
  type AdapterFailure,
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
    const available =
      Array.isArray(parsed.availableModels) && parsed.availableModels.length > 0
        ? parsed.availableModels
        : [parsed.model];
    if (
      request.requestedModel &&
      !available.includes(request.requestedModel) &&
      parsed.model !== request.requestedModel
    ) {
      throw new Error("MODEL_OVERRIDE_DENIED");
    }
    const selectedModel = request.requestedModel ?? parsed.model;
    return {
      selectedModel,
      availableModels: available,
      reason: request.requestedModel ? "operator_override" : "authority",
      overrideStatus: request.requestedModel ? "operator" : "auto",
    };
  }
}

export interface SigilProposal {
  readonly proposalId: string;
  readonly state: "APPROVAL_REQUIRED" | "DENIED";
}

export class SigilExecutionAdapter {
  public constructor(
    private readonly transport: AdapterTransport<
      Record<string, unknown>,
      unknown
    >,
    private readonly identity: (request: {
      session: SessionContext;
    }) => IdentityEnvelope,
  ) {}

  public async propose(
    capability: string,
    args: Readonly<Record<string, unknown>>,
    session: SessionContext,
  ): Promise<SigilProposal | AdapterFailure> {
    const identity = this.identity({ session });
    const candidate = sigilRequest.safeParse({
      contract: "helix-adapter.v1",
      correlationId: identity.helixSession.correlationId,
      identity,
      capability,
      arguments: args,
    });
    if (!candidate.success) {
      return {
        status: "failure",
        code: "MALFORMED_RESPONSE",
        message: "Sigil capability request failed the approved schema.",
      };
    }
    const result = await this.transport.send(candidate.data, identity);
    const parsed = parseAdapterResponse(sigilResponse, result);
    if ("status" in parsed && parsed.status === "failure") return parsed;
    return { proposalId: parsed.proposalId, state: parsed.state };
  }
}

export class UnavailableResponseAdapter {
  public async respond(_request: ResponseRequest): Promise<ResponseResult> {
    throw new Error("MODEL_EXECUTION_UNAVAILABLE");
  }
}

export interface OllamaFetch {
  (input: string, init?: RequestInit): Promise<Response>;
}

export class OllamaResponseAdapter {
  public constructor(
    private readonly endpoint = "http://127.0.0.1:11434/api/chat",
    private readonly fetcher: OllamaFetch = (input, init) => fetch(input, init),
  ) {}

  public async respond(request: ResponseRequest): Promise<ResponseResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: request.modelDecision.selectedModel,
          messages: [
            {
              role: "system",
              content:
                "Answer plainly. Use supplied context when relevant. Do not claim actions or authority you do not have.",
            },
            {
              role: "user",
              content: JSON.stringify({
                request: request.payload,
                context: request.retrieval.contextPacket,
              }),
            },
          ],
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("MODEL_EXECUTION_UNAVAILABLE");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error("MODEL_EXECUTION_INVALID_RESPONSE");
      const message = (body as { message?: unknown }).message;
      if (!message || typeof message !== "object" || Array.isArray(message))
        throw new Error("MODEL_EXECUTION_INVALID_RESPONSE");
      const content = (message as { content?: unknown }).content;
      if (typeof content !== "string" || content.length === 0)
        throw new Error("MODEL_EXECUTION_INVALID_RESPONSE");
      return {
        correlationId:
          `corr_${request.session.sessionId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}` as ResponseResult["correlationId"],
        answer: content,
        sourcesUsed: [...request.retrieval.sourcesUsed],
        modelUsed: request.modelDecision.selectedModel,
        stateDisclosures: {
          persistenceMode: request.session.persistenceClass,
          sourceState: request.retrieval.state,
          overrideState: request.modelDecision.overrideStatus,
        },
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("MODEL_EXECUTION_")
      )
        throw error;
      throw new Error("MODEL_EXECUTION_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }
}
