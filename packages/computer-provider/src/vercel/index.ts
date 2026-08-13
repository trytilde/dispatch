import type { Sandbox as VercelSandbox } from "@vercel/sandbox";
import {
  ComputerProviderError,
  type ComputerCallContext,
  type ComputerExecRequest,
  type ComputerHandle,
  type ComputerImageSpec,
  type ComputerInput,
  type ComputerSpec,
} from "../core/index.js";
import type { DeploymentContext } from "@tryopenbot/runtime-provider";
import {
  BaseComputerProvider,
  computerWorkspacePath,
  deterministicComputerId,
  scopeComputerExecRequest,
  type ComputerImageDeploymentConfig,
} from "../base/index.js";
import { computerServiceApiKey, scopedCapability } from "../capability.js";

interface VercelSandboxComputerProviderOptions extends ComputerImageDeploymentConfig {
  request?: typeof fetch;
}

interface VercelRegistryIdentity {
  repository: string;
  username: string;
}

export class VercelSandboxComputerProvider extends BaseComputerProvider {
  protected readonly providerId = "vercel-sandbox";
  protected readonly deployedImageEnvironmentVariable = "OPENBOT_VERCEL_COMPUTER_IMAGE";

  readonly #instances = new Map<string, VercelSandbox>();
  readonly #handles = new Map<string, ComputerHandle>();
  readonly #specs = new Map<string, ComputerSpec>();
  readonly #configuredRepository: string | undefined;
  readonly #request: typeof fetch;
  #registryIdentity: Promise<VercelRegistryIdentity> | undefined;

  constructor(options: VercelSandboxComputerProviderOptions = {}) {
    const { request, ...imageDeployment } = options;
    super(imageDeployment, {
      publish: true,
      buildxPlatform: "linux/amd64",
      managedRepository: true,
    });
    this.#configuredRepository = imageDeployment.repository;
    this.#request = request ?? fetch;
  }

