import { realpathSync } from "node:fs";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { Deployable, DeploymentContext, DeploymentPlan, DeploymentResult, InitializableProvider, ProviderInitialization } from "@openbot/runtime-provider-core";
import { processRunner, type RuntimeCommandRunner } from "./vercel.js";

export interface LocalRuntimeProviderOptions {
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  uid?: number;
  runner?: RuntimeCommandRunner;
  request?: typeof fetch;
  command?: readonly string[];
}

export class LocalRuntimeProvider implements Deployable, InitializableProvider {
  readonly initialization: ProviderInitialization = {
    id: "local",
    label: "Local",
    description: "Run OpenBot as a user service on this computer.",
    questions: [],
  };
  readonly #platform: NodeJS.Platform;
  readonly #homeDirectory: string;
  readonly #uid: number | undefined;
  readonly #runner: RuntimeCommandRunner;
  readonly #request: typeof fetch;
  readonly #command: readonly string[] | undefined;

  constructor(options: LocalRuntimeProviderOptions = {}) {
    this.#platform = options.platform ?? process.platform;
    this.#homeDirectory = options.homeDirectory ?? homedir();
    this.#uid = options.uid ?? process.getuid?.();
    this.#runner = options.runner ?? processRunner;
    this.#request = options.request ?? fetch;
    this.#command = options.command;
  }

  async plan(context: DeploymentContext): Promise<DeploymentPlan> {
    const manager = serviceManager(this.#platform);
    return {
      summary: `Install OpenBot as a user-level ${manager} service`,
      steps: [
        `Write a private environment file containing ${Object.keys(context.inputs.environmentVariables()).length} environment variables and ${Object.keys(context.inputs.secrets()).length} secrets`,
        `Install and restart the ${manager} service`,
        "Smoke-test /healthz on the local control server",
      ],
    };
  }

  async configure(context: DeploymentContext): Promise<DeploymentResult> {
    const port = context.environment.OPENBOT_PORT ?? context.environment.PORT ?? "4100";
    const origin = `http://127.0.0.1:${port}`;
    context.report({ event: "local.origin.ready", details: { origin } });
    return {
      outputs: { "runtime.origin": origin },
      environmentVariables: { OPENBOT_PUBLIC_ORIGIN: origin },
    };
  }

  async deploy(context: DeploymentContext): Promise<DeploymentResult> {
    const environmentFile = resolve(context.repositoryRoot, ".openbot-deploy/runtime.env");
    await writePrivateFile(environmentFile, serializeEnvironment(context));
    const command = this.#command ?? runtimeCommand(context);

    if (this.#platform === "linux") await this.#deploySystemd(context, environmentFile, command);
    else if (this.#platform === "darwin") await this.#deployLaunchd(context, environmentFile, command);
    else throw new Error(`The local runtime provider does not support ${this.#platform}`);

    const origin = context.inputs.require("runtime.origin");
    await this.#waitForHealth(origin);
    context.report({ event: "local.smoke.complete", details: { url: `${origin}/healthz` } });
    return { outputs: { "runtime.deployment-url": origin } };
  }

  async #deploySystemd(context: DeploymentContext, environmentFile: string, command: readonly string[]): Promise<void> {
    const unitPath = resolve(this.#homeDirectory, ".config/systemd/user/openbot.service");
    const unit = `[Unit]\nDescription=OpenBot runtime\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=${systemdQuote(context.repositoryRoot)}\nEnvironment=${systemdQuote(`OPENBOT_DEPLOYMENT_ENV_FILE=${environmentFile}`)}\nExecStart=${command.map(systemdQuote).join(" ")}\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n`;
    await writeFileAtomically(unitPath, unit, 0o644);
    await this.#run("systemctl", ["--user", "daemon-reload"], context);
    await this.#run("systemctl", ["--user", "enable", "openbot.service"], context);
    await this.#run("systemctl", ["--user", "restart", "openbot.service"], context);
    context.report({ event: "local.systemd.installed", details: { unitPath } });
  }

  async #deployLaunchd(context: DeploymentContext, environmentFile: string, command: readonly string[]): Promise<void> {
    if (this.#uid === undefined) throw new Error("Unable to determine the current user id for launchd");
    const label = "ai.openbot.runtime";
    const plistPath = resolve(this.#homeDirectory, `Library/LaunchAgents/${label}.plist`);
    const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${label}</string>\n<key>ProgramArguments</key><array>${command.map((value) => `<string>${xmlEscape(value)}</string>`).join("")}</array>\n<key>WorkingDirectory</key><string>${xmlEscape(context.repositoryRoot)}</string>\n<key>EnvironmentVariables</key><dict><key>OPENBOT_DEPLOYMENT_ENV_FILE</key><string>${xmlEscape(environmentFile)}</string></dict>\n<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><true/>\n</dict></plist>\n`;
    await writeFileAtomically(plistPath, plist, 0o644);
    const domain = `gui/${this.#uid}`;
    try {
      await this.#run("launchctl", ["bootout", domain, plistPath], context);
    } catch {
      // The service is not loaded on its first deployment.
    }
    await this.#run("launchctl", ["bootstrap", domain, plistPath], context);
    await this.#run("launchctl", ["kickstart", "-k", `${domain}/${label}`], context);
    context.report({ event: "local.launchd.installed", details: { plistPath } });
  }

  async #run(command: string, args: readonly string[], context: DeploymentContext): Promise<void> {
    await this.#runner.run(command, args, { cwd: context.repositoryRoot, environment: context.environment });
  }

  async #waitForHealth(origin: string): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const health = await this.#request(`${origin}/healthz`, { signal: AbortSignal.timeout(2_000) });
        if (!health.ok) throw new Error(`Local runtime health smoke failed (${health.status})`);
        const body = await health.json() as { ok?: unknown };
        if (body.ok !== true) throw new Error("Local runtime health smoke returned an invalid response");
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 19) await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
      }
    }
    throw lastError;
  }
}

