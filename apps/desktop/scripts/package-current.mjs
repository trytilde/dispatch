import { spawnSync } from "node:child_process";

const target =
  process.platform === "darwin" ? "--mac" : process.platform === "linux" ? "--linux" : undefined;
if (!target) {
  process.stderr.write("OpenBot desktop packaging supports macOS and Linux only.\n");
  process.exit(1);
}

const executable = process.platform === "win32" ? "electron-builder.cmd" : "electron-builder";
// The generic publish provider interpolates this into latest-*.yml. Local packaging has
// no bucket, so point it somewhere obviously local rather than leaving it empty.
const env = {
  ...process.env,
  OPENBOT_DESKTOP_UPDATES_URL:
    process.env.OPENBOT_DESKTOP_UPDATES_URL ?? "http://127.0.0.1/desktop",
};
const result = spawnSync(executable, [target], { stdio: "inherit", shell: false, env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
