import type { AssistantResponse, SessionId } from "../domain/contracts.js";
import type {
  AuditPort,
  ModelSelectionPort,
  PersistencePort,
  RetrievalPort,
  ResponsePort,
} from "./ports.js";

export class SessionService {
  public constructor(
    private readonly retrieval: RetrievalPort,
    private readonly models: ModelSelectionPort,
    private readonly responses: ResponsePort,
    private readonly persistence: PersistencePort,
    private readonly audit: AuditPort,
  ) {}

  public async respond(
    sessionId: SessionId,
    input: string,
  ): Promise<AssistantResponse> {
    const context = await this.retrieval.retrieve(input);
    const model = await this.models.select();
    const response = await this.responses.respond(input, context, model);
    const result = { ...response, sessionId };
    await this.persistence.save(result);
    await this.audit.record("response.created", result.correlationId);
    return result;
  }
}
