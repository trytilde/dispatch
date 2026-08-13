import { resolve } from "node:path";
import { materializeFileTemplate } from "@openbot/utilities";
import type { Buildable, Deployable, DeploymentContext, DeploymentPlan, DeploymentResult, InitializableProvider, ProviderInitialization } from "@openbot/runtime-provider-core";
import { deploymentUrl, ensureVercelProject, processRunner, type CommandRunner } from "@openbot/control-service-provider";
import { checkAgentService } from "../check.js";
import { agentVercelArtifact, buildVercelAgentService, vercelProjectTemplate } from "./build.js";

export interface VercelAgentServiceProviderOptions { runner?: CommandRunner; request?: typeof fetch }

export class VercelAgentServiceProvider implements Buildable, Deployable, InitializableProvider {
  readonly initialization: ProviderInitialization = {
    id: "vercel-agents",
    label: "Vercel agent service",
    questions: [{ id: "vercel-agent-project", prompt: "Vercel project for agent functions", input: "text", required: true, destination: { kind: "environment", key: "OPENBOT_VERCEL_AGENT_PROJECT" } }],
  };
  readonly #runner: CommandRunner;
  readonly #request: typeof fetch;
  constructor(options: VercelAgentServiceProviderOptions = {}) { this.#runner = options.runner ?? processRunner; this.#request = options.request ?? fetch; }
  check(context: DeploymentContext) { return checkAgentService(context, this.#runner); }
  build(context: DeploymentContext) { return buildVercelAgentService(context); }
  async plan(context: DeploymentContext): Promise<DeploymentPlan> { return { summary: "Deploy independently bundled agent functions to Vercel", steps: [`Upload ${context.inputs.get("agent-service.count") ?? "all"} parallel-built functions`, "Smoke-test /healthz"] }; }
  async configure(context: DeploymentContext): Promise<DeploymentResult> { const project = requiredProject(context.environment); await ensureVercelProject(this.#runner, context, project); const origin = `https://${project}.vercel.app`; return { outputs: { "agent-service.origin": origin }, environmentVariables: { OPENBOT_AGENT_SERVICE_ORIGIN: origin } }; }
  async deploy(context: DeploymentContext): Promise<DeploymentResult> {
    const project = requiredProject(context.environment);
    const root = context.inputs.require("agent-service.artifact");
    await materializeFileTemplate(vercelProjectTemplate, resolve(root, "vercel.json"));
    await installVariables(this.#runner, context, project);
    const args = ["exec", "vercel", "deploy", "--prebuilt", "--yes", "--json", "--cwd", root, "--project", project, ...scopeArgs(context.environment)];
    if (context.target === "production") args.push("--prod");
    const result = await this.#runner.run("pnpm", args, { cwd: context.repositoryRoot, environment: context.environment });
    const url = deploymentUrl(`${result.stdout}\n${result.stderr}`);
    const response = await this.#request(`${url}/healthz`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok || (await response.json() as { ok?: unknown }).ok !== true) throw new Error("Agent service health smoke failed");
    return { outputs: { "agent-service.deployment-url": url } };
  }
}

async function installVariables(runner: CommandRunner, context: DeploymentContext, project: string): Promise<void> {
  const target = context.target === "production" ? "production" : "preview";
  const variables = new Map(Object.entries(context.inputs.environmentVariables()).map(([name, value]) => [name, { value, sensitive: false }]));
  for (const [name, value] of Object.entries(context.inputs.secrets())) variables.set(name, { value, sensitive: true });
  for (const [name, variable] of variables) await runner.run("pnpm", ["exec", "vercel", "env", "add", name, target, "--force", "--yes", variable.sensitive ? "--sensitive" : "--no-sensitive", "--project", project, ...scopeArgs(context.environment)], { cwd: context.repositoryRoot, environment: context.environment, input: variable.value });
}
function requiredProject(environment: NodeJS.ProcessEnv): string { const value = environment.OPENBOT_VERCEL_AGENT_PROJECT?.trim(); if (!value) throw new Error("OPENBOT_VERCEL_AGENT_PROJECT is required"); return value; }
function scopeArgs(environment: NodeJS.ProcessEnv): string[] { return environment.VERCEL_TEAM_ID ? ["--scope", environment.VERCEL_TEAM_ID] : []; }
export { agentVercelArtifact };
