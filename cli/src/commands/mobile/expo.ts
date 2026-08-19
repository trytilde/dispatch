// Runs the Expo CLI against the workspace's mobile app with the toolchain
// resolved, from any working directory. Gradle inherits a real node binary and
// the Android SDK without any caller-side PATH exports.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { inheritedCompilerFlagNames, toolchainEnvironment } from "../../toolchain.js";
import { mobileAppDirectory, repositoryRoot } from "../../workspace.js";

export async function runExpo(args: readonly string[]): Promise<number> {
  const root = repositoryRoot();
  const appDirectory = mobileAppDirectory(root);
  const unbuilt = unbuiltWorkspaceDependencies(root, appDirectory);
  if (unbuilt.length > 0) {
    // Metro resolves a workspace dependency through its `exports`, which point at
    // `dist`. Without it the bundle fails with "Unable to resolve" naming the
    // package rather than the missing build, so build them here instead.
    console.log(`building workspace dependencies: ${unbuilt.join(", ")}`);
    for (const name of unbuilt) {
      const built = spawnSync("pnpm", ["--filter", name, "build"], {
        cwd: root,
        stdio: "inherit",
      });
      if (built.status !== 0) {
        console.error(`Failed to build ${name}; run: pnpm --filter ${name} build`);
        return built.status ?? 1;
      }
    }
  }
  const require = createRequire(join(appDirectory, "package.json"));
  const expoCli = join(dirname(require.resolve("expo/package.json")), "bin", "cli");

  const dropped = inheritedCompilerFlagNames();
  if (dropped.length > 0 && process.env.OPENBOT_KEEP_COMPILER_FLAGS !== "1")
    console.log(
      `ignoring inherited ${dropped.join(", ")} for this build; ` +
        `they make clang find an incompatible C standard library. ` +
        `Set OPENBOT_KEEP_COMPILER_FLAGS=1 to keep them.`,
    );

  const child = spawn(process.execPath, [expoCli, ...args], {
    cwd: appDirectory,
    stdio: "inherit",
    env: toolchainEnvironment(),
  });
  return await new Promise<number>((resolvePromise, rejectPromise) => {
    child.on("error", (error) =>
      rejectPromise(new Error(`Failed to start the Expo CLI at ${expoCli}: ${error.message}`)),
    );
    // Re-raise signals so Ctrl-C on `expo start` still reads as an interrupt to
    // whatever invoked this.
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

/**
 * Workspace dependencies of the mobile app whose published entry point is missing.
 *
 * A source checkout has no `dist` until something builds it, and Metro honours the
 * `exports` field, so the first `expo start` after a clone fails on a package that
 * is present but unbuilt.
 */
function unbuiltWorkspaceDependencies(root: string, appDirectory: string): string[] {
  const manifest = readManifest(join(appDirectory, "package.json"));
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  const missing: string[] = [];
  for (const [name, specifier] of Object.entries(dependencies)) {
    if (!specifier.startsWith("workspace:")) continue;
    const packageDirectory = workspacePackageDirectory(root, name);
    if (!packageDirectory) continue;
    const entry = publishedEntry(packageDirectory);
    if (entry && !existsSync(entry)) missing.push(name);
  }
  return missing;
}

function readManifest(path: string): {
  name?: string;
  main?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

// The app's node_modules entry is a symlink into the workspace, so resolving the
// manifest through it lands on the real package directory.
function workspacePackageDirectory(root: string, name: string): string | undefined {
  const candidate = join(root, "packages", name.replace(/^@[^/]+\//, ""));
  if (existsSync(join(candidate, "package.json"))) return candidate;
  return undefined;
}

function publishedEntry(packageDirectory: string): string | undefined {
  const manifest = readManifest(join(packageDirectory, "package.json"));
  const target = runtimeTarget(manifest.exports) ?? manifest.main;
  return target ? resolve(packageDirectory, target) : undefined;
}

// Conditions a bundler actually loads at runtime, in preference order. `types` and
// `development` must be ignored: they point at TypeScript source that always exists, so
// treating either as the entry reports a package as built when its dist is missing —
// exactly the case Metro then fails on with "could not be resolved".
const runtimeConditions = ["react-native", "import", "require", "default", "module"];

/** Exported for tests: entry resolution decides whether a package looks built. */
export const runtimeTargetForTest = (value: unknown): string | undefined => runtimeTarget(value);

function runtimeTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value.startsWith(".") ? value : undefined;
  if (!value || typeof value !== "object") return undefined;
  const entries = value as Record<string, unknown>;
  for (const condition of runtimeConditions) {
    if (condition in entries) {
      const found = runtimeTarget(entries[condition]);
      if (found) return found;
    }
  }
  // Subpath maps such as `{".": {...}}` nest one level before reaching conditions.
  for (const [key, nested] of Object.entries(entries)) {
    if (!key.startsWith(".")) continue;
    const found = runtimeTarget(nested);
    if (found) return found;
  }
  return undefined;
}
