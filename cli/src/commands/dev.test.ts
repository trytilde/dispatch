import { describe, expect, it } from "vite-plus/test";
import { developmentServerEnvironment } from "./dev.js";

describe("development server environment", () => {
  it("resolves workspace packages through their source exports", () => {
    expect(developmentServerEnvironment({ OPENBOT_PORT: "4100" })).toEqual({
      OPENBOT_PORT: "4100",
      NODE_OPTIONS: "--conditions=development",
    });
  });

  it("preserves existing Node options", () => {
    expect(developmentServerEnvironment({ NODE_OPTIONS: "--trace-warnings" }).NODE_OPTIONS).toBe(
      "--trace-warnings --conditions=development",
    );
  });
});
