import { Code, ConnectError, type ConnectRouter, type HandlerContext } from "@connectrpc/connect";
import {
  AgentService,
  ChatService,
  InstallationPhase,
  InstallationService,
  ProviderKind,
  ProviderService,
  SandboxService,
  SandboxState,
} from "@openbot/contracts";
import type {
  AgentRecord,
  ChatMessage,
  ChatSession,
  ProviderCallContext,
  SandboxHandle,
  SandboxProvider,
} from "@openbot/provider-sdk";
import { ProviderError } from "@openbot/provider-sdk";
import {
  defaultSandboxProvider,
  OpenAiProvider,
  TildeAgentProvider,
  TildeChatProvider,
} from "@openbot/providers";
import { hasValidSession } from "./crypto.js";
import { setupCode } from "./config.js";
import {
  configuredEnvironmentNames,
  environmentNames,
  environmentProvider,
  getEnvironment,
  providerContext,
  setEnvironment,
  tildeEnvironment,
} from "./environment.js";
import { configuredProvider } from "./provider-registry.js";
import {
  clearSandbox,
  ensureInstallation,
  persistSandbox,
  updateInstallation,
} from "./store.js";
import { loadRepository } from "./repository.js";

function authorized(context: HandlerContext): void {
  if (!hasValidSession(context.requestHeader.get("cookie"), setupCode())) {
    throw new ConnectError("Setup session required", Code.Unauthenticated);
  }
}

function phaseValue(phase: string): InstallationPhase {
  if (phase === "ready") return InstallationPhase.READY;
  if (phase === "onboarding") return InstallationPhase.ONBOARDING;
  return InstallationPhase.TILDE;
}

async function installationStatus() {
  const installation = await ensureInstallation();
  const provider = environmentProvider();
  let names = new Set<string>();
  let environmentConfigured = false;
  try {
    names = await configuredEnvironmentNames(provider);
    environmentConfigured = (await provider.health(providerContext())).healthy;
  } catch {
    // A fresh Deploy Button installation has not supplied Vercel API access yet.
  }
  return {
    phase: phaseValue(installation.phase),
    onboardingStep: installation.onboardingStep,
    tildeConfigured: [
      environmentNames.tildeApiKey,
      environmentNames.tildeWebhookSigningKey,
      environmentNames.tildeOrgId,
      environmentNames.tildeTeamId,
    ].every((name) => names.has(name) || Boolean(process.env[name])),
    modelConfigured: names.has(environmentNames.openaiApiKey) || Boolean(process.env[environmentNames.openaiApiKey]),
    publicOrigin: installation.publicOrigin ?? "",
    environmentProvider: provider.descriptor.displayName,
    environmentProviderConfigured: environmentConfigured,
  };
}

function providerKind(kind: string): ProviderKind {
  if (kind === "ai") return ProviderKind.AI;
  if (kind === "sandbox") return ProviderKind.SANDBOX;
  if (kind === "agent") return ProviderKind.AGENT;
  if (kind === "chat") return ProviderKind.CHAT;
  if (kind === "environment") return ProviderKind.ENVIRONMENT;
  if (kind === "tool") return ProviderKind.TOOL;
  return ProviderKind.WORKSPACE_STORAGE;
}

function sandboxState(state: string): SandboxState {
  if (state === "running") return SandboxState.RUNNING;
  if (state === "stopped") return SandboxState.STOPPED;
  if (state === "failed") return SandboxState.FAILED;
  return SandboxState.STARTING;
}

function protoSandbox(handle: SandboxHandle) {
  return {
    id: handle.id,
    providerId: handle.providerId,
    state: sandboxState(handle.state),
    createdAt: handle.createdAt.toISOString(),
    checkpointId: handle.checkpointId ?? "",
  };
}

function protoAgent(agent: AgentRecord) {
  return {
    id: agent.id,
    displayName: agent.displayName,
    status: agent.status,
    endpointUrl: agent.endpointUrl ?? "",
    createdAt: agent.createdAt?.toISOString() ?? "",
    updatedAt: agent.updatedAt?.toISOString() ?? "",
  };
}

