import type {
  ChatAgent,
  ChatMessage,
  ChatProvider,
  ChatProviderCallContext,
  ChatSession,
  ChatSessionGroup,
  ListAgentsRequest,
  ListMessagesRequest,
  ListSessionGroupsRequest,
  ListSessionsRequest,
  Page,
} from "./core.js";
import { ChatProviderError, pageSize, providerSignal } from "./core.js";
import { TildePlatform, type TildePlatformConfig } from "@tryopenbot/platform-integrations";
import {
  tildeErrorMessage,
  tildeErrorStatus,
} from "@tryopenbot/platform-integrations/tilde/errors";
import {
  omitUndefinedProperties,
  undefinedWhenFalsy,
} from "@tryopenbot/platform-integrations/tilde/request";
import {
  chatkitGetAgent,
  chatkitMissionControlAgentSessions,
  chatkitMissionControlCreateSession,
  chatkitMissionControlInterruptSession,
  chatkitMissionControlMarkThreadUnread,
  chatkitMissionControlMessages,
  chatkitMissionControlRenameThread,
  chatkitMissionControlSendMessage,
  chatkitMissionControlSidebar,
  createTildeApiClient,
  type TildeApiClient,
} from "@trytilde/harness-sdk/api";

export interface TildeChatProviderConfig extends TildePlatformConfig {}
type JsonRecord = Record<string, unknown>;

export class TildeChatProvider implements ChatProvider {
  readonly platform: TildePlatform;
  readonly platforms: readonly TildePlatform[];
  readonly #api: TildeApiClient;
  readonly #teamId: string;

  constructor(platformOrConfig: TildePlatform | TildeChatProviderConfig) {
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

  async listAgents(
    request: ListAgentsRequest,
    context: ChatProviderCallContext,
  ): Promise<Page<ChatAgent>> {
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
    return page(response, chatAgent);
  }

  async getAgent(id: string, context: ChatProviderCallContext): Promise<ChatAgent> {
    return chatAgent(
      await this.#generated(context, (signal) =>
        chatkitGetAgent({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: id },
          signal,
        }),
      ),
    );
  }

  async listSessionGroups(
    request: ListSessionGroupsRequest,
    context: ChatProviderCallContext,
  ): Promise<Page<ChatSessionGroup>> {
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
    context: ChatProviderCallContext,
  ): Promise<Page<ChatSession>> {
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
      return page(response, (value) => chatSession(value, agentId));
    }
    if (request.nextPageToken)
      throw new ChatProviderError(
        "not_supported",
        "Tilde does not expose a global session continuation token",
      );
    const limit = pageSize(request.pageSize, 50);
    const groups = await this.listSessionGroups(
      omitUndefinedProperties({
        pageSize: 100,
        sessionsPerAgent: 50,
        sort: "updated_at",
        sessionSort: request.sort ?? "updated_at",
        query: undefinedWhenFalsy(request.query),
      }),
      context,
    );
    return {
      items: groups.items
        .flatMap((group) => group.sessions.items)
        .sort((left, right) => sessionTime(right, request.sort) - sessionTime(left, request.sort))
        .slice(0, limit),
    };
  }

  async createSession(
    agentId: string,
    title: string | undefined,
    context: ChatProviderCallContext,
  ): Promise<ChatSession> {
    const response = await this.#generated(context, (signal) =>
      chatkitMissionControlCreateSession({
        client: this.#api,
        path: { team_id: this.#teamId, agent_id: agentId },
        body: { title: title ?? null },
        signal,
      }),
    );
    return chatSession(response.session, agentId);
  }

  async renameSession(
    sessionId: string,
    title: string,
    context: ChatProviderCallContext,
  ): Promise<ChatSession> {
    return chatSession(
      await this.#generated(context, (signal) =>
        chatkitMissionControlRenameThread({
          client: this.#api,
          path: { team_id: this.#teamId, session_id: sessionId },
          body: { title },
          signal,
        }),
      ),
      "",
    );
  }

  async markSessionUnread(
    sessionId: string,
    context: ChatProviderCallContext,
  ): Promise<ChatSession> {
    return chatSession(
      await this.#generated(context, (signal) =>
        chatkitMissionControlMarkThreadUnread({
          client: this.#api,
          path: { team_id: this.#teamId, session_id: sessionId },
          signal,
        }),
      ),
      "",
    );
  }

  async interruptSession(sessionId: string, context: ChatProviderCallContext): Promise<void> {
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
    context: ChatProviderCallContext,
  ): Promise<Page<ChatMessage>> {
    return page(
      await this.#generated(context, (signal) =>
        chatkitMissionControlMessages({
          client: this.#api,
          path: { team_id: this.#teamId, session_id: request.sessionId },
          query: {
            page_size: pageSize(request.pageSize, 50),
            next_page_token: request.nextPageToken,
          },
          signal,
        }),
      ),
      chatMessage,
    );
  }

  async sendMessage(
    agentId: string,
    sessionId: string,
    text: string,
    context: ChatProviderCallContext,
  ): Promise<Page<ChatMessage>> {
    return page(
      await this.#generated(context, (signal) =>
        chatkitMissionControlSendMessage({
          client: this.#api,
          path: { team_id: this.#teamId, agent_id: agentId, session_id: sessionId },
          body: { text, attachment_ids: [] },
          signal,
        }),
      ),
      chatMessage,
    );
  }

  async #generated<T>(
    context: ChatProviderCallContext,
    operation: (signal: AbortSignal) => Promise<{ data?: T; error?: unknown; response?: Response }>,
  ): Promise<T> {
    try {
      const result = await operation(providerSignal(context));
      if (result.error !== undefined) {
        throw Object.assign(
          new Error(tildeErrorMessage(result.error, "Tilde API request failed")),
          { response: result.response },
        );
      }
      return result.data as T;
    } catch (error) {
      if (error instanceof ChatProviderError) throw error;
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      )
        throw new ChatProviderError("deadline_exceeded", "Tilde request timed out", true);
      const status = tildeErrorStatus(error);
      throw new ChatProviderError(
        chatErrorCode(status),
        error instanceof Error ? error.message : "Tilde request failed",
        !status || status >= 500,
      );
    }
  }
}

