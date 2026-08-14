import type { DeployableProvider } from "@tryopenbot/runtime-provider";
export type { Deployable } from "@tryopenbot/runtime-provider";

export interface ChatProviderCallContext {
  requestId: string;
  deadline?: Date;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export type ChatProviderErrorCode =
  | "invalid_configuration"
  | "invalid_request"
  | "not_supported"
  | "not_found"
  | "deadline_exceeded"
  | "provider_unavailable"
  | "permission_denied"
  | "internal";

export class ChatProviderError extends Error {
  constructor(
    readonly code: ChatProviderErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ChatProviderError";
  }
}

export interface Page<T> {
  items: readonly T[];
  nextPageToken?: string;
}

export type AgentSortOrder = "updated_at" | "created_at" | "manual";
export type SessionSortOrder = "updated_at" | "created_at";

export interface ChatAgent {
  id: string;
  displayName: string;
  providerId: string;
  status: string;
  hasUiEndpoint: boolean;
  endpointUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  lastUserMessageAt?: Date;
}

export interface ChatSession {
  id: string;
  agentId: string;
  title?: string;
  unread: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUserMessageAt?: Date;
}

export interface ChatSessionGroup {
  agent: ChatAgent;
  sessions: Page<ChatSession>;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "system" | "user" | "assistant" | "tool";
  text: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ListAgentsRequest {
  pageSize?: number;
  nextPageToken?: string;
  sort?: AgentSortOrder;
  query?: string;
}

export interface ListSessionsRequest {
  agentId?: string;
  pageSize?: number;
  nextPageToken?: string;
  sort?: SessionSortOrder;
  query?: string;
}

export interface ListSessionGroupsRequest extends ListAgentsRequest {
  sessionsPerAgent?: number;
  sessionSort?: SessionSortOrder;
}

export interface ListMessagesRequest {
  sessionId: string;
  pageSize?: number;
  nextPageToken?: string;
}

/** Conversation data and mutations consumed by OpenBot application endpoints. */
export interface ChatProvider extends DeployableProvider {
  listAgents(
    request: ListAgentsRequest,
    context: ChatProviderCallContext,
  ): Promise<Page<ChatAgent>>;
  getAgent(id: string, context: ChatProviderCallContext): Promise<ChatAgent>;
  listSessionGroups(
    request: ListSessionGroupsRequest,
    context: ChatProviderCallContext,
  ): Promise<Page<ChatSessionGroup>>;
  listSessions(
    request: ListSessionsRequest,
    context: ChatProviderCallContext,
  ): Promise<Page<ChatSession>>;
  createSession(
    agentId: string,
    title: string | undefined,
    context: ChatProviderCallContext,
  ): Promise<ChatSession>;
  renameSession(
    sessionId: string,
    title: string,
    context: ChatProviderCallContext,
  ): Promise<ChatSession>;
  markSessionUnread(sessionId: string, context: ChatProviderCallContext): Promise<ChatSession>;
  interruptSession(sessionId: string, context: ChatProviderCallContext): Promise<void>;
  listMessages(
    request: ListMessagesRequest,
    context: ChatProviderCallContext,
  ): Promise<Page<ChatMessage>>;
  sendMessage(
    agentId: string,
    sessionId: string,
    text: string,
    context: ChatProviderCallContext,
  ): Promise<Page<ChatMessage>>;
}

export function pageSize(value: number | undefined, fallback: number, maximum = 100): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new ChatProviderError("invalid_request", "Page size must be a positive integer");
  return Math.min(value, maximum);
}

export function providerSignal(context: ChatProviderCallContext, fallbackMs = 30_000): AbortSignal {
  if (context.signal) return context.signal;
  const remaining = context.deadline ? context.deadline.valueOf() - Date.now() : fallbackMs;
  if (remaining <= 0)
    throw new ChatProviderError("deadline_exceeded", "The provider deadline has elapsed", true);
  return AbortSignal.timeout(Math.min(remaining, fallbackMs));
}
