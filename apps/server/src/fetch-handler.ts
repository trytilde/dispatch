import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";
import { httpApp } from "./http.js";
import { registerServices } from "./services.js";

const router = createConnectRouter();
registerServices(router);
const rpcHandlers = new Map(
  router.handlers.map((handler) => [`/rpc${handler.requestPath}`, createFetchHandler(handler)]),
);

export async function fetchRequestHandler(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const rpcHandler = rpcHandlers.get(path);
  if (rpcHandler) return rpcHandler(request);
  return httpApp.fetch(request);
}
