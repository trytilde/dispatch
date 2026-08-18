// Packages the Electron app. Electron Builder targets the host platform, so a mac
// build must run on a mac and a Linux build on Linux; `openbot remote <host> desktop`
// covers the cross-platform case.
import { spawn } from "node:child_process";
import { repositoryRoot } from "../../workspace.js";

export async function runDesktopPackage(args: readonly string[]): Promise<number> {
  const child = spawn("pnpm", ["--filter", "@tryopenbot/desktop", "package", ...args], {
    cwd: repositoryRoot(),
    stdio: "inherit",
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
