import { describe, expect, it } from "vitest";
import { loadRepositoryAt } from "./repository.js";

describe("repository loader", () => {
  it("loads the committed agents, skills, and sandbox contract", async () => {
    const repository = await loadRepositoryAt(new URL("../../..", import.meta.url).pathname);
    expect(repository.agents.map((agent) => agent.id)).toContain("openbot");
    expect(repository.skills.map((skill) => skill.name)).toContain("tilde");
    expect(repository.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.sandbox.bootstrap).toContain("set -euo pipefail");
  });
});
