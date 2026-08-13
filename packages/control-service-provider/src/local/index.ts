import { homedir } from "node:os";
import type { Buildable, Deployable, DeploymentContext, DeploymentPlan, DeploymentResult, InitializableProvider, ProviderInitialization } from "@openbot/runtime-provider";
import { checkControlService } from "../check.js";
import { processRunner, type CommandRunner } from "../command.js";
import { installLocalService, waitForHealth } from "../local-service.js";
import { buildLocalControlService } from "./build.js";

export interface LocalControlServiceProviderOptions { platform?: NodeJS.Platform; homeDirectory?: string; uid?: number; runner?: CommandRunner; request?: typeof fetch; command?: readonly string[] }

export class LocalControlServiceProvider implements Buildable, Deployable, InitializableProvider {
  readonly initialization: ProviderInitialization = { id: "local-control", label: "Local control service", questions: [] };
  readonly #options: Required<Pick<LocalControlServiceProviderOptions, "platform" | "homeDirectory" | "runner" | "request">> & LocalControlServiceProviderOptions;
  constructor(options: LocalControlServiceProviderOptions = {}) { this.#options = { ...options, platform: options.platform ?? process.platform, homeDirectory: options.homeDirectory ?? homedir(), runner: options.runner ?? processRunner, request: options.request ?? fetch }; }
  check(context: DeploymentContext) { return checkControlService(context, this.#options.runner); }
  build(context: DeploymentContext) { return buildLocalControlService(context, this.#options.runner); }
  async plan(): Promise<DeploymentPlan> { return { summary: "Install the local OpenBot control service", steps: ["Install a dedicated user service", "Smoke-test /healthz"] }; }
  async configure(context: DeploymentContext): Promise<DeploymentResult> { const port = context.environment.OPENBOT_PORT ?? "4100"; const origin = `http://127.0.0.1:${port}`; return { outputs: { "control-service.origin": origin, "runtime.origin": origin }, environmentVariables: { OPENBOT_PUBLIC_ORIGIN: origin, OPENBOT_PORT: port } }; }
  async deploy(context: DeploymentContext): Promise<DeploymentResult> {
    const artifact = context.inputs.require("control-service.artifact");
    await installLocalService(context, this.#options.runner, { id: "openbot-control", description: "OpenBot control service", command: this.#options.command ?? [process.execPath, artifact], environmentFile: ".openbot-deploy/control-service.env", platform: this.#options.platform, homeDirectory: this.#options.homeDirectory, uid: this.#options.uid ?? process.getuid?.() });
    const origin = context.inputs.require("control-service.origin");
    await waitForHealth(this.#options.request, origin);
    return { outputs: { "control-service.deployment-url": origin, "runtime.deployment-url": origin } };
  }
}
