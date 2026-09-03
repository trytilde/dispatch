import { spawnSync } from "node:child_process";

const target =
  process.platform === "darwin" ? "--mac" : process.platform === "linux" ? "--linux" : undefined;
if (!target) {
  process.stderr.write("Dispatch desktop packaging supports macOS and Linux only.\n");
  process.exit(1);
}

const executable = process.platform === "win32" ? "electron-builder.cmd" : "electron-builder";
// The generic publish provider interpolates this into latest-*.yml. Local packaging has
// no bucket, so point it somewhere obviously local rather than leaving it empty.
const env = {
  ...process.env,
  DISPATCH_DESKTOP_UPDATES_URL:
    process.env.DISPATCH_DESKTOP_UPDATES_URL ?? "http://127.0.0.1/desktop",
};
// appId has to be a command-line override: electron-builder strips ${env.*} macros out of
// that field. package.json carries the official default, so this only differs for a fork.
const appId = process.env.DISPATCH_APP_ID?.trim();
const args = appId ? [target, `-c.appId=${appId}`] : [target];
const result = spawnSync(executable, args, { stdio: "inherit", shell: false, env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
