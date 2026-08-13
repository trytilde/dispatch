import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { materializeFileTemplate } from "@openbot/utilities";
import type { DeploymentContext } from "@openbot/runtime-provider";
import type { CommandRunner } from "@openbot/control-service-provider";
import { agentTypeScriptPaths, discoverAgents, globalInstrumentationPath } from "./discovery.js";

const configTemplate = fileURLToPath(new URL("./assets/agents-tsconfig.json.hbs", import.meta.url));

export async function checkAgentService(context: DeploymentContext, runner: CommandRunner): Promise<void> {
  const agents = await discoverAgents(context.repositoryRoot);
  const agentFiles = (await Promise.all(agents.map(agentTypeScriptPaths))).flat();
  const config = resolve(context.repositoryRoot, ".openbot-deploy/generated/agents.tsconfig.json");
  await materializeFileTemplate(configTemplate, config, {
    FILES: JSON.stringify([
      relative(dirname(config), globalInstrumentationPath(context.repositoryRoot)),
      ...agentFiles.map((path) => relative(dirname(config), path)),
    ], null, 2),
  });
  await runner.run("pnpm", ["exec", "tsgo", "-p", config, "--noEmit"], { cwd: context.repositoryRoot, environment: context.environment });
}
