import { describe, expect, it } from "vitest";
import {
  CurlNegotiateFetch,
  WindowsDpapiSessionKeyProvider,
} from "../src/platform/windows-integrations.js";

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
