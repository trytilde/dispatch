import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  readFile: vi.fn(),
  stop: vi.fn(),
  writeFiles: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: mocks.create } }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));

import { VercelSandboxProvider } from "./vercel-sandbox.js";

describe("VercelSandboxProvider", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENBOT_SETUP_CODE", "a-setup-code-that-is-long-enough");
    mocks.readFile.mockResolvedValue(Buffer.from("box host"));
    mocks.stop.mockResolvedValue(undefined);
    mocks.writeFiles.mockRejectedValue(new Error("seed failed"));
    mocks.create.mockResolvedValue({
      name: "sandbox-one",
      stop: mocks.stop,
      writeFiles: mocks.writeFiles,
    });
  });

  it("stops a sandbox when initialization fails", async () => {
    await expect(new VercelSandboxProvider().create({}, { requestId: "test" })).rejects.toThrow(
      "seed failed",
    );

    expect(mocks.stop).toHaveBeenCalledOnce();
  });
});
