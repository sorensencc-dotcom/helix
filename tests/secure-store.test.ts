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

  it("persists encrypted ordinary responses and reloads them", () => {
    const directory = mkdtempSync(join(tmpdir(), "helix-session-"));
    const store = new SqliteSessionStore(join(directory, "sessions.sqlite"), {
      getKey: () => new Uint8Array(32).fill(9),
    });
    const response = {
      correlationId:
        "corr_fixture-ordinary" as AssistantResponse["correlationId"],
      sessionId: "session_fixture" as SessionId,
      text: "ordinary response",
      context: { sources: ["local"], governed: false },
    } satisfies AssistantResponse;
    store.save(response);
    expect(store.list(response.sessionId)).toEqual([response]);
    store.close();
  });

  it("rejects governed and context-free responses before persistence", () => {
    const directory = mkdtempSync(join(tmpdir(), "helix-session-"));
    const store = new SqliteSessionStore(join(directory, "sessions.sqlite"), {
      getKey: () => new Uint8Array(32).fill(9),
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
    expect(() => store.save(response)).toThrow(
      "governed responses cannot be persisted",
    );
    expect(store.list(response.sessionId)).toEqual([]);
    const { context: _context, ...contextFree } = response;
    expect(() =>
      store.save({
        ...contextFree,
        correlationId:
          "corr_fixture-no-context" as AssistantResponse["correlationId"],
      }),
    ).toThrow("governed responses cannot be persisted");
    store.close();
  });
});
