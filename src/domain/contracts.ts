export type CorrelationId = string & { readonly __brand: "CorrelationId" };
export type SessionId = string & { readonly __brand: "SessionId" };

export interface ContextPacket {
  readonly sources: readonly string[];
  readonly governed: boolean;
  readonly lineageId?: string;
}

export interface ModelDecision {
  readonly provider: string;
  readonly model: string;
  readonly cloudEnabled: boolean;
}

export interface AssistantResponse {
  readonly correlationId: CorrelationId;
  readonly sessionId: SessionId;
  readonly text: string;
  readonly context?: ContextPacket;
  readonly model?: ModelDecision;
}

export interface ActionProposal {
  readonly capability: string;
  readonly readOnly: boolean;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export type HelixErrorCode =
  "INVALID_CONFIGURATION" | "UNAVAILABLE" | "POLICY_DENIED";

export interface HelixError {
  readonly code: HelixErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}
