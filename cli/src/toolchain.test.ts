import { describe, expect, it } from "vite-plus/test";
import { inheritedCompilerFlagNames, toolchainEnvironment } from "./toolchain.js";

const polluted = {
  PATH: "/usr/bin",
  CPPFLAGS: "-I/opt/homebrew/opt/llvm/include",
  LDFLAGS: "-L/opt/homebrew/opt/llvm/lib",
  C_INCLUDE_PATH: "/somewhere/include",
} satisfies NodeJS.ProcessEnv;

describe("toolchainEnvironment", () => {
  it("resolves the Android toolchain", () => {
    const environment = toolchainEnvironment({}, polluted);
    expect(environment.ANDROID_HOME).toBeDefined();
    expect(environment.PATH).toContain("platform-tools");
  });

  // The developer owns their environment. Reporting a hostile variable is the CLI's job;
  // deleting it behind their back is not, and would hide the cause rather than fix it.
  it("leaves the developer's compiler variables alone", () => {
    const environment = toolchainEnvironment({}, polluted);
    expect(environment.CPPFLAGS).toBe("-I/opt/homebrew/opt/llvm/include");
    expect(environment.C_INCLUDE_PATH).toBe("/somewhere/include");
  });
});

describe("inheritedCompilerFlagNames", () => {
  it("names only the variables actually present", () => {
    expect(inheritedCompilerFlagNames(polluted).sort()).toEqual(
      ["CPPFLAGS", "C_INCLUDE_PATH", "LDFLAGS"].sort(),
    );
    expect(inheritedCompilerFlagNames({ PATH: "/usr/bin" })).toEqual([]);
  });
});
