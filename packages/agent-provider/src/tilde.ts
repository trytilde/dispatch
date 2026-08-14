import type { DeploymentContext, DeploymentPlan } from "@tryopenbot/runtime-provider";
import { persistEnvironment, persistSecret } from "@tryopenbot/runtime-provider";
import { TildePlatform, type TildePlatformConfig } from "@tryopenbot/platform-integrations";
import {
  tildeErrorStatus,
  tildeHttpErrorMessage,
} from "@tryopenbot/platform-integrations/tilde/errors";
import {
  chatkitDeleteAgent,
  chatkitGetAgent,
  chatkitRegisterHttpVercelAiSdkAgent,
  chatkitSetAgentStatus,
  chatkitUpdateAgent,
  createTildeApiClient,
  InboxStatus,
  type TildeApiClient,
} from "@trytilde/harness-sdk/api";
import type { AgentProvider } from "./core.js";
import { AgentProviderError } from "./core.js";

export interface TildeAgentProviderConfig extends TildePlatformConfig {}

type JsonRecord = Record<string, unknown>;

interface AgentResource {
  id: string;
  providerId: string;
}

/** Idempotently reconciles every authored agent with Tilde ChatKit. */
export class TildeAgentProvider implements AgentProvider {
  readonly platform: TildePlatform;
  readonly platforms: readonly TildePlatform[];
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

  constructor(platformOrConfig: TildePlatform | TildeAgentProviderConfig) {
    this.platform =
      platformOrConfig instanceof TildePlatform
        ? platformOrConfig
        : new TildePlatform(platformOrConfig);
    this.platforms = [this.platform];
    const config = this.platform.connection();
    this.#api = createTildeApiClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      orgId: config.orgId,
      // Keep generated failures as { error, response } so provider errors retain HTTP context.
      throwOnError: false,
    });
    this.#teamId = config.teamId;
  }

  async #plan(context: DeploymentContext): Promise<DeploymentPlan> {
    const agent = requireAgent(context);
    return {
      summary: `Reconcile authored agent ${agent.id} with Tilde`,
      steps: [
        "Create missing ChatKit agents",
        "Reconcile Vercel AI SDK endpoint URLs and enabled status",
        context.target === "development"
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
    const localRunningEndpoint = context.target === "development";
    const prefix = `AGENT_${slug.replaceAll("-", "_").toUpperCase()}`;
    const displayName = context.environment[`${prefix}_NAME`]?.trim() || slug;
    const apiKeyName = `${prefix}_API_KEY`;
    const webhookKeyName = `${prefix}_WEBHOOK_SIGNING_KEY`;
    const endpointUrl = new URL(`/api/agents/${slug}`, `${origin}/`);
    const hasCredentials =
      Boolean(context.environment[apiKeyName]) && Boolean(context.environment[webhookKeyName]);
    let agent = await this.#getAgentOrUndefined(slug);
    let createdSecrets: { apiKey: string; webhookSigningKey: string } | undefined;

    // Tilde only returns endpoint credentials at creation. Replace an unrecoverable registration
    // so repeated lifecycle runs converge instead of leaving an unusable endpoint behind.
    if (agent && (!hasCredentials || !isVercelAiSdkProvider(agent.providerId))) {
      await this.#removeAgentEndpoint(agent.id);
      agent = undefined;
    }

    if (!agent) {
      const response = await this.#generated(`create agent "${slug}"`, (signal) =>
        chatkitRegisterHttpVercelAiSdkAgent({
          client: this.#api,
          path: { team_id: this.#teamId },
          body: {
            id: slug,
            display_name: displayName,
            endpoint_url: endpointValue(endpointUrl, localRunningEndpoint),
            local_running_endpoint: localRunningEndpoint,
            streaming: true,
            timeout_ms: 300_000,
          },
          signal,
        }),
      );
      agent = agentResource(response.agent as JsonRecord);
      createdSecrets = {
        apiKey: response.api_key,
        webhookSigningKey: response.webhook_signing_key,
      };
    } else {
      agent = agentResource(
        (await this.#generated(`update agent "${slug}"`, (signal) =>
          chatkitUpdateAgent({
            client: this.#api,
            path: { team_id: this.#teamId, agent_id: slug },
            body: {
              display_name: displayName,
              endpoint_url: endpointValue(endpointUrl, localRunningEndpoint),
              local_running_endpoint: localRunningEndpoint,
              streaming: true,
              timeout_ms: 300_000,
            },
            signal,
          }),
        )) as JsonRecord,
      );
    }

    agent = agentResource(
      (await this.#generated(`enable agent "${slug}"`, (signal) =>
        chatkitSetAgentStatus({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: agent!.id },
          body: { status: InboxStatus.ENABLED },
          signal,
        }),
      )) as JsonRecord,
    );
    await persistEnvironment(
      context,
      `${prefix}_AGENT_ID`,
      agent.id,
      `Tilde agent ID for ${slug}.`,
    );
    await persistEnvironment(
      context,
      `${prefix}_PROVIDER_ID`,
      agent.providerId,
      `Tilde agent provider ID for ${slug}.`,
    );
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

  async #getAgentOrUndefined(id: string): Promise<AgentResource | undefined> {
    try {
      return agentResource(
        (await this.#generated(`get agent "${id}"`, (signal) =>
          chatkitGetAgent({
            client: this.#api,
            path: { team_id: this.#teamId, agent_id: id },
            signal,
          }),
        )) as JsonRecord,
      );
    } catch (error) {
      if (error instanceof AgentProviderError && error.code === "not_found") return undefined;
      throw error;
    }
  }

  async #removeAgentEndpoint(id: string): Promise<void> {
    try {
      await this.#generated(`clear endpoint for agent "${id}"`, (signal) =>
        chatkitUpdateAgent({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: id },
          body: { endpoint_url: null, local_running_endpoint: false },
          signal,
        }),
      );
      await this.#generated(`disable agent "${id}"`, (signal) =>
        chatkitSetAgentStatus({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: id },
          body: { status: InboxStatus.DISABLED },
          signal,
        }),
      );
      await this.#generated(`delete agent "${id}"`, (signal) =>
        chatkitDeleteAgent({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: id },
          signal,
        }),
      );
    } catch (error) {
      if (error instanceof AgentProviderError && error.code === "not_found") return;
      throw error;
    }
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
}

function requireAgent(context: DeploymentContext): { id: string; path: string } {
  if (!context.agentId || !context.agentPath)
    throw new AgentProviderError(
      "invalid_configuration",
      "The agent lifecycle requires an agent ID and absolute path",
    );
  return { id: context.agentId, path: context.agentPath };
}

function endpointValue(endpointUrl: URL, localRunningEndpoint: boolean): string {
  return localRunningEndpoint
    ? `${endpointUrl.pathname}${endpointUrl.search}`
    : endpointUrl.toString();
}

function agentResource(value: JsonRecord): AgentResource {
  return {
    id: requiredString(value.id, "agent identifier"),
    providerId: optionalString(value.provider_id) ?? "chatkit.http-vercel-ai-sdk",
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value)
    throw new AgentProviderError("provider_unavailable", `Tilde returned an invalid ${label}`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function isVercelAiSdkProvider(providerId: string): boolean {
  return providerId === "http-vercel-ai-sdk" || providerId.endsWith(".http-vercel-ai-sdk");
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
