import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { OpenBotApp } from "./screens/openbot-app.js";

const rootRoute = createRootRoute({ notFoundComponent: OpenBotApp });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OpenBotApp,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
