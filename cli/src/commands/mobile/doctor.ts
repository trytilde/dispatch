// Verifies the mobile development toolchain and reports one line per check.
// Plain output on purpose: agents parse it as easily as humans read it.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { androidSdkRoot, androidTool } from "../../toolchain.js";

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

export async function runDoctor(): Promise<number> {
  const checks: Check[] = [];
  const platform = process.platform;

  checks.push({
    name: "node",
    passed: existsSync(process.execPath),
    detail: process.execPath,
  });

  // Gradle needs a JDK, not a JRE: java alone passes on a JRE, javac does not.
  const javac = spawnSync("javac", ["-version"], { encoding: "utf8" });
  checks.push({
    name: "jdk",
    passed: javac.status === 0,
    detail:
      javac.status === 0
        ? javac.stdout.trim() || javac.stderr.trim()
        : "javac not found; install a full JDK",
  });

  const sdk = androidSdkRoot();
  checks.push({ name: "android-sdk", passed: existsSync(sdk), detail: sdk });
  for (const tool of ["adb", "emulator", "avdmanager"] as const) {
    const path = androidTool(tool);
    checks.push({ name: tool, passed: existsSync(path), detail: path });
  }

  if (platform === "linux") {
    checks.push({
      name: "kvm",
      passed: existsSync("/dev/kvm"),
      detail: "/dev/kvm — without it the emulator is unusably slow",
    });
    for (const binary of ["Xvfb", "x11vnc"]) {
      const found = spawnSync("which", [binary], { stdio: "ignore" }).status === 0;
      checks.push({
        name: binary.toLowerCase(),
        passed: found,
        detail: found ? binary : `${binary} not installed`,
      });
    }
  }
  if (platform === "darwin") {
    const simctl = spawnSync("xcrun", ["simctl", "help"], { stdio: "ignore" });
    checks.push({
      name: "ios-simulator",
      passed: simctl.status === 0,
      detail: simctl.status === 0 ? "xcrun simctl available" : "Xcode command line tools missing",
    });
  }

  let failures = 0;
  for (const check of checks) {
    if (!check.passed) failures += 1;
    console.log(`${check.passed ? "ok  " : "FAIL"} ${check.name.padEnd(14)} ${check.detail}`);
  }
  console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}
