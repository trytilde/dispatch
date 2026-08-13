#!/usr/bin/env node

import React, { type ReactElement } from "react";
import { render } from "ink";
import { redact } from "./commands/deploy.js";
import { parseInvocation, runCommand } from "./commands/index.js";
import { runWithTypeScriptLoader } from "./typescript-loader.js";
import { CommandMenu, Failure } from "./ui.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((value) => value !== "--");
  const invocation =
    argv.length === 0 && process.stdin.isTTY && process.stdout.isTTY
      ? { command: await interactiveCommand(), rest: [] }
      : parseInvocation(argv);
  if (!invocation.command) return;
  await runCommand(invocation.command, invocation.rest);
}

async function interactiveCommand(): Promise<string> {
  let selected = "";
  const app = render(
    <CommandMenu
      onSelect={(command) => {
        selected = command;
      }}
    />,
    { alternateScreen: true },
  );
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

runWithTypeScriptLoader(main).catch((error) => {
  const message = redact(error instanceof Error ? error.message : String(error), [
    process.env.VERCEL_TOKEN ?? "",
  ]);
  if (process.argv.includes("--json")) printJson({ error: message });
  else show(<Failure message={message} />);
  process.exitCode = 1;
});
