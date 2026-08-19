// Store publication for the official OpenBot app through EAS.
//
// Every command here spends money or touches a public listing, so each one is explicit
// about what it will do, refuses to run against the official EAS project from a fork,
// and never submits unless asked.
import { spawn } from "node:child_process";
import arg from "arg";
import { optionalEnvironment } from "../../environment-overrides.js";
import { isUpstreamRepository, remoteRepository, upstreamRepository } from "../../upstream.js";
import { mobileAppDirectory, repositoryRoot } from "../../workspace.js";

const officialEasProjectId = "ace1107b-b007-451a-8e50-2b571c40593e";

export const releaseSubcommands: readonly (readonly [string, string])[] = [
  ["build", "Build a store binary on EAS (--platform, --profile, --submit, --non-interactive)"],
  ["submit", "Submit the latest EAS build to App Store Connect or Play"],
  ["status", "List recent EAS builds and submissions"],
  ["install", "Install a finished EAS build on a local emulator or device (--platform, --id)"],
  ["credentials", "Manage the signing credentials EAS holds"],
];

export async function runRelease(argv: readonly string[]): Promise<number> {
  const [subcommand, ...rest] = argv;
  const root = repositoryRoot();

  const guard = publicationGuard(root);
  if (guard) {
    console.error(guard);
    return 1;
  }

  switch (subcommand) {
    case "build": {
      const options = arg(
        {
          "--platform": String,
          "--profile": String,
          "--submit": Boolean,
          "--yes": Boolean,
          "--non-interactive": Boolean,
        },
        { argv: [...rest], permissive: true },
      );
      const platform = options["--platform"] ?? "all";
      const profile = options["--profile"] ?? "production";
      // A production build consumes plan build minutes and, with --submit, publishes.
      console.log(
        `eas build --platform ${platform} --profile ${profile}${options["--submit"] ? " --auto-submit" : ""}`,
      );
      if (!options["--yes"]) {
        console.error(
          "This spends EAS build minutes" +
            (options["--submit"] ? " and submits to the stores" : "") +
            ". Re-run with --yes to proceed.",
        );
        return 1;
      }
      return eas(
        [
          "build",
          "--platform",
          platform,
          "--profile",
          profile,
          ...(options["--submit"] ? ["--auto-submit"] : []),
          ...nonInteractive(options["--non-interactive"]),
        ],
        root,
      );
    }
    case "submit": {
      const options = arg(
        {
          "--platform": String,
          "--profile": String,
          "--yes": Boolean,
          "--non-interactive": Boolean,
        },
        { argv: [...rest], permissive: true },
      );
      if (!options["--yes"]) {
        console.error("Submitting publishes to a public store listing. Re-run with --yes.");
        return 1;
      }
      return eas(
        [
          "submit",
          "--platform",
          options["--platform"] ?? "all",
          "--profile",
          options["--profile"] ?? "production",
          ...nonInteractive(options["--non-interactive"]),
        ],
        root,
      );
    }
    case "status":
      return eas(["build:list", "--limit", "10", ...rest], root);
    case "install": {
      // Neither spends build minutes nor touches a listing, so no --yes gate. Android needs
      // an APK, which only the internal-distribution profiles produce; a production AAB is
      // for Play, not for a device.
      const options = arg(
        { "--platform": String, "--id": String },
        { argv: [...rest], permissive: true },
      );
      return eas(
        [
          "build:run",
          "--platform",
          options["--platform"] ?? "android",
          ...(options["--id"] ? ["--id", options["--id"]] : ["--latest"]),
        ],
        root,
      );
    }
    case "credentials":
      return eas(["credentials", ...rest], root);
    default:
      console.error(
        `Usage: openbot mobile release <${releaseSubcommands.map(([name]) => name).join("|")}>`,
      );
      return 1;
  }
}

/**
 * EAS needs a terminal to set up signing credentials on a first build, so interactivity is
 * the default. Forcing `--non-interactive` turns "answer two prompts" into "Credentials are
 * not set up. Run this command again in interactive mode." Pass the flag, or run without a
 * TTY as CI does, to opt in.
 */
function nonInteractive(requested: boolean | undefined): string[] {
  return requested || !process.stdin.isTTY ? ["--non-interactive"] : [];
}

/** Returns a refusal message when this checkout must not publish, otherwise undefined. */
function publicationGuard(root: string): string | undefined {
  const projectId = optionalEnvironment("OPENBOT_EAS_PROJECT_ID") ?? officialEasProjectId;
  if (projectId !== officialEasProjectId) return undefined;
  if (isUpstreamRepository(root)) return undefined;
  const found = remoteRepository(root) ?? "an unknown remote";
  return (
    `Refusing to use the official OpenBot EAS project from ${found}.\n` +
    `Store publication belongs to ${upstreamRepository} (ADR-0027). To release a fork's own ` +
    `app, create an EAS project for it and set OPENBOT_EAS_PROJECT_ID, plus OPENBOT_APP_ID ` +
    `and OPENBOT_EXPO_OWNER, in configuration/.env.`
  );
}

function eas(args: readonly string[], root: string): Promise<number> {
  // Pinned through npx rather than a dependency: eas-cli releases far faster than this
  // repository, and a stale pinned copy fails against the current EAS API.
  const child = spawn("npx", ["eas-cli@latest", ...args], {
    cwd: mobileAppDirectory(root),
    stdio: "inherit",
    env: process.env,
  });
  return new Promise<number>((resolvePromise, rejectPromise) => {
    child.on("error", (error) =>
      rejectPromise(new Error(`Failed to start eas-cli: ${error.message}`)),
    );
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}
