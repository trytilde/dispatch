import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { posix } from "node:path";
import { promisify } from "node:util";
import { tool } from "ai";
import { z } from "zod";
import {
  ComputerProviderError,
  asRegisteredComputerTool,
  type BuiltComputerImage,
  type ComputerCallContext,
  type ComputerAgentWorkspace,
  type ComputerExecRequest,
  type ComputerSeedFile,
  type ComputerImageSpec,
  type ComputerInput,
  type ComputerPromptContext,
  type ComputerProvider,
  type ComputerPromptPart,
  type PublishedComputerImage,
  type RegisteredComputerTool,
  type RegisterComputerToolsContext,
  type DeployAgentWorkspacesRequest,
  type DeployDevelopmentSandboxRequest,
} from "../core/index.js";
import type {
  Buildable,
  Deployable,
  DeploymentContext,
  ProviderInitialization,
} from "@openbot/runtime-provider";
import { sandboxDeploymentEnvironment } from "@openbot/runtime-provider";
import { renderFileTemplatePath } from "@openbot/utilities";
import { computerImageAssets, materializeComputerImageContext } from "./assets.js";
import { developmentSandboxSourceFiles, shellEnvironmentExports } from "./development.js";

const execute = promisify(execFile);

export interface ComputerImageDeploymentConfig {
  /** OCI repository, for example ghcr.io/example/openbot-computer. */
  repository?: string;
  tagPrefix?: string;
  buildArguments?: Readonly<Record<string, string>>;
}

export abstract class BaseComputerProvider implements ComputerProvider {
  protected abstract readonly providerId: string;
  protected abstract readonly deployedImageEnvironmentVariable: string;
  readonly initialization: ProviderInitialization | undefined;
  readonly buildable: Buildable;
  readonly deployable: Deployable;
  readonly #imageDeployment: ComputerImageDeploymentConfig;

