import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import arg from "arg";
import { AgentProviderError, type AgentProvider } from "@openbot/agent-provider";
import type { OpenBotConfiguration } from "@openbot/configuration";
import { discoverAgents, discoverAgentWorkspaces } from "@openbot/agent-service-provider";
import {
  buildProviders,
  deployProviders,
  type DeploymentContext,
  type DeploymentEvent,
  type DeploymentParticipant,
} from "@openbot/runtime-provider";
import { loadDeploymentConfiguration, setEncryptedSecret } from "../initialization.js";
import { repositoryRoot } from "../paths.js";

export interface DeployOptions {
  yes: boolean;
  dryRun: boolean;
  json: boolean;
  skipDeploy: boolean;
  service: "all" | "agents" | "control";
}

export function parseOptions(argv: readonly string[]): DeployOptions {
  const parsed = arg(
    {
      "--yes": Boolean,
      "--dry-run": Boolean,
      "--json": Boolean,
      "--skip-deploy": Boolean,
      "--service": String,
    },
    { argv: argv.filter((argument) => argument !== "--") },
  );
  if (parsed._.length) throw new Error(`Unknown deploy option: ${parsed._.join(", ")}`);
  const service = parsed["--service"] ?? "all";
  if (service !== "all" && service !== "agents" && service !== "control")
    throw new Error(`Unsupported deploy service: ${service}`);
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
  const options = parseOptions(argv);
  if (!options.yes && !options.dryRun && !options.skipDeploy)
    throw new Error("Production deployment requires --yes (or use --dry-run or --skip-deploy)");

  const report = ({ event, details = {} }: DeploymentEvent): void => {
    process.stdout.write(
      options.json
        ? `${JSON.stringify({ event, ...details })}\n`
        : `${event}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ""}\n`,
    );
  };

  const deploymentConfiguration = await loadDeploymentConfiguration(repositoryRoot, {
    environment: process.env,
  });
  Object.assign(process.env, deploymentConfiguration.environment);
  const configuration = await loadRepositoryConfiguration();
  const agentService = configuration.providers.agentService;
  const controlService = configuration.providers.controlService;
  const computer = configuration.providers.computer;
  const deployAgents = options.service === "all" || options.service === "agents";
  const computerId =
    deploymentConfiguration.environment.OPENBOT_COMPUTER_ID?.trim() || "openbot-computer";
  const developmentSandboxId =
    deploymentConfiguration.environment.OPENBOT_DEVELOPMENT_SANDBOX_ID?.trim() ||
    "openbot-development";
  const participants: DeploymentParticipant[] = [
    ...(options.service === "all" && computer ? [{ id: "computer", provider: computer }] : []),
    ...(deployAgents && computer
      ? [
          {
            id: "agent-workspaces",
            provider: {
              deployable: {
                plan: async () => ({
                  summary: "Seed populated agent directories on the shared computer",
                  steps: ["Copy seeds to /workspace/<agent-id>", "Skip directories already seeded"],
                }),
                deploy: async (context: DeploymentContext) =>
                  computer.deployAgentWorkspaces(
                    {
                      computerId,
                      workspaces: await discoverAgentWorkspaces(context.repositoryRoot),
                    },
                    context,
                  ),
              },
            },
          },
        ]
      : []),
    ...(deployAgents
      ? [{ id: "agent-service", provider: { buildable: agentService, deployable: agentService } }]
      : []),
    ...(deployAgents
      ? [
          {
            id: "agent-registration",
            provider: {
              deployable: {
                plan: async () => ({
                  summary: "Register configured agent entrypoints",
                  steps: [
                    "Create missing provider agents",
                    "Update stable endpoint URLs",
                    "Persist newly issued endpoint credentials in SOPS",
                  ],
                }),
                deploy: async (context: DeploymentContext) =>
                  configureAgentRegistrations(configuration.providers.agent, context),
              },
            },
          },
        ]
      : []),
    ...(options.service === "all" && computer
      ? [
          {
            id: "development-sandbox",
            role: "sandbox" as const,
            provider: {
              deployable: {
                plan: async () => ({
                  summary: "Seed or resume the trusted OpenBot development sandbox",
                  steps: [
                    "Preserve its mutable source tree",
                    "Install the aggregate deployment environment and SOPS identity",
                    "Verify in-sandbox decryption",
                  ],
                }),
                deploy: async (context: DeploymentContext) =>
                  computer.deployDevelopmentSandbox({ computerId: developmentSandboxId }, context),
              },
            },
          },
        ]
      : []),
    ...(options.service === "all" || options.service === "control"
      ? [
          {
            id: "control-service",
            role: "runtime" as const,
            provider: { buildable: controlService, deployable: controlService },
          },
        ]
      : []),
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

export async function configureAgentRegistrations(
  agentProvider: AgentProvider,
  context: DeploymentContext,
  persistSecret: (name: string, value: string) => Promise<void> = (name, value) =>
    setEncryptedSecret(context.repositoryRoot, name, value, { environment: context.environment }),
) {
  const origin = context.inputs.require("agent-service.origin");
  const secrets: Record<string, string> = {};
  for (const agent of await discoverAgents(context.repositoryRoot)) {
    const prefix = agent.slug.replaceAll("-", "_").toUpperCase();
    const apiKeyName = `OPENBOT_AGENT_${prefix}_API_KEY`;
    const webhookKeyName = `OPENBOT_AGENT_${prefix}_WEBHOOK_SIGNING_KEY`;
    const endpointUrl = new URL(`/api/agents/${agent.slug}`, `${origin}/`);
    try {
      await agentProvider.getAgent(agent.slug, { requestId: `deploy:agent:${agent.slug}` });
      if (!context.inputs.secrets()[apiKeyName] || !context.inputs.secrets()[webhookKeyName]) {
        throw new Error(
          `Agent ${agent.slug} already exists but its endpoint credentials are missing from encrypted configuration`,
        );
      }
      await agentProvider.updateAgent(
        agent.slug,
        { displayName: agent.slug, endpointUrl, enabled: true },
        { requestId: `deploy:agent:${agent.slug}:update` },
      );
    } catch (error) {
      if (!(error instanceof AgentProviderError) || error.code !== "not_found") throw error;
      const registered = await agentProvider.registerAgent(
        {
          id: agent.slug,
          displayName: agent.slug,
          endpointUrl,
          streaming: true,
          timeoutMs: 300_000,
        },
        {
          requestId: `deploy:agent:${agent.slug}:register`,
          idempotencyKey: `openbot-agent:${agent.slug}`,
        },
      );
      secrets[apiKeyName] = registered.credentials.apiKey;
      secrets[webhookKeyName] = registered.credentials.webhookSigningKey;
      await persistSecret(apiKeyName, registered.credentials.apiKey);
      await persistSecret(webhookKeyName, registered.credentials.webhookSigningKey);
    }
  }
  return Object.keys(secrets).length ? { secrets } : undefined;
}

async function loadRepositoryConfiguration(): Promise<OpenBotConfiguration> {
  const path = resolve(repositoryRoot, "configuration/index.ts");
  const module = (await import(pathToFileURL(path).href)) as { default?: OpenBotConfiguration };
  if (!module.default)
    throw new Error("configuration/index.ts must export the OpenBot configuration as default");
  return module.default;
}
