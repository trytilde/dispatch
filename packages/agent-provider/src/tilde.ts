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
} from "./core.js";
import { AgentProviderError, pageSize, providerSignal } from "./core.js";
import { TildePlatform, type TildePlatformConfig } from "@tryopenbot/platform-integrations";
import {
  tildeErrorMessage,
  tildeErrorStatus,
} from "@tryopenbot/platform-integrations/tilde/errors";
import type { Client } from "@trytilde/harness-sdk";
import {
  chatkitDeleteAgent,
  chatkitGetAgent,
  chatkitMissionControlAgentSessions,
  chatkitMissionControlCreateSession,
  chatkitMissionControlInterruptSession,
  chatkitMissionControlMarkThreadUnread,
  chatkitMissionControlMessages,
  chatkitMissionControlRenameThread,
  chatkitMissionControlSendMessage,
  chatkitMissionControlSidebar,
  chatkitSetAgentStatus,
  chatkitUpdateAgent,
  createTildeApiClient,
  InboxStatus,
  type TildeApiClient,
} from "@trytilde/harness-sdk/api";

export interface TildeAgentProviderConfig extends TildePlatformConfig {}

type JsonRecord = Record<string, unknown>;

export class TildeAgentProvider implements AgentProvider {
  readonly platform: TildePlatform;
  readonly platforms: readonly TildePlatform[];
  readonly #api: TildeApiClient;
  readonly #client: Client;
  readonly #teamId: string;

