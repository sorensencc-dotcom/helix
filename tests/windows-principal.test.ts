import { describe, expect, it } from "vitest";
import {
  IisHttpSysPrincipalResolver,
  WindowsBridgePrincipalResolver,
} from "../src/adapters/windows-principal.js";

const request = {} as never;
const bridgeUrl = "http://127.0.0.1:8792/v1/principal";

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

describe("windows-bridge native principal resolver", () => {
  it("resolves the identity from an authenticated fetch response", async () => {
    const resolver = new WindowsBridgePrincipalResolver(
      bridgeUrl,
      async (url) => {
        expect(url).toBe(bridgeUrl);
        return {
          ok: true,
          json: async () => ({
            contract: "helix.windows-principal.v1",
            identity: {
              sid: "S-1-5-21-fixture",
              upn: "operator@example.test",
              groups: ["S-1-5-32-544"],
            },
          }),
        };
      },
    );

    await expect(resolver.resolve()).resolves.toEqual({
      sid: "S-1-5-21-fixture",
      upn: "operator@example.test",
      groups: ["S-1-5-32-544"],
    });
  });

  it("fails closed when no authenticated fetch is injected", async () => {
    await expect(
      new WindowsBridgePrincipalResolver(bridgeUrl).resolve(),
    ).rejects.toThrow("WINDOWS_AUTH_REQUIRED");
  });

  it("fails closed when the bridge rejects the request as unauthenticated", async () => {
    const resolver = new WindowsBridgePrincipalResolver(
      bridgeUrl,
      async () => ({
        ok: false,
        json: async () => ({}),
      }),
    );
    await expect(resolver.resolve()).rejects.toThrow("WINDOWS_AUTH_REQUIRED");
  });

  it("fails closed when the fetch itself throws", async () => {
    const resolver = new WindowsBridgePrincipalResolver(bridgeUrl, async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(resolver.resolve()).rejects.toThrow("WINDOWS_AUTH_REQUIRED");
  });

  it("rejects a malformed principal body", async () => {
    const resolver = new WindowsBridgePrincipalResolver(
      bridgeUrl,
      async () => ({
        ok: true,
        json: async () => ({ contract: "helix.windows-principal.v0" }),
      }),
    );
    await expect(resolver.resolve()).rejects.toThrow(
      "WINDOWS_IDENTITY_INVALID",
    );
  });

  it("rejects a non-JSON body", async () => {
    const resolver = new WindowsBridgePrincipalResolver(
      bridgeUrl,
      async () => ({
        ok: true,
        json: async () => {
          throw new Error("invalid json");
        },
      }),
    );
    await expect(resolver.resolve()).rejects.toThrow(
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
