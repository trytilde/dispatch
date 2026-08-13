import { describe, expect, it } from "vitest";
import { computerServiceApiKey, scopedCapability } from "./capability.js";

describe("scopedCapability", () => {
  it("derives a VNC capability without exposing the service API key", () => {
    const secret = "a".repeat(32);
    expect(scopedCapability("vnc", "one", secret)).not.toBe(scopedCapability("vnc", "two", secret));
    expect(scopedCapability("vnc", "one", secret)).not.toContain(secret);
    expect(computerServiceApiKey(secret)).toBe(secret);
  });
});
