import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import arg from "arg";
import { config as loadDotenv } from "dotenv";
import { createAgentServiceProvider } from "@openbot/agent-service-provider";
import type { OpenBotConfig } from "@openbot/config";
import { createControlServiceProvider } from "@openbot/control-service-provider";
import { buildProviders, deployProviders, type DeploymentEvent, type DeploymentParticipant } from "@openbot/runtime-provider-core";
import { loadDeploymentConfiguration } from "./initialization.js";
import { repositoryRoot } from "./paths.js";

export interface DeployOptions {
  yes: boolean;
  dryRun: boolean;
  json: boolean;
  skipDeploy: boolean;
  service: "all" | "agents" | "control";
}

export function parseOptions(argv: readonly string[]): DeployOptions {
  const parsed = arg({
    "--yes": Boolean,
    "--dry-run": Boolean,
    "--json": Boolean,
    "--skip-deploy": Boolean,
    "--service": String,
  }, { argv: argv.filter((argument) => argument !== "--") });
  if (parsed._.length) throw new Error(`Unknown deploy option: ${parsed._.join(", ")}`);
  const service = parsed["--service"] ?? "all";
  if (service !== "all" && service !== "agents" && service !== "control") throw new Error(`Unsupported deploy service: ${service}`);
  return {
    yes: parsed["--yes"] ?? false,
    dryRun: parsed["--dry-run"] ?? false,
    json: parsed["--json"] ?? false,
    skipDeploy: parsed["--skip-deploy"] ?? false,
    service: service as DeployOptions["service"],
  };
}

export function redact(value: string, secrets: Iterable<string>): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret.length >= 8) redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted.replace(/(VERCEL_TOKEN)=([^\s]+)/g, "$1=[REDACTED]");
}

export async function runProductionDeploy(argv: readonly string[]): Promise<void> {
  loadDotenv({ path: resolve(repositoryRoot, ".env.local"), override: false, quiet: true });
  const options = parseOptions(argv);
  if (!options.yes && !options.dryRun && !options.skipDeploy) throw new Error("Production deployment requires --yes (or use --dry-run or --skip-deploy)");

  const report = ({ event, details = {} }: DeploymentEvent): void => {
    process.stdout.write(options.json ? `${JSON.stringify({ event, ...details })}\n` : `${event}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ""}\n`);
  };

  const config = await loadRepositoryConfig();
  const deploymentConfiguration = await loadDeploymentConfiguration(repositoryRoot, { environment: process.env });
  const runtimeId = deploymentConfiguration.environment.OPENBOT_RUNTIME_PROVIDER ?? config.providers.runtime;
  const agentService = createAgentServiceProvider(runtimeId);
  const controlService = createControlServiceProvider(runtimeId);
  const participants: DeploymentParticipant[] = [
    ...(options.service === "all" || options.service === "agents" ? [{ id: `agent-service:${runtimeId}`, provider: { buildable: agentService, deployable: agentService } }] : []),
    ...(options.service === "all" || options.service === "control" ? [{ id: `control-service:${runtimeId}`, role: "runtime" as const, provider: { buildable: controlService, deployable: controlService } }] : []),
  ];
  const runOptions = {
    target: "production",
    dryRun: options.dryRun,
    repositoryRoot,
    environment: deploymentConfiguration.environment,
    initialInputs: deploymentConfiguration.inputs,
    report,
  } as const;
  const built = await buildProviders(participants, runOptions);
  if (options.skipDeploy) {
    report({ event: "build.complete", details: { deploySkipped: true } });
    return;
  }
  await deployProviders(participants, { ...runOptions, initialInputs: built.result() });
}

async function loadRepositoryConfig(): Promise<OpenBotConfig> {
  const module = await import(pathToFileURL(resolve(repositoryRoot, "openbot.config.ts")).href) as { default?: OpenBotConfig };
  if (!module.default) throw new Error("openbot.config.ts must export the OpenBot configuration as default");
  return module.default;
}
