import { spawn } from "node:child_process";
import { resolve } from "node:path";
import arg from "arg";
import { config as loadDotenv } from "dotenv";
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

export function deploymentUrl(output: string): string {
  const urls = output.match(/https:\/\/[^\s]+/g) ?? [];
  const url = urls.at(-1)?.replace(/[),.;]+$/, "");
  if (!url) throw new Error("Vercel did not return a deployment URL");
  return url;
}

export async function runProductionDeploy(argv: readonly string[]): Promise<void> {
  loadDotenv({ path: resolve(repositoryRoot, ".env.local"), override: false, quiet: true });
  loadDotenv({ path: resolve(repositoryRoot, ".env"), override: false, quiet: true });
  const options = parseOptions(argv);
  if (!options.yes && !options.dryRun) throw new Error("Production deployment requires --yes (or use --dry-run)");

  const report = (event: string, details: Record<string, unknown> = {}): void => {
    process.stdout.write(options.json ? `${JSON.stringify({ event, ...details })}\n` : `${event}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ""}\n`);
  };

  report("validate.started");
  await run("pnpm", ["check"]);
  await run("pnpm", ["build"]);
  report("validate.complete");
  if (options.dryRun) {
    report("deploy.planned", { target: "vercel-production" });
    return;
  }

  const args = ["exec", "vercel", "deploy", "--prod", "--yes"];
  if (process.env.VERCEL_TOKEN) args.push("--token", process.env.VERCEL_TOKEN);
  if (process.env.VERCEL_TEAM_ID) args.push("--scope", process.env.VERCEL_TEAM_ID);
  report("deploy.started");
  const deployed = await run("pnpm", args, false);
  const url = deploymentUrl(`${deployed.stdout}\n${deployed.stderr}`);
  report("deploy.complete", { url });

  const health = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(30_000) });
  if (!health.ok) throw new Error(`Health smoke failed (${health.status})`);
  const body = await health.json() as { ok?: unknown };
  if (body.ok !== true) throw new Error("Health smoke returned an invalid response");
  report("smoke.complete", { url: `${url}/healthz` });
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
