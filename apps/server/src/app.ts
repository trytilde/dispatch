import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { registerControlServices } from "./control.js";

const controlRouter = createConnectRouter();
registerControlServices(controlRouter);

const controlHandlers = new Map(
  controlRouter.handlers.map((handler) => [`/rpc${handler.requestPath}`, createFetchHandler(handler)]),
);
const defaultWebRoot = fileURLToPath(new URL("../../../apps/web/dist", import.meta.url));

export interface AppOptions {
  webRoot?: string;
}

export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono();
  const webRoot = options.webRoot ?? defaultWebRoot;

  app.use("*", secureHeaders());
  app.get("/healthz", (context) => context.json({ ok: true, service: "openbot" }));
  app.all("/rpc/*", (context) => {
    const handler = controlHandlers.get(new URL(context.req.url).pathname);
    return handler ? handler(context.req.raw) : context.json({ error: "Control method not found" }, 404);
  });

  if (existsSync(webRoot)) {
    const cacheHeaders = (path: string, context: { header(name: string, value: string): void }): void => {
      context.header(
        "cache-control",
        path.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
      );
    };
    app.get("*", serveStatic({ root: webRoot, onFound: cacheHeaders }));
    app.get("*", async (context) => {
      const index = await readFile(resolve(webRoot, "index.html"), "utf8");
      context.header("cache-control", "no-cache");
      context.header("content-type", "text/html; charset=utf-8");
      return context.body(index);
    });
  }

  return app;
}

export const app = createApp();

export default app;
