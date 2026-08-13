import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { build } from "tsdown";
import type { DeploymentContext, DeploymentResult } from "@openbot/runtime-provider";
import type { CommandRunner } from "../command.js";

export const controlLocalArtifact = ".openbot-deploy/control-service/service.mjs";

export async function buildLocalControlService(context: DeploymentContext, runner: CommandRunner): Promise<DeploymentResult> {
  await runner.run("pnpm", ["--filter", "@openbot/web", "build"], { cwd: context.repositoryRoot, environment: context.environment });
  const outfile = resolve(context.repositoryRoot, controlLocalArtifact);
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    cwd: context.repositoryRoot,
    entry: ["apps/control-service/src/service.ts"],
    format: ["esm"],
    platform: "node",
    target: "node24",
    outDir: dirname(outfile),
    clean: true,
    minify: false,
    sourcemap: false,
    outputOptions: { entryFileNames: "service.mjs" },
  });
  return { outputs: { "control-service.artifact": outfile } };
}
