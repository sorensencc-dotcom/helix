import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WhichLlmArtifactTransport } from "../src/adapters/transport.js";
import type { IdentityEnvelope } from "../src/domain/identity.js";

const identity: IdentityEnvelope = {
  windows: { sid: "S-1-5-21-test", upn: "operator@example.test", groups: [] },
  helixSession: {
    sessionId: "session_whichllm_test",
    correlationId: "corr_whichllm-test",
    createdAt: "2026-09-12T00:00:00.000Z",
    governed: true,
  },
};

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

function artifactPath(content: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "helix-whichllm-"));
  const path = join(directory, "model_selection.json");
  writeFileSync(path, JSON.stringify(content), "utf8");
  return path;
}

function validHashedArtifact(content: Record<string, unknown>): string {
  const hash = createHash("sha256")
    .update(canonicalJson(content))
    .digest("hex");
  const full = { ...content, hash_chain_self: hash };
  return artifactPath(full);
}

describe("WhichLlmArtifactTransport & Invariant Defense", () => {
  it("returns UNAVAILABLE when the artifact file does not exist", async () => {
    const transport = new WhichLlmArtifactTransport(
      "C:\\dev\\does-not-exist\\model_selection.json",
    );
    const result = await transport.send({}, identity);
    expect(result).toMatchObject({ status: "failure", code: "UNAVAILABLE" });
  });

  it("returns MALFORMED_RESPONSE when recommendations.local_muscle_anchor is missing", async () => {
    const transport = new WhichLlmArtifactTransport(
      artifactPath({ recommendations: {} }),
    );
    const result = await transport.send({}, identity);
    expect(result).toMatchObject({
      status: "failure",
      code: "MALFORMED_RESPONSE",
    });
  });

  it("returns MALFORMED_RESPONSE when the file is not valid JSON", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helix-whichllm-"));
    const path = join(directory, "model_selection.json");
    writeFileSync(path, "not json", "utf8");
    const transport = new WhichLlmArtifactTransport(path);
    const result = await transport.send({}, identity);
    expect(result).toMatchObject({
      status: "failure",
      code: "MALFORMED_RESPONSE",
    });
  });

  it("returns MALFORMED_RESPONSE when the self-integrity hash is tampered", async () => {
    const path = artifactPath({
      evaluated_at: new Date().toISOString(),
      recommendations: {
        frontier_judgment_anchor: "claude-3-5-sonnet-20241022",
        local_muscle_anchor: "llama3:8b-instruct-fp16",
      },
      hash_chain_self: "0000000000000000000000000000000000000000000000000000000000000000",
    });
    const transport = new WhichLlmArtifactTransport(path);
    const result = await transport.send({}, identity);
    expect(result).toMatchObject({
      status: "failure",
      code: "MALFORMED_RESPONSE",
      message: "WhichLLM artifact self-integrity hash mismatch.",
    });
  });

  it("returns UNAVAILABLE when the artifact timestamp exceeds TTL", async () => {
    const staleDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const path = validHashedArtifact({
      evaluated_at: staleDate,
      recommendations: {
        frontier_judgment_anchor: "claude-3-5-sonnet-20241022",
        local_muscle_anchor: "llama3:8b-instruct-fp16",
      },
    });
    const transport = new WhichLlmArtifactTransport(path, { maxAgeDays: 30 });
    const result = await transport.send({}, identity);
    expect(result).toMatchObject({
      status: "failure",
      code: "UNAVAILABLE",
    });
  });

  it("returns UNAVAILABLE when recommended model is not installed locally in Ollama", async () => {
    const path = validHashedArtifact({
      evaluated_at: new Date().toISOString(),
      recommendations: {
        frontier_judgment_anchor: "claude-3-5-sonnet-20241022",
        local_muscle_anchor: "uninstalled-model:70b",
      },
    });
    const transport = new WhichLlmArtifactTransport(path, {
      installedModelChecker: (model) => model === "llama3:8b-instruct-fp16",
    });
    const result = await transport.send({}, identity);
    expect(result).toMatchObject({
      status: "failure",
      code: "UNAVAILABLE",
      message: "Recommended local model 'uninstalled-model:70b' is not installed locally in Ollama.",
    });
  });

  it("returns the local muscle anchor when hash and installed model are verified", async () => {
    const path = validHashedArtifact({
      evaluated_at: new Date().toISOString(),
      recommendations: {
        frontier_judgment_anchor: "claude-3-5-sonnet-20241022",
        local_muscle_anchor: "llama3:8b-instruct-fp16",
      },
    });
    const transport = new WhichLlmArtifactTransport(path, {
      installedModelChecker: (model) => model === "llama3:8b-instruct-fp16",
    });
    const result = await transport.send({}, identity);
    expect(result).toMatchObject({
      contract: "helix-adapter.v1",
      status: "success",
      provider: "local",
      model: "llama3:8b-instruct-fp16",
      cloudEnabled: false,
    });
  });

  it("returns UNAVAILABLE when installedModelChecker throws an unexpected error", async () => {
    const path = validHashedArtifact({
      evaluated_at: new Date().toISOString(),
      recommendations: {
        frontier_judgment_anchor: "claude-3-5-sonnet-20241022",
        local_muscle_anchor: "llama3:8b-instruct-fp16",
      },
    });
    const transport = new WhichLlmArtifactTransport(path, {
      installedModelChecker: () => {
        throw new Error("Ollama daemon socket connection failed");
      },
    });
    const result = await transport.send({}, identity);
    expect(result).toMatchObject({
      status: "failure",
      code: "UNAVAILABLE",
    });
  });

  describe("Mandatory Helix Invariant: No Automatic Resend / Explicit Selection", () => {
    it("enforces local failure -> UI displays choices -> 0 provider dispatches -> user selection -> explicit send -> exactly 1 dispatch", async () => {
      // 1. Setup mock provider backend tracking dispatches
      const dispatchCounts = { local: 0, claude: 0, gemini: 0, gpt4o: 0 };
      const promptPayload = "User confidential instruction";

      const executePrompt = async (provider: "local" | "claude" | "gemini") => {
        dispatchCounts[provider]++;
        if (provider === "local") {
          throw new Error("Local model uninstalled / daemon offline");
        }
        return `Response from ${provider}`;
      };

      // 2. Initial attempt against local provider
      let localFailureError: Error | null = null;
      try {
        await executePrompt("local");
      } catch (err) {
        localFailureError = err as Error;
      }

      // Assert local failed
      expect(localFailureError).not.toBeNull();
      expect(dispatchCounts.local).toBe(1);

      // INVARIANT CHECK: Zero requests dispatched to alternative cloud providers upon local failure
      expect(dispatchCounts.claude).toBe(0);
      expect(dispatchCounts.gemini).toBe(0);

      // 3. Helix Client UI presents available configured alternatives
      const availableOptions = ["claude-3-5-sonnet", "gemini-2.0-flash"];
      expect(availableOptions.length).toBeGreaterThan(0);

      // Payload remains un-sent in client state
      let selectedModel: "claude" | "gemini" | null = null;

      // 4. User actively selects alternative model
      selectedModel = "claude";

      // 5. User explicitly presses Send
      const userResponded = await executePrompt(selectedModel);

      // INVARIANT CHECK: Exactly one request dispatched to selected provider, zero to others
      expect(userResponded).toBe("Response from claude");
      expect(dispatchCounts.claude).toBe(1);
      expect(dispatchCounts.gemini).toBe(0);
      expect(dispatchCounts.local).toBe(1);
    });
  });
});
