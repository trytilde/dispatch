import { describe, expect, it, vi } from "vite-plus/test";
import {
  buildProviders,
  collectProviderInitializations,
  deployProviders,
  DeploymentOutputs,
  initializeProviders,
  persistEnvironment,
  persistSecret,
  unsetEnvironment,
  unsetSecret,
  type DeploymentContext,
} from "./core.js";

describe("runtime provider lifecycle", () => {
  it("deduplicates shared platform initialization", () => {
    const platform = {
      id: "tilde",
      initialization: {
        id: "tilde",
        label: "Tilde",
        questions: [],
      },
    };
    expect(
      collectProviderInitializations([{ platforms: [platform] }, { platforms: [platform] }]),
    ).toEqual([platform.initialization]);
  });

  it("runs initialization provisioning once per stable provider ID", async () => {
    const initialize = vi.fn(async () => undefined);
    const provider = {
      initialization: { id: "inference", label: "Inference", questions: [] },
      initialize,
    };
    const context = {
      repositoryRoot: "/repository",
      environment: {},
      setEnvironment: vi.fn(async () => undefined),
      setSecret: vi.fn(async () => undefined),
    };
    await initializeProviders([provider, provider], context);
    expect(initialize).toHaveBeenCalledOnce();
  });

  it("retains named non-secret outputs", () => {
    const outputs = new DeploymentOutputs();
    outputs.merge({ outputs: { artifact: "/tmp/artifact" } });
    expect(outputs.require("artifact")).toBe("/tmp/artifact");
    expect(() => outputs.merge({ outputs: { artifact: "/tmp/other" } })).toThrow(
      "Conflicting deployment output: artifact",
    );
  });

  it("persists environment and secrets through the mutable context", async () => {
    const environment: NodeJS.ProcessEnv = {};
    const persistence = {
      setEnvironment: vi.fn(async () => undefined),
      setSecret: vi.fn(async () => undefined),
      unsetEnvironment: vi.fn(async () => undefined),
      unsetSecret: vi.fn(async () => undefined),
    };
    const context = {
      target: "development" as const,
      repositoryRoot: "/repository",
      environment,
      persistence,
      inputs: new DeploymentOutputs(),
      report: () => undefined,
    } satisfies DeploymentContext;
    await persistEnvironment(context, "AGENT_ID", "agent", "Agent ID");
    await persistSecret(context, "AGENT_KEY", "private", "Agent key");
    expect(environment).toEqual({ AGENT_ID: "agent", AGENT_KEY: "private" });
    await unsetEnvironment(context, "AGENT_ID");
    await unsetSecret(context, "AGENT_KEY");
    expect(environment).toEqual({});
    expect(persistence.setEnvironment).toHaveBeenCalledWith("AGENT_ID", "agent", "Agent ID");
    expect(persistence.setSecret).toHaveBeenCalledWith("AGENT_KEY", "private", "Agent key");
  });

  it("builds and deploys in lifecycle order while carrying outputs", async () => {
    const calls: string[] = [];
    const participant = {
      id: "service",
      provider: {
        buildable: {
          check: async () => {
            calls.push("check");
          },
          build: async () => {
            calls.push("build");
            return { outputs: { artifact: "/tmp/service" } };
          },
        },
        deployable: {
          plan: async () => {
            calls.push("plan");
            return { summary: "service" };
          },
          configure: async ({ inputs }: DeploymentContext) => {
            expect(inputs.require("artifact")).toBe("/tmp/service");
            calls.push("configure");
          },
          deploy: async () => {
            calls.push("deploy");
          },
        },
      },
    };
    const built = await buildProviders([participant], {
      target: "production",
      dryRun: false,
      repositoryRoot: "/repository",
      environment: {},
    });
    await deployProviders([participant], {
      target: "production",
      dryRun: false,
      repositoryRoot: "/repository",
      environment: {},
      initialInputs: built.result(),
    });
    expect(calls).toEqual(["check", "build", "plan", "configure", "deploy"]);
  });
});
