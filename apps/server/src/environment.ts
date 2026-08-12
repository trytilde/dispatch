import type { EnvProvider, ProviderCallContext } from "@openbot/provider-sdk";
import { defaultEnvProvider, VercelProjectEnvProvider } from "@openbot/providers";

export const environmentNames = {
  tildeApiKey: "OPENBOT_TILDE_API_KEY",
  tildeWebhookSigningKey: "OPENBOT_TILDE_WEBHOOK_SIGNING_KEY",
  tildeOrgId: "OPENBOT_TILDE_ORG_ID",
  tildeTeamId: "OPENBOT_TILDE_TEAM_ID",
  tildeAgentId: "OPENBOT_TILDE_AGENT_ID",
  tildeUiProviderId: "OPENBOT_TILDE_UI_PROVIDER_ID",
  tildeRuntimeMcpServerId: "OPENBOT_TILDE_RUNTIME_MCP_SERVER_ID",
  tildeSkillRegistryId: "OPENBOT_TILDE_SKILL_REGISTRY_ID",
  tildeMemoryBankId: "OPENBOT_TILDE_MEMORY_BANK_ID",
  openaiApiKey: "OPENBOT_OPENAI_API_KEY",
  openaiModel: "OPENBOT_OPENAI_MODEL",
  vercelApiToken: "OPENBOT_VERCEL_API_TOKEN",
} as const;

export function environmentProvider(vercelApiToken?: string): EnvProvider {
  if (process.env.VERCEL) return new VercelProjectEnvProvider({ token: vercelApiToken });
  return defaultEnvProvider();
}

export function providerContext(requestId: string = crypto.randomUUID(), signal?: AbortSignal): ProviderCallContext {
  return { requestId, ...(signal ? { signal } : {}) };
}

export async function configuredEnvironmentNames(provider = environmentProvider()): Promise<Set<string>> {
  return new Set((await provider.list("OPENBOT_", providerContext())).map((entry) => entry.name));
}

export async function setEnvironment(
  values: Readonly<Record<string, string>>,
  provider: EnvProvider = environmentProvider(),
): Promise<void> {
  const context = providerContext();
  for (const [name, value] of Object.entries(values)) {
    if (value) await provider.set(name, value, { sensitive: name !== environmentNames.openaiModel }, context);
  }
}

export async function getEnvironment(name: string, provider = environmentProvider()): Promise<string | undefined> {
  return provider.get(name, providerContext());
}

export async function tildeEnvironment(provider = environmentProvider()) {
  const [apiKey, webhookSigningKey, orgId, teamId, agentId, uiProviderId] = await Promise.all([
    provider.get(environmentNames.tildeApiKey, providerContext()),
    provider.get(environmentNames.tildeWebhookSigningKey, providerContext()),
    provider.get(environmentNames.tildeOrgId, providerContext()),
    provider.get(environmentNames.tildeTeamId, providerContext()),
    provider.get(environmentNames.tildeAgentId, providerContext()),
    provider.get(environmentNames.tildeUiProviderId, providerContext()),
  ]);
  if (!apiKey || !webhookSigningKey || !orgId || !teamId) return undefined;
  return {
    apiKey,
    webhookSigningKey,
    orgId,
    teamId,
    ...(agentId ? { agentId } : {}),
    ...(uiProviderId ? { uiProviderId } : {}),
    ...(process.env.TILDE_BASE_URL ? { baseUrl: process.env.TILDE_BASE_URL } : {}),
  };
}
