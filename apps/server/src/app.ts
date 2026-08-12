import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { registerControlServices } from "./control.js";

const controlRouter = createConnectRouter();
registerControlServices(controlRouter);

const controlHandlers = new Map(
  controlRouter.handlers.map((handler) => [`/rpc${handler.requestPath}`, createFetchHandler(handler)]),
);

export const app = new Hono();

app.use("*", secureHeaders());
app.get("/healthz", (context) => context.json({ ok: true, service: "openbot" }));
app.all("/rpc/*", (context) => {
  const handler = controlHandlers.get(new URL(context.req.url).pathname);
  return handler ? handler(context.req.raw) : context.json({ error: "Control method not found" }, 404);
});
app.all("/api/*", (context) => context.json({ error: "API route not found" }, 404));

export default app;
