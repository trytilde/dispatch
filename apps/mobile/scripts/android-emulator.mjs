#!/usr/bin/env node
// Boots a headless Android emulator for the Expo client on a machine with no display.
//
// Xvfb owns a virtual screen, the emulator renders into it with software GL, and x11vnc
// exposes that screen on loopback only. A remote developer reaches it through an SSH
// tunnel; the VNC port is never bound to a public interface.

import { spawn, spawnSync } from "node:child_process";
import { requireAndroidTool, toolchainEnv } from "./toolchain.mjs";

const avd = process.env.AVD_NAME ?? "openbot";
const displayNumber = process.env.EMULATOR_DISPLAY ?? "1";
const vncPort = process.env.VNC_PORT ?? "5900";
const bootTimeoutMs = Number(process.env.EMULATOR_BOOT_TIMEOUT_MS ?? 300_000);

const adb = requireAndroidTool("adb");
const emulator = requireAndroidTool("emulator");

const isRunning = (pattern) =>
  spawnSync("pgrep", ["-f", pattern], { stdio: "ignore" }).status === 0;

const detach = (command, args, overrides) => {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    env: toolchainEnv(overrides),
  });
  child.unref();
};

const display = `:${displayNumber}`;

if (!isRunning(`Xvfb ${display}`)) {
  console.log(`starting Xvfb ${display}`);
  detach("Xvfb", [display, "-screen", "0", "1200x2200x24", "-nolisten", "tcp"]);
  spawnSync("sleep", ["2"]);
}

if (!isRunning(`emulator -avd ${avd}`)) {
  console.log(`starting emulator ${avd}`);
  detach(
    emulator,
    [
      "-avd",
      avd,
      // Software rasterizer: the host has no GPU and no real display.
      "-gpu",
      "swiftshader_indirect",
      "-no-snapshot-save",
      "-no-boot-anim",
      "-memory",
      "4096",
      "-cores",
      "4",
      "-accel",
      "on",
    ],
    { DISPLAY: display },
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
  spawnSync("sleep", ["3"]);
}

if (!booted) {
  console.error(`Emulator ${avd} did not report sys.boot_completed in time.`);
  process.exit(1);
}
console.log("boot completed");

if (!isRunning(`x11vnc .*-rfbport ${vncPort}`)) {
  console.log(`starting x11vnc on 127.0.0.1:${vncPort}`);
  detach("x11vnc", [
    "-display",
    display,
    // Loopback only. Reach it over an SSH tunnel, never a public bind.
    "-localhost",
    "-rfbport",
    vncPort,
    "-shared",
    "-forever",
    "-nopw",
    "-quiet",
  ]);
  spawnSync("sleep", ["2"]);
}

spawnSync(adb, ["devices"], { stdio: "inherit" });
console.log(
  `ready. Tunnel from the workstation: ssh -N -L ${vncPort}:127.0.0.1:${vncPort} -L 8081:127.0.0.1:8081 <host>`,
);
