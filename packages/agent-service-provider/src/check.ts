import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DeploymentContext } from "@openbot/runtime-provider-core";
import type { CommandRunner } from "@openbot/control-service-provider";
import { discoverAgents } from "./discovery.js";

const configAsset = fileURLToPath(new URL("./assets/agents-tsconfig.json", import.meta.url));

export async function checkAgentService(context: DeploymentContext, runner: CommandRunner): Promise<void> {
  const agents = await discoverAgents(context.repositoryRoot);
  const config = resolve(context.repositoryRoot, ".openbot-deploy/generated/agents.tsconfig.json");
  const base = JSON.parse(await readFile(configAsset, "utf8")) as Record<string, unknown>;
  await mkdir(dirname(config), { recursive: true });
  await writeFile(config, `${JSON.stringify({ ...base, files: agents.map((agent) => relative(dirname(config), agent.path)) }, null, 2)}\n`);
  await runner.run("pnpm", ["exec", "tsgo", "-p", config, "--noEmit"], { cwd: context.repositoryRoot, environment: context.environment });
}
