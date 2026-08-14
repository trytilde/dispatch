import type { AgentProvider } from "@tryopenbot/agent-provider";
import type { AgentServiceProvider } from "@tryopenbot/agent-service-provider";
import type { DeployableProvider } from "@tryopenbot/runtime-provider";
import type { SkillProvider } from "@tryopenbot/skills-provider";
import type { ToolProvider } from "@tryopenbot/tools-provider";
import { describe, expect, it, vi } from "vite-plus/test";
import { formatAgentLifecycleProgress, reconcileAgentResources } from "./agent-lifecycle.js";

vi.mock("@tryopenbot/agent-service-provider", async (importOriginal) => ({
  ...(await importOriginal()),
  discoverAgents: vi.fn(async () => [
    {
      slug: "research-assistant",
      kind: "subagent",
      directory: "/repository/configuration/agent/subagents/research-assistant",
      path: "/repository/configuration/agent/subagents/research-assistant/agent.ts",
    },
  ]),
}));

describe("agent resource lifecycle", () => {
  it("runs check, build, and deploy per agent in skills, tools, agent order", async () => {
    const calls: string[] = [];
    const provider = (id: string): DeployableProvider => ({
      buildable: {
        check: async (context) => {
          expect(context.agentId).toBe("research-assistant");
          expect(context.agentPath).toBe(
            "/repository/configuration/agent/subagents/research-assistant",
          );
          calls.push(`${id}.check`);
        },
        build: async () => {
          calls.push(`${id}.build`);
        },
      },
      deployable: {
        plan: async () => ({ summary: id }),
        deploy: async () => {
          calls.push(`${id}.deploy`);
        },
      },
    });

    await reconcileAgentResources({
      repositoryRoot: "/repository",
      environment: {},
      providers: {
        skills: provider("skills") as SkillProvider,
        tools: provider("tools") as ToolProvider,
        agent: provider("agent") as AgentProvider,
        agentService: {
          baseUrl: vi.fn(() => new URL("http://127.0.0.1:4100")),
        } as unknown as AgentServiceProvider,
      },
    });

    expect(calls).toEqual([
      "skills.check",
      "skills.build",
      "skills.deploy",
      "tools.check",
      "tools.build",
      "tools.deploy",
      "agent.check",
      "agent.build",
      "agent.deploy",
    ]);
  });

  it("formats concise per-agent progress", () => {
    expect(
      formatAgentLifecycleProgress({
        event: "agent.lifecycle.started",
        details: { total: 3 },
      }),
    ).toBe("Reconciling Tilde resources for 3 authored agents");
    expect(
      formatAgentLifecycleProgress({
        event: "agent.reconcile.started",
        details: { agentId: "hello-world", index: 1, total: 3 },
      }),
    ).toBe("[1/3] Deploying hello-world agent");
  });
});
