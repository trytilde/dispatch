import { describe, expect, it, vi } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import type {
  ComputerCallContext,
  ComputerExecRequest,
  ComputerHandle,
  ComputerInput,
  ComputerSpec,
} from "./core/index.js";
import { DeploymentOutputs } from "@tryopenbot/runtime-provider";
import { computerImageAssets } from "./base/assets.js";
import { shellEnvironmentExports } from "./base/development.js";
import {
  BaseComputerProvider,
  computerWorkspacePath,
  scopeComputerExecRequest,
  type ComputerImageDeploymentConfig,
} from "./base/index.js";
import { MicrosandboxComputerProvider } from "./microsandbox/index.js";
import { VercelSandboxComputerProvider } from "./vercel/index.js";

class TestVercelSandboxComputerProvider extends VercelSandboxComputerProvider {
  buildArguments(spec: Parameters<BaseComputerProvider["buildImage"]>[0], reference: string) {
    return this.buildImageArguments(spec, reference);
  }
}

class TestComputerProvider extends BaseComputerProvider {
  protected readonly providerId = "test";
  protected readonly deployedImageEnvironmentVariable = "OPENBOT_TEST_COMPUTER_IMAGE";
  protected async computerServiceUrl() {
    return "https://computer.test/rpc";
  }
  constructor(
    imageDeployment: ComputerImageDeploymentConfig = {
      repository: "registry.test/openbot-computer",
    },
  ) {
    super(imageDeployment);
  }
  create = vi.fn(async (_spec: ComputerSpec): Promise<ComputerHandle> => ({
    id: "computer",
    providerId: "test",
    state: "running",
    createdAt: new Date(0),
  }));
  get = vi.fn(async (): Promise<ComputerHandle> => ({
    id: "computer",
    providerId: "test",
    state: "running",
    createdAt: new Date(0),
  }));
  wake = this.get;
  sleep = this.get;
  delete = vi.fn(async () => undefined);
  exec = vi.fn(
    async (_id: string, _request: ComputerExecRequest, _context: ComputerCallContext) => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    }),
  );
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
      "await_shell",
      "copy_from_computer",
      "copy_to_computer",
      "read_file",
      "write_file",
      "glob",
      "grep",
      "screenshot",
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
    expect(provider.injectPromptPart({}, { requestId: "test" })).toMatchObject({
      id: "computer:test",
      cache: "session",
    });
  });
});

describe("computerWorkspacePath", () => {
  it("defaults relative paths to an agent directory while preserving absolute paths", () => {
    expect(computerWorkspacePath("notes/today.md")).toBe("/workspace/notes/today.md");
    expect(computerWorkspacePath("/workspace/notes/today.md")).toBe("/workspace/notes/today.md");
    expect(computerWorkspacePath("notes/today.md", "hello-world")).toBe(
      "/workspace/hello-world/notes/today.md",
    );
    expect(computerWorkspacePath("/workspace/notes/today.md", "hello-world")).toBe(
      "/workspace/notes/today.md",
    );
    expect(computerWorkspacePath("../../etc/passwd")).toBe("/etc/passwd");
    expect(computerWorkspacePath("/etc/passwd", "hello-world")).toBe("/etc/passwd");
  });

  it("defaults agent commands to their directory without creating an OS boundary", () => {
    expect(scopeComputerExecRequest({ command: "pwd", cwd: "project" }, "hello-world")).toEqual({
      command: "pwd",
      cwd: "/workspace/hello-world/project",
      environment: {
        HOME: "/workspace/hello-world",
        OPENBOT_AGENT_ID: "hello-world",
        OPENBOT_COMPUTER_WORKSPACE: "/workspace/hello-world",
      },
      timeoutMs: undefined,
    });
  });

  it("quotes trusted sandbox environment values without exposing shell syntax", () => {
    expect(shellEnvironmentExports({ TOKEN: "one'two", SIMPLE: "value" })).toBe(
      "export SIMPLE='value'\nexport TOKEN='one'\"'\"'two'",
    );
  });
});

