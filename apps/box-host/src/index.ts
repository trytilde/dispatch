import { createServer } from "node:http";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { registerBoxService } from "./services.js";

const port = Number.parseInt(process.env.OPENBOT_BOX_PORT ?? "4101", 10);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
  throw new Error("OPENBOT_BOX_PORT must be a valid port");

const server = createServer(
  connectNodeAdapter({ routes: registerBoxService, requestPathPrefix: "/rpc" }),
);
server.listen(port, "0.0.0.0", () => console.log(`OpenBot box host listening on port ${port}`));

function stop() {
  server.close((error) => {
    if (error) process.exitCode = 1;
  });
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
