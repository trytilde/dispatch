// Resolves the Android and Node toolchain so no command needs a PATH prefix.
//
// Two failures this prevents:
// - Gradle spawns `node` while evaluating settings; a version-manager shim or an
//   expired multishell path fails there. `process.execPath` is the real binary
//   running this process, so its directory always works.
// - `adb`, `emulator`, and `avdmanager` are not on a login PATH on a build host.
import { existsSync } from "node:fs";
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
