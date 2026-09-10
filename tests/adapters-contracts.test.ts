import { describe, expect, it } from "vitest";
import {
  adapterVersion,
  icfRequest,
  icfResponse,
  parseAdapterResponse,
  sigilRequest,
  sigilResponse,
  whichLlmRequest,
  whichLlmResponse,
} from "../src/adapters/contracts.js";
import {
  authenticateBearer,
  negotiateAdapter,
} from "../src/adapters/boundary.js";

const identity = {
  windowsIdentity: "windows:test-user",
  icfIdentity: "icf:helix",
  sigilIdentity: "sigil:helix",
};

const cases = [
  { name: "success", code: undefined },
  { name: "timeout", code: "TIMEOUT" },
  { name: "unavailable", code: "UNAVAILABLE" },
  { name: "malformed", code: "MALFORMED_RESPONSE" },
  { name: "denied", code: "DENIED" },
  { name: "version mismatch", code: "VERSION_MISMATCH" },
] as const;

describe("Phase 8 adapter contract schemas", () => {
  it("accepts versioned requests with separate identities", () => {
    expect(
      icfRequest.parse({
        contract: adapterVersion,
        correlationId: "corr_fixture-001",
        identity,
        query: "release readiness",
        governed: true,
      }),
    ).toMatchObject({ contract: adapterVersion, identity });
    expect(
      whichLlmRequest.parse({
        contract: adapterVersion,
        correlationId: "corr_fixture-002",
        identity,
        taskClass: "conversation",
        cloudEnabled: false,
      }),
    ).toMatchObject({ cloudEnabled: false });
    expect(
      sigilRequest.parse({
        contract: adapterVersion,
        correlationId: "corr_fixture-003",
        identity,
        capability: "sigil.core.read_shared_context",
        arguments: { scope: "session/test" },
      }),
    ).toMatchObject({ capability: "sigil.core.read_shared_context" });
  });

  it.each(cases)("handles deterministic $name fixture", ({ code }) => {
    const response = code
      ? { status: "failure", code, message: `fixture: ${code}` }
      : {
          contract: adapterVersion,
          status: "success",
          sources: ["fixture:source-001"],
          governed: true,
          lineageId: "lineage-001",
        };
    const parsed = parseAdapterResponse(
      icfResponse,
      code === "MALFORMED_RESPONSE" ? { not: "a response" } : response,
    );
    expect(parsed.status).toBe(code ? "failure" : "success");
    if (code) expect(parsed).toMatchObject({ code });
  });

  it("uses the same failure matrix for WhichLLM and Sigil", () => {
    for (const code of cases.slice(1).map((item) => item.code)) {
      const response = { status: "failure", code, message: `fixture: ${code}` };
      expect(parseAdapterResponse(whichLlmResponse, response)).toMatchObject({
        code,
      });
      expect(parseAdapterResponse(sigilResponse, response)).toMatchObject({
        code,
      });
    }
  });

  it("fails closed on unknown fields, wrong versions, and malformed responses", () => {
    expect(
      whichLlmRequest.safeParse({
        contract: adapterVersion,
        correlationId: "corr_fixture-004",
        identity,
        taskClass: "conversation",
        cloudEnabled: false,
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      parseAdapterResponse(icfResponse, { status: "success", sources: [] }),
    ).toMatchObject({
      status: "failure",
      code: "MALFORMED_RESPONSE",
    });
  });

  it("negotiates only the expected version, adapter, and auth scheme", () => {
    expect(
      negotiateAdapter(
        { kind: "icf", contract: adapterVersion, authentication: "bearer" },
        "icf",
      ),
    ).toMatchObject({ ok: true });
    expect(
      negotiateAdapter(
        { kind: "icf", contract: "helix-adapter.v0", authentication: "bearer" },
        "icf",
      ),
    ).toMatchObject({ ok: false, error: { code: "VERSION_MISMATCH" } });
    expect(
      negotiateAdapter(
        { kind: "sigil", contract: adapterVersion, authentication: "bearer" },
        "icf",
      ),
    ).toMatchObject({ ok: false, error: { code: "CONTRACT_UNAVAILABLE" } });
  });

  it("authenticates bearer tokens without revealing comparison details", () => {
    expect(authenticateBearer("fixture-secret", "fixture-secret")).toBe(true);
    expect(authenticateBearer("fixture-secret", "wrong-secret")).toBe(false);
    expect(authenticateBearer("fixture-secret", "")).toBe(false);
  });
});
