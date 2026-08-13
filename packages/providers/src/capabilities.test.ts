import { afterEach, describe, expect, it } from "vite-plus/test";
import { sandboxCapability } from "./capabilities.js";

describe("sandboxCapability", () => {
  const previous = process.env.OPENBOT_SETUP_CODE;
  afterEach(() => {
    if (previous === undefined) delete process.env.OPENBOT_SETUP_CODE;
    else process.env.OPENBOT_SETUP_CODE = previous;
  });

  it("is stable per purpose and sandbox without exposing the setup code", () => {
    process.env.OPENBOT_SETUP_CODE = "a-setup-code-that-is-long-enough";
    const desktop = sandboxCapability("desktop", "sandbox-1");
    expect(desktop).toBe(sandboxCapability("desktop", "sandbox-1"));
    expect(desktop).not.toBe(sandboxCapability("box", "sandbox-1"));
    expect(desktop).not.toContain(process.env.OPENBOT_SETUP_CODE);
  });
});
