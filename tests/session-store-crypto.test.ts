import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SqliteSessionStore,
  type SessionCryptoProvider,
} from "../src/infrastructure/session-store.js";
import type { AssistantResponse, SessionId } from "../src/domain/contracts.js";

function fixtureResponse(correlationId: string): AssistantResponse {
  return {
    correlationId: correlationId as AssistantResponse["correlationId"],
    sessionId: "session_crypto_fixture" as SessionId,
    text: "native-bridge-backed response",
    context: { sources: ["local"], governed: false },
  };
}

function fakeCryptoProvider(): SessionCryptoProvider {
  const store = new Map<string, string>();
  let counter = 0;
  return {
    async encrypt(sessionId, plaintext) {
      const token = `fixture-ciphertext-${counter++}`;
      store.set(`${sessionId}:${token}`, plaintext);
      return token;
    },
    async decrypt(sessionId, ciphertext) {
      const plaintext = store.get(`${sessionId}:${ciphertext}`);
      if (plaintext === undefined) throw new Error("UNKNOWN_CIPHERTEXT");
      return plaintext;
    },
  };
}

describe("SqliteSessionStore native-crypto-provider path", () => {
  it("stores and reloads via the injected SessionCryptoProvider, not local AES-GCM", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helix-session-crypto-"));
    const store = new SqliteSessionStore(
      join(directory, "sessions.sqlite"),
      fakeCryptoProvider(),
    );
    const response = fixtureResponse("corr_native-fixture");
    await store.save(response);
    await expect(store.list(response.sessionId)).resolves.toEqual([response]);
    store.close();
  });

  it("fails closed reading a native-crypto record with only a legacy key provider", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helix-session-crypto-"));
    const path = join(directory, "sessions.sqlite");
    const nativeStore = new SqliteSessionStore(path, fakeCryptoProvider());
    const response = fixtureResponse("corr_native-only");
    await nativeStore.save(response);
    nativeStore.close();

    const legacyStore = new SqliteSessionStore(path, {
      getKey: async () => new Uint8Array(32).fill(3),
    });
    await expect(legacyStore.list(response.sessionId)).rejects.toThrow(
      "NATIVE_RECORD_REQUIRES_CRYPTO_PROVIDER",
    );
    legacyStore.close();
  });

  it("fails closed reading a legacy AES-GCM record with only a native crypto provider", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helix-session-crypto-"));
    const path = join(directory, "sessions.sqlite");
    const legacyStore = new SqliteSessionStore(path, {
      getKey: async () => new Uint8Array(32).fill(3),
    });
    const response = fixtureResponse("corr_legacy-only");
    await legacyStore.save(response);
    legacyStore.close();

    const nativeStore = new SqliteSessionStore(path, fakeCryptoProvider());
    await expect(nativeStore.list(response.sessionId)).rejects.toThrow(
      "LEGACY_RECORD_REQUIRES_KEY_PROVIDER",
    );
    nativeStore.close();
  });

  it("fails closed rather than silently skip a mismatched-format record in a mixed session history", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helix-session-crypto-"));
    const path = join(directory, "sessions.sqlite");
    const legacyKey = { getKey: async () => new Uint8Array(32).fill(5) };

    const legacyStore = new SqliteSessionStore(path, legacyKey);
    const legacyResponse = fixtureResponse("corr_migration-legacy");
    await legacyStore.save(legacyResponse);
    legacyStore.close();

    const nativeStore = new SqliteSessionStore(path, fakeCryptoProvider());
    const nativeResponse = fixtureResponse("corr_migration-native");
    await nativeStore.save(nativeResponse);
    await expect(nativeStore.list(nativeResponse.sessionId)).rejects.toThrow(
      "LEGACY_RECORD_REQUIRES_KEY_PROVIDER",
    );
    nativeStore.close();
  });
});
