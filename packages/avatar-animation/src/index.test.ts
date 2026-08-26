import { describe, expect, it } from "vite-plus/test";
import { avatarAssetUrl, createAvatarIcon, createSpring, stepSpring } from "./index.js";

describe("avatar animation", () => {
  it("selects a stable catalog descriptor", () => {
    expect(createAvatarIcon("agent-123")).toEqual(createAvatarIcon("agent-123"));
  });

  it("builds versioned hosted asset URLs", () => {
    expect(avatarAssetUrl("eyes", "20")).toBe("https://trytilde.ai/avatar-assets/v1/eyes/20.png");
  });

  it("advances finite springs", () => {
    const spring = createSpring(0);
    spring.t = 4;
    stepSpring(spring, 6, 0.9, 1 / 60);
    expect(spring.x).toBeGreaterThan(0);
  });
});
