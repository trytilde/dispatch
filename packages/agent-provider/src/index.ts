import type {
  Agent,
  AgentMessage,
  AgentProvider,
  AgentProviderCallContext,
  AgentSession,
  AgentSessionGroup,
  ListAgentsRequest,
  ListMessagesRequest,
  ListSessionGroupsRequest,
  ListSessionsRequest,
  Page,
  RegisterAgentRequest,
  RegisteredAgent,
  UpdateAgentRequest,
} from "@openbot/agent-provider-core";
import { AgentProviderError, pageSize, providerSignal } from "@openbot/agent-provider-core";

export interface TildeAgentProviderConfig {
  apiKey: string;
  orgId: string;
  teamId: string;
  baseUrl?: string;
}

type JsonRecord = Record<string, unknown>;

export class TildeAgentProvider implements AgentProvider {
  readonly descriptor = {
    id: "tilde",
    version: "1.0.0",
    displayName: "Tilde",
    capabilities: [
      "agents:list",
      "agents:get",
      "agents:register",
      "agents:update",
      "agents:unregister",
      "sessions:list",
      "sessions:create",
      "sessions:rename",
      "sessions:mark-unread",
      "sessions:interrupt",
      "messages:list",
      "messages:send",
    ] as const,
  };

  readonly #api: TildeApi;

  constructor(config: TildeAgentProviderConfig) {
    this.#api = new TildeApi(config);
  }