  constructor(platformOrConfig: TildePlatform | TildeAgentProviderConfig) {
    this.platform =
      platformOrConfig instanceof TildePlatform
        ? platformOrConfig
        : new TildePlatform(platformOrConfig);
    this.platforms = [this.platform];
    const config = this.platform.connection();
    const { baseUrl } = config;
    this.#api = createTildeApiClient({
      baseUrl,
      apiKey: config.apiKey,
      orgId: config.orgId,
    });
    this.#client = this.platform.client();
    this.#teamId = config.teamId;
  }

  async listAgents(
    request: ListAgentsRequest,
    context: AgentProviderCallContext,
  ): Promise<Page<Agent>> {
    const response = await this.#generated(context, (signal) =>
      chatkitMissionControlSidebar({
        client: this.#api,
        path: { team_id: this.#teamId },
        query: {
          agent_page_size: pageSize(request.pageSize, 50),
          agent_next_page_token: request.nextPageToken,
          session_page_size: 1,
          agent_sort: request.sort ?? "updated_at",
          session_sort: "updated_at",
          q: request.query,
        },
        signal,
      }),
    );
    return page(response, (value) => agentRecord(value));
  }

  async getAgent(id: string, context: AgentProviderCallContext): Promise<Agent> {
    const response = await this.#generated(context, (signal) =>
      chatkitGetAgent({
        client: this.#api,
        path: { team_id: this.#teamId, agent_id: id },
        signal,
      }),
    );
    return agentRecord(response);
  }

  async registerAgent(
    request: RegisterAgentRequest,
    context: AgentProviderCallContext,
  ): Promise<RegisteredAgent> {
    const response = await this.#call(context, () =>
      this.#client.chatkit.registerHttpVercelAiSdkAgent({
        ...(request.id ? { id: request.id } : {}),
        displayName: request.displayName,
        endpointUrl: request.endpointUrl.toString(),
        streaming: request.streaming ?? true,
        timeoutMs: request.timeoutMs ?? 300_000,
      }),
    );
    return {
      agent: agentRecord(response.agent),
      credentials: {
        apiKey: response.apiKey,
        webhookSigningKey: response.webhookSigningKey,
      },
    };
  }

  async updateAgent(
    id: string,
    request: UpdateAgentRequest,
    context: AgentProviderCallContext,
  ): Promise<Agent> {
    let agent: Agent | undefined;
    if (request.displayName !== undefined || request.endpointUrl !== undefined) {
      agent = agentRecord(
        await this.#generated(context, (signal) =>
          chatkitUpdateAgent({
            client: this.#api,
            path: { team_id: this.#teamId, agent_id: id },
            body: {
              ...(request.displayName !== undefined ? { display_name: request.displayName } : {}),
              ...(request.endpointUrl !== undefined
                ? { endpoint_url: request.endpointUrl.toString() }
                : {}),
            },
            signal,
          }),
        ),
      );
    }
    if (request.enabled !== undefined) {
      agent = agentRecord(
        await this.#generated(context, (signal) =>
          chatkitSetAgentStatus({
            client: this.#api,
            path: { team_id: this.#teamId, agent_id: id },
            body: { status: request.enabled ? InboxStatus.ENABLED : InboxStatus.DISABLED },
            signal,
          }),
        ),
      );
    }
    return agent ?? this.getAgent(id, context);
  }

  async unregisterAgent(id: string, context: AgentProviderCallContext): Promise<void> {
    await this.#generated(context, (signal) =>
      chatkitDeleteAgent({
        client: this.#api,
        path: { team_id: this.#teamId, agent_id: id },
        signal,
      }),
    );
  }

  async listSessionGroups(
    request: ListSessionGroupsRequest,
    context: AgentProviderCallContext,
  ): Promise<Page<AgentSessionGroup>> {
    const response = await this.#generated(context, (signal) =>
      chatkitMissionControlSidebar({
        client: this.#api,
        path: { team_id: this.#teamId },
        query: {
          agent_page_size: pageSize(request.pageSize, 50),
          agent_next_page_token: request.nextPageToken,
          session_page_size: pageSize(request.sessionsPerAgent, 8, 50),
          agent_sort: request.sort ?? "updated_at",
          session_sort: request.sessionSort ?? "updated_at",
          q: request.query,
        },
        signal,
      }),
    );
    return page(response, sessionGroup);
  }

  async listSessions(
    request: ListSessionsRequest,
    context: AgentProviderCallContext,
  ): Promise<Page<AgentSession>> {
    if (request.agentId) {
      const agentId = request.agentId;
      const response = await this.#generated(context, (signal) =>
        chatkitMissionControlAgentSessions({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: agentId },
          query: {
            page_size: pageSize(request.pageSize, 20),
            next_page_token: request.nextPageToken,
            session_sort: request.sort ?? "updated_at",
            q: request.query,
          },
          signal,
        }),
      );
      return page(response, (value) => sessionRecord(value, agentId));
    }

    if (request.nextPageToken) {
      throw new AgentProviderError(
        "not_supported",
        "Tilde does not expose a global session continuation token",
      );
    }
    const limit = pageSize(request.pageSize, 50);
    const groups = await this.listSessionGroups(
      {
        pageSize: 100,
        sessionsPerAgent: 50,
        sort: "updated_at",
        sessionSort: request.sort ?? "updated_at",
        ...(request.query ? { query: request.query } : {}),
      },
      context,
    );
    const items = groups.items
      .flatMap((group) => group.sessions.items)
      .sort((left, right) => sessionTime(right, request.sort) - sessionTime(left, request.sort))
      .slice(0, limit);
    return { items };
  }

  async createSession(
    agentId: string,
    title: string | undefined,
    context: AgentProviderCallContext,
  ): Promise<AgentSession> {
    const response = await this.#generated(context, (signal) =>
      chatkitMissionControlCreateSession({
        client: this.#api,
        path: { team_id: this.#teamId, agent_id: agentId },
        body: { title: title ?? null },
        signal,
      }),
    );
    return sessionRecord(response.session, agentId);
  }

  async renameSession(
    sessionId: string,
    title: string,
    context: AgentProviderCallContext,
  ): Promise<AgentSession> {
    const response = await this.#generated(context, (signal) =>
      chatkitMissionControlRenameThread({
        client: this.#api,
        path: { team_id: this.#teamId, session_id: sessionId },
        body: { title },
        signal,
      }),
    );
    return sessionRecord(response, "");
  }

  async markSessionUnread(
    sessionId: string,
    context: AgentProviderCallContext,
  ): Promise<AgentSession> {
    const response = await this.#generated(context, (signal) =>
      chatkitMissionControlMarkThreadUnread({
        client: this.#api,
        path: { team_id: this.#teamId, session_id: sessionId },
        signal,
      }),
    );
    return sessionRecord(response, "");
  }

  async interruptSession(sessionId: string, context: AgentProviderCallContext): Promise<void> {
    await this.#generated(context, (signal) =>
      chatkitMissionControlInterruptSession({
        client: this.#api,
        path: { team_id: this.#teamId, session_id: sessionId },
        signal,
      }),
    );
  }

  async listMessages(
    request: ListMessagesRequest,
    context: AgentProviderCallContext,
  ): Promise<Page<AgentMessage>> {
    const response = await this.#generated(context, (signal) =>
      chatkitMissionControlMessages({
        client: this.#api,
        path: { team_id: this.#teamId, session_id: request.sessionId },
        query: {
          page_size: pageSize(request.pageSize, 50),
          next_page_token: request.nextPageToken,
        },
        signal,
      }),
    );
    return page(response, messageRecord);
  }

  async sendMessage(
    agentId: string,
    sessionId: string,
    text: string,
    context: AgentProviderCallContext,
  ): Promise<Page<AgentMessage>> {
    const response = await this.#generated(context, (signal) =>
      chatkitMissionControlSendMessage({
        client: this.#api,
        path: { team_id: this.#teamId, agent_id: agentId, session_id: sessionId },
        body: { text, attachment_ids: [] },
        signal,
      }),
    );
    return page(response, messageRecord);
  }

  async #generated<T>(
    context: AgentProviderCallContext,
    operation: (signal: AbortSignal) => Promise<{ data?: T; error?: unknown; response?: Response }>,
  ): Promise<T> {
    return this.#call(context, async () => {
      const result = await operation(providerSignal(context));
      if (result.error !== undefined) {
        throw Object.assign(
          new Error(tildeErrorMessage(result.error, "Tilde API request failed")),
          {
            response: result.response,
          },
        );
      }
      return result.data as T;
    });
  }

  async #call<T>(context: AgentProviderCallContext, operation: () => Promise<T>): Promise<T> {
    try {
      providerSignal(context).throwIfAborted();
      return await operation();
    } catch (error) {
      if (error instanceof AgentProviderError) throw error;
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new AgentProviderError("deadline_exceeded", "Tilde request timed out", true);
      }
      const status = tildeErrorStatus(error);
      const code =
        status === 400
          ? "invalid_request"
          : status === 404
            ? "not_found"
            : status === 401 || status === 403
              ? "permission_denied"
              : "provider_unavailable";
      throw new AgentProviderError(
        code,
        error instanceof Error ? error.message : "Tilde request failed",
        !status || status >= 500,
      );
    }
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
  const endpointUrl =
    optionalString(value.endpoint_url) ?? optionalString(configuration.endpoint_url);
  return {
    id,
    displayName:
      optionalString(value.display_name) ?? optionalString(configuration.display_name) ?? id,
    providerId:
      optionalString(value.provider_id) ??
      optionalString(value.inbox_type_id) ??
      "chatkit.http-vercel-ai-sdk",
    status: optionalString(value.status) ?? "unknown",
    hasUiEndpoint:
      typeof value.has_vercel_ui_endpoint === "boolean"
        ? value.has_vercel_ui_endpoint
        : Boolean(endpointUrl),
    ...(endpointUrl ? { endpointUrl } : {}),
    createdAt: dateValue(value.created_at) ?? new Date(0),
    updatedAt: dateValue(value.updated_at) ?? new Date(0),
    ...(dateValue(value.last_user_message_at)
      ? { lastUserMessageAt: dateValue(value.last_user_message_at) }
      : {}),
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
    ...(dateValue(value.last_user_message_at)
      ? { lastUserMessageAt: dateValue(value.last_user_message_at) }
      : {}),
  };
}

function messageRecord(value: JsonRecord): AgentMessage {
  const role =
    value.role === "system" ||
    value.role === "user" ||
    value.role === "assistant" ||
    value.role === "tool"
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

function sessionTime(session: AgentSession, sort: ListSessionsRequest["sort"]): number {
  return (sort === "created_at" ? session.createdAt : session.updatedAt).valueOf();
}

function messageText(value: JsonRecord): string {
  if (typeof value.text === "string") return value.text;
  return arrayValue(value.parts)
    .map((part) => optionalString(asRecord(part).text) ?? "")
    .join("");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
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
