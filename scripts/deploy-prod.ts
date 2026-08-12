import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

export interface DeployOptions {
  yes: boolean;
  dryRun: boolean;
  json: boolean;
}

export function parseOptions(argv: readonly string[]): DeployOptions {
  const args = argv.filter((argument) => argument !== "--");
  const known = new Set(["--yes", "--dry-run", "--json"]);
  const unknown = args.filter((argument) => !known.has(argument));
  if (unknown.length) throw new Error(`Unknown deploy option: ${unknown.join(", ")}`);
  return {
    yes: args.includes("--yes"),
    dryRun: args.includes("--dry-run"),
    json: args.includes("--json"),
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

async function main(): Promise<void> {
  loadDotenv({ path: resolve(".env.local"), override: false, quiet: true });
  loadDotenv({ path: resolve(".env"), override: false, quiet: true });
  const options = parseOptions(process.argv.slice(2));
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    const secrets = [process.env.VERCEL_TOKEN ?? ""];
    process.stderr.write(`${redact(error instanceof Error ? error.message : String(error), secrets)}\n`);
    process.exitCode = 1;
  });
}
