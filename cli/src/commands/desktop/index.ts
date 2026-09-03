import { runDesktopDev } from "./dev.js";
import { runDesktopPackage } from "./package.js";
import { runRelease } from "./release.js";

export const desktopSubcommands: readonly (readonly [string, string])[] = [
  ["dev", "Build and launch the Electron shell on this machine"],
  ["package", "Package the Electron app for this platform"],
  ["release <subcommand>", "Publish signed builds to the updates bucket (upstream only)"],
];

export async function runDesktop(rest: readonly string[]): Promise<number> {
  const [subcommand, ...args] = rest;
  switch (subcommand) {
    case "dev":
      return runDesktopDev(args);
    case "package":
      return runDesktopPackage(args);
    case "release":
      return runRelease(args);
    default:
      console.error(
        `Usage: tilde desktop <${desktopSubcommands.map(([name]) => name.split(" ")[0]).join("|")}>`,
      );
      return 1;
  }
}
