import type { AgentProvider } from "@tryopenbot/agent-provider";
import { discoverAgents, type AgentServiceProvider } from "@tryopenbot/agent-service-provider";
import {
  DeploymentOutputs,
  type DeploymentContext,
  type DeploymentEvent,
  type DeploymentPersistence,
  type DeploymentReporter,
  type DeployableProvider,
  runProviderLifecycleHook,
} from "@tryopenbot/runtime-provider";
import type { SkillProvider } from "@tryopenbot/skills-provider";
import type { ToolProvider } from "@tryopenbot/tools-provider";
import {
  setEncryptedSecret,
  setEnvironmentValue,
  unsetEncryptedSecret,
  unsetEnvironmentValue,
} from "./initialization.js";

export interface ReconcileAgentResourcesOptions {
  repositoryRoot: string;
  environment: NodeJS.ProcessEnv;
  providers: {
    agent: AgentProvider;
    agentService: AgentServiceProvider;
    skills: SkillProvider;
    tools: ToolProvider;
  };
  devMode: boolean;
  persistEnvironment?: (name: string, value: string, description: string) => Promise<void>;
  persistSecret?: (name: string, value: string, description: string) => Promise<void>;
  unsetEnvironment?: (name: string) => Promise<void>;
  unsetSecret?: (name: string) => Promise<void>;
  report?: DeploymentReporter;
}

/** Run each authored agent through skills, tools, then agent provider lifecycles. */
export async function reconcileAgentResources(
  options: ReconcileAgentResourcesOptions,
): Promise<void> {
  const sources = await discoverAgents(options.repositoryRoot);
  const report = options.report ?? (() => undefined);
  const persistence = repositoryDeploymentPersistence(options);
  const agentServiceOrigin = (
    await runProviderLifecycleHook(
      options.providers.agentService,
      "Agent Service Provider",
      "base URL resolution",
      () =>
        options.providers.agentService.baseUrl({
          devMode: options.devMode,
          environment: options.environment,
        }),
    )
  )
    .toString()
    .replace(/\/$/, "");
  report({ event: "agent.lifecycle.started", details: { total: sources.length } });

  for (const [index, source] of sources.entries()) {
    const progress = { agentId: source.slug, index: index + 1, total: sources.length };
    report({ event: "agent.reconcile.started", details: progress });
    const context: DeploymentContext = {
      devMode: options.devMode,
      repositoryRoot: options.repositoryRoot,
      environment: options.environment,
      inputs: new DeploymentOutputs(),
      persistence,
      agentId: source.slug,
      agentPath: source.directory,
      agentServiceOrigin,
      platformIds: [
        ...new Set(
          [
            options.providers.agentService,
            options.providers.agent,
            options.providers.skills,
            options.providers.tools,
          ].flatMap((provider) => provider.platforms?.map((platform) => platform.id) ?? []),
        ),
      ],
      report,
    };
    for (const [providerId, provider] of [
      ["skills", options.providers.skills],
      ["tools", options.providers.tools],
      ["agent", options.providers.agent],
    ] as const) {
      await runAgentProvider(providerId, provider, context);
    }
    report({ event: "agent.reconcile.complete", details: progress });
  }
}

async function runAgentProvider(
  providerId: string,
  provider: DeployableProvider,
  context: DeploymentContext,
): Promise<void> {
  const providerType =
    providerId === "skills"
      ? "Skills Provider"
      : providerId === "tools"
        ? "Tools Provider"
        : "Agent Provider";
  context.report({
    event: "agent.provider.started",
    details: { providerId, agentId: context.agentId },
  });
  if (provider.buildable) {
    await runProviderLifecycleHook(provider, providerType, "check", () =>
      provider.buildable!.check(context),
    );
    context.inputs.merge(
      await runProviderLifecycleHook(provider, providerType, "build", () =>
        provider.buildable!.build(context),
      ),
    );
  }
  if (provider.deployable) {
    if (provider.deployable.configure)
      context.inputs.merge(
        await runProviderLifecycleHook(provider, providerType, "configure", () =>
          provider.deployable!.configure!(context),
        ),
      );
    context.inputs.merge(
      await runProviderLifecycleHook(provider, providerType, "deploy", () =>
        provider.deployable!.deploy(context),
      ),
    );
  }
  context.report({
    event: "agent.provider.complete",
    details: { providerId, agentId: context.agentId },
  });
}

export function repositoryDeploymentPersistence(
  options: Pick<
    ReconcileAgentResourcesOptions,
    | "repositoryRoot"
    | "environment"
    | "persistEnvironment"
    | "persistSecret"
    | "unsetEnvironment"
    | "unsetSecret"
  >,
): DeploymentPersistence {
  return {
    setEnvironment:
      options.persistEnvironment ??
      ((name, value, description) =>
        setEnvironmentValue(options.repositoryRoot, name, value, description)),
    setSecret:
      options.persistSecret ??
      ((name, value, description) =>
        setEncryptedSecret(options.repositoryRoot, name, value, {
          environment: options.environment,
          description,
        })),
    unsetEnvironment:
      options.unsetEnvironment ?? ((name) => unsetEnvironmentValue(options.repositoryRoot, name)),
    unsetSecret:
      options.unsetSecret ??
      ((name) =>
        unsetEncryptedSecret(options.repositoryRoot, name, { environment: options.environment })),
  };
}

/** Render lifecycle progress for humans while leaving JSON/reporting policy with the command. */
export function formatAgentLifecycleProgress(event: DeploymentEvent): string | undefined {
  const total = integer(event.details?.total);
  if (event.event === "agent.lifecycle.started" && total !== undefined)
    return `Reconciling Tilde resources for ${total} authored agent${total === 1 ? "" : "s"}`;
  const index = integer(event.details?.index);
  const agentId = event.details?.agentId;
  if (index === undefined || total === undefined || typeof agentId !== "string") return undefined;
  if (event.event === "agent.reconcile.started")
    return `[${index}/${total}] Deploying ${agentId} agent`;
  return undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}