describe("agent workspace deployment", () => {
  it("creates only populated seed directories under /workspace/<agent-id>", async () => {
    const provider = new TestComputerProvider();
    provider.exec
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "missing" })
      .mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await provider.deployAgentWorkspaces(
      {
        computerId: "computer",
        workspaces: [
          { agentId: "empty", files: [] },
          {
            agentId: "hello-world",
            files: [
              { path: "README.md", content: new TextEncoder().encode("hello"), executable: false },
            ],
          },
        ],
      },
      {
        target: "production",
        repositoryRoot: process.cwd(),
        environment: { OPENBOT_COMPUTER_SERVICE_API_KEY: "x".repeat(32) },
        inputs: new DeploymentOutputs(),
        report: vi.fn(),
      },
    );

    expect(provider.exec).toHaveBeenCalledWith(
      "computer",
      { command: "test", args: ["-f", "/workspace/hello-world/.openbot-agent"] },
      expect.any(Object),
    );
    expect(provider.exec).toHaveBeenCalledWith(
      "computer",
      { command: "mkdir", args: ["-p", "/workspace/hello-world"] },
      expect.any(Object),
    );
    expect(provider.exec.mock.calls.flatMap((call) => call[1].args ?? [])).not.toContain(
      "/workspace/empty",
    );
    expect(provider.writeFile).toHaveBeenCalledWith(
      "computer",
      "/workspace/hello-world/README.md",
      expect.any(Uint8Array),
      expect.any(Object),
    );
  });
});

describe("computer image lifecycle", () => {
  it("exposes repository initialization and a publish plan", async () => {
    expect(new VercelSandboxComputerProvider({}).initialization?.questions[0]).toMatchObject({
      description: expect.stringContaining("vercel.com/docs/container-registry"),
      destination: { key: "OPENBOT_COMPUTER_IMAGE_REPOSITORY" },
    });
    expect(new MicrosandboxComputerProvider().initialization).toBeUndefined();
    const provider = new TestComputerProvider();
    expect(provider.initialization).toBeUndefined();
    await expect(
      provider.deployable.plan({
        target: "production",
        repositoryRoot: "/repository",
        environment: {},
        inputs: new DeploymentOutputs(),
        report: vi.fn(),
      }),
    ).resolves.toMatchObject({
      summary: expect.stringContaining("registry.test/openbot-computer"),
    });
  });

  it("uses a local repository-derived image for Microsandbox", async () => {
    await expect(
      new MicrosandboxComputerProvider().deployable.plan({
        target: "production",
        repositoryRoot: process.cwd(),
        environment: {},
        inputs: new DeploymentOutputs(),
        report: vi.fn(),
      }),
    ).resolves.toMatchObject({
      summary: expect.stringMatching(/locally built .*\/openbot-computer/),
    });
  });

  it("uses Docker Buildx for the Vercel Sandbox image", () => {
    const provider = new TestVercelSandboxComputerProvider({
      repository: "registry.vercel.com/example/openbot-computer",
    });
    expect(
      provider.buildArguments(
        {
          sourceDigest: `sha256:${"a".repeat(64)}`,
          contextDirectory: "/tmp/context",
          dockerfilePath: "/tmp/context/Containerfile",
          repository: "registry.vercel.com/example/openbot-computer",
        },
        "registry.vercel.com/example/openbot-computer:openbot-computer-aaaaaaaaaaaa",
      ),
    ).toEqual([
      "buildx",
      "build",
      "--platform",
      "linux/amd64",
      "--load",
      "--file",
      "/tmp/context/Containerfile",
      "--tag",
      "registry.vercel.com/example/openbot-computer:openbot-computer-aaaaaaaaaaaa",
      "--label",
      `org.openbot.computer.source-digest=sha256:${"a".repeat(64)}`,
      "/tmp/context",
    ]);
  });

  it("builds the computer service inside the shared multi-stage image", async () => {
    const containerfile = await readFile(computerImageAssets.containerfile, "utf8");
    expect(containerfile).toContain("AS computer-service-builder");
    expect(containerfile).toContain("pnpm --filter @tryopenbot/computer-service build");
    expect(containerfile).toContain("COPY --from=computer-service-builder");
    expect(containerfile).not.toMatch(/^COPY apps\/computer-service\/dist/m);
    expect(containerfile).not.toContain("openbot-agent-exec");
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

    await expect(
      provider.deployDevelopmentSandbox(
        { computerId: "development" },
        {
          target: "production",
          repositoryRoot: process.cwd(),
          environment: {},
          inputs,
          report: vi.fn(),
        },
      ),
    ).resolves.toMatchObject({
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
    expect(provider.exec).toHaveBeenCalledWith(
      "computer",
      expect.objectContaining({
        command: "/usr/local/bin/setup-openbot-development",
      }),
      expect.anything(),
    );
  });
});

describe("agent computer-service deployment", () => {
  it("returns the typed service transport after registering agent users", async () => {
    vi.stubEnv("OPENBOT_COMPUTER_SERVICE_API_KEY", "a".repeat(32));
    const provider = new TestComputerProvider();
    const result = await provider.deployAgentWorkspaces(
      { computerId: "computer", workspaces: [{ agentId: "hello-world", files: [] }] },
      {
        target: "production",
        repositoryRoot: process.cwd(),
        environment: process.env,
        inputs: new DeploymentOutputs(),
        report: vi.fn(),
      },
    );
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
