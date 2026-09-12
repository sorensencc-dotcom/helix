import { describe, expect, it } from "vitest";
import { createSseBuffer } from "../src/daemon/sse.js";

describe("SSE event buffer", () => {
  it("assigns monotonic ids and replays only newer events", () => {
    const buffer = createSseBuffer();
    buffer.publish("metadata", { version: "test" });
    buffer.publish("done", { status: "COMPLETED" });
    buffer.publish("metadata", { task: { id: "task_1", state: "QUEUED" } });
    expect(buffer.replay(2)).toEqual([
      {
        event: "metadata",
        data: { task: { id: "task_1", state: "QUEUED" } },
        id: 3,
      },
    ]);
  });
});
