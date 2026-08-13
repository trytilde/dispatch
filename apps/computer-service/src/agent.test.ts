import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { agentCommand, agentLinuxUsername, logicalWorkspacePath } from "./agent.js";

describe("agent computer execution", () => {
  it("maps an agent id to the stable deployed Linux user", () => {
    expect(agentLinuxUsername("hello-world")).toBe(`ob_${createHash("sha256").update("hello-world").digest("hex").slice(0, 16)}`);
  });

  it("routes commands through the private workspace launcher", () => {
    expect(agentCommand("hello-world", "pwd", [], { cwd: "/workspace/project" })).toEqual({
      command: "/usr/local/bin/openbot-agent-exec",
      arguments: [
        "/workspace/.openbot/agents/hello-world/workspace",
        agentLinuxUsername("hello-world"),
        "/workspace/project",
        "pwd",
      ],
    });
  });

  it("rejects invalid agent ids and escaping paths", () => {
    expect(() => agentCommand("../owner", "pwd")).toThrow("valid agent_id");
    expect(() => logicalWorkspacePath("/workspace/../other-agent")).toThrow("escapes /workspace");
  });
});
