import { describe, expect, it } from "vite-plus/test";
import { parseTildeArgs, tildeHelpText } from "./tilde.js";

describe("Tilde commands", () => {
  it("parses authentication and state migration commands", () => {
    expect(parseTildeArgs(["auth", "whoami", "--base-url", "https://api.test"])).toMatchObject({
      authAction: "whoami",
      baseUrl: "https://api.test",
      commandName: "auth",
    });
    expect(
      parseTildeArgs(["state", "import", "state.yaml", "output.json", "--auto-apply"]),
    ).toMatchObject({
      autoApply: true,
      commandName: "state",
      filePath: "state.yaml",
      outputFilePath: "output.json",
      stateAction: "import",
    });
  });

  it("uses the Tilde command surface", () => {
    expect(tildeHelpText()).toContain("Usage: tilde");
  });
});
