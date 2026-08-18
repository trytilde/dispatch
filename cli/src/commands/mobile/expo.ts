// Runs the Expo CLI against the workspace's mobile app with the toolchain
// resolved, from any working directory. Gradle inherits a real node binary and
// the Android SDK without any caller-side PATH exports.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { toolchainEnvironment } from "../../toolchain.js";
import { mobileAppDirectory, repositoryRoot } from "../../workspace.js";

export async function runExpo(args: readonly string[]): Promise<number> {
  const root = repositoryRoot();
  const appDirectory = mobileAppDirectory(root);
  const require = createRequire(join(appDirectory, "package.json"));
  const expoCli = join(dirname(require.resolve("expo/package.json")), "bin", "cli");

  const child = spawn(process.execPath, [expoCli, ...args], {
    cwd: appDirectory,
    stdio: "inherit",
    env: toolchainEnvironment(),
  });
  return await new Promise<number>((resolvePromise, rejectPromise) => {
    child.on("error", (error) =>
      rejectPromise(new Error(`Failed to start the Expo CLI at ${expoCli}: ${error.message}`)),
    );
    // Re-raise signals so Ctrl-C on `expo start` still reads as an interrupt to
    // whatever invoked this.
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}
