import type {
  AgentProvider,
  AgentRecord,
  AgentRegistrationSpec,
  ChatMessage,
  ChatProvider,
  ChatSession,
  CreateAgentSpec,
  ProviderCallContext,
  PromptRequest,
  SkillProvider,
  SkillRegistryResult,
  SkillRegistrySpec,
} from "@openbot/provider-sdk";
import { ProviderError } from "@openbot/provider-sdk";

export interface TildeProviderConfig {
  apiKey: string;
  orgId: string;
  teamId: string;
  baseUrl?: string;
}

type JsonRecord = Record<string, unknown>;

class TildeApi {
  readonly #config: TildeProviderConfig;

  constructor(config: TildeProviderConfig) {
    this.#config = config;
  }

  async request<T>(path: string, context: ProviderCallContext, init: RequestInit = {}): Promise<T> {
    const response = await fetch(new URL(path, this.#config.baseUrl ?? "https://api.trytilde.ai"), {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.#config.apiKey,
        "x-tilde-org-id": this.#config.orgId,
        ...init.headers,
      },
      signal: context.signal ?? AbortSignal.timeout(deadlineMilliseconds(context, 30_000)),
    });
    if (!response.ok) {
      const detail = await response.text();
      const code = response.status === 404 ? "not_found" : response.status === 401 || response.status === 403 ? "permission_denied" : "provider_unavailable";
      throw new ProviderError(code, `Tilde API failed (${response.status}): ${detail.slice(0, 300)}`, response.status >= 500);
    }
    return response.json() as Promise<T>;
  }

  teamPath(path: string): string {
    return `/api/v1/team/${encodeURIComponent(this.#config.teamId)}${path}`;
  }

  get orgId(): string { return this.#config.orgId; }
  get teamId(): string { return this.#config.teamId; }
}

export class TildeAgentProvider implements AgentProvider {
  readonly descriptor = {
    id: "tilde-agents",
    version: "1.0.0",
    displayName: "Tilde agents",
    kind: "agent" as const,
    capabilities: ["list", "get", "create", "update", "http-vercel-ai-sdk"] as const,
  };
  readonly #api: TildeApi;

  constructor(config: TildeProviderConfig) {
    this.#api = new TildeApi(config);
  }

  async health(context: ProviderCallContext) {
    try {
      await this.verify(context);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : "Tilde is unavailable" };
    }
  }

  async verify(context: ProviderCallContext) {
    await this.#api.request<unknown>("/api/v1/identity/auth/whoami", context);
    return { organizationId: this.#api.orgId, teamId: this.#api.teamId };
  }

  async list(context: ProviderCallContext): Promise<readonly AgentRecord[]> {
    const response = await this.#api.request<{ items?: JsonRecord[] }>(this.#api.teamPath("/chatkit/agents?page_size=100"), context);
    return (response.items ?? []).map(agentRecord);
  }

  async get(id: string, context: ProviderCallContext): Promise<AgentRecord> {
    return agentRecord(await this.#api.request<JsonRecord>(this.#api.teamPath(`/chatkit/agents/${encodeURIComponent(id)}`), context));
  }

  async create(spec: CreateAgentSpec, context: ProviderCallContext) {
    const response = await this.#api.request<{ agent: JsonRecord; api_key: string; webhook_signing_key: string }>(
      this.#api.teamPath("/chatkit/agents/http-vercel-ai-sdk"),
      context,
      {
        method: "POST",
        body: JSON.stringify({
          id: spec.id,
          display_name: spec.displayName,
          endpoint_url: spec.endpointUrl.toString(),
          local_running_endpoint: false,
          streaming: spec.streaming ?? true,
          timeout_ms: spec.timeoutMs ?? 300_000,
        }),
      },
    );
    return {
      agent: agentRecord(response.agent),
      credentials: { apiKey: response.api_key, webhookSigningKey: response.webhook_signing_key },
    };
  }

  async update(id: string, patch: { displayName?: string; endpointUrl?: URL }, context: ProviderCallContext) {
    return agentRecord(await this.#api.request<JsonRecord>(
      this.#api.teamPath(`/chatkit/agents/${encodeURIComponent(id)}`),
      context,
      {
        method: "PATCH",
        body: JSON.stringify({
          display_name: patch.displayName,
          endpoint_url: patch.endpointUrl?.toString(),
        }),
      },
    ));
  }

  async register(spec: AgentRegistrationSpec, context: ProviderCallContext) {
    const created = await this.create(spec, context);
    return { ...created.agent, credentials: created.credentials };
  }

  inspect(id: string, context: ProviderCallContext) {
    return this.get(id, context);
  }

  async disable(id: string, context: ProviderCallContext): Promise<void> {
    await this.#api.request<unknown>(
      this.#api.teamPath(`/chatkit/agents/${encodeURIComponent(id)}/status`),
      context,
      { method: "PATCH", body: JSON.stringify({ status: "disabled" }) },
    );
  }
}

