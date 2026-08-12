import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Sandbox as VercelSandbox } from "@vercel/sandbox";
import {
  ComputerProviderError,
  type ComputerCallContext,
  type ComputerExecRequest,
  type ComputerHandle,
  type ComputerInput,
  type ComputerSpec,
} from "@openbot/computer-provider-core";
import { BaseComputerProvider, computerWorkspacePath, deterministicComputerId } from "./base.js";
import { scopedCapability } from "./capability.js";
import { bootstrap_sh, start_sh } from "./generated-assets.js";

export class VercelSandboxComputerProvider extends BaseComputerProvider {
  readonly descriptor = {
    id: "vercel-sandbox",
    version: "1.0.0",
    displayName: "Vercel Sandbox Computer",
    capabilities: ["lifecycle", "exec", "files", "desktop", "input", "image-build", "image-publish"] as const,
  };

  readonly #instances = new Map<string, VercelSandbox>();
  readonly #handles = new Map<string, ComputerHandle>();
  readonly #specs = new Map<string, ComputerSpec>();

  async health(_context: ComputerCallContext) {
    const configured = Boolean(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_TOKEN);
    return configured ? { healthy: true } : { healthy: false, message: "Link the Vercel project or provide Vercel credentials" };
  }

  async create(spec: ComputerSpec, context: ComputerCallContext): Promise<ComputerHandle> {
    const id = deterministicComputerId("openbot", spec.id);
    if (this.#handles.has(id)) throw new ComputerProviderError("invalid_configuration", `Computer ${id} already exists`);
    const { Sandbox } = await import("@vercel/sandbox");
    const image = spec.image ?? process.env.OPENBOT_VERCEL_COMPUTER_IMAGE;
    const sandbox = await Sandbox.create({
      name: id,
      ...(image ? { image } : { runtime: "node24" as const }),
      ports: [6080, 4101],
      timeout: 45 * 60 * 1000,
      persistent: true,
      keepLastSnapshots: { count: 1 },
      tags: { application: "openbot", component: "computer", ...(spec.labels ?? {}) },
      env: computerEnvironment(id, spec),
    });
    try {
      if (!image) await this.#installComputerService(sandbox, context);
      await seedComputer(sandbox, spec);
      await runSpecLifecycle(sandbox, spec, "create", context);
      await startComputer(sandbox, id, spec, context);
    } catch (error) {
      await sandbox.delete().catch(() => undefined);
      throw error;
    }
    const handle: ComputerHandle = { id, providerId: this.descriptor.id, state: "running", createdAt: sandbox.createdAt, image };
    this.#instances.set(id, sandbox);
    this.#handles.set(id, handle);
    this.#specs.set(id, spec);
    return handle;
  }

  async get(id: string, _context: ComputerCallContext): Promise<ComputerHandle> {
    const handle = this.#handles.get(id);
    if (handle) return handle;
    const sandbox = await this.#attach(id);
    const state = sandbox.status === "running" || sandbox.status === "pending" ? "running" : sandbox.status === "failed" || sandbox.status === "aborted" ? "failed" : "sleeping";
    const discovered: ComputerHandle = { id, providerId: this.descriptor.id, state, createdAt: sandbox.createdAt, image: sandbox.image };
    this.#handles.set(id, discovered);
    return discovered;
  }

  async wake(id: string, context: ComputerCallContext): Promise<ComputerHandle> {
    const current = await this.get(id, context);
    if (current.state === "running") return current;
    const sandbox = await this.#attach(id);
    const spec = this.#specs.get(id) ?? {};
    await runSpecLifecycle(sandbox, spec, "wake", context);
    await startComputer(sandbox, id, spec, context);
    const running = { ...current, state: "running" as const };
    this.#handles.set(id, running);
    return running;
  }

  async sleep(id: string, context: ComputerCallContext): Promise<ComputerHandle> {
    const current = await this.get(id, context);
    const sandbox = await this.#attach(id);
    await sandbox.stop();
    this.#instances.delete(id);
    const sleeping = { ...current, state: "sleeping" as const };
    this.#handles.set(id, sleeping);
    return sleeping;
  }

  async delete(id: string, context: ComputerCallContext): Promise<void> {
    await this.get(id, context);
    const sandbox = await this.#attach(id);
    await sandbox.delete();
    this.#instances.delete(id);
    this.#handles.delete(id);
    this.#specs.delete(id);
  }

  async exec(id: string, request: ComputerExecRequest, context: ComputerCallContext) {
    const output = await (await this.#attach(id)).runCommand({
      cmd: request.command,
      args: [...(request.args ?? [])],
      ...(request.cwd ? { cwd: request.cwd } : {}),
      ...(request.environment ? { env: { ...request.environment } } : {}),
      ...(request.timeoutMs ? { timeoutMs: request.timeoutMs } : {}),
      signal: context.signal,
    });
    return { exitCode: output.exitCode, stdout: await output.stdout(), stderr: await output.stderr() };
  }

