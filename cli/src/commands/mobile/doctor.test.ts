import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { runDoctor } from "./doctor.js";

async function captureDoctor(): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  const code = await runDoctor();
  log.mockRestore();
  return { code, lines };
}

describe("runDoctor", () => {
  it("prints one prefixed line per check and a matching summary", async () => {
    const { code, lines } = await captureDoctor();
    for (const line of lines.slice(0, -1)) expect(line).toMatch(/^(ok|warn|FAIL) /);
    const summary = lines.at(-1) ?? "";
    if (code === 0) expect(summary).toMatch(/all checks passed|nothing blocking/);
    else expect(summary).toMatch(/check\(s\) failed/);
  });

  it("reports the Java compiler rather than the runtime", async () => {
    const { lines } = await captureDoctor();
    const jdk = lines.find((line) => line.includes("jdk"));
    expect(jdk).toMatch(/javac|install a full JDK/);
  });

  it("names the remedy on a failing Android tool check", async () => {
    const { lines } = await captureDoctor();
    for (const line of lines.filter((entry) => entry.startsWith("FAIL")))
      if (/android-sdk|adb|emulator|avdmanager/.test(line))
        expect(line).toContain("openbot mobile setup");
  });
});

describe("reactNativeMinimumXcode", () => {
  it("reads the minimum from the installed React Native rather than restating it", async () => {
    // The constant lives in react-native/scripts/cocoapods/helpers.rb and is what
    // `pod install` enforces; a stale copy here would silently pass a broken host.
    const { readFileSync } = await import("node:fs");
    const { createRequire } = await import("node:module");
    const { dirname, join } = await import("node:path");
    const { mobileAppDirectory, repositoryRoot } = await import("../../workspace.js");
    const appRequire = createRequire(join(mobileAppDirectory(repositoryRoot()), "package.json"));
    const helpers = join(
      dirname(appRequire.resolve("react-native/package.json")),
      "scripts",
      "cocoapods",
      "helpers.rb",
    );
    const matched = /min_xcode_version_supported[\s\S]{0,80}?return\s+'([\d.]+)'/.exec(
      readFileSync(helpers, "utf8"),
    );
    expect(matched?.[1]).toMatch(/^\d+\.\d+/);
  });
});

describe("javaCheck resolution", () => {
  const original = process.env.JAVA_HOME;
  afterEach(() => {
    if (original === undefined) delete process.env.JAVA_HOME;
    else process.env.JAVA_HOME = original;
  });

  it("names JAVA_HOME as the source when it is set, because Gradle follows it", async () => {
    process.env.JAVA_HOME = "/nonexistent-jdk";
    const { lines } = await captureDoctor();
    const jdk = lines.find((line) => line.includes("jdk"));
    expect(jdk).toContain("/nonexistent-jdk/bin/javac");
    expect(jdk).toContain("JAVA_HOME");
    expect(jdk).toMatch(/^FAIL/);
  });

  it("falls back to PATH when JAVA_HOME is unset", async () => {
    delete process.env.JAVA_HOME;
    const { lines } = await captureDoctor();
    expect(lines.find((line) => line.includes("jdk"))).toContain("from PATH");
  });
});

describe("compiler flag reporting", () => {
  const originals = { CPPFLAGS: process.env.CPPFLAGS, C_INCLUDE_PATH: process.env.C_INCLUDE_PATH };
  afterEach(() => {
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("warns about an inherited CPPFLAGS, the cause of the SDK modulemap failure", async () => {
    process.env.CPPFLAGS = "-I/opt/homebrew/opt/llvm/include";
    const { lines } = await captureDoctor();
    const line = lines.find((entry) => entry.includes("compiler-env"));
    expect(line).toMatch(/^warn/);
    expect(line).toContain("CPPFLAGS");
  });

  it("passes when the shell carries none", async () => {
    delete process.env.CPPFLAGS;
    delete process.env.C_INCLUDE_PATH;
    const { lines } = await captureDoctor();
    expect(lines.find((entry) => entry.includes("compiler-env"))).toMatch(/^ok/);
  });
});
