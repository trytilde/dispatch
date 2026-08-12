import type {
  ProviderCallContext,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "@openbot/provider-sdk";
import { ProviderError } from "@openbot/provider-sdk";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { desktopBootstrapScript, desktopStartScript } from "./sandbox-bootstrap.js";
import { sandboxCapability } from "./capabilities.js";

type MicroSandbox = Awaited<ReturnType<typeof import("microsandbox")["Sandbox"]["startDetached"]>>;

export class MicrosandboxProvider implements SandboxProvider {
  readonly descriptor = {
    id: "microsandbox",
    version: "1.0.0",
    displayName: "Microsandbox",
    kind: "sandbox" as const,
    capabilities: ["exec", "files", "volumes", "ports", "desktop", "checkpoint"] as const,
  };

  readonly #instances = new Map<string, MicroSandbox>();
  readonly #handles = new Map<string, SandboxHandle>();
  readonly #desktopPorts = new Map<string, number>();
  readonly #desktopCapabilities = new Map<string, string>();

  async health(_context: ProviderCallContext) {
    if (process.platform === "darwin" && process.arch !== "arm64") {
      return { healthy: false, message: "Local Microsandbox requires Apple Silicon on macOS" };
    }
    if (process.platform !== "darwin" && process.platform !== "linux") {
      return { healthy: false, message: "Local Microsandbox supports macOS and Linux" };
    }
    return { healthy: true };
  }

  injectSystemPrompt() {
    return [
      "Local OpenBot computer (Microsandbox):",
      "- The computer is an isolated Linux workspace. Prefer precise command and file operations; use its desktop only for graphical workflows.",
      "- Inspect before changing, scope commands to explicit paths, and verify results inside the sandbox.",
      "- Control-plane secrets are not available in the sandbox. Do not ask for or copy broad provider credentials into it.",
    ].join("\n");
  }

  async create(spec: SandboxSpec, _context: ProviderCallContext): Promise<SandboxHandle> {
    const { Sandbox } = await import("microsandbox");
    const id = `openbot-${randomUUID()}`;
    const desktopPort = await availablePort(6080);
    const boxPort = await availablePort(4101);
    const desktopCapability = sandboxCapability("desktop", id);
    const boxCapability = sandboxCapability("box", id);
    const boxHostBundle = fileURLToPath(new URL("../../../apps/box-host/dist/index.js", import.meta.url));
    await access(boxHostBundle).catch(() => {
      throw new ProviderError("invalid_configuration", "Build @openbot/box-host before creating a Microsandbox");
    });
    const sandbox = await Sandbox.builder(id)
      .image(spec.image ?? process.env.OPENBOT_MICROSANDBOX_IMAGE ?? "debian:bookworm")
      .cpus(2)
      .memory(4096)
      .rootDisk(12_288)
      .portBind("127.0.0.1", desktopPort, 6080)
      .portBind("127.0.0.1", boxPort, 4101)
      .volume("/workspace", (mount) => mount.namedWith("openbot-workspace", "ensure-exists", "dir", undefined, 8192))
      .envs({
        CUA_DRIVER_SOCKET: "/tmp/openbot-cua-driver.sock",
        DISPLAY: ":1",
        OPENBOT_BOX_CAPABILITY: boxCapability,
        OPENBOT_BOX_PORT: "4101",
        OPENBOT_DESKTOP_CAPABILITY: desktopCapability,
        OPENBOT_EXPOSED_PORTS: "6080,4101",
        OPENBOT_WORKSPACE: "/workspace",
        ...(spec.repository?.environment ?? {}),
      })
      .scripts({
        "bootstrap-openbot-desktop": desktopBootstrapScript,
        "start-openbot-desktop": desktopStartScript,
      })
      .patch((root) => root.mkdir("/opt/openbot").copyFile(boxHostBundle, "/opt/openbot/box-host.mjs", { mode: 0o755 }))
      .detached(true)
      .create();
    const bootstrap = await sandbox.exec("bash", ["/.msb/scripts/bootstrap-openbot-desktop"]);
    if (!bootstrap.success) {
      await sandbox.stop().catch(() => undefined);
      throw new ProviderError("provider_unavailable", `Desktop bootstrap failed: ${bootstrap.stderr() || bootstrap.stdout()}`);
    }
    try {
      await seedRepository(sandbox, spec);
      const start = await sandbox.exec("bash", ["-lc", "nohup /usr/local/bin/start-openbot-desktop >/var/log/openbot-desktop.log 2>&1 </dev/null &"]);
      if (!start.success) throw new ProviderError("provider_unavailable", `Desktop start failed: ${start.stderr() || start.stdout()}`);
    } catch (error) {
      await sandbox.stop().catch(() => undefined);
      throw error;
    }
    const handle: SandboxHandle = {
      id,
      providerId: this.descriptor.id,
      state: "running",
      createdAt: new Date(),
    };
    this.#instances.set(id, sandbox);
    this.#handles.set(id, handle);
    this.#desktopPorts.set(id, desktopPort);
    this.#desktopCapabilities.set(id, desktopCapability);
    return handle;
  }

  async get(id: string, _context: ProviderCallContext): Promise<SandboxHandle> {
    const handle = this.#handles.get(id);
    if (!handle) throw new ProviderError("not_found", `Sandbox ${id} is not attached to this process`);
    return handle;
  }

  async exec(id: string, command: string, args: readonly string[], _context: ProviderCallContext) {
    const sandbox = this.#instances.get(id);
    if (!sandbox) throw new ProviderError("not_found", `Sandbox ${id} is not attached to this process`);
    const output = await sandbox.exec(command, args);
    return { exitCode: output.code, stdout: output.stdout(), stderr: output.stderr() };
  }

  async desktop(id: string, _context: ProviderCallContext) {
    const port = this.#desktopPorts.get(id);
    const capability = this.#desktopCapabilities.get(id);
    if (!port || !capability) throw new ProviderError("not_found", `Sandbox ${id} has no desktop port`);
    const url = new URL(`http://127.0.0.1:${port}/vnc.html`);
    url.searchParams.set("autoconnect", "1");
    url.searchParams.set("resize", "remote");
    url.searchParams.set("token", capability);
    return { url, expiresAt: new Date(Date.now() + 86_400_000) };
  }

  async checkpoint(id: string, context: ProviderCallContext): Promise<SandboxHandle> {
    const handle = await this.get(id, context);
    return { ...handle, checkpointId: `microsandbox:${id}` };
  }

  async stop(id: string, context: ProviderCallContext): Promise<SandboxHandle> {
    const sandbox = this.#instances.get(id);
    const handle = await this.get(id, context);
    await sandbox?.stop();
    this.#instances.delete(id);
    const stopped = { ...handle, state: "stopped" as const };
    this.#handles.set(id, stopped);
    return stopped;
  }
}

async function seedRepository(sandbox: MicroSandbox, spec: SandboxSpec): Promise<void> {
  if (!spec.repository) return;
  const fs = sandbox.fs();
  for (const asset of spec.repository.assets) {
    const destination = `/workspace/${asset.path}`;
    await sandbox.exec("mkdir", ["-p", destination.slice(0, destination.lastIndexOf("/")) || "/workspace"]);
    await fs.write(destination, Buffer.from(asset.contentBase64, "base64"));
    await sandbox.exec("chmod", [asset.executable ? "0755" : "0644", destination]);
  }
  if (spec.repository.bootstrap) {
    await fs.write("/opt/openbot/repository-bootstrap", spec.repository.bootstrap);
    await sandbox.exec("chmod", ["0755", "/opt/openbot/repository-bootstrap"]);
    const result = await sandbox.exec("bash", ["-lc", "cd /workspace && /opt/openbot/repository-bootstrap"]);
    if (!result.success) throw new ProviderError("provider_unavailable", "Repository sandbox bootstrap failed; inspect the sandbox bootstrap log");
  }
}

async function availablePort(start: number): Promise<number> {
  const { createServer } = await import("node:net");
  for (let port = start; port < start + 100; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new ProviderError("provider_unavailable", "No local desktop port is available");
}
