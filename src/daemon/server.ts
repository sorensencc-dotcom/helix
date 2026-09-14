import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isLoopbackHost, type HelixConfig } from "../infrastructure/config.js";
import {
  MemoryTaskStore,
  SqliteTaskStore,
  type StoredTask,
  type TaskStore,
} from "../infrastructure/task-store.js";
import { healthResponse } from "./health.js";
import { createSseBuffer, writeSse } from "./sse.js";
import { authenticateRequest } from "./auth.js";
import type { WindowsPrincipalResolver } from "./auth.js";
import type { ComposedSessionService } from "../application/composed-session-service.js";
import type {
  RequestEnvelope,
  SessionContext,
  TaskMetadata,
  WindowsOperator,
} from "../application/composition-contract.js";
import { daemonResponseSchema } from "../application/contract-schemas.js";
import type { SessionId } from "../domain/contracts.js";

const maxBodyBytes = 64 * 1024;
const maxSessionIdLength = 128;
type Task = {
  readonly id: string;
  readonly state: "QUEUED" | "CANCELLED";
  readonly sessionId: string;
  readonly correlationId: string;
};

const anonymousOperator: WindowsOperator = {
  sid: "S-1-0-0",
  groups: [],
};

const webRoot = resolve(fileURLToPath(new URL("../../web", import.meta.url)));
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const securityHeaders = {
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

type ReadinessState = "unknown" | "unavailable" | "configured" | "ready";

type Readiness = {
  readonly state: ReadinessState;
  readonly reason: string;
};

function configuredReadiness(configured: boolean, name: string): Readiness {
  return configured
    ? {
        state: "configured",
        reason: `${name} configuration is present; live readiness is not probed by the daemon status route`,
      }
    : {
        state: "unavailable",
        reason: `${name} configuration is not present`,
      };
}

function persistenceReadiness(
  taskStore: TaskStore,
  persistenceClass: SessionContext["persistenceClass"],
): Readiness & { readonly kind: SessionContext["persistenceClass"] } {
  try {
    taskStore.listSessionIds();
    taskStore.listTasks();
    return {
      state: "ready",
      kind: persistenceClass,
      reason: `${persistenceClass} task store is operational`,
    };
  } catch {
    return {
      state: "unavailable",
      kind: persistenceClass,
      reason: `${persistenceClass} task store could not be read`,
    };
  }
}

function serveWebAsset(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  if ((request.method !== "GET" && request.method !== "HEAD") || !request.url)
    return false;
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!relativePath || relativePath.startsWith("v1/")) return false;
  const filePath = resolve(webRoot, relativePath);
  if (filePath !== webRoot && !filePath.startsWith(`${webRoot}${sep}`))
    return false;
  try {
    const body = readFileSync(filePath);
    const extension = filePath.slice(filePath.lastIndexOf("."));
    response.writeHead(200, {
      ...securityHeaders,
      "content-type": contentTypes[extension] ?? "application/octet-stream",
    });
    if (request.method === "HEAD") {
      response.end();
    } else {
      response.end(body);
    }
    return true;
  } catch {
    return false;
  }
}

async function readJson(
  request: IncomingMessage,
  timeoutMs = 30_000,
): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;

  const readPromise = (async () => {
    for await (const chunk of request) {
      size += Buffer.byteLength(chunk);
      if (size > maxBodyBytes) throw new Error("REQUEST_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    if (size === 0) return undefined;
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("INVALID_JSON_OBJECT");
    }
    return value as Record<string, unknown>;
  })();

  if (timeoutMs <= 0) return readPromise;

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), timeoutMs);
  });

  try {
    return await Promise.race([readPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function idempotencyFingerprint(
  method: string,
  url: string | undefined,
  body: Record<string, unknown> | undefined,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ method, url, body: body ?? null }))
    .digest("hex");
}

export interface FixtureFaults {
  failSession?: boolean;
  failLocal?: boolean;
}

export interface FixtureCounters {
  local: number;
  claude: number;
  antigravity: number;
  codex: number;
  grok: number;
}

export interface DaemonLogger {
  error(...args: unknown[]): void;
}

