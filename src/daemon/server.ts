import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { isLoopbackHost, type HelixConfig } from "../infrastructure/config.js";
import {
  MemoryTaskStore,
  SqliteTaskStore,
  type StoredTask,
  type TaskStore,
} from "../infrastructure/task-store.js";
import { healthResponse } from "./health.js";
import { writeSse } from "./sse.js";
import { authenticateRequest } from "./auth.js";
import type { WindowsPrincipalResolver } from "./auth.js";
import type { ComposedSessionService } from "../application/composed-session-service.js";
import type {
  RequestEnvelope,
  SessionContext,
  TaskMetadata,
  WindowsOperator,
} from "../application/composition-contract.js";
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

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
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

export function createDaemon(
  config: HelixConfig,
  options: {
    taskStore?: TaskStore;
    sessionService?: ComposedSessionService;
    resolvePrincipal?: WindowsPrincipalResolver;
  } = {},
) {
  if (!isLoopbackHost(config.host)) {
    throw new Error("CONFIG_UNSAFE_BIND");
  }
  const taskStore = options.taskStore ?? new MemoryTaskStore();
  const persistenceClass: SessionContext["persistenceClass"] =
    taskStore instanceof SqliteTaskStore ? "encrypted-sqlite" : "ram-only";
  const idempotency = new Map<string, { fingerprint: string; body: unknown }>();
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, healthResponse(config.version));
      return;
    }
    if (request.method === "GET" && request.url === "/v1/status") {
      sendJson(response, 200, {
        status: "READY",
        version: config.version,
        sessions: taskStore.listSessionIds().length,
        tasks: taskStore.listTasks().length,
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
    if (request.method === "GET" && request.url === "/v1/stream") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const lastEventId = Number(request.headers["last-event-id"] ?? 0);
      if (!Number.isFinite(lastEventId) || lastEventId < 1) {
        writeSse(response, "metadata", { version: config.version }, 1);
      }
      if (!Number.isFinite(lastEventId) || lastEventId < 2) {
        writeSse(response, "done", { status: "COMPLETED" }, 2);
      }
      response.end();
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
        if (typeof key === "string" && idempotency.has(key)) {
          const entry = idempotency.get(key);
          if (entry?.fingerprint !== fingerprint) {
            sendJson(response, 409, {
              code: "IDEMPOTENCY_CONFLICT",
              retryable: false,
            });
            return;
          }
          sendJson(response, 200, entry.body);
          return;
        }
        if (request.method === "POST" && request.url === "/v1/sessions") {
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
            idempotency.set(key, { fingerprint, body: result });
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
          const id = `task_${taskStore.listTasks().length + 1}`;
          if (!options.sessionService) {
            const result: Task = {
              id,
              state: "QUEUED",
              sessionId: body.sessionId,
              correlationId: `corr_${randomUUID()}`,
            };
            taskStore.saveTask(result);
            if (typeof key === "string")
              idempotency.set(key, { fingerprint, body: result });
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
            scope: "ordinary",
            timestamp: new Date().toISOString(),
          };
          try {
            const daemonResponse = await options.sessionService.respond(
              envelope,
              session,
            );
            const metadata: TaskMetadata = {
              taskId: id,
              sessionId,
              operator,
              proposedAction: daemonResponse.proposedActions?.[0],
              approvalState: "not-required",
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
            if (typeof key === "string")
              idempotency.set(key, { fingerprint, body: result });
            sendJson(response, 202, result);
          } catch {
            const metadata: TaskMetadata = {
              taskId: id,
              sessionId,
              operator,
              proposedAction: undefined,
              approvalState: "denied",
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
          const sessionId = closeSession[1];
          if (!sessionId || !taskStore.hasSession(sessionId)) {
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
          const taskId = taskLookup[1];
          const task = taskId ? taskStore.getTask(taskId) : undefined;
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
          const taskId = cancel[1];
          if (!taskId) {
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
        sendJson(
          response,
          error instanceof Error && error.message === "REQUEST_TOO_LARGE"
            ? 413
            : 400,
          {
            code:
              error instanceof Error && error.message === "REQUEST_TOO_LARGE"
                ? "REQUEST_TOO_LARGE"
                : "INVALID_JSON",
            retryable: false,
          },
        );
      }
    })();
    return;
  });
}
