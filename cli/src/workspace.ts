// Locates the repository and the Expo app from any working directory, so every
// command works the same from the repository root, a package directory, or a
// published install running inside a fork.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function repositoryRoot(start: string = process.cwd()): string {
  let current = start;
  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml")) || existsSync(join(current, ".git")))
      return current;
    const parent = dirname(current);
    if (parent === current)
      throw new Error(
        "Not inside an OpenBot repository: no pnpm-workspace.yaml or .git found upward",
      );
    current = parent;
  }
}

// The Expo app is the workspace package that depends on `expo`. Overridable so
// a fork with a relocated app keeps working without a code change.
export function mobileAppDirectory(root: string): string {
  const override = process.env.OPENBOT_MOBILE_DIR;
  if (override) {
    const directory = join(root, override);
    if (!existsSync(join(directory, "package.json")))
      throw new Error(`OPENBOT_MOBILE_DIR=${override} has no package.json under ${root}`);
    return directory;
  }
  const conventional = join(root, "apps", "mobile");
  if (dependsOnExpo(conventional)) return conventional;
  const appsRoot = join(root, "apps");
  if (existsSync(appsRoot))
    for (const entry of readdirSync(appsRoot, { withFileTypes: true }))
      if (entry.isDirectory() && dependsOnExpo(join(appsRoot, entry.name)))
        return join(appsRoot, entry.name);
  throw new Error("No workspace app depends on expo; set OPENBOT_MOBILE_DIR");
}

function dependsOnExpo(directory: string): boolean {
  const manifestPath = join(directory, "package.json");
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(manifest.dependencies?.expo ?? manifest.devDependencies?.expo);
  } catch {
    return false;
  }
}
