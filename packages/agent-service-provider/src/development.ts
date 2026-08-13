import { pathToFileURL } from "node:url";
import { Hono } from "hono";
import { discoverAgents } from "./discovery.js";

interface AgentModule { POST?: (request: Request) => Response | Promise<Response> }

export async function createAgentServiceApp(repositoryRoot: string, options: { health?: boolean } = {}): Promise<Hono> {
  const app = new Hono();
  if (options.health !== false) app.get("/healthz", (context) => context.json({ ok: true, service: "openbot-agents" }));
  for (const agent of await discoverAgents(repositoryRoot)) {
    const module = await import(`${pathToFileURL(agent.path).href}?openbot=${Date.now()}`) as AgentModule;
    if (typeof module.POST !== "function") throw new Error(`${agent.path} must export POST(request)`);
    app.post(`/api/agents/${agent.slug}`, (context) => module.POST!(context.req.raw));
  }
  return app;
}
