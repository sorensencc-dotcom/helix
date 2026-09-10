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
  createTask(
    sessionId: string,
    idempotencyKey?: string,
  ): Promise<{ id: string; state: string; sessionId: string }>;
}

async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = (await response.json()) as T & { code?: string };
  if (!response.ok) throw new Error(body.code ?? `HTTP_${response.status}`);
  return body;
}

export function createDaemonClient(baseUrl: string): DaemonClient {
  return {
    status: () => request(baseUrl, "/v1/status"),
    createSession: (sessionId) =>
      request(baseUrl, "/v1/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sessionId ? { sessionId } : {}),
      }),
    createTask: (sessionId, idempotencyKey) =>
      request(baseUrl, "/v1/tasks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        body: JSON.stringify({ sessionId }),
      }),
  };
}
