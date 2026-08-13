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
  | "workspace-storage"
  | "deployment";

export type ExtensionProviderKind = ProviderKind;

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
  injectSystemPrompt(
    request: PromptRequest,
    context: ProviderCallContext,
  ): string | undefined | Promise<string | undefined>;
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
  contribute(
    request: PromptRequest,
    context: ProviderCallContext,
  ):
    | PromptSection
    | readonly PromptSection[]
    | undefined
    | Promise<PromptSection | readonly PromptSection[] | undefined>;
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
  repository?: {
    digest: string;
    assets: readonly SandboxAsset[];
    bootstrap?: string;
    environment?: Readonly<Record<string, string>>;
  };
}

export interface SandboxAsset {
  path: string;
  contentBase64: string;
  executable: boolean;
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

export interface AgentRegistrationSpec extends CreateAgentSpec {
  sourceId: string;
  sourceDigest: string;
}

export interface RegisteredAgent extends AgentRecord {
  credentials?: {
    apiKey: string;
    webhookSigningKey: string;
  };
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
  update(
    id: string,
    patch: { displayName?: string; endpointUrl?: URL },
    context: ProviderCallContext,
  ): Promise<AgentRecord>;
  register(spec: AgentRegistrationSpec, context: ProviderCallContext): Promise<RegisteredAgent>;
  inspect(id: string, context: ProviderCallContext): Promise<RegisteredAgent>;
  disable(id: string, context: ProviderCallContext): Promise<void>;
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
  createSession(
    agentId: string,
    title: string | undefined,
    context: ProviderCallContext,
  ): Promise<ChatSession>;
  listMessages(sessionId: string, context: ProviderCallContext): Promise<readonly ChatMessage[]>;
  sendMessage(
    agentId: string,
    sessionId: string,
    text: string,
    context: ProviderCallContext,
  ): Promise<readonly ChatMessage[]>;
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
  set(
    name: string,
    value: string,
    options: { sensitive?: boolean },
    context: ProviderCallContext,
  ): Promise<void>;
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
  reconcileRegistry?(
    spec: SkillRegistrySpec,
    context: ProviderCallContext,
  ): Promise<SkillRegistryResult>;
  inspectRegistry?(id: string, context: ProviderCallContext): Promise<SkillRegistryResult>;
}

export interface SkillRegistration {
  name: string;
  description: string;
  content: string;
  sourcePath: string;
  digest: string;
}

export interface SkillRegistrySpec {
  name: string;
  description: string;
  skills: readonly SkillRegistration[];
  existingRegistryId?: string;
  existingSkills?: Readonly<Record<string, string>>;
}

export interface SkillRegistryResult {
  id: string;
  name: string;
  skills: ReadonlyArray<PromptSkillSummary & { digest?: string }>;
  created: boolean;
  changed: boolean;
}

export interface MemoryProvider extends SystemPromptInjectingProvider {
  recall(query: string, context: ProviderCallContext): Promise<readonly string[]>;
  retain(fact: string, context: ProviderCallContext): Promise<void>;
}

export interface WorkspaceStorageProvider extends SystemPromptInjectingProvider {
  read(path: string, context: ProviderCallContext): Promise<Uint8Array>;
  write(path: string, content: Uint8Array, context: ProviderCallContext): Promise<void>;
}

export interface DeploymentProvider extends Provider {
  deploymentForCommit(
    commitSha: string,
    context: ProviderCallContext,
  ): Promise<{
    id: string;
    url?: URL;
    status: "pending" | "ready" | "failed" | "unknown";
  }>;
}

export interface ProviderFactoryContext {
  options: unknown;
  getSecret(name: string): Promise<string | undefined>;
}

export type ProviderFactory<T extends Provider = Provider> = (
  context: ProviderFactoryContext,
) => T | Promise<T>;

export interface ProviderPluginRegistration {
  kind: ExtensionProviderKind;
  id: string;
  create: ProviderFactory;
}

export interface ProviderPlugin {
  id: string;
  registrations: readonly ProviderPluginRegistration[];
}

export interface ProviderPluginBuilder {
  register(kind: ExtensionProviderKind, id: string, create: ProviderFactory): void;
  ai(id: string, create: ProviderFactory<AiProvider>): void;
  agent(id: string, create: ProviderFactory<AgentProvider>): void;
  chat(id: string, create: ProviderFactory<ChatProvider>): void;
  skills(id: string, create: ProviderFactory<SkillProvider>): void;
  sandbox(id: string, create: ProviderFactory<SandboxProvider>): void;
  environment(id: string, create: ProviderFactory<EnvProvider>): void;
  deployment(id: string, create: ProviderFactory<DeploymentProvider>): void;
}

export function defineProviderPlugin(input: {
  id: string;
  register(builder: ProviderPluginBuilder): void;
}): ProviderPlugin {
  const registrations: ProviderPluginRegistration[] = [];
  const add = (kind: ExtensionProviderKind, id: string, create: ProviderFactory): void => {
    registrations.push({ kind, id, create });
  };
  const builder: ProviderPluginBuilder = {
    register: add,
    ai: (id, create) => add("ai", id, create),
    agent: (id, create) => add("agent", id, create),
    chat: (id, create) => add("chat", id, create),
    skills: (id, create) => add("skill", id, create),
    sandbox: (id, create) => add("sandbox", id, create),
    environment: (id, create) => add("environment", id, create),
    deployment: (id, create) => add("deployment", id, create),
  };
  input.register(builder);
  return { id: input.id, registrations };
}
