import { spawnSync } from "node:child_process";

const target =
  process.platform === "darwin" ? "--mac" : process.platform === "linux" ? "--linux" : undefined;
if (!target) {
  process.stderr.write("OpenBot desktop packaging supports macOS and Linux only.\n");
  process.exit(1);
}

const executable = process.platform === "win32" ? "electron-builder.cmd" : "electron-builder";
const result = spawnSync(executable, [target], { stdio: "inherit", shell: false });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
