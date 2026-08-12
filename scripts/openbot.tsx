import { spawn } from "node:child_process";
import React, { type ReactElement } from "react";
import { render } from "ink";
import { CommandMenu, Failure, Help, Success } from "./openbot-ui.js";

export interface CliInvocation { command: string; rest: string[] }

export function parseInvocation(argv: readonly string[]): CliInvocation {
  const values = argv.filter((value) => value !== "--");
  return { command: values[0] ?? "help", rest: values.slice(1) };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((value) => value !== "--");
  const invocation = argv.length === 0 && process.stdin.isTTY && process.stdout.isTTY
    ? { command: await interactiveCommand(), rest: [] }
    : parseInvocation(argv);
  if (!invocation.command) return;
  if (["help", "--help", "-h"].includes(invocation.command)) return show(<Help />);
  if (invocation.command === "dev") return delegate("dev", invocation.rest);
  if (invocation.command === "deploy") return delegate("deploy:prod", invocation.rest);
  if (invocation.command === "check") return delegate("check", invocation.rest);
  if (invocation.command === "build") return delegate("build", invocation.rest);
  if (invocation.command === "test") return delegate("test", invocation.rest);
  throw new Error(`Unknown command: ${[invocation.command, ...invocation.rest].join(" ")}`);
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
  const child = spawn("pnpm", [script, ...args], { stdio: "inherit", env: { ...process.env, NODE_OPTIONS: undefined } });
  const code = await new Promise<number>((resolveCode, reject) => { child.once("error", reject); child.once("exit", (value) => resolveCode(value ?? 1)); });
  if (code) process.exitCode = code;
}

if (import.meta.url === new URL(process.argv[1]!, "file:").href) main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) printJson({ error: message });
  else show(<Failure message={message} />);
  process.exitCode = 1;
});