  async health(context: AgentProviderCallContext) {
    try {
      await this.verify(context);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : "Tilde is unavailable" };
    }
  }

  async verify(context: AgentProviderCallContext) {
    await this.#api.request<unknown>("/api/v1/identity/auth/whoami", context);
    return { organizationId: this.#api.orgId, teamId: this.#api.teamId };
  }

  async listAgents(request: ListAgentsRequest, context: AgentProviderCallContext): Promise<Page<Agent>> {
    const query = queryString({
      agent_page_size: pageSize(request.pageSize, 50),
      agent_next_page_token: request.nextPageToken,
      session_page_size: 1,
      agent_sort: request.sort ?? "updated_at",
      session_sort: "updated_at",
      q: request.query,
    });
    const response = await this.#api.request<JsonRecord>(this.#api.teamPath(`/chatkit/mission-control/sidebar?${query}`), context);
    return page(response, (value) => agentRecord(value));
  }

  async getAgent(id: string, context: AgentProviderCallContext): Promise<Agent> {
    return agentRecord(await this.#api.request<JsonRecord>(this.#api.teamPath(`/chatkit/agents/${encodeURIComponent(id)}`), context));
  }

  async registerAgent(request: RegisterAgentRequest, context: AgentProviderCallContext): Promise<RegisteredAgent> {
    const response = await this.#api.request<JsonRecord>(
      this.#api.teamPath("/chatkit/agents/http-vercel-ai-sdk"),
      context,
      {
        method: "POST",
        body: JSON.stringify({
          ...(request.id ? { id: request.id } : {}),
          display_name: request.displayName,
          endpoint_url: request.endpointUrl.toString(),
          local_running_endpoint: false,
          streaming: request.streaming ?? true,
          timeout_ms: request.timeoutMs ?? 300_000,
        }),
      },
    );
    return {
      agent: agentRecord(asRecord(response.agent)),
      credentials: {
        apiKey: stringValue(response.api_key, "API key"),
        webhookSigningKey: stringValue(response.webhook_signing_key, "webhook signing key"),
      },
    };
  }

  async updateAgent(id: string, request: UpdateAgentRequest, context: AgentProviderCallContext): Promise<Agent> {
    let agent: Agent | undefined;
    if (request.displayName !== undefined || request.endpointUrl !== undefined) {
      agent = agentRecord(await this.#api.request<JsonRecord>(
        this.#api.teamPath(`/chatkit/agents/${encodeURIComponent(id)}`),
        context,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(request.displayName !== undefined ? { display_name: request.displayName } : {}),
            ...(request.endpointUrl !== undefined ? { endpoint_url: request.endpointUrl.toString() } : {}),
          }),
        },
      ));
    }
    if (request.enabled !== undefined) {
      agent = agentRecord(await this.#api.request<JsonRecord>(
        this.#api.teamPath(`/chatkit/agents/${encodeURIComponent(id)}/status`),
        context,
        { method: "PATCH", body: JSON.stringify({ status: request.enabled ? "enabled" : "disabled" }) },
      ));
    }
    return agent ?? this.getAgent(id, context);
  }

  async unregisterAgent(id: string, context: AgentProviderCallContext): Promise<void> {
    await this.#api.request<unknown>(
      this.#api.teamPath(`/chatkit/agents/${encodeURIComponent(id)}`),
      context,
      { method: "DELETE" },
    );
  }

  async listSessionGroups(request: ListSessionGroupsRequest, context: AgentProviderCallContext): Promise<Page<AgentSessionGroup>> {
    const query = queryString({
      agent_page_size: pageSize(request.pageSize, 50),
      agent_next_page_token: request.nextPageToken,
      session_page_size: pageSize(request.sessionsPerAgent, 8, 50),
      agent_sort: request.sort ?? "updated_at",
      session_sort: request.sessionSort ?? "updated_at",
      q: request.query,
    });
    const response = await this.#api.request<JsonRecord>(
      this.#api.teamPath(`/chatkit/mission-control/sidebar?${query}`),
      context,
    );
    return page(response, sessionGroup);
  }

  async listSessions(request: ListSessionsRequest, context: AgentProviderCallContext): Promise<Page<AgentSession>> {
    if (request.agentId) {
      const query = queryString({
        page_size: pageSize(request.pageSize, 20),
        next_page_token: request.nextPageToken,
        session_sort: request.sort ?? "updated_at",
        q: request.query,
      });
      const response = await this.#api.request<JsonRecord>(
        this.#api.teamPath(`/chatkit/mission-control/agents/${encodeURIComponent(request.agentId)}/sessions?${query}`),
        context,
      );
      return page(response, (value) => sessionRecord(value, request.agentId as string));
    }

    if (request.nextPageToken) {
      throw new AgentProviderError("not_supported", "Tilde does not expose a global session continuation token");
    }
    const limit = pageSize(request.pageSize, 50);
    const groups = await this.listSessionGroups({
      pageSize: 100,
      sessionsPerAgent: 50,
      sort: "updated_at",
      sessionSort: request.sort ?? "updated_at",
      ...(request.query ? { query: request.query } : {}),
    }, context);
    const items = groups.items
      .flatMap((group) => group.sessions.items)
      .sort((left, right) => sessionTime(right, request.sort) - sessionTime(left, request.sort))
      .slice(0, limit);
    return { items };
  }

  async createSession(agentId: string, title: string | undefined, context: AgentProviderCallContext): Promise<AgentSession> {
    const response = await this.#api.request<JsonRecord>(
      this.#api.teamPath(`/chatkit/mission-control/agents/${encodeURIComponent(agentId)}/sessions`),
      context,
      { method: "POST", body: JSON.stringify({ title: title ?? null }) },
    );
    return sessionRecord(asRecord(response.session), agentId);
  }

  async renameSession(sessionId: string, title: string, context: AgentProviderCallContext): Promise<AgentSession> {
    const response = await this.#api.request<JsonRecord>(
      this.#api.teamPath(`/chatkit/mission-control/sessions/${encodeURIComponent(sessionId)}/rename`),
      context,
      { method: "PATCH", body: JSON.stringify({ title }) },
    );
    return sessionRecord(response, optionalString(response.agent_id) ?? "");
  }

  async markSessionUnread(sessionId: string, context: AgentProviderCallContext): Promise<AgentSession> {
    const response = await this.#api.request<JsonRecord>(
      this.#api.teamPath(`/chatkit/mission-control/sessions/${encodeURIComponent(sessionId)}/mark-unread`),
      context,
      { method: "POST", body: "{}" },
    );
    return sessionRecord(response, optionalString(response.agent_id) ?? "");
  }

  async interruptSession(sessionId: string, context: AgentProviderCallContext): Promise<void> {
    await this.#api.request<unknown>(
      this.#api.teamPath(`/chatkit/mission-control/sessions/${encodeURIComponent(sessionId)}/interrupt`),
      context,
      { method: "POST", body: "{}" },
    );
  }

  async listMessages(request: ListMessagesRequest, context: AgentProviderCallContext): Promise<Page<AgentMessage>> {
    const query = queryString({
      page_size: pageSize(request.pageSize, 50),
      next_page_token: request.nextPageToken,
    });
    const response = await this.#api.request<JsonRecord>(
      this.#api.teamPath(`/chatkit/mission-control/sessions/${encodeURIComponent(request.sessionId)}/messages?${query}`),
      context,
    );
    return page(response, messageRecord);
  }

  async sendMessage(agentId: string, sessionId: string, text: string, context: AgentProviderCallContext): Promise<Page<AgentMessage>> {
    const response = await this.#api.request<JsonRecord>(
      this.#api.teamPath(`/chatkit/mission-control/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/messages`),
      context,
      { method: "POST", body: JSON.stringify({ text, attachment_ids: [] }) },
    );
    return page(response, messageRecord);
  }
}

class TildeApi {
  readonly #config: TildeAgentProviderConfig;

