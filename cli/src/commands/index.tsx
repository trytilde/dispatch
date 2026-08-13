import { spawn } from "node:child_process";
import arg from "arg";
import type { ReactElement } from "react";
import { render } from "ink";
import { repositoryRoot } from "../paths.js";
import { Help, Success } from "../ui.js";
import { runProductionDeploy } from "./deploy.js";
import { runDevelopment } from "./dev.js";
import { runInitialization } from "./init.js";
import { runSecrets } from "./secrets.js";
import { runDevelopmentServer } from "./serve.js";

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

export async function runCommand(command: string, args: readonly string[]): Promise<void> {
  if (["help", "--help", "-h"].includes(command)) return show(<Help />);
  if (command === "init") {
    rejectArguments(command, args);
    await runInitialization();
    return show(<Success title="OpenBot configuration initialized" />);
  }
  if (command === "dev") {
    rejectArguments(command, args);
    if (process.stdout.isTTY) show(<Success title="Starting OpenBot development" />);
    return runDevelopment();
  }
  if (command === "_serve") {
    rejectArguments(command, args);
    return runDevelopmentServer();
  }
  if (command === "deploy") return runProductionDeploy(args);
  if (command === "secrets") return runSecrets(args);
  if (command === "check" || command === "build" || command === "test") return delegate(command, args);
  throw new Error(`Unknown command: ${[command, ...args].join(" ")}`);
}

function rejectArguments(command: string, args: readonly string[]): void {
  if (args.length) throw new Error(`Unknown ${command} option: ${args.join(", ")}`);
}

function show(view: ReactElement): void {
  const app = render(view);
  app.unmount();
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
