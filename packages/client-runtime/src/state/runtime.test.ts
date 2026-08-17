import { describe, expect, it } from "vite-plus/test";
import { createClientAuthAdapter } from "../auth.js";
import { createOpenBotClient } from "../chat/client.js";
import { createOpenBotRuntime } from "./runtime.js";

describe("OpenBot runtime", () => {
  it("hydrates authentication and sidebar state outside React", async () => {
    const client = createOpenBotClient({
      fetch: async (input) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url === "/auth/session")
          return Response.json({ authenticated: true, user: { subject: "owner-one" } });
        if (url.startsWith("/api/chat/mission-control/sidebar"))
          return Response.json({
            items: [
              {
                id: "agent-one",
                display_name: "Agent One",
                provider_id: "tilde",
                status: "ready",
                sessions: { items: [] },
              },
            ],
          });
        throw new Error(`Unexpected request: ${url}`);
      },
    });
    const runtime = createOpenBotRuntime({
      client,
      auth: createClientAuthAdapter(client, { signIn: async () => undefined }),
    });

    await runtime.actions.initialize();

    expect(runtime.store.getState().auth.status).toBe("authenticated");
    expect(runtime.store.getState().sidebar.selectedAgentId).toBe("agent-one");
    expect(runtime.store.getState().sidebar.loading).toBe(false);
    runtime.dispose();
  });

  it("captures initial sidebar failures without leaking an unhandled rejection", async () => {
    const client = createOpenBotClient({
      fetch: async (input) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url === "/auth/session")
          return Response.json({ authenticated: true, user: { subject: "owner-one" } });
        return Response.json({ error: "Chat unavailable" }, { status: 503 });
      },
    });
    const runtime = createOpenBotRuntime({
      client,
      auth: createClientAuthAdapter(client, { signIn: async () => undefined }),
    });

    await expect(runtime.actions.initialize()).resolves.toBeUndefined();
    expect(runtime.store.getState().sidebar.error).toBe("Chat unavailable");
    expect(runtime.store.getState().sidebar.loading).toBe(false);
    runtime.dispose();
  });
});
