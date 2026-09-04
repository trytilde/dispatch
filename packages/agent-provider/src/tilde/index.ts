import { readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { DeploymentContext, DeploymentPlan } from "@tryopenbot/runtime-provider";
import { persistEnvironment, persistSecret, unsetEnvironment } from "@tryopenbot/runtime-provider";
import {
  TildePlatform,
  tildeAuthenticationHeaders,
  type TildePlatformConfig,
} from "@tryopenbot/platform-integrations";
import { createClient } from "@trytilde/sdk";
import {
  tildeErrorStatus,
  tildeHttpErrorMessage,
} from "@tryopenbot/platform-integrations/tilde/errors";
import {
  chatkitClaimAgentResourceBundleOutputs,
  chatkitGetAgentResourceBundleProvisioning,
  chatkitListChatProviders,
  chatkitProvisionAgentResourceBundle,
  chatkitSetAgentPermissions,
  chatkitUpdateAgent,
  chatkitUpdateChatProvider,
  chatkitUpdateAgentAvatar,
  chatkitRegisterVercelUiChatProvider,
  createMcpServerInstance,
  getMcpServerInstance,
  updateMcpServerInstance,
  AgentCredentialStrategy,
  AgentProvisioningStatus,
  ChatKitAgentConcurrencyPolicy,
  ChatKitAutomaticMemoryMode,
  UserToolFederationMode,
  createTildeApiClient,
  type EnabledSkillsSpec,
  type TildeApiClient,
} from "@trytilde/sdk/api";
import type { AgentProvider, AgentProviderOptions } from "../core.js";
import { AgentProviderError, sharedAgentResourceEnvironment } from "../core.js";
import { TildeSkillReconciler } from "./skills.js";
import { TildeToolReconciler, tildeAgentProviderInitialization } from "./tools.js";
import { fetchWithConcurrency } from "./concurrency.js";
import { renderAgentAvatarPng } from "./avatar.js";

export { tildeAgentProviderInitialization } from "./tools.js";

export interface TildeAgentProviderConfig extends TildePlatformConfig {}

type JsonRecord = Record<string, unknown>;
const chatKitRealtimeChannelId = "openbot-chatkit-workspace";
const maxConcurrentRequests = 10;
const synthesizerAgentId = "memory-catcher";
const sharedEnvironment = sharedAgentResourceEnvironment;

/** What one agent shares with the rest of the installation, resolved before its bundle is sent. */
interface SharedDeployment {
  kind: "primary" | "subagent";
  memoryMode: ChatKitAutomaticMemoryMode;
  /** Union of every authored agent's curated skills, published to the one shared registry. */
  skills?: EnabledSkillsSpec;
  sharedMemoryBankId?: string;
  sharedSkillRegistryId?: string;
  sharedConnectorsMcpServerId?: string;
  /** Delegation targets of the primary agent; the synthesizer is never a delegate. */
  subagentIds: readonly string[];
}

/** Idempotently reconciles every authored agent with Tilde ChatKit. */
export class TildeAgentProvider implements AgentProvider {
  readonly platform: TildePlatform;
  readonly platforms: readonly TildePlatform[];
  readonly initialization = tildeAgentProviderInitialization;
  readonly buildable = {
    check: async (context: DeploymentContext) => {
      requireAgent(context);
    },
    build: async (_context: DeploymentContext) => undefined,
  };
  readonly deployable = {
    plan: (context: DeploymentContext) => this.#plan(context),
    deploy: (context: DeploymentContext) => this.#deploy(context),
  };
  readonly #api: TildeApiClient;
  readonly #teamId: string;
  readonly #skills: TildeSkillReconciler;
  readonly #tools: TildeToolReconciler;
  readonly #options: AgentProviderOptions;

  constructor(
    platformOrConfig: TildePlatform | TildeAgentProviderConfig,
    options: AgentProviderOptions = {},
  ) {
    this.platform =
      platformOrConfig instanceof TildePlatform
        ? platformOrConfig
        : new TildePlatform(platformOrConfig);
    this.platforms = [this.platform];
    this.#options = options;
    const config = this.platform.connection();
    const limitedFetch = fetchWithConcurrency(
      (input, init) => fetch(input, init),
      maxConcurrentRequests,
    );
    this.#api = createTildeApiClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      orgId: config.orgId,
      headers: tildeAuthenticationHeaders(config),
      fetch: limitedFetch,
      // Keep generated failures as { error, response } so provider errors retain HTTP context.
      throwOnError: false,
    });
    this.#teamId = config.teamId;
    this.#skills = new TildeSkillReconciler({ ...config, fetch: limitedFetch });
    this.#tools = new TildeToolReconciler({
      client: createClient({
        ...config,
        orgSubdomain: false,
        headers: tildeAuthenticationHeaders(config),
        fetch: limitedFetch,
      }),
    });
  }

  async #plan(context: DeploymentContext): Promise<DeploymentPlan> {
    const agent = requireAgent(context);
    return {
      summary: `Reconcile authored agent ${agent.id} with Tilde`,
      steps: [
        "Create missing ChatKit agents",
        "Create the shared OpenBot ChatKit workspace channel when missing",
        "Reconcile Vercel AI SDK endpoint URLs and enabled status",
        "Upload the agent's canonical machine-user avatar",
        "Provision automatic memory for ordinary agents without recursive synthesizer memory",
        "Synchronize authored skills and exact registry membership",
        "Reconcile dynamic MCP, Tilde control-plane, and deployment-platform tools",
        context.devMode
          ? "Enable Tilde local-runtime tunneling"
          : "Use the deployed public agent-service URL",
      ],
    };
  }

  async #deploy(context: DeploymentContext): Promise<void> {
    const { id: slug } = requireAgent(context);
    const origin = context.agentServiceOrigin ?? context.environment.AGENT_SERVICE_ORIGIN;
    if (!origin)
      throw new AgentProviderError(
        "invalid_configuration",
        `The agent service origin is unavailable for ${slug}`,
      );
    const localRunningEndpoint = context.devMode;
    const prefix = `AGENT_${slug.replaceAll("-", "_").toUpperCase()}`;
    const displayName = context.environment[`${prefix}_NAME`]?.trim() || slug;
    const synthesisOnly = slug === synthesizerAgentId;
    const shared = this.#options.sharedResources;
    const deployment =
      shared || this.#options.permissions
        ? await this.#sharedDeployment(context, slug, synthesisOnly)
        : undefined;
    const memoryMode = synthesisOnly
      ? ChatKitAutomaticMemoryMode.NONE
      : (deployment?.memoryMode ?? automaticMemoryMode(context.environment, prefix));
    const apiKeyName = `${prefix}_API_KEY`;
    const webhookKeyName = `${prefix}_WEBHOOK_SIGNING_KEY`;
    const endpointUrl = new URL(`/api/agents/${slug}`, `${origin}/`);
    const hasCredentials =
      Boolean(context.environment[apiKeyName]) && Boolean(context.environment[webhookKeyName]);
    const enabledSkills = deployment?.skills ?? (await this.#skills.bundleSkills(context));
    let operation = await this.#generated(`provision Agent Resource Bundle "${slug}"`, (signal) =>
      chatkitProvisionAgentResourceBundle({
        client: this.#api,
        path: { team_id: this.#teamId, agent_id: slug },
        body: {
          agent: {
            display_name: displayName,
            endpoint: {
              url: endpointValue(endpointUrl),
              local_running_endpoint: localRunningEndpoint,
              streaming: true,
              timeout_ms: 300_000,
              concurrency_policy: ChatKitAgentConcurrencyPolicy.QUEUE,
            },
            status: "enabled",
            automatic_memory_mode: memoryMode,
            credential_strategy: hasCredentials
              ? AgentCredentialStrategy.PRESERVE
              : AgentCredentialStrategy.ROTATE,
          },
          mcp_server: {
            enabled: true,
            id: context.environment[`${prefix}_MCP_SERVER_ID`]?.trim() || `openbot-${slug}`,
            name: `OpenBot ${slug}`,
            dynamic_tool_discovery: true,
            enable_tilde_control_plane: true,
            user_tool_federation_mode: personalToolFederationMode(context.environment),
            user_tool_federation_selections: [],
          },
          skill_registry:
            shared?.skillRegistry && deployment
              ? {
                  enabled: true,
                  // The primary creates the shared registry once (falling back to its legacy
                  // per-agent registry); every other agent pins the same ID.
                  id:
                    deployment.sharedSkillRegistryId ??
                    (deployment.kind === "primary"
                      ? context.environment[`${prefix}_SKILL_REGISTRY_ID`]?.trim()
                      : undefined),
                  name: shared.skillRegistry.name,
                  description:
                    shared.skillRegistry.description ??
                    "Curated skills shared by every OpenBot agent.",
                  enabled_skills: enabledSkills,
                }
              : {
                  enabled: true,
                  id: context.environment[`${prefix}_SKILL_REGISTRY_ID`]?.trim(),
                  name: `OpenBot ${slug}`,
                  description: `Skills available to the ${slug} OpenBot agent.`,
                  enabled_skills: enabledSkills,
                },
          ...(synthesisOnly
            ? {}
            : {
                memory: {
                  bank:
                    shared?.memoryBank && deployment
                      ? deployment.kind === "primary"
                        ? {
                            enabled: true,
                            id: deployment.sharedMemoryBankId,
                            name: shared.memoryBank.name,
                            description:
                              shared.memoryBank.description ??
                              "Durable memory shared by every OpenBot agent.",
                            synthesizer_agent_id: synthesizerAgentId,
                          }
                        : { enabled: false }
                      : memoryMode === ChatKitAutomaticMemoryMode.PERSONAL_PLUS_AGENT
                        ? {
                            enabled: true,
                            name: `OpenBot ${slug} memory`,
                            description: `Memory owned by the ${slug} OpenBot agent.`,
                            synthesizer_agent_id: synthesizerAgentId,
                          }
                        : { enabled: false },
                },
              }),
        },
        signal,
      }),
    );
    for (let attempt = 0; operation.status !== AgentProvisioningStatus.ACTIVE; attempt += 1) {
      if (
        operation.status === AgentProvisioningStatus.ERROR &&
        !isRetryableProvisioningError(operation.error_message)
      )
        throw new AgentProviderError(
          "provider_unavailable",
          operation.error_message || `Tilde could not provision ${slug}`,
          true,
        );
      if (attempt >= 1_200)
        throw new AgentProviderError(
          "deadline_exceeded",
          `Timed out provisioning Agent Resource Bundle "${slug}"`,
          true,
        );
      await new Promise((resolve) => setTimeout(resolve, 500));
      operation = await this.#generated(`poll Agent Resource Bundle "${slug}"`, (signal) =>
        chatkitGetAgentResourceBundleProvisioning({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: slug },
          signal,
        }),
      );
    }
    const mcpServerId = operation.resources.find(
      ({ kind, key }) => kind === "mcp_server" && key === "default",
    )?.id;
    if (!mcpServerId)
      throw new AgentProviderError(
        "provider_unavailable",
        `Tilde returned no MCP server for ${slug}`,
        true,
      );
    let createdSecrets: { apiKey: string; webhookSigningKey: string } | undefined;
    if (operation.outputs_available) {
      const claimed = await this.#generated(
        `claim Agent Resource Bundle outputs "${slug}"`,
        (signal) =>
          chatkitClaimAgentResourceBundleOutputs({
            client: this.#api,
            path: { team_id: this.#teamId, agent_id: slug },
            signal,
          }),
      );
      if (claimed.values?.api_key && claimed.values.webhook_signing_key)
        createdSecrets = {
          apiKey: claimed.values.api_key,
          webhookSigningKey: claimed.values.webhook_signing_key,
        };
    }
    // One-time outputs are irrecoverable after claiming. Persist them before avatar upload,
    // external integrations, or any other fallible reconciliation work.
    await this.#persistAgentSecrets(context, slug, prefix, createdSecrets);
    const agentApiKey = createdSecrets?.apiKey ?? context.environment[apiKeyName]?.trim();
    if (!agentApiKey)
      throw new AgentProviderError(
        "invalid_configuration",
        `The stable machine-user API key is unavailable for ${slug}`,
      );
    const platform = this.platform.connection();
    const agentApi = createTildeApiClient({
      baseUrl: platform.baseUrl,
      apiKey: agentApiKey,
      orgId: platform.orgId,
      throwOnError: false,
    });
    const avatar = renderAgentAvatarPng(slug);
    await this.#generated(`upload avatar for "${slug}"`, (signal) =>
      chatkitUpdateAgentAvatar({
        client: agentApi,
        path: { team_id: this.#teamId, agent_id: slug },
        // The generated OpenAPI type uses number[] for binary bodies, while fetch requires a
        // BodyInit. Preserve the Uint8Array at runtime until the generator models binary input.
        body: avatar as unknown as number[],
        headers: { "Content-Type": "image/png" },
        signal,
      }),
    );
    await persistEnvironment(
      context,
      `${prefix}_MCP_SERVER_ID`,
      mcpServerId,
      `Tilde MCP server ID for ${slug}.`,
    );
    if (deployment)
      await this.#finishSharedDeployment(context, slug, synthesisOnly, deployment, operation);
    await Promise.all([
      this.#ensureChatKitWorkspaceChannel(slug, slug, context.agentKind ?? "subagent"),
      this.#tools.deployExternalResources(context),
      unsetEnvironment(context, `${prefix}_AGENT_ID`),
      unsetEnvironment(context, `${prefix}_PROVIDER_ID`),
      unsetEnvironment(context, `${prefix}_SKILL_REGISTRY_ID`),
      unsetEnvironment(context, `${prefix}_TILDE_CONTROL_PLANE_TOOL_GROUP_ID`),
    ]);
  }

  /**
   * Resolves what the composition root shares across agents before the bundle is submitted. The
   * primary agent reconciles the shared connectors server and publishes the union of every
   * authored agent's skills; subagents require the IDs the primary persisted.
   */
  async #sharedDeployment(
    context: DeploymentContext,
    slug: string,
    synthesisOnly: boolean,
  ): Promise<SharedDeployment> {
    const environment = context.environment;
    const shared = this.#options.sharedResources;
    const kind: "primary" | "subagent" =
      context.agentKind ?? (slug === "factory" ? "primary" : "subagent");
    const memoryMode = automaticMemoryMode(
      environment,
      `AGENT_${slug.replaceAll("-", "_").toUpperCase()}`,
    );
    // The provider never picks a memory mode: a shared bank only works when the composition root
    // also turned agent memory on, so an inconsistent configuration fails before any side effect.
    if (
      shared?.memoryBank &&
      !synthesisOnly &&
      memoryMode !== ChatKitAutomaticMemoryMode.PERSONAL_PLUS_AGENT
    )
      throw new AgentProviderError(
        "invalid_configuration",
        `sharedResources.memoryBank requires OPENBOT_AUTOMATIC_MEMORY_MODE (or the AGENT_<ID>_AUTOMATIC_MEMORY_MODE override) to be personal_plus_agent for ${slug}`,
      );
    const layout = agentLayout(context, kind);
    const authoredIds = await authoredSubagentIds(layout.primaryDirectory);
    const subagentIds = authoredIds.filter((id) => id !== synthesizerAgentId);
    const sharedMemoryBankId = environment[sharedEnvironment.sharedMemoryBankId]?.trim();
    const sharedSkillRegistryId = environment[sharedEnvironment.sharedSkillRegistryId]?.trim();
    let sharedConnectorsMcpServerId =
      environment[sharedEnvironment.sharedConnectorsMcpServerId]?.trim();
    if (kind === "primary" && shared?.connectorsMcpServer) {
      sharedConnectorsMcpServerId = await this.#ensureSharedConnectorsServer(
        sharedConnectorsMcpServerId ?? shared.connectorsMcpServer.id,
        shared.connectorsMcpServer.name,
      );
      await persistEnvironment(
        context,
        sharedEnvironment.sharedConnectorsMcpServerId,
        sharedConnectorsMcpServerId,
        "Shared connectors MCP server attached to every agent.",
      );
    }
    if (kind === "subagent") {
      const missing: string[] = [];
      if (shared?.memoryBank && !sharedMemoryBankId)
        missing.push(sharedEnvironment.sharedMemoryBankId);
      if (shared?.skillRegistry && !sharedSkillRegistryId)
        missing.push(sharedEnvironment.sharedSkillRegistryId);
      if (shared?.connectorsMcpServer && !sharedConnectorsMcpServerId)
        missing.push(sharedEnvironment.sharedConnectorsMcpServerId);
      if (missing.length > 0)
        throw new AgentProviderError(
          "invalid_configuration",
          `The primary agent must reconcile before ${slug}: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required`,
        );
    }
    return {
      kind,
      memoryMode,
      skills: shared?.skillRegistry
        ? await this.#unionSkills(context, layout.primaryDirectory, ["factory", ...authoredIds])
        : undefined,
      sharedMemoryBankId,
      sharedSkillRegistryId,
      sharedConnectorsMcpServerId,
      subagentIds,
    };
  }

  /** Union of every authored agent's curated skills for the one shared registry. */
  async #unionSkills(
    context: DeploymentContext,
    primaryDirectory: string,
    agentIds: readonly string[],
  ): Promise<EnabledSkillsSpec> {
    const custom = new Map<string, NonNullable<EnabledSkillsSpec["custom"]>[number]>();
    const managed = new Map<string, Set<string>>();
    for (const agentId of agentIds) {
      const agentPath =
        agentId === "factory" ? primaryDirectory : resolve(primaryDirectory, "subagents", agentId);
      const bundle = await this.#skills.bundleSkills({ ...context, agentId, agentPath });
      for (const skill of bundle.custom ?? []) custom.set(skill.key, skill);
      for (const entry of bundle.managed ?? []) {
        const ids = managed.get(entry.provider_id) ?? new Set<string>();
        for (const id of entry.skill_ids) ids.add(id);
        managed.set(entry.provider_id, ids);
      }
    }
    return {
      custom: [...custom.values()],
      managed: [...managed].map(([provider_id, ids]) => ({ provider_id, skill_ids: [...ids] })),
    };
  }

  /** One dynamic MCP server carries connector mappings and personal tool federation for all agents. */
  async #ensureSharedConnectorsServer(id: string, name: string): Promise<string> {
    const existing = await this.#generatedOptional(
      `read the shared connectors MCP server "${id}"`,
      (signal) =>
        getMcpServerInstance({
          client: this.#api,
          path: { team_id: this.#teamId, mcp_server_instance_id: id },
          signal,
        }),
    );
    if (!existing) {
      const created = await this.#generated(
        `create the shared connectors MCP server "${id}"`,
        (signal) =>
          createMcpServerInstance({
            client: this.#api,
            path: { team_id: this.#teamId },
            body: {
              id,
              name,
              is_dynamic_tool_discovery: true,
              user_tool_federation_mode: UserToolFederationMode.ALL,
              user_tool_federation_selections: [],
            },
            signal,
          }),
      );
      return created.id;
    }
    if (
      existing.user_tool_federation_mode !== UserToolFederationMode.ALL ||
      !existing.is_dynamic_tool_discovery
    )
      await this.#generated(`update the shared connectors MCP server "${id}"`, (signal) =>
        updateMcpServerInstance({
          client: this.#api,
          path: { team_id: this.#teamId, mcp_server_instance_id: existing.id },
          body: {
            name: existing.name || name,
            is_dynamic_tool_discovery: true,
            user_tool_federation_mode: UserToolFederationMode.ALL,
            user_tool_federation_selections: existing.user_tool_federation_selections ?? [],
          },
          signal,
        }),
      );
    return existing.id;
  }

  /**
   * After the bundle is active: record the shared bank and registry the primary created, bind
   * subagents to the shared banks and every agent to the shared connectors server, and apply the
   * composition root's permissions.
   */
  async #finishSharedDeployment(
    context: DeploymentContext,
    slug: string,
    synthesisOnly: boolean,
    deployment: SharedDeployment,
    operation: { owner_user_id: string; resources: readonly { kind: string; id: string }[] },
  ): Promise<void> {
    const { resources } = operation;
    const shared = this.#options.sharedResources;
    if (deployment.kind === "primary" && shared) {
      const bankId = resources.find(({ kind }) => kind === "memory_bank")?.id;
      const registryId = resources.find(({ kind }) => kind === "skill_registry")?.id;
      if (shared.memoryBank) {
        if (!bankId)
          throw new AgentProviderError(
            "provider_unavailable",
            `Tilde returned no shared memory bank for ${slug}`,
            true,
          );
        await persistEnvironment(
          context,
          sharedEnvironment.sharedMemoryBankId,
          bankId,
          "Shared memory bank bound to every agent.",
        );
        deployment.sharedMemoryBankId = bankId;
      }
      if (shared.skillRegistry) {
        if (!registryId)
          throw new AgentProviderError(
            "provider_unavailable",
            `Tilde returned no shared skill registry for ${slug}`,
            true,
          );
        await persistEnvironment(
          context,
          sharedEnvironment.sharedSkillRegistryId,
          registryId,
          "Shared skill registry carrying every agent's curated skills.",
        );
        deployment.sharedSkillRegistryId = registryId;
      }
    }
    const bindings = {
      ...(shared?.connectorsMcpServer && deployment.sharedConnectorsMcpServerId
        ? { personal_tool_mcp_server_instance_id: deployment.sharedConnectorsMcpServerId }
        : {}),
      ...(shared?.memoryBank && deployment.kind === "subagent" && deployment.sharedMemoryBankId
        ? {
            memory_bank_ids: [
              deployment.sharedMemoryBankId,
              ...(shared.memoryBank.additionalBankIds ?? []),
            ],
          }
        : {}),
    };
    if (!synthesisOnly && Object.keys(bindings).length > 0)
      await this.#generated(`bind shared resources to "${slug}"`, (signal) =>
        chatkitUpdateAgent({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: slug },
          body: bindings,
          signal,
        }),
      );
    const resolvePermissions = this.#options.permissions;
    if (!resolvePermissions) return;
    // Tilde records which user owns every provisioned bundle, so a hosted bootstrap that never
    // learned the owner's user ID can still narrow reach to the owner.
    const ownerUserId =
      context.environment[sharedEnvironment.ownerUserId]?.trim() ||
      operation.owner_user_id.trim() ||
      undefined;
    const permissions = resolvePermissions({
      id: slug,
      kind: deployment.kind,
      subagentIds: deployment.subagentIds,
      ownerUserId,
    });
    if (!permissions) return;
    await this.#generated(`set permissions for "${slug}"`, (signal) =>
      chatkitSetAgentPermissions({
        client: this.#api,
        path: { team_id: this.#teamId, agent_id: slug },
        body: permissions,
        signal,
      }),
    );
  }

  async #persistAgentSecrets(
    context: DeploymentContext,
    slug: string,
    prefix: string,
    createdSecrets: { apiKey: string; webhookSigningKey: string } | undefined,
  ): Promise<void> {
    const apiKeyName = `${prefix}_API_KEY`;
    const webhookKeyName = `${prefix}_WEBHOOK_SIGNING_KEY`;
    if (createdSecrets) {
      await persistSecret(
        context,
        apiKeyName,
        createdSecrets.apiKey,
        `Tilde endpoint API key for ${slug}.`,
      );
      await persistSecret(
        context,
        webhookKeyName,
        createdSecrets.webhookSigningKey,
        `Tilde webhook signing key for ${slug}.`,
      );
    }
  }

  /**
   * Tilde resolves ChatKit workspace sessions through the channel whose default agent matches the
   * requested agent, so every authored agent needs its own channel. The primary agent keeps the
   * original shared channel ID.
   */
  async #ensureChatKitWorkspaceChannel(
    slug: string,
    defaultAgentId: string,
    kind: "primary" | "subagent",
  ): Promise<void> {
    const channelId =
      kind === "primary" ? chatKitRealtimeChannelId : `${chatKitRealtimeChannelId}-${slug}`;
    let nextPageToken: string | undefined;
    let existing: JsonRecord | undefined;
    do {
      const response = await this.#generated("list ChatKit workspace chat channels", (signal) =>
        chatkitListChatProviders({
          client: this.#api,
          path: { team_id: this.#teamId },
          query: { page_size: 100, next_page_token: nextPageToken },
          signal,
        }),
      );
      const page = response as { items?: JsonRecord[]; next_page_token?: string | null };
      existing = page.items?.find((channel) => channel.id === channelId);
      if (existing) break;
      nextPageToken = page.next_page_token ?? undefined;
    } while (nextPageToken);

    if (!existing) {
      await this.#generated(`create the ChatKit workspace channel for "${slug}"`, (signal) =>
        chatkitRegisterVercelUiChatProvider({
          client: this.#api,
          path: { team_id: this.#teamId },
          body: {
            id: channelId,
            display_name:
              kind === "primary"
                ? "OpenBot ChatKit workspace"
                : `OpenBot ChatKit workspace: ${slug}`,
            default_agent_inbox_id: defaultAgentId,
          },
          signal,
        }),
      );
      return;
    }
    const configuration = jsonRecord(existing.configuration);
    if (configuration?.default_agent_inbox_id === defaultAgentId) return;
    await this.#generated(`repoint the ChatKit workspace channel for "${slug}"`, (signal) =>
      chatkitUpdateChatProvider({
        client: this.#api,
        path: { team_id: this.#teamId, channel_id: channelId },
        body: { default_agent_inbox_id: defaultAgentId },
        signal,
      }),
    );
  }

  async #generated<T>(
    operationName: string,
    operation: (signal: AbortSignal) => Promise<{ data?: T; error?: unknown; response?: Response }>,
  ): Promise<T> {
    try {
      const result = await operation(AbortSignal.timeout(30_000));
      if (result.error !== undefined) {
        const status = result.response?.status;
        throw new AgentProviderError(
          agentErrorCode(status),
          `Unable to ${operationName}: ${tildeHttpErrorMessage(
            result.error,
            result.response,
            "Tilde API request failed",
          )}`,
          !status || status >= 500,
        );
      }
      return result.data as T;
    } catch (error) {
      if (error instanceof AgentProviderError) throw error;
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new AgentProviderError("deadline_exceeded", "Tilde request timed out", true);
      }
      const status = tildeErrorStatus(error);
      throw new AgentProviderError(
        agentErrorCode(status),
        `Unable to ${operationName}: ${tildeHttpErrorMessage(error, undefined)}`,
        !status || status >= 500,
      );
    }
  }

  /** Like `#generated`, but a 404 yields `undefined` so reconciliation can create the resource. */
  async #generatedOptional<T>(
    operationName: string,
    operation: (signal: AbortSignal) => Promise<{ data?: T; error?: unknown; response?: Response }>,
  ): Promise<T | undefined> {
    try {
      return await this.#generated(operationName, operation);
    } catch (error) {
      if (error instanceof AgentProviderError && error.code === "not_found") return undefined;
      throw error;
    }
  }
}

