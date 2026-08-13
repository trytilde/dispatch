import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildVercelAgentService } from "./artifact.js";
import { discoverAgents } from "./discovery.js";
import { DeploymentOutputs, type DeploymentContext } from "@openbot/runtime-provider-core";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("agent service artifacts", () => {
  it("discovers stable slugs and emits one independently bundled Vercel function per agent", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "configuration/agents"), { recursive: true });
    await writeFile(join(root, "configuration/agents/alpha.ts"), "export async function POST() { return new Response('alpha') }\n");
    await writeFile(join(root, "configuration/agents/beta.ts"), "export async function POST() { return new Response('beta') }\n");
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
});

function context(repositoryRoot: string): DeploymentContext { return { target: "production", repositoryRoot, environment: {}, inputs: new DeploymentOutputs(), report: () => undefined }; }
async function temporaryRoot(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "openbot-agent-provider-")); roots.push(root); return root; }
