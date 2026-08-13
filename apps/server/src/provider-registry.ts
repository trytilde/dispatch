import type { Provider, ProviderFactoryContext, ProviderKind } from "@openbot/provider-sdk";
import {
  OpenAiProvider,
  TildeAgentProvider,
  TildeChatProvider,
  TildeManagedSkillProvider,
  VercelDeploymentProvider,
  defaultSandboxProvider,
} from "@openbot/providers";
import {
  environmentNames,
  environmentProvider,
  getEnvironment,
  providerContext,
  tildeEnvironment,
} from "./environment.js";
import { loadRepository } from "./repository.js";

const builtins = new Set([
  "ai:openai",
  "agent:tilde-agents",
  "chat:tilde-chatkit",
  "skill:tilde-skills",
  "sandbox:auto",
  "environment:auto",
  "deployment:vercel",
]);

export async function configuredProvider<T extends Provider>(
  kind: ProviderKind,
  id?: string,
): Promise<T> {
  const repository = await loadRepository();
  const selected = id ?? configuredId(repository.config.providers, kind);
  const key = `${kind}:${selected}`;
  for (const plugin of repository.providerPlugins) {
    for (const registration of plugin.registrations) {
      const registrationKey = `${registration.kind}:${registration.id}`;
      if (builtins.has(registrationKey))
        throw new Error(`Custom provider may not replace built-in provider ${registrationKey}`);
      if (registrationKey !== key) continue;
      const context: ProviderFactoryContext = {
        options: repository.config.providers.options?.[selected],
        getSecret: (name) => getEnvironment(name),
      };
      return (await registration.create(context)) as unknown as T;
    }
  }
  if (key === "ai:openai") return new OpenAiProvider() as unknown as T;
  if (key === "sandbox:auto") return defaultSandboxProvider() as unknown as T;
  if (key === "environment:auto") return environmentProvider() as unknown as T;
  if (key === "deployment:vercel") {
    const token = await getEnvironment(environmentNames.vercelApiToken);
    const projectId =
      (await getEnvironment("OPENBOT_VERCEL_PROJECT_ID")) ?? process.env.VERCEL_PROJECT_ID;
    const teamId = (await getEnvironment("OPENBOT_VERCEL_TEAM_ID")) ?? process.env.VERCEL_TEAM_ID;
    if (!token || !projectId)
      throw new Error("Vercel deployment status requires VERCEL_TOKEN and VERCEL_PROJECT_ID");
    return new VercelDeploymentProvider({
      token,
      projectId,
      ...(teamId ? { teamId } : {}),
    }) as unknown as T;
  }
  const tilde = await tildeEnvironment();
  if (!tilde) throw new Error(`Provider ${selected} requires Tilde configuration`);
  if (key === "agent:tilde-agents") return new TildeAgentProvider(tilde) as unknown as T;
  if (key === "chat:tilde-chatkit") return new TildeChatProvider(tilde) as unknown as T;
  if (key === "skill:tilde-skills") {
    const registryId = await getEnvironment("OPENBOT_TILDE_SKILL_REGISTRY_ID");
    return new TildeManagedSkillProvider(tilde, registryId) as unknown as T;
  }
  throw new Error(`Configured provider is not registered: ${key}`);
}

export async function providerStatuses() {
  const repository = await loadRepository();
  const selected = [
    ["ai", repository.config.providers.ai],
    ["agent", repository.config.providers.agents],
    ["chat", repository.config.providers.chat],
    ["skill", repository.config.providers.skills],
    ["sandbox", repository.config.providers.sandbox],
    ["environment", repository.config.providers.environment],
    ["deployment", repository.config.providers.deployment],
  ] as const;
  return Promise.all(
    selected.map(async ([kind, id]) => {
      try {
        const provider = await configuredProvider(kind, id);
        const health = await provider.health(providerContext());
        return {
          id,
          kind,
          configured: true,
          ...health,
          displayName: provider.descriptor.displayName,
          capabilities: provider.descriptor.capabilities,
        };
      } catch (error) {
        return {
          id,
          kind,
          configured: false,
          healthy: false,
          displayName: id,
          capabilities: [] as readonly string[],
          message: error instanceof Error ? error.message : "Provider unavailable",
        };
      }
    }),
  );
}

function configuredId(
  providers: Awaited<ReturnType<typeof loadRepository>>["config"]["providers"],
  kind: ProviderKind,
): string {
  if (kind === "ai") return providers.ai;
  if (kind === "agent") return providers.agents;
  if (kind === "chat") return providers.chat;
  if (kind === "skill") return providers.skills;
  if (kind === "sandbox") return providers.sandbox;
  if (kind === "environment") return providers.environment;
  if (kind === "deployment") return providers.deployment;
  throw new Error(`No repository provider selector for ${kind}`);
}
