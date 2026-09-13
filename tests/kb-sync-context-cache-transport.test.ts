import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KbSyncContextCacheTransport } from "../src/adapters/transport.js";
import type { IdentityEnvelope } from "../src/domain/identity.js";

const identity: IdentityEnvelope = {
  windows: { sid: "S-1-5-21-test", upn: "operator@example.test", groups: [] },
  helixSession: {
    sessionId: "session_kb_sync_test",
    correlationId: "corr_kb-sync-test",
    createdAt: "2026-09-12T00:00:00.000Z",
    governed: true,
  },
};

const REAL_DB_PATH = "C:\\dev\\kb-sync\\.kb_cache\\knowledge.db";

describe("KbSyncContextCacheTransport", () => {
  it("returns UNAVAILABLE when the cache database does not exist", async () => {
    const transport = new KbSyncContextCacheTransport(
      "C:\\dev\\does-not-exist\\knowledge.db",
    );
    const result = await transport.send({ query: "drift" }, identity);
    expect(result).toMatchObject({ status: "failure", code: "UNAVAILABLE" });
  });

  it("returns MALFORMED_RESPONSE when the query is missing or empty", async () => {
    const transport = new KbSyncContextCacheTransport(REAL_DB_PATH);
    const result = await transport.send({ query: "" }, identity);
    expect(result).toMatchObject({
      status: "failure",
      code: "MALFORMED_RESPONSE",
    });
  });

  it.skipIf(!existsSync(REAL_DB_PATH))(
    "returns matching file paths from the live kb-sync cache",
    async () => {
      const transport = new KbSyncContextCacheTransport(REAL_DB_PATH, 3);
      const result = await transport.send({ query: "drift" }, identity);
      expect(result).toMatchObject({
        contract: "helix-adapter.v1",
        status: "success",
        governed: true,
      });
      const success = result as { sources: string[]; lineageId: string };
      expect(Array.isArray(success.sources)).toBe(true);
      expect(success.lineageId).toMatch(/^icf_/);
    },
  );
});
