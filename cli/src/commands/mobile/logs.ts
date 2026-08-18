// Streams the React Native application log from the connected device. Extra
// arguments pass straight through to logcat, e.g. `-d` for a one-shot dump.
import { spawn } from "node:child_process";
import { requireAndroidTool, toolchainEnvironment } from "../../toolchain.js";

export async function runLogs(argv: readonly string[]): Promise<number> {
  const adb = requireAndroidTool("adb");
  const child = spawn(adb, ["logcat", "-s", "ReactNativeJS:V", ...argv], {
    stdio: "inherit",
    env: toolchainEnvironment(),
  });
  return await new Promise<number>((resolvePromise) => {
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}
