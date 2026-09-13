import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { IdentityEnvelope } from "../domain/identity.js";
import type { AdapterFailure } from "./contracts.js";

export const authorityReceipt = z
  .object({
    receiptId: z.string().min(1).max(128),
    correlationId: z
      .string()
      .regex(/^corr_[a-z0-9-]+$/)
      .max(128),
    identity: z
      .object({ sid: z.string().min(1), upn: z.string().min(1) })
      .strict(),
    channel: z.string().min(1).max(128),
    timestamp: z.string().datetime({ offset: true }),
    integrity: z.boolean(),
  })
  .strict();

export type AuthorityReceipt = z.infer<typeof authorityReceipt>;

export interface AdapterTransport<Request, Response> {
  send(
    request: Request,
    identity: IdentityEnvelope,
  ): Promise<Response | AdapterFailure>;
}

export class HttpAdapterTransport<
  Request extends object,
  Response,
> implements AdapterTransport<Request, Response> {
  public constructor(
    private readonly endpoint: string,
    private readonly parse: (value: unknown) => Response | AdapterFailure,
    private readonly timeoutMs = 10_000,
  ) {
    if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
      throw new Error("CONFIG_INVALID_ADAPTER_ENDPOINT");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
      throw new Error("CONFIG_INVALID_ADAPTER_TIMEOUT");
    }
  }

  public async send(
    request: Request,
    identity: IdentityEnvelope,
  ): Promise<Response | AdapterFailure> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, identity }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          status: "failure",
          code: "UNAVAILABLE",
          message: `Adapter returned HTTP ${response.status}.`,
        };
      }
      return this.parse(await response.json());
    } catch (error) {
      return {
        status: "failure",
        code:
          error instanceof Error && error.name === "AbortError"
            ? "TIMEOUT"
            : "UNAVAILABLE",
        message: "Adapter transport request failed.",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class UnavailableAdapterTransport<
  Request,
  Response,
> implements AdapterTransport<Request, Response> {
  public constructor(private readonly authority: string) {}

  public async send(
    _request: Request,
    _identity: IdentityEnvelope,
  ): Promise<Response | AdapterFailure> {
    return {
      status: "failure",
      code: "UNAVAILABLE",
      message: `${this.authority} transport is not configured.`,
    };
  }
}

const DEFAULT_KB_SYNC_DB_PATH = "C:\\dev\\kb-sync\\.kb_cache\\knowledge.db";

interface KbSyncContextCacheRow {
  readonly id: string;
  readonly topic: string;
  readonly category: string;
  readonly file_path: string;
  readonly snippet: string;
  readonly rank: number;
}

function buildFtsQuery(rawQuery: string): string {
  const trimmed = rawQuery.trim();
  if (/["*:]/.test(trimmed) || /\b(AND|OR|NOT)\b/.test(trimmed)) return trimmed;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(" OR ");
}

/**
 * Reads kb-sync's local SQLite context cache (`.kb_cache/knowledge.db`)
 * directly, mirroring the FTS5 query kb-sync's own
 * `handleQueryContextCache` runs. Kept as a duplicate rather than a
 * cross-repo import: helix and kb-sync are separate git repos, and this
 * SQL is a stable, small surface against a local-only artifact.
 */
export class KbSyncContextCacheTransport
  implements AdapterTransport<Record<string, unknown>, unknown>
{
  public constructor(
    private readonly dbPath: string = DEFAULT_KB_SYNC_DB_PATH,
    private readonly resultLimit = 5,
  ) {}

  public async send(
    request: Record<string, unknown>,
    _identity: IdentityEnvelope,
  ): Promise<unknown | AdapterFailure> {
    const query = request.query;
    if (typeof query !== "string" || query.trim().length === 0) {
      return {
        status: "failure",
        code: "MALFORMED_RESPONSE",
        message: "ICF context cache query must be a non-empty string.",
      };
    }

    let db: DatabaseSync;
    try {
      db = new DatabaseSync(this.dbPath, { readOnly: true });
    } catch {
      return {
        status: "failure",
        code: "UNAVAILABLE",
        message: `kb-sync context cache is not available at ${this.dbPath}.`,
      };
    }

    try {
      const stmt = db.prepare(
        `SELECT d.id, d.topic, d.category, d.file_path,
                snippet(kb_fts, 2, '[MATCH]', '[/MATCH]', '...', 32) AS snippet,
                bm25(kb_fts) AS rank
         FROM kb_fts JOIN kb_documents d ON d.id = kb_fts.id
         WHERE kb_fts MATCH ?
         ORDER BY rank LIMIT ?`,
      );
      const rows = stmt.all(
        buildFtsQuery(query),
        this.resultLimit,
      ) as unknown as KbSyncContextCacheRow[];
      return {
        contract: "helix-adapter.v1",
        status: "success",
        sources: rows.map((row) => row.file_path),
        governed: true,
        lineageId: `icf_${Date.now().toString(36)}_${rows.length}`,
      };
    } catch {
      return {
        status: "failure",
        code: "MALFORMED_RESPONSE",
        message: "kb-sync context cache query failed.",
      };
    } finally {
      db.close();
    }
  }
}

export function bindReceipt(
  receipt: unknown,
  identity: IdentityEnvelope,
): AuthorityReceipt | AdapterFailure {
  const parsed = authorityReceipt.safeParse(receipt);
  if (!parsed.success) {
    return {
      status: "failure",
      code: "MALFORMED_RESPONSE",
      message: "Authority receipt failed the approved schema.",
    };
  }
  if (
    parsed.data.correlationId !== identity.helixSession.correlationId ||
    parsed.data.identity.sid !== identity.windows.sid
  ) {
    return {
      status: "failure",
      code: "DENIED",
      message: "Authority receipt identity does not match the Helix envelope.",
    };
  }
  return parsed.data;
}
