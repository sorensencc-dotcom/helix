import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/infrastructure/config.js";

describe("loadConfig", () => {
  it("loads safe local defaults", () => {
    expect(loadConfig({})).toEqual({
      host: "127.0.0.1",
      port: 8787,
      version: "0.1.0",
      taskDatabasePath: "helix.sqlite",
    });
  });

  it("rejects invalid ports", () => {
    expect(() => loadConfig({ HELIX_PORT: "0" })).toThrow();
  });

  it("rejects non-loopback bind hosts", () => {
    expect(() => loadConfig({ HELIX_HOST: "0.0.0.0" })).toThrow();
  });
});
