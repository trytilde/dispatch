import { spawn, type ChildProcess } from "node:child_process";
import { repositoryRoot } from "./paths.js";

export function run(command: string, args: readonly string[], environment: NodeJS.ProcessEnv = process.env): ChildProcess {
  return spawn(command, [...args], {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });
}

export async function runChecked(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const child = run(command, args, env);
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    },
  );
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed${result.signal ? ` with ${result.signal}` : ` with exit code ${result.code ?? "unknown"}`}`,
    );
  }
}

export async function supervise(children: readonly ChildProcess[]): Promise<never> {
  let stopping = false;
  let requestedStop = false;
  const stop = (signal: NodeJS.Signals = "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    for (const child of children) if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", () => {
    requestedStop = true;
    stop("SIGINT");
  });
  process.once("SIGTERM", () => {
    requestedStop = true;
    stop("SIGTERM");
  });

  const result = await Promise.race(
    children.map(
      (child) =>
        new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
          child.once("error", reject);
          child.once("exit", (code, signal) => resolve({ code, signal }));
        }),
    ),
  );
  stop();
  process.exit(requestedStop ? 0 : (result.code ?? (result.signal ? 1 : 0)));
}
