import { DatabaseSync } from "node:sqlite";
import type { AssistantResponse, SessionId } from "../domain/contracts.js";
import {
  decryptRecord,
  encryptRecord,
  type EncryptedRecord,
} from "./secure-store.js";

export interface SessionKeyProvider {
  getKey(): Uint8Array;
}

export class SqliteSessionStore {
  private readonly database: DatabaseSync;

  public constructor(
    databasePath: string,
    private readonly keyProvider: SessionKeyProvider,
  ) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS ordinary_sessions (
        session_id TEXT NOT NULL,
        correlation_id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT
    `);
  }

  public save(response: AssistantResponse): void {
    if (response.context?.governed !== false) {
      throw new Error("governed responses cannot be persisted");
    }
    const record = encryptRecord(
      JSON.stringify(response),
      this.keyProvider.getKey(),
    );
    this.database
      .prepare(
        `INSERT OR REPLACE INTO ordinary_sessions
         (session_id, correlation_id, record_json, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        response.sessionId,
        response.correlationId,
        JSON.stringify(record),
        new Date().toISOString(),
      );
  }

  public list(sessionId: SessionId): AssistantResponse[] {
    const rows = this.database
      .prepare(
        "SELECT record_json FROM ordinary_sessions WHERE session_id = ? ORDER BY created_at",
      )
      .all(sessionId) as Array<{ record_json: string }>;
    return rows.map(
      (row) =>
        JSON.parse(
          decryptRecord(
            JSON.parse(row.record_json) as EncryptedRecord,
            this.keyProvider.getKey(),
          ),
        ) as AssistantResponse,
    );
  }

  public close(): void {
    this.database.close();
  }
}
