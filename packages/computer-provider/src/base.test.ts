import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import type { ComputerCallContext, ComputerExecRequest, ComputerHandle, ComputerInput, ComputerSpec } from "./core/index.js";
import { DeploymentOutputs } from "@openbot/runtime-provider";
import { computerImageAssets } from "./base/assets.js";
import { shellEnvironmentExports } from "./base/development.js";
import { BaseComputerProvider, computerWorkspacePath, scopeComputerExecRequest, type ComputerImageDeploymentConfig } from "./base/index.js";

class TestComputerProvider extends BaseComputerProvider {
  protected readonly providerId = "test";
  protected readonly deployedImageEnvironmentVariable = "OPENBOT_TEST_COMPUTER_IMAGE";
  protected async computerServiceUrl() { return "https://computer.test/rpc"; }
  constructor(imageDeployment: ComputerImageDeploymentConfig = { repository: "registry.test/openbot-computer" }) { super(imageDeployment); }
  create = vi.fn(async (_spec: ComputerSpec): Promise<ComputerHandle> => ({ id: "computer", providerId: "test", state: "running", createdAt: new Date(0) }));
  get = vi.fn(async (): Promise<ComputerHandle> => ({ id: "computer", providerId: "test", state: "running", createdAt: new Date(0) }));
  wake = this.get;
  sleep = this.get;
  delete = vi.fn(async () => undefined);
  exec = vi.fn(async (_id: string, _request: ComputerExecRequest, _context: ComputerCallContext) => ({ exitCode: 0, stdout: "ok", stderr: "" }));
  readFile = vi.fn(async () => new Uint8Array([1, 2, 3]));
  writeFile = vi.fn(async () => undefined);
  screenshot = vi.fn(async () => new Uint8Array([137, 80, 78, 71]));
  input = vi.fn(async (_id: string, _input: ComputerInput) => undefined);
  vnc = vi.fn(async () => ({ url: new URL("https://computer.test/vnc"), expiresAt: new Date(1) }));
}

describe("computer tool registration", () => {
  it("returns AI SDK tools with Tilde custom-provider manifests", () => {
    const provider = new TestComputerProvider();
    const tools = provider.registerTools({ computerId: "computer", agentId: "hello-world" });
    expect(tools.map((candidate) => candidate.typeId)).toEqual([
      "bash",
      "read_file",
      "write_file",
      "glob",
      "grep",
    ]);
    for (const candidate of tools) {
      expect(candidate.tilde).toMatchObject({
        type_id: candidate.typeId,
        description: expect.any(String),
        input_schema: expect.any(Object),
      });
      expect(candidate).toHaveProperty("inputSchema");
    }
  });

  it("injects a bounded computer prompt part", () => {
    const provider = new TestComputerProvider();
    expect(provider.injectPromptPart({}, { requestId: "test" })).toMatchObject({ id: "computer:test", cache: "session" });
  });
});

describe("computerWorkspacePath", () => {
  it("keeps tool file operations inside the shared workspace", () => {
    expect(computerWorkspacePath("notes/today.md")).toBe("/workspace/notes/today.md");
    expect(computerWorkspacePath("/workspace/notes/today.md")).toBe("/workspace/notes/today.md");
    expect(computerWorkspacePath("/workspace/notes/today.md", "hello-world")).toBe("/workspace/.openbot/agents/hello-world/workspace/notes/today.md");
    expect(() => computerWorkspacePath("../../etc/passwd")).toThrow(/escapes/);
    expect(() => computerWorkspacePath("/etc/passwd")).toThrow(/inside/);
  });

  it("runs agent commands with a private /workspace mount", () => {
    expect(scopeComputerExecRequest({ command: "pwd", cwd: "/workspace/project" }, "hello-world")).toEqual({
      command: "/usr/local/bin/openbot-agent-exec",
      args: [
        "/workspace/.openbot/agents/hello-world/workspace",
        expect.stringMatching(/^ob_[a-f0-9]{16}$/),
        "/workspace/project",
        "pwd",
      ],
      timeoutMs: undefined,
    });
  });

  it("quotes trusted sandbox environment values without exposing shell syntax", () => {
    expect(shellEnvironmentExports({ TOKEN: "one'two", SIMPLE: "value" })).toBe("export SIMPLE='value'\nexport TOKEN='one'\"'\"'two'");
  });
});

