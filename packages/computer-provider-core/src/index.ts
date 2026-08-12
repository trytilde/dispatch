import type { Tool } from "ai";
import type { DeployableProvider } from "@openbot/runtime-provider-core";
export type { Deployable } from "@openbot/runtime-provider-core";

export type ComputerState = "creating" | "running" | "sleeping" | "failed";

export interface ComputerCallContext {
  requestId: string;
  signal?: AbortSignal;
  deadline?: Date;
  idempotencyKey?: string;
}

export class ComputerProviderError extends Error {
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
    this.name = "ComputerProviderError";
  }
}

export interface ComputerProviderDescriptor {
  id: string;
  version: string;
  displayName: string;
  capabilities: readonly (
    | "lifecycle"
    | "exec"
    | "files"
    | "desktop"
    | "input"
    | "image-build"
    | "image-publish"
  )[];
}

export interface ComputerSeedFile {
  path: string;
  content: Uint8Array;
  executable?: boolean;
}

export interface ComputerLifecycleScript {
  id: string;
  path: string;
  phases: readonly ("create" | "wake")[];
}

export interface ComputerSpec {
  id?: string;
  image?: string;
  labels?: Readonly<Record<string, string>>;
  environment?: Readonly<Record<string, string>>;
  files?: readonly ComputerSeedFile[];
  lifecycle?: readonly ComputerLifecycleScript[];
}

export interface ComputerHandle {
  id: string;
  providerId: string;
  state: ComputerState;
  createdAt: Date;
  image?: string;
}

export interface ComputerExecRequest {
  command: string;
  args?: readonly string[];
  cwd?: string;
  timeoutMs?: number;
  environment?: Readonly<Record<string, string>>;
}

export interface ComputerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ComputerInput =
  | { action: "mouse_move"; x: number; y: number }
  | { action: "click"; button?: 1 | 2 | 3 }
  | { action: "type"; text: string; delayMs?: number }
  | { action: "key"; key: string };

export interface ComputerVncEndpoint {
  url: URL;
  expiresAt: Date;
}

export interface ComputerPromptContext {
  computer?: ComputerHandle;
  agentId?: string;
  sessionId?: string;
}

export interface ComputerPromptPart {
  id: string;
  priority: number;
  content: string;
  cache: "stable" | "session" | "turn";
}

export type JsonSchema = Readonly<Record<string, unknown>>;

/** Matches Tilde's generic custom-tool provider manifest tool schema. */
export interface TildeToolManifestTool {
  type_id: string;
  name?: string;
  description: string;
  input_schema: JsonSchema;
  output_schema?: JsonSchema;
}

/**
 * A Vercel AI SDK tool with the exact discovery metadata required by Tilde's
 * generic custom-tool provider. Keeping the metadata on the tool prevents the
 * runtime and discovery surfaces from drifting apart.
 */
export type RegisteredComputerTool<Input = unknown, Output = unknown> = Tool<Input, Output> & {
  readonly typeId: string;
  readonly tilde: TildeToolManifestTool;
};

export interface RegisterComputerToolsContext {
  computerId: string;
  requestId?: string;
}

export interface ComputerImageSpec {
  sourceDigest: string;
  contextDirectory: string;
  dockerfilePath: string;
  repository: string;
  tagPrefix?: string;
  buildArguments?: Readonly<Record<string, string>>;
}

export interface BuiltComputerImage {
  sourceDigest: string;
  localReference: string;
}

export interface PublishedComputerImage extends BuiltComputerImage {
  reference: string;
  publishedAt: Date;
}

export interface ComputerProvider extends DeployableProvider {
  injectPromptPart(context: ComputerPromptContext, callContext: ComputerCallContext): ComputerPromptPart | undefined | Promise<ComputerPromptPart | undefined>;
  registerTools(context: RegisterComputerToolsContext): readonly RegisteredComputerTool[];

  create(spec: ComputerSpec, context: ComputerCallContext): Promise<ComputerHandle>;
  get(id: string, context: ComputerCallContext): Promise<ComputerHandle>;
  wake(id: string, context: ComputerCallContext): Promise<ComputerHandle>;
  sleep(id: string, context: ComputerCallContext): Promise<ComputerHandle>;
  delete(id: string, context: ComputerCallContext): Promise<void>;

  exec(id: string, request: ComputerExecRequest, context: ComputerCallContext): Promise<ComputerExecResult>;
  readFile(id: string, path: string, context: ComputerCallContext): Promise<Uint8Array>;
  writeFile(id: string, path: string, content: Uint8Array, context: ComputerCallContext): Promise<void>;
  screenshot(id: string, context: ComputerCallContext): Promise<Uint8Array>;
  input(id: string, input: ComputerInput, context: ComputerCallContext): Promise<void>;
  vnc(id: string, context: ComputerCallContext): Promise<ComputerVncEndpoint>;

  buildImage(spec: ComputerImageSpec, context: ComputerCallContext): Promise<BuiltComputerImage>;
  publishImage(image: BuiltComputerImage, spec: ComputerImageSpec, context: ComputerCallContext): Promise<PublishedComputerImage>;
}

export async function ensurePublishedComputerImage(
  provider: ComputerProvider,
  spec: ComputerImageSpec,
  previous: PublishedComputerImage | undefined,
  context: ComputerCallContext,
): Promise<{ image: PublishedComputerImage; changed: boolean }> {
  if (previous?.sourceDigest === spec.sourceDigest) return { image: previous, changed: false };
  const built = await provider.buildImage(spec, context);
  if (built.sourceDigest !== spec.sourceDigest) {
    throw new ComputerProviderError("internal", "Computer image build returned the wrong source digest");
  }
  return { image: await provider.publishImage(built, spec, context), changed: true };
}

export function asRegisteredComputerTool<Input, Output>(
  typeId: string,
  manifest: Omit<TildeToolManifestTool, "type_id">,
  aiTool: Tool<Input, Output>,
): RegisteredComputerTool<Input, Output> {
  return Object.assign(aiTool, {
    typeId,
    tilde: { type_id: typeId, ...manifest },
  });
}
