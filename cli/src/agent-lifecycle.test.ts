import type { AgentProvider } from "@tryopenbot/agent-provider";
import type { AgentServiceProvider } from "@tryopenbot/agent-service-provider";
import type { DeploymentContext } from "@tryopenbot/runtime-provider";
import type { SkillProvider, SkillRegistry } from "@tryopenbot/skills-provider";
import type { ToolProvider } from "@tryopenbot/tools-provider";
import { describe, expect, it, vi } from "vite-plus/test";
import { reconcileAgentResources } from "./agent-lifecycle.js";

vi.mock("@tryopenbot/agent-service-provider", async (importOriginal) => ({
  ...(await importOriginal()),
  discoverAgents: vi.fn(async () => [
    { slug: "research-assistant", directory: "/agents/research-assistant", path: "/agent.ts" },
  ]),
}));

const registry: SkillRegistry = {
  id: "registry-one",
  name: "OpenBot research-assistant",
};
const lifecycleResult = {
  environmentVariables: {
    AGENT_RESEARCH_ASSISTANT_AGENT_ID: "research-assistant",
    AGENT_RESEARCH_ASSISTANT_PROVIDER_ID: "chatkit.http-vercel-ai-sdk",
  },
  secrets: {
    AGENT_RESEARCH_ASSISTANT_API_KEY: "api-secret",
    AGENT_RESEARCH_ASSISTANT_WEBHOOK_SIGNING_KEY: "webhook-secret",
  },
};

describe("agent resource lifecycle", () => {
  it("schedules the agent deployable and persists its declared outputs", async () => {
    const deploy = vi.fn(async (_context: DeploymentContext) => lifecycleResult);
    const providers = providerMocks(deploy);
    const environmentWrites: Record<string, string> = {};
    const secretWrites: Record<string, string> = {};

    const result = await reconcileAgentResources({
      repositoryRoot: "/repository",
      environment: {},
      providers,
      target: "development",
      persistEnvironment: async (name, value) => {
        environmentWrites[name] = value;
      },
      persistSecret: async (name, value) => {
        secretWrites[name] = value;
      },
    });

    expect(deploy).toHaveBeenCalledOnce();
    expect(deploy.mock.calls[0]?.[0].inputs.require("agent-service.origin")).toBe(
      "http://127.0.0.1:4100",
    );
    expect(environmentWrites).toEqual({
      ...lifecycleResult.environmentVariables,
      AGENT_RESEARCH_ASSISTANT_MCP_SERVER_ID: "server-one",
      AGENT_RESEARCH_ASSISTANT_SKILL_REGISTRY_ID: "registry-one",
    });
    expect(secretWrites).toEqual(lifecycleResult.secrets);
    expect(result).toEqual({ environmentVariables: environmentWrites, secrets: secretWrites });
  });

  it("does not rewrite already persisted lifecycle values", async () => {
    const providers = providerMocks(vi.fn(async (_context: DeploymentContext) => lifecycleResult));
    const environment = {
      ...lifecycleResult.environmentVariables,
      ...lifecycleResult.secrets,
      AGENT_RESEARCH_ASSISTANT_MCP_SERVER_ID: "server-one",
      AGENT_RESEARCH_ASSISTANT_SKILL_REGISTRY_ID: "registry-one",
    };
    const persistEnvironment = vi.fn(async () => undefined);
    const persistSecret = vi.fn(async () => undefined);

    await reconcileAgentResources({
      repositoryRoot: "/repository",
      environment,
      providers,
      persistEnvironment,
      persistSecret,
    });

    expect(persistEnvironment).not.toHaveBeenCalled();
    expect(persistSecret).not.toHaveBeenCalled();
  });
});

function providerMocks(deploy: ReturnType<typeof vi.fn>) {
  return {
    agent: {
      deployable: { plan: vi.fn(async () => ({ summary: "reconcile" })), deploy },
    } as unknown as AgentProvider,
    agentService: {
      baseUrl: vi.fn(() => new URL("http://127.0.0.1:4100")),
    } as unknown as AgentServiceProvider,
    skills: {
      listRegistries: vi.fn(async () => []),
      registerSkills: vi.fn(async () => registry),
      getRegistry: vi.fn(async () => registry),
    } as unknown as SkillProvider,
    tools: {
      ensureServer: vi.fn(async () => ({ id: "server-one" })),
    } as unknown as ToolProvider,
  };
}
