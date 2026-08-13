import { pathToFileURL } from "node:url";
import { Hono } from "hono";
import { discoverAgents, globalInstrumentationPath, type AgentSource } from "./discovery.js";

interface AgentModule { default?: (request: Request) => Response | Promise<Response> }
interface InstrumentationModule { default?: { setup?: (context: { agentName: string }) => void | Promise<void> } }

export async function createAgentServiceApp(repositoryRoot: string, options: { health?: boolean } = {}): Promise<Hono> {
  const app = new Hono();
  if (options.health !== false) app.get("/healthz", (context) => context.json({ ok: true, service: "openbot-agents" }));
  for (const agent of await discoverAgents(repositoryRoot)) {
    await runInstrumentation(globalInstrumentationPath(repositoryRoot), agent);
    if (agent.instrumentationPath) await runInstrumentation(agent.instrumentationPath, agent);
    const module = await import(`${pathToFileURL(agent.path).href}?openbot=${Date.now()}`) as AgentModule;
    if (typeof module.default !== "function") throw new Error(`${agent.path} must default export chatKitEndpoint(...)`);
    app.post(`/api/agents/${agent.slug}`, (context) => module.default!(context.req.raw));
  }
  return app;
}

async function runInstrumentation(path: string, agent: AgentSource): Promise<void> {
  try {
    const module = await import(`${pathToFileURL(path).href}?openbot=${Date.now()}`) as InstrumentationModule;
    if (module.default?.setup) await module.default.setup({ agentName: agent.slug });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") return;
    throw error;
  }
}
