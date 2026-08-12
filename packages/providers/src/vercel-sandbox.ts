import type {
  ProviderCallContext,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "@openbot/provider-sdk";
import { ProviderError } from "@openbot/provider-sdk";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { desktopBootstrapScript, desktopStartScript } from "./sandbox-bootstrap.js";
import { sandboxCapability } from "./capabilities.js";
import type { Sandbox as VercelSandbox } from "@vercel/sandbox";

export class VercelSandboxProvider implements SandboxProvider {
  readonly descriptor = {
    id: "vercel-sandbox",
    version: "1.0.0",
    displayName: "Vercel Sandbox",
    kind: "sandbox" as const,
    capabilities: ["exec", "files", "snapshots", "public-ports", "desktop"] as const,
  };

  readonly #instances = new Map<string, VercelSandbox>();
  readonly #handles = new Map<string, SandboxHandle>();
  readonly #desktopCapabilities = new Map<string, string>();

  async health(_context: ProviderCallContext) {
    const configured = Boolean(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_TOKEN);
    return configured
      ? { healthy: true }
      : { healthy: false, message: "Link the Vercel project or provide Vercel credentials" };
  }

  injectSystemPrompt() {
    return [
      "Remote OpenBot computer (Vercel Sandbox):",
      "- The computer is a resumable remote Linux workspace with bounded lifetime and an optional desktop.",
      "- Prefer precise command and file operations, checkpoint durable work when appropriate, and assume uncheckpointed process state may disappear.",
      "- Control-plane secrets are not copied into the sandbox. Never persist provider credentials in its files, shell history, or browser automation.",
    ].join("\n");
  }

  async create(spec: SandboxSpec, _context: ProviderCallContext): Promise<SandboxHandle> {
    const { Sandbox } = await import("@vercel/sandbox");
    const snapshotId = process.env.OPENBOT_VERCEL_SANDBOX_SNAPSHOT_ID;
    const sandbox = await Sandbox.create({
      ...(snapshotId
        ? { source: { type: "snapshot" as const, snapshotId } }
        : {
            image:
              spec.image ??
              process.env.OPENBOT_VERCEL_SANDBOX_IMAGE ??
              "vercel/sandbox/universal:latest",
          }),
      ports: [6080, 4101],
      timeout: 45 * 60 * 1000,
      env: { CUA_DRIVER_SOCKET: "/tmp/openbot-cua-driver.sock" },
    });
    try {
      const desktopCapability = sandboxCapability("desktop", sandbox.name);
      const boxCapability = sandboxCapability("box", sandbox.name);
      const bundlePath = fileURLToPath(new URL("../../../apps/box-host/dist/index.js", import.meta.url));
      const boxHostBundle = await readFile(bundlePath);
      await sandbox.writeFiles([
        { path: "/opt/openbot/bootstrap-openbot-desktop", content: desktopBootstrapScript, mode: 0o755 },
        { path: "/opt/openbot/start-openbot-desktop", content: desktopStartScript, mode: 0o755 },
        { path: "/opt/openbot/box-host.mjs", content: boxHostBundle, mode: 0o755 },
        ...(spec.repository?.bootstrap ? [{ path: "/opt/openbot/repository-bootstrap", content: spec.repository.bootstrap, mode: 0o755 }] : []),
        ...(spec.repository?.assets.map((asset) => ({ path: `/workspace/${asset.path}`, content: Buffer.from(asset.contentBase64, "base64"), mode: asset.executable ? 0o755 : 0o644 })) ?? []),
      ]);
      if (!snapshotId) {
        const bootstrap = await sandbox.runCommand({
          cmd: "bash",
          args: ["/opt/openbot/bootstrap-openbot-desktop"],
          sudo: true,
          signal: _context.signal,
          timeoutMs: 20 * 60 * 1000,
        });
        if (bootstrap.exitCode !== 0) {
          const stdout = (await bootstrap.stdout()).trim();
          const stderr = (await bootstrap.stderr()).trim();
          throw new ProviderError(
            "provider_unavailable",
            `Desktop bootstrap failed: ${[stdout, stderr].filter(Boolean).join("\n").slice(-12_000)}`,
          );
        }
      }
      if (spec.repository?.bootstrap) {
        const repositoryBootstrap = await sandbox.runCommand({
          cmd: "bash",
          args: ["-lc", "cd /workspace && /opt/openbot/repository-bootstrap"],
          signal: _context.signal,
          env: { ...(spec.repository.environment ?? {}) },
        });
        if (repositoryBootstrap.exitCode !== 0) throw new ProviderError("provider_unavailable", "Repository sandbox bootstrap failed; inspect the sandbox bootstrap log");
      }
      await sandbox.runCommand({
        cmd: "bash",
        args: ["/opt/openbot/start-openbot-desktop"],
        detached: true,
        sudo: true,
        env: {
          DISPLAY: ":1",
          OPENBOT_BOX_CAPABILITY: boxCapability,
          OPENBOT_BOX_PORT: "4101",
          OPENBOT_DESKTOP_CAPABILITY: desktopCapability,
          OPENBOT_EXPOSED_PORTS: "6080,4101",
          OPENBOT_WORKSPACE: "/workspace",
          ...(spec.repository?.environment ?? {}),
        },
      });
      const id = sandbox.name;
      const handle: SandboxHandle = {
        id,
        providerId: this.descriptor.id,
        state: "running",
        createdAt: new Date(),
      };
      this.#instances.set(id, sandbox);
      this.#handles.set(id, handle);
      this.#desktopCapabilities.set(id, desktopCapability);
      return handle;
    } catch (error) {
      await sandbox.stop().catch(() => undefined);
      throw error;
    }
  }

  async get(id: string, _context: ProviderCallContext): Promise<SandboxHandle> {
    const current = this.#handles.get(id);
    if (current) return current;
    const sandbox = await this.#instance(id);
    const handle: SandboxHandle = {
      id,
      providerId: this.descriptor.id,
      state: "running",
      createdAt: sandbox.createdAt,
    };
    this.#handles.set(id, handle);
    return handle;
  }

  async exec(id: string, command: string, args: readonly string[], _context: ProviderCallContext) {
    const sandbox = await this.#instance(id);
    const output = await sandbox.runCommand({
      cmd: command,
      args: [...args],
      env: { CUA_DRIVER_SOCKET: "/tmp/openbot-cua-driver.sock" },
      signal: _context.signal,
    });
    return {
      exitCode: output.exitCode,
      stdout: await output.stdout(),
      stderr: await output.stderr(),
    };
  }

  async desktop(id: string, _context: ProviderCallContext) {
    const sandbox = await this.#instance(id);
    const capability = this.#desktopCapabilities.get(id) ?? sandboxCapability("desktop", id);
    const url = new URL("/vnc.html", sandbox.domain(6080));
    url.searchParams.set("autoconnect", "1");
    url.searchParams.set("resize", "remote");
    url.searchParams.set("token", capability);
    return { url, expiresAt: sandbox.expiresAt ?? new Date(Date.now() + 45 * 60 * 1000) };
  }

  async checkpoint(id: string, _context: ProviderCallContext): Promise<SandboxHandle> {
    const sandbox = await this.#instance(id);
    const handle = await this.get(id, _context);
    const snapshot = await sandbox.snapshot();
    const checkpointed = { ...handle, state: "stopped" as const, checkpointId: snapshot.snapshotId };
    this.#handles.set(id, checkpointed);
    this.#instances.delete(id);
    return checkpointed;
  }

  async stop(id: string, context: ProviderCallContext): Promise<SandboxHandle> {
    const sandbox = await this.#instance(id);
    const handle = await this.get(id, context);
    await sandbox.stop();
    this.#instances.delete(id);
    const stopped = { ...handle, state: "stopped" as const };
    this.#handles.set(id, stopped);
    return stopped;
  }

  async #instance(id: string): Promise<VercelSandbox> {
    const attached = this.#instances.get(id);
    if (attached) return attached;
    try {
      const { Sandbox } = await import("@vercel/sandbox");
      const sandbox = await Sandbox.get({
        name: id,
        onResume: async (resumed) => {
          await resumed.runCommand({
            cmd: "bash",
            args: ["-lc", "if [[ -x /opt/openbot/repository-bootstrap ]]; then cd /workspace && /opt/openbot/repository-bootstrap; fi"],
            env: repositoryEnvironmentFromProcess(),
          });
          await resumed.runCommand({
            cmd: "bash",
            args: ["/opt/openbot/start-openbot-desktop"],
            detached: true,
            sudo: true,
            env: {
              DISPLAY: ":1",
              OPENBOT_BOX_CAPABILITY: sandboxCapability("box", id),
              OPENBOT_BOX_PORT: "4101",
              OPENBOT_DESKTOP_CAPABILITY: sandboxCapability("desktop", id),
              OPENBOT_EXPOSED_PORTS: "6080,4101",
              OPENBOT_WORKSPACE: "/workspace",
              ...repositoryEnvironmentFromProcess(),
            },
          });
        },
      });
      this.#instances.set(id, sandbox);
      this.#desktopCapabilities.set(id, sandboxCapability("desktop", id));
      return sandbox;
    } catch (error) {
      throw new ProviderError("not_found", `Sandbox ${id} could not be resumed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}

function repositoryEnvironmentFromProcess(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env)
    .filter(([name, value]) => name.startsWith("OPENBOT_SANDBOX_SECRET_") && value !== undefined)
    .map(([name, value]) => [name.slice("OPENBOT_SANDBOX_SECRET_".length), value!]));
}
