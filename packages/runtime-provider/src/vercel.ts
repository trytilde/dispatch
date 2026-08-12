import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Deployable, DeploymentContext, DeploymentPlan, DeploymentResult } from "@openbot/runtime-provider-core";

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

export class VercelRuntimeProvider implements Deployable {
  readonly #runner: RuntimeCommandRunner;
  readonly #readProject: (repositoryRoot: string) => Promise<{ projectName?: string }>;
  readonly #request: typeof fetch;

  constructor(options: VercelRuntimeProviderOptions = {}) {
    this.#runner = options.runner ?? processRunner;
    this.#readProject = options.readProject ?? readLinkedProject;
    this.#request = options.request ?? fetch;
  }

  async plan(context: DeploymentContext): Promise<DeploymentPlan> {
    const configuredOrigin = publicOrigin(context.environment);
    return {
      summary: "Deploy the OpenBot runtime and web UI to Vercel",
      steps: [
        configuredOrigin ? `Use configured public origin ${configuredOrigin}` : "Link or discover the Vercel project",
        `Install ${Object.keys(context.inputs.environmentVariables()).length} environment variables and ${Object.keys(context.inputs.secrets()).length} secrets`,
        `Deploy to ${context.target} and smoke-test /healthz`,
      ],
    };
  }

  async configure(context: DeploymentContext): Promise<DeploymentResult> {
    const configuredOrigin = publicOrigin(context.environment);
    if (configuredOrigin) return originResult(configuredOrigin, context);

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
    return originResult(`https://${project.projectName}.vercel.app`, context);
  }

  async deploy(context: DeploymentContext): Promise<DeploymentResult> {
    const environmentTarget = context.target === "production" ? "production" : "preview";
    const variables = runtimeVariables(context);
    for (const variable of variables) {
      await this.#runner.run("pnpm", [
        "exec", "vercel", "env", "add", variable.name, environmentTarget, "--force", "--yes",
        variable.sensitive ? "--sensitive" : "--no-sensitive",
        ...projectArguments(context.environment),
        ...scopeArguments(context.environment),
      ], {
        cwd: context.repositoryRoot,
        environment: context.environment,
        input: variable.value,
      });
      context.report({ event: "vercel.environment.configured", details: { name: variable.name, target: environmentTarget, sensitive: variable.sensitive } });
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
    context.report({ event: "vercel.deploy.complete", details: { url: deploymentUrl } });

    const health = await this.#request(`${deploymentUrl}/healthz`, { signal: AbortSignal.timeout(30_000) });
    if (!health.ok) throw new Error(`Health smoke failed (${health.status})`);
    const body = await health.json() as { ok?: unknown };
    if (body.ok !== true) throw new Error("Health smoke returned an invalid response");
    context.report({ event: "vercel.smoke.complete", details: { url: `${deploymentUrl}/healthz` } });
    return { outputs: { "runtime.deployment-url": deploymentUrl } };
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

function originResult(origin: string, context: DeploymentContext): DeploymentResult {
  context.report({ event: "vercel.origin.ready", details: { origin } });
  return {
    outputs: { "runtime.origin": origin },
    environmentVariables: { OPENBOT_PUBLIC_ORIGIN: origin },
  };
}

function runtimeVariables(context: DeploymentContext): readonly { name: string; value: string; sensitive: boolean }[] {
  const variables = new Map<string, { value: string; sensitive: boolean }>();
  for (const [name, value] of Object.entries(context.inputs.environmentVariables())) variables.set(name, { value, sensitive: false });
  for (const [name, value] of Object.entries(context.inputs.secrets())) {
    const existing = variables.get(name);
    if (existing && existing.value !== value) throw new Error(`Conflicting runtime value: ${name}`);
    variables.set(name, { value, sensitive: true });
  }
  return [...variables].map(([name, value]) => ({ name, ...value }));
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

export const processRunner: RuntimeCommandRunner = {
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
