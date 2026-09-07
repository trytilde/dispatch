import type { ProviderJson, ProviderObject, ProviderSchema } from "../chatkit-provider/types";
import type { NormalizedConfig } from "../config";
import { requestJson } from "../internal/fetch-client";
import { pathWithParams, teamPath } from "../internal/paths";

const BASE = "/api/v1/team/{team_id}/chatkit/custom-providers";
export type CustomChatKitProvider = {
  id: string;
  orgId: string;
  teamId: string;
  displayName: string;
  discoveryUrl: string;
  enabled: boolean;
  localRunningEndpoint: boolean;
  revision: number;
  manifest: ProviderObject | null;
  lastDiscoveryError: string | null;
  lastDiscoveryAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type CustomChatKitConnection = {
  setupId: string;
  id: string;
  orgId: string;
  teamId: string;
  definitionId: string;
  displayName: string;
  defaultAgentInboxId: string | null;
  enabled: boolean;
  status: string;
  configuration: ProviderObject;
  toolGroupInstanceId: string | null;
  toolkitDiscoveryUrl: string | null;
};
type WireConnection = {
  setup_id: string;
  id: string;
  org_id: string;
  team_id: string;
  definition_id: string;
  display_name: string;
  default_agent_inbox_id: string | null;
  enabled: boolean;
  status: string;
  configuration: ProviderObject;
  tool_group_instance_id: string | null;
  toolkit_discovery_url: string | null;
};
function connection(raw: WireConnection): CustomChatKitConnection {
  return {
    setupId: raw.setup_id,
    id: raw.id,
    orgId: raw.org_id,
    teamId: raw.team_id,
    definitionId: raw.definition_id,
    displayName: raw.display_name,
    defaultAgentInboxId: raw.default_agent_inbox_id,
    enabled: raw.enabled,
    status: raw.status,
    configuration: raw.configuration,
    toolGroupInstanceId: raw.tool_group_instance_id,
    toolkitDiscoveryUrl: raw.toolkit_discovery_url,
  };
}
/** Generic setup actions retain the server's schema so existing setup renderers can consume them. */
export type CustomChatKitSetup = {
  setupId: string | null;
  resource: ProviderObject | null;
  nextAction: import("../generated/schema").components["schemas"]["ProviderSetupNextAction"];
  /** May contain one-time secrets. Do not log or persist in shared application state. */
  outputs: ProviderObject | null;
};
type WireSetup = {
  setup_id: string | null;
  resource: ProviderObject | null;
  next_action: CustomChatKitSetup["nextAction"];
  outputs: ProviderObject | null;
};
function setup(raw: WireSetup): CustomChatKitSetup {
  return {
    setupId: raw.setup_id,
    resource: raw.resource,
    nextAction: raw.next_action,
    outputs: raw.outputs,
  };
}
export type CustomChatKitWork = {
  workId: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  nextAttemptAt: string;
};
export type CustomProviderInput = {
  displayName: string;
  discoveryUrl: string;
  localRunningEndpoint?: boolean;
};
type WireProvider = {
  id: string;
  org_id: string;
  team_id: string;
  display_name: string;
  discovery_url: string;
  enabled: boolean;
  local_running_endpoint: boolean;
  revision: number;
  manifest: ProviderObject | null;
  last_discovery_error: string | null;
  last_discovery_at: string | null;
  created_at: string;
  updated_at: string;
};
function provider(raw: WireProvider): CustomChatKitProvider {
  return {
    id: raw.id,
    orgId: raw.org_id,
    teamId: raw.team_id,
    displayName: raw.display_name,
    discoveryUrl: raw.discovery_url,
    enabled: raw.enabled,
    localRunningEndpoint: raw.local_running_endpoint,
    revision: raw.revision,
    manifest: raw.manifest,
    lastDiscoveryError: raw.last_discovery_error,
    lastDiscoveryAt: raw.last_discovery_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}
function inputBody(input: CustomProviderInput): ProviderObject {
  return {
    display_name: input.displayName,
    discovery_url: input.discoveryUrl,
    local_running_endpoint: input.localRunningEndpoint ?? false,
  };
}

/** Reusable backend definitions. Configured connections use the generic setup flow. */
export class CustomChatKitProvidersClient {
  constructor(private readonly config: NormalizedConfig) {}
  private path(id?: string, suffix = ""): string {
    return teamPath(this.config, BASE) + (id ? `/${encodeURIComponent(id)}` : "") + suffix;
  }
  async create(
    input: CustomProviderInput,
  ): Promise<{ provider: CustomChatKitProvider; signingKey: string }> {
    const raw = await requestJson<{
      provider: WireProvider;
      signing_key: string;
    }>(this.config, {
      method: "POST",
      path: this.path(),
      body: inputBody(input),
    });
    return { provider: provider(raw.provider), signingKey: raw.signing_key };
  }
  async get(input: { providerId: string }): Promise<CustomChatKitProvider> {
    return provider(
      await requestJson<WireProvider>(this.config, {
        path: this.path(input.providerId),
      }),
    );
  }
  async list(
    input: { pageSize?: number; nextPageToken?: string } = {},
  ): Promise<{ items: CustomChatKitProvider[]; nextPageToken?: string }> {
    const raw = await requestJson<{
      items: WireProvider[];
      next_page_token: string | null;
    }>(this.config, {
      path: this.path(),
      query: {
        page_size: input.pageSize ?? 100,
        next_page_token: input.nextPageToken,
      },
    });
    return {
      items: raw.items.map(provider),
      ...(raw.next_page_token ? { nextPageToken: raw.next_page_token } : {}),
    };
  }
  async update(
    input: CustomProviderInput & { providerId: string },
  ): Promise<CustomChatKitProvider> {
    return provider(
      await requestJson<WireProvider>(this.config, {
        method: "PUT",
        path: this.path(input.providerId),
        body: inputBody(input),
      }),
    );
  }
  async refresh(input: { providerId: string }): Promise<CustomChatKitProvider> {
    return provider(
      await requestJson<WireProvider>(this.config, {
        method: "POST",
        path: this.path(input.providerId, "/refresh"),
      }),
    );
  }
  async setEnabled(input: {
    providerId: string;
    enabled: boolean;
  }): Promise<CustomChatKitProvider> {
    return provider(
      await requestJson<WireProvider>(this.config, {
        method: "POST",
        path: this.path(input.providerId, input.enabled ? "/enable" : "/disable"),
      }),
    );
  }
  async delete(input: { providerId: string }): Promise<void> {
    await requestJson(this.config, {
      method: "DELETE",
      path: this.path(input.providerId),
    });
  }
  async rotateSigningKey(input: {
    providerId: string;
  }): Promise<{ provider: CustomChatKitProvider; signingKey: string }> {
    const raw = await requestJson<{
      provider: WireProvider;
      signing_key: string;
    }>(this.config, {
      method: "POST",
      path: this.path(input.providerId, "/signing-key/rotate"),
    });
    return { provider: provider(raw.provider), signingKey: raw.signing_key };
  }
  async getConnection(input: { connectionId: string }): Promise<CustomChatKitConnection> {
    return connection(
      await requestJson<WireConnection>(this.config, {
        path:
          teamPath(this.config, "/api/v1/team/{team_id}/chatkit/custom-connections") +
          `/${encodeURIComponent(input.connectionId)}`,
      }),
    );
  }
  async listConnections(input: {
    providerId: string;
    pageSize?: number;
    nextPageToken?: string;
  }): Promise<{ items: CustomChatKitConnection[]; nextPageToken?: string }> {
    const raw = await requestJson<{
      items: WireConnection[];
      next_page_token?: string;
    }>(this.config, {
      path: this.path(input.providerId, "/connections"),
      query: {
        page_size: input.pageSize ?? 100,
        next_page_token: input.nextPageToken,
      },
    });
    return {
      items: raw.items.map(connection),
      ...(raw.next_page_token ? { nextPageToken: raw.next_page_token } : {}),
    };
  }
  async listConnectionWork(input: {
    connectionId: string;
    pageSize?: number;
    nextPageToken?: string;
  }): Promise<{ items: CustomChatKitWork[]; nextPageToken?: string }> {
    const raw = await requestJson<{
      items: {
        work_id: string;
        kind: string;
        status: string;
        attempts: number;
        last_error: string | null;
        created_at: string;
        next_attempt_at: string;
      }[];
      next_page_token?: string;
    }>(this.config, {
      path: `${teamPath(this.config, "/api/v1/team/{team_id}/chatkit/custom-connections")}/${encodeURIComponent(input.connectionId)}/work`,
      query: {
        page_size: input.pageSize ?? 100,
        next_page_token: input.nextPageToken,
      },
    });
    return {
      items: raw.items.map((row) => ({
        workId: row.work_id,
        kind: row.kind,
        status: row.status,
        attempts: row.attempts,
        lastError: row.last_error,
        createdAt: row.created_at,
        nextAttemptAt: row.next_attempt_at,
      })),
      ...(raw.next_page_token ? { nextPageToken: raw.next_page_token } : {}),
    };
  }
  async retryConnectionWork(input: { connectionId: string; workId: string }): Promise<void> {
    await requestJson(this.config, {
      method: "POST",
      path: `${teamPath(this.config, "/api/v1/team/{team_id}/chatkit/custom-connections")}/${encodeURIComponent(input.connectionId)}/work/retry`,
      body: { work_id: input.workId },
    });
  }
  async rotateConnectionCredentials(input: {
    connectionId: string;
  }): Promise<{ runtimeToken: string; backendNotified: boolean }> {
    const raw = await requestJson<{
      runtime_token: string;
      backend_notified: boolean;
    }>(this.config, {
      method: "POST",
      path:
        teamPath(this.config, "/api/v1/team/{team_id}/chatkit/custom-connections") +
        `/${encodeURIComponent(input.connectionId)}/runtime-token/rotate`,
    });
    return {
      runtimeToken: raw.runtime_token,
      backendNotified: raw.backend_notified,
    };
  }
  async startConnection(input: {
    providerId: string;
    displayName: string;
    defaultAgentId?: string;
    authMethodId?: string;
    formValues?: ProviderObject;
    returnUrl?: string;
  }): Promise<CustomChatKitSetup> {
    return setup(
      await requestJson<WireSetup>(this.config, {
        method: "POST",
        path: teamPath(this.config, "/api/v1/team/{team_id}/provider-setup/start"),
        body: {
          domain: "chatkit",
          provider_id: input.providerId,
          auth_method_id: input.authMethodId ?? null,
          form_values: {
            ...input.formValues,
            displayName: input.displayName,
            defaultAgentId: input.defaultAgentId ?? null,
          },
          return_url: input.returnUrl ?? null,
        },
      }),
    );
  }
  async resumeConnection(input: {
    setupId: string;
    input: ProviderObject;
    returnUrl?: string;
  }): Promise<CustomChatKitSetup> {
    return setup(
      await requestJson<WireSetup>(this.config, {
        method: "POST",
        path: pathWithParams(
          teamPath(this.config, "/api/v1/team/{team_id}/provider-setup/{setup_id}/resume"),
          { setup_id: input.setupId },
        ),
        body: { input: input.input, return_url: input.returnUrl ?? null },
      }),
    );
  }
}

export type BoundProviderTool = {
  name: string;
  description: string;
  inputSchema: ProviderSchema;
  outputSchema: ProviderSchema;
  readOnly: boolean;
  /** Keep the model's stable tool-call ID across retries; coordinates are server-bound. */
  execute(input: ProviderObject, execution: { toolCallId: string }): Promise<ProviderJson>;
};

/** Discover tools with immutable bindings to the authenticated agent's active turn. */
export async function sessionProviderTools(
  config: NormalizedConfig,
  input: { sessionId: string },
): Promise<BoundProviderTool[]> {
  const base = pathWithParams(
    teamPath(config, "/api/v1/team/{team_id}/chatkit/sessions/{session_id}"),
    { session_id: input.sessionId },
  );
  const raw = await requestJson<{
    tools: {
      name: string;
      description: string;
      input_schema: ProviderSchema;
      output_schema: ProviderSchema;
      read_only: boolean;
    }[];
    context: ProviderObject | null;
  }>(config, { path: `${base}/provider-tools` });
  const context = raw.context;
  if (!context) return [];
  return raw.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema,
    outputSchema: tool.output_schema,
    readOnly: tool.read_only,
    execute: async (arguments_: ProviderObject, execution: { toolCallId: string }) => {
      if (!execution.toolCallId)
        throw new TypeError("toolCallId is required for session tool execution");
      const binding = {
        agent_inbox_instance_id: context.agent_inbox_instance_id ?? null,
        target_inbox_instance_id: context.target_inbox_instance_id ?? null,
        trigger_message_id: context.trigger_message_id ?? null,
        tool_call_id: execution.toolCallId,
      };
      const request = {
        method: "POST" as const,
        path: `${base}/tools/${encodeURIComponent(tool.name)}`,
        body:
          tool.name === "sendMessage"
            ? { ...arguments_, ...binding }
            : { ...binding, input: arguments_ },
      };
      if (tool.name === "sendMessage") return requestJson<ProviderJson>(config, request);
      return (await requestJson<{ result: ProviderJson }>(config, request)).result;
    },
  }));
}
