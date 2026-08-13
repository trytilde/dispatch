import { describe, expect, it } from "vite-plus/test";
import { developmentServerCommand, developmentServerEnvironment } from "./dev.js";

describe("development server command", () => {
  it("keeps the watched CLI process at the repository root", () => {
    expect(developmentServerCommand()).toEqual([
      "pnpm",
      ["exec", "tsx", "watch", "cli/src/index.tsx", "_serve"],
    ]);
  });
});

describe("development server environment", () => {
  it("resolves workspace packages through their source exports", () => {
    expect(developmentServerEnvironment({ PORT: "4100" })).toEqual({
      PORT: "4100",
      NODE_OPTIONS: "--conditions=development",
    });
  });

  it("preserves existing Node options", () => {
    expect(developmentServerEnvironment({ NODE_OPTIONS: "--trace-warnings" }).NODE_OPTIONS).toBe(
      "--trace-warnings --conditions=development",
    );
  });
});
