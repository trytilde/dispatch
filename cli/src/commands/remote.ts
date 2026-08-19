// Runs a development task on a configured remote host over ssh. The remote does
// the heavy work — emulator, Gradle, Metro — and `openbot connect` carries
// its ports back to this workstation.
import { spawn } from "node:child_process";
import arg from "arg";
import { loadHosts, resolveHost } from "../hosts.js";
import { repositoryRoot } from "../workspace.js";

const tasks: Record<string, string> = {
  emulator: "pnpm dev:mobile:emulator",
  dev: "pnpm dev:mobile",
  android: "pnpm dev:mobile:android",
  ios: "pnpm dev:mobile:ios",
  build: "pnpm --filter @tryopenbot/mobile build",
  desktop: "pnpm dev:desktop",
  "desktop-package": "pnpm desktop:package",
  doctor: "pnpm doctor",
};

export async function runRemote(argv: readonly string[]): Promise<number> {
  const options = arg({}, { argv: [...argv], permissive: true });
  const [name, task = "emulator"] = options._;
  if (!name || !(task in tasks)) {
    console.error(
      `Usage: openbot remote <host> <${Object.keys(tasks).join("|")}>  (default: emulator)`,
    );
    return 1;
  }
  const host = resolveHost(name, loadHosts(repositoryRoot()));
  if (task === "ios" && host.platform !== "mac") {
    console.error(`Host ${name} is ${host.platform}; iOS needs a mac host.`);
    return 1;
  }
  // Electron Builder targets the host platform, so a mac artifact needs a mac host.
  if (task === "desktop-package" && host.platform !== "mac")
    console.log(`note: ${name} is ${host.platform}; this produces ${host.platform} artifacts only`);
  const repositoryPath = host.path ?? "~/openbot";
  const command = `cd ${repositoryPath} && ${tasks[task]}`;
  console.log(`${host.ssh}: ${command}`);
  // -t keeps interactive tasks (Metro, emulator logs) attached to this terminal.
  const child = spawn("ssh", ["-t", host.ssh, command], { stdio: "inherit" });
  const code = await new Promise<number>((resolvePromise) => {
    child.on("exit", (exitCode, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolvePromise(exitCode ?? 0);
    });
  });
  if (code === 0 && ["emulator", "dev", "android", "desktop"].includes(task))
    console.log(`next: openbot connect ${name}`);
  return code;
}
