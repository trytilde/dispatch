import type { Buildable, Deployable, DeploymentContext, DeploymentPlan, DeploymentResult, InitializableProvider, ProviderInitialization } from "@openbot/runtime-provider-core";
import { resolve } from "node:path";
import { materializeFileTemplate } from "@openbot/utilities";
import { checkControlService } from "../check.js";
import { processRunner, type CommandRunner } from "../command.js";
import { buildVercelControlService, controlVercelArtifact, vercelProjectTemplate } from "./build.js";

export interface VercelControlServiceProviderOptions { runner?: CommandRunner; request?: typeof fetch }

export class VercelControlServiceProvider implements Buildable, Deployable, InitializableProvider {
  readonly initialization: ProviderInitialization = {
    id: "vercel-control",
    label: "Vercel control service",
    questions: [
      { id: "vercel-token", prompt: "Vercel token", input: "secret", required: true, destination: { kind: "deployment-secret", key: "VERCEL_TOKEN" } },
      { id: "vercel-control-project", prompt: "Vercel project for the control service", input: "text", required: true, destination: { kind: "environment", key: "OPENBOT_VERCEL_CONTROL_PROJECT" } },
    ],
  };
  readonly #runner: CommandRunner;
  readonly #request: typeof fetch;
  constructor(options: VercelControlServiceProviderOptions = {}) {
    this.#runner = options.runner ?? processRunner;
    this.#request = options.request ?? fetch;
  }
  check(context: DeploymentContext) { return checkControlService(context, this.#runner); }
  build(context: DeploymentContext) { return buildVercelControlService(context, this.#runner); }
  async plan(context: DeploymentContext): Promise<DeploymentPlan> {
    return { summary: "Deploy the independently built control service and web UI to Vercel", steps: [`Upload ${controlVercelArtifact} as a prebuilt deployment`, "Smoke-test /healthz"] };
  }
  async configure(context: DeploymentContext): Promise<DeploymentResult> {
    const project = requiredProject(context.environment);
    await ensureVercelProject(this.#runner, context, project);
    const origin = `https://${project}.vercel.app`;
    return { outputs: { "control-service.origin": origin, "runtime.origin": origin }, environmentVariables: { OPENBOT_PUBLIC_ORIGIN: origin } };
  }
  async deploy(context: DeploymentContext): Promise<DeploymentResult> {
    const project = requiredProject(context.environment);
    const root = context.inputs.require("control-service.artifact");
    await materializeFileTemplate(vercelProjectTemplate, resolve(root, "vercel.json"));
    await installRuntimeVariables(this.#runner, context, project);
    const args = ["exec", "vercel", "deploy", "--prebuilt", "--yes", "--json", "--cwd", root, "--project", project, ...scopeArgs(context.environment)];
    if (context.target === "production") args.push("--prod");
    const result = await this.#runner.run("pnpm", args, { cwd: context.repositoryRoot, environment: context.environment });
    const url = deploymentUrl(`${result.stdout}\n${result.stderr}`);
    const response = await this.#request(`${url}/healthz`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok || (await response.json() as { ok?: unknown }).ok !== true) throw new Error("Control service health smoke failed");
    return { outputs: { "control-service.deployment-url": url, "runtime.deployment-url": url } };
  }
}

async function installRuntimeVariables(runner: CommandRunner, context: DeploymentContext, project: string): Promise<void> {
  const target = context.target === "production" ? "production" : "preview";
  const variables = new Map(Object.entries(context.inputs.environmentVariables()).map(([name, value]) => [name, { value, sensitive: false }]));
  for (const [name, value] of Object.entries(context.inputs.secrets())) variables.set(name, { value, sensitive: true });
  for (const [name, variable] of variables) await runner.run("pnpm", ["exec", "vercel", "env", "add", name, target, "--force", "--yes", variable.sensitive ? "--sensitive" : "--no-sensitive", "--project", project, ...scopeArgs(context.environment)], { cwd: context.repositoryRoot, environment: context.environment, input: variable.value });
}

function requiredProject(environment: NodeJS.ProcessEnv): string {
  const project = environment.OPENBOT_VERCEL_CONTROL_PROJECT?.trim();
  if (!project) throw new Error("OPENBOT_VERCEL_CONTROL_PROJECT is required");
  return project;
}
function scopeArgs(environment: NodeJS.ProcessEnv): string[] { return environment.VERCEL_TEAM_ID ? ["--scope", environment.VERCEL_TEAM_ID] : []; }
export async function ensureVercelProject(runner: CommandRunner, context: DeploymentContext, project: string): Promise<void> {
  const scope = scopeArgs(context.environment);
  try {
    await runner.run("pnpm", ["exec", "vercel", "project", "inspect", project, ...scope], { cwd: context.repositoryRoot, environment: context.environment });
  } catch {
    await runner.run("pnpm", ["exec", "vercel", "project", "add", project, ...scope], { cwd: context.repositoryRoot, environment: context.environment });
  }
}
export function deploymentUrl(output: string): string {
  for (const line of output.split("\n").reverse()) {
    try { const parsed = JSON.parse(line) as { url?: unknown; deploymentUrl?: unknown }; const value = typeof parsed.url === "string" ? parsed.url : parsed.deploymentUrl; if (typeof value === "string") return normalize(value); } catch { const match = line.match(/https:\/\/[^\s]+/); if (match) return normalize(match[0]); }
  }
  throw new Error("Vercel did not return a deployment URL");
}
function normalize(value: string): string { return (value.startsWith("http") ? value : `https://${value}`).replace(/\/$/, ""); }
