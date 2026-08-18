import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { mobileAppDirectory, repositoryRoot } from "./workspace.js";

function scaffoldRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "devcli-"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  return root;
}

describe("repositoryRoot", () => {
  it("walks up to the workspace file", () => {
    const root = scaffoldRepository();
    const nested = join(root, "apps", "mobile", "src");
    mkdirSync(nested, { recursive: true });
    expect(repositoryRoot(nested)).toBe(root);
  });
});

describe("mobileAppDirectory", () => {
  it("finds the app that depends on expo", () => {
    const root = scaffoldRepository();
    const app = join(root, "apps", "handset");
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, "package.json"), JSON.stringify({ dependencies: { expo: "1" } }));
    expect(mobileAppDirectory(root)).toBe(app);
  });

  it("fails clearly when no expo app exists", () => {
    expect(() => mobileAppDirectory(scaffoldRepository())).toThrow(/OPENBOT_MOBILE_DIR/);
  });
});
