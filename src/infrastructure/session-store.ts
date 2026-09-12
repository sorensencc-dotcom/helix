import { DatabaseSync } from "node:sqlite";
import type { AssistantResponse, SessionId } from "../domain/contracts.js";
import {
  decryptRecord,
  encryptRecord,
  type EncryptedRecord,
} from "./secure-store.js";

export interface SessionKeyProvider {
  getKey(): Promise<Uint8Array>;
}

/**
 * Native-bridge-backed encryption: the bridge (DPAPI) is the sole holder of
 * key material. Helix never sees a key, only opaque ciphertext scoped to a
 * sessionId.
 */
export interface SessionCryptoProvider {
  encrypt(sessionId: string, plaintext: string): Promise<string>;
  decrypt(sessionId: string, ciphertext: string): Promise<string>;
}

export type SessionEncryption = SessionKeyProvider | SessionCryptoProvider;

function isCryptoProvider(
  encryption: SessionEncryption,
): encryption is SessionCryptoProvider {
  return typeof (encryption as SessionCryptoProvider).encrypt === "function";
}

type StoredEnvelope =
  { version: 1; record: EncryptedRecord } | { version: 2; ciphertext: string };

export class SqliteSessionStore {
  private readonly database: DatabaseSync;

  public constructor(
    databasePath: string,
    private readonly encryption: SessionEncryption,
  ) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA busy_timeout = 5000;");
    this.database.exec("PRAGMA journal_mode = WAL;");

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        this.database.exec(`
          CREATE TABLE IF NOT EXISTS ordinary_sessions (
            session_id TEXT NOT NULL,
            correlation_id TEXT PRIMARY KEY,
            record_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          ) STRICT
        `);
        break;
      } catch (err: unknown) {
        if (
          attempt < 4 &&
          err instanceof Error &&
          (err.message.includes("busy") || err.message.includes("locked"))
        ) {
          Atomics.wait(
            new Int32Array(new SharedArrayBuffer(4)),
            0,
            0,
            50 * (attempt + 1),
          );
          continue;
        }
        throw err;
      }
    }
  }

  public async save(response: AssistantResponse): Promise<void> {
    if (response.context?.governed !== false) {
      throw new Error("governed responses cannot be persisted");
    }
    const plaintext = JSON.stringify(response);
    const envelope: StoredEnvelope = isCryptoProvider(this.encryption)
      ? {
          version: 2,
          ciphertext: await this.encryption.encrypt(
            response.sessionId,
            plaintext,
          ),
        }
      : {
          version: 1,
          record: encryptRecord(plaintext, await this.encryption.getKey()),
        };

    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.database
          .prepare(
            `INSERT OR REPLACE INTO ordinary_sessions
             (session_id, correlation_id, record_json, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .run(
            response.sessionId,
            response.correlationId,
            JSON.stringify(envelope),
            new Date().toISOString(),
          );
        return;
      } catch (err: unknown) {
        if (
          attempt < maxRetries - 1 &&
          err instanceof Error &&
          (err.message.includes("busy") || err.message.includes("locked"))
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, 20 * (attempt + 1)),
          );
          continue;
        }
        throw err;
      }
    }
  }

  public async list(sessionId: SessionId): Promise<AssistantResponse[]> {
    const rows = this.database
      .prepare(
        "SELECT record_json FROM ordinary_sessions WHERE session_id = ? ORDER BY created_at",
      )
      .all(sessionId) as Array<{ record_json: string }>;
    const results: AssistantResponse[] = [];
    for (const row of rows) {
      const envelope = JSON.parse(row.record_json) as StoredEnvelope;
      results.push(
        JSON.parse(
          await this.decodeEnvelope(sessionId, envelope),
        ) as AssistantResponse,
      );
    }
    return results;
  }

  private async decodeEnvelope(
    sessionId: string,
    envelope: StoredEnvelope,
  ): Promise<string> {
    if (envelope.version === 2) {
      if (!isCryptoProvider(this.encryption)) {
        throw new Error("NATIVE_RECORD_REQUIRES_CRYPTO_PROVIDER");
      }
      return this.encryption.decrypt(sessionId, envelope.ciphertext);
    }
    if (isCryptoProvider(this.encryption)) {
      throw new Error("LEGACY_RECORD_REQUIRES_KEY_PROVIDER");
    }
    return decryptRecord(envelope.record, await this.encryption.getKey());
  }

  public close(): void {
    this.database.close();
  }
}
