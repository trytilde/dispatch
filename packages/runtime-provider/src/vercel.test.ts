import { describe, expect, it, vi } from "vitest";
import { deployProviders } from "@openbot/runtime-provider-core";
import { createVercelRuntimeProvider, vercelDeploymentUrl, type RuntimeCommandRunner } from "./vercel.js";

describe("Vercel runtime provider", () => {
  it("plans without mutating Vercel", async () => {
    const run = vi.fn();
    const events: unknown[] = [];
    await deployProviders([{ id: "runtime", role: "runtime", provider: { deployable: createVercelRuntimeProvider({ runner: { run } as RuntimeCommandRunner }) } }], {
      target: "production",
      dryRun: true,
      repositoryRoot: "/repo",
      report: (event) => events.push(event),
    });
    expect(run).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).toContain("Deploy the OpenBot runtime and web UI to Vercel");
  });

  it("installs aggregated values, deploys, and smokes the runtime", async () => {
    const run = vi.fn(async (_command: string, args: readonly string[]) => ({
      stdout: args.includes("deploy") ? '{"url":"openbot.example.vercel.app"}\n' : "",
      stderr: "",
    }));
    const request = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const provider = createVercelRuntimeProvider({
      runner: { run },
      readProject: async () => ({ projectName: "openbot" }),
      request: request as typeof fetch,
    });
    const outputs = await deployProviders([
      { id: "tilde", provider: { deployable: { plan: async () => ({ summary: "tilde" }), deploy: async () => ({ secrets: { TILDE_PRIVATE_KEY: "private-value" } }) } } },
      { id: "runtime", role: "runtime", provider: { deployable: provider } },
    ], {
      target: "production",
      dryRun: false,
      repositoryRoot: "/repo",
    });
    expect(run).toHaveBeenCalledWith("pnpm", expect.arrayContaining(["vercel", "deploy", "--prod"]), expect.anything());
    expect(run).toHaveBeenCalledWith("pnpm", expect.arrayContaining(["vercel", "env", "add", "OPENBOT_PUBLIC_ORIGIN", "production", "--force", "--yes", "--no-sensitive"]), expect.objectContaining({ input: "https://openbot.vercel.app" }));
    expect(run).toHaveBeenCalledWith("pnpm", expect.arrayContaining(["vercel", "env", "add", "TILDE_PRIVATE_KEY", "production", "--force", "--yes", "--sensitive"]), expect.objectContaining({ input: "private-value" }));
    expect(outputs.require("runtime.origin")).toBe("https://openbot.vercel.app");
    expect(outputs.require("runtime.deployment-url")).toBe("https://openbot.example.vercel.app");
    expect(request).toHaveBeenCalledWith("https://openbot.example.vercel.app/healthz", expect.anything());
  });

  it("parses structured and plain Vercel output", () => {
    expect(vercelDeploymentUrl('{"url":"openbot.vercel.app"}')).toBe("https://openbot.vercel.app");
    expect(vercelDeploymentUrl("Ready: https://openbot.vercel.app.")).toBe("https://openbot.vercel.app");
  });
});
