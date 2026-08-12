import { Code, ConnectError, type ConnectRouter, type HandlerContext } from "@connectrpc/connect";
import {
  AgentService,
  AgentSortOrder,
  ChatService,
  InstallationPhase,
  InstallationService,
  ProviderKind,
  ProviderService,
  SessionSortOrder,
  SkillsService,
} from "@openbot/control-service-proto";
import {
  SandboxService,
  SandboxState,
} from "@openbot/contracts";
import type {
  Agent,
  AgentMessage,
  AgentProviderCallContext,
  AgentSession,
} from "@openbot/agent-provider-core";
import { TildeAgentProvider } from "@openbot/agent-provider";
import type {
  Skill,
  SkillAssetManifest,
  SkillRegistry,
  SkillsProviderCallContext,
} from "@openbot/skills-provider-core";
import { SkillsProviderError } from "@openbot/skills-provider-core";
import { TildeSkillsProvider } from "@openbot/skills-provider";
import type {
  ProviderCallContext,
  SandboxHandle,
  SandboxProvider,
} from "@openbot/provider-sdk";
import { ProviderError } from "@openbot/provider-sdk";
import {
  defaultSandboxProvider,
  OpenAiProvider,
} from "@openbot/providers";
import { hasValidSession } from "./crypto.js";
import { setupCode } from "./config.js";
import {
  configuredEnvironmentNames,
  environmentNames,
  environmentProvider,
  providerContext,
  setEnvironment,
  tildeEnvironment,
} from "./environment.js";
import { configuredProvider } from "./provider-registry.js";
import { clearSandbox, ensureInstallation, persistSandbox, updateInstallation } from "./store.js";
import { loadRepository } from "./repository.js";
import { environmentSuffix } from "./reconcile.js";

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
    modelConfigured:
      names.has(environmentNames.openaiApiKey) ||
      Boolean(process.env[environmentNames.openaiApiKey]),
    publicOrigin: installation.publicOrigin ?? "",
    environmentProvider: provider.descriptor.displayName,
    environmentProviderConfigured: environmentConfigured,
  };
}

function providerKind(kind: string): ProviderKind {
  if (kind === "ai") return ProviderKind.AI;
  if (kind === "sandbox") return ProviderKind.COMPUTER;
  if (kind === "agent") return ProviderKind.AGENT;
  if (kind === "environment") return ProviderKind.ENVIRONMENT;
  if (kind === "tool") return ProviderKind.TOOL;
  if (kind === "skill") return ProviderKind.SKILLS;
  return ProviderKind.UNSPECIFIED;
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

function protoAgent(agent: Agent) {
  return {
    id: agent.id,
    displayName: agent.displayName,
    providerId: agent.providerId,
    status: agent.status,
    hasUiEndpoint: agent.hasUiEndpoint,
    endpointUrl: agent.endpointUrl ?? "",
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    lastUserMessageAt: agent.lastUserMessageAt?.toISOString() ?? "",
  };
}

function protoSession(session: AgentSession) {
  return {
    id: session.id,
    agentId: session.agentId,
    title: session.title ?? "",
    unread: session.unread ?? false,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    lastUserMessageAt: session.lastUserMessageAt?.toISOString() ?? "",
  };
}

function protoMessage(message: AgentMessage) {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt?.toISOString() ?? "",
  };
}

function protoSkill(skill: Skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    version: skill.version,
    sourceKind: skill.sourceKind,
    sourcePath: skill.sourcePath ?? "",
    sourceRepositoryUrl: skill.sourceRepositoryUrl ?? "",
    sourceCommitHash: skill.sourceCommitHash ?? "",
    createdAt: skill.createdAt.toISOString(),
    updatedAt: skill.updatedAt.toISOString(),
  };
}

function protoSkillRegistry(registry: SkillRegistry) {
  return {
    id: registry.id,
    name: registry.name,
    description: registry.description,
    skills: registry.skills.map((skill) => ({ ...skill })),
    createdAt: registry.createdAt.toISOString(),
    updatedAt: registry.updatedAt.toISOString(),
  };
}

function protoSkillAssetManifest(manifest: SkillAssetManifest) {
  return {
    id: manifest.id,
    providerId: manifest.providerId,
    sourcePath: manifest.sourcePath,
    sourceCommitHash: manifest.sourceCommitHash,
    contentHash: manifest.contentHash,
    createdAt: manifest.createdAt.toISOString(),
    files: manifest.files.map((file) => ({
      path: file.path,
      sizeBytes: BigInt(file.sizeBytes),
      checksumSha256: file.checksumSha256,
      mediaType: file.mediaType,
      executable: file.executable,
    })),
  };
}

