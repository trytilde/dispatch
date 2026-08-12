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
  type ComputerImageSpec,
  type ComputerInput,
  type ComputerPromptContext,
  type ComputerProvider,
  type ComputerProviderDescriptor,
  type ComputerPromptPart,
  type PublishedComputerImage,
  type RegisteredComputerTool,
  type RegisterComputerToolsContext,
} from "@openbot/computer-provider-core";

const execute = promisify(execFile);

export abstract class BaseComputerProvider implements ComputerProvider {
  abstract readonly descriptor: ComputerProviderDescriptor;
  abstract health(context: ComputerCallContext): Promise<{ healthy: boolean; message?: string }>;
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
      id: `computer:${this.descriptor.id}`,
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
    const call = (suffix: string): ComputerCallContext => ({ requestId: context.requestId ?? `computer-tool:${suffix}` });
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

export function computerWorkspacePath(path: string): string {
  const relative = path.startsWith("/workspace/") ? path.slice("/workspace/".length) : path === "/workspace" ? "." : path;
  if (!relative || relative.startsWith("/") || relative.includes("\0")) throw new ComputerProviderError("permission_denied", "Computer path must be inside /workspace");
  const normalized = posix.normalize(relative);
  if (normalized === ".." || normalized.startsWith("../")) throw new ComputerProviderError("permission_denied", "Computer path escapes /workspace");
  return normalized === "." ? "/workspace" : `/workspace/${normalized}`;
}

async function runDocker(args: string[], context: ComputerCallContext): Promise<void> {
  try {
    await execute("docker", args, { signal: context.signal, timeout: deadlineTimeout(context), maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const failure = error as Error & { stderr?: string };
    throw new ComputerProviderError("provider_unavailable", `Computer image command failed: ${failure.stderr?.trim() || failure.message}`);
  }
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
