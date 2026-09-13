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

function artifactPath(content: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "helix-whichllm-"));
  const path = join(directory, "model_selection.json");
  writeFileSync(path, JSON.stringify(content), "utf8");
  return path;
}

describe("WhichLlmArtifactTransport", () => {
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

  it("returns the local muscle anchor as the selected model", async () => {
    const transport = new WhichLlmArtifactTransport(
      artifactPath({
        recommendations: {
          frontier_judgment_anchor: "claude-3-5-sonnet-20241022",
          local_muscle_anchor: "llama3:8b-instruct-fp16",
        },
      }),
    );
    const result = await transport.send({}, identity);
    expect(result).toMatchObject({
      contract: "helix-adapter.v1",
      status: "success",
      provider: "local",
      model: "llama3:8b-instruct-fp16",
      cloudEnabled: false,
    });
  });
});
