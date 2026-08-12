import { describe, expect, it, vi } from "vitest";
import { deployProviders } from "@openbot/runtime-provider-core";
import { createVercelRuntimeProvider, vercelDeploymentUrl, type RuntimeCommandRunner } from "./vercel.js";

describe("Vercel runtime provider", () => {
  it("plans one release without mutating Vercel", async () => {
    const run = vi.fn();
    const events: string[] = [];
    await deployProviders([{ id: "runtime", provider: createVercelRuntimeProvider({ runner: { run } as RuntimeCommandRunner }) }], {
      target: "production",
      dryRun: true,
      repositoryRoot: "/repo",
      report: ({ event }) => events.push(event),
    });
    expect(run).not.toHaveBeenCalled();
    expect(events).toContain("vercel.project.planned");
    expect(events).toContain("vercel.deploy.planned");
  });

  it("deploys and smokes the complete runtime", async () => {
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
    const outputs = await deployProviders([{ id: "runtime", provider }], {
      target: "production",
      dryRun: false,
      repositoryRoot: "/repo",
    });
    expect(run).toHaveBeenCalledWith("pnpm", expect.arrayContaining(["vercel", "deploy", "--prod"]), expect.anything());
    expect(run).toHaveBeenCalledWith("pnpm", expect.arrayContaining(["vercel", "env", "add", "OPENBOT_PUBLIC_ORIGIN"]), expect.objectContaining({ input: "https://openbot.vercel.app" }));
    expect(outputs.require("runtime.origin")).toBe("https://openbot.vercel.app");
    expect(outputs.require("runtime.deployment-url")).toBe("https://openbot.example.vercel.app");
    expect(request).toHaveBeenCalledWith("https://openbot.example.vercel.app/healthz", expect.anything());
  });

  it("parses structured and plain Vercel output", () => {
    expect(vercelDeploymentUrl('{"url":"openbot.vercel.app"}')).toBe("https://openbot.vercel.app");
    expect(vercelDeploymentUrl("Ready: https://openbot.vercel.app.")).toBe("https://openbot.vercel.app");
  });
});
