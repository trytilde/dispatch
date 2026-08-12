import { describe, expect, it } from "vitest";
import { generatedSource } from "./generate-repository.js";

describe("repository manifest generation", () => {
  it("generates stable agent and provider imports", () => {
    const source = generatedSource(["agents/openbot.ts", "providers/custom/index.ts", "skills/tilde/SKILL.md"]);
    expect(source).toContain('import agent0 from "../../../../agents/openbot.js";');
    expect(source).toContain('import provider0 from "../../../../providers/custom/index.js";');
    expect(source).toContain("repositoryAgents = [agent0]");
  });
});
