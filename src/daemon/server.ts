import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { HelixConfig } from "../infrastructure/config.js";
import { healthResponse } from "./health.js";
import { writeSse } from "./sse.js";

const maxBodyBytes = 64 * 1024;
type Task = {
  readonly id: string;
  readonly state: "QUEUED" | "CANCELLED";
  readonly sessionId: string;
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
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

export function createDaemon(config: HelixConfig) {
  const sessions = new Set<string>();
  const tasks = new Map<string, Task>();
  const idempotency = new Map<string, unknown>();
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, healthResponse(config.version));
      return;
    }
    if (request.method === "GET" && request.url === "/v1/status") {
      sendJson(response, 200, {
        status: "READY",
        version: config.version,
        sessions: sessions.size,
        tasks: tasks.size,
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
        const body = await readJson(request);
        const key = request.headers["idempotency-key"];
        if (typeof key === "string" && idempotency.has(key)) {
          sendJson(response, 200, idempotency.get(key));
          return;
        }
        if (request.method === "POST" && request.url === "/v1/sessions") {
          const id =
            typeof body?.sessionId === "string"
              ? body.sessionId
              : `session_${sessions.size + 1}`;
          sessions.add(id);
          const result = { sessionId: id, status: "READY" };
          if (typeof key === "string") idempotency.set(key, result);
          sendJson(response, 201, result);
          return;
        }
        if (request.method === "POST" && request.url === "/v1/tasks") {
          if (
            typeof body?.sessionId !== "string" ||
            !sessions.has(body.sessionId)
          ) {
            sendJson(response, 404, {
              code: "SESSION_NOT_FOUND",
              retryable: false,
            });
            return;
          }
          const id = `task_${tasks.size + 1}`;
          const result: Task = {
            id,
            state: "QUEUED",
            sessionId: body.sessionId,
          };
          tasks.set(id, result);
          if (typeof key === "string") idempotency.set(key, result);
          sendJson(response, 202, result);
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
          const task = tasks.get(taskId);
          if (!task) {
            sendJson(response, 404, {
              code: "TASK_NOT_FOUND",
              retryable: false,
            });
            return;
          }
          const result = { ...task, state: "CANCELLED" as const };
          tasks.set(task.id, result);
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