async function tildeAgentProvider() {
  const config = await tildeEnvironment();
  if (!config) throw new ConnectError("Tilde is not configured", Code.FailedPrecondition);
  return new TildeAgentProvider(config);
}

async function tildeSkillsProvider() {
  const config = await tildeEnvironment();
  if (!config) throw new ConnectError("Tilde is not configured", Code.FailedPrecondition);
  const registryId = await getEnvironment(environmentNames.tildeSkillRegistryId);
  return new TildeSkillsProvider({
    apiKey: config.apiKey,
    orgId: config.orgId,
    teamId: config.teamId,
    ...(registryId ? { registryId } : {}),
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
  });
}

async function listProviderStatus() {
  const env = environmentProvider();
  const sandbox = defaultSandboxProvider();
  const openai = new OpenAiProvider();
  const tilde = await tildeEnvironment();
  const providers = [
    openai,
    env,
    sandbox,
  ];
  const names = await configuredEnvironmentNames(env).catch(() => new Set<string>());
  const context = providerContext();
  const statuses = await Promise.all(providers.map(async (provider) => {
    const health = await provider.health(context);
    const configured = provider.descriptor.id === "openai"
      ? names.has(environmentNames.openaiApiKey) || Boolean(process.env[environmentNames.openaiApiKey])
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
  if (tilde) {
    const provider = new TildeAgentProvider(tilde);
    const health = await provider.health(context);
    statuses.push({
      id: provider.descriptor.id,
      displayName: provider.descriptor.displayName,
      kind: ProviderKind.AGENT,
      configured: true,
      healthy: health.healthy,
      capabilities: [...provider.descriptor.capabilities],
      message: health.message ?? "",
    });
    const skillsProvider = await tildeSkillsProvider();
    const skillsHealth = await skillsProvider.health(context);
    statuses.push({
      id: skillsProvider.descriptor.id,
      displayName: skillsProvider.descriptor.displayName,
      kind: ProviderKind.SKILLS,
      configured: true,
      healthy: skillsHealth.healthy,
      capabilities: [...skillsProvider.descriptor.capabilities],
      message: skillsHealth.message ?? "",
    });
  } else statuses.push({ id: "tilde", displayName: "Tilde", kind: ProviderKind.AGENT, configured: false, healthy: false, capabilities: [], message: "Tilde is not configured" });
  return statuses;
}

function agentSort(sort: AgentSortOrder) {
  if (sort === AgentSortOrder.CREATED_AT) return "created_at" as const;
  if (sort === AgentSortOrder.MANUAL) return "manual" as const;
  return "updated_at" as const;
}

function sessionSort(sort: SessionSortOrder) {
  return sort === SessionSortOrder.CREATED_AT ? "created_at" as const : "updated_at" as const;
}

function controlContext(context: HandlerContext): AgentProviderCallContext {
  return providerContext(context.requestHeader.get("x-request-id") ?? crypto.randomUUID(), context.signal);
}

function skillsContext(context: HandlerContext): SkillsProviderCallContext {
  return providerContext(context.requestHeader.get("x-request-id") ?? crypto.randomUUID(), context.signal);
}

async function skillsCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof SkillsProviderError)) throw error;
    const code = error.code === "invalid_request"
      ? Code.InvalidArgument
      : error.code === "invalid_configuration"
        ? Code.FailedPrecondition
        : error.code === "not_found"
          ? Code.NotFound
          : error.code === "permission_denied"
            ? Code.PermissionDenied
            : error.code === "deadline_exceeded"
              ? Code.DeadlineExceeded
              : error.code === "provider_unavailable"
                ? Code.Unavailable
                : Code.Internal;
    throw new ConnectError(error.message, code);
  }
}

