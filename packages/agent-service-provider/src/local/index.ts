import { homedir } from "node:os";
import type {
  Buildable,
  Deployable,
  DeploymentContext,
  DeploymentPlan,
  DeploymentResult,
  InitializableProvider,
  ProviderInitialization,
} from "@tryopenbot/runtime-provider";
import {
  installLocalService,
  processRunner,
  waitForHealth,
  type CommandRunner,
} from "@tryopenbot/control-service-provider";
import { checkAgentService } from "../check.js";
import { agentLocalArtifact, buildLocalAgentService } from "./build.js";

export interface LocalAgentServiceProviderOptions {
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  uid?: number;
  runner?: CommandRunner;
  request?: typeof fetch;
  command?: readonly string[];
}

export class LocalAgentServiceProvider implements Buildable, Deployable, InitializableProvider {
  readonly initialization: ProviderInitialization = {
    id: "local-agents",
    label: "Local agent service",
    questions: [],
  };
  readonly #options: Required<
    Pick<LocalAgentServiceProviderOptions, "platform" | "homeDirectory" | "runner" | "request">
  > &
    LocalAgentServiceProviderOptions;
  constructor(options: LocalAgentServiceProviderOptions = {}) {
    this.#options = {
      ...options,
      platform: options.platform ?? process.platform,
      homeDirectory: options.homeDirectory ?? homedir(),
      runner: options.runner ?? processRunner,
      request: options.request ?? fetch,
    };
  }
  check(context: DeploymentContext) {
    return checkAgentService(context, this.#options.runner);
  }
  build(context: DeploymentContext) {
    return buildLocalAgentService(context);
  }
  async plan(): Promise<DeploymentPlan> {
    return {
      summary: "Install the local OpenBot agent service",
      steps: ["Install a separate user service", "Smoke-test /healthz"],
    };
  }
  async configure(context: DeploymentContext): Promise<DeploymentResult> {
    const port = context.environment.OPENBOT_AGENT_PORT ?? "4101";
    const origin = `http://127.0.0.1:${port}`;
    return {
      outputs: { "agent-service.origin": origin },
      environmentVariables: { OPENBOT_AGENT_SERVICE_ORIGIN: origin, OPENBOT_AGENT_PORT: port },
    };
  }
  async deploy(context: DeploymentContext): Promise<DeploymentResult> {
    const artifact = context.inputs.require("agent-service.artifact");
    await installLocalService(context, this.#options.runner, {
      id: "openbot-agents",
      description: "OpenBot agent service",
      command: this.#options.command ?? [process.execPath, artifact],
      environmentFile: ".openbot-deploy/agent-service.env",
      platform: this.#options.platform,
      homeDirectory: this.#options.homeDirectory,
      uid: this.#options.uid ?? process.getuid?.(),
    });
    const origin = context.inputs.require("agent-service.origin");
    await waitForHealth(this.#options.request, origin);
    return { outputs: { "agent-service.deployment-url": origin } };
  }
}

export { agentLocalArtifact };
