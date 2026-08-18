// Provisions the Android SDK this repository's mobile builds expect. Idempotent:
// every present piece is skipped. System packages need root and a distribution
// package manager, so they are reported rather than installed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  androidApiLevel,
  androidSdkRoot,
  androidSystemImage,
  androidTool,
  toolchainEnvironment,
} from "../../toolchain.js";

const commandLineToolsVersion = "11076708";
const packages = [
  "platform-tools",
  "emulator",
  `platforms;android-${androidApiLevel}`,
  `build-tools;${androidApiLevel}.0.0`,
  androidSystemImage(),
];

export async function runSetup(): Promise<number> {
  const sdk = androidSdkRoot();
  console.log(`sdk root: ${sdk}`);

  if (!existsSync(androidTool("sdkmanager"))) {
    const platform = process.platform === "darwin" ? "mac" : "linux";
    const url = `https://dl.google.com/android/repository/commandlinetools-${platform}-${commandLineToolsVersion}_latest.zip`;
    const zip = join(tmpdir(), `openbot-cmdline-tools.zip`);
    console.log(`downloading command line tools`);
    if (run("curl", ["-fsSL", "-o", zip, url]) !== 0) return fail("download failed");
    const staging = join(sdk, "cmdline-tools", "staging");
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    if (run("unzip", ["-q", zip, "-d", staging]) !== 0)
      return fail("unzip failed; install unzip and rerun");
    rmSync(join(sdk, "cmdline-tools", "latest"), { recursive: true, force: true });
    renameSync(join(staging, "cmdline-tools"), join(sdk, "cmdline-tools", "latest"));
    rmSync(staging, { recursive: true, force: true });
    rmSync(zip, { force: true });
  }

  const sdkmanager = androidTool("sdkmanager");
  console.log("accepting licenses");
  spawnSync("bash", ["-c", `yes | "${sdkmanager}" --licenses > /dev/null 2>&1 || true`], {
    env: toolchainEnvironment(),
  });
  console.log(`installing: ${packages.join(", ")}`);
  if (run(sdkmanager, ["--install", ...packages]) !== 0) return fail("sdkmanager install failed");

  if (process.platform === "linux") {
    const missing = ["Xvfb", "x11vnc"].filter(
      (binary) => spawnSync("which", [binary], { stdio: "ignore" }).status !== 0,
    );
    if (missing.length > 0)
      console.log(
        `system packages still needed (require root): apt-get install -y ${missing
          .map((binary) => (binary.toLowerCase() === "xvfb" ? "xvfb" : binary.toLowerCase()))
          .join(" ")} libpulse0`,
      );
  }
  console.log("setup complete; next: openbot mobile avd, then openbot mobile doctor");
  return 0;
}

function run(command: string, args: string[]): number {
  return spawnSync(command, args, { stdio: "inherit", env: toolchainEnvironment() }).status ?? 1;
}

function fail(message: string): number {
  console.error(message);
  return 1;
}
