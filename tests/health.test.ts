import { describe, expect, it } from "vitest";
import { healthResponse } from "../src/daemon/health.js";

describe("healthResponse", () => {
  it("returns a ready, versioned daemon status", () => {
    expect(healthResponse("0.1.0")).toEqual({
      status: "ready",
      service: "helix",
      version: "0.1.0",
    });
  });
});
