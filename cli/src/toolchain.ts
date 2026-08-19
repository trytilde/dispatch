// Resolves the Android and Node toolchain so no command needs a PATH prefix.
//
// Two failures this prevents:
// - Gradle spawns `node` while evaluating settings; a version-manager shim or an
//   expired multishell path fails there. `process.execPath` is the real binary
//   running this process, so its directory always works.
// - `adb`, `emulator`, and `avdmanager` are not on a login PATH on a build host.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export function androidSdkRoot(): string {
  const configured = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME;
  if (configured) return configured;
  // Conventional locations per platform; the Linux one matches this repository's
  // provisioned build hosts.
  const candidates =
    process.platform === "darwin"
      ? [join(homedir(), "Library", "Android", "sdk")]
      : [join(homedir(), "Android", "sdk"), "/root/Android/sdk"];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  return candidates[0] ?? join(homedir(), "Android", "sdk");
}

export const androidApiLevel = 36;

/**
 * Emulator system images must match the host CPU: an x86_64 image on Apple
 * Silicon has no hardware acceleration path and is unusable, and an arm64 image
 * is wrong on an Intel or AMD host.
 */
export function androidSystemImage(): string {
  const abi = process.arch === "arm64" ? "arm64-v8a" : "x86_64";
  return `system-images;android-${androidApiLevel};google_apis;${abi}`;
}

/**
 * React Native pins the NDK its native modules build against, and a mismatch fails
 * a CMake configure task deep in a Gradle run. Read that pin from the installed
 * copy so an upgrade cannot leave this behind.
 */
export function reactNativeNdkVersion(appDirectory: string): string {
  const fallback = "27.1.12297006";
  try {
    const appRequire = createRequire(join(appDirectory, "package.json"));
    const versions = join(
      dirname(appRequire.resolve("react-native/package.json")),
      "gradle",
      "libs.versions.toml",
    );
    return /ndkVersion\s*=\s*"([\d.]+)"/.exec(readFileSync(versions, "utf8"))?.[1] ?? fallback;
  } catch {
    return fallback;
  }
}

export type AndroidTool = "adb" | "emulator" | "avdmanager" | "sdkmanager";

export function androidTool(name: AndroidTool): string {
  const sdk = androidSdkRoot();
  const paths: Record<AndroidTool, string> = {
    adb: join(sdk, "platform-tools", "adb"),
    emulator: join(sdk, "emulator", "emulator"),
    avdmanager: join(sdk, "cmdline-tools", "latest", "bin", "avdmanager"),
    sdkmanager: join(sdk, "cmdline-tools", "latest", "bin", "sdkmanager"),
  };
  return paths[name];
}

export function requireAndroidTool(name: AndroidTool): string {
  const binary = androidTool(name);
  if (!existsSync(binary))
    throw new Error(
      `Missing ${name} at ${binary}. Install the Android command line tools, platform-tools, ` +
        `emulator, and a system image, then set ANDROID_SDK_ROOT. Run \`openbot mobile doctor\`.`,
    );
  return binary;
}

/**
 * Compiler search paths a shell can export that break an Xcode module build.
 *
 * Homebrew suggests these when compiling C projects against its own libraries. Homebrew
 * LLVM's include directory carries its own C standard library, so clang finds an
 * incompatible `float.h`, `_Builtin_float` fails to build, and every framework including
 * it cascades. Apple's diagnostic is a modulemap requiring
 * `found_incompatible_headers__check_search_paths` and names neither the variable nor the
 * shell that set it.
 *
 * These belong to the developer's environment, so the CLI reports them rather than
 * changing them. `mobile doctor` is where that report lives.
 */
const inheritedCompilerFlags = [
  "CPPFLAGS",
  "CFLAGS",
  "CXXFLAGS",
  "LDFLAGS",
  "CPATH",
  "C_INCLUDE_PATH",
  "CPLUS_INCLUDE_PATH",
  "OBJC_INCLUDE_PATH",
  "OBJCPLUS_INCLUDE_PATH",
];

/** The compiler-flag variables present in an environment, for reporting. */
export function inheritedCompilerFlagNames(base: NodeJS.ProcessEnv = process.env): string[] {
  return inheritedCompilerFlags.filter((name) => (base[name] ?? "").trim().length > 0);
}

export function toolchainEnvironment(
  overrides: Record<string, string> = {},
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const sdk = androidSdkRoot();
  const path = [
    dirname(process.execPath),
    join(sdk, "platform-tools"),
    join(sdk, "emulator"),
    join(sdk, "cmdline-tools", "latest", "bin"),
    base.PATH,
  ]
    .filter(Boolean)
    .join(":");
  return { ...base, ANDROID_SDK_ROOT: sdk, ANDROID_HOME: sdk, PATH: path, ...overrides };
}
