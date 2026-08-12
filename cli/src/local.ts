import { serve } from "@hono/node-server";
import { app } from "@openbot/server";
import { loadLocalEnvironment } from "./environment.js";

export function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? "4100", 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("OPENBOT_PORT must be a valid TCP port");
  }
  return port;
}

export async function runLocalServer(): Promise<void> {
  const environment = await loadLocalEnvironment();
  const port = parsePort(environment.OPENBOT_PORT);
  await new Promise<void>((resolvePromise, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
      console.log(`OpenBot listening at http://127.0.0.1:${port}`);
    });
    const shutdown = (): void => {
      server.close((error) => error ? reject(error) : resolvePromise());
    };
    server.once("error", reject);
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