export function createLocalRuntimeProvider(options: LocalRuntimeProviderOptions = {}): LocalRuntimeProvider {
  return new LocalRuntimeProvider(options);
}

function runtimeCommand(context: DeploymentContext): readonly string[] {
  const pnpmScript = context.environment.npm_execpath;
  if (!pnpmScript) throw new Error("Local deployment must be invoked through pnpm so the service command can be resolved");
  return [
    realpathSync(process.execPath),
    realpathSync(pnpmScript),
    "--dir", context.repositoryRoot,
    "--filter", "@openbot/cli",
    "exec", "tsx", "src/index.tsx", "_serve",
  ];
}

function serializeEnvironment(context: DeploymentContext): string {
  const values = new Map(Object.entries(context.inputs.environmentVariables()));
  for (const [name, value] of Object.entries(context.inputs.secrets())) {
    const existing = values.get(name);
    if (existing !== undefined && existing !== value) throw new Error(`Conflicting runtime value: ${name}`);
    values.set(name, value);
  }
  return [...values].sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("\n") + "\n";
}

async function writePrivateFile(path: string, contents: string): Promise<void> {
  await writeFileAtomically(path, contents, 0o600);
}

async function writeFileAtomically(path: string, contents: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { mode });
  await chmod(temporary, mode);
  await rename(temporary, path);
}

function serviceManager(platform: NodeJS.Platform): string {
  if (platform === "linux") return "systemd";
  if (platform === "darwin") return "launchd";
  throw new Error(`The local runtime provider does not support ${platform}`);
}

function systemdQuote(value: string): string {
  if (/[\n\r\0]/.test(value)) throw new Error("systemd values must not contain control characters");
  return `"${value.replace(/%/g, "%%").replace(/([\\"])/g, "\\$1")}"`;
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
