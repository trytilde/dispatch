import { describe, expect, it, vi } from "vitest";
import { deployProviders, DeploymentOutputs } from "./index.js";

describe("provider deployment", () => {
  it("runs one participant once per phase and shares outputs", async () => {
    const phases: string[] = [];
    const deploy = vi.fn(async (context) => {
      phases.push(context.phase);
      if (context.phase === "prepare") context.outputs.set("runtime.origin", "https://openbot.example");
      if (context.phase === "release") expect(context.outputs.require("runtime.origin")).toBe("https://openbot.example");
    });

    await deployProviders([
      { id: "runtime", provider: { deploy } },
      { id: "runtime", provider: { deploy } },
    ], { target: "production", dryRun: true, repositoryRoot: "/repo" });

    expect(phases).toEqual(["prepare", "configure", "release"]);
    expect(deploy).toHaveBeenCalledTimes(3);
  });

  it("requires populated outputs", () => {
    const outputs = new DeploymentOutputs();
    expect(() => outputs.require("missing")).toThrow("Required deployment output is unavailable: missing");
  });

  it("keeps runtime environment values private from deployment events", async () => {
    const events: unknown[] = [];
    const outputs = await deployProviders([{ id: "tilde", provider: {
      deploy: async ({ phase, outputs: state }) => {
        if (phase === "configure") state.setRuntimeEnvironment("TILDE_PRIVATE_KEY", "private-value");
      },
    } }], {
      target: "production",
      dryRun: false,
      repositoryRoot: "/repo",
      report: (event) => events.push(event),
    });
    expect(outputs.runtimeEnvironment()).toEqual([{ name: "TILDE_PRIVATE_KEY", value: "private-value", sensitive: true }]);
    expect(JSON.stringify(events)).not.toContain("private-value");
  });
});
