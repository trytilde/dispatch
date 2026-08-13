import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildVercelAgentService } from "./vercel/build.js";
import { discoverAgents } from "./discovery.js";
import { deployProviders, DeploymentOutputs, type DeploymentContext } from "@openbot/runtime-provider";
import { VercelAgentServiceProvider } from "./vercel/index.js";
import type { CommandRunner } from "@openbot/control-service-provider";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("agent service artifacts", () => {
  it("rejects agents missing a required computer tool", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "configuration/agents/incomplete"), { recursive: true });
    await writeFile(join(root, "configuration/agents/incomplete/agent.ts"), "export default async function endpoint() { return new Response('incomplete') }\n");
    await expect(discoverAgents(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("discovers stable slugs and emits one independently bundled Vercel function per agent", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "configuration/agents/alpha"), { recursive: true });
    await mkdir(join(root, "configuration/agents/beta"), { recursive: true });
    await writeFile(join(root, "configuration/instrumentation.ts"), "export default { setup() {} }\n");
    for (const slug of ["alpha", "beta"]) {
      await mkdir(join(root, `configuration/agents/${slug}/tools`));
      for (const name of ["computer-exec.ts", "computer-input.ts", "computer-read-file.ts", "computer-screenshot.ts", "computer-write-file.ts"]) {
        await writeFile(join(root, `configuration/agents/${slug}/tools/${name}`), "export default {}\n");
      }
    }
    await writeFile(join(root, "configuration/agents/alpha/agent.ts"), "export default async function endpoint() { return new Response('alpha') }\n");
    await writeFile(join(root, "configuration/agents/beta/agent.ts"), "export default async function endpoint() { return new Response('beta') }\n");
    expect((await discoverAgents(root)).map((agent) => agent.slug)).toEqual(["alpha", "beta"]);
    const result = await buildVercelAgentService(context(root));
    expect(result.outputs?.["agent-service.count"]).toBe("2");
    expect(result.outputs?.["agent-service.changed-count"]).toBe("2");
    for (const slug of ["alpha", "beta"]) {
      const config = JSON.parse(await readFile(join(root, `.openbot-deploy/vercel/agents/.vercel/output/functions/api/agents/${slug}.func/.vc-config.json`), "utf8")) as { runtime: string; handler: string };
      expect(config).toMatchObject({ runtime: "nodejs24.x", handler: "index.mjs" });
      expect(await readFile(join(root, `.openbot-deploy/vercel/agents/.vercel/output/functions/api/agents/${slug}.func/index.mjs`), "utf8")).toContain(slug);
    }
    const cached = await buildVercelAgentService(context(root));
    expect(cached.outputs?.["agent-service.changed-count"]).toBe("0");
  });

  it("materializes provider-owned Vercel project configuration during deploy", async () => {
    const root = await temporaryRoot();
    const artifact = join(root, "agent-artifact");
    await mkdir(artifact);
    const run = vi.fn<CommandRunner["run"]>(async (_command, args) => args.includes("deploy") ? { stdout: "https://agents-preview.vercel.app\n", stderr: "" } : { stdout: "", stderr: "" });
    const provider = new VercelAgentServiceProvider({ runner: { run }, request: vi.fn(async () => Response.json({ ok: true })) as typeof fetch });
    await deployProviders([{ id: "agents", provider: { deployable: provider } }], {
      target: "preview", dryRun: false, repositoryRoot: root,
      environment: { OPENBOT_VERCEL_AGENT_PROJECT: "openbot-agents" },
      initialInputs: { outputs: { "agent-service.artifact": artifact, "agent-service.count": "0" } },
    });
    expect(run).toHaveBeenCalledWith("pnpm", expect.arrayContaining(["deploy", "--prebuilt", "--cwd", artifact, "--project", "openbot-agents"]), expect.anything());
    expect(JSON.parse(await readFile(join(artifact, "vercel.json"), "utf8"))).toMatchObject({ framework: null });
  });
});

function context(repositoryRoot: string): DeploymentContext { return { target: "production", repositoryRoot, environment: {}, inputs: new DeploymentOutputs(), report: () => undefined }; }
async function temporaryRoot(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "openbot-agent-provider-")); roots.push(root); return root; }
