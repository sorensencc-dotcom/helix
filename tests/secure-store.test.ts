import { describe, expect, it } from "vitest";
import {
  checksum,
  decryptRecord,
  encryptRecord,
} from "../src/infrastructure/secure-store.js";
import { SqliteSessionStore } from "../src/infrastructure/session-store.js";
import type { AssistantResponse, SessionId } from "../src/domain/contracts.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
describe("secure records", () => {
  it("round-trips authenticated ciphertext", () => {
    const key = new Uint8Array(32).fill(7);
    const record = encryptRecord("ordinary chat", key);
    expect(record.ciphertext).not.toContain("ordinary");
    expect(decryptRecord(record, key)).toBe("ordinary chat");
  });
  it("produces stable export checksums", () => {
    expect(checksum("export")).toBe(checksum("export"));
    expect(checksum("export")).not.toBe(checksum("changed"));
  });

  it("persists encrypted ordinary responses and reloads them", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helix-session-"));
    const store = new SqliteSessionStore(join(directory, "sessions.sqlite"), {
      getKey: async () => new Uint8Array(32).fill(9),
    });
    const response = {
      correlationId:
        "corr_fixture-ordinary" as AssistantResponse["correlationId"],
      sessionId: "session_fixture" as SessionId,
      text: "ordinary response",
      context: { sources: ["local"], governed: false },
    } satisfies AssistantResponse;
    await store.save(response);
    await expect(store.list(response.sessionId)).resolves.toEqual([response]);
    store.close();
  });

  it("rejects governed and context-free responses before persistence", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helix-session-"));
    const store = new SqliteSessionStore(join(directory, "sessions.sqlite"), {
      getKey: async () => new Uint8Array(32).fill(9),
    });
    const response = {
      correlationId:
        "corr_fixture-governed" as AssistantResponse["correlationId"],
      sessionId: "session_fixture" as SessionId,
      text: "governed response",
      context: {
        sources: ["icf"],
        governed: true,
        lineageId: "lineage_fixture",
      },
    } satisfies AssistantResponse;
    await expect(store.save(response)).rejects.toThrow(
      "governed responses cannot be persisted",
    );
    await expect(store.list(response.sessionId)).resolves.toEqual([]);
    const { context: _context, ...contextFree } = response;
    await expect(
      store.save({
        ...contextFree,
        correlationId:
          "corr_fixture-no-context" as AssistantResponse["correlationId"],
      }),
    ).rejects.toThrow("governed responses cannot be persisted");
    store.close();
  });
});
