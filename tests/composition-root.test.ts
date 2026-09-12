import { describe, expect, it } from "vitest";
import { createSessionService } from "../src/application/composition-root.js";
import type { HelixConfig } from "../src/infrastructure/config.js";

const config: HelixConfig = {
  host: "127.0.0.1",
  port: 8787,
  version: "0.1.0",
  taskDatabasePath: ":memory:",
  windowsBridgeUrl: "http://127.0.0.1:8792",
  windowsBridgeCommand: "true",
};

describe("composition root", () => {
  it("rejects construction without a session key provider", () => {
    expect(() => createSessionService(config, undefined as never)).toThrow(
      "SESSION_KEY_PROVIDER_REQUIRED",
    );
  });

  it("constructs unavailable authorities without making network calls", () => {
    const composition = createSessionService(config, {
      getKey: async () => new Uint8Array(32),
    });
    expect(composition.service).toBeDefined();
    expect(composition.sigil).toBeDefined();
    composition.close();
  });
});
