import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { build } from "tsdown";
import type { DeploymentContext, DeploymentResult } from "@openbot/runtime-provider-core";
import type { CommandRunner } from "./command.js";
import { runNativeCheck } from "./command.js";

export const controlLocalArtifact = ".openbot-deploy/control-service/service.mjs";
export const controlVercelArtifact = ".openbot-deploy/vercel/control";

export async function checkControlService(context: DeploymentContext, runner: CommandRunner): Promise<void> {
  await runNativeCheck(runner, context.repositoryRoot, context.environment, ["apps/server/tsconfig.json", "apps/web/tsconfig.json"]);
}

export async function buildLocalControlService(context: DeploymentContext, runner: CommandRunner): Promise<DeploymentResult> {
  await runner.run("pnpm", ["--filter", "@openbot/web", "build"], { cwd: context.repositoryRoot, environment: context.environment });
  const outfile = resolve(context.repositoryRoot, controlLocalArtifact);
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    cwd: context.repositoryRoot,
    entry: ["apps/server/src/service.ts"],
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

export async function buildVercelControlService(context: DeploymentContext, runner: CommandRunner): Promise<DeploymentResult> {
  await runner.run("pnpm", ["--filter", "@openbot/web", "build"], { cwd: context.repositoryRoot, environment: context.environment });
  const root = resolve(context.repositoryRoot, controlVercelArtifact);
  const output = resolve(root, ".vercel/output");
  const functionDirectory = resolve(output, "functions/control.func");
  await rm(root, { recursive: true, force: true });
  await mkdir(functionDirectory, { recursive: true });
  await build({
    cwd: context.repositoryRoot,
    entry: ["apps/server/src/vercel.ts"],
    format: ["esm"],
    platform: "node",
    target: "node24",
    outDir: functionDirectory,
    clean: false,
    minify: true,
    sourcemap: false,
    outputOptions: { entryFileNames: "index.mjs" },
  });
  await cp(resolve(context.repositoryRoot, "apps/web/dist"), resolve(output, "static"), { recursive: true });
  await writeJson(resolve(functionDirectory, ".vc-config.json"), { runtime: "nodejs24.x", handler: "index.mjs", launcherType: "Nodejs" });
  await writeJson(resolve(output, "config.json"), {
    version: 3,
    routes: [
      { handle: "filesystem" },
      { src: "/healthz", dest: "/control" },
      { src: "/rpc(?:/.*)?", dest: "/control" },
      { src: "/.*", dest: "/index.html" },
    ],
  });
  return { outputs: { "control-service.artifact": root } };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