  constructor(config: TildeAgentProviderConfig) {
    this.#config = config;
  }

  get orgId() { return this.#config.orgId; }
  get teamId() { return this.#config.teamId; }

  teamPath(path: string): string {
    return `/api/v1/team/${encodeURIComponent(this.#config.teamId)}${path}`;
  }

  async request<T>(path: string, context: AgentProviderCallContext, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.#config.baseUrl ?? "https://api.trytilde.ai"), {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-api-key": this.#config.apiKey,
          "x-tilde-org-id": this.#config.orgId,
          ...init.headers,
        },
        signal: providerSignal(context),
      });
    } catch (error) {
      if (error instanceof AgentProviderError) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new AgentProviderError("deadline_exceeded", "Tilde request timed out", true);
      }
      throw new AgentProviderError("provider_unavailable", error instanceof Error ? error.message : "Tilde request failed", true);
    }
    if (!response.ok) {
      const detail = await response.text();
      const code = response.status === 400
        ? "invalid_request"
        : response.status === 404
          ? "not_found"
          : response.status === 401 || response.status === 403
            ? "permission_denied"
            : "provider_unavailable";
      throw new AgentProviderError(code, `Tilde API failed (${response.status}): ${detail.slice(0, 300)}`, response.status >= 500);
    }
    if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
    return response.json() as Promise<T>;
  }
}

function sessionGroup(value: JsonRecord): AgentSessionGroup {
  const agent = agentRecord(value);
  const sessions = asRecord(value.sessions);
  return { agent, sessions: page(sessions, (item) => sessionRecord(item, agent.id)) };
}

function agentRecord(value: JsonRecord): Agent {
  const configuration = asRecord(value.configuration);
  const id = stringValue(value.id, "agent identifier");
  const endpointUrl = optionalString(value.endpoint_url) ?? optionalString(configuration.endpoint_url);
  return {
    id,
    displayName: optionalString(value.display_name) ?? optionalString(configuration.display_name) ?? id,
    providerId: optionalString(value.provider_id) ?? optionalString(value.inbox_type_id) ?? "chatkit.http-vercel-ai-sdk",
    status: optionalString(value.status) ?? "unknown",
    hasUiEndpoint: typeof value.has_vercel_ui_endpoint === "boolean" ? value.has_vercel_ui_endpoint : Boolean(endpointUrl),
    ...(endpointUrl ? { endpointUrl } : {}),
    createdAt: dateValue(value.created_at) ?? new Date(0),
    updatedAt: dateValue(value.updated_at) ?? new Date(0),
    ...(dateValue(value.last_user_message_at) ? { lastUserMessageAt: dateValue(value.last_user_message_at) } : {}),
  };
}

function sessionRecord(value: JsonRecord, agentId: string): AgentSession {
  return {
    id: stringValue(value.id, "session identifier"),
    agentId: optionalString(value.agent_id) ?? agentId,
    ...(optionalString(value.title) ? { title: optionalString(value.title) } : {}),
    unread: value.unread === true,
    createdAt: dateValue(value.created_at) ?? new Date(0),
    updatedAt: dateValue(value.updated_at) ?? new Date(0),
    ...(dateValue(value.last_user_message_at) ? { lastUserMessageAt: dateValue(value.last_user_message_at) } : {}),
  };
}

function messageRecord(value: JsonRecord): AgentMessage {
  const role = value.role === "system" || value.role === "user" || value.role === "assistant" || value.role === "tool"
    ? value.role
    : "assistant";
  return {
    id: stringValue(value.id, "message identifier"),
    sessionId: stringValue(value.session_id, "session identifier"),
    role,
    text: messageText(value),
    createdAt: dateValue(value.created_at) ?? new Date(0),
    ...(dateValue(value.updated_at) ? { updatedAt: dateValue(value.updated_at) } : {}),
  };
}

function page<T>(value: JsonRecord, map: (item: JsonRecord) => T): Page<T> {
  const nextPageToken = optionalString(value.next_page_token);
  return {
    items: arrayValue(value.items).map((item) => map(asRecord(item))),
    ...(nextPageToken ? { nextPageToken } : {}),
  };
}

function queryString(values: Readonly<Record<string, string | number | undefined>>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(name, String(value));
  }
  return query.toString();
}

function sessionTime(session: AgentSession, sort: ListSessionsRequest["sort"]): number {
  return (sort === "created_at" ? session.createdAt : session.updatedAt).valueOf();
}

function messageText(value: JsonRecord): string {
  if (typeof value.text === "string") return value.text;
  return arrayValue(value.parts).map((part) => optionalString(asRecord(part).text) ?? "").join("");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new AgentProviderError("provider_unavailable", `Tilde returned an invalid ${label}`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function dateValue(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}
