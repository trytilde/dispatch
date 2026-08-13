import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "tsdown";
import { materializeFileTemplate } from "@openbot/utilities";
import type { DeploymentContext, DeploymentResult } from "@openbot/runtime-provider";
import { bundleOptions } from "../build.js";
import { discoverAgents, globalInstrumentationPath, type AgentSource } from "../discovery.js";

export const agentLocalArtifact = ".openbot-deploy/agent-service/server.js";
const serverTemplate = fileURLToPath(new URL("./assets/server.ts.hbs", import.meta.url));

export async function buildLocalAgentService(
  context: DeploymentContext,
): Promise<DeploymentResult> {
  const agents = await discoverAgents(context.repositoryRoot);
  const generated = resolve(
    context.repositoryRoot,
    ".openbot-deploy/generated/local-agent-service.ts",
  );
  const imports = `import globalInstrumentation from ${JSON.stringify(globalInstrumentationPath(context.repositoryRoot))};\n${agents.flatMap((agent, index) => (agent.instrumentationPath ? [`import instrumentation${index} from ${JSON.stringify(agent.instrumentationPath)};`] : [])).join("\n")}`;
  const initializers = agents
    .map(
      (agent, index) =>
        `await globalInstrumentation.setup?.({ agentName: ${JSON.stringify(agent.slug)} });\n${agent.instrumentationPath ? `await instrumentation${index}.setup?.({ agentName: ${JSON.stringify(agent.slug)} });\n` : ""}const { default: agent${index} } = await import(${JSON.stringify(agent.path)});`,
    )
    .join("\n");
  const routes = agents
    .map(
      (agent, index) =>
        `app.post(${JSON.stringify(`/api/agents/${agent.slug}`)}, (context) => agent${index}(context.req.raw));`,
    )
    .join("\n");
  await materializeFileTemplate(serverTemplate, generated, {
    NODE_SERVER: JSON.stringify(fileURLToPath(import.meta.resolve("@hono/node-server"))),
    HONO: JSON.stringify(fileURLToPath(import.meta.resolve("hono"))),
    AGENT_IMPORTS: imports,
    AGENT_INITIALIZERS: initializers,
    AGENT_ROUTES: routes,
  });
  const outDir = resolve(context.repositoryRoot, dirname(agentLocalArtifact));
  await build(bundleOptions(context.repositoryRoot, generated, outDir, "server.js", false));
  return {
    outputs: {
      "agent-service.artifact": resolve(context.repositoryRoot, agentLocalArtifact),
      "agent-service.count": String(agents.length),
      "agent-service.digest": await digestAgents(agents),
    },
  };
}

async function digestAgents(agents: readonly AgentSource[]): Promise<string> {
  const hash = createHash("sha256");
  for (const agent of agents) {
    hash.update(agent.slug);
    for (const file of await authoredAgentFiles(agent.directory))
      hash.update(file).update(await readFile(file));
  }
  return hash.digest("hex");
}

async function authoredAgentFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      if (entry.name === "sandbox") return [];
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? authoredAgentFiles(path) : entry.isFile() ? [path] : [];
    }),
  );
  return nested.flat().sort();
}
