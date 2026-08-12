import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
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

type MicroSandbox = Awaited<ReturnType<typeof import("microsandbox")["Sandbox"]["startDetached"]>>;

export class MicrosandboxComputerProvider extends BaseComputerProvider {
  readonly descriptor = {
    id: "microsandbox",
    version: "1.0.0",
    displayName: "Microsandbox Computer",
    capabilities: ["lifecycle", "exec", "files", "desktop", "input", "image-build", "image-publish"] as const,
  };

  readonly #instances = new Map<string, MicroSandbox>();
  readonly #handles = new Map<string, ComputerHandle>();
  readonly #specs = new Map<string, ComputerSpec>();
  readonly #desktopPorts = new Map<string, number>();

  async health(_context: ComputerCallContext) {
    if (process.platform === "darwin" && process.arch !== "arm64") return { healthy: false, message: "Microsandbox requires Apple Silicon on macOS" };
    if (process.platform !== "darwin" && process.platform !== "linux") return { healthy: false, message: "Microsandbox supports macOS and Linux" };
    return { healthy: true };
  }

  async create(spec: ComputerSpec, context: ComputerCallContext): Promise<ComputerHandle> {
    const id = deterministicComputerId("openbot", spec.id);
    if (this.#handles.has(id)) throw new ComputerProviderError("invalid_configuration", `Computer ${id} already exists`);
    this.#specs.set(id, spec);
    return this.#start(id, spec, "create", context);
  }

  async get(id: string, _context: ComputerCallContext): Promise<ComputerHandle> {
    const handle = this.#handles.get(id);
    if (!handle) throw new ComputerProviderError("not_found", `Computer ${id} is not attached to this process`);
    return handle;
  }

  async wake(id: string, context: ComputerCallContext): Promise<ComputerHandle> {
    const current = await this.get(id, context);
    if (current.state === "running") return current;
    const spec = this.#specs.get(id);
    if (!spec) throw new ComputerProviderError("not_found", `Computer ${id} has no resumable specification`);
    return this.#start(id, spec, "wake", context);
  }

  async sleep(id: string, context: ComputerCallContext): Promise<ComputerHandle> {
    const current = await this.get(id, context);
    await this.#instances.get(id)?.stop();
    this.#instances.delete(id);
    const sleeping = { ...current, state: "sleeping" as const };
    this.#handles.set(id, sleeping);
    return sleeping;
  }

  async delete(id: string, context: ComputerCallContext): Promise<void> {
    await this.get(id, context);
    await this.#instances.get(id)?.stop().catch(() => undefined);
    this.#instances.delete(id);
    this.#handles.delete(id);
    this.#specs.delete(id);
    this.#desktopPorts.delete(id);
  }

  async exec(id: string, request: ComputerExecRequest, _context: ComputerCallContext) {
    const sandbox = this.#requiredInstance(id);
    const environment = Object.entries(request.environment ?? {}).map(([name, value]) => `${name}=${value}`);
    const output = await sandbox.exec("env", [
      ...(request.cwd ? ["--chdir", request.cwd] : []),
      ...environment,
      request.command,
      ...(request.args ?? []),
    ]);
    return { exitCode: output.code, stdout: output.stdout(), stderr: output.stderr() };
  }

  async readFile(id: string, path: string, _context: ComputerCallContext): Promise<Uint8Array> {
    return new Uint8Array(await this.#requiredInstance(id).fs().read(computerWorkspacePath(path)));
  }

  async writeFile(id: string, path: string, content: Uint8Array, _context: ComputerCallContext): Promise<void> {
    await this.#requiredInstance(id).fs().write(computerWorkspacePath(path), Buffer.from(content));
  }

  async screenshot(id: string, context: ComputerCallContext): Promise<Uint8Array> {
    const screenshotPath = "/workspace/.openbot/tool-screenshot.png";
    const result = await this.exec(id, { command: "import", args: ["-display", ":1", "-window", "root", screenshotPath] }, context);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Screenshot failed: ${result.stderr}`);
    return this.readFile(id, screenshotPath, context);
  }

  async input(id: string, input: ComputerInput, context: ComputerCallContext): Promise<void> {
    const result = await this.exec(id, { command: "xdotool", args: inputArguments(input), environment: { DISPLAY: ":1" } }, context);
    if (result.exitCode !== 0) throw new ComputerProviderError("provider_unavailable", `Computer input failed: ${result.stderr}`);
  }

  async vnc(id: string, context: ComputerCallContext) {
    await this.get(id, context);
    const port = this.#desktopPorts.get(id);
    if (!port) throw new ComputerProviderError("not_found", `Computer ${id} has no VNC port`);
    const url = new URL(`http://127.0.0.1:${port}/vnc.html`);
    url.searchParams.set("autoconnect", "1");
    url.searchParams.set("resize", "remote");
    url.searchParams.set("token", scopedCapability("vnc", id));
    return { url, expiresAt: new Date(Date.now() + 86_400_000) };
  }

  async #start(id: string, spec: ComputerSpec, phase: "create" | "wake", _context: ComputerCallContext): Promise<ComputerHandle> {
    const { Sandbox } = await import("microsandbox");
    const desktopPort = this.#desktopPorts.get(id) ?? await availablePort(6080);
    const servicePort = await availablePort(4101);
    const serviceBundle = fileURLToPath(new URL("../../../apps/computer-service/dist/index.js", import.meta.url));
    await access(serviceBundle).catch(() => { throw new ComputerProviderError("invalid_configuration", "Build @openbot/computer-service before creating a Microsandbox computer"); });

    const sandbox = await Sandbox.builder(id)
      .image(spec.image ?? process.env.OPENBOT_MICROSANDBOX_COMPUTER_IMAGE ?? "debian:bookworm")
      .cpus(2)
      .memory(4096)
      .rootDisk(12_288)
      .portBind("127.0.0.1", desktopPort, 6080)
      .portBind("127.0.0.1", servicePort, 4101)
      .volume("/workspace", (mount) => mount.namedWith("openbot-computer", "ensure-exists", "dir", undefined, 8192))
      .envs({
        CUA_DRIVER_SOCKET: "/tmp/openbot-cua-driver.sock",
        DISPLAY: ":1",
        OPENBOT_COMPUTER_CAPABILITY: scopedCapability("computer", id),
        OPENBOT_COMPUTER_EXPOSED_PORTS: "6080,4101",
        OPENBOT_COMPUTER_SERVICE_PORT: "4101",
        OPENBOT_COMPUTER_WORKSPACE: "/workspace",
        OPENBOT_VNC_CAPABILITY: scopedCapability("vnc", id),
        ...(spec.environment ?? {}),
      })
      .scripts({
        "bootstrap-openbot-computer": bootstrap_sh,
        "start-openbot-computer": start_sh,
      })
      .patch((root) => root.mkdir("/opt/openbot").copyFile(serviceBundle, "/opt/openbot/computer-service.mjs", { mode: 0o755 }))
      .detached(true)
      .create();

    try {
      const bootstrap = await sandbox.exec("bash", ["/.msb/scripts/bootstrap-openbot-computer"]);
      if (!bootstrap.success) throw new ComputerProviderError("provider_unavailable", `Computer bootstrap failed: ${bootstrap.stderr() || bootstrap.stdout()}`);
      await seedComputer(sandbox, spec);
      await runSpecLifecycle(sandbox, spec, phase);
      const start = await sandbox.exec("bash", ["-lc", "nohup /.msb/scripts/start-openbot-computer >/var/log/openbot-computer.log 2>&1 </dev/null &"]);
      if (!start.success) throw new ComputerProviderError("provider_unavailable", `Computer start failed: ${start.stderr() || start.stdout()}`);
    } catch (error) {
      await sandbox.stop().catch(() => undefined);
      throw error;
    }

    const existing = this.#handles.get(id);
    const handle: ComputerHandle = { id, providerId: this.descriptor.id, state: "running", createdAt: existing?.createdAt ?? new Date(), image: spec.image };
    this.#instances.set(id, sandbox);
    this.#handles.set(id, handle);
    this.#desktopPorts.set(id, desktopPort);
    return handle;
  }

  #requiredInstance(id: string): MicroSandbox {
    const sandbox = this.#instances.get(id);
    if (!sandbox) throw new ComputerProviderError("not_found", `Computer ${id} is sleeping or not attached`);
    return sandbox;
  }
}

