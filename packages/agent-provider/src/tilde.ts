import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  DeploymentContext,
  DeploymentPlan,
  DeploymentResult,
} from "@tryopenbot/runtime-provider";
import { TildePlatform, type TildePlatformConfig } from "@tryopenbot/platform-integrations";
import {
  tildeErrorMessage,
  tildeErrorStatus,
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
    });
    this.#teamId = config.teamId;
  }

  async #plan(context: DeploymentContext): Promise<DeploymentPlan> {
    const agents = await discoverAgentSlugs(context.repositoryRoot);
    return {
      summary: `Reconcile ${agents.length} authored agent${agents.length === 1 ? "" : "s"} with Tilde`,
      steps: [
        "Create missing ChatKit agents",
        "Reconcile Vercel AI SDK endpoint URLs and enabled status",
        context.target === "development"
          ? "Enable Tilde local-runtime tunneling"
          : "Use the deployed public agent-service URL",
      ],
    };
  }

  async #deploy(context: DeploymentContext): Promise<DeploymentResult | void> {
    const slugs = await discoverAgentSlugs(context.repositoryRoot);
    const origin = context.inputs.require("agent-service.origin");
    const localRunningEndpoint = context.target === "development";
    const environmentVariables: Record<string, string> = {};
    const secrets: Record<string, string> = {};
    const currentPrefixes = new Set(
      slugs.map((slug) => `AGENT_${slug.replaceAll("-", "_").toUpperCase()}`),
    );
    const environmentVariableRemovals: string[] = [];
    const secretRemovals: string[] = [];

    for (const [name, id] of Object.entries(context.environment)) {
      const match = /^((?:AGENT_[A-Z0-9_]+))_AGENT_ID$/.exec(name);
      const prefix = match?.[1];
      if (!prefix || !id || currentPrefixes.has(prefix)) continue;
      const existing = await this.#getAgentOrUndefined(id);
      if (existing) await this.#removeAgentEndpoint(existing.id);
      for (const key of [`${prefix}_AGENT_ID`, `${prefix}_PROVIDER_ID`]) {
        if (context.environment[key] || context.inputs.environmentVariables()[key])
          environmentVariableRemovals.push(key);
      }
      for (const key of [`${prefix}_API_KEY`, `${prefix}_WEBHOOK_SIGNING_KEY`]) {
        if (context.environment[key] || context.inputs.secrets()[key]) secretRemovals.push(key);
      }
    }

    for (const slug of slugs) {
      const prefix = `AGENT_${slug.replaceAll("-", "_").toUpperCase()}`;
      const apiKeyName = `${prefix}_API_KEY`;
      const webhookKeyName = `${prefix}_WEBHOOK_SIGNING_KEY`;
      const endpointUrl = new URL(`/api/agents/${slug}`, `${origin}/`);
      const hasCredentials =
        Boolean(context.inputs.secrets()[apiKeyName] || context.environment[apiKeyName]) &&
        Boolean(context.inputs.secrets()[webhookKeyName] || context.environment[webhookKeyName]);
      let agent = await this.#getAgentOrUndefined(slug);

      // Tilde only returns endpoint credentials at creation. Replace an unrecoverable registration
      // so repeated lifecycle runs converge instead of leaving an unusable endpoint behind.
      if (agent && (!hasCredentials || !isVercelAiSdkProvider(agent.providerId))) {
        await this.#removeAgentEndpoint(agent.id);
        agent = undefined;
      }

      if (!agent) {
        const response = await this.#generated((signal) =>
          chatkitRegisterHttpVercelAiSdkAgent({
            client: this.#api,
            path: { team_id: this.#teamId },
            body: {
              id: slug,
              display_name: slug,
              endpoint_url: endpointValue(endpointUrl, localRunningEndpoint),
              local_running_endpoint: localRunningEndpoint,
              streaming: true,
              timeout_ms: 300_000,
            },
            signal,
          }),
        );
        agent = agentResource(response.agent as JsonRecord);
        secrets[apiKeyName] = response.api_key;
        secrets[webhookKeyName] = response.webhook_signing_key;
      } else {
        agent = agentResource(
          (await this.#generated((signal) =>
            chatkitUpdateAgent({
              client: this.#api,
              path: { team_id: this.#teamId, agent_id: slug },
              body: {
                display_name: slug,
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
        (await this.#generated((signal) =>
          chatkitSetAgentStatus({
            client: this.#api,
            path: { team_id: this.#teamId, agent_id: agent!.id },
            body: { status: InboxStatus.ENABLED },
            signal,
          }),
        )) as JsonRecord,
      );
      environmentVariables[`${prefix}_AGENT_ID`] = agent.id;
      environmentVariables[`${prefix}_PROVIDER_ID`] = agent.providerId;
    }

    return {
      environmentVariables,
      ...(Object.keys(secrets).length ? { secrets } : {}),
      ...(environmentVariableRemovals.length ? { environmentVariableRemovals } : {}),
      ...(secretRemovals.length ? { secretRemovals } : {}),
    };
  }

  async #getAgentOrUndefined(id: string): Promise<AgentResource | undefined> {
    try {
      return agentResource(
        (await this.#generated((signal) =>
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
      await this.#generated((signal) =>
        chatkitUpdateAgent({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: id },
          body: { endpoint_url: null, local_running_endpoint: false },
          signal,
        }),
      );
      await this.#generated((signal) =>
        chatkitSetAgentStatus({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: id },
          body: { status: InboxStatus.DISABLED },
          signal,
        }),
      );
      await this.#generated((signal) =>
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
    operation: (signal: AbortSignal) => Promise<{ data?: T; error?: unknown; response?: Response }>,
  ): Promise<T> {
    try {
      const result = await operation(AbortSignal.timeout(30_000));
      if (result.error !== undefined) {
        const status = result.response?.status;
        throw new AgentProviderError(
          agentErrorCode(status),
          tildeErrorMessage(result.error, "Tilde API request failed"),
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
        error instanceof Error ? error.message : "Tilde request failed",
        !status || status >= 500,
      );
    }
  }
}

async function discoverAgentSlugs(repositoryRoot: string): Promise<string[]> {
  const root = resolve(repositoryRoot, "configuration/agents");
  const entries = await readdir(root, { withFileTypes: true });
  const slugs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) continue;
    const entrypoint = resolve(root, entry.name, "agent.ts");
    let metadata;
    try {
      metadata = await stat(entrypoint);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new Error(`Agent source entrypoint is missing: ${entrypoint}`);
      throw error;
    }
    if (!metadata.isFile()) throw new Error(`Agent source entrypoint is not a file: ${entrypoint}`);
    slugs.push(entry.name);
  }
  return slugs.sort();
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
