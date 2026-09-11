import { describe, expect, it } from "vitest";
import { authenticateRequest } from "../src/daemon/auth.js";

const request = {} as never;
const session = {
  sessionId: "session_fixture",
  correlationId: "corr_fixture-001",
  createdAt: "2026-09-10T12:00:00.000Z",
  governed: true,
};

describe("daemon authentication boundary", () => {
  it("maps a resolved Windows principal into Helix identity", async () => {
    const result = await authenticateRequest(
      request,
      {
        resolve: async () => ({
          sid: "S-1-fixture",
          upn: "user@example.test",
          groups: [],
        }),
      },
      session,
    );
    expect(result.identity.windows.sid).toBe("S-1-fixture");
    expect(result.identity.helixSession).toEqual(session);
  });

  it("fails closed when the resolver returns no principal", async () => {
    await expect(
      authenticateRequest(request, { resolve: async () => undefined }, session),
    ).rejects.toThrow();
  });
});
