import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import type { ComputerCallContext, ComputerExecRequest, ComputerHandle, ComputerInput, ComputerSpec } from "@openbot/computer-provider-core";
import { DeploymentOutputs } from "@openbot/runtime-provider-core";
import { computerImageAssets } from "./base/assets.js";
import { BaseComputerProvider, computerWorkspacePath, type ComputerImageDeploymentConfig } from "./base/index.js";

class TestComputerProvider extends BaseComputerProvider {
  protected readonly providerId = "test";
  protected readonly deployedImageEnvironmentVariable = "OPENBOT_TEST_COMPUTER_IMAGE";
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
      "computer_exec",
      "computer_read_file",
      "computer_write_file",
      "computer_screenshot",
      "computer_input",
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
  });
});
