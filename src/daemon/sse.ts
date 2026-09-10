import type { ServerResponse } from "node:http";
export type SseEvent = "delta" | "metadata" | "error" | "done";
export function writeSse(
  response: ServerResponse,
  event: SseEvent,
  data: unknown,
  id?: number,
): void {
  response.write(
    `${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}
