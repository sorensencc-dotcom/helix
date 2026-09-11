import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export type StoredTaskState = "QUEUED" | "CANCELLED" | "COMPLETED" | "FAILED";

export type StoredTask = {
  id: string;
  state: StoredTaskState;
  sessionId: string;
  correlationId: string;
  response?: unknown;
  metadata?: unknown;
};

const storedTaskSchema = z
  .object({
    id: z.string().min(1).max(128),
    state: z.enum(["QUEUED", "CANCELLED", "COMPLETED", "FAILED"]),
    sessionId: z.string().min(1).max(128),
    correlationId: z
      .string()
      .regex(/^corr_[a-z0-9-]+$/)
      .max(128),
    response: z.unknown().optional(),
    metadata: z.unknown().optional(),
  })
  .strict();

type StoredTaskRow = {
  id: string;
  state: StoredTaskState;
  session_id: string;
  correlation_id: string;
  response_json: string | null;
  metadata_json: string | null;
};

function parseStoredTaskRow(row: StoredTaskRow): StoredTask {
  return storedTaskSchema.parse({
    id: row.id,
    state: row.state,
    sessionId: row.session_id,
    correlationId: row.correlation_id,
    response:
      row.response_json === null ? undefined : JSON.parse(row.response_json),
    metadata:
      row.metadata_json === null ? undefined : JSON.parse(row.metadata_json),
  });
}

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
        correlation_id TEXT NOT NULL UNIQUE,
        response_json TEXT,
        metadata_json TEXT
      ) STRICT;
    `);
    const columns = this.database
      .prepare("PRAGMA table_info(helix_tasks)")
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));
    if (!columnNames.has("response_json")) {
      this.database.exec(
        "ALTER TABLE helix_tasks ADD COLUMN response_json TEXT",
      );
    }
    if (!columnNames.has("metadata_json")) {
      this.database.exec(
        "ALTER TABLE helix_tasks ADD COLUMN metadata_json TEXT",
      );
    }
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
        `INSERT OR REPLACE INTO helix_tasks (id, state, session_id, correlation_id, response_json, metadata_json) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        task.id,
        task.state,
        task.sessionId,
        task.correlationId,
        task.response === undefined ? null : JSON.stringify(task.response),
        task.metadata === undefined ? null : JSON.stringify(task.metadata),
      );
  }

  public getTask(id: string): StoredTask | undefined {
    const row = this.database
      .prepare(
        "SELECT id, state, session_id, correlation_id, response_json, metadata_json FROM helix_tasks WHERE id = ?",
      )
      .get(id) as StoredTaskRow | undefined;
    return row && parseStoredTaskRow(row);
  }

  public listTasks(): StoredTask[] {
    return (
      this.database
        .prepare(
          "SELECT id, state, session_id, correlation_id, response_json, metadata_json FROM helix_tasks ORDER BY id",
        )
        .all() as StoredTaskRow[]
    ).map((row) => parseStoredTaskRow(row));
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
