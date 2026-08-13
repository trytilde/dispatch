import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DeploymentContext } from "@openbot/runtime-provider-core";
import type { CommandRunner } from "./command.js";

export interface LocalServiceOptions {
  id: string;
  description: string;
  command: readonly string[];
  environmentFile: string;
  platform: NodeJS.Platform;
  homeDirectory: string;
  uid?: number;
}

export async function installLocalService(context: DeploymentContext, runner: CommandRunner, options: LocalServiceOptions): Promise<void> {
  const environmentFile = resolve(context.repositoryRoot, options.environmentFile);
  await atomicWrite(environmentFile, serializeEnvironment(context), 0o600);
  if (options.platform === "linux") {
    const unitPath = resolve(options.homeDirectory, `.config/systemd/user/${options.id}.service`);
    const unit = `[Unit]\nDescription=${options.description}\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=${quote(context.repositoryRoot)}\nEnvironment=${quote(`OPENBOT_DEPLOYMENT_ENV_FILE=${environmentFile}`)}\nEnvironmentFile=${quote(environmentFile)}\nExecStart=${options.command.map(quote).join(" ")}\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n`;
    await atomicWrite(unitPath, unit, 0o644);
    await runner.run("systemctl", ["--user", "daemon-reload"], { cwd: context.repositoryRoot, environment: context.environment });
    await runner.run("systemctl", ["--user", "enable", `${options.id}.service`], { cwd: context.repositoryRoot, environment: context.environment });
    await runner.run("systemctl", ["--user", "restart", `${options.id}.service`], { cwd: context.repositoryRoot, environment: context.environment });
    return;
  }
  if (options.platform === "darwin") {
    if (options.uid === undefined) throw new Error("Unable to determine current uid for launchd");
    const label = `ai.openbot.${options.id}`;
    const plistPath = resolve(options.homeDirectory, `Library/LaunchAgents/${label}.plist`);
    const command = [options.command[0]!, `--env-file=${environmentFile}`, ...options.command.slice(1)];
    const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${command.map((value) => `<string>${xml(value)}</string>`).join("")}</array><key>WorkingDirectory</key><string>${xml(context.repositoryRoot)}</string><key>EnvironmentVariables</key><dict><key>OPENBOT_DEPLOYMENT_ENV_FILE</key><string>${xml(environmentFile)}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>\n`;
    await atomicWrite(plistPath, plist, 0o600);
    const domain = `gui/${options.uid}`;
    try { await runner.run("launchctl", ["bootout", domain, plistPath], { cwd: context.repositoryRoot, environment: context.environment }); } catch { /* first install */ }
    await runner.run("launchctl", ["bootstrap", domain, plistPath], { cwd: context.repositoryRoot, environment: context.environment });
    await runner.run("launchctl", ["kickstart", "-k", `${domain}/${label}`], { cwd: context.repositoryRoot, environment: context.environment });
    return;
  }
  throw new Error(`Local service deployment does not support ${options.platform}`);
}

export async function waitForHealth(request: typeof fetch, origin: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await request(`${origin}/healthz`, { signal: AbortSignal.timeout(2_000) });
      if (!response.ok || (await response.json() as { ok?: unknown }).ok !== true) throw new Error(`Health smoke failed at ${origin}`);
      return;
    } catch (error) { lastError = error; if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  throw lastError;
}

function serializeEnvironment(context: DeploymentContext): string {
  const values = new Map(Object.entries(context.inputs.environmentVariables()));
  for (const [name, value] of Object.entries(context.inputs.secrets())) values.set(name, value);
  return [...values].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n";
}
async function atomicWrite(path: string, contents: string, mode: number): Promise<void> { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, contents, { mode }); await chmod(temporary, mode); await rename(temporary, path); }
function quote(value: string): string { if (/[\n\r\0]/.test(value)) throw new Error("Service values must not contain control characters"); return `"${value.replace(/%/g, "%%").replace(/([\\"])/g, "\\$1")}"`; }
function xml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
