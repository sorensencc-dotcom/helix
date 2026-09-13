import type { AddressInfo } from "node:net";
import { ComposedSessionService } from "../../src/application/composed-session-service.js";
import type {
  AuditEvent,
  ModelSelectionDecision,
  ModelSelectionRequest,
  PersistenceRequest,
  PersistenceResult,
  RequestEnvelope,
  ResponseRequest,
  ResponseResult,
  RetrievalRequest,
  RetrievalResponse,
  SessionContext,
} from "../../src/application/composition-contract.js";
import {
  createDaemon,
  type FixtureCounters,
  type FixtureFaults,
} from "../../src/daemon/server.js";
import { MemoryTaskStore } from "../../src/infrastructure/task-store.js";
import type { HelixConfig } from "../../src/infrastructure/config.js";

export interface TestDaemonHandle {
  readonly port: number;
  readonly baseUrl: string;
  readonly counters: FixtureCounters;
  readonly faults: FixtureFaults;
  close(): Promise<void>;
}

export const FIXTURE_CATALOG_MODELS = [
  "llama3:8b-instruct-fp16",
  "claude-3-5-sonnet-20241022",
  "gemini-2.0-flash",
  "gpt-4o",
  "grok-2",
];

export async function startTestDaemon(
  options: {
    initialFaults?: FixtureFaults;
  } = {},
): Promise<TestDaemonHandle> {
  const counters: FixtureCounters = {
    local: 0,
    claude: 0,
    antigravity: 0,
    codex: 0,
    grok: 0,
  };

  const faults: FixtureFaults = { ...options.initialFaults };

  const retrievalPort = {
    async retrieve(request: RetrievalRequest): Promise<RetrievalResponse> {
      return {
        contextPacket: { title: "Governed Context Mock" },
        sourcesUsed: ["context:local-fixture"],
        state: "success",
      };
    },
  };

  const modelsPort = {
    async select(
      request: ModelSelectionRequest,
    ): Promise<ModelSelectionDecision> {
      const requested = request.requestedModel;
      if (requested) {
        if (!FIXTURE_CATALOG_MODELS.includes(requested)) {
          throw new Error("MODEL_OVERRIDE_DENIED");
        }
        return {
          selectedModel: requested,
          availableModels: FIXTURE_CATALOG_MODELS,
          reason: "operator_override",
          overrideStatus: "operator",
        };
      }
      return {
        selectedModel: "llama3:8b-instruct-fp16",
        availableModels: FIXTURE_CATALOG_MODELS,
        reason: "authority",
        overrideStatus: "auto",
      };
    },
  };

  const responsesPort = {
    async respond(request: ResponseRequest): Promise<ResponseResult> {
      const model = request.modelDecision.selectedModel;

      if (model.includes("llama3") || model === "local") {
        counters.local++;
        if (faults.failLocal) {
          throw new Error("MODEL_EXECUTION_UNAVAILABLE");
        }
        return {
          correlationId:
            `corr_${request.session.sessionId.toLowerCase()}` as ResponseResult["correlationId"],
          answer: `[Local Muscle Response] Output for prompt: ${JSON.stringify(request.payload)}`,
          sourcesUsed: [...request.retrieval.sourcesUsed],
          modelUsed: model,
          stateDisclosures: {
            persistenceMode: request.session.persistenceClass,
            sourceState: request.retrieval.state,
            overrideState: request.modelDecision.overrideStatus,
          },
        };
      }

      if (model.includes("claude")) {
        counters.claude++;
        return {
          correlationId:
            `corr_${request.session.sessionId.toLowerCase()}` as ResponseResult["correlationId"],
          answer: `[Claude Frontier Response] Output for prompt: ${JSON.stringify(request.payload)}`,
          sourcesUsed: [...request.retrieval.sourcesUsed],
          modelUsed: model,
          stateDisclosures: {
            persistenceMode: request.session.persistenceClass,
            sourceState: request.retrieval.state,
            overrideState: request.modelDecision.overrideStatus,
          },
        };
      }

      if (model.includes("gemini")) {
        counters.antigravity++;
        return {
          correlationId:
            `corr_${request.session.sessionId.toLowerCase()}` as ResponseResult["correlationId"],
          answer: `[Antigravity Gemini Response] Output for prompt: ${JSON.stringify(request.payload)}`,
          sourcesUsed: [...request.retrieval.sourcesUsed],
          modelUsed: model,
          stateDisclosures: {
            persistenceMode: request.session.persistenceClass,
            sourceState: request.retrieval.state,
            overrideState: request.modelDecision.overrideStatus,
          },
        };
      }

      if (model.includes("gpt-4o")) {
        counters.codex++;
        return {
          correlationId:
            `corr_${request.session.sessionId.toLowerCase()}` as ResponseResult["correlationId"],
          answer: `[Codex GPT-4o Response] Output for prompt: ${JSON.stringify(request.payload)}`,
          sourcesUsed: [...request.retrieval.sourcesUsed],
          modelUsed: model,
          stateDisclosures: {
            persistenceMode: request.session.persistenceClass,
            sourceState: request.retrieval.state,
            overrideState: request.modelDecision.overrideStatus,
          },
        };
      }

      if (model.includes("grok")) {
        counters.grok++;
        return {
          correlationId:
            `corr_${request.session.sessionId.toLowerCase()}` as ResponseResult["correlationId"],
          answer: `[Grok-2 Response] Output for prompt: ${JSON.stringify(request.payload)}`,
          sourcesUsed: [...request.retrieval.sourcesUsed],
          modelUsed: model,
          stateDisclosures: {
            persistenceMode: request.session.persistenceClass,
            sourceState: request.retrieval.state,
            overrideState: request.modelDecision.overrideStatus,
          },
        };
      }

      throw new Error(`MODEL_EXECUTION_UNAVAILABLE`);
    },
  };

  const persistencePort = {
    async save(request: PersistenceRequest): Promise<PersistenceResult> {
      return { stored: true, location: "ram-fixture" };
    },
  };

  const auditPort = {
    async record(event: AuditEvent): Promise<void> {},
  };

  const sessionService = new ComposedSessionService({
    retrieval: retrievalPort,
    models: modelsPort,
    responses: responsesPort,
    persistence: persistencePort,
    audit: auditPort,
  });

  const taskStore = new MemoryTaskStore();
  const config: HelixConfig = {
    host: "127.0.0.1",
    port: 0,
    version: "0.1.0-e2e",
    taskDatabasePath: ":memory:",
    windowsBridgeUrl: "http://127.0.0.1:8989",
    windowsBridgeCommand: "mock",
  };

  const server = createDaemon(config, {
    taskStore,
    sessionService,
    fixtureMode: true,
    fixtureFaults: faults,
    fixtureCounters: counters,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const port = addr.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    port,
    baseUrl,
    counters,
    faults,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