export class TildeChatProvider implements ChatProvider {
  readonly descriptor = {
    id: "tilde-chatkit",
    version: "1.0.0",
    displayName: "Tilde ChatKit",
    kind: "chat" as const,
    capabilities: ["sessions", "messages", "history", "interrupt"] as const,
  };
  readonly #api: TildeApi;

  constructor(config: TildeProviderConfig) {
    this.#api = new TildeApi(config);
  }

  async health(context: ProviderCallContext) {
    try {
      await this.#api.request<unknown>("/api/v1/identity/auth/whoami", context);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : "Tilde ChatKit is unavailable" };
    }
  }

  async listSessions(agentId: string, context: ProviderCallContext): Promise<readonly ChatSession[]> {
    const response = await this.#api.request<{ items?: JsonRecord[] }>(
      this.#api.teamPath(`/chatkit/mission-control/agents/${encodeURIComponent(agentId)}/sessions?page_size=100&session_sort=updated_at`),
      context,
    );
    return (response.items ?? []).map((item) => sessionRecord(item, agentId));
  }

  async createSession(agentId: string, title: string | undefined, context: ProviderCallContext): Promise<ChatSession> {
    const response = await this.#api.request<{ session: JsonRecord }>(
      this.#api.teamPath(`/chatkit/mission-control/agents/${encodeURIComponent(agentId)}/sessions`),
      context,
      { method: "POST", body: JSON.stringify({ title: title ?? null }) },
    );
    return sessionRecord(response.session, agentId);
  }

  async listMessages(sessionId: string, context: ProviderCallContext): Promise<readonly ChatMessage[]> {
    const path = this.#api.teamPath(`/chatkit/mission-control/sessions/${encodeURIComponent(sessionId)}/messages?page_size=100`);
    try {
      const response = await this.#api.request<{ items?: JsonRecord[] }>(path, context);
      return (response.items ?? []).map(messageRecord);
    } catch (error) {
      if (!(error instanceof ProviderError) || error.code !== "not_found") throw error;
      const response = await this.#api.request<{ items?: JsonRecord[] }>(
        this.#api.teamPath(`/chatkit/sessions/${encodeURIComponent(sessionId)}/messages?page_size=100`),
        context,
      );
      return (response.items ?? []).map(messageRecord);
    }
  }

  async sendMessage(agentId: string, sessionId: string, text: string, context: ProviderCallContext): Promise<readonly ChatMessage[]> {
    const response = await this.#api.request<{ items?: JsonRecord[] }>(
      this.#api.teamPath(`/chatkit/mission-control/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/messages`),
      context,
      { method: "POST", body: JSON.stringify({ text, attachment_ids: [] }) },
    );
    return (response.items ?? []).map(messageRecord);
  }

  async interrupt(sessionId: string, context: ProviderCallContext): Promise<void> {
    await this.#api.request<unknown>(
      this.#api.teamPath(`/chatkit/mission-control/sessions/${encodeURIComponent(sessionId)}/interrupt`),
      context,
      { method: "POST", body: "{}" },
    );
  }
}