function sessionGroup(value: JsonRecord): ChatSessionGroup {
  const agent = chatAgent(value);
  return { agent, sessions: page(record(value.sessions), (item) => chatSession(item, agent.id)) };
}

function chatAgent(value: JsonRecord): ChatAgent {
  const configuration = record(value.configuration);
  const id = requiredString(value.id, "agent identifier");
  const endpointUrl =
    optionalString(value.endpoint_url) ?? optionalString(configuration.endpoint_url);
  return omitUndefinedProperties({
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
    endpointUrl,
    createdAt: dateValue(value.created_at) ?? new Date(0),
    updatedAt: dateValue(value.updated_at) ?? new Date(0),
    lastUserMessageAt: dateValue(value.last_user_message_at),
  });
}

function chatSession(value: JsonRecord, agentId: string): ChatSession {
  return omitUndefinedProperties({
    id: requiredString(value.id, "session identifier"),
    agentId: optionalString(value.agent_id) ?? agentId,
    title: optionalString(value.title),
    unread: value.unread === true,
    createdAt: dateValue(value.created_at) ?? new Date(0),
    updatedAt: dateValue(value.updated_at) ?? new Date(0),
    lastUserMessageAt: dateValue(value.last_user_message_at),
  });
}

function chatMessage(value: JsonRecord): ChatMessage {
  return omitUndefinedProperties({
    id: requiredString(value.id, "message identifier"),
    sessionId: requiredString(value.session_id, "session identifier"),
    role: messageRole(value.role),
    text:
      typeof value.text === "string"
        ? value.text
        : array(value.parts)
            .map((part) => optionalString(record(part).text) ?? "")
            .join(""),
    createdAt: dateValue(value.created_at) ?? new Date(0),
    updatedAt: dateValue(value.updated_at),
  });
}

function page<T>(value: JsonRecord, map: (item: JsonRecord) => T): Page<T> {
  return omitUndefinedProperties({
    items: array(value.items).map((item) => map(record(item))),
    nextPageToken: undefinedWhenFalsy(optionalString(value.next_page_token)),
  });
}

function sessionTime(session: ChatSession, sort: ListSessionsRequest["sort"]): number {
  return sort === "created_at" ? session.createdAt.valueOf() : session.updatedAt.valueOf();
}

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value)
    throw new ChatProviderError("provider_unavailable", `Tilde returned an invalid ${label}`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function dateValue(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function messageRole(value: unknown): ChatMessage["role"] {
  switch (value) {
    case "system":
    case "user":
    case "assistant":
    case "tool":
      return value;
    default:
      return "assistant";
  }
}

function chatErrorCode(status: number | undefined): ChatProviderError["code"] {
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