  protected constructor(imageDeployment: ComputerImageDeploymentConfig = {}) {
    this.#imageDeployment = imageDeployment;
    this.initialization = imageDeployment.repository ? undefined : {
      id: "computer-image",
      label: "Computer image",
      description: "Build and publish the shared OpenBot computer image.",
      questions: [{
        id: "computer-image-repository",
        prompt: "Which OCI repository should receive OpenBot computer images?",
        input: "text",
        required: true,
        destination: { kind: "environment", key: "OPENBOT_COMPUTER_IMAGE_REPOSITORY" },
      }],
    };
    this.buildable = {
      check: async (context) => {
        this.#imageRepository(context);
        await runDocker(["version", "--format", "{{.Server.Version}}"], deploymentCallContext("check"));
      },
      build: async (context) => {
        const materialized = await materializeComputerImageContext(context.repositoryRoot, this.providerId);
        const spec = this.#imageSpec(context, materialized);
        const image = await this.buildImage(spec, deploymentCallContext("build"));
        return {
          outputs: {
            [this.#outputName("CONTEXT")]: materialized.contextDirectory,
            [this.#outputName("DOCKERFILE")]: materialized.dockerfilePath,
            [this.#outputName("LOCAL_REFERENCE")]: image.localReference,
            [this.#outputName("SOURCE_DIGEST")]: image.sourceDigest,
          },
        };
      },
    };
    this.deployable = {
      plan: async (context) => ({
        summary: `Publish the ${this.providerId} computer image to ${this.#imageRepository(context)}`,
        steps: ["Push the content-addressed OCI image", `Set ${this.deployedImageEnvironmentVariable} for future computers`],
      }),
      deploy: async (context) => {
        const spec = this.#imageSpec(context, {
          contextDirectory: context.inputs.require(this.#outputName("CONTEXT")),
          dockerfilePath: context.inputs.require(this.#outputName("DOCKERFILE")),
          sourceDigest: context.inputs.require(this.#outputName("SOURCE_DIGEST")),
        });
        const image = await this.publishImage({
          localReference: context.inputs.require(this.#outputName("LOCAL_REFERENCE")),
          sourceDigest: spec.sourceDigest,
        }, spec, deploymentCallContext("deploy"));
        return {
          outputs: { [this.#outputName("REFERENCE")]: image.reference },
          environmentVariables: { [this.deployedImageEnvironmentVariable]: image.reference },
        };
      },
    };
  }

  abstract create(...args: Parameters<ComputerProvider["create"]>): ReturnType<ComputerProvider["create"]>;
  abstract get(...args: Parameters<ComputerProvider["get"]>): ReturnType<ComputerProvider["get"]>;
  abstract wake(...args: Parameters<ComputerProvider["wake"]>): ReturnType<ComputerProvider["wake"]>;
  abstract sleep(...args: Parameters<ComputerProvider["sleep"]>): ReturnType<ComputerProvider["sleep"]>;
  abstract delete(...args: Parameters<ComputerProvider["delete"]>): ReturnType<ComputerProvider["delete"]>;
  abstract exec(...args: Parameters<ComputerProvider["exec"]>): ReturnType<ComputerProvider["exec"]>;
  abstract readFile(...args: Parameters<ComputerProvider["readFile"]>): ReturnType<ComputerProvider["readFile"]>;
  abstract writeFile(...args: Parameters<ComputerProvider["writeFile"]>): ReturnType<ComputerProvider["writeFile"]>;
  abstract screenshot(...args: Parameters<ComputerProvider["screenshot"]>): ReturnType<ComputerProvider["screenshot"]>;
  abstract input(...args: Parameters<ComputerProvider["input"]>): ReturnType<ComputerProvider["input"]>;
  abstract vnc(...args: Parameters<ComputerProvider["vnc"]>): ReturnType<ComputerProvider["vnc"]>;

  injectPromptPart(_context: ComputerPromptContext, _callContext: ComputerCallContext): ComputerPromptPart {
    return {
      id: `computer:${this.providerId}`,
      priority: 50,
      cache: "session",
      content: [
        "OpenBot computer:",
        "- The computer is one isolated, resumable Linux workspace shared by this installation's agents.",
        "- Inspect before changing, use explicit paths, and verify consequential actions.",
        "- Prefer command and file tools for precise work; use desktop input only when the workflow is graphical.",
        "- Control-plane credentials are not available inside the computer.",
      ].join("\n"),
    };
  }

  registerTools(context: RegisterComputerToolsContext): readonly RegisteredComputerTool[] {
    const call = (suffix: string): ComputerCallContext => ({ requestId: context.requestId ?? `computer-tool:${suffix}`, agentId: context.agentId });
    return [
      asRegisteredComputerTool("computer_exec", {
        name: "Run computer command",
        description: "Run one command in the OpenBot computer workspace.",
        input_schema: {
          type: "object",
          properties: {
            command: { type: "string" },
            arguments: { type: "array", items: { type: "string" } },
            cwd: { type: "string" },
            timeout_ms: { type: "integer", minimum: 1, maximum: 1_200_000 },
          },
          required: ["command"],
          additionalProperties: false,
        },
      }, tool({
        description: "Run one command in the OpenBot computer workspace.",
        inputSchema: z.object({ command: z.string().min(1), arguments: z.array(z.string()).optional(), cwd: z.string().optional(), timeout_ms: z.number().int().positive().max(1_200_000).optional() }),
        execute: async (input) => this.exec(context.computerId, { command: input.command, args: input.arguments, cwd: input.cwd, timeoutMs: input.timeout_ms }, call("exec")),
      })),
      asRegisteredComputerTool("computer_read_file", {
        name: "Read computer file",
        description: "Read a file from the OpenBot computer workspace as base64.",
        input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      }, tool({
        description: "Read a file from the OpenBot computer workspace as base64.",
        inputSchema: z.object({ path: z.string().min(1) }),
        execute: async ({ path }) => ({ content_base64: Buffer.from(await this.readFile(context.computerId, path, call("read-file"))).toString("base64") }),
      })),
      asRegisteredComputerTool("computer_write_file", {
        name: "Write computer file",
        description: "Write base64 content to a file in the OpenBot computer workspace.",
        input_schema: {
          type: "object",
          properties: { path: { type: "string" }, content_base64: { type: "string", contentEncoding: "base64" } },
          required: ["path", "content_base64"],
          additionalProperties: false,
        },
      }, tool({
        description: "Write base64 content to a file in the OpenBot computer workspace.",
        inputSchema: z.object({ path: z.string().min(1), content_base64: z.string() }),
        execute: async ({ path, content_base64 }) => {
          const content = Buffer.from(content_base64, "base64");
          await this.writeFile(context.computerId, path, content, call("write-file"));
          return { bytes_written: content.byteLength };
        },
      })),
      asRegisteredComputerTool("computer_screenshot", {
        name: "Capture computer screenshot",
        description: "Capture the current OpenBot computer desktop as PNG base64.",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      }, tool({
        description: "Capture the current OpenBot computer desktop as PNG base64.",
        inputSchema: z.object({}),
        execute: async () => ({ media_type: "image/png", content_base64: Buffer.from(await this.screenshot(context.computerId, call("screenshot"))).toString("base64") }),
      })),
      asRegisteredComputerTool("computer_input", {
        name: "Control computer desktop",
        description: "Send a bounded mouse or keyboard action to the OpenBot computer desktop.",
        input_schema: {
          oneOf: [
            { type: "object", properties: { action: { const: "mouse_move" }, x: { type: "integer" }, y: { type: "integer" } }, required: ["action", "x", "y"], additionalProperties: false },
            { type: "object", properties: { action: { const: "click" }, button: { type: "integer", enum: [1, 2, 3] } }, required: ["action"], additionalProperties: false },
            { type: "object", properties: { action: { const: "type" }, text: { type: "string" }, delay_ms: { type: "integer", minimum: 0 } }, required: ["action", "text"], additionalProperties: false },
            { type: "object", properties: { action: { const: "key" }, key: { type: "string" } }, required: ["action", "key"], additionalProperties: false },
          ],
        },
      }, tool({
        description: "Send a bounded mouse or keyboard action to the OpenBot computer desktop.",
        inputSchema: z.discriminatedUnion("action", [
          z.object({ action: z.literal("mouse_move"), x: z.number().int(), y: z.number().int() }),
          z.object({ action: z.literal("click"), button: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() }),
          z.object({ action: z.literal("type"), text: z.string(), delay_ms: z.number().int().nonnegative().optional() }),
          z.object({ action: z.literal("key"), key: z.string().min(1) }),
        ]),
        execute: async (input) => {
          await this.input(context.computerId, normalizeInput(input), call("input"));
          return { accepted: true };
        },
      })),
    ] as readonly RegisteredComputerTool[];
  }

  async deployAgentWorkspaces(request: DeployAgentWorkspacesRequest, context: DeploymentContext): Promise<void> {
    const call: ComputerCallContext = { requestId: "computer:deploy-agent-workspaces" };
    let computer;
    try {
      computer = await this.get(request.computerId, call);
    } catch (error) {
      if (!(error instanceof ComputerProviderError) || error.code !== "not_found") throw error;
      const image = context.inputs.environmentVariables()[this.deployedImageEnvironmentVariable] ?? context.environment[this.deployedImageEnvironmentVariable];
      computer = await this.create({ id: request.computerId, ...(image ? { image } : {}) }, call);
    }
    if (computer.state === "sleeping") await this.wake(computer.id, call);
    for (const workspace of request.workspaces) await this.#registerAgentWorkspace(computer.id, workspace, call);
  }

  async deployDevelopmentSandbox(request: DeployDevelopmentSandboxRequest, context: DeploymentContext) {
    const call: ComputerCallContext = { requestId: "computer:deploy-development-sandbox" };
    const image = context.inputs.environmentVariables()[this.deployedImageEnvironmentVariable] ?? context.environment[this.deployedImageEnvironmentVariable];
    let computer;
    try {
      computer = await this.get(request.computerId, call);
    } catch (error) {
      if (!(error instanceof ComputerProviderError) || error.code !== "not_found") throw error;
      computer = await this.create({
        id: request.computerId,
        ...(image ? { image } : {}),
        labels: { role: "openbot-development-sandbox" },
      }, call);
    }
    if (computer.state === "sleeping") await this.wake(computer.id, call);

    const stateRoot = "/workspace/.openbot/development";
    const sourceRoot = "/workspace/openbot";
    const sourceMarker = `${stateRoot}/source-initialized`;
    let result = await this.exec(computer.id, { command: "mkdir", args: ["-p", stateRoot, sourceRoot] }, call);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not prepare the development sandbox: ${result.stderr}`);

    result = await this.exec(computer.id, { command: "test", args: ["-f", sourceMarker] }, call);
    if (result.exitCode !== 0) {
      await this.#writeComputerFiles(computer.id, await developmentSandboxSourceFiles(context.repositoryRoot), call);
      await this.writeFile(computer.id, sourceMarker, new TextEncoder().encode(await renderMarker("seeded")), call);
    }

    const environment = sandboxDeploymentEnvironment(context.inputs);
    if (!environment.SOPS_AGE_KEY) throw new ComputerProviderError("invalid_configuration", "The trusted development sandbox requires the sandbox SOPS age identity");
    const environmentFile = `${stateRoot}/environment.sh`;
    const renderedEnvironment = await renderFileTemplatePath(computerImageAssets.developmentEnvironment, {
      ENVIRONMENT_EXPORTS: shellEnvironmentExports(environment),
    });
    await this.writeFile(computer.id, environmentFile, new TextEncoder().encode(renderedEnvironment), call);
    result = await this.exec(computer.id, { command: "chmod", args: ["0600", environmentFile] }, call);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not protect the development sandbox environment: ${result.stderr}`);

    result = await this.exec(computer.id, {
      command: "/usr/local/bin/setup-openbot-development",
      args: [environmentFile, sourceRoot],
      timeoutMs: 1_200_000,
    }, call);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not initialize the development sandbox: ${result.stderr}`);
    return {
      outputs: { "development-sandbox.computer-id": computer.id },
      environmentVariables: { OPENBOT_DEVELOPMENT_SANDBOX_ID: computer.id },
    };
  }

  async #registerAgentWorkspace(computerId: string, workspace: ComputerAgentWorkspace, context: ComputerCallContext): Promise<void> {
    const root = agentWorkspaceRoot(workspace.agentId);
    const marker = `${root}/.openbot-agent`;
    const username = agentLinuxUsername(workspace.agentId);
    let result = await this.exec(computerId, { command: "id", args: ["-u", username] }, context);
    if (result.exitCode !== 0) {
      result = await this.exec(computerId, { command: "useradd", args: ["--create-home", "--home-dir", root, "--shell", "/bin/bash", username] }, context);
      if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not register Linux user for agent ${workspace.agentId}: ${result.stderr}`);
    }
    result = await this.exec(computerId, { command: "mkdir", args: ["-p", root] }, context);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not create workspace for agent ${workspace.agentId}: ${result.stderr}`);
    result = await this.exec(computerId, { command: "chown", args: ["-R", `${username}:${username}`, root] }, context);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not assign workspace ownership for agent ${workspace.agentId}: ${result.stderr}`);
    result = await this.exec(computerId, { command: "chmod", args: ["0700", root] }, context);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not protect workspace for agent ${workspace.agentId}: ${result.stderr}`);
    result = await this.exec(computerId, { command: "test", args: ["-f", marker] }, context);
    if (result.exitCode === 0) return;
    for (const file of workspace.files) {
      const destination = `${root}/${agentWorkspaceRelativePath(file.path)}`;
      result = await this.exec(computerId, { command: "mkdir", args: ["-p", posix.dirname(destination)] }, context);
      if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not create workspace directory for agent ${workspace.agentId}: ${result.stderr}`);
      await this.writeFile(computerId, destination, file.content, context);
      if (file.executable) await this.exec(computerId, { command: "chmod", args: ["0755", destination] }, context);
    }
    await this.writeFile(computerId, marker, new TextEncoder().encode(await renderMarker(workspace.agentId)), context);
    result = await this.exec(computerId, { command: "chown", args: ["-R", `${username}:${username}`, root] }, context);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not assign workspace ownership for agent ${workspace.agentId}: ${result.stderr}`);
  }

  async #writeComputerFiles(computerId: string, files: readonly ComputerSeedFile[], context: ComputerCallContext): Promise<void> {
    for (const file of files) {
      const destination = computerWorkspacePath(file.path);
      const result = await this.exec(computerId, { command: "mkdir", args: ["-p", posix.dirname(destination)] }, context);
      if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not create development source directory: ${result.stderr}`);
      await this.writeFile(computerId, destination, file.content, context);
      if (file.executable) {
        const chmod = await this.exec(computerId, { command: "chmod", args: ["0755", destination] }, context);
        if (chmod.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Could not preserve executable source mode: ${chmod.stderr}`);
      }
    }
  }

  async buildImage(spec: ComputerImageSpec, context: ComputerCallContext): Promise<BuiltComputerImage> {
    ensureDigest(spec.sourceDigest);
    const tag = `${spec.tagPrefix ?? "openbot-computer"}-${spec.sourceDigest.slice("sha256:".length, "sha256:".length + 12)}`;
    const localReference = `${spec.repository}:${tag}`;
    const args = ["build", "--file", spec.dockerfilePath, "--tag", localReference, "--label", `org.openbot.computer.source-digest=${spec.sourceDigest}`];
    for (const [name, value] of Object.entries(spec.buildArguments ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      args.push("--build-arg", `${name}=${value}`);
    }
    args.push(spec.contextDirectory);
    await runDocker(args, context);
    return { sourceDigest: spec.sourceDigest, localReference };
  }

  async publishImage(image: BuiltComputerImage, spec: ComputerImageSpec, context: ComputerCallContext): Promise<PublishedComputerImage> {
    ensureDigest(image.sourceDigest);
    const tag = `${spec.tagPrefix ?? "openbot-computer"}-${image.sourceDigest.slice("sha256:".length, "sha256:".length + 12)}`;
    const reference = `${spec.repository}:${tag}`;
    if (reference !== image.localReference) await runDocker(["tag", image.localReference, reference], context);
    await runDocker(["push", reference], context);
    return { ...image, reference, publishedAt: new Date() };
  }

  #imageRepository(context: DeploymentContext): string {
    const repository = this.#imageDeployment.repository ?? context.environment.OPENBOT_COMPUTER_IMAGE_REPOSITORY;
    if (!repository?.trim()) throw new ComputerProviderError("invalid_configuration", "OPENBOT_COMPUTER_IMAGE_REPOSITORY is required to build and deploy computer images");
    if (repository.includes("://") || /\s/.test(repository)) throw new ComputerProviderError("invalid_configuration", "Computer image repository must be an OCI repository without a URL scheme or whitespace");
    const normalized = repository.trim().replace(/\/$/, "");
    if (normalized.includes("@") || normalized.slice(normalized.lastIndexOf("/") + 1).includes(":")) {
      throw new ComputerProviderError("invalid_configuration", "Computer image repository must not include an image tag or digest");
    }
    return normalized;
  }

  #imageSpec(
    context: DeploymentContext,
    materialized: { contextDirectory: string; dockerfilePath: string; sourceDigest: string },
  ): ComputerImageSpec {
    return {
      ...materialized,
      repository: this.#imageRepository(context),
      ...(this.#imageDeployment.tagPrefix ? { tagPrefix: this.#imageDeployment.tagPrefix } : {}),
      ...(this.#imageDeployment.buildArguments ? { buildArguments: this.#imageDeployment.buildArguments } : {}),
    };
  }

  #outputName(suffix: string): string {
    return `OPENBOT_${this.providerId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}_IMAGE_${suffix}`;
  }
}

async function renderMarker(value: string): Promise<string> {
  return renderFileTemplatePath(computerImageAssets.marker, { VALUE: value });
}

export function randomCapability(): string {
  return randomBytes(32).toString("base64url");
}

export function deterministicComputerId(prefix: string, requested?: string): string {
  if (requested) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(requested)) throw new ComputerProviderError("invalid_configuration", "Computer id is invalid");
    return requested;
  }
  return `${prefix}-${randomBytes(12).toString("hex")}`;
}

export function imageSourceDigest(parts: readonly (string | Uint8Array)[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return `sha256:${hash.digest("hex")}`;
}

export function computerWorkspacePath(path: string, agentId?: string): string {
  const relative = path.startsWith("/workspace/") ? path.slice("/workspace/".length) : path === "/workspace" ? "." : path;
  if (!relative || relative.startsWith("/") || relative.includes("\0")) throw new ComputerProviderError("permission_denied", "Computer path must be inside /workspace");
  const normalized = posix.normalize(relative);
  if (normalized === ".." || normalized.startsWith("../")) throw new ComputerProviderError("permission_denied", "Computer path escapes /workspace");
  const root = agentId ? agentWorkspaceRoot(agentId) : "/workspace";
  return normalized === "." ? root : `${root}/${normalized}`;
}

export function scopeComputerExecRequest(request: ComputerExecRequest, agentId?: string): ComputerExecRequest {
  if (!agentId) return request;
  const username = agentLinuxUsername(agentId);
  const root = agentWorkspaceRoot(agentId);
  return {
    command: "/usr/local/bin/openbot-agent-exec",
    args: [
      root,
      username,
      logicalComputerWorkspacePath(request.cwd ?? "/workspace"),
      ...Object.entries(request.environment ?? {}).map(([name, value]) => `${name}=${value}`),
      request.command,
      ...(request.args ?? []),
    ],
    timeoutMs: request.timeoutMs,
  };
}

export function logicalComputerWorkspacePath(path: string): string {
  const relative = workspaceRelativePath(path);
  return relative === "." ? "/workspace" : `/workspace/${relative}`;
}

export function agentWorkspaceRoot(agentId: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(agentId)) throw new ComputerProviderError("invalid_configuration", `Invalid agent id: ${agentId}`);
  return `/workspace/.openbot/agents/${agentId}/workspace`;
}

export function agentLinuxUsername(agentId: string): string {
  return `ob_${createHash("sha256").update(agentId).digest("hex").slice(0, 16)}`;
}

function agentWorkspaceRelativePath(path: string): string {
  return workspaceRelativePath(path);
}

function workspaceRelativePath(path: string): string {
  const relative = path.startsWith("/workspace/") ? path.slice("/workspace/".length) : path === "/workspace" ? "." : path;
  if (!relative || relative.startsWith("/") || relative.includes("\0")) throw new ComputerProviderError("permission_denied", "Computer path must be inside /workspace");
  const normalized = posix.normalize(relative);
  if (normalized === ".." || normalized.startsWith("../")) throw new ComputerProviderError("permission_denied", "Computer path escapes /workspace");
  return normalized;
}

async function runDocker(args: string[], context: ComputerCallContext): Promise<void> {
  try {
    await execute("docker", args, { signal: context.signal, timeout: deadlineTimeout(context), maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const failure = error as Error & { stderr?: string };
    throw new ComputerProviderError("provider_unavailable", `Computer image command failed: ${failure.stderr?.trim() || failure.message}`);
  }
}

function deploymentCallContext(phase: string): ComputerCallContext {
  return { requestId: `computer-image:${phase}` };
}

function deadlineTimeout(context: ComputerCallContext): number | undefined {
  if (!context.deadline) return undefined;
  const timeout = context.deadline.getTime() - Date.now();
  if (timeout <= 0) throw new ComputerProviderError("deadline_exceeded", "Computer provider deadline has passed");
  return timeout;
}

function ensureDigest(digest: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new ComputerProviderError("invalid_configuration", "Computer image source digest is invalid");
}

function normalizeInput(input: { action: string; [key: string]: unknown }): ComputerInput {
  if (input.action === "mouse_move") return { action: "mouse_move", x: input.x as number, y: input.y as number };
  if (input.action === "click") return { action: "click", button: input.button as 1 | 2 | 3 | undefined };
  if (input.action === "type") return { action: "type", text: input.text as string, delayMs: input.delay_ms as number | undefined };
  return { action: "key", key: input.key as string };
}