export class TildeManagedSkillProvider implements SkillProvider {
  readonly descriptor = {
    id: "tilde-skills",
    version: "1.0.0",
    displayName: "Tilde skills",
    kind: "skill" as const,
    capabilities: ["reconcile", "registry", "progressive-read"] as const,
  };
  readonly #api: TildeApi;
  #registryId?: string;

  constructor(config: TildeProviderConfig, registryId?: string) {
    this.#api = new TildeApi(config);
    this.#registryId = registryId;
  }

  async health(context: ProviderCallContext) {
    try {
      await this.#api.request<unknown>("/api/v1/identity/auth/whoami", context);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : "Tilde skills are unavailable" };
    }
  }

  injectSystemPrompt(request: PromptRequest) {
    return request.capabilities.skillRegistry
      ? "Search the configured Tilde skill registry first, inspect a relevant description, and load the full skill only when it applies."
      : undefined;
  }

  async listSkills(context: ProviderCallContext) {
    if (!this.#registryId) return [];
    const registry = await this.#api.request<JsonRecord>(this.#api.teamPath(`/skill-registry/${encodeURIComponent(this.#registryId)}`), context);
    return arrayValue(registry.skills).map((value) => skillSummary(asRecord(value)));
  }

  async readSkill(id: string, context: ProviderCallContext): Promise<string> {
    if (!this.#registryId) throw new ProviderError("invalid_configuration", "Tilde skill registry is not configured");
    const skill = await this.#api.request<JsonRecord>(this.#api.teamPath(`/skill/${encodeURIComponent(id)}`), context);
    return optionalString(skill.content) ?? "";
  }

  async reconcileRegistry(spec: SkillRegistrySpec, context: ProviderCallContext): Promise<SkillRegistryResult> {
    const existingRegistry = await this.#findRegistry(spec, context);
    const currentSkills = await this.#listTeamSkills(context);
    const currentByName = new Map(currentSkills.map((skill) => [optionalString(skill.name), skill]));
    const remoteSkills: JsonRecord[] = [];
    let changed = !existingRegistry;
    for (const desired of spec.skills) {
      const mappedId = spec.existingSkills?.[desired.name];
      const current = mappedId
        ? await this.#api.request<JsonRecord>(this.#api.teamPath(`/skill/${encodeURIComponent(mappedId)}`), context).catch(() => undefined)
        : currentByName.get(desired.name);
      if (!current) {
        remoteSkills.push(await this.#api.request<JsonRecord>(this.#api.teamPath("/skill"), context, {
          method: "POST",
          body: JSON.stringify({
            name: desired.name,
            description: desired.description,
            content: desired.content,
            source_kind: "repository",
            source_path: desired.sourcePath,
          }),
        }));
        changed = true;
        continue;
      }
      const needsUpdate = optionalString(current.description) !== desired.description || optionalString(current.content) !== desired.content;
      remoteSkills.push(needsUpdate
        ? await this.#api.request<JsonRecord>(this.#api.teamPath(`/skill/${encodeURIComponent(stringValue(current.id))}`), context, {
            method: "PATCH",
            body: JSON.stringify({ name: desired.name, description: desired.description, content: desired.content }),
          })
        : current);
      changed ||= needsUpdate;
    }
    const skillIds = remoteSkills.map((skill) => stringValue(skill.id));
    let registry = existingRegistry;
    if (!registry) {
      registry = await this.#api.request<JsonRecord>(this.#api.teamPath("/skill-registry"), context, {
        method: "POST",
        body: JSON.stringify({ name: spec.name, description: spec.description, skill_ids: skillIds }),
      });
    } else {
      const currentIds = arrayValue(registry.skills).map((value) => stringValue(asRecord(value).id)).sort();
      if (JSON.stringify(currentIds) !== JSON.stringify([...skillIds].sort())
        || optionalString(registry.name) !== spec.name
        || optionalString(registry.description) !== spec.description) {
        registry = await this.#api.request<JsonRecord>(this.#api.teamPath(`/skill-registry/${encodeURIComponent(stringValue(registry.id))}`), context, {
          method: "PATCH",
          body: JSON.stringify({ name: spec.name, description: spec.description, skill_ids: skillIds }),
        });
        changed = true;
      }
    }
    this.#registryId = stringValue(registry.id);
    return {
      id: this.#registryId,
      name: optionalString(registry.name) ?? spec.name,
      skills: remoteSkills.map(skillSummary),
      created: !existingRegistry,
      changed,
    };
  }

  async inspectRegistry(id: string, context: ProviderCallContext): Promise<SkillRegistryResult> {
    const registry = await this.#api.request<JsonRecord>(this.#api.teamPath(`/skill-registry/${encodeURIComponent(id)}`), context);
    this.#registryId = id;
    return { id, name: optionalString(registry.name) ?? id, skills: arrayValue(registry.skills).map((value) => skillSummary(asRecord(value))), created: false, changed: false };
  }

  async #findRegistry(spec: SkillRegistrySpec, context: ProviderCallContext): Promise<JsonRecord | undefined> {
    if (spec.existingRegistryId) {
      return this.#api.request<JsonRecord>(this.#api.teamPath(`/skill-registry/${encodeURIComponent(spec.existingRegistryId)}`), context).catch(() => undefined);
    }
    const response = await this.#api.request<{ items?: JsonRecord[] }>(this.#api.teamPath("/skill-registry?page_size=100"), context);
    return (response.items ?? []).find((registry) => optionalString(registry.name) === spec.name);
  }

  async #listTeamSkills(context: ProviderCallContext): Promise<JsonRecord[]> {
    const response = await this.#api.request<{ items?: JsonRecord[] }>(this.#api.teamPath("/skill?page_size=100"), context);
    return response.items ?? [];
  }
}