export function createDaemon(
  config: HelixConfig,
  options: {
    taskStore?: TaskStore;
    sessionService?: ComposedSessionService;
    resolvePrincipal?: WindowsPrincipalResolver;
    fixtureMode?: boolean;
    fixtureFaults?: FixtureFaults;
    fixtureCounters?: FixtureCounters;
    logger?: DaemonLogger;
  } = {},
) {
  if (!isLoopbackHost(config.host)) {
    throw new Error("CONFIG_UNSAFE_BIND");
  }
  const logger: DaemonLogger = options.logger ?? console;
  const taskStore = options.taskStore ?? new MemoryTaskStore();
  const persistenceClass: SessionContext["persistenceClass"] =
    taskStore instanceof SqliteTaskStore ? "encrypted-sqlite" : "ram-only";
  const idempotencyTtlMs = 3_600_000;
  const idempotencyMaxSize = 10_000;
  const idempotency = new Map<
    string,
    { fingerprint: string; body: unknown; timestamp: number }
  >();
  const pruneIdempotency = () => {
    const now = Date.now();
    for (const [key, entry] of idempotency.entries()) {
      if (now - entry.timestamp > idempotencyTtlMs) {
        idempotency.delete(key);
      }
    }
    if (idempotency.size > idempotencyMaxSize) {
      const keysToDelete = Array.from(idempotency.keys()).slice(
        0,
        idempotency.size - idempotencyMaxSize,
      );
      for (const k of keysToDelete) {
        idempotency.delete(k);
      }
    }
  };
  const stream = createSseBuffer();
  stream.publish("metadata", { version: config.version });
  stream.publish("done", { status: "COMPLETED" });
  const publishTask = (task: StoredTask | Task) =>
    stream.publish("metadata", { task });

  const fixtureMode = Boolean(
    options.fixtureMode || process.env.HELIX_FIXTURE_MODE === "1",
  );
  const fixtureFaults: FixtureFaults = options.fixtureFaults ?? {};
  const fixtureCounters: FixtureCounters = options.fixtureCounters ?? {
    local: 0,
    claude: 0,
    antigravity: 0,
    codex: 0,
    grok: 0,
  };

  return createServer((request: IncomingMessage, response: ServerResponse) => {
    for (const [name, value] of Object.entries(securityHeaders))
      response.setHeader(name, value);
    if (serveWebAsset(request, response)) return;

    if (fixtureMode) {
      if (request.method === "GET" && request.url === "/__fixture/counters") {
        sendJson(response, 200, { dispatches: fixtureCounters });
        return;
      }
      if (request.method === "POST" && request.url === "/__fixture/faults") {
        void (async () => {
          try {
            const body = (await readJson(request)) ?? {};
            Object.assign(fixtureFaults, body);
            sendJson(response, 200, { ok: true, faults: fixtureFaults });
          } catch {
            sendJson(response, 400, {
              code: "INVALID_JSON_OBJECT",
              retryable: false,
            });
          }
        })();
        return;
      }
      if (request.method === "POST" && request.url === "/__fixture/reset") {
        Object.keys(fixtureFaults).forEach(
          (k) => delete (fixtureFaults as Record<string, unknown>)[k],
        );
        fixtureCounters.local = 0;
        fixtureCounters.claude = 0;
        fixtureCounters.antigravity = 0;
        fixtureCounters.codex = 0;
        fixtureCounters.grok = 0;
        sendJson(response, 200, { ok: true });
        return;
      }
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, healthResponse(config.version));
      return;
    }
    if (request.method === "GET" && request.url === "/v1/status") {
      const persistence = persistenceReadiness(taskStore, persistenceClass);
      sendJson(response, 200, {
        status: "READY",
        contract: "helix.status.v1",
        version: config.version,
        sessions: taskStore.listSessionIds().length,
        tasks: taskStore.listTasks().length,
        readiness: {
          windowsBridge: configuredReadiness(
            Boolean(config.windowsBridgeUrl && config.windowsBridgeCommand),
            "Windows bridge",
          ),
          icf: configuredReadiness(
            Boolean(config.icfResolveUrl || config.kbSyncKnowledgeDbPath),
            config.icfResolveUrl ? "ICF" : "ICF local cache",
          ),
          sigil: configuredReadiness(Boolean(config.sigilExecuteUrl), "Sigil"),
          whichLlm: configuredReadiness(
            Boolean(config.whichLlmUrl || config.whichLlmArtifactPath),
            config.whichLlmUrl ? "WhichLLM" : "WhichLLM artifact",
          ),
          persistence,
          local: {
            state: "ready" as const,
            mode: "local" as const,
            reason: "daemon is bound to a loopback host",
          },
          fixture: {
            state: "unknown" as const,
            reason: "fixture mode is not declared by daemon configuration",
          },
        },
      });
      return;
    }
    if (request.method === "GET" && request.url === "/v1/catalog") {
      sendJson(response, 200, {
        version: config.version,
        capabilities: ["context.read", "source.list", "status.read"],
      });
      return;
    }
    if (request.method === "GET" && request.url === "/v1/sessions") {
      sendJson(response, 200, { sessions: taskStore.listSessionIds() });
      return;
    }
    const sessionTasks =
      request.method === "GET" &&
      request.url?.match(/^\/v1\/sessions\/([^/]+)\/tasks$/);
    if (sessionTasks) {
      let sessionId = "";
      try {
        sessionId = decodeURIComponent(sessionTasks[1] ?? "");
        if (
          !sessionId ||
          sessionId.length > maxSessionIdLength ||
          !/^[A-Za-z0-9._:-]+$/.test(sessionId)
        ) {
          throw new Error("INVALID_SESSION_ID");
        }
      } catch {
        sendJson(response, 400, {
          code: "INVALID_SESSION_ID",
          retryable: false,
        });
        return;
      }
      if (!taskStore.hasSession(sessionId)) {
        sendJson(response, 404, {
          code: "SESSION_NOT_FOUND",
          retryable: false,
        });
        return;
      }
      sendJson(response, 200, {
        sessionId,
        tasks: taskStore
          .listTasks()
          .filter((task) => task.sessionId === sessionId),
      });
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/v1/stream")) {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const lastEventId = Number(request.headers["last-event-id"] ?? 0);
      for (const item of stream.replay(
        Number.isFinite(lastEventId) ? lastEventId : 0,
      ))
        writeSse(response, item.event, item.data, item.id);
      if (request.url !== "/v1/stream?follow=1") response.end();
      else stream.subscribe(response);
      return;
    }
    void (async () => {
      try {
        if (
          request.method === "POST" &&
          (request.url === "/v1/sessions" || request.url === "/v1/tasks") &&
          !request.headers["content-type"]
            ?.toLowerCase()
            .startsWith("application/json")
        ) {
          sendJson(response, 415, {
            code: "UNSUPPORTED_MEDIA_TYPE",
            retryable: false,
          });
          return;
        }
        const body = await readJson(request);
        const key = request.headers["idempotency-key"];
        if (
          typeof key === "string" &&
          (key.length === 0 ||
            key.length > 128 ||
            !/^[A-Za-z0-9._:-]+$/.test(key))
        ) {
          sendJson(response, 400, {
            code: "INVALID_IDEMPOTENCY_KEY",
            retryable: false,
          });
          return;
        }
        const fingerprint = idempotencyFingerprint(
          request.method ?? "",
          request.url,
          body,
        );
        pruneIdempotency();
        if (typeof key === "string" && idempotency.has(key)) {
          const entry = idempotency.get(key);
          if (entry) {
            if (Date.now() - entry.timestamp > idempotencyTtlMs) {
              idempotency.delete(key);
            } else if (entry.fingerprint !== fingerprint) {
              sendJson(response, 409, {
                code: "IDEMPOTENCY_CONFLICT",
                retryable: false,
              });
              return;
            } else {
              sendJson(response, 200, entry.body);
              return;
            }
          }
        }
        if (request.method === "POST" && request.url === "/v1/sessions") {
          if (fixtureFaults.failSession) {
            sendJson(response, 503, {
              code: "SESSION_SERVICE_UNAVAILABLE",
              retryable: false,
            });
            return;
          }
          if (
            body?.sessionId !== undefined &&
            (typeof body.sessionId !== "string" ||
              body.sessionId.length === 0 ||
              body.sessionId.length > maxSessionIdLength ||
              !/^[A-Za-z0-9._:-]+$/.test(body.sessionId))
          ) {
            sendJson(response, 400, {
              code: "INVALID_SESSION_ID",
              retryable: false,
            });
            return;
          }
          const id =
            typeof body?.sessionId === "string"
              ? body.sessionId
              : `session_${taskStore.listSessionIds().length + 1}`;
          if (!taskStore.createSession(id)) {
            sendJson(response, 409, {
              code: "SESSION_ALREADY_EXISTS",
              retryable: false,
            });
            return;
          }
          const result = { sessionId: id, status: "READY" };
          if (typeof key === "string")
            idempotency.set(key, {
              fingerprint,
              body: result,
              timestamp: Date.now(),
            });
          sendJson(response, 201, result);
          return;
        }
        if (request.method === "POST" && request.url === "/v1/tasks") {
          if (
            typeof body?.sessionId !== "string" ||
            !taskStore.hasSession(body.sessionId)
          ) {
            sendJson(response, 404, {
              code: "SESSION_NOT_FOUND",
              retryable: false,
            });
            return;
          }
          if (
            typeof body.instruction !== "string" ||
            body.instruction.trim().length === 0 ||
            body.instruction.length > 32_000 ||
            body.instruction.includes("\u0000")
          ) {
            sendJson(response, 400, {
              code: "INVALID_TASK_INPUT",
              retryable: false,
            });
            return;
          }
          if (
            body.model !== undefined &&
            (typeof body.model !== "string" || body.model.length > 256)
          ) {
            sendJson(response, 400, {
              code: "INVALID_TASK_INPUT",
              retryable: false,
            });
            return;
          }
          const requestedModel =
            typeof body.model === "string" &&
            body.model.trim().length > 0 &&
            body.model !== "automatic"
              ? body.model.trim()
              : undefined;

          const id = `task_${randomUUID()}`;
          if (!options.sessionService) {
            const result: Task = {
              id,
              state: "QUEUED",
              sessionId: body.sessionId,
              correlationId: `corr_${randomUUID()}`,
            };
            taskStore.saveTask(result);
            publishTask(result);
            if (typeof key === "string")
              idempotency.set(key, {
                fingerprint,
                body: result,
                timestamp: Date.now(),
              });
            sendJson(response, 202, result);
            return;
          }

          const sessionId = body.sessionId as SessionId;
          let operator = anonymousOperator;
          if (options.resolvePrincipal) {
            try {
              const authContext = await authenticateRequest(
                request,
                options.resolvePrincipal,
                {
                  sessionId: body.sessionId,
                  correlationId: `corr_${randomUUID()}`,
                  createdAt: new Date().toISOString(),
                  governed: false,
                },
              );
              operator = authContext.identity.windows;
            } catch (error) {
              const code =
                error instanceof Error && "code" in error
                  ? String((error as { code: unknown }).code)
                  : "WINDOWS_AUTH_REQUIRED";
              sendJson(response, 401, { code, retryable: false });
              return;
            }
          }
          const session: SessionContext = {
            sessionId,
            operator,
            governanceState: "ordinary",
            persistenceClass,
            icfAvailable: false,
            clientType: "HTTP",
          };
          const envelope: RequestEnvelope = {
            id,
            operator,
            sessionId,
            payload: { instruction: body.instruction },
            requestedModel,
            scope: "ordinary",
            timestamp: new Date().toISOString(),
          };
          try {
            const daemonResponse = daemonResponseSchema.parse(
              await options.sessionService.respond(envelope, session),
            );
            const metadata: TaskMetadata = {
              taskId: id,
              sessionId,
              operator,
              proposedAction: daemonResponse.proposedActions?.[0],
              approvalState: daemonResponse.proposedActions?.length
                ? "unknown"
                : "not-required",
              receiptState:
                daemonResponse.persistenceMode === "ram-only"
                  ? "unpersisted"
                  : "persisted",
            };
            const result: StoredTask = {
              id,
              state: "COMPLETED",
              sessionId: body.sessionId,
              correlationId: `corr_${randomUUID()}`,
              response: daemonResponse,
              metadata,
            };
            taskStore.saveTask(result);
            publishTask(result);
            if (typeof key === "string")
              idempotency.set(key, {
                fingerprint,
                body: result,
                timestamp: Date.now(),
              });
            sendJson(response, 202, result);
          } catch (error) {
            const isExpectedFixtureError =
              fixtureMode &&
              error instanceof Error &&
              (error.message === "MODEL_EXECUTION_UNAVAILABLE" ||
                error.message === "MODEL_OVERRIDE_DENIED" ||
                error.message.startsWith("FIXTURE_"));
            if (!isExpectedFixtureError) {
              logger.error("Task execution failed:", error);
            }
            const metadata: TaskMetadata = {
              taskId: id,
              sessionId,
              operator,
              proposedAction: undefined,
              approvalState: "unknown",
              receiptState: "unpersisted",
            };
            const failed: StoredTask = {
              id,
              state: "FAILED",
              sessionId: body.sessionId,
              correlationId: `corr_${randomUUID()}`,
              metadata,
            };
            taskStore.saveTask(failed);
            sendJson(response, 502, {
              code: "TASK_EXECUTION_FAILED",
              retryable: false,
            });
          }
          return;
        }
        const closeSession =
          request.method === "DELETE" &&
          request.url?.match(/^\/v1\/sessions\/([^/]+)$/);
        if (closeSession) {
          let sessionId = "";
          try {
            sessionId = decodeURIComponent(closeSession[1] ?? "");
            if (
              !sessionId ||
              sessionId.length > maxSessionIdLength ||
              !/^[A-Za-z0-9._:-]+$/.test(sessionId)
            ) {
              throw new Error("INVALID_SESSION_ID");
            }
          } catch {
            sendJson(response, 400, {
              code: "INVALID_SESSION_ID",
              retryable: false,
            });
            return;
          }
          if (!taskStore.hasSession(sessionId)) {
            sendJson(response, 404, {
              code: "SESSION_NOT_FOUND",
              retryable: false,
            });
            return;
          }
          const hasQueuedTask = taskStore
            .listTasks()
            .some(
              (task) => task.sessionId === sessionId && task.state === "QUEUED",
            );
          if (hasQueuedTask) {
            sendJson(response, 409, {
              code: "SESSION_HAS_ACTIVE_TASKS",
              retryable: false,
            });
            return;
          }
          taskStore.closeSession(sessionId);
          sendJson(response, 200, { sessionId, status: "CLOSED" });
          return;
        }
        const taskLookup =
          request.method === "GET" &&
          request.url?.match(/^\/v1\/tasks\/([^/]+)$/);
        if (taskLookup) {
          let taskId = "";
          try {
            taskId = decodeURIComponent(taskLookup[1] ?? "");
            if (
              !taskId ||
              taskId.length > 128 ||
              !/^[A-Za-z0-9._:-]+$/.test(taskId)
            ) {
              throw new Error("INVALID_TASK_ID");
            }
          } catch {
            sendJson(response, 400, {
              code: "INVALID_TASK_ID",
              retryable: false,
            });
            return;
          }
          const task = taskStore.getTask(taskId);
          if (!task) {
            sendJson(response, 404, {
              code: "TASK_NOT_FOUND",
              retryable: false,
            });
            return;
          }
          sendJson(response, 200, task);
          return;
        }
        const cancel =
          request.method === "POST" &&
          request.url?.match(/^\/v1\/tasks\/([^/]+)\/cancel$/);
        if (cancel) {
          let taskId = "";
          try {
            taskId = decodeURIComponent(cancel[1] ?? "");
            if (
              !taskId ||
              taskId.length > 128 ||
              !/^[A-Za-z0-9._:-]+$/.test(taskId)
            ) {
              throw new Error("INVALID_TASK_ID");
            }
          } catch {
            sendJson(response, 400, {
              code: "INVALID_TASK_ID",
              retryable: false,
            });
            return;
          }
          const task = taskStore.getTask(taskId);
          if (!task) {
            sendJson(response, 404, {
              code: "TASK_NOT_FOUND",
              retryable: false,
            });
            return;
          }
          if (task.state === "CANCELLED") {
            sendJson(response, 409, {
              code: "TASK_ALREADY_CANCELLED",
              retryable: false,
            });
            return;
          }
          const result = { ...task, state: "CANCELLED" as const };
          taskStore.saveTask(result);
          sendJson(response, 200, result);
          return;
        }
        sendJson(response, 404, {
          code: "NOT_FOUND",
          message: "Route not found",
          retryable: false,
        });
      } catch (error) {
        const isTooLarge =
          error instanceof Error && error.message === "REQUEST_TOO_LARGE";
        const isTimeout =
          error instanceof Error && error.message === "REQUEST_TIMEOUT";
        const status = isTooLarge ? 413 : isTimeout ? 408 : 400;
        const code = isTooLarge
          ? "REQUEST_TOO_LARGE"
          : isTimeout
            ? "REQUEST_TIMEOUT"
            : "INVALID_JSON";
        sendJson(response, status, {
          code,
          retryable: isTimeout,
        });
      }
    })();
    return;
  });
}
