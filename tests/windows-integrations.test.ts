import { describe, expect, it } from "vitest";
import {
  CurlNegotiateFetch,
  WindowsBridgeCryptoProvider,
  WindowsDpapiSessionKeyProvider,
  type ResponseLike,
} from "../src/platform/windows-integrations.js";

const bridgeUrl = "http://127.0.0.1:8792";

describe("Windows integration boundaries", () => {
  it("fails closed when no native DPAPI bridge is supplied", async () => {
    const provider = new WindowsDpapiSessionKeyProvider();
    await expect(
      provider.getOrCreateSessionKey("session_test"),
    ).rejects.toThrow("DPAPI_BRIDGE_REQUIRED");
  });

  it("fails closed when deleting without a native DPAPI bridge", async () => {
    const provider = new WindowsDpapiSessionKeyProvider();
    await expect(provider.deleteSessionKey("session_test")).rejects.toThrow(
      "DPAPI_BRIDGE_REQUIRED",
    );
  });

  it("does not attempt Negotiate shellout outside Windows", async () => {
    if (process.platform === "win32") return;
    await expect(
      new CurlNegotiateFetch().fetch("http://127.0.0.1:8792/v1/principal"),
    ).rejects.toThrow("WINDOWS_ONLY");
  });
});

function jsonResponse(ok: boolean, body: unknown): ResponseLike {
  return { ok, json: async () => body };
}

describe("WindowsBridgeCryptoProvider", () => {
  it("encrypts by posting base64 plaintext and returning the bridge ciphertext", async () => {
    const provider = new WindowsBridgeCryptoProvider(
      bridgeUrl,
      async (url, init) => {
        expect(url).toBe(`${bridgeUrl}/v1/crypto/encrypt`);
        expect(init?.method).toBe("POST");
        expect(init?.body).toMatchObject({
          contract: "helix.dpapi-crypto.v1",
          sessionId: "session_fixture",
          plaintext: Buffer.from("hello", "utf8").toString("base64"),
        });
        return jsonResponse(true, {
          contract: "helix.dpapi-crypto.v1",
          operation: "encrypt",
          ciphertext: "bridge-ciphertext",
        });
      },
    );
    await expect(provider.encrypt("session_fixture", "hello")).resolves.toBe(
      "bridge-ciphertext",
    );
  });

  it("decrypts by posting ciphertext and base64-decoding the bridge plaintext", async () => {
    const provider = new WindowsBridgeCryptoProvider(bridgeUrl, async () =>
      jsonResponse(true, {
        contract: "helix.dpapi-crypto.v1",
        operation: "decrypt",
        plaintext: Buffer.from("hello", "utf8").toString("base64"),
      }),
    );
    await expect(
      provider.decrypt("session_fixture", "bridge-ciphertext"),
    ).resolves.toBe("hello");
  });

  it("fails closed when the bridge rejects the request", async () => {
    const provider = new WindowsBridgeCryptoProvider(bridgeUrl, async () =>
      jsonResponse(false, {
        contract: "helix.dpapi-crypto.v1",
        error: "ACCESS_DENIED",
      }),
    );
    await expect(provider.encrypt("session_fixture", "hello")).rejects.toThrow(
      "DPAPI_BRIDGE_ACCESS_DENIED",
    );
  });

  it("fails closed on a response with the wrong contract", async () => {
    const provider = new WindowsBridgeCryptoProvider(bridgeUrl, async () =>
      jsonResponse(true, { contract: "helix.dpapi-crypto.v0" }),
    );
    await expect(provider.encrypt("session_fixture", "hello")).rejects.toThrow(
      "DPAPI_BRIDGE_RESPONSE_INVALID",
    );
  });

  it("fails closed when the fetch itself throws", async () => {
    const provider = new WindowsBridgeCryptoProvider(bridgeUrl, async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      provider.decrypt("session_fixture", "bridge-ciphertext"),
    ).rejects.toThrow("DPAPI_BRIDGE_UNAVAILABLE");
  });
});
