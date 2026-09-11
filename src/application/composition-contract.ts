import type { CorrelationId, SessionId } from "../domain/contracts.js";

export type GovernanceScope = "ordinary" | "governed";
export type ClientType = "CLI" | "Browser" | "HTTP";
export type RetrievalState = "success" | "degraded" | "fail-closed";
export type OverrideStatus = "auto" | "operator";

export interface RequestEnvelope {
  readonly id: string;
  readonly operator: WindowsOperator;
  readonly sessionId?: SessionId;
  readonly payload: unknown;
  readonly scope: GovernanceScope;
  readonly requestedModel?: string | undefined;
  readonly requestedSources?: readonly string[] | undefined;
  readonly timestamp: string;
}

export interface WindowsOperator {
  readonly sid: string;
  readonly upn?: string;
  readonly groups: readonly string[];
}

export interface SessionContext {
  readonly sessionId: SessionId;
  readonly operator: WindowsOperator;
  readonly governanceState: GovernanceScope;
  readonly persistenceClass: "encrypted-sqlite" | "ram-only";
  readonly icfAvailable: boolean;
  readonly lineageState?: unknown | undefined;
  readonly clientType: ClientType;
}

export interface RetrievalRequest {
  readonly session: SessionContext;
  readonly payload: unknown;
  readonly constraints: {
    readonly sources?: readonly string[] | undefined;
    readonly scope: GovernanceScope;
  };
}

export interface RetrievalResponse {
  readonly contextPacket: unknown;
  readonly sourcesUsed: readonly string[];
  readonly lineageRecord?: unknown | undefined;
  readonly state: RetrievalState;
}

export interface ModelSelectionRequest {
  readonly session: SessionContext;
  readonly retrieval: RetrievalResponse;
  readonly requestedModel?: string | undefined;
}

export interface ModelSelectionDecision {
  readonly selectedModel: string;
  readonly availableModels: readonly string[];
  readonly reason: string;
  readonly overrideStatus: OverrideStatus;
}

export interface ResponseRequest {
  readonly session: SessionContext;
  readonly retrieval: RetrievalResponse;
  readonly modelDecision: ModelSelectionDecision;
  readonly payload: unknown;
}

export interface ResponseResult {
  readonly correlationId: CorrelationId;
  readonly answer: unknown;
  readonly proposedActions?: readonly unknown[] | undefined;
  readonly sourcesUsed: readonly string[];
  readonly modelUsed: string;
  readonly confidence?: number | undefined;
  readonly lineageId?: string | undefined;
  readonly stateDisclosures: {
    readonly persistenceMode: string;
    readonly sourceState: RetrievalState;
    readonly overrideState: OverrideStatus;
  };
}

export interface TaskMetadata {
  readonly taskId: string;
  readonly sessionId: SessionId;
  readonly operator: WindowsOperator;
  readonly proposedAction: unknown;
  readonly approvalState: string;
  readonly receiptState: string;
  readonly sigilReference?: unknown | undefined;
}

export interface PersistenceRequest {
  readonly session: SessionContext;
  readonly response: ResponseResult;
  readonly taskMetadata?: readonly TaskMetadata[] | undefined;
}
export interface PersistenceResult {
  readonly stored: boolean;
  readonly location?: string;
  readonly checksum?: string;
}
export interface AuditEvent {
  readonly sessionId: SessionId;
  readonly operator: WindowsOperator;
  readonly timestamp: string;
  readonly retrievalState: RetrievalState;
  readonly modelDecision: ModelSelectionDecision;
  readonly responseState: string;
  readonly persistenceState: PersistenceResult;
  readonly proposedActions?: readonly unknown[] | undefined;
}
