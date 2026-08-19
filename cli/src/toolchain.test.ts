import { describe, expect, it } from "vite-plus/test";
import { inheritedCompilerFlagNames, toolchainEnvironment } from "./toolchain.js";

const polluted = {
  PATH: "/usr/bin",
  CPPFLAGS: "-I/opt/homebrew/opt/llvm/include",
  LDFLAGS: "-L/opt/homebrew/opt/llvm/lib",
  C_INCLUDE_PATH: "/somewhere/include",
} satisfies NodeJS.ProcessEnv;

describe("toolchainEnvironment", () => {
  // Homebrew LLVM's include directory carries its own C standard library, so leaving these
  // in place makes clang build an incompatible `float.h` and every framework that includes
  // it fails inside the SDK's modulemap.
  it("drops inherited compiler search paths", () => {
    const environment = toolchainEnvironment({}, polluted);
    expect(environment.CPPFLAGS).toBeUndefined();
    expect(environment.LDFLAGS).toBeUndefined();
    expect(environment.C_INCLUDE_PATH).toBeUndefined();
  });

  it("keeps them when explicitly asked", () => {
    const environment = toolchainEnvironment({}, { ...polluted, OPENBOT_KEEP_COMPILER_FLAGS: "1" });
    expect(environment.CPPFLAGS).toBe("-I/opt/homebrew/opt/llvm/include");
  });

  it("still resolves the Android toolchain", () => {
    const environment = toolchainEnvironment({}, polluted);
    expect(environment.ANDROID_HOME).toBeDefined();
    expect(environment.PATH).toContain("platform-tools");
  });

  it("names only the variables actually present", () => {
    expect(inheritedCompilerFlagNames(polluted).sort()).toEqual(
      ["CPPFLAGS", "C_INCLUDE_PATH", "LDFLAGS"].sort(),
    );
    expect(inheritedCompilerFlagNames({ PATH: "/usr/bin" })).toEqual([]);
  });
});
