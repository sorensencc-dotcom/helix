import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/infrastructure/config.js";

const bridgeUrl = "http://127.0.0.1:8792";
const bridgeCommand = "true";

describe("loadConfig", () => {
  it("loads safe local defaults", () => {
    expect(
      loadConfig({
        HELIX_WINDOWS_BRIDGE_URL: bridgeUrl,
        HELIX_WINDOWS_BRIDGE_COMMAND: bridgeCommand,
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 8787,
      version: "0.1.0",
      taskDatabasePath: "helix.sqlite",
      windowsBridgeUrl: bridgeUrl,
      windowsBridgeCommand: bridgeCommand,
    });
  });

  it("rejects invalid ports", () => {
    expect(() =>
      loadConfig({
        HELIX_PORT: "0",
        HELIX_WINDOWS_BRIDGE_URL: bridgeUrl,
        HELIX_WINDOWS_BRIDGE_COMMAND: bridgeCommand,
      }),
    ).toThrow();
  });

  it("rejects non-loopback bind hosts", () => {
    expect(() =>
      loadConfig({
        HELIX_HOST: "0.0.0.0",
        HELIX_WINDOWS_BRIDGE_URL: bridgeUrl,
        HELIX_WINDOWS_BRIDGE_COMMAND: bridgeCommand,
      }),
    ).toThrow();
  });

  it.each([
    "http://example.com:11434/api/chat",
    "http://192.168.1.10:11434/api/chat",
    "http://0.0.0.0:11434/api/chat",
  ])("rejects non-loopback Ollama URL %s", (ollamaUrl) => {
    expect(() =>
      loadConfig({
        HELIX_WINDOWS_BRIDGE_URL: bridgeUrl,
        HELIX_WINDOWS_BRIDGE_COMMAND: bridgeCommand,
        HELIX_OLLAMA_URL: ollamaUrl,
      }),
    ).toThrow("HELIX_OLLAMA_URL must be loopback");
  });

  it.each([
    "http://127.0.0.1:11434/api/chat",
    "http://localhost:11434/api/chat",
    "http://[::1]:11434/api/chat",
  ])("accepts loopback Ollama URL %s", (ollamaUrl) => {
    expect(
      loadConfig({
        HELIX_WINDOWS_BRIDGE_URL: bridgeUrl,
        HELIX_WINDOWS_BRIDGE_COMMAND: bridgeCommand,
        HELIX_OLLAMA_URL: ollamaUrl,
      }).ollamaUrl,
    ).toBe(ollamaUrl);
  });

  it("loads owner-supplied adapter labels without enabling adapters", () => {
    expect(
      loadConfig({
        HELIX_WINDOWS_BRIDGE_URL: bridgeUrl,
        HELIX_WINDOWS_BRIDGE_COMMAND: bridgeCommand,
        HELIX_ICF_RESOLVE_URL: "https://icf.example.test/resolve",
        HELIX_SIGIL_EXECUTE_URL: "https://sigil.example.test/execute",
        HELIX_WHICHLLM_URL: "https://whichllm.example.test/route",
      }),
    ).toMatchObject({
      icfResolveUrl: "https://icf.example.test/resolve",
      sigilExecuteUrl: "https://sigil.example.test/execute",
      whichLlmUrl: "https://whichllm.example.test/route",
    });
  });

  it("rejects malformed adapter URLs", () => {
    expect(() =>
      loadConfig({
        HELIX_WINDOWS_BRIDGE_URL: bridgeUrl,
        HELIX_WINDOWS_BRIDGE_COMMAND: bridgeCommand,
        HELIX_ICF_RESOLVE_URL: "not-a-url",
      }),
    ).toThrow();
  });

  it("fails at boot with WINDOWS_BRIDGE_URL_REQUIRED when the bridge URL is not configured", () => {
    expect(() => loadConfig({})).toThrow("WINDOWS_BRIDGE_URL_REQUIRED");
  });

  it("fails at boot with WINDOWS_BRIDGE_COMMAND_REQUIRED when the bridge command is not configured", () => {
    expect(() => loadConfig({ HELIX_WINDOWS_BRIDGE_URL: bridgeUrl })).toThrow(
      "WINDOWS_BRIDGE_COMMAND_REQUIRED",
    );
  });
});
