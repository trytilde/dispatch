import { serve } from __OPENBOT_NODE_SERVER__;
import { Hono } from __OPENBOT_HONO__;

__OPENBOT_AGENT_IMPORTS__

const app = new Hono();
app.get("/healthz", (context) => context.json({ ok: true, service: "openbot-agents" }));
__OPENBOT_AGENT_ROUTES__

const port = Number.parseInt(process.env.OPENBOT_AGENT_PORT ?? "4101", 10);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`OpenBot agent service listening at http://127.0.0.1:${port}`);
});
