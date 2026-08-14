import { describe, expect, it, vi } from "vite-plus/test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  ComputerCallContext,
  ComputerExecRequest,
  ComputerHandle,
  ComputerInput,
  ComputerSpec,
  ComputerProvider,
} from "./core/index.js";
import { DeploymentOutputs } from "@tryopenbot/runtime-provider";
import { computerImageAssets } from "./base/assets.js";
import {
  BaseComputerProvider,
  computerWorkspacePath,
  scopeComputerExecRequest,
  type ComputerImageDeploymentConfig,
} from "./base/index.js";
import { MicrosandboxComputerProvider } from "./microsandbox/index.js";
import { VercelSandboxComputerProvider } from "./vercel/index.js";

const execute = promisify(execFile);

class TestVercelSandboxComputerProvider extends VercelSandboxComputerProvider {
  readonly login = vi.fn(async (_args: readonly string[], _input: string) => undefined);
  buildArguments(spec: Parameters<BaseComputerProvider["buildImage"]>[0], reference: string) {
    return this.buildImageArguments(spec, reference);
  }
  protected override runDockerWithInput(args: readonly string[], input: string) {
    return this.login(args, input);
  }
  override publishImage = vi.fn(
    async (
      image: Parameters<BaseComputerProvider["publishImage"]>[0],
      spec: Parameters<BaseComputerProvider["publishImage"]>[1],
    ) => ({
      ...image,
      reference: `${spec.repository}:openbot-computer-${image.sourceDigest.slice(7, 19)}`,
      publishedAt: new Date(0),
    }),
  );
}

