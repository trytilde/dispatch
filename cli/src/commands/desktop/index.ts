import { runDesktopDev } from "./dev.js";
import { runDesktopPackage } from "./package.js";

export const desktopSubcommands: readonly (readonly [string, string])[] = [
  ["dev", "Build and launch the Electron shell on this machine"],
  ["package", "Package the Electron app for this platform"],
];

export async function runDesktop(rest: readonly string[]): Promise<number> {
  const [subcommand, ...args] = rest;
  switch (subcommand) {
    case "dev":
      return runDesktopDev(args);
    case "package":
      return runDesktopPackage(args);
    default:
      console.error(
        `Usage: openbot desktop <${desktopSubcommands.map(([name]) => name).join("|")}>`,
      );
      return 1;
  }
}
