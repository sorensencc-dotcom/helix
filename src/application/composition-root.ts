import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { HelixConfig } from "../infrastructure/config.js";
import {
  SqliteSessionStore,
  type SessionEncryption,
} from "../infrastructure/session-store.js";
import {
  UnavailableAdapterTransport,
  HttpAdapterTransport,
  KbSyncContextCacheTransport,
  WhichLlmArtifactTransport,
} from "../adapters/transport.js";
import {
  IcfRetrievalAdapter,
  WhichLlmSelectionAdapter,
  SigilExecutionAdapter,
  UnavailableResponseAdapter,
  OllamaResponseAdapter,
  CliResponseAdapter,
  createCliResponseRunner,
} from "../adapters/local-authority-adapters.js";
import type {
  LocalCompositionPorts,
  ComposedSessionService,
} from "./composed-session-service.js";
import { ComposedSessionService as Service } from "./composed-session-service.js";
import type { AuditEvent, PersistenceRequest } from "./composition-contract.js";
import type { IdentityEnvelope } from "../domain/identity.js";

export interface SessionServiceComposition {
  readonly service: ComposedSessionService;
  readonly sigil: SigilExecutionAdapter;
  readonly close: () => void;
}

function correlationIdFor(sessionId: string): string {
  // The approved authority contract (src/adapters/contracts.ts) restricts
  // correlationId to ^corr_[a-z0-9-]+$, but session IDs are client-supplied
  // and unrestricted. Normalize rather than reject so any session ID can
  // still reach the real ICF/WhichLLM HTTP adapters.
  const normalized = sessionId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `corr_${normalized}`;
}

function identityFor(session: PersistenceRequest["session"]): IdentityEnvelope {
  if (!session.operator.upn) throw new Error("WINDOWS_IDENTITY_INCOMPLETE");
  return {
    windows: {
      sid: session.operator.sid,
      upn: session.operator.upn,
      groups: [...session.operator.groups],
    },
    helixSession: {
      sessionId: session.sessionId,
      correlationId: correlationIdFor(session.sessionId),
      createdAt: new Date().toISOString(),
      governed: session.governanceState === "governed",
    },
  };
}

class SessionPersistence {
  private readonly ram = new Map<string, unknown>();
  public constructor(private readonly sqlite: SqliteSessionStore) {}
  public async save(request: PersistenceRequest) {
    if (request.session.governanceState === "governed") {
      this.ram.set(request.session.sessionId, request.response);
      return { stored: false, location: "ram-only" };
    }
    await this.sqlite.save({
      correlationId: request.response.correlationId,
      sessionId: request.session.sessionId,
      text:
        typeof request.response.answer === "string"
          ? request.response.answer
          : JSON.stringify(request.response.answer),
      context: {
        sources: [...request.response.sourcesUsed],
        governed: false,
        ...(request.response.lineageId
          ? { lineageId: request.response.lineageId }
          : {}),
      },
    });
    return { stored: true, location: "encrypted-sqlite" };
  }
  public close(): void {
    this.sqlite.close();
  }
}

class AppendOnlyAudit {
  public constructor(private readonly path: string) {}
  public async record(event: AuditEvent): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(event)}\n`, "utf8");
  }
}

export interface SessionServicePortOverrides {
  readonly retrieval?: LocalCompositionPorts["retrieval"];
  readonly models?: LocalCompositionPorts["models"];
  readonly responses?: LocalCompositionPorts["responses"];
}

export function createSessionService(
  config: HelixConfig,
  keyProvider: SessionEncryption,
  overrides: SessionServicePortOverrides = {},
): SessionServiceComposition {
  if (!keyProvider) throw new Error("SESSION_KEY_PROVIDER_REQUIRED");
  const sqlite = new SqliteSessionStore(config.taskDatabasePath, keyProvider);
  const persistence = new SessionPersistence(sqlite);
  const identity = (request: { session: PersistenceRequest["session"] }) =>
    identityFor(request.session);
  const icfTransport = config.icfResolveUrl
    ? new HttpAdapterTransport<Record<string, unknown>, unknown>(
        config.icfResolveUrl,
        (value) => value as never,
      )
    : new KbSyncContextCacheTransport(config.kbSyncKnowledgeDbPath);
  const whichTransport = config.whichLlmUrl
    ? new HttpAdapterTransport<Record<string, unknown>, unknown>(
        config.whichLlmUrl,
        (value) => value as never,
      )
    : new WhichLlmArtifactTransport(config.whichLlmArtifactPath);
  const sigilTransport = config.sigilExecuteUrl
    ? new HttpAdapterTransport<Record<string, unknown>, unknown>(
        config.sigilExecuteUrl,
        (value) => value as never,
      )
    : new UnavailableAdapterTransport<Record<string, unknown>, unknown>(
        "Sigil",
      );
  const models =
    overrides.models ??
    new WhichLlmSelectionAdapter(whichTransport, identity, [
      "claude-3-5-sonnet-20241022",
      "gpt-4o",
    ]);
  const localResponse =
    overrides.responses ??
    new OllamaResponseAdapter(
      config.ollamaUrl ?? "http://127.0.0.1:11434/api/chat",
    );
  const claudeResponse = new CliResponseAdapter(
    "claude",
    createCliResponseRunner(process.env.HELIX_CLAUDE_COMMAND ?? "claude.exe"),
  );
  const codexResponse = new CliResponseAdapter(
    "codex",
    createCliResponseRunner(process.env.HELIX_CODEX_COMMAND ?? "codex.cmd"),
  );
  const responses = overrides.responses ?? {
    async respond(
      request: Parameters<LocalCompositionPorts["responses"]["respond"]>[0],
    ) {
      if (request.modelDecision.selectedModel.startsWith("claude-"))
        return claudeResponse.respond(request);
      if (request.modelDecision.selectedModel === "gpt-4o")
        return codexResponse.respond(request);
      return localResponse.respond(request);
    },
  };
  const ports: LocalCompositionPorts = {
    retrieval:
      overrides.retrieval ?? new IcfRetrievalAdapter(icfTransport, identity),
    models,
    responses,
    persistence,
    audit: new AppendOnlyAudit(
      resolve(config.taskDatabasePath, "..", "helix-audit.jsonl"),
    ),
  };
  return {
    service: new Service(ports),
    sigil: new SigilExecutionAdapter(sigilTransport, identity),
    close: () => persistence.close(),
  };
}