export function registerServices(router: ConnectRouter): void {
  router.service(InstallationService, {
    async getStatus(_request, context) {
      authorized(context);
      return installationStatus();
    },
    async configure(request, context) {
      authorized(context);
      const callContext = providerContext(
        context.requestHeader.get("x-request-id") ?? crypto.randomUUID(),
        context.signal,
      );
      await new OpenAiProvider().validateCredential(
        { mode: "api_key", apiKey: request.openaiApiKey },
        callContext,
      );
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
        throw new ConnectError(
          health.message || "Environment provider is not configured",
          Code.FailedPrecondition,
        );
      }
      await setEnvironment(
        {
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
          ...(request.vercelApiToken
            ? { [environmentNames.vercelApiToken]: request.vercelApiToken }
            : {}),
        },
        provider,
      );
      await updateInstallation({ phase: "onboarding", onboardingStep: "meet" });
      return installationStatus();
    },
    async setOnboardingStep(request, context) {
      authorized(context);
      const allowed = new Set([
        "meet",
        "computer-demo",
        "jobs",
        "tools",
        "create",
        "hand-off",
        "complete",
      ]);
      if (!allowed.has(request.step))
        throw new ConnectError("Unknown onboarding step", Code.InvalidArgument);
      await updateInstallation({
        onboardingStep: request.step,
        phase: request.step === "complete" ? "ready" : "onboarding",
      });
      return installationStatus();
    },
  });

  router.service(AgentService, {
    async listAgents(request, context) {
      authorized(context);
      const result = await (await tildeAgentProvider()).listAgents({
        ...(request.pageSize ? { pageSize: request.pageSize } : {}),
        ...(request.nextPageToken ? { nextPageToken: request.nextPageToken } : {}),
        sort: agentSort(request.sort),
        ...(request.query ? { query: request.query } : {}),
      }, controlContext(context));
      return { agents: result.items.map(protoAgent), nextPageToken: result.nextPageToken ?? "" };
    },
    async getAgent(request, context) {
      authorized(context);
      return protoAgent(await (await tildeAgentProvider()).getAgent(request.id, controlContext(context)));
    },
    async updateAgent(request, context) {
      authorized(context);
      if (!request.displayName.trim() && !request.endpointUrl && request.enabled === undefined) {
        throw new ConnectError("At least one agent update is required", Code.InvalidArgument);
      }
      let endpointUrl: URL | undefined;
      if (request.endpointUrl) endpointUrl = controlUrl(request.endpointUrl, "Agent endpoint URL");
      return protoAgent(await (await tildeAgentProvider()).updateAgent(
        request.id,
        {
          ...(request.displayName.trim() ? { displayName: request.displayName.trim() } : {}),
          ...(endpointUrl ? { endpointUrl } : {}),
          ...(request.enabled !== undefined ? { enabled: request.enabled } : {}),
        },
        controlContext(context),
      ));
    },
    async registerAgent(request, context) {
      authorized(context);
      if (!request.displayName.trim()) throw new ConnectError("Agent display name is required", Code.InvalidArgument);
      const endpointUrl = controlUrl(request.endpointUrl, "Agent endpoint URL");
      const registered = await (await tildeAgentProvider()).registerAgent({
        ...(request.id ? { id: request.id } : {}),
        displayName: request.displayName.trim(),
        endpointUrl,
        ...(request.streaming !== undefined ? { streaming: request.streaming } : {}),
        ...(request.timeoutMs ? { timeoutMs: request.timeoutMs } : {}),
      }, controlContext(context));
      const suffix = environmentSuffix(request.id || registered.agent.id);
      await setEnvironment({
        [`OPENBOT_AGENT_${suffix}_API_KEY`]: registered.credentials.apiKey,
        [`OPENBOT_AGENT_${suffix}_WEBHOOK_SIGNING_KEY`]: registered.credentials.webhookSigningKey,
      });
      return protoAgent(registered.agent);
    },
    async unregisterAgent(request, context) {
      authorized(context);
      await (await tildeAgentProvider()).unregisterAgent(request.id, controlContext(context));
      const provider = environmentProvider();
      const suffix = environmentSuffix(request.id);
      await Promise.all([
        provider.delete(`OPENBOT_AGENT_${suffix}_API_KEY`, providerContext()),
        provider.delete(`OPENBOT_AGENT_${suffix}_WEBHOOK_SIGNING_KEY`, providerContext()),
      ]);
      return { unregistered: true };
    },
  });

  router.service(ChatService, {
    async listSessionGroups(request, context) {
      authorized(context);
      const result = await (await tildeAgentProvider()).listSessionGroups({
        ...(request.agentPageSize ? { pageSize: request.agentPageSize } : {}),
        ...(request.agentNextPageToken ? { nextPageToken: request.agentNextPageToken } : {}),
        ...(request.sessionsPerAgent ? { sessionsPerAgent: request.sessionsPerAgent } : {}),
        sort: agentSort(request.agentSort),
        sessionSort: sessionSort(request.sessionSort),
        ...(request.query ? { query: request.query } : {}),
      }, controlContext(context));
      return {
        groups: result.items.map((group) => ({
          agent: protoAgent(group.agent),
          sessions: group.sessions.items.map(protoSession),
          nextPageToken: group.sessions.nextPageToken ?? "",
        })),
        nextPageToken: result.nextPageToken ?? "",
      };
    },
    async listSessions(request, context) {
      authorized(context);
      const result = await (await tildeAgentProvider()).listSessions({
        ...(request.agentId ? { agentId: request.agentId } : {}),
        ...(request.pageSize ? { pageSize: request.pageSize } : {}),
        ...(request.nextPageToken ? { nextPageToken: request.nextPageToken } : {}),
        sort: sessionSort(request.sort),
        ...(request.query ? { query: request.query } : {}),
      }, controlContext(context));
      return { sessions: result.items.map(protoSession), nextPageToken: result.nextPageToken ?? "" };
    },
    async createSession(request, context) {
      authorized(context);
      return protoSession(await (await tildeAgentProvider()).createSession(
        request.agentId,
        request.title || undefined,
        controlContext(context),
      ));
    },
    async renameSession(request, context) {
      authorized(context);
      if (!request.title.trim()) throw new ConnectError("Session title is required", Code.InvalidArgument);
      return protoSession(await (await tildeAgentProvider()).renameSession(request.sessionId, request.title.trim(), controlContext(context)));
    },
    async markSessionUnread(request, context) {
      authorized(context);
      return protoSession(await (await tildeAgentProvider()).markSessionUnread(request.sessionId, controlContext(context)));
    },
    async listMessages(request, context) {
      authorized(context);
      const result = await (await tildeAgentProvider()).listMessages({
        sessionId: request.sessionId,
        ...(request.pageSize ? { pageSize: request.pageSize } : {}),
        ...(request.nextPageToken ? { nextPageToken: request.nextPageToken } : {}),
      }, controlContext(context));
      return { messages: result.items.map(protoMessage), nextPageToken: result.nextPageToken ?? "" };
    },
    async sendMessage(request, context) {
      authorized(context);
      if (!request.text.trim()) throw new ConnectError("Message text is required", Code.InvalidArgument);
      const result = await (await tildeAgentProvider()).sendMessage(
        request.agentId,
        request.sessionId,
        request.text.trim(),
        controlContext(context),
      );
      return { messages: result.items.map(protoMessage), nextPageToken: result.nextPageToken ?? "" };
    },
    async interrupt(request, context) {
      authorized(context);
      await (await tildeAgentProvider()).interruptSession(request.sessionId, controlContext(context));
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
      const provider = (await listProviderStatus()).find(
        (candidate) => candidate.id === request.id,
      );
      if (!provider) throw new ConnectError("Provider not found", Code.NotFound);
      return provider;
    },
  });

  router.service(SkillsService, {
    async listSkills(request, context) {
      authorized(context);
      return skillsCall(async () => {
        const result = await (await tildeSkillsProvider()).listSkills({
          ...(request.pageSize ? { pageSize: request.pageSize } : {}),
          ...(request.nextPageToken ? { nextPageToken: request.nextPageToken } : {}),
          ...(request.namePrefix ? { namePrefix: request.namePrefix } : {}),
          ...(request.registryId ? { registryId: request.registryId } : {}),
        }, skillsContext(context));
        return { skills: result.items.map(protoSkill), nextPageToken: result.nextPageToken ?? "" };
      });
    },
    async getSkill(request, context) {
      authorized(context);
      return skillsCall(async () => protoSkill(await (await tildeSkillsProvider()).getSkill(request.id, skillsContext(context))));
    },
    async createSkill(request, context) {
      authorized(context);
      if (!request.name.trim()) throw new ConnectError("Skill name is required", Code.InvalidArgument);
      if (!request.description.trim()) throw new ConnectError("Skill description is required", Code.InvalidArgument);
      return skillsCall(async () => protoSkill(await (await tildeSkillsProvider()).createSkill({
        ...(request.id ? { id: request.id } : {}),
        name: request.name.trim(),
        description: request.description.trim(),
        ...(request.content ? { content: request.content } : {}),
        ...(request.version ? { version: request.version } : {}),
        ...(request.sourceKind ? { sourceKind: request.sourceKind } : {}),
        ...(request.sourcePath ? { sourcePath: request.sourcePath } : {}),
        ...(request.sourceProviderId ? { sourceProviderId: request.sourceProviderId } : {}),
        ...(request.sourceRepositoryUrl ? { sourceRepositoryUrl: request.sourceRepositoryUrl } : {}),
        ...(request.sourceCommitHash ? { sourceCommitHash: request.sourceCommitHash } : {}),
      }, skillsContext(context))));
    },
    async updateSkill(request, context) {
      authorized(context);
      if (request.name === undefined && request.description === undefined && request.content === undefined) {
        throw new ConnectError("At least one skill update is required", Code.InvalidArgument);
      }
      return skillsCall(async () => protoSkill(await (await tildeSkillsProvider()).updateSkill(request.id, {
        ...(request.name !== undefined ? { name: request.name } : {}),
        ...(request.description !== undefined ? { description: request.description } : {}),
        ...(request.content !== undefined ? { content: request.content } : {}),
      }, skillsContext(context))));
    },
    async listSkillRegistries(request, context) {
      authorized(context);
      return skillsCall(async () => {
        const result = await (await tildeSkillsProvider()).listRegistries({
          ...(request.pageSize ? { pageSize: request.pageSize } : {}),
          ...(request.nextPageToken ? { nextPageToken: request.nextPageToken } : {}),
          ...(request.namePrefix ? { namePrefix: request.namePrefix } : {}),
        }, skillsContext(context));
        return { registries: result.items.map(protoSkillRegistry), nextPageToken: result.nextPageToken ?? "" };
      });
    },
    async getSkillRegistry(request, context) {
      authorized(context);
      return skillsCall(async () => protoSkillRegistry(await (await tildeSkillsProvider()).getRegistry(request.id, skillsContext(context))));
    },
    async registerSkills(request, context) {
      authorized(context);
      if (!request.name.trim()) throw new ConnectError("Skill registry name is required", Code.InvalidArgument);
      if (!request.description.trim()) throw new ConnectError("Skill registry description is required", Code.InvalidArgument);
      if (request.skillIds.some((id) => !id)) throw new ConnectError("Skill identifiers cannot be empty", Code.InvalidArgument);
      return skillsCall(async () => protoSkillRegistry(await (await tildeSkillsProvider()).registerSkills({
        ...(request.registryId ? { registryId: request.registryId } : {}),
        name: request.name.trim(),
        description: request.description.trim(),
        skillIds: request.skillIds,
      }, skillsContext(context))));
    },
    async getSkillAssetManifest(request, context) {
      authorized(context);
      return skillsCall(async () => protoSkillAssetManifest(
        await (await tildeSkillsProvider()).getSkillAssetManifest(request.skillId, skillsContext(context)),
      ));
    },
    async downloadSkillAsset(request, context) {
      authorized(context);
      return skillsCall(async () => {
        const provider = await tildeSkillsProvider();
        const manifest = await provider.getSkillAssetManifest(request.skillId, skillsContext(context));
        const asset = manifest.files.find((file) => file.path === request.path);
        if (!asset) throw new SkillsProviderError("not_found", "Skill asset was not found in the package manifest");
        const content = await provider.downloadSkillAsset(request.skillId, asset.path, skillsContext(context));
        return {
          path: asset.path,
          content,
          mediaType: asset.mediaType,
          checksumSha256: asset.checksumSha256,
          executable: asset.executable,
        };
      });
    },
  });

  router.service(SandboxService, {
    async createSandbox(request, context) {
      authorized(context);
      const existing = await currentSandbox(providerContext(undefined, context.signal), false);
      if (existing?.state === "running" || existing?.state === "starting")
        return protoSandbox(existing);
      const handle = await (
        await configuredProvider<SandboxProvider>("sandbox")
      ).create(
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
      return (await configuredProvider<SandboxProvider>("sandbox")).exec(
        handle.id,
        request.command,
        request.arguments,
        providerContext(undefined, context.signal),
      );
    },
    async getDesktop(_request, context) {
      authorized(context);
      const handle = await requiredSandbox(providerContext(undefined, context.signal));
      const desktop = await (
        await configuredProvider<SandboxProvider>("sandbox")
      ).desktop(handle.id, providerContext(undefined, context.signal));
      return { url: desktop.url.toString(), expiresAt: desktop.expiresAt.toISOString() };
    },
    async checkpoint(_request, context) {
      authorized(context);
      const current = await requiredSandbox(providerContext(undefined, context.signal));
      const handle = await (
        await configuredProvider<SandboxProvider>("sandbox")
      ).checkpoint(current.id, providerContext(undefined, context.signal));
      await persistSandbox(handle);
      return protoSandbox(handle);
    },
    async stopSandbox(_request, context) {
      authorized(context);
      const current = await requiredSandbox(providerContext(undefined, context.signal));
      const handle = await (
        await configuredProvider<SandboxProvider>("sandbox")
      ).stop(current.id, providerContext(undefined, context.signal));
      await persistSandbox(handle);
      return protoSandbox(handle);
    },
  });
}

function controlUrl(value: string, label: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new ConnectError(`${label} is invalid`, Code.InvalidArgument); }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConnectError(`${label} must use HTTP or HTTPS`, Code.InvalidArgument);
  }
  return url;
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

async function currentSandbox(
  context: ProviderCallContext,
  clearMissing: boolean,
): Promise<SandboxHandle | undefined> {
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
