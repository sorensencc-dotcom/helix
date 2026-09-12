import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { HelixConfig } from "../infrastructure/config.js";
import {
  SqliteSessionStore,
  type SessionKeyProvider,
} from "../infrastructure/session-store.js";
import {
  UnavailableAdapterTransport,
  HttpAdapterTransport,
} from "../adapters/transport.js";
import {
  IcfRetrievalAdapter,
  WhichLlmSelectionAdapter,
  UnavailableResponseAdapter,
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
  readonly close: () => void;
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
      correlationId: `corr_${session.sessionId}`,
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
    this.sqlite.save({
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

export function createSessionService(
  config: HelixConfig,
  keyProvider: SessionKeyProvider,
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
    : new UnavailableAdapterTransport<Record<string, unknown>, unknown>("ICF");
  const whichTransport = config.whichLlmUrl
    ? new HttpAdapterTransport<Record<string, unknown>, unknown>(
        config.whichLlmUrl,
        (value) => value as never,
      )
    : new UnavailableAdapterTransport<Record<string, unknown>, unknown>(
        "WhichLLM",
      );
  const ports: LocalCompositionPorts = {
    retrieval: new IcfRetrievalAdapter(icfTransport, identity),
    models: new WhichLlmSelectionAdapter(whichTransport, identity),
    responses: new UnavailableResponseAdapter(),
    persistence,
    audit: new AppendOnlyAudit(
      resolve(config.taskDatabasePath, "..", "helix-audit.jsonl"),
    ),
  };
  return { service: new Service(ports), close: () => persistence.close() };
}
