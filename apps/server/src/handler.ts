import type { RequestListener } from "node:http";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { getRequestListener } from "@hono/node-server";
import { httpApp } from "./http.js";
import { registerServices } from "./services.js";

const connectHandler = connectNodeAdapter({
  routes: registerServices,
  requestPathPrefix: "/rpc",
});

const honoHandler = getRequestListener(httpApp.fetch);

export const requestHandler: RequestListener = (request, response) => {
  const path = new URL(request.url ?? "/", "http://openbot.local").pathname;
  if (path === "/rpc" || path.startsWith("/rpc/")) {
    connectHandler(request, response);
    return;
  }
  void honoHandler(request, response);
};
