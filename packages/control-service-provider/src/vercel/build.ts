import { cp, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { build } from "tsdown";
import type { DeploymentContext, DeploymentResult } from "@openbot/runtime-provider-core";
import type { CommandRunner } from "../command.js";

export const controlVercelArtifact = ".openbot-deploy/vercel/control";
const entry = fileURLToPath(new URL("./assets/entry.ts", import.meta.url));
const functionConfig = fileURLToPath(new URL("./assets/function-config.json", import.meta.url));
const outputConfig = fileURLToPath(new URL("./assets/output-config.json", import.meta.url));
export const vercelProjectConfig = fileURLToPath(new URL("./assets/vercel.json", import.meta.url));

export async function buildVercelControlService(context: DeploymentContext, runner: CommandRunner): Promise<DeploymentResult> {
  await runner.run("pnpm", ["--filter", "@openbot/web", "build"], { cwd: context.repositoryRoot, environment: context.environment });
  const root = resolve(context.repositoryRoot, controlVercelArtifact);
  const output = resolve(root, ".vercel/output");
  const functionDirectory = resolve(output, "functions/control.func");
  const generatedEntry = resolve(context.repositoryRoot, ".openbot-deploy/generated/control-service-vercel.ts");
  await rm(root, { recursive: true, force: true });
  await mkdir(functionDirectory, { recursive: true });
  await mkdir(dirname(generatedEntry), { recursive: true });
  await writeFile(generatedEntry, await renderEntry(resolve(context.repositoryRoot, "apps/control-service/src/app.ts")));
  await build({
    cwd: context.repositoryRoot,
    entry: [generatedEntry],
    format: ["esm"],
    platform: "node",
    target: "node24",
    outDir: functionDirectory,
    clean: false,
    minify: true,
    sourcemap: false,
    outputOptions: { entryFileNames: "index.mjs" },
  });
  await Promise.all([
    cp(resolve(context.repositoryRoot, "apps/web/dist"), resolve(output, "static"), { recursive: true }),
    copyFile(functionConfig, resolve(functionDirectory, ".vc-config.json")),
    copyFile(outputConfig, resolve(output, "config.json")),
  ]);
  return { outputs: { "control-service.artifact": root } };
}

async function renderEntry(controlSource: string): Promise<string> {
  const template = await readFile(entry, "utf8");
  const rendered = template.replaceAll("__OPENBOT_CONTROL_SOURCE__", JSON.stringify(controlSource));
  if (/__OPENBOT_[A-Z_]+__/.test(rendered)) throw new Error(`Unresolved provider template value in ${entry}`);
  return rendered;
}
