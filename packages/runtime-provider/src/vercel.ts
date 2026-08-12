import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DeployableProvider, ProviderDeployContext } from "@openbot/runtime-provider-core";

export interface RuntimeCommandResult {
  stdout: string;
  stderr: string;
}

export interface RuntimeCommandRunner {
  run(command: string, args: readonly string[], options: { cwd: string; environment: NodeJS.ProcessEnv; inherit?: boolean; input?: string }): Promise<RuntimeCommandResult>;
}

export interface VercelRuntimeProviderOptions {
  runner?: RuntimeCommandRunner;
  readProject?: (repositoryRoot: string) => Promise<{ projectName?: string }>;
  request?: typeof fetch;
}

export class VercelRuntimeProvider implements DeployableProvider {
  readonly #runner: RuntimeCommandRunner;
  readonly #readProject: (repositoryRoot: string) => Promise<{ projectName?: string }>;
  readonly #request: typeof fetch;

  constructor(options: VercelRuntimeProviderOptions = {}) {
    this.#runner = options.runner ?? processRunner;
    this.#readProject = options.readProject ?? readLinkedProject;
    this.#request = options.request ?? fetch;
  }

  async deploy(context: ProviderDeployContext): Promise<void> {
    if (context.phase === "prepare") return this.#prepare(context);
    if (context.phase === "release") return this.#release(context);
  }

  async #prepare(context: ProviderDeployContext): Promise<void> {
    const configuredOrigin = publicOrigin(context.environment);
    if (configuredOrigin) {
      context.outputs.set("runtime.origin", configuredOrigin);
      context.outputs.setRuntimeEnvironment("OPENBOT_PUBLIC_ORIGIN", configuredOrigin, { sensitive: false });
      context.report({ event: "vercel.origin.ready", details: { origin: configuredOrigin } });
      return;
    }
    if (context.dryRun) {
      context.report({ event: "vercel.project.planned" });
      return;
    }

    let project = await this.#readProject(context.repositoryRoot);
    if (!project.projectName) {
      await this.#runner.run("pnpm", [
        "exec", "vercel", "link", "--yes",
        ...projectArguments(context.environment),
        ...scopeArguments(context.environment),
      ], {
        cwd: context.repositoryRoot,
        environment: context.environment,
        inherit: true,
      });
      project = await this.#readProject(context.repositoryRoot);
    }
    if (!project.projectName) throw new Error("Vercel project linking did not provide a project name");
    const origin = `https://${project.projectName}.vercel.app`;
    context.outputs.set("runtime.origin", origin);
    context.outputs.setRuntimeEnvironment("OPENBOT_PUBLIC_ORIGIN", origin, { sensitive: false });
    context.report({ event: "vercel.origin.ready", details: { origin } });
  }

  async #release(context: ProviderDeployContext): Promise<void> {
    if (context.dryRun) {
      context.report({
        event: "vercel.deploy.planned",
        details: { target: context.target, environmentVariables: context.outputs.runtimeEnvironment().length },
      });
      return;
    }
    const environmentTarget = context.target === "production" ? "production" : "preview";
    for (const variable of context.outputs.runtimeEnvironment()) {
      const sensitivity = variable.sensitive ? "--sensitive" : "--no-sensitive";
      await this.#runner.run("pnpm", [
        "exec", "vercel", "env", "add", variable.name, environmentTarget, "--force", "--yes", sensitivity,
        ...projectArguments(context.environment),
        ...scopeArguments(context.environment),
      ], {
        cwd: context.repositoryRoot,
        environment: context.environment,
        input: variable.value,
      });
      context.report({ event: "vercel.environment.configured", details: { name: variable.name, target: environmentTarget } });
    }
    const args = [
      "exec", "vercel", "deploy", "--yes", "--json",
      ...projectArguments(context.environment),
      ...scopeArguments(context.environment),
    ];
    if (context.target === "production") args.push("--prod");
    const deployed = await this.#runner.run("pnpm", args, {
      cwd: context.repositoryRoot,
      environment: context.environment,
    });
    const deploymentUrl = vercelDeploymentUrl(`${deployed.stdout}\n${deployed.stderr}`);
    context.outputs.set("runtime.deployment-url", deploymentUrl);
    context.report({ event: "vercel.deploy.complete", details: { url: deploymentUrl } });

    const health = await this.#request(`${deploymentUrl}/healthz`, { signal: AbortSignal.timeout(30_000) });
    if (!health.ok) throw new Error(`Health smoke failed (${health.status})`);
    const body = await health.json() as { ok?: unknown };
    if (body.ok !== true) throw new Error("Health smoke returned an invalid response");
    context.report({ event: "vercel.smoke.complete", details: { url: `${deploymentUrl}/healthz` } });
  }
}

export function createVercelRuntimeProvider(options: VercelRuntimeProviderOptions = {}): VercelRuntimeProvider {
  return new VercelRuntimeProvider(options);
}

export function vercelDeploymentUrl(output: string): string {
  for (const line of output.split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as { url?: unknown; deploymentUrl?: unknown };
      const value = typeof parsed.url === "string" ? parsed.url : parsed.deploymentUrl;
      if (typeof value === "string") return normalizedUrl(value);
    } catch {
      const match = line.match(/https:\/\/[^\s]+/);
      if (match) return normalizedUrl(match[0].replace(/[),.;]+$/, ""));
    }
  }
  throw new Error("Vercel did not return a deployment URL");
}

function publicOrigin(environment: NodeJS.ProcessEnv): string | undefined {
  const value = environment.OPENBOT_PUBLIC_ORIGIN ?? environment.VERCEL_PROJECT_PRODUCTION_URL;
  if (!value) return undefined;
  return normalizedUrl(value);
}

function normalizedUrl(value: string): string {
  const withProtocol = value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
  const url = new URL(withProtocol);
  return url.toString().replace(/\/$/, "");
}

function scopeArguments(environment: NodeJS.ProcessEnv): string[] {
  return environment.VERCEL_TEAM_ID ? ["--scope", environment.VERCEL_TEAM_ID] : [];
}

function projectArguments(environment: NodeJS.ProcessEnv): string[] {
  return environment.VERCEL_PROJECT_ID ? ["--project", environment.VERCEL_PROJECT_ID] : [];
}

async function readLinkedProject(repositoryRoot: string): Promise<{ projectName?: string }> {
  try {
    return JSON.parse(await readFile(resolve(repositoryRoot, ".vercel/project.json"), "utf8")) as { projectName?: string };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

const processRunner: RuntimeCommandRunner = {
  run(command, args, options) {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.environment,
        stdio: options.inherit ? "inherit" : [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      if (options.input !== undefined) child.stdin?.end(options.input);
      child.once("error", reject);
      child.once("exit", (code) => code === 0
        ? resolvePromise({ stdout, stderr })
        : reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`)));
    });
  },
};
