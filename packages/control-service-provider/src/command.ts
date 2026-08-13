import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(
    command: string,
    args: readonly string[],
    options: { cwd: string; environment: NodeJS.ProcessEnv; inherit?: boolean; input?: string },
  ): Promise<CommandResult>;
}

export const processRunner: CommandRunner = {
  run(command, args, options) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.environment,
        stdio: options.inherit
          ? "inherit"
          : [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      if (options.input !== undefined) child.stdin?.end(options.input);
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolve({ stdout, stderr })
          : reject(
              new Error(
                `${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}\n${stdout}${stderr}`,
              ),
            ),
      );
    });
  },
};

export async function runNativeCheck(
  runner: CommandRunner,
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
  projects: readonly string[],
): Promise<void> {
  await Promise.all(
    projects.map((project) =>
      runner.run("pnpm", ["exec", "tsgo", "-p", project, "--noEmit"], {
        cwd: repositoryRoot,
        environment,
      }),
    ),
  );
}
