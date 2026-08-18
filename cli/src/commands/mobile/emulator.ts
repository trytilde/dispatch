// Boots an Android emulator for the Expo client and is safe to rerun: every
// piece that is already up is reused.
//
// On a display-less Linux host, Xvfb owns a virtual screen, the emulator
// renders into it with software GL, and x11vnc exposes that screen on loopback
// only — a remote developer reaches it through `openbot connect`. On macOS
// the emulator gets a real window and needs neither.
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import arg from "arg";
import { requireAndroidTool } from "../../toolchain.js";
import {
  detach,
  ensureVirtualScreen,
  ensureVncServer,
  processMatches,
} from "../../virtual-display.js";

export async function runEmulator(argv: readonly string[]): Promise<number> {
  const options = arg(
    {
      "--avd": String,
      "--display": String,
      "--vnc-port": String,
      "--timeout": Number,
    },
    { argv: [...argv] },
  );
  const avd = options["--avd"] ?? process.env.AVD_NAME ?? "openbot";
  const displayNumber = options["--display"] ?? process.env.EMULATOR_DISPLAY ?? "1";
  const vncPort = options["--vnc-port"] ?? process.env.VNC_PORT ?? "5900";
  const bootTimeoutMs =
    options["--timeout"] ?? Number(process.env.EMULATOR_BOOT_TIMEOUT_MS ?? 300_000);
  const headless = process.platform !== "darwin";

  const adb = requireAndroidTool("adb");
  const emulator = requireAndroidTool("emulator");
  const display = `:${displayNumber}`;

  if (headless) await ensureVirtualScreen({ displayNumber, vncPort, geometry: "1200x2200x24" });

  // Match the launcher or the qemu process it leaves behind, with a single-dash
  // `-avd` so this process's own `--avd` argument can never self-match.
  if (!processMatches(`(qemu-system[^ ]*|emulator) -avd ${avd}`)) {
    console.log(`starting emulator ${avd}`);
    detach(
      emulator,
      [
        "-avd",
        avd,
        ...(headless
          ? // Software rasterizer: the host has no GPU and no real display.
            ["-gpu", "swiftshader_indirect"]
          : []),
        "-no-snapshot-save",
        "-no-boot-anim",
        "-memory",
        "4096",
        "-cores",
        "4",
        "-accel",
        "on",
      ],
      headless ? { DISPLAY: display } : {},
    );
  }

  console.log("waiting for device");
  spawnSync(adb, ["wait-for-device"], { stdio: "inherit" });
  const deadline = Date.now() + bootTimeoutMs;
  let booted = false;
  while (Date.now() < deadline) {
    const result = spawnSync(adb, ["shell", "getprop", "sys.boot_completed"], {
      encoding: "utf8",
    });
    if (result.stdout?.trim() === "1") {
      booted = true;
      break;
    }
    await delay(3000);
  }
  if (!booted) {
    console.error(`Emulator ${avd} did not report sys.boot_completed in time.`);
    return 1;
  }
  console.log("boot completed");

  if (headless) await ensureVncServer({ displayNumber, vncPort });

  spawnSync(adb, ["devices"], { stdio: "inherit" });
  if (headless)
    console.log(
      `ready. From your workstation: openbot connect <host> (VNC ${vncPort}, Metro 8081)`,
    );
  else console.log("ready.");
  return 0;
}
