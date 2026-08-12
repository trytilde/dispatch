import type { LanguageModelV3 } from "@ai-sdk/provider";

export type ProviderKind =
  | "ai"
  | "prompt"
  | "skill"
  | "memory"
  | "sandbox"
  | "agent"
  | "chat"
  | "environment"
  | "tool"
  | "workspace-storage";

export interface ProviderDescriptor {
  id: string;
  version: string;
  displayName: string;
  kind: ProviderKind;
  capabilities: readonly string[];
}

export interface ProviderCallContext {
  requestId: string;
  deadline?: Date;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export class ProviderError extends Error {
  constructor(
    readonly code:
      | "invalid_configuration"
      | "not_supported"
      | "not_found"
      | "deadline_exceeded"
      | "provider_unavailable"
      | "permission_denied"
      | "internal",
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface Provider {
  readonly descriptor: ProviderDescriptor;
  health(context: ProviderCallContext): Promise<{ healthy: boolean; message?: string }>;
}

export interface SystemPromptInjectingProvider extends Provider {
  injectSystemPrompt(request: PromptRequest, context: ProviderCallContext): string | undefined | Promise<string | undefined>;
}

export type AiCredential =
  | { mode: "api_key"; apiKey: string }
  | { mode: "oauth"; accessToken: string; refreshToken?: string; expiresAt?: Date };

export interface AiProvider extends SystemPromptInjectingProvider {
  validateCredential(credential: AiCredential, context: ProviderCallContext): Promise<void>;
  languageModel(modelId: string, credential: AiCredential): LanguageModelV3;
}

export interface PromptSkillSummary {
  id: string;
  name: string;
  description: string;
  version?: number;
}

export interface PromptRequest {
  agent: { id: string; displayName?: string };
  sessionId: string;
  userId?: string;
  timeZone?: string;
  capabilities: {
    runtimeMcp: boolean;
    skillRegistry: boolean;
    memory: boolean;
    sandbox?: boolean;
  };
  skills?: readonly PromptSkillSummary[];
  metadata?: Readonly<Record<string, string>>;
}

export interface PromptSection {
  id: string;
  priority: number;
  content: string;
  cache: "stable" | "session" | "turn";
}

export interface PromptPlugin {
  readonly id: string;
  contribute(request: PromptRequest, context: ProviderCallContext): PromptSection | readonly PromptSection[] | undefined | Promise<PromptSection | readonly PromptSection[] | undefined>;
}

export interface ComposedPrompt {
  system: string;
  sections: readonly PromptSection[];
  fingerprint: string;
}

export interface PromptProvider extends Provider {
  compose(request: PromptRequest, context: ProviderCallContext): Promise<ComposedPrompt>;
}

export interface SandboxSpec {
  image?: string;
  labels?: Readonly<Record<string, string>>;
}

export interface SandboxHandle {
  id: string;
  providerId: string;
  state: "starting" | "running" | "stopped" | "failed";
  createdAt: Date;
  checkpointId?: string;
}

export interface SandboxProvider extends SystemPromptInjectingProvider {
  create(spec: SandboxSpec, context: ProviderCallContext): Promise<SandboxHandle>;
  get(id: string, context: ProviderCallContext): Promise<SandboxHandle>;
  exec(
    id: string,
    command: string,
    args: readonly string[],
    context: ProviderCallContext,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  desktop(id: string, context: ProviderCallContext): Promise<{ url: URL; expiresAt: Date }>;
  checkpoint(id: string, context: ProviderCallContext): Promise<SandboxHandle>;
  stop(id: string, context: ProviderCallContext): Promise<SandboxHandle>;
}

export interface AgentRecord {
  id: string;
  displayName: string;
  status: string;
  endpointUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateAgentSpec {
  id?: string;
  displayName: string;
  endpointUrl: URL;
  streaming?: boolean;
  timeoutMs?: number;
}

export interface CreatedAgent {
  agent: AgentRecord;
  credentials: {
    apiKey: string;
    webhookSigningKey: string;
  };
}

export interface AgentProvider extends Provider {
  verify(context: ProviderCallContext): Promise<{ organizationId: string; teamId: string }>;
  list(context: ProviderCallContext): Promise<readonly AgentRecord[]>;
  get(id: string, context: ProviderCallContext): Promise<AgentRecord>;
  create(spec: CreateAgentSpec, context: ProviderCallContext): Promise<CreatedAgent>;
  update(id: string, patch: { displayName?: string; endpointUrl?: URL }, context: ProviderCallContext): Promise<AgentRecord>;
}

export interface ChatSession {
  id: string;
  agentId: string;
  title?: string;
  unread?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "system" | "user" | "assistant";
  text: string;
  createdAt: Date;
}

export interface ChatProvider extends Provider {
  listSessions(agentId: string, context: ProviderCallContext): Promise<readonly ChatSession[]>;
  createSession(agentId: string, title: string | undefined, context: ProviderCallContext): Promise<ChatSession>;
  listMessages(sessionId: string, context: ProviderCallContext): Promise<readonly ChatMessage[]>;
  sendMessage(agentId: string, sessionId: string, text: string, context: ProviderCallContext): Promise<readonly ChatMessage[]>;
  interrupt(sessionId: string, context: ProviderCallContext): Promise<void>;
}

export interface EnvEntry {
  name: string;
  sensitive: boolean;
  updatedAt?: Date;
}

export interface EnvProvider extends Provider {
  get(name: string, context: ProviderCallContext): Promise<string | undefined>;
  list(prefix: string | undefined, context: ProviderCallContext): Promise<readonly EnvEntry[]>;
  set(name: string, value: string, options: { sensitive?: boolean }, context: ProviderCallContext): Promise<void>;
  delete(name: string, context: ProviderCallContext): Promise<void>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface ToolProvider extends SystemPromptInjectingProvider {
  listTools(context: ProviderCallContext): Promise<readonly ToolDefinition[]>;
  invoke(name: string, input: unknown, context: ProviderCallContext): Promise<unknown>;
}

export interface SkillProvider extends SystemPromptInjectingProvider {
  listSkills(context: ProviderCallContext): Promise<readonly PromptSkillSummary[]>;
  readSkill(id: string, context: ProviderCallContext): Promise<string>;
}

export interface MemoryProvider extends SystemPromptInjectingProvider {
  recall(query: string, context: ProviderCallContext): Promise<readonly string[]>;
  retain(fact: string, context: ProviderCallContext): Promise<void>;
}

export interface WorkspaceStorageProvider extends SystemPromptInjectingProvider {
  read(path: string, context: ProviderCallContext): Promise<Uint8Array>;
  write(path: string, content: Uint8Array, context: ProviderCallContext): Promise<void>;
}
