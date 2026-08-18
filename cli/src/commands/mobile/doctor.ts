// Verifies the mobile development toolchain and reports one line per check.
// Plain output on purpose: agents parse it as easily as humans read it.
//
// A failing check is an answer, not a crash, so this marks its non-zero exit as
// diagnostic and the CLI skips the run-log crash notice.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { markDiagnosticExit } from "../../diagnostics.js";
import { androidSdkRoot, androidTool } from "../../toolchain.js";

interface Check {
  name: string;
  passed: boolean;
  detail: string;
  warning?: boolean;
}

// The Android Gradle Plugin this repository builds with supports Java 17 and 21.
// A newer JDK is what most Homebrew installs give you, and it fails deep inside a
// Gradle run rather than here, so say so up front.
const supportedJdkMajors = [17, 21];

export async function runDoctor(): Promise<number> {
  const checks: Check[] = [];
  const platform = process.platform;

  checks.push({ name: "node", passed: existsSync(process.execPath), detail: process.execPath });
  checks.push(javaCheck());

  const sdk = androidSdkRoot();
  checks.push({
    name: "android-sdk",
    passed: existsSync(sdk),
    detail: existsSync(sdk) ? sdk : `${sdk} — run: openbot mobile setup`,
  });
  for (const tool of ["adb", "emulator", "avdmanager"] as const) {
    const path = androidTool(tool);
    checks.push({
      name: tool,
      passed: existsSync(path),
      detail: existsSync(path) ? path : `${path} — run: openbot mobile setup`,
    });
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
        detail: found ? binary : `${binary} not installed — needed for a headless emulator`,
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
    const pods = spawnSync("which", ["pod"], { stdio: "ignore" }).status === 0;
    checks.push({
      name: "cocoapods",
      passed: pods,
      detail: pods ? "pod available" : "CocoaPods missing — needed by expo run:ios",
    });
  }

  let failures = 0;
  let warnings = 0;
  for (const check of checks) {
    if (check.passed) {
      console.log(`ok   ${check.name.padEnd(14)} ${check.detail}`);
      continue;
    }
    if (check.warning) {
      warnings += 1;
      console.log(`warn ${check.name.padEnd(14)} ${check.detail}`);
      continue;
    }
    failures += 1;
    console.log(`FAIL ${check.name.padEnd(14)} ${check.detail}`);
  }

  if (failures === 0 && warnings === 0) {
    console.log("all checks passed");
    return 0;
  }
  if (failures === 0) {
    console.log(`${warnings} warning(s); nothing blocking`);
    return 0;
  }
  console.log(`${failures} check(s) failed${warnings > 0 ? `, ${warnings} warning(s)` : ""}`);
  markDiagnosticExit();
  return 1;
}

function javaCheck(): Check {
  // javac, not java: a JRE-only install passes `java -version` and then fails a
  // Gradle run with "does not provide the required capabilities: [JAVA_COMPILER]".
  const javac = spawnSync("javac", ["-version"], { encoding: "utf8" });
  if (javac.status !== 0)
    return { name: "jdk", passed: false, detail: "javac not found; install a full JDK" };
  const version = (javac.stdout.trim() || javac.stderr.trim()).replace(/^javac\s+/, "");
  const major = Number(version.split(".")[0]);
  if (Number.isFinite(major) && !supportedJdkMajors.includes(major))
    return {
      name: "jdk",
      passed: false,
      warning: true,
      detail: `javac ${version} — the Android Gradle Plugin supports ${supportedJdkMajors.join(" and ")}; Android builds may fail`,
    };
  return { name: "jdk", passed: true, detail: `javac ${version}` };
}