describe("computer image lifecycle", () => {
  it("exposes repository initialization and a publish plan", async () => {
    expect(new TestComputerProvider({}).initialization?.questions[0]?.destination.key).toBe("OPENBOT_COMPUTER_IMAGE_REPOSITORY");
    const provider = new TestComputerProvider();
    expect(provider.initialization).toBeUndefined();
    await expect(provider.deployable.plan({
      target: "production",
      repositoryRoot: "/repository",
      environment: {},
      inputs: new DeploymentOutputs(),
      report: vi.fn(),
    })).resolves.toMatchObject({ summary: expect.stringContaining("registry.test/openbot-computer") });
  });

  it("builds the computer service inside the shared multi-stage image", async () => {
    const containerfile = await readFile(computerImageAssets.containerfile, "utf8");
    expect(containerfile).toContain("AS computer-service-builder");
    expect(containerfile).toContain("pnpm --filter @openbot/computer-service build");
    expect(containerfile).toContain("COPY --from=computer-service-builder");
    expect(containerfile).not.toMatch(/^COPY apps\/computer-service\/dist/m);
    expect(containerfile).toContain("openbot-agent-exec");
    const agentExec = await readFile(computerImageAssets.agentExec, "utf8");
    expect(agentExec).toContain("unshare --mount");
    expect(agentExec).toContain("env -i");
    expect(agentExec).not.toContain("OPENBOT_COMPUTER_SERVICE_API_KEY");
    expect(await readFile(computerImageAssets.bootstrap, "utf8")).toContain("SOPS_VERSION=3.13.3");
  });
});

describe("trusted development sandbox", () => {
  it("installs the sandbox-only SOPS identity without adding it to a computer spec", async () => {
    const provider = new TestComputerProvider();
    const inputs = new DeploymentOutputs();
    inputs.merge({
      environmentVariables: { OPENBOT_MODEL: "gpt-test" },
      deploymentSecrets: { VERCEL_TOKEN: "deployment-token" },
      sandboxSecrets: { SOPS_AGE_KEY: "AGE-SECRET-KEY-1TEST" },
    });

    await expect(provider.deployDevelopmentSandbox({ computerId: "development" }, {
      target: "production",
      repositoryRoot: process.cwd(),
      environment: {},
      inputs,
      report: vi.fn(),
    })).resolves.toMatchObject({
      outputs: { "development-sandbox.computer-id": "computer" },
      environmentVariables: { OPENBOT_DEVELOPMENT_SANDBOX_ID: "computer" },
    });

    expect(provider.create).not.toHaveBeenCalled();
    expect(provider.writeFile).toHaveBeenCalledWith(
      "computer",
      "/workspace/.openbot/development/environment.sh",
      expect.any(Uint8Array),
      expect.anything(),
    );
    expect(provider.exec).toHaveBeenCalledWith("computer", expect.objectContaining({
      command: "/usr/local/bin/setup-openbot-development",
    }), expect.anything());
  });
});

describe("agent computer-service deployment", () => {
  it("returns the typed service transport after registering agent users", async () => {
    vi.stubEnv("OPENBOT_COMPUTER_SERVICE_API_KEY", "a".repeat(32));
    const provider = new TestComputerProvider();
    const result = await provider.deployAgentWorkspaces({ computerId: "computer", workspaces: [{ agentId: "hello-world", files: [] }] }, {
      target: "production",
      repositoryRoot: process.cwd(),
      environment: process.env,
      inputs: new DeploymentOutputs(),
      report: vi.fn(),
    });
    vi.unstubAllEnvs();

    expect(result).toMatchObject({
      outputs: { "computer.id": "computer" },
      environmentVariables: {
        OPENBOT_COMPUTER_ID: "computer",
        OPENBOT_COMPUTER_SERVICE_URL: "https://computer.test/rpc",
      },
    });
    expect(result.secrets).toBeUndefined();
  });
});
