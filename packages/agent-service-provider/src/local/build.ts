import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "tsdown";
import type { DeploymentContext, DeploymentResult } from "@openbot/runtime-provider-core";
import { bundleOptions, renderTemplate } from "../build.js";
import { discoverAgents, type AgentSource } from "../discovery.js";

export const agentLocalArtifact = ".openbot-deploy/agent-service/server.js";
const serverTemplate = fileURLToPath(new URL("./assets/server.ts", import.meta.url));

export async function buildLocalAgentService(context: DeploymentContext): Promise<DeploymentResult> {
  const agents = await discoverAgents(context.repositoryRoot);
  const generated = resolve(context.repositoryRoot, ".openbot-deploy/generated/local-agent-service.ts");
  const imports = agents.map((agent, index) => `import { POST as agent${index} } from ${JSON.stringify(agent.path)};`).join("\n");
  const routes = agents.map((agent, index) => `app.post(${JSON.stringify(`/api/agents/${agent.slug}`)}, (context) => agent${index}(context.req.raw));`).join("\n");
  await mkdir(dirname(generated), { recursive: true });
  await writeFile(generated, await renderTemplate(serverTemplate, {
    NODE_SERVER: JSON.stringify(fileURLToPath(import.meta.resolve("@hono/node-server"))),
    HONO: JSON.stringify(fileURLToPath(import.meta.resolve("hono"))),
    AGENT_IMPORTS: imports,
    AGENT_ROUTES: routes,
  }));
  const outDir = resolve(context.repositoryRoot, dirname(agentLocalArtifact));
  await build(bundleOptions(context.repositoryRoot, generated, outDir, "server.js", false));
  return { outputs: { "agent-service.artifact": resolve(context.repositoryRoot, agentLocalArtifact), "agent-service.count": String(agents.length), "agent-service.digest": digestAgents(agents) } };
}

function digestAgents(agents: readonly AgentSource[]): string {
  return createHash("sha256").update(agents.map((agent) => `${agent.slug}:${agent.path}`).join("\n")).digest("hex");
}
