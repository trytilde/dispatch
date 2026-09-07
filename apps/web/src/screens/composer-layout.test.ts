import { describe, expect, it } from "vite-plus/test";
import { shouldExpandComposer } from "./composer-layout.js";

describe("composer layout", () => {
  it("does not jump to the expanded layout at a character-count threshold", () => {
    expect(shouldExpandComposer("a".repeat(80), false)).toBe(false);
    expect(shouldExpandComposer("a".repeat(81), false)).toBe(false);
    expect(shouldExpandComposer("a".repeat(200), false)).toBe(false);
  });

  it("expands for explicitly multiline or supplemental content", () => {
    expect(shouldExpandComposer("first line\nsecond line", false)).toBe(true);
    expect(shouldExpandComposer("message", true)).toBe(true);
  });
});