function protoSession(session: ChatSession) {
  return {
    id: session.id,
    agentId: session.agentId,
    title: session.title ?? "",
    unread: session.unread ?? false,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

function protoMessage(message: ChatMessage) {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
}

async function tildeProviders() {
  const config = await tildeEnvironment();
  if (!config) throw new ConnectError("Tilde is not configured", Code.FailedPrecondition);
  return {
    agents: new TildeAgentProvider(config),
    chat: new TildeChatProvider(config),
  };
}

async function listProviderStatus() {
  const env = environmentProvider();
  const sandbox = defaultSandboxProvider();
  const openai = new OpenAiProvider();
  const tilde = await tildeEnvironment();
  const providers = [
    openai,
    ...(tilde ? [new TildeAgentProvider(tilde), new TildeChatProvider(tilde)] : []),
    env,
    sandbox,
  ];
  const names = await configuredEnvironmentNames(env).catch(() => new Set<string>());
  const context = providerContext();
  const statuses = await Promise.all(providers.map(async (provider) => {
    const health = await provider.health(context);
    const configured = provider.descriptor.id === "openai"
      ? names.has(environmentNames.openaiApiKey) || Boolean(process.env[environmentNames.openaiApiKey])
      : provider.descriptor.kind === "agent" || provider.descriptor.kind === "chat"
        ? Boolean(tilde)
        : health.healthy;
    return {
      id: provider.descriptor.id,
      displayName: provider.descriptor.displayName,
      kind: providerKind(provider.descriptor.kind),
      configured,
      healthy: health.healthy,
      capabilities: [...provider.descriptor.capabilities],
      message: "message" in health && typeof health.message === "string" ? health.message : "",
    };
  }));
  if (!tilde) {
    statuses.push(
      { id: "tilde-agents", displayName: "Tilde agents", kind: ProviderKind.AGENT, configured: false, healthy: false, capabilities: [], message: "Tilde is not configured" },
      { id: "tilde-chatkit", displayName: "Tilde ChatKit", kind: ProviderKind.CHAT, configured: false, healthy: false, capabilities: [], message: "Tilde is not configured" },
    );
  }
  return statuses;
}

export function registerServices(router: ConnectRouter): void {
  router.service(InstallationService, {
    async getStatus(_request, context) {
      authorized(context);
      return installationStatus();
    },
    async configure(request, context) {
      authorized(context);
      const callContext = providerContext(context.requestHeader.get("x-request-id") ?? crypto.randomUUID(), context.signal);
      await new OpenAiProvider().validateCredential({ mode: "api_key", apiKey: request.openaiApiKey }, callContext);
      const tildeConfig = {
        apiKey: request.tildeApiKey,
        orgId: request.tildeOrgId,
        teamId: request.tildeTeamId,
        ...(process.env.TILDE_BASE_URL ? { baseUrl: process.env.TILDE_BASE_URL } : {}),
      };
      await new TildeAgentProvider(tildeConfig).verify(callContext);

      const provider = environmentProvider(request.vercelApiToken || undefined);
      const health = await provider.health(callContext);
      if (!health.healthy) {
        throw new ConnectError(health.message || "Environment provider is not configured", Code.FailedPrecondition);
      }
      await setEnvironment({
        [environmentNames.tildeApiKey]: request.tildeApiKey,
        [environmentNames.tildeWebhookSigningKey]: request.tildeWebhookSigningKey,
        [environmentNames.tildeOrgId]: request.tildeOrgId,
        [environmentNames.tildeTeamId]: request.tildeTeamId,
        [environmentNames.tildeAgentId]: request.tildeAgentId,
        [environmentNames.tildeUiProviderId]: request.tildeUiProviderId,
        [environmentNames.tildeRuntimeMcpServerId]: request.tildeRuntimeMcpServerId,
        [environmentNames.tildeSkillRegistryId]: request.tildeSkillRegistryId,
        [environmentNames.openaiApiKey]: request.openaiApiKey,
        [environmentNames.openaiModel]: request.openaiModel || "gpt-5.4",
        ...(request.vercelApiToken ? { [environmentNames.vercelApiToken]: request.vercelApiToken } : {}),
      }, provider);
      await updateInstallation({ phase: "onboarding", onboardingStep: "meet" });
      return installationStatus();
    },
    async setOnboardingStep(request, context) {
      authorized(context);
      const allowed = new Set(["meet", "computer-demo", "jobs", "tools", "create", "hand-off", "complete"]);
      if (!allowed.has(request.step)) throw new ConnectError("Unknown onboarding step", Code.InvalidArgument);
      await updateInstallation({ onboardingStep: request.step, phase: request.step === "complete" ? "ready" : "onboarding" });
      return installationStatus();
    },
  });

  router.service(AgentService, {
    async listAgents(_request, context) {
      authorized(context);
      const provider = (await tildeProviders()).agents;
      return { agents: (await provider.list(providerContext(undefined, context.signal))).map(protoAgent) };
    },
    async getAgent(request, context) {
      authorized(context);
      return protoAgent(await (await tildeProviders()).agents.get(request.id, providerContext(undefined, context.signal)));
    },
    async updateAgent(request, context) {
      authorized(context);
      if (!request.displayName.trim()) throw new ConnectError("Agent display name is required", Code.InvalidArgument);
      return protoAgent(await (await tildeProviders()).agents.update(
        request.id,
        { displayName: request.displayName.trim() },
        providerContext(undefined, context.signal),
      ));
    },
  });

  router.service(ChatService, {
    async listSessions(request, context) {
      authorized(context);
      const sessions = await (await tildeProviders()).chat.listSessions(request.agentId, providerContext(undefined, context.signal));
      return { sessions: sessions.map(protoSession) };
    },
    async createSession(request, context) {
      authorized(context);
      return protoSession(await (await tildeProviders()).chat.createSession(
        request.agentId,
        request.title || undefined,
        providerContext(undefined, context.signal),
      ));
    },
    async listMessages(request, context) {
      authorized(context);
      const messages = await (await tildeProviders()).chat.listMessages(request.sessionId, providerContext(undefined, context.signal));
      return { messages: messages.map(protoMessage) };
    },
    async sendMessage(request, context) {
      authorized(context);
      if (!request.text.trim()) throw new ConnectError("Message text is required", Code.InvalidArgument);
      const messages = await (await tildeProviders()).chat.sendMessage(
        request.agentId,
        request.sessionId,
        request.text.trim(),
        providerContext(undefined, context.signal),
      );
      return { messages: messages.map(protoMessage) };
    },
    async interrupt(request, context) {
      authorized(context);
      await (await tildeProviders()).chat.interrupt(request.sessionId, providerContext(undefined, context.signal));
      return { interrupted: true };
    },
  });

  router.service(ProviderService, {
    async listProviders(_request, context) {
      authorized(context);
      return { providers: await listProviderStatus() };
    },
    async checkProvider(request, context) {
      authorized(context);
      const provider = (await listProviderStatus()).find((candidate) => candidate.id === request.id);
      if (!provider) throw new ConnectError("Provider not found", Code.NotFound);
      return provider;
    },
  });

  router.service(SandboxService, {
    async createSandbox(request, context) {
      authorized(context);
      const existing = await currentSandbox(providerContext(undefined, context.signal), false);
      if (existing?.state === "running" || existing?.state === "starting") return protoSandbox(existing);
      const handle = await (await configuredProvider<SandboxProvider>("sandbox")).create(
        await sandboxSpec(request.image || undefined),
        providerContext(undefined, context.signal),
      );
      await persistSandbox(handle);
      return protoSandbox(handle);
    },
    async getSandbox(_request, context) {
      authorized(context);
      return protoSandbox(await requiredSandbox(providerContext(undefined, context.signal)));
    },
    async exec(request, context) {
      authorized(context);
      const handle = await requiredSandbox(providerContext(undefined, context.signal));
      return (await configuredProvider<SandboxProvider>("sandbox")).exec(handle.id, request.command, request.arguments, providerContext(undefined, context.signal));
    },
    async getDesktop(_request, context) {
      authorized(context);
      const handle = await requiredSandbox(providerContext(undefined, context.signal));
      const desktop = await (await configuredProvider<SandboxProvider>("sandbox")).desktop(handle.id, providerContext(undefined, context.signal));
      return { url: desktop.url.toString(), expiresAt: desktop.expiresAt.toISOString() };
    },
    async checkpoint(_request, context) {
      authorized(context);
      const current = await requiredSandbox(providerContext(undefined, context.signal));
      const handle = await (await configuredProvider<SandboxProvider>("sandbox")).checkpoint(current.id, providerContext(undefined, context.signal));
      await persistSandbox(handle);
      return protoSandbox(handle);
    },
    async stopSandbox(_request, context) {
      authorized(context);
      const current = await requiredSandbox(providerContext(undefined, context.signal));
      const handle = await (await configuredProvider<SandboxProvider>("sandbox")).stop(current.id, providerContext(undefined, context.signal));
      await persistSandbox(handle);
      return protoSandbox(handle);
    },
  });
}

async function sandboxSpec(image?: string) {
  const repository = await loadRepository();
  return {
    ...(image ? { image } : {}),
    repository: {
      digest: repository.digest,
      assets: repository.sandbox.assets,
      ...(repository.sandbox.bootstrap ? { bootstrap: repository.sandbox.bootstrap } : {}),
    },
  };
}

async function requiredSandbox(context: ProviderCallContext): Promise<SandboxHandle> {
  const handle = await currentSandbox(context, true);
  if (!handle) throw new ConnectError("The OpenBot computer has not been started", Code.NotFound);
  return handle;
}

async function currentSandbox(context: ProviderCallContext, clearMissing: boolean): Promise<SandboxHandle | undefined> {
  const installation = await ensureInstallation();
  if (!installation.sandboxInstanceId) return undefined;
  const provider = await configuredProvider<SandboxProvider>("sandbox");
  if (installation.sandboxProviderId && installation.sandboxProviderId !== provider.descriptor.id) {
    if (clearMissing) await clearSandbox();
    return undefined;
  }
  try {
    const handle = await provider.get(installation.sandboxInstanceId, context);
    await persistSandbox(handle);
    return handle;
  } catch (error) {
    if (error instanceof ProviderError && error.code === "not_found") {
      if (clearMissing) await clearSandbox();
      return undefined;
    }
    throw error;
  }
}