class TestComputerProvider extends BaseComputerProvider {
  protected readonly providerId = "test";
  protected readonly deployedImageEnvironmentVariable = "TEST_COMPUTER_IMAGE";
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
        AGENT_ID: "hello-world",
        COMPUTER_WORKSPACE: "/workspace/hello-world",
      },
      timeoutMs: undefined,
    });
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
        devMode: false,
        repositoryRoot: process.cwd(),
        environment: { COMPUTER_SERVICE_API_KEY: "x".repeat(32) },
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
  it("delegates Vercel Sandbox development lifecycles to the local provider", async () => {
    const check = vi.fn(async () => undefined);
    const build = vi.fn(async () => ({ outputs: { local: "image" } }));
    const plan = vi.fn(async () => ({ summary: "local Microsandbox" }));
    const deploy = vi.fn(async () => ({ outputs: { reference: "local/image" } }));
    const deployAgentWorkspaces = vi.fn(async () => ({}));
    const deployDevelopmentSandbox = vi.fn(async () => ({}));
    const developmentProvider: ComputerProvider = {
      buildable: { check, build },
      deployable: { plan, deploy },
      deployAgentWorkspaces,
      deployDevelopmentSandbox,
    };
    const provider = new VercelSandboxComputerProvider({ developmentProvider });
    const context = {
      devMode: true,
      repositoryRoot: "/repository",
      environment: {},
      inputs: new DeploymentOutputs(),
      report: vi.fn(),
    } as const;

    await provider.buildable.check(context);
    await provider.buildable.build(context);
    await provider.deployable.plan(context);
    await provider.deployable.deploy(context);
    await provider.deployAgentWorkspaces({ computerId: "computer", workspaces: [] }, context);
    await provider.deployDevelopmentSandbox({ computerId: "development" }, context);

    expect(check).toHaveBeenCalledWith(context);
    expect(build).toHaveBeenCalledWith(context);
    expect(plan).toHaveBeenCalledWith(context);
    expect(deploy).toHaveBeenCalledWith(context);
    expect(deployAgentWorkspaces).toHaveBeenCalledWith(
      { computerId: "computer", workspaces: [] },
      context,
    );
    expect(deployDevelopmentSandbox).toHaveBeenCalledWith({ computerId: "development" }, context);
  });

  it("does not ask for a Vercel repository and describes its managed publish target", async () => {
    const vercel = new VercelSandboxComputerProvider({});
    expect(vercel.initialization).toBeUndefined();
    expect(vercel.platforms.map(({ id }) => id)).toEqual(["vercel"]);
    await expect(
      vercel.deployable.plan({
        devMode: false,
        repositoryRoot: "/repository",
        environment: {},
        inputs: new DeploymentOutputs(),
        report: vi.fn(),
      }),
    ).resolves.toMatchObject({
      summary: expect.stringContaining("agent Vercel project's Container Registry"),
    });
    expect(new MicrosandboxComputerProvider().initialization).toBeUndefined();
    const provider = new TestComputerProvider();
    expect(provider.initialization).toBeUndefined();
    await expect(
      provider.deployable.plan({
        devMode: false,
        repositoryRoot: "/repository",
        environment: {},
        inputs: new DeploymentOutputs(),
        report: vi.fn(),
      }),
    ).resolves.toMatchObject({
      summary: expect.stringContaining("registry.test/openbot-computer"),
    });
  });

  it("authenticates and creates the managed repository during image deployment", async () => {
    const request = vi.fn(
      async () => new Response(JSON.stringify({ id: "team_123", slug: "tryopenbot" })),
    );
    const provider = new TestVercelSandboxComputerProvider({ request });
    const inputs = new DeploymentOutputs();
    inputs.merge({
      outputs: {
        VERCEL_SANDBOX_IMAGE_CONTEXT: "/tmp/context",
        VERCEL_SANDBOX_IMAGE_DOCKERFILE: "/tmp/context/Containerfile",
        VERCEL_SANDBOX_IMAGE_LOCAL_REFERENCE:
          "openbot/vercel-sandbox-computer:openbot-computer-aaaaaaaaaaaa",
        VERCEL_SANDBOX_IMAGE_SOURCE_DIGEST: `sha256:${"a".repeat(64)}`,
      },
    });

    const environment: NodeJS.ProcessEnv = {
      VERCEL_TEAM_ID: "team_123",
      VERCEL_AGENT_PROJECT: "openbot-agents",
      VERCEL_TOKEN: "vercel-secret",
    };
    const context = {
      devMode: false,
      repositoryRoot: "/repository",
      environment,
      inputs,
      report: vi.fn(),
    } as const;
    await expect(provider.deployable.deploy(context)).resolves.toMatchObject({
      outputs: {
        VERCEL_SANDBOX_IMAGE_REFERENCE:
          "vcr.vercel.com/tryopenbot/openbot-agents/openbot-computer:openbot-computer-aaaaaaaaaaaa",
      },
    });
    expect(environment.VERCEL_COMPUTER_IMAGE).toBe(
      "vcr.vercel.com/tryopenbot/openbot-agents/openbot-computer:openbot-computer-aaaaaaaaaaaa",
    );
    expect(provider.login).toHaveBeenCalledWith(
      ["login", "vcr.vercel.com", "--username", "team_123", "--password-stdin"],
      "vercel-secret",
    );
    expect(provider.publishImage).toHaveBeenCalledWith(
      expect.objectContaining({
        localReference: "openbot/vercel-sandbox-computer:openbot-computer-aaaaaaaaaaaa",
      }),
      expect.objectContaining({
        repository: "vcr.vercel.com/tryopenbot/openbot-agents/openbot-computer",
      }),
      expect.any(Object),
    );
  });

  it("uses a local repository-derived image for Microsandbox", async () => {
    await expect(
      new MicrosandboxComputerProvider().deployable.plan({
        devMode: false,
        repositoryRoot: process.cwd(),
        environment: {},
        inputs: new DeploymentOutputs(),
        report: vi.fn(),
      }),
    ).resolves.toMatchObject({
      summary: expect.stringMatching(/locally built .*\/openbot-computer/),
    });
  });

  it("replaces a development Computer when the image reference changes", async () => {
    const provider = new TestComputerProvider();
    provider.get.mockResolvedValue({
      id: "computer",
      providerId: "test",
      state: "running",
      createdAt: new Date(0),
      image: "registry.test/openbot-computer:old",
    });
    await provider.deployAgentWorkspaces(
      { computerId: "computer", workspaces: [] },
      {
        devMode: true,
        repositoryRoot: "/repository",
        environment: {
          COMPUTER_SERVICE_API_KEY: "x".repeat(32),
          TEST_COMPUTER_IMAGE: "registry.test/openbot-computer:new",
        },
        inputs: new DeploymentOutputs(),
        report: vi.fn(),
      },
    );
    expect(provider.delete).toHaveBeenCalledWith("computer", expect.any(Object));
    expect(provider.create).toHaveBeenCalledWith(
      expect.objectContaining({ image: "registry.test/openbot-computer:new" }),
      expect.any(Object),
    );
  });

  it("uses Docker Buildx for the Vercel Sandbox image", () => {
    const provider = new TestVercelSandboxComputerProvider({
      repository: "vcr.vercel.com/example/openbot-computer",
    });
    expect(
      provider.buildArguments(
        {
          sourceDigest: `sha256:${"a".repeat(64)}`,
          contextDirectory: "/tmp/context",
          dockerfilePath: "/tmp/context/Containerfile",
          repository: "vcr.vercel.com/example/openbot-computer",
        },
        "vcr.vercel.com/example/openbot-computer:openbot-computer-aaaaaaaaaaaa",
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
      "vcr.vercel.com/example/openbot-computer:openbot-computer-aaaaaaaaaaaa",
      "--label",
      `org.openbot.computer.source-digest=sha256:${"a".repeat(64)}`,
      "/tmp/context",
    ]);
  });

  it("builds the computer service inside the shared multi-stage image", async () => {
    const containerfile = await readFile(computerImageAssets.containerfile, "utf8");
    expect(containerfile).toContain("AS computer-service-builder");
    expect(containerfile).toContain("pnpm --filter @tryopenbot/computer-service exec tsdown");
    expect(containerfile).toContain("COPY --from=computer-service-builder");
    expect(containerfile).not.toContain("COPY package.json");
    expect(containerfile).toContain("pnpm --filter @tryopenbot/utilities exec tsdown");
    expect(containerfile).toContain("pnpm --filter @tryopenbot/computer-service-proto exec tsdown");
    expect(containerfile).not.toMatch(/^COPY apps\/computer-service\/dist/m);
    expect(containerfile).not.toContain("openbot-agent-exec");
    expect(await readFile(computerImageAssets.bootstrap, "utf8")).toContain("SOPS_VERSION=3.13.3");
  });
});

