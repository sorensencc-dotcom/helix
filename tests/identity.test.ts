import { describe, expect, it } from "vitest";
import {
  createIdentityEnvelope,
  identityEnvelope,
} from "../src/domain/identity.js";

const windows = {
  sid: "S-1-5-21-fixture",
  upn: "operator@example.test",
  groups: [],
};
const session = {
  sessionId: "session_fixture",
  correlationId: "corr_fixture-001",
  createdAt: "2026-09-10T12:00:00.000Z",
  governed: true,
};

describe("Helix identity envelope", () => {
  it("creates one envelope without fabricating authority identities", () => {
    expect(createIdentityEnvelope(windows, session)).toEqual({
      windows,
      helixSession: session,
    });
  });

  it("rejects missing Windows identity and unknown claims", () => {
    expect(() => createIdentityEnvelope({}, session)).toThrow();
    expect(() =>
      identityEnvelope.parse({ windows, helixSession: session, extra: true }),
    ).toThrow();
  });
});