  async readFile(id: string, path: string, _context: ComputerCallContext): Promise<Uint8Array> {
    const content = await (await this.#attach(id)).readFileToBuffer({ path: computerWorkspacePath(path) });
    if (!content) throw new ComputerProviderError("not_found", `Computer file ${path} was not found`);
    return content;
  }

  async writeFile(id: string, path: string, content: Uint8Array, _context: ComputerCallContext): Promise<void> {
    await (await this.#attach(id)).writeFiles([{ path: computerWorkspacePath(path), content: Buffer.from(content) }]);
  }

  async screenshot(id: string, context: ComputerCallContext): Promise<Uint8Array> {
    const result = await this.exec(id, { command: "import", args: ["-display", ":1", "-window", "root", "/tmp/openbot-screenshot.png"] }, context);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Screenshot failed: ${result.stderr}`);
    const content = await (await this.#attach(id)).readFileToBuffer({ path: "/tmp/openbot-screenshot.png" });
    if (!content) throw new ComputerProviderError("provider_unavailable", "Screenshot output was not created");
    return content;
  }

  async input(id: string, input: ComputerInput, context: ComputerCallContext): Promise<void> {
    const result = await this.exec(id, { command: "xdotool", args: inputArguments(input), environment: { DISPLAY: ":1" } }, context);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Computer input failed: ${result.stderr}`);
  }

  async vnc(id: string, context: ComputerCallContext) {
    const sandbox = await this.#attach(id);
    await this.get(id, context);
    const url = new URL("/vnc.html", sandbox.domain(6080));
    url.searchParams.set("autoconnect", "1");
    url.searchParams.set("resize", "remote");
    url.searchParams.set("token", scopedCapability("vnc", id));
    return { url, expiresAt: sandbox.expiresAt ?? new Date(Date.now() + 45 * 60 * 1000) };
  }

  async #attach(id: string): Promise<VercelSandbox> {
    const current = this.#instances.get(id);
    if (current) return current;
    try {
      const { Sandbox } = await import("@vercel/sandbox");
      const sandbox = await Sandbox.get({ name: id });
      this.#instances.set(id, sandbox);
      return sandbox;
    } catch (error) {
      throw new ComputerProviderError("not_found", `Computer ${id} was not found: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async #installComputerService(sandbox: VercelSandbox, context: ComputerCallContext): Promise<void> {
    const servicePath = fileURLToPath(new URL("../../../apps/computer-service/dist/index.js", import.meta.url));
    await access(servicePath).catch(() => { throw new ComputerProviderError("invalid_configuration", "Build @openbot/computer-service before creating a Vercel computer without a custom image"); });
    await sandbox.writeFiles([
      { path: "/opt/openbot/bootstrap.sh", content: Buffer.from(bootstrap_sh), mode: 0o755 },
      { path: "/usr/local/bin/start-openbot-computer", content: Buffer.from(start_sh), mode: 0o755 },
      { path: "/opt/openbot/computer-service.mjs", content: await readFile(servicePath), mode: 0o755 },
    ]);
    const bootstrap = await sandbox.runCommand({ cmd: "bash", args: ["/opt/openbot/bootstrap.sh"], sudo: true, signal: context.signal, timeoutMs: 20 * 60 * 1000 });
    if (bootstrap.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Computer bootstrap failed: ${(await bootstrap.stderr()).trim() || (await bootstrap.stdout()).trim()}`);
  }
}

function computerEnvironment(id: string, spec: ComputerSpec): Record<string, string> {
  return {
    CUA_DRIVER_SOCKET: "/tmp/openbot-cua-driver.sock",
    DISPLAY: ":1",
    OPENBOT_COMPUTER_CAPABILITY: scopedCapability("computer", id),
    OPENBOT_COMPUTER_EXPOSED_PORTS: "6080,4101",
    OPENBOT_COMPUTER_SERVICE_PORT: "4101",
    OPENBOT_COMPUTER_WORKSPACE: "/workspace",
    OPENBOT_VNC_CAPABILITY: scopedCapability("vnc", id),
    ...(spec.environment ?? {}),
  };
}

async function seedComputer(sandbox: VercelSandbox, spec: ComputerSpec): Promise<void> {
  if (!spec.files?.length) return;
  await sandbox.writeFiles(spec.files.map((file) => ({ path: computerWorkspacePath(file.path), content: Buffer.from(file.content), mode: file.executable ? 0o755 : 0o644 })));
}

async function runSpecLifecycle(sandbox: VercelSandbox, spec: ComputerSpec, phase: "create" | "wake", context: ComputerCallContext): Promise<void> {
  for (const script of spec.lifecycle?.filter((candidate) => candidate.phases.includes(phase)) ?? []) {
    const result = await sandbox.runCommand({ cmd: "bash", args: [computerWorkspacePath(script.path)], signal: context.signal });
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Computer lifecycle ${script.id} failed: ${(await result.stderr()).trim() || (await result.stdout()).trim()}`);
  }
}

async function startComputer(sandbox: VercelSandbox, id: string, spec: ComputerSpec, context: ComputerCallContext): Promise<void> {
  await sandbox.runCommand({
    cmd: "bash",
    args: ["/usr/local/bin/start-openbot-computer"],
    detached: true,
    sudo: true,
    env: computerEnvironment(id, spec),
    signal: context.signal,
  });
}

function inputArguments(input: ComputerInput): string[] {
  if (input.action === "mouse_move") return ["mousemove", "--sync", String(input.x), String(input.y)];
  if (input.action === "click") return ["click", String(input.button ?? 1)];
  if (input.action === "type") return ["type", "--delay", String(input.delayMs ?? 10), input.text];
  return ["key", input.key];
}
