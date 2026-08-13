import { createServer } from "node:http";
import { migrate } from "@openbot/db";
import { requestHandler } from "./handler.js";
import { reconcileRepository } from "./reconcile.js";

const port = Number.parseInt(process.env.OPENBOT_PORT ?? "4100", 10);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("OPENBOT_PORT must be a valid TCP port");
}

await migrate();

const server = createServer(requestHandler);
server.listen(port, "127.0.0.1", () => {
  console.log(`OpenBot server listening at http://127.0.0.1:${port}`);
  const origin = process.env.OPENBOT_PUBLIC_ORIGIN ?? process.env.TILDE_LOCAL_RUNTIME_TUNNEL_ORIGIN;
  void reconcileRepository(origin ? { origin } : {})
    .then((report) =>
      console.log(
        report.skipped
          ? `Repository reconciliation skipped: ${report.skipped}`
          : `Repository reconciliation complete (${report.agents.length} agents, ${report.skills.length} skills)`,
      ),
    )
    .catch((error) => console.error("Repository reconciliation failed", error));
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`Received ${signal}; stopping OpenBot server`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
