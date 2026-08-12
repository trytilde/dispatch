import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabase, agentPublications, agentRegistrations, skillRegistrations } from "@openbot/db";
import { loadRepository } from "../apps/server/src/repository.js";
import { providerStatuses } from "../apps/server/src/provider-registry.js";
import { reconcileRepository } from "../apps/server/src/reconcile.js";
import { agentSource, publishAgent } from "../apps/server/src/publishing.js";

export interface CliInvocation { command: string; rest: string[] }

export function parseInvocation(argv: readonly string[]): CliInvocation {
  const values = argv.filter((value) => value !== "--");
  return { command: values[0] ?? "help", rest: values.slice(1) };
}

async function main(): Promise<void> {
  const invocation = parseInvocation(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(invocation.command)) return help();
  if (invocation.command === "setup") return setup();
  if (invocation.command === "generate") return delegate("openbot:generate", invocation.rest);
  if (invocation.command === "dev") return delegate("dev", invocation.rest);
  if (invocation.command === "deploy") return delegate("deploy:prod", invocation.rest);
  if (invocation.command === "check") return check();
  if (invocation.command === "doctor") return doctor();
  if (invocation.command === "sync") return sync(invocation.rest);
  if (invocation.command === "status") return status();
  if (invocation.command === "providers") return providers(invocation.rest);
  if (invocation.command === "agent" && invocation.rest[0] === "create") return createAgent(invocation.rest.slice(1));
  throw new Error(`Unknown command: ${[invocation.command, ...invocation.rest].join(" ")}`);
}

function help(): void {
  console.log(`OpenBot repository CLI

  pnpm openbot setup
  pnpm openbot check | doctor | status
  pnpm openbot dev
  pnpm openbot deploy --yes
  pnpm openbot sync [--prune --yes]
  pnpm openbot providers list
  pnpm openbot agent create --id NAME --name "Display name" [--description TEXT] [--publish]
`);
}

async function setup(): Promise<void> {
  await Promise.all(["agents", "providers", "skills", "sandbox/assets"].map((directory) => mkdir(resolve(directory), { recursive: true })));
  console.log("Repository directories are ready. Copy .env.example to .env, configure provider credentials, then run `pnpm openbot doctor` and `pnpm openbot dev`.");
}

async function check(): Promise<void> {
  const repository = await loadRepository();
  console.log(`Configuration ${repository.digest.slice(0, 12)} is valid: ${repository.agents.length} agent(s), ${repository.skills.length} skill(s), ${repository.providerPlugins.length} custom provider plugin(s).`);
}

async function doctor(): Promise<void> {
  await check();
  for (const provider of await providerStatuses()) console.log(`${provider.healthy ? "ok" : "needs setup"}\t${provider.kind}\t${provider.id}${provider.message ? `\t${provider.message}` : ""}`);
}

async function providers(rest: string[]): Promise<void> {
  if ((rest[0] ?? "list") !== "list") throw new Error("Use `pnpm openbot providers list`");
  for (const provider of await providerStatuses()) console.log(`${provider.kind}\t${provider.id}\t${provider.healthy ? "healthy" : "unavailable"}`);
}

async function sync(rest: string[]): Promise<void> {
  const prune = rest.includes("--prune");
  if (prune && !rest.includes("--yes")) throw new Error("--prune disables removed remote agents and requires --yes");
  const report = await reconcileRepository({ prune });
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}

async function status(): Promise<void> {
  const db = createDatabase();
  const [agents, skills, publications] = await Promise.all([db.select().from(agentRegistrations), db.select().from(skillRegistrations), db.select().from(agentPublications)]);
  console.log(JSON.stringify({ agents, skills, publications }, null, 2));
}

async function createAgent(rest: string[]): Promise<void> {
  const id = option(rest, "--id");
  const displayName = option(rest, "--name");
  const description = option(rest, "--description");
  if (!id || !displayName) throw new Error("agent create requires --id and --name");
  const input = { id, displayName, ...(description ? { description } : {}) };
  if (rest.includes("--publish")) {
    console.log(JSON.stringify(await publishAgent(input), null, 2));
    return;
  }
  const repository = await loadRepository();
  const target = resolve(repository.config.agents.directory, `${id}.ts`);
  await writeFile(target, agentSource(input), { encoding: "utf8", flag: "wx" });
  console.log(`Created ${target}. Review it, run \`pnpm openbot check\`, then commit it.`);
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function delegate(script: string, args: readonly string[]): Promise<void> {
  const child = spawn("pnpm", [script, ...args], { stdio: "inherit", env: { ...process.env, NODE_OPTIONS: undefined } });
  const code = await new Promise<number>((resolveCode, reject) => { child.once("error", reject); child.once("exit", (value) => resolveCode(value ?? 1)); });
  if (code) process.exitCode = code;
}

if (import.meta.url === new URL(process.argv[1]!, "file:").href) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
