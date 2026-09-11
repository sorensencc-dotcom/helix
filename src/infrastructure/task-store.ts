import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export type StoredTask = {
  id: string;
  state: "QUEUED" | "CANCELLED";
  sessionId: string;
  correlationId: string;
};

const storedTaskSchema = z
  .object({
    id: z.string().min(1).max(128),
    state: z.enum(["QUEUED", "CANCELLED"]),
    sessionId: z.string().min(1).max(128),
    correlationId: z
      .string()
      .regex(/^corr_[a-z0-9-]+$/)
      .max(128),
  })
  .strict();

export interface TaskStore {
  hasSession(id: string): boolean;
  createSession(id: string): boolean;
  closeSession(id: string): void;
  listSessionIds(): string[];
  saveTask(task: StoredTask): void;
  getTask(id: string): StoredTask | undefined;
  listTasks(): StoredTask[];
  close(): void;
}

export class SqliteTaskStore implements TaskStore {
  private readonly database: DatabaseSync;

  public constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS helix_sessions (
        session_id TEXT PRIMARY KEY
      ) STRICT;
      CREATE TABLE IF NOT EXISTS helix_tasks (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        session_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL UNIQUE
      ) STRICT;
    `);
  }

  public hasSession(id: string): boolean {
    return Boolean(
      this.database
        .prepare("SELECT 1 FROM helix_sessions WHERE session_id = ?")
        .get(id),
    );
  }

  public createSession(id: string): boolean {
    return (
      this.database
        .prepare("INSERT OR IGNORE INTO helix_sessions (session_id) VALUES (?)")
        .run(id).changes === 1
    );
  }

  public closeSession(id: string): void {
    this.database
      .prepare("DELETE FROM helix_sessions WHERE session_id = ?")
      .run(id);
  }

  public listSessionIds(): string[] {
    return (
      this.database
        .prepare("SELECT session_id FROM helix_sessions ORDER BY session_id")
        .all() as Array<{ session_id: string }>
    ).map((row) => row.session_id);
  }

  public saveTask(task: StoredTask): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO helix_tasks (id, state, session_id, correlation_id) VALUES (?, ?, ?, ?)`,
      )
      .run(task.id, task.state, task.sessionId, task.correlationId);
  }

  public getTask(id: string): StoredTask | undefined {
    const row = this.database
      .prepare(
        "SELECT id, state, session_id, correlation_id FROM helix_tasks WHERE id = ?",
      )
      .get(id) as
      | {
          id: string;
          state: StoredTask["state"];
          session_id: string;
          correlation_id: string;
        }
      | undefined;
    return (
      row &&
      storedTaskSchema.parse({
        id: row.id,
        state: row.state,
        sessionId: row.session_id,
        correlationId: row.correlation_id,
      })
    );
  }

  public listTasks(): StoredTask[] {
    return (
      this.database
        .prepare(
          "SELECT id, state, session_id, correlation_id FROM helix_tasks ORDER BY id",
        )
        .all() as Array<{
        id: string;
        state: StoredTask["state"];
        session_id: string;
        correlation_id: string;
      }>
    ).map((row) =>
      storedTaskSchema.parse({
        id: row.id,
        state: row.state,
        sessionId: row.session_id,
        correlationId: row.correlation_id,
      }),
    );
  }

  public close(): void {
    this.database.close();
  }
}

export class MemoryTaskStore implements TaskStore {
  private readonly sessions = new Set<string>();
  private readonly tasks = new Map<string, StoredTask>();
  public hasSession(id: string): boolean {
    return this.sessions.has(id);
  }
  public createSession(id: string): boolean {
    const size = this.sessions.size;
    this.sessions.add(id);
    return this.sessions.size > size;
  }
  public closeSession(id: string): void {
    this.sessions.delete(id);
  }
  public listSessionIds(): string[] {
    return [...this.sessions];
  }
  public saveTask(task: StoredTask): void {
    this.tasks.set(task.id, task);
  }
  public getTask(id: string): StoredTask | undefined {
    return this.tasks.get(id);
  }
  public listTasks(): StoredTask[] {
    return [...this.tasks.values()];
  }
  public close(): void {}
}