describe("trusted development sandbox", () => {
  it("loads dotenv and decrypted SOPS values through the Bash profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "openbot-development-profile-"));
    const sourceRoot = join(root, "openbot");
    const configurationRoot = join(sourceRoot, "configuration");
    const binaryRoot = join(root, "bin");
    const ageKeyFile = join(root, "age-key.txt");
    await mkdir(configurationRoot, { recursive: true });
    await mkdir(binaryRoot);
    await Promise.all([
      writeFile(join(configurationRoot, ".env"), 'PLAIN_VALUE="from-dotenv"\n'),
      writeFile(join(configurationRoot, "secrets.enc.yaml"), "sops: {}\n"),
      writeFile(ageKeyFile, "AGE-SECRET-KEY-1TEST\n", { mode: 0o400 }),
      writeFile(
        join(binaryRoot, "sops"),
        '#!/usr/bin/env bash\nprintf \'%s\\n\' \'{"SECRET_VALUE":{"value":"from-sops"},"SECRETS_SOPS_AGE_KEY":{"value":"hidden"}}\'\n',
        { mode: 0o755 },
      ),
    ]);

    try {
      const result = await execute(
        "bash",
        [
          "-c",
          `source ${JSON.stringify(computerImageAssets.developmentProfile)}; printf '%s|%s|%s' "$PLAIN_VALUE" "$SECRET_VALUE" "\${SOPS_AGE_KEY_FILE:-}"`,
        ],
        {
          env: {
            ...process.env,
            PATH: `${binaryRoot}:${process.env.PATH ?? ""}`,
            OPENBOT_SOURCE_ROOT: sourceRoot,
            OPENBOT_AGE_KEY_FILE: ageKeyFile,
          },
        },
      );
      expect(result.stdout).toBe(`from-dotenv|from-sops|${ageKeyFile}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("installs repository configuration and a user-readable-only SOPS identity", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "openbot-development-sandbox-"));
    await mkdir(join(repositoryRoot, "configuration"));
    await Promise.all([
      writeFile(join(repositoryRoot, "configuration/.env"), 'MODEL="gpt-test"\n'),
      writeFile(join(repositoryRoot, "configuration/.sops.yaml"), "creation_rules: []\n"),
      writeFile(join(repositoryRoot, "configuration/secrets.enc.yaml"), "sops: {}\n"),
    ]);
    const provider = new TestComputerProvider();
    const inputs = new DeploymentOutputs();

    try {
      await expect(
        provider.deployDevelopmentSandbox(
          { computerId: "development" },
          {
            devMode: false,
            repositoryRoot,
            environment: {
              MODEL: "gpt-test",
              VERCEL_TOKEN: "deployment-token",
              SOPS_AGE_KEY: "AGE-SECRET-KEY-1TEST",
            },
            inputs,
            report: vi.fn(),
          },
        ),
      ).resolves.toMatchObject({
        outputs: { "development-sandbox.computer-id": "computer" },
      });
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }

    expect(provider.create).not.toHaveBeenCalled();
    expect(provider.writeFile).toHaveBeenCalledWith(
      "computer",
      "/workspace/openbot/configuration/.env",
      expect.any(Uint8Array),
      expect.anything(),
    );
    expect(provider.writeFile).toHaveBeenCalledWith(
      "computer",
      "/workspace/openbot/configuration/secrets.enc.yaml",
      expect.any(Uint8Array),
      expect.anything(),
    );
    expect(provider.writeFile).toHaveBeenCalledWith(
      "computer",
      "/workspace/.openbot/development/sops-age-key.txt",
      expect.any(Uint8Array),
      expect.anything(),
    );
    expect(provider.exec).toHaveBeenCalledWith(
      "computer",
      {
        command: "chmod",
        args: ["0400", "/workspace/.openbot/development/sops-age-key.txt"],
      },
      expect.anything(),
    );
    expect(provider.exec).toHaveBeenCalledWith(
      "computer",
      expect.objectContaining({
        command: "/usr/local/bin/setup-openbot-development",
        args: ["/workspace/openbot", "/workspace/.openbot/development/sops-age-key.txt"],
      }),
      expect.anything(),
    );
    const profile = await readFile(computerImageAssets.developmentProfile, "utf8");
    expect(profile).toContain('source "$openbot_source_root/configuration/.env"');
    expect(profile).toContain("SOPS_AGE_KEY_FILE");
    expect(profile).toContain("sops decrypt --output-type json");
  });
});

describe("agent computer-service deployment", () => {
  it("returns the typed service transport after registering agent users", async () => {
    vi.stubEnv("COMPUTER_SERVICE_API_KEY", "a".repeat(32));
    const provider = new TestComputerProvider();
    const result = await provider.deployAgentWorkspaces(
      { computerId: "computer", workspaces: [{ agentId: "hello-world", files: [] }] },
      {
        devMode: false,
        repositoryRoot: process.cwd(),
        environment: process.env,
        inputs: new DeploymentOutputs(),
        report: vi.fn(),
      },
    );
    vi.unstubAllEnvs();

    expect(result).toMatchObject({
      outputs: { "computer.id": "computer" },
    });
  });
});
