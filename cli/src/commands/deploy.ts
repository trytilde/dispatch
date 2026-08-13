import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import arg from "arg";
import { config as loadDotenv } from "dotenv";
import type { OpenBotConfiguration } from "@openbot/configuration";
import { discoverAgentWorkspaces } from "@openbot/agent-service-provider";
import { buildProviders, deployProviders, type DeploymentEvent, type DeploymentParticipant } from "@openbot/runtime-provider-core";
import { loadDeploymentConfiguration } from "../initialization.js";
import { repositoryRoot } from "../paths.js";

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

  const deploymentConfiguration = await loadDeploymentConfiguration(repositoryRoot, { environment: process.env });
  Object.assign(process.env, deploymentConfiguration.environment);
  const configuration = await loadRepositoryConfiguration();
  const agentService = configuration.providers.agentService;
  const controlService = configuration.providers.controlService;
  const computer = configuration.providers.computer;
  const deployAgents = options.service === "all" || options.service === "agents";
  const computerId = deploymentConfiguration.environment.OPENBOT_COMPUTER_ID?.trim() || "openbot-computer";
  const participants: DeploymentParticipant[] = [
    ...(options.service === "all" && computer ? [{ id: "computer", provider: computer }] : []),
    ...(deployAgents ? [{ id: "agent-service", provider: { buildable: agentService, deployable: agentService } }] : []),
    ...(deployAgents && computer ? [{
      id: "agent-workspaces",
      provider: {
        deployable: {
          plan: async () => ({ summary: "Register agent Linux users and seed new private workspaces", steps: ["Keep one shared computer", "Skip workspaces already registered"] }),
          deploy: async (context) => {
            await computer.deployAgentWorkspaces({ computerId, workspaces: await discoverAgentWorkspaces(context.repositoryRoot) }, context);
            return { outputs: { "computer.id": computerId }, environmentVariables: { OPENBOT_COMPUTER_ID: computerId } };
          },
        },
      },
    }] : []),
    ...(options.service === "all" || options.service === "control" ? [{ id: "control-service", role: "runtime" as const, provider: { buildable: controlService, deployable: controlService } }] : []),
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

async function loadRepositoryConfiguration(): Promise<OpenBotConfiguration> {
  const path = resolve(repositoryRoot, "configuration/index.ts");
  const module = await import(pathToFileURL(path).href) as { default?: OpenBotConfiguration };
  if (!module.default) throw new Error("configuration/index.ts must export the OpenBot configuration as default");
  return module.default;
}
