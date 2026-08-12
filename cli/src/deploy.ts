import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import arg from "arg";
import { config as loadDotenv } from "dotenv";
import type { OpenBotConfig } from "@openbot/config";
import { createRuntimeProvider } from "@openbot/runtime-provider";
import { deployProviders, type DeploymentEvent } from "@openbot/runtime-provider-core";
import { loadDeploymentConfiguration } from "./initialization.js";
import { repositoryRoot } from "./paths.js";

export interface DeployOptions {
  yes: boolean;
  dryRun: boolean;
  json: boolean;
}

export function parseOptions(argv: readonly string[]): DeployOptions {
  const parsed = arg({
    "--yes": Boolean,
    "--dry-run": Boolean,
    "--json": Boolean,
  }, { argv: argv.filter((argument) => argument !== "--") });
  if (parsed._.length) throw new Error(`Unknown deploy option: ${parsed._.join(", ")}`);
  return {
    yes: parsed["--yes"] ?? false,
    dryRun: parsed["--dry-run"] ?? false,
    json: parsed["--json"] ?? false,
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
  if (!options.yes && !options.dryRun) throw new Error("Production deployment requires --yes (or use --dry-run)");

  const report = ({ event, details = {} }: DeploymentEvent): void => {
    process.stdout.write(options.json ? `${JSON.stringify({ event, ...details })}\n` : `${event}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ""}\n`);
  };

  report({ event: "validate.started" });
  await run("pnpm", ["check"]);
  await run("pnpm", ["build"]);
  report({ event: "validate.complete" });

  const config = await loadRepositoryConfig();
  const deploymentConfiguration = await loadDeploymentConfiguration(repositoryRoot, { environment: process.env });
  const runtimeId = deploymentConfiguration.environment.OPENBOT_RUNTIME_PROVIDER ?? config.providers.runtime;
  const runtime = createRuntimeProvider(runtimeId);
  await deployProviders([{ id: `runtime:${runtimeId}`, role: "runtime", provider: { deployable: runtime } }], {
    target: "production",
    dryRun: options.dryRun,
    repositoryRoot,
    environment: deploymentConfiguration.environment,
    initialInputs: deploymentConfiguration.inputs,
    report,
  });
}

async function loadRepositoryConfig(): Promise<OpenBotConfig> {
  const module = await import(pathToFileURL(resolve(repositoryRoot, "openbot.config.ts")).href) as { default?: OpenBotConfig };
  if (!module.default) throw new Error("openbot.config.ts must export the OpenBot configuration as default");
  return module.default;
}

async function run(command: string, args: readonly string[], inherit = true): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolvePromise({ stdout, stderr })
      : reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`)));
  });
}
