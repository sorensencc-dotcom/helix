import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDaemon } from "../src/daemon/server.js";
import { SqliteTaskStore } from "../src/infrastructure/task-store.js";

const stores: SqliteTaskStore[] = [];
const servers: ReturnType<typeof createDaemon>[] = [];
const directories: string[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("daemon SQLite task-store wiring", () => {
  it("recovers session and task records after daemon restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helix-daemon-"));
    directories.push(directory);
    const databasePath = join(directory, "state.sqlite");
    const firstStore = new SqliteTaskStore(databasePath);
    stores.push(firstStore);
    const first = createDaemon(
      {
        host: "127.0.0.1",
        port: 0,
        version: "0.1.0",
        taskDatabasePath: databasePath,
      },
      { taskStore: firstStore },
    );
    servers.push(first);
    const firstAddress = await new Promise<{ port: number }>((resolve) =>
      first.listen(0, "127.0.0.1", () =>
        resolve(first.address() as { port: number }),
      ),
    );
    const base = `http://127.0.0.1:${firstAddress.port}`;
    const session = await fetch(`${base}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "persisted_session" }),
    });
    expect(session.status).toBe(201);
    const task = await fetch(`${base}/v1/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "persisted_session",
        instruction: "persist metadata",
      }),
    });
    const taskBody = (await task.json()) as { id: string };
    expect(task.status).toBe(202);
    first.close();
    firstStore.close();
    stores.splice(stores.indexOf(firstStore), 1);

    const secondStore = new SqliteTaskStore(databasePath);
    stores.push(secondStore);
    const second = createDaemon(
      {
        host: "127.0.0.1",
        port: 0,
        version: "0.1.0",
        taskDatabasePath: databasePath,
      },
      { taskStore: secondStore },
    );
    servers.push(second);
    const secondAddress = await new Promise<{ port: number }>((resolve) =>
      second.listen(0, "127.0.0.1", () =>
        resolve(second.address() as { port: number }),
      ),
    );
    const recovered = await fetch(
      `http://127.0.0.1:${secondAddress.port}/v1/tasks/${taskBody.id}`,
    );
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({
      id: taskBody.id,
      sessionId: "persisted_session",
      state: "QUEUED",
    });
  });
});