  protected async imageRepository(
    context: DeploymentContext,
    phase: "build" | "plan" | "deploy",
  ): Promise<string> {
    if (this.#configuredRepository) return super.imageRepository(context, phase);
    if (phase === "plan") return "the agent Vercel project's Container Registry";
    if (phase === "build") return "openbot/vercel-sandbox-computer";
    return (await this.#vercelRegistryIdentity(context)).repository;
  }

  protected async authenticateImageRepository(
    context: DeploymentContext,
    _spec: ComputerImageSpec,
    callContext: ComputerCallContext,
  ): Promise<void> {
    if (this.#configuredRepository) return;
    const token = context.inputs.deploymentSecrets().VERCEL_TOKEN;
    if (!token)
      throw new ComputerProviderError(
        "invalid_configuration",
        "VERCEL_TOKEN is required to publish the Vercel Sandbox computer image",
      );
    const identity = await this.#vercelRegistryIdentity(context);
    await this.runDockerWithInput(
      ["login", "vcr.vercel.com", "--username", identity.username, "--password-stdin"],
      token,
      callContext,
    );
  }

  #vercelRegistryIdentity(context: DeploymentContext): Promise<VercelRegistryIdentity> {
    return (this.#registryIdentity ??= resolveVercelRegistryIdentity(context, this.#request));
  }

  async create(spec: ComputerSpec, context: ComputerCallContext): Promise<ComputerHandle> {
    const id = deterministicComputerId("openbot", spec.id);
    if (this.#handles.has(id))
      throw new ComputerProviderError("invalid_configuration", `Computer ${id} already exists`);
    const { Sandbox } = await import("@vercel/sandbox");
    const image = spec.image ?? process.env.OPENBOT_VERCEL_COMPUTER_IMAGE;
    if (!image)
      throw new ComputerProviderError(
        "invalid_configuration",
        "Deploy the Vercel computer provider or set OPENBOT_VERCEL_COMPUTER_IMAGE before creating a computer",
      );
    const sandbox = await Sandbox.create({
      name: id,
      image,
      ports: [6080, 4101],
      timeout: 45 * 60 * 1000,
      persistent: true,
      keepLastSnapshots: { count: 1 },
      tags: { application: "openbot", component: "computer", ...spec.labels },
      env: computerEnvironment(id, spec),
    });
    try {
      await seedComputer(sandbox, spec);
      await runSpecLifecycle(sandbox, spec, "create", context);
      await startComputer(sandbox, id, spec, context);
    } catch (error) {
      await sandbox.delete().catch(() => undefined);
      throw error;
    }
    const handle: ComputerHandle = {
      id,
      providerId: this.providerId,
      state: "running",
      createdAt: sandbox.createdAt,
      image,
    };
    this.#instances.set(id, sandbox);
    this.#handles.set(id, handle);
    this.#specs.set(id, spec);
    return handle;
  }

  async get(id: string, _context: ComputerCallContext): Promise<ComputerHandle> {
    const handle = this.#handles.get(id);
    if (handle) return handle;
    const sandbox = await this.#attach(id);
    const state =
      sandbox.status === "running" || sandbox.status === "pending"
        ? "running"
        : sandbox.status === "failed" || sandbox.status === "aborted"
          ? "failed"
          : "sleeping";
    const discovered: ComputerHandle = {
      id,
      providerId: this.providerId,
      state,
      createdAt: sandbox.createdAt,
      image: sandbox.image,
    };
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
    const scoped = scopeComputerExecRequest(request, context.agentId);
    const output = await (
      await this.#attach(id)
    ).runCommand({
      cmd: scoped.command,
      args: [...(scoped.args ?? [])],
      ...(scoped.cwd ? { cwd: scoped.cwd } : {}),
      ...(scoped.environment ? { env: { ...scoped.environment } } : {}),
      ...(scoped.timeoutMs ? { timeoutMs: scoped.timeoutMs } : {}),
      signal: context.signal,
    });
    return {
      exitCode: output.exitCode,
      stdout: await output.stdout(),
      stderr: await output.stderr(),
    };
  }

  async readFile(id: string, path: string, _context: ComputerCallContext): Promise<Uint8Array> {
    const content = await (
      await this.#attach(id)
    ).readFileToBuffer({ path: computerWorkspacePath(path, _context.agentId) });
    if (!content)
      throw new ComputerProviderError("not_found", `Computer file ${path} was not found`);
    return content;
  }

  async writeFile(
    id: string,
    path: string,
    content: Uint8Array,
    _context: ComputerCallContext,
  ): Promise<void> {
    await (
      await this.#attach(id)
    ).writeFiles([
      { path: computerWorkspacePath(path, _context.agentId), content: Buffer.from(content) },
    ]);
  }

  async screenshot(id: string, context: ComputerCallContext): Promise<Uint8Array> {
    const result = await this.exec(
      id,
      {
        command: "import",
        args: ["-display", ":1", "-window", "root", "/tmp/openbot-screenshot.png"],
      },
      context,
    );
    if (result.exitCode !== 0)
      throw new ComputerProviderError(
        "provider_unavailable",
        `Screenshot failed: ${result.stderr}`,
      );
    const content = await (
      await this.#attach(id)
    ).readFileToBuffer({ path: "/tmp/openbot-screenshot.png" });
    if (!content)
      throw new ComputerProviderError("provider_unavailable", "Screenshot output was not created");
    return content;
  }

  async input(id: string, input: ComputerInput, context: ComputerCallContext): Promise<void> {
    const result = await this.exec(
      id,
      { command: "xdotool", args: inputArguments(input), environment: { DISPLAY: ":1" } },
      context,
    );
    if (result.exitCode !== 0)
      throw new ComputerProviderError(
        "provider_unavailable",
        `Computer input failed: ${result.stderr}`,
      );
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

  protected async computerServiceUrl(id: string): Promise<string> {
    const sandbox = await this.#attach(id);
    return new URL("/rpc", sandbox.domain(4101)).toString().replace(/\/$/, "");
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
      throw new ComputerProviderError(
        "not_found",
        `Computer ${id} was not found: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}

async function resolveVercelRegistryIdentity(
  context: DeploymentContext,
  request: typeof fetch = fetch,
): Promise<VercelRegistryIdentity> {
  const token = context.inputs.deploymentSecrets().VERCEL_TOKEN;
  if (!token)
    throw new ComputerProviderError(
      "invalid_configuration",
      "VERCEL_TOKEN is required to resolve the Vercel Container Registry",
    );
  const project = context.environment.OPENBOT_VERCEL_AGENT_PROJECT?.trim();
  if (!project)
    throw new ComputerProviderError(
      "invalid_configuration",
      "OPENBOT_VERCEL_AGENT_PROJECT is required to resolve the Vercel Container Registry",
    );
  const team = context.environment.VERCEL_TEAM_ID?.trim();
  const url = team
    ? `https://api.vercel.com/v2/teams/${encodeURIComponent(team)}`
    : "https://api.vercel.com/v2/user";
  const response = await request(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok)
    throw new ComputerProviderError(
      "provider_unavailable",
      `Could not resolve the Vercel registry scope (${response.status})`,
    );
  const body = (await response.json()) as {
    id?: unknown;
    slug?: unknown;
    username?: unknown;
    user?: { id?: unknown; username?: unknown };
  };
  const account = body.user ?? body;
  const slug = team ? body.slug : account.username;
  const username = team ? body.id : account.id;
  if (typeof slug !== "string" || !slug || typeof username !== "string" || !username)
    throw new ComputerProviderError(
      "provider_unavailable",
      "Vercel did not return the account identity required for its Container Registry",
    );
  return {
    repository: `vcr.vercel.com/${slug}/${project}/openbot-computer`,
    username,
  };
}

function computerEnvironment(id: string, spec: ComputerSpec): Record<string, string> {
  return {
    CUA_DRIVER_SOCKET: "/tmp/openbot-cua-driver.sock",
    DISPLAY: ":1",
    OPENBOT_COMPUTER_SERVICE_API_KEY: computerServiceApiKey(),
    OPENBOT_COMPUTER_EXPOSED_PORTS: "6080,4101",
    OPENBOT_COMPUTER_SERVICE_PORT: "4101",
    OPENBOT_COMPUTER_WORKSPACE: "/workspace",
    OPENBOT_VNC_CAPABILITY: scopedCapability("vnc", id),
    ...spec.environment,
  };
}

async function seedComputer(sandbox: VercelSandbox, spec: ComputerSpec): Promise<void> {
  if (!spec.files?.length) return;
  await sandbox.writeFiles(
    spec.files.map((file) => ({
      path: computerWorkspacePath(file.path),
      content: Buffer.from(file.content),
      mode: file.executable ? 0o755 : 0o644,
    })),
  );
}

async function runSpecLifecycle(
  sandbox: VercelSandbox,
  spec: ComputerSpec,
  phase: "create" | "wake",
  context: ComputerCallContext,
): Promise<void> {
  for (const script of spec.lifecycle?.filter((candidate) => candidate.phases.includes(phase)) ??
    []) {
    const result = await sandbox.runCommand({
      cmd: "bash",
      args: [computerWorkspacePath(script.path)],
      signal: context.signal,
    });
    if (result.exitCode !== 0)
      throw new ComputerProviderError(
        "provider_unavailable",
        `Computer lifecycle ${script.id} failed: ${(await result.stderr()).trim() || (await result.stdout()).trim()}`,
      );
  }
}

async function startComputer(
  sandbox: VercelSandbox,
  id: string,
  spec: ComputerSpec,
  context: ComputerCallContext,
): Promise<void> {
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
  if (input.action === "mouse_move")
    return ["mousemove", "--sync", String(input.x), String(input.y)];
  if (input.action === "click") return ["click", String(input.button ?? 1)];
  if (input.action === "type") return ["type", "--delay", String(input.delayMs ?? 10), input.text];
  return ["key", input.key];
}
