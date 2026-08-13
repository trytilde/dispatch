import { describe, expect, it } from "vitest";
import { scopedCapability } from "./capability.js";

describe("scopedCapability", () => {
  it("separates computer-service and VNC credentials", () => {
    const secret = "a".repeat(32);
    expect(scopedCapability("computer", "one", secret)).not.toBe(scopedCapability("vnc", "one", secret));
    expect(scopedCapability("computer", "one", secret)).not.toContain(secret);
  });
});
