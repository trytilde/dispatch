import { describe, expect, it, vi } from "vitest";
import { buildProviders, deployProviders, DeploymentOutputs, sandboxDeploymentEnvironment } from "./index.js";

describe("provider deployment", () => {
  it("checks and builds artifacts in participant order", async () => {
    const calls: string[] = [];
    const outputs = await buildProviders([
      { id: "agents", provider: { buildable: {
        check: async () => { calls.push("agents.check"); },
        build: async () => { calls.push("agents.build"); return { outputs: { "agents.digest": "one" } }; },
      } } },
      { id: "control", role: "runtime", provider: { buildable: {
        check: async ({ inputs }) => { calls.push(`control.check:${inputs.require("agents.digest")}`); },
        build: async () => { calls.push("control.build"); return { outputs: { "control.digest": "two" } }; },
      } } },
    ], { target: "production", dryRun: false, repositoryRoot: "/repo" });

    expect(calls).toEqual(["agents.check", "agents.build", "control.check:one", "control.build"]);
    expect(outputs.outputs()).toEqual({ "agents.digest": "one", "control.digest": "two" });
  });

  it("plans all providers, configures optionally, then deploys the sandbox before the runtime", async () => {
    const calls: string[] = [];
    const outputs = await deployProviders([
      { id: "runtime:vercel", role: "runtime", provider: { deployable: {
        plan: async () => ({ summary: "runtime" }),
        configure: async () => {
          calls.push("runtime.configure");
          return { outputs: { "runtime.origin": "https://openbot.example" } };
        },
        deploy: async ({ inputs }) => {
          calls.push("runtime.deploy");
          expect(inputs.secrets().TILDE_KEY).toBe("private-value");
          expect(inputs.sandboxSecrets()).toEqual({});
        },
      } } },
      { id: "skills:tilde", provider: { deployable: {
        plan: async () => ({ summary: "skills" }),
        deploy: async ({ inputs }) => {
          calls.push("skills.deploy");
          expect(inputs.require("runtime.origin")).toBe("https://openbot.example");
          return { secrets: { TILDE_KEY: "private-value" } };
        },
      } } },
      { id: "sandbox:development", role: "sandbox", provider: { deployable: {
        plan: async () => ({ summary: "sandbox" }),
        deploy: async ({ inputs }) => {
          calls.push("sandbox.deploy");
          expect(inputs.secrets().TILDE_KEY).toBe("private-value");
          expect(inputs.sandboxSecrets().SOPS_AGE_KEY).toBe("sandbox-identity");
        },
      } } },
    ], {
      target: "production",
      dryRun: false,
      repositoryRoot: "/repo",
      initialInputs: { sandboxSecrets: { SOPS_AGE_KEY: "sandbox-identity" } },
    });

    expect(calls).toEqual(["runtime.configure", "skills.deploy", "sandbox.deploy", "runtime.deploy"]);
    expect(outputs.secrets()).toEqual({ TILDE_KEY: "private-value" });
    expect(outputs.sandboxSecrets()).toEqual({ SOPS_AGE_KEY: "sandbox-identity" });
  });

  it("only plans during a dry run", async () => {
    const plan = vi.fn(async () => ({ summary: "planned" }));
    const configure = vi.fn();
    const deploy = vi.fn();
    await deployProviders([{ id: "one", provider: { deployable: { plan, configure, deploy } } }], {
      target: "production", dryRun: true, repositoryRoot: "/repo",
    });
    expect(plan).toHaveBeenCalledOnce();
    expect(configure).not.toHaveBeenCalled();
    expect(deploy).not.toHaveBeenCalled();
  });

  it("skips providers that do not expose a deployable", async () => {
    const events: unknown[] = [];
    await deployProviders([{ id: "skills:internal", provider: {} }], {
      target: "production",
      dryRun: false,
      repositoryRoot: "/repo",
      report: (event) => events.push(event),
    });
    expect(events).toEqual([]);
  });

  it("does not silently deduplicate providers", async () => {
    await expect(deployProviders([
      { id: "vercel", provider: { deployable: { plan: async () => ({ summary: "one" }), deploy: async () => undefined } } },
      { id: "vercel", provider: { deployable: { plan: async () => ({ summary: "two" }), deploy: async () => undefined } } },
    ], { target: "production", dryRun: false, repositoryRoot: "/repo" }))
      .rejects.toThrow("Duplicate deployment participant id: vercel");
  });

  it("rejects conflicting output values", () => {
    const outputs = new DeploymentOutputs();
    outputs.merge({ environmentVariables: { OPENBOT_PORT: "4100" } });
    expect(() => outputs.merge({ environmentVariables: { OPENBOT_PORT: "4200" } }))
      .toThrow("Conflicting deployment environment variable: OPENBOT_PORT");
    expect(() => outputs.require("missing")).toThrow("Required deployment output is unavailable: missing");
  });

  it("builds the trusted sandbox environment without changing runtime secrets", () => {
    const outputs = new DeploymentOutputs();
    outputs.merge({
      environmentVariables: { OPENAI_MODEL: "gpt-test" },
      secrets: { VERCEL_TOKEN: "runtime-secret" },
      deploymentSecrets: { AWS_ACCESS_KEY_ID: "deployment-credential" },
      sandboxSecrets: { SOPS_AGE_KEY: "sandbox-identity" },
    });
    expect(sandboxDeploymentEnvironment(outputs)).toEqual({
      OPENAI_MODEL: "gpt-test",
      VERCEL_TOKEN: "runtime-secret",
      AWS_ACCESS_KEY_ID: "deployment-credential",
      SOPS_AGE_KEY: "sandbox-identity",
    });
    expect(outputs.secrets()).not.toHaveProperty("SOPS_AGE_KEY");
    expect(outputs.secrets()).not.toHaveProperty("AWS_ACCESS_KEY_ID");
  });

  it("keeps secret values private from deployment events", async () => {
    const events: unknown[] = [];
    const outputs = await deployProviders([{ id: "tilde", provider: { deployable: {
      plan: async () => ({ summary: "tilde" }),
      deploy: async () => ({ secrets: { TILDE_PRIVATE_KEY: "private-value" } }),
    } } }], {
      target: "production",
      dryRun: false,
      repositoryRoot: "/repo",
      report: (event) => events.push(event),
    });
    expect(outputs.secrets()).toEqual({ TILDE_PRIVATE_KEY: "private-value" });
    expect(JSON.stringify(events)).not.toContain("private-value");
  });
});
