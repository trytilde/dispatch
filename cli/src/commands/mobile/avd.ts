// Creates the Android virtual device the emulator command boots. Idempotent:
// an existing AVD with the same name is left untouched.
import { spawnSync } from "node:child_process";
import arg from "arg";
import { requireAndroidTool, toolchainEnvironment } from "../../toolchain.js";

export async function runAvd(argv: readonly string[]): Promise<number> {
  const options = arg(
    { "--name": String, "--image": String, "--device": String },
    { argv: [...argv] },
  );
  const name = options["--name"] ?? process.env.AVD_NAME ?? "openbot";
  const image = options["--image"] ?? "system-images;android-36;google_apis;x86_64";
  const device = options["--device"] ?? "pixel_7";

  const emulator = requireAndroidTool("emulator");
  const existing = spawnSync(emulator, ["-list-avds"], {
    encoding: "utf8",
    env: toolchainEnvironment(),
  });
  if (
    existing.stdout
      ?.split("\n")
      .map((line) => line.trim())
      .includes(name)
  ) {
    console.log(`avd ${name} already exists`);
    return 0;
  }

  const avdmanager = requireAndroidTool("avdmanager");
  console.log(`creating avd ${name} (${image}, ${device})`);
  // "no" answers the custom-hardware-profile prompt.
  const created = spawnSync(avdmanager, ["create", "avd", "-n", name, "-k", image, "-d", device], {
    input: "no\n",
    stdio: ["pipe", "inherit", "inherit"],
    env: toolchainEnvironment(),
  });
  if (created.status !== 0) {
    console.error(`avdmanager failed; is the system image installed? Try: openbot mobile setup`);
    return created.status ?? 1;
  }
  console.log(`avd ${name} created`);
  return 0;
}
