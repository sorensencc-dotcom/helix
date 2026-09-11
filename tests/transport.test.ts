import { describe, expect, it } from "vitest";
import { createIdentityEnvelope } from "../src/domain/identity.js";
import {
  bindReceipt,
  UnavailableAdapterTransport,
} from "../src/adapters/transport.js";

const identity = createIdentityEnvelope(
  { sid: "S-1-fixture", upn: "operator@example.test", groups: [] },
  {
    sessionId: "session_fixture",
    correlationId: "corr_fixture-001",
    createdAt: "2026-09-10T12:00:00.000Z",
    governed: true,
  },
);

describe("adapter transport boundary", () => {
  it("fails unavailable transports explicitly", async () => {
    await expect(
      new UnavailableAdapterTransport("ICF").send({}, identity),
    ).resolves.toMatchObject({ status: "failure", code: "UNAVAILABLE" });
  });

  it("binds receipts to the SSPI-derived SID and correlation", () => {
    const receipt = bindReceipt(
      {
        receiptId: "receipt-001",
        correlationId: "corr_fixture-001",
        identity: { sid: "S-1-fixture", upn: "operator@example.test" },
        channel: "fixture",
        timestamp: "2026-09-10T12:00:00.000Z",
        integrity: true,
      },
      identity,
    );
    expect(receipt).toMatchObject({ receiptId: "receipt-001" });
    expect(
      bindReceipt(
        {
          receiptId: "receipt-002",
          correlationId: "corr_fixture-001",
          identity: { sid: "S-1-other", upn: "operator@example.test" },
          channel: "fixture",
          timestamp: "2026-09-10T12:00:00.000Z",
          integrity: true,
        },
        identity,
      ),
    ).toMatchObject({ code: "DENIED" });
  });
});
