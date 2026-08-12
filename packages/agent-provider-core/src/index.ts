import type { Tool } from "ai";

export interface AgentProviderCallContext {
  requestId: string;
  deadline?: Date;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export type AgentProviderErrorCode =
  | "invalid_configuration"
  | "invalid_request"
  | "not_supported"
  | "not_found"
  | "deadline_exceeded"
  | "provider_unavailable"
  | "permission_denied"
  | "internal";

export class AgentProviderError extends Error {
  constructor(
    readonly code: AgentProviderErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AgentProviderError";
  }
}

export interface AgentProviderDescriptor {
  id: string;
  version: string;
  displayName: string;
  capabilities: readonly AgentProviderCapability[];
}

export type AgentProviderCapability =
  | "agents:list"
  | "agents:get"
  | "agents:register"
  | "agents:update"
  | "agents:unregister"
  | "sessions:list"
  | "sessions:create"
  | "sessions:rename"
  | "sessions:mark-unread"
  | "sessions:interrupt"
  | "messages:list"
  | "messages:send";

export interface Page<T> {
  items: readonly T[];
  nextPageToken?: string;
}

export type AgentSortOrder = "updated_at" | "created_at" | "manual";
export type SessionSortOrder = "updated_at" | "created_at";

export interface Agent {
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

export interface AgentSession {
  id: string;
  agentId: string;
  title?: string;
  unread: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUserMessageAt?: Date;
}

export interface AgentSessionGroup {
  agent: Agent;
  sessions: Page<AgentSession>;
}

export interface AgentMessage {
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

export interface RegisterAgentRequest {
  id?: string;
  displayName: string;
  endpointUrl: URL;
  streaming?: boolean;
  timeoutMs?: number;
}

export interface RegisteredAgent {
  agent: Agent;
  credentials: {
    apiKey: string;
    webhookSigningKey: string;
  };
}

export interface UpdateAgentRequest {
  displayName?: string;
  endpointUrl?: URL;
  enabled?: boolean;
}

export interface AgentPromptRequest {
  agent: Pick<Agent, "id" | "displayName">;
  sessionId: string;
  metadata?: Readonly<Record<string, string>>;
}

/** Optional model-facing hooks. Control-plane methods are not tools by default. */
export interface AgentProviderModelHooks {
  registerTools?(
    context: AgentProviderCallContext,
  ): readonly Tool[] | Promise<readonly Tool[]>;
  injectPromptPart?(
    request: AgentPromptRequest,
    context: AgentProviderCallContext,
  ): string | undefined | Promise<string | undefined>;
}

export interface AgentProvider extends AgentProviderModelHooks {
  readonly descriptor: AgentProviderDescriptor;
  health(context: AgentProviderCallContext): Promise<{ healthy: boolean; message?: string }>;
  verify(context: AgentProviderCallContext): Promise<{ organizationId: string; teamId: string }>;

  listAgents(request: ListAgentsRequest, context: AgentProviderCallContext): Promise<Page<Agent>>;
  getAgent(id: string, context: AgentProviderCallContext): Promise<Agent>;
  registerAgent(request: RegisterAgentRequest, context: AgentProviderCallContext): Promise<RegisteredAgent>;
  updateAgent(id: string, request: UpdateAgentRequest, context: AgentProviderCallContext): Promise<Agent>;
  unregisterAgent(id: string, context: AgentProviderCallContext): Promise<void>;

  listSessionGroups(request: ListSessionGroupsRequest, context: AgentProviderCallContext): Promise<Page<AgentSessionGroup>>;
  listSessions(request: ListSessionsRequest, context: AgentProviderCallContext): Promise<Page<AgentSession>>;
  createSession(agentId: string, title: string | undefined, context: AgentProviderCallContext): Promise<AgentSession>;
  renameSession(sessionId: string, title: string, context: AgentProviderCallContext): Promise<AgentSession>;
  markSessionUnread(sessionId: string, context: AgentProviderCallContext): Promise<AgentSession>;
  interruptSession(sessionId: string, context: AgentProviderCallContext): Promise<void>;

  listMessages(request: ListMessagesRequest, context: AgentProviderCallContext): Promise<Page<AgentMessage>>;
  sendMessage(agentId: string, sessionId: string, text: string, context: AgentProviderCallContext): Promise<Page<AgentMessage>>;
}

export function pageSize(value: number | undefined, fallback: number, maximum = 100): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AgentProviderError("invalid_request", "Page size must be a positive integer");
  }
  return Math.min(value, maximum);
}

export function providerSignal(context: AgentProviderCallContext, fallbackMs = 30_000): AbortSignal {
  if (context.signal) return context.signal;
  const remaining = context.deadline ? context.deadline.valueOf() - Date.now() : fallbackMs;
  if (remaining <= 0) throw new AgentProviderError("deadline_exceeded", "The provider deadline has elapsed", true);
  return AbortSignal.timeout(Math.min(remaining, fallbackMs));
}
