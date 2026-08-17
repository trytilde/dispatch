// Resolves the Android and Node toolchain the Expo commands need, so no caller has to
// export PATH by hand.
//
// Two failures this exists to prevent:
//   - Gradle spawns `node` while evaluating settings. A version-manager shim or an
//     expired fnm multishell directory fails there with "A problem occurred starting
//     process 'command 'node''". `process.execPath` is the real binary running this
//     script, so its directory always works.
//   - `adb`, `emulator`, and `avdmanager` are not on a login PATH on a build host.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULT_SDK_ROOT = "/root/Android/sdk";

export function androidSdkRoot() {
  return process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME ?? DEFAULT_SDK_ROOT;
}

export function androidTool(name) {
  const sdkRoot = androidSdkRoot();
  const candidates = {
    adb: join(sdkRoot, "platform-tools", "adb"),
    emulator: join(sdkRoot, "emulator", "emulator"),
    avdmanager: join(sdkRoot, "cmdline-tools", "latest", "bin", "avdmanager"),
    sdkmanager: join(sdkRoot, "cmdline-tools", "latest", "bin", "sdkmanager"),
  };
  return candidates[name];
}

export function requireAndroidTool(name) {
  const binary = androidTool(name);
  if (!binary || !existsSync(binary)) {
    console.error(
      `Missing ${name} at ${binary}.\n` +
        `Install the Android command line tools, platform-tools, emulator, and an x86_64 ` +
        `system image, then set ANDROID_SDK_ROOT. See .agents/skills/run-expo/SKILL.md.`,
    );
    process.exit(1);
  }
  return binary;
}

export function toolchainEnv(overrides = {}) {
  const sdkRoot = androidSdkRoot();
  const path = [
    dirname(process.execPath),
    join(sdkRoot, "platform-tools"),
    join(sdkRoot, "emulator"),
    join(sdkRoot, "cmdline-tools", "latest", "bin"),
    process.env.PATH,
  ]
    .filter(Boolean)
    .join(":");

  return {
    ...process.env,
    ANDROID_SDK_ROOT: sdkRoot,
    ANDROID_HOME: sdkRoot,
    PATH: path,
    ...overrides,
  };
}
