import type {
  AssistantResponse,
  ContextPacket,
  ModelDecision,
} from "../domain/contracts.js";

export interface RetrievalPort {
  retrieve(query: string): Promise<ContextPacket>;
}

export interface ModelSelectionPort {
  select(): Promise<ModelDecision>;
}

export interface ResponsePort {
  respond(
    input: string,
    context: ContextPacket,
    model: ModelDecision,
  ): Promise<AssistantResponse>;
}

export interface PersistencePort {
  save(response: AssistantResponse): Promise<void>;
}

export interface AuditPort {
  record(event: string, correlationId: string): Promise<void>;
}
