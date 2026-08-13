import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deployProviders, DeploymentOutputs } from "@openbot/runtime-provider-core";
import { LocalControlServiceProvider } from "./local.js";
import { deploymentUrl, VercelControlServiceProvider } from "./vercel.js";
import type { CommandRunner } from "./command.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("control service providers", () => {
  it("installs a secret-free local systemd unit", async () => {
    const root = await temporaryRoot();
    const run = vi.fn<CommandRunner["run"]>(async () => ({ stdout: "", stderr: "" }));
    const provider = new LocalControlServiceProvider({ platform: "linux", homeDirectory: join(root, "home"), runner: { run }, request: healthy(), command: ["/usr/bin/node", "/tmp/control.mjs"] });
    await deployProviders([{ id: "control", role: "runtime", provider: { deployable: provider } }], {
      target: "production", dryRun: false, repositoryRoot: root,
      environment: { OPENBOT_PORT: "4100" },
      initialInputs: { outputs: { "control-service.artifact": "/tmp/control.mjs" }, secrets: { API_KEY: "private-value" } },
    });
    const unit = await readFile(join(root, "home/.config/systemd/user/openbot-control.service"), "utf8");
    const environment = await readFile(join(root, ".openbot-deploy/control-service.env"), "utf8");
    expect(unit).not.toContain("private-value");
    expect(environment).toContain('API_KEY="private-value"');
    expect(run).toHaveBeenCalledWith("systemctl", ["--user", "restart", "openbot-control.service"], expect.anything());
  });

  it("deploys the prebuilt control artifact to its own Vercel project", async () => {
    const run = vi.fn<CommandRunner["run"]>(async (_command, args) => args.includes("deploy") ? { stdout: "https://control-preview.vercel.app\n", stderr: "" } : { stdout: "", stderr: "" });
    const provider = new VercelControlServiceProvider({ runner: { run }, request: healthy() });
    await deployProviders([{ id: "control", role: "runtime", provider: { deployable: provider } }], {
      target: "preview", dryRun: false, repositoryRoot: "/repo",
      environment: { OPENBOT_VERCEL_CONTROL_PROJECT: "openbot-control" },
      initialInputs: { outputs: { "control-service.artifact": "/repo/control-artifact" } },
    });
    expect(run).toHaveBeenCalledWith("pnpm", expect.arrayContaining(["deploy", "--prebuilt", "--cwd", "/repo/control-artifact", "--project", "openbot-control"]), expect.anything());
  });

  it("creates a missing Vercel project before configuring it", async () => {
    const run = vi.fn<CommandRunner["run"]>(async (_command, args) => {
      if (args.includes("inspect")) throw new Error("missing");
      return { stdout: "", stderr: "" };
    });
    const provider = new VercelControlServiceProvider({ runner: { run }, request: healthy() });
    await provider.configure({
      target: "preview", repositoryRoot: "/repo", environment: { OPENBOT_VERCEL_CONTROL_PROJECT: "openbot-control" },
      inputs: new DeploymentOutputs(), report: () => undefined,
    });
    expect(run).toHaveBeenCalledWith("pnpm", expect.arrayContaining(["project", "add", "openbot-control"]), expect.anything());
  });

  it("keeps launchd secrets in the private environment file", async () => {
    const root = await temporaryRoot();
    const run = vi.fn<CommandRunner["run"]>(async () => ({ stdout: "", stderr: "" }));
    const provider = new LocalControlServiceProvider({ platform: "darwin", homeDirectory: join(root, "home"), uid: 501, runner: { run }, request: healthy(), command: ["/usr/bin/node", "/tmp/control.mjs"] });
    await deployProviders([{ id: "control", role: "runtime", provider: { deployable: provider } }], {
      target: "production", dryRun: false, repositoryRoot: root, environment: { OPENBOT_PORT: "4100" },
      initialInputs: { outputs: { "control-service.artifact": "/tmp/control.mjs" }, secrets: { API_KEY: "private-value" } },
    });
    const plist = await readFile(join(root, "home/Library/LaunchAgents/ai.openbot.openbot-control.plist"), "utf8");
    expect(plist).toContain("--env-file=");
    expect(plist).not.toContain("private-value");
  });

  it("parses plain and JSON Vercel deployment URLs", () => {
    expect(deploymentUrl("https://one.vercel.app\n")).toBe("https://one.vercel.app");
    expect(deploymentUrl('{"url":"two.vercel.app"}')).toBe("https://two.vercel.app");
  });
});

async function temporaryRoot(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "openbot-control-provider-")); roots.push(root); return root; }
function healthy(): typeof fetch { return vi.fn(async () => Response.json({ ok: true })) as typeof fetch; }
