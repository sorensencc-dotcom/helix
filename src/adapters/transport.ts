import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
  readonly abstract: string | null;
  readonly rank: number;
}

export function buildFtsQuery(rawQuery: string): string {
  const trimmed = rawQuery.trim();
  if (/["*:]/.test(trimmed) || /\b(AND|OR|NOT)\b/.test(trimmed)) return trimmed;
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "list",
    "of",
    "on",
    "please",
    "summarize",
    "the",
    "this",
    "to",
    "what",
    "with",
  ]);
  const tokens = trimmed
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((token) => token.length > 1 && !stopWords.has(token.toLowerCase()))
    .slice(0, 4);
  const terms = tokens.map((token) => `"${token.replace(/"/g, '""')}"*`);
  return terms.length > 1 ? terms.join(" AND ") : terms.join(" OR ");
}

/**
 * Reads kb-sync's local SQLite context cache (`.kb_cache/knowledge.db`)
 * directly, mirroring the FTS5 query kb-sync's own
 * `handleQueryContextCache` runs. Kept as a duplicate rather than a
 * cross-repo import: helix and kb-sync are separate git repos, and this
 * SQL is a stable, small surface against a local-only artifact.
 */
export class KbSyncContextCacheTransport implements AdapterTransport<
  Record<string, unknown>,
  unknown
> {
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
        `SELECT d.id, d.topic, d.category, d.file_path, d.abstract,
                snippet(kb_fts, 2, '[MATCH]', '[/MATCH]', '...', 128) AS snippet,
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
        context: rows.map((row) => ({
          id: row.id,
          topic: row.topic,
          category: row.category,
          source: row.file_path,
          abstract: row.abstract,
          snippet: row.snippet,
          rank: row.rank,
        })),
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

const DEFAULT_WHICHLLM_ARTIFACT_PATH =
  "C:\\dev\\trm\\_integration\\model_selection.json";

function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) =>
      `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`,
  );
  return `{${pairs.join(",")}}`;
}

const modelSelectionArtifact = z.object({
  evaluated_at: z.string().optional(),
  recommendations: z.object({
    local_muscle_anchor: z.string().min(1).nullable(),
    frontier_judgment_anchor: z.string().nullable().optional(),
    local_fit_reasoning: z.string().optional(),
  }),
  hardware_profile: z
    .object({
      gpu_count: z.number().optional(),
      gpu_name: z.string().optional(),
      vram_gb: z.number().optional(),
      ram_gb: z.number().optional(),
    })
    .optional(),
  ranked_candidates: z.array(z.record(z.unknown())).optional(),
  lineage: z
    .object({
      contract_type: z.string().optional(),
      schema_version: z.string().optional(),
      provenance_flags: z.array(z.string()).optional(),
    })
    .optional(),
  hash_chain_self: z.string().optional(),
});

export interface WhichLlmArtifactTransportOptions {
  installedModelChecker?: (modelName: string) => Promise<boolean> | boolean;
  maxAgeDays?: number;
  verifyHash?: boolean;
}

/**
 * Reads WhichLLM's manually-run BFCL sweep output
 * (`_integration/model_selection.json`, written by TRM WhichLLM evaluator) directly.
 * Verifies self-hash integrity, artifact freshness TTL, and local model installation
 * before approving local execution.
 */
export class WhichLlmArtifactTransport implements AdapterTransport<
  Record<string, unknown>,
  unknown
> {
  public constructor(
    private readonly artifactPath: string = DEFAULT_WHICHLLM_ARTIFACT_PATH,
    private readonly options: WhichLlmArtifactTransportOptions = {},
  ) {}

  public async send(
    _request: Record<string, unknown>,
    _identity: IdentityEnvelope,
  ): Promise<unknown | AdapterFailure> {
    let raw: string;
    try {
      raw = readFileSync(this.artifactPath, "utf8");
    } catch {
      return {
        status: "failure",
        code: "UNAVAILABLE",
        message: `WhichLLM artifact is not available at ${this.artifactPath}.`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        status: "failure",
        code: "MALFORMED_RESPONSE",
        message: "WhichLLM artifact is not valid JSON.",
      };
    }

    const artifact = modelSelectionArtifact.safeParse(parsed);
    if (!artifact.success) {
      return {
        status: "failure",
        code: "MALFORMED_RESPONSE",
        message: "WhichLLM artifact schema validation failed.",
      };
    }

    // 1. Verify self-integrity hash if present and hash verification enabled
    if (this.options.verifyHash !== false && artifact.data.hash_chain_self) {
      const { hash_chain_self: expectedHash, ...rest } = parsed as Record<
        string,
        unknown
      >;
      const computedHash = createHash("sha256")
        .update(canonicalJson(rest))
        .digest("hex");
      if (computedHash !== expectedHash) {
        return {
          status: "failure",
          code: "MALFORMED_RESPONSE",
          message: "WhichLLM artifact self-integrity hash mismatch.",
        };
      }
    }

    // 2. Verify artifact freshness / TTL
    if (artifact.data.evaluated_at) {
      const evaluatedDate = new Date(artifact.data.evaluated_at).getTime();
      const maxAgeMs = (this.options.maxAgeDays ?? 30) * 24 * 60 * 60 * 1000;
      if (
        Number.isFinite(evaluatedDate) &&
        Date.now() - evaluatedDate > maxAgeMs
      ) {
        return {
          status: "failure",
          code: "UNAVAILABLE",
          message: `WhichLLM artifact is stale (evaluated at ${artifact.data.evaluated_at} exceeds ${this.options.maxAgeDays ?? 30}-day TTL).`,
        };
      }
    }

    // 3. Check if local muscle anchor is available / not suppressed
    const recommendedModel = artifact.data.recommendations.local_muscle_anchor;
    if (!recommendedModel) {
      return {
        status: "failure",
        code: "UNAVAILABLE",
        message:
          "WhichLLM artifact has no available local muscle anchor (suppressed or unavailable).",
      };
    }

    // 4. Verify local model installation
    if (this.options.installedModelChecker) {
      let isInstalled = false;
      try {
        isInstalled =
          await this.options.installedModelChecker(recommendedModel);
      } catch {
        return {
          status: "failure",
          code: "UNAVAILABLE",
          message: `Unable to verify local installation for model '${recommendedModel}'.`,
        };
      }
      if (!isInstalled) {
        return {
          status: "failure",
          code: "UNAVAILABLE",
          message: `Recommended local model '${recommendedModel}' is not installed locally in Ollama.`,
        };
      }
    }

    return {
      contract: "helix-adapter.v1",
      status: "success",
      provider: "local",
      model: recommendedModel,
      cloudEnabled: false,
    };
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
