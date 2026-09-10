import { describe, expect, it } from "vitest";
import { authorize, redact } from "../src/domain/security.js";
import { canTransition } from "../src/domain/state.js";
describe("Phase 2 policy", () => {
  it("denies unknown and empty-scope capabilities", () => {
    expect(authorize("file.write", { windows: "user" }, "x")).toBe(false);
    expect(authorize("context.read", { windows: "user" }, " ")).toBe(false);
  });
  it("redacts credentials recursively", () => {
    expect(redact({ token: "abc", nested: "Bearer xyz" })).toEqual({
      token: "[REDACTED]",
      nested: "Bearer [REDACTED]",
    });
  });
  it("allows only legal state transitions", () => {
    expect(canTransition("QUEUED", "COMPLETED")).toBe(true);
    expect(canTransition("COMPLETED", "READY")).toBe(false);
  });
});
