// Verifies the mobile development toolchain and reports one line per check.
// Plain output on purpose: agents parse it as easily as humans read it.
//
// A failing check is an answer, not a crash, so this marks its non-zero exit as
// diagnostic and the CLI skips the run-log crash notice.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { markDiagnosticExit } from "../../diagnostics.js";
import { androidSdkRoot, androidTool, reactNativeNdkVersion } from "../../toolchain.js";
import { mobileAppDirectory, repositoryRoot } from "../../workspace.js";

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
  checks.push(nativeBuildCheck(sdk));
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
    checks.push(xcodeCheck());
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
  // Gradle resolves its JDK from JAVA_HOME, so check the same one Gradle will use.
  // A machine with several JDKs installed — a linked Homebrew `openjdk` shadowing a
  // keg-only `openjdk@21`, say — otherwise reports a compiler the build never runs.
  const home = process.env.JAVA_HOME?.trim();
  const candidate = home ? join(home, "bin", "javac") : "javac";
  const source = home ? "JAVA_HOME" : "PATH";

  const javac = spawnSync(candidate, ["-version"], { encoding: "utf8" });
  if (javac.status !== 0)
    return {
      name: "jdk",
      passed: false,
      detail: home
        ? `no javac at ${candidate} (JAVA_HOME); install a full JDK or correct JAVA_HOME`
        : "javac not found on PATH; install a full JDK",
    };

  const version = readJavacVersion(javac);
  const major = Number(version.split(".")[0]);
  const shadowed = shadowingNote(home, version);

  if (Number.isFinite(major) && !supportedJdkMajors.includes(major))
    return {
      name: "jdk",
      passed: false,
      warning: true,
      detail: `javac ${version} from ${source} — the Android Gradle Plugin supports ${supportedJdkMajors.join(" and ")}; Android builds may fail${shadowed}`,
    };
  return { name: "jdk", passed: true, detail: `javac ${version} from ${source}${shadowed}` };
}

function readJavacVersion(result: { stdout?: string; stderr?: string }): string {
  return (result.stdout?.trim() || result.stderr?.trim() || "").replace(/^javac\s+/, "");
}

// When JAVA_HOME and PATH disagree, say so: Gradle follows the first and a developer
// checking `javac -version` by hand sees the second.
function shadowingNote(home: string | undefined, effective: string): string {
  if (!home) return "";
  const onPath = spawnSync("javac", ["-version"], { encoding: "utf8" });
  if (onPath.status !== 0) return "";
  const pathVersion = readJavacVersion(onPath);
  if (!pathVersion || pathVersion === effective) return "";
  return ` (PATH javac is ${pathVersion}; Gradle follows JAVA_HOME)`;
}

// React Native's CocoaPods helpers own the real minimum, and `pod install` raises
// "Please upgrade XCode" from it. Read the constant from the installed copy rather
// than restating a number here, so a React Native upgrade cannot leave this stale.
function reactNativeMinimumXcode(): { version: string; sourced: boolean } {
  const fallback = { version: "16.1", sourced: false };
  try {
    const appRequire = createRequire(join(mobileAppDirectory(repositoryRoot()), "package.json"));
    const helpers = join(
      dirname(appRequire.resolve("react-native/package.json")),
      "scripts",
      "cocoapods",
      "helpers.rb",
    );
    const matched = /min_xcode_version_supported[\s\S]{0,80}?return\s+'([\d.]+)'/.exec(
      readFileSync(helpers, "utf8"),
    );
    return matched?.[1] ? { version: matched[1], sourced: true } : fallback;
  } catch {
    return fallback;
  }
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function xcodeCheck(): Check {
  const installed = spawnSync("xcodebuild", ["-version"], { encoding: "utf8" });
  if (installed.status !== 0)
    return { name: "xcode", passed: false, detail: "xcodebuild not found; install Xcode" };
  const version = /Xcode\s+([\d.]+)/.exec(installed.stdout ?? "")?.[1];
  const minimum = reactNativeMinimumXcode();
  const source = minimum.sourced ? "React Native requires" : "React Native is assumed to require";
  if (!version)
    return {
      name: "xcode",
      passed: false,
      warning: true,
      detail: `could not parse xcodebuild output; ${source} >= ${minimum.version}`,
    };
  if (compareVersions(version, minimum.version) < 0)
    return {
      name: "xcode",
      passed: false,
      detail: `Xcode ${version} — ${source} >= ${minimum.version}; pod install fails with "Please upgrade XCode"`,
    };
  return { name: "xcode", passed: true, detail: `Xcode ${version} (minimum ${minimum.version})` };
}

// React Native's native modules build through CMake against a pinned NDK. The
// Android Gradle Plugin will download both mid-build, but a mismatch surfaces as a
// failed `configureCMakeDebug` task rather than anything naming the NDK, so check
// it here where the answer is legible.
function nativeBuildCheck(sdk: string): Check {
  let expected = "";
  try {
    expected = reactNativeNdkVersion(mobileAppDirectory(repositoryRoot()));
  } catch {
    return {
      name: "ndk",
      passed: true,
      detail: "skipped: no workspace mobile app resolved from here",
    };
  }
  const installed = join(sdk, "ndk", expected);
  if (existsSync(installed)) return { name: "ndk", passed: true, detail: installed };
  return {
    name: "ndk",
    passed: false,
    warning: true,
    detail: `ndk;${expected} missing — Gradle will download it mid-build, or run: openbot mobile setup`,
  };
}
