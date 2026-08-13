import type { DeploymentContext } from "@tryopenbot/runtime-provider";

export interface VercelCommandRunner {
  run(
    command: string,
    args: readonly string[],
    options: { cwd: string; environment: NodeJS.ProcessEnv; inherit?: boolean; input?: string },
  ): Promise<{ stdout: string; stderr: string }>;
}

export function requiredVercelProject(
  environment: NodeJS.ProcessEnv,
  variable: "VERCEL_CONTROL_PROJECT" | "VERCEL_AGENT_PROJECT",
): string {
  const value = environment[variable]?.trim();
  if (!value) throw new Error(`${variable} is required`);
  return value;
}

export function vercelScopeArguments(environment: NodeJS.ProcessEnv): string[] {
  return environment.VERCEL_TEAM_ID ? ["--scope", environment.VERCEL_TEAM_ID] : [];
}

export async function ensureVercelProject(
  runner: VercelCommandRunner,
  context: Pick<DeploymentContext, "repositoryRoot" | "environment">,
  project: string,
): Promise<void> {
  const scope = vercelScopeArguments(context.environment);
  try {
    await runner.run("pnpm", ["exec", "vercel", "project", "inspect", project, ...scope], {
      cwd: context.repositoryRoot,
      environment: context.environment,
    });
  } catch {
    await runner.run("pnpm", ["exec", "vercel", "project", "add", project, ...scope], {
      cwd: context.repositoryRoot,
      environment: context.environment,
    });
  }
}

export async function installVercelEnvironment(
  runner: VercelCommandRunner,
  context: DeploymentContext,
  project: string,
): Promise<void> {
  const target = context.target === "production" ? "production" : "preview";
  const variables = new Map(
    Object.entries(context.inputs.environmentVariables()).map(([name, value]) => [
      name,
      { value, sensitive: false },
    ]),
  );
  for (const [name, value] of Object.entries(context.inputs.secrets()))
    variables.set(name, { value, sensitive: true });
  for (const [name, variable] of variables)
    await runner.run(
      "pnpm",
      [
        "exec",
        "vercel",
        "env",
        "add",
        name,
        target,
        "--force",
        "--yes",
        variable.sensitive ? "--sensitive" : "--no-sensitive",
        "--project",
        project,
        ...vercelScopeArguments(context.environment),
      ],
      { cwd: context.repositoryRoot, environment: context.environment, input: variable.value },
    );
}

export function vercelDeploymentUrl(output: string): string {
  for (const line of output.split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as { url?: unknown; deploymentUrl?: unknown };
      const value = typeof parsed.url === "string" ? parsed.url : parsed.deploymentUrl;
      if (typeof value === "string") return normalizeUrl(value);
    } catch {
      const match = line.match(/https:\/\/[^\s]+/);
      if (match) return normalizeUrl(match[0]);
    }
  }
  throw new Error("Vercel did not return a deployment URL");
}

function normalizeUrl(value: string): string {
  return (value.startsWith("http") ? value : `https://${value}`).replace(/\/$/, "");
}
