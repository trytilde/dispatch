import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import arg from "arg";
import React, { type ReactElement } from "react";
import { render } from "ink";
import { runProductionDeploy, redact } from "./deploy.js";
import { runDevelopment } from "./dev.js";
import { runInitialization } from "./init-ui.js";
import { runDevelopmentServer } from "./server.js";
import { repositoryRoot } from "./paths.js";
import { runSecrets } from "./secrets.js";
import { CommandMenu, Failure, Help, Success } from "./ui.js";

export interface CliInvocation { command: string; rest: string[] }

export function parseInvocation(argv: readonly string[]): CliInvocation {
  const parsed = arg({
    "--help": Boolean,
    "-h": "--help",
  }, {
    argv: argv.filter((value) => value !== "--"),
    stopAtPositional: true,
  });
  if (parsed["--help"]) return { command: "help", rest: [] };
  const [command = "help", ...rest] = parsed._;
  return { command, rest };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((value) => value !== "--");
  const invocation = argv.length === 0 && process.stdin.isTTY && process.stdout.isTTY
    ? { command: await interactiveCommand(), rest: [] }
    : parseInvocation(argv);
  if (!invocation.command) return;
  if (["help", "--help", "-h"].includes(invocation.command)) return show(<Help />);
  if (invocation.command === "init") {
    rejectArguments("init", invocation.rest);
    await runInitialization();
    return show(<Success title="OpenBot configuration initialized" />);
  }
  if (invocation.command === "dev") {
    rejectArguments("dev", invocation.rest);
    if (process.stdout.isTTY) show(<Success title="Starting OpenBot development" />);
    return runDevelopment();
  }
  if (invocation.command === "_serve") {
    rejectArguments(invocation.command, invocation.rest);
    return runDevelopmentServer();
  }
  if (invocation.command === "deploy") return runProductionDeploy(invocation.rest);
  if (invocation.command === "secrets") return runSecrets(invocation.rest);
  if (invocation.command === "check") return delegate("check", invocation.rest);
  if (invocation.command === "build") return delegate("build", invocation.rest);
  if (invocation.command === "test") return delegate("test", invocation.rest);
  throw new Error(`Unknown command: ${[invocation.command, ...invocation.rest].join(" ")}`);
}

function rejectArguments(command: string, args: readonly string[]): void {
  if (args.length) throw new Error(`Unknown ${command} option: ${args.join(", ")}`);
}

async function interactiveCommand(): Promise<string> {
  let selected = "";
  const app = render(<CommandMenu onSelect={(command) => { selected = command; }} />, { alternateScreen: true });
  await app.waitUntilExit();
  return selected;
}

function show(view: ReactElement): void {
  const app = render(view);
  app.unmount();
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function delegate(script: string, args: readonly string[]): Promise<void> {
  if (process.stdout.isTTY) show(<Success title={`Starting pnpm ${script}`} />);
  const child = spawn("pnpm", [script, ...args], {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: undefined },
  });
  const code = await new Promise<number>((resolveCode, reject) => { child.once("error", reject); child.once("exit", (value) => resolveCode(value ?? 1)); });
  if (code) process.exitCode = code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => {
  const message = redact(error instanceof Error ? error.message : String(error), [process.env.VERCEL_TOKEN ?? ""]);
  if (process.argv.includes("--json")) printJson({ error: message });
  else show(<Failure message={message} />);
  process.exitCode = 1;
});
