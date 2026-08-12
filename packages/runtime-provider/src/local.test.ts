import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deployProviders } from "@openbot/runtime-provider-core";
import { createLocalRuntimeProvider } from "./local.js";
import type { RuntimeCommandRunner } from "./vercel.js";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("local runtime provider", () => {
  it("installs a systemd user service and keeps values outside the unit", async () => {
    const root = await temporaryRoot();
    const run = vi.fn<RuntimeCommandRunner["run"]>(async () => ({ stdout: "", stderr: "" }));
    const provider = createLocalRuntimeProvider({
      platform: "linux",
      homeDirectory: join(root, "home"),
      runner: { run },
      request: healthyRequest(),
      command: ["/usr/bin/node", "/opt/openbot/server.js"],
    });
    await deployProviders([
      { id: "tilde", provider: { deployable: { plan: async () => ({ summary: "tilde" }), deploy: async () => ({ secrets: { TILDE_KEY: "private-value" } }) } } },
      { id: "runtime:local", role: "runtime", provider: { deployable: provider } },
    ], deployOptions(root));

    const unit = await readFile(join(root, "home/.config/systemd/user/openbot.service"), "utf8");
    const environment = await readFile(join(root, ".openbot-deploy/runtime.env"), "utf8");
    expect(unit).toContain("Description=OpenBot runtime");
    expect(unit).toContain("OPENBOT_DEPLOYMENT_ENV_FILE=");
    expect(unit).not.toContain("private-value");
    expect(environment).toContain('TILDE_KEY="private-value"');
    expect(run.mock.calls.map((call) => call[1])).toEqual([
      ["--user", "daemon-reload"],
      ["--user", "enable", "openbot.service"],
      ["--user", "restart", "openbot.service"],
    ]);
  });

  it("installs and reloads a launchd user agent", async () => {
    const root = await temporaryRoot();
    const run = vi.fn<RuntimeCommandRunner["run"]>(async () => ({ stdout: "", stderr: "" }));
    const provider = createLocalRuntimeProvider({
      platform: "darwin",
      homeDirectory: join(root, "home"),
      uid: 501,
      runner: { run },
      request: healthyRequest(),
      command: ["/usr/bin/node", "/opt/openbot/server.js"],
    });
    await deployProviders([{ id: "runtime:local", role: "runtime", provider: { deployable: provider } }], deployOptions(root));

    const plist = await readFile(join(root, "home/Library/LaunchAgents/ai.openbot.runtime.plist"), "utf8");
    expect(plist).toContain("ai.openbot.runtime");
    expect(plist).toContain("OPENBOT_DEPLOYMENT_ENV_FILE");
    expect(run).toHaveBeenCalledWith("launchctl", ["bootstrap", "gui/501", expect.stringContaining("ai.openbot.runtime.plist")], expect.anything());
    expect(run).toHaveBeenCalledWith("launchctl", ["kickstart", "-k", "gui/501/ai.openbot.runtime"], expect.anything());
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "openbot-local-runtime-"));
  temporaryDirectories.push(root);
  return root;
}

function deployOptions(repositoryRoot: string) {
  return {
    target: "production" as const,
    dryRun: false,
    repositoryRoot,
    environment: { npm_execpath: "/opt/pnpm/pnpm.cjs", OPENBOT_PORT: "4100" },
  };
}

function healthyRequest(): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
}
