// Captures the connected device or emulator screen to a PNG — the evidence
// primitive for mobile changes. Prints the absolute output path on success.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import arg from "arg";
import { requireAndroidTool, toolchainEnvironment } from "../../toolchain.js";

export async function runScreenshot(argv: readonly string[]): Promise<number> {
  const options = arg({ "--out": String }, { argv: [...argv] });
  const out = options["--out"]
    ? isAbsolute(options["--out"])
      ? options["--out"]
      : resolve(options["--out"])
    : join(tmpdir(), `openbot-mobile-${Date.now()}.png`);
  mkdirSync(dirname(out), { recursive: true });

  const adb = requireAndroidTool("adb");
  const capture = spawnSync("bash", ["-c", `"${adb}" exec-out screencap -p > "${out}"`], {
    env: toolchainEnvironment(),
  });
  if (capture.status !== 0) {
    console.error("screencap failed; is a device connected? Run: openbot mobile emulator");
    return capture.status ?? 1;
  }
  console.log(out);
  return 0;
}
