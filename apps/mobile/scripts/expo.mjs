// Runs the Expo CLI with the Android and Node toolchain already resolved.
//
// Every mobile package script goes through here, so `pnpm --filter @tryopenbot/mobile dev`
// works from any shell without an `export PATH=...` prefix, and Gradle inherits a real
// node binary when `run:android` shells out to it.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { toolchainEnv } from "./toolchain.mjs";

const require = createRequire(import.meta.url);
const expoCli = join(dirname(require.resolve("expo/package.json")), "bin", "cli");

const child = spawn(process.execPath, [expoCli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: toolchainEnv(),
});

child.on("error", (error) => {
  console.error(`Failed to start the Expo CLI at ${expoCli}: ${error.message}`);
  process.exit(1);
});

// Re-raise rather than translating to an exit code, so Ctrl-C on `expo start` still
// looks like an interrupt to whatever invoked this.
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
