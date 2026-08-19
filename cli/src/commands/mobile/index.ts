import { runAvd } from "./avd.js";
import { runDoctor } from "./doctor.js";
import { runEmulator } from "./emulator.js";
import { runExpo } from "./expo.js";
import { runLogs } from "./logs.js";
import { runRelease } from "./release.js";
import { runScreenshot } from "./screenshot.js";
import { runSetup } from "./setup.js";

export const mobileSubcommands: readonly (readonly [string, string])[] = [
  ["expo <args...>", "Run the Expo CLI against the mobile app with the toolchain resolved"],
  ["emulator", "Boot the Android emulator (headless with VNC on a display-less host)"],
  ["avd", "Create the Android virtual device the emulator boots"],
  ["setup", "Provision the Android SDK, licenses, and required packages"],
  ["screenshot [--out FILE]", "Capture the device screen to a PNG and print its path"],
  ["logs [logcat args]", "Stream the React Native application log"],
  ["release <subcommand>", "Store publication through EAS (upstream only)"],
  ["doctor", "Check the mobile development toolchain on this machine"],
];

export async function runMobile(rest: readonly string[]): Promise<number> {
  const [subcommand, ...args] = rest;
  switch (subcommand) {
    case "expo":
      return runExpo(args);
    case "emulator":
      return runEmulator(args);
    case "avd":
      return runAvd(args);
    case "setup":
      return runSetup();
    case "screenshot":
      return runScreenshot(args);
    case "logs":
      return runLogs(args);
    case "release":
      return runRelease(args);
    case "doctor":
      return runDoctor();
    default: {
      console.error(
        `Usage: openbot mobile <${mobileSubcommands.map(([name]) => name.split(" ")[0]).join("|")}>`,
      );
      return 1;
    }
  }
}