function agentRecord(value: JsonRecord): AgentRecord {
  const configuration = asRecord(value.configuration);
  return {
    id: stringValue(value.id),
    displayName: optionalString(configuration.display_name) ?? stringValue(value.id),
    status: optionalString(value.status) ?? "unknown",
    ...(optionalString(configuration.endpoint_url) ? { endpointUrl: optionalString(configuration.endpoint_url) } : {}),
    ...(dateValue(value.created_at) ? { createdAt: dateValue(value.created_at) } : {}),
    ...(dateValue(value.updated_at) ? { updatedAt: dateValue(value.updated_at) } : {}),
  };
}

function sessionRecord(value: JsonRecord, agentId: string): ChatSession {
  return {
    id: stringValue(value.id),
    agentId,
    ...(optionalString(value.title) ? { title: optionalString(value.title) } : {}),
    ...(typeof value.unread === "boolean" ? { unread: value.unread } : {}),
    createdAt: dateValue(value.created_at) ?? new Date(0),
    updatedAt: dateValue(value.updated_at) ?? new Date(0),
  };
}

function messageRecord(value: JsonRecord): ChatMessage {
  const role = value.role === "system" || value.role === "user" || value.role === "assistant" ? value.role : "assistant";
  return {
    id: stringValue(value.id),
    sessionId: stringValue(value.session_id),
    role,
    text: messageText(value),
    createdAt: dateValue(value.created_at) ?? new Date(0),
  };
}

function skillSummary(value: JsonRecord) {
  return {
    id: stringValue(value.id),
    name: optionalString(value.name) ?? stringValue(value.id),
    description: optionalString(value.description) ?? "",
    ...(typeof value.version === "number" ? { version: value.version } : {}),
  };
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function messageText(value: JsonRecord): string {
  if (typeof value.text === "string") return value.text;
  if (!Array.isArray(value.parts)) return "";
  return value.parts.map((part) => optionalString(asRecord(part).text) ?? "").join("");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown): string {
  if (typeof value !== "string" || !value) throw new ProviderError("provider_unavailable", "Tilde returned an invalid resource identifier");
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

function deadlineMilliseconds(context: ProviderCallContext, fallback: number): number {
  if (!context.deadline) return fallback;
  return Math.max(1, Math.min(fallback, context.deadline.valueOf() - Date.now()));
}