async function seedComputer(sandbox: MicroSandbox, spec: ComputerSpec): Promise<void> {
  const fs = sandbox.fs();
  for (const file of spec.files ?? []) {
    const destination = computerWorkspacePath(file.path);
    await sandbox.exec("mkdir", ["-p", destination.slice(0, destination.lastIndexOf("/")) || "/workspace"]);
    await fs.write(destination, Buffer.from(file.content));
    await sandbox.exec("chmod", [file.executable ? "0755" : "0644", destination]);
  }
}

async function runSpecLifecycle(sandbox: MicroSandbox, spec: ComputerSpec, phase: "create" | "wake"): Promise<void> {
  for (const script of spec.lifecycle?.filter((candidate) => candidate.phases.includes(phase)) ?? []) {
    const path = computerWorkspacePath(script.path);
    const result = await sandbox.exec("bash", [path]);
    if (!result.success) throw new ComputerProviderError("provider_unavailable", `Computer lifecycle ${script.id} failed: ${result.stderr() || result.stdout()}`);
  }
}

async function availablePort(start: number): Promise<number> {
  for (let port = start; port < start + 100; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new ComputerProviderError("provider_unavailable", "No local computer port is available");
}

function inputArguments(input: ComputerInput): string[] {
  if (input.action === "mouse_move") return ["mousemove", "--sync", String(input.x), String(input.y)];
  if (input.action === "click") return ["click", String(input.button ?? 1)];
  if (input.action === "type") return ["type", "--delay", String(input.delayMs ?? 10), input.text];
  return ["key", input.key];
}
