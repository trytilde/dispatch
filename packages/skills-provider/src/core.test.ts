import { describe, expect, it } from "vite-plus/test";
import { pageSize, providerSignal, safeSkillAssetPath, SkillsProviderError } from "./core.js";

describe("skills provider core", () => {
  it("bounds page sizes", () => {
    expect(pageSize(undefined, 20)).toBe(20);
    expect(pageSize(500, 20)).toBe(100);
    expect(() => pageSize(0, 20)).toThrow(SkillsProviderError);
  });

  it("rejects unsafe package paths", () => {
    expect(safeSkillAssetPath("scripts/run.sh")).toBe("scripts/run.sh");
    expect(() => safeSkillAssetPath("../secret")).toThrow(SkillsProviderError);
    expect(() => safeSkillAssetPath("/etc/passwd")).toThrow(SkillsProviderError);
  });

  it("honors elapsed deadlines", () => {
    expect(() => providerSignal({ requestId: "request", deadline: new Date(0) })).toThrow(
      SkillsProviderError,
    );
  });
});
