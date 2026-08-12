import { describe, expect, it } from "vitest";
import { agentSource } from "./publishing.js";

describe("agent publication source", () => {
  it("generates a repository-owned agent with a code prompt", () => {
    const source = agentSource({ id: "researcher", displayName: "Researcher", description: "Find evidence" });
    expect(source).toContain('id: "researcher"');
    expect(source).toContain('displayName: "Researcher"');
    expect(source).toContain("async run(context)");
    expect(source).not.toContain("prompt.md");
  });
});