/** Locates the primary agent directory from either a primary or a `subagents/<id>` context. */
function agentLayout(
  context: DeploymentContext,
  kind: "primary" | "subagent",
): { primaryDirectory: string } {
  const { path } = requireAgent(context);
  if (kind === "primary") return { primaryDirectory: path };
  const parent = dirname(path);
  return { primaryDirectory: basename(parent) === "subagents" ? dirname(parent) : path };
}

async function authoredSubagentIds(primaryDirectory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(resolve(primaryDirectory, "subagents"), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory() && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

/** Return whether Tilde reported the one known worker checkpoint that can heal while polling. */
function isRetryableProvisioningError(errorMessage: string | null | undefined): boolean {
  const message = errorMessage?.trim().toLowerCase();
  const checkpoint = "memory bindings are still synchronizing";
  return message === checkpoint || message === `service unavailable: ${checkpoint}`;
}

function requireAgent(context: DeploymentContext): { id: string; path: string } {
  if (!context.agentId || !context.agentPath)
    throw new AgentProviderError(
      "invalid_configuration",
      "The agent lifecycle requires an agent ID and absolute path",
    );
  return { id: context.agentId, path: context.agentPath };
}

function endpointValue(endpointUrl: URL): string {
  return endpointUrl.toString();
}

function personalToolFederationMode(
  environment: Record<string, string | undefined>,
): UserToolFederationMode {
  const value = environment.OPENBOT_PERSONAL_TOOL_FEDERATION_MODE?.trim().toLowerCase();
  if (value === "all") return UserToolFederationMode.ALL;
  if (value === "selected") return UserToolFederationMode.SELECTED;
  return UserToolFederationMode.NONE;
}

function automaticMemoryMode(
  environment: Record<string, string | undefined>,
  agentPrefix: string,
): ChatKitAutomaticMemoryMode {
  const value = (
    environment[`${agentPrefix}_AUTOMATIC_MEMORY_MODE`] ?? environment.OPENBOT_AUTOMATIC_MEMORY_MODE
  )
    ?.trim()
    .toLowerCase();
  if (!value || value === "none") return ChatKitAutomaticMemoryMode.NONE;
  if (value === "personal") return ChatKitAutomaticMemoryMode.PERSONAL;
  if (value === "personal_plus_agent") return ChatKitAutomaticMemoryMode.PERSONAL_PLUS_AGENT;
  if (value === "team") return ChatKitAutomaticMemoryMode.TEAM;
  throw new AgentProviderError(
    "invalid_configuration",
    "OPENBOT_AUTOMATIC_MEMORY_MODE must be none, personal, personal_plus_agent, or team",
  );
}

function jsonRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function agentErrorCode(status: number | undefined): AgentProviderError["code"] {
  switch (status) {
    case 400:
      return "invalid_request";
    case 404:
      return "not_found";
    case 401:
    case 403:
      return "permission_denied";
    default:
      return "provider_unavailable";
  }
}
