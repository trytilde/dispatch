import { describe, expect, it } from "vite-plus/test";
import { runtimeTargetForTest } from "./expo.js";

describe("runtimeTarget", () => {
  // A workspace package's exports map lists `types` and `development` first, both
  // pointing at TypeScript source that always exists. Reading either as the entry
  // reports an unbuilt package as built, and Metro then fails to resolve it.
  it("ignores types and development in favour of the runtime condition", () => {
    expect(
      runtimeTargetForTest({
        ".": {
          types: "./src/index.ts",
          development: "./src/index.ts",
          import: "./dist/index.js",
        },
      }),
    ).toBe("./dist/index.js");
  });

  it("prefers react-native over import when both are present", () => {
    expect(
      runtimeTargetForTest({
        ".": {
          types: "./src/index.ts",
          "react-native": "./dist/native.js",
          import: "./dist/index.js",
        },
      }),
    ).toBe("./dist/native.js");
  });

  it("accepts a plain string export", () => {
    expect(runtimeTargetForTest("./dist/index.js")).toBe("./dist/index.js");
  });

  it("returns undefined when no runtime condition exists", () => {
    expect(runtimeTargetForTest({ ".": { types: "./src/index.ts" } })).toBeUndefined();
    expect(runtimeTargetForTest(undefined)).toBeUndefined();
  });
});
