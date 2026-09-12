import type { ServerResponse } from "node:http";
import type { IncomingMessage } from "node:http";
export type SseEvent = "delta" | "metadata" | "error" | "done";
export type BufferedSseEvent = { event: SseEvent; data: unknown; id: number };

export function createSseBuffer(limit = 256) {
  let nextId = 1;
  const events: BufferedSseEvent[] = [];
  const subscribers = new Set<ServerResponse>();
  const publish = (event: SseEvent, data: unknown) => {
    const item = { event, data, id: nextId++ };
    events.push(item);
    if (events.length > limit) events.shift();
    for (const response of subscribers) writeSse(response, item.event, item.data, item.id);
    return item;
  };
  const replay = (lastEventId: number) => events.filter((item) => item.id > lastEventId);
  const subscribe = (response: ServerResponse) => { subscribers.add(response); response.on("close", () => subscribers.delete(response)); };
  return { publish, replay, subscribe };
}

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
