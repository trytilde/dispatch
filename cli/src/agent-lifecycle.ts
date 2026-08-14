import type { AgentProvider } from "@tryopenbot/agent-provider";
import { discoverAgents, type AgentServiceProvider } from "@tryopenbot/agent-service-provider";
import {
  deployProviders,
  type DeploymentResult,
  type DeploymentTarget,
} from "@tryopenbot/runtime-provider";
import {
  SkillsProviderError,
  type SkillProvider,
  type SkillRegistry,
} from "@tryopenbot/skills-provider";
import type { ToolProvider } from "@tryopenbot/tools-provider";
import {
  setEncryptedSecret,
  setEnvironmentValue,
  unsetEncryptedSecret,
  unsetEnvironmentValue,
} from "./initialization.js";

export interface ReconcileAgentResourcesOptions {
  repositoryRoot: string;
  environment: NodeJS.ProcessEnv;
  providers: {
    agent: AgentProvider;
    agentService: AgentServiceProvider;
    skills: SkillProvider;
    tools: ToolProvider;
  };
  target?: DeploymentTarget;
  persistEnvironment?: (name: string, value: string, description: string) => Promise<void>;
  persistSecret?: (name: string, value: string, description: string) => Promise<void>;
  unsetEnvironment?: (name: string) => Promise<void>;
  unsetSecret?: (name: string) => Promise<void>;
}

export interface ReconciledAgentResources {
  environmentVariables: Record<string, string>;
  secrets: Record<string, string>;
}

/** Schedule idempotent provider lifecycles, then reconcile per-agent supporting resources. */
export async function reconcileAgentResources(
  options: ReconcileAgentResourcesOptions,
): Promise<ReconciledAgentResources> {
  const environmentVariables: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  const persistEnvironment =
    options.persistEnvironment ??
    ((name, value, description) =>
      setEnvironmentValue(options.repositoryRoot, name, value, description));
  const persistSecret =
    options.persistSecret ??
    ((name, value, description) =>
      setEncryptedSecret(options.repositoryRoot, name, value, {
        environment: options.environment,
        description,
      }));
  const unsetEnvironment =
    options.unsetEnvironment ?? ((name) => unsetEnvironmentValue(options.repositoryRoot, name));
  const unsetSecret =
    options.unsetSecret ??
    ((name) =>
      unsetEncryptedSecret(options.repositoryRoot, name, { environment: options.environment }));
  const target = options.target ?? "development";
  const endpointOrigin = options.providers.agentService
    .baseUrl({ target, environment: options.environment })
    .toString()
    .replace(/\/$/, "");
  const deployed = await deployProviders([{ id: "agent", provider: options.providers.agent }], {
    target,
    dryRun: false,
    repositoryRoot: options.repositoryRoot,
    environment: options.environment,
    initialInputs: { outputs: { "agent-service.origin": endpointOrigin } },
  });
  await persistLifecycleOutputs(deployed.result(), options.environment, {
    persistEnvironment,
    persistSecret,
    unsetEnvironment,
    unsetSecret,
  });
  Object.assign(environmentVariables, deployed.environmentVariables());
  Object.assign(secrets, deployed.secrets());

  for (const source of await discoverAgents(options.repositoryRoot)) {
    const prefix = `AGENT_${source.slug.replaceAll("-", "_").toUpperCase()}`;
    const call = (operation: string) => ({
      requestId: `agent-lifecycle:${source.slug}:${operation}`,
      idempotencyKey: `openbot:${source.slug}:${operation}`,
    });
    const mcpServer = await options.providers.tools.ensureServer(
      {
        id: options.environment[`${prefix}_MCP_SERVER_ID`]?.trim() || `openbot-${source.slug}`,
        name: `OpenBot ${source.slug}`,
        dynamicToolDiscovery: true,
      },
      call("mcp-server"),
    );
    const registry = await ensureSkillRegistry(
      options.providers.skills,
      source.slug,
      options.environment[`${prefix}_SKILL_REGISTRY_ID`],
    );
    await saveEnvironment(
      `${prefix}_MCP_SERVER_ID`,
      mcpServer.id,
      `Tilde MCP server ID for ${source.slug}.`,
    );
    await saveEnvironment(
      `${prefix}_SKILL_REGISTRY_ID`,
      registry.id,
      `Tilde skill registry ID for ${source.slug}.`,
    );
  }
  return { environmentVariables, secrets };

  async function saveEnvironment(name: string, value: string, description: string) {
    if (options.environment[name] !== value) await persistEnvironment(name, value, description);
    environmentVariables[name] = value;
    options.environment[name] = value;
  }
}

/** Persist only outputs explicitly returned by lifecycle providers; contains no vendor logic. */
export async function persistLifecycleOutputs(
  result: DeploymentResult,
  environment: NodeJS.ProcessEnv,
  persistence: {
    persistEnvironment(name: string, value: string, description: string): Promise<void>;
    persistSecret(name: string, value: string, description: string): Promise<void>;
    unsetEnvironment?(name: string): Promise<void>;
    unsetSecret?(name: string): Promise<void>;
  },
): Promise<void> {
  for (const name of result.environmentVariableRemovals ?? []) {
    await persistence.unsetEnvironment?.(name);
    delete environment[name];
  }
  for (const name of result.secretRemovals ?? []) {
    await persistence.unsetSecret?.(name);
    delete environment[name];
  }
  for (const [name, value] of Object.entries(result.environmentVariables ?? {})) {
    if (environment[name] !== value)
      await persistence.persistEnvironment(name, value, "Provider lifecycle output.");
    environment[name] = value;
  }
  for (const [name, value] of Object.entries(result.secrets ?? {})) {
    if (environment[name] !== value)
      await persistence.persistSecret(name, value, "Provider lifecycle secret.");
    environment[name] = value;
  }
}

async function ensureSkillRegistry(
  provider: SkillProvider,
  agentId: string,
  configuredId: string | undefined,
): Promise<SkillRegistry> {
  const context = { requestId: `agent-lifecycle:${agentId}:skill-registry` };
  if (configuredId?.trim()) {
    try {
      return await provider.getRegistry(configuredId.trim(), context);
    } catch (error) {
      if (!(error instanceof SkillsProviderError) || error.code !== "not_found") throw error;
    }
  }
  const name = `OpenBot ${agentId}`;
  const existing = await provider.listRegistries({ namePrefix: name }, context);
  const exact = existing.find((registry) => registry.name === name);
  return (
    exact ??
    provider.registerSkills(
      {
        name,
        description: `Skills available to the ${agentId} OpenBot agent.`,
        skillIds: [],
      },
      context,
    )
  );
}
