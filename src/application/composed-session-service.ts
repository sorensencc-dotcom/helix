import type { SessionId } from "../domain/contracts.js";
import type {
  AuditEvent,
  EffectiveScope,
  ModelSelectionDecision,
  ModelSelectionRequest,
  PersistenceRequest,
  PersistenceResult,
  RequestEnvelope,
  ResponseRequest,
  ResponseResult,
  ResponseDisclosure,
  RetrievalRequest,
  RetrievalResponse,
  SessionContext,
} from "./composition-contract.js";
import {
  daemonResponseSchema,
  responseResultSchema,
} from "./contract-schemas.js";

export interface LocalCompositionPorts {
  readonly retrieval: {
    retrieve(request: RetrievalRequest): Promise<RetrievalResponse>;
  };
  readonly models: {
    select(request: ModelSelectionRequest): Promise<ModelSelectionDecision>;
  };
  readonly responses: {
    respond(request: ResponseRequest): Promise<ResponseResult>;
  };
  readonly persistence: {
    save(request: PersistenceRequest): Promise<PersistenceResult>;
  };
  readonly audit: { record(event: AuditEvent): Promise<void> };
}

export interface DaemonResponse {
  readonly correlationId: ResponseResult["correlationId"];
  readonly answer: unknown;
  readonly sourcesUsed: readonly string[];
  readonly modelUsed: string;
  readonly confidence?: number | undefined;
  readonly lineageId?: string | undefined;
  readonly governanceState: SessionContext["governanceState"];
  readonly persistenceMode: SessionContext["persistenceClass"];
  readonly proposedActions?: readonly unknown[] | undefined;
  readonly modelDecision: ModelSelectionDecision;
  readonly effectiveScope: EffectiveScope;
  readonly responseDisclosure: ResponseDisclosure;
  readonly queuedState?: string | undefined;
}

export class ComposedSessionService {
  public constructor(private readonly ports: LocalCompositionPorts) {}

  public async respond(
    envelope: RequestEnvelope,
    session: SessionContext,
  ): Promise<DaemonResponse> {
    const retrieval = await this.ports.retrieval.retrieve({
      session,
      payload: envelope.payload,
      constraints: {
        scope: envelope.scope,
        sources: envelope.requestedSources,
      },
    });
    if (
      session.governanceState === "governed" &&
      retrieval.state === "fail-closed"
    ) {
      throw new Error("RETRIEVAL_FAIL_CLOSED");
    }
    const decision = await this.ports.models.select({
      session,
      retrieval,
      requestedModel: envelope.requestedModel,
    });
    const result = responseResultSchema.parse(
      await this.ports.responses.respond({
        session,
        retrieval,
        modelDecision: decision,
        payload: envelope.payload,
      }),
    ) as unknown as ResponseResult;
    const persistence = await this.ports.persistence.save({
      session,
      response: result,
    });
    await this.ports.audit.record({
      sessionId: session.sessionId,
      operator: session.operator,
      timestamp: envelope.timestamp,
      retrievalState: retrieval.state,
      modelDecision: decision,
      responseState: "completed",
      persistenceState: persistence,
      proposedActions: result.proposedActions,
    });
    return daemonResponseSchema.parse({
      correlationId: result.correlationId,
      answer: result.answer,
      sourcesUsed: result.sourcesUsed,
      modelUsed: result.modelUsed,
      confidence: result.confidence,
      lineageId: result.lineageId,
      governanceState: session.governanceState,
      persistenceMode: session.persistenceClass,
      proposedActions: result.proposedActions,
      modelDecision: decision,
      effectiveScope: {
        governanceState: session.governanceState,
        sourceSelection:
          envelope.requestedSources === undefined ? "automatic" : "constrained",
        ...(envelope.requestedSources === undefined
          ? {}
          : { requestedSources: [...envelope.requestedSources] }),
        sourcesUsed: [...retrieval.sourcesUsed],
        sourceState: retrieval.state,
      },
      responseDisclosure: {
        governed: session.governanceState === "governed",
        governanceState: session.governanceState,
        persistenceMode: session.persistenceClass,
        sourceState: result.stateDisclosures.sourceState,
        overrideState: result.stateDisclosures.overrideState,
        sourcesUsed: [...result.sourcesUsed],
        ...(result.lineageId ? { lineageId: result.lineageId } : {}),
      },
    }) as unknown as DaemonResponse;
  }
}
