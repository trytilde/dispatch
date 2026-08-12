import type { Tool } from "ai";
import type { DeployableProvider } from "@openbot/runtime-provider-core";
export type { Deployable } from "@openbot/runtime-provider-core";

export interface SkillsProviderCallContext {
  requestId: string;
  deadline?: Date;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export type SkillsProviderErrorCode =
  | "invalid_configuration"
  | "invalid_request"
  | "not_found"
  | "deadline_exceeded"
  | "provider_unavailable"
  | "permission_denied"
  | "internal";

export class SkillsProviderError extends Error {
  constructor(
    readonly code: SkillsProviderErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SkillsProviderError";
  }
}

export type SkillsProviderCapability =
  | "skills:list"
  | "skills:get"
  | "skills:create"
  | "skills:update"
  | "registries:list"
  | "registries:get"
  | "registries:register"
  | "assets:manifest"
  | "assets:download"
  | "assets:materialize";

export interface SkillsProviderDescriptor {
  id: string;
  version: string;
  displayName: string;
  capabilities: readonly SkillsProviderCapability[];
}

export interface Page<T> {
  items: readonly T[];
  nextPageToken?: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  version: number;
  sourceKind: string;
  sourcePath?: string;
  sourceRepositoryUrl?: string;
  sourceCommitHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  version: number;
}

export interface ListSkillsRequest {
  pageSize?: number;
  nextPageToken?: string;
  namePrefix?: string;
  registryId?: string;
}

export interface CreateSkillRequest {
  id?: string;
  name: string;
  description: string;
  content?: string;
  version?: number;
  sourceKind?: string;
  sourcePath?: string;
  sourceProviderId?: string;
  sourceRepositoryUrl?: string;
  sourceCommitHash?: string;
}

export interface UpdateSkillRequest {
  name?: string;
  description?: string;
  content?: string;
}

export interface SkillRegistry {
  id: string;
  name: string;
  description: string;
  skills: readonly SkillSummary[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ListSkillRegistriesRequest {
  pageSize?: number;
  nextPageToken?: string;
  namePrefix?: string;
}

export interface RegisterSkillsRequest {
  registryId?: string;
  name: string;
  description: string;
  skillIds: readonly string[];
}

export interface SkillAsset {
  path: string;
  sizeBytes: number;
  checksumSha256: string;
  mediaType: string;
  executable: boolean;
}

export interface SkillAssetManifest {
  id: string;
  providerId: string;
  sourcePath: string;
  sourceCommitHash: string;
  contentHash: string;
  createdAt: Date;
  files: readonly SkillAsset[];
}

export interface SkillAssetDestination {
  writeFile(
    path: string,
    content: Uint8Array,
    options: { mediaType: string; executable: boolean },
    context: SkillsProviderCallContext,
  ): Promise<void>;
}

/** A Vercel AI SDK tool plus the name used when adding it to a tool set. */
export type RegisteredProviderTool = Tool & { readonly name: string };

export interface SkillsPromptRequest {
  agentId: string;
  sessionId: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface SkillsProviderModelHooks {
  registerTools?(
    context: SkillsProviderCallContext,
  ): readonly RegisteredProviderTool[] | Promise<readonly RegisteredProviderTool[]>;
  injectPromptPart?(
    request: SkillsPromptRequest,
    context: SkillsProviderCallContext,
  ): string | undefined | Promise<string | undefined>;
}

export interface SkillsProvider extends SkillsProviderModelHooks, DeployableProvider {
  listSkills(request: ListSkillsRequest, context: SkillsProviderCallContext): Promise<Page<Skill>>;
  getSkill(id: string, context: SkillsProviderCallContext): Promise<Skill>;
  createSkill(request: CreateSkillRequest, context: SkillsProviderCallContext): Promise<Skill>;
  updateSkill(id: string, request: UpdateSkillRequest, context: SkillsProviderCallContext): Promise<Skill>;
  listRegistries(request: ListSkillRegistriesRequest, context: SkillsProviderCallContext): Promise<Page<SkillRegistry>>;
  getRegistry(id: string, context: SkillsProviderCallContext): Promise<SkillRegistry>;
  registerSkills(request: RegisterSkillsRequest, context: SkillsProviderCallContext): Promise<SkillRegistry>;
  getSkillAssetManifest(skillId: string, context: SkillsProviderCallContext): Promise<SkillAssetManifest>;
  downloadSkillAsset(skillId: string, path: string, context: SkillsProviderCallContext): Promise<Uint8Array>;
  materializeSkillAssets(
    skillId: string,
    destination: SkillAssetDestination,
    context: SkillsProviderCallContext,
  ): Promise<SkillAssetManifest>;
}

export function pageSize(value: number | undefined, fallback: number, maximum = 100): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new SkillsProviderError("invalid_request", "Page size must be a positive integer");
  }
  return Math.min(value, maximum);
}

export function providerSignal(context: SkillsProviderCallContext, fallbackMs = 30_000): AbortSignal {
  if (context.signal) return context.signal;
  const remaining = context.deadline ? context.deadline.valueOf() - Date.now() : fallbackMs;
  if (remaining <= 0) throw new SkillsProviderError("deadline_exceeded", "The provider deadline has elapsed", true);
  return AbortSignal.timeout(Math.min(remaining, fallbackMs));
}

export function safeSkillAssetPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new SkillsProviderError("provider_unavailable", `Tilde returned an unsafe skill asset path: ${path}`);
  }
  return normalized;
}
