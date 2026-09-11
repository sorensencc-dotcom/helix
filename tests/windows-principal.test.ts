import { describe, expect, it } from "vitest";
import { IisHttpSysPrincipalResolver } from "../src/adapters/windows-principal.js";

const request = {} as never;

describe("IIS/HTTP.sys Windows principal adapter", () => {
  it("maps only the host-provided principal", async () => {
    const resolver = new IisHttpSysPrincipalResolver(async () => ({
      sid: "S-1-5-21-fixture",
      upn: "operator@example.test",
      groups: ["S-1-5-32-544"],
    }));

    await expect(resolver.resolve(request)).resolves.toEqual({
      sid: "S-1-5-21-fixture",
      upn: "operator@example.test",
      groups: ["S-1-5-32-544"],
    });
  });

  it("fails closed when no host bridge is configured", async () => {
    await expect(
      new IisHttpSysPrincipalResolver().resolve(request),
    ).rejects.toThrow("WINDOWS_AUTH_REQUIRED");
  });

  it("rejects malformed host identity", async () => {
    const resolver = new IisHttpSysPrincipalResolver(() => ({
      sid: "",
      upn: "operator@example.test",
      groups: [],
    }));
    await expect(resolver.resolve(request)).rejects.toThrow(
      "WINDOWS_IDENTITY_INVALID",
    );
  });
});

it("accepts only the versioned native bridge response", async () => {
  const { parseWindowsBridgeResponse } =
    await import("../src/adapters/windows-principal.js");
  expect(
    parseWindowsBridgeResponse({
      contract: "helix.windows-principal.v1",
      identity: {
        sid: "S-1-5-21-fixture",
        upn: "operator@example.test",
        groups: [],
      },
    }).sid,
  ).toBe("S-1-5-21-fixture");
  expect(() =>
    parseWindowsBridgeResponse({
      contract: "helix.windows-principal.v0",
      identity: {
        sid: "S-1-5-21-fixture",
        upn: "operator@example.test",
        groups: [],
      },
    }),
  ).toThrow("WINDOWS_IDENTITY_INVALID");
});
