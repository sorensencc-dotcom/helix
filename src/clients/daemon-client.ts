export interface DaemonClient {
  status(): Promise<{
    status: string;
    version: string;
    sessions: number;
    tasks: number;
  }>;
  createSession(
    sessionId?: string,
  ): Promise<{ sessionId: string; status: string }>;
  listSessions(): Promise<{ sessions: string[] }>;
  closeSession(
    sessionId: string,
  ): Promise<{ sessionId: string; status: string }>;
  createTask(
    sessionId: string,
    instruction: string,
    idempotencyKey?: string,
  ): Promise<{ id: string; state: string; sessionId: string }>;
  getTask(id: string): Promise<{
    id: string;
    state: string;
    sessionId: string;
    correlationId: string;
    response?: unknown;
    metadata?: unknown;
  }>;
  cancelTask(id: string): Promise<{
    id: string;
    state: string;
    sessionId: string;
    correlationId: string;
  }>;
  openStream(lastEventId?: number): Promise<{
    events: Array<{ event: string; data: unknown; id?: number }>;
  }>;
}

async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  schema?: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = (await response.json()) as T & { code?: string };
  if (!response.ok) throw new Error(body.code ?? `HTTP_${response.status}`);
  if (!schema) return body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("CONTRACT_INVALID_RESPONSE");
  return parsed.data;
}

export function createDaemonClient(baseUrl: string): DaemonClient {
  return {
    status: () => request(baseUrl, "/v1/status", undefined, statusSchema),
    listSessions: () =>
      request(baseUrl, "/v1/sessions", undefined, sessionsSchema),
    createSession: (sessionId) =>
      request(
        baseUrl,
        "/v1/sessions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(sessionId ? { sessionId } : {}),
        },
        sessionSchema,
      ),
    closeSession: (sessionId) =>
      request(
        baseUrl,
        `/v1/sessions/${sessionId}`,
        { method: "DELETE" },
        sessionSchema,
      ),
    createTask: (sessionId, instruction, idempotencyKey) =>
      request(
        baseUrl,
        "/v1/tasks",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          },
          body: JSON.stringify({ sessionId, instruction }),
        },
        taskSchema,
      ),
    getTask: (id) => request(baseUrl, `/v1/tasks/${id}`, undefined, taskSchema),
    cancelTask: (id) =>
      request(
        baseUrl,
        `/v1/tasks/${id}/cancel`,
        { method: "POST" },
        taskSchema,
      ),
    openStream: (lastEventId) => readStream(baseUrl, lastEventId),
  };
}
import { z } from "zod";

const statusSchema = z
  .object({
    status: z.string(),
    version: z.string(),
    sessions: z.number().int().nonnegative(),
    tasks: z.number().int().nonnegative(),
  })
  .strict();
const sessionSchema = z
  .object({
    sessionId: z.string().min(1),
    status: z.string(),
  })
  .strict();
const sessionsSchema = z
  .object({ sessions: z.array(z.string().min(1)) })
  .strict();
const taskSchema = z
  .object({
    id: z.string().min(1),
    state: z.enum(["QUEUED", "CANCELLED", "COMPLETED", "FAILED"]),
    sessionId: z.string().min(1),
    correlationId: z.string().min(1),
    response: z.unknown().optional(),
    metadata: z.unknown().optional(),
  })
  .strict();

async function readStream(baseUrl: string, lastEventId = 0) {
  const response = await fetch(`${baseUrl}/v1/stream`, {
    headers: lastEventId > 0 ? { "last-event-id": String(lastEventId) } : {},
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const text = await response.text();
  const events = text
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const event =
        lines.find((line) => line.startsWith("event: "))?.slice(7) ?? "message";
      const idText = lines.find((line) => line.startsWith("id: "))?.slice(4);
      const dataText =
        lines.find((line) => line.startsWith("data: "))?.slice(6) ?? "null";
      return {
        event,
        data: JSON.parse(dataText),
        ...(idText ? { id: Number(idText) } : {}),
      };
    });
  return { events };
}
