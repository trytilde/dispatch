import type { Client, SkillsClient } from "@trytilde/harness-sdk";
import type { ToolSet } from "ai";
import type { AiProvider, SandboxProvider } from "@openbot/provider-sdk";
import { defaultSandboxProvider, OpenBotPromptProvider } from "@openbot/providers";
import { environmentNames, getEnvironment, providerContext } from "./environment.js";
import { TildeRuntimeToolProvider, TildeSkillProvider } from "./runtime-providers.js";

export interface AgentRuntimeInput {
  agentId: string;
  displayName?: string;
  sessionId: string;
  userId?: string;
  client: Client;
  skills: SkillsClient;
  apiKey: string;
  orgId: string;
  aiProvider: AiProvider;
  sandboxProvider?: SandboxProvider;
  signal?: AbortSignal;
}

export interface AgentRuntimeContext {
  system: string;
  promptFingerprint: string;
  tools: ToolSet;
  close(): Promise<void>;
}

export async function createAgentRuntimeContext(input: AgentRuntimeInput): Promise<AgentRuntimeContext> {
  const [registryId, runtimeMcpServerId, memoryBankId] = await Promise.all([
    getEnvironment(environmentNames.tildeSkillRegistryId),
    getEnvironment(environmentNames.tildeRuntimeMcpServerId),
    getEnvironment(environmentNames.tildeMemoryBankId),
  ]);
  const context = providerContext(undefined, input.signal);
  const skillProvider = registryId ? new TildeSkillProvider(input.skills, registryId) : undefined;
  const [skillItems, toolProvider] = await Promise.all([
    skillProvider?.listSkills(context).catch(() => []) ?? [],
    loadRuntimeToolProvider(input, runtimeMcpServerId),
  ]);
  const sandboxProvider = input.sandboxProvider ?? defaultSandboxProvider();
  const prompt = await new OpenBotPromptProvider({
    providers: {
      ai: input.aiProvider,
      ...(toolProvider ? { tools: toolProvider } : {}),
      ...(skillProvider ? { skills: skillProvider } : {}),
      sandbox: sandboxProvider,
    },
  }).compose({
    agent: { id: input.agentId, ...(input.displayName ? { displayName: input.displayName } : {}) },
    sessionId: input.sessionId,
    ...(input.userId ? { userId: input.userId } : {}),
    capabilities: {
      runtimeMcp: toolProvider !== undefined,
      skillRegistry: registryId !== undefined && skillItems.length > 0,
      memory: memoryBankId !== undefined && toolProvider !== undefined,
      sandbox: true,
    },
    skills: skillItems,
  }, context);
  return {
    system: prompt.system,
    promptFingerprint: prompt.fingerprint,
    tools: await toolProvider?.aiTools() ?? {},
    close: async () => toolProvider?.close(),
  };
}

async function loadRuntimeToolProvider(
  input: AgentRuntimeInput,
  serverId: string | undefined,
): Promise<TildeRuntimeToolProvider | undefined> {
  if (!serverId) return undefined;
  try {
    return await TildeRuntimeToolProvider.connect({
      client: input.client,
      serverId,
      apiKey: input.apiKey,
      orgId: input.orgId,
    });
  } catch {
    return undefined;
  }
}
